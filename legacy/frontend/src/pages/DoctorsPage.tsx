import { ArrowRight, BadgeCheck, Building2, RotateCcw, Search, Stethoscope } from 'lucide-react'
import { useEffect, useState, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { getDoctors, type DoctorPage as DoctorPageResult } from '../api/client'
import { DirectoryState } from '../components/DirectoryState'
import { PageIntro } from '../components/PageIntro'
import { SpecialtyCard } from '../components/SpecialtyCard'
import { doctorSpecialties } from '../data/medicalSpecialties'

const pageSize = 20

function getOffset(value: string | null): number {
  const parsed = Number(value ?? 0)
  return Number.isSafeInteger(parsed) && parsed >= 0 && parsed <= 1_000_000 ? parsed : 0
}

type DoctorsPageProps = {
  basePath?: string
}

export function DoctorsPage({ basePath = '' }: DoctorsPageProps) {
  const [searchParams, setSearchParams] = useSearchParams()
  const [search, setSearch] = useState(searchParams.get('q') ?? '')
  const [specialty, setSpecialty] = useState(searchParams.get('specialty') ?? '')
  const [retryCount, setRetryCount] = useState(0)
  const [loadState, setLoadState] = useState<{
    queryKey: string
    result: DoctorPageResult | null
    error: string | null
  } | null>(null)

  const selectedSpecialty = searchParams.get('specialty') ?? ''
  const selectedQuery = searchParams.get('q') ?? ''
  const offset = getOffset(searchParams.get('offset'))
  const queryKey = new URLSearchParams({
    search: selectedQuery,
    specialty: selectedSpecialty,
    limit: String(pageSize),
    offset: String(offset),
  }).toString()
  const isLoading = loadState?.queryKey !== queryKey
  const result = isLoading ? null : loadState.result
  const error = isLoading ? null : loadState.error

  useEffect(() => {
    const controller = new AbortController()
    getDoctors({
      search: selectedQuery || undefined,
      specialty: selectedSpecialty || undefined,
      limit: pageSize,
      offset,
    }, controller.signal)
      .then((response) => setLoadState({ queryKey, result: response, error: null }))
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return
        setLoadState({
          queryKey,
          result: null,
          error: cause instanceof Error ? cause.message : 'Could not load verified doctor listings.',
        })
      })
    return () => controller.abort()
  }, [offset, queryKey, retryCount, selectedQuery, selectedSpecialty])

  function applySearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const next = new URLSearchParams()
    if (search.trim()) next.set('q', search.trim())
    if (specialty) next.set('specialty', specialty)
    setSearchParams(next)
  }

  function clearFilters() {
    setSearch('')
    setSpecialty('')
    setSearchParams(new URLSearchParams())
  }

  function updateOffset(value: number) {
    const next = new URLSearchParams(searchParams)
    if (value > 0) next.set('offset', String(value))
    else next.delete('offset')
    setSearchParams(next)
  }

  return (
    <section>
      <PageIntro
        description="Only verified doctor profiles linked to an active, verified hospital listing in Sonipat are shown."
        eyebrow="Doctor directory · Sonipat"
        title="Find a doctor"
      />

      <form
        className="glass-card grid gap-4 p-4 sm:grid-cols-[1fr_0.7fr_auto] sm:items-end sm:p-5"
        onSubmit={applySearch}
        role="search"
      >
        <label className="grid gap-1.5 text-xs font-medium text-ink-700">
          Search doctors
          <span className="flex min-h-11 items-center gap-2 rounded-xl border border-forest-900/10 bg-white/70 px-3">
            <Search aria-hidden="true" className="text-forest-700" size={17} />
            <input
              className="min-w-0 w-full bg-transparent text-sm outline-none placeholder:text-ink-500"
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Verified name or specialty"
              value={search}
            />
          </span>
        </label>
        <label className="grid gap-1.5 text-xs font-medium text-ink-700">
          Specialty
          <select
            className="min-h-11 rounded-xl border border-forest-900/10 bg-white/75 px-3 text-sm text-ink-900"
            onChange={(event) => setSpecialty(event.target.value)}
            value={specialty}
          >
            <option value="">All specialties</option>
            {doctorSpecialties.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
        </label>
        <div className="flex gap-2">
          <button className="glass-button glass-button-primary inline-flex flex-1" type="submit">Search</button>
          <button
            aria-label="Clear doctor search filters"
            className="grid size-11 shrink-0 place-items-center rounded-full border border-forest-900/12 text-forest-800 hover:bg-white/70"
            onClick={clearFilters}
            title="Clear filters"
            type="button"
          >
            <RotateCcw aria-hidden="true" size={16} />
          </button>
        </div>
      </form>

      <section aria-labelledby="specialty-options-heading" className="mt-7">
        <h2 className="mb-3 text-lg font-semibold text-forest-950" id="specialty-options-heading">Browse specialties</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {doctorSpecialties.map((item) => (
            <SpecialtyCard
              description="General category · provider results require verified records"
              icon="stethoscope"
              key={item}
              name={item}
              basePath={basePath}
            />
          ))}
        </div>
      </section>

      <section aria-labelledby="doctor-results-heading" className="mt-8">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Stethoscope aria-hidden="true" className="text-forest-700" size={18} />
            <h2 className="text-lg font-semibold text-forest-950" id="doctor-results-heading">
              {selectedSpecialty || selectedQuery
                ? `Verified results${selectedSpecialty ? ` · ${selectedSpecialty}` : ` · “${selectedQuery}”`}`
                : 'Verified doctors'}
            </h2>
          </div>
          {result && <p aria-live="polite" className="text-sm text-ink-600">{result.pagination.total} results</p>}
        </div>
        {isLoading ? (
          <DirectoryState message="Loading verified doctor records." title="Loading doctors" type="loading" />
        ) : error ? (
          <div className="space-y-3">
            <DirectoryState message={error} title="Could not load doctors" type="error" />
            <button className="glass-button glass-button-primary" onClick={() => setRetryCount((count) => count + 1)} type="button">
              Try again
            </button>
          </div>
        ) : result?.data.length ? (
          <>
            <div className="grid gap-3 lg:grid-cols-2">
              {result.data.map((doctor) => (
                <article className="glass-card glass-card--interactive p-5" key={`${doctor.id}:${doctor.hospitalId}`}>
                  <div className="flex items-start gap-3">
                    <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-sage-100 text-forest-800">
                      <Stethoscope aria-hidden="true" size={19} />
                    </span>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-semibold text-forest-950">{doctor.name}</h3>
                        <span className="inline-flex items-center gap-1 rounded-full bg-sage-100 px-2 py-1 text-[11px] font-medium text-forest-800">
                          <BadgeCheck aria-hidden="true" size={13} /> Verified
                        </span>
                      </div>
                      <p className="mt-1 text-sm text-ink-700">{doctor.specialty}</p>
                      <Link className="mt-2 inline-flex items-center gap-1 text-sm font-medium text-forest-800 underline underline-offset-2" to={`${basePath}/hospitals/${encodeURIComponent(doctor.hospitalId)}`}>
                        <Building2 aria-hidden="true" size={14} />
                        {doctor.hospitalName}, {doctor.city}
                        <ArrowRight aria-hidden="true" size={14} />
                      </Link>
                      <Link
                        className="doctor-profile-link"
                        to={`${basePath}/doctors/${encodeURIComponent(doctor.id)}?specialty=${encodeURIComponent(selectedSpecialty || doctor.specialty)}`}
                      >
                        View verified profile <ArrowRight aria-hidden="true" size={14} />
                      </Link>
                    </div>
                  </div>
                </article>
              ))}
            </div>
            {result.pagination.total > pageSize && (
              <nav aria-label="Doctor directory pages" className="mt-6 flex flex-wrap items-center justify-center gap-3">
                <button className="glass-button" disabled={offset === 0} onClick={() => updateOffset(Math.max(0, offset - pageSize))} type="button">Previous</button>
                <span className="text-sm text-ink-600">
                  Showing {offset + 1}–{Math.min(offset + result.data.length, result.pagination.total)} of {result.pagination.total}
                </span>
                <button className="glass-button" disabled={offset + pageSize >= result.pagination.total} onClick={() => updateOffset(offset + pageSize)} type="button">Next</button>
              </nav>
            )}
          </>
        ) : (
          <DirectoryState
            message="No current verified doctor profiles match this search. Unverified records are not shown."
            title="No verified doctors available"
            type="empty"
          />
        )}
      </section>
    </section>
  )
}
