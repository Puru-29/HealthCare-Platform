import { describe, expect, it } from 'vitest'
import { createPasswordHash, verifyPasswordHash } from '../src/services/user-auth.service.js'

describe('user password hashing', () => {
  it('stores passwords as salted scrypt hashes and verifies them safely', async () => {
    const password = 'a-long-test-password-2026'
    const passwordHash = await createPasswordHash(password)

    expect(passwordHash).toMatch(/^scrypt\$[A-Za-z0-9_-]{20,}\$[A-Za-z0-9_-]{80,}$/)
    expect(passwordHash).not.toContain(password)
    await expect(verifyPasswordHash(password, passwordHash)).resolves.toBe(true)
    await expect(verifyPasswordHash('incorrect-password', passwordHash)).resolves.toBe(false)
    await expect(verifyPasswordHash(password, 'malformed')).resolves.toBe(false)
  })
})
