import { AlertTriangle, ExternalLink, ShieldCheck } from 'lucide-react'
import { useEffect, useState, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router'
import { ErrorNote } from '../components/ui'
import { api, type Hospital } from '../lib/api'
import { cx, inr } from '../lib/format'
import { useApi, useMe } from '../lib/hooks'

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

export function InsurancePage() {
  const [params] = useSearchParams()
  const hospitalId = params.get('hospital')
  const hospital = useApi<Hospital>(hospitalId ? `/hospitals/${encodeURIComponent(hospitalId)}` : null)
  const me = useMe()
  const [mode, setMode] = useState<'pmjay' | 'private'>('private')
  useEffect(() => { if (me.data?.hasPmjay) setMode('pmjay') }, [me.data?.hasPmjay])

  const [bill, setBill] = useState<Record<string, Num | string>>({ roomRentPerDay: 4000, days: 3, associatedCharges: 40000, medicinesAndConsumables: 15000, otherCharges: 10000 })
  const [policy, setPolicy] = useState<Record<string, Num | string>>({ sumInsured: 500000, alreadyClaimedThisYear: 0, limitKind: 'percent_of_si', limitValue: 1, copayPercent: 0, deductible: 0, nonPayablePercent: 5 })
  const [pmjayUsed, setPmjayUsed] = useState<Num>(0)
  const [result, setResult] = useState<EstimateResponse | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => { if (me.data?.sumInsured) setPolicy((p) => ({ ...p, sumInsured: me.data!.sumInsured! })) }, [me.data?.sumInsured])

  async function estimate(e?: FormEvent) {
    e?.preventDefault()
    setError(null)
    const b = Object.fromEntries(Object.entries(bill).map(([k, v]) => [k, n(v as Num)]))
    const limitKind = policy.limitKind as string
    const body = mode === 'pmjay'
      ? { bill: b, pmjay: { usedThisYear: n(pmjayUsed) }, hospitalId: hospitalId ?? undefined }
      : {
          bill: b, hospitalId: hospitalId ?? undefined,
          policy: {
            sumInsured: n(policy.sumInsured as Num), alreadyClaimedThisYear: n(policy.alreadyClaimedThisYear as Num),
            roomRentLimit: limitKind === 'none' ? { kind: 'none' } : limitKind === 'per_day' ? { kind: 'per_day', amount: n(policy.limitValue as Num) } : { kind: 'percent_of_si', percent: n(policy.limitValue as Num) },
            copayPercent: n(policy.copayPercent as Num), deductible: n(policy.deductible as Num), nonPayablePercent: n(policy.nonPayablePercent as Num),
          },
        }
    try { setResult(await api.post<EstimateResponse>('/insurance/estimate', body)) } catch (err) { setError((err as Error).message) }
  }

  const numField = (state: Record<string, Num | string>, setter: (f: (s: Record<string, Num | string>) => Record<string, Num | string>) => void, key: string, label: string, hint?: string) => (
    <div>
      <label className="label" htmlFor={`f-${key}`}>{label}</label>
      <input id={`f-${key}`} className="input" type="number" min={0} inputMode="numeric" value={state[key] as Num}
        onChange={(e) => setter((s) => ({ ...s, [key]: e.target.value === '' ? '' : Number(e.target.value) }))} />
      {hint && <p className="mt-1 text-[11px] text-ink-3">{hint}</p>}
    </div>
  )

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <div>
        <h1 className="text-xl font-bold">How much will insurance pay?</h1>
        <p className="text-sm text-ink-2">Ask the hospital for a cost estimate, enter it below, and see what you'd pay yourself.</p>
      </div>

      {hospital.data && (
        <div className="card flex items-center justify-between gap-3 p-3.5 text-sm">
          <div>
            <p className="text-xs text-ink-3">Hospital</p>
            <Link to={`/hospitals/${encodeURIComponent(hospital.data.id)}`} className="font-semibold hover:text-brand">{hospital.data.name}</Link>
          </div>
          {hospital.data.pmjay ? <span className="chip bg-amber-soft text-amber"><ShieldCheck className="size-3" aria-hidden /> Ayushman empanelled</span> : <span className="chip bg-canvas text-ink-3">Not on PM-JAY list</span>}
        </div>
      )}

      <div className="grid grid-cols-2 rounded-xl border border-line bg-surface p-1" role="tablist">
        {(['pmjay', 'private'] as const).map((m) => (
          <button key={m} role="tab" aria-selected={mode === m} onClick={() => { setMode(m); setResult(null) }}
            className={cx('rounded-lg py-2 text-sm font-semibold', mode === m ? 'bg-brand text-white' : 'text-ink-2')}>
            {m === 'pmjay' ? 'Ayushman card (PM-JAY)' : 'Private / employer policy'}
          </button>
        ))}
      </div>

      <form onSubmit={estimate} className="space-y-5">
        <fieldset className="card space-y-3 p-4">
          <legend className="px-1 text-sm font-semibold">Hospital's estimate</legend>
          <div className="grid grid-cols-2 gap-3">
            {numField(bill, setBill, 'roomRentPerDay', 'Room rent / day (₹)')}
            {numField(bill, setBill, 'days', 'Days in hospital')}
            {numField(bill, setBill, 'associatedCharges', 'Doctor, OT, nursing (₹)')}
            {numField(bill, setBill, 'medicinesAndConsumables', 'Medicines (₹)')}
            {numField(bill, setBill, 'otherCharges', 'Tests, implants, other (₹)')}
          </div>
        </fieldset>

        {mode === 'private' ? (
          <fieldset className="card space-y-3 p-4">
            <legend className="px-1 text-sm font-semibold">Your policy</legend>
            <p className="text-xs text-ink-3">These are in your policy schedule / e-card. Ask your TPA helpline if unsure.</p>
            <div className="grid grid-cols-2 gap-3">
              {numField(policy, setPolicy, 'sumInsured', 'Sum insured (₹)')}
              {numField(policy, setPolicy, 'alreadyClaimedThisYear', 'Already claimed this year (₹)')}
              <div>
                <label className="label" htmlFor="f-limit">Room rent limit</label>
                <select id="f-limit" className="input" value={policy.limitKind as string} onChange={(e) => setPolicy((p) => ({ ...p, limitKind: e.target.value }))}>
                  <option value="none">No limit</option>
                  <option value="percent_of_si">% of sum insured / day</option>
                  <option value="per_day">Fixed ₹ / day</option>
                </select>
              </div>
              {policy.limitKind !== 'none' && numField(policy, setPolicy, 'limitValue', policy.limitKind === 'per_day' ? 'Limit (₹ / day)' : 'Limit (% of SI)', policy.limitKind === 'percent_of_si' ? 'Commonly 1% for a room' : undefined)}
              {numField(policy, setPolicy, 'copayPercent', 'Co-pay (%)', 'Often 10–20% for senior-citizen plans')}
              {numField(policy, setPolicy, 'deductible', 'Deductible (₹)')}
              {numField(policy, setPolicy, 'nonPayablePercent', 'Non-payable items (% of medicines)', 'Gloves, masks etc. — 5% is a rough guess')}
            </div>
          </fieldset>
        ) : (
          <fieldset className="card space-y-3 p-4">
            <legend className="px-1 text-sm font-semibold">Your Ayushman card</legend>
            <div>
              <label className="label" htmlFor="f-pmjay-used">Already used by your family this year (₹)</label>
              <input id="f-pmjay-used" className="input" type="number" min={0} inputMode="numeric" value={pmjayUsed}
                onChange={(e) => setPmjayUsed(e.target.value === '' ? '' : Number(e.target.value))} />
            </div>
          </fieldset>
        )}

        <button className="btn-primary w-full py-3">Estimate</button>
      </form>

      {error && <ErrorNote>{error}</ErrorNote>}
      {result?.insurance && mode === 'private' && <PrivateResult r={result.insurance} hospital={result.hospital} />}
      {result?.pmjay && mode === 'pmjay' && <PmjayResult r={result.pmjay} />}

      <p className="text-[11px] text-ink-3">An estimate to plan with — your insurer decides the final claim based on your policy wording, the diagnosis and the hospital's final bill.</p>
    </div>
  )
}

