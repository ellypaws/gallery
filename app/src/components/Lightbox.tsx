import { useEffect, useMemo, useRef, useState } from 'react'
import { gsap } from 'gsap'
import { Aperture, Camera, ChevronLeft, ChevronRight, Clock3, Search, X } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

import type { GalleryItem } from '../lib/types'
import { LoadingDial } from './LoadingDial'

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

  return (
    <div
      ref={overlayRef}
      onClick={onClose}
      className="fixed inset-0 z-[60] bg-black/88 px-4 py-4 text-white backdrop-blur-sm md:px-6"
      role="dialog"
      aria-modal="true"
      aria-label={photo.alt}
    >
      <div className="lightbox-panel mx-auto flex h-full max-w-[1700px] flex-col">
        <aside className="pointer-events-none absolute left-5 top-5 bottom-5 z-10 hidden w-[248px] md:flex md:flex-col md:justify-start">
          <div className="flex flex-col items-start gap-3">
            {metaRows.map((row) => (
              <div key={row.key} className="lightbox-meta-row flex items-start gap-3 text-white/86">
                <MetaIcon row={row} />
                <div className="flex flex-col items-start gap-0.5">
                  <span className="text-[11px] uppercase tracking-[0.14em] text-white/42">{row.label}</span>
                  <span className="text-sm leading-5">
                    {'isAperture' in row && row.isAperture ? (
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
        <div className="flex min-h-0 flex-1 items-center justify-center">
          <div className="relative h-full w-full max-w-[1500px] overflow-hidden bg-white/4 md:max-w-[calc(100vw-22rem)]">
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation()
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
          {isLoading ? <LoadingDial progress={loadProgress} className="absolute right-3 top-16 z-10" /> : null}
          <div className="pointer-events-none absolute left-3 top-3 z-10 flex max-w-[280px] flex-col items-start gap-2 md:hidden">
            {metaRows.map((row) => {
              return (
                <div key={row.key} className="lightbox-meta-row flex items-start gap-3 text-white/86">
                  <MetaIcon row={row} />
                  <div className="flex flex-col items-start gap-0.5">
                    <span className="text-[11px] uppercase tracking-[0.14em] text-white/42">{row.label}</span>
                    <span className="text-sm leading-5">
                      {'isAperture' in row && row.isAperture ? (
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
              )
            })}
          </div>
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
            onClick={(event) => event.stopPropagation()}
            className="relative z-[1] h-full w-full object-contain"
          />
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

function MetaIcon({
  row,
}: {
  row: MetaRow
}) {
  if ('kind' in row) {
    if (row.kind === 'iso') {
      return <img src="/iso.svg" alt="" aria-hidden="true" className="mt-[1px] h-4 w-4 shrink-0 invert brightness-200" />
    }
    if (row.kind === 'lens') {
      return <img src="/lens.svg" alt="" aria-hidden="true" className="mt-[1px] h-4 w-4 shrink-0 invert brightness-200" />
    }
    return <Camera className="mt-[1px] h-4 w-4 shrink-0 text-white/54" />
  }

  const Icon = row.icon ?? Camera
  return <Icon className="mt-[1px] h-4 w-4 shrink-0 text-white/54" />
}
