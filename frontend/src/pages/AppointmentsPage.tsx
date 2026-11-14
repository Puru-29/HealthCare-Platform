import { CheckCircle2, Loader2 } from 'lucide-react'
import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router'
import { CallButton, Empty, ErrorNote, PageHeader, Pill, Spinner, type PillTone } from '../components/ui'
import { api, qs, type Appointment, type Hospital } from '../lib/api'
import { cx, km } from '../lib/format'
import { useApi, useLocation } from '../lib/hooks'
import { useMe } from '../lib/me'

const STATUS: Record<Appointment['status'], { label: string; tone: PillTone; tile: string }> = {
  requested: { label: 'Waiting for hospital', tone: 'amber', tile: 'border-[rgb(252_211_77/0.4)] bg-amber-soft text-amber' },
  confirmed: { label: 'Confirmed', tone: 'ok', tile: 'border-brand/35 bg-brand-soft text-brand-3' },
  declined: { label: 'Declined', tone: 'sos', tile: 'border-line bg-fill text-ink-2' },
  cancelled: { label: 'Cancelled', tone: 'muted', tile: 'border-line bg-fill text-ink-2' },
}

function when(a: Appointment) {
  const d = new Date((a.confirmedFor ?? a.preferredDate).replace(' ', 'T') + (a.confirmedFor ? '' : 'T00:00:00'))
  return d
}

export function AppointmentsPage() {
  const { data, error, loading, reload } = useApi<{ data: Appointment[] }>('/appointments')

  async function cancel(id: string) {
    if (!confirm('Cancel this appointment request?')) return
    await api.post(`/appointments/${id}/cancel`)
    reload()
  }

  return (
    <>
      <PageHeader title="Appointments" subtitle="Request a visit. Hospitals on CarePath confirm a time." />
      <div className="flex flex-wrap items-start gap-5">
        <div className="flex min-w-0 flex-[3_1_440px] flex-col gap-3">
          {error && <ErrorNote onRetry={reload}>{error}</ErrorNote>}
          {loading && !data && <Spinner />}
          {data && data.data.length === 0 && (
            <Empty title="No appointments yet">Use the form to request one, or ask the <Link to="/app/guide" className="font-semibold text-brand">care guide</Link> where to go.</Empty>
          )}
          {data?.data.map((a, i) => {
            const d = when(a)
            const s = STATUS[a.status]
            const faded = a.status === 'cancelled' || a.status === 'declined'
            return (
              <article key={a.id} className={cx(`glass fu d${Math.min(i + 1, 6)} flex flex-wrap items-center gap-4.5 rounded-3xl p-5`, faded ? 'opacity-75' : 'lift')}>
                <span className={cx('w-16 flex-none rounded-[18px] border py-2.5 text-center', s.tile)}>
                  <span className="block text-xs font-bold uppercase">{d.toLocaleDateString('en-IN', { month: 'short' })}</span>
                  <span className="heading block text-2xl text-ink">{d.getDate()}</span>
                </span>
                <span className="min-w-[200px] flex-1">
                  <Link to={`/app/hospitals/${encodeURIComponent(a.hospitalId)}`} className="heading block text-lg text-ink no-underline hover:text-brand">{a.hospitalName} · {a.department}</Link>
                  <span className="mt-1 block text-sm text-ink-2">
                    {a.status === 'confirmed' && a.confirmedFor
                      ? `${d.toLocaleString('en-IN', { weekday: 'long', hour: 'numeric', minute: '2-digit' })} · confirmed by hospital`
                      : a.status === 'requested' ? `Preferred: ${d.toLocaleDateString('en-IN', { weekday: 'long' })} ${a.preferredSlot}`
                        : a.status === 'declined' ? (a.hospitalNote ?? 'Hospital could not take this request') : 'Cancelled by you'}
                    {a.reason && ` · “${a.reason}”`}
                  </span>
                  {a.hospitalNote && a.status === 'confirmed' && <span className="mt-1 block text-[13px] text-ink-3">Hospital: {a.hospitalNote}</span>}
                </span>
                <span className="flex flex-col items-end gap-2">
                  <Pill tone={s.tone} className="px-3.5 py-1.5 text-[13px]">{a.status === 'requested' && <span className="live size-2 rounded-full bg-amber" />}{s.label}</Pill>
                  {['requested', 'confirmed'].includes(a.status) && (
                    <span className="flex gap-1.5">
                      <CallButton phone={a.hospitalPhone} className="min-h-9 px-3 text-xs" />
                      <button className="btn-ghost min-h-9 px-3 text-xs text-sos-dark" onClick={() => void cancel(a.id)}>Cancel</button>
                    </span>
                  )}
                </span>
              </article>
            )
          })}
        </div>
        <RequestForm onSent={reload} />
      </div>
    </>
  )
}

