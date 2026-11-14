import { CalendarDays } from 'lucide-react'
import { Link } from 'react-router'
import { CallButton, Empty, ErrorNote, Spinner } from '../components/ui'
import { api, type Appointment } from '../lib/api'
import { cx, date } from '../lib/format'
import { useApi } from '../lib/hooks'

const STATUS: Record<Appointment['status'], { label: string; cls: string }> = {
  requested: { label: 'Waiting for hospital', cls: 'bg-amber-soft text-amber' },
  confirmed: { label: 'Confirmed', cls: 'bg-brand-soft text-brand' },
  declined: { label: 'Declined', cls: 'bg-sos-soft text-sos-dark' },
  cancelled: { label: 'Cancelled', cls: 'bg-canvas text-ink-3' },
}

export function AppointmentsPage() {
  const { data, error, loading, reload } = useApi<{ data: Appointment[] }>('/appointments')

  async function cancel(id: string) {
    if (!confirm('Cancel this appointment request?')) return
    await api.post(`/appointments/${id}/cancel`)
    reload()
  }

  return (
    <div className="mx-auto max-w-xl space-y-4">
      <div>
        <h1 className="text-xl font-bold">Appointments</h1>
        <p className="text-sm text-ink-2">Request a visit from any hospital's page. Hospitals on CarePath confirm a time here.</p>
      </div>
      {error && <ErrorNote onRetry={reload}>{error}</ErrorNote>}
      {loading && !data && <Spinner />}
      {data && data.data.length === 0 && (
        <Empty title="No appointments yet"><Link to="/hospitals" className="font-medium text-brand underline">Find a hospital</Link> or ask the <Link to="/assistant" className="font-medium text-brand underline">care guide</Link>.</Empty>
      )}
      {data?.data.map((a) => (
        <article key={a.id} className="card space-y-2 p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <Link to={`/hospitals/${encodeURIComponent(a.hospitalId)}`} className="font-semibold hover:text-brand">{a.hospitalName}</Link>
              <p className="text-sm text-ink-2">{a.department} · for {a.patientName}</p>
            </div>
            <span className={cx('chip shrink-0', STATUS[a.status].cls)}>{STATUS[a.status].label}</span>
          </div>
          <p className="flex items-center gap-2 text-sm">
            <CalendarDays className="size-4 text-ink-3" aria-hidden />
            {a.status === 'confirmed' && a.confirmedFor
              ? <b>{new Date(a.confirmedFor.replace(' ', 'T')).toLocaleString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}</b>
              : <span>Requested {date(a.preferredDate)}, {a.preferredSlot}</span>}
          </p>
          {a.hospitalNote && <p className="rounded-lg bg-canvas p-2 text-sm text-ink-2">Hospital: {a.hospitalNote}</p>}
          {['requested', 'confirmed'].includes(a.status) && (
            <div className="flex gap-2 pt-1">
              <CallButton phone={a.hospitalPhone} />
              <button className="btn-ghost text-sos-dark" onClick={() => void cancel(a.id)}>Cancel</button>
            </div>
          )}
        </article>
      ))}
    </div>
  )
}
