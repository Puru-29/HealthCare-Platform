import type { HTMLAttributes, PropsWithChildren } from 'react'

type GlassCardProps = PropsWithChildren<HTMLAttributes<HTMLElement> & {
  as?: 'article' | 'div' | 'section'
}>

export function GlassCard({
  as: Element = 'div',
  children,
  className = '',
  ...props
}: GlassCardProps) {
  return (
    <Element className={`glass-card ${className}`.trim()} {...props}>
      {children}
    </Element>
  )
}
