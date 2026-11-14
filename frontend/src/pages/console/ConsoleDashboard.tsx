import { Bell, BellOff, Check, Copy, LogOut, MapPin, Phone, Plus, Siren, Truck, X } from 'lucide-react'
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router'
import { DemoBanner } from '../../components/Layout'
import { MapView } from '../../components/MapView'
import { Aurora, ErrorNote, Logo, Spinner } from '../../components/ui'
import { api, ApiError, type Appointment, type Hospital, type Incident } from '../../lib/api'
import { cx, date, isDialable, km, minutes, tel, time } from '../../lib/format'
import { getPosition, useApi, useEventStream, useMeta } from '../../lib/hooks'

interface Offer { incidentId: string; distanceKm: number; offeredAt: string; createdAt: string; area: { lat: number; lng: number }; note: string | null }
interface AmbulanceRow { id: string; vehicleNumber: string; kind: 'BLS' | 'ALS' | 'PTV'; driverName: string; driverPhone: string; status: 'available' | 'busy' | 'offline'; simulated: number }
interface Dashboard {
  hospital: Hospital
  offers: Offer[]
  trips: Array<Incident & { patient: { name: string | null; phone: string; note: string | null } }>
  ambulances: AmbulanceRow[]
  appointments: Appointment[]
  recent: Array<{ id: string; status: string; createdAt: string; acceptedAt: string | null; completedAt: string | null }>
}

type Tab = 'live' | 'fleet' | 'appointments' | 'profile'

/** Two-tone alarm via WebAudio — no audio file needed. */
function useAlarm() {
  const ctx = useRef<AudioContext | null>(null)
  const [enabled, setEnabled] = useState(false)
  const enable = () => { ctx.current ??= new AudioContext(); void ctx.current.resume(); setEnabled(true) }
  const ring = useCallback(() => {
    const c = ctx.current
    if (!c || !enabled) return
    for (let i = 0; i < 6; i++) {
      const o = c.createOscillator(), g = c.createGain()
      o.frequency.value = i % 2 ? 660 : 880
      g.gain.setValueAtTime(0.2, c.currentTime + i * 0.25)
      g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + i * 0.25 + 0.22)
      o.connect(g).connect(c.destination)
      o.start(c.currentTime + i * 0.25)
      o.stop(c.currentTime + i * 0.25 + 0.23)
    }
  }, [enabled])
  return { enabled, enable, ring }
}

