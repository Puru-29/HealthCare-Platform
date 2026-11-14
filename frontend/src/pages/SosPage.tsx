import { AlertTriangle, CheckCircle2, Clock, Hospital, Phone, Siren, TrafficCone, Truck, X } from 'lucide-react'
import { useState } from 'react'
import { Link, useParams } from 'react-router'
import { HospitalCard } from '../components/HospitalCard'
import { MapView, type MapMarker } from '../components/MapView'
import { CallButton, EmergencyNumbers, ErrorNote, Spinner } from '../components/ui'
import { api, qs, type Incident, type Recommendation } from '../lib/api'
import { cx, isDialable, km, minutes, tel, time } from '../lib/format'
import { useApi, useEventStream } from '../lib/hooks'

const STEPS: Array<{ key: Incident['status'][]; label: string }> = [
  { key: ['searching'], label: 'Finding ambulance' },
  { key: ['assigned'], label: 'On the way' },
  { key: ['arrived'], label: 'Arrived' },
  { key: ['to_hospital', 'completed'], label: 'To hospital' },
]

export function SosPage() {
  const { id = '' } = useParams()
  const initial = useApi<Incident>(`/sos/${id}`)
  const [live, setLive] = useState<Incident | null>(null)
  const connected = useEventStream<Incident>(`/api/sos/${id}/stream`, 'incident', setLive)
  const inc = live ?? initial.data
  const [cancelling, setCancelling] = useState(false)

  if (initial.error && !inc) return <div className="mx-auto max-w-xl space-y-4"><ErrorNote>{initial.error}</ErrorNote><EmergencyNumbers /></div>
  if (!inc) return <Spinner label="Loading your SOS…" />

  const stepIndex = STEPS.findIndex((s) => s.key.includes(inc.status))
  const active = ['searching', 'assigned', 'arrived', 'to_hospital'].includes(inc.status)

  async function cancel() {
    if (!confirm('Cancel the ambulance request?')) return
    setCancelling(true)
    try { setLive(await api.post<Incident>(`/sos/${id}/cancel`)) } finally { setCancelling(false) }
  }

  return (
    <div className="mx-auto max-w-xl space-y-4">
      {active && (
        <ol className="grid grid-cols-4 gap-1" aria-label="Progress">
          {STEPS.map((s, i) => (
            <li key={s.label} className="space-y-1.5">
              <div className={cx('h-1.5 rounded-full', i <= stepIndex ? 'bg-sos' : 'bg-line')} />
              <p className={cx('text-[11px] font-medium', i === stepIndex ? 'text-sos-dark' : 'text-ink-3')}>{s.label}</p>
            </li>
          ))}
        </ol>
      )}

      {inc.status === 'searching' && <Searching inc={inc} />}
      {['assigned', 'arrived', 'to_hospital'].includes(inc.status) && <Assigned inc={inc} />}
      {inc.status === 'completed' && (
        <div className="card p-5 text-center">
          <CheckCircle2 className="mx-auto size-10 text-brand" aria-hidden />
          <h1 className="mt-2 text-xl font-bold">You reached {inc.hospital?.name ?? 'the hospital'}</h1>
          <p className="mt-1 text-sm text-ink-2">Trip completed. We hope you feel better soon.</p>
          <Link to="/" className="btn-secondary mt-4">Back to home</Link>
        </div>
      )}
      {inc.status === 'cancelled' && (
        <div className="card p-5 text-center">
          <X className="mx-auto size-10 text-ink-3" aria-hidden />
          <h1 className="mt-2 text-xl font-bold">Request cancelled</h1>
          <Link to="/" className="btn-secondary mt-4">Back to home</Link>
        </div>
      )}
      {inc.status === 'no_response' && <NoResponse inc={inc} />}

      {active && (
        <div className="flex items-center justify-between gap-3">
          <a href="tel:108" className="btn-secondary flex-1"><Phone className="size-4" aria-hidden /> Also call 108</a>
          {['searching', 'assigned'].includes(inc.status) && (
            <button className="btn-ghost text-sos-dark" onClick={() => void cancel()} disabled={cancelling}>Cancel request</button>
          )}
        </div>
      )}

      <section className="card p-4">
        <p className="eyebrow mb-3">Timeline {active && !connected && <span className="ml-2 normal-case text-amber">reconnecting…</span>}</p>
        <ol className="space-y-3">
          {[...inc.timeline].reverse().map((e, i) => (
            <li key={`${e.at}-${i}`} className="flex gap-3 text-sm">
              <span className="w-16 shrink-0 text-xs text-ink-3">{time(e.at)}</span>
              <span className={i === 0 ? 'font-medium' : 'text-ink-2'}>{e.message}</span>
            </li>
          ))}
        </ol>
      </section>
    </div>
  )
}

