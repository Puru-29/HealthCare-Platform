import { ArrowLeft, CalendarPlus, CheckCircle2, IndianRupee, Info, Navigation, ShieldCheck } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { MapView } from '../components/MapView'
import { CallButton, ErrorNote, PmjayBadge, Spinner, VerifiedBadge } from '../components/ui'
import { api, qs, type Appointment, type Hospital } from '../lib/api'
import { directionsUrl, km, minutes } from '../lib/format'
import { useApi, useLocation, useMe } from '../lib/hooks'

const SOURCE_STYLE: Record<string, string> = {
  hospital_verified: 'bg-brand-soft text-brand',
  osm_tag: 'bg-sky-soft text-sky',
  name_inference: 'bg-canvas text-ink-2',
  facility_level_norm: 'bg-canvas text-ink-2',
}

export function HospitalDetailPage() {
  const { id = '' } = useParams()
  const loc = useLocation()
  const navigate = useNavigate()
  const { data: h, error, loading } = useApi<Hospital>(`/hospitals/${encodeURIComponent(id)}${qs({ lat: loc.coords?.lat.toFixed(4), lng: loc.coords?.lng.toFixed(4) })}`)
  const [booking, setBooking] = useState(false)

  if (loading && !h) return <Spinner />
  if (error || !h) return <ErrorNote>{error ?? 'Hospital not found'}</ErrorNote>

  const confirmed = h.specialties.some((s) => s.source === 'hospital_verified')
  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <button className="btn-ghost -ml-3" onClick={() => (history.length > 1 ? navigate(-1) : navigate('/hospitals'))}><ArrowLeft className="size-4" aria-hidden /> Back</button>

      <header>
        <div className="flex flex-wrap gap-1.5">
          {h.pmjay && <PmjayBadge />}
          {h.verified && <VerifiedBadge />}
        </div>
        <h1 className="mt-2 text-2xl font-bold leading-tight">{h.name}</h1>
        <p className="mt-1 text-sm text-ink-2">
          {h.facilityTypeLabel}{h.ownership === 'public' ? ' · Government' : h.ownership === 'private' ? ' · Private' : ''}
          {h.beds && ` · ${h.beds} beds`}
          {h.distanceKm !== null && ` · ${km(h.distanceKm)}, ~${minutes(h.etaMinutes)} drive`}
        </p>
        {h.address && <p className="mt-1 text-sm text-ink-2">{h.address}</p>}
      </header>

      <div className="flex flex-wrap gap-2">
        <CallButton phone={h.phone} label="Call hospital" variant="primary" />
        {h.location && <a className="btn-secondary" href={directionsUrl(h.location)} target="_blank" rel="noreferrer"><Navigation className="size-4" aria-hidden /> Directions</a>}
        <button className="btn-secondary" onClick={() => setBooking(true)}><CalendarPlus className="size-4" aria-hidden /> Request appointment</button>
        <Link className="btn-secondary" to={`/insurance?hospital=${encodeURIComponent(h.id)}`}><IndianRupee className="size-4" aria-hidden /> Estimate cost</Link>
      </div>

      {booking && <BookingForm hospital={h} onClose={() => setBooking(false)} />}

      {h.location ? (
        <>
          <MapView className="h-56" markers={[{ id: h.id, kind: 'hospital', position: h.location }, ...(loc.coords ? [{ id: 'you', kind: 'you' as const, position: loc.coords }] : [])]} />
          {h.locationPrecision && h.locationPrecision !== 'building' && (
            <p className="-mt-3 text-xs text-amber">Map pin shows the {h.locationPrecision} centre, not the exact building.</p>
          )}
        </>
      ) : (
        <p className="flex items-center gap-2 rounded-xl bg-amber-soft p-3 text-sm text-amber"><Info className="size-4" aria-hidden /> We don't have a confirmed location for this facility yet.</p>
      )}

      <section className="card p-4">
        <h2 className="font-semibold">Care offered</h2>
        {!confirmed && <p className="mt-1 text-xs text-ink-3">Not yet confirmed by the hospital. Each item shows where the information comes from — call ahead for anything specialised.</p>}
        <ul className="mt-3 flex flex-wrap gap-2">
          {h.specialties.map((s) => (
            <li key={s.key} className={`chip py-1 ${SOURCE_STYLE[s.source] ?? 'bg-canvas'}`} title={s.sourceLabel}>
              {s.source === 'hospital_verified' && <CheckCircle2 className="size-3" aria-hidden />}{s.label}
            </li>
          ))}
        </ul>
        {h.emergency24x7 !== null && <p className="mt-3 text-sm">{h.emergency24x7 ? '✅ 24×7 emergency department' : 'No 24×7 emergency department'}</p>}
      </section>

      {h.pmjay && (
        <section className="card border-amber/30 p-4">
          <h2 className="flex items-center gap-2 font-semibold"><ShieldCheck className="size-4 text-amber" aria-hidden /> Ayushman Bharat (PM-JAY)</h2>
          <p className="mt-1 text-sm text-ink-2">Cashless treatment up to ₹5 lakh per family per year for covered packages. Ask for the Ayushman desk at admission.</p>
          {(h.pmjay.desk.officer || h.pmjay.desk.phone) && (
            <div className="mt-3 flex items-center justify-between gap-3 rounded-xl bg-canvas p-3 text-sm">
              <div>
                <p className="text-xs text-ink-3">Ayushman desk contact</p>
                <p className="font-medium">{h.pmjay.desk.officer}</p>
              </div>
              <CallButton phone={h.pmjay.desk.phone} />
            </div>
          )}
          <p className="mt-2 text-[11px] text-ink-3">Source: PM-JAY empanelled list, as on {h.pmjay.asOf}. ID {h.pmjay.hospitalId}</p>
        </section>
      )}

      {h.insurers.length > 0 && (
        <section className="card p-4">
          <h2 className="font-semibold">Cashless insurance accepted</h2>
          <p className="mt-2 text-sm text-ink-2">{h.insurers.join(', ')}</p>
        </section>
      )}

      <section className="text-xs text-ink-3">
        <p>Sources: {h.sources.join('; ')}{h.bedsSource && `; beds: ${h.bedsSource}`}.</p>
        {h.notes && <p className="mt-1">{h.notes}</p>}
        {!h.onCarePath && <p className="mt-1">Work here? Contact us to verify this listing and receive SOS requests.</p>}
      </section>
    </div>
  )
}

