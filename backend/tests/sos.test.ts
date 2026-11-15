import request from 'supertest'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp } from '../src/app.js'
import { importFacilities, openDb, type DB } from '../src/db.js'
import { hashPassword, newId } from '../src/lib/security.js'
import { Dispatcher } from '../src/services/dispatch.js'

// Sonipat city: District Civil Hospital and Park Nidaan are both inside the 8 km first ring;
// SDH Gohana is ~45 road-km away (third ring only).
const CIVIL = 'pmjay-hosp6g03224'
const PARK = 'pmjay-hosp6p130991'
const GOHANA = 'pmjay-hosp6g02452'
const PICKUP = { lat: 28.995, lng: 77.03 }
const PATIENT_PHONE = '9812345678'
const CONTACT_PHONE = '9876500000'
const DRIVER_PHONE = '9876543210'
const HEAD_START = 10_000
const WAVE = 30_000

let db: DB
let dispatcher: Dispatcher
let app: ReturnType<typeof createApp>
let sms: Array<{ phone: string; text: string }>
let smsFails: boolean

async function addPartner(hospitalId: string, username: string, kind: 'ALS' | 'BLS') {
  db.prepare(`INSERT INTO staff (id, hospital_id, username, password_hash, display_name) VALUES (?, ?, ?, ?, ?)`)
    .run(newId(), hospitalId, username, await hashPassword('pw-' + username), username)
  const h = db.prepare('SELECT lat, lng FROM hospitals WHERE id = ?').get(hospitalId) as { lat: number; lng: number }
  const ambId = newId()
  db.prepare(`INSERT INTO ambulances (id, hospital_id, vehicle_number, kind, driver_name, driver_phone, lat, lng, location_at) VALUES (?, ?, ?, ?, 'Ramesh Kumar', ?, ?, ?, datetime('now'))`)
    .run(ambId, hospitalId, `HR-${username}`, kind, DRIVER_PHONE, h.lat, h.lng)
  const agent = request.agent(app)
  await agent.post('/api/console/login').send({ username, password: 'pw-' + username }).expect(200)
  return { agent, ambId }
}

const offersFor = async (h: Awaited<ReturnType<typeof addPartner>>) => (await h.agent.get('/api/console/dashboard').expect(200)).body.offers as Array<{ incidentId: string; categoryLabel: string | null; alsPreferred: boolean }>
/** Let the fire-and-forget emergency-contact SMS settle. */
const settle = () => new Promise((r) => setImmediate(r))

