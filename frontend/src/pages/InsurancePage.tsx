import { AlertTriangle, ExternalLink, ShieldCheck } from 'lucide-react'
import { useEffect, useState, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router'
import { ErrorNote, PageHeader, Pill } from '../components/ui'
import { api, type Hospital } from '../lib/api'
import { cx, inr } from '../lib/format'
import { useApi } from '../lib/hooks'
import { useMe } from '../lib/me'

interface EstimateResponse {
  hospital: { id: string; name: string; pmjayEmpanelled: boolean; insurers: string[] } | null
  insurance: {
    totalBill: number; lines: Array<{ label: string; billed: number; payable: number; note?: string }>
    admissible: number; deductibleApplied: number; copayApplied: number; coverAvailable: number
    insurerPays: number; youPay: number; warnings: string[]
  } | null
  pmjay: { eligible: boolean; coverAvailable: number; covered: number; youPay: number; notes: string[] } | null
}

type Num = number | ''
const n = (v: Num) => (v === '' ? 0 : v)

function NumField({ id, label, value, onChange, hint }: { id: string; label: string; value: Num; onChange: (v: Num) => void; hint?: string }) {
  return (
    <div>
      <label className="label" htmlFor={id}>{label}</label>
      <input id={id} className="input" type="number" min={0} inputMode="numeric" value={value} onChange={(e) => onChange(e.target.value === '' ? '' : Number(e.target.value))} />
      {hint && <p className="mt-1.5 text-xs text-ink-3">{hint}</p>}
    </div>
  )
}

export function InsurancePage() {
  const [params] = useSearchParams()
  const hospitalId = params.get('hospital')
  const hospital = useApi<Hospital>(hospitalId ? `/hospitals/${encodeURIComponent(hospitalId)}` : null)
  const { me } = useMe()
  const [mode, setMode] = useState<'private' | 'pmjay'>('private')
  useEffect(() => { if (me?.hasPmjay) setMode('pmjay') }, [me?.hasPmjay])

  const [bill, setBill] = useState({ roomRentPerDay: 4000 as Num, days: 3 as Num, associatedCharges: 40000 as Num, medicinesAndConsumables: 15000 as Num, otherCharges: 10000 as Num })
  const [policy, setPolicy] = useState({ sumInsured: 500000 as Num, alreadyClaimedThisYear: 0 as Num, limitKind: 'percent_of_si', limitValue: 1 as Num, copayPercent: 0 as Num, deductible: 0 as Num, nonPayablePercent: 5 as Num })
  const [pmjayUsed, setPmjayUsed] = useState<Num>(0)
  const [result, setResult] = useState<EstimateResponse | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => { if (me?.sumInsured) setPolicy((p) => ({ ...p, sumInsured: me.sumInsured! })) }, [me?.sumInsured])
  useEffect(() => { if (me?.pmjayUsed !== null && me?.pmjayUsed !== undefined) setPmjayUsed(me.pmjayUsed) }, [me?.pmjayUsed])

  async function estimate(e?: FormEvent) {
    e?.preventDefault()
    setError(null)
    const b = { roomRentPerDay: n(bill.roomRentPerDay), days: n(bill.days), associatedCharges: n(bill.associatedCharges), medicinesAndConsumables: n(bill.medicinesAndConsumables), otherCharges: n(bill.otherCharges) }
    const roomRentLimit = policy.limitKind === 'none' ? { kind: 'none' } : policy.limitKind === 'per_day' ? { kind: 'per_day', amount: n(policy.limitValue) } : { kind: 'percent_of_si', percent: n(policy.limitValue) }
    const body = mode === 'pmjay'
      ? { bill: b, pmjay: { usedThisYear: n(pmjayUsed) }, hospitalId: hospitalId ?? undefined }
      : { bill: b, hospitalId: hospitalId ?? undefined, policy: { sumInsured: n(policy.sumInsured), alreadyClaimedThisYear: n(policy.alreadyClaimedThisYear), roomRentLimit, copayPercent: n(policy.copayPercent), deductible: n(policy.deductible), nonPayablePercent: n(policy.nonPayablePercent) } }
    try { setResult(await api.post<EstimateResponse>('/insurance/estimate', body)) } catch (err) { setError((err as Error).message) }
  }
  const setB = (k: keyof typeof bill) => (v: Num) => setBill((s) => ({ ...s, [k]: v }))
  const setP = (k: keyof typeof policy) => (v: Num) => setPolicy((s) => ({ ...s, [k]: v }))

  return (
    <>
      <PageHeader title="How much will insurance pay?" subtitle="Ask the hospital for a cost estimate, enter it here, and see what you’d pay yourself. Your insurer’s final decision may differ." />

      {hospital.data && (
        <div className="glass fu d1 flex flex-wrap items-center justify-between gap-3 rounded-[22px] p-4">
          <div>
            <p className="text-xs text-ink-3">Estimating for</p>
            <Link to={`/app/hospitals/${encodeURIComponent(hospital.data.id)}`} className="font-bold text-ink no-underline hover:text-brand">{hospital.data.name}</Link>
          </div>
          {hospital.data.pmjay ? <Pill tone="ok"><ShieldCheck className="size-3" aria-hidden /> Ayushman empanelled</Pill> : <Pill tone="muted">Not on the Ayushman list</Pill>}
        </div>
      )}

      <div role="tablist" aria-label="Cover type" className="fu d1 inline-grid w-full max-w-md grid-cols-2 gap-1.5 self-start rounded-2xl border border-line bg-well p-1.5">
        {(['private', 'pmjay'] as const).map((m) => (
          <button key={m} role="tab" aria-selected={mode === m} onClick={() => { setMode(m); setResult(null) }}
            className={cx('min-h-11 rounded-xl text-sm font-semibold transition', mode === m ? 'bg-[linear-gradient(135deg,#ccfbf1,#5eead4)] text-on-mint shadow-[0_6px_18px_rgb(45_212_191/0.35)]' : 'text-ink-3 hover:text-ink')}>
            {m === 'private' ? 'Private policy' : 'Ayushman (PM-JAY)'}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-start gap-5.5">
        <form onSubmit={estimate} className="glass fu d2 flex min-w-0 flex-[1_1_420px] flex-col gap-5 rounded-[28px] p-6">
          <fieldset className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <legend className="heading mb-3 text-lg">Hospital’s estimate</legend>
            <NumField id="rr" label="Room rent per day (₹)" value={bill.roomRentPerDay} onChange={setB('roomRentPerDay')} />
            <NumField id="days" label="Days admitted" value={bill.days} onChange={setB('days')} />
            <NumField id="assoc" label="Doctor, OT, nursing (₹)" value={bill.associatedCharges} onChange={setB('associatedCharges')} />
            <NumField id="meds" label="Medicines & consumables (₹)" value={bill.medicinesAndConsumables} onChange={setB('medicinesAndConsumables')} />
            <NumField id="other" label="Tests, implants, other (₹)" value={bill.otherCharges} onChange={setB('otherCharges')} />
          </fieldset>

          {mode === 'private' ? (
            <fieldset className="grid grid-cols-1 gap-4 border-t border-line pt-5 sm:grid-cols-2">
              <legend className="heading mb-1 text-lg">Your policy</legend>
              <p className="text-xs text-ink-3 sm:col-span-2">From your policy schedule or e-card. Ask your TPA helpline if unsure.</p>
              <NumField id="si" label="Sum insured (₹)" value={policy.sumInsured} onChange={setP('sumInsured')} />
              <NumField id="used" label="Already claimed this year (₹)" value={policy.alreadyClaimedThisYear} onChange={setP('alreadyClaimedThisYear')} />
              <div>
                <label className="label" htmlFor="lk">Room rent limit</label>
                <select id="lk" className="input" value={policy.limitKind} onChange={(e) => setPolicy((p) => ({ ...p, limitKind: e.target.value }))}>
                  <option value="none">No limit</option><option value="percent_of_si">% of sum insured / day</option><option value="per_day">Fixed ₹ / day</option>
                </select>
              </div>
              {policy.limitKind !== 'none' && <NumField id="lv" label={policy.limitKind === 'per_day' ? 'Limit (₹ / day)' : 'Limit (% of sum insured)'} value={policy.limitValue} onChange={setP('limitValue')} hint={policy.limitKind === 'percent_of_si' ? 'Commonly 1% for a room' : undefined} />}
              <NumField id="cp" label="Co-pay (%)" value={policy.copayPercent} onChange={setP('copayPercent')} hint="Often 10–20% on senior-citizen plans" />
              <NumField id="dd" label="Deductible (₹)" value={policy.deductible} onChange={setP('deductible')} />
              <NumField id="np" label="Non-payable items (% of medicines)" value={policy.nonPayablePercent} onChange={setP('nonPayablePercent')} hint="Gloves, masks etc. — 5% is a rough guess" />
            </fieldset>
          ) : (
            <fieldset className="border-t border-line pt-5">
              <legend className="heading mb-3 text-lg">Your Ayushman card</legend>
              <NumField id="pu" label="Already used by your family this year (₹)" value={pmjayUsed} onChange={setPmjayUsed} />
            </fieldset>
          )}
          <button className="btn-primary min-h-[52px] text-base">Estimate</button>
        </form>

        <div className="flex min-w-0 flex-[1_1_380px] flex-col gap-5">
          {error && <ErrorNote>{error}</ErrorNote>}
          {!result && !error && (
            <section className="glass fu d3 rounded-[28px] p-6 text-sm text-ink-2">
              <p className="heading text-lg text-ink">Your estimate appears here</p>
              <p className="mt-2">We apply room-rent limits (and the proportionate cut insurers make to doctor and nursing charges), co-pay, deductible and your remaining cover.</p>
            </section>
          )}
          {result?.insurance && mode === 'private' && <PrivateResult r={result.insurance} hospital={result.hospital} sumInsured={n(policy.sumInsured)} />}
          {result?.pmjay && mode === 'pmjay' && <PmjayResult r={result.pmjay} />}
          <p className="text-xs text-ink-3">An estimate to plan with — your insurer decides the final claim based on your policy wording, the diagnosis and the hospital’s final bill.</p>
        </div>
      </div>
    </>
  )
}

function Big({ label, value, tone }: { label: string; value: string; tone: 'good' | 'bad' }) {
  return (
    <div className={cx('rounded-[20px] border p-4', tone === 'good' ? 'border-brand/35 bg-brand-soft' : 'border-sos/35 bg-sos-soft')}>
      <p className="text-[13px] text-ink-2">{label}</p>
      <p className={cx('heading mt-1 text-3xl', tone === 'good' ? 'text-brand-3' : 'text-sos-dark')}>{value}</p>
    </div>
  )
}

function PrivateResult({ r, hospital, sumInsured }: { r: NonNullable<EstimateResponse['insurance']>; hospital: EstimateResponse['hospital']; sumInsured: number }) {
  return (
    <section className="glass pop flex flex-col gap-4 rounded-[28px] p-6" aria-live="polite">
      <div className="grid grid-cols-2 gap-3"><Big label="Insurance pays" value={inr(r.insurerPays)} tone="good" /><Big label="You pay" value={inr(r.youPay)} tone="bad" /></div>
      {r.warnings.map((w) => <p key={w} className="flex gap-2 rounded-2xl bg-amber-soft p-3 text-sm text-amber"><AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />{w}</p>)}
      <table className="w-full text-sm">
        <thead><tr className="text-left text-xs text-ink-3"><th className="pb-2 font-semibold">Item</th><th className="pb-2 text-right font-semibold">Billed</th><th className="pb-2 text-right font-semibold">Payable</th></tr></thead>
        <tbody className="divide-y divide-line">
          {r.lines.map((l) => <tr key={l.label}><td className="py-2.5">{l.label}{l.note && <span className="block text-xs text-ink-3">{l.note}</span>}</td><td className="py-2.5 text-right">{inr(l.billed)}</td><td className="py-2.5 text-right">{inr(l.payable)}</td></tr>)}
          {r.deductibleApplied > 0 && <tr><td className="py-2.5" colSpan={2}>Deductible</td><td className="py-2.5 text-right">−{inr(r.deductibleApplied)}</td></tr>}
          {r.copayApplied > 0 && <tr><td className="py-2.5" colSpan={2}>Co-pay</td><td className="py-2.5 text-right">−{inr(r.copayApplied)}</td></tr>}
          <tr className="font-bold"><td className="py-2.5">Total</td><td className="py-2.5 text-right">{inr(r.totalBill)}</td><td className="py-2.5 text-right">{inr(r.insurerPays)}</td></tr>
        </tbody>
      </table>
      <p className="rounded-2xl bg-fill p-3 text-sm">Cover left after this claim: <b>{inr(Math.max(0, r.coverAvailable - r.insurerPays))}</b> of {inr(sumInsured)}</p>
      {hospital && (hospital.insurers.length > 0
        ? <p className="text-xs text-ink-2">{hospital.name} accepts cashless from: {hospital.insurers.join(', ')}.</p>
        : <p className="text-xs text-ink-3">We don’t know which insurers {hospital.name} accepts cashless — ask the TPA desk, or plan for reimbursement.</p>)}
    </section>
  )
}

function PmjayResult({ r }: { r: NonNullable<EstimateResponse['pmjay']> }) {
  return (
    <section className="glass pop flex flex-col gap-4 rounded-[28px] p-6" aria-live="polite">
      {r.eligible
        ? <div className="grid grid-cols-2 gap-3"><Big label="Ayushman covers" value={inr(r.covered)} tone="good" /><Big label="You pay" value={inr(r.youPay)} tone="bad" /></div>
        : <p className="flex gap-2 rounded-2xl bg-sos-soft p-3 text-sm text-sos-dark"><AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />{r.notes[0]}</p>}
      <ul className="list-disc space-y-1.5 pl-5 text-sm text-ink-2">{(r.eligible ? r.notes : r.notes.slice(1)).map((x) => <li key={x}>{x}</li>)}</ul>
      <div className="flex flex-wrap gap-2.5">
        <Link className="btn-secondary" to="/app/hospitals?pmjay=true">Show Ayushman hospitals →</Link>
        <a className="btn-ghost" href="https://beneficiary.nha.gov.in" target="_blank" rel="noreferrer">Check eligibility <ExternalLink className="size-3.5" aria-hidden /></a>
      </div>
    </section>
  )
}
