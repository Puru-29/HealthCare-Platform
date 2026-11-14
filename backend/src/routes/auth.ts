import { randomInt, timingSafeEqual } from 'node:crypto'
import { Router } from 'express'
import { z } from 'zod'
import { tx, type DB } from '../db.js'
import { createPatient, endPatientSession, findPatient, rateLimit, startPatientSession, type PatientRow } from '../lib/auth.js'
import { HttpError, parse } from '../lib/http.js'
import { hashToken, normalizeIndianMobile } from '../lib/security.js'
import { exposeDevCodes, sendOtp } from '../lib/sms.js'
import { presentPatient } from './patient.js'

const CODE_TTL_MS = 5 * 60_000
const RESEND_AFTER_MS = 30_000
const MAX_ATTEMPTS = 5
const MAX_SENDS_PER_WINDOW = 3
const SEND_WINDOW_MS = 10 * 60_000

const phoneSchema = z.string().max(20).transform((v, ctx) => {
  const n = normalizeIndianMobile(v)
  if (!n) ctx.addIssue({ code: 'custom', message: 'Enter a 10-digit Indian mobile number' })
  return n ?? ''
})

interface OtpRow {
  phone: string
  code_hash: string
  expires_at: string
  attempts: number
  sent_count: number
  window_started_at: string
}

const codeHash = (phone: string, code: string) => hashToken(`otp:${phone}:${code}`)

/**
 * Patient sign-in with a one-time SMS code. Signing in is optional: SOS, the
 * care guide and the directory all work without it. It makes details follow
 * the person to another phone and confirms the callback number.
 */
export function authRoutes(db: DB) {
  const r = Router()

  r.post('/otp/request', rateLimit('otp-request', 6, 15 * 60_000), async (req, res) => {
    const { phone } = parse(z.object({ phone: phoneSchema }), req.body)
    const now = Date.now()
    const row = db.prepare('SELECT * FROM otp_codes WHERE phone = ?').get(phone) as unknown as OtpRow | undefined
    const windowOpen = row && now - Date.parse(row.window_started_at) < SEND_WINDOW_MS
    if (row && now - (Date.parse(row.expires_at) - CODE_TTL_MS) < RESEND_AFTER_MS) {
      throw new HttpError(429, 'Please wait 30 seconds before asking for another code', 'too_soon')
    }
    if (windowOpen && row.sent_count >= MAX_SENDS_PER_WINDOW) {
      throw new HttpError(429, 'Too many codes sent to this number. Try again in 10 minutes.', 'too_many_codes')
    }
    const code = String(randomInt(0, 1_000_000)).padStart(6, '0')
    db.prepare(`
      INSERT INTO otp_codes (phone, code_hash, expires_at, attempts, sent_count, window_started_at) VALUES (?, ?, ?, 0, 1, ?)
      ON CONFLICT(phone) DO UPDATE SET code_hash = excluded.code_hash, expires_at = excluded.expires_at, attempts = 0,
        sent_count = ?, window_started_at = ?
    `).run(
      phone, codeHash(phone, code), new Date(now + CODE_TTL_MS).toISOString(), new Date(now).toISOString(),
      windowOpen ? row.sent_count + 1 : 1, windowOpen ? row.window_started_at : new Date(now).toISOString(),
    )
    try {
      await sendOtp(phone, code)
    } catch (error) {
      db.prepare('DELETE FROM otp_codes WHERE phone = ?').run(phone)
      console.error('[sms]', (error as Error).message)
      throw new HttpError(502, 'We could not send the SMS right now. Please try again in a minute.', 'sms_failed')
    }
    res.json({
      sent: true,
      expiresInSeconds: CODE_TTL_MS / 1000,
      resendAfterSeconds: RESEND_AFTER_MS / 1000,
      ...(exposeDevCodes() ? { devCode: code } : {}),
    })
  })

  r.post('/otp/verify', rateLimit('otp-verify', 20, 15 * 60_000), (req, res) => {
    const { phone, code } = parse(z.object({ phone: phoneSchema, code: z.string().regex(/^\d{6}$/, 'Enter the 6-digit code') }), req.body)
    const row = db.prepare('SELECT * FROM otp_codes WHERE phone = ?').get(phone) as unknown as OtpRow | undefined
    if (!row || Date.parse(row.expires_at) < Date.now()) throw new HttpError(400, 'This code has expired. Ask for a new one.', 'code_expired')
    if (row.attempts >= MAX_ATTEMPTS) throw new HttpError(429, 'Too many wrong tries. Ask for a new code.', 'too_many_attempts')
    const ok = timingSafeEqual(Buffer.from(row.code_hash), Buffer.from(codeHash(phone, code)))
    if (!ok) {
      db.prepare('UPDATE otp_codes SET attempts = attempts + 1 WHERE phone = ?').run(phone)
      const left = MAX_ATTEMPTS - row.attempts - 1
      throw new HttpError(400, left > 0 ? `That code is not right. ${left} tr${left === 1 ? 'y' : 'ies'} left.` : 'That code is not right. Ask for a new code.', 'wrong_code')
    }
    db.prepare('DELETE FROM otp_codes WHERE phone = ?').run(phone)

    const device = findPatient(db, req)
    const account = db.prepare('SELECT * FROM patients WHERE phone = ? AND phone_verified_at IS NOT NULL').get(phone) as unknown as PatientRow | undefined
    let patientId: string
    if (account) {
      patientId = account.id
      if (device && device.id !== account.id) {
        // This device was used as a guest: move its history into the account, fill gaps, then retire it.
        tx(db, () => {
          db.prepare('UPDATE appointments SET patient_id = ? WHERE patient_id = ?').run(account.id, device.id)
          db.prepare('UPDATE incidents SET patient_id = ? WHERE patient_id = ?').run(account.id, device.id)
          db.prepare(`
            UPDATE patients SET
              name = COALESCE(name, ?), emergency_contact_name = COALESCE(emergency_contact_name, ?),
              emergency_contact_phone = COALESCE(emergency_contact_phone, ?), blood_group = COALESCE(blood_group, ?),
              allergies = COALESCE(allergies, ?), insurer = COALESCE(insurer, ?), sum_insured = COALESCE(sum_insured, ?),
              pmjay_used = COALESCE(pmjay_used, ?), has_pmjay = MAX(has_pmjay, ?)
            WHERE id = ?
          `).run(device.name, device.emergency_contact_name, device.emergency_contact_phone, device.blood_group, device.allergies,
            device.insurer, device.sum_insured, device.pmjay_used, device.has_pmjay, account.id)
          db.prepare('DELETE FROM patients WHERE id = ?').run(device.id)
        })
      }
      if (!device || device.id !== account.id) startPatientSession(db, res, account.id)
    } else if (device) {
      // First sign-in from this device: the guest profile becomes the account.
      db.prepare('UPDATE patients SET phone = ?, phone_verified_at = ? WHERE id = ?').run(phone, new Date().toISOString(), device.id)
      patientId = device.id
    } else {
      patientId = createPatient(db, { phone, verified: true })
      startPatientSession(db, res, patientId)
    }
    res.json(presentPatient(db.prepare('SELECT * FROM patients WHERE id = ?').get(patientId) as unknown as PatientRow))
  })

  /** Ends this device's session. A signed-in account keeps its details; a guest profile is left behind. */
  r.post('/logout', (req, res) => {
    endPatientSession(db, req, res)
    res.json({ ok: true })
  })

  return r
}
