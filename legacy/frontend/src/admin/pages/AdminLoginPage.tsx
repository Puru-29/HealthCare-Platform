import { useState, type FormEvent } from 'react'
import { ArrowLeft, HeartPulse, LockKeyhole } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import { AdminApiError, adminLogin } from '../api'

export function AdminLoginPage() {
  const navigate = useNavigate()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    setSubmitting(true)
    try {
      await adminLogin(username, password)
      navigate('/admin', { replace: true })
    } catch (cause) {
      setError(
        cause instanceof AdminApiError && cause.status === 503
          ? 'Administrator access is not configured on the backend.'
          : cause instanceof Error ? cause.message : 'Sign in could not be completed.',
      )
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="mx-auto grid min-h-[calc(100vh-3rem)] max-w-7xl place-items-center px-5 py-12">
      <section className="glass-card w-full max-w-md p-6 sm:p-9">
        <Link className="inline-flex min-h-10 items-center gap-2 text-sm font-medium text-ink-600 hover:text-forest-800" to="/">
          <ArrowLeft size={16} /> Return to Carepath
        </Link>
        <div className="mt-8 flex items-center gap-3">
          <span className="grid size-11 place-items-center rounded-2xl bg-forest-900 text-white"><HeartPulse size={22} /></span>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.15em] text-forest-700">Restricted access</p>
            <h1 className="text-2xl font-semibold tracking-tight text-forest-950">Admin sign in</h1>
          </div>
        </div>
        <p className="mt-4 text-sm leading-6 text-ink-600">Use your configured administrator credentials. Public accounts cannot access management tools.</p>
        <form className="mt-7 space-y-4" onSubmit={submit}>
          <label className="block text-sm font-medium text-ink-800">
            Username
            <input autoComplete="username" className="mt-1.5 min-h-12 w-full rounded-xl border border-forest-900/15 bg-white/75 px-4" onChange={(event) => setUsername(event.target.value)} required value={username} />
          </label>
          <label className="block text-sm font-medium text-ink-800">
            Password
            <input autoComplete="current-password" className="mt-1.5 min-h-12 w-full rounded-xl border border-forest-900/15 bg-white/75 px-4" onChange={(event) => setPassword(event.target.value)} required type="password" value={password} />
          </label>
          {error && <p className="rounded-xl border border-emergency-600/20 bg-white/70 p-3 text-sm text-emergency-700" role="alert">{error}</p>}
          <button className="glass-button glass-button-primary inline-flex w-full disabled:cursor-not-allowed disabled:opacity-60" disabled={submitting} type="submit">
            <LockKeyhole size={16} /> {submitting ? 'Verifying…' : 'Sign in securely'}
          </button>
        </form>
      </section>
    </div>
  )
}
