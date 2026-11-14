import { config } from '../config.js'
import { tx, type DB } from '../db.js'
import { estimateRoadKm, haversineKm, pointAlong, type LatLng } from '../domain/geo.js'
import { HttpError, notFound } from '../lib/http.js'
import { notifyHospital } from '../lib/notify.js'
import { getRoute, type Route } from '../lib/routing.js'
import { hashToken, newId, newToken } from '../lib/security.js'
import { channels, publish } from '../lib/sse.js'

export type IncidentStatus = 'searching' | 'assigned' | 'arrived' | 'to_hospital' | 'completed' | 'cancelled' | 'no_response'
const ACTIVE: IncidentStatus[] = ['searching', 'assigned', 'arrived', 'to_hospital']

interface IncidentRow {
  id: string
  patient_id: string | null
  status: IncidentStatus
  pickup_lat: number
  pickup_lng: number
  pickup_accuracy_m: number | null
  patient_name: string | null
  patient_phone: string
  note: string | null
  wave: number
  hospital_id: string | null
  ambulance_id: string | null
  created_at: string
  accepted_at: string | null
  arrived_at: string | null
  completed_at: string | null
  cancelled_at: string | null
}

interface AmbulanceRow {
  id: string
  hospital_id: string
  vehicle_number: string
  kind: 'BLS' | 'ALS' | 'PTV'
  driver_name: string
  driver_phone: string
  status: 'available' | 'busy' | 'offline'
  lat: number | null
  lng: number | null
  location_at: string | null
  simulated: number
}

interface LiveTrip {
  route: Route | null
  routeFrom: LatLng | null
  routeAt: number
  samples: Array<{ at: number; remainingKm: number }>
  simTimer?: NodeJS.Timeout
}

export interface DispatchOptions {
  waveRadiiKm: number[]
  waveTimeoutMs: number
  maxOffersPerWave: number
  simulate: boolean
}

const now = () => new Date().toISOString()

/** Rough "area" shown to hospitals before they accept — about 1 km precision. */
const coarse = (n: number) => Math.round(n * 100) / 100

export class Dispatcher {
  private waveTimers = new Map<string, NodeJS.Timeout>()
  private live = new Map<string, LiveTrip>()

  constructor(private db: DB, private opts: DispatchOptions = { ...config.dispatch, simulate: config.demoMode }) {}

  // ---------- queries ----------

  private incident(id: string): IncidentRow {
    const row = this.db.prepare('SELECT * FROM incidents WHERE id = ?').get(id) as unknown as IncidentRow | undefined
    if (!row) throw notFound('Emergency request not found')
    return row
  }

  private ambulance(id: string | null): AmbulanceRow | null {
    if (!id) return null
    return (this.db.prepare('SELECT * FROM ambulances WHERE id = ?').get(id) as unknown as AmbulanceRow | undefined) ?? null
  }

  private event(incidentId: string, type: string, message: string) {
    this.db.prepare('INSERT INTO incident_events (incident_id, at, type, message) VALUES (?, ?, ?, ?)').run(incidentId, now(), type, message)
  }

