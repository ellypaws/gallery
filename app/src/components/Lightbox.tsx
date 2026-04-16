import { useEffect, useMemo, useRef, useState } from 'react'
import { gsap } from 'gsap'
import { Aperture, Camera, ChevronLeft, ChevronRight, Clock3, X } from 'lucide-react'

import type { GalleryItem } from '../lib/types'
import { LoadingDial } from './LoadingDial'

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
  const [assetURL, setAssetURL] = useState('')
  const [loadProgress, setLoadProgress] = useState(0)
  const [isLoading, setIsLoading] = useState(true)

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
        { autoAlpha: 0, y: 10 },
        { autoAlpha: 1, y: 0, duration: 0.28, stagger: 0.04, delay: 0.1, ease: 'power2.out' },
      )
    }, overlayRef)

    return () => ctx.revert()
  }, [activeIndex])

  useEffect(() => {
    const controller = new AbortController()
    let objectURL = ''
    const sourceURL = photo.originalSrc || photo.src

    setAssetURL('')
    setLoadProgress(0)
    setIsLoading(true)

    void (async () => {
      try {
        const response = await fetch(sourceURL, {
          signal: controller.signal,
        })
        if (!response.ok) {
          throw new Error('image request failed')
        }

        const totalBytes = Number(response.headers.get('Content-Length') || '0')
        if (!response.body || totalBytes <= 0) {
          const blob = await response.blob()
          objectURL = URL.createObjectURL(blob)
          setAssetURL(objectURL)
          setLoadProgress(1)
          setIsLoading(false)
          return
        }

        const reader = response.body.getReader()
        const chunks: BlobPart[] = []
        let receivedBytes = 0

        while (true) {
          const { done, value } = await reader.read()
          if (done) {
            break
          }
          if (!value) {
            continue
          }
          chunks.push(value.slice() as unknown as BlobPart)
          receivedBytes += value.byteLength
          setLoadProgress(receivedBytes / totalBytes)
        }

        const blob = new Blob(chunks, {
          type: response.headers.get('Content-Type') || 'image/jpeg',
        })
        objectURL = URL.createObjectURL(blob)
        setAssetURL(objectURL)
        setLoadProgress(1)
        setIsLoading(false)
      } catch {
        if (controller.signal.aborted) {
          return
        }
        setAssetURL(sourceURL)
        setLoadProgress(1)
        setIsLoading(false)
      }
    })()

    return () => {
      controller.abort()
      if (objectURL) {
        URL.revokeObjectURL(objectURL)
      }
    }
  }, [photo.id, photo.originalSrc, photo.src])

  const metaRows = useMemo(
    () =>
      [
        { key: 'camera', value: photo.camera, icon: Camera },
        { key: 'lens', value: photo.lens, icon: Camera },
        { key: 'aperture', value: photo.aperture, icon: Aperture },
        { key: 'shutter', value: photo.shutter, icon: Clock3 },
        { key: 'iso', value: photo.iso, icon: Camera },
        { key: 'focal', value: photo.focalLength, icon: Camera },
      ].filter((row) => row.value),
    [photo],
  )

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-[60] bg-black/88 px-4 py-4 text-white backdrop-blur-sm md:px-6"
      role="dialog"
      aria-modal="true"
      aria-label={photo.alt}
    >
      <div className="lightbox-panel mx-auto flex h-full max-w-[1700px] flex-col">
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
          <button
            type="button"
            onClick={onClose}
            className="absolute right-3 top-3 z-10 rounded-md border border-white/15 bg-black/30 p-2 text-white transition hover:border-white/30 hover:bg-black/50"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
          {isLoading ? <LoadingDial progress={loadProgress} className="absolute right-3 top-16 z-10" /> : null}
          <img
            src={photo.placeholder || photo.src}
            alt=""
            aria-hidden="true"
            className="absolute inset-0 h-full w-full scale-105 object-contain blur-3xl opacity-65"
          />
          <img
            key={photo.id}
            src={assetURL || photo.placeholder || photo.src}
            alt={photo.alt}
            className="relative z-[1] h-full w-full object-contain"
          />
          <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 bg-gradient-to-t from-black/68 via-black/16 to-transparent px-3 pb-3 pt-16 md:px-5 md:pb-5">
            <div className="flex flex-wrap gap-2">
              {metaRows.map((row) => {
                const Icon = row.icon
                return (
                  <div
                    key={row.key}
                    className="lightbox-meta-row inline-flex items-center gap-2 rounded-md border border-white/12 bg-black/36 px-3 py-2 text-sm text-white/84 backdrop-blur-md"
                  >
                    <Icon className="h-4 w-4 shrink-0 text-white/58" />
                    <span>{row.value}</span>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
