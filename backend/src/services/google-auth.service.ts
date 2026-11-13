import { OAuth2Client } from 'google-auth-library'
import { config } from '../config/env.js'
import { AppError } from '../errors/app-error.js'

const googleClient = new OAuth2Client()

export interface VerifiedGoogleIdentity {
  subject: string
  email: string
  displayName: string
}

export async function verifyGoogleIdToken(idToken: string): Promise<VerifiedGoogleIdentity> {
  if (!config.googleClientId) {
    throw new AppError(503, 'GOOGLE_SIGN_IN_UNAVAILABLE', 'Google sign-in is not configured.')
  }

  let payload
  try {
    const ticket = await googleClient.verifyIdToken({
      idToken,
      audience: config.googleClientId,
    })
    payload = ticket.getPayload()
  } catch {
    throw new AppError(401, 'INVALID_GOOGLE_TOKEN', 'Google could not verify this sign-in. Please try again.')
  }

  const email = payload?.email?.trim()
  const displayName = payload?.name?.trim() || payload?.given_name?.trim() || email?.split('@')[0]
  if (
    !payload?.sub ||
    payload.sub.length > 255 ||
    !email ||
    email.length > 254 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
    payload.email_verified !== true ||
    !displayName ||
    displayName.length > 120
  ) {
    throw new AppError(401, 'INVALID_GOOGLE_ACCOUNT', 'Use a Google account with a verified email address.')
  }

  return {
    subject: payload.sub,
    email,
    displayName,
  }
}