  /** Everything the patient's tracking screen needs. */
  view(id: string) {
    const inc = this.incident(id)
    const hospital = inc.hospital_id
      ? (this.db.prepare('SELECT id, name, phone, lat, lng, address FROM hospitals WHERE id = ?').get(inc.hospital_id) as
          { id: string; name: string; phone: string | null; lat: number | null; lng: number | null; address: string | null })
      : null
    const amb = this.ambulance(inc.ambulance_id)
    const offers = this.db.prepare('SELECT status, wave FROM incident_offers WHERE incident_id = ?').all(id) as Array<{ status: string; wave: number }>
    const live = this.live.get(id)
    const timeline = this.db.prepare('SELECT at, type, message FROM incident_events WHERE incident_id = ? ORDER BY id').all(id) as Array<{ at: string; type: string; message: string }>
    const radius = this.opts.waveRadiiKm[Math.max(0, inc.wave - 1)] ?? null
    return {
      id: inc.id,
      status: inc.status,
      createdAt: inc.created_at,
      pickup: { lat: inc.pickup_lat, lng: inc.pickup_lng, accuracyM: inc.pickup_accuracy_m },
      search: {
        wave: inc.wave,
        totalWaves: this.opts.waveRadiiKm.length,
        radiusKm: radius,
        contacted: offers.length,
        contactedThisWave: offers.filter((o) => o.wave === inc.wave).length,
        declined: offers.filter((o) => o.status === 'declined').length,
      },
      hospital: hospital && {
        id: hospital.id,
        name: hospital.name,
        phone: hospital.phone,
        address: hospital.address,
        location: hospital.lat !== null && hospital.lng !== null ? { lat: hospital.lat, lng: hospital.lng } : null,
      },
      ambulance: amb && {
        vehicleNumber: amb.vehicle_number,
        kind: amb.kind,
        driverName: amb.driver_name,
        driverPhone: amb.driver_phone,
        location: amb.lat !== null && amb.lng !== null ? { lat: amb.lat, lng: amb.lng } : null,
        locationAt: amb.location_at,
        simulated: !!amb.simulated,
      },
      eta: live?.route && ['assigned', 'to_hospital'].includes(inc.status)
        ? {
            minutes: Math.max(1, Math.round(live.route.durationMin)),
            distanceKm: Math.round(live.route.distanceKm * 10) / 10,
            source: live.route.source,
            path: live.route.path,
          }
        : null,
      traffic: this.trafficState(live),
      timeline,
      acceptedAt: inc.accepted_at,
      arrivedAt: inc.arrived_at,
    }
  }

  private publishIncident(id: string) {
    publish(channels.incident(id), 'incident', this.view(id))
  }

  private refreshHospitals(incidentId: string, reason: string) {
    const ids = this.db.prepare('SELECT hospital_id FROM incident_offers WHERE incident_id = ?').all(incidentId) as Array<{ hospital_id: string }>
    for (const { hospital_id } of ids) publish(channels.hospital(hospital_id), 'refresh', { reason, incidentId })
  }

  // ---------- lifecycle ----------

  create(input: { patientId: string | null; name: string | null; phone: string; note: string | null; pickup: LatLng; accuracyM: number | null }) {
    const active = input.patientId
      ? (this.db.prepare(`SELECT id FROM incidents WHERE patient_id = ? AND status IN ('searching','assigned','arrived','to_hospital')`).get(input.patientId) as { id: string } | undefined)
      : undefined
    if (active) return active.id // a second press returns the request already in progress

    const id = newId()
    this.db.prepare(`
      INSERT INTO incidents (id, patient_id, status, pickup_lat, pickup_lng, pickup_accuracy_m, patient_name, patient_phone, note, created_at)
      VALUES (?, ?, 'searching', ?, ?, ?, ?, ?, ?, ?)
    `).run(id, input.patientId, input.pickup.lat, input.pickup.lng, input.accuracyM, input.name, input.phone, input.note, now())
    this.event(id, 'created', 'SOS received. Finding the nearest available ambulance.')
    this.nextWave(id)
    return id
  }

  private nextWave(id: string) {
    this.clearWaveTimer(id)
    const inc = this.incident(id)
    if (inc.status !== 'searching') return
    const wave = inc.wave + 1
    const radius = this.opts.waveRadiiKm[wave - 1]
    if (radius === undefined) {
      this.finishNoResponse(id)
      return
    }
    const pickup = { lat: inc.pickup_lat, lng: inc.pickup_lng }
    const candidates = (this.db.prepare(`
      SELECT h.id, h.name, h.phone, h.lat, h.lng
      FROM hospitals h
      WHERE h.lat IS NOT NULL
        AND EXISTS (SELECT 1 FROM ambulances a WHERE a.hospital_id = h.id AND a.status = 'available')
        AND NOT EXISTS (SELECT 1 FROM incident_offers o WHERE o.incident_id = ? AND o.hospital_id = h.id)
    `).all(id) as Array<{ id: string; name: string; phone: string | null; lat: number; lng: number }>)
      .map((h) => ({ ...h, km: estimateRoadKm(pickup, h) }))
      .filter((h) => h.km <= radius)
      .sort((a, b) => a.km - b.km)
      .slice(0, this.opts.maxOffersPerWave)

    this.db.prepare('UPDATE incidents SET wave = ? WHERE id = ?').run(wave, id)
    if (candidates.length === 0) {
      this.event(id, 'wave', `No ambulance partners within ${radius} km. Widening the search.`)
      this.publishIncident(id)
      this.nextWave(id)
      return
    }
    const insert = this.db.prepare(`INSERT INTO incident_offers (incident_id, hospital_id, wave, distance_km, offered_at) VALUES (?, ?, ?, ?, ?)`)
    tx(this.db, () => { for (const c of candidates) insert.run(id, c.id, wave, c.km, now()) })
    this.event(id, 'wave', `Alerted ${candidates.length} hospital${candidates.length === 1 ? '' : 's'} within ${radius} km.`)
    for (const c of candidates) {
      publish(channels.hospital(c.id), 'offer', { incidentId: id })
      void notifyHospital({ incidentId: id, hospitalId: c.id, hospitalName: c.name, hospitalPhone: c.phone, distanceKm: c.km, wave, pickup: { lat: coarse(pickup.lat), lng: coarse(pickup.lng) }, note: inc.note })
    }
    this.publishIncident(id)
    this.waveTimers.set(id, setTimeout(() => this.expireWave(id, wave), this.opts.waveTimeoutMs))
  }

