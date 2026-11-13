import { AlertCircle, ArrowRight, Building2, RotateCcw, Search, ShieldCheck } from 'lucide-react'
import { useEffect, useState, type FormEvent } from 'react'
import { Link, useLocation, useSearchParams } from 'react-router-dom'
import { getInsuranceNetworks, type InsuranceNetworkPage } from '../api/client'
import { DirectoryState } from '../components/DirectoryState'
import { GlassCard } from '../components/GlassCard'
import { PageIntro } from '../components/PageIntro'

const pageSize = 20

function readOffset(value: string | null): number {
  const offset = Number(value ?? 0)
  return Number.isSafeInteger(offset) && offset >= 0 && offset <= 1_000_000 ? offset : 0
}

export function InsuranceAssistantPage() {
  const { pathname } = useLocation()
  const basePath = pathname.startsWith('/dashboard/') ? '/dashboard' : ''
  const [searchParams, setSearchParams] = useSearchParams()
  const search = searchParams.get('q') ?? ''
  const searchField = searchParams.get('field') ?? 'all'
  const normalizedSearchField: 'all' | 'provider' | 'plan' | 'hospital' =
    searchField === 'provider' || searchField === 'plan' || searchField === 'hospital' ? searchField : 'all'
  const [searchText, setSearchText] = useState(search)
  const [selectedField, setSelectedField] = useState(normalizedSearchField)
  const offset = readOffset(searchParams.get('offset'))
  const queryKey = new URLSearchParams({
    search,
    field: normalizedSearchField,
    limit: String(pageSize),
    offset: String(offset),
  }).toString()
  const [loadState, setLoadState] = useState<{
    queryKey: string
    result: InsuranceNetworkPage | null
    error: string | null
  } | null>(null)
  const [retryCount, setRetryCount] = useState(0)
  const isLoading = loadState?.queryKey !== queryKey
  const result = isLoading ? null : loadState.result
  const error = isLoading ? null : loadState.error

  useEffect(() => {
    const controller = new AbortController()
    getInsuranceNetworks({
      search: search || undefined,
      searchField: normalizedSearchField,
      limit: pageSize,
      offset,
    }, controller.signal)
      .then((response) => setLoadState({ queryKey, result: response, error: null }))
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return
        setLoadState({
          queryKey,
          result: null,
          error: cause instanceof Error ? cause.message : 'Could not load insurer network records.',
        })
      })
    return () => controller.abort()
  }, [normalizedSearchField, offset, queryKey, retryCount, search])

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const next = new URLSearchParams()
    if (searchText.trim()) next.set('q', searchText.trim())
    if (selectedField !== 'all') next.set('field', selectedField)
    setSearchParams(next)
  }

  function clearSearch() {
    setSearchText('')
    setSelectedField('all')
    setSearchParams(new URLSearchParams())
  }

  function changePage(nextOffset: number) {
    const next = new URLSearchParams(searchParams)
    if (nextOffset) next.set('offset', String(nextOffset))
    else next.delete('offset')
    setSearchParams(next)
  }

  return (
    <div className="space-y-5">
      <PageIntro
        description="Explore insurer-referenced providers, plans, and network records for currently verified, published hospitals in Sonipat."
        eyebrow="Insurance directory · Sonipat"
        title="Explore providers and hospital networks."
      />

      <GlassCard as="section" aria-label="Insurance search and coverage notice" className="p-4 sm:p-6">
        <div className="flex items-start gap-3 rounded-xl border border-amber-800/20 bg-amber-50/75 p-4">
          <AlertCircle aria-hidden="true" className="mt-0.5 shrink-0 text-amber-800" size={20} />
          <p className="text-sm leading-6 text-ink-700">
            A network record does not confirm your policy’s benefits, exclusions, or eligibility.
            Confirm coverage directly with your insurer before care.
          </p>
        </div>
        <form className="mt-4 grid gap-2 sm:grid-cols-[minmax(0,1fr)_190px_auto]" onSubmit={submitSearch} role="search">
          <label className="flex min-h-11 flex-1 items-center gap-2 rounded-xl border border-forest-900/10 bg-white/70 px-3">
            <Search aria-hidden="true" className="text-forest-700" size={17} />
            <span className="sr-only">Search providers, plans, or hospitals</span>
            <input
              className="min-w-0 w-full bg-transparent text-sm outline-none"
              onChange={(event) => setSearchText(event.target.value)}
              placeholder={selectedField === 'provider' ? 'Provider name' : selectedField === 'plan' ? 'Plan name' : selectedField === 'hospital' ? 'Hospital name' : 'Provider, plan or hospital'}
              value={searchText}
            />
          </label>
          <label className="sr-only" htmlFor="insurance-search-field">Filter search by</label>
          <select
            className="min-h-11 rounded-xl border border-forest-900/10 bg-white/75 px-3 text-sm text-ink-900"
            id="insurance-search-field"
            onChange={(event) => {
              const value = event.target.value
              if (value === 'all' || value === 'provider' || value === 'plan' || value === 'hospital') {
                setSelectedField(value)
              }
            }}
            value={selectedField}
          >
            <option value="all">All record fields</option>
            <option value="provider">Provider</option>
            <option value="plan">Plan</option>
            <option value="hospital">Hospital</option>
          </select>
          <div className="flex gap-2">
            <button className="glass-button glass-button-primary inline-flex flex-1" type="submit">Search</button>
            <button aria-label="Clear insurance search and filters" className="glass-button inline-flex" onClick={clearSearch} type="button">
              <RotateCcw aria-hidden="true" size={15} /> Clear
            </button>
          </div>
        </form>
      </GlassCard>

      {isLoading ? (
        <DirectoryState message="Loading verified provider and hospital network records." title="Loading networks" type="loading" />
      ) : error ? (
        <div className="space-y-3">
          <DirectoryState message={error} title="Could not load insurance records" type="error" />
          <button className="glass-button glass-button-primary" onClick={() => setRetryCount((count) => count + 1)} type="button">Try again</button>
        </div>
      ) : result?.data.length ? (
        <>
          <p aria-live="polite" className="text-sm text-ink-600">
            Showing {offset + 1}–{Math.min(offset + result.data.length, result.pagination.total)} of {result.pagination.total} current network records
          </p>
          <div className="grid gap-3 lg:grid-cols-2">
            {result.data.map((record) => (
              <article className="glass-card glass-card--interactive p-5" key={record.id}>
                <div className="flex items-start gap-3">
                  <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-sage-100 text-forest-800">
                    <ShieldCheck aria-hidden="true" size={19} />
                  </span>
                  <div className="min-w-0">
                    <p className="inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-forest-700">
                      <ShieldCheck aria-hidden="true" size={13} /> Verified network record
                    </p>
                    <h2 className="mt-1 font-semibold text-forest-950">{record.providerName}</h2>
                    <p className="mt-1 inline-flex items-center gap-1 text-sm text-ink-700">
                      <ShieldCheck aria-hidden="true" size={14} />{record.planName}
                    </p>
                    <Link className="mt-2 inline-flex items-center gap-1 text-sm font-medium text-forest-800 underline underline-offset-2" to={`${basePath}/hospitals/${encodeURIComponent(record.hospitalId)}`}>
                      <Building2 aria-hidden="true" size={14} />
                      {record.hospitalName}, {record.city}
                      <ArrowRight aria-hidden="true" size={14} />
                    </Link>
                    <p className="mt-2 text-xs text-ink-500">
                      Record checked {new Date(record.verifiedAt).toLocaleDateString()}
                    </p>
                  </div>
                </div>
              </article>
            ))}
          </div>
          {result.pagination.total > pageSize && (
            <nav aria-label="Insurance network pages" className="flex flex-wrap items-center justify-center gap-3">
              <button className="glass-button" disabled={offset === 0} onClick={() => changePage(Math.max(0, offset - pageSize))} type="button">Previous</button>
              <span className="text-sm text-ink-600">Page {Math.floor(offset / pageSize) + 1} of {Math.ceil(result.pagination.total / pageSize)}</span>
              <button className="glass-button" disabled={offset + pageSize >= result.pagination.total} onClick={() => changePage(offset + pageSize)} type="button">Next</button>
            </nav>
          )}
        </>
      ) : (
        <DirectoryState
          message="No current insurer-sourced network records are available for verified hospitals in Sonipat. No provider, plan, or network records have been fabricated."
          title="No network records found"
          type="empty"
        />
      )}
    </div>
  )
}
