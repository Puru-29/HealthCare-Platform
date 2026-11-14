import { ArrowLeft, CalendarPlus, CheckCircle2, IndianRupee, Info, Navigation, ShieldCheck, Siren } from 'lucide-react'
import { Link, useNavigate, useParams } from 'react-router'
import { HospitalPills } from '../components/HospitalCard'
import { MapView } from '../components/MapView'
import { CallButton, ErrorNote, Panel, Pill, Spinner, type PillTone } from '../components/ui'
import { qs, type Hospital } from '../lib/api'
import { directionsUrl, km, minutes } from '../lib/format'
import { useApi, useLocation } from '../lib/hooks'

const SOURCE_TONE: Record<string, PillTone> = {
  hospital_verified: 'ok',
  osm_tag: 'cyan',
  name_inference: 'sky',
  facility_level_norm: 'amber',
}

export function HospitalDetailPage() {
  const { id = '' } = useParams()
  const loc = useLocation()
  const navigate = useNavigate()
  const { data: h, error, loading } = useApi<Hospital>(`/hospitals/${encodeURIComponent(id)}${qs({ lat: loc.coords?.lat.toFixed(4), lng: loc.coords?.lng.toFixed(4) })}`)

  if (loading && !h) return <Spinner />
  if (error || !h) return <ErrorNote>{error ?? 'Hospital not found'}</ErrorNote>

  const confirmed = h.specialties.some((s) => s.source === 'hospital_verified')
  const sources = [...new Set(h.specialties.map((s) => s.source))]
  return (
    <>
      <button className="btn-ghost -ml-3 self-start" onClick={() => (history.length > 1 ? navigate(-1) : navigate('/app/hospitals'))}><ArrowLeft className="size-4" aria-hidden /> Back</button>

      <section className="glass fu flex flex-wrap items-end justify-between gap-5 rounded-[30px] p-6 sm:p-7">
        <div className="min-w-0 flex-[1_1_380px]">
          <HospitalPills hospital={h} max={5} />
          <h1 className="heading mt-3 text-3xl leading-tight sm:text-[34px]">{h.name}</h1>
          <p className="mt-1.5 text-[15px] text-ink-2">
            {h.facilityTypeLabel}{h.ownership === 'public' ? ' · Government' : h.ownership === 'private' ? ' · Private' : ''}
            {h.beds && ` · ${h.beds} beds`}
            {h.distanceKm !== null && ` · ${km(h.distanceKm)}, ~${minutes(h.etaMinutes)} drive`}
          </p>
          {h.address && <p className="mt-1 text-sm text-ink-3">{h.address}</p>}
        </div>
        <div className="flex flex-wrap gap-2.5">
          <CallButton phone={h.phone} label="Call hospital" variant="primary" />
          {h.location && <a className="btn-secondary" href={directionsUrl(h.location)} target="_blank" rel="noreferrer"><Navigation className="size-4" aria-hidden /> Directions</a>}
          <Link className="btn-secondary" to={`/app/appointments?hospital=${encodeURIComponent(h.id)}`}><CalendarPlus className="size-4" aria-hidden /> Request appointment</Link>
          <Link className="btn-secondary" to={`/app/insurance?hospital=${encodeURIComponent(h.id)}`}><IndianRupee className="size-4" aria-hidden /> Estimate cost</Link>
        </div>
      </section>

      <div className="flex flex-wrap items-start gap-5.5">
        <div className="flex min-w-0 flex-[3_1_460px] flex-col gap-5.5">
          {h.location ? (
            <section className="glass fu d1 overflow-hidden rounded-[28px] p-3">
              <MapView className="h-72" markers={[{ id: h.id, kind: 'hospital', position: h.location, selected: true }, ...(loc.coords ? [{ id: 'you', kind: 'you' as const, position: loc.coords }] : [])]} />
              {h.locationPrecision && h.locationPrecision !== 'building' && <p className="mx-2 mt-2.5 text-xs text-amber">Map pin shows the {h.locationPrecision} centre, not the exact building.</p>}
            </section>
          ) : (
            <p className="flex items-center gap-2 rounded-2xl bg-amber-soft p-4 text-sm text-amber"><Info className="size-4" aria-hidden /> We don’t have a confirmed location for this facility yet.</p>
          )}

          <Panel title="Care offered" className="fu d2 rounded-[28px]">
            {!confirmed && <p className="-mt-2 mb-4 text-[13px] text-ink-3">Not yet confirmed by the hospital. Colours show where each item comes from — call ahead for anything specialised.</p>}
            <ul className="flex flex-wrap gap-2">
              {h.specialties.map((s) => (
                <li key={s.key}><Pill tone={SOURCE_TONE[s.source] ?? 'muted'} className="px-3 py-1.5 text-[13px]" title={s.sourceLabel}>{s.source === 'hospital_verified' && <CheckCircle2 className="size-3.5" aria-hidden />}{s.label}</Pill></li>
              ))}
            </ul>
            <p className="mt-4 flex flex-wrap items-center gap-2 text-xs text-ink-3">
              Key:{sources.map((src) => <Pill key={src} tone={SOURCE_TONE[src] ?? 'muted'}>{h.specialties.find((s) => s.source === src)?.sourceLabel}</Pill>)}
            </p>
            {h.emergency24x7 !== null && (
              <p className="mt-4 flex items-center gap-2 text-sm"><Siren className="size-4 text-sos" aria-hidden />{h.emergency24x7 ? '24×7 emergency department' : 'No 24×7 emergency department'}</p>
            )}
          </Panel>
        </div>

        <div className="flex min-w-0 flex-[2_1_320px] flex-col gap-5.5">
          {h.pmjay && (
            <section className="glass fu d2 rounded-[28px] p-5.5">
              <p className="flex items-center gap-2 font-bold"><ShieldCheck className="size-5 text-ok" aria-hidden /> Ayushman Bharat (PM-JAY)</p>
              <p className="mt-2 text-sm leading-relaxed text-ink-2">Cashless treatment up to ₹5 lakh per family per year for covered packages. Ask for the Ayushman desk at admission.</p>
              {(h.pmjay.desk.officer || h.pmjay.desk.phone) && (
                <div className="mt-4 flex items-center justify-between gap-3 rounded-2xl bg-fill p-3.5 text-sm">
                  <div><p className="text-xs text-ink-3">Ayushman desk contact</p><p className="font-semibold">{h.pmjay.desk.officer}</p></div>
                  <CallButton phone={h.pmjay.desk.phone} />
                </div>
              )}
              <p className="mt-3 text-[11px] text-ink-3">Source: PM-JAY empanelled list, as on {h.pmjay.asOf}. ID {h.pmjay.hospitalId}</p>
            </section>
          )}
          {h.insurers.length > 0 && (
            <Panel title="Cashless insurance accepted" className="fu d3 rounded-[28px]">
              <p className="text-sm text-ink-2">{h.insurers.join(', ')}</p>
            </Panel>
          )}
          <section className="fu d4 px-1 text-xs leading-relaxed text-ink-3">
            <p>Sources: {h.sources.join('; ')}{h.bedsSource && `; beds: ${h.bedsSource}`}.</p>
            {h.notes && <p className="mt-1">{h.notes}</p>}
            {!h.onCarePath && <p className="mt-1">Work here? Contact us to verify this listing and receive SOS requests.</p>}
          </section>
        </div>
      </div>
    </>
  )
}