async function patientWithContact() {
  const patient = request.agent(app)
  await patient.put('/api/me').send({ name: 'Asha Devi', emergencyContactPhone: CONTACT_PHONE, bloodGroup: 'O-', allergies: 'Penicillin' }).expect(200)
  return patient
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] })
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
  sms = []
  smsFails = false
  db = openDb(':memory:')
  importFacilities(db)
  dispatcher = new Dispatcher(db, {
    waveRadiiKm: [8, 15, 50], waveTimeoutMs: WAVE, maxOffersPerWave: 6, simulate: false,
    alsHeadStartMs: HEAD_START, publicUrl: 'https://carepath.test',
    sendSms: async (phone, text) => { if (smsFails) throw new Error('gateway down'); sms.push({ phone, text }) },
  })
  app = createApp(db, dispatcher)
})
afterEach(() => {
  dispatcher.stop()
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('1 · first ring ends with no acceptance', () => {
  it('flags "call 108 now" after wave 1 expires, and keeps searching', async () => {
    await addPartner(CIVIL, 'civil', 'BLS')
    const patient = request.agent(app)
    const sos = await patient.post('/api/sos').send({ ...PICKUP, phone: PATIENT_PHONE }).expect(201)
    expect(sos.body.search.noAcceptanceYet).toBe(false)

    await vi.advanceTimersByTimeAsync(WAVE)
    const view = (await patient.get(`/api/sos/${sos.body.id}`).expect(200)).body
    expect(view.status).toBe('searching')
    expect(view.search.wave).toBe(2)
    expect(view.search.noAcceptanceYet).toBe(true)
    expect(view.timeline.map((e: { type: string }) => e.type)).toContain('first_ring_missed')
  })

  it('keeps the request open through every ring, then ends with call-108', async () => {
    await addPartner(CIVIL, 'civil', 'BLS')
    const patient = request.agent(app)
    const sos = await patient.post('/api/sos').send({ ...PICKUP, phone: PATIENT_PHONE }).expect(201)
    await vi.advanceTimersByTimeAsync(WAVE * 2)
    expect((await patient.get(`/api/sos/${sos.body.id}`)).body).toMatchObject({ status: 'searching', search: { wave: 3, noAcceptanceYet: true } })
    await vi.advanceTimersByTimeAsync(WAVE)
    expect((await patient.get(`/api/sos/${sos.body.id}`)).body.status).toBe('no_response')
  })

  it('flags it at once when nobody is in the first ring, still searching further out', async () => {
    await addPartner(GOHANA, 'gohana', 'BLS')
    const sos = await request.agent(app).post('/api/sos').send({ ...PICKUP, phone: PATIENT_PHONE }).expect(201)
    expect(sos.body).toMatchObject({ status: 'searching', search: { noAcceptanceYet: true } })
  })

  it('clears the flag once a hospital accepts', async () => {
    const civil = await addPartner(CIVIL, 'civil', 'BLS')
    const patient = request.agent(app)
    const sos = await patient.post('/api/sos').send({ ...PICKUP, phone: PATIENT_PHONE }).expect(201)
    await vi.advanceTimersByTimeAsync(WAVE)
    await civil.agent.post(`/api/console/offers/${sos.body.id}/accept`).send({ ambulanceId: civil.ambId }).expect(200) // late accept still works
    expect((await patient.get(`/api/sos/${sos.body.id}`)).body.search.noAcceptanceYet).toBe(false)
  })
})

describe('2 · emergency contact gets a live tracking link', () => {
  it('texts the contact a /track link when SOS starts', async () => {
    await addPartner(CIVIL, 'civil', 'ALS')
    const patient = await patientWithContact()
    const sos = await patient.post('/api/sos').send({ ...PICKUP, phone: PATIENT_PHONE }).expect(201)
    await settle()
    expect(sms).toHaveLength(1)
    expect(sms[0]!.phone).toBe(CONTACT_PHONE)
    expect(sms[0]!.text).toMatch(/^CarePath SOS: Asha has asked for an ambulance\. Follow it live: https:\/\/carepath\.test\/track\/[\w-]{20,}/)
    const view = (await patient.get(`/api/sos/${sos.body.id}`)).body
    expect(view.familyTracking).toBe(true)
    expect(view.timeline.map((e: { type: string }) => e.type)).toContain('contact_notified')
  })

  it('sends nothing when there is no emergency contact', async () => {
    await addPartner(CIVIL, 'civil', 'ALS')
    const sos = await request.agent(app).post('/api/sos').send({ ...PICKUP, phone: PATIENT_PHONE }).expect(201)
    await settle()
    expect(sms).toHaveLength(0)
    expect(sos.body.familyTracking).toBe(false)
  })

  it('a failed SMS never blocks dispatch', async () => {
    smsFails = true
    const civil = await addPartner(CIVIL, 'civil', 'ALS')
    const patient = await patientWithContact()
    const sos = await patient.post('/api/sos').send({ ...PICKUP, phone: PATIENT_PHONE }).expect(201)
    await settle()
    const view = (await patient.get(`/api/sos/${sos.body.id}`)).body
    expect(view.status).toBe('searching')
    expect(view.timeline.map((e: { type: string }) => e.type)).toContain('contact_failed')
    expect(await offersFor(civil)).toHaveLength(1)
  })

  it('the tracking page shows status, hospital, ambulance and ETA — but no phones or medical details', async () => {
    const civil = await addPartner(CIVIL, 'civil', 'ALS')
    const patient = await patientWithContact()
    const sos = await patient.post('/api/sos').send({ ...PICKUP, phone: PATIENT_PHONE, note: 'crushing chest pain since 10 min', category: 'chest_pain' }).expect(201)
    await settle()
    const token = sms[0]!.text.match(/\/track\/([\w-]+)/)![1]!

    const before = (await request(app).get(`/api/track/${token}`).expect(200)).body
    expect(before.status).toBe('searching')

    await civil.agent.post(`/api/console/offers/${sos.body.id}/accept`).send({ ambulanceId: civil.ambId }).expect(200)
    const after = (await request(app).get(`/api/track/${token}`).expect(200)).body
    expect(after).toMatchObject({ status: 'assigned', hospital: { name: 'District Civil Hospital, Sonipat' }, ambulance: { vehicleNumber: 'HR-civil', kind: 'ALS' } })
    expect(after.eta.minutes).toBeGreaterThan(0)
    expect(after.pickup).toEqual({ lat: PICKUP.lat, lng: PICKUP.lng })

    const json = JSON.stringify(after)
    for (const secret of [PATIENT_PHONE, CONTACT_PHONE, DRIVER_PHONE, 'Ramesh', 'Asha', 'crushing', 'Chest pain', 'chest_pain', 'Penicillin', 'O-', 'ALS) ambulance first']) {
      expect(json, `leaked ${secret}`).not.toContain(secret)
    }
    for (const key of ['phone', 'driverPhone', 'driverName', 'note', 'category', 'categoryLabel', 'bloodGroup', 'allergies', 'advisories', 'patient']) {
      expect(json, `has key ${key}`).not.toContain(`"${key}"`)
    }
  })

  it('expires 12 hours after the trip ends, and unknown links are rejected', async () => {
    const civil = await addPartner(CIVIL, 'civil', 'ALS')
    const patient = await patientWithContact()
    const sos = await patient.post('/api/sos').send({ ...PICKUP, phone: PATIENT_PHONE }).expect(201)
    await settle()
    const token = sms[0]!.text.match(/\/track\/([\w-]+)/)![1]!
    const { body } = await civil.agent.post(`/api/console/offers/${sos.body.id}/accept`).send({ ambulanceId: civil.ambId }).expect(200)
    const driver = body.driverPath.replace('/driver/', '')
    await request(app).post(`/api/driver/${driver}/status`).send({ status: 'completed' }).expect(200)

    const done = (await request(app).get(`/api/track/${token}`).expect(200)).body
    expect(done.status).toBe('completed')
    expect(Date.parse(done.expiresAt) - Date.parse(done.endedAt)).toBe(12 * 3600_000)

    const hoursAgo = (h: number) => new Date(Date.now() - h * 3600_000).toISOString()
    db.prepare('UPDATE incidents SET ended_at = ? WHERE id = ?').run(hoursAgo(11), sos.body.id)
    await request(app).get(`/api/track/${token}`).expect(200)
    db.prepare('UPDATE incidents SET ended_at = ? WHERE id = ?').run(hoursAgo(13), sos.body.id)
    await request(app).get(`/api/track/${token}`).expect(410)
    await request(app).get(`/api/track/${token}/stream`).expect(410)

    await request(app).get('/api/track/not-a-real-token').expect(404)
  })

  it('cancelled and unanswered requests also start the 12-hour clock', async () => {
    await addPartner(GOHANA, 'gohana', 'BLS')
    const patient = await patientWithContact()
    const sos = await patient.post('/api/sos').send({ ...PICKUP, phone: PATIENT_PHONE }).expect(201)
    await patient.post(`/api/sos/${sos.body.id}/cancel`).send({}).expect(200)
    const row = db.prepare('SELECT ended_at FROM incidents WHERE id = ?').get(sos.body.id) as { ended_at: string | null }
    expect(row.ended_at).not.toBeNull()
  })
})

describe('3 · quick buttons: serious cases prefer ALS, never block', () => {
  it('alerts ALS hospitals first, then BLS-only hospitals after the head start', async () => {
    const civil = await addPartner(CIVIL, 'civil', 'ALS')
    const park = await addPartner(PARK, 'park', 'BLS')
    const sos = await request.agent(app).post('/api/sos').send({ ...PICKUP, phone: PATIENT_PHONE, category: 'chest_pain' }).expect(201)
    expect(sos.body.search.alsPreferred).toBe(true)
    expect(await offersFor(civil)).toEqual([expect.objectContaining({ incidentId: sos.body.id, categoryLabel: 'Chest pain', alsPreferred: true })])
    expect(await offersFor(park)).toHaveLength(0)

    await vi.advanceTimersByTimeAsync(HEAD_START)
    expect(await offersFor(park)).toHaveLength(1)
  })

  it('a BLS hospital can still take a serious case once alerted', async () => {
    await addPartner(CIVIL, 'civil', 'ALS')
    const park = await addPartner(PARK, 'park', 'BLS')
    const patient = request.agent(app)
    const sos = await patient.post('/api/sos').send({ ...PICKUP, phone: PATIENT_PHONE, category: 'unconscious' }).expect(201)
    await vi.advanceTimersByTimeAsync(HEAD_START)
    await park.agent.post(`/api/console/offers/${sos.body.id}/accept`).send({ ambulanceId: park.ambId }).expect(200)
    expect((await patient.get(`/api/sos/${sos.body.id}`)).body.ambulance.kind).toBe('BLS')
  })

  it('if every ALS hospital declines, BLS-only hospitals are alerted at once in the same ring', async () => {
    const civil = await addPartner(CIVIL, 'civil', 'ALS')
    const park = await addPartner(PARK, 'park', 'BLS')
    const patient = request.agent(app)
    const sos = await patient.post('/api/sos').send({ ...PICKUP, phone: PATIENT_PHONE, category: 'breathing' }).expect(201)
    await civil.agent.post(`/api/console/offers/${sos.body.id}/decline`).send({}).expect(200)
    expect(await offersFor(park)).toHaveLength(1)
    expect((await patient.get(`/api/sos/${sos.body.id}`)).body.search.wave).toBe(1)
  })

  it('with no ALS ambulance nearby, BLS hospitals are alerted immediately', async () => {
    const park = await addPartner(PARK, 'park', 'BLS')
    await request.agent(app).post('/api/sos').send({ ...PICKUP, phone: PATIENT_PHONE, category: 'accident' }).expect(201)
    expect(await offersFor(park)).toHaveLength(1)
  })

  it('non-serious cases alert everyone at once', async () => {
    const civil = await addPartner(CIVIL, 'civil', 'ALS')
    const park = await addPartner(PARK, 'park', 'BLS')
    const sos = await request.agent(app).post('/api/sos').send({ ...PICKUP, phone: PATIENT_PHONE, category: 'pregnancy' }).expect(201)
    expect(sos.body.search.alsPreferred).toBe(false)
    expect(await offersFor(civil)).toHaveLength(1)
    expect(await offersFor(park)).toHaveLength(1)
  })

  it('the accepting hospital sees what happened', async () => {
    const civil = await addPartner(CIVIL, 'civil', 'ALS')
    const sos = await request.agent(app).post('/api/sos').send({ ...PICKUP, phone: PATIENT_PHONE, category: 'chest_pain' }).expect(201)
    const res = await civil.agent.post(`/api/console/offers/${sos.body.id}/accept`).send({ ambulanceId: civil.ambId }).expect(200)
    expect(res.body.trip.patient.categoryLabel).toBe('Chest pain')
  })

  it('rejects an unknown category', async () => {
    await request.agent(app).post('/api/sos').send({ ...PICKUP, phone: PATIENT_PHONE, category: 'headache' }).expect(400)
  })
})

describe('4 · road-accident advisory', () => {
  it('shows the free-treatment notice for accidents only', async () => {
    await addPartner(CIVIL, 'civil', 'ALS')
    const accident = await request.agent(app).post('/api/sos').send({ ...PICKUP, phone: PATIENT_PHONE, category: 'accident' }).expect(201)
    expect(accident.body.categoryLabel).toBe('Accident')
    expect(accident.body.advisories).toEqual([{
      id: 'road_accident_cashless',
      text: 'Road accident victims get free treatment up to ₹1.5 lakh for 7 days at designated hospitals. Don’t pay a deposit first.',
    }])
    const other = await request.agent(app).post('/api/sos').send({ ...PICKUP, phone: '9812345679', category: 'chest_pain' }).expect(201)
    expect(other.body.advisories).toEqual([])
  })
})