function Big({ label, value, tone }: { label: string; value: string; tone: 'good' | 'bad' }) {
  return (
    <div className={cx('rounded-xl p-3.5', tone === 'good' ? 'bg-brand-soft' : 'bg-sos-soft')}>
      <p className="text-xs text-ink-2">{label}</p>
      <p className={cx('text-2xl font-black', tone === 'good' ? 'text-brand' : 'text-sos-dark')}>{value}</p>
    </div>
  )
}

function PrivateResult({ r, hospital }: { r: NonNullable<EstimateResponse['insurance']>; hospital: EstimateResponse['hospital'] }) {
  return (
    <section className="card space-y-4 p-4" aria-live="polite">
      <div className="grid grid-cols-2 gap-3">
        <Big label="Insurance pays" value={inr(r.insurerPays)} tone="good" />
        <Big label="You pay" value={inr(r.youPay)} tone="bad" />
      </div>
      {r.warnings.map((w) => <p key={w} className="flex gap-2 rounded-xl bg-amber-soft p-3 text-sm text-amber"><AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />{w}</p>)}
      <table className="w-full text-sm">
        <thead><tr className="text-left text-xs text-ink-3"><th className="pb-2 font-medium">Item</th><th className="pb-2 text-right font-medium">Billed</th><th className="pb-2 text-right font-medium">Payable</th></tr></thead>
        <tbody className="divide-y divide-line">
          {r.lines.map((l) => (
            <tr key={l.label}><td className="py-2">{l.label}{l.note && <span className="block text-[11px] text-ink-3">{l.note}</span>}</td><td className="py-2 text-right">{inr(l.billed)}</td><td className="py-2 text-right">{inr(l.payable)}</td></tr>
          ))}
          {r.deductibleApplied > 0 && <tr><td className="py-2" colSpan={2}>Deductible</td><td className="py-2 text-right">−{inr(r.deductibleApplied)}</td></tr>}
          {r.copayApplied > 0 && <tr><td className="py-2" colSpan={2}>Co-pay</td><td className="py-2 text-right">−{inr(r.copayApplied)}</td></tr>}
          <tr className="font-semibold"><td className="py-2">Total</td><td className="py-2 text-right">{inr(r.totalBill)}</td><td className="py-2 text-right">{inr(r.insurerPays)}</td></tr>
        </tbody>
      </table>
      {hospital && (hospital.insurers.length > 0
        ? <p className="text-xs text-ink-2">{hospital.name} accepts cashless from: {hospital.insurers.join(', ')}.</p>
        : <p className="text-xs text-ink-3">We don't know which insurers {hospital.name} accepts cashless — ask the TPA desk, or plan for reimbursement.</p>)}
    </section>
  )
}

function PmjayResult({ r }: { r: NonNullable<EstimateResponse['pmjay']> }) {
  return (
    <section className="card space-y-4 p-4" aria-live="polite">
      {r.eligible ? (
        <div className="grid grid-cols-2 gap-3">
          <Big label="Ayushman covers" value={inr(r.covered)} tone="good" />
          <Big label="You pay" value={inr(r.youPay)} tone="bad" />
        </div>
      ) : (
        <p className="flex gap-2 rounded-xl bg-sos-soft p-3 text-sm text-sos-dark"><AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />{r.notes[0]}</p>
      )}
      <ul className="list-disc space-y-1.5 pl-5 text-sm text-ink-2">{(r.eligible ? r.notes : r.notes.slice(1)).map((x) => <li key={x}>{x}</li>)}</ul>
      <div className="flex flex-wrap gap-2">
        <Link className="btn-secondary" to="/hospitals?pmjay=true">Ayushman hospitals near me</Link>
        <a className="btn-ghost" href="https://beneficiary.nha.gov.in" target="_blank" rel="noreferrer">Check eligibility <ExternalLink className="size-3.5" aria-hidden /></a>
      </div>
    </section>
  )
}
