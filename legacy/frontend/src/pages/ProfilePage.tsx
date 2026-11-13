import { useState, type FormEvent } from 'react'
import { PageIntro } from '../components/PageIntro'
import { ApiError, updateUserProfile } from '../api/client'
import { useAuth } from '../auth/useAuth'

export function ProfilePage() {
  const { user, acceptUser } = useAuth()
  const [displayName, setDisplayName] = useState(user?.displayName ?? '')
  const [email, setEmail] = useState(user?.email ?? '')
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)
  const [saving, setSaving] = useState(false)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    setSaved(false)
    setSaving(true)
    try {
      const session = await updateUserProfile({ displayName, email })
      acceptUser(session.user)
      setDisplayName(session.user.displayName)
      setEmail(session.user.email)
      setSaved(true)
    } catch (cause) {
      setError(cause instanceof ApiError && cause.code === 'EMAIL_ALREADY_REGISTERED'
        ? 'That email address is already associated with another account.'
        : cause instanceof Error ? cause.message : 'Your profile could not be updated.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-5">
      <PageIntro
        description="Update your basic account details. CarePath does not collect medical history on this profile."
        eyebrow="Account"
        title="Profile"
      />
      <form className="glass-card max-w-2xl space-y-4 p-5 sm:p-7" onSubmit={submit}>
        <label className="block text-sm font-medium text-ink-800">
          Name
          <input
            autoComplete="name"
            className="mt-1.5 min-h-12 w-full rounded-xl border border-forest-900/15 bg-white/75 px-4"
            maxLength={120}
            minLength={1}
            onChange={(event) => setDisplayName(event.target.value)}
            required
            value={displayName}
          />
        </label>
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
          <span className="mt-1 block text-xs font-normal text-ink-600">
            Email ownership verification is not available; use an address you control.
          </span>
        </label>
        {error && <p className="text-sm text-emergency-700" role="alert">{error}</p>}
        {saved && <p className="text-sm font-medium text-forest-800" role="status">Profile updated.</p>}
        <button className="glass-button glass-button-primary" disabled={saving} type="submit">
          {saving ? 'Saving…' : 'Save profile'}
        </button>
      </form>
    </div>
  )
}
