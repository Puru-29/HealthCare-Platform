import { AlertTriangle, BadgeCheck, Loader2, Phone, ShieldCheck } from 'lucide-react'
import type { ReactNode } from 'react'
import { cx, isDialable, tel } from '../lib/format'

export function Spinner({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-10 text-sm text-ink-3" role="status">
      <Loader2 className="size-4 animate-spin" aria-hidden /> {label}
    </div>
  )
}

export function ErrorNote({ children, onRetry }: { children: ReactNode; onRetry?: () => void }) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-sos/20 bg-sos-soft p-3 text-sm text-sos-dark" role="alert">
      <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
      <div className="flex-1">{children}</div>
      {onRetry && <button className="font-semibold underline" onClick={onRetry}>Retry</button>}
    </div>
  )
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="card p-8 text-center">
      <p className="font-semibold">{title}</p>
      {children && <div className="mt-1 text-sm text-ink-2">{children}</div>}
    </div>
  )
}

export function PmjayBadge() {
  return (
    <span className="chip bg-amber-soft text-amber" title="Empanelled under Ayushman Bharat PM-JAY — cashless for card holders">
      <ShieldCheck className="size-3" aria-hidden /> Ayushman
    </span>
  )
}

export function VerifiedBadge() {
  return (
    <span className="chip bg-brand-soft text-brand" title="Details confirmed by the hospital">
      <BadgeCheck className="size-3" aria-hidden /> Verified
    </span>
  )
}

export function CallButton({ phone, label = 'Call', className, variant = 'secondary' }: { phone: string | null | undefined; label?: string; className?: string; variant?: 'secondary' | 'primary' | 'danger' }) {
  if (!isDialable(phone)) return null
  return (
    <a href={tel(phone)} className={cx(`btn-${variant}`, className)}>
      <Phone className="size-4" aria-hidden /> {label}
    </a>
  )
}

export function Section({ title, action, children, className }: { title: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cx('space-y-3', className)}>
      <div className="flex items-end justify-between gap-2">
        <h2 className="text-base font-semibold">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  )
}

export function EmergencyNumbers() {
  const numbers = [
    { n: '112', l: 'Emergency' },
    { n: '108', l: 'Ambulance' },
    { n: '102', l: 'Mother & child' },
  ]
  return (
    <div className="grid grid-cols-3 gap-2">
      {numbers.map(({ n, l }) => (
        <a key={n} href={`tel:${n}`} className="card flex flex-col items-center py-2.5 transition hover:border-sos/40 hover:bg-sos-soft">
          <span className="text-lg font-bold text-sos">{n}</span>
          <span className="text-[11px] text-ink-2">{l}</span>
        </a>
      ))}
    </div>
  )
}
