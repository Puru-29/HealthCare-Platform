import { describe, expect, it, vi } from 'vitest'
import { assertSafeDatabaseEndpoint, isSafeLoopbackAddress } from '../src/db/target.js'

describe('database target safety', () => {
  it.each([
    ['127.0.0.1', true],
    ['127.42.8.9/32', true],
    ['::1', true],
    ['0:0:0:0:0:0:0:1/128', true],
    ['::ffff:127.0.0.1', false],
    ['10.0.0.1', false],
    ['127.0.0.1/129', false],
    ['not-an-address', false],
    [null, false],
  ])('classifies %s safely', (address, expected) => {
    expect(isSafeLoopbackAddress(address)).toBe(expected)
  })

  it('accepts only the test database at the expected loopback endpoint', async () => {
    const connection = {
      query: vi.fn().mockResolvedValue({
        rows: [{
          database_name: 'healthcare_platform_test',
          server_address: '127.0.0.1/32',
          server_port: 5432,
        }],
      }),
    }

    await expect(assertSafeDatabaseEndpoint(connection as never)).resolves.toBeUndefined()
  })

  it.each([
    {
      database_name: 'healthcare_platform',
      server_address: '127.0.0.1',
      server_port: 5432,
    },
    {
      database_name: 'healthcare_platform_test',
      server_address: '192.168.1.10',
      server_port: 5432,
    },
    {
      database_name: 'healthcare_platform_test',
      server_address: '::1',
      server_port: 5433,
    },
  ])('rejects unsafe actual endpoint %#', async (endpoint) => {
    const connection = { query: vi.fn().mockResolvedValue({ rows: [endpoint] }) }
    await expect(assertSafeDatabaseEndpoint(connection as never)).rejects.toThrow(
      'not the approved local test database',
    )
  })
})