function Searching({ inc }: { inc: Incident }) {
  return (
    <section className="card overflow-hidden">
      <div className="relative flex flex-col items-center bg-sos-soft px-5 pb-6 pt-8 text-center">
        <div className="radar relative grid size-24 place-items-center rounded-full">
          <span className="grid size-16 place-items-center rounded-full bg-sos text-white"><Siren className="size-8" aria-hidden /></span>
        </div>
        <h1 className="mt-5 text-xl font-bold text-sos-dark">Finding the nearest ambulance</h1>
        <p className="mt-1 text-sm text-ink-2" aria-live="polite">
          {inc.search.contactedThisWave > 0
            ? <>Alerted <b>{inc.search.contactedThisWave}</b> hospital{inc.search.contactedThisWave === 1 ? '' : 's'} within {inc.search.radiusKm} km. The first to accept is assigned to you.</>
            : <>Searching within {inc.search.radiusKm ?? '…'} km…</>}
        </p>
        <p className="mt-2 text-xs text-ink-3">Search round {inc.search.wave} of {inc.search.totalWaves}</p>
      </div>
      <div className="space-y-2 p-4 text-sm text-ink-2">
        <p className="font-medium text-ink">While you wait</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>Keep your phone on and the line free — the crew will call you.</li>
          <li>Unlock the door and switch on an outside light if it is dark.</li>
          <li>Keep the patient still and comfortable. Do not give food or water.</li>
        </ul>
      </div>
    </section>
  )
}

function Assigned({ inc }: { inc: Incident }) {
  const amb = inc.ambulance
  const markers: MapMarker[] = [{ id: 'you', kind: 'you', position: inc.pickup }]
  if (amb?.location) markers.push({ id: 'amb', kind: 'ambulance', position: amb.location })
  if (inc.hospital?.location && inc.status === 'to_hospital') markers.push({ id: 'h', kind: 'hospital', position: inc.hospital.location })
  const title = inc.status === 'arrived' ? 'Ambulance has arrived' : inc.status === 'to_hospital' ? `On the way to ${inc.hospital?.name ?? 'hospital'}` : 'Ambulance is on the way'
  return (
    <>
      <section className="card overflow-hidden">
        <div className="flex items-end justify-between gap-3 p-4">
          <div>
            <p className="eyebrow">{inc.hospital?.name}</p>
            <h1 className="mt-0.5 text-xl font-bold">{title}</h1>
          </div>
          {inc.eta && inc.status !== 'arrived' && (
            <div className="text-right">
              <p className="text-3xl font-black leading-none text-sos">{minutes(inc.eta.minutes)}</p>
              <p className="mt-1 text-xs text-ink-2">{km(inc.eta.distanceKm)} away</p>
            </div>
          )}
        </div>
        {inc.traffic === 'slow' && inc.status !== 'arrived' && (
          <div className="mx-4 mb-3 flex items-center gap-2 rounded-xl bg-amber-soft px-3 py-2 text-sm text-amber">
            <TrafficCone className="size-4 shrink-0" aria-hidden /> The ambulance is moving slowly — likely traffic on the route. ETA may grow.
          </div>
        )}
        <MapView className="h-80 rounded-none border-x-0 border-b-0" markers={markers} path={inc.eta?.path} />
        {inc.eta?.source === 'estimate' && <p className="px-4 py-2 text-[11px] text-ink-3">ETA is an estimate from straight-line distance.</p>}
      </section>

      {amb && (
        <section className="card flex items-center gap-3 p-4">
          <span className="grid size-11 shrink-0 place-items-center rounded-full bg-sos-soft text-sos"><Truck className="size-5" aria-hidden /></span>
          <div className="min-w-0 flex-1">
            <p className="font-semibold">{amb.driverName}</p>
            <p className="text-sm text-ink-2">{amb.vehicleNumber} · {amb.kind === 'ALS' ? 'Advanced life support' : amb.kind === 'BLS' ? 'Basic life support' : 'Patient transport'}</p>
            {amb.locationAt && <p className="flex items-center gap-1 text-[11px] text-ink-3"><Clock className="size-3" aria-hidden /> Location updated {time(amb.locationAt)}</p>}
          </div>
          {isDialable(amb.driverPhone)
            ? <a href={tel(amb.driverPhone)} className="btn-danger"><Phone className="size-4" aria-hidden /> Call driver</a>
            : <span className="text-xs text-ink-3">Demo driver</span>}
        </section>
      )}
      {inc.hospital && (
        <section className="card flex items-center gap-3 p-4">
          <span className="grid size-11 shrink-0 place-items-center rounded-full bg-brand-soft text-brand"><Hospital className="size-5" aria-hidden /></span>
          <div className="min-w-0 flex-1">
            <p className="font-semibold">{inc.hospital.name}</p>
            <p className="truncate text-sm text-ink-2">{inc.hospital.address ?? 'Accepted your request'}</p>
          </div>
          <CallButton phone={inc.hospital.phone} />
        </section>
      )}
    </>
  )
}

function NoResponse({ inc }: { inc: Incident }) {
  const rec = useApi<Recommendation>(`/hospitals/recommend${qs({ lat: inc.pickup.lat, lng: inc.pickup.lng, specialty: 'emergency', maxKm: 40 })}`)
  return (
    <>
      <section className="card border-sos/30 p-5">
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 size-6 shrink-0 text-sos" aria-hidden />
          <div>
            <h1 className="text-lg font-bold">No partner ambulance accepted</h1>
            <p className="mt-1 text-sm text-ink-2">Call the free government ambulance now. 108 covers all of Haryana.</p>
          </div>
        </div>
        <a href="tel:108" className="btn-danger mt-4 w-full py-3.5 text-base"><Phone className="size-5" aria-hidden /> Call 108 ambulance</a>
        <div className="mt-3"><EmergencyNumbers /></div>
      </section>
      <section className="space-y-2">
        <p className="eyebrow">Or go directly — nearest emergency care</p>
        {rec.data?.nearest.map((h) => <HospitalCard key={h.id} hospital={h} compact />)}
      </section>
    </>
  )
}
