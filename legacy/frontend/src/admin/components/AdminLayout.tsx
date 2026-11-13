import { useEffect, useState } from 'react'
import { Activity, Ambulance, Building2, LayoutDashboard, LogOut } from 'lucide-react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { AdminApiError, adminLogout, getAdminSession } from '../api'

const links = [
  { to: '/admin', label: 'Overview', icon: LayoutDashboard, end: true },
  { to: '/admin/hospitals', label: 'Hospitals', icon: Building2, end: false },
  { to: '/admin/ambulance', label: 'Ambulance', icon: Ambulance, end: false },
]

export function AdminLayout() {
  const navigate = useNavigate()
  const [username, setUsername] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    const controller = new AbortController()
    getAdminSession(controller.signal)
      .then((session) => setUsername(session.username))
      .catch((cause: unknown) => {
        if (cause instanceof DOMException && cause.name === 'AbortError') return
        if (cause instanceof AdminApiError && cause.status === 401) {
          navigate('/admin/login', { replace: true })
          return
        }
        setError(cause instanceof Error ? cause.message : 'Unable to verify this session.')
      })
      .finally(() => setLoading(false))
    return () => controller.abort()
  }, [navigate])

  async function signOut() {
    try {
      await adminLogout()
      navigate('/admin/login', { replace: true })
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Sign out could not be completed.')
    }
  }

  if (loading) {
    return <div className="mx-auto max-w-7xl px-5 py-20 text-sm text-ink-600" role="status">Verifying administrator session…</div>
  }
  if (!username || error) {
    return (
      <div className="mx-auto max-w-7xl px-5 py-20">
        <section className="glass-card mx-auto max-w-xl p-7" role="alert">
          <h1 className="text-xl font-semibold text-forest-950">Admin access unavailable</h1>
          <p className="mt-2 text-sm leading-6 text-ink-600">{error || 'Sign in is required.'}</p>
          <button className="glass-button glass-button-primary mt-5" onClick={() => navigate('/admin/login')} type="button">Continue to sign in</button>
        </section>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-7xl px-4 pb-14 pt-8 sm:px-6 lg:px-8">
      <div className="mb-7 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="grid size-11 place-items-center rounded-2xl bg-forest-900 text-white"><Activity size={21} /></span>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-forest-700">Carepath</p>
            <p className="text-lg font-semibold tracking-tight text-forest-950">Administration</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="hidden text-sm text-ink-600 sm:inline">Signed in as <strong className="font-semibold text-ink-800">{username}</strong></span>
          <button className="glass-button inline-flex" onClick={signOut} type="button"><LogOut size={16} /> Sign out</button>
        </div>
      </div>

      <nav aria-label="Admin navigation" className="glass-navbar mb-7 flex gap-1 overflow-x-auto p-2">
        {links.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            className={({ isActive }) => `inline-flex min-h-11 shrink-0 items-center gap-2 rounded-full px-4 text-sm font-medium transition ${
              isActive ? 'bg-forest-900 text-white' : 'text-ink-700 hover:bg-white/70'
            }`}
            end={end}
            key={to}
            to={to}
          >
            <Icon aria-hidden="true" size={17} /> {label}
          </NavLink>
        ))}
      </nav>
      <Outlet />
    </div>
  )
}
