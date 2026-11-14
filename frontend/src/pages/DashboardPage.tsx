import { ArrowRight, Bot, Building2, CalendarDays, IndianRupee, LocateFixed, Search, Siren, UserRound } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router'
import { HospitalRow } from '../components/HospitalCard'
import { SosButton } from '../components/SosButton'
import { SosSheet } from '../components/SosSheet'
import { IconTile, Panel, Pill, Spinner } from '../components/ui'
import { qs, type Appointment, type Recommendation } from '../lib/api'
import { date, inr } from '../lib/format'
import { useApi, useLocation } from '../lib/hooks'
import { firstName, initials, useMe } from '../lib/me'

const PMJAY_COVER = 500_000

function greeting() {
  const h = new Date().getHours()
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'
}

export function DashboardPage() {
  const loc = useLocation()
  const { me } = useMe()
  const navigate = useNavigate()
  const [sheetOpen, setSheetOpen] = useState(false)
  const [q, setQ] = useState('')
  const coords = loc.coords
  const nearby = useApi<Recommendation>(coords ? `/hospitals/recommend${qs({ lat: coords.lat.toFixed(4), lng: coords.lng.toFixed(4), specialty: 'emergency', maxKm: 40 })}` : null)
  const appts = useApi<{ data: Appointment[] }>('/appointments')
  const today = new Date().toISOString().slice(0, 10)
  const next = appts.data?.data
    .filter((a) => ['requested', 'confirmed'].includes(a.status) && (a.confirmedFor?.slice(0, 10) ?? a.preferredDate) >= today)
    .sort((a, b) => (a.confirmedFor ?? a.preferredDate).localeCompare(b.confirmedFor ?? b.preferredDate))[0]

  const search = (e: FormEvent) => { e.preventDefault(); navigate(`/app/hospitals${qs({ q: q.trim() })}`) }
  const name = firstName(me?.name)

  const actions = [
    { to: '/app/guide', icon: Bot, tone: 'mint', title: 'Ask the care guide', text: 'Describe your problem, get the right hospital' },
    { to: '/app/hospitals', icon: Building2, tone: 'cyan', title: 'Find a hospital', text: '160+ facilities across Sonipat' },
    { to: '/app/appointments', icon: CalendarDays, tone: 'ok', title: 'Appointments', text: 'Request a visit, track confirmations' },
    { to: '/app/insurance', icon: IndianRupee, tone: 'sky', title: 'Insurance & Ayushman', text: 'Estimate what you will pay' },
  ] as const

  return (
    <>
      <header className="fu flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-sm text-ink-3">{new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
          <h1 className="heading mt-1 text-3xl sm:text-[34px]">{greeting()}{name ? `, ${name}` : ''}</h1>
        </div>
        <div className="flex min-w-[260px] flex-[0_1_460px] items-center gap-3">
          <form onSubmit={search} className="relative flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-4 size-[18px] -translate-y-1/2 text-ink-3" aria-hidden />
            <label htmlFor="dash-q" className="sr-only">Search hospitals or specialties</label>
            <input id="dash-q" className="input pl-11" placeholder="Search hospitals, towns…" value={q} onChange={(e) => setQ(e.target.value)} />
          </form>
          <Link to="/app/profile" aria-label="Profile" className="avatar hidden size-12 border-2 border-white no-underline lg:grid">{me?.name ? initials(me.name) : <UserRound className="size-5" />}</Link>
        </div>
      </header>

      {me?.activeSosId && (
        <Link to={`/app/sos/${me.activeSosId}`} className="sos-surface fu flex items-center gap-3 rounded-3xl p-4.5 no-underline">
          <Siren className="live size-6" aria-hidden />
          <span className="flex-1"><b className="block">Your SOS is active</b><span className="text-sm opacity-90">Tap to track the ambulance</span></span>
          <ArrowRight className="size-5" aria-hidden />
        </Link>
      )}

      <div className="flex flex-wrap gap-5.5">
        <section aria-label="Emergency SOS" className="glass fu d1 relative flex min-w-0 flex-[1_1_380px] flex-col items-center overflow-hidden rounded-[30px] p-6 text-center sm:p-7.5">
          <div className="sheen" />
          <p className="flex items-center justify-between self-stretch text-[13px] font-bold tracking-[0.12em] text-sos-dark uppercase">
            Emergency SOS
            <span className="inline-flex items-center gap-1.5 text-[13px] font-semibold tracking-normal text-brand-3 normal-case">
              {loc.status === 'ready' && <><span className="live size-2 rounded-full bg-brand" />Location ready (±{Math.round(loc.coords.accuracy)} m)</>}
              {loc.status === 'locating' && <><LocateFixed className="size-3.5 animate-pulse" aria-hidden />Finding you…</>}
              {loc.status === 'error' && <button className="text-amber underline" onClick={() => void loc.locate()}>Turn on location</button>}
            </span>
          </p>
          <div className="mt-6"><SosButton onTrigger={() => setSheetOpen(true)} /></div>
          <div className="mt-4.5 flex flex-wrap justify-center gap-2.5">
            <a href="tel:112" className="btn-secondary">Call 112</a>
            <a href="tel:108" className="btn-secondary">Ambulance 108</a>
          </div>
        </section>

        <div className="grid min-w-0 flex-[1_1_420px] grid-cols-2 gap-4">
          {actions.map(({ to, icon: Icon, tone, title, text }, i) => (
            <Link key={to} to={to} className={`glass lift fu d${i + 2} flex flex-col gap-2.5 rounded-3xl p-5.5 text-ink no-underline`}>
              <IconTile tone={tone}><Icon className="size-[22px]" /></IconTile>
              <span className="heading text-[17px] leading-tight">{title}</span>
              <span className="text-sm leading-normal text-ink-2">{text}</span>
            </Link>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap gap-5.5">
        <Panel title="Nearest emergency care" className="fu d4 min-w-0 flex-[3_1_460px] rounded-[28px]"
          action={<Link to="/app/hospitals?specialty=emergency" className="text-sm font-semibold text-brand no-underline">See all</Link>}>
          {!coords && loc.status !== 'locating' && (
            <button className="btn-secondary w-full" onClick={() => void loc.locate()}><LocateFixed className="size-4" aria-hidden /> Use my location</button>
          )}
          {nearby.loading && <Spinner />}
          <div className="flex flex-col gap-2">
            {nearby.data?.nearest.map((h) => <HospitalRow key={h.id} hospital={h} />)}
          </div>
        </Panel>

        <div className="flex min-w-0 flex-[2_1_320px] flex-col gap-5.5">
          <section className="glass fu d5 rounded-[28px] p-5.5">
            <p className="eyebrow">Next appointment</p>
            {next ? (
              <Link to="/app/appointments" className="text-ink no-underline">
                <p className="heading mt-2.5 text-lg">{next.department} · {next.hospitalName}</p>
                <p className="mt-1 text-sm text-ink-2">{next.confirmedFor ? new Date(next.confirmedFor.replace(' ', 'T')).toLocaleString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : `${date(next.preferredDate)}, ${next.preferredSlot}`}</p>
                <Pill tone={next.status === 'confirmed' ? 'ok' : 'amber'} className="mt-3">{next.status === 'confirmed' ? 'Confirmed' : 'Waiting for hospital'}</Pill>
              </Link>
            ) : (
              <p className="mt-2.5 text-sm text-ink-2">Nothing booked. <Link to="/app/appointments" className="font-semibold text-brand">Request a visit</Link></p>
            )}
          </section>

          <section className="glass fu d6 rounded-[28px] p-5.5">
            {me?.hasPmjay ? (
              <>
                <div className="flex items-baseline justify-between"><p className="eyebrow text-sky">Ayushman cover left</p><p className="text-[13px] text-ink-3">of {inr(PMJAY_COVER)}</p></div>
                {me.pmjayUsed !== null ? (
                  <>
                    <p className="heading mt-2.5 text-3xl">{inr(Math.max(0, PMJAY_COVER - me.pmjayUsed))}</p>
                    <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-track">
                      <div className="bar h-full rounded-full" style={{ width: `${Math.max(0, Math.min(100, (1 - me.pmjayUsed / PMJAY_COVER) * 100))}%`, background: 'linear-gradient(90deg,#5eead4,#a5b4fc)' }} />
                    </div>
                  </>
                ) : (
                  <p className="mt-2.5 text-sm text-ink-2">Add how much your family has used this year in <Link to="/app/profile" className="font-semibold text-brand">Profile</Link> to see what’s left.</p>
                )}
              </>
            ) : (
              <>
                <p className="eyebrow text-sky">Ayushman Bharat</p>
                <p className="mt-2.5 text-sm text-ink-2">Have an Ayushman card? Add it to see cashless hospitals first and track your ₹5 lakh cover.</p>
                <Link to="/app/profile" className="btn-secondary mt-3.5">Add Ayushman card</Link>
              </>
            )}
          </section>
        </div>
      </div>

      {sheetOpen && <SosSheet me={me} coords={coords} onClose={() => setSheetOpen(false)} onSent={(id) => navigate(`/app/sos/${id}`)} />}
    </>
  )
}
