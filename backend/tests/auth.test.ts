import request from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  loginUser: vi.fn(),
  loginOrRegisterGoogleUser: vi.fn(),
  logoutUser: vi.fn(),
  readUserSession: vi.fn(),
  registerUser: vi.fn(),
  verifyGoogleIdToken: vi.fn(),
  updateUserProfile: vi.fn(),
}))

vi.mock('../src/services/user-auth.service.js', () => ({
  loginUser: mocks.loginUser,
  loginOrRegisterGoogleUser: mocks.loginOrRegisterGoogleUser,
  logoutUser: mocks.logoutUser,
  readUserSession: mocks.readUserSession,
  registerUser: mocks.registerUser,
  updateUserProfile: mocks.updateUserProfile,
  userCsrfCookieName: 'carepath_user_csrf',
  userSessionCookieName: 'carepath_user_session',
  userSessionMaxAgeSeconds: 43200,
}))

vi.mock('../src/services/google-auth.service.js', () => ({
  verifyGoogleIdToken: mocks.verifyGoogleIdToken,
}))

import { app } from '../src/app.js'
import { AppError } from '../src/errors/app-error.js'

const frontendOrigin = 'http://127.0.0.1:5174'
const user = {
  id: '00000000-0000-4000-8000-000000000001',
  displayName: 'Test User',
  email: 'test@example.test',
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.logoutUser.mockResolvedValue(undefined)
  mocks.readUserSession.mockResolvedValue(null)
})

