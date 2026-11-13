import request from 'supertest'
import { describe, expect, it } from 'vitest'
import { app } from '../src/app.js'
import {
  adminHospitalSchema,
  ambulanceVehicleSchema,
} from '../src/middleware/admin-validation.js'

const validHospital = {
  name: 'Validation-only hospital',
  address: null,
  city: null,
  region: null,
  postalCode: null,
  phone: null,
  website: null,
  description: null,
  facilityType: null,
  latitude: null,
  longitude: null,
  listingStatus: 'draft',
  specialties: [],
  verificationStatus: 'unverified',
  verificationSourceType: null,
  verificationSourceName: null,
  verificationSourceReference: null,
  verificationExpiresAt: null,
}

describe('admin input validation', () => {
  it('accepts a schema-backed hospital payload without requiring verification data', () => {
    expect(adminHospitalSchema.safeParse(validHospital).success).toBe(true)
  })

  it('rejects mismatched coordinates, unsupported website protocols and incomplete verification sources', () => {
    expect(adminHospitalSchema.safeParse({ ...validHospital, latitude: 12.9 }).success).toBe(false)
    expect(adminHospitalSchema.safeParse({ ...validHospital, website: 'javascript:alert(1)' }).success).toBe(false)
    expect(adminHospitalSchema.safeParse({
      ...validHospital,
      verificationStatus: 'verified',
      verificationSourceType: null,
      verificationSourceName: null,
    }).success).toBe(false)
  })

  it('refuses publication unless the hospital is verified within Sonipat, Haryana', () => {
    expect(adminHospitalSchema.safeParse({
      ...validHospital,
      listingStatus: 'published',
    }).success).toBe(false)
    expect(adminHospitalSchema.safeParse({
      ...validHospital,
      city: 'Sonipat',
      region: 'Haryana',
      listingStatus: 'published',
      verificationStatus: 'verified',
      verificationSourceType: 'government_registry',
      verificationSourceName: 'Test source',
    }).success).toBe(true)
    expect(adminHospitalSchema.safeParse({
      ...validHospital,
      city: 'Delhi',
      region: 'Delhi',
      listingStatus: 'published',
      verificationStatus: 'verified',
      verificationSourceType: 'government_registry',
      verificationSourceName: 'Test source',
    }).success).toBe(false)
  })

  it('requires an existing-provider UUID and paired coordinates for a vehicle', () => {
    const vehicle = {
      providerId: '00000000-0000-4000-8000-000000000001',
      vehicleType: 'Ambulance',
      registrationNumber: null,
      status: 'unavailable',
      latitude: null,
      longitude: null,
    }
    expect(ambulanceVehicleSchema.safeParse(vehicle).success).toBe(true)
    expect(ambulanceVehicleSchema.safeParse({ ...vehicle, longitude: 77.2 }).success).toBe(false)
  })
})

describe('admin API authorization', () => {
  it('rejects anonymous access to admin reads and all write endpoints before database access', async () => {
    const reads = await Promise.all([
      request(app).get('/api/admin/overview'),
      request(app).get('/api/admin/hospitals'),
      request(app).get('/api/admin/hospitals/source-observations'),
      request(app).get('/api/admin/ambulance/providers'),
      request(app).get('/api/admin/ambulance/vehicles'),
    ])
    const writes = await Promise.all([
      request(app).post('/api/admin/hospitals').send(validHospital),
      request(app).post('/api/admin/hospitals/source-reviews/decisions').send({}),
      request(app).post('/api/admin/hospitals/source-reviews/create-drafts').send({}),
      request(app).post('/api/admin/ambulance/providers').send({ name: 'Validation-only' }),
      request(app).patch('/api/admin/ambulance/vehicles/00000000-0000-4000-8000-000000000001').send({}),
    ])

    for (const response of [...reads, ...writes]) {
      expect(response.status).toBe(401)
      expect(response.body.error.code).toBe('ADMIN_AUTH_REQUIRED')
    }
  })

  it('rejects a session request without a valid signed cookie', async () => {
    const response = await request(app)
      .get('/api/admin/auth/session')
      .set('Cookie', 'carepath_admin_session=invalid')

    expect(response.status).toBe(401)
    expect(response.body.error.code).toBe('ADMIN_AUTH_REQUIRED')
  })

  it('returns a client error for malformed JSON instead of an internal-server error', async () => {
    const response = await request(app)
      .post('/api/admin/auth/login')
      .set('Content-Type', 'application/json')
      .send('{"username":')

    expect(response.status).toBe(400)
    expect(response.body.error.code).toBe('INVALID_JSON')
  })
})
