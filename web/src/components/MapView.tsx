import L from 'leaflet'
import { useEffect, useMemo } from 'react'
import { MapContainer, Marker, Polyline, Popup, TileLayer, useMap } from 'react-leaflet'
import type { LatLng } from '../lib/api'

export interface MapMarker {
  id: string
  position: LatLng
  kind: 'hospital' | 'best' | 'you' | 'ambulance'
  label?: string
  popup?: React.ReactNode
  onClick?: () => void
}

const icons = {
  hospital: (label = '+') => L.divIcon({ className: '', html: `<div class="pin pin-hospital">${label}</div>`, iconSize: [30, 30], iconAnchor: [15, 15] }),
  best: (label = '★') => L.divIcon({ className: '', html: `<div class="pin pin-hospital is-best">${label}</div>`, iconSize: [30, 30], iconAnchor: [15, 15] }),
  you: () => L.divIcon({ className: '', html: '<div class="pin pin-you" style="position:relative"></div>', iconSize: [20, 20], iconAnchor: [10, 10] }),
  ambulance: () => L.divIcon({ className: '', html: '<div class="pin pin-ambulance" aria-label="Ambulance">🚑</div>', iconSize: [36, 36], iconAnchor: [18, 18] }),
}

function escape(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
}

function FitBounds({ points, padding = 48 }: { points: LatLng[]; padding?: number }) {
  const map = useMap()
  const key = points.map((p) => `${p.lat.toFixed(4)},${p.lng.toFixed(4)}`).join('|')
  useEffect(() => {
    if (points.length === 0) return
    if (points.length === 1) map.setView([points[0]!.lat, points[0]!.lng], 14)
    else map.fitBounds(L.latLngBounds(points.map((p) => [p.lat, p.lng] as [number, number])), { padding: [padding, padding], maxZoom: 15 })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, map, padding])
  return null
}

export function MapView({
  markers, path, fit, className = 'h-72', center,
}: {
  markers: MapMarker[]
  path?: LatLng[] | null
  fit?: LatLng[]
  className?: string
  center?: LatLng
}) {
  const fitPoints = useMemo(() => fit ?? markers.map((m) => m.position), [fit, markers])
  const start = center ?? fitPoints[0] ?? { lat: 28.9931, lng: 77.0151 }
  return (
    <div className={`overflow-hidden rounded-2xl border border-line ${className}`}>
      <MapContainer center={[start.lat, start.lng]} zoom={13} scrollWheelZoom={false} className="h-full w-full" attributionControl>
        <TileLayer
          url={import.meta.env.VITE_TILE_URL ?? 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'}
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          maxZoom={19}
        />
        {path && path.length > 1 && (
          <Polyline positions={path.map((p) => [p.lat, p.lng] as [number, number])} pathOptions={{ color: '#d92d20', weight: 5, opacity: 0.8 }} />
        )}
        {markers.map((m) => (
          <Marker
            key={m.id}
            position={[m.position.lat, m.position.lng]}
            icon={m.kind === 'you' ? icons.you() : m.kind === 'ambulance' ? icons.ambulance() : icons[m.kind](m.label ? escape(m.label) : undefined)}
            eventHandlers={m.onClick ? { click: m.onClick } : undefined}
            zIndexOffset={m.kind === 'ambulance' ? 1000 : m.kind === 'you' ? 500 : 0}
          >
            {m.popup && <Popup>{m.popup}</Popup>}
          </Marker>
        ))}
        <FitBounds points={fitPoints} />
      </MapContainer>
    </div>
  )
}
