import { AlertTriangle, Check, CheckCircle2, Phone, Siren, TrafficCone, X } from 'lucide-react'
import { useState } from 'react'
import { Link, Navigate, useNavigate, useParams } from 'react-router'
import { HospitalRow } from '../components/HospitalCard'
import { MapView, type MapMarker } from '../components/MapView'
import { SosButton } from '../components/SosButton'
import { SosSheet } from '../components/SosSheet'
import { ErrorNote, Panel, Spinner } from '../components/ui'
import { api, qs, type Incident, type Recommendation } from '../lib/api'
import { cx, isDialable, km, minutes, tel, time } from '../lib/format'
import { useApi, useEventStream, useLocation } from '../lib/hooks'
import { initials, useMe } from '../lib/me'

/** /app/sos — jumps to the active request, otherwise offers the SOS button. */
export function SosHubPage() {
  const { me, loading } = useMe()
  const loc = useLocation()
  const navigate = useNavigate()
  const [sheetOpen, setSheetOpen] = useState(false)
  if (loading) return <Spinner />
  if (me?.activeSosId) return <Navigate to={`/app/sos/${me.activeSosId}`} replace />
  return (
    <>
      <header className="fu">
        <h1 className="heading text-3xl sm:text-[34px]">SOS tracking</h1>
        <p className="mt-1.5 text-[15px] text-ink-2">No active emergency. Press and hold to alert the nearest hospitals with an ambulance.</p>
      </header>
      <section className="glass fu d1 relative mx-auto flex w-full max-w-xl flex-col items-center overflow-hidden rounded-[30px] p-8 text-center">
        <div className="sheen" />
        <SosButton onTrigger={() => setSheetOpen(true)} />
        <div className="mt-5 flex flex-wrap justify-center gap-2.5">
          <a href="tel:112" className="btn-secondary">Call 112</a>
          <a href="tel:108" className="btn-secondary">Ambulance 108</a>
        </div>
      </section>
      {sheetOpen && <SosSheet me={me} coords={loc.coords} onClose={() => setSheetOpen(false)} onSent={(id) => navigate(`/app/sos/${id}`)} />}
    </>
  )
}

const ORDER: Incident['status'][] = ['searching', 'assigned', 'arrived', 'to_hospital', 'completed']

