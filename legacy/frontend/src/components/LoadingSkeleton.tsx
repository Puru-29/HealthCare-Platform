type LoadingSkeletonProps = {
  className?: string
}

export function LoadingSkeleton({ className = '' }: LoadingSkeletonProps) {
  return <span aria-hidden="true" className={`loading-skeleton ${className}`.trim()} />
}
