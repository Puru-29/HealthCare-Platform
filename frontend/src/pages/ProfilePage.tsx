import { BadgeCheck, CalendarDays, CheckCircle2, ChevronRight, IndianRupee, Lock, LogIn, LogOut, ShieldCheck, Stethoscope, UserRound } from 'lucide-react'
import { useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router'
import { ErrorNote, IconTile, Pill, Spinner } from '../components/ui'
import { api, BLOOD_GROUPS, type Me } from '../lib/api'
import { inr } from '../lib/format'
import { initials, maskPhone, useMe } from '../lib/me'

function readiness(me: Me) {
  const checks = [
    { ok: !!me.name, label: 'Add your name' },
    { ok: !!me.phone, label: 'Add your mobile number' },
    { ok: !!me.emergencyContactPhone, label: 'Add an emergency contact' },
    { ok: !!me.bloodGroup, label: 'Add blood group' },
  ]
  return { done: checks.filter((c) => c.ok).length, total: checks.length, next: checks.find((c) => !c.ok)?.label ?? null }
}

export function ProfilePage() {
  const { me, setMe } = useMe()
  const [form, setForm] = useState<Me | null>(null)
  const [saved, setSaved] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => { if (me && !form) setForm(me) }, [me, form])
  if (!form || !me) return <Spinner />

  async function save(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setSaved(false)
    setBusy(true)
    try {
      const { activeSosId: _a, signedIn: _s, ...body } = form!
      const next = await api.put<Me>('/me', { ...body, sumInsured: body.sumInsured || null, pmjayUsed: body.pmjayUsed ?? null })
      setMe(next)
      setForm(next)
      setSaved(true)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }
  const text = (k: 'name' | 'phone' | 'emergencyContactName' | 'emergencyContactPhone' | 'allergies' | 'insurer') => ({
    value: form[k] ?? '',
    onChange: (e: { target: { value: string } }) => { setSaved(false); setForm((f) => ({ ...f!, [k]: e.target.value })) },
  })
  const ready = readiness(me)

  return (
    <>
      <section className="glass fu flex flex-wrap items-center gap-5 rounded-[30px] p-6 sm:p-7">
        <span className="avatar size-20 border-2 border-white text-2xl">{me.name ? initials(me.name) : <UserRound className="size-9" />}</span>
        <div className="min-w-[220px] flex-1">
          <h1 className="heading text-3xl">{me.name ?? 'Your profile'}</h1>
          <p className="mt-1 text-[15px] text-ink-2">{me.phone ? `${maskPhone(me.phone)} · Sonipat` : 'No mobile number yet'}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {me.signedIn ? <Pill tone="mint"><BadgeCheck className="size-3" aria-hidden /> Number verified</Pill> : <Pill tone="amber">Guest on this device</Pill>}
            {me.hasPmjay && <Pill tone="ok"><ShieldCheck className="size-3" aria-hidden /> Ayushman card</Pill>}
            {me.insurer && <Pill tone="sky">{me.insurer}{me.sumInsured ? ` · ${inr(me.sumInsured)}` : ''}</Pill>}
            {me.bloodGroup && <Pill tone="sos">Blood {me.bloodGroup}</Pill>}
          </div>
        </div>
        <div className="min-w-[220px] rounded-[20px] bg-fill p-4">
          <p className="flex items-center gap-2 font-bold">{ready.next ? <span className="live size-2 rounded-full bg-amber" /> : <CheckCircle2 className="size-4 text-brand" aria-hidden />}SOS-ready</p>
          <div className="mt-2.5 h-2 overflow-hidden rounded-full bg-track"><div className="bar h-full rounded-full" style={{ width: `${(ready.done / ready.total) * 100}%`, background: 'linear-gradient(90deg,#5eead4,#a5b4fc)' }} /></div>
          <p className="mt-2 text-[13px] text-ink-3">{ready.next ? `${ready.next} to finish` : 'Everything the crew needs is saved'}</p>
        </div>
      </section>

      {!me.signedIn && (
        <Link to="/login?next=/app/profile" className="glass fu d1 flex items-center gap-4 rounded-3xl border-brand/30 p-4.5 text-ink no-underline">
          <IconTile tone="mint"><LogIn className="size-5" /></IconTile>
          <span className="flex-1"><b className="block">Verify your mobile number</b><span className="text-sm text-ink-2">Keeps these details safe and on every phone you use. SOS works either way.</span></span>
          <ChevronRight className="size-5 text-ink-3" aria-hidden />
        </Link>
      )}

      <div className="flex flex-wrap items-start gap-5.5">
        <form onSubmit={save} className="glass fu d1 flex min-w-0 flex-[3_1_460px] flex-col gap-5 rounded-[28px] p-6 sm:p-7">
          <div>
            <h2 className="heading text-[22px]">Emergency details</h2>
            <p className="mt-1 text-sm text-ink-3">Saved so SOS is one tap. Shared only with the hospital that accepts your SOS.</p>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div><label className="label" htmlFor="p-name">Your name</label><input id="p-name" className="input" autoComplete="name" {...text('name')} /></div>
            <div>
              <label className="label" htmlFor="p-phone">Mobile number {me.signedIn && <Lock className="inline size-3.5 text-ink-3" aria-label="Verified, locked" />}</label>
              <input id="p-phone" className="input disabled:opacity-70" inputMode="tel" autoComplete="tel" disabled={me.signedIn} {...text('phone')} />
              {me.signedIn && <p className="mt-1.5 text-xs text-ink-3">Verified. To change it, sign out and sign in with the new number.</p>}
            </div>
            <div><label className="label" htmlFor="p-ecn">Emergency contact name</label><input id="p-ecn" className="input" {...text('emergencyContactName')} /></div>
            <div><label className="label" htmlFor="p-ecp">Emergency contact mobile</label><input id="p-ecp" className="input" inputMode="tel" {...text('emergencyContactPhone')} /></div>
            <div>
              <label className="label" htmlFor="p-bg">Blood group</label>
              <select id="p-bg" className="input" value={form.bloodGroup ?? ''} onChange={(e) => { setSaved(false); setForm({ ...form, bloodGroup: (e.target.value || null) as Me['bloodGroup'] }) }}>
                <option value="">Select…</option>
                {BLOOD_GROUPS.map((g) => <option key={g} value={g}>{g}</option>)}
              </select>
            </div>
            <div><label className="label" htmlFor="p-al">Allergies / conditions</label><input id="p-al" className="input" maxLength={200} placeholder="e.g. Penicillin, diabetic" {...text('allergies')} /></div>
          </div>

          <div className="border-t border-line pt-5">
            <h2 className="heading text-[22px]">Insurance</h2>
            <p className="mt-1 text-sm text-ink-3">Used to rank hospitals where you can get cashless treatment.</p>
          </div>
          <label className="flex items-center gap-3 rounded-2xl border border-line bg-fill p-4">
            <input type="checkbox" className="size-[18px] accent-brand-2" checked={form.hasPmjay} onChange={(e) => { setSaved(false); setForm({ ...form, hasPmjay: e.target.checked }) }} />
            <span className="text-[15px]">I have an <b>Ayushman Bharat (PM-JAY)</b> card</span>
          </label>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {form.hasPmjay && (
              <div className="sm:col-span-2">
                <label className="label" htmlFor="p-pu">Ayushman used by your family this year (₹)</label>
                <input id="p-pu" className="input" type="number" min={0} max={500000} inputMode="numeric" value={form.pmjayUsed ?? ''}
                  onChange={(e) => { setSaved(false); setForm({ ...form, pmjayUsed: e.target.value === '' ? null : Number(e.target.value) }) }} />
              </div>
            )}
            <div><label className="label" htmlFor="p-ins">Health insurer</label><input id="p-ins" className="input" placeholder="e.g. Star Health" {...text('insurer')} /></div>
            <div>
              <label className="label" htmlFor="p-si">Sum insured (₹)</label>
              <input id="p-si" className="input" type="number" min={0} inputMode="numeric" value={form.sumInsured ?? ''}
                onChange={(e) => { setSaved(false); setForm({ ...form, sumInsured: e.target.value === '' ? null : Number(e.target.value) }) }} />
            </div>
          </div>
          {error && <ErrorNote>{error}</ErrorNote>}
          <div className="flex items-center gap-3">
            <button className="btn-primary min-h-12 px-6" disabled={busy}>Save changes</button>
            {saved && <span className="flex items-center gap-1.5 text-sm font-semibold text-brand" role="status"><CheckCircle2 className="size-4" aria-hidden /> Saved</span>}
          </div>
        </form>

        <div className="flex min-w-0 flex-[2_1_300px] flex-col gap-5.5">
          <section className="glass fu d2 flex flex-col gap-1 rounded-[28px] p-3">
            {[
              { to: '/app/appointments', icon: CalendarDays, tone: 'ok', label: 'My appointments' },
              { to: '/app/insurance', icon: IndianRupee, tone: 'sky', label: 'Insurance estimate' },
              { to: '/login?tab=staff', icon: Stethoscope, tone: 'amber', label: 'Hospital staff? Open the console' },
            ].map(({ to, icon: Icon, tone, label }) => (
              <Link key={to} to={to} className="flex items-center gap-3.5 rounded-2xl p-3 text-ink no-underline hover:bg-fill-2">
                <IconTile tone={tone as 'ok'}><Icon className="size-5" /></IconTile>
                <span className="flex-1 font-semibold">{label}</span>
                <ChevronRight className="size-4 text-ink-3" aria-hidden />
              </Link>
            ))}
          </section>
          <section className="glass fu d3 rounded-[28px] p-5.5">
            <p className="flex items-center gap-2 font-bold"><Lock className="size-4 text-brand" aria-hidden /> Your privacy</p>
            <p className="mt-2 text-sm leading-relaxed text-ink-2">Hospitals see only a ~1 km area until one accepts your SOS. Your exact location, phone, blood group and allergies go only to that hospital and its driver.</p>
          </section>
          {me.signedIn
            ? <Link to="/logout" className="btn-secondary min-h-12"><LogOut className="size-4" aria-hidden /> Log out</Link>
            : <Link to="/login?next=/app/profile" className="btn-primary min-h-12"><LogIn className="size-4" aria-hidden /> Sign in with mobile</Link>}
        </div>
      </div>
    </>
  )
}
