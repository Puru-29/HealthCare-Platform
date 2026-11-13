import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  assertSafeDatabaseEndpoint: vi.fn(),
  clientQuery: vi.fn(),
  connect: vi.fn(),
  release: vi.fn(),
}))

vi.mock('../src/db/pool.js', () => ({
  pool: { query: vi.fn() },
  writePool: { connect: mocks.connect },
}))

vi.mock('../src/db/target.js', () => ({
  assertSafeDatabaseEndpoint: mocks.assertSafeDatabaseEndpoint,
}))

import { loginOrRegisterGoogleUser } from '../src/services/user-auth.service.js'

const identity = {
  subject: 'verified-google-subject',
  email: 'person@example.test',
  displayName: 'Google Person',
}

const userRow = {
  id: '00000000-0000-4000-8000-000000000001',
  display_name: 'Google Person',
  email: 'person@example.test',
  account_status: 'active',
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.assertSafeDatabaseEndpoint.mockResolvedValue(undefined)
  mocks.release.mockReset()
  mocks.connect.mockResolvedValue({
    query: mocks.clientQuery,
    release: mocks.release,
  })
  mocks.clientQuery.mockImplementation(async (sql: string) => {
    if (sql.includes('FROM user_auth_identities')) return { rows: [] }
    if (sql.includes('SELECT id FROM users')) return { rows: [] }
    if (sql.includes('INSERT INTO users')) return { rows: [userRow] }
    return { rows: [], rowCount: 1 }
  })
})

describe('Google user authentication persistence', () => {
  it('creates a new user, links the verified identity, and issues a CarePath session atomically', async () => {
    const session = await loginOrRegisterGoogleUser(identity)
    const calls = mocks.clientQuery.mock.calls as [string, unknown[]?][]
    const sql = calls.map(([statement]) => statement).join('\n')

    expect(session.user).toEqual({
      id: userRow.id,
      displayName: userRow.display_name,
      email: userRow.email,
    })
    expect(session.sessionToken).toBeTruthy()
    expect(session.csrfToken).toBeTruthy()
    expect(sql).toContain('INSERT INTO users')
    expect(sql).toContain('INSERT INTO user_auth_identities')
    expect(sql).toContain('INSERT INTO user_sessions')
    expect(calls.some(([statement, values]) =>
      statement.includes('INSERT INTO audit_logs') && values?.includes('user.google_registered'),
    )).toBe(true)
    expect(mocks.assertSafeDatabaseEndpoint).toHaveBeenCalledOnce()
    expect(mocks.clientQuery).toHaveBeenCalledWith('COMMIT')
    expect(mocks.release).toHaveBeenCalledOnce()
  })

  it('rejects a matching password account without inserting a Google identity or session', async () => {
    mocks.clientQuery.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM user_auth_identities')) return { rows: [] }
      if (sql.includes('SELECT id FROM users')) {
        return { rows: [{ id: userRow.id }], rowCount: 1 }
      }
      return { rows: [], rowCount: 1 }
    })

    await expect(loginOrRegisterGoogleUser(identity)).rejects.toMatchObject({
      code: 'EMAIL_ALREADY_REGISTERED',
      statusCode: 409,
    })
    const sql = (mocks.clientQuery.mock.calls as [string, unknown[]?][])
      .map(([statement]) => statement).join('\n')
    expect(sql).not.toContain('INSERT INTO user_auth_identities')
    expect(sql).not.toContain('INSERT INTO user_sessions')
    expect(mocks.clientQuery).toHaveBeenCalledWith('ROLLBACK')
    expect(mocks.release).toHaveBeenCalledOnce()
  })

  it('uses the existing identity to log in instead of creating another account', async () => {
    mocks.clientQuery.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM user_auth_identities')) return { rows: [userRow] }
      return { rows: [], rowCount: 1 }
    })

    await loginOrRegisterGoogleUser(identity)
    const calls = mocks.clientQuery.mock.calls as [string, unknown[]?][]
    const sql = calls.map(([statement]) => statement).join('\n')

    expect(sql).not.toContain('INSERT INTO users')
    expect(sql).not.toContain('INSERT INTO user_auth_identities')
    expect(sql).toContain('INSERT INTO user_sessions')
    expect(calls.some(([statement, values]) =>
      statement.includes('INSERT INTO audit_logs') && values?.includes('user.google_logged_in'),
    )).toBe(true)
    expect(mocks.clientQuery).toHaveBeenCalledWith('COMMIT')
  })
})
