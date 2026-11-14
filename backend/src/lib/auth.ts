import type { NextFunction, Request, RequestHandler, Response } from 'express'
import type { DB } from '../db.js'
import { HttpError } from './http.js'
import { hashToken, newId, newToken, readCookie, setCookie } from './security.js'

export const PATIENT_COOKIE = 'cp_pid'
export const STAFF_COOKIE = 'cp_staff'

export interface PatientRow {
  id: string
  name: string | null
  phone: string | null
  emergency_contact_name: string | null
  emergency_contact_phone: string | null
  has_pmjay: number
  insurer: string | null
  sum_insured: number | null
  blood_group: string | null
  allergies: string | null
  pmjay_used: number | null
  phone_verified_at: string | null
}

/**
 * Patients are identified by a device session cookie — no sign-up stands
 * between a person and the SOS button. Signing in with a mobile OTP links the
 * device to a verified account, so details follow the person across devices.
 */
export function findPatient(db: DB, req: Request): PatientRow | null {
  const token = readCookie(req, PATIENT_COOKIE)
  if (!token) return null
  return (db.prepare(`
    SELECT p.* FROM patient_sessions s JOIN patients p ON p.id = s.patient_id WHERE s.token_hash = ?
  `).get(hashToken(token)) as unknown as PatientRow | undefined) ?? null
}

/** Start a session on this device for `patientId` (sets the cookie). */
export function startPatientSession(db: DB, res: Response, patientId: string) {
  const token = newToken()
  db.prepare('INSERT INTO patient_sessions (token_hash, patient_id) VALUES (?, ?)').run(hashToken(token), patientId)
  setCookie(res, PATIENT_COOKIE, token, 365)
}

export function endPatientSession(db: DB, req: Request, res: Response) {
  const token = readCookie(req, PATIENT_COOKIE)
  if (token) db.prepare('DELETE FROM patient_sessions WHERE token_hash = ?').run(hashToken(token))
  res.clearCookie(PATIENT_COOKIE, { path: '/' })
}

export function createPatient(db: DB, fields: { phone?: string; verified?: boolean } = {}): string {
  const id = newId()
  // session_hash is a legacy NOT NULL column; sessions now live in patient_sessions.
  db.prepare('INSERT INTO patients (id, session_hash, phone, phone_verified_at) VALUES (?, ?, ?, ?)')
    .run(id, hashToken(newToken()), fields.phone ?? null, fields.verified ? new Date().toISOString() : null)
  return id
}

export function getOrCreatePatient(db: DB, req: Request, res: Response): PatientRow {
  const existing = findPatient(db, req)
  if (existing) return existing
  const id = createPatient(db)
  startPatientSession(db, res, id)
  return db.prepare('SELECT * FROM patients WHERE id = ?').get(id) as unknown as PatientRow
}

export interface StaffContext {
  staffId: string
  hospitalId: string
  username: string
  displayName: string
}

declare module 'express-serve-static-core' {
  interface Request {
    staff?: StaffContext
  }
}

export function requireStaff(db: DB): RequestHandler {
  return (req, _res, next) => {
    const token = readCookie(req, STAFF_COOKIE)
    if (!token) throw new HttpError(401, 'Please sign in', 'unauthenticated')
    const row = db.prepare(`
      SELECT s.id AS staffId, s.hospital_id AS hospitalId, s.username, s.display_name AS displayName, ss.expires_at AS expiresAt
      FROM staff_sessions ss JOIN staff s ON s.id = ss.staff_id
      WHERE ss.token_hash = ?
    `).get(hashToken(token)) as (StaffContext & { expiresAt: string }) | undefined
    if (!row || Date.parse(row.expiresAt) < Date.now()) throw new HttpError(401, 'Session expired — please sign in again', 'unauthenticated')
    req.staff = { staffId: row.staffId, hospitalId: row.hospitalId, username: row.username, displayName: row.displayName }
    next()
  }
}

/**
 * Mutating requests must be JSON. Browsers cannot send cross-site JSON without a
 * CORS preflight (which this API never approves), so this blocks CSRF via forms.
 */
export function requireJsonForWrites(req: Request, _res: Response, next: NextFunction) {
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') return next()
  const type = req.headers['content-type'] ?? ''
  if (!type.toLowerCase().startsWith('application/json')) throw new HttpError(415, 'Requests must be JSON', 'unsupported_media_type')
  next()
}

/** Fixed-window in-memory limiter, keyed by IP + bucket. Fine for one instance. */
export function rateLimit(bucket: string, max: number, windowMs: number): RequestHandler {
  const hits = new Map<string, { count: number; resetAt: number }>()
  return (req, _res, next) => {
    const key = `${bucket}:${req.ip}`
    const nowMs = Date.now()
    const entry = hits.get(key)
    if (!entry || entry.resetAt < nowMs) hits.set(key, { count: 1, resetAt: nowMs + windowMs })
    else if (++entry.count > max) throw new HttpError(429, 'Too many requests — please wait a moment', 'rate_limited')
    if (hits.size > 10_000) for (const [k, v] of hits) if (v.resetAt < nowMs) hits.delete(k)
    next()
  }
}
