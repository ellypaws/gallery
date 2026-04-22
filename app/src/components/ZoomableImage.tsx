import { useLayoutEffect, useRef, useState } from 'react'
import { RotateCcw, ZoomIn, ZoomOut } from 'lucide-react'

type ZoomableImageProps = {
  src: string
  alt: string
  naturalWidth: number
  naturalHeight: number
  className?: string
  onLoad?: () => void
}

export function ZoomableImage({ src, alt, naturalWidth, naturalHeight, className, onLoad }: ZoomableImageProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const imgRef = useRef<HTMLImageElement>(null)
  const minimapViewportRef = useRef<HTMLDivElement>(null)

  const current = useRef({ x: 0, y: 0, scale: 1 })
  const target = useRef({ x: 0, y: 0, scale: 1 })
  const dragging = useRef(false)
  const lastPos = useRef({ x: 0, y: 0 })

  const [isZoomed, setIsZoomed] = useState(false)
  const [zoomPercent, setZoomPercent] = useState(100)

  useLayoutEffect(() => {
    let rafId: number
    const loop = () => {
      current.current.x += (target.current.x - current.current.x) * 0.15
      current.current.y += (target.current.y - current.current.y) * 0.15
      current.current.scale += (target.current.scale - current.current.scale) * 0.15

      if (imgRef.current) {
        imgRef.current.style.transform = `translate3d(${current.current.x}px, ${current.current.y}px, 0) scale(${current.current.scale})`
      }

      rafId = requestAnimationFrame(loop)
    }

    loop()
    return () => cancelAnimationFrame(rafId)
  }, [isZoomed])

  const syncZoomState = (scale: number) => {
    setIsZoomed(scale > 1.001)
    setZoomPercent(Math.round(scale * 100))
  }

  const clampTarget = (scale: number) => {
    const { maxPanX, maxPanY } = getBounds(scale, containerRef.current, naturalWidth, naturalHeight)
    target.current.x = Math.max(-maxPanX, Math.min(maxPanX, target.current.x))
    target.current.y = Math.max(-maxPanY, Math.min(maxPanY, target.current.y))
  }

  const resetZoom = () => {
    target.current.scale = 1
    target.current.x = 0
    target.current.y = 0
    clampTarget(1)
    syncZoomState(1)
  }

  const applyScale = (nextScale: number) => {
    target.current.scale = Math.max(1, Math.min(nextScale, 10))
    if (target.current.scale === 1) {
      target.current.x = 0
      target.current.y = 0
    }
    clampTarget(target.current.scale)
    syncZoomState(target.current.scale)
  }

  const handleZoomToggle = (event?: React.MouseEvent) => {
    if (event) {
      event.stopPropagation()
      event.preventDefault()
    }

    if (target.current.scale > 1) {
      resetZoom()
      return
    }

    if (!containerRef.current) return
    const width = containerRef.current.clientWidth
    const height = containerRef.current.clientHeight
    const fitScale = Math.max(naturalWidth / width, naturalHeight / height)
    applyScale(Math.max(2, Math.min(fitScale, 4)))
  }

  const handleWheel = (event: React.WheelEvent) => {
    event.stopPropagation()
    const zoomDir = event.deltaY < 0 ? 1 : -1
    const zoomFactor = 0.3

    let nextScale = target.current.scale + zoomDir * zoomFactor * target.current.scale
    nextScale = Math.max(1, Math.min(nextScale, 10))

    if (!containerRef.current) return
    const rect = containerRef.current.getBoundingClientRect()
    const pointX = event.clientX - rect.left - rect.width / 2
    const pointY = event.clientY - rect.top - rect.height / 2
    const scaleRatio = nextScale / target.current.scale

    target.current.x = pointX - (pointX - target.current.x) * scaleRatio
    target.current.y = pointY - (pointY - target.current.y) * scaleRatio
    applyScale(nextScale)

    if (nextScale === 1) {
      target.current.x = 0
      target.current.y = 0
    }
  }

  const handlePointerDown = (event: React.PointerEvent) => {
    if (target.current.scale <= 1) return
    event.stopPropagation()
    dragging.current = true
    lastPos.current = { x: event.clientX, y: event.clientY }
    containerRef.current?.setPointerCapture(event.pointerId)
  }

  const handlePointerMove = (event: React.PointerEvent) => {
    if (!dragging.current || target.current.scale <= 1) return
    event.stopPropagation()

    const dx = event.clientX - lastPos.current.x
    const dy = event.clientY - lastPos.current.y
    lastPos.current = { x: event.clientX, y: event.clientY }
    target.current.x += dx
    target.current.y += dy
    clampTarget(target.current.scale)
  }

  const handlePointerUp = (event: React.PointerEvent) => {
    if (!dragging.current) return
    event.stopPropagation()
    dragging.current = false
    containerRef.current?.releasePointerCapture(event.pointerId)
  }

  useLayoutEffect(() => {
    if (!isZoomed) {
      return
    }

    let rafId: number
    const updateMinimap = () => {
      const minimapViewport = minimapViewportRef.current
      if (!minimapViewport || !containerRef.current) {
        return
      }

      const { imgW, imgH, width, height } = getBounds(current.current.scale, containerRef.current, naturalWidth, naturalHeight)
      const scaledImgW = imgW * current.current.scale
      const scaledImgH = imgH * current.current.scale
      const viewW = width
      const viewH = height
      const relX = -current.current.x
      const relY = -current.current.y
      const pctW = Math.min(1, viewW / scaledImgW)
      const pctH = Math.min(1, viewH / scaledImgH)
      const ptX = (relX + scaledImgW / 2 - viewW / 2) / scaledImgW
      const ptY = (relY + scaledImgH / 2 - viewH / 2) / scaledImgH

      minimapViewport.style.width = `${pctW * 100}%`
      minimapViewport.style.height = `${pctH * 100}%`
      minimapViewport.style.left = `${ptX * 100}%`
      minimapViewport.style.top = `${ptY * 100}%`
    }

    const loop = () => {
      updateMinimap()
      rafId = requestAnimationFrame(loop)
    }

    loop()
    return () => cancelAnimationFrame(rafId)
  }, [isZoomed, naturalHeight, naturalWidth])

  return (
    <div
      ref={containerRef}
      className={`relative flex h-full w-full items-center justify-center overflow-hidden bg-[linear-gradient(180deg,rgba(255,255,255,0.06)_0%,rgba(0,0,0,0.06)_100%)] ${className || ''}`}
      onDoubleClick={handleZoomToggle}
      onClick={(event) => event.stopPropagation()}
      onWheel={handleWheel}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
    >
      <img
        ref={imgRef}
        src={src}
        alt={alt}
        onLoad={onLoad}
        onDragStart={(event) => event.preventDefault()}
        className="pointer-events-none relative z-[1] h-full w-full object-contain transition-opacity duration-300"
        style={{ willChange: 'transform', imageOrientation: 'from-image' }}
      />

      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 bg-[linear-gradient(180deg,transparent_0%,rgba(0,0,0,0.58)_100%)] p-3">
        <div className="pointer-events-auto flex flex-wrap items-center gap-2">
          <div className="forum-button">
            <span className="forum-button-label">Zoom</span>
            <span className="forum-button-note">{zoomPercent}%</span>
          </div>

          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation()
              applyScale(target.current.scale - 0.5)
            }}
            className="forum-button"
          >
            <ZoomOut className="h-4 w-4" />
            <span className="forum-button-label">Out</span>
          </button>

          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation()
              applyScale(target.current.scale + 0.5)
            }}
            className="forum-button"
          >
            <ZoomIn className="h-4 w-4" />
            <span className="forum-button-label">In</span>
          </button>

          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation()
              resetZoom()
            }}
            className="forum-button"
          >
            <RotateCcw className="h-4 w-4" />
            <span className="forum-button-label">Reset</span>
          </button>

          <button
            type="button"
            onClick={handleZoomToggle}
            className="forum-button"
          >
            <span className="forum-button-label">{isZoomed ? 'Fit View' : 'Actual Size'}</span>
          </button>
        </div>

        {isZoomed ? (
          <div className="bp-panel pointer-events-auto mt-3 inline-flex flex-col gap-2 p-2 shadow-xl bg-[rgba(0,0,0,0.36)]">
            <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-white/70">View Window</span>
            <div className="bp-inset relative overflow-hidden bg-black/55">
              <img src={src} alt="" aria-hidden="true" className="h-20 w-auto max-w-[150px] object-contain opacity-60" />
              <div
                ref={minimapViewportRef}
                className="pointer-events-none absolute border border-white/90 bg-white/10 shadow-[0_0_0_999px_rgba(0,0,0,0.35)]"
              />
            </div>
          </div>
        ) : null}
      </div>
    </div>
  )
}

function getBounds(scale: number, container: HTMLDivElement | null, naturalWidth: number, naturalHeight: number) {
  if (!container) {
    return { maxPanX: 0, maxPanY: 0, imgW: 0, imgH: 0, width: 0, height: 0 }
  }

  const width = container.clientWidth
  const height = container.clientHeight
  const ratio = naturalWidth / naturalHeight
  const containerRatio = width / height

  let imgW = width
  let imgH = height
  if (ratio > containerRatio) {
    imgH = width / ratio
  } else {
    imgW = height * ratio
  }

  const maxPanX = Math.max(0, (imgW * scale - width) / 2)
  const maxPanY = Math.max(0, (imgH * scale - height) / 2)

  return { maxPanX, maxPanY, imgW, imgH, width, height }
}
