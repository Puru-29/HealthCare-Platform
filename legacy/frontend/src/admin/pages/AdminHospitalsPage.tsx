import { useEffect, useState, type FormEvent } from 'react'
import { Eye, FilePlus2, Pencil, Search } from 'lucide-react'
import { Link } from 'react-router-dom'
import { DirectoryState } from '../../components/DirectoryState'
import { PageIntro } from '../../components/PageIntro'
import { getAdminHospitals, type AdminHospital, type ListingStatus, type VerificationStatus } from '../api'

const pageSize = 10

function StatusBadge({ children }: { children: string }) {
  const tone = children === 'published' || children === 'verified'
    ? 'bg-sage-100 text-forest-800'
    : children === 'hidden' || children === 'rejected' || children === 'disputed'
      ? 'bg-rose-50 text-emergency-700'
      : 'bg-white/80 text-ink-700'
  return <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold capitalize ${tone}`}>{children}</span>
}

function HospitalActions({ hospital }: { hospital: AdminHospital }) {
  return (
    <div className="flex items-center gap-2">
      <Link aria-label={`View ${hospital.name}`} className="grid size-9 place-items-center rounded-full border border-forest-900/10 text-ink-600 hover:bg-white" to={`/admin/hospitals/${hospital.id}?mode=view`}><Eye size={16} /></Link>
      <Link aria-label={`Edit ${hospital.name}`} className="grid size-9 place-items-center rounded-full border border-forest-900/10 text-forest-800 hover:bg-white" to={`/admin/hospitals/${hospital.id}?mode=edit`}><Pencil size={16} /></Link>
    </div>
  )
}

export function AdminHospitalsPage() {
  const [searchText, setSearchText] = useState('')
  const [search, setSearch] = useState('')
  const [listingStatus, setListingStatus] = useState<'' | ListingStatus>('')
  const [verificationStatus, setVerificationStatus] = useState<'' | VerificationStatus>('')
  const [offset, setOffset] = useState(0)
  const [result, setResult] = useState<{ data: AdminHospital[]; pagination: { total: number } } | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const controller = new AbortController()
    getAdminHospitals({
      limit: pageSize,
      offset,
      search: search || undefined,
      listingStatus: listingStatus || undefined,
      verificationStatus: verificationStatus || undefined,
    }, controller.signal)
      .then((page) => {
        setError('')
        setResult(page)
      })
      .catch((cause: unknown) => {
        if (cause instanceof DOMException && cause.name === 'AbortError') return
        setError(cause instanceof Error ? cause.message : 'Unable to load hospital records.')
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => controller.abort()
  }, [offset, search, listingStatus, verificationStatus])

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setLoading(true)
    setOffset(0)
    setSearch(searchText.trim())
  }

  const hospitals = result?.data ?? []
  const total = result?.pagination.total ?? 0

  return (
    <>
      <PageIntro description="Search and maintain public hospital directory details and their verification records." eyebrow="Directory management" title="Hospitals">
        <Link className="glass-button glass-button-primary mt-5 inline-flex" to="/admin/hospitals/new"><FilePlus2 size={16} /> Add hospital</Link>
      </PageIntro>

      <section aria-label="Hospital filters" className="glass-card mb-5 p-4 sm:p-5">
        <form className="grid gap-3 md:grid-cols-[minmax(240px,1fr)_190px_190px_auto]" onSubmit={submitSearch}>
          <label className="relative block">
            <span className="sr-only">Search hospitals</span>
            <Search aria-hidden="true" className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-500" size={18} />
            <input className="min-h-11 w-full rounded-xl border border-forest-900/12 bg-white/70 pl-10 pr-3 text-sm" onChange={(event) => setSearchText(event.target.value)} placeholder="Search name, city, address or phone" value={searchText} />
          </label>
          <label className="sr-only" htmlFor="listing-filter">Publication status</label>
          <select className="min-h-11 rounded-xl border border-forest-900/12 bg-white/70 px-3 text-sm" id="listing-filter" onChange={(event) => { setLoading(true); setOffset(0); setListingStatus(event.target.value as '' | ListingStatus) }} value={listingStatus}>
            <option value="">All publication statuses</option><option value="draft">Draft</option><option value="published">Published</option><option value="hidden">Hidden</option>
          </select>
          <label className="sr-only" htmlFor="verification-filter">Verification status</label>
          <select className="min-h-11 rounded-xl border border-forest-900/12 bg-white/70 px-3 text-sm" id="verification-filter" onChange={(event) => { setLoading(true); setOffset(0); setVerificationStatus(event.target.value as '' | VerificationStatus) }} value={verificationStatus}>
            <option value="">All verification statuses</option><option value="unverified">Unverified</option><option value="pending">Pending</option><option value="verified">Verified</option><option value="rejected">Rejected</option><option value="expired">Expired</option><option value="disputed">Disputed</option>
          </select>
          <button className="glass-button glass-button-primary inline-flex" type="submit"><Search size={16} /> Search</button>
        </form>
      </section>

      {loading ? <DirectoryState message="Loading hospital records from the database." title="Loading hospitals" type="loading" />
        : error ? <DirectoryState message={error} title="Could not load hospitals" type="error" />
          : total === 0 ? (
            <section className="glass-card p-8 text-center">
              <h2 className="text-lg font-semibold text-forest-950">No hospital records found</h2>
              <p className="mt-2 text-sm text-ink-600">{search || listingStatus || verificationStatus ? 'Try adjusting the filters or add a verified record.' : 'There are no hospital records in the database yet.'}</p>
            </section>
          ) : (
            <>
              <div className="glass-card overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[850px] text-left text-sm">
                    <thead className="border-b border-forest-900/8 bg-white/35 text-xs uppercase tracking-wide text-ink-500">
                      <tr><th className="px-5 py-4 font-semibold">Hospital</th><th className="px-5 py-4 font-semibold">Specialties</th><th className="px-5 py-4 font-semibold">Publication</th><th className="px-5 py-4 font-semibold">Verification</th><th className="px-5 py-4 font-semibold">Updated</th><th className="px-5 py-4 font-semibold">Actions</th></tr>
                    </thead>
                    <tbody className="divide-y divide-forest-900/7">
                      {hospitals.map((hospital) => (
                        <tr className="align-top" key={hospital.id}>
                          <td className="px-5 py-4"><p className="font-semibold text-forest-950">{hospital.name}</p><p className="mt-1 text-xs text-ink-500">{[hospital.city, hospital.region].filter(Boolean).join(', ') || 'Location not provided'}</p></td>
                          <td className="max-w-64 px-5 py-4 text-ink-700">{hospital.specialties.length ? hospital.specialties.join(', ') : 'None listed'}</td>
                          <td className="px-5 py-4"><StatusBadge>{hospital.listingStatus}</StatusBadge></td>
                          <td className="px-5 py-4"><StatusBadge>{hospital.verificationStatus}</StatusBadge></td>
                          <td className="whitespace-nowrap px-5 py-4 text-xs text-ink-600">{new Date(hospital.updatedAt).toLocaleDateString()}</td>
                          <td className="px-5 py-4"><HospitalActions hospital={hospital} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm text-ink-600">Showing {offset + 1}–{Math.min(offset + hospitals.length, total)} of {total}</p>
                <div className="flex gap-2">
                  <button className="glass-button disabled:opacity-50" disabled={offset === 0} onClick={() => { setLoading(true); setOffset(Math.max(0, offset - pageSize)) }} type="button">Previous</button>
                  <button className="glass-button disabled:opacity-50" disabled={offset + pageSize >= total} onClick={() => { setLoading(true); setOffset(offset + pageSize) }} type="button">Next</button>
                </div>
              </div>
            </>
          )}
    </>
  )
}
