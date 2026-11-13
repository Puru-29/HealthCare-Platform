import { ArrowUpRight } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { Link } from 'react-router-dom'

type FeatureCardProps = {
  description: string
  icon: LucideIcon
  label: string
  to: string
  variant?: 'default' | 'emergency'
}

export function FeatureCard({
  description,
  icon: Icon,
  label,
  to,
  variant = 'default',
}: FeatureCardProps) {
  const content = (
    <>
      <div className="flex items-start justify-between">
        <span
          className={`grid size-11 place-items-center rounded-2xl ${
            variant === 'emergency'
              ? 'bg-emergency-600 text-white'
              : 'bg-sage-100 text-forest-900'
          }`}
        >
          <Icon aria-hidden="true" size={22} strokeWidth={1.8} />
        </span>
        <ArrowUpRight
          aria-hidden="true"
          className={`transition group-hover:-translate-y-0.5 group-hover:translate-x-0.5 ${
            variant === 'emergency'
              ? 'text-emergency-700'
              : 'text-ink-400 group-hover:text-forest-800'
          }`}
          size={19}
        />
      </div>
      <h3
        className={`mt-4 text-base font-semibold tracking-tight ${
          variant === 'emergency' ? 'text-emergency-700' : 'text-ink-900'
        }`}
      >
        {label}
      </h3>
      <p className="mt-1 text-xs leading-5 text-ink-600">{description}</p>
    </>
  )

  const className =
    `glass-card glass-card--interactive group block p-4 transition duration-200 hover:-translate-y-0.5 hover:border-white sm:p-5 ${
      variant === 'emergency' ? 'glass-card--emergency' : ''
    }`

  return to.startsWith('tel:') ? (
    <a aria-label={`${label}: ${description}`} className={className} href={to}>
      {content}
    </a>
  ) : (
    <Link className={className} to={to}>
      {content}
    </Link>
  )
}
