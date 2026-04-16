type LoadingDialProps = {
  progress: number
  className?: string
}

export function LoadingDial({ progress, className = '' }: LoadingDialProps) {
  const clampedProgress = Math.max(0, Math.min(progress, 1))
  const radius = 18
  const circumference = 2 * Math.PI * radius
  const dashOffset = circumference * (1 - clampedProgress)

  return (
    <svg className={`h-11 w-11 -rotate-90 ${className}`} viewBox="0 0 44 44" aria-hidden="true">
      <circle
        cx="22"
        cy="22"
        r={radius}
        fill="none"
        stroke="rgba(255,255,255,0.14)"
        strokeWidth="3"
      />
      <circle
        cx="22"
        cy="22"
        r={radius}
        fill="none"
        stroke="rgba(255,255,255,0.96)"
        strokeWidth="3"
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={dashOffset}
      />
    </svg>
  )
}