export function ConsoleDashboard() {
  const navigate = useNavigate()
  const { data, error, reload } = useApi<Dashboard>('/console/dashboard')
  const [tab, setTab] = useState<Tab>('live')
  const alarm = useAlarm()
  const connected = useEventStream<{ reason?: string }>('/api/console/stream', 'refresh', reload)
  useEventStream<{ incidentId: string }>('/api/console/stream', 'offer', () => { alarm.ring(); navigator.vibrate?.([300, 100, 300]); reload() })

  useEffect(() => {
    if (error && /sign in|session/i.test(error)) navigate('/login?tab=staff', { replace: true })
  }, [error, navigate])
  useEffect(() => {
    document.title = data?.offers.length ? `(${data.offers.length}) SOS — CarePath console` : 'CarePath console'
  }, [data?.offers.length])

  if (error && !data) return <div className="p-6"><ErrorNote onRetry={reload}>{error}</ErrorNote></div>
  if (!data) return <Spinner />

  const tabs: Array<{ key: Tab; label: string; count?: number }> = [
    { key: 'live', label: 'Live', count: data.offers.length + data.trips.length },
    { key: 'fleet', label: 'Ambulances', count: data.ambulances.filter((a) => a.status === 'available').length },
    { key: 'appointments', label: 'Appointments', count: data.appointments.filter((a) => a.status === 'requested').length },
    { key: 'profile', label: 'Hospital profile' },
  ]

  return (
    <div className="min-h-dvh">
      <Aurora />
      <DemoBanner />
      <header className="glass rounded-none border-x-0 border-t-0">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3 px-4 py-3">
          <Logo />
          <span className="text-ink-3">/</span>
          <span className="font-semibold">{data.hospital.name}</span>
          <span className={cx('chip', connected ? 'bg-brand-soft text-brand' : 'bg-amber-soft text-amber')}>{connected ? '● Live' : '○ Reconnecting'}</span>
          <div className="ml-auto flex items-center gap-2">
            <button className={cx('btn-secondary py-1.5', !alarm.enabled && 'border-amber text-amber')} onClick={alarm.enable}>
              {alarm.enabled ? <><Bell className="size-4" aria-hidden /> Sound on</> : <><BellOff className="size-4" aria-hidden /> Turn on SOS sound</>}
            </button>
            <button className="btn-ghost py-1.5" onClick={async () => { await api.post('/console/logout'); navigate('/login?tab=staff') }}><LogOut className="size-4" aria-hidden /> Sign out</button>
          </div>
        </div>
        <nav className="mx-auto flex max-w-6xl gap-1 overflow-x-auto px-4" aria-label="Console">
          {tabs.map((t) => (
            <button key={t.key} onClick={() => setTab(t.key)} aria-current={tab === t.key}
              className={cx('whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-medium', tab === t.key ? 'border-brand text-brand' : 'border-transparent text-ink-2')}>
              {t.label}{t.count ? <span className="ml-1.5 rounded-full bg-fill px-1.5 text-xs">{t.count}</span> : null}
            </button>
          ))}
        </nav>
      </header>

      <main className="mx-auto max-w-6xl space-y-6 px-4 py-5">
        {tab === 'live' && <Live data={data} reload={reload} />}
        {tab === 'fleet' && <Fleet data={data} reload={reload} />}
        {tab === 'appointments' && <Appointments data={data} reload={reload} />}
        {tab === 'profile' && <Profile hospital={data.hospital} reload={reload} />}
      </main>
    </div>
  )
}

// ---------------- Live ----------------

function Live({ data, reload }: { data: Dashboard; reload: () => void }) {
  const [driverLink, setDriverLink] = useState<string | null>(null)
  return (
    <>
      {driverLink && <DriverLinkCard path={driverLink} onClose={() => setDriverLink(null)} />}
      <section className="space-y-3">
        <h2 className="flex items-center gap-2 font-semibold"><Siren className="size-5 text-sos" aria-hidden /> Incoming SOS</h2>
        {data.offers.length === 0 && <p className="card p-5 text-sm text-ink-2">No requests right now. Keep this page open — new SOS requests ring here.</p>}
        {data.offers.map((o) => <OfferCard key={o.incidentId} offer={o} ambulances={data.ambulances} onAccepted={(p) => { setDriverLink(p); reload() }} reload={reload} />)}
      </section>

      <section className="space-y-3">
        <h2 className="flex items-center gap-2 font-semibold"><Truck className="size-5 text-brand" aria-hidden /> Active trips</h2>
        {data.trips.length === 0 && <p className="card p-5 text-sm text-ink-2">No ambulance is on a trip.</p>}
        <div className="grid gap-3 lg:grid-cols-2">
          {data.trips.map((t) => <TripCard key={t.id} trip={t} onLink={setDriverLink} reload={reload} />)}
        </div>
      </section>

      {data.recent.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold text-ink-2">Recent</h2>
          <ul className="card divide-y divide-line text-sm">
            {data.recent.map((r) => (
              <li key={r.id} className="flex justify-between px-4 py-2"><span>{date(r.createdAt)} {time(r.createdAt)}</span><span className="capitalize text-ink-2">{r.status}</span></li>
            ))}
          </ul>
        </section>
      )}
    </>
  )
}

