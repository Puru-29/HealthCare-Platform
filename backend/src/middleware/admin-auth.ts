import type { RequestHandler } from 'express'
import { config } from '../config/env.js'
import { timingSafeEqual } from 'node:crypto'
import { AppError } from '../errors/app-error.js'
import {
  adminSessionCookieName,
  readAdminSession,
} from '../services/admin-auth.service.js'

export interface AdminLocals {
  admin: {
    username: string
    csrfToken: string
  }
}

function getCookie(requestHeader: string | undefined, name: string): string | undefined {
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

export const requireAdminSession: RequestHandler = (request, response, next) => {
  const session = readAdminSession(getCookie(request.headers.cookie, adminSessionCookieName))
  if (!session) {
    next(new AppError(401, 'ADMIN_AUTH_REQUIRED', 'Sign in with an administrator account.'))
    return
  }
  response.locals.admin = {
    username: session.username,
    csrfToken: session.csrfToken,
  }
  next()
}

export const requireAdminCsrf: RequestHandler = (request, response, _next) => {
  const origin = request.get('origin')
  const token = request.get('x-carepath-csrf')
  const session = response.locals.admin as AdminLocals['admin'] | undefined

  if (
    !config.frontendOrigins.includes(origin ?? '')
  ) {
    throw new AppError(403, 'CSRF_REJECTED', 'Request origin is not allowed.')
  }
  const expectedToken = Buffer.from(session?.csrfToken ?? '')
  const actualToken = Buffer.from(token ?? '')
  if (
    !session ||
    expectedToken.length !== actualToken.length ||
    !timingSafeEqual(expectedToken, actualToken)
  ) {
    throw new AppError(403, 'CSRF_REJECTED', 'The request could not be verified.')
  }
}
