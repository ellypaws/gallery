type LoadingDialProps = {
  className?: string
  progress?: number | null
}

export function LoadingDial({ className = '', progress = null }: LoadingDialProps) {
  const radius = 17
  const circumference = 2 * Math.PI * radius
  const isDeterminate = progress !== null && progress !== undefined
  const dashOffset = isDeterminate
    ? circumference * (1 - Math.max(0, Math.min(100, progress)) / 100)
    : circumference * 0.68

  return (
    <div
      className={`inline-flex items-center justify-center border border-[var(--line-strong)] bg-[var(--button-fill)] p-1 ${className}`}
      style={{ boxShadow: 'inset 1px 1px 0 var(--bevel-light), inset -1px -1px 0 var(--bevel-dark)' }}
    >
      <svg
        className={`h-10 w-10 origin-center text-[var(--accent-strong)] ${!isDeterminate ? 'animate-spin' : '-rotate-90'}`}
        viewBox="0 0 44 44"
        aria-hidden="true"
      >
        <circle
          cx="22"
          cy="22"
          r={radius}
          fill="none"
          stroke="var(--viewer-track)"
          strokeWidth="4"
        />
        <circle
          cx="22"
          cy="22"
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth="4"
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          strokeLinecap="square"
          className={isDeterminate ? 'transition-all duration-300 ease-out' : ''}
        />
      </svg>
    </div>
  )
}
