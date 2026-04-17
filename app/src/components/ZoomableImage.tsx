import { useLayoutEffect, useRef, useState } from 'react'
import { ZoomIn, ZoomOut } from 'lucide-react'

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

  const current = useRef({ x: 0, y: 0, scale: 1 })
  const target = useRef({ x: 0, y: 0, scale: 1 })
  const dragging = useRef(false)
  const lastPos = useRef({ x: 0, y: 0 })

  const [isZoomed, setIsZoomed] = useState(false)

  // The lerp loop
  useLayoutEffect(() => {
    let rafId: number
    const loop = () => {
      current.current.x += (target.current.x - current.current.x) * 0.15
      current.current.y += (target.current.y - current.current.y) * 0.15
      current.current.scale += (target.current.scale - current.current.scale) * 0.15

      if (imgRef.current) {
        imgRef.current.style.transform = `translate3d(${current.current.x}px, ${current.current.y}px, 0) scale(${current.current.scale})`
      }

      // Position update loop logic only
      rafId = requestAnimationFrame(loop)
    }
    loop()
    return () => cancelAnimationFrame(rafId)
  }, [isZoomed])

  const getBounds = (scale: number) => {
    if (!containerRef.current) return { maxPanX: 0, maxPanY: 0, imgW: 0, imgH: 0, W: 0, H: 0 }
    const W = containerRef.current.clientWidth
    const H = containerRef.current.clientHeight
    const ratio = naturalWidth / naturalHeight
    const cRatio = W / H

    let imgW = W
    let imgH = H
    if (ratio > cRatio) {
      imgH = W / ratio
    } else {
      imgW = H * ratio
    }

    const maxPanX = Math.max(0, (imgW * scale - W) / 2)
    const maxPanY = Math.max(0, (imgH * scale - H) / 2)

    return { maxPanX, maxPanY, imgW, imgH, W, H }
  }

  const clampTarget = (scale: number) => {
    const { maxPanX, maxPanY } = getBounds(scale)
    target.current.x = Math.max(-maxPanX, Math.min(maxPanX, target.current.x))
    target.current.y = Math.max(-maxPanY, Math.min(maxPanY, target.current.y))
  }

  const handleZoomToggle = (e?: React.MouseEvent) => {
    if (e) {
      e.stopPropagation()
      e.preventDefault()
    }
    if (target.current.scale > 1) {
      target.current.scale = 1
      target.current.x = 0
      target.current.y = 0
      setIsZoomed(false)
    } else {
      // Determine what scale to jump to. Full 1:1 or fill the screen
      if (!containerRef.current) return
      const W = containerRef.current.clientWidth
      const H = containerRef.current.clientHeight
      const fitScale = Math.max(naturalWidth / W, naturalHeight / H)
      // Usually 3x zoom is good, or 1:1 pixel mapping
      target.current.scale = Math.max(2, Math.min(fitScale, 4))
      setIsZoomed(true)
    }
    clampTarget(target.current.scale)
  }

  const handleWheel = (e: React.WheelEvent) => {
    e.stopPropagation()
    const zoomDir = e.deltaY < 0 ? 1 : -1
    const zoomFactor = 0.3
    
    let newScale = target.current.scale + zoomDir * zoomFactor * target.current.scale
    newScale = Math.max(1, Math.min(newScale, 10))

    if (newScale === 1) {
      target.current.x = 0
      target.current.y = 0
      setIsZoomed(false)
    } else {
      setIsZoomed(true)
    }

    // Zooming towards pointer
    if (!containerRef.current) return
    const rect = containerRef.current.getBoundingClientRect()
    // pointer position relative to center of container
    const ptX = e.clientX - rect.left - rect.width / 2
    const ptY = e.clientY - rect.top - rect.height / 2

    // Adjust target x/y so the point under cursor remains under cursor
    const scaleRatio = newScale / target.current.scale
    target.current.x = ptX - (ptX - target.current.x) * scaleRatio
    target.current.y = ptY - (ptY - target.current.y) * scaleRatio

    target.current.scale = newScale
    clampTarget(newScale)
  }

  const handlePointerDown = (e: React.PointerEvent) => {
    if (target.current.scale <= 1) return
    e.stopPropagation()
    dragging.current = true
    lastPos.current = { x: e.clientX, y: e.clientY }
    // setPointerCapture so we can drag outside
    if (containerRef.current) containerRef.current.setPointerCapture(e.pointerId)
  }

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!dragging.current || target.current.scale <= 1) return
    e.stopPropagation()
    const dx = e.clientX - lastPos.current.x
    const dy = e.clientY - lastPos.current.y
    lastPos.current = { x: e.clientX, y: e.clientY }
    target.current.x += dx
    target.current.y += dy
    clampTarget(target.current.scale)
  }

  const handlePointerUp = (e: React.PointerEvent) => {
    if (!dragging.current) return
    e.stopPropagation()
    dragging.current = false
    if (containerRef.current) containerRef.current.releasePointerCapture(e.pointerId)
  }

  // Minimap logic
  useLayoutEffect(() => {
    const updateMinimap = () => {
      const minimapView = document.getElementById('minimap-viewport')
      if (minimapView && isZoomed && containerRef.current) {
        const { imgW, imgH, W, H } = getBounds(current.current.scale)
        // Scaled image actual pixel bounds
        const scaledImgW = imgW * current.current.scale
        const scaledImgH = imgH * current.current.scale
        
        // Viewport rect against scaled image
        const viewW = W
        const viewH = H
        
        // Where is the center of the viewport relative to the image center?
        // It's just -current.x and -current.y
        const relX = -current.current.x
        const relY = -current.current.y
        
        // Map everything to percentage [0, 1] relative to the overall scaled image
        const pctW = Math.min(1, viewW / scaledImgW)
        const pctH = Math.min(1, viewH / scaledImgH)
        
        const ptX = (relX + scaledImgW / 2 - viewW / 2) / scaledImgW
        const ptY = (relY + scaledImgH / 2 - viewH / 2) / scaledImgH

        minimapView.style.width = `${pctW * 100}%`
        minimapView.style.height = `${pctH * 100}%`
        minimapView.style.left = `${ptX * 100}%`
        minimapView.style.top = `${ptY * 100}%`
      }
    }

    if (isZoomed) {
      let raf: number
      const loop = () => {
        updateMinimap()
        raf = requestAnimationFrame(loop)
      }
      loop()
      return () => cancelAnimationFrame(raf)
    }
  }, [isZoomed])

  return (
    <div
      ref={containerRef}
      className={`relative flex h-full w-full items-center justify-center overflow-hidden ${className || ''}`}
      onDoubleClick={handleZoomToggle}
      onClick={(e) => e.stopPropagation()}
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
        onDragStart={(e) => e.preventDefault()}
        className="pointer-events-none relative z-[1] h-full w-full object-contain transition-opacity duration-300"
        style={{ willChange: 'transform' }}
      />
      
      <div 
        className={`pointer-events-none absolute bottom-5 right-5 z-20 flex flex-col items-end gap-3 transition-opacity duration-300 ${isZoomed ? 'opacity-100' : 'opacity-0'}`}
      >
        <div className="pointer-events-auto flex gap-1 rounded-md border border-white/15 bg-black/30 p-1 text-white shadow-lg backdrop-blur-md">
          <button type="button" onClick={(e) => { e.stopPropagation(); target.current.scale = Math.max(1, target.current.scale - 0.5); if(target.current.scale === 1) setIsZoomed(false); clampTarget(target.current.scale) }} className="rounded hover:bg-white/10 p-1">
            <ZoomOut className="h-4 w-4" />
          </button>
          <button type="button" onClick={(e) => { e.stopPropagation(); target.current.scale = Math.min(10, target.current.scale + 0.5); setIsZoomed(true); clampTarget(target.current.scale) }} className="rounded hover:bg-white/10 p-1">
            <ZoomIn className="h-4 w-4" />
          </button>
        </div>

        <div className="pointer-events-auto relative overflow-hidden rounded-md border border-white/15 bg-black/50 shadow-xl backdrop-blur-md">
          <img src={src} className="h-24 w-auto object-contain opacity-60" style={{ maxWidth: '160px' }} />
          <div id="minimap-viewport" className="pointer-events-none absolute border border-white/80 bg-white/10 shadow-[0_0_0_999px_rgba(0,0,0,0.4)]" />
        </div>
      </div>
    </div>
  )
}
