import {
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  BadgeCheck,
  Building2,
  CalendarDays,
  HeartPulse,
  MapPin,
  Phone,
  Search,
  ShieldCheck,
  Stethoscope,
  Truck,
} from 'lucide-react'
import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { getHospitals, type HospitalPage as HospitalPageResult } from '../api/client'
import { FeatureCard } from '../components/FeatureCard'

const productFeatures = [
  {
    label: 'Hospital discovery',
    description: 'Explore published hospital listings with public details and clear source status.',
    icon: Building2,
    to: '/hospitals',
  },
  {
    label: 'Doctor discovery',
    description: 'Browse verified doctor profiles when current records are available.',
    icon: Stethoscope,
    to: '/doctors',
  },
  {
    label: 'Symptom guidance',
    description: 'Use a limited, on-device keyword guide to explore a broad specialty.',
    icon: HeartPulse,
    to: '/assistant',
  },
  {
    label: 'Emergency information',
    description: 'Find India’s emergency number and practical next steps in one place.',
    icon: Phone,
    to: '/emergency',
  },
  {
    label: 'Appointment history',
    description: 'Review records linked to your account; provider booking is not connected.',
    icon: CalendarDays,
    to: '/dashboard/appointments',
  },
  {
    label: 'Insurance networks',
    description: 'Search recorded hospital network listings, then confirm benefits with your insurer.',
    icon: ShieldCheck,
    to: '/insurance',
  },
]

const careChallenges = [
  {
    number: '01',
    title: 'Finding a suitable hospital takes time',
    description: 'Published directory details give you a clearer place to begin your search.',
    icon: Building2,
  },
  {
    number: '02',
    title: 'Doctor information can be hard to compare',
    description: 'Browse verified profiles and their current hospital affiliations when available.',
    icon: Stethoscope,
  },
  {
    number: '03',
    title: 'Coordinating the next step is confusing',
    description: 'Keep useful discovery tools and existing appointment records together.',
    icon: CalendarDays,
  },
  {
    number: '04',
    title: 'Urgent situations need clear direction',
    description: 'Get direct emergency information without implying CarePath can dispatch help.',
    icon: Truck,
  },
  {
    number: '05',
    title: 'Network listings do not explain your coverage',
    description: 'See insurer-referenced records and confirm policy details with your insurer.',
    icon: ShieldCheck,
  },
]

const patientJourney = [
  {
    number: '01',
    title: 'Tell us what you’re looking for',
    description: 'Search the hospital directory or browse doctor and specialty information.',
  },
  {
    number: '02',
    title: 'Review the available details',
    description: 'Check the public listing information and its stated limitations.',
  },
  {
    number: '03',
    title: 'Confirm directly with the provider',
    description: 'Contact the hospital or insurer to verify current availability and coverage.',
  },
]

