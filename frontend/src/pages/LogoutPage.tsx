import { CheckCircle2, Loader2, LogOut } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { Aurora, ErrorNote } from '../components/ui'
import { api } from '../lib/api'
import { firstName, useMe } from '../lib/me'

const DEVICE_KEYS = ['cp:lastLocation']

export function LogoutPage() {
  const navigate = useNavigate()
  const { me, reload } = useMe()
  const [clearDevice, setClearDevice] = useState(false)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const name = firstName(me?.name)

  async function logout() {
    setBusy(true)
    setError(null)
    try {
      await api.post('/auth/logout')
      if (clearDevice) {
        try {
          for (const k of DEVICE_KEYS) localStorage.removeItem(k)
          sessionStorage.clear()
        } catch { /* storage unavailable */ }
      }
      setDone(name ?? '')
      await reload()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="relative grid min-h-dvh place-items-center p-4">
      <Aurora />
      {done === null ? (
        <section className="glass pop w-full max-w-[480px] rounded-[32px] p-8 text-center" aria-labelledby="lo-title">
          <span className="mx-auto grid size-16 place-items-center rounded-[20px] bg-fill-2"><LogOut className="size-7" aria-hidden /></span>
          <h1 id="lo-title" className="heading mt-5 text-[28px]">Log out of CarePath?</h1>
          <p className="mt-2.5 text-[15px] leading-relaxed text-ink-2">SOS keeps working after you log out — you can press and hold it any time without signing in.</p>
          {me?.signedIn ? (
            <>
              <label className="mt-6 flex items-start gap-3 rounded-2xl bg-fill p-4 text-left">
                <input type="checkbox" className="mt-0.5 size-[18px] accent-brand-2" checked={clearDevice} onChange={(e) => setClearDevice(e.target.checked)} />
                <span>
                  <span className="block text-[15px] font-semibold">Also clear this device</span>
                  <span className="mt-0.5 block text-[13px] text-ink-3">Forget the last location and chat on this phone. Your details stay safe in your account for next time.</span>
                </span>
              </label>
              {error && <div className="mt-4"><ErrorNote>{error}</ErrorNote></div>}
              <div className="mt-6 grid grid-cols-2 gap-2.5">
                <button className="btn-secondary min-h-[52px]" onClick={() => navigate(-1)}>Stay signed in</button>
                <button className="btn-primary min-h-[52px]" onClick={() => void logout()} disabled={busy}>{busy ? <Loader2 className="size-5 animate-spin" aria-hidden /> : 'Log out'}</button>
              </div>
            </>
          ) : (
            <>
              <p className="mt-5 rounded-2xl bg-amber-soft p-4 text-left text-sm text-amber">You aren’t signed in, so there’s nothing to log out of. Sign in with your mobile number to keep your details on every phone.</p>
              <div className="mt-6 grid grid-cols-2 gap-2.5">
                <Link className="btn-secondary min-h-[52px]" to="/app">Back to app</Link>
                <Link className="btn-primary min-h-[52px]" to="/login">Sign in</Link>
              </div>
            </>
          )}
        </section>
      ) : (
        <section className="glass pop w-full max-w-[480px] rounded-[32px] p-8 text-center" aria-live="polite">
          <span className="mx-auto grid size-16 place-items-center rounded-[20px] bg-brand-soft"><CheckCircle2 className="size-8 text-brand" aria-hidden /></span>
          <h1 className="heading mt-5 text-[28px]">You’re signed out</h1>
          <p className="mt-2.5 text-[15px] leading-relaxed text-ink-2">Stay safe{done ? `, ${done}` : ''}. In an emergency, SOS and 108 are still one tap away.</p>
          <div className="mt-6 grid grid-cols-2 gap-2.5">
            <Link className="btn-secondary min-h-[52px]" to="/">Back to home</Link>
            <Link className="btn-primary min-h-[52px]" to="/login">Sign in again</Link>
          </div>
        </section>
      )}
    </div>
  )
}
