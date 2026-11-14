import request from 'supertest'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp } from '../src/app.js'
import { importFacilities, openDb, type DB } from '../src/db.js'
import { hashPassword, newId } from '../src/lib/security.js'
import { Dispatcher } from '../src/services/dispatch.js'

// Real master data, real schema, in-memory DB.
let db: DB
let dispatcher: Dispatcher
let app: ReturnType<typeof createApp>

const CIVIL = 'pmjay-hosp6g03224' // District Civil Hospital, Sonipat
const PARK = 'pmjay-hosp6p130991' // Park Nidaan Hospital, Sonipat
const GOHANA = 'pmjay-hosp6g02452' // SDH Gohana (~35 km away)
const PICKUP = { lat: 28.995, lng: 77.03 } // Sonipat city

async function addPartner(hospitalId: string, username: string) {
  db.prepare(`INSERT INTO staff (id, hospital_id, username, password_hash, display_name) VALUES (?, ?, ?, ?, ?)`)
    .run(newId(), hospitalId, username, await hashPassword('pw-' + username), username)
  const h = db.prepare('SELECT lat, lng FROM hospitals WHERE id = ?').get(hospitalId) as { lat: number; lng: number }
  const ambId = newId()
  db.prepare(`INSERT INTO ambulances (id, hospital_id, vehicle_number, kind, driver_name, driver_phone, lat, lng, location_at) VALUES (?, ?, ?, 'ALS', 'Driver', '9876543210', ?, ?, datetime('now'))`)
    .run(ambId, hospitalId, `HR-${username}`, h.lat, h.lng)
  const agent = request.agent(app)
  await agent.post('/api/console/login').send({ username, password: 'pw-' + username }).expect(200)
  return { agent, ambId }
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] })
  db = openDb(':memory:')
  importFacilities(db)
  dispatcher = new Dispatcher(db, { waveRadiiKm: [8, 15, 50], waveTimeoutMs: 30_000, maxOffersPerWave: 6, simulate: false })
  app = createApp(db, dispatcher)
})
afterEach(() => {
  dispatcher.stop()
  vi.useRealTimers()
})

describe('directory', () => {
  it('lists real Sonipat facilities sorted by distance', async () => {
    const res = await request(app).get('/api/hospitals').query({ ...PICKUP, maxKm: 10 }).expect(200)
    expect(res.body.total).toBeGreaterThan(20)
    const d = res.body.data.map((h: { distanceKm: number | null }) => h.distanceKm).filter((x: number | null) => x !== null)
    expect(d).toEqual([...d].sort((a: number, b: number) => a - b))
  })

  it('filters PM-JAY hospitals by specialty', async () => {
    const res = await request(app).get('/api/hospitals').query({ pmjay: 'true', specialty: 'ophthalmology' }).expect(200)
    expect(res.body.data.every((h: { pmjay: unknown }) => h.pmjay)).toBe(true)
    expect(res.body.data.map((h: { name: string }) => h.name)).toEqual(expect.arrayContaining(['Arya Eye Hospital']))
  })

  it('recommends nearest and best for a specialty', async () => {
    const res = await request(app).get('/api/hospitals/recommend').query({ ...PICKUP, specialty: 'emergency' }).expect(200)
    expect(res.body.nearest.length).toBeGreaterThan(0)
    expect(res.body.best[0].score).toBeGreaterThanOrEqual(res.body.best.at(-1).score - 5)
  })

  it('rejects invalid query input', async () => {
    await request(app).get('/api/hospitals').query({ specialty: 'astrology' }).expect(400)
  })
})

