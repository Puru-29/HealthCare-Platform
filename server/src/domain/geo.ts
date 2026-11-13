export interface LatLng {
  lat: number
  lng: number
}

const EARTH_RADIUS_KM = 6371

export function haversineKm(a: LatLng, b: LatLng): number {
  const rad = (d: number) => (d * Math.PI) / 180
  const dLat = rad(b.lat - a.lat)
  const dLng = rad(b.lng - a.lng)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)))
}

/** Roads in this region run ~1.3x the straight-line distance. Used when no router answers. */
export const ROAD_FACTOR = 1.3

/** Rough ambulance speed for estimates without a router (mixed town/highway). */
export const ESTIMATE_SPEED_KMH = 32

export function estimateRoadKm(a: LatLng, b: LatLng): number {
  return haversineKm(a, b) * ROAD_FACTOR
}

export function estimateMinutes(roadKm: number, speedKmh = ESTIMATE_SPEED_KMH): number {
  return (roadKm / speedKmh) * 60
}

export function isValidLatLng(p: Partial<LatLng> | null | undefined): p is LatLng {
  return !!p && Number.isFinite(p.lat) && Number.isFinite(p.lng) &&
    p.lat! >= -90 && p.lat! <= 90 && p.lng! >= -180 && p.lng! <= 180
}

/** Point a fraction `t` (0..1) of the way along a polyline. */
export function pointAlong(path: LatLng[], t: number): LatLng {
  if (path.length === 0) throw new Error('empty path')
  if (path.length === 1 || t <= 0) return path[0]!
  if (t >= 1) return path[path.length - 1]!
  const segs: number[] = []
  let total = 0
  for (let i = 1; i < path.length; i++) {
    const d = haversineKm(path[i - 1]!, path[i]!)
    segs.push(d)
    total += d
  }
  let target = total * t
  for (let i = 0; i < segs.length; i++) {
    const d = segs[i]!
    if (target <= d) {
      const f = d === 0 ? 0 : target / d
      const a = path[i]!, b = path[i + 1]!
      return { lat: a.lat + (b.lat - a.lat) * f, lng: a.lng + (b.lng - a.lng) * f }
    }
    target -= d
  }
  return path[path.length - 1]!
}
