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

import { findDoctorById, findDoctors } from '../src/services/doctor.service.js'

beforeEach(() => {
  vi.clearAllMocks()
  mocks.assertSafeDatabaseEndpoint.mockResolvedValue(undefined)
  mocks.query.mockImplementation(async (sql: string) => ({
    rows: sql.includes('COUNT(*)') ? [{ total: 0 }] : [],
  }))
})

describe('verified doctor directory SQL', () => {
  it('only returns verified public doctors at approved Sonipat hospitals', async () => {
    await findDoctors({
      search: 'orthopaedics',
      specialty: 'Orthopaedics',
      limit: 10,
      offset: 0,
    })

    const countSql = String(mocks.query.mock.calls[0]?.[0])
    const pageSql = String(mocks.query.mock.calls[1]?.[0])
    for (const sql of [countSql, pageSql]) {
      expect(sql).toContain('d.is_publicly_listed')
      expect(sql).toContain("d.verification_status = 'verified'")
      expect(sql).toContain("a.status = 'active'")
      expect(sql).toContain('a.is_publicly_listed')
      expect(sql).toContain("h.public_listing_status = 'published'")
      expect(sql).toContain("v.status = 'verified'")
      expect(sql).toContain('v.expires_at > now()')
      expect(sql).toContain("= 'sonipat'")
      expect(sql).toContain('verified_display_name ILIKE')
    }
    expect(mocks.assertSafeDatabaseEndpoint).toHaveBeenCalledOnce()
  })

  it('only returns a doctor detail with verified public active affiliations', async () => {
    mocks.query.mockResolvedValueOnce({
      rows: [{
        id: '00000000-0000-4000-8000-000000000001',
        name: 'Verified Doctor',
        specialty: 'Cardiology',
        hospitalId: '00000000-0000-4000-8000-000000000002',
        hospitalName: 'Published Hospital',
        city: 'Sonipat',
        title: null,
        address: 'Public address',
        phone: null,
        website: null,
      }],
    })

    const doctor = await findDoctorById('00000000-0000-4000-8000-000000000001')
    const sql = String(mocks.query.mock.calls[0]?.[0])
    expect(sql).toContain("d.verification_status = 'verified'")
    expect(sql).toContain('d.is_publicly_listed')
    expect(sql).toContain("a.status = 'active'")
    expect(sql).toContain('a.is_publicly_listed')
    expect(sql).toContain("h.public_listing_status = 'published'")
    expect(sql).toContain("v.status = 'verified'")
    expect(sql).toContain('d.id = $1')
    expect(doctor).toEqual({
      id: '00000000-0000-4000-8000-000000000001',
      name: 'Verified Doctor',
      specialty: 'Cardiology',
      affiliations: [{
        hospitalId: '00000000-0000-4000-8000-000000000002',
        hospitalName: 'Published Hospital',
        city: 'Sonipat',
        title: null,
        address: 'Public address',
        phone: null,
        website: null,
      }],
    })
    expect(mocks.assertSafeDatabaseEndpoint).toHaveBeenCalledOnce()
  })

  it('does not expose a doctor without a qualifying public verified affiliation', async () => {
    const doctor = await findDoctorById('00000000-0000-4000-8000-000000000001')
    expect(doctor).toBeNull()
  })
})
