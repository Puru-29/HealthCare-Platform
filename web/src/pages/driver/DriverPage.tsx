import { CheckCircle2, LocateFixed, Navigation, Phone, Radio } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router'
import { MapView, type MapMarker } from '../../components/MapView'
import { ErrorNote, Spinner } from '../../components/ui'
import { api, type Incident } from '../../lib/api'
import { directionsUrl, isDialable, km, minutes, tel } from '../../lib/format'
import { useApi, useEventStream } from '../../lib/hooks'

/** Opened by the ambulance driver from the link the hospital shares. Big targets, minimal text. */
export function DriverPage() {
  const { token = '' } = useParams()
  const initial = useApi<Incident>(`/driver/${token}`)
  const [live, setLive] = useState<Incident | null>(null)
  useEventStream<Incident>(`/api/driver/${token}/stream`, 'incident', (d) => setLive((prev) => ({ ...d, patient: prev?.patient ?? initial.data?.patient })))
  const inc = live ?? initial.data
  const [sharing, setSharing] = useState(false)
  const [gpsError, setGpsError] = useState<string | null>(null)
  const watchId = useRef<number | null>(null)
  const lastSent = useRef(0)

  const active = inc && ['assigned', 'arrived', 'to_hospital'].includes(inc.status)

  useEffect(() => {
    if (!active || !navigator.geolocation) return
    watchId.current = navigator.geolocation.watchPosition(
      (p) => {
        setSharing(true)
        setGpsError(null)
        if (Date.now() - lastSent.current < 4000) return
        lastSent.current = Date.now()
        void api.post(`/driver/${token}/location`, { lat: p.coords.latitude, lng: p.coords.longitude }).catch(() => undefined)
      },
      (e) => { setSharing(false); setGpsError(e.code === e.PERMISSION_DENIED ? 'Allow location so the patient can see you coming.' : 'GPS signal lost — retrying…') },
      { enableHighAccuracy: true, maximumAge: 3000, timeout: 20_000 },
    )
    return () => { if (watchId.current !== null) navigator.geolocation.clearWatch(watchId.current) }
  }, [active, token])

  if (initial.error && !inc) return <div className="p-6"><ErrorNote>{initial.error}</ErrorNote></div>
  if (!inc) return <Spinner />

  async function advance(status: 'arrived' | 'to_hospital' | 'completed') {
    const d = await api.post<Incident>(`/driver/${token}/status`, { status })
    setLive(d)
  }

  const target = inc.status === 'to_hospital' ? inc.hospital?.location : inc.pickup
  const markers: MapMarker[] = [{ id: 'p', kind: 'you', position: inc.pickup }]
  if (inc.ambulance?.location) markers.push({ id: 'a', kind: 'ambulance', position: inc.ambulance.location })
  if (inc.status === 'to_hospital' && inc.hospital?.location) markers.push({ id: 'h', kind: 'hospital', position: inc.hospital.location })
  const patient = inc.patient ?? initial.data?.patient

  return (
    <div className="mx-auto min-h-dvh max-w-lg space-y-4 p-4">
      <header className="flex items-center justify-between">
        <p className="font-bold">CarePath · Driver</p>
        <span className={`chip ${sharing ? 'bg-brand-soft text-brand' : 'bg-amber-soft text-amber'}`}>
          {sharing ? <><Radio className="size-3" aria-hidden /> Sharing location</> : <><LocateFixed className="size-3" aria-hidden /> Waiting for GPS</>}
        </span>
      </header>
      {gpsError && <ErrorNote>{gpsError}</ErrorNote>}

      {inc.status === 'completed' || inc.status === 'cancelled' ? (
        <div className="card p-6 text-center">
          <CheckCircle2 className="mx-auto size-10 text-brand" aria-hidden />
          <p className="mt-2 text-xl font-bold">{inc.status === 'completed' ? 'Trip complete' : 'Trip cancelled'}</p>
          <p className="text-sm text-ink-2">You can close this page.</p>
        </div>
      ) : (
        <>
          <section className="card p-4">
            <p className="eyebrow">{inc.status === 'to_hospital' ? `To ${inc.hospital?.name}` : 'Pick up patient'}</p>
            <p className="mt-1 text-2xl font-bold">{patient?.name ?? 'Patient'}</p>
            {patient?.note && <p className="mt-1 rounded-lg bg-sos-soft p-2 text-sm text-sos-dark">{patient.note}</p>}
            {inc.eta && <p className="mt-2 text-sm text-ink-2">{km(inc.eta.distanceKm)} · about {minutes(inc.eta.minutes)}</p>}
            <div className="mt-4 grid grid-cols-2 gap-2">
              {patient && isDialable(patient.phone) && <a className="btn-secondary py-3" href={tel(patient.phone)}><Phone className="size-5" aria-hidden /> Call patient</a>}
              {target && <a className="btn-primary py-3" href={directionsUrl(target)} target="_blank" rel="noreferrer"><Navigation className="size-5" aria-hidden /> Navigate</a>}
            </div>
          </section>
          <MapView className="h-72" markers={markers} path={inc.eta?.path} />
          <div className="grid gap-2">
            {inc.status === 'assigned' && <button className="btn-danger py-4 text-base" onClick={() => void advance('arrived')}>I have reached the patient</button>}
            {inc.status === 'arrived' && <button className="btn-danger py-4 text-base" onClick={() => void advance('to_hospital')}>Patient on board — going to hospital</button>}
            {inc.status === 'to_hospital' && <button className="btn-primary py-4 text-base" onClick={() => void advance('completed')}>Reached hospital — finish trip</button>}
          </div>
        </>
      )}
    </div>
  )
}
