type LoadingDialProps = {
  className?: string
}

export function LoadingDial({ className = '' }: LoadingDialProps) {
  const radius = 18
  const circumference = 2 * Math.PI * radius
  const dashOffset = circumference * 0.75

  return (
    <svg className={`h-11 w-11 animate-spin ${className}`} viewBox="0 0 44 44" aria-hidden="true">
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
