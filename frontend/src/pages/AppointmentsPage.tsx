import {
  AlertCircle,
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  Clock3,
  RotateCcw,
  XCircle,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { cancelAppointmentRequest, getPatientAppointments, type PatientAppointment } from '../api/client'
import { DirectoryState } from '../components/DirectoryState'
import { PageIntro } from '../components/PageIntro'

type AppointmentFilter = 'all' | 'requests' | 'upcoming' | 'history'

const appointmentFilters: Array<{ id: AppointmentFilter; label: string }> = [
  { id: 'all', label: 'All appointments' },
  { id: 'requests', label: 'Pending requests' },
  { id: 'upcoming', label: 'Upcoming' },
  { id: 'history', label: 'Past activity' },
]

function formatStatus(status: string): string {
  switch (status) {
    case 'requested':
      return 'Request pending'
    case 'confirmed':
      return 'Confirmed by provider'
    case 'cancelled':
      return 'Cancelled'
    case 'completed':
      return 'Completed'
    case 'no_show':
      return 'Marked no-show'
    default:
      return status.replaceAll('_', ' ')
  }
}

function formatDate(value: string): string {
  const date = new Date(value)
  return Number.isNaN(date.valueOf())
    ? 'Appointment date unavailable'
    : new Intl.DateTimeFormat(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(date)
}

function getStatusIcon(status: string) {
  if (status === 'confirmed' || status === 'completed') return CheckCircle2
  if (status === 'cancelled' || status === 'no_show') return XCircle
  return Clock3
}

export function AppointmentsPage() {
  const [retryCount, setRetryCount] = useState(0)
  const [selectedFilter, setSelectedFilter] = useState<AppointmentFilter>('all')
  const [loadState, setLoadState] = useState<{
    retryCount: number
    appointments: PatientAppointment[] | null
    error: string | null
    capturedAt: number
  } | null>(null)
  const [pendingCancellation, setPendingCancellation] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [actionMessage, setActionMessage] = useState<string | null>(null)
  const currentLoad = loadState?.retryCount === retryCount ? loadState : null
  const appointments = currentLoad?.appointments ?? null
  const error = currentLoad?.error ?? null
  const currentTime = currentLoad?.capturedAt ?? null

  useEffect(() => {
    const controller = new AbortController()
    getPatientAppointments(controller.signal)
      .then(({ data }) => setLoadState({
        retryCount,
        appointments: data,
        error: null,
        capturedAt: Date.now(),
      }))
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return
        setLoadState({
          retryCount,
          appointments: null,
          error: cause instanceof Error ? cause.message : 'Could not load your appointments.',
          capturedAt: Date.now(),
        })
      })
    return () => controller.abort()
  }, [retryCount])

  const pendingCount = appointments?.filter((appointment) => appointment.status === 'requested').length ?? 0
  const upcomingCount = appointments?.filter((appointment) =>
    currentTime !== null &&
    appointment.status === 'confirmed' &&
    Date.parse(appointment.startsAt) >= currentTime).length ?? 0
  const filteredAppointments = useMemo(() => {
    if (!appointments) return []
    return appointments.filter((appointment) => {
      const isFutureConfirmed = currentTime !== null &&
        appointment.status === 'confirmed' &&
        Date.parse(appointment.startsAt) >= currentTime
      if (selectedFilter === 'requests') return appointment.status === 'requested'
      if (selectedFilter === 'upcoming') return isFutureConfirmed
      if (selectedFilter === 'history') return appointment.status !== 'requested' && !isFutureConfirmed
      return true
    })
  }, [appointments, currentTime, selectedFilter])

  async function cancelRequestedAppointment(appointment: PatientAppointment) {
    if (!window.confirm('Cancel this pending appointment request?')) return
    setPendingCancellation(appointment.id)
    setActionError(null)
    setActionMessage(null)
    try {
      await cancelAppointmentRequest(appointment.id)
      setLoadState((current) => current?.retryCount === retryCount
        ? {
          ...current,
          appointments: current.appointments?.map((item) =>
            item.id === appointment.id ? { ...item, status: 'cancelled' } : item,
          ) ?? null,
        }
        : current)
      setActionMessage('The pending appointment request was cancelled.')
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : 'Could not cancel this appointment request.')
    } finally {
      setPendingCancellation(null)
    }
  }

  return (
    <div className="appointments-page">
      <PageIntro
        description="Review appointment records linked to your account. Only a provider-confirmed status is shown as confirmed."
        eyebrow="Your care · Appointments"
        title="Appointments"
      />

      <section aria-label="Appointment request workflow" className="appointment-workflow-note">
        <span><AlertCircle aria-hidden="true" size={18} /></span>
        <div>
          <strong>Provider scheduling is not connected</strong>
          <p>CarePath can display existing appointment requests and let you cancel pending requests. New appointment booking and provider confirmation happen outside this application.</p>
        </div>
      </section>

      <section aria-label="Appointment overview" className="appointment-summary-grid">
        <article className="appointment-summary-card">
          <span className="appointment-summary-icon"><CalendarDays aria-hidden="true" size={19} /></span>
          <span><small>All records</small><strong>{appointments?.length ?? '—'}</strong></span>
        </article>
        <article className="appointment-summary-card">
          <span className="appointment-summary-icon appointment-summary-icon--pending"><Clock3 aria-hidden="true" size={19} /></span>
          <span><small>Pending requests</small><strong>{appointments ? pendingCount : '—'}</strong></span>
        </article>
        <article className="appointment-summary-card">
          <span className="appointment-summary-icon appointment-summary-icon--confirmed"><CheckCircle2 aria-hidden="true" size={19} /></span>
          <span><small>Upcoming · provider-confirmed</small><strong>{appointments && currentTime !== null ? upcomingCount : '—'}</strong></span>
        </article>
      </section>

      {actionError && <p className="auth-feedback auth-feedback--error" role="alert">{actionError}</p>}
      {actionMessage && <p className="appointment-success" role="status">{actionMessage}</p>}

      <section aria-labelledby="appointment-list-heading" className="appointment-list-panel">
        <div className="appointment-list-header">
          <div>
            <p className="dashboard-eyebrow">YOUR ACCOUNT RECORDS</p>
            <h2 id="appointment-list-heading">Appointment activity</h2>
          </div>
          <span className="appointment-record-count">
            {appointments ? `${filteredAppointments.length} shown` : 'Loading'}
          </span>
        </div>

        <div aria-label="Filter appointments" className="appointment-filters" role="group">
          {appointmentFilters.map((filter) => (
            <button
              aria-pressed={selectedFilter === filter.id}
              className={selectedFilter === filter.id ? 'is-selected' : ''}
              key={filter.id}
              onClick={() => setSelectedFilter(filter.id)}
              type="button"
            >
              {filter.label}
              {appointments && (
                <span>
                  {filter.id === 'all'
                    ? appointments.length
                    : filter.id === 'requests'
                      ? pendingCount
                      : filter.id === 'upcoming'
                        ? upcomingCount
                        : appointments.length - pendingCount - upcomingCount}
                </span>
              )}
            </button>
          ))}
        </div>

        {appointments === null && !error ? (
          <DirectoryState message="Loading appointment records associated with your account." title="Loading appointments" type="loading" />
        ) : error ? (
          <div className="appointment-state">
            <DirectoryState message={error} title="Could not load appointments" type="error" />
            <button className="glass-button glass-button-primary" onClick={() => setRetryCount((count) => count + 1)} type="button">
              <RotateCcw aria-hidden="true" size={15} /> Try again
            </button>
          </div>
        ) : filteredAppointments.length ? (
          <div className="appointment-record-list">
            {filteredAppointments.map((appointment) => {
              const StatusIcon = getStatusIcon(appointment.status)
              return (
                <article className="appointment-record" key={appointment.id}>
                  <span className={`appointment-record-icon appointment-record-icon--${appointment.status}`}>
                    <StatusIcon aria-hidden="true" size={19} />
                  </span>
                  <div className="appointment-record-main">
                    <div className="appointment-record-title-row">
                      <h3>{appointment.doctorName ?? appointment.hospitalName ?? 'Provider details unavailable'}</h3>
                      <span className={`appointment-status appointment-status--${appointment.status}`}>
                        <StatusIcon aria-hidden="true" size={13} />
                        {formatStatus(appointment.status)}
                      </span>
                    </div>
                    <p className="appointment-record-specialty">
                      {appointment.specialty ?? 'Specialty not listed'}
                      <span>·</span>
                      {appointment.mode.replaceAll('_', ' ')}
                    </p>
                    <p className="appointment-record-hospital">
                      {appointment.hospitalName
                        ? `${appointment.hospitalName}${appointment.city ? `, ${appointment.city}` : ''}`
                        : 'Verified hospital details are unavailable'}
                    </p>
                    <p className="appointment-record-date">
                      <CalendarDays aria-hidden="true" size={14} />{formatDate(appointment.startsAt)}
                    </p>
                    {appointment.status === 'requested' && (
                      <p className="appointment-request-explanation">
                        This is a request, not a confirmed appointment. Wait for provider confirmation.
                      </p>
                    )}
                  </div>
                  {appointment.status === 'requested' && (
                    <button
                      className="appointment-cancel-button"
                      disabled={pendingCancellation === appointment.id}
                      onClick={() => void cancelRequestedAppointment(appointment)}
                      type="button"
                    >
                      {pendingCancellation === appointment.id ? 'Cancelling…' : 'Cancel request'}
                    </button>
                  )}
                </article>
              )
            })}
          </div>
        ) : (
          <div className="appointment-filter-empty">
            <span><CalendarDays aria-hidden="true" size={21} /></span>
            <h3>
              {selectedFilter === 'requests'
                ? 'No pending appointment requests'
                : selectedFilter === 'upcoming'
                  ? 'No upcoming confirmed appointments'
                  : selectedFilter === 'history'
                    ? 'No past appointment activity'
                    : 'No appointments on record'}
            </h3>
            <p>
              {selectedFilter === 'all'
                ? 'Appointment records associated with your account will appear here. New requests and provider scheduling are not currently available in CarePath.'
                : 'No appointment records currently match this filter.'}
            </p>
            {selectedFilter !== 'all' && (
              <button onClick={() => setSelectedFilter('all')} type="button">View all records <ArrowRight aria-hidden="true" size={14} /></button>
            )}
          </div>
        )}
      </section>

      <p className="appointment-page-disclaimer">
        Appointment records are read from your authenticated account. CarePath does not provide medical advice or independently verify provider scheduling.
        {' '}<Link to="/dashboard/hospitals">Explore published hospitals <ArrowRight aria-hidden="true" size={13} /></Link>
      </p>
    </div>
  )
}
