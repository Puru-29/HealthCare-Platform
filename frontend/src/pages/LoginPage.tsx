import { ArrowRight, Loader2, Lock, Siren } from 'lucide-react'
import { useEffect, useRef, useState, type ClipboardEvent, type FormEvent, type KeyboardEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { DemoBanner } from '../components/Layout'
import { Aurora, ErrorNote, IconTile, Logo } from '../components/ui'
import { api, type Me, type OtpSent } from '../lib/api'
import { cx } from '../lib/format'
import { useMe } from '../lib/me'

export function LoginPage() {
  const [params, setParams] = useSearchParams()
  const tab = params.get('tab') === 'staff' ? 'staff' : 'patient'
  const setTab = (t: 'patient' | 'staff') => {
    const next = new URLSearchParams(params)
    if (t === 'staff') next.set('tab', 'staff')
    else next.delete('tab')
    setParams(next, { replace: true })
  }

  return (
    <div className="relative min-h-dvh overflow-x-clip">
      <Aurora />
      <DemoBanner />
      <div className="mx-auto flex min-h-[calc(100dvh-2rem)] max-w-[1240px] flex-wrap items-center gap-12 px-4 py-8 sm:px-8">
        <div className="fu flex min-w-0 flex-[1_1_440px] flex-col gap-7">
          <Logo size="lg" />
          <h1 className="heading fu d1 text-4xl leading-[1.05] tracking-[-0.035em] sm:text-[56px]">
            Welcome back.<br /><span className="text-brand-3">Care is closer than you think.</span>
          </h1>
          <p className="fu d2 max-w-[460px] text-lg leading-relaxed text-ink-2">
            Sign in to keep your emergency details, insurance and appointments in one place. SOS always works without signing in.
          </p>
          <div className="fu d3 relative hidden h-[300px] max-w-[520px] sm:block" aria-hidden="true">
            <svg className="spin-slow absolute top-0 left-[90px]" viewBox="0 0 300 300" width="300" height="300">
              <circle cx="150" cy="150" r="140" fill="none" stroke="rgb(94 234 212 / .35)" strokeWidth="1.5" strokeDasharray="4 10" />
              <circle cx="150" cy="150" r="100" fill="none" stroke="rgb(165 180 252 / .3)" strokeWidth="1.5" strokeDasharray="2 8" />
              <circle cx="150" cy="10" r="6" fill="#5eead4" /><circle cx="250" cy="150" r="5" fill="#a5b4fc" />
            </svg>
            <div className="glass float absolute top-10 left-0 flex w-[270px] items-center gap-3 rounded-[20px] p-4">
              <IconTile tone="mint"><Lock className="size-5" /></IconTile>
              <span><span className="block text-[15px] font-bold">Private by default</span><span className="block text-[13px] text-ink-2">Shared only with the hospital that accepts</span></span>
            </div>
            <div className="glass float2 absolute top-[170px] right-0 flex w-[250px] items-center gap-3 rounded-[20px] p-4">
              <IconTile tone="sos"><Siren className="size-5" /></IconTile>
              <span><span className="block text-[15px] font-bold">SOS needs no login</span><span className="block text-[13px] text-ink-2">Press and hold, any time</span></span>
            </div>
          </div>
        </div>

        <div className="glass fu d2 w-full min-w-0 max-w-[500px] flex-[1_1_400px] rounded-[32px] p-6 sm:p-9">
          <h2 className="heading text-[28px]">Sign in</h2>
          <p className="mt-2 text-[15px] text-ink-2">Choose how you use CarePath.</p>
          <div role="tablist" aria-label="Account type" className="mt-6 grid grid-cols-2 gap-1.5 rounded-2xl border border-line bg-well p-1.5">
            {(['patient', 'staff'] as const).map((t) => (
              <button key={t} role="tab" type="button" aria-selected={tab === t} onClick={() => setTab(t)}
                className={cx('min-h-11 rounded-xl text-[15px] font-semibold transition', tab === t ? 'bg-[linear-gradient(135deg,#ccfbf1,#5eead4)] text-on-mint shadow-[0_6px_18px_rgb(45_212_191/0.35)]' : 'text-ink-3 hover:text-ink')}>
                {t === 'patient' ? 'Patient' : 'Hospital staff'}
              </button>
            ))}
          </div>
          {tab === 'patient' ? <PatientSignIn /> : <StaffSignIn />}
          <div className="my-6.5 flex items-center gap-3.5 text-[13px] text-ink-3"><span className="h-px flex-1 bg-fill-2" />or<span className="h-px flex-1 bg-fill-2" /></div>
          <Link to="/app" className="sos-surface flex min-h-[52px] items-center justify-center gap-2.5 rounded-2xl text-[15px] font-bold no-underline">
            <Siren className="size-[18px]" aria-hidden /> Emergency? Use SOS without signing in
          </Link>
          <p className="mt-5 text-center text-[13px] text-ink-3">By continuing you agree to how we handle your data under the DPDP Act 2023: shared only with the hospital that accepts your SOS or appointment.</p>
        </div>
      </div>
    </div>
  )
}

function PatientSignIn() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const { me, setMe } = useMe()
  const [phone, setPhone] = useState(me?.phone ?? '')
  const [sent, setSent] = useState<OtpSent | null>(null)
  const [digits, setDigits] = useState(['', '', '', '', '', ''])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [wait, setWait] = useState(0)
  const boxes = useRef<Array<HTMLInputElement | null>>([])

  useEffect(() => { if (!phone && me?.phone) setPhone(me.phone) }, [me?.phone, phone])
  useEffect(() => {
    if (wait <= 0) return
    const t = setTimeout(() => setWait((w) => w - 1), 1000)
    return () => clearTimeout(t)
  }, [wait])

  async function requestCode(e?: FormEvent) {
    e?.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const r = await api.post<OtpSent>('/auth/otp/request', { phone })
      setSent(r)
      setWait(r.resendAfterSeconds)
      setDigits(['', '', '', '', '', ''])
      setTimeout(() => boxes.current[0]?.focus(), 50)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function verify(code: string) {
    setBusy(true)
    setError(null)
    try {
      const next = await api.post<Me>('/auth/otp/verify', { phone, code })
      setMe(next)
      navigate(params.get('next') ?? '/app', { replace: true })
    } catch (err) {
      setError((err as Error).message)
      setDigits(['', '', '', '', '', ''])
      boxes.current[0]?.focus()
      setBusy(false)
    }
  }

  function setDigit(i: number, value: string) {
    const v = value.replace(/\D/g, '').slice(-1)
    const next = [...digits]
    next[i] = v
    setDigits(next)
    if (v && i < 5) boxes.current[i + 1]?.focus()
    if (next.every(Boolean)) void verify(next.join(''))
  }
  function onKey(i: number, e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Backspace' && !digits[i] && i > 0) boxes.current[i - 1]?.focus()
  }
  function onPaste(e: ClipboardEvent<HTMLInputElement>) {
    const code = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6)
    if (code.length !== 6) return
    e.preventDefault()
    setDigits(code.split(''))
    void verify(code)
  }

  return (
    <div className="pop mt-6.5 flex flex-col gap-4.5">
      <form onSubmit={requestCode}>
        <label htmlFor="ph" className="label">Mobile number</label>
        <div className="flex gap-2.5">
          <span className="input grid w-[76px] flex-none place-items-center px-0 font-semibold">+91</span>
          <input id="ph" className="input" inputMode="tel" autoComplete="tel" placeholder="10-digit mobile" value={phone}
            onChange={(e) => { setPhone(e.target.value); setSent(null) }} disabled={busy && !sent} />
        </div>
        {!sent && (
          <button className="btn-primary mt-4.5 min-h-[54px] w-full text-base" disabled={busy || phone.replace(/\D/g, '').length < 10}>
            {busy ? <Loader2 className="size-5 animate-spin" aria-hidden /> : <>Send code <ArrowRight className="size-[18px]" aria-hidden /></>}
          </button>
        )}
      </form>

      {sent && (
        <div className="pop">
          <p className="label">One-time code</p>
          <div className="flex gap-2.5">
            {digits.map((d, i) => (
              <span key={i} className="flex-1">
                <label htmlFor={`otp${i}`} className="sr-only">Digit {i + 1}</label>
                <input id={`otp${i}`} ref={(el) => { boxes.current[i] = el }} className="input h-14 px-0 text-center text-xl font-bold"
                  inputMode="numeric" autoComplete={i === 0 ? 'one-time-code' : 'off'} maxLength={1} value={d} disabled={busy}
                  onChange={(e) => setDigit(i, e.target.value)} onKeyDown={(e) => onKey(i, e)} onPaste={onPaste} />
              </span>
            ))}
          </div>
          <p className="mt-2.5 text-[13px] text-ink-3">
            Code sent by SMS.{' '}
            {wait > 0 ? <span>Resend in 0:{String(wait).padStart(2, '0')}</span> : <button type="button" className="font-semibold text-brand underline" onClick={() => void requestCode()}>Resend code</button>}
          </p>
          {sent.devCode && (
            <p className="mt-3 rounded-2xl border border-amber/30 bg-amber-soft p-3 text-[13px] text-amber">
              Development: no SMS service is connected, so here is the code: <b className="tracking-[0.2em]">{sent.devCode}</b>
            </p>
          )}
          <button className="btn-primary mt-4.5 min-h-[54px] w-full text-base" disabled={busy || !digits.every(Boolean)} onClick={() => void verify(digits.join(''))}>
            {busy ? <Loader2 className="size-5 animate-spin" aria-hidden /> : <>Verify &amp; continue <ArrowRight className="size-[18px]" aria-hidden /></>}
          </button>
        </div>
      )}
      {error && <ErrorNote>{error}</ErrorNote>}
    </div>
  )
}

function StaffSignIn() {
  const navigate = useNavigate()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await api.post('/console/login', { username, password })
      navigate('/console', { replace: true })
    } catch (err) {
      setError((err as Error).message)
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="pop mt-6.5 flex flex-col gap-4.5">
      <div><label htmlFor="un" className="label">Username</label><input id="un" className="input" autoComplete="username" placeholder="e.g. civil-sonipat" required value={username} onChange={(e) => setUsername(e.target.value)} /></div>
      <div><label htmlFor="pw" className="label">Password</label><input id="pw" className="input" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} /></div>
      {error && <ErrorNote>{error}</ErrorNote>}
      <button className="btn-primary min-h-[54px] text-base" disabled={busy}>{busy ? <Loader2 className="size-5 animate-spin" aria-hidden /> : 'Open hospital console'}</button>
      <p className="text-[13px] text-ink-3">Accounts are created by CarePath when your hospital is onboarded.</p>
    </form>
  )
}
