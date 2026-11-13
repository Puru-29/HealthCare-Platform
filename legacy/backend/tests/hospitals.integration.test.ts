import request from 'supertest'
import { afterAll, describe, expect, it } from 'vitest'
import { app } from '../src/app.js'
import { closeDatabasePool } from '../src/db/pool.js'

const enabled = process.env.RUN_DB_INTEGRATION_TESTS === 'true'

describe.skipIf(!enabled)('hospital API (PostgreSQL integration)', () => {
  afterAll(async () => {
    await closeDatabasePool()
  })

  it('returns a paginated response from the existing hospitals table', async () => {
    const response = await request(app).get('/api/hospitals?city=Sonipat&limit=2&offset=0')

    expect(response.status).toBe(200)
    expect(response.body).toEqual({
      data: expect.any(Array),
      pagination: {
        limit: 2,
        offset: 0,
        total: expect.any(Number),
      },
    })
    expect(response.body.data.length).toBeLessThanOrEqual(2)
    expect(response.body.data.every((hospital: { id?: string; city?: string }) =>
      typeof hospital.id === 'string' && hospital.city?.toLocaleLowerCase() === 'sonipat')).toBe(true)
  })

  it('rejects invalid pagination before querying the database', async () => {
    const response = await request(app).get('/api/hospitals?limit=0')

    expect(response.status).toBe(400)
    expect(response.body.error.code).toBe('INVALID_QUERY')
  })

  it('rejects malformed hospital IDs before querying the database', async () => {
    const response = await request(app).get('/api/hospitals/not-a-uuid')

    expect(response.status).toBe(400)
    expect(response.body.error.code).toBe('INVALID_HOSPITAL_ID')
  })
})
