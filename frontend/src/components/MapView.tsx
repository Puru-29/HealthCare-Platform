import L from 'leaflet'
import { useEffect, useMemo } from 'react'
import { MapContainer, Marker, Polyline, Popup, TileLayer, useMap } from 'react-leaflet'
import type { LatLng } from '../lib/api'

export interface MapMarker {
  id: string
  position: LatLng
  kind: 'hospital' | 'you' | 'ambulance'
  selected?: boolean
  label?: string
  popup?: React.ReactNode
  onClick?: () => void
}

const icons = {
  hospital: (label = '+', selected = false) => L.divIcon({ className: '', html: `<div class="pin pin-hospital${selected ? ' is-selected' : ''}">${label}</div>`, iconSize: [30, 30], iconAnchor: [15, 15] }),
  you: () => L.divIcon({ className: '', html: '<div class="pin pin-you"></div>', iconSize: [20, 20], iconAnchor: [10, 10] }),
  ambulance: () => L.divIcon({
    className: '',
    html: '<div class="pin pin-ambulance" aria-label="Ambulance"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 10H6M8 8v4"/><path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2"/><path d="M19 18h2a1 1 0 0 0 1-1v-3.28a1 1 0 0 0-.684-.948l-1.923-.641a1 1 0 0 1-.578-.502l-1.539-3.076A1 1 0 0 0 16.382 8H14"/><path d="M9 18h5"/><circle cx="7" cy="18" r="2"/><circle cx="17" cy="18" r="2"/></svg></div>',
    iconSize: [38, 38], iconAnchor: [19, 19],
  }),
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
    <div className={`overflow-hidden rounded-[22px] ${className}`}>
      <MapContainer center={[start.lat, start.lng]} zoom={13} scrollWheelZoom={false} className="h-full w-full" attributionControl>
        <TileLayer
          url={import.meta.env.VITE_TILE_URL ?? 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'}
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          maxZoom={19}
        />
        {path && path.length > 1 && (
          <Polyline positions={path.map((p) => [p.lat, p.lng] as [number, number])} pathOptions={{ color: '#0f766e', weight: 5, opacity: 0.85, dashArray: '1 10', lineCap: 'round' }} />
        )}
        {markers.map((m) => (
          <Marker
            key={m.id}
            position={[m.position.lat, m.position.lng]}
            icon={m.kind === 'you' ? icons.you() : m.kind === 'ambulance' ? icons.ambulance() : icons.hospital(m.label ? escape(m.label) : undefined, m.selected)}
            eventHandlers={m.onClick ? { click: m.onClick } : undefined}
            zIndexOffset={m.kind === 'ambulance' ? 1000 : m.selected ? 800 : m.kind === 'you' ? 500 : 0}
          >
            {m.popup && <Popup>{m.popup}</Popup>}
          </Marker>
        ))}
        <FitBounds points={fitPoints} />
      </MapContainer>
    </div>
  )
}
