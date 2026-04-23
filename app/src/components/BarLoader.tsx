type BarLoaderProps = {
  className?: string
  label?: string
}

const SEGMENT_COUNT = 18

export function BarLoader({ className = '', label = '' }: BarLoaderProps) {
  return (
    <div
      className={`bar-loader bp-panel inline-flex flex-col gap-2 p-2 ${className}`}
      role="status"
      aria-label={label}
    >
      <div className="bp-inset bar-loader-track">
        {Array.from({ length: SEGMENT_COUNT }, (_, index) => (
          <span
            key={index}
            className="bar-loader-segment"
            style={{ animationDelay: `${(index / SEGMENT_COUNT) * 1.5}s` }}
          />
        ))}
      </div>
      {label && <span className="bar-loader-label">{label}</span>}
    </div>
  )
}