export function SosPage() {
  const { id = '' } = useParams()
  const { reload: reloadMe } = useMe()
  const initial = useApi<Incident>(`/sos/${id}`)
  const [live, setLive] = useState<Incident | null>(null)
  const connected = useEventStream<Incident>(`/api/sos/${id}/stream`, 'incident', setLive)
  const inc = live ?? initial.data
  const [cancelling, setCancelling] = useState(false)

  if (initial.error && !inc) return <><ErrorNote>{initial.error}</ErrorNote><p className="text-sm text-ink-2">In an emergency call <a className="font-bold text-brand" href="tel:112">112</a> or <a className="font-bold text-brand" href="tel:108">108</a>.</p></>
  if (!inc) return <Spinner label="Loading your SOS…" />

  const active = ['searching', 'assigned', 'arrived', 'to_hospital'].includes(inc.status)
  async function cancel() {
    if (!confirm('Cancel the ambulance request?')) return
    setCancelling(true)
    try { setLive(await api.post<Incident>(`/sos/${id}/cancel`)); void reloadMe() } finally { setCancelling(false) }
  }

  const minsAgo = Math.max(0, Math.round((Date.now() - Date.parse(inc.createdAt)) / 60_000))
  const header = {
    searching: { title: 'Finding the nearest ambulance', sub: `SOS sent ${minsAgo ? `${minsAgo} min ago` : 'just now'} · keep your phone free` },
    assigned: { title: 'Ambulance on the way', sub: `Accepted by ${inc.hospital?.name} · SOS sent ${minsAgo ? `${minsAgo} min ago` : 'just now'}` },
    arrived: { title: 'Ambulance has arrived', sub: `${inc.ambulance?.vehicleNumber ?? ''} is at your location` },
    to_hospital: { title: `On the way to ${inc.hospital?.name ?? 'hospital'}`, sub: 'Patient on board' },
    completed: { title: 'Reached the hospital', sub: 'Trip complete. We hope you feel better soon.' },
    cancelled: { title: 'Request cancelled', sub: 'No ambulance is coming for this request.' },
    no_response: { title: 'No partner ambulance accepted', sub: 'Call the free government ambulance now — 108 covers all of Haryana.' },
  }[inc.status]

  return (
    <>
      <section className={cx('fu flex flex-wrap items-center justify-between gap-4.5 rounded-[26px] border px-6 py-5.5 backdrop-blur-xl',
        inc.status === 'completed' || inc.status === 'cancelled'
          ? 'glass'
          : 'sos-surface')}>
        <div className="flex items-center gap-4">
          <span className="grid size-13 shrink-0 place-items-center rounded-2xl bg-white/18">
            {inc.status === 'completed' ? <CheckCircle2 className="size-6.5" aria-hidden /> : inc.status === 'cancelled' ? <X className="size-6.5" aria-hidden /> : inc.status === 'no_response' ? <AlertTriangle className="size-6.5" aria-hidden /> : <Siren className="live size-6.5" aria-hidden />}
          </span>
          <div>
            <h1 className="heading text-2xl sm:text-[26px]">{header.title}</h1>
            <p className="mt-1 text-[15px] opacity-90">{header.sub}</p>
          </div>
        </div>
        {(active || inc.status === 'no_response') && (
          <div className="flex gap-2.5">
            <a href="tel:108" className="btn min-h-12 bg-white px-5 font-extrabold text-[#b4232c]">Call 108</a>
            <a href="tel:112" className="btn min-h-12 border border-white/45 bg-white/16 px-5 font-bold text-white">112</a>
          </div>
        )}
      </section>

      {inc.status === 'no_response' && <NoResponse inc={inc} />}
      {(inc.status === 'completed' || inc.status === 'cancelled') && (
        <div className="flex gap-2.5"><Link to="/app" className="btn-primary">Back to dashboard</Link></div>
      )}

      {inc.status !== 'no_response' && (
        <div className="flex flex-wrap items-start gap-5.5">
          <LiveMap inc={inc} />
          <div className="flex min-w-0 flex-[2_1_320px] flex-col gap-5.5">
            {inc.ambulance && <AmbulanceCard inc={inc} />}
            {inc.status === 'searching' && <WhileYouWait />}
            <ProgressCard inc={inc} connected={connected} />
            {['searching', 'assigned'].includes(inc.status) && (
              <button className="btn min-h-12 border border-line text-ink-2 hover:bg-fill-2" onClick={() => void cancel()} disabled={cancelling}>Cancel SOS</button>
            )}
          </div>
        </div>
      )}
    </>
  )
}

