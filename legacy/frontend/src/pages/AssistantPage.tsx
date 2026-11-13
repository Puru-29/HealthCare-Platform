import { AlertTriangle, ArrowRight, Search, Stethoscope } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { PageIntro } from '../components/PageIntro'
import { matchConcernToSpecialty } from '../data/symptomMatching'

type AssistantPageProps = {
  basePath?: string
}

export function AssistantPage({ basePath = '' }: AssistantPageProps) {
  const [concern, setConcern] = useState('')
  const [submittedConcern, setSubmittedConcern] = useState('')

  function submitConcern(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSubmittedConcern(concern.trim())
  }

  const guidance = submittedConcern ? matchConcernToSpecialty(submittedConcern) : null
  const encodedSpecialty = guidance?.specialty
    ? `?specialty=${encodeURIComponent(guidance.specialty)}`
    : ''

  return (
    <section className="dashboard-page">
      <div className="mx-auto max-w-4xl px-5 py-10 sm:px-8 sm:py-14">
        <PageIntro
          description="A limited, on-device keyword guide can point to a broad specialty category. It is not AI, a diagnosis, or a substitute for clinical advice."
          eyebrow="Care guide · limited matching"
          title="Find a starting point for your concern."
        />

        <section aria-labelledby="assistant-status-heading" className="glass-card glass-card--assistant p-5 sm:p-8">
          <div className="flex items-start gap-4">
            <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-sage-100 text-forest-800">
              <Stethoscope aria-hidden="true" size={21} />
            </span>
            <div>
              <h2 className="text-lg font-semibold text-forest-950" id="assistant-status-heading">
                Limited symptom guidance
              </h2>
              <p className="mt-2 text-sm leading-6 text-ink-700">
                Matching happens in this page only. Your entry is not sent to CarePath servers or saved.
                Describe only a brief concern; do not include your name or other identifying details.
              </p>
            </div>
          </div>
          <form className="mt-6 space-y-3" onSubmit={submitConcern}>
            <label className="block text-sm font-medium text-ink-800" htmlFor="care-concern">
              What would you like help finding a broad specialty for?
            </label>
            <textarea
              autoComplete="off"
              className="min-h-28 w-full resize-y rounded-xl border border-forest-900/15 bg-white/80 p-3 text-sm text-ink-900"
              id="care-concern"
              maxLength={240}
              onChange={(event) => {
                setConcern(event.target.value)
                setSubmittedConcern('')
              }}
              placeholder="For example: knee pain"
              value={concern}
            />
            <button className="glass-button glass-button-primary inline-flex" disabled={!concern.trim()} type="submit">
              <Search aria-hidden="true" size={16} />
              Find a possible specialty
            </button>
          </form>

          {guidance?.urgent && (
            <div className="mt-5 rounded-xl border border-emergency-600/25 bg-white/80 p-4" role="alert">
              <h3 className="font-semibold text-emergency-700">Seek emergency help now</h3>
              <p className="mt-1 text-sm leading-6 text-ink-700">
                Your text may describe a serious warning sign. CarePath cannot assess symptoms.
                Call India’s emergency number 112 or seek immediate in-person emergency care.
              </p>
              <a className="glass-button glass-button-emergency mt-3 inline-flex" href="tel:112">Call 112</a>
            </div>
          )}

          {guidance && !guidance.urgent && (
            <div aria-live="polite" className="mt-5 rounded-xl border border-forest-900/10 bg-white/75 p-4">
              {guidance.specialty ? (
                <>
                  <h3 className="font-semibold text-forest-950">A possible specialty to explore: {guidance.specialty}</h3>
                  <p className="mt-1 text-sm leading-6 text-ink-700">
                    This limited keyword match is informational only and is not a diagnosis or treatment recommendation.
                    It may not match your concern accurately and cannot assess your health. The directories show published, verified records only; a matching provider may not be listed.
                  </p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <Link className="glass-button glass-button-primary inline-flex" to={`${basePath}/doctors${encodedSpecialty}`}>
                      <Stethoscope aria-hidden="true" size={16} />
                      Explore verified doctor listings
                      <ArrowRight aria-hidden="true" size={15} />
                    </Link>
                    <Link className="glass-button inline-flex" to={`${basePath}/hospitals${encodedSpecialty}`}>
                      Check published hospitals
                      <ArrowRight aria-hidden="true" size={15} />
                    </Link>
                  </div>
                </>
              ) : (
                <>
                  <h3 className="font-semibold text-forest-950">No specialty match available</h3>
                  <p className="mt-1 text-sm leading-6 text-ink-700">
                    This guide supports only a few broad keywords. It does not interpret other concerns.
                    Consider contacting a qualified healthcare professional.
                  </p>
                </>
              )}
            </div>
          )}

          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            <Link className="glass-button inline-flex justify-center" to={`${basePath}/doctors`}>
              <Stethoscope aria-hidden="true" size={17} />
              Doctor directory status
            </Link>
            <Link className="glass-button inline-flex justify-center" to={`${basePath}/hospitals?city=Sonipat`}>
              Browse published hospitals
              <ArrowRight aria-hidden="true" size={16} />
            </Link>
          </div>
        </section>

        <div className="glass-card glass-card--emergency mt-5 flex items-start gap-3 p-4">
          <AlertTriangle aria-hidden="true" className="mt-0.5 shrink-0 text-emergency-700" size={19} />
          <p className="text-sm leading-6 text-ink-700">
            If you may be experiencing an emergency, do not use an online assistant.{' '}
            <Link className="font-semibold text-emergency-700 underline underline-offset-4" to={`${basePath}/emergency`}>
              See emergency information
            </Link>
            .
          </p>
        </div>
      </div>
    </section>
  )
}
