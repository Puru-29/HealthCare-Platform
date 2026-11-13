import type { RequestHandler } from 'express'
import { z } from 'zod'
import { config } from '../config/env.js'
import { AppError } from '../errors/app-error.js'
import type { UserAuthLocals } from '../middleware/user-auth.js'
import {
  loginUser,
  loginOrRegisterGoogleUser,
  logoutUser,
  registerUser,
  updateUserProfile,
  userCsrfCookieName,
  userSessionCookieName,
  userSessionMaxAgeSeconds,
} from '../services/user-auth.service.js'
import { verifyGoogleIdToken } from '../services/google-auth.service.js'

const accountSchema = z.object({
  email: z.string().trim().email().max(254).transform((value) => value.toLocaleLowerCase('en')),
  password: z.string().min(8).max(128),
}).strict()

const registrationSchema = accountSchema.extend({
  displayName: z.string().trim().min(1).max(120),
}).strict()

const googleSignInSchema = z.object({
  credential: z.string().min(1).max(8192),
}).strict()

const profileSchema = z.object({
  displayName: z.string().trim().min(1).max(120),
  email: z.string().trim().email().max(254).transform((value) => value.toLocaleLowerCase('en')),
}).strict()

function cookieOptions(path: string, httpOnly: boolean): string {
  const secure = config.nodeEnv === 'production' ? '; Secure' : ''
  return `Path=${path}; SameSite=Strict; Max-Age=${userSessionMaxAgeSeconds}${httpOnly ? '; HttpOnly' : ''}${secure}`
}

function clearCookieOptions(path: string, httpOnly: boolean): string {
  const secure = config.nodeEnv === 'production' ? '; Secure' : ''
  return `Path=${path}; SameSite=Strict; Max-Age=0${httpOnly ? '; HttpOnly' : ''}${secure}`
}

function setSessionCookies(
  response: Parameters<RequestHandler>[1],
  sessionToken: string,
  csrfToken: string,
): void {
  response.setHeader('Set-Cookie', [
    `${userSessionCookieName}=${encodeURIComponent(sessionToken)}; ${cookieOptions('/api/auth', true)}`,
    `${userCsrfCookieName}=${encodeURIComponent(csrfToken)}; ${cookieOptions('/', false)}`,
  ])
}

function clearSessionCookies(response: Parameters<RequestHandler>[1]): void {
  response.setHeader('Set-Cookie', [
    `${userSessionCookieName}=; ${clearCookieOptions('/api/auth', true)}`,
    `${userCsrfCookieName}=; ${clearCookieOptions('/', false)}`,
  ])
}

export const register: RequestHandler = async (request, response) => {
  const parsed = registrationSchema.safeParse(request.body)
  if (!parsed.success) {
    throw new AppError(400, 'INVALID_REGISTRATION', 'Enter a name, valid email, and a password with at least 8 characters, such as Puru2923.')
  }

  const session = await registerUser(
    parsed.data.displayName,
    parsed.data.email,
    parsed.data.password,
  )
  setSessionCookies(response, session.sessionToken, session.csrfToken)
  response.setHeader('Cache-Control', 'no-store')
  response.status(201).json({ authenticated: true, user: session.user })
}

export const login: RequestHandler = async (request, response) => {
  const parsed = accountSchema.safeParse(request.body)
  if (!parsed.success) {
    throw new AppError(400, 'INVALID_LOGIN_INPUT', 'Enter a valid email and password.')
  }

  const session = await loginUser(parsed.data.email, parsed.data.password)
  setSessionCookies(response, session.sessionToken, session.csrfToken)
  response.setHeader('Cache-Control', 'no-store')
  response.status(200).json({ authenticated: true, user: session.user })
}

export const googleLogin: RequestHandler = async (request, response) => {
  const parsed = googleSignInSchema.safeParse(request.body)
  if (!parsed.success) {
    throw new AppError(400, 'INVALID_GOOGLE_CREDENTIAL', 'A valid Google sign-in credential is required.')
  }

  const identity = await verifyGoogleIdToken(parsed.data.credential)
  const session = await loginOrRegisterGoogleUser(identity)
  setSessionCookies(response, session.sessionToken, session.csrfToken)
  response.setHeader('Cache-Control', 'no-store')
  response.status(200).json({ authenticated: true, user: session.user })
}

export const getSession: RequestHandler = (_request, response) => {
  const auth = response.locals as UserAuthLocals
  response.setHeader('Cache-Control', 'no-store')
  response.status(200).json({
    authenticated: true,
    user: auth.user,
  })
}

export const updateProfile: RequestHandler = async (request, response) => {
  const parsed = profileSchema.safeParse(request.body)
  if (!parsed.success) {
    throw new AppError(400, 'INVALID_PROFILE', 'Enter a name and a valid email address.')
  }
  const auth = response.locals as UserAuthLocals
  const user = await updateUserProfile(
    auth.user.id,
    parsed.data.displayName,
    parsed.data.email,
  )
  response.setHeader('Cache-Control', 'no-store')
  response.status(200).json({ authenticated: true, user })
}

export const logout: RequestHandler = async (_request, response) => {
  const auth = response.locals as UserAuthLocals
  await logoutUser(auth.user.id, auth.sessionTokenHash)
  clearSessionCookies(response)
  response.setHeader('Cache-Control', 'no-store')
  response.status(200).json({ authenticated: false })
}