function LiveMap({ inc }: { inc: Incident }) {
  const markers: MapMarker[] = [{ id: 'you', kind: 'you', position: inc.pickup }]
  if (inc.ambulance?.location && inc.status !== 'completed') markers.push({ id: 'amb', kind: 'ambulance', position: inc.ambulance.location })
  if (inc.hospital?.location && ['to_hospital', 'completed'].includes(inc.status)) markers.push({ id: 'h', kind: 'hospital', position: inc.hospital.location })
  const showEta = inc.eta && ['assigned', 'to_hospital'].includes(inc.status)
  return (
    <section aria-label="Live map" className="glass fu d1 relative min-w-0 flex-[3_1_520px] overflow-hidden rounded-[30px] p-3">
      <MapView className="h-[420px] sm:h-[480px]" markers={markers} path={showEta ? inc.eta!.path : null} />
      {showEta && (
        <div className="glass absolute top-7 left-7 z-[500] rounded-[20px] px-5 py-4">
          <p className="eyebrow">Arriving in</p>
          <p className="heading mt-1 text-[44px] leading-none">{minutes(inc.eta!.minutes)}</p>
          <p className="mt-1.5 text-[13px] text-ink-2">{km(inc.eta!.distanceKm)} by road{inc.eta!.source === 'estimate' ? ' (estimate)' : ''}</p>
        </div>
      )}
      {inc.status === 'searching' && (
        <div className="glass absolute top-7 left-7 z-[500] flex items-center gap-3.5 rounded-[20px] px-5 py-4">
          <span className="relative grid size-11 place-items-center"><span className="sos-ring" /><span className="sos-ring r2" /><span className="size-4 rounded-full bg-sos" /></span>
          <span>
            <span className="block font-bold">{inc.search.contactedThisWave > 0 ? `${inc.search.contactedThisWave} hospital${inc.search.contactedThisWave === 1 ? '' : 's'} alerted` : 'Searching…'}</span>
            <span className="block text-[13px] text-ink-2">within {inc.search.radiusKm ?? '…'} km · round {inc.search.wave} of {inc.search.totalWaves}</span>
          </span>
        </div>
      )}
      {inc.traffic === 'slow' && showEta && (
        <div className="absolute top-7 right-7 z-[500] flex items-center gap-2.5 rounded-2xl border border-amber/50 bg-[#fff4e0]/95 px-4 py-3 text-sm font-semibold text-amber backdrop-blur-lg">
          <TrafficCone className="size-[18px]" aria-hidden /> Moving slowly — likely traffic
        </div>
      )}
    </section>
  )
}

function AmbulanceCard({ inc }: { inc: Incident }) {
  const amb = inc.ambulance!
  const kind = amb.kind === 'ALS' ? 'Advanced life support' : amb.kind === 'BLS' ? 'Basic life support' : 'Patient transport'
  return (
    <section className="glass fu d2 rounded-[28px] p-5.5">
      <p className="eyebrow text-ink-3">Your ambulance</p>
      <div className="mt-3.5 flex items-center gap-3.5">
        <span className="grid size-14 shrink-0 place-items-center rounded-[18px] text-lg font-extrabold text-[#4c0d1f]" style={{ background: 'linear-gradient(135deg,#fecaca,#ff8a8d)' }}>{initials(amb.driverName)}</span>
        <span className="min-w-0 flex-1">
          <span className="heading block text-lg">{amb.driverName}</span>
          <span className="block text-sm text-ink-2">{amb.vehicleNumber} · {kind}</span>
          {amb.locationAt && <span className="block text-xs text-ink-3">Location updated {time(amb.locationAt)}</span>}
        </span>
      </div>
      <div className="mt-4.5 grid grid-cols-2 gap-2.5">
        {isDialable(amb.driverPhone)
          ? <a className="btn-primary min-h-12" href={tel(amb.driverPhone)}><Phone className="size-[18px]" aria-hidden /> Call driver</a>
          : <span className="btn-secondary min-h-12 cursor-default opacity-70">Demo driver</span>}
        {isDialable(inc.hospital?.phone)
          ? <a className="btn-secondary min-h-12" href={tel(inc.hospital!.phone!)}>Call hospital</a>
          : <span className="btn-secondary min-h-12 cursor-default opacity-60">No hospital phone</span>}
      </div>
    </section>
  )
}

function WhileYouWait() {
  return (
    <Panel eyebrow="While you wait" className="fu d2 rounded-[28px]">
      <ul className="list-disc space-y-1.5 pl-5 text-sm text-ink-2">
        <li>Keep your phone on and the line free — the crew will call you.</li>
        <li>Unlock the door and switch on an outside light if it is dark.</li>
        <li>Keep the patient still and comfortable. Don’t give food or water.</li>
      </ul>
    </Panel>
  )
}

