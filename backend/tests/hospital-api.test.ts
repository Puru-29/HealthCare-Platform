import request from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  findHospitalById: vi.fn(),
  findHospitals: vi.fn(),
}))

vi.mock('../src/services/hospital.service.js', () => ({
  findHospitalById: mocks.findHospitalById,
  findHospitals: mocks.findHospitals,
}))

import { app } from '../src/app.js'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('hospital directory API', () => {
  it('returns an empty published directory as a successful response', async () => {
    mocks.findHospitals.mockResolvedValue({
      data: [],
      pagination: { limit: 20, offset: 0, total: 0 },
    })

    const response = await request(app).get('/api/hospitals?city=Sonipat')

    expect(response.status).toBe(200)
    expect(response.body).toEqual({
      data: [],
      pagination: { limit: 20, offset: 0, total: 0 },
    })
    expect(mocks.findHospitals).toHaveBeenCalledWith({
      city: 'Sonipat',
      limit: 20,
      offset: 0,
    })
  })

  it('rejects searches outside Sonipat before querying hospital records', async () => {
    const response = await request(app).get('/api/hospitals?city=Delhi')

    expect(response.status).toBe(400)
    expect(response.body.error.code).toBe('INVALID_QUERY')
    expect(mocks.findHospitals).not.toHaveBeenCalled()
  })
})