function OfferCard({ offer, ambulances, onAccepted, reload }: { offer: Offer; ambulances: AmbulanceRow[]; onAccepted: (path: string) => void; reload: () => void }) {
  const available = ambulances.filter((a) => a.status === 'available')
  const [ambulanceId, setAmbulanceId] = useState(available[0]?.id ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [, force] = useState(0)
  useEffect(() => { const t = setInterval(() => force((x) => x + 1), 1000); return () => clearInterval(t) }, [])
  const waited = Math.floor((Date.now() - Date.parse(offer.createdAt)) / 1000)

  async function act(kind: 'accept' | 'decline') {
    setBusy(true)
    setError(null)
    try {
      if (kind === 'accept') {
        const r = await api.post<{ driverPath: string }>(`/console/offers/${offer.incidentId}/accept`, { ambulanceId })
        onAccepted(r.driverPath)
      } else {
        await api.post(`/console/offers/${offer.incidentId}/decline`)
        reload()
      }
    } catch (err) {
      setError(err instanceof ApiError && err.code === 'already_assigned' ? 'Another hospital accepted first.' : (err as Error).message)
      setTimeout(reload, 1500)
    } finally {
      setBusy(false)
    }
  }

  return (
    <article className="card flex flex-col gap-4 border-sos/40 bg-sos-soft/40 p-4 md:flex-row md:items-center">
      <div className="flex-1">
        <p className="text-lg font-bold text-sos-dark">Emergency · {km(offer.distanceKm)} away</p>
        <p className="text-sm text-ink-2">Waiting {waited < 60 ? `${waited}s` : `${Math.floor(waited / 60)}m ${waited % 60}s`} · about {minutes(offer.distanceKm / 32 * 60)} drive</p>
        {offer.note && <p className="mt-1 text-sm"><b>Patient says:</b> {offer.note}</p>}
        <p className="mt-1 flex items-center gap-1 text-xs text-ink-3"><MapPin className="size-3" aria-hidden /> Exact address and phone are shown after you accept.</p>
        {error && <p className="mt-2 text-sm font-medium text-sos-dark">{error}</p>}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {available.length > 0 ? (
          <>
            <label htmlFor={`amb-${offer.incidentId}`} className="sr-only">Ambulance</label>
            <select id={`amb-${offer.incidentId}`} className="input w-auto py-2" value={ambulanceId} onChange={(e) => setAmbulanceId(e.target.value)}>
              {available.map((a) => <option key={a.id} value={a.id}>{a.vehicleNumber} · {a.kind} · {a.driverName}</option>)}
            </select>
            <button className="btn-danger px-6" disabled={busy || !ambulanceId} onClick={() => void act('accept')}><Check className="size-4" aria-hidden /> Accept</button>
          </>
        ) : <span className="text-sm text-ink-2">No ambulance available</span>}
        <button className="btn-secondary" disabled={busy} onClick={() => void act('decline')}><X className="size-4" aria-hidden /> Can't go</button>
      </div>
    </article>
  )
}

function DriverLinkCard({ path, onClose }: { path: string; onClose: () => void }) {
  const url = `${location.origin}${path}`
  const [copied, setCopied] = useState(false)
  return (
    <section className="card border-brand/40 bg-brand-soft/50 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-semibold text-brand">Send this link to the driver</p>
          <p className="text-sm text-ink-2">It opens the trip on their phone and shares the ambulance's live location with the patient. Treat it like a key.</p>
        </div>
        <button className="btn-ghost p-1.5" onClick={onClose} aria-label="Dismiss"><X className="size-4" /></button>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <code className="min-w-0 flex-1 truncate rounded-lg bg-fill-2 px-3 py-2 text-xs">{url}</code>
        <button className="btn-secondary" onClick={() => { void navigator.clipboard.writeText(url); setCopied(true) }}><Copy className="size-4" aria-hidden /> {copied ? 'Copied' : 'Copy'}</button>
        <a className="btn-primary" href={`https://wa.me/?text=${encodeURIComponent(`CarePath emergency trip: ${url}`)}`} target="_blank" rel="noreferrer">WhatsApp</a>
      </div>
    </section>
  )
}

function TripCard({ trip, onLink, reload }: { trip: Dashboard['trips'][number]; onLink: (p: string) => void; reload: () => void }) {
  const next = trip.status === 'assigned' ? { to: 'arrived', label: 'Mark arrived at patient' } : trip.status === 'arrived' ? { to: 'to_hospital', label: 'Patient on board' } : { to: 'completed', label: 'Reached hospital' }
  async function advance() { await api.post(`/console/trips/${trip.id}/status`, { status: next.to }); reload() }
  async function newLink() { const r = await api.post<{ driverPath: string }>(`/console/trips/${trip.id}/driver-link`); onLink(r.driverPath) }
  const markers = [{ id: 'p', kind: 'you' as const, position: trip.pickup }, ...(trip.ambulance?.location ? [{ id: 'a', kind: 'ambulance' as const, position: trip.ambulance.location }] : [])]
  return (
    <article className="card overflow-hidden">
      <MapView className="h-44 rounded-none border-0" markers={markers} path={trip.eta?.path} />
      <div className="space-y-3 p-4">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="font-semibold">{trip.patient.name ?? 'Patient'} <span className="font-normal text-ink-3">· {trip.ambulance?.vehicleNumber}</span></p>
            <p className="text-sm capitalize text-ink-2">{trip.status.replace('_', ' ')}{trip.eta && ` · ${minutes(trip.eta.minutes)} (${km(trip.eta.distanceKm)})`}</p>
            {trip.patient.note && <p className="text-sm">“{trip.patient.note}”</p>}
            {(trip.patient.bloodGroup || trip.patient.allergies) && (
              <p className="mt-1 text-sm text-sos-dark">{[trip.patient.bloodGroup && `Blood ${trip.patient.bloodGroup}`, trip.patient.allergies && `Allergies: ${trip.patient.allergies}`].filter(Boolean).join(' · ')}</p>
            )}
          </div>
          {isDialable(trip.patient.phone) && <a href={tel(trip.patient.phone)} className="btn-secondary"><Phone className="size-4" aria-hidden /> {trip.patient.phone}</a>}
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="btn-primary" onClick={() => void advance()}>{next.label}</button>
          <button className="btn-ghost" onClick={() => void newLink()}>New driver link</button>
        </div>
      </div>
    </article>
  )
}

// ---------------- Fleet ----------------

function Fleet({ data, reload }: { data: Dashboard; reload: () => void }) {
  const [form, setForm] = useState({ vehicleNumber: '', kind: 'BLS', driverName: '', driverPhone: '' })
  const [error, setError] = useState<string | null>(null)
  async function add(e: FormEvent) {
    e.preventDefault()
    setError(null)
    try { await api.post('/console/ambulances', form); setForm({ vehicleNumber: '', kind: 'BLS', driverName: '', driverPhone: '' }); reload() } catch (err) { setError((err as Error).message) }
  }
  async function toggle(a: AmbulanceRow) {
    try { await api.patch(`/console/ambulances/${a.id}`, { status: a.status === 'available' ? 'offline' : 'available' }); reload() } catch (err) { alert((err as Error).message) }
  }
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
      <section className="space-y-2">
        <h2 className="font-semibold">Ambulances</h2>
        <p className="text-sm text-ink-2">Only <b>available</b> ambulances make your hospital eligible for SOS requests.</p>
        {data.ambulances.length === 0 && <p className="card p-5 text-sm text-ink-2">Add your first ambulance to start receiving SOS requests.</p>}
        <ul className="card divide-y divide-line">
          {data.ambulances.map((a) => (
            <li key={a.id} className="flex items-center gap-3 px-4 py-3">
              <Truck className="size-5 text-ink-3" aria-hidden />
              <div className="flex-1">
                <p className="font-medium">{a.vehicleNumber} <span className="text-xs text-ink-3">{a.kind}{a.simulated ? ' · demo' : ''}</span></p>
                <p className="text-sm text-ink-2">{a.driverName}{isDialable(a.driverPhone) && ` · ${a.driverPhone}`}</p>
              </div>
              {a.status === 'busy'
                ? <span className="chip bg-sos-soft text-sos-dark">On a trip</span>
                : <button onClick={() => void toggle(a)} className={cx('chip px-3 py-1', a.status === 'available' ? 'bg-brand-soft text-brand' : 'bg-fill text-ink-3')}>{a.status === 'available' ? 'Available' : 'Off duty'}</button>}
            </li>
          ))}
        </ul>
      </section>
      <form onSubmit={add} className="card h-fit space-y-3 p-4">
        <h2 className="flex items-center gap-2 font-semibold"><Plus className="size-4" aria-hidden /> Add ambulance</h2>
        <div><label className="label" htmlFor="v">Vehicle number</label><input id="v" className="input uppercase" required placeholder="HR 10 AB 1234" value={form.vehicleNumber} onChange={(e) => setForm({ ...form, vehicleNumber: e.target.value })} /></div>
        <div>
          <label className="label" htmlFor="k">Type</label>
          <select id="k" className="input" value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })}>
            <option value="ALS">ALS — advanced life support</option><option value="BLS">BLS — basic life support</option><option value="PTV">Patient transport</option>
          </select>
        </div>
        <div><label className="label" htmlFor="dn">Driver name</label><input id="dn" className="input" required value={form.driverName} onChange={(e) => setForm({ ...form, driverName: e.target.value })} /></div>
        <div><label className="label" htmlFor="dp">Driver mobile</label><input id="dp" className="input" inputMode="tel" required value={form.driverPhone} onChange={(e) => setForm({ ...form, driverPhone: e.target.value })} /></div>
        {error && <ErrorNote>{error}</ErrorNote>}
        <button className="btn-primary w-full">Add</button>
      </form>
    </div>
  )
}

