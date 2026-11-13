import { AlertCircle, SearchX } from 'lucide-react'
import { GlassCard } from './GlassCard'
import { LoadingSkeleton } from './LoadingSkeleton'

type DirectoryStateProps = {
  message: string
  title: string
  type: 'loading' | 'empty' | 'error'
}

const icons = {
  empty: SearchX,
  error: AlertCircle,
}

export function DirectoryState({ message, title, type }: DirectoryStateProps) {
  const Icon = type === 'loading' ? null : icons[type]
  const iconClass =
    type === 'error' ? 'text-emergency-700' : 'text-forest-700'

  return (
    <GlassCard
      aria-live={type === 'loading' ? 'polite' : 'assertive'}
      className={`directory-state flex flex-col items-center px-6 py-10 text-center ${
        type === 'error' ? 'glass-card--emergency' : ''
      }`}
      role={type === 'error' ? 'alert' : 'status'}
    >
      {Icon ? <Icon aria-hidden="true" className={`mb-3 ${iconClass}`} size={25} /> : null}
      <h2 className="text-base font-semibold text-forest-950">{title}</h2>
      <p className="mt-2 max-w-lg text-sm leading-6 text-ink-600">{message}</p>
      {type === 'loading' && (
        <div className="directory-skeleton-list">
          {[0, 1, 2].map((item) => (
            <div className="directory-skeleton-row" key={item}>
              <LoadingSkeleton className="directory-skeleton-icon" />
              <span className="directory-skeleton-copy">
                <LoadingSkeleton className="directory-skeleton-title" />
                <LoadingSkeleton className="directory-skeleton-description" />
              </span>
            </div>
          ))}
        </div>
      )}
    </GlassCard>
  )
}
