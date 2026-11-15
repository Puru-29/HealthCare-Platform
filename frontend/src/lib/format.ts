export const inr = (n: number) => '₹' + Math.round(n).toLocaleString('en-IN')

export const km = (n: number | null | undefined) => (n === null || n === undefined ? '' : n < 1 ? `${Math.round(n * 1000)} m` : `${n.toFixed(n < 10 ? 1 : 0)} km`)

export const minutes = (n: number | null | undefined) => {
  if (n === null || n === undefined) return ''
  if (n < 60) return `${Math.max(1, Math.round(n))} min`
  const h = Math.floor(n / 60)
  const m = Math.round(n % 60)
  return m ? `${h} h ${m} min` : `${h} h`
}

export const time = (iso: string) => new Date(iso).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })

export const date = (iso: string) => new Date(iso.length === 10 ? iso + 'T00:00:00' : iso).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })

export const tel = (phone: string) => `tel:${phone.replace(/[^\d+]/g, '')}`

type Point = { lat: number; lng: number }

/**
 * Google Maps directions to an exact point.
 * - The destination is always coordinates. Sending a name is unreliable: many
 *   facilities share generic names ("Civil Hospital", "Jai Hospital", "PHC"), and
 *   Google matched "SDH Gohana (Civil Hospital)" to Civil Hospital Sonipat, 50 km away.
 *   Google may label the spot with a neighbouring business, but the route ends there.
 * - `origin`: the app's own location. Pass it only when Google may not know where the
 *   person is (desktop browsers without location permission fall back to an IP guess,
 *   which can be another city). Leave it out on phones so the Maps app navigates live.
 */
export function directionsUrl(dest: Point, opts: { origin?: Point | null } = {}) {
  const params = new URLSearchParams({ api: '1', destination: `${dest.lat},${dest.lng}`, travelmode: 'driving' })
  if (opts.origin) params.set('origin', `${opts.origin.lat.toFixed(6)},${opts.origin.lng.toFixed(6)}`)
  return `https://www.google.com/maps/dir/?${params}`
}

export const isDialable = (phone: string | null | undefined): phone is string => !!phone && !/^0+$/.test(phone.replace(/\D/g, ''))

export function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(' ')
}
