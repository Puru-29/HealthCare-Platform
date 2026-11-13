import {
  Activity,
  Ambulance,
  CalendarDays,
  ChevronRight,
  HeartPulse,
  Home,
  Hospital,
  LogOut,
  Menu,
  Search,
  Settings,
  ShieldCheck,
  Stethoscope,
  UserRound,
  X,
} from 'lucide-react'
import { useEffect, useState, type FormEvent } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/useAuth'

const sections = [
  { label: 'Overview', to: '/dashboard', icon: Home, end: true },
  { label: 'Find hospitals', to: '/dashboard/hospitals', icon: Hospital },
  { label: 'Find doctors', to: '/dashboard/doctors', icon: Stethoscope },
  { label: 'Appointments', to: '/dashboard/appointments', icon: CalendarDays },
  { label: 'Symptom guide', to: '/dashboard/assistant', icon: Activity },
  { label: 'Emergency SOS', to: '/dashboard/emergency', icon: HeartPulse },
  { label: 'Insurance', to: '/dashboard/insurance', icon: ShieldCheck },
  { label: 'Ambulance services', to: '/dashboard/ambulance', icon: Ambulance },
]

export function DashboardLayout() {
  const { user, signOut } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const [profileOpen, setProfileOpen] = useState(false)
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const [logoutError, setLogoutError] = useState('')
  const [signingOut, setSigningOut] = useState(false)

  useEffect(() => {
    if (!mobileNavOpen) return
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') setMobileNavOpen(false)
    }
    document.addEventListener('keydown', closeOnEscape)
    return () => document.removeEventListener('keydown', closeOnEscape)
  }, [mobileNavOpen])

  function searchDirectory(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    navigate(`/dashboard/search?q=${encodeURIComponent(search.trim())}`)
    setMobileNavOpen(false)
  }

  async function handleSignOut() {
    setSigningOut(true)
    setLogoutError('')
    try {
      await signOut()
      setProfileOpen(false)
      navigate('/', { replace: true })
    } catch (error) {
      setLogoutError(error instanceof Error ? error.message : 'Sign out could not be completed.')
    } finally {
      setSigningOut(false)
    }
  }

  return (
    <div className="patient-app">
      <header className="patient-topbar">
        <div className="patient-topbar-inner">
          <NavLink className="patient-brand" to="/dashboard">
            <span className="patient-brand-mark">
              <HeartPulse aria-hidden="true" size={19} />
            </span>
            <span>CarePath <span>patient</span></span>
          </NavLink>
          <form className="patient-topbar-search" onSubmit={searchDirectory} role="search">
            <label>
              <Search aria-hidden="true" size={16} />
              <span className="sr-only">Search hospitals, doctors, and specialties</span>
              <input
                maxLength={120}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search hospitals, doctors, specialties…"
                value={search}
              />
            </label>
            <button aria-label="Search care directory" type="submit"><Search aria-hidden="true" size={16} /></button>
          </form>
          <div className="patient-topbar-actions">
            <span className="patient-topbar-location"><span />Sonipat, Haryana</span>
            <div className="patient-profile-menu-wrap">
              <button
                aria-controls="patient-profile-menu"
                aria-expanded={profileOpen}
                aria-label="Open profile menu"
                className="patient-profile-trigger"
                onClick={() => setProfileOpen((open) => !open)}
                type="button"
              >
                <span className="patient-profile-avatar"><UserRound aria-hidden="true" size={16} /></span>
                <span className="patient-profile-trigger-name">{user?.displayName ?? 'Profile'}</span>
              </button>
              {profileOpen && (
                <div className="glass-card patient-profile-menu" id="patient-profile-menu">
                  <strong>{user?.displayName ?? 'Patient profile'}</strong>
                  <small>{user?.email}</small>
                  <Link onClick={() => setProfileOpen(false)} to="/dashboard/profile">My profile</Link>
                  <Link onClick={() => setProfileOpen(false)} to="/dashboard/settings">Settings</Link>
                  <button disabled={signingOut} onClick={() => void handleSignOut()} type="button">
                    <LogOut aria-hidden="true" size={15} />{signingOut ? 'Signing out…' : 'Log out'}
                  </button>
                </div>
              )}
            </div>
            <button
              aria-controls="patient-navigation"
              aria-expanded={mobileNavOpen}
              aria-label={mobileNavOpen ? 'Close dashboard navigation' : 'Open dashboard navigation'}
              className="patient-mobile-menu-button"
              onClick={() => setMobileNavOpen((open) => !open)}
              type="button"
            >
              {mobileNavOpen ? <X aria-hidden="true" size={19} /> : <Menu aria-hidden="true" size={19} />}
            </button>
          </div>
        </div>
        {logoutError && <p className="mx-auto mt-2 max-w-[1500px] text-sm text-emergency-700" role="alert">{logoutError}</p>}
      </header>

      {mobileNavOpen && (
        <button
          aria-label="Close dashboard navigation"
          className="patient-drawer-backdrop"
          onClick={() => setMobileNavOpen(false)}
          type="button"
        />
      )}
      <div className="patient-layout">
        <aside className="patient-sidebar">
          <nav
            aria-label="Patient dashboard"
            className={`glass-card patient-nav${mobileNavOpen ? ' is-open' : ''}`}
            id="patient-navigation"
          >
            {sections.map(({ label, to, icon: Icon, end }) => (
              <NavLink
                end={end}
                key={to}
                className={({ isActive }) =>
                  `patient-nav-link${isActive ? ' is-active' : ''}`
                }
                onClick={() => setMobileNavOpen(false)}
                to={to}
              >
                <Icon aria-hidden="true" size={17} />
                {label}
                {location.pathname === to && <ChevronRight aria-hidden="true" className="ml-auto hidden lg:block" size={15} />}
              </NavLink>
            ))}
            <div className="patient-nav-secondary">
              <NavLink
                className={({ isActive }) => `patient-nav-link${isActive ? ' is-active' : ''}`}
                onClick={() => setMobileNavOpen(false)}
                to="/dashboard/settings"
              >
                <Settings aria-hidden="true" size={17} />
                Settings
              </NavLink>
              <NavLink
                className={({ isActive }) => `patient-nav-link${isActive ? ' is-active' : ''}`}
                onClick={() => setMobileNavOpen(false)}
                to="/dashboard/profile"
              >
                <UserRound aria-hidden="true" size={17} />
                My profile
              </NavLink>
            </div>
            <button
              className="patient-nav-link patient-nav-logout"
              disabled={signingOut}
              onClick={() => void handleSignOut()}
              type="button"
            >
              <LogOut aria-hidden="true" size={17} />
              {signingOut ? 'Signing out…' : 'Log out'}
            </button>
          </nav>
          <div className="patient-disclaimer">
            CarePath is a directory and navigation aid, not a medical provider or emergency service.
          </div>
        </aside>
        <main className="patient-main" id="main-content">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
