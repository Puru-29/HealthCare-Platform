import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  readQuery: vi.fn(),
  writeQuery: vi.fn(),
  release: vi.fn(),
  assertSafeDatabaseEndpoint: vi.fn(),
}))

vi.mock('../src/db/pool.js', () => ({
  pool: { query: mocks.readQuery },
  writePool: {
    connect: async () => ({ query: mocks.writeQuery, release: mocks.release }),
  },
}))

vi.mock('../src/db/target.js', () => ({
  assertSafeDatabaseEndpoint: mocks.assertSafeDatabaseEndpoint,
}))

import { AppError } from '../src/errors/app-error.js'
import {
  cancelPatientAppointment,
  listPatientAppointments,
} from '../src/services/appointment.service.js'

beforeEach(() => {
  vi.clearAllMocks()
  mocks.assertSafeDatabaseEndpoint.mockResolvedValue(undefined)
  mocks.readQuery.mockResolvedValue({ rows: [] })
  mocks.writeQuery.mockResolvedValue({ rows: [], rowCount: 1 })
})

describe('patient appointment access', () => {
  it('limits appointment history to the authenticated user and verified Sonipat details', async () => {
    await listPatientAppointments('patient-user-id')
    const sql = String(mocks.readQuery.mock.calls[0]?.[0])

    expect(sql).toContain('WHERE a.user_id = $1')
    expect(sql).toContain("d.verification_status = 'verified'")
    expect(sql).toContain("h.public_listing_status = 'published'")
    expect(sql).toContain("v.status = 'verified'")
    expect(sql).toContain("= 'sonipat'")
    expect(mocks.readQuery.mock.calls[0]?.[1]).toEqual(['patient-user-id'])
    expect(mocks.assertSafeDatabaseEndpoint).toHaveBeenCalledOnce()
  })

  it('cancels only the authenticated user’s pending request and records an audit event', async () => {
    await cancelPatientAppointment('patient-user-id', 'appointment-id')
    const updateCall = mocks.writeQuery.mock.calls.find(([sql]) => String(sql).includes('UPDATE appointments'))
    const auditCall = mocks.writeQuery.mock.calls.find(([sql]) => String(sql).includes('INSERT INTO audit_logs'))

    expect(String(updateCall?.[0])).toContain("status = 'requested'")
    expect(String(updateCall?.[0])).toContain('user_id = $2')
    expect(updateCall?.[1]).toEqual(['appointment-id', 'patient-user-id'])
    expect(String(auditCall?.[0])).toContain("appointment.request_cancelled")
    expect(mocks.assertSafeDatabaseEndpoint).toHaveBeenCalledOnce()
    expect(mocks.writeQuery).toHaveBeenCalledWith('COMMIT')
    expect(mocks.release).toHaveBeenCalledOnce()
  })

  it('does not disclose or cancel another user’s appointment', async () => {
    mocks.writeQuery.mockImplementation(async (sql: string) => {
      if (sql.includes('UPDATE appointments')) return { rows: [], rowCount: 0 }
      if (sql.includes('SELECT status')) return { rows: [], rowCount: 0 }
      return { rows: [], rowCount: 1 }
    })

    await expect(cancelPatientAppointment('patient-user-id', 'other-user-appointment'))
      .rejects.toMatchObject<Partial<AppError>>({ statusCode: 404, code: 'APPOINTMENT_NOT_FOUND' })
    expect(mocks.writeQuery).toHaveBeenCalledWith('ROLLBACK')
    expect(mocks.release).toHaveBeenCalledOnce()
  })

  it('refuses to cancel requests that are no longer pending', async () => {
    mocks.writeQuery.mockImplementation(async (sql: string) => {
      if (sql.includes('UPDATE appointments')) return { rows: [], rowCount: 0 }
      if (sql.includes('SELECT status')) return { rows: [{ status: 'confirmed' }], rowCount: 1 }
      return { rows: [], rowCount: 1 }
    })

    await expect(cancelPatientAppointment('patient-user-id', 'confirmed-appointment'))
      .rejects.toMatchObject<Partial<AppError>>({ statusCode: 409, code: 'APPOINTMENT_NOT_CANCELLABLE' })
    expect(mocks.writeQuery).toHaveBeenCalledWith('ROLLBACK')
    expect(mocks.writeQuery.mock.calls.some(([sql]) => String(sql).includes('INSERT INTO audit_logs'))).toBe(false)
  })
})
