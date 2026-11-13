import { useEffect, useState, type FormEvent } from 'react'
import { Ambulance, Building2, Plus, Search, Save, X } from 'lucide-react'
import { DirectoryState } from '../../components/DirectoryState'
import { PageIntro } from '../../components/PageIntro'
import {
  getAmbulanceProviders,
  getAmbulanceVehicles,
  saveAmbulanceProvider,
  saveAmbulanceVehicle,
  type AmbulanceProvider,
  type AmbulanceVehicle,
} from '../api'

type Tab = 'providers' | 'vehicles'
type ProviderForm = { id?: string; name: string; phone: string; website: string; status: AmbulanceProvider['status'] }
type VehicleForm = {
  id?: string
  providerId: string
  vehicleType: string
  registrationNumber: string
  status: AmbulanceVehicle['status']
  latitude: string
  longitude: string
}

const pageSize = 10
const blankProvider: ProviderForm = { name: '', phone: '', website: '', status: 'inactive' }
const blankVehicle: VehicleForm = { providerId: '', vehicleType: '', registrationNumber: '', status: 'unavailable', latitude: '', longitude: '' }

export function AdminAmbulancePage() {
  const [tab, setTab] = useState<Tab>('providers')
  const [searchText, setSearchText] = useState('')
  const [search, setSearch] = useState('')
  const [offset, setOffset] = useState(0)
  const [providers, setProviders] = useState<AmbulanceProvider[]>([])
  const [vehicles, setVehicles] = useState<AmbulanceVehicle[]>([])
  const [providerCount, setProviderCount] = useState(0)
  const [vehicleCount, setVehicleCount] = useState(0)
  const [providerOptions, setProviderOptions] = useState<AmbulanceProvider[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [refresh, setRefresh] = useState(0)
  const [providerForm, setProviderForm] = useState<ProviderForm | null>(null)
  const [vehicleForm, setVehicleForm] = useState<VehicleForm | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    const controller = new AbortController()
    getAmbulanceProviders({ limit: 100, offset: 0 }, controller.signal)
      .then((page) => setProviderOptions(page.data))
      .catch((cause: unknown) => {
        if (!(cause instanceof DOMException && cause.name === 'AbortError')) {
          setError(cause instanceof Error ? cause.message : 'Unable to load provider records.')
        }
      })
    return () => controller.abort()
  }, [refresh])

  useEffect(() => {
    const controller = new AbortController()
    const request = tab === 'providers'
      ? getAmbulanceProviders({ search: search || undefined, limit: pageSize, offset }, controller.signal)
      : getAmbulanceVehicles({ search: search || undefined, limit: pageSize, offset }, controller.signal)
    request
      .then((page) => {
        setError('')
        if (tab === 'providers') {
          setProviders(page.data as AmbulanceProvider[])
          setProviderCount(page.pagination.total)
        } else {
          setVehicles(page.data as AmbulanceVehicle[])
          setVehicleCount(page.pagination.total)
        }
      })
      .catch((cause: unknown) => {
        if (cause instanceof DOMException && cause.name === 'AbortError') return
        setError(cause instanceof Error ? cause.message : 'Unable to load ambulance records.')
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => controller.abort()
  }, [tab, search, offset, refresh])

  function changeTab(next: Tab) {
    if (next === tab) return
    setLoading(true)
    setTab(next)
    setOffset(0)
    setSearch('')
    setSearchText('')
    setNotice('')
  }

  async function submitProvider(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!providerForm) return
    if (!window.confirm(`${providerForm.id ? 'Save changes to' : 'Create'} provider "${providerForm.name}"?`)) return
    setSaving(true)
    setError('')
    setNotice('')
    try {
      await saveAmbulanceProvider({
        name: providerForm.name.trim(),
        phone: providerForm.phone.trim() || null,
        website: providerForm.website.trim() || null,
        status: providerForm.status,
      }, providerForm.id)
      setProviderForm(null)
      setNotice('Ambulance provider saved.')
      setLoading(true)
      setRefresh((value) => value + 1)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Provider could not be saved.')
    } finally {
      setSaving(false)
    }
  }

  async function submitVehicle(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!vehicleForm) return
    if (!window.confirm(`${vehicleForm.id ? 'Save changes to' : 'Create'} this ambulance vehicle?`)) return
    setSaving(true)
    setError('')
    setNotice('')
    try {
      await saveAmbulanceVehicle({
        providerId: vehicleForm.providerId,
        vehicleType: vehicleForm.vehicleType.trim(),
        registrationNumber: vehicleForm.registrationNumber.trim() || null,
        status: vehicleForm.status,
        latitude: vehicleForm.latitude === '' ? null : Number(vehicleForm.latitude),
        longitude: vehicleForm.longitude === '' ? null : Number(vehicleForm.longitude),
      }, vehicleForm.id)
      setVehicleForm(null)
      setNotice('Ambulance vehicle saved.')
      setLoading(true)
      setRefresh((value) => value + 1)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Vehicle could not be saved.')
    } finally {
      setSaving(false)
    }
  }

  const count = tab === 'providers' ? providerCount : vehicleCount

  return (
    <>
      <PageIntro description="Maintain ambulance provider and vehicle records. No dispatch or live vehicle tracking is connected." eyebrow="Operations" title="Ambulance management" />
      {error && <p className="mb-4 rounded-xl border border-emergency-600/20 bg-white/70 p-3 text-sm text-emergency-700" role="alert">{error}</p>}
      {notice && <p className="mb-4 rounded-xl border border-forest-700/20 bg-white/70 p-3 text-sm text-forest-800" role="status">{notice}</p>}

      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div aria-label="Ambulance record type" className="glass-navbar inline-flex gap-1 p-1" role="tablist">
          <button aria-selected={tab === 'providers'} className={`inline-flex min-h-10 items-center gap-2 rounded-full px-4 text-sm font-medium ${tab === 'providers' ? 'bg-forest-900 text-white' : 'text-ink-700'}`} onClick={() => changeTab('providers')} role="tab" type="button"><Building2 size={16} /> Providers</button>
          <button aria-selected={tab === 'vehicles'} className={`inline-flex min-h-10 items-center gap-2 rounded-full px-4 text-sm font-medium ${tab === 'vehicles' ? 'bg-forest-900 text-white' : 'text-ink-700'}`} onClick={() => changeTab('vehicles')} role="tab" type="button"><Ambulance size={16} /> Vehicles</button>
        </div>
        <button className="glass-button glass-button-primary inline-flex" onClick={() => tab === 'providers' ? setProviderForm({ ...blankProvider }) : setVehicleForm({ ...blankVehicle, providerId: providerOptions[0]?.id ?? '' })} type="button"><Plus size={16} /> Add {tab === 'providers' ? 'provider' : 'vehicle'}</button>
      </div>

      <section className="glass-card mb-5 p-4">
        <form className="flex flex-col gap-3 sm:flex-row" onSubmit={(event) => { event.preventDefault(); const nextSearch = searchText.trim(); if (nextSearch !== search || offset !== 0) setLoading(true); setOffset(0); setSearch(nextSearch) }}>
          <label className="relative min-w-0 flex-1">
            <span className="sr-only">Search {tab}</span>
            <Search aria-hidden="true" className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-500" size={18} />
            <input className="min-h-11 w-full rounded-xl border border-forest-900/12 bg-white/70 pl-10 pr-3 text-sm" onChange={(event) => setSearchText(event.target.value)} placeholder={tab === 'providers' ? 'Search provider name or phone' : 'Search vehicle, registration or provider'} value={searchText} />
          </label>
          <button className="glass-button glass-button-primary inline-flex" type="submit"><Search size={16} /> Search</button>
        </form>
      </section>

      {tab === 'providers' && providerForm && (
        <section className="glass-card mb-5 p-5 sm:p-7">
          <div className="flex items-start justify-between gap-3">
            <div><h2 className="text-lg font-semibold text-forest-950">{providerForm.id ? 'Edit provider' : 'Add provider'}</h2><p className="mt-1 text-sm text-ink-600">Use provider information supplied and verified by your team.</p></div>
            <button aria-label="Close provider form" className="grid size-9 place-items-center rounded-full hover:bg-white/70" onClick={() => setProviderForm(null)} type="button"><X size={18} /></button>
          </div>
          <form className="mt-5 grid gap-4 sm:grid-cols-2" onSubmit={submitProvider}>
            <label className="text-sm font-medium text-ink-800">Provider name *<input className="mt-1.5 min-h-11 w-full rounded-xl border border-forest-900/12 bg-white/75 px-3" maxLength={200} onChange={(event) => setProviderForm({ ...providerForm, name: event.target.value })} required value={providerForm.name} /></label>
            <label className="text-sm font-medium text-ink-800">Public phone<input className="mt-1.5 min-h-11 w-full rounded-xl border border-forest-900/12 bg-white/75 px-3" maxLength={50} onChange={(event) => setProviderForm({ ...providerForm, phone: event.target.value })} type="tel" value={providerForm.phone} /></label>
            <label className="text-sm font-medium text-ink-800">Website<input className="mt-1.5 min-h-11 w-full rounded-xl border border-forest-900/12 bg-white/75 px-3" onChange={(event) => setProviderForm({ ...providerForm, website: event.target.value })} type="url" value={providerForm.website} /></label>
            <label className="text-sm font-medium text-ink-800">Status<select className="mt-1.5 min-h-11 w-full rounded-xl border border-forest-900/12 bg-white/75 px-3" onChange={(event) => setProviderForm({ ...providerForm, status: event.target.value as AmbulanceProvider['status'] })} value={providerForm.status}><option value="active">Active</option><option value="inactive">Inactive</option><option value="suspended">Suspended</option></select></label>
            <div className="flex flex-wrap gap-3 sm:col-span-2"><button className="glass-button glass-button-primary inline-flex disabled:opacity-60" disabled={saving} type="submit"><Save size={16} /> {saving ? 'Saving…' : 'Save provider'}</button><button className="glass-button" onClick={() => setProviderForm(null)} type="button">Cancel</button></div>
          </form>
        </section>
      )}

      {tab === 'vehicles' && vehicleForm && (
        <section className="glass-card mb-5 p-5 sm:p-7">
          <div className="flex items-start justify-between gap-3">
            <div><h2 className="text-lg font-semibold text-forest-950">{vehicleForm.id ? 'Edit vehicle' : 'Add vehicle'}</h2><p className="mt-1 text-sm text-ink-600">Coordinates are stored as last supplied location, not real-time tracking.</p></div>
            <button aria-label="Close vehicle form" className="grid size-9 place-items-center rounded-full hover:bg-white/70" onClick={() => setVehicleForm(null)} type="button"><X size={18} /></button>
          </div>
          {providerOptions.length === 0 ? <p className="mt-5 rounded-xl bg-white/60 p-4 text-sm text-ink-600">Create an ambulance provider before adding vehicles.</p> : (
            <form className="mt-5 grid gap-4 sm:grid-cols-2" onSubmit={submitVehicle}>
              <label className="text-sm font-medium text-ink-800">Provider *<select className="mt-1.5 min-h-11 w-full rounded-xl border border-forest-900/12 bg-white/75 px-3" onChange={(event) => setVehicleForm({ ...vehicleForm, providerId: event.target.value })} required value={vehicleForm.providerId}>{providerOptions.map((provider) => <option key={provider.id} value={provider.id}>{provider.name}</option>)}</select></label>
              <label className="text-sm font-medium text-ink-800">Vehicle type *<input className="mt-1.5 min-h-11 w-full rounded-xl border border-forest-900/12 bg-white/75 px-3" maxLength={100} onChange={(event) => setVehicleForm({ ...vehicleForm, vehicleType: event.target.value })} required value={vehicleForm.vehicleType} /></label>
              <label className="text-sm font-medium text-ink-800">Registration number<input className="mt-1.5 min-h-11 w-full rounded-xl border border-forest-900/12 bg-white/75 px-3" maxLength={50} onChange={(event) => setVehicleForm({ ...vehicleForm, registrationNumber: event.target.value })} value={vehicleForm.registrationNumber} /></label>
              <label className="text-sm font-medium text-ink-800">Status<select className="mt-1.5 min-h-11 w-full rounded-xl border border-forest-900/12 bg-white/75 px-3" onChange={(event) => setVehicleForm({ ...vehicleForm, status: event.target.value as AmbulanceVehicle['status'] })} value={vehicleForm.status}><option value="available">Available</option><option value="assigned">Assigned</option><option value="unavailable">Unavailable</option><option value="maintenance">Maintenance</option></select></label>
              <label className="text-sm font-medium text-ink-800">Latitude<input className="mt-1.5 min-h-11 w-full rounded-xl border border-forest-900/12 bg-white/75 px-3" max={90} min={-90} onChange={(event) => setVehicleForm({ ...vehicleForm, latitude: event.target.value })} step="any" type="number" value={vehicleForm.latitude} /></label>
              <label className="text-sm font-medium text-ink-800">Longitude<input className="mt-1.5 min-h-11 w-full rounded-xl border border-forest-900/12 bg-white/75 px-3" max={180} min={-180} onChange={(event) => setVehicleForm({ ...vehicleForm, longitude: event.target.value })} step="any" type="number" value={vehicleForm.longitude} /></label>
              <div className="flex flex-wrap gap-3 sm:col-span-2"><button className="glass-button glass-button-primary inline-flex disabled:opacity-60" disabled={saving} type="submit"><Save size={16} /> {saving ? 'Saving…' : 'Save vehicle'}</button><button className="glass-button" onClick={() => setVehicleForm(null)} type="button">Cancel</button></div>
            </form>
          )}
        </section>
      )}

      {loading ? <DirectoryState message={`Loading ${tab} from the database.`} title="Loading records" type="loading" />
        : error ? <DirectoryState message={error} title="Could not load ambulance records" type="error" />
          : count === 0 ? <section className="glass-card p-8 text-center"><h2 className="text-lg font-semibold text-forest-950">No {tab} found</h2><p className="mt-2 text-sm text-ink-600">{search ? 'Try another search or clear the search field.' : `There are no ${tab} in the database yet.`}</p></section>
            : tab === 'providers' ? (
              <div className="grid gap-3">
                {providers.map((provider) => (
                  <article className="glass-card flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between" key={provider.id}>
                    <div><h2 className="font-semibold text-forest-950">{provider.name}</h2><p className="mt-1 text-sm text-ink-600">{provider.phone || 'No public phone'}{provider.website ? ` · ${provider.website}` : ''}</p><p className="mt-2 text-xs text-ink-500">{provider.vehicleCount} vehicle{provider.vehicleCount === 1 ? '' : 's'} · <span className="capitalize">{provider.status}</span></p></div>
                    <button className="glass-button self-start sm:self-center" onClick={() => setProviderForm({ id: provider.id, name: provider.name, phone: provider.phone ?? '', website: provider.website ?? '', status: provider.status })} type="button">Edit provider</button>
                  </article>
                ))}
              </div>
            ) : (
              <div className="grid gap-3">
                {vehicles.map((vehicle) => (
                  <article className="glass-card flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between" key={vehicle.id}>
                    <div><h2 className="font-semibold text-forest-950">{vehicle.vehicleType}{vehicle.registrationNumber ? ` · ${vehicle.registrationNumber}` : ''}</h2><p className="mt-1 text-sm text-ink-600">{vehicle.providerName} · <span className="capitalize">{vehicle.status}</span></p><p className="mt-2 text-xs text-ink-500">{vehicle.latitude !== null && vehicle.longitude !== null ? `Last supplied location: ${vehicle.latitude}, ${vehicle.longitude}${vehicle.locationUpdatedAt ? ` · ${new Date(vehicle.locationUpdatedAt).toLocaleString()}` : ''}` : 'No location stored'}</p></div>
                    <button className="glass-button self-start sm:self-center" onClick={() => setVehicleForm({ id: vehicle.id, providerId: vehicle.providerId, vehicleType: vehicle.vehicleType, registrationNumber: vehicle.registrationNumber ?? '', status: vehicle.status, latitude: vehicle.latitude?.toString() ?? '', longitude: vehicle.longitude?.toString() ?? '' })} type="button">Edit vehicle</button>
                  </article>
                ))}
              </div>
            )}

      {!loading && count > 0 && <div className="mt-4 flex flex-wrap items-center justify-between gap-3"><p className="text-sm text-ink-600">Showing {offset + 1}–{Math.min(offset + pageSize, count)} of {count}</p><div className="flex gap-2"><button className="glass-button disabled:opacity-50" disabled={offset === 0} onClick={() => { setLoading(true); setOffset(Math.max(0, offset - pageSize)) }} type="button">Previous</button><button className="glass-button disabled:opacity-50" disabled={offset + pageSize >= count} onClick={() => { setLoading(true); setOffset(offset + pageSize) }} type="button">Next</button></div></div>}
    </>
  )
}