  private expireWave(id: string, wave: number) {
    this.waveTimers.delete(id)
    const inc = this.incident(id)
    if (inc.status !== 'searching' || inc.wave !== wave) return
    this.db.prepare(`UPDATE incident_offers SET status = 'expired', responded_at = ? WHERE incident_id = ? AND wave = ? AND status = 'pending'`).run(now(), id, wave)
    this.refreshHospitals(id, 'expired')
    this.nextWave(id)
  }

  private finishNoResponse(id: string) {
    this.db.prepare(`UPDATE incidents SET status = 'no_response' WHERE id = ? AND status = 'searching'`).run(id)
    this.db.prepare(`UPDATE incident_offers SET status = 'expired', responded_at = ? WHERE incident_id = ? AND status = 'pending'`).run(now(), id)
    this.event(id, 'no_response', 'No partner ambulance accepted. Call 108 now — it is free and covers all of Haryana.')
    this.refreshHospitals(id, 'expired')
    this.publishIncident(id)
  }

  private clearWaveTimer(id: string) {
    const t = this.waveTimers.get(id)
    if (t) clearTimeout(t)
    this.waveTimers.delete(id)
  }

  /** First explicit acceptance wins. Returns the driver link token (shown once). */
  accept(incidentId: string, hospitalId: string, ambulanceId: string): { driverToken: string } {
    const token = newToken()
    tx(this.db, () => {
      const offer = this.db.prepare(`SELECT status FROM incident_offers WHERE incident_id = ? AND hospital_id = ?`).get(incidentId, hospitalId) as { status: string } | undefined
      if (!offer) throw new HttpError(404, 'This request was not offered to your hospital', 'not_offered')
      if (!['pending', 'expired'].includes(offer.status)) throw new HttpError(409, 'You already responded to this request', 'already_responded')
      const amb = this.db.prepare(`SELECT status FROM ambulances WHERE id = ? AND hospital_id = ?`).get(ambulanceId, hospitalId) as { status: string } | undefined
      if (!amb) throw new HttpError(404, 'Ambulance not found', 'not_found')
      if (amb.status !== 'available') throw new HttpError(409, 'That ambulance is not available', 'ambulance_busy')
      const won = this.db.prepare(`
        UPDATE incidents SET status = 'assigned', hospital_id = ?, ambulance_id = ?, driver_token_hash = ?, accepted_at = ?
        WHERE id = ? AND status = 'searching'
      `).run(hospitalId, ambulanceId, hashToken(token), now(), incidentId)
      if (won.changes !== 1) throw new HttpError(409, 'Another hospital has already accepted this request', 'already_assigned')
      this.db.prepare(`UPDATE incident_offers SET status = 'accepted', responded_at = ? WHERE incident_id = ? AND hospital_id = ?`).run(now(), incidentId, hospitalId)
      this.db.prepare(`UPDATE incident_offers SET status = 'withdrawn' WHERE incident_id = ? AND status = 'pending'`).run(incidentId)
      this.db.prepare(`UPDATE ambulances SET status = 'busy' WHERE id = ?`).run(ambulanceId)
    })
    this.clearWaveTimer(incidentId)
    const hospital = this.db.prepare('SELECT name FROM hospitals WHERE id = ?').get(hospitalId) as { name: string }
    const amb = this.ambulance(ambulanceId)!
    this.event(incidentId, 'assigned', `${hospital.name} accepted. Ambulance ${amb.vehicle_number} (${amb.driver_name}) is on the way.`)
    this.live.set(incidentId, { route: null, routeFrom: null, routeAt: 0, samples: [] })
    this.refreshHospitals(incidentId, 'assigned')
    if (amb.simulated && this.opts.simulate) this.simulate(incidentId)
    else void this.refreshRoute(incidentId, true).then(() => this.publishIncident(incidentId))
    this.publishIncident(incidentId)
    return { driverToken: token }
  }

