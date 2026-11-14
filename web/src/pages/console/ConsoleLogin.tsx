import { Loader2 } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router'
import { DemoBanner, Logo } from '../../components/Layout'
import { ErrorNote } from '../../components/ui'
import { api } from '../../lib/api'

export function ConsoleLogin() {
  const navigate = useNavigate()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

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
    <div className="min-h-dvh">
      <DemoBanner />
      <div className="mx-auto max-w-sm px-4 py-16">
        <Logo />
        <h1 className="mt-8 text-2xl font-bold">Hospital console</h1>
        <p className="mt-1 text-sm text-ink-2">Receive SOS requests, dispatch ambulances and manage appointments.</p>
        <form onSubmit={submit} className="card mt-6 space-y-4 p-5">
          <div><label className="label" htmlFor="u">Username</label><input id="u" className="input" autoComplete="username" required value={username} onChange={(e) => setUsername(e.target.value)} /></div>
          <div><label className="label" htmlFor="p">Password</label><input id="p" type="password" className="input" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} /></div>
          {error && <ErrorNote>{error}</ErrorNote>}
          <button className="btn-primary w-full" disabled={busy}>{busy && <Loader2 className="size-4 animate-spin" aria-hidden />} Sign in</button>
        </form>
      </div>
    </div>
  )
}
