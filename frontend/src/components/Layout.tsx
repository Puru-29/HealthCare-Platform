import { Bot, Building2, CalendarDays, House, IndianRupee, LogIn, LogOut, Siren, UserRound } from 'lucide-react'
import { Link, NavLink, Outlet } from 'react-router'
import { cx } from '../lib/format'
import { useMeta } from '../lib/hooks'
import { initials, useMe } from '../lib/me'
import { Aurora, EmergencyNumbers, Logo } from './ui'

const NAV = [
  { to: '/app', label: 'Dashboard', short: 'Home', icon: House, end: true, mobile: true },
  { to: '/app/sos', label: 'SOS tracking', short: 'SOS', icon: Siren, mobile: false },
  { to: '/app/guide', label: 'Care guide', short: 'Guide', icon: Bot, mobile: true },
  { to: '/app/hospitals', label: 'Hospitals', short: 'Hospitals', icon: Building2, mobile: true },
  { to: '/app/insurance', label: 'Insurance', short: 'Insurance', icon: IndianRupee, mobile: true },
  { to: '/app/appointments', label: 'Appointments', short: 'Visits', icon: CalendarDays, mobile: false },
  { to: '/app/profile', label: 'Profile', short: 'Me', icon: UserRound, mobile: true },
]

export function DemoBanner() {
  const meta = useMeta()
  if (!meta?.demoMode) return null
  return (
    <div className="relative z-[1100] border-b border-amber/25 bg-[#fff4e0]/90 px-4 py-1.5 text-center text-xs font-medium text-amber backdrop-blur">
      Demo mode — ambulances are simulated. In a real emergency call <a className="font-bold underline" href="tel:112">112</a> or <a className="font-bold underline" href="tel:108">108</a>.
    </div>
  )
}

function UserFooter() {
  const { me } = useMe()
  const signedIn = !!me?.signedIn
  return (
    <div className="mt-4 flex items-center gap-3 border-t border-line pt-4 pl-2">
      <Link to="/app/profile" className="avatar size-10 text-sm no-underline" aria-label="Profile">{me?.name ? initials(me.name) : <UserRound className="size-5" />}</Link>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold">{me?.name ?? (signedIn ? 'Your account' : 'Guest')}</span>
        <span className="block text-xs text-ink-3">{signedIn ? 'Patient · signed in' : 'Not signed in'}</span>
      </span>
      {signedIn
        ? <Link to="/logout" aria-label="Log out" className="grid size-11 place-items-center rounded-xl text-ink-2 hover:bg-fill-2 hover:text-ink"><LogOut className="size-5" /></Link>
        : <Link to="/login" aria-label="Sign in" className="grid size-11 place-items-center rounded-xl text-brand hover:bg-fill-2"><LogIn className="size-5" /></Link>}
    </div>
  )
}

function Sidebar() {
  return (
    <aside className="glass si sticky top-6 hidden w-[272px] shrink-0 flex-col gap-1 self-start rounded-[28px] px-3.5 py-5.5 lg:flex">
      <div className="px-2.5 pb-5"><Logo to="/" /></div>
      <p className="px-3.5 pb-2 text-[11px] font-bold tracking-[0.14em] text-ink-3 uppercase">Menu</p>
      <nav aria-label="Sidebar" className="flex flex-col gap-1">
        {NAV.map(({ to, label, icon: Icon, end }) => (
          <NavLink key={to} to={to} end={end}
            className={({ isActive }) => cx(
              'flex min-h-[46px] items-center gap-3 rounded-[14px] border px-3.5 text-[15px] no-underline transition-colors',
              isActive
                ? 'border-[rgb(94_234_212/0.45)] bg-[linear-gradient(135deg,rgb(94_234_212/0.28),rgb(94_234_212/0.08))] font-semibold text-ink shadow-[0_6px_20px_rgb(45_212_191/0.18)]'
                : 'border-transparent font-medium text-ink-2 hover:bg-fill-2 hover:text-ink',
            )}>
            <Icon className="size-5" aria-hidden /> {label}
          </NavLink>
        ))}
      </nav>
      <div className="sos-surface mt-5 rounded-[20px] p-4.5">
        <p className="font-bold">In an emergency</p>
        <p className="mt-1 mb-3 text-[13px] text-white/85">Free, 24×7</p>
        <EmergencyNumbers variant="compact" />
      </div>
      <UserFooter />
    </aside>
  )
}

function MobileBars() {
  const { me } = useMe()
  return (
    <>
      <header className="glass sticky top-0 z-[1000] flex h-15 items-center justify-between rounded-none border-x-0 border-t-0 px-4 lg:hidden">
        <Logo to="/" />
        <div className="flex items-center gap-2">
          <a href="tel:112" className="chip bg-sos px-3 py-2 text-sm font-bold text-white">Call 112</a>
          <Link to="/app/profile" aria-label="Profile" className="avatar size-9 text-xs no-underline">{me?.name ? initials(me.name) : <UserRound className="size-4" />}</Link>
        </div>
      </header>
      <nav className="glass fixed inset-x-0 bottom-0 z-[1000] rounded-none border-x-0 border-b-0 pb-[env(safe-area-inset-bottom)] lg:hidden" aria-label="Main">
        <div className="mx-auto grid max-w-md grid-cols-5">
          {NAV.filter((n) => n.mobile).map(({ to, short, icon: Icon, end }) => (
            <NavLink key={to} to={to} end={end}
              className={({ isActive }) => cx('flex flex-col items-center gap-0.5 py-2.5 text-[11px] font-semibold no-underline', isActive ? 'text-brand' : 'text-ink-3')}>
              <Icon className="size-5" aria-hidden /> {short}
            </NavLink>
          ))}
        </div>
      </nav>
    </>
  )
}

/** Signed-in-or-guest app shell: sidebar on desktop, top bar + tabs on phones. */
export function AppLayout() {
  return (
    <div className="min-h-dvh">
      <Aurora />
      <DemoBanner />
      <MobileBars />
      <div className="mx-auto flex max-w-[1400px] gap-6 p-4 pb-28 lg:p-6">
        <Sidebar />
        <main className="flex min-w-0 flex-1 flex-col gap-5.5">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