  decline(incidentId: string, hospitalId: string) {
    const res = this.db.prepare(`UPDATE incident_offers SET status = 'declined', responded_at = ? WHERE incident_id = ? AND hospital_id = ? AND status = 'pending'`).run(now(), incidentId, hospitalId)
    if (res.changes !== 1) throw new HttpError(409, 'Nothing to decline', 'not_pending')
    const inc = this.incident(incidentId)
    const pending = this.db.prepare(`SELECT COUNT(*) AS n FROM incident_offers WHERE incident_id = ? AND wave = ? AND status = 'pending'`).get(incidentId, inc.wave) as { n: number }
    this.publishIncident(incidentId)
    if (inc.status === 'searching' && pending.n === 0) this.nextWave(incidentId)
  }

  cancel(incidentId: string, reason: string) {
    const inc = this.incident(incidentId)
    if (!ACTIVE.includes(inc.status)) throw new HttpError(409, 'This request is already closed', 'closed')
    tx(this.db, () => {
      this.db.prepare(`UPDATE incidents SET status = 'cancelled', cancelled_at = ? WHERE id = ?`).run(now(), incidentId)
      this.db.prepare(`UPDATE incident_offers SET status = 'withdrawn' WHERE incident_id = ? AND status = 'pending'`).run(incidentId)
      if (inc.ambulance_id) this.db.prepare(`UPDATE ambulances SET status = 'available' WHERE id = ?`).run(inc.ambulance_id)
    })
    this.stopLive(incidentId)
    this.clearWaveTimer(incidentId)
    this.event(incidentId, 'cancelled', reason)
    this.refreshHospitals(incidentId, 'cancelled')
    this.publishIncident(incidentId)
  }

  advance(incidentId: string, to: 'arrived' | 'to_hospital' | 'completed') {
    const inc = this.incident(incidentId)
    const allowed: Record<typeof to, IncidentStatus[]> = {
      arrived: ['assigned'],
      to_hospital: ['assigned', 'arrived'],
      completed: ['assigned', 'arrived', 'to_hospital'],
    }
    if (!allowed[to].includes(inc.status)) throw new HttpError(409, `Cannot move from ${inc.status} to ${to}`, 'bad_transition')
    const stamp = to === 'arrived' ? 'arrived_at' : to === 'completed' ? 'completed_at' : null
    this.db.prepare(`UPDATE incidents SET status = ?${stamp ? `, ${stamp} = ?` : ''} WHERE id = ?`).run(...(stamp ? [to, now(), incidentId] : [to, incidentId]))
    const messages = {
      arrived: 'Ambulance has reached your location.',
      to_hospital: 'On the way to the hospital.',
      completed: 'Reached the hospital. Trip complete.',
    }
    this.event(incidentId, to, messages[to])
    const live = this.live.get(incidentId)
    if (live) { live.samples = []; live.route = null; live.routeAt = 0 }
    if (to === 'completed') {
      if (inc.ambulance_id) this.db.prepare(`UPDATE ambulances SET status = 'available' WHERE id = ?`).run(inc.ambulance_id)
      this.stopLive(incidentId)
    } else if (to === 'to_hospital') void this.refreshRoute(incidentId, true)
    if (inc.hospital_id) publish(channels.hospital(inc.hospital_id), 'refresh', { reason: to, incidentId })
    this.publishIncident(incidentId)
  }

  // ---------- live tracking ----------

