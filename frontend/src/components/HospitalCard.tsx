import { Link } from 'react-router'
import type { Hospital, RankedHospital } from '../lib/api'
import { cx, km, minutes } from '../lib/format'
import { Pill } from './ui'

function ownershipLabel(h: Hospital) {
  return [h.ownership === 'public' ? 'Government' : h.ownership === 'private' ? 'Private' : null, h.facilityTypeLabel].filter(Boolean).join(' · ')
}

/** Status pills shared by every hospital listing. */
export function HospitalPills({ hospital: h, max = 4 }: { hospital: Hospital; max?: number }) {
  const confirmed = h.specialties.some((s) => s.source === 'hospital_verified')
  const pills = [
    h.emergency24x7 && <Pill key="e" tone="sos">24×7 emergency</Pill>,
    h.pmjay && <Pill key="p" tone="ok">Ayushman</Pill>,
    h.verified && <Pill key="v" tone="mint">Verified on CarePath</Pill>,
    h.ambulancesAvailable > 0 && <Pill key="a" tone="sky">Ambulance</Pill>,
    !confirmed && !h.verified && <Pill key="c" tone="amber">Call ahead</Pill>,
    !h.location && <Pill key="l" tone="muted">Location not confirmed</Pill>,
  ].filter(Boolean)
  return <span className="flex flex-wrap gap-1.5">{pills.slice(0, max)}</span>
}

/** Glass card for a hospital. `onSelect` makes it a button (e.g. to focus the map) instead of a link. */
export function HospitalCard({
  hospital, label, labelTone = 'mint', onSelect, selected, className,
}: {
  hospital: Hospital | RankedHospital
  label?: string
  labelTone?: 'mint' | 'sky'
  onSelect?: () => void
  selected?: boolean
  className?: string
}) {
  const reasons = 'reasons' in hospital ? hospital.reasons : []
  const evidence = 'evidenceLabel' in hospital ? hospital.evidenceLabel : null
  const body = (
    <>
      {label && <Pill tone={labelTone} className="mb-3">{label}</Pill>}
      <span className="flex items-start justify-between gap-3">
        <span className="heading text-[17px] leading-snug">{hospital.name}</span>
        {hospital.distanceKm !== null && <span className="shrink-0 font-bold text-brand-3">{km(hospital.distanceKm)}</span>}
      </span>
      <span className="mt-1 block text-sm text-ink-2">
        {ownershipLabel(hospital)}
        {hospital.etaMinutes !== null && ` · ~${minutes(hospital.etaMinutes)} drive`}
      </span>
      <span className="mt-3 block"><HospitalPills hospital={hospital} /></span>
      {reasons.length > 0 && <span className="mt-2.5 block text-[13px] text-ink-2">{reasons.slice(0, 3).join(' · ')}</span>}
      {evidence && evidence !== 'Confirmed by hospital' && (
        <span className="mt-1.5 block text-[13px] text-amber">Specialty: {evidence.toLowerCase()} — call ahead</span>
      )}
    </>
  )
  const cls = cx('glass lift block w-full rounded-[22px] p-[18px] text-left text-ink no-underline', selected && 'border-brand/60 bg-brand-soft', className)
  return onSelect
    ? <button type="button" onClick={onSelect} aria-pressed={selected} className={cls}>{body}</button>
    : <Link to={`/app/hospitals/${encodeURIComponent(hospital.id)}`} className={cls}>{body}</Link>
}

/** Compact row used on the dashboard: distance tile, name, pills. */
export function HospitalRow({ hospital: h }: { hospital: Hospital }) {
  return (
    <Link to={`/app/hospitals/${encodeURIComponent(h.id)}`} className="tile flex items-center gap-3.5 p-3.5 text-ink no-underline">
      <span className="heading grid size-12 shrink-0 place-items-center rounded-[14px] bg-brand-soft text-center text-[15px] leading-[1.05] text-brand-3">
        {h.distanceKm !== null ? <span>{h.distanceKm < 10 ? h.distanceKm.toFixed(1) : Math.round(h.distanceKm)}<br /><span className="text-[11px] font-semibold">km</span></span> : '–'}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-semibold">{h.name}</span>
        <span className="mt-0.5 block truncate text-[13px] text-ink-3">{ownershipLabel(h)}</span>
      </span>
      <span className="hidden sm:block"><HospitalPills hospital={h} max={2} /></span>
    </Link>
  )
}
