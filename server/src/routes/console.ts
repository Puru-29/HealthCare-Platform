import { Router } from 'express'
import { z } from 'zod'
import type { DB } from '../db.js'
import { tx } from '../db.js'
import { SPECIALTY_KEYS, type SpecialtyKey } from '../domain/specialties.js'
import { STAFF_COOKIE, rateLimit, requireStaff } from '../lib/auth.js'
import { HttpError, notFound, param, parse } from '../lib/http.js'
import { hashToken, newId, newToken, normalizeIndianMobile, readCookie, setCookie, verifyPassword } from '../lib/security.js'
import { channels, publish, subscribe } from '../lib/sse.js'
import type { Dispatcher } from '../services/dispatch.js'
import { getHospital, present } from '../services/hospitals.js'
import { presentAppointment } from './patient.js'

const mobile = z.string().max(20).transform((v, ctx) => {
  const n = normalizeIndianMobile(v)
  if (!n) ctx.addIssue({ code: 'custom', message: 'Enter a 10-digit mobile number' })
  return n ?? ''
})

export function consoleRoutes(db: DB, dispatcher: Dispatcher) {
  const r = Router()

  r.post('/login', rateLimit('console-login', 10, 15 * 60_000), async (req, res) => {
    const body = parse(z.object({ username: z.string().trim().toLowerCase().min(1).max(80), password: z.string().min(1).max(200) }), req.body)
    const staff = db.prepare('SELECT id, password_hash FROM staff WHERE username = ?').get(body.username) as { id: string; password_hash: string } | undefined
    // Verify against a dummy hash when the user is unknown so timing doesn't reveal usernames.
    const ok = await verifyPassword(body.password, staff?.password_hash ?? 'scrypt$AAAAAAAAAAAAAAAAAAAAAA$' + 'A'.repeat(86))
    if (!staff || !ok) throw new HttpError(401, 'Wrong username or password', 'bad_credentials')
    const token = newToken()
    db.prepare(`INSERT INTO staff_sessions (token_hash, staff_id, expires_at) VALUES (?, ?, ?)`).run(hashToken(token), staff.id, new Date(Date.now() + 12 * 3600_000).toISOString())
    db.prepare(`DELETE FROM staff_sessions WHERE expires_at < ?`).run(new Date().toISOString())
    setCookie(res, STAFF_COOKIE, token, 0.5)
    res.json({ ok: true })
  })

  r.post('/logout', (req, res) => {
    const token = readCookie(req, STAFF_COOKIE)
    if (token) db.prepare('DELETE FROM staff_sessions WHERE token_hash = ?').run(hashToken(token))
    res.clearCookie(STAFF_COOKIE, { path: '/' })
    res.json({ ok: true })
  })

  r.use(requireStaff(db))

  r.get('/me', (req, res) => {
    const h = getHospital(db, req.staff!.hospitalId)!
    res.json({ staff: { username: req.staff!.username, displayName: req.staff!.displayName }, hospital: present(h) })
  })

  r.get('/stream', (req, res) => {
    subscribe(req, res, [channels.hospital(req.staff!.hospitalId)])
  })

  r.get('/dashboard', (req, res) => {
    const hid = req.staff!.hospitalId
    const h = getHospital(db, hid)!
    res.json({
      hospital: present(h),
      offers: dispatcher.offersFor(hid),
      trips: dispatcher.tripsFor(hid),
      ambulances: db.prepare(`SELECT id, vehicle_number AS vehicleNumber, kind, driver_name AS driverName, driver_phone AS driverPhone, status, simulated FROM ambulances WHERE hospital_id = ? ORDER BY vehicle_number`).all(hid),
      appointments: (db.prepare(`
        SELECT a.*, h.name AS hospital_name, h.phone AS hospital_phone FROM appointments a JOIN hospitals h ON h.id = a.hospital_id
        WHERE a.hospital_id = ? AND (a.status IN ('requested','confirmed') AND a.preferred_date >= date('now', '-1 day'))
        ORDER BY a.preferred_date, a.created_at
      `).all(hid)).map(presentAppointment),
      recent: db.prepare(`
        SELECT id, status, created_at AS createdAt, accepted_at AS acceptedAt, completed_at AS completedAt
        FROM incidents WHERE hospital_id = ? AND status IN ('completed','cancelled') ORDER BY created_at DESC LIMIT 10
      `).all(hid),
    })
  })

  // ---------- SOS offers & trips ----------

  r.post('/offers/:incidentId/accept', (req, res) => {
    const body = parse(z.object({ ambulanceId: z.string().max(120) }), req.body)
    const incidentId = param(req, 'incidentId')
    const { driverToken } = dispatcher.accept(incidentId, req.staff!.hospitalId, body.ambulanceId)
    res.json({ driverPath: `/driver/${driverToken}`, trip: dispatcher.driverView(incidentId) })
  })

  r.post('/offers/:incidentId/decline', (req, res) => {
    dispatcher.decline(param(req, 'incidentId'), req.staff!.hospitalId)
    res.json({ ok: true })
  })

  const ownTrip = (hospitalId: string, incidentId: string) => {
    const row = db.prepare('SELECT hospital_id FROM incidents WHERE id = ?').get(incidentId) as { hospital_id: string | null } | undefined
    if (!row || row.hospital_id !== hospitalId) throw notFound('Trip not found')
  }

  r.post('/trips/:incidentId/status', (req, res) => {
    const body = parse(z.object({ status: z.enum(['arrived', 'to_hospital', 'completed']) }), req.body)
    const id = param(req, 'incidentId')
    ownTrip(req.staff!.hospitalId, id)
    dispatcher.advance(id, body.status)
    res.json({ ok: true })
  })

  r.post('/trips/:incidentId/driver-link', (req, res) => {
    const { driverToken } = dispatcher.regenerateDriverLink(param(req, 'incidentId'), req.staff!.hospitalId)
    res.json({ driverPath: `/driver/${driverToken}` })
  })

  // ---------- fleet ----------

  const ambulanceBody = z.object({
    vehicleNumber: z.string().trim().toUpperCase().min(4).max(20),
    kind: z.enum(['BLS', 'ALS', 'PTV']),
    driverName: z.string().trim().min(2).max(80),
    driverPhone: mobile,
  })

  r.post('/ambulances', (req, res) => {
    const body = parse(ambulanceBody, req.body)
    const h = getHospital(db, req.staff!.hospitalId)!
    const id = newId()
    db.prepare(`INSERT INTO ambulances (id, hospital_id, vehicle_number, kind, driver_name, driver_phone, status, lat, lng, location_at) VALUES (?, ?, ?, ?, ?, ?, 'available', ?, ?, ?)`)
      .run(id, h.id, body.vehicleNumber, body.kind, body.driverName, body.driverPhone, h.location?.lat ?? null, h.location?.lng ?? null, h.location ? new Date().toISOString() : null)
    res.status(201).json({ id })
  })

  r.patch('/ambulances/:id', (req, res) => {
    const body = parse(ambulanceBody.partial().extend({ status: z.enum(['available', 'offline']).optional() }), req.body)
    const id = param(req, 'id')
    const amb = db.prepare('SELECT * FROM ambulances WHERE id = ? AND hospital_id = ?').get(id, req.staff!.hospitalId) as Record<string, unknown> | undefined
    if (!amb) throw notFound('Ambulance not found')
    if (body.status && amb.status === 'busy') throw new HttpError(409, 'This ambulance is on a trip', 'busy')
    db.prepare(`UPDATE ambulances SET vehicle_number = ?, kind = ?, driver_name = ?, driver_phone = ?, status = ? WHERE id = ?`).run(
      body.vehicleNumber ?? (amb.vehicle_number as string), body.kind ?? (amb.kind as string), body.driverName ?? (amb.driver_name as string),
      body.driverPhone ?? (amb.driver_phone as string), body.status ?? (amb.status as string), id,
    )
    res.json({ ok: true })
  })

  // ---------- appointments ----------

  r.post('/appointments/:id', (req, res) => {
    const body = parse(z.discriminatedUnion('action', [
      z.object({ action: z.literal('confirm'), confirmedFor: z.string().min(10).max(40), note: z.string().trim().max(300).optional() }),
      z.object({ action: z.literal('decline'), note: z.string().trim().min(3).max(300) }),
    ]), req.body)
    const result = db.prepare(`
      UPDATE appointments SET status = ?, confirmed_for = ?, hospital_note = ?, updated_at = datetime('now')
      WHERE id = ? AND hospital_id = ? AND status IN ('requested','confirmed')
    `).run(body.action === 'confirm' ? 'confirmed' : 'declined', body.action === 'confirm' ? body.confirmedFor : null, body.note ?? null, param(req, 'id'), req.staff!.hospitalId)
    if (result.changes !== 1) throw notFound('Appointment not found or already closed')
    res.json({ ok: true })
  })

  // ---------- hospital profile (becomes "verified") ----------

  r.put('/profile', (req, res) => {
    const body = parse(z.object({
      phone: mobile.or(z.string().regex(/^0\d{9,11}$/)).nullable(),
      emergency24x7: z.boolean(),
      specialties: z.array(z.enum(SPECIALTY_KEYS as [SpecialtyKey, ...SpecialtyKey[]])).max(SPECIALTY_KEYS.length),
      insurers: z.array(z.string().trim().min(2).max(80)).max(60),
      location: z.object({ lat: z.number().min(28.5).max(29.6), lng: z.number().min(76.3).max(77.5) }).nullable().optional(),
    }), req.body)
    const hid = req.staff!.hospitalId
    tx(db, () => {
      db.prepare(`UPDATE hospitals SET phone = ?, emergency_24x7 = ?, verified = 1, updated_by_hospital_at = datetime('now') WHERE id = ?`).run(body.phone, body.emergency24x7 ? 1 : 0, hid)
      if (body.location) db.prepare(`UPDATE hospitals SET lat = ?, lng = ?, geo_source = 'hospital', geo_precision = 'building' WHERE id = ?`).run(body.location.lat, body.location.lng, hid)
      // The hospital's own list replaces everything inferred.
      db.prepare('DELETE FROM hospital_specialties WHERE hospital_id = ?').run(hid)
      const add = db.prepare(`INSERT INTO hospital_specialties (hospital_id, key, source) VALUES (?, ?, 'hospital_verified')`)
      for (const s of new Set(body.specialties)) add.run(hid, s)
      db.prepare('DELETE FROM hospital_insurers WHERE hospital_id = ?').run(hid)
      const addIns = db.prepare('INSERT OR IGNORE INTO hospital_insurers (hospital_id, insurer) VALUES (?, ?)')
      for (const i of body.insurers) addIns.run(hid, i)
    })
    publish(channels.hospital(hid), 'refresh', { reason: 'profile' })
    res.json(present(getHospital(db, hid)!))
  })

  return r
}