describe('SOS dispatch', () => {
  it('first hospital to accept wins; the other is told it lost', async () => {
    const civil = await addPartner(CIVIL, 'civil')
    const park = await addPartner(PARK, 'park')
    const patient = request.agent(app)
    const sos = await patient.post('/api/sos').send({ ...PICKUP, phone: '+91 98765 43210', name: 'Asha' }).expect(201)
    expect(sos.body.status).toBe('searching')
    expect(sos.body.search.contacted).toBe(2)

    // Before accepting, hospitals see only a coarse area and no phone number.
    const dash = await civil.agent.get('/api/console/dashboard').expect(200)
    expect(dash.body.offers).toHaveLength(1)
    expect(JSON.stringify(dash.body.offers)).not.toContain('9876543210')

    const [a, b] = await Promise.all([
      civil.agent.post(`/api/console/offers/${sos.body.id}/accept`).send({ ambulanceId: civil.ambId }),
      park.agent.post(`/api/console/offers/${sos.body.id}/accept`).send({ ambulanceId: park.ambId }),
    ])
    expect([a.status, b.status].sort()).toEqual([200, 409])
    const winner = a.status === 200 ? a : b
    expect(winner.body.driverPath).toMatch(/^\/driver\//)
    expect(winner.body.trip.patient.phone).toBe('9876543210')

    const view = await patient.get(`/api/sos/${sos.body.id}`).expect(200)
    expect(view.body.status).toBe('assigned')
    expect(view.body.ambulance.driverPhone).toBe('9876543210')
    expect(view.body.eta.minutes).toBeGreaterThan(0)

    // Driver link drives the trip to completion and frees the ambulance.
    const driver = winner.body.driverPath.replace('/driver/', '')
    await request(app).post(`/api/driver/${driver}/location`).send(PICKUP).expect(200)
    await request(app).post(`/api/driver/${driver}/status`).send({ status: 'arrived' }).expect(200)
    await request(app).post(`/api/driver/${driver}/status`).send({ status: 'to_hospital' }).expect(200)
    await request(app).post(`/api/driver/${driver}/status`).send({ status: 'completed' }).expect(200)
    const amb = db.prepare(`SELECT status FROM ambulances WHERE hospital_id = (SELECT hospital_id FROM incidents WHERE id = ?)`).get(sos.body.id) as { status: string }
    expect(amb.status).toBe('available')
  })

  it('widens the search when nobody nearby answers, then tells the patient to call 108', async () => {
    const gohana = await addPartner(GOHANA, 'gohana')
    const patient = request.agent(app)
    const sos = await patient.post('/api/sos').send({ ...PICKUP, phone: '9876543210' }).expect(201)
    // Gohana is ~45 road-km away: not in the 8 or 15 km waves, but in the 50 km wave.
    expect(sos.body.search.wave).toBe(3)
    expect((await gohana.agent.get('/api/console/dashboard')).body.offers).toHaveLength(1)
    await vi.advanceTimersByTimeAsync(30_000)
    const view = await patient.get(`/api/sos/${sos.body.id}`).expect(200)
    expect(view.body.status).toBe('no_response')
    expect(view.body.timeline.at(-1).message).toMatch(/108/)
  })

  it('moves to the next wave as soon as every hospital in a wave declines', async () => {
    const civil = await addPartner(CIVIL, 'civil')
    const patient = request.agent(app)
    const sos = await patient.post('/api/sos').send({ ...PICKUP, phone: '9876543210' }).expect(201)
    await civil.agent.post(`/api/console/offers/${sos.body.id}/decline`).send({}).expect(200)
    const view = await patient.get(`/api/sos/${sos.body.id}`).expect(200)
    expect(view.body.search.wave).toBeGreaterThan(1)
  })

  it('pressing SOS twice returns the same request', async () => {
    await addPartner(CIVIL, 'civil')
    const patient = request.agent(app)
    const a = await patient.post('/api/sos').send({ ...PICKUP, phone: '9876543210' }).expect(201)
    const b = await patient.post('/api/sos').send({ ...PICKUP, phone: '9876543210' }).expect(201)
    expect(b.body.id).toBe(a.body.id)
  })

  it('only the requesting device can see or cancel the request', async () => {
    await addPartner(CIVIL, 'civil')
    const sos = await request.agent(app).post('/api/sos').send({ ...PICKUP, phone: '9876543210' }).expect(201)
    await request(app).get(`/api/sos/${sos.body.id}`).expect(403)
    await request.agent(app).post(`/api/sos/${sos.body.id}/cancel`).send({}).expect(403)
  })

  it('rejects an invalid phone number', async () => {
    await request(app).post('/api/sos').send({ ...PICKUP, phone: '12345' }).expect(400)
  })
})

describe('security', () => {
  it('requires JSON for writes (blocks cross-site form posts)', async () => {
    await request(app).post('/api/sos').type('form').send('lat=1&lng=1&phone=9876543210').expect(415)
  })

  it('protects the console', async () => {
    await request(app).get('/api/console/dashboard').expect(401)
    await request(app).post('/api/console/login').send({ username: 'nobody', password: 'x' }).expect(401)
  })

  it('a hospital can only act on offers made to it', async () => {
    const park = await addPartner(PARK, 'park')
    const gohana = await addPartner(GOHANA, 'gohana')
    const sos = await request.agent(app).post('/api/sos').send({ ...PICKUP, phone: '9876543210' }).expect(201)
    expect(sos.body.search.wave).toBe(1)
    await gohana.agent.post(`/api/console/offers/${sos.body.id}/accept`).send({ ambulanceId: gohana.ambId }).expect(404)
    await park.agent.post(`/api/console/offers/${sos.body.id}/accept`).send({ ambulanceId: gohana.ambId }).expect(404)
  })
})

describe('hospital profile', () => {
  it('replaces inferred specialties with confirmed ones', async () => {
    const civil = await addPartner(CIVIL, 'civil')
    const res = await civil.agent.put('/api/console/profile').send({
      phone: '01302222222', emergency24x7: true, specialties: ['emergency', 'cardiology'], insurers: ['Star Health'],
    }).expect(200)
    expect(res.body.verified).toBe(true)
    expect(res.body.specialties.map((s: { key: string; source: string }) => `${s.key}:${s.source}`).sort())
      .toEqual(['cardiology:hospital_verified', 'emergency:hospital_verified'])
    // Re-importing master data keeps the hospital's own list.
    importFacilities(db)
    const after = await request(app).get(`/api/hospitals/${CIVIL}`).expect(200)
    expect(after.body.specialties).toHaveLength(2)
  })
})

describe('appointments', () => {
  it('patient requests, hospital confirms', async () => {
    const civil = await addPartner(CIVIL, 'civil')
    const patient = request.agent(app)
    const date = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10)
    const appt = await patient.post('/api/appointments').send({
      hospitalId: CIVIL, department: 'Orthopaedics', preferredDate: date, preferredSlot: 'morning', patientName: 'Ravi Kumar', patientPhone: '9812345678',
    }).expect(201)
    const dash = await civil.agent.get('/api/console/dashboard').expect(200)
    expect(dash.body.appointments.map((a: { id: string }) => a.id)).toContain(appt.body.id)
    await civil.agent.post(`/api/console/appointments/${appt.body.id}`).send({ action: 'confirm', confirmedFor: `${date} 10:30` }).expect(200)
    const mine = await patient.get('/api/appointments').expect(200)
    expect(mine.body.data[0]).toMatchObject({ status: 'confirmed', confirmedFor: `${date} 10:30` })
  })
})

describe('insurance endpoint', () => {
  it('estimates PM-JAY at an empanelled hospital', async () => {
    const res = await request(app).post('/api/insurance/estimate').send({
      bill: { roomRentPerDay: 2000, days: 2, associatedCharges: 20_000, medicinesAndConsumables: 5000, otherCharges: 3000 },
      pmjay: { usedThisYear: 0 },
      hospitalId: CIVIL,
    }).expect(200)
    expect(res.body.pmjay).toMatchObject({ eligible: true, youPay: 0 })
  })
})
