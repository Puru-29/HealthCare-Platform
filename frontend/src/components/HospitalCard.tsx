import { ArrowUpRight, MapPin } from 'lucide-react'
import { Link } from 'react-router-dom'
import type { Hospital } from '../api/client'

type HospitalCardProps = {
  hospital: Hospital
  searchParams: URLSearchParams
  basePath?: string
}

export function HospitalCard({ hospital, searchParams, basePath = '' }: HospitalCardProps) {
  const detailParams = new URLSearchParams(searchParams)
  detailParams.set('city', 'Sonipat')
  const address = hospital.address ||
    [hospital.city, hospital.region, hospital.postalCode].filter(Boolean).join(', ') ||
    'Address not provided in the directory.'

  return (
    <article className="glass-card glass-card--interactive p-5 sm:p-6">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <span className="inline-flex rounded-full bg-sage-100 px-2.5 py-1 text-[11px] font-semibold tracking-wide text-forest-800">
            Published directory listing
          </span>
          <h3 className="mt-3 text-base font-semibold leading-6 text-forest-950 sm:text-lg">
            {hospital.name}
          </h3>
        </div>
        <span className="shrink-0 rounded-full bg-white/80 px-2.5 py-1.5 text-xs font-semibold text-ink-700">
          {hospital.facilityType ?? 'Facility type unavailable'}
        </span>
      </div>

      <p className="mt-3 flex items-start gap-2 text-sm leading-5 text-ink-600">
        <MapPin aria-hidden="true" className="mt-0.5 shrink-0 text-forest-700" size={16} />
        <span>{address}</span>
      </p>

      {hospital.description ? (
        <p className="mt-4 text-sm leading-6 text-ink-600">{hospital.description}</p>
      ) : null}

      <Link
        className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-full border border-forest-900/15 px-4 py-2 text-sm font-semibold text-forest-900 transition hover:border-forest-900/30 hover:bg-white/70"
        to={`${basePath}/hospitals/${encodeURIComponent(hospital.id)}?${detailParams.toString()}`}
      >
        View Details
        <ArrowUpRight aria-hidden="true" size={16} />
      </Link>
    </article>
  )
}