// ---------------- Appointments ----------------

function Appointments({ data, reload }: { data: Dashboard; reload: () => void }) {
  if (data.appointments.length === 0) return <p className="card p-5 text-sm text-ink-2">No upcoming appointment requests.</p>
  return (
    <div className="grid gap-3 lg:grid-cols-2">
      {data.appointments.map((a) => <AppointmentRow key={a.id} a={a} reload={reload} />)}
    </div>
  )
}

function AppointmentRow({ a, reload }: { a: Appointment; reload: () => void }) {
  const [when, setWhen] = useState(`${a.preferredDate}T${a.preferredSlot === 'morning' ? '10:00' : a.preferredSlot === 'afternoon' ? '14:00' : '17:30'}`)
  const [error, setError] = useState<string | null>(null)
  async function act(action: 'confirm' | 'decline') {
    setError(null)
    try {
      if (action === 'confirm') await api.post(`/console/appointments/${a.id}`, { action, confirmedFor: when.replace('T', ' ') })
      else {
        const note = prompt('Reason for declining (sent to the patient):')
        if (!note) return
        await api.post(`/console/appointments/${a.id}`, { action, note })
      }
      reload()
    } catch (err) { setError((err as Error).message) }
  }
  return (
    <article className="card space-y-2 p-4">
      <div className="flex items-start justify-between">
        <div>
          <p className="font-semibold">{a.patientName} <span className="font-normal text-ink-3">· {a.department}</span></p>
          <p className="text-sm text-ink-2">Wants {date(a.preferredDate)}, {a.preferredSlot}</p>
          {a.reason && <p className="text-sm">“{a.reason}”</p>}
        </div>
        <a href={tel(a.patientPhone)} className="btn-ghost"><Phone className="size-4" aria-hidden /> {a.patientPhone}</a>
      </div>
      {a.status === 'confirmed'
        ? <p className="text-sm font-medium text-brand">Confirmed for {a.confirmedFor}</p>
        : (
          <div className="flex flex-wrap items-center gap-2">
            <label htmlFor={`w-${a.id}`} className="sr-only">Time</label>
            <input id={`w-${a.id}`} type="datetime-local" className="input w-auto py-2" value={when} onChange={(e) => setWhen(e.target.value)} />
            <button className="btn-primary" onClick={() => void act('confirm')}>Confirm</button>
            <button className="btn-ghost" onClick={() => void act('decline')}>Decline</button>
          </div>
        )}
      {error && <ErrorNote>{error}</ErrorNote>}
    </article>
  )
}

