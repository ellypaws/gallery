import { useEffect, useMemo, useRef, useState } from 'react'
import { gsap } from 'gsap'
import { Aperture, Camera, ChevronLeft, ChevronRight, Clock3, Search, X } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

import type { GalleryItem } from '../lib/types'
import { LoadingDial } from './LoadingDial'
import { ZoomableImage } from './ZoomableImage'

type LightboxProps = {
  photos: GalleryItem[]
  activeIndex: number
  onClose: () => void
  onPrev: () => void
  onNext: () => void
}

type MetaRow = {
  key: string
  label: string
  value: string
  kind?: 'camera' | 'lens' | 'iso'
  icon?: LucideIcon
  isAperture?: boolean
}

export function Lightbox({ photos, activeIndex, onClose, onPrev, onNext }: LightboxProps) {
  const overlayRef = useRef<HTMLDivElement | null>(null)
  const photo = photos[activeIndex]
  const [assetURL, setAssetURL] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [metaStyle, setMetaStyle] = useState({ maxHeight: 1000, opacity: 1, maskImage: 'none' })

  const imgContainerRef = useRef<HTMLDivElement>(null)
  const mobileMetaRef = useRef<HTMLDivElement>(null)
  const desktopMetaRef = useRef<HTMLElement>(null)

  const slideDirectionRef = useRef<number>(1)
  const touchStartRef = useRef<{ x: number; y: number } | null>(null)

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
      if (event.key === 'ArrowLeft') {
        slideDirectionRef.current = -1
        onPrev()
      }
      if (event.key === 'ArrowRight') {
        slideDirectionRef.current = 1
        onNext()
      }
    }

    window.addEventListener('keydown', onKeyDown)
    document.body.style.overflow = 'hidden'
    
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = ''
    }
  }, [onClose, onNext, onPrev])

  useEffect(() => {
    if (!overlayRef.current) {
      return
    }

    const dir = slideDirectionRef.current
    const ctx = gsap.context(() => {
      gsap.fromTo(
        '.lightbox-panel',
        { autoAlpha: 0, x: dir * 40, scale: 0.98 },
        { autoAlpha: 1, x: 0, scale: 1, duration: 0.35, ease: 'power3.out' },
      )
      gsap.fromTo(
        '.lightbox-meta-row',
        { autoAlpha: 0, x: dir * 10 },
        { autoAlpha: 1, x: 0, duration: 0.28, stagger: 0.04, delay: 0.1, ease: 'power2.out' },
      )
    }, overlayRef)

    return () => ctx.revert()
  }, [activeIndex])

  useEffect(() => {
    function updateLayout() {
      if (!imgContainerRef.current) return
      const rect = imgContainerRef.current.getBoundingClientRect()
      const W = rect.width
      const H = rect.height
      if (W === 0 || H === 0) return

      const imgRatio = photo.width / photo.height
      const containerRatio = W / H

      let imgW, imgH
      if (imgRatio > containerRatio) {
        imgW = W
        imgH = W / imgRatio
      } else {
        imgH = H
        imgW = H * imgRatio
      }

      const spaceLeftInContainer = (W - imgW) / 2
      const spaceBottomInContainer = (H - imgH) / 2

      const imgLeftAbsolute = rect.left + spaceLeftInContainer
      const imgBottomAbsolute = window.innerHeight - rect.bottom + spaceBottomInContainer

      const isMobile = window.innerWidth < 768

      let computedMaxHeight = 0
      if (isMobile) {
        computedMaxHeight = imgBottomAbsolute - 20 // placed at bottom-5 (20px)
      } else {
        if (imgLeftAbsolute > 288) {
          computedMaxHeight = window.innerHeight - 64 // placed at bottom-8 (32px), with 32px top padding
        } else {
          computedMaxHeight = imgBottomAbsolute - 32
        }
      }

      const safeMaxHeight = Math.floor(Math.max(0, computedMaxHeight))

      let contentHeight = 0
      if (isMobile && mobileMetaRef.current) {
        contentHeight = mobileMetaRef.current.scrollHeight
      } else if (!isMobile && desktopMetaRef.current) {
        contentHeight = desktopMetaRef.current.scrollHeight
      }

      let mask = 'none'
      if (contentHeight > 0 && safeMaxHeight < contentHeight) {
        mask = 'linear-gradient(to bottom, black calc(100% - 30px), transparent 100%)'
      }

      setMetaStyle({
        maxHeight: safeMaxHeight,
        opacity: safeMaxHeight < 40 ? 0 : 1,
        maskImage: mask,
      })
    }

    updateLayout()
    window.addEventListener('resize', updateLayout)
    return () => window.removeEventListener('resize', updateLayout)
  }, [photo.width, photo.height, activeIndex])

  useEffect(() => {
    setIsLoading(true)
    const sourceURL = photo.originalSrc || photo.src
    setAssetURL(sourceURL)
  }, [photo.id, photo.originalSrc, photo.src])

  const metaRows = useMemo(
    (): MetaRow[] =>
      [
        { key: 'camera', label: 'Camera', value: photo.camera, kind: 'camera' as const },
        { key: 'lens', label: 'Lens', value: photo.lens, kind: 'lens' as const },
        { key: 'aperture', label: 'Aperture', value: formatAperture(photo.aperture), icon: Aperture, isAperture: true },
        { key: 'shutter', label: 'Shutter', value: photo.shutter, icon: Clock3 },
        { key: 'iso', label: 'ISO', value: photo.iso, kind: 'iso' as const },
        { key: 'focal', label: 'Focal Length', value: photo.focalLength, icon: Search },
      ].filter((row) => row.value),
    [photo],
  )

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartRef.current = {
      x: e.touches[0].clientX,
      y: e.touches[0].clientY,
    }
  }

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (!touchStartRef.current) return
    const dx = e.changedTouches[0].clientX - touchStartRef.current.x
    const dy = e.changedTouches[0].clientY - touchStartRef.current.y
    touchStartRef.current = null

    if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 40) {
      if (dx < 0) {
        slideDirectionRef.current = 1
        onNext()
      } else {
        slideDirectionRef.current = -1
        onPrev()
      }
    }
  }

  return (
    <div
      ref={overlayRef}
      onClick={onClose}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      className="fixed inset-0 z-[60] bg-black/88 px-4 py-4 text-white backdrop-blur-sm md:px-6"
      role="dialog"
      aria-modal="true"
      aria-label={photo.alt}
    >
      <img
        src={photo.placeholder || photo.src}
        alt=""
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 h-full w-full scale-110 object-cover blur-3xl opacity-30"
      />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_18%,rgba(0,0,0,0.32)_56%,rgba(0,0,0,0.84)_100%)]" />

      <aside
        ref={desktopMetaRef}
        className="pointer-events-none absolute left-5 bottom-8 z-10 hidden w-[248px] overflow-hidden transition-opacity duration-300 md:flex md:flex-col"
        style={{
          maxHeight: metaStyle.maxHeight,
          opacity: metaStyle.opacity,
          maskImage: metaStyle.maskImage,
          WebkitMaskImage: metaStyle.maskImage,
        }}
      >
        <div className="flex flex-col items-start gap-3">
          {metaRows.map((row) => (
            <div key={row.key} className="lightbox-meta-row flex shrink-0 items-start gap-3 text-white/86">
              <MetaIcon row={row} />
              <div className="flex flex-col items-start gap-0.5">
                <span className="text-[11px] uppercase tracking-[0.14em] text-white/42">{row.label}</span>
                <span className="text-sm leading-5">
                  {row.isAperture ? (
                    <>
                      <span className="italic">f</span>
                      <span className="ml-0.5">{row.value}</span>
                    </>
                  ) : (
                    row.value
                  )}
                </span>
              </div>
            </div>
          ))}
        </div>
      </aside>

      <div className="lightbox-panel mx-auto flex h-full max-w-[1700px] flex-col">
        <div className="flex min-h-0 flex-1 items-center justify-center">
          <div className="relative h-full w-full max-w-[1500px] md:max-w-[min(1500px,calc(100vw-3rem))]">
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation()
                slideDirectionRef.current = -1
                onPrev()
              }}
              className="absolute left-3 top-1/2 z-10 -translate-y-1/2 rounded-md border border-white/15 bg-black/30 p-2 text-white transition hover:border-white/30 hover:bg-black/50"
              aria-label="Previous photo"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation()
                slideDirectionRef.current = 1
                onNext()
              }}
              className="absolute right-3 top-1/2 z-10 -translate-y-1/2 rounded-md border border-white/15 bg-black/30 p-2 text-white transition hover:border-white/30 hover:bg-black/50"
              aria-label="Next photo"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation()
                onClose()
              }}
              className="absolute right-3 top-3 z-10 rounded-md border border-white/15 bg-black/30 p-2 text-white transition hover:border-white/30 hover:bg-black/50"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
            {isLoading ? <LoadingDial className="absolute right-3 top-16 z-10" /> : null}

            <div
              ref={mobileMetaRef}
              className="pointer-events-none fixed bottom-5 left-4 z-10 flex w-[280px] flex-col items-start gap-2 overflow-hidden transition-opacity duration-300 md:hidden"
              style={{
                maxHeight: metaStyle.maxHeight,
                opacity: metaStyle.opacity,
                maskImage: metaStyle.maskImage,
                WebkitMaskImage: metaStyle.maskImage,
              }}
            >
              {metaRows.map((row) => (
                <div key={row.key} className="lightbox-meta-row flex shrink-0 items-start gap-3 text-white/86">
                  <MetaIcon row={row} />
                  <div className="flex flex-col items-start gap-0.5">
                    <span className="text-[11px] uppercase tracking-[0.14em] text-white/42">{row.label}</span>
                    <span className="text-sm leading-5">
                      {row.isAperture ? (
                        <>
                          <span className="italic">f</span>
                          <span className="ml-0.5">{row.value}</span>
                        </>
                      ) : (
                        row.value
                      )}
                    </span>
                  </div>
                </div>
              ))}
            </div>

            <div ref={imgContainerRef} className="relative h-full w-full">
              <ZoomableImage
                key={photo.id}
                src={assetURL || photo.placeholder || photo.src}
                alt={photo.alt}
                naturalWidth={photo.width}
                naturalHeight={photo.height}
                onLoad={() => setIsLoading(false)}
                className={`transition-opacity duration-300 ${isLoading ? 'opacity-0' : 'opacity-100'}`}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function formatAperture(value: string) {
  const trimmed = value.trim()
  if (!trimmed) {
    return ''
  }

  const parts = trimmed.split('/')
  if (parts.length === 2) {
    const numerator = Number(parts[0])
    const denominator = Number(parts[1])
    if (Number.isFinite(numerator) && Number.isFinite(denominator) && denominator !== 0) {
      return (numerator / denominator).toFixed(1).replace(/\.0$/, '')
    }
  }

  return trimmed
}

function MetaIcon({ row }: { row: MetaRow }) {
  if (row.kind === 'iso') {
    return <img src="/iso.svg" alt="" aria-hidden="true" className="mt-[1px] h-4 w-4 shrink-0 invert brightness-200" />
  }
  if (row.kind === 'lens') {
    return <img src="/lens.svg" alt="" aria-hidden="true" className="mt-[1px] h-4 w-4 shrink-0 invert brightness-200" />
  }
  if (row.kind === 'camera') {
    return <Camera className="mt-[1px] h-4 w-4 shrink-0 text-white/54" />
  }

  const Icon = row.icon ?? Camera
  return <Icon className="mt-[1px] h-4 w-4 shrink-0 text-white/54" />
}
