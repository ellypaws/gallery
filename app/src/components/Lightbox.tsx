import { useEffect, useMemo, useRef } from 'react'
import { gsap } from 'gsap'
import { Aperture, Camera, ChevronLeft, ChevronRight, Clock3, X } from 'lucide-react'

import type { GalleryItem } from '../lib/types'

type LightboxProps = {
  photos: GalleryItem[]
  activeIndex: number
  onClose: () => void
  onPrev: () => void
  onNext: () => void
}

export function Lightbox({ photos, activeIndex, onClose, onPrev, onNext }: LightboxProps) {
  const overlayRef = useRef<HTMLDivElement | null>(null)
  const photo = photos[activeIndex]

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
      if (event.key === 'ArrowLeft') onPrev()
      if (event.key === 'ArrowRight') onNext()
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose, onNext, onPrev])

  useEffect(() => {
    if (!overlayRef.current) {
      return
    }

    const ctx = gsap.context(() => {
      gsap.fromTo(
        '.lightbox-panel',
        { autoAlpha: 0, y: 24, scale: 0.98 },
        { autoAlpha: 1, y: 0, scale: 1, duration: 0.35, ease: 'power3.out' },
      )
      gsap.fromTo(
        '.lightbox-meta-row',
        { autoAlpha: 0, x: 12 },
        { autoAlpha: 1, x: 0, duration: 0.28, stagger: 0.04, delay: 0.1, ease: 'power2.out' },
      )
    }, overlayRef)

    return () => ctx.revert()
  }, [activeIndex])

  const metaRows = useMemo(
    () =>
      [
        { key: 'camera', label: 'Camera', value: photo.camera, icon: Camera },
        { key: 'lens', label: 'Lens', value: photo.lens, icon: Camera },
        { key: 'aperture', label: 'Aperture', value: photo.aperture, icon: Aperture },
        { key: 'shutter', label: 'Shutter', value: photo.shutter, icon: Clock3 },
        { key: 'iso', label: 'ISO', value: photo.iso, icon: Camera },
        { key: 'focal', label: 'Focal', value: photo.focalLength, icon: Camera },
      ].filter((row) => row.value),
    [photo],
  )

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-[60] bg-black/88 px-4 py-4 text-white backdrop-blur-sm md:px-6"
      role="dialog"
      aria-modal="true"
      aria-label={photo.title}
    >
      <div className="lightbox-panel mx-auto flex h-full max-w-[1700px] flex-col gap-4 md:flex-row md:gap-6">
        <div className="flex items-center justify-between md:hidden">
          <p className="text-sm uppercase tracking-[0.18em] text-white/60">{photo.title}</p>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-white/15 p-2 text-white transition hover:border-white/30 hover:bg-white/8"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="relative min-h-0 flex-1 overflow-hidden rounded-md border border-white/10 bg-white/4">
          <button
            type="button"
            onClick={onPrev}
            className="absolute left-3 top-1/2 z-10 -translate-y-1/2 rounded-md border border-white/15 bg-black/30 p-2 text-white transition hover:border-white/30 hover:bg-black/50"
            aria-label="Previous photo"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <button
            type="button"
            onClick={onNext}
            className="absolute right-3 top-1/2 z-10 -translate-y-1/2 rounded-md border border-white/15 bg-black/30 p-2 text-white transition hover:border-white/30 hover:bg-black/50"
            aria-label="Next photo"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
          <img
            key={photo.id}
            src={photo.originalSrc || photo.src}
            srcSet={photo.srcSet}
            sizes="100vw"
            alt={photo.alt}
            className="h-full w-full object-contain"
          />
        </div>

        <aside className="flex w-full shrink-0 flex-col justify-between rounded-md border border-white/10 bg-white/6 p-4 md:w-[360px]">
          <div>
            <div className="hidden items-start justify-between md:flex">
              <div>
                <p className="text-[11px] uppercase tracking-[0.18em] text-white/50">Frame</p>
                <h2 className="mt-2 text-3xl font-semibold text-white">{photo.title}</h2>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="rounded-md border border-white/15 p-2 text-white transition hover:border-white/30 hover:bg-white/8"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {photo.description ? (
              <p className="mt-4 max-w-[34ch] text-sm leading-6 text-white/72">{photo.description}</p>
            ) : null}

            <div className="mt-6 space-y-3">
              {metaRows.map((row) => {
                const Icon = row.icon
                return (
                  <div
                    key={row.key}
                    className="lightbox-meta-row flex items-center justify-between rounded-md border border-white/10 px-3 py-3"
                  >
                    <div className="flex items-center gap-2 text-white/60">
                      <Icon className="h-4 w-4" />
                      <span className="text-sm">{row.label}</span>
                    </div>
                    <span className="text-sm font-medium text-white">{row.value}</span>
                  </div>
                )
              })}
            </div>
          </div>

          <div className="mt-6 border-t border-white/10 pt-4 text-xs uppercase tracking-[0.14em] text-white/40">
            {activeIndex + 1} / {photos.length}
          </div>
        </aside>
      </div>
    </div>
  )
}
