import { ArrowRight, Building2, HeartPulse, Search, Stethoscope } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import {
  getDoctors,
  getHospitals,
  type DoctorPage,
  type HospitalPage,
} from '../api/client'
import { DirectoryState } from '../components/DirectoryState'
import { GlassCard } from '../components/GlassCard'
import { PageIntro } from '../components/PageIntro'
import { doctorSpecialties } from '../data/medicalSpecialties'
import { matchConcernToSpecialty } from '../data/symptomMatching'

const pageSize = 8

type SearchState = {
  query: string
  retryCount: number
  hospitals: HospitalPage | null
  doctors: DoctorPage | null
  hospitalError: string | null
  doctorError: string | null
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback
}

export function CareSearchPage() {
  const [searchParams] = useSearchParams()
  const query = (searchParams.get('q') ?? '').trim().slice(0, 120)
  const [retryCount, setRetryCount] = useState(0)
  const [state, setState] = useState<SearchState | null>(null)
  const concern = matchConcernToSpecialty(query)
  const recognizedSpecialty = doctorSpecialties.find(
    (specialty) => specialty.toLocaleLowerCase('en') === query.toLocaleLowerCase('en'),
  )
  const specialty = concern.specialty ?? recognizedSpecialty
  const isSymptomSearch = Boolean(concern.specialty || concern.urgent)
  const isLoading = Boolean(
    query && !concern.urgent &&
    (state?.query !== query || state.retryCount !== retryCount),
  )
  const results = state?.query === query && state.retryCount === retryCount ? state : null

  useEffect(() => {
    if (!query || concern.urgent) return

    const controller = new AbortController()
    const hospitalFilters = {
      city: 'Sonipat',
      limit: pageSize,
      offset: 0,
      ...(specialty
        ? { specialty }
        : isSymptomSearch
          ? {}
          : { search: query }),
    }
    const doctorFilters = {
      limit: pageSize,
      offset: 0,
      ...(specialty ? { specialty } : { search: query }),
    }

    Promise.allSettled([
      getHospitals(hospitalFilters, controller.signal),
      getDoctors(doctorFilters, controller.signal),
    ]).then(([hospitalOutcome, doctorOutcome]) => {
      if (controller.signal.aborted) return
      setState({
        query,
        retryCount,
        hospitals: hospitalOutcome.status === 'fulfilled' ? hospitalOutcome.value : null,
        doctors: doctorOutcome.status === 'fulfilled' ? doctorOutcome.value : null,
        hospitalError: hospitalOutcome.status === 'rejected'
          ? errorMessage(hospitalOutcome.reason, 'Verified hospital listings are unavailable.')
          : null,
        doctorError: doctorOutcome.status === 'rejected'
          ? errorMessage(doctorOutcome.reason, 'Verified doctor listings are unavailable.')
          : null,
      })
    })

    return () => controller.abort()
  }, [concern.urgent, isSymptomSearch, query, retryCount, specialty])

  const hospitalLink = new URLSearchParams(
    specialty ? { specialty } : { q: query, city: 'Sonipat' },
  )
  const doctorLink = new URLSearchParams(
    specialty ? { specialty } : { q: query },
  )

  return (
    <section className="dashboard-page">
      <div className="mx-auto max-w-7xl px-5 py-10 sm:px-8 sm:py-14">
        <PageIntro
          description="Search published, verified hospital and doctor listings in Sonipat. Directory results depend on information that has been verified and made public."
          eyebrow="Care directory · Sonipat"
          title="Search care"
        />

        {!query ? (
          <DirectoryState
            message="Search for a hospital, doctor, or specialty using the search field above."
            title="Start with a care search"
            type="empty"
          />
        ) : concern.urgent ? (
          <GlassCard className="glass-card--emergency flex flex-col gap-4 p-6 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <HeartPulse aria-hidden="true" className="mt-1 shrink-0 text-emergency-700" size={22} />
              <div>
                <h2 className="font-semibold text-forest-950">This may need urgent attention</h2>
                <p className="mt-1 max-w-2xl text-sm leading-6 text-ink-600">
                  Your search was not sent to the hospital or doctor directory. If this is an emergency, call 112.
                  CarePath cannot provide emergency dispatch or medical diagnosis.
                </p>
              </div>
            </div>
            <Link className="glass-button glass-button-primary inline-flex shrink-0 items-center gap-2" to="/dashboard/emergency">
              Emergency information <ArrowRight aria-hidden="true" size={16} />
            </Link>
          </GlassCard>
        ) : (
          <>
            {isSymptomSearch && (
              <GlassCard className="mb-6 flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
                <p className="max-w-2xl text-sm leading-6 text-ink-700">
                  This looks like a symptom. The search phrase was not sent to the hospital directory; verified
                  listings for {specialty} are shown where available. CarePath offers guidance, not diagnosis.
                </p>
                <Link
                  className="glass-button inline-flex shrink-0 items-center gap-2"
                  to="/dashboard/assistant"
                >
                  Open symptom guide <ArrowRight aria-hidden="true" size={16} />
                </Link>
              </GlassCard>
            )}

            {isLoading ? (
              <DirectoryState
                message="Looking for verified listings in Sonipat."
                title="Searching the care directory"
                type="loading"
              />
            ) : (
              <div className="grid gap-7 lg:grid-cols-2">
                <section aria-labelledby="care-hospital-results">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <h2 className="flex items-center gap-2 text-lg font-semibold text-forest-950" id="care-hospital-results">
                      <Building2 aria-hidden="true" className="text-forest-700" size={19} />
                      Hospitals
                    </h2>
                    <Link
                      className="text-sm font-semibold text-forest-700 hover:text-forest-950"
                      to={`/dashboard/hospitals?${hospitalLink.toString()}`}
                    >
                      View all <ArrowRight aria-hidden="true" className="inline" size={14} />
                    </Link>
                  </div>
                  {results?.hospitalError && (
                    <DirectoryState
                      message={results.hospitalError}
                      title="Hospital search unavailable"
                      type="error"
                    />
                  )}
                  {results?.hospitals && (results.hospitals.data.length ? (
                    <div className="grid gap-3">
                      {results.hospitals.data.map((hospital) => (
                        <GlassCard className="p-4" key={hospital.id}>
                          <Link
                            className="font-semibold text-forest-950 hover:text-forest-700"
                            to={`/dashboard/hospitals/${encodeURIComponent(hospital.id)}`}
                          >
                            {hospital.name}
                          </Link>
                          <p className="mt-1 text-sm text-ink-600">
                            {[hospital.facilityType, hospital.city, hospital.region]
                              .filter(Boolean)
                              .join(' · ') || 'Hospital details available'}
                          </p>
                          {hospital.address && <p className="mt-1 text-sm text-ink-600">{hospital.address}</p>}
                        </GlassCard>
                      ))}
                    </div>
                  ) : (
                    <DirectoryState
                      message="No published, verified hospitals matched this search."
                      title="No hospital listings found"
                      type="empty"
                    />
                  ))}
                </section>

                <section aria-labelledby="care-doctor-results">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <h2 className="flex items-center gap-2 text-lg font-semibold text-forest-950" id="care-doctor-results">
                      <Stethoscope aria-hidden="true" className="text-forest-700" size={19} />
                      Doctors
                    </h2>
                    <Link
                      className="text-sm font-semibold text-forest-700 hover:text-forest-950"
                      to={`/dashboard/doctors?${doctorLink.toString()}`}
                    >
                      View all <ArrowRight aria-hidden="true" className="inline" size={14} />
                    </Link>
                  </div>
                  {results?.doctorError && (
                    <DirectoryState
                      message={results.doctorError}
                      title="Doctor search unavailable"
                      type="error"
                    />
                  )}
                  {results?.doctors && (results.doctors.data.length ? (
                    <div className="grid gap-3">
                      {results.doctors.data.map((doctor) => (
                        <GlassCard className="p-4" key={`${doctor.id}-${doctor.hospitalId}`}>
                          <Link
                            className="font-semibold text-forest-950 hover:text-forest-700"
                            to={`/dashboard/doctors/${encodeURIComponent(doctor.id)}`}
                          >
                            {doctor.name}
                          </Link>
                          <p className="mt-1 text-sm text-ink-600">
                            {doctor.specialty} · {doctor.hospitalName}
                          </p>
                          <p className="mt-1 text-sm text-ink-600">{doctor.city}</p>
                        </GlassCard>
                      ))}
                    </div>
                  ) : (
                    <DirectoryState
                      message="No published, verified doctor profiles matched this search."
                      title="No doctor listings found"
                      type="empty"
                    />
                  ))}
                </section>
              </div>
            )}

            {!isLoading && (results?.hospitalError || results?.doctorError) && (
              <div className="mt-5 text-center">
                <button
                  className="glass-button inline-flex items-center gap-2"
                  onClick={() => setRetryCount((current) => current + 1)}
                  type="button"
                >
                  <Search aria-hidden="true" size={15} /> Try search again
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </section>
  )
}
