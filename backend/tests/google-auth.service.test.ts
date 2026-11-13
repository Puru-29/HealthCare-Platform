import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  verifyIdToken: vi.fn(),
}))

vi.mock('google-auth-library', () => ({
  OAuth2Client: class {
    verifyIdToken = mocks.verifyIdToken
  },
}))

describe('Google ID token verification', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.stubEnv('GOOGLE_CLIENT_ID', 'carepath-test.apps.googleusercontent.com')
    mocks.verifyIdToken.mockReset()
  })

  it('requires Google to verify the configured audience and verified email', async () => {
    mocks.verifyIdToken.mockResolvedValue({
      getPayload: () => ({
        sub: 'google-subject-123',
        email: 'person@example.test',
        email_verified: true,
        name: 'Test Person',
      }),
    })
    const { verifyGoogleIdToken } = await import('../src/services/google-auth.service.js')

    await expect(verifyGoogleIdToken('signed-google-id-token')).resolves.toEqual({
      subject: 'google-subject-123',
      email: 'person@example.test',
      displayName: 'Test Person',
    })
    expect(mocks.verifyIdToken).toHaveBeenCalledWith({
      idToken: 'signed-google-id-token',
      audience: 'carepath-test.apps.googleusercontent.com',
    })
  })

  it('rejects credentials without a verified Google email', async () => {
    mocks.verifyIdToken.mockResolvedValue({
      getPayload: () => ({
        sub: 'google-subject-123',
        email: 'person@example.test',
        email_verified: false,
        name: 'Test Person',
      }),
    })
    const { verifyGoogleIdToken } = await import('../src/services/google-auth.service.js')

    await expect(verifyGoogleIdToken('signed-google-id-token')).rejects.toMatchObject({
      code: 'INVALID_GOOGLE_ACCOUNT',
      statusCode: 401,
    })
  })

  it('rejects tokens Google cannot verify', async () => {
    mocks.verifyIdToken.mockRejectedValue(new Error('Invalid token signature'))
    const { verifyGoogleIdToken } = await import('../src/services/google-auth.service.js')

    await expect(verifyGoogleIdToken('invalid-google-id-token')).rejects.toMatchObject({
      code: 'INVALID_GOOGLE_TOKEN',
      statusCode: 401,
    })
  })

  it('fails closed when the server does not have a Google client ID', async () => {
    vi.stubEnv('GOOGLE_CLIENT_ID', '')
    const { verifyGoogleIdToken } = await import('../src/services/google-auth.service.js')

    await expect(verifyGoogleIdToken('signed-google-id-token')).rejects.toMatchObject({
      code: 'GOOGLE_SIGN_IN_UNAVAILABLE',
      statusCode: 503,
    })
    expect(mocks.verifyIdToken).not.toHaveBeenCalled()
  })
})
