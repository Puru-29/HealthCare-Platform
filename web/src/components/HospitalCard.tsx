import { Ambulance, ChevronRight, MapPin, Siren } from 'lucide-react'
import { Link } from 'react-router'
import type { Hospital, RankedHospital } from '../lib/api'
import { cx, km, minutes } from '../lib/format'
import { PmjayBadge, VerifiedBadge } from './ui'

export function HospitalCard({
  hospital, highlight, rank, compact = false,
}: {
  hospital: Hospital | RankedHospital
  highlight?: 'nearest' | 'best'
  rank?: number
  compact?: boolean
}) {
  const reasons = 'reasons' in hospital ? hospital.reasons : []
  const evidence = 'evidenceLabel' in hospital ? hospital.evidenceLabel : null
  const confirmed = hospital.specialties.filter((s) => s.source === 'hospital_verified').length > 0
  return (
    <Link
      to={`/hospitals/${encodeURIComponent(hospital.id)}`}
      className={cx('card group flex gap-3 p-3.5 transition hover:border-brand/40 hover:shadow-sm', highlight === 'best' && 'border-[#6941c6]/30')}
    >
      {rank !== undefined && (
        <span className={cx('grid size-7 shrink-0 place-items-center rounded-full text-xs font-bold text-white', highlight === 'best' ? 'bg-[#6941c6]' : 'bg-brand')}>
          {rank}
        </span>
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <p className="font-semibold leading-snug group-hover:text-brand">{hospital.name}</p>
          {hospital.distanceKm !== null && (
            <span className="shrink-0 text-right text-xs text-ink-2">
              <span className="block font-semibold text-ink">{km(hospital.distanceKm)}</span>
              ~{minutes(hospital.etaMinutes)}
            </span>
          )}
        </div>
        <p className="mt-0.5 text-xs text-ink-2">
          {hospital.facilityTypeLabel}
          {hospital.ownership === 'public' && ' · Government'}
          {hospital.ownership === 'private' && ' · Private'}
          {hospital.beds && ` · ${hospital.beds} beds`}
        </p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {hospital.pmjay && <PmjayBadge />}
          {hospital.verified && <VerifiedBadge />}
          {hospital.emergency24x7 && <span className="chip bg-sos-soft text-sos-dark"><Siren className="size-3" aria-hidden /> 24×7 emergency</span>}
          {hospital.ambulancesAvailable > 0 && <span className="chip bg-sky-soft text-sky"><Ambulance className="size-3" aria-hidden /> Ambulance</span>}
          {!hospital.location && <span className="chip bg-canvas text-ink-3"><MapPin className="size-3" aria-hidden /> Location not confirmed</span>}
        </div>
        {!compact && reasons.length > 0 && (
          <p className="mt-2 text-xs text-ink-2">{reasons.slice(0, 3).join(' · ')}</p>
        )}
        {!compact && evidence && !confirmed && evidence !== 'Confirmed by hospital' && (
          <p className="mt-1 text-[11px] text-ink-3">Specialty: {evidence.toLowerCase()} — call ahead to confirm.</p>
        )}
      </div>
      <ChevronRight className="mt-1 size-4 shrink-0 text-ink-3" aria-hidden />
    </Link>
  )
}
