import { List, Map as MapIcon, Search } from 'lucide-react'
import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router'
import { HospitalCard } from '../components/HospitalCard'
import { MapView, type MapMarker } from '../components/MapView'
import { CallButton, Empty, ErrorNote, PageHeader, Spinner } from '../components/ui'
import { qs, type Hospital } from '../lib/api'
import { cx, km } from '../lib/format'
import { useApi, useLocation, useMeta } from '../lib/hooks'

const QUICK = [
  { key: '', label: 'All' },
  { key: 'emergency', label: 'Emergency' },
  { key: 'paediatrics', label: 'Child care' },
  { key: 'maternity', label: 'Maternity' },
  { key: 'ophthalmology', label: 'Eyes' },
  { key: 'cardiology', label: 'Heart' },
  { key: 'orthopaedics', label: 'Bones & joints' },
]

export function HospitalsPage() {
  const meta = useMeta()
  const loc = useLocation()
  const [params, setParams] = useSearchParams()
  const [q, setQ] = useState(params.get('q') ?? '')
  const [view, setView] = useState<'list' | 'map'>('list')
  const [selectedId, setSelectedId] = useState<string | null>(null)
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
  const submit = (e: FormEvent) => { e.preventDefault(); set('q', q.trim() || null) }

  const path = `/hospitals${qs({ q: params.get('q'), specialty, pmjay: pmjay || undefined, ownership, lat: loc.coords?.lat.toFixed(4), lng: loc.coords?.lng.toFixed(4) })}`
  const { data, loading, error, reload } = useApi<{ total: number; data: Hospital[] }>(path)
  const list = useMemo(() => (data?.data ?? []).filter((h) => includeClinics || !['clinic', 'dispensary'].includes(h.facilityType)), [data, includeClinics])
  const selected = list.find((h) => h.id === selectedId) ?? list.find((h) => h.location) ?? null
  useEffect(() => { setSelectedId(null) }, [path])

  const markers: MapMarker[] = list.filter((h) => h.location).slice(0, 150).map((h) => ({
    id: h.id, kind: 'hospital', position: h.location!, selected: h.id === selected?.id, onClick: () => setSelectedId(h.id),
  }))
  if (loc.coords) markers.push({ id: 'you', kind: 'you', position: loc.coords })
  const fit = selected?.location ? [selected.location, ...(loc.coords ? [loc.coords] : [])] : markers.slice(0, 10).map((m) => m.position)

  const chipQuick = QUICK.some((c) => c.key === specialty)
  return (
    <>
      <PageHeader title="Find a hospital" subtitle={`${data?.total ?? '…'} facilities across Sonipat${loc.coords ? ' · sorted by distance from you' : ''}`}>
        <form onSubmit={submit} className="relative min-w-[260px] flex-[0_1_420px]">
          <Search className="pointer-events-none absolute top-1/2 left-4 size-[18px] -translate-y-1/2 text-ink-3" aria-hidden />
          <label htmlFor="hq" className="sr-only">Search by name or place</label>
          <input id="hq" className="input pl-11" placeholder="Search by name or town" value={q} onChange={(e) => setQ(e.target.value)} />
        </form>
      </PageHeader>

      <div className="glass fu d1 flex flex-wrap items-center gap-2.5 rounded-[22px] p-3.5">
        {QUICK.map((c) => (
          <button key={c.label} onClick={() => set('specialty', c.key || null)} aria-pressed={specialty === c.key}
            className={cx('min-h-10 rounded-full border px-4 text-sm font-semibold transition',
              specialty === c.key ? 'border-transparent text-on-mint' : 'border-line bg-fill text-ink-2 hover:bg-fill-2')}
            style={specialty === c.key ? { background: 'linear-gradient(135deg,#ccfbf1,#5eead4)' } : undefined}>{c.label}</button>
        ))}
        <label htmlFor="spec" className="sr-only">More specialties</label>
        <select id="spec" className="input min-h-10 w-auto rounded-full py-0" value={chipQuick ? '' : specialty} onChange={(e) => set('specialty', e.target.value || null)}>
          <option value="">More…</option>
          {meta?.specialties.filter((s) => !QUICK.some((c) => c.key === s.key)).map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
        </select>
        <span className="flex-1" />
        <label htmlFor="own" className="sr-only">Ownership</label>
        <select id="own" className="input min-h-10 w-auto rounded-full py-0" value={ownership} onChange={(e) => set('ownership', e.target.value || null)}>
          <option value="">Govt & private</option><option value="public">Government</option><option value="private">Private</option>
        </select>
        <label className="inline-flex min-h-10 items-center gap-2 px-2 text-sm font-medium"><input type="checkbox" className="size-[18px] accent-brand-2" checked={pmjay} onChange={() => set('pmjay', pmjay ? null : 'true')} /> Ayushman only</label>
        <label className="inline-flex min-h-10 items-center gap-2 px-2 text-sm font-medium"><input type="checkbox" className="size-[18px] accent-brand-2" checked={includeClinics} onChange={() => set('clinics', includeClinics ? null : 'true')} /> Clinics</label>
        <div className="flex rounded-full border border-line p-0.5 lg:hidden" role="group" aria-label="View">
          <button className={cx('rounded-full p-2', view === 'list' && 'bg-fill-2')} onClick={() => setView('list')} aria-pressed={view === 'list'} aria-label="List view"><List className="size-4" /></button>
          <button className={cx('rounded-full p-2', view === 'map' && 'bg-fill-2')} onClick={() => setView('map')} aria-pressed={view === 'map'} aria-label="Map view"><MapIcon className="size-4" /></button>
        </div>
      </div>

      {error && <ErrorNote onRetry={reload}>{error}</ErrorNote>}
      {loading && !data && <Spinner />}
      {data && (
        <div className="flex flex-wrap items-start gap-5">
          <div className={cx('min-w-0 flex-[1_1_400px] flex-col gap-3', view === 'map' ? 'hidden lg:flex' : 'flex')}>
            <p className="text-xs text-ink-3">{list.length} result{list.length === 1 ? '' : 's'}</p>
            {list.length === 0 && <Empty title="No matches">Try removing a filter.</Empty>}
            {list.slice(0, 120).map((h) => (
              <div key={h.id}>
                <div className="hidden lg:block"><HospitalCard hospital={h} onSelect={() => setSelectedId(h.id)} selected={h.id === selected?.id} /></div>
                <div className="lg:hidden"><HospitalCard hospital={h} /></div>
              </div>
            ))}
          </div>

          <section aria-label="Map" className={cx('glass fu d2 relative min-w-0 flex-[1_1_400px] overflow-hidden rounded-[28px] p-3 lg:sticky lg:top-6', view === 'list' ? 'hidden lg:block' : 'block')}>
            <MapView className="h-[62vh] min-h-[420px]" markers={markers} fit={fit} />
            {selected && (
              <div className="glass absolute inset-x-6.5 bottom-12 z-[500] flex flex-wrap items-center gap-3.5 rounded-[20px] p-4">
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-bold">{selected.name}</span>
                  <span className="block text-[13px] text-ink-2">{[selected.distanceKm !== null ? km(selected.distanceKm) : null, selected.emergency24x7 ? 'Open 24×7' : selected.facilityTypeLabel].filter(Boolean).join(' · ')}</span>
                </span>
                <CallButton phone={selected.phone} />
                <Link to={`/app/hospitals/${encodeURIComponent(selected.id)}`} className="btn-secondary">Details</Link>
                <Link to={`/app/appointments?hospital=${encodeURIComponent(selected.id)}`} className="btn-primary">Book visit</Link>
              </div>
            )}
            <p className="mx-1.5 mt-2.5 mb-0.5 text-xs text-ink-3">{meta?.attribution ?? 'Map data © OpenStreetMap contributors'}</p>
          </section>
        </div>
      )}
    </>
  )
}
