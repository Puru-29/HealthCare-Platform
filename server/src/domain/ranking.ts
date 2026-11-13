import { estimateMinutes, estimateRoadKm, type LatLng } from './geo.js'
import { EVIDENCE, FACILITY_TYPES, type EvidenceSource, type FacilityType, type SpecialtyKey } from './specialties.js'

export interface RankableFacility {
  id: string
  name: string
  facilityType: FacilityType
  ownership: 'public' | 'private' | 'unknown'
  location: LatLng | null
  specialties: Array<{ key: SpecialtyKey; source: EvidenceSource }>
  pmjayEmpanelled: boolean
  verified: boolean
  emergency24x7: boolean | null
  beds: number | null
  ambulancesAvailable: number
}

export interface RankedFacility<F extends RankableFacility = RankableFacility> {
  facility: F
  roadKm: number
  etaMinutes: number
  score: number
  reasons: string[]
  evidence: EvidenceSource | null
}

export interface RecommendOptions {
  origin: LatLng
  specialty: SpecialtyKey | null
  maxKm?: number
  hasPmjay?: boolean
  pmjayOnly?: boolean
  limit?: number
}

const URGENT: SpecialtyKey[] = ['emergency', 'trauma', 'icu', 'cardiology']

/** Strongest evidence the facility treats `specialty`, or null if none. */
function evidenceFor(f: RankableFacility, specialty: SpecialtyKey | null): EvidenceSource | null {
  if (!specialty) return 'facility_level_norm'
  const order = Object.keys(EVIDENCE) as EvidenceSource[]
  const sources = f.specialties.filter((s) => s.key === specialty).map((s) => s.source)
  return order.find((o) => sources.includes(o)) ?? null
}

function isDedicated(f: RankableFacility, specialty: SpecialtyKey | null): boolean {
  if (!specialty) return false
  const own = f.specialties.filter((s) => s.source !== 'facility_level_norm').map((s) => s.key)
  return own.includes(specialty) && own.filter((k) => k !== 'general_medicine' && k !== 'general_surgery').length <= 2
}

/** Capability score — what the facility can do for this problem, ignoring distance. */
export function qualityScore(f: RankableFacility, specialty: SpecialtyKey | null, hasPmjay: boolean): { score: number; reasons: string[] } {
  const reasons: string[] = []
  const tier = FACILITY_TYPES[f.facilityType].tier
  let score = tier
  if (tier >= 4) reasons.push(FACILITY_TYPES[f.facilityType].label)

  const ev = evidenceFor(f, specialty)
  if (ev) score += EVIDENCE[ev].weight
  if (ev === 'hospital_verified') reasons.push('Hospital confirmed it treats this')

  if (isDedicated(f, specialty)) {
    score += 1.5
    reasons.push('Dedicated specialty centre')
  }
  if (f.verified) { score += 0.75; reasons.push('Verified listing') }
  if (f.beds && f.beds >= 100) { score += 1; reasons.push(`${f.beds} beds`) }
  else if (f.beds && f.beds >= 50) score += 0.5

  const urgent = specialty !== null && URGENT.includes(specialty)
  if (urgent && f.emergency24x7) { score += 1; reasons.push('24×7 emergency') }
  if (urgent && f.specialties.some((s) => s.key === 'icu')) score += 0.5
  if (f.ambulancesAvailable > 0) { score += 0.25; reasons.push('Ambulance on CarePath') }

  if (f.pmjayEmpanelled) {
    score += hasPmjay ? 1.5 : 0.25
    reasons.push(hasPmjay ? 'Cashless with your Ayushman card' : 'Ayushman Bharat (PM-JAY) empanelled')
  }
  return { score, reasons }
}

/**
 * Two answers to "where should I go":
 *  - nearest: closest facilities that plausibly treat the problem
 *  - best: strongest capability within maxKm, with a mild distance penalty
 */
export function recommend<F extends RankableFacility>(facilities: F[], opts: RecommendOptions) {
  const maxKm = opts.maxKm ?? 100
  const limit = opts.limit ?? 3
  const candidates: RankedFacility<F>[] = []
  for (const f of facilities) {
    if (!f.location) continue
    if (opts.pmjayOnly && !f.pmjayEmpanelled) continue
    const evidence = evidenceFor(f, opts.specialty)
    if (!evidence) continue
    const roadKm = estimateRoadKm(opts.origin, f.location)
    if (roadKm > maxKm) continue
    const { score, reasons } = qualityScore(f, opts.specialty, !!opts.hasPmjay)
    candidates.push({ facility: f, roadKm, etaMinutes: estimateMinutes(roadKm), score, reasons, evidence })
  }

  const byDistance = [...candidates].sort((a, b) => a.roadKm - b.roadKm)
  const nearest = byDistance.slice(0, limit)

  const DISTANCE_PENALTY_PER_KM = 0.03
  const best = [...candidates]
    .map((c) => ({ ...c, adjusted: c.score - c.roadKm * DISTANCE_PENALTY_PER_KM }))
    .sort((a, b) => b.adjusted - a.adjusted)
    .slice(0, limit)
    .map(({ adjusted: _adjusted, ...c }) => c)

  return { nearest, best, considered: candidates.length, maxKm }
}
