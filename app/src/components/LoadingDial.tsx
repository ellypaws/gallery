type LoadingDialProps = {
  progress: number
  className?: string
}

export function LoadingDial({ progress, className = '' }: LoadingDialProps) {
  const clampedProgress = Math.max(0, Math.min(progress, 1))
  const percent = Math.round(clampedProgress * 100)
  const radius = 18
  const circumference = 2 * Math.PI * radius
  const dashOffset = circumference * (1 - clampedProgress)

  return (
    <div
      className={`flex items-center justify-center rounded-md border border-white/12 bg-black/42 p-2 shadow-[0_12px_40px_rgba(0,0,0,0.25)] backdrop-blur-md ${className}`}
    >
      <div className="relative h-11 w-11">
        <svg className="h-11 w-11 -rotate-90" viewBox="0 0 44 44" aria-hidden="true">
          <circle
            cx="22"
            cy="22"
            r={radius}
            fill="none"
            stroke="rgba(127,127,127,0.22)"
            strokeWidth="3"
          />
          <circle
            cx="22"
            cy="22"
            r={radius}
            fill="none"
            stroke="rgba(255,255,255,0.92)"
            strokeWidth="3"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={dashOffset}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center text-[11px] font-semibold text-white">
          {percent}
        </div>
      </div>
    </div>
  )
}
