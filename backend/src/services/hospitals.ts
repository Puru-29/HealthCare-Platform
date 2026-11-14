import type { DB } from '../db.js'
import { estimateMinutes, estimateRoadKm, type LatLng } from '../domain/geo.js'
import { recommend, type RankableFacility } from '../domain/ranking.js'
import {
  EVIDENCE, FACILITY_TYPES, SPECIALTIES, isSpecialtyKey,
  type EvidenceSource, type FacilityType, type SpecialtyKey,
} from '../domain/specialties.js'

interface HospitalRow {
  id: string
  name: string
  ownership: 'public' | 'private' | 'unknown'
  facility_type: FacilityType
  address: string | null
  phone: string | null
  lat: number | null
  lng: number | null
  geo_source: string | null
  geo_precision: string | null
  beds: number | null
  beds_source: string | null
  pmjay_json: string | null
  sources_json: string
  notes: string | null
  verified: number
  emergency_24x7: number | null
  specialties: string | null
  insurers: string | null
  ambulances_available: number
  has_console: number
}

export interface PmjayInfo {
  empanelled: boolean
  hospitalId: string
  asOf: string
  desk: { officer: string | null; phone: string | null; email: string | null }
}

export interface Hospital extends RankableFacility {
  facilityTypeLabel: string
  address: string | null
  phone: string | null
  locationPrecision: string | null
  locationSource: string | null
  bedsSource: string | null
  pmjay: PmjayInfo | null
  insurers: string[]
  sources: string[]
  notes: string | null
  onCarePath: boolean
}

const SELECT = /* sql */ `
  SELECT h.*,
    (SELECT group_concat(key || ':' || source) FROM hospital_specialties s WHERE s.hospital_id = h.id) AS specialties,
    (SELECT group_concat(insurer, '|') FROM hospital_insurers i WHERE i.hospital_id = h.id) AS insurers,
    (SELECT COUNT(*) FROM ambulances a WHERE a.hospital_id = h.id AND a.status = 'available') AS ambulances_available,
    EXISTS (SELECT 1 FROM staff st WHERE st.hospital_id = h.id) AS has_console
  FROM hospitals h`

function toHospital(row: HospitalRow): Hospital {
  const specialties = (row.specialties ?? '')
    .split(',')
    .filter(Boolean)
    .map((pair) => {
      const [key, source] = pair.split(':') as [string, string]
      return { key, source }
    })
    .filter((s): s is { key: SpecialtyKey; source: EvidenceSource } => isSpecialtyKey(s.key) && s.source in EVIDENCE)
  const pmjay = row.pmjay_json ? (JSON.parse(row.pmjay_json) as PmjayInfo) : null
  return {
    id: row.id,
    name: row.name,
    facilityType: row.facility_type,
    facilityTypeLabel: FACILITY_TYPES[row.facility_type]?.label ?? row.facility_type,
    ownership: row.ownership,
    address: row.address,
    phone: row.phone,
    location: row.lat !== null && row.lng !== null ? { lat: row.lat, lng: row.lng } : null,
    locationPrecision: row.geo_precision,
    locationSource: row.geo_source,
    beds: row.beds,
    bedsSource: row.beds_source,
    pmjay,
    pmjayEmpanelled: !!pmjay?.empanelled,
    specialties,
    insurers: row.insurers ? row.insurers.split('|') : [],
    verified: !!row.verified,
    emergency24x7: row.emergency_24x7 === null ? null : !!row.emergency_24x7,
    ambulancesAvailable: row.ambulances_available,
    sources: JSON.parse(row.sources_json) as string[],
    notes: row.notes,
    onCarePath: !!row.has_console,
  }
}

export function listHospitals(db: DB): Hospital[] {
  return (db.prepare(`${SELECT} ORDER BY h.name`).all() as unknown as HospitalRow[]).map(toHospital)
}

export function getHospital(db: DB, id: string): Hospital | null {
  const row = db.prepare(`${SELECT} WHERE h.id = ?`).get(id) as unknown as HospitalRow | undefined
  return row ? toHospital(row) : null
}

/** Public JSON shape. */
export function present(h: Hospital, origin?: LatLng | null) {
  const roadKm = origin && h.location ? estimateRoadKm(origin, h.location) : null
  return {
    id: h.id,
    name: h.name,
    facilityType: h.facilityType,
    facilityTypeLabel: h.facilityTypeLabel,
    ownership: h.ownership,
    address: h.address,
    phone: h.phone,
    location: h.location,
    locationPrecision: h.locationPrecision,
    beds: h.beds,
    bedsSource: h.bedsSource,
    pmjay: h.pmjay,
    specialties: h.specialties.map((s) => ({
      key: s.key,
      label: SPECIALTIES[s.key].label,
      source: s.source,
      sourceLabel: EVIDENCE[s.source].label,
    })),
    insurers: h.insurers,
    verified: h.verified,
    emergency24x7: h.emergency24x7,
    ambulancesAvailable: h.ambulancesAvailable,
    onCarePath: h.onCarePath,
    sources: h.sources,
    notes: h.notes,
    distanceKm: roadKm === null ? null : Math.round(roadKm * 10) / 10,
    etaMinutes: roadKm === null ? null : Math.round(estimateMinutes(roadKm)),
  }
}

export interface SearchFilters {
  q?: string
  specialty?: SpecialtyKey
  type?: FacilityType
  pmjay?: boolean
  ownership?: 'public' | 'private'
  origin?: LatLng | null
  maxKm?: number
}

export function searchHospitals(db: DB, f: SearchFilters) {
  const q = f.q?.trim().toLowerCase()
  const matches = listHospitals(db).filter((h) =>
    (!q || h.name.toLowerCase().includes(q) || (h.address ?? '').toLowerCase().includes(q)) &&
    (!f.specialty || h.specialties.some((s) => s.key === f.specialty)) &&
    (!f.type || h.facilityType === f.type) &&
    (!f.pmjay || h.pmjayEmpanelled) &&
    (!f.ownership || h.ownership === f.ownership))
  let presented = matches.map((h) => present(h, f.origin))
  if (f.origin) {
    const maxKm = f.maxKm
    if (maxKm) presented = presented.filter((h) => h.distanceKm === null || h.distanceKm <= maxKm)
    presented.sort((a, b) => (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity))
  }
  return presented
}

export function recommendHospitals(db: DB, opts: { origin: LatLng; specialty: SpecialtyKey | null; maxKm?: number; hasPmjay?: boolean; pmjayOnly?: boolean; limit?: number }) {
  const r = recommend(listHospitals(db), opts)
  const shape = (x: (typeof r.nearest)[number]) => ({
    ...present(x.facility, opts.origin),
    reasons: x.reasons,
    evidence: x.evidence,
    evidenceLabel: x.evidence ? EVIDENCE[x.evidence].label : null,
    score: Math.round(x.score * 10) / 10,
  })
  return {
    specialty: opts.specialty,
    specialtyLabel: opts.specialty ? SPECIALTIES[opts.specialty].label : null,
    maxKm: r.maxKm,
    considered: r.considered,
    nearest: r.nearest.map(shape),
    best: r.best.map(shape),
  }
}
