type LoadingDialProps = {
  className?: string
  progress?: number | null
}

export function LoadingDial({ className = '', progress = null }: LoadingDialProps) {
  const radius = 18
  const circumference = 2 * Math.PI * radius
  const isDeterminate = progress !== null && progress !== undefined
  const dashOffset = isDeterminate
    ? circumference * (1 - Math.max(0, Math.min(100, progress)) / 100)
    : circumference * 0.75

  return (
    <svg className={`h-11 w-11 origin-center ${!isDeterminate ? 'animate-spin' : '-rotate-90'} ${className}`} viewBox="0 0 44 44" aria-hidden="true">
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
        className={isDeterminate ? 'transition-all duration-300 ease-out' : ''}
      />
    </svg>
  )
}
