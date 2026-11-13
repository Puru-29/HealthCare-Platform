import { ArrowRight, ArrowUpRight, HeartPulse, LogOut, MapPin, Menu, UserRound, X } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth/useAuth'

const navigation = [
  { label: 'Home', to: '/#home' },
  { label: 'Features', to: '/#features' },
  { label: 'How it works', to: '/#how-it-works' },
  { label: 'About', to: '/#why-carepath' },
  { label: 'Contact', to: '/#contact' },
]

export function SiteHeader() {
  const [menuOpen, setMenuOpen] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  const [logoutError, setLogoutError] = useState('')
  const { status, user, refresh, signOut } = useAuth()

  async function handleSignOut() {
    setLogoutError('')
    try {
      await signOut()
      setProfileOpen(false)
    } catch (error) {
      setLogoutError(error instanceof Error ? error.message : 'Sign out could not be completed.')
    }
  }

  function closeMenus() {
    setMenuOpen(false)
    setProfileOpen(false)
  }

  return (
    <header className="site-header">
      <div className="glass-navbar site-header-bar">
        <Link aria-label="CarePath home" className="site-brand" onClick={closeMenus} to="/">
          <span className="site-brand-mark"><HeartPulse aria-hidden="true" size={20} strokeWidth={2} /></span>
          <span>carepath</span>
        </Link>

        <nav aria-label="Main navigation" className="site-primary-nav">
          {navigation.map((item) => (
            <a href={item.to} key={item.to} onClick={closeMenus}>{item.label}</a>
          ))}
        </nav>

        <div className="site-header-actions">
          <span className="site-location">
            <MapPin aria-hidden="true" size={15} />
            <span>Sonipat, Haryana</span>
          </span>
          {status === 'authenticated' ? (
            <Link className="site-dashboard-button" to="/dashboard">
              My dashboard <ArrowRight aria-hidden="true" size={15} />
            </Link>
          ) : (
            <div className="site-auth-actions">
              <Link className="site-login-link" to="/login">Log in</Link>
              <Link className="glass-button glass-button-primary site-get-started" to="/register">
                Get started <ArrowRight aria-hidden="true" size={15} />
              </Link>
            </div>
          )}
          <div className="site-profile">
            <button
              aria-controls="profile-menu"
              aria-expanded={profileOpen}
              aria-label="Open account menu"
              className="site-profile-trigger"
              onClick={() => setProfileOpen((open) => !open)}
              type="button"
            >
              <UserRound aria-hidden="true" size={17} />
              {status === 'authenticated' ? <span className="site-profile-name">{user?.displayName ?? 'Account'}</span> : <span className="sr-only">Account</span>}
            </button>
            {profileOpen && (
              <div aria-label="Account menu" className="glass-card site-profile-menu" id="profile-menu" role="region">
                {status === 'authenticated' && user ? (
                  <>
                    <p className="site-profile-menu-name">{user.displayName}</p>
                    <p className="site-profile-menu-email">{user.email}</p>
                    <Link className="site-profile-menu-link" onClick={closeMenus} to="/dashboard/profile">
                      Account profile <ArrowUpRight aria-hidden="true" size={14} />
                    </Link>
                    <button className="site-profile-menu-link" onClick={() => void handleSignOut()} type="button">
                      <LogOut aria-hidden="true" size={14} /> Sign out
                    </button>
                  </>
                ) : status === 'loading' ? (
                  <p className="site-profile-message">Checking your account…</p>
                ) : status === 'unavailable' ? (
                  <>
                    <p className="site-profile-menu-name">Account unavailable</p>
                    <p className="site-profile-message">Sign-in service is temporarily unavailable.</p>
                    <button className="site-profile-menu-link" onClick={() => void refresh()} type="button">Try again</button>
                  </>
                ) : (
                  <>
                    <p className="site-profile-menu-name">Your CarePath account</p>
                    <p className="site-profile-message">Sign in to view your account dashboard.</p>
                    <div className="site-profile-menu-actions">
                      <Link onClick={closeMenus} to="/login">Log in</Link>
                      <Link onClick={closeMenus} to="/register">Create account</Link>
                    </div>
                  </>
                )}
                {logoutError && <p className="site-profile-error" role="alert">{logoutError}</p>}
              </div>
            )}
          </div>
          <button
            aria-controls="mobile-navigation"
            aria-expanded={menuOpen}
            aria-label={menuOpen ? 'Close menu' : 'Open menu'}
            className="site-menu-trigger"
            onClick={() => setMenuOpen((open) => !open)}
            type="button"
          >
            {menuOpen ? <X aria-hidden="true" size={19} /> : <Menu aria-hidden="true" size={19} />}
          </button>
        </div>
      </div>

      {menuOpen && (
        <nav aria-label="Mobile navigation" className="glass-card site-mobile-nav" id="mobile-navigation">
          {navigation.map((item) => (
            <a href={item.to} key={item.to} onClick={closeMenus}>{item.label}</a>
          ))}
          {status === 'authenticated' ? (
            <Link className="glass-button glass-button-primary inline-flex" onClick={closeMenus} to="/dashboard">
              Go to dashboard <ArrowRight aria-hidden="true" size={15} />
            </Link>
          ) : (
            <div className="site-mobile-auth">
              <Link className="glass-button inline-flex" onClick={closeMenus} to="/login">Log in</Link>
              <Link className="glass-button glass-button-primary inline-flex" onClick={closeMenus} to="/register">
                Get started <ArrowRight aria-hidden="true" size={15} />
              </Link>
            </div>
          )}
        </nav>
      )}
    </header>
  )
}