function BookingForm({ hospital, onClose }: { hospital: Hospital; onClose: () => void }) {
  const me = useMe()
  const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10)
  const [form, setForm] = useState({ department: '', preferredDate: tomorrow, preferredSlot: 'morning', reason: '', patientName: '', patientPhone: '' })
  const [done, setDone] = useState<Appointment | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const name = form.patientName || me.data?.name || ''
  const phone = form.patientPhone || me.data?.phone || ''

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      setDone(await api.post<Appointment>('/appointments', { ...form, patientName: name, patientPhone: phone, reason: form.reason || null, hospitalId: hospital.id }))
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  if (done) {
    return (
      <div className="card border-brand/30 p-4">
        <p className="flex items-center gap-2 font-semibold text-brand"><CheckCircle2 className="size-5" aria-hidden /> Request sent</p>
        <p className="mt-1 text-sm text-ink-2">
          {hospital.onCarePath
            ? 'The hospital will confirm a time. Track it under Appointments.'
            : 'This hospital is not on CarePath yet, so please also call them to confirm. Your request is saved under Appointments.'}
        </p>
        <div className="mt-3 flex gap-2"><Link to="/appointments" className="btn-primary">View appointments</Link><button className="btn-ghost" onClick={onClose}>Close</button></div>
      </div>
    )
  }

  const update = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }))
  return (
    <form onSubmit={submit} className="card space-y-3 p-4">
      <h2 className="font-semibold">Request an appointment</h2>
      {!hospital.onCarePath && <p className="rounded-lg bg-amber-soft p-2 text-xs text-amber">This hospital doesn't confirm bookings on CarePath yet — call them too.</p>}
      <div>
        <label className="label" htmlFor="b-dept">Department or doctor</label>
        <select id="b-dept" className="input" required value={form.department} onChange={update('department')}>
          <option value="" disabled>Choose…</option>
          {hospital.specialties.map((s) => <option key={s.key} value={s.label}>{s.label}</option>)}
          <option value="General OPD">General OPD</option>
        </select>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div><label className="label" htmlFor="b-date">Date</label><input id="b-date" type="date" className="input" min={new Date().toISOString().slice(0, 10)} required value={form.preferredDate} onChange={update('preferredDate')} /></div>
        <div>
          <label className="label" htmlFor="b-slot">Time</label>
          <select id="b-slot" className="input" value={form.preferredSlot} onChange={update('preferredSlot')}>
            <option value="morning">Morning</option><option value="afternoon">Afternoon</option><option value="evening">Evening</option>
          </select>
        </div>
        <div><label className="label" htmlFor="b-name">Patient name</label><input id="b-name" className="input" required minLength={2} value={name} onChange={update('patientName')} /></div>
        <div><label className="label" htmlFor="b-phone">Mobile</label><input id="b-phone" className="input" inputMode="tel" required value={phone} onChange={update('patientPhone')} /></div>
      </div>
      <div><label className="label" htmlFor="b-reason">Reason <span className="font-normal text-ink-3">(optional)</span></label><input id="b-reason" className="input" maxLength={500} value={form.reason} onChange={update('reason')} /></div>
      {error && <ErrorNote>{error}</ErrorNote>}
      <div className="flex gap-2"><button className="btn-primary" disabled={busy}>Send request</button><button type="button" className="btn-ghost" onClick={onClose}>Cancel</button></div>
    </form>
  )
}
