import {
  ArrowRight,
  Activity,
  Brain,
  Bone,
  Heart,
  PersonStanding,
  Stethoscope,
  type LucideIcon,
} from 'lucide-react'
import { Link } from 'react-router-dom'

const icons: Record<string, LucideIcon> = {
  heart: Heart,
  skin: Activity,
  child: PersonStanding,
  bone: Bone,
  brain: Brain,
  stethoscope: Stethoscope,
}

type SpecialtyCardProps = {
  description: string
  icon: string
  name: string
  basePath?: string
}

export function SpecialtyCard({ description, icon, name, basePath = '' }: SpecialtyCardProps) {
  const Icon = icons[icon] ?? Stethoscope

  return (
    <Link
      className="glass-card glass-card--interactive group flex items-center gap-4 p-4 transition duration-200 hover:-translate-y-0.5 hover:bg-white/85"
      to={`${basePath}/doctors?specialty=${encodeURIComponent(name)}`}
    >
      <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-sage-100 text-forest-800">
        <Icon aria-hidden="true" size={20} strokeWidth={1.8} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-forest-950">{name}</span>
        <span className="mt-0.5 block text-xs text-ink-600">{description}</span>
      </span>
      <ArrowRight
        aria-hidden="true"
        className="shrink-0 text-ink-400 transition group-hover:translate-x-0.5 group-hover:text-forest-700"
        size={17}
      />
    </Link>
  )
}
