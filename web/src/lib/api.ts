export interface LatLng { lat: number; lng: number }

export interface Specialty { key: string; label: string; source: string; sourceLabel: string }

export interface Hospital {
  id: string
  name: string
  facilityType: string
  facilityTypeLabel: string
  ownership: 'public' | 'private' | 'unknown'
  address: string | null
  phone: string | null
  location: LatLng | null
  locationPrecision: string | null
  beds: number | null
  bedsSource: string | null
  pmjay: { empanelled: boolean; hospitalId: string; asOf: string; desk: { officer: string | null; phone: string | null; email: string | null } } | null
  specialties: Specialty[]
  insurers: string[]
  verified: boolean
  emergency24x7: boolean | null
  ambulancesAvailable: number
  onCarePath: boolean
  sources: string[]
  notes: string | null
  distanceKm: number | null
  etaMinutes: number | null
}

export interface RankedHospital extends Hospital {
  reasons: string[]
  evidence: string | null
  evidenceLabel: string | null
  score: number
}

export interface Recommendation {
  specialty: string | null
  specialtyLabel: string | null
  maxKm: number
  considered: number
  nearest: RankedHospital[]
  best: RankedHospital[]
}

export interface Meta {
  region: { name: string; state: string; centre: LatLng }
  specialties: Array<{ key: string; label: string }>
  facilityTypes: Array<{ key: string; label: string }>
  emergencyNumbers: Array<{ number: string; label: string }>
  pmjay: { coverPerFamilyPerYear: number; helpline: string; checkEligibilityUrl: string }
  demoMode: boolean
  assistant: { aiAvailable: boolean; reason: string | null }
  attribution: string
}

export interface Me {
  name: string | null
  phone: string | null
  emergencyContactName: string | null
  emergencyContactPhone: string | null
  hasPmjay: boolean
  insurer: string | null
  sumInsured: number | null
  activeSosId?: string | null
}

export type IncidentStatus = 'searching' | 'assigned' | 'arrived' | 'to_hospital' | 'completed' | 'cancelled' | 'no_response'

export interface Incident {
  id: string
  status: IncidentStatus
  createdAt: string
  pickup: LatLng & { accuracyM: number | null }
  search: { wave: number; totalWaves: number; radiusKm: number | null; contacted: number; contactedThisWave: number; declined: number }
  hospital: { id: string; name: string; phone: string | null; address: string | null; location: LatLng | null } | null
  ambulance: { vehicleNumber: string; kind: string; driverName: string; driverPhone: string; location: LatLng | null; locationAt: string | null; simulated: boolean } | null
  eta: { minutes: number; distanceKm: number; source: 'osrm' | 'estimate'; path: LatLng[] } | null
  traffic: 'slow' | 'moving' | null
  timeline: Array<{ at: string; type: string; message: string }>
  acceptedAt: string | null
  arrivedAt: string | null
  patient?: { name: string | null; phone: string; note: string | null }
}

export interface Appointment {
  id: string
  hospitalId: string
  hospitalName: string
  hospitalPhone: string | null
  department: string
  preferredDate: string
  preferredSlot: 'morning' | 'afternoon' | 'evening'
  reason: string | null
  patientName: string
  patientPhone: string
  status: 'requested' | 'confirmed' | 'declined' | 'cancelled'
  confirmedFor: string | null
  hospitalNote: string | null
  createdAt: string
}

export interface ChatTurn { role: 'user' | 'assistant'; content: string }
export interface AssistantReply {
  reply: string
  emergency: { flagged: boolean; reasons: string[] }
  recommendation: Recommendation | null
  mode: 'ai' | 'rules'
}

export class ApiError extends Error {
  constructor(public status: number, message: string, public code: string) {
    super(message)
  }
}

async function request<T>(method: string, path: string, body?: unknown, signal?: AbortSignal): Promise<T> {
  let res: Response
  try {
    res = await fetch(`/api${path}`, {
      method,
      credentials: 'same-origin',
      headers: body !== undefined ? { 'content-type': 'application/json' } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal,
    })
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e
    throw new ApiError(0, 'No connection. Check your internet and try again.', 'network')
  }
  const data = res.headers.get('content-type')?.includes('json') ? await res.json() : null
  if (!res.ok) throw new ApiError(res.status, data?.error?.message ?? `Request failed (${res.status})`, data?.error?.code ?? 'error')
  return data as T
}

export const api = {
  get: <T>(path: string, signal?: AbortSignal) => request<T>('GET', path, undefined, signal),
  post: <T>(path: string, body: unknown = {}) => request<T>('POST', path, body),
  put: <T>(path: string, body: unknown) => request<T>('PUT', path, body),
  patch: <T>(path: string, body: unknown) => request<T>('PATCH', path, body),
}

export function qs(params: Record<string, string | number | boolean | null | undefined>): string {
  const s = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== '') s.set(k, String(v))
  const str = s.toString()
  return str ? `?${str}` : ''
}
