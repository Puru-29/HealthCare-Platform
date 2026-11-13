import { AlertCircle, ArrowRight, LogOut, Settings, Truck, UserRound } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/useAuth'
import { PageIntro } from '../components/PageIntro'

type PatientServicesPageProps = {
  section: 'ambulance' | 'settings'
}

const pageContent = {
  ambulance: {
    icon: Truck,
    eyebrow: 'Ambulance',
    title: 'Ambulance dispatch is not connected.',
    description: 'CarePath cannot request, dispatch, or track an ambulance and does not have a live provider integration.',
    detail: 'For urgent help in India, call 112. CarePath does not send your location or place a call automatically.',
  },
  settings: {
    icon: Settings,
    eyebrow: 'Settings',
    title: 'Account settings',
    description: 'Manage your CarePath profile and sign-in session.',
    detail: 'Notification preferences and account recovery are not available because no notification or email provider is connected.',
  },
} as const

export function PatientServicesPage({ section }: PatientServicesPageProps) {
  const page = pageContent[section]
  const Icon = page.icon
  const { user, signOut } = useAuth()
  const navigate = useNavigate()
  const [signingOut, setSigningOut] = useState(false)
  const [logoutError, setLogoutError] = useState('')

  async function handleSignOut() {
    setSigningOut(true)
    setLogoutError('')
    try {
      await signOut()
      navigate('/', { replace: true })
    } catch (cause) {
      setLogoutError(cause instanceof Error ? cause.message : 'Sign out could not be completed.')
    } finally {
      setSigningOut(false)
    }
  }

  return (
    <div className="space-y-5">
      <PageIntro description={page.description} eyebrow={page.eyebrow} title={page.title} />
      <section className={`glass-card p-5 sm:p-7 ${section === 'ambulance' ? 'glass-card--emergency' : ''}`}>
        <div className="flex items-start gap-4">
          <span className={`grid size-12 shrink-0 place-items-center rounded-2xl ${section === 'ambulance' ? 'bg-emergency-600 text-white' : 'bg-sage-100 text-forest-800'}`}>
            <Icon aria-hidden="true" size={22} />
          </span>
          <div>
            <h2 className="font-semibold text-forest-950">{section === 'settings' ? 'Profile and session' : 'Service availability'}</h2>
            <p className="mt-2 text-sm leading-6 text-ink-700">{page.detail}</p>
            {section === 'settings' && (
              <div className="settings-account-summary">
                <span><UserRound aria-hidden="true" size={17} /></span>
                <div>
                  <strong>{user?.displayName ?? 'Signed-in account'}</strong>
                  <p>{user?.email ?? 'Account information unavailable'}</p>
                  <small>Session authentication uses a secure, HTTP-only cookie.</small>
                </div>
              </div>
            )}
            {logoutError && (
              <p className="mt-4 inline-flex items-start gap-2 text-sm text-emergency-700" role="alert">
                <AlertCircle aria-hidden="true" className="mt-0.5 shrink-0" size={16} />{logoutError}
              </p>
            )}
            <div className="mt-5 flex flex-wrap gap-3">
              {section === 'settings' ? (
                <>
                  <Link className="glass-button glass-button-primary inline-flex" to="/dashboard/profile">
                    <UserRound aria-hidden="true" size={15} /> Edit profile
                  </Link>
                  <button
                    className="glass-button inline-flex"
                    disabled={signingOut}
                    onClick={() => void handleSignOut()}
                    type="button"
                  >
                    <LogOut aria-hidden="true" size={15} />
                    {signingOut ? 'Signing out…' : 'Sign out'}
                  </button>
                </>
              ) : (
                <Link className="glass-button inline-flex" to="/dashboard/hospitals">
                  Browse published hospitals <ArrowRight aria-hidden="true" size={15} />
                </Link>
              )}
              {section === 'ambulance' && (
                <Link className="glass-button glass-button-emergency inline-flex" to="/dashboard/emergency">Emergency information</Link>
              )}
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}
