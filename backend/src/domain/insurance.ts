// Claim estimator. Mirrors how Indian health-insurance claims are commonly
// settled; it is an estimate to plan with, not a claim decision.

export const PMJAY = {
  coverPerFamilyPerYear: 500_000,
  helpline: '14555',
  checkEligibilityUrl: 'https://beneficiary.nha.gov.in',
}

export type RoomRentLimit =
  | { kind: 'none' }
  | { kind: 'percent_of_si'; percent: number }
  | { kind: 'per_day'; amount: number }

export interface BillEstimate {
  roomRentPerDay: number
  days: number
  /** Doctor, nursing, OT, procedure charges — the ones insurers reduce proportionately when the room is over the limit. */
  associatedCharges: number
  medicinesAndConsumables: number
  /** Diagnostics, implants and other charges not linked to room category. */
  otherCharges: number
}

export interface PolicyTerms {
  sumInsured: number
  alreadyClaimedThisYear: number
  roomRentLimit: RoomRentLimit
  copayPercent: number
  deductible: number
  /** Share of medicines/consumables the policy will not pay (gloves, masks, etc.). */
  nonPayablePercent: number
}

export interface EstimateLine {
  label: string
  billed: number
  payable: number
  note?: string
}

export interface ClaimEstimate {
  totalBill: number
  lines: EstimateLine[]
  admissible: number
  deductibleApplied: number
  copayApplied: number
  coverAvailable: number
  insurerPays: number
  youPay: number
  warnings: string[]
}

const round = (n: number) => Math.round(n)
const clampPct = (n: number) => Math.min(100, Math.max(0, n))

export function eligibleRoomRent(limit: RoomRentLimit, sumInsured: number): number {
  switch (limit.kind) {
    case 'none': return Infinity
    case 'percent_of_si': return (sumInsured * clampPct(limit.percent)) / 100
    case 'per_day': return limit.amount
  }
}

export function estimateClaim(bill: BillEstimate, policy: PolicyTerms): ClaimEstimate {
  const warnings: string[] = []
  const roomBilled = bill.roomRentPerDay * bill.days
  const totalBill = roomBilled + bill.associatedCharges + bill.medicinesAndConsumables + bill.otherCharges

  const eligibleRent = eligibleRoomRent(policy.roomRentLimit, policy.sumInsured)
  const overLimit = bill.roomRentPerDay > eligibleRent
  const ratio = overLimit && bill.roomRentPerDay > 0 ? eligibleRent / bill.roomRentPerDay : 1
  if (overLimit) {
    warnings.push(
      `Your room (₹${round(bill.roomRentPerDay)}/day) is above the policy limit of ₹${round(eligibleRent)}/day. ` +
      `Insurers usually cut doctor, nursing and procedure charges by the same proportion (${Math.round(ratio * 100)}% paid). ` +
      `Choosing a room within the limit avoids this.`,
    )
  }

  const lines: EstimateLine[] = [
    { label: `Room rent (${bill.days} day${bill.days === 1 ? '' : 's'})`, billed: roomBilled, payable: overLimit ? eligibleRent * bill.days : roomBilled, note: overLimit ? 'Capped at policy room-rent limit' : undefined },
    { label: 'Doctor, nursing, OT & procedures', billed: bill.associatedCharges, payable: bill.associatedCharges * ratio, note: overLimit ? 'Proportionate deduction' : undefined },
    { label: 'Medicines & consumables', billed: bill.medicinesAndConsumables, payable: bill.medicinesAndConsumables * (1 - clampPct(policy.nonPayablePercent) / 100), note: policy.nonPayablePercent > 0 ? `${policy.nonPayablePercent}% treated as non-payable` : undefined },
    { label: 'Tests, implants & other', billed: bill.otherCharges, payable: bill.otherCharges },
  ].map((l) => ({ ...l, billed: round(l.billed), payable: round(l.payable) }))

  const admissible = lines.reduce((s, l) => s + l.payable, 0)
  const deductibleApplied = Math.min(admissible, Math.max(0, policy.deductible))
  const afterDeductible = admissible - deductibleApplied
  const copayApplied = round((afterDeductible * clampPct(policy.copayPercent)) / 100)
  const afterCopay = afterDeductible - copayApplied
  const coverAvailable = Math.max(0, policy.sumInsured - policy.alreadyClaimedThisYear)
  const insurerPays = Math.min(afterCopay, coverAvailable)
  if (afterCopay > coverAvailable) {
    warnings.push(`The bill is more than your remaining cover of ₹${round(coverAvailable).toLocaleString('en-IN')}. Ask about a top-up or super top-up policy.`)
  }

  return {
    totalBill: round(totalBill),
    lines,
    admissible: round(admissible),
    deductibleApplied: round(deductibleApplied),
    copayApplied,
    coverAvailable: round(coverAvailable),
    insurerPays: round(insurerPays),
    youPay: round(totalBill - insurerPays),
    warnings,
  }
}

export interface PmjayEstimate {
  eligible: boolean
  coverAvailable: number
  covered: number
  youPay: number
  notes: string[]
}

/** PM-JAY is cashless for listed treatment packages at empanelled hospitals. */
export function estimatePmjay(totalBill: number, usedThisYear: number, hospitalEmpanelled: boolean | null): PmjayEstimate {
  const coverAvailable = Math.max(0, PMJAY.coverPerFamilyPerYear - usedThisYear)
  const notes = [
    'Cover is ₹5 lakh per family per year for hospitalisation under listed treatment packages, cashless and paperless at empanelled hospitals.',
    'Package rates are fixed by the scheme; the hospital should not charge you extra for a covered package.',
    'Ask for the Ayushman Mitra / PM-JAY desk at admission and carry your Ayushman card or Aadhaar.',
    `Check eligibility at ${PMJAY.checkEligibilityUrl} or call ${PMJAY.helpline}.`,
  ]
  if (hospitalEmpanelled === false) {
    return { eligible: false, coverAvailable, covered: 0, youPay: totalBill, notes: ['This hospital is not on the PM-JAY empanelled list we have, so the scheme will not pay here.', ...notes.slice(3)] }
  }
  const covered = Math.min(totalBill, coverAvailable)
  return { eligible: true, coverAvailable, covered, youPay: totalBill - covered, notes }
}
