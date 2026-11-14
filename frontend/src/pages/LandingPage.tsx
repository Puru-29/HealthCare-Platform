import { Ambulance, ArrowRight, BadgeCheck, Bot, Building2, CalendarDays, IndianRupee, Languages, ShieldCheck, Siren, Stethoscope } from 'lucide-react'
import { Link } from 'react-router'
import { DemoBanner } from '../components/Layout'
import { Aurora, IconTile, Logo, Pill } from '../components/ui'
import { useApi } from '../lib/hooks'
import { useMe } from '../lib/me'

const FEATURES = [
  { to: '/app/sos', icon: Siren, tone: 'sos', title: 'SOS with live tracking', text: 'Hold for a second. See the ambulance on the map with ETA, a slow-traffic warning, and the driver’s name, vehicle and phone.' },
  { to: '/app/guide', icon: Bot, tone: 'mint', title: 'AI care guide', text: 'Describe the problem in English, Hindi or Hinglish. Get the nearest suitable place and the best option within 100 km, with reasons.' },
  { to: '/app/hospitals', icon: Building2, tone: 'cyan', title: 'Hospital finder', text: 'Every facility on a map with filters, Ayushman status, 24×7 emergency and where each fact comes from.' },
  { to: '/app/insurance', icon: IndianRupee, tone: 'sky', title: 'Insurance estimator', text: 'Ayushman and private policies: room-rent capping, co-pay, deductible and remaining cover — before you get the bill.' },
  { to: '/app/appointments', icon: CalendarDays, tone: 'ok', title: 'Appointments', text: 'Request a visit in a few taps. Hospitals on CarePath confirm a time and you see it here.' },
  { to: '/login?tab=staff', icon: Stethoscope, tone: 'amber', title: 'Hospital console', text: 'Live SOS alerts with sound, one-tap accept, a driver link that needs no app, fleet and appointments.' },
] as const

const STEPS = [
  { title: 'Hold SOS', text: 'One second of holding avoids pocket-dials. Your saved details and location go with it.' },
  { title: 'Rings widen', text: 'Hospitals with an available ambulance within 8 km are alerted, then 15, then 30.' },
  { title: 'One hospital accepts', text: 'Only that hospital sees your exact pickup point and phone. Others see a ~1 km area.' },
  { title: 'Track it live', text: 'ETA, driver and vehicle on the map. If nobody accepts, 108 is one tap away.' },
]

const EVIDENCE = [
  { label: 'Trauma care', source: 'Confirmed by hospital', tone: 'ok' },
  { label: 'Location & address', source: 'OpenStreetMap', tone: 'cyan' },
  { label: 'Eye care', source: 'From facility name', tone: 'sky' },
  { label: 'Maternity', source: 'Expected for facility level', tone: 'amber' },
] as const

