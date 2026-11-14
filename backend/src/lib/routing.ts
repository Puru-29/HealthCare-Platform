import { config } from '../config.js'
import { estimateMinutes, estimateRoadKm, type LatLng } from '../domain/geo.js'

export interface Route {
  distanceKm: number
  durationMin: number
  path: LatLng[]
  source: 'osrm' | 'estimate'
}

function straightLine(from: LatLng, to: LatLng): Route {
  const km = estimateRoadKm(from, to)
  return { distanceKm: km, durationMin: estimateMinutes(km), path: [from, to], source: 'estimate' }
}

/**
 * Driving route. Uses OSRM when configured; falls back to a straight-line
 * estimate so an outage never blocks dispatch. OSRM has no live traffic — the
 * dispatch service compares actual ambulance progress with this ETA instead.
 */
export async function getRoute(from: LatLng, to: LatLng): Promise<Route> {
  if (config.routing.mode !== 'osrm') return straightLine(from, to)
  const url = `${config.routing.url}/route/v1/driving/${from.lng},${from.lat};${to.lng},${to.lat}?overview=simplified&geometries=geojson`
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(4000), headers: { 'user-agent': 'carepath-server/0.1' } })
    if (!res.ok) return straightLine(from, to)
    const body = (await res.json()) as { code: string; routes?: Array<{ distance: number; duration: number; geometry: { coordinates: [number, number][] } }> }
    const route = body.routes?.[0]
    if (body.code !== 'Ok' || !route) return straightLine(from, to)
    return {
      distanceKm: route.distance / 1000,
      // OSRM's car profile assumes free-flowing traffic; Indian towns rarely are. Pad it.
      durationMin: (route.duration / 60) * 1.25,
      path: route.geometry.coordinates.map(([lng, lat]) => ({ lat, lng })),
      source: 'osrm',
    }
  } catch {
    return straightLine(from, to)
  }
}
