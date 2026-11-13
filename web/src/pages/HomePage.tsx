import { ArrowRight, Bot, Building2, CalendarPlus, IndianRupee, LocateFixed, MapPin, Siren } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { HospitalCard } from '../components/HospitalCard'
import { SosButton } from '../components/SosButton'
import { SosSheet } from '../components/SosSheet'
import { EmergencyNumbers, Section, Spinner } from '../components/ui'
import { qs, type Recommendation } from '../lib/api'
import { useApi, useLocation, useMe } from '../lib/hooks'

export function HomePage() {
  const loc = useLocation()
  const me = useMe()
  const navigate = useNavigate()
  const [sheetOpen, setSheetOpen] = useState(false)
  const coords = loc.coords
  const nearby = useApi<Recommendation>(coords ? `/hospitals/recommend${qs({ lat: coords.lat.toFixed(4), lng: coords.lng.toFixed(4), specialty: 'emergency', maxKm: 40 })}` : null)

  const actions = [
    { to: '/assistant', icon: Bot, title: 'Ask the care guide', text: 'Describe your problem, get the right hospital' },
    { to: '/hospitals', icon: Building2, title: 'Find a hospital', text: '160+ facilities across Sonipat' },
    { to: '/appointments', icon: CalendarPlus, title: 'Appointments', text: 'Request a visit, track confirmations' },
    { to: '/insurance', icon: IndianRupee, title: 'Insurance & Ayushman', text: 'Estimate what you will pay' },
  ]

  return (
    <div className="mx-auto max-w-xl space-y-7">
      {me.data?.activeSosId && (
        <Link to={`/sos/${me.data.activeSosId}`} className="flex items-center gap-3 rounded-2xl bg-sos p-4 text-white">
          <Siren className="size-6 animate-pulse" aria-hidden />
          <div className="flex-1">
            <p className="font-semibold">Your SOS is active</p>
            <p className="text-sm opacity-90">Tap to track the ambulance</p>
          </div>
          <ArrowRight className="size-5" aria-hidden />
        </Link>
      )}

      <section className="card flex flex-col items-center px-4 pb-5 pt-7">
        <h1 className="sr-only">Emergency SOS</h1>
        <SosButton onTrigger={() => setSheetOpen(true)} />
        <div className="mt-4 flex items-center gap-2 text-xs text-ink-2">
          {loc.status === 'locating' && <><LocateFixed className="size-3.5 animate-pulse" aria-hidden /> Finding your location…</>}
          {loc.status === 'ready' && <><MapPin className="size-3.5 text-brand" aria-hidden /> Location ready (±{Math.round(loc.coords.accuracy)} m)</>}
          {loc.status === 'error' && (
            <span className="text-sos-dark">{loc.message} <button className="font-semibold underline" onClick={() => void loc.locate()}>Try again</button></span>
          )}
        </div>
        <div className="mt-5 w-full">
          <p className="eyebrow mb-2 text-center">Or call directly — free, 24×7</p>
          <EmergencyNumbers />
        </div>
      </section>

      <div className="grid grid-cols-2 gap-3">
        {actions.map(({ to, icon: Icon, title, text }) => (
          <Link key={to} to={to} className="card p-3.5 transition hover:border-brand/40">
            <Icon className="size-5 text-brand" aria-hidden />
            <p className="mt-2 text-sm font-semibold leading-tight">{title}</p>
            <p className="mt-1 text-xs text-ink-2">{text}</p>
          </Link>
        ))}
      </div>

      <Section title="Nearest emergency care" action={<Link to="/hospitals?specialty=emergency" className="text-sm font-medium text-brand">See all</Link>}>
        {!coords && loc.status !== 'locating' && (
          <button className="btn-secondary w-full" onClick={() => void loc.locate()}><LocateFixed className="size-4" aria-hidden /> Use my location</button>
        )}
        {nearby.loading && <Spinner />}
        {nearby.data?.nearest.map((h) => <HospitalCard key={h.id} hospital={h} compact />)}
      </Section>

      {sheetOpen && (
        <SosSheet
          me={me.data}
          coords={coords}
          onClose={() => setSheetOpen(false)}
          onSent={(id) => navigate(`/sos/${id}`)}
        />
      )}
    </div>
  )
}