function RequestForm({ onSent }: { onSent: () => void }) {
  const [params] = useSearchParams()
  const { me } = useMe()
  const loc = useLocation()
  const hospitals = useApi<{ data: Hospital[] }>(`/hospitals${qs({ lat: loc.coords?.lat.toFixed(3), lng: loc.coords?.lng.toFixed(3) })}`)
  const options = useMemo(() => (hospitals.data?.data ?? []).filter((h) => !['dispensary'].includes(h.facilityType)), [hospitals.data])
  const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10)
  const [hospitalId, setHospitalId] = useState(params.get('hospital') ?? '')
  const [department, setDepartment] = useState('General OPD')
  const [reason, setReason] = useState('')
  const [slot, setSlot] = useState<'morning' | 'afternoon' | 'evening'>('morning')
  const [day, setDay] = useState(tomorrow)
  const [patientName, setPatientName] = useState('')
  const [patientPhone, setPatientPhone] = useState('')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState<Appointment | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => { if (!hospitalId && options[0]) setHospitalId(options[0].id) }, [options, hospitalId])
  const hospital = options.find((h) => h.id === hospitalId)
  const needsContact = !me?.name || !me?.phone

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const a = await api.post<Appointment>('/appointments', {
        hospitalId, department, preferredDate: day, preferredSlot: slot, reason: reason || null,
        patientName: patientName || me?.name || '', patientPhone: patientPhone || me?.phone || '',
      })
      setDone(a)
      setReason('')
      onSent()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="glass fu d2 flex min-w-0 flex-[2_1_340px] flex-col gap-4 rounded-[28px] p-6.5 lg:sticky lg:top-6">
      <h2 className="heading text-[22px]">Request a visit</h2>
      <div>
        <label className="label" htmlFor="ah">Hospital</label>
        <select id="ah" className="input" required value={hospitalId} onChange={(e) => { setHospitalId(e.target.value); setDepartment('General OPD') }}>
          {hospitals.loading && <option>Loading…</option>}
          {options.map((h) => <option key={h.id} value={h.id}>{h.name}{h.distanceKm !== null ? ` · ${km(h.distanceKm)}` : ''}</option>)}
        </select>
        {hospital && !hospital.onCarePath && <p className="mt-1.5 text-xs text-amber">This hospital doesn’t confirm bookings on CarePath yet — call them too.</p>}
      </div>
      <div>
        <label className="label" htmlFor="adept">Department</label>
        <select id="adept" className="input" value={department} onChange={(e) => setDepartment(e.target.value)}>
          <option value="General OPD">General OPD</option>
          {hospital?.specialties.filter((s) => !['primary_care', 'vaccination', 'emergency'].includes(s.key)).map((s) => <option key={s.key} value={s.label}>{s.label}</option>)}
        </select>
      </div>
      <div><label className="label" htmlFor="ar">What’s it for?</label><textarea id="ar" className="input min-h-24 resize-y" maxLength={500} placeholder="e.g. Knee pain for 2 weeks" value={reason} onChange={(e) => setReason(e.target.value)} /></div>
      <div>
        <p className="label">Preferred time</p>
        <div className="grid grid-cols-3 gap-2" role="group" aria-label="Preferred time">
          {(['morning', 'afternoon', 'evening'] as const).map((s) => (
            <button key={s} type="button" aria-pressed={slot === s} onClick={() => setSlot(s)}
              className={cx('min-h-11 rounded-xl text-sm font-semibold capitalize transition', slot === s ? 'text-on-mint' : 'border border-line bg-fill text-ink')}
              style={slot === s ? { background: 'linear-gradient(135deg,#ccfbf1,#5eead4)' } : undefined}>{s}</button>
          ))}
        </div>
      </div>
      <div><label className="label" htmlFor="ad">Date</label><input id="ad" type="date" className="input" min={new Date().toISOString().slice(0, 10)} required value={day} onChange={(e) => setDay(e.target.value)} /></div>
      {needsContact && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div><label className="label" htmlFor="apn">Patient name</label><input id="apn" className="input" required minLength={2} value={patientName || me?.name || ''} onChange={(e) => setPatientName(e.target.value)} /></div>
          <div><label className="label" htmlFor="app">Mobile</label><input id="app" className="input" inputMode="tel" required value={patientPhone || me?.phone || ''} onChange={(e) => setPatientPhone(e.target.value)} /></div>
        </div>
      )}
      {error && <ErrorNote>{error}</ErrorNote>}
      {done && <p className="flex items-center gap-2 rounded-2xl bg-brand-soft p-3 text-sm text-brand-3" role="status"><CheckCircle2 className="size-4" aria-hidden /> Request sent to {done.hospitalName}.</p>}
      <button className="btn-primary min-h-[52px] text-base" disabled={busy || !hospitalId}>{busy ? <Loader2 className="size-5 animate-spin" aria-hidden /> : 'Send request'}</button>
      <p className="text-[13px] text-ink-3">{needsContact ? 'Saved to your profile for next time.' : `The hospital sees ${me?.name} and your mobile number from your profile.`}</p>
    </form>
  )
}
