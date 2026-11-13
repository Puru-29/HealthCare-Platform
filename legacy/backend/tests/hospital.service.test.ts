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

import { findHospitalById, findHospitals } from '../src/services/hospital.service.js'

beforeEach(() => {
  vi.clearAllMocks()
  mocks.assertSafeDatabaseEndpoint.mockResolvedValue(undefined)
  mocks.query.mockImplementation(async (sql: string) => ({
    rows: sql.includes('COUNT(*)') ? [{ total: 0 }] : [],
  }))
})

describe('published hospital discovery SQL', () => {
  it('filters searches and counts to current verified listings only', async () => {
    await findHospitals({
      city: 'Sonipat',
      search: 'care',
      facilityType: 'hospital',
      specialty: 'orthopaedics',
      limit: 10,
      offset: 0,
    })

    const countSql = String(mocks.query.mock.calls[0]?.[0])
    const pageSql = String(mocks.query.mock.calls[1]?.[0])
    for (const sql of [countSql, pageSql]) {
      expect(sql).toContain('JOIN current_hospital_verification')
      expect(sql).toContain("h.public_listing_status = 'published'")
      expect(sql).toContain("v.status = 'verified'")
      expect(sql).toContain('v.expires_at > now()')
      expect(sql).toContain('v.verified_city')
      expect(sql).toContain('v.verified_name ILIKE')
      expect(sql).toContain("hs.verification_status = 'verified'")
      expect(sql).toContain('hs.verified_specialty_name ILIKE')
    }
    expect(mocks.assertSafeDatabaseEndpoint).toHaveBeenCalledOnce()
  })

  it('returns details only for a current verified Sonipat public listing', async () => {
    await findHospitalById('00000000-0000-4000-8000-000000000001')
    const sql = String(mocks.query.mock.calls[0]?.[0])
    expect(sql).toContain("h.public_listing_status = 'published'")
    expect(sql).toContain("v.status = 'verified'")
    expect(sql).toContain('v.expires_at > now()')
    expect(sql).toContain("= 'sonipat'")
    expect(mocks.assertSafeDatabaseEndpoint).toHaveBeenCalledOnce()
  })
})
