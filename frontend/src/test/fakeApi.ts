import { vi } from 'vitest'

export interface Call { method: string; path: string; body: unknown }

/**
 * Replace fetch with a tiny router: `routes` maps "GET /api/x" (or "GET /api/x*" prefix)
 * to a JSON body or [status, body]. Records every call for assertions.
 */
export function fakeApi(routes: Record<string, unknown>) {
  const calls: Call[] = []
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), 'http://localhost')
    const method = (init?.method ?? 'GET').toUpperCase()
    const key = `${method} ${url.pathname}`
    calls.push({ method, path: url.pathname, body: init?.body ? JSON.parse(String(init.body)) : undefined })
    const match = key in routes ? routes[key] : Object.entries(routes).find(([k]) => k.endsWith('*') && key.startsWith(k.slice(0, -1)))?.[1]
    if (match === undefined) return json(404, { error: { code: 'not_found', message: `No fake for ${key}` } })
    const [status, body] = Array.isArray(match) && typeof match[0] === 'number' ? (match as [number, unknown]) : [200, match]
    return json(status, body)
  }))
  return calls
}

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

export const GUEST = {
  signedIn: false, name: null, phone: null, emergencyContactName: null, emergencyContactPhone: null,
  bloodGroup: null, allergies: null, hasPmjay: false, pmjayUsed: null, insurer: null, sumInsured: null, activeSosId: null,
}

export function incident(overrides: Record<string, unknown> = {}) {
  const search = { wave: 1, totalWaves: 3, radiusKm: 8, contacted: 2, contactedThisWave: 2, declined: 0, noAcceptanceYet: false, alsPreferred: false }
  return {
    id: 'inc-1', status: 'searching', createdAt: new Date().toISOString(),
    pickup: { lat: 28.995, lng: 77.03, accuracyM: 15 },
    hospital: null, ambulance: null, eta: null, traffic: null,
    timeline: [{ at: new Date().toISOString(), type: 'created', message: 'SOS received.' }],
    acceptedAt: null, arrivedAt: null, category: null, categoryLabel: null, advisories: [], familyTracking: false,
    ...overrides,
    search: { ...search, ...((overrides.search as object | undefined) ?? {}) },
  }
}