  /** Driver phone (or simulator) reports position. */
  async updateLocation(incidentId: string, p: LatLng, fromSimulator = false) {
    const inc = this.incident(incidentId)
    if (!inc.ambulance_id || !['assigned', 'arrived', 'to_hospital'].includes(inc.status)) return
    if (!fromSimulator) this.stopSimulation(incidentId) // a real phone took over
    this.db.prepare('UPDATE ambulances SET lat = ?, lng = ?, location_at = ? WHERE id = ?').run(p.lat, p.lng, now(), inc.ambulance_id)
    await this.refreshRoute(incidentId, false)
    this.publishIncident(incidentId)
  }

  private target(inc: IncidentRow): LatLng | null {
    if (inc.status === 'assigned') return { lat: inc.pickup_lat, lng: inc.pickup_lng }
    if (inc.status === 'to_hospital' && inc.hospital_id) {
      const h = this.db.prepare('SELECT lat, lng FROM hospitals WHERE id = ?').get(inc.hospital_id) as { lat: number | null; lng: number | null }
      return h.lat !== null && h.lng !== null ? { lat: h.lat, lng: h.lng } : null
    }
    return null
  }

  private async refreshRoute(incidentId: string, force: boolean) {
    const inc = this.incident(incidentId)
    const amb = this.ambulance(inc.ambulance_id)
    const live = this.live.get(incidentId) ?? { route: null, routeFrom: null, routeAt: 0, samples: [] }
    this.live.set(incidentId, live)
    const target = this.target(inc)
    if (!amb || amb.lat === null || amb.lng === null || !target) return
    const pos = { lat: amb.lat, lng: amb.lng }
    const stale = force || !live.route || Date.now() - live.routeAt > 20_000
    if (stale) {
      live.route = await getRoute(pos, target)
      live.routeFrom = pos
      live.routeAt = Date.now()
    } else if (live.route && live.routeFrom) {
      // Between router calls, scale the last route by straight-line progress.
      const before = haversineKm(live.routeFrom, target)
      const ratio = before > 0 ? haversineKm(pos, target) / before : 0
      live.route = { ...live.route, distanceKm: live.route.distanceKm * ratio, durationMin: live.route.durationMin * ratio, path: [pos, ...live.route.path.slice(1)] }
      live.routeFrom = pos
    }
    if (live.route) {
      live.samples.push({ at: Date.now(), remainingKm: live.route.distanceKm })
      live.samples = live.samples.filter((s) => Date.now() - s.at <= 120_000)
    }
  }

  /** "slow" when the ambulance has covered under 8 km/h over the last ~90 s while still far away. */
  private trafficState(live: LiveTrip | undefined): 'slow' | 'moving' | null {
    if (!live || live.samples.length < 3) return null
    const first = live.samples[0]!, last = live.samples[live.samples.length - 1]!
    const hours = (last.at - first.at) / 3_600_000
    if (hours < 60 / 3600 || last.remainingKm < 0.3) return null
    const speed = (first.remainingKm - last.remainingKm) / hours
    return speed < 8 ? 'slow' : 'moving'
  }

  private stopLive(id: string) {
    this.stopSimulation(id)
    this.live.delete(id)
  }

  private stopSimulation(id: string) {
    const live = this.live.get(id)
    if (live?.simTimer) clearInterval(live.simTimer)
    if (live) live.simTimer = undefined
  }

  // ---------- demo simulator ----------

  /**
   * Drives a simulated ambulance from whatever stage the trip is in:
   * to the patient in ~90 s, 15 s on scene, to the hospital in ~60 s.
   */
  private simulate(incidentId: string) {
    const status = () => this.incident(incidentId).status
    const leg = async (durationMs: number, expected: IncidentStatus, onDone: () => void) => {
      await this.refreshRoute(incidentId, true)
      const live = this.live.get(incidentId)
      const path = live?.route?.path
      if (!live || !path?.length || status() !== expected) return
      const started = Date.now()
      live.simTimer = setInterval(() => {
        const t = Math.min(1, (Date.now() - started) / durationMs)
        void this.updateLocation(incidentId, pointAlong(path, t), true).then(() => {
          if (t >= 1) { this.stopSimulation(incidentId); if (status() === expected) onDone() }
        })
      }, 2000)
    }
    const step = () => {
      const s = status()
      if (s === 'assigned') void leg(90_000, 'assigned', () => { this.advance(incidentId, 'arrived'); step() })
      else if (s === 'arrived') setTimeout(() => { if (status() === 'arrived') { this.advance(incidentId, 'to_hospital'); step() } }, 15_000)
      else if (s === 'to_hospital') void leg(60_000, 'to_hospital', () => this.advance(incidentId, 'completed'))
    }
    step()
  }

