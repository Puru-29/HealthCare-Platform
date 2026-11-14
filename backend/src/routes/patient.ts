import { Router } from 'express'
import { z } from 'zod'
import type { DB } from '../db.js'
import { findPatient, getOrCreatePatient, rateLimit, type PatientRow } from '../lib/auth.js'
import { HttpError, notFound, param, parse } from '../lib/http.js'
import { newId, normalizeIndianMobile } from '../lib/security.js'
import { channels, subscribe } from '../lib/sse.js'
import type { Dispatcher } from '../services/dispatch.js'

const phone = z.string().max(20).transform((v, ctx) => {
  const n = normalizeIndianMobile(v)
  if (!n) ctx.addIssue({ code: 'custom', message: 'Enter a 10-digit Indian mobile number' })
  return n ?? ''
})
const optionalText = (max: number) => z.string().trim().max(max).transform((v) => v || null).nullable().optional()

export const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'O+', 'O-', 'AB+', 'AB-'] as const

export function presentPatient(p: PatientRow | null) {
  return {
    signedIn: !!p?.phone_verified_at,
    name: p?.name ?? null,
    phone: p?.phone ?? null,
    emergencyContactName: p?.emergency_contact_name ?? null,
    emergencyContactPhone: p?.emergency_contact_phone ?? null,
    bloodGroup: p?.blood_group ?? null,
    allergies: p?.allergies ?? null,
    hasPmjay: !!p?.has_pmjay,
    pmjayUsed: p?.pmjay_used ?? null,
    insurer: p?.insurer ?? null,
    sumInsured: p?.sum_insured ?? null,
  }
}

