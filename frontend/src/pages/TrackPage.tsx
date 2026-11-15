import { CheckCircle2, Clock, Phone, Siren, TrafficCone, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useParams } from 'react-router'
import { MapView, type MapMarker } from '../components/MapView'
import { Aurora, Logo, Spinner } from '../components/ui'
import { api, ApiError, type TrackView } from '../lib/api'
import { km, minutes, time } from '../lib/format'
import { useEventStream } from '../lib/hooks'

const TITLES: Record<TrackView['status'], string> = {
  searching: 'Finding the nearest ambulance',
  assigned: 'Ambulance on the way',
  arrived: 'Ambulance has reached the patient',
  to_hospital: 'On the way to the hospital',
  completed: 'Reached the hospital',
  cancelled: 'Request cancelled',
  no_response: 'No partner ambulance accepted',
}

/**
 * Read-only page for the patient's emergency contact, opened from the SOS SMS.
 * Shows only what the server's tracking view contains: no phones, no medical details.
 */
export function TrackPage() {
  const { token = '' } = useParams()
  const [data, setData] = useState<TrackView | null>(null)
  const [problem, setProblem] = useState<'expired' | 'invalid' | 'error' | null>(null)

  useEffect(() => {
    const ctrl = new AbortController()
    api.get<TrackView>(`/track/${encodeURIComponent(token)}`, ctrl.signal)
      .then(setData)
      .catch((e: Error) => {
        if (e.name === 'AbortError') return
        setProblem(e instanceof ApiError && e.status === 410 ? 'expired' : e instanceof ApiError && e.status === 404 ? 'invalid' : 'error')
      })
    return () => ctrl.abort()
  }, [token])
  const live = !!data && ['searching', 'assigned', 'arrived', 'to_hospital'].includes(data.status)
  useEventStream<TrackView>(live ? `/api/track/${encodeURIComponent(token)}/stream` : null, 'incident', setData)

  return (
    <div className="relative min-h-dvh">
      <Aurora tone="sos" />
      <div className="mx-auto flex max-w-3xl flex-col gap-5 p-4 sm:p-6">
        <header className="flex items-center justify-between">
          <Logo to="/" />
          <span className="chip bg-fill-2 text-ink-2">Family tracking · read-only</span>
        </header>
        {problem ? <Problem kind={problem} /> : !data ? <Spinner label="Loading…" /> : <Tracking data={data} />}
        <p className="text-center text-xs text-ink-3">In an emergency call <a className="font-bold text-brand" href="tel:112">112</a> or <a className="font-bold text-brand" href="tel:108">108</a>.</p>
      </div>
    </div>
  )
}

function Problem({ kind }: { kind: 'expired' | 'invalid' | 'error' }) {
  const text = {
    expired: ['This tracking link has expired', 'Links stop working 12 hours after the trip ends.'],
    invalid: ['This link isn’t valid', 'Check you opened the full link from the SMS.'],
    error: ['Couldn’t load the tracking page', 'Check your connection and try again.'],
  }[kind]
  return (
    <section className="glass rounded-[28px] p-8 text-center" role="alert">
      <h1 className="heading text-2xl">{text[0]}</h1>
      <p className="mt-2 text-ink-2">{text[1]}</p>
    </section>
  )
}

function Tracking({ data: d }: { data: TrackView }) {
  const active = ['searching', 'assigned', 'arrived', 'to_hospital'].includes(d.status)
  const markers: MapMarker[] = [{ id: 'p', kind: 'you', position: d.pickup }]
  if (d.ambulance?.location && d.status !== 'completed') markers.push({ id: 'a', kind: 'ambulance', position: d.ambulance.location })
  if (d.hospital?.location && ['to_hospital', 'completed'].includes(d.status)) markers.push({ id: 'h', kind: 'hospital', position: d.hospital.location })
  const showEta = d.eta && ['assigned', 'to_hospital'].includes(d.status)

  return (
    <>
      <section className={`${active || d.status === 'no_response' ? 'sos-surface' : 'glass'} fu flex items-center gap-4 rounded-[26px] p-5.5`}>
        <span className="grid size-13 shrink-0 place-items-center rounded-2xl bg-white/18">
          {d.status === 'completed' ? <CheckCircle2 className="size-6.5" aria-hidden /> : d.status === 'cancelled' ? <X className="size-6.5" aria-hidden /> : <Siren className={active ? 'live size-6.5' : 'size-6.5'} aria-hidden />}
        </span>
        <div>
          <h1 className="heading text-2xl">{TITLES[d.status]}</h1>
          <p className="mt-1 text-[15px] opacity-90">SOS sent at {time(d.createdAt)}{d.hospital ? ` · ${d.hospital.name}` : ''}</p>
        </div>
      </section>

      {d.status === 'searching' && d.search.noAcceptanceYet && (
        <p className="glass rounded-[22px] p-4.5 text-[15px]"><b>No hospital has accepted yet.</b> The patient has been told to call 108; CarePath is still searching.</p>
      )}
      {d.status === 'no_response' && (
        <a href="tel:108" className="btn-danger min-h-14 text-lg"><Phone className="size-5" aria-hidden /> Call 108 for the patient</a>
      )}

      <section className="glass relative overflow-hidden rounded-[28px] p-3">
        <MapView className="h-[380px]" markers={markers} path={showEta ? d.eta!.path : null} />
        {showEta && (
          <div className="glass absolute top-6 left-6 z-[500] rounded-[20px] px-5 py-4">
            <p className="eyebrow">Arriving in</p>
            <p className="heading mt-1 text-4xl leading-none">{minutes(d.eta!.minutes)}</p>
            <p className="mt-1.5 text-[13px] text-ink-2">{km(d.eta!.distanceKm)} by road</p>
          </div>
        )}
        {d.traffic === 'slow' && showEta && (
          <div className="absolute top-6 right-6 z-[500] flex items-center gap-2 rounded-2xl border border-amber/40 bg-[#fff4e0]/95 px-3.5 py-2.5 text-sm font-semibold text-amber">
            <TrafficCone className="size-4" aria-hidden /> Moving slowly — traffic
          </div>
        )}
      </section>

      {d.ambulance && (
        <section className="glass rounded-[24px] p-5">
          <p className="eyebrow text-ink-3">Ambulance</p>
          <p className="heading mt-2 text-lg">{d.ambulance.vehicleNumber}</p>
          <p className="text-sm text-ink-2">{d.ambulance.kind === 'ALS' ? 'Advanced life support' : d.ambulance.kind === 'BLS' ? 'Basic life support' : 'Patient transport'}{d.hospital ? ` · from ${d.hospital.name}` : ''}</p>
          {d.ambulance.locationAt && <p className="mt-1 flex items-center gap-1 text-xs text-ink-3"><Clock className="size-3" aria-hidden />Location updated {time(d.ambulance.locationAt)}</p>}
        </section>
      )}

      <section className="glass rounded-[24px] p-5">
        <p className="eyebrow text-ink-3">Timeline</p>
        <ol className="mt-3 space-y-2.5">
          {[...d.timeline].reverse().map((e, i) => (
            <li key={`${e.at}-${i}`} className="flex gap-3 text-sm">
              <span className="w-16 shrink-0 text-xs text-ink-3">{time(e.at)}</span>
              <span className={i === 0 ? 'font-semibold' : 'text-ink-2'}>{e.message}</span>
            </li>
          ))}
        </ol>
        {d.expiresAt && <p className="mt-4 text-xs text-ink-3">This link stops working at {new Date(d.expiresAt).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}.</p>}
      </section>
    </>
  )
}