// ---------------- Profile ----------------

function Profile({ hospital, reload }: { hospital: Hospital; reload: () => void }) {
  const meta = useMeta()
  const [phone, setPhone] = useState(hospital.phone ?? '')
  const [emergency, setEmergency] = useState(hospital.emergency24x7 ?? false)
  const [specialties, setSpecialties] = useState(new Set(hospital.specialties.map((s) => s.key)))
  const [insurers, setInsurers] = useState(hospital.insurers.join(', '))
  const [pin, setPin] = useState<{ lat: number; lng: number } | null>(null)
  const [status, setStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function save(e: FormEvent) {
    e.preventDefault()
    setError(null)
    try {
      await api.put('/console/profile', {
        phone: phone.trim() || null, emergency24x7: emergency, specialties: [...specialties],
        insurers: insurers.split(',').map((s) => s.trim()).filter(Boolean), location: pin,
      })
      setStatus('Saved — your listing now shows as verified.')
      reload()
    } catch (err) { setError((err as Error).message) }
  }

  return (
    <form onSubmit={save} className="grid gap-6 lg:grid-cols-2">
      <section className="card space-y-4 p-4">
        <h2 className="font-semibold">Listing details</h2>
        <p className="text-sm text-ink-2">Patients and the care guide use this to decide where to go. Saving marks your listing <b>verified</b> and replaces details we inferred from public data.</p>
        <div><label className="label" htmlFor="hp">Front desk / emergency phone</label><input id="hp" className="input" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="10-digit mobile or landline with STD code" /></div>
        <label className="flex items-center gap-3"><input type="checkbox" className="size-4 accent-brand" checked={emergency} onChange={(e) => setEmergency(e.target.checked)} /> <span className="text-sm">We run a 24×7 emergency department</span></label>
        <div><label className="label" htmlFor="ins">Insurers / TPAs accepted cashless (comma-separated)</label><textarea id="ins" className="input min-h-20" value={insurers} onChange={(e) => setInsurers(e.target.value)} placeholder="Star Health, HDFC ERGO, Niva Bupa, CGHS, ECHS" /></div>
        <div>
          <p className="label">Location</p>
          {hospital.location && <MapView className="h-40" markers={[{ id: 'h', kind: 'hospital', position: pin ?? hospital.location }]} />}
          <button type="button" className="btn-secondary mt-2" onClick={async () => { try { setPin(await getPosition(true)) } catch (err) { setError((err as Error).message) } }}>
            <MapPin className="size-4" aria-hidden /> {pin ? 'Pinned to this device location' : 'Set pin to where I am now'}
          </button>
          {hospital.locationPrecision && hospital.locationPrecision !== 'building' && !pin && <p className="mt-1 text-xs text-amber">Current pin is only the {hospital.locationPrecision} centre — please set it from inside the hospital.</p>}
        </div>
      </section>
      <section className="card space-y-3 p-4">
        <h2 className="font-semibold">Specialties you offer</h2>
        <div className="grid grid-cols-2 gap-2">
          {meta?.specialties.map((s) => (
            <label key={s.key} className={cx('flex items-center gap-2 rounded-lg border px-3 py-2 text-sm', specialties.has(s.key) ? 'border-brand bg-brand-soft' : 'border-line')}>
              <input type="checkbox" className="accent-brand" checked={specialties.has(s.key)}
                onChange={(e) => { const n = new Set(specialties); if (e.target.checked) n.add(s.key); else n.delete(s.key); setSpecialties(n) }} />
              {s.label}
            </label>
          ))}
        </div>
      </section>
      <div className="flex items-center gap-3 lg:col-span-2">
        <button className="btn-primary">Save & verify listing</button>
        {status && <span className="text-sm text-brand">{status}</span>}
        {error && <ErrorNote>{error}</ErrorNote>}
      </div>
    </form>
  )
}
