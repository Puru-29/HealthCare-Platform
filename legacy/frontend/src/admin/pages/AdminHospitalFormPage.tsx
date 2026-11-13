import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { ArrowLeft, Save } from 'lucide-react'
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { DirectoryState } from '../../components/DirectoryState'
import { PageIntro } from '../../components/PageIntro'
import {
  getAdminHospital,
  saveAdminHospital,
  type AdminHospital,
  type AdminHospitalInput,
  type ListingStatus,
  type VerificationStatus,
} from '../api'

type FormValues = Omit<AdminHospitalInput, 'verificationExpiresAt'> & {
  verificationExpiresAt: string
}

function blankForm(): FormValues {
  return {
    name: '',
    address: null,
    city: null,
    region: null,
    postalCode: null,
    phone: null,
    website: null,
    description: null,
    facilityType: null,
    latitude: null,
    longitude: null,
    listingStatus: 'draft',
    specialties: [],
    verificationStatus: 'unverified',
    verificationSourceType: null,
    verificationSourceName: null,
    verificationSourceReference: null,
    verificationExpiresAt: '',
  }
}

function toLocalDateTime(value: string | null): string {
  if (!value) return ''
  const date = new Date(value)
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
  return local.toISOString().slice(0, 16)
}

function fromHospital(hospital: AdminHospital): FormValues {
  return {
    name: hospital.name,
    address: hospital.address,
    city: hospital.city,
    region: hospital.region,
    postalCode: hospital.postalCode,
    phone: hospital.phone,
    website: hospital.website,
    description: hospital.description,
    facilityType: hospital.facilityType,
    latitude: hospital.latitude,
    longitude: hospital.longitude,
    listingStatus: hospital.listingStatus,
    specialties: hospital.specialties,
    verificationStatus: hospital.verificationStatus,
    verificationSourceType: hospital.verificationSourceType,
    verificationSourceName: hospital.verificationSourceName,
    verificationSourceReference: hospital.verificationSourceReference,
    verificationExpiresAt: toLocalDateTime(hospital.verificationExpiresAt),
  }
}

function FormField({ children, label }: { children: ReactNode; label: string }) {
  return <label className="block text-sm font-medium text-ink-800">{label}{children}</label>
}

const fieldClass = 'mt-1.5 min-h-11 w-full rounded-xl border border-forest-900/12 bg-white/75 px-3 text-sm text-ink-900 disabled:bg-white/45 disabled:text-ink-600'