  // ---------- startup / shutdown ----------

  /**
   * Re-arm everything held in memory after a restart: search timers for open
   * requests (closed if older than 5 minutes), and routes/ETAs for active trips.
   */
  resume() {
    const rows = this.db.prepare(`SELECT id, created_at FROM incidents WHERE status = 'searching'`).all() as Array<{ id: string; created_at: string }>
    for (const r of rows) {
      if (Date.now() - Date.parse(r.created_at) > 5 * 60_000) this.finishNoResponse(r.id)
      else this.nextWave(r.id)
    }
    const trips = this.db.prepare(`
      SELECT i.id, a.simulated FROM incidents i JOIN ambulances a ON a.id = i.ambulance_id
      WHERE i.status IN ('assigned','arrived','to_hospital')
    `).all() as Array<{ id: string; simulated: number }>
    for (const t of trips) {
      this.live.set(t.id, { route: null, routeFrom: null, routeAt: 0, samples: [] })
      if (t.simulated && this.opts.simulate) this.simulate(t.id)
      else void this.refreshRoute(t.id, true)
    }
  }

  stop() {
    for (const t of this.waveTimers.values()) clearTimeout(t)
    for (const id of this.live.keys()) this.stopSimulation(id)
    this.waveTimers.clear()
  }

  // ---------- console views ----------

  offersFor(hospitalId: string) {
    return (this.db.prepare(`
      SELECT o.incident_id, o.distance_km, o.offered_at, o.wave, i.pickup_lat, i.pickup_lng, i.note, i.created_at
      FROM incident_offers o JOIN incidents i ON i.id = o.incident_id
      WHERE o.hospital_id = ? AND o.status IN ('pending','expired') AND i.status = 'searching'
      ORDER BY o.offered_at
    `).all(hospitalId) as Array<{ incident_id: string; distance_km: number; offered_at: string; wave: number; pickup_lat: number; pickup_lng: number; note: string | null; created_at: string }>)
      .map((o) => ({
        incidentId: o.incident_id,
        distanceKm: Math.round(o.distance_km * 10) / 10,
        offeredAt: o.offered_at,
        createdAt: o.created_at,
        area: { lat: coarse(o.pickup_lat), lng: coarse(o.pickup_lng) },
        note: o.note,
      }))
  }

  tripsFor(hospitalId: string) {
    return (this.db.prepare(`
      SELECT i.* FROM incidents i WHERE i.hospital_id = ? AND i.status IN ('assigned','arrived','to_hospital')
      ORDER BY i.accepted_at DESC
    `).all(hospitalId) as unknown as IncidentRow[]).map((inc) => {
      const v = this.view(inc.id)
      return { ...v, patient: { name: inc.patient_name, phone: inc.patient_phone, note: inc.note } }
    })
  }

  /** Driver link → incident. */
  incidentForDriver(token: string): string {
    const row = this.db.prepare(`SELECT id FROM incidents WHERE driver_token_hash = ?`).get(hashToken(token)) as { id: string } | undefined
    if (!row) throw notFound('This driver link is not valid')
    return row.id
  }

  driverView(incidentId: string) {
    const inc = this.incident(incidentId)
    return { ...this.view(incidentId), patient: { name: inc.patient_name, phone: inc.patient_phone, note: inc.note } }
  }

  regenerateDriverLink(incidentId: string, hospitalId: string): { driverToken: string } {
    const token = newToken()
    const res = this.db.prepare(`UPDATE incidents SET driver_token_hash = ? WHERE id = ? AND hospital_id = ? AND status IN ('assigned','arrived','to_hospital')`).run(hashToken(token), incidentId, hospitalId)
    if (res.changes !== 1) throw notFound('Active trip not found')
    return { driverToken: token }
  }
}

let dispatcher: Dispatcher | null = null
export function getDispatcher(db: DB): Dispatcher {
  dispatcher ??= new Dispatcher(db)
  return dispatcher
}
export function setDispatcher(d: Dispatcher | null) {
  dispatcher = d
}
