import { AlertTriangle, BadgeCheck, Loader2, Phone, ShieldCheck } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { cx, isDialable, tel } from '../lib/format'

/** Slowly drifting colour glows behind the glass. Fixed, decorative, motion-safe. */
export function Aurora({ tone = 'teal' }: { tone?: 'teal' | 'sos' }) {
  return (
    <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden" aria-hidden="true">
      <div className="blob b1" style={{ width: 540, height: 540, left: -160, top: 160, background: '#5eead4', opacity: 0.5 }} />
      <div className="blob b2" style={{ width: 500, height: 500, right: '6%', top: -120, background: tone === 'sos' ? '#fda4af' : '#a5b4fc', opacity: 0.5 }} />
      <div className="blob b3" style={{ width: 380, height: 380, left: '42%', top: 260, background: '#fda4af', opacity: 0.35 }} />
      <div className="blob b1" style={{ width: 420, height: 420, right: -60, bottom: -100, background: '#67e8f9', opacity: 0.45 }} />
    </div>
  )
}

export function Logo({ to = '/', size = 'md' }: { to?: string; size?: 'md' | 'lg' }) {
  const box = size === 'lg' ? 'size-11 rounded-[14px]' : 'size-10 rounded-[13px]'
  return (
    <Link to={to} className="inline-flex items-center gap-2.5 text-ink no-underline">
      <span className={cx('grid place-items-center shadow-[0_6px_22px_rgb(45_212_191/0.5)]', box)} style={{ background: 'linear-gradient(135deg,#2dd4bf,#0f766e)' }}>
        <svg viewBox="0 0 24 24" className="size-[18px]" fill="#fff" aria-hidden="true"><path d="M9.5 3h5v6.5H21v5h-6.5V21h-5v-6.5H3v-5h6.5z" /></svg>
      </span>
      <span className={cx('heading', size === 'lg' ? 'text-xl' : 'text-lg')}>CarePath <span className="font-medium text-ink-3">Sonipat</span></span>
    </Link>
  )
}

export function Spinner({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-10 text-sm text-ink-3" role="status">
      <Loader2 className="size-4 animate-spin" aria-hidden /> {label}
    </div>
  )
}

export function ErrorNote({ children, onRetry }: { children: ReactNode; onRetry?: () => void }) {
  return (
    <div className="flex items-start gap-3 rounded-2xl border border-sos/40 bg-sos-soft p-3.5 text-sm text-sos-dark" role="alert">
      <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
      <div className="flex-1">{children}</div>
      {onRetry && <button className="font-semibold underline" onClick={onRetry}>Retry</button>}
    </div>
  )
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="card p-8 text-center">
      <p className="heading text-lg">{title}</p>
      {children && <div className="mt-1 text-sm text-ink-2">{children}</div>}
    </div>
  )
}

const PILL = {
  mint: 'bg-brand-soft text-brand-3',
  ok: 'bg-ok-soft text-ok',
  sos: 'bg-sos-soft text-sos-dark',
  amber: 'bg-amber-soft text-amber',
  sky: 'bg-sky-soft text-sky',
  cyan: 'bg-cyan-soft text-cyan',
  muted: 'bg-fill text-ink-2',
} as const
export type PillTone = keyof typeof PILL

export function Pill({ tone = 'muted', children, className, title }: { tone?: PillTone; children: ReactNode; className?: string; title?: string }) {
  return <span className={cx('chip', PILL[tone], className)} title={title}>{children}</span>
}

export function PmjayBadge() {
  return <Pill tone="ok" title="Empanelled under Ayushman Bharat PM-JAY — cashless for card holders"><ShieldCheck className="size-3" aria-hidden /> Ayushman</Pill>
}

export function VerifiedBadge() {
  return <Pill tone="mint" title="Details confirmed by the hospital"><BadgeCheck className="size-3" aria-hidden /> Verified on CarePath</Pill>
}

export function CallButton({ phone, label = 'Call', className, variant = 'secondary' }: { phone: string | null | undefined; label?: string; className?: string; variant?: 'secondary' | 'primary' | 'danger' }) {
  if (!isDialable(phone)) return null
  return (
    <a href={tel(phone)} className={cx(`btn-${variant}`, className)}>
      <Phone className="size-4" aria-hidden /> {label}
    </a>
  )
}

/** Glass panel with a heading row. */
export function Panel({ title, eyebrow, action, children, className }: { title?: string; eyebrow?: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cx('card p-5 sm:p-6', className)}>
      {(title || eyebrow || action) && (
        <div className="mb-4 flex items-center justify-between gap-3">
          {eyebrow ? <p className="eyebrow">{eyebrow}</p> : <h2 className="heading text-xl">{title}</h2>}
          {action}
        </div>
      )}
      {children}
    </section>
  )
}

export function PageHeader({ title, subtitle, children }: { title: string; subtitle?: ReactNode; children?: ReactNode }) {
  return (
    <header className="fu flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="heading text-3xl sm:text-[34px]">{title}</h1>
        {subtitle && <p className="mt-1.5 text-[15px] text-ink-2">{subtitle}</p>}
      </div>
      {children}
    </header>
  )
}

export function EmergencyNumbers({ variant = 'row' }: { variant?: 'row' | 'compact' }) {
  if (variant === 'compact') {
    return (
      <div className="grid grid-cols-2 gap-2">
        <a href="tel:112" className="grid min-h-11 place-items-center rounded-xl bg-white/16 font-bold text-white">112</a>
        <a href="tel:108" className="grid min-h-11 place-items-center rounded-xl bg-white/16 font-bold text-white">108</a>
      </div>
    )
  }
  return (
    <div className="flex flex-wrap justify-center gap-2.5">
      <a href="tel:112" className="btn-secondary">Call 112</a>
      <a href="tel:108" className="btn-secondary">Ambulance 108</a>
      <a href="tel:102" className="btn-secondary">102 Mother & child</a>
    </div>
  )
}

/** Small round icon tile used on feature and quick-action cards. */
export function IconTile({ tone, children, size = 'md' }: { tone: 'mint' | 'sos' | 'cyan' | 'sky' | 'ok' | 'amber'; children: ReactNode; size?: 'md' | 'lg' }) {
  // Solid tiles so white icons stay readable on light glass.
  const styles: Record<typeof tone, string> = {
    mint: 'bg-[linear-gradient(135deg,rgb(84_210_190),rgb(58_145_131))] border-[rgb(94_234_212/0.45)]',
    sos: 'bg-[linear-gradient(135deg,rgb(229_81_85),rgb(158_55_58))] border-[rgb(255_138_141/0.45)]',
    cyan: 'bg-[linear-gradient(135deg,rgb(30_189_214),rgb(21_130_147))] border-[rgb(103_232_249/0.45)]',
    sky: 'bg-[linear-gradient(135deg,rgb(148_162_226),rgb(102_111_156))] border-[rgb(165_180_252/0.45)]',
    ok: 'bg-[linear-gradient(135deg,rgb(14_166_116),rgb(9_114_79))] border-[rgb(110_231_183/0.45)]',
    amber: 'bg-[linear-gradient(135deg,rgb(225_171_32),rgb(155_118_22))] border-[rgb(252_211_77/0.45)]',
  }
  return <span className={cx('grid shrink-0 place-items-center border text-white shadow-[0_6px_16px_rgb(15_70_60/0.15)]', size === 'lg' ? 'size-13 rounded-2xl' : 'size-11.5 rounded-[14px]', styles[tone])}>{children}</span>
}
