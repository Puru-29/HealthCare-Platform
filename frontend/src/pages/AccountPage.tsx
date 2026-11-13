import { useState, type FormEvent } from 'react'
import { ArrowLeft, Eye, EyeOff, HeartPulse, LockKeyhole } from 'lucide-react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { ApiError, loginUser, loginWithGoogle, registerUser } from '../api/client'
import { useAuth } from '../auth/useAuth'
import { GoogleSignInButton } from '../components/GoogleSignInButton'

type AccountPageProps = {
  mode: 'login' | 'register'
}

export function AccountPage({ mode }: AccountPageProps) {
  const navigate = useNavigate()
  const location = useLocation()
  const { status, acceptUser } = useAuth()
  const [displayName, setDisplayName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [passwordVisible, setPasswordVisible] = useState(false)
  const [confirmPasswordVisible, setConfirmPasswordVisible] = useState(false)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const isRegister = mode === 'register'

  function getDestination() {
    return location.state &&
      typeof location.state === 'object' &&
      'from' in location.state &&
      location.state.from &&
      typeof location.state.from === 'object' &&
      'pathname' in location.state.from &&
      typeof location.state.from.pathname === 'string'
      ? location.state.from.pathname
      : '/dashboard'
  }

  function completeSignIn(session: Awaited<ReturnType<typeof loginUser>>) {
    acceptUser(session.user)
    navigate(getDestination(), { replace: true })
  }

  if (status === 'authenticated') {
    return <Navigate replace to="/dashboard" />
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    if (isRegister && password !== confirmPassword) {
      setError('The passwords do not match.')
      return
    }

    setSubmitting(true)
    try {
      const session = isRegister
        ? await registerUser({ displayName, email, password })
        : await loginUser({ email, password })
      completeSignIn(session)
    } catch (cause) {
      setError(
        cause instanceof ApiError && cause.code === 'DATABASE_SCHEMA_UNAVAILABLE'
          ? 'Account sign-in is unavailable until the authentication database migration is applied.'
          : cause instanceof Error ? cause.message : 'Your request could not be completed.',
      )
    } finally {
      setSubmitting(false)
    }
  }

  async function submitGoogleCredential(credential: string) {
    setError('')
    setSubmitting(true)
    try {
      const session = await loginWithGoogle(credential)
      completeSignIn(session)
    } catch (cause) {
      setError(
        cause instanceof ApiError && cause.code === 'DATABASE_SCHEMA_UNAVAILABLE'
          ? 'Google sign-in is unavailable until the authentication database migration is applied.'
          : cause instanceof Error ? cause.message : 'Google sign-in could not be completed.',
      )
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="auth-page">
      <div aria-hidden="true" className="auth-glow" />
      <div className="auth-layout">
        <section className="auth-story">
          <Link aria-label="CarePath home" className="site-brand auth-story-brand" to="/">
            <span className="site-brand-mark"><HeartPulse aria-hidden="true" size={20} /></span>
            <span>carepath</span>
          </Link>
          <p className="landing-eyebrow"><span className="landing-live-dot" />Care, with more clarity</p>
          <h1>Make your next step a little clearer.</h1>
          <p className="auth-story-description">
            Explore published hospital listings, discover verified doctor profiles when available,
            and keep your basic CarePath account details together.
          </p>
          <div className="auth-story-points">
            <div><span className="auth-story-point-icon"><HeartPulse aria-hidden="true" size={17} /></span><span><strong>Helpful starting points</strong><small>Explore available care information</small></span></div>
            <div><span className="auth-story-point-icon"><LockKeyhole aria-hidden="true" size={17} /></span><span><strong>Basic account details</strong><small>No medical records on your profile</small></span></div>
          </div>
          <p className="auth-story-disclaimer">CarePath is a directory and navigation aid, not a medical provider or emergency service.</p>
        </section>

        <section className="glass-card auth-card">
        <Link
          className="inline-flex min-h-10 items-center gap-2 text-sm font-medium text-ink-600 hover:text-forest-800"
          to="/"
        >
          <ArrowLeft aria-hidden="true" size={16} />
          Return to CarePath
        </Link>
        <div className="mt-8 flex items-center gap-3">
          <span className="grid size-11 place-items-center rounded-2xl bg-forest-900 text-white">
            <HeartPulse aria-hidden="true" size={22} />
          </span>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.15em] text-forest-700">
              Your CarePath account
            </p>
            <h1 className="text-2xl font-semibold tracking-tight text-forest-950">
              {isRegister ? 'Create account' : 'Sign in'}
            </h1>
          </div>
        </div>
        <p className="mt-4 text-sm leading-6 text-ink-600">
          Your account stores basic profile and sign-in information only. Do not enter medical
          records or emergency details.
        </p>
        <form className="mt-7 space-y-4" onSubmit={submit}>
          {isRegister && (
            <label className="block text-sm font-medium text-ink-800">
              Name
              <input
                autoComplete="name"
                className="mt-1.5 min-h-12 w-full rounded-xl border border-forest-900/15 bg-white/75 px-4"
                maxLength={120}
                onChange={(event) => setDisplayName(event.target.value)}
                required
                value={displayName}
              />
            </label>
          )}
          <label className="block text-sm font-medium text-ink-800">
            Email
            <input
              autoComplete="email"
              className="mt-1.5 min-h-12 w-full rounded-xl border border-forest-900/15 bg-white/75 px-4"
              maxLength={254}
              onChange={(event) => setEmail(event.target.value)}
              required
              type="email"
              value={email}
            />
          </label>
          <div className="block text-sm font-medium text-ink-800">
            <label htmlFor="account-password">Password</label>
            <span className="auth-password-field">
              <input
                autoComplete={isRegister ? 'new-password' : 'current-password'}
                id="account-password"
                maxLength={128}
                minLength={8}
                onChange={(event) => setPassword(event.target.value)}
                required
                type={passwordVisible ? 'text' : 'password'}
                value={password}
              />
              <button
                aria-label={passwordVisible ? 'Hide password' : 'Show password'}
                aria-pressed={passwordVisible}
                className="auth-password-toggle"
                onClick={() => setPasswordVisible((visible) => !visible)}
                type="button"
              >
                {passwordVisible
                  ? <EyeOff aria-hidden="true" size={17} />
                  : <Eye aria-hidden="true" size={17} />}
              </button>
            </span>
            {isRegister && (
              <span className="mt-1 block text-xs font-normal text-ink-600">
                Use at least 8 characters. Passwords are never stored as plain text.
              </span>
            )}
          </div>
          {isRegister && (
            <div className="block text-sm font-medium text-ink-800">
              <label htmlFor="confirm-password">Confirm password</label>
              <span className="auth-password-field">
                <input
                  autoComplete="new-password"
                  id="confirm-password"
                  maxLength={128}
                  minLength={8}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  required
                  type={confirmPasswordVisible ? 'text' : 'password'}
                  value={confirmPassword}
                />
                <button
                  aria-label={confirmPasswordVisible ? 'Hide confirmation password' : 'Show confirmation password'}
                  aria-pressed={confirmPasswordVisible}
                  className="auth-password-toggle"
                  onClick={() => setConfirmPasswordVisible((visible) => !visible)}
                  type="button"
                >
                  {confirmPasswordVisible
                    ? <EyeOff aria-hidden="true" size={17} />
                    : <Eye aria-hidden="true" size={17} />}
                </button>
              </span>
            </div>
          )}
          <p className="text-xs leading-5 text-ink-600">
            Email ownership verification and password recovery are not available because no email
            service is connected.
          </p>
          {error && (
            <p className="auth-feedback auth-feedback--error" role="alert">
              {error}
            </p>
          )}
          <button
            className="glass-button glass-button-primary inline-flex w-full disabled:cursor-not-allowed disabled:opacity-60"
            disabled={submitting || status === 'loading'}
            type="submit"
          >
            <LockKeyhole aria-hidden="true" size={16} />
            {submitting ? 'Please wait…' : isRegister ? 'Create account' : 'Sign in securely'}
          </button>
        </form>
        <div className="google-signin-divider"><span>or continue with</span></div>
        <GoogleSignInButton
          disabled={submitting || status === 'loading'}
          onCredential={submitGoogleCredential}
        />
        <p className="mt-5 text-center text-sm text-ink-600">
          {isRegister ? 'Already have an account?' : 'New to CarePath?'}{' '}
          <Link
            className="font-semibold text-forest-800 underline underline-offset-4"
            to={isRegister ? '/login' : '/register'}
          >
            {isRegister ? 'Sign in' : 'Create an account'}
          </Link>
        </p>
      </section>
      </div>
    </div>
  )
}
