type LoadingDialProps = {
  loaded: number
  total: number
}

export function LoadingDial({ loaded, total }: LoadingDialProps) {
  const clampedTotal = total || 1
  const progress = Math.max(0, Math.min(loaded / clampedTotal, 1))
  const percent = Math.round(progress * 100)
  const radius = 18
  const circumference = 2 * Math.PI * radius
  const dashOffset = circumference * (1 - progress)

  return (
    <div className="fixed right-4 top-4 z-50 flex items-center gap-3 rounded-md border border-[var(--line)] bg-[var(--surface-strong)] px-3 py-2 shadow-[var(--shadow)] backdrop-blur-md">
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
            stroke="var(--accent)"
            strokeWidth="3"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={dashOffset}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center text-[11px] font-semibold text-[var(--text)]">
          {percent}
        </div>
      </div>
      <div className="leading-none">
        <p className="text-[10px] uppercase tracking-[0.2em] text-[var(--muted)]">Loading</p>
        <p className="mt-1 text-sm font-medium text-[var(--text)]">
          {loaded}/{total}
        </p>
      </div>
    </div>
  )
}
