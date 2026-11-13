import { MapPin, RotateCcw, Search } from 'lucide-react'
import { useEffect, useState, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { getHospitals, type HospitalPage as HospitalPageResult } from '../api/client'
import { DirectoryState } from '../components/DirectoryState'
import { HospitalCard } from '../components/HospitalCard'
import { PageIntro } from '../components/PageIntro'
import { matchConcernToSpecialty } from '../data/symptomMatching'

const pageSize = 20

function getOffset(value: string | null): number {
  const parsed = Number(value ?? 0)
  return Number.isSafeInteger(parsed) && parsed >= 0 && parsed <= 1_000_000
    ? parsed
    : 0
}

type HospitalsPageProps = {
  basePath?: string
}

export function HospitalsPage({ basePath = '' }: HospitalsPageProps) {
  const [searchParams, setSearchParams] = useSearchParams()
  const [loadState, setLoadState] = useState<{
    queryKey: string
    result: HospitalPageResult | null
    error: string | null
  } | null>(null)
  const [retryCount, setRetryCount] = useState(0)
  const search = searchParams.get('q') ?? ''
  const [searchText, setSearchText] = useState(() => search)
  const [concernPrompt, setConcernPrompt] = useState(false)
  const specialty = searchParams.get('specialty') ?? ''
  const facilityType = searchParams.get('type') ?? ''
  const city = 'Sonipat'
  const offset = getOffset(searchParams.get('offset'))
  const concernMatch = matchConcernToSpecialty(search)
  const searchIsConcern = Boolean(search.trim() && (concernMatch.specialty || concernMatch.urgent))
  const apiQuery = new URLSearchParams()

  if (search.trim() && !searchIsConcern) apiQuery.set('search', search.trim())
  if (specialty.trim()) apiQuery.set('specialty', specialty.trim())
  if (facilityType.trim()) apiQuery.set('facilityType', facilityType.trim())
  apiQuery.set('city', city)
  apiQuery.set('limit', String(pageSize))
  apiQuery.set('offset', String(offset))
  const queryKey = apiQuery.toString()
  const isLoading = loadState?.queryKey !== queryKey
  const result = isLoading ? null : loadState.result
  const error = isLoading ? null : loadState.error

  useEffect(() => {
    if (!searchIsConcern) return
    const next = new URLSearchParams(searchParams)
    next.delete('q')
    next.delete('offset')
    setSearchParams(next, { replace: true })
  }, [searchIsConcern, searchParams, setSearchParams])

  useEffect(() => {
    const controller = new AbortController()

    getHospitals(
      {
        search: searchIsConcern ? undefined : search.trim() || undefined,
        specialty: specialty.trim() || undefined,
        facilityType: facilityType.trim() || undefined,
        city,
        limit: pageSize,
        offset,
      },
      controller.signal,
    )
      .then((response) => {
        setLoadState({ queryKey, result: response, error: null })
      })
      .catch((requestError: unknown) => {
        if (controller.signal.aborted) return
        setLoadState({
          queryKey,
          result: null,
          error: requestError instanceof Error
            ? requestError.message
            : 'Could not load hospital listings. Please try again.',
        })
      })

    return () => controller.abort()
  }, [city, facilityType, offset, queryKey, retryCount, search, searchIsConcern, specialty])

  function updateFilter(key: 'specialty' | 'type', value: string) {
    const next = new URLSearchParams(searchParams)
    if (value.trim()) next.set(key, value.trim())
    else next.delete(key)
    next.delete('offset')
    setSearchParams(next, { replace: true })
  }

  function updateSearch(value: string) {
    const next = new URLSearchParams(searchParams)
    if (value.trim()) next.set('q', value.trim())
    else next.delete('q')
    next.delete('offset')
    setSearchParams(next, { replace: true })
  }

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const match = matchConcernToSpecialty(searchText)
    if (match.specialty || match.urgent) {
      setConcernPrompt(true)
      const next = new URLSearchParams(searchParams)
      next.delete('q')
      next.delete('offset')
      setSearchParams(next, { replace: true })
      return
    }
    setConcernPrompt(false)
    updateSearch(searchText)
  }

  function clearFilters() {
    setSearchText('')
    setConcernPrompt(false)
    const next = new URLSearchParams()
    next.set('city', city)
    setSearchParams(next)
  }

  function updateOffset(value: number) {
    const next = new URLSearchParams(searchParams)
    if (value > 0) next.set('offset', String(value))
    else next.delete('offset')
    setSearchParams(next)
  }

  return (
    <section className="dashboard-page">
      <div className="mx-auto max-w-7xl px-5 py-10 sm:px-8 sm:py-14">
        <PageIntro
          description="Search published, verified listings across Sonipat by hospital name, address or locality, facility type, and verified services where available."
          eyebrow="Hospital directory"
          title="Find a hospital"
        />

        <div className="glass-card mb-6 grid gap-4 p-4 sm:p-5 lg:grid-cols-[minmax(220px,1.3fr)_repeat(3,minmax(140px,1fr))]">
          <form className="flex min-h-11 items-center gap-2 rounded-xl border border-forest-900/10 bg-white/70 px-3" onSubmit={submitSearch} role="search">
            <label className="flex min-w-0 flex-1 items-center gap-3">
              <Search aria-hidden="true" className="shrink-0 text-forest-700" size={18} />
              <span className="sr-only">Search hospitals by name or public listing detail</span>
              <input
                className="min-w-0 w-full bg-transparent text-sm outline-none placeholder:text-ink-500"
                onChange={(event) => {
                  setSearchText(event.target.value)
                  setConcernPrompt(false)
                }}
                placeholder="Hospital name, address or facility type"
                value={searchText}
              />
            </label>
            <button className="text-sm font-semibold text-forest-800" type="submit">Search</button>
          </form>

          <label className="grid gap-1 text-xs font-medium text-ink-700">
            Specialty
            <input
              className="min-h-11 rounded-xl border border-forest-900/10 bg-white/75 px-3 text-sm text-ink-900"
              onChange={(event) => updateFilter('specialty', event.target.value)}
              placeholder="Any verified service"
              value={specialty}
            />
          </label>

          <label className="grid gap-1 text-xs font-medium text-ink-700">
            Facility type
            <input
              className="min-h-11 rounded-xl border border-forest-900/10 bg-white/75 px-3 text-sm text-ink-900"
              onChange={(event) => updateFilter('type', event.target.value)}
              placeholder="Any facility type"
              value={facilityType}
            />
          </label>
          <div className="hospital-location-filter">
            <span className="hospital-filter-label">Location</span>
            <span className="hospital-location-value">
              <MapPin aria-hidden="true" size={16} />
              <span>Sonipat, Haryana</span>
              <span className="hospital-location-scope">Current service area</span>
            </span>
          </div>
        </div>

        {concernPrompt && (
          <div className="mb-5 rounded-xl border border-forest-900/10 bg-white/75 p-4" role="status">
            <p className="text-sm leading-6 text-ink-700">
              This looks like a health concern, not a hospital name. Hospital results were not searched with it.
              Use the limited, on-device care guide to find a possible specialty; it does not diagnose.
            </p>
            <Link className="mt-2 inline-flex font-semibold text-forest-800 underline underline-offset-2" to={`${basePath}/assistant`}>
              Open the care guide
            </Link>
          </div>
        )}

        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <p aria-live="polite" className="text-sm text-ink-600">
            {isLoading
              ? 'Loading hospital listings…'
              : result
                ? `${result.pagination.total} ${result.pagination.total === 1 ? 'result' : 'results'}`
                : 'Hospital listings unavailable'}
            {' · Sonipat, Haryana'}
          </p>
          <button
            className="inline-flex min-h-10 items-center gap-2 rounded-full border border-forest-900/12 px-4 text-sm font-medium text-forest-800 transition hover:bg-white/70"
            onClick={clearFilters}
            type="button"
          >
            <RotateCcw aria-hidden="true" size={15} />
            Clear filters
          </button>
        </div>

        <p className="mb-5 rounded-xl border border-forest-900/10 bg-white/55 px-4 py-3 text-xs leading-5 text-ink-600">
          Only published, verified public listing fields are shown. Search matches hospital details,
          not symptoms. Use the Care guide for limited on-device specialty matching; it is not a
          diagnosis, and hospital listings do not imply a doctor or appointment is available.
        </p>

        {isLoading ? (
          <DirectoryState
            message="Please wait while published hospital listings load."
            title="Loading hospitals"
            type="loading"
          />
        ) : error ? (
          <div className="space-y-4">
            <DirectoryState message={error} title="Could not load hospitals" type="error" />
            <div className="text-center">
              <button
                className="glass-button glass-button-primary"
                onClick={() => setRetryCount((count) => count + 1)}
                type="button"
              >
                Try again
              </button>
            </div>
          </div>
        ) : result?.data.length ? (
          <>
            <div className="grid gap-4 lg:grid-cols-2">
              {result.data.map((hospital) => (
                <HospitalCard
                  hospital={hospital}
                  key={hospital.id}
                  searchParams={searchParams}
                  basePath={basePath}
                />
              ))}
            </div>
            {result.pagination.total > pageSize ? (
              <nav
                aria-label="Hospital directory pages"
                className="mt-7 flex flex-wrap items-center justify-center gap-3"
              >
                <button
                  className="glass-button"
                  disabled={offset === 0}
                  onClick={() => updateOffset(Math.max(0, offset - pageSize))}
                  type="button"
                >
                  Previous
                </button>
                <span className="text-sm text-ink-600">
                  Showing {offset + 1}–{Math.min(offset + result.data.length, result.pagination.total)} of {result.pagination.total}
                </span>
                <button
                  className="glass-button"
                  disabled={offset + pageSize >= result.pagination.total}
                  onClick={() => updateOffset(offset + pageSize)}
                  type="button"
                >
                  Next
                </button>
              </nav>
            ) : null}
          </>
        ) : (
          <DirectoryState
            message="No published hospitals in Sonipat match these filters. Draft and unverified hospitals are not shown."
            title="No matching hospitals"
            type="empty"
          />
        )}

        <p className="mt-8 text-center text-sm text-ink-600">
          Looking for a doctor instead?{' '}
          <Link className="font-semibold text-forest-800 underline underline-offset-4" to={`${basePath}/doctors`}>
            Browse doctor specialties
          </Link>
        </p>
      </div>
    </section>
  )
}
