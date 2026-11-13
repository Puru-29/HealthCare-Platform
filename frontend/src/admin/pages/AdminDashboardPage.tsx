import { useEffect, useState } from 'react'
import { Ambulance, ArrowRight, Building2, ClipboardList, Plus } from 'lucide-react'
import { Link } from 'react-router-dom'
import { DirectoryState } from '../../components/DirectoryState'
import { PageIntro } from '../../components/PageIntro'
import { getAdminOverview } from '../api'

type Overview = Record<string, Array<{ status: string; total: number }>>

function total(items: Array<{ status: string; total: number }> | undefined) {
  return items?.reduce((sum, item) => sum + item.total, 0) ?? 0
}

export function AdminDashboardPage() {
  const [overview, setOverview] = useState<Overview | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const controller = new AbortController()
    getAdminOverview(controller.signal)
      .then((result) => setOverview(result.data))
      .catch((cause: unknown) => {
        if (cause instanceof DOMException && cause.name === 'AbortError') return
        setError(cause instanceof Error ? cause.message : 'Unable to load admin overview.')
      })
      .finally(() => setLoading(false))
    return () => controller.abort()
  }, [])

  if (loading) return <DirectoryState message="Loading current database totals." title="Loading admin overview" type="loading" />
  if (error || !overview) return <DirectoryState message={error || 'Admin overview is unavailable.'} title="Could not load overview" type="error" />

  const cards = [
    { title: 'Hospitals', count: total(overview.hospitals), icon: Building2, to: '/admin/hospitals', hint: overview.hospitals.map(({ status, total: amount }) => `${status}: ${amount}`).join(' · ') || 'No hospital records' },
    { title: 'Ambulance providers', count: total(overview.providers), icon: Ambulance, to: '/admin/ambulance', hint: overview.providers.map(({ status, total: amount }) => `${status}: ${amount}`).join(' · ') || 'No provider records' },
    { title: 'Vehicles', count: total(overview.vehicles), icon: Ambulance, to: '/admin/ambulance', hint: overview.vehicles.map(({ status, total: amount }) => `${status}: ${amount}`).join(' · ') || 'No vehicle records' },
    { title: 'Ambulance requests', count: total(overview.ambulanceRequests), icon: ClipboardList, to: '/admin/ambulance', hint: overview.ambulanceRequests.map(({ status, total: amount }) => `${status}: ${amount}`).join(' · ') || 'No request records' },
  ]

  return (
    <>
      <PageIntro description="Manage published directory information and ambulance provider records already stored in the platform database." eyebrow="Operations" title="Admin overview" />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map(({ title, count, icon: Icon, to, hint }) => (
          <Link className="glass-card group p-5 transition hover:-translate-y-0.5" key={title} to={to}>
            <div className="flex items-start justify-between">
              <span className="grid size-11 place-items-center rounded-2xl bg-sage-100 text-forest-800"><Icon size={20} /></span>
              <ArrowRight className="text-ink-400 transition group-hover:translate-x-1 group-hover:text-forest-700" size={18} />
            </div>
            <p className="mt-5 text-sm font-medium text-ink-600">{title}</p>
            <p className="mt-1 text-3xl font-semibold tracking-tight text-forest-950">{count}</p>
            <p className="mt-2 min-h-10 text-xs leading-5 text-ink-500">{hint}</p>
          </Link>
        ))}
      </div>
      <section className="glass-card mt-6 p-5 sm:p-7">
        <h2 className="text-lg font-semibold text-forest-950">Management shortcuts</h2>
        <p className="mt-1 text-sm text-ink-600">Create records only after verifying their source details.</p>
        <div className="mt-5 flex flex-wrap gap-3">
          <Link className="glass-button glass-button-primary inline-flex" to="/admin/hospitals/new"><Plus size={16} /> Add hospital</Link>
          <Link className="glass-button inline-flex" to="/admin/ambulance"><Ambulance size={16} /> Manage ambulance data</Link>
        </div>
      </section>
    </>
  )
}