export function HomePage() {
  const [search, setSearch] = useState('')
  const [retryCount, setRetryCount] = useState(0)
  const [loadState, setLoadState] = useState<{
    retryCount: number
    result: HospitalPageResult | null
    error: string | null
  } | null>(null)
  const navigate = useNavigate()
  const currentLoad = loadState?.retryCount === retryCount ? loadState : null
  const hospitals = currentLoad?.result?.data ?? []

  useEffect(() => {
    const controller = new AbortController()
    getHospitals({ city: 'Sonipat', limit: 3, offset: 0 }, controller.signal)
      .then((result) => setLoadState({ retryCount, result, error: null }))
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return
        setLoadState({
          retryCount,
          result: null,
          error: cause instanceof Error ? cause.message : 'Published hospital listings are unavailable.',
        })
      })
    return () => controller.abort()
  }, [retryCount])

  function searchHospitals(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const params = new URLSearchParams({ city: 'Sonipat' })
    if (search.trim()) params.set('q', search.trim())
    navigate(`/hospitals?${params.toString()}`)
  }

  return (
    <div className="landing-page">
      <section aria-labelledby="hero-heading" className="landing-hero" id="home">
        <div aria-hidden="true" className="landing-orb landing-orb--one" />
        <div aria-hidden="true" className="landing-orb landing-orb--two" />
        <div className="landing-container landing-hero-grid">
          <div className="landing-hero-copy">
            <p className="landing-eyebrow">
              <span className="landing-live-dot" />
              A clearer way to navigate care
            </p>
            <h1 id="hero-heading">
              Finding care
              <span> starts with clarity.</span>
            </h1>
            <p className="landing-hero-description">
              Explore hospital and doctor listings, understand your options, and find a
              practical next step — all in one thoughtful place.
            </p>
            <div className="landing-hero-actions">
              <Link className="glass-button glass-button-primary inline-flex" to="/register">
                Get started
                <ArrowRight aria-hidden="true" size={17} />
              </Link>
              <a className="landing-secondary-link" href="#features">
                Explore features
                <ArrowDownRight aria-hidden="true" size={16} />
              </a>
            </div>
            <form className="landing-hero-search" onSubmit={searchHospitals} role="search">
              <label>
                <Search aria-hidden="true" size={18} />
                <span className="sr-only">Search published hospitals in Sonipat</span>
                <input
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search hospitals in Sonipat"
                  value={search}
                />
              </label>
              <button aria-label="Search hospitals" type="submit">
                <ArrowRight aria-hidden="true" size={18} />
              </button>
            </form>
            <div className="landing-trust-row">
              <span><BadgeCheck aria-hidden="true" size={15} /> Public listing details</span>
              <span><MapPin aria-hidden="true" size={15} /> Sonipat, Haryana</span>
            </div>
          </div>

          <div aria-label="Live preview of the hospital directory" className="landing-preview">
            <div aria-hidden="true" className="landing-preview-orbit landing-preview-orbit--outer" />
            <div aria-hidden="true" className="landing-preview-orbit landing-preview-orbit--inner" />
            <div className="landing-preview-window">
              <div className="landing-preview-topbar">
                <span className="landing-preview-brand">
                  <span className="landing-brand-mark"><HeartPulse aria-hidden="true" size={15} /></span>
                  CarePath <span>/ Directory</span>
                </span>
                <span className="landing-preview-location"><MapPin aria-hidden="true" size={12} /> Sonipat</span>
              </div>
              <div className="landing-preview-content">
                <p className="landing-preview-label">HOSPITAL DISCOVERY</p>
                <h2>Start with what matters.</h2>
                <div className="landing-preview-search">
                  <Search aria-hidden="true" size={15} />
                  <span>Search published listings</span>
                  <ArrowRight aria-hidden="true" className="landing-preview-search-arrow" size={15} />
                </div>
                <div className="landing-preview-section-heading">
                  <span>Published in Sonipat</span>
                  {currentLoad?.result && (
                    <span>{currentLoad.result.pagination.total} listings</span>
                  )}
                </div>
                {hospitals.length ? (
                  <div className="landing-preview-list">
                    {hospitals.slice(0, 2).map((hospital) => (
                      <div className="landing-preview-hospital" key={hospital.id}>
                        <span className="landing-preview-hospital-icon"><Building2 aria-hidden="true" size={16} /></span>
                        <span className="landing-preview-hospital-copy">
                          <strong>{hospital.name}</strong>
                          <small>{hospital.facilityType ?? 'Facility type not listed'}</small>
                        </span>
                        <ArrowUpRight aria-hidden="true" className="landing-preview-hospital-arrow" size={15} />
                      </div>
                    ))}
                  </div>
                ) : (
                  <div aria-live="polite" className="landing-preview-empty">
                    {currentLoad?.error ? (
                      <>
                        <span>Directory preview is temporarily unavailable.</span>
                        <button onClick={() => setRetryCount((count) => count + 1)} type="button">Try again</button>
                      </>
                    ) : currentLoad?.result ? (
                      'No published listings are available right now.'
                    ) : (
                      'Connecting to the published directory…'
                    )}
                  </div>
                )}
              </div>
            </div>
            <div className="landing-preview-note">
              <span className="landing-preview-note-icon"><ShieldCheck aria-hidden="true" size={17} /></span>
              <span><strong>Clear, not complicated</strong><small>Check details directly with providers</small></span>
            </div>
            <div className="landing-preview-status">
              <span className="landing-live-dot" />
              {currentLoad?.error
                ? 'Directory connection unavailable'
                : currentLoad?.result
                  ? 'Live published directory'
                  : 'Connecting to the directory'}
            </div>
          </div>
        </div>
        <a aria-label="Scroll to healthcare challenges" className="landing-scroll-cue" href="#challenges">
          <span>Scroll to explore</span>
          <ArrowDownRight aria-hidden="true" size={15} />
        </a>
      </section>

      <section aria-labelledby="challenges-heading" className="landing-section landing-challenges" id="challenges">
        <div className="landing-container">
          <div className="landing-section-heading">
            <p className="landing-eyebrow">The care journey, simplified</p>
            <h2 id="challenges-heading">Healthcare is personal.<br /><span>Finding your way shouldn’t be hard.</span></h2>
            <p>CarePath brings useful starting points together, with honest information about what each one can — and can’t — do.</p>
          </div>
          <div className="landing-challenge-grid">
            {careChallenges.map(({ number, title, description, icon: Icon }) => (
              <article className="landing-challenge-card" key={number}>
                <div className="landing-challenge-card-top">
                  <span className="landing-icon-frame"><Icon aria-hidden="true" size={19} /></span>
                  <span className="landing-card-number">{number}</span>
                </div>
                <h3>{title}</h3>
                <p>{description}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section aria-labelledby="features-heading" className="landing-section landing-features" id="features">
        <div className="landing-container">
          <div className="landing-split-heading">
            <div className="landing-section-heading landing-section-heading--left">
              <p className="landing-eyebrow">One connected starting point</p>
              <h2 id="features-heading">Tools that help you<br /><span>move forward with confidence.</span></h2>
            </div>
            <p>Explore the information that’s available today. CarePath never substitutes for professional medical advice or a provider’s own confirmation.</p>
          </div>
          <div className="landing-feature-grid">
            {productFeatures.map((feature) => (
              <FeatureCard
                description={feature.description}
                icon={feature.icon}
                key={feature.label}
                label={feature.label}
                to={feature.to}
              />
            ))}
          </div>
        </div>
      </section>

      <section aria-labelledby="journey-heading" className="landing-section landing-journey" id="how-it-works">
        <div className="landing-container landing-journey-layout">
          <div className="landing-section-heading landing-section-heading--left">
            <p className="landing-eyebrow">A simple path forward</p>
            <h2 id="journey-heading">Three steps.<br /><span>A clearer next move.</span></h2>
            <p>Use CarePath to get oriented, then make decisions with the people who provide your care.</p>
            <Link className="glass-button glass-button-primary inline-flex" to="/hospitals">
              Explore the directory
              <ArrowRight aria-hidden="true" size={16} />
            </Link>
          </div>
          <div className="landing-steps">
            {patientJourney.map((step) => (
              <article className="landing-step" key={step.number}>
                <span className="landing-step-number">{step.number}</span>
                <div>
                  <h3>{step.title}</h3>
                  <p>{step.description}</p>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section aria-labelledby="why-heading" className="landing-section landing-why" id="why-carepath">
        <div className="landing-container landing-why-card">
          <div className="landing-why-mark"><HeartPulse aria-hidden="true" size={25} /></div>
          <div className="landing-why-copy">
            <p className="landing-eyebrow">Why CarePath</p>
            <h2 id="why-heading">Built around clarity.<br /><span>Grounded in what we know.</span></h2>
            <p>Healthcare choices deserve useful information, clear boundaries, and room for your own judgment. CarePath focuses on making available directory details easier to explore — without promising outcomes or replacing care from qualified professionals.</p>
          </div>
          <div className="landing-principles">
            <div><BadgeCheck aria-hidden="true" size={17} /><span><strong>Source-conscious</strong><small>Published records only</small></span></div>
            <div><ShieldCheck aria-hidden="true" size={17} /><span><strong>Privacy-minded</strong><small>Limited account information</small></span></div>
            <div><MapPin aria-hidden="true" size={17} /><span><strong>Locally focused</strong><small>Starting with Sonipat</small></span></div>
          </div>
        </div>
      </section>

      <section aria-labelledby="emergency-cta-heading" className="landing-emergency-wrap">
        <div className="landing-container">
          <div className="landing-emergency">
            <div className="landing-emergency-copy">
              <span className="landing-emergency-icon"><HeartPulse aria-hidden="true" size={22} /></span>
              <div>
                <p className="landing-eyebrow">If you need urgent help</p>
                <h2 id="emergency-cta-heading">Your safety comes first.</h2>
                <p>CarePath is not an emergency service and cannot dispatch an ambulance. In India, call 112 for immediate assistance.</p>
              </div>
            </div>
            <div className="landing-emergency-actions">
              <a className="glass-button glass-button-emergency inline-flex" href="tel:112">
                <Phone aria-hidden="true" size={17} />
                Call 112
              </a>
              <Link className="landing-emergency-link" to="/emergency">Emergency information <ArrowRight aria-hidden="true" size={15} /></Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}