function ProgressCard({ inc, connected }: { inc: Incident; connected: boolean }) {
  const at = (type: string) => inc.timeline.find((e) => e.type === type)?.at
  const idx = ORDER.indexOf(inc.status)
  const steps = [
    { label: 'SOS sent', sub: `${time(inc.createdAt)}${inc.pickup.accuracyM ? ` · location ±${Math.round(inc.pickup.accuracyM)} m` : ''}`, done: true },
    { label: `Hospitals alerted within ${inc.search.radiusKm ?? 8} km`, sub: inc.search.wave > 1 ? `Search round ${inc.search.wave}` : 'First ring', done: inc.search.contacted > 0 || idx >= 1 },
    { label: inc.hospital ? `Accepted · ${inc.hospital.name}` : 'A hospital accepts', sub: inc.acceptedAt ? time(inc.acceptedAt) : '', done: idx >= 1 },
    { label: 'On the way to you', sub: idx === 1 ? 'Now' : '', done: idx >= 2, current: idx === 1 },
    { label: 'Arrived', sub: inc.arrivedAt ? time(inc.arrivedAt) : '', done: idx >= 2, current: idx === 2 },
    { label: 'Patient on board → hospital', sub: at('to_hospital') ? time(at('to_hospital')!) : '', done: idx >= 4, current: idx === 3 },
  ]
  if (inc.status === 'searching') steps[1]!.done = false
  const currentIdx = inc.status === 'searching' ? 1 : steps.findIndex((s) => s.current)
  return (
    <section className="glass fu d3 rounded-[28px] p-5.5">
      <p className="eyebrow flex items-center justify-between text-ink-3">Progress {!connected && ['searching', 'assigned', 'arrived', 'to_hospital'].includes(inc.status) && <span className="tracking-normal text-amber normal-case">reconnecting…</span>}</p>
      <ol className="mt-4">
        {steps.map((s, i) => {
          const isCurrent = i === currentIdx
          const done = s.done && !isCurrent
          return (
            <li key={s.label} className="flex gap-3.5">
              <span className="flex flex-col items-center">
                {done ? (
                  <span className="grid size-6.5 place-items-center rounded-full bg-brand-2"><Check className="size-3.5 text-on-mint" strokeWidth={3} aria-hidden /></span>
                ) : isCurrent ? (
                  <span className="live grid size-6.5 place-items-center rounded-full border-2 border-sos bg-sos-soft"><span className="size-2 rounded-full bg-sos" /></span>
                ) : (
                  <span className="size-6.5 rounded-full border-2 border-line" />
                )}
                {i < steps.length - 1 && <span className={cx('h-6.5 w-0.5', done ? 'bg-brand-2' : 'bg-fill-2')} />}
              </span>
              <span className="pt-0.5">
                <span className={cx('block', isCurrent ? 'font-bold' : done ? 'font-semibold' : 'font-medium text-ink-3')}>{s.label}</span>
                {s.sub && <span className="block text-[13px] text-ink-3">{isCurrent && !s.sub ? 'Now' : s.sub}</span>}
              </span>
            </li>
          )
        })}
      </ol>
    </section>
  )
}

function NoResponse({ inc }: { inc: Incident }) {
  const rec = useApi<Recommendation>(`/hospitals/recommend${qs({ lat: inc.pickup.lat, lng: inc.pickup.lng, specialty: 'emergency', maxKm: 40 })}`)
  return (
    <div className="flex flex-wrap gap-5.5">
      <section className="glass min-w-0 flex-[1_1_320px] rounded-[28px] p-6">
        <a href="tel:108" className="btn-danger min-h-15 w-full text-lg"><Phone className="size-5" aria-hidden /> Call 108 ambulance</a>
        <p className="mt-3 text-sm text-ink-2">Free, 24×7. Tell them your location and what happened.</p>
      </section>
      <Panel title="Or go directly — nearest emergency care" className="min-w-0 flex-[2_1_420px] rounded-[28px]">
        <div className="flex flex-col gap-2">{rec.data?.nearest.map((h) => <HospitalRow key={h.id} hospital={h} />)}</div>
      </Panel>
    </div>
  )
}
