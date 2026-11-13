import { AlertCircle, ArrowLeft, ArrowUpRight, BadgeCheck, Building2, ExternalLink, MapPin, Phone, RotateCcw, Stethoscope } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { getDoctor, type DoctorDetail } from '../api/client'
import { DirectoryState } from '../components/DirectoryState'
import { PageIntro } from '../components/PageIntro'

type DoctorDetailsPageProps = {
  basePath?: string
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' || url.protocol === 'http:'
  } catch {
    return false
  }
}

export function DoctorDetailsPage({ basePath = '' }: DoctorDetailsPageProps) {
  const { doctorId } = useParams()
  const [searchParams] = useSearchParams()
  const [retryCount, setRetryCount] = useState(0)
  const [loadState, setLoadState] = useState<{
    requestKey: string
    doctor: DoctorDetail | null
    error: string | null
  } | null>(null)
  const requestKey = `${doctorId ?? ''}:${retryCount}`
  const isLoading = Boolean(doctorId) && loadState?.requestKey !== requestKey
  const doctor = loadState?.requestKey === requestKey ? loadState.doctor : null
  const error = !doctorId
    ? 'A doctor ID was not provided.'
    : isLoading
      ? null
      : loadState?.requestKey === requestKey
        ? loadState.error
        : null
  const directoryParams = new URLSearchParams(searchParams)
  if (doctor?.specialty) directoryParams.set('specialty', doctor.specialty)
  const directoryPath = `${basePath}/doctors${directoryParams.size ? `?${directoryParams.toString()}` : ''}`

  useEffect(() => {
    if (!doctorId) return
    const controller = new AbortController()
    getDoctor(doctorId, controller.signal)
      .then((result) => setLoadState({ requestKey, doctor: result, error: null }))
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return
        setLoadState({
          requestKey,
          doctor: null,
          error: cause instanceof Error ? cause.message : 'Could not load this verified doctor listing.',
        })
      })
    return () => controller.abort()
  }, [doctorId, requestKey])

  return (
    <section className="doctor-detail-page">
      <div className="doctor-detail-container">
        <Link className="doctor-detail-back" to={directoryPath}>
          <ArrowLeft aria-hidden="true" size={16} /> Back to doctors
        </Link>
        {isLoading ? (
          <DirectoryState message="Loading the verified public doctor profile." title="Loading doctor profile" type="loading" />
        ) : error ? (
          <div className="doctor-detail-state">
            <DirectoryState message={error} title="Doctor profile unavailable" type="error" />
            <div className="doctor-detail-state-actions">
              <button className="glass-button glass-button-primary" onClick={() => setRetryCount((count) => count + 1)} type="button">
                <RotateCcw aria-hidden="true" size={15} /> Try again
              </button>
              <Link className="glass-button" to={directoryPath}>Back to directory</Link>
            </div>
          </div>
        ) : doctor ? (
          <>
            <PageIntro
              description="This profile includes verified public directory information only. Contact details shown below belong to the associated hospital, not the doctor."
              eyebrow="Verified doctor profile · Sonipat"
              title={doctor.name}
            />
            <article className="glass-card doctor-detail-card">
              <div className="doctor-detail-identity">
                <span className="doctor-detail-avatar"><Stethoscope aria-hidden="true" size={25} /></span>
                <div>
                  <span className="doctor-verified-badge"><BadgeCheck aria-hidden="true" size={14} /> Verified public profile</span>
                  <h2>{doctor.specialty}</h2>
                </div>
              </div>
              <div className="doctor-detail-notice">
                <AlertCircle aria-hidden="true" size={17} />
                <p>Qualifications, individual availability, and direct doctor contact information are not included in the current directory response.</p>
              </div>
              <section aria-labelledby="doctor-affiliations-heading" className="doctor-affiliations">
                <div className="doctor-affiliations-heading">
                  <div>
                    <p className="doctor-detail-eyebrow">CURRENT VERIFIED AFFILIATIONS</p>
                    <h2 id="doctor-affiliations-heading">Associated hospitals</h2>
                  </div>
                  <span>{doctor.affiliations.length}</span>
                </div>
                {doctor.affiliations.length ? (
                  <div className="doctor-affiliation-list">
                    {doctor.affiliations.map((affiliation) => (
                      <article className="doctor-affiliation" key={affiliation.hospitalId}>
                        <span className="doctor-affiliation-icon"><Building2 aria-hidden="true" size={19} /></span>
                        <div className="doctor-affiliation-main">
                          <span className="doctor-verified-badge"><BadgeCheck aria-hidden="true" size={13} /> Verified listing</span>
                          <h3>{affiliation.hospitalName}</h3>
                          {affiliation.title && <p className="doctor-affiliation-title">{affiliation.title}</p>}
                          <p className="doctor-affiliation-location"><MapPin aria-hidden="true" size={14} />{affiliation.address ?? affiliation.city}</p>
                          <div className="doctor-affiliation-actions">
                            <Link to={`${basePath}/hospitals/${encodeURIComponent(affiliation.hospitalId)}`}>
                              Hospital details <ArrowUpRight aria-hidden="true" size={14} />
                            </Link>
                            {affiliation.phone && (
                              <a href={`tel:${affiliation.phone}`}>
                                <Phone aria-hidden="true" size={14} /> Hospital contact
                              </a>
                            )}
                            {affiliation.website && isHttpUrl(affiliation.website) && (
                              <a href={affiliation.website} rel="noreferrer" target="_blank">
                                <ExternalLink aria-hidden="true" size={14} /> Hospital website
                              </a>
                            )}
                          </div>
                        </div>
                      </article>
                    ))}
                  </div>
                ) : (
                  <p className="doctor-detail-muted">No current verified hospital affiliations are available.</p>
                )}
              </section>
            </article>
          </>
        ) : null}
      </div>
    </section>
  )
}