export function LandingPage() {
  const stats = useApi<{ hospitals: number; pmjay: number }>('/health')
  const { me } = useMe()
  const total = stats.data?.hospitals ?? 169
  const pmjay = stats.data?.pmjay ?? 76

  return (
    <div className="relative min-h-dvh overflow-x-clip">
      <Aurora />
      <DemoBanner />
      <div className="mx-auto max-w-[1280px] px-4 pt-6 sm:px-8">
        <header className="glass fu flex flex-wrap items-center justify-between gap-4 rounded-[22px] py-3 pr-3.5 pl-5">
          <Logo />
          <nav aria-label="Main" className="hidden gap-7 text-[15px] font-medium md:flex">
            <a className="text-ink-2 no-underline hover:text-ink" href="#features">Features</a>
            <a className="text-ink-2 no-underline hover:text-ink" href="#how">How SOS works</a>
            <a className="text-ink-2 no-underline hover:text-ink" href="#data">Our data</a>
            <Link className="text-ink-2 no-underline hover:text-ink" to="/login?tab=staff">Hospital console</Link>
          </nav>
          <div className="flex items-center gap-2.5">
            {me?.signedIn
              ? <Link className="btn-primary" to="/app">Open dashboard</Link>
              : <><Link className="btn-secondary" to="/login">Sign in</Link><Link className="btn-primary" to="/app">Get started</Link></>}
          </div>
        </header>

        {/* Hero */}
        <section className="flex flex-wrap items-center gap-12 pt-16 pb-14 sm:pt-24 sm:pb-18">
          <div className="min-w-0 flex-[1_1_480px]">
            <p className="glass fu d1 inline-flex items-center gap-2 rounded-full px-3.5 py-2 text-[13px] font-semibold text-brand-3">
              <span className="live size-2 rounded-full bg-brand shadow-[0_0_12px_#5eead4]" />Built for Sonipat · {total} facilities mapped
            </p>
            <h1 className="heading fu d2 mt-6 text-5xl leading-[1.02] tracking-[-0.035em] sm:text-7xl">
              Emergency care,<br /><span className="gradient-text">one press away.</span>
            </h1>
            <p className="fu d3 mt-6 max-w-[540px] text-lg leading-relaxed text-ink-2 sm:text-[19px]">
              Press and hold SOS. The nearest hospitals with an ambulance on CarePath are alerted in widening rings, the first to accept is assigned, and you watch it arrive live — with 108 always one tap away.
            </p>
            <div className="fu d4 mt-9 flex flex-wrap gap-3">
              <Link to="/app" className="btn-primary min-h-14 rounded-2xl px-6.5 text-base">Get started <ArrowRight className="size-[18px]" aria-hidden /></Link>
              <a href="#how" className="btn-secondary glass min-h-14 rounded-2xl px-6 text-base">How SOS works</a>
            </div>
            <div className="fu d5 mt-10 flex flex-wrap gap-5.5 text-sm text-ink-2">
              <span className="inline-flex items-center gap-2"><ShieldCheck className="size-[18px] text-brand" aria-hidden />No login needed for SOS</span>
              <span className="inline-flex items-center gap-2"><Languages className="size-[18px] text-brand" aria-hidden />English · हिन्दी · Hinglish</span>
              <span className="inline-flex items-center gap-2"><BadgeCheck className="size-[18px] text-brand" aria-hidden />Ayushman-aware</span>
            </div>
          </div>

          <div className="fu d3 relative h-[520px] min-w-0 flex-[1_1_420px]" aria-hidden="true">
            <div className="glass absolute inset-x-6 inset-y-5 flex flex-col items-center justify-center gap-5.5 overflow-hidden rounded-[40px] sm:inset-x-10">
              <div className="sheen" />
              <div className="relative grid size-[230px] place-items-center">
                <span className="sos-ring" /><span className="sos-ring r2" /><span className="sos-ring r3" />
                <span className="grid size-44 place-items-center rounded-full text-center text-white" style={{ background: 'radial-gradient(circle at 30% 25%,#ff8a8d,#ff5a5f 45%,#c81e3a)', boxShadow: '0 20px 60px rgb(255 90 95 / .55), inset 0 2px 0 rgb(255 255 255 / .4)' }}>
                  <span><span className="heading block text-[44px] tracking-[0.04em]">SOS</span><span className="block text-[13px] font-semibold opacity-90">Press &amp; hold</span></span>
                </span>
              </div>
              <p className="text-sm text-ink-2">Alerts the nearest hospitals with an ambulance</p>
            </div>
            <div className="glass float absolute top-14 left-0 flex w-[250px] items-center gap-3 rounded-[18px] p-3.5">
              <IconTile tone="mint"><Ambulance className="size-5" /></IconTile>
              <span><span className="block text-sm font-bold">Ambulance accepted</span><span className="block text-[13px] text-ink-2">Live ETA and driver on the map</span></span>
            </div>
            <div className="glass float2 absolute top-[230px] right-0 w-[240px] rounded-[18px] p-3.5">
              <span className="eyebrow block">Nearest emergency</span>
              <span className="mt-1.5 block text-[15px] font-bold">Ranked by distance &amp; level</span>
              <span className="mt-0.5 block text-[13px] text-ink-2">24×7 · Ayushman · confirmed or not</span>
            </div>
            <div className="glass float3 absolute bottom-7 left-7 flex items-center gap-3 rounded-[18px] p-3.5">
              <IconTile tone="sky"><ShieldCheck className="size-5" /></IconTile>
              <span><span className="block text-sm font-bold">Ayushman: up to ₹5 lakh / year</span><span className="block text-[13px] text-ink-2">Cashless at empanelled hospitals</span></span>
            </div>
          </div>
        </section>

        {/* Numbers */}
        <section aria-label="CarePath in numbers" className="glass fu d4 grid grid-cols-2 overflow-hidden rounded-[28px] lg:grid-cols-4">
          {[
            [String(total), 'Sonipat facilities listed, government and private'],
            [String(pmjay), 'Ayushman (PM-JAY) empanelled hospitals'],
            ['8→15→30', 'km alert rings until a hospital accepts'],
            ['108 · 112', 'visible on every SOS screen from the first second'],
          ].map(([n, label], i) => (
            <div key={label} className={`p-6 sm:p-7 ${i % 2 === 0 ? 'border-r border-line' : ''} ${i < 2 ? 'border-b border-line lg:border-b-0' : ''} ${i === 1 ? 'lg:border-r' : ''}`}>
              <p className="heading text-3xl sm:text-[40px]">{n}</p>
              <p className="mt-1.5 text-sm text-ink-2">{label}</p>
            </div>
          ))}
        </section>

        {/* Features */}
        <section id="features" className="scroll-mt-24 pt-24 sm:pt-30">
          <p className="eyebrow text-brand">Everything in one app</p>
          <h2 className="heading mt-3 max-w-[720px] text-4xl leading-[1.08] sm:text-5xl">For the moments when getting care goes wrong.</h2>
          <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map(({ to, icon: Icon, tone, title, text }) => (
              <Link key={title} to={to} className="glass lift flex flex-col gap-3.5 rounded-[26px] p-7 text-ink no-underline">
                <IconTile tone={tone} size="lg"><Icon className="size-6" /></IconTile>
                <span className="heading text-[21px]">{title}</span>
                <span className="text-[15px] leading-relaxed text-ink-2">{text}</span>
              </Link>
            ))}
          </div>
        </section>

        {/* How SOS works */}
        <section id="how" className="scroll-mt-24 pt-24 sm:pt-30">
          <p className="eyebrow text-brand">How SOS works</p>
          <h2 className="heading mt-3 max-w-[760px] text-4xl leading-[1.08] sm:text-5xl">First to accept is assigned. Not first to pick up the phone.</h2>
          <div className="glass relative mt-12 overflow-hidden rounded-[32px] p-7 sm:p-10">
            <div className="sheen" />
            <ol className="relative grid gap-7 sm:grid-cols-2 lg:grid-cols-4">
              {STEPS.map((s, i) => (
                <li key={s.title} className="flex flex-col gap-3">
                  <span className={`heading grid size-[68px] place-items-center rounded-[22px] text-[22px] ${i === 0 ? 'text-white' : 'glass'}`}
                    style={i === 0 ? { background: 'linear-gradient(135deg,#ff8a8d,#e11d48)', boxShadow: '0 10px 30px rgb(255 90 95 / .45)' } : undefined}>{i + 1}</span>
                  <span className="heading text-[19px]">{s.title}</span>
                  <span className="text-[15px] leading-relaxed text-ink-2">{s.text}</span>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* Honest data */}
        <section id="data" className="flex scroll-mt-24 flex-wrap items-center gap-12 pt-24 sm:pt-30">
          <div className="min-w-0 flex-[1_1_420px]">
            <p className="eyebrow text-brand">Honest data</p>
            <h2 className="heading mt-3 text-4xl leading-[1.1] sm:text-[44px]">Every fact shows where it came from.</h2>
            <p className="mt-4.5 text-[17px] leading-relaxed text-ink-2">Ranking uses facility level, specialty evidence, beds, 24×7 emergency, Ayushman and distance. There are no public quality ratings, so we don’t pretend to have them — and we tell you to call ahead when a fact isn’t confirmed.</p>
          </div>
          <div className="glass flex min-w-0 flex-[1_1_420px] flex-col gap-3 rounded-[28px] p-7">
            {EVIDENCE.map((e) => (
              <div key={e.label} className="flex items-center justify-between gap-3 rounded-2xl bg-fill px-4 py-3.5">
                <span className="font-semibold">{e.label}</span><Pill tone={e.tone} className="px-3 py-1.5 text-[13px]">{e.source}</Pill>
              </div>
            ))}
          </div>
        </section>

        {/* CTA */}
        <section className="glass relative mt-24 flex flex-wrap items-center justify-between gap-7 overflow-hidden rounded-[36px] px-7 py-12 sm:mt-30 sm:px-14 sm:py-16">
          <div className="sheen" />
          <div className="max-w-[640px]">
            <h2 className="heading text-3xl leading-[1.1] sm:text-[40px]">Save your emergency details now. SOS becomes one press later.</h2>
            <p className="mt-3.5 text-[17px] text-ink-2">Shared only with the hospital that accepts your SOS.</p>
          </div>
          <Link to="/app/profile" className="btn-primary min-h-15 rounded-[18px] px-7.5 text-[17px]">Get started <ArrowRight className="size-[18px]" aria-hidden /></Link>
        </section>

        <footer className="mt-16 flex flex-wrap justify-between gap-4 border-t border-line pt-14 pb-12 text-sm text-ink-3">
          <span>© CarePath Sonipat · Map data © OpenStreetMap contributors</span>
          <span>Not a substitute for emergency services. In an emergency call <a className="text-brand" href="tel:112">112</a> or <a className="text-brand" href="tel:108">108</a>.</span>
        </footer>
      </div>
    </div>
  )
}