describe('user authentication API', () => {
  it('validates registration and enforces the configured browser origin', async () => {
    const invalid = await request(app)
      .post('/api/auth/register')
      .set('Origin', frontendOrigin)
      .send({ displayName: 'User', email: 'invalid', password: 'short' })
    const tooShortPassword = await request(app)
      .post('/api/auth/register')
      .set('Origin', frontendOrigin)
      .send({ displayName: 'User', email: 'user@example.test', password: 'Puru292' })
    const rejectedOrigin = await request(app)
      .post('/api/auth/register')
      .set('Origin', 'https://untrusted.example')
      .send({ displayName: 'User', email: 'user@example.test', password: 'long-enough-password' })

    expect(invalid.status).toBe(400)
    expect(invalid.body.error.code).toBe('INVALID_REGISTRATION')
    expect(tooShortPassword.status).toBe(400)
    expect(tooShortPassword.body.error.code).toBe('INVALID_REGISTRATION')
    expect(rejectedOrigin.status).toBe(403)
    expect(rejectedOrigin.body.error.code).toBe('AUTH_ORIGIN_REJECTED')
    expect(mocks.registerUser).not.toHaveBeenCalled()
  })

  it('creates a cookie-backed authenticated session without returning the session token', async () => {
    mocks.registerUser.mockResolvedValue({
      user,
      sessionToken: 'secret-session-token',
      csrfToken: 'csrf-token-value',
    })
    const response = await request(app)
      .post('/api/auth/register')
      .set('Origin', frontendOrigin)
      .send({
        displayName: 'Test User',
        email: 'TEST@example.test',
        password: 'Puru2923',
      })

    expect(response.status).toBe(201)
    expect(response.body).toEqual({ authenticated: true, user })
    expect(JSON.stringify(response.body)).not.toContain('secret-session-token')
    expect(response.headers['set-cookie']).toEqual(expect.arrayContaining([
      expect.stringContaining('carepath_user_session=secret-session-token'),
      expect.stringContaining('carepath_user_csrf=csrf-token-value'),
      expect.stringContaining('HttpOnly'),
      expect.stringContaining('SameSite=Strict'),
    ]))
    expect(mocks.registerUser).toHaveBeenCalledWith(
      'Test User',
      'test@example.test',
      'Puru2923',
    )
  })

  it('creates a cookie-backed session after a valid login', async () => {
    mocks.loginUser.mockResolvedValue({
      user,
      sessionToken: 'login-session-token',
      csrfToken: 'login-csrf-token',
    })
    const response = await request(app)
      .post('/api/auth/login')
      .set('Origin', frontendOrigin)
      .send({ email: 'TEST@example.test', password: 'long-enough-password' })

    expect(response.status).toBe(200)
    expect(response.body).toEqual({ authenticated: true, user })
    expect(response.headers['set-cookie']).toEqual(expect.arrayContaining([
      expect.stringContaining('carepath_user_session=login-session-token'),
      expect.stringContaining('carepath_user_csrf=login-csrf-token'),
    ]))
    expect(mocks.loginUser).toHaveBeenCalledWith(
      'test@example.test',
      'long-enough-password',
    )
  })

  it('creates a Google-backed account session and preserves session restore and logout', async () => {
    const identity = {
      subject: 'google-subject-123',
      email: 'google@example.test',
      displayName: 'Google User',
    }
    mocks.verifyGoogleIdToken.mockResolvedValue(identity)
    mocks.loginOrRegisterGoogleUser.mockResolvedValue({
      user,
      sessionToken: 'google-session-token',
      csrfToken: 'google-csrf-token',
    })
    mocks.readUserSession.mockResolvedValue({ user, sessionTokenHash: 'google-session-hash' })
    const signedIn = await request(app)
      .post('/api/auth/google')
      .set('Origin', frontendOrigin)
      .send({ credential: 'verified-google-id-token' })

    expect(signedIn.status).toBe(200)
    expect(signedIn.body).toEqual({ authenticated: true, user })
    expect(mocks.verifyGoogleIdToken).toHaveBeenCalledWith('verified-google-id-token')
    expect(mocks.loginOrRegisterGoogleUser).toHaveBeenCalledWith(identity)
    expect(signedIn.headers['set-cookie']).toEqual(expect.arrayContaining([
      expect.stringContaining('carepath_user_session=google-session-token'),
      expect.stringContaining('carepath_user_csrf=google-csrf-token'),
      expect.stringContaining('HttpOnly'),
      expect.stringContaining('SameSite=Strict'),
    ]))

    const cookie = 'carepath_user_session=google-session-token; carepath_user_csrf=google-csrf-token'
    const restored = await request(app).get('/api/auth/session').set('Cookie', cookie)
    const loggedOut = await request(app)
      .post('/api/auth/logout')
      .set('Origin', frontendOrigin)
      .set('Cookie', cookie)
      .set('X-Carepath-CSRF', 'google-csrf-token')

    expect(restored.status).toBe(200)
    expect(restored.body).toEqual({ authenticated: true, user })
    expect(loggedOut.status).toBe(200)
    expect(loggedOut.body).toEqual({ authenticated: false })
    expect(loggedOut.headers['set-cookie']).toEqual(expect.arrayContaining([
      expect.stringContaining('carepath_user_session=;'),
      expect.stringContaining('carepath_user_csrf=;'),
    ]))
    expect(mocks.logoutUser).toHaveBeenCalledWith(user.id, 'google-session-hash')
  })

  it('rejects an existing password account instead of automatically linking its email', async () => {
    mocks.verifyGoogleIdToken.mockResolvedValue({
      subject: 'unlinked-google-subject',
      email: user.email,
      displayName: user.displayName,
    })
    mocks.loginOrRegisterGoogleUser.mockRejectedValue(
      new AppError(409, 'EMAIL_ALREADY_REGISTERED', 'Sign in with your password first.'),
    )
    const response = await request(app)
      .post('/api/auth/google')
      .set('Origin', frontendOrigin)
      .send({ credential: 'verified-google-id-token' })

    expect(response.status).toBe(409)
    expect(response.body.error.code).toBe('EMAIL_ALREADY_REGISTERED')
    expect(mocks.loginOrRegisterGoogleUser).toHaveBeenCalledOnce()
  })

  it('validates the Google credential and enforces the configured browser origin', async () => {
    const invalid = await request(app)
      .post('/api/auth/google')
      .set('Origin', frontendOrigin)
      .send({ credential: '' })
    const rejectedOrigin = await request(app)
      .post('/api/auth/google')
      .set('Origin', 'https://untrusted.example')
      .send({ credential: 'verified-google-id-token' })

    expect(invalid.status).toBe(400)
    expect(invalid.body.error.code).toBe('INVALID_GOOGLE_CREDENTIAL')
    expect(rejectedOrigin.status).toBe(403)
    expect(rejectedOrigin.body.error.code).toBe('AUTH_ORIGIN_REJECTED')
    expect(mocks.verifyGoogleIdToken).not.toHaveBeenCalled()
  })

  it('protects the profile endpoint and returns only the authenticated user profile', async () => {
    const anonymous = await request(app).get('/api/auth/session')
    mocks.readUserSession.mockResolvedValueOnce({ user, sessionTokenHash: 'hashed-token' })
    const authenticated = await request(app)
      .get('/api/auth/session')
      .set('Cookie', 'carepath_user_session=session; carepath_user_csrf=csrf')

    expect(anonymous.status).toBe(401)
    expect(anonymous.body.error.code).toBe('AUTH_REQUIRED')
    expect(authenticated.status).toBe(200)
    expect(authenticated.body).toEqual({ authenticated: true, user })
    expect(mocks.readUserSession).toHaveBeenCalledWith('session', 'csrf')
  })

  it('updates profile details only for an authenticated same-origin CSRF-verified session', async () => {
    const updatedUser = { ...user, displayName: 'Updated User', email: 'updated@example.test' }
    mocks.readUserSession.mockResolvedValue({
      user,
      sessionTokenHash: 'hashed-token',
    })
    mocks.updateUserProfile.mockResolvedValue(updatedUser)
    const rejected = await request(app)
      .patch('/api/auth/profile')
      .set('Origin', frontendOrigin)
      .set('Cookie', 'carepath_user_session=session; carepath_user_csrf=csrf')
      .set('X-Carepath-CSRF', 'wrong')
      .send({ displayName: 'Updated User', email: 'updated@example.test' })
    const response = await request(app)
      .patch('/api/auth/profile')
      .set('Origin', frontendOrigin)
      .set('Cookie', 'carepath_user_session=session; carepath_user_csrf=csrf')
      .set('X-Carepath-CSRF', 'csrf')
      .send({ displayName: 'Updated User', email: 'UPDATED@example.test' })

    expect(rejected.status).toBe(403)
    expect(rejected.body.error.code).toBe('CSRF_REJECTED')
    expect(response.status).toBe(200)
    expect(response.body).toEqual({ authenticated: true, user: updatedUser })
    expect(mocks.updateUserProfile).toHaveBeenCalledWith(
      user.id,
      'Updated User',
      'updated@example.test',
    )
  })

  it('requires a valid origin, authenticated session, and CSRF token to log out', async () => {
    mocks.readUserSession.mockResolvedValue({ user, sessionTokenHash: 'hashed-token' })
    const forbidden = await request(app)
      .post('/api/auth/logout')
      .set('Origin', frontendOrigin)
      .set('Cookie', 'carepath_user_session=session; carepath_user_csrf=csrf')
      .set('X-Carepath-CSRF', 'wrong')
    const response = await request(app)
      .post('/api/auth/logout')
      .set('Origin', frontendOrigin)
      .set('Cookie', 'carepath_user_session=session; carepath_user_csrf=csrf')
      .set('X-Carepath-CSRF', 'csrf')

    expect(forbidden.status).toBe(403)
    expect(forbidden.body.error.code).toBe('CSRF_REJECTED')
    expect(response.status).toBe(200)
    expect(response.body).toEqual({ authenticated: false })
    expect(response.headers['set-cookie']).toEqual(expect.arrayContaining([
      expect.stringContaining('carepath_user_session=;'),
      expect.stringContaining('carepath_user_csrf=;'),
      expect.stringContaining('Max-Age=0'),
    ]))
    expect(mocks.logoutUser).toHaveBeenCalledWith(user.id, 'hashed-token')
  })
})
