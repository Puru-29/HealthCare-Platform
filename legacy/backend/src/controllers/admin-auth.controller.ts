import type { RequestHandler } from 'express'
import { z } from 'zod'
import { config } from '../config/env.js'
import { AppError } from '../errors/app-error.js'
import {
  adminSessionCookieName,
  adminSessionMaxAgeSeconds,
  createAdminSession,
  verifyAdminPassword,
} from '../services/admin-auth.service.js'
import type { AdminLocals } from '../middleware/admin-auth.js'

const loginSchema = z.object({
  username: z.string().min(1).max(100),
  password: z.string().min(1).max(200),
}).strict()

function cookieOptions(): string {
  const secure = config.nodeEnv === 'production' ? '; Secure' : ''
  return `Path=/api/admin; HttpOnly; SameSite=Strict; Max-Age=${adminSessionMaxAgeSeconds}${secure}`
}

function clearCookieOptions(): string {
  const secure = config.nodeEnv === 'production' ? '; Secure' : ''
  return `Path=/api/admin; HttpOnly; SameSite=Strict; Max-Age=0${secure}`
}

export const loginAdmin: RequestHandler = async (request, response) => {
  if (!config.admin.configured) {
    throw new AppError(503, 'ADMIN_AUTH_UNCONFIGURED', 'Administrator access is not configured.')
  }

  const credentials = loginSchema.safeParse(request.body)
  if (!credentials.success) {
    throw new AppError(400, 'INVALID_CREDENTIALS', 'Enter a valid administrator username and password.')
  }

  const authenticated = await verifyAdminPassword(
    credentials.data.username,
    credentials.data.password,
  )
  if (!authenticated) {
    throw new AppError(401, 'INVALID_CREDENTIALS', 'Administrator credentials were not accepted.')
  }

  const { session, token } = createAdminSession(credentials.data.username)
  response.setHeader('Set-Cookie', `${adminSessionCookieName}=${token}; ${cookieOptions()}`)
  response.status(200).json({
    authenticated: true,
    username: session.username,
    csrfToken: session.csrfToken,
    expiresAt: session.expiresAt,
  })
}

export const getAdminSession: RequestHandler = (_request, response) => {
  const admin = response.locals.admin as AdminLocals['admin']
  response.status(200).json({
    authenticated: true,
    username: admin.username,
    csrfToken: admin.csrfToken,
  })
}

export const logoutAdmin: RequestHandler = (_request, response) => {
  response.setHeader('Set-Cookie', `${adminSessionCookieName}=; ${clearCookieOptions()}`)
  response.status(200).json({ authenticated: false })
}