export function AdminHospitalFormPage() {
  const { hospitalId } = useParams()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const location = useLocation()
  const isNew = hospitalId === undefined
  const readOnly = !isNew && searchParams.get('mode') === 'view'
  const [form, setForm] = useState<FormValues>(blankForm)
  const [loading, setLoading] = useState(!isNew)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [verificationExpiryChanged, setVerificationExpiryChanged] = useState(false)
  const [verificationExpiryOriginal, setVerificationExpiryOriginal] = useState<string | null>(null)
  const success = typeof location.state === 'object' && location.state !== null && 'notice' in location.state
    ? String(location.state.notice)
    : ''

  useEffect(() => {
    if (isNew || !hospitalId) return
    const controller = new AbortController()
    getAdminHospital(hospitalId, controller.signal)
      .then(({ data }) => {
        setForm(fromHospital(data))
        setVerificationExpiryChanged(false)
        setVerificationExpiryOriginal(data.verificationExpiresAt)
      })
      .catch((cause: unknown) => {
        if (cause instanceof DOMException && cause.name === 'AbortError') return
        setError(cause instanceof Error ? cause.message : 'Unable to load hospital details.')
      })
      .finally(() => setLoading(false))
    return () => controller.abort()
  }, [hospitalId, isNew])

  function update<K extends keyof FormValues>(key: K, value: FormValues[K]) {
    setForm((current) => ({ ...current, [key]: value }))
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!window.confirm(`${isNew ? 'Create this hospital record' : 'Save these hospital changes'}?`)) return
    setSaving(true)
    setError('')
    const payload: AdminHospitalInput = {
      ...form,
      specialties: form.specialties,
      verificationExpiresAt: form.verificationExpiresAt
        ? verificationExpiryChanged
          ? new Date(form.verificationExpiresAt).toISOString()
          : verificationExpiryOriginal
        : null,
      verificationSourceType: form.verificationStatus === 'unverified' ? null : form.verificationSourceType,
      verificationSourceName: form.verificationStatus === 'unverified' ? null : form.verificationSourceName,
      verificationSourceReference: form.verificationStatus === 'unverified' ? null : form.verificationSourceReference,
    }
    try {
      const { data } = await saveAdminHospital(payload, hospitalId)
      navigate(`/admin/hospitals/${data.id}?mode=view`, {
        replace: true,
        state: { notice: isNew ? 'Hospital record created.' : 'Hospital record saved.' },
      })
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Hospital could not be saved.')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <DirectoryState message="Loading the saved hospital fields." title="Loading hospital" type="loading" />
  if (error && !isNew && !form.name) return <DirectoryState message={error} title="Could not load hospital" type="error" />

  return (
    <>
      <Link className="mb-5 inline-flex min-h-10 items-center gap-2 text-sm font-medium text-ink-600 hover:text-forest-800" to="/admin/hospitals"><ArrowLeft size={16} /> Back to hospitals</Link>
      <PageIntro
        description={readOnly ? 'Review public directory fields and the most recent verification record.' : 'Enter only information supported by the existing database schema and verified from an appropriate source.'}
        eyebrow={isNew ? 'New directory record' : readOnly ? 'Hospital details' : 'Edit directory record'}
        title={isNew ? 'Add hospital' : readOnly ? form.name || 'Hospital details' : 'Edit hospital'}
      />
      {error && <p className="mb-4 rounded-xl border border-emergency-600/20 bg-white/70 p-3 text-sm text-emergency-700" role="alert">{error}</p>}
      {success && <p className="mb-4 rounded-xl border border-forest-700/20 bg-white/70 p-3 text-sm text-forest-800" role="status">{success}</p>}
      <form className="space-y-5" onSubmit={submit}>
        <section className="glass-card p-5 sm:p-7">
          <h2 className="text-lg font-semibold text-forest-950">Public listing information</h2>
          <p className="mt-1 text-sm text-ink-600">These fields are stored separately from provider-verified snapshots.</p>
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <FormField label="Hospital name *"><input className={fieldClass} disabled={readOnly} maxLength={200} onChange={(event) => update('name', event.target.value)} required value={form.name} /></FormField>
            <FormField label="Facility type"><input className={fieldClass} disabled={readOnly} maxLength={100} onChange={(event) => update('facilityType', event.target.value || null)} placeholder="Hospital, clinic, etc." value={form.facilityType ?? ''} /></FormField>
            <FormField label="Address"><input className={fieldClass} disabled={readOnly} maxLength={500} onChange={(event) => update('address', event.target.value || null)} value={form.address ?? ''} /></FormField>
            <FormField label="City"><input className={fieldClass} disabled={readOnly} maxLength={120} onChange={(event) => update('city', event.target.value || null)} value={form.city ?? ''} /></FormField>
            <FormField label="Region / state"><input className={fieldClass} disabled={readOnly} maxLength={120} onChange={(event) => update('region', event.target.value || null)} value={form.region ?? ''} /></FormField>
            <FormField label="Postal code"><input className={fieldClass} disabled={readOnly} maxLength={20} onChange={(event) => update('postalCode', event.target.value || null)} value={form.postalCode ?? ''} /></FormField>
            <FormField label="Public phone"><input className={fieldClass} disabled={readOnly} maxLength={50} onChange={(event) => update('phone', event.target.value || null)} type="tel" value={form.phone ?? ''} /></FormField>
            <FormField label="Website"><input className={fieldClass} disabled={readOnly} maxLength={300} onChange={(event) => update('website', event.target.value || null)} placeholder="https://…" type="url" value={form.website ?? ''} /></FormField>
            <FormField label="Latitude"><input className={fieldClass} disabled={readOnly} max={90} min={-90} onChange={(event) => update('latitude', event.target.value === '' ? null : Number(event.target.value))} step="any" type="number" value={form.latitude ?? ''} /></FormField>
            <FormField label="Longitude"><input className={fieldClass} disabled={readOnly} max={180} min={-180} onChange={(event) => update('longitude', event.target.value === '' ? null : Number(event.target.value))} step="any" type="number" value={form.longitude ?? ''} /></FormField>
            <FormField label="Publication status">
              <select className={fieldClass} disabled={readOnly} onChange={(event) => update('listingStatus', event.target.value as ListingStatus)} value={form.listingStatus}>
                <option value="draft">Draft</option><option value="published">Published</option><option value="hidden">Hidden</option>
              </select>
            </FormField>
            <FormField label="Specialties (comma-separated)">
              <input className={fieldClass} disabled={readOnly} onChange={(event) => update('specialties', event.target.value.split(',').map((item) => item.trim()).filter(Boolean))} placeholder="Cardiology, Neurology" value={form.specialties.join(', ')} />
            </FormField>
            <div className="sm:col-span-2">
              <FormField label="Description"><textarea className={`${fieldClass} min-h-28 py-3`} disabled={readOnly} maxLength={4000} onChange={(event) => update('description', event.target.value || null)} value={form.description ?? ''} /></FormField>
            </div>
          </div>
        </section>

        <section className="glass-card p-5 sm:p-7">
          <h2 className="text-lg font-semibold text-forest-950">Verification record</h2>
          <p className="mt-1 text-sm leading-6 text-ink-600">Changing verification appends a sourced record; “Unverified” leaves the historical records intact.</p>
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <FormField label="Verification status">
              <select className={fieldClass} disabled={readOnly} onChange={(event) => update('verificationStatus', event.target.value as VerificationStatus)} value={form.verificationStatus}>
                <option value="unverified">Unverified</option><option value="pending">Pending</option><option value="verified">Verified</option><option value="rejected">Rejected</option><option value="expired">Expired</option><option value="disputed">Disputed</option>
              </select>
            </FormField>
            {form.verificationStatus !== 'unverified' && <>
              <FormField label="Source type *">
                <select className={fieldClass} disabled={readOnly} onChange={(event) => update('verificationSourceType', event.target.value || null)} required value={form.verificationSourceType ?? ''}>
                  <option value="">Select a source type</option><option value="provider">Provider</option><option value="government_registry">Government registry</option><option value="public_directory">Public directory</option><option value="insurer">Insurer</option><option value="manual_review">Manual review</option><option value="other">Other</option>
                </select>
              </FormField>
              <FormField label="Source name *"><input className={fieldClass} disabled={readOnly} maxLength={200} onChange={(event) => update('verificationSourceName', event.target.value || null)} required value={form.verificationSourceName ?? ''} /></FormField>
              <FormField label="Source reference"><input className={fieldClass} disabled={readOnly} maxLength={500} onChange={(event) => update('verificationSourceReference', event.target.value || null)} value={form.verificationSourceReference ?? ''} /></FormField>
              <FormField label="Verification expiry"><input className={fieldClass} disabled={readOnly} onChange={(event) => { setVerificationExpiryChanged(true); update('verificationExpiresAt', event.target.value) }} type="datetime-local" value={form.verificationExpiresAt} /></FormField>
            </>}
          </div>
        </section>

        {!readOnly && <div className="flex flex-wrap gap-3">
          <button className="glass-button glass-button-primary inline-flex disabled:opacity-60" disabled={saving} type="submit"><Save size={16} /> {saving ? 'Saving…' : isNew ? 'Create hospital' : 'Save changes'}</button>
          <Link className="glass-button inline-flex" to="/admin/hospitals">Cancel</Link>
        </div>}
        {readOnly && <Link className="glass-button glass-button-primary inline-flex" to={`/admin/hospitals/${hospitalId}?mode=edit`}>Edit hospital</Link>}
      </form>
    </>
  )
}
