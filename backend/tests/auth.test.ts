import request from 'supertest'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp } from '../src/app.js'
import { importFacilities, openDb, type DB } from '../src/db.js'
import { Dispatcher } from '../src/services/dispatch.js'

let db: DB
let dispatcher: Dispatcher
let app: ReturnType<typeof createApp>
const PHONE = '9812345678'
const CIVIL = 'pmjay-hosp6g03224'

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => undefined)
  db = openDb(':memory:')
  importFacilities(db)
  dispatcher = new Dispatcher(db, { waveRadiiKm: [8], waveTimeoutMs: 30_000, maxOffersPerWave: 6, simulate: false })
  app = createApp(db, dispatcher)
})
afterEach(() => {
  dispatcher.stop()
  vi.restoreAllMocks()
})

async function signIn(agent: ReturnType<typeof request.agent>, phone = PHONE) {
  const sent = await agent.post('/api/auth/otp/request').send({ phone }).expect(200)
  expect(sent.body.devCode).toMatch(/^\d{6}$/)
  return agent.post('/api/auth/otp/verify').send({ phone, code: sent.body.devCode })
}

describe('patient sign-in with OTP', () => {
  it('signs a new person in and marks the number verified', async () => {
    const agent = request.agent(app)
    const res = await signIn(agent)
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ signedIn: true, phone: PHONE })
    expect((await agent.get('/api/me')).body.signedIn).toBe(true)
  })

  it('rejects a wrong code and locks after five tries', async () => {
    const agent = request.agent(app)
    const sent = await agent.post('/api/auth/otp/request').send({ phone: PHONE }).expect(200)
    const wrong = sent.body.devCode === '000000' ? '111111' : '000000'
    for (let i = 0; i < 5; i++) {
      const r = await agent.post('/api/auth/otp/verify').send({ phone: PHONE, code: wrong })
      expect(r.status).toBe(400)
    }
    await agent.post('/api/auth/otp/verify').send({ phone: PHONE, code: sent.body.devCode }).expect(429)
  })

  it('makes people wait before resending, and caps sends per number', async () => {
    const agent = request.agent(app)
    await agent.post('/api/auth/otp/request').send({ phone: PHONE }).expect(200)
    await agent.post('/api/auth/otp/request').send({ phone: PHONE }).expect(429)
  })

  it('codes are single-use', async () => {
    const agent = request.agent(app)
    const sent = await agent.post('/api/auth/otp/request').send({ phone: PHONE }).expect(200)
    await agent.post('/api/auth/otp/verify').send({ phone: PHONE, code: sent.body.devCode }).expect(200)
    await agent.post('/api/auth/otp/verify').send({ phone: PHONE, code: sent.body.devCode }).expect(400)
  })

  it('keeps a guest profile when that device signs in for the first time', async () => {
    const agent = request.agent(app)
    await agent.put('/api/me').send({ name: 'Asha', bloodGroup: 'B+' }).expect(200)
    const res = await signIn(agent)
    expect(res.body).toMatchObject({ signedIn: true, name: 'Asha', bloodGroup: 'B+' })
  })

  it('a second phone signing in to the same number gets the account and brings its guest history', async () => {
    const phoneA = request.agent(app)
    await phoneA.put('/api/me').send({ name: 'Asha' }).expect(200)
    await signIn(phoneA)

    const phoneB = request.agent(app)
    const date = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10)
    await phoneB.post('/api/appointments').send({
      hospitalId: CIVIL, department: 'General OPD', preferredDate: date, preferredSlot: 'morning', patientName: 'Asha', patientPhone: PHONE,
    }).expect(201)
    await phoneB.put('/api/me').send({ allergies: 'Penicillin' }).expect(200)

    const res = await signIn(phoneB)
    expect(res.body).toMatchObject({ name: 'Asha', allergies: 'Penicillin', signedIn: true })
    // Both phones now see the same account, including phone B's earlier appointment.
    expect((await phoneA.get('/api/appointments')).body.data).toHaveLength(1)
    expect((await phoneA.get('/api/me')).body.allergies).toBe('Penicillin')
  })

  it('a verified number cannot be swapped by editing the profile', async () => {
    const agent = request.agent(app)
    await signIn(agent)
    await agent.put('/api/me').send({ phone: '9999999999' }).expect(400)
    await agent.put('/api/me').send({ phone: PHONE, name: 'Same number is fine' }).expect(200)
  })

  it('logout ends this device session but keeps the account', async () => {
    const agent = request.agent(app)
    await signIn(agent)
    await agent.put('/api/me').send({ name: 'Asha' }).expect(200)
    await agent.post('/api/auth/logout').send({}).expect(200)
    expect((await agent.get('/api/me')).body).toMatchObject({ signedIn: false, name: null })
    const again = await signIn(agent)
    expect(again.body.name).toBe('Asha')
  })

  it('rejects malformed input', async () => {
    await request(app).post('/api/auth/otp/request').send({ phone: '12345' }).expect(400)
    await request(app).post('/api/auth/otp/verify').send({ phone: PHONE, code: '12' }).expect(400)
  })
})

describe('profile medical details', () => {
  it('saves blood group, allergies and Ayushman usage, and validates them', async () => {
    const agent = request.agent(app)
    const res = await agent.put('/api/me').send({ bloodGroup: 'O-', allergies: 'Peanuts', hasPmjay: true, pmjayUsed: 90_000 }).expect(200)
    expect(res.body).toMatchObject({ bloodGroup: 'O-', allergies: 'Peanuts', hasPmjay: true, pmjayUsed: 90_000 })
    await agent.put('/api/me').send({ bloodGroup: 'Z+' }).expect(400)
    await agent.put('/api/me').send({ pmjayUsed: 600_000 }).expect(400)
  })
})
