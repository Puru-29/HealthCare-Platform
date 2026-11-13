import { ArrowLeft, Building2, ExternalLink, MapPin, Phone, ShieldCheck } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { getHospital, type Hospital } from '../api/client'
import { DirectoryState } from '../components/DirectoryState'
import { PageIntro } from '../components/PageIntro'

type HospitalDetailsPageProps = {
  basePath?: string
}

function getAddress(hospital: Hospital): string {
  return (
    hospital.address ||
    [hospital.city, hospital.region, hospital.postalCode].filter(Boolean).join(', ') ||
    'Address not provided in the public directory.'
  )
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' || url.protocol === 'http:'
  } catch {
    return false
  }
}

function hasMapCoordinates(
  hospital: Hospital,
): hospital is Hospital & { latitude: number; longitude: number } {
  return hospital.latitude !== null &&
    hospital.longitude !== null &&
    hospital.latitude >= -90 &&
    hospital.latitude <= 90 &&
    hospital.longitude >= -180 &&
    hospital.longitude <= 180
}

export function HospitalDetailsPage({ basePath = '' }: HospitalDetailsPageProps) {
  const { hospitalId } = useParams()
  const [searchParams] = useSearchParams()
  const [loadState, setLoadState] = useState<{
    requestKey: string
    hospital: Hospital | null
    error: string | null
  } | null>(null)
  const [retryCount, setRetryCount] = useState(0)
  const directoryParams = new URLSearchParams(searchParams)
  directoryParams.set('city', 'Sonipat')
  const directoryPath = `${basePath}/hospitals${directoryParams.size ? `?${directoryParams.toString()}` : ''}`
  const requestKey = `${hospitalId ?? ''}:${retryCount}`
  const isLoading = Boolean(hospitalId) && loadState?.requestKey !== requestKey
  const hospital = loadState?.requestKey === requestKey ? loadState.hospital : null
  const error = !hospitalId
    ? 'A hospital ID was not provided.'
    : isLoading
      ? null
      : loadState?.requestKey === requestKey
        ? loadState.error
        : null

  useEffect(() => {
    if (!hospitalId) {
      return
    }

    const controller = new AbortController()

    getHospital(hospitalId, controller.signal)
      .then((response) => {
        setLoadState({ requestKey, hospital: response, error: null })
      })
      .catch((requestError: unknown) => {
        if (controller.signal.aborted) return
        setLoadState({
          requestKey,
          hospital: null,
          error: requestError instanceof Error
            ? requestError.message
            : 'Could not load hospital details. Please try again.',
        })
      })

    return () => controller.abort()
  }, [hospitalId, requestKey])

  return (
    <section className="dashboard-page">
      <div className="mx-auto max-w-4xl px-5 py-10 sm:px-8 sm:py-14">
        <Link
          className="mb-7 inline-flex items-center gap-2 text-sm font-semibold text-forest-800 hover:text-forest-600"
          to={directoryPath}
        >
          <ArrowLeft aria-hidden="true" size={16} />
          Back to hospitals
        </Link>

        {isLoading ? (
          <DirectoryState
            message="Please wait while this public listing loads."
            title="Loading hospital details"
            type="loading"
          />
        ) : error ? (
          <div className="space-y-4">
            <DirectoryState message={error} title="Hospital details unavailable" type="error" />
            <div className="flex flex-wrap justify-center gap-3">
              <button
                className="glass-button glass-button-primary"
                onClick={() => setRetryCount((count) => count + 1)}
                type="button"
              >
                Try again
              </button>
              <Link className="glass-button" to={directoryPath}>
                Back to hospital directory
              </Link>
            </div>
          </div>
        ) : hospital ? (
          <article className="glass-card p-5 sm:p-8">
            <PageIntro
              description={hospital.description ?? 'No public description is available.'}
              eyebrow="Published directory listing"
              title={hospital.name}
            />

            <div className="flex flex-wrap gap-2">
              <span className="inline-flex items-center gap-2 rounded-full bg-sage-100 px-3 py-1.5 text-xs font-semibold text-forest-800">
                <Building2 aria-hidden="true" size={15} />
                {hospital.facilityType ?? 'Facility type not listed'}
              </span>
              <span className="rounded-full bg-white/75 px-3 py-1.5 text-xs font-semibold text-ink-700">
                Published listing · verification status not provided
              </span>
            </div>

            <div className="mt-8 grid gap-6 border-t border-forest-900/10 pt-6 sm:grid-cols-2">
              <section aria-labelledby="hospital-information-heading">
                <h2
                  className="text-base font-semibold text-forest-950"
                  id="hospital-information-heading"
                >
                  Hospital information
                </h2>
                <p className="mt-3 flex items-start gap-2 text-sm leading-6 text-ink-600">
                  <MapPin aria-hidden="true" className="mt-1 shrink-0" size={16} />
                  <span>{getAddress(hospital)}</span>
                </p>
                <p className="mt-4 text-sm leading-6 text-ink-600">
                  Specialty details are not included in the current hospital API response.
                </p>
              </section>

              <section aria-labelledby="hospital-contact-heading">
                <h2
                  className="text-base font-semibold text-forest-950"
                  id="hospital-contact-heading"
                >
                  Contact and location
                </h2>
                {hospital.phone ? (
                  <a
                    className="mt-3 flex items-start gap-2 text-sm leading-6 text-forest-800 underline underline-offset-4"
                    href={`tel:${hospital.phone}`}
                  >
                    <Phone aria-hidden="true" className="mt-1 shrink-0" size={16} />
                    {hospital.phone}
                  </a>
                ) : (
                  <p className="mt-3 flex items-start gap-2 text-sm leading-6 text-ink-600">
                    <Phone aria-hidden="true" className="mt-1 shrink-0" size={16} />
                    Phone number not listed.
                  </p>
                )}
                {hospital.website && isHttpUrl(hospital.website) ? (
                  <a
                    className="mt-3 flex items-start gap-2 break-all text-sm leading-6 text-forest-800 underline underline-offset-4"
                    href={hospital.website}
                    rel="noreferrer"
                    target="_blank"
                  >
                    <ExternalLink aria-hidden="true" className="mt-1 shrink-0" size={16} />
                    {hospital.website}
                  </a>
                ) : null}
                {hospital.latitude !== null && hospital.longitude !== null ? (
                  <p className="mt-3 text-sm leading-6 text-ink-600">
                    Public coordinates: {hospital.latitude}, {hospital.longitude}
                  </p>
                ) : (
                  <p className="mt-3 text-sm leading-6 text-ink-600">
                    Directions are unavailable because public coordinates are not listed.
                  </p>
                )}
              </section>
            </div>

            {hasMapCoordinates(hospital) && (
              <section aria-labelledby="hospital-map-heading" className="hospital-detail-map">
                <div className="hospital-detail-map-heading">
                  <div>
                    <h2 id="hospital-map-heading">Hospital location</h2>
                    <p>Map centered on the published hospital coordinates.</p>
                  </div>
                  <a
                    href={`https://www.openstreetmap.org/?mlat=${hospital.latitude}&mlon=${hospital.longitude}#map=16/${hospital.latitude}/${hospital.longitude}`}
                    rel="noreferrer"
                    target="_blank"
                  >
                    Open map <ExternalLink aria-hidden="true" size={14} />
                  </a>
                </div>
                <iframe
                  aria-label={`Map showing ${hospital.name} at its published coordinates`}
                  className="hospital-detail-map-frame"
                  loading="lazy"
                  referrerPolicy="no-referrer"
                  src={`https://www.openstreetmap.org/export/embed.html?bbox=${hospital.longitude - 0.015}%2C${hospital.latitude - 0.01}%2C${hospital.longitude + 0.015}%2C${hospital.latitude + 0.01}&layer=mapnik&marker=${hospital.latitude}%2C${hospital.longitude}`}
                  title={`Map showing ${hospital.name}`}
                />
              </section>
            )}

            <div className="glass-card glass-card--warm mt-7 flex items-start gap-3 p-4">
              <ShieldCheck aria-hidden="true" className="mt-0.5 shrink-0 text-forest-700" size={19} />
              <div>
                <p className="text-sm font-semibold text-forest-950">
                  Listing verification is not available here
                </p>
                <p className="mt-1 text-sm leading-6 text-ink-600">
                  This page displays public listing fields only. It does not indicate provider
                  verification or live service availability.
                </p>
              </div>
            </div>
          </article>
        ) : null}
      </div>
    </section>
  )
}
