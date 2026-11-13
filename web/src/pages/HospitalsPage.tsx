import { List, Map as MapIcon, Search } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { HospitalCard } from '../components/HospitalCard'
import { MapView, type MapMarker } from '../components/MapView'
import { Empty, ErrorNote, Spinner } from '../components/ui'
import { qs, type Hospital } from '../lib/api'
import { cx } from '../lib/format'
import { useApi, useLocation, useMeta } from '../lib/hooks'

export function HospitalsPage() {
  const meta = useMeta()
  const loc = useLocation()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const [view, setView] = useState<'list' | 'map'>('list')
  const [q, setQ] = useState(params.get('q') ?? '')
  const specialty = params.get('specialty') ?? ''
  const pmjay = params.get('pmjay') === 'true'
  const ownership = params.get('ownership') ?? ''
  const includeClinics = params.get('clinics') === 'true'

  const set = (key: string, value: string | null) => {
    const next = new URLSearchParams(params)
    if (value) next.set(key, value)
    else next.delete(key)
    setParams(next, { replace: true })
  }

  const path = `/hospitals${qs({
    q: params.get('q'), specialty, pmjay: pmjay || undefined, ownership,
    lat: loc.coords?.lat.toFixed(4), lng: loc.coords?.lng.toFixed(4),
  })}`
  const { data, loading, error, reload } = useApi<{ total: number; data: Hospital[] }>(path)
  const list = useMemo(
    () => (data?.data ?? []).filter((h) => includeClinics || !['clinic', 'dispensary'].includes(h.facilityType)),
    [data, includeClinics],
  )
  const markers: MapMarker[] = list.filter((h) => h.location).slice(0, 150).map((h) => ({
    id: h.id, kind: 'hospital', position: h.location!, onClick: () => navigate(`/hospitals/${encodeURIComponent(h.id)}`),
  }))
  if (loc.coords) markers.push({ id: 'you', kind: 'you', position: loc.coords })

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold">Hospitals in Sonipat</h1>
        <p className="text-sm text-ink-2">Government and private facilities, nearest first when location is on.</p>
      </div>

      <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); set('q', q.trim() || null) }}>
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-3" aria-hidden />
          <label htmlFor="hq" className="sr-only">Search by name or area</label>
          <input id="hq" className="input pl-9" placeholder="Search by name or area" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <button className="btn-primary">Search</button>
      </form>

      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor="spec" className="sr-only">Specialty</label>
        <select id="spec" className="input w-auto py-2" value={specialty} onChange={(e) => set('specialty', e.target.value || null)}>
          <option value="">All specialties</option>
          {meta?.specialties.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
        </select>
        <label htmlFor="own" className="sr-only">Ownership</label>
        <select id="own" className="input w-auto py-2" value={ownership} onChange={(e) => set('ownership', e.target.value || null)}>
          <option value="">Govt & private</option>
          <option value="public">Government</option>
          <option value="private">Private</option>
        </select>
        <Toggle on={pmjay} onClick={() => set('pmjay', pmjay ? null : 'true')}>Ayushman cashless</Toggle>
        <Toggle on={includeClinics} onClick={() => set('clinics', includeClinics ? null : 'true')}>Include clinics</Toggle>
        <div className="ml-auto flex rounded-xl border border-line bg-surface p-0.5" role="group" aria-label="View">
          <button className={cx('rounded-lg p-1.5', view === 'list' && 'bg-brand-soft text-brand')} onClick={() => setView('list')} aria-pressed={view === 'list'} aria-label="List view"><List className="size-4" /></button>
          <button className={cx('rounded-lg p-1.5', view === 'map' && 'bg-brand-soft text-brand')} onClick={() => setView('map')} aria-pressed={view === 'map'} aria-label="Map view"><MapIcon className="size-4" /></button>
        </div>
      </div>

      {error && <ErrorNote onRetry={reload}>{error}</ErrorNote>}
      {loading && !data && <Spinner />}
      {data && (
        <>
          <p className="text-xs text-ink-3">{list.length} result{list.length === 1 ? '' : 's'}</p>
          {view === 'map'
            ? <MapView className="h-[65vh]" markers={markers} fit={loc.coords ? [loc.coords, ...markers.slice(0, 8).map((m) => m.position)] : undefined} />
            : list.length === 0
              ? <Empty title="No matches">Try removing a filter.</Empty>
              : <div className="grid gap-2.5 md:grid-cols-2">{list.slice(0, 120).map((h) => <HospitalCard key={h.id} hospital={h} />)}</div>}
        </>
      )}
      {meta && <p className="pt-2 text-[11px] text-ink-3">{meta.attribution}</p>}
    </div>
  )
}

function Toggle({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={on}
      className={cx('rounded-xl border px-3 py-2 text-sm font-medium', on ? 'border-brand bg-brand-soft text-brand' : 'border-line bg-surface text-ink-2')}>
      {children}
    </button>
  )
}
