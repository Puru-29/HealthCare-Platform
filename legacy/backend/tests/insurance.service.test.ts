import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  assertSafeDatabaseEndpoint: vi.fn(),
}))

vi.mock('../src/db/pool.js', () => ({
  pool: { query: mocks.query },
}))

vi.mock('../src/db/target.js', () => ({
  assertSafeDatabaseEndpoint: mocks.assertSafeDatabaseEndpoint,
}))

import { findInsuranceNetworks } from '../src/services/insurance.service.js'

beforeEach(() => {
  vi.clearAllMocks()
  mocks.assertSafeDatabaseEndpoint.mockResolvedValue(undefined)
  mocks.query.mockImplementation(async (sql: string) => ({
    rows: sql.includes('COUNT(*)') ? [{ total: 0 }] : [],
  }))
})

describe('insurer network directory SQL', () => {
  it('only exposes current insurer-sourced network records for verified published Sonipat hospitals', async () => {
    await findInsuranceNetworks({ search: 'plan', searchField: 'all', limit: 10, offset: 0 })

    const countSql = String(mocks.query.mock.calls[0]?.[0])
    const pageSql = String(mocks.query.mock.calls[1]?.[0])
    for (const sql of [countSql, pageSql]) {
      expect(sql).toContain("n.status = 'in_network'")
      expect(sql).toContain("n.source_type = 'insurer'")
      expect(sql).toContain('n.source_reference IS NOT NULL')
      expect(sql).toContain('n.last_verified_at IS NOT NULL')
      expect(sql).toContain('n.valid_from <= CURRENT_DATE')
      expect(sql).toContain('n.valid_until >= CURRENT_DATE')
      expect(sql).toContain("h.public_listing_status = 'published'")
      expect(sql).toContain("v.status = 'verified'")
      expect(sql).toContain('v.expires_at > now()')
      expect(sql).toContain("= 'sonipat'")
      expect(sql).toContain('n.plan_name ILIKE')
    }
    expect(mocks.assertSafeDatabaseEndpoint).toHaveBeenCalledOnce()
  })

  it('filters by a selected provider field using a parameterized value', async () => {
    await findInsuranceNetworks({
      search: 'Example Insurer',
      searchField: 'provider',
      limit: 10,
      offset: 0,
    })

    const countSql = String(mocks.query.mock.calls[0]?.[0])
    expect(countSql).toContain('p.name ILIKE $1')
    expect(countSql).not.toContain('n.plan_name ILIKE')
    expect(countSql).not.toContain('v.verified_name ILIKE')
    expect(mocks.query.mock.calls[0]?.[1]).toContain('%Example Insurer%')
  })
})