export function patientRoutes(db: DB, dispatcher: Dispatcher) {
  const r = Router()

  r.get('/me', (req, res) => {
    const p = findPatient(db, req)
    const active = p
      ? (db.prepare(`SELECT id FROM incidents WHERE patient_id = ? AND status IN ('searching','assigned','arrived','to_hospital') ORDER BY created_at DESC LIMIT 1`).get(p.id) as { id: string } | undefined)
      : undefined
    res.json({ ...presentPatient(p), activeSosId: active?.id ?? null })
  })

  r.put('/me', (req, res) => {
    const body = parse(z.object({
      name: optionalText(80),
      phone: phone.nullable().optional(),
      emergencyContactName: optionalText(80),
      emergencyContactPhone: phone.nullable().optional(),
      bloodGroup: z.enum(BLOOD_GROUPS).nullable().optional(),
      allergies: optionalText(200),
      hasPmjay: z.boolean().optional(),
      pmjayUsed: z.number().int().min(0).max(500_000).nullable().optional(),
      insurer: optionalText(80),
      sumInsured: z.number().int().min(0).max(100_000_000).nullable().optional(),
    }), req.body)
    const p = getOrCreatePatient(db, req, res)
    // A verified number is the account's identity and the number crews call; changing it needs a new sign-in.
    if (p.phone_verified_at && body.phone !== undefined && body.phone !== p.phone) {
      throw new HttpError(400, 'Your mobile number is verified. To use a different number, sign out and sign in with it.', 'phone_locked')
    }
    const pick = <T>(value: T | undefined, current: T) => (value !== undefined ? value : current)
    db.prepare(`
      UPDATE patients SET name = ?, phone = ?, emergency_contact_name = ?, emergency_contact_phone = ?, blood_group = ?, allergies = ?,
        has_pmjay = ?, pmjay_used = ?, insurer = ?, sum_insured = ?
      WHERE id = ?
    `).run(
      pick(body.name, p.name),
      pick(body.phone, p.phone),
      pick(body.emergencyContactName, p.emergency_contact_name),
      pick(body.emergencyContactPhone, p.emergency_contact_phone),
      pick(body.bloodGroup, p.blood_group),
      pick(body.allergies, p.allergies),
      body.hasPmjay !== undefined ? (body.hasPmjay ? 1 : 0) : p.has_pmjay,
      pick(body.pmjayUsed, p.pmjay_used),
      pick(body.insurer, p.insurer),
      pick(body.sumInsured, p.sum_insured),
      p.id,
    )
    res.json(presentPatient(db.prepare('SELECT * FROM patients WHERE id = ?').get(p.id) as unknown as PatientRow))
  })

  // ---------- SOS ----------

  r.post('/sos', rateLimit('sos', 5, 60_000), (req, res) => {
    const body = parse(z.object({
      lat: z.number().min(-90).max(90),
      lng: z.number().min(-180).max(180),
      accuracyM: z.number().min(0).max(100_000).nullable().optional(),
      name: optionalText(80),
      phone,
      note: optionalText(280),
    }), req.body)
    const p = getOrCreatePatient(db, req, res)
    // Remember the number so the next SOS is one tap.
    if (!p.phone || (body.name && !p.name)) {
      db.prepare('UPDATE patients SET phone = COALESCE(phone, ?), name = COALESCE(name, ?) WHERE id = ?').run(body.phone, body.name ?? null, p.id)
    }
    const id = dispatcher.create({
      patientId: p.id,
      name: body.name ?? p.name,
      phone: body.phone,
      note: body.note ?? null,
      pickup: { lat: body.lat, lng: body.lng },
      accuracyM: body.accuracyM ?? null,
    })
    res.status(201).json(dispatcher.view(id))
  })

  const ownIncident = (req: Parameters<Parameters<typeof r.get>[1]>[0]) => {
    const p = findPatient(db, req)
    const id = param(req, 'id')
    const row = db.prepare('SELECT patient_id FROM incidents WHERE id = ?').get(id) as { patient_id: string | null } | undefined
    if (!row) throw notFound('Emergency request not found')
    if (!p || row.patient_id !== p.id) throw new HttpError(403, 'This request belongs to another device', 'forbidden')
    return id
  }

  r.get('/sos/:id', (req, res) => {
    res.json(dispatcher.view(ownIncident(req)))
  })

  r.get('/sos/:id/stream', (req, res) => {
    const id = ownIncident(req)
    subscribe(req, res, [channels.incident(id)], { event: 'incident', data: dispatcher.view(id) })
  })

  r.post('/sos/:id/cancel', (req, res) => {
    const id = ownIncident(req)
    dispatcher.cancel(id, 'Cancelled by the patient.')
    res.json(dispatcher.view(id))
  })

  // ---------- appointments ----------

  r.get('/appointments', (req, res) => {
    const p = findPatient(db, req)
    if (!p) { res.json({ data: [] }); return }
    const rows = db.prepare(`
      SELECT a.*, h.name AS hospital_name, h.phone AS hospital_phone
      FROM appointments a JOIN hospitals h ON h.id = a.hospital_id
      WHERE a.patient_id = ? ORDER BY a.created_at DESC
    `).all(p.id)
    res.json({ data: rows.map(presentAppointment) })
  })

  r.post('/appointments', rateLimit('appointments', 10, 60_000), (req, res) => {
    const body = parse(z.object({
      hospitalId: z.string().max(120),
      department: z.string().trim().min(2).max(80),
      preferredDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      preferredSlot: z.enum(['morning', 'afternoon', 'evening']),
      reason: optionalText(500),
      patientName: z.string().trim().min(2).max(80),
      patientPhone: phone,
    }), req.body)
    const today = new Date().toISOString().slice(0, 10)
    if (body.preferredDate < today) throw new HttpError(400, 'Pick today or a later date', 'invalid_input')
    const hospital = db.prepare('SELECT id FROM hospitals WHERE id = ?').get(body.hospitalId)
    if (!hospital) throw notFound('Hospital not found')
    const p = getOrCreatePatient(db, req, res)
    const id = newId()
    db.prepare(`
      INSERT INTO appointments (id, patient_id, hospital_id, department, preferred_date, preferred_slot, reason, patient_name, patient_phone)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, p.id, body.hospitalId, body.department, body.preferredDate, body.preferredSlot, body.reason ?? null, body.patientName, body.patientPhone)
    if (!p.name || !p.phone) db.prepare('UPDATE patients SET name = COALESCE(name, ?), phone = COALESCE(phone, ?) WHERE id = ?').run(body.patientName, body.patientPhone, p.id)
    const row = db.prepare(`SELECT a.*, h.name AS hospital_name, h.phone AS hospital_phone FROM appointments a JOIN hospitals h ON h.id = a.hospital_id WHERE a.id = ?`).get(id)
    res.status(201).json(presentAppointment(row))
  })

  r.post('/appointments/:id/cancel', (req, res) => {
    const p = findPatient(db, req)
    if (!p) throw new HttpError(403, 'Not your appointment', 'forbidden')
    const result = db.prepare(`UPDATE appointments SET status = 'cancelled', updated_at = datetime('now') WHERE id = ? AND patient_id = ? AND status IN ('requested','confirmed')`).run(param(req, 'id'), p.id)
    if (result.changes !== 1) throw notFound('Appointment not found or already closed')
    res.json({ ok: true })
  })

  return r
}

export function presentAppointment(row: unknown) {
  const a = row as Record<string, string | null>
  return {
    id: a.id,
    hospitalId: a.hospital_id,
    hospitalName: a.hospital_name,
    hospitalPhone: a.hospital_phone,
    department: a.department,
    preferredDate: a.preferred_date,
    preferredSlot: a.preferred_slot,
    reason: a.reason,
    patientName: a.patient_name,
    patientPhone: a.patient_phone,
    status: a.status,
    confirmedFor: a.confirmed_for,
    hospitalNote: a.hospital_note,
    createdAt: a.created_at,
  }
}
