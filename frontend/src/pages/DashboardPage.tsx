import {
  ArrowRight,
  ArrowUpRight,
  Ambulance,
  CalendarDays,
  Clock3,
  HeartPulse,
  Hospital,
  MapPin,
  ShieldCheck,
  Stethoscope,
  UserRound,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  getHospitals,
  getPatientAppointments,
  type HospitalPage as HospitalPageResult,
  type PatientAppointment,
} from '../api/client'
import { useAuth } from '../auth/useAuth'
import { DirectoryState } from '../components/DirectoryState'
import { HospitalCard } from '../components/HospitalCard'

const pageLoadedAt = Date.now()

function formatDate(value: string): string {
  const date = new Date(value)
  return Number.isNaN(date.valueOf())
    ? 'Date unavailable'
    : new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(date)
}

function appointmentLabel(appointment: PatientAppointment): string {
  return appointment.doctorName ?? appointment.hospitalName ?? 'Appointment details unavailable'
}

export function DashboardPage() {
  const { user } = useAuth()
  const [hospitalRetry, setHospitalRetry] = useState(0)
  const [appointmentRetry, setAppointmentRetry] = useState(0)
  const [hospitalState, setHospitalState] = useState<{
    retryCount: number
    result: HospitalPageResult | null
    error: string | null
  } | null>(null)
  const [appointmentState, setAppointmentState] = useState<{
    retryCount: number
    appointments: PatientAppointment[] | null
    error: string | null
  } | null>(null)

  const hospitals = hospitalState?.retryCount === hospitalRetry ? hospitalState.result : null
  const hospitalError = hospitalState?.retryCount === hospitalRetry ? hospitalState.error : null
  const appointments = appointmentState?.retryCount === appointmentRetry
    ? appointmentState.appointments
    : null
  const appointmentError = appointmentState?.retryCount === appointmentRetry
    ? appointmentState.error
    : null

  useEffect(() => {
    const controller = new AbortController()
    getHospitals({ city: 'Sonipat', limit: 3, offset: 0 }, controller.signal)
      .then((result) => setHospitalState({ retryCount: hospitalRetry, result, error: null }))
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return
        setHospitalState({
          retryCount: hospitalRetry,
          result: null,
          error: cause instanceof Error ? cause.message : 'Published hospital listings are unavailable.',
        })
      })
    return () => controller.abort()
  }, [hospitalRetry])

  useEffect(() => {
    const controller = new AbortController()
    getPatientAppointments(controller.signal)
      .then(({ data }) => setAppointmentState({
        retryCount: appointmentRetry,
        appointments: data,
        error: null,
      }))
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return
        setAppointmentState({
          retryCount: appointmentRetry,
          appointments: null,
          error: cause instanceof Error ? cause.message : 'Appointment records are unavailable.',
        })
      })
    return () => controller.abort()
  }, [appointmentRetry])

  const recentAppointments = appointments?.slice(0, 3) ?? []
  const upcomingAppointments = useMemo(() => {
    return (appointments ?? [])
      .filter((appointment) => {
        const startsAt = new Date(appointment.startsAt).valueOf()
        return startsAt >= pageLoadedAt &&
          (appointment.status === 'requested' || appointment.status === 'confirmed')
      })
      .sort((left, right) => Date.parse(left.startsAt) - Date.parse(right.startsAt))
      .slice(0, 2)
  }, [appointments])
  const requestCount = appointments?.filter((appointment) => appointment.status === 'requested').length ?? 0

  return (
    <div className="dashboard-overview">
      <section className="dashboard-welcome">
        <div className="dashboard-welcome-copy">
          <p className="dashboard-eyebrow"><span className="landing-live-dot" />YOUR CAREPATH OVERVIEW</p>
          <h1>Welcome back, {user?.displayName ?? 'there'}.</h1>
          <p>Explore local care information and review the account activity available to you.</p>
        </div>
        <div aria-hidden="true" className="dashboard-welcome-art">
          <div className="dashboard-welcome-orbit dashboard-welcome-orbit--one" />
          <div className="dashboard-welcome-orbit dashboard-welcome-orbit--two" />
          <div className="dashboard-welcome-pulse"><HeartPulse size={34} /></div>
          <span className="dashboard-welcome-pip dashboard-welcome-pip--one" />
          <span className="dashboard-welcome-pip dashboard-welcome-pip--two" />
        </div>
      </section>

      <section aria-label="Your CarePath account summary" className="dashboard-summary-grid">
        <article className="dashboard-summary-card">
          <span className="dashboard-summary-icon"><Hospital aria-hidden="true" size={19} /></span>
          <span className="dashboard-summary-content">
            <span className="dashboard-summary-label">Published hospitals</span>
            <strong>{hospitals ? hospitals.pagination.total : '—'}</strong>
            <small>Sonipat directory results</small>
          </span>
          <Link aria-label="Find hospitals" to="/dashboard/hospitals"><ArrowUpRight size={16} /></Link>
        </article>
        <article className="dashboard-summary-card">
          <span className="dashboard-summary-icon dashboard-summary-icon--teal"><CalendarDays aria-hidden="true" size={19} /></span>
          <span className="dashboard-summary-content">
            <span className="dashboard-summary-label">Appointment requests</span>
            <strong>{appointments ? requestCount : '—'}</strong>
            <small>Requests linked to your account</small>
          </span>
          <Link aria-label="View appointments" to="/dashboard/appointments"><ArrowUpRight size={16} /></Link>
        </article>
        <article className="dashboard-summary-card">
          <span className="dashboard-summary-icon dashboard-summary-icon--blue"><MapPin aria-hidden="true" size={19} /></span>
          <span className="dashboard-summary-content">
            <span className="dashboard-summary-label">Service area</span>
            <strong className="dashboard-summary-area">Sonipat</strong>
            <small>Haryana, India</small>
          </span>
          <span aria-hidden="true" className="dashboard-summary-arrow"><ArrowUpRight size={16} /></span>
        </article>
      </section>

      <section className="dashboard-content-grid">
        <section aria-labelledby="hospital-discovery-title" className="dashboard-panel dashboard-hospitals-panel">
          <div className="dashboard-panel-heading">
            <div>
              <p className="dashboard-eyebrow">LOCAL DIRECTORY</p>
              <h2 id="hospital-discovery-title">Hospital discovery</h2>
            </div>
            <Link className="dashboard-panel-link" to="/dashboard/hospitals">View directory <ArrowRight size={15} /></Link>
          </div>
          {hospitalError ? (
            <div className="dashboard-inline-state">
              <DirectoryState message={hospitalError} title="Could not load the hospital directory" type="error" />
              <button className="glass-button" onClick={() => setHospitalRetry((count) => count + 1)} type="button">Try again</button>
            </div>
          ) : !hospitals ? (
            <DirectoryState message="Loading currently published hospital listings for Sonipat." title="Loading hospitals" type="loading" />
          ) : hospitals.data.length ? (
            <div className="dashboard-hospital-list">
              {hospitals.data.map((hospital) => (
                <HospitalCard
                  basePath="/dashboard"
                  hospital={hospital}
                  key={hospital.id}
                  searchParams={new URLSearchParams('city=Sonipat')}
                />
              ))}
            </div>
          ) : (
            <DirectoryState
              message="No current verified hospital listings are available in Sonipat. Draft and unverified records are kept private."
              title="Verified listings are not yet available"
              type="empty"
            />
          )}
        </section>

        <section aria-labelledby="upcoming-title" className="dashboard-panel dashboard-appointments-panel">
          <div className="dashboard-panel-heading">
            <div>
              <p className="dashboard-eyebrow">YOUR APPOINTMENTS</p>
              <h2 id="upcoming-title">Upcoming</h2>
            </div>
            <Link aria-label="View appointment history" className="dashboard-panel-icon-link" to="/dashboard/appointments"><ArrowUpRight size={17} /></Link>
          </div>
          {appointmentError ? (
            <div className="dashboard-inline-state">
              <DirectoryState message={appointmentError} title="Could not load appointment records" type="error" />
              <button className="glass-button" onClick={() => setAppointmentRetry((count) => count + 1)} type="button">Try again</button>
            </div>
          ) : !appointments ? (
            <DirectoryState message="Loading appointment records linked to your account." title="Loading appointments" type="loading" />
          ) : upcomingAppointments.length ? (
            <div className="dashboard-appointment-list">
              {upcomingAppointments.map((appointment) => (
                <article className="dashboard-appointment-item" key={appointment.id}>
                  <span className="dashboard-appointment-date">
                    <CalendarDays aria-hidden="true" size={17} />
                  </span>
                  <span className="dashboard-appointment-copy">
                    <strong>{appointmentLabel(appointment)}</strong>
                    <small>{appointment.specialty ?? appointment.hospitalName ?? 'Appointment record'}</small>
                    <small><Clock3 aria-hidden="true" size={12} /> {formatDate(appointment.startsAt)}</small>
                  </span>
                  <span className="dashboard-appointment-status">{appointment.status.replaceAll('_', ' ')}</span>
                </article>
              ))}
              <Link className="dashboard-panel-link dashboard-list-link" to="/dashboard/appointments">All appointments <ArrowRight size={15} /></Link>
            </div>
          ) : (
            <div className="dashboard-empty-note">
              <span className="dashboard-empty-icon"><CalendarDays aria-hidden="true" size={19} /></span>
              <h3>No upcoming appointments</h3>
              <p>Appointment records linked to your account will appear here. CarePath does not currently book provider appointments.</p>
              <Link to="/dashboard/appointments">View appointment history <ArrowRight aria-hidden="true" size={14} /></Link>
            </div>
          )}
        </section>
      </section>

      <section className="dashboard-lower-grid">
        <section aria-labelledby="activity-title" className="dashboard-panel">
          <div className="dashboard-panel-heading">
            <div>
              <p className="dashboard-eyebrow">ACCOUNT RECORDS</p>
              <h2 id="activity-title">Recent appointment activity</h2>
            </div>
            <Link aria-label="See all appointment activity" className="dashboard-panel-icon-link" to="/dashboard/appointments"><ArrowUpRight size={17} /></Link>
          </div>
          {appointmentError ? (
            <p className="dashboard-muted-note">Appointment activity is unavailable right now.</p>
          ) : !appointments ? (
            <p className="dashboard-muted-note">Loading records linked to your account…</p>
          ) : recentAppointments.length ? (
            <div className="dashboard-activity-list">
              {recentAppointments.map((appointment) => (
                <article className="dashboard-activity-item" key={appointment.id}>
                  <span className={`dashboard-activity-dot dashboard-activity-dot--${appointment.status}`} />
                  <span className="dashboard-activity-copy">
                    <strong>{appointment.status.replaceAll('_', ' ')}</strong>
                    <small>{appointmentLabel(appointment)}</small>
                  </span>
                  <time>{formatDate(appointment.startsAt)}</time>
                </article>
              ))}
            </div>
          ) : (
            <p className="dashboard-muted-note">No appointment activity is linked to your account yet.</p>
          )}
        </section>

        <section aria-labelledby="services-title" className="dashboard-panel dashboard-services-panel">
          <div className="dashboard-panel-heading">
            <div>
              <p className="dashboard-eyebrow">CARE TOOLS</p>
              <h2 id="services-title">Healthcare services</h2>
            </div>
          </div>
          <div className="dashboard-service-list">
            <Link to="/dashboard/doctors"><span><Stethoscope size={17} /></span><strong>Find doctors</strong><ArrowRight size={14} /></Link>
            <Link to="/dashboard/assistant"><span><HeartPulse size={17} /></span><strong>Care guide</strong><ArrowRight size={14} /></Link>
            <Link to="/dashboard/insurance"><span><ShieldCheck size={17} /></span><strong>Insurance networks</strong><ArrowRight size={14} /></Link>
          </div>
        </section>
      </section>

      <section className="dashboard-bottom-grid">
        <section aria-labelledby="profile-summary-title" className="dashboard-profile-summary">
          <span className="dashboard-profile-avatar"><UserRound aria-hidden="true" size={20} /></span>
          <div>
            <p className="dashboard-eyebrow">YOUR ACCOUNT</p>
            <h2 id="profile-summary-title">{user?.displayName ?? 'Patient profile'}</h2>
            <p>{user?.email ?? 'Account information unavailable'}</p>
          </div>
          <Link className="dashboard-panel-link" to="/dashboard/profile">My profile <ArrowRight size={15} /></Link>
        </section>

        <section className="dashboard-emergency-card">
          <span className="dashboard-emergency-icon"><Ambulance aria-hidden="true" size={20} /></span>
          <div>
            <p className="dashboard-eyebrow">EMERGENCY ACCESS</p>
            <h2>Need urgent help?</h2>
            <p>CarePath cannot dispatch emergency services. Call 112 in India.</p>
          </div>
          <Link aria-label="Emergency information" to="/dashboard/emergency"><ArrowRight size={17} /></Link>
        </section>
      </section>
    </div>
  )
}
