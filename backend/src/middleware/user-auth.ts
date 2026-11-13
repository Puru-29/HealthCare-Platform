import { timingSafeEqual } from 'node:crypto'
import type { RequestHandler } from 'express'
import { config } from '../config/env.js'
import { AppError } from '../errors/app-error.js'
import {
  readUserSession,
  userCsrfCookieName,
  userSessionCookieName,
} from '../services/user-auth.service.js'

export interface UserAuthLocals {
  user: {
    id: string
    displayName: string
    email: string
  }
  sessionTokenHash: string
}

function readCookie(requestHeader: string | undefined, name: string): string | undefined {
  for (const part of requestHeader?.split(';') ?? []) {
    const separator = part.indexOf('=')
    if (separator < 0 || part.slice(0, separator).trim() !== name) continue
    try {
      return decodeURIComponent(part.slice(separator + 1).trim())
    } catch {
      return undefined
    }
  }
  return undefined
}

export const requireUserSession: RequestHandler = async (request, response, next) => {
  const sessionToken = readCookie(request.headers.cookie, userSessionCookieName)
  const csrfToken = readCookie(request.headers.cookie, userCsrfCookieName)
  const session = await readUserSession(sessionToken, csrfToken)
  if (!session) {
    next(new AppError(401, 'AUTH_REQUIRED', 'Sign in to access your account.'))
    return
  }

  response.locals.user = session.user
  response.locals.sessionTokenHash = session.sessionTokenHash
  next()
}

export const requireAuthOrigin: RequestHandler = (request, _response, next) => {
  if (!config.frontendOrigins.includes(request.get('origin') ?? '')) {
    next(new AppError(403, 'AUTH_ORIGIN_REJECTED', 'Request origin is not allowed.'))
    return
  }
  next()
}

export const requireAuthCsrf: RequestHandler = (request, response, next) => {
  const cookieToken = readCookie(request.headers.cookie, userCsrfCookieName)
  const headerToken = request.get('x-carepath-csrf')
  const expected = Buffer.from(cookieToken ?? '')
  const actual = Buffer.from(headerToken ?? '')
  if (
    !cookieToken ||
    !headerToken ||
    expected.length !== actual.length ||
    !timingSafeEqual(expected, actual)
  ) {
    next(new AppError(403, 'CSRF_REJECTED', 'The request could not be verified.'))
    return
  }
  next()
}
