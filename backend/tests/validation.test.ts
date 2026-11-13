import request from 'supertest'
import { describe, expect, it } from 'vitest'
import {
  appointmentIdSchema,
  doctorQuerySchema,
  hospitalQuerySchema,
  insuranceNetworkQuerySchema,
} from '../src/middleware/validate.js'
import { app } from '../src/app.js'

describe('hospital query validation', () => {
  it('applies bounded pagination defaults', () => {
    expect(hospitalQuerySchema.parse({})).toEqual({
      city: 'Sonipat',
      limit: 20,
      offset: 0,
    })

  })

  it('rejects invalid limits and unknown query parameters', () => {
    expect(hospitalQuerySchema.safeParse({ limit: '101' }).success).toBe(false)
    expect(hospitalQuerySchema.safeParse({ unwanted: 'value' }).success).toBe(false)
    expect(hospitalQuerySchema.safeParse({ city: 'Delhi' }).success).toBe(false)
    expect(hospitalQuerySchema.safeParse({ city: 'sonipat' }).success).toBe(true)
  })

  it('rejects blank and oversized search text', () => {
    expect(hospitalQuerySchema.safeParse({ search: '  ' }).success).toBe(false)
    expect(hospitalQuerySchema.safeParse({ search: 'x'.repeat(121) }).success).toBe(false)
  })

  it('rejects invalid HTTP query and path values before database access', async () => {
    const invalidQuery = await request(app).get('/api/hospitals?limit=0')
    const invalidCity = await request(app).get('/api/hospitals?city=Delhi')
    const invalidId = await request(app).get('/api/hospitals/not-a-uuid')

    expect(invalidQuery.status).toBe(400)
    expect(invalidQuery.body.error.code).toBe('INVALID_QUERY')
    expect(invalidCity.status).toBe(400)
    expect(invalidCity.body.error.code).toBe('INVALID_QUERY')
    expect(invalidId.status).toBe(400)
    expect(invalidId.body.error.code).toBe('INVALID_HOSPITAL_ID')
  })

  it('returns a consistent JSON 404 for unknown routes', async () => {
    const response = await request(app).get('/api/not-a-route')

    expect(response.status).toBe(404)
    expect(response.body.error.code).toBe('NOT_FOUND')
  })

  it('allows CORS only for the configured frontend origin', async () => {
    const allowed = await request(app)
      .options('/api/health')
      .set('Origin', 'http://127.0.0.1:5174')
      .set('Access-Control-Request-Method', 'GET')
    const rejected = await request(app)
      .options('/api/health')
      .set('Origin', 'https://untrusted.example')
      .set('Access-Control-Request-Method', 'GET')

    expect(allowed.headers['access-control-allow-origin']).toBe('http://127.0.0.1:5174')
    expect(rejected.headers['access-control-allow-origin']).toBeUndefined()
    expect(rejected.headers['access-control-allow-origin']).not.toBe('https://untrusted.example')
  })
})

describe('doctor query validation', () => {
  it('applies bounded pagination and rejects unknown query parameters', () => {
    expect(doctorQuerySchema.parse({})).toEqual({ limit: 20, offset: 0 })
    expect(doctorQuerySchema.safeParse({ limit: '101' }).success).toBe(false)
    expect(doctorQuerySchema.safeParse({ city: 'Delhi' }).success).toBe(false)
  })

  it('validates bounded insurance searches and appointment IDs', () => {
    expect(insuranceNetworkQuerySchema.parse({})).toEqual({
      searchField: 'all',
      limit: 20,
      offset: 0,
    })
    expect(insuranceNetworkQuerySchema.safeParse({ search: '  ' }).success).toBe(false)
    expect(insuranceNetworkQuerySchema.safeParse({ searchField: 'unsupported' }).success).toBe(false)
    expect(insuranceNetworkQuerySchema.safeParse({ extra: 'unexpected' }).success).toBe(false)
    expect(appointmentIdSchema.safeParse('00000000-0000-4000-8000-000000000001').success).toBe(true)
    expect(appointmentIdSchema.safeParse('not-a-uuid').success).toBe(false)
  })

  it('rejects invalid HTTP query parameters before querying', async () => {
    const invalid = await request(app).get('/api/doctors?limit=0')
    expect(invalid.status).toBe(400)
    expect(invalid.body.error.code).toBe('INVALID_QUERY')
  })
})
