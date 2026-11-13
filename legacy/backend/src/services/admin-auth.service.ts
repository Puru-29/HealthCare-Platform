import { createHmac, randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto'
import { config } from '../config/env.js'

const sessionLifetimeSeconds = 4 * 60 * 60

function deriveScrypt(password: string, salt: Buffer, keyLength: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCallback(password, salt, keyLength, {
      N: 16_384,
      r: 8,
      p: 1,
      maxmem: 64 * 1024 * 1024,
    }, (error, derived) => {
      if (error) reject(error)
      else resolve(derived)
    })
  })
}

export interface AdminSession {
  username: string
  csrfToken: string
  expiresAt: number
}

function isAdminConfigured(): boolean {
  const hash = config.admin.passwordHash ?? ''
  const secret = config.admin.sessionSecret ?? ''
  return (
    Boolean(config.admin.username) &&
    /^scrypt\$[A-Za-z0-9_-]{20,}\$[A-Za-z0-9_-]{80,}$/.test(hash) &&
    Buffer.from(secret, 'base64url').length >= 32
  )
}

export async function verifyAdminPassword(username: string, password: string): Promise<boolean> {
  if (!isAdminConfigured() || username !== config.admin.username) {
    return false
  }

  const [, salt, expectedHash] = config.admin.passwordHash!.split('$')
  if (!salt || !expectedHash) return false

  const derived = await deriveScrypt(password, Buffer.from(salt, 'base64url'), 64)
  const expected = Buffer.from(expectedHash, 'base64url')
  return expected.length === derived.length && timingSafeEqual(expected, derived)
}

export function createAdminSession(username: string): { session: AdminSession; token: string } {
  const session: AdminSession = {
    username,
    csrfToken: randomBytes(32).toString('base64url'),
    expiresAt: Math.floor(Date.now() / 1000) + sessionLifetimeSeconds,
  }
  const payload = Buffer.from(JSON.stringify(session)).toString('base64url')
  const signature = createHmac('sha256', config.admin.sessionSecret!)
    .update(payload)
    .digest('base64url')
  return { session, token: `${payload}.${signature}` }
}

export function readAdminSession(token: string | undefined): AdminSession | null {
  if (!token || !isAdminConfigured()) return null
  const [payload, signature, extra] = token.split('.')
  if (!payload || !signature || extra !== undefined) return null

  const expectedSignature = createHmac('sha256', config.admin.sessionSecret!)
    .update(payload)
    .digest()
  let actualSignature: Buffer
  try {
    actualSignature = Buffer.from(signature, 'base64url')
  } catch {
    return null
  }
  if (
    actualSignature.length !== expectedSignature.length ||
    !timingSafeEqual(actualSignature, expectedSignature)
  ) {
    return null
  }

  try {
    const session = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as AdminSession
    if (
      typeof session.username !== 'string' ||
      session.username !== config.admin.username ||
      typeof session.csrfToken !== 'string' ||
      typeof session.expiresAt !== 'number' ||
      session.expiresAt <= Math.floor(Date.now() / 1000)
    ) {
      return null
    }
    return session
  } catch {
    return null
  }
}

export const adminSessionCookieName = 'carepath_admin_session'
export const adminSessionMaxAgeSeconds = sessionLifetimeSeconds
