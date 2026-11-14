import { Router } from 'express'
import { z } from 'zod'
import { config } from '../config.js'
import type { DB } from '../db.js'
import { estimateClaim, estimatePmjay } from '../domain/insurance.js'
import { FACILITY_TYPES, SPECIALTIES, SPECIALTY_KEYS, type FacilityType, type SpecialtyKey } from '../domain/specialties.js'
import { findPatient, rateLimit } from '../lib/auth.js'
import { notFound, param, parse } from '../lib/http.js'
import { assistantStatus, runAssistant } from '../services/assistant.js'
import { getHospital, present, recommendHospitals, searchHospitals } from '../services/hospitals.js'

const latLngQuery = {
  lat: z.coerce.number().min(-90).max(90).optional(),
  lng: z.coerce.number().min(-180).max(180).optional(),
}
const originOf = (q: { lat?: number; lng?: number }) => (q.lat !== undefined && q.lng !== undefined ? { lat: q.lat, lng: q.lng } : null)
const specialtyEnum = z.enum(SPECIALTY_KEYS as [SpecialtyKey, ...SpecialtyKey[]])
const boolish = z.enum(['true', 'false', '1', '0']).transform((v) => v === 'true' || v === '1')

export function publicRoutes(db: DB) {
  const r = Router()

  r.get('/health', (_req, res) => {
    const row = db.prepare('SELECT COUNT(*) AS n FROM hospitals').get() as { n: number }
    res.json({ ok: true, hospitals: row.n })
  })

  r.get('/meta', (_req, res) => {
    const attribution = 'Map data © OpenStreetMap contributors. Hospital roster: AB-PMJAY (NHA) district list. Facility list: Haryana Health Department.'
    res.json({
      specialties: SPECIALTY_KEYS.map((key) => ({ key, label: SPECIALTIES[key].label })),
      demoMode: config.demoMode,
      assistant: assistantStatus(),
      attribution,
    })
  })

  r.get('/hospitals', (req, res) => {
    const q = parse(z.object({
      q: z.string().max(80).optional(),
      specialty: specialtyEnum.optional(),
      type: z.enum(Object.keys(FACILITY_TYPES) as [FacilityType, ...FacilityType[]]).optional(),
      pmjay: boolish.optional(),
      ownership: z.enum(['public', 'private']).optional(),
      maxKm: z.coerce.number().min(1).max(200).optional(),
      ...latLngQuery,
    }), req.query)
    const results = searchHospitals(db, { ...q, origin: originOf(q) })
    res.json({ total: results.length, data: results })
  })

  r.get('/hospitals/recommend', (req, res) => {
    const q = parse(z.object({
      specialty: specialtyEnum.optional(),
      maxKm: z.coerce.number().min(1).max(100).default(100),
      pmjayOnly: boolish.optional(),
      lat: z.coerce.number().min(-90).max(90),
      lng: z.coerce.number().min(-180).max(180),
    }), req.query)
    const patient = findPatient(db, req)
    res.json(recommendHospitals(db, {
      origin: { lat: q.lat, lng: q.lng },
      specialty: q.specialty ?? null,
      maxKm: q.maxKm,
      pmjayOnly: q.pmjayOnly,
      hasPmjay: !!patient?.has_pmjay,
      limit: 5,
    }))
  })

  r.get('/hospitals/:id', (req, res) => {
    const q = parse(z.object(latLngQuery), req.query)
    const h = getHospital(db, param(req, 'id'))
    if (!h) throw notFound('Hospital not found')
    res.json(present(h, originOf(q)))
  })

  const money = z.number().min(0).max(100_000_000)
  r.post('/insurance/estimate', (req, res) => {
    const body = parse(z.object({
      bill: z.object({
        roomRentPerDay: money,
        days: z.number().int().min(0).max(365),
        associatedCharges: money,
        medicinesAndConsumables: money,
        otherCharges: money,
      }),
      policy: z.object({
        sumInsured: money,
        alreadyClaimedThisYear: money.default(0),
        roomRentLimit: z.discriminatedUnion('kind', [
          z.object({ kind: z.literal('none') }),
          z.object({ kind: z.literal('percent_of_si'), percent: z.number().min(0).max(100) }),
          z.object({ kind: z.literal('per_day'), amount: money }),
        ]),
        copayPercent: z.number().min(0).max(100).default(0),
        deductible: money.default(0),
        nonPayablePercent: z.number().min(0).max(100).default(0),
      }).optional(),
      pmjay: z.object({ usedThisYear: money.default(0) }).optional(),
      hospitalId: z.string().max(120).optional(),
    }), req.body)
    const hospital = body.hospitalId ? getHospital(db, body.hospitalId) : null
    const insurance = body.policy ? estimateClaim(body.bill, body.policy) : null
    const total = body.bill.roomRentPerDay * body.bill.days + body.bill.associatedCharges + body.bill.medicinesAndConsumables + body.bill.otherCharges
    const pmjay = body.pmjay ? estimatePmjay(Math.round(total), body.pmjay.usedThisYear, hospital ? hospital.pmjayEmpanelled : null) : null
    res.json({
      hospital: hospital ? { id: hospital.id, name: hospital.name, pmjayEmpanelled: hospital.pmjayEmpanelled, insurers: hospital.insurers } : null,
      insurance,
      pmjay,
    })
  })

  r.post('/assistant', rateLimit('assistant', 20, 60_000), async (req, res) => {
    const body = parse(z.object({
      messages: z.array(z.object({ role: z.enum(['user', 'assistant']), content: z.string().min(1).max(2000) })).min(1).max(20),
      location: z.object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) }).nullable().optional(),
    }), req.body)
    if (body.messages[0]?.role !== 'user' || body.messages[body.messages.length - 1]?.role !== 'user') {
      res.status(400).json({ error: { code: 'invalid_input', message: 'Conversation must start and end with a user message' } })
      return
    }
    const patient = findPatient(db, req)
    res.json(await runAssistant(db, body.messages, { origin: body.location ?? null, hasPmjay: !!patient?.has_pmjay }))
  })

  return r
}
