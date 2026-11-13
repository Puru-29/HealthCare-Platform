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

export const directionsUrl = (p: { lat: number; lng: number }) => `https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lng}`

export const isDialable = (phone: string | null | undefined): phone is string => !!phone && !/^0+$/.test(phone.replace(/\D/g, ''))

export function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(' ')
}
