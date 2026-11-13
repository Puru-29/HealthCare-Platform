import { Bot, Building2, House, IndianRupee, UserRound } from 'lucide-react'
import { Link, NavLink, Outlet } from 'react-router'
import { useMeta } from '../lib/hooks'
import { cx } from '../lib/format'

const NAV = [
  { to: '/', label: 'Home', icon: House, end: true },
  { to: '/assistant', label: 'Care guide', icon: Bot },
  { to: '/hospitals', label: 'Hospitals', icon: Building2 },
  { to: '/insurance', label: 'Insurance', icon: IndianRupee },
  { to: '/profile', label: 'Me', icon: UserRound },
]

export function Logo() {
  return (
    <Link to="/" className="flex items-center gap-2 font-bold tracking-tight">
      <span className="grid size-8 place-items-center rounded-lg bg-brand text-white">
        <svg viewBox="0 0 24 24" className="size-4" fill="currentColor" aria-hidden><path d="M9.5 3h5v6.5H21v5h-6.5V21h-5v-6.5H3v-5h6.5z" /></svg>
      </span>
      <span>CarePath <span className="font-medium text-ink-3">Sonipat</span></span>
    </Link>
  )
}

export function DemoBanner() {
  const meta = useMeta()
  if (!meta?.demoMode) return null
  return (
    <div className="bg-amber-soft px-4 py-1.5 text-center text-xs font-medium text-amber">
      Demo mode — ambulances are simulated. In a real emergency call <a className="font-bold underline" href="tel:112">112</a> or <a className="font-bold underline" href="tel:108">108</a>.
    </div>
  )
}

export function PatientLayout() {
  return (
    <div className="min-h-dvh pb-20 md:pb-0">
      <DemoBanner />
      <header className="sticky top-0 z-[1000] border-b border-line bg-canvas/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
          <Logo />
          <nav className="hidden items-center gap-1 md:flex" aria-label="Main">
            {NAV.map(({ to, label, end }) => (
              <NavLink key={to} to={to} end={end}
                className={({ isActive }) => cx('rounded-lg px-3 py-1.5 text-sm font-medium', isActive ? 'bg-brand-soft text-brand' : 'text-ink-2 hover:bg-black/5')}>
                {label}
              </NavLink>
            ))}
          </nav>
          <a href="tel:112" className="chip bg-sos px-3 py-1.5 text-sm font-semibold text-white md:hidden">Call 112</a>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-5">
        <Outlet />
      </main>
      <nav className="fixed inset-x-0 bottom-0 z-[1000] border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden" aria-label="Main">
        <div className="mx-auto grid max-w-md grid-cols-5">
          {NAV.map(({ to, label, icon: Icon, end }) => (
            <NavLink key={to} to={to} end={end}
              className={({ isActive }) => cx('flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium', isActive ? 'text-brand' : 'text-ink-3')}>
              <Icon className="size-5" aria-hidden />
              {label}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  )
}
