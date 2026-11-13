import request from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  findDoctorById: vi.fn(),
  findDoctors: vi.fn(),
}))

vi.mock('../src/services/doctor.service.js', () => ({
  findDoctorById: mocks.findDoctorById,
  findDoctors: mocks.findDoctors,
}))

import { app } from '../src/app.js'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('doctor directory API', () => {
  it('returns a verified doctor profile with its publicly listed hospital contact details', async () => {
    const data = {
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
    }
    mocks.findDoctorById.mockResolvedValue(data)

    const response = await request(app).get(`/api/doctors/${data.id}`)

    expect(response.status).toBe(200)
    expect(response.body).toEqual({ data })
    expect(mocks.findDoctorById).toHaveBeenCalledWith(data.id)
  })

  it('rejects malformed doctor IDs before querying records', async () => {
    const response = await request(app).get('/api/doctors/not-a-uuid')

    expect(response.status).toBe(400)
    expect(response.body.error.code).toBe('INVALID_DOCTOR_ID')
    expect(mocks.findDoctorById).not.toHaveBeenCalled()
  })

  it('returns not found when no verified public doctor listing exists', async () => {
    mocks.findDoctorById.mockResolvedValue(null)

    const response = await request(app).get('/api/doctors/00000000-0000-4000-8000-000000000001')

    expect(response.status).toBe(404)
    expect(response.body.error.code).toBe('DOCTOR_NOT_FOUND')
  })
})
