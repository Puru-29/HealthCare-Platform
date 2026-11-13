import { useEffect, useRef, useState } from 'react'

interface GoogleCredentialResponse {
  credential?: string
}

interface GoogleButtonOptions {
  theme: 'outline'
  size: 'large'
  text: 'continue_with'
  shape: 'pill'
  logo_alignment: 'left'
  width: number
}

interface GoogleIdentityServices {
  accounts: {
    id: {
      initialize(options: {
        client_id: string
        callback(response: GoogleCredentialResponse): void
      }): void
      renderButton(element: HTMLElement, options: GoogleButtonOptions): void
    }
  }
}

declare global {
  interface Window {
    google?: GoogleIdentityServices
  }
}

interface GoogleSignInButtonProps {
  disabled: boolean
  onCredential(credential: string): Promise<void>
}

const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID?.trim()

export function GoogleSignInButton({ disabled, onCredential }: GoogleSignInButtonProps) {
  const buttonRef = useRef<HTMLDivElement>(null)
  const credentialHandler = useRef(onCredential)
  const [unavailable, setUnavailable] = useState(!clientId)

  useEffect(() => {
    credentialHandler.current = onCredential
  }, [onCredential])

  useEffect(() => {
    const container = buttonRef.current
    if (!container || !clientId) {
      return
    }

    const renderGoogleButton = () => {
      if (!window.google) return
      window.google.accounts.id.initialize({
        client_id: clientId,
        callback: (response) => {
          if (response.credential) {
            void credentialHandler.current(response.credential)
          } else {
            setUnavailable(true)
          }
        },
      })
      container.replaceChildren()
      window.google.accounts.id.renderButton(container, {
        theme: 'outline',
        size: 'large',
        text: 'continue_with',
        shape: 'pill',
        logo_alignment: 'left',
        width: Math.min(400, Math.max(200, Math.floor(container.getBoundingClientRect().width))),
      })
    }

    if (window.google) {
      renderGoogleButton()
      return
    }

    let script = document.querySelector<HTMLScriptElement>('#google-identity-services')
    if (!script) {
      script = document.createElement('script')
      script.id = 'google-identity-services'
      script.src = 'https://accounts.google.com/gsi/client'
      script.async = true
      script.defer = true
    }
    const handleScriptError = () => setUnavailable(true)
    script.addEventListener('load', renderGoogleButton)
    script.addEventListener('error', handleScriptError, { once: true })
    if (!script.isConnected) document.head.append(script)
    return () => {
      script.removeEventListener('load', renderGoogleButton)
      script.removeEventListener('error', handleScriptError)
    }
  }, [])

  return (
    <div aria-busy={disabled} className={`google-signin${disabled ? ' is-disabled' : ''}`}>
      {unavailable
        ? (
          <button className="google-signin-fallback" disabled type="button">
            <span aria-hidden="true" className="google-signin-mark">G</span>
            Continue with Google
          </button>
        )
        : <div aria-label="Continue with Google" ref={buttonRef} />}
      {unavailable && !clientId && (
        <p className="google-signin-note">Google sign-in needs VITE_GOOGLE_CLIENT_ID to be configured.</p>
      )}
      {unavailable && clientId && (
        <p className="google-signin-note">Google sign-in could not load. Please try again later.</p>
      )}
    </div>
  )
}
