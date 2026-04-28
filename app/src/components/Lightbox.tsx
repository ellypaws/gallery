import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { gsap } from 'gsap'
import { Aperture, Camera, ChevronLeft, ChevronRight, Clock3, ExternalLink, Film, Search, Star, X } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

import type { GalleryItem, GallerySource } from '../lib/types'
import { BarLoader } from './BarLoader.tsx'
import { ZoomableImage } from './ZoomableImage'

type LightboxProps = {
  windowId: number
  photos: GalleryItem[]
  activeIndex: number
  zIndex: number
  desktopRect: LightboxRect | null
  isActive: boolean
  onFocus: () => void
  onRectChange: (rect: LightboxRect, isCustomSized: boolean) => void
  onClose: () => void
  onPrev: () => void
  onNext: () => void
  onStar: (photoID: number) => void
}

type MetaRow = {
  key: string
  label: string
  value: string
  kind?: 'camera' | 'lens' | 'iso'
  icon?: LucideIcon
}

type ResizeDirection = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw'

const DESKTOP_BREAKPOINT = 1024
const LIGHTBOX_MIN_WIDTH = 880
const LIGHTBOX_MIN_HEIGHT = 620

export function Lightbox({
  windowId,
  photos,
  activeIndex,
  zIndex,
  desktopRect,
  isActive,
  onFocus,
  onRectChange,
  onClose,
  onPrev,
  onNext,
  onStar,
}: LightboxProps) {
  const overlayRef = useRef<HTMLDivElement | null>(null)
  const frameRef = useRef<HTMLDivElement | null>(null)
  const photo = photos[activeIndex]
  const isVideo = photo.mediaType === 'video'
  const videoSources = isVideo ? photo.sources : []
  const defaultVideoSrc = videoSources[videoSources.length - 1]?.src || photo.originalSrc || photo.src
  const [selectedVideoSrcById, setSelectedVideoSrcById] = useState<Record<number, string>>({})
  const selectedVideoSrc = selectedVideoSrcById[photo.id] || defaultVideoSrc
  const assetURL = isVideo ? selectedVideoSrc || defaultVideoSrc : photo.originalSrc || photo.src
  const [loadedPhotoId, setLoadedPhotoId] = useState<number | null>(null)
  const [isDesktopWindow, setIsDesktopWindow] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth >= DESKTOP_BREAKPOINT : false,
  )

  const slideDirectionRef = useRef<number>(1)
  const touchStartRef = useRef<{ x: number; y: number } | null>(null)
  const liveRectRef = useRef<LightboxRect | null>(desktopRect)
  const dragStateRef = useRef<
    | {
        mode: 'move' | ResizeDirection
        pointerId: number
        startX: number
        startY: number
        startRect: LightboxRect
      }
    | null
  >(null)
  const isLoading = loadedPhotoId !== photo.id

  useLayoutEffect(() => {
    if (dragStateRef.current) {
      return
    }
    liveRectRef.current = desktopRect
    if (isDesktopWindow && desktopRect && frameRef.current) {
      applyLightboxRect(frameRef.current, desktopRect)
    }
  }, [desktopRect, isDesktopWindow])

  useEffect(() => {
    if (!isActive) {
      return
    }

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

    return () => {
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [isActive, onClose, onNext, onPrev])

  useEffect(() => {
    if (!overlayRef.current || !frameRef.current) {
      return
    }

    const frame = frameRef.current
    const direction = slideDirectionRef.current
    const ctx = gsap.context(() => {
      gsap.fromTo(
        frame.querySelectorAll('.lightbox-detail-row'),
        { autoAlpha: 0, x: direction * 10 },
        { autoAlpha: 1, x: 0, duration: 0.18, stagger: 0.025, delay: 0.04, ease: 'power2.out' },
      )
    }, overlayRef)

    return () => ctx.revert()
  }, [activeIndex])

  const desktopRectRef = useRef(desktopRect)
  const onRectChangeRef = useRef(onRectChange)

  useLayoutEffect(() => {
    desktopRectRef.current = desktopRect
    onRectChangeRef.current = onRectChange
  }, [desktopRect, onRectChange])

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }

    const syncDesktopWindow = () => {
      const desktop = window.innerWidth >= DESKTOP_BREAKPOINT
      setIsDesktopWindow(desktop)
      const rect = desktopRectRef.current
      if (desktop && rect) {
        onRectChangeRef.current(clampLightboxRect(rect, true), false)
      }
    }

    window.addEventListener('resize', syncDesktopWindow)
    return () => window.removeEventListener('resize', syncDesktopWindow)
  }, [])

  useEffect(() => {
    const onPointerMove = (event: PointerEvent) => {
      const dragState = dragStateRef.current
      if (!dragState || !isDesktopWindow) {
        return
      }

      const dx = event.clientX - dragState.startX
      const dy = event.clientY - dragState.startY

      if (dragState.mode === 'move') {
        const nextRect = clampLightboxRect(
          {
            ...dragState.startRect,
            x: dragState.startRect.x + dx,
            y: dragState.startRect.y + dy,
          },
          true,
        )
        liveRectRef.current = nextRect
        if (frameRef.current) {
          applyLightboxRect(frameRef.current, nextRect)
        }
        return
      }

      const nextRect = clampResizedLightboxRect(dragState.startRect, dragState.mode, dx, dy)
      liveRectRef.current = nextRect
      if (frameRef.current) {
        applyLightboxRect(frameRef.current, nextRect)
      }
    }

    const onPointerUp = (event: PointerEvent) => {
      if (dragStateRef.current?.pointerId !== event.pointerId) {
        return
      }
      const dragState = dragStateRef.current
      const finalRect = liveRectRef.current
      dragStateRef.current = null
      if (dragState && finalRect) {
        onRectChangeRef.current(finalRect, !isSameLightboxRect(finalRect, dragState.startRect))
      }
    }

    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', onPointerUp)
    return () => {
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', onPointerUp)
    }
  }, [isDesktopWindow])

  const propertyRows = useMemo(
    () =>
      [
        { label: 'File', value: getPhotoLabel(photo) },
        { label: 'Date', value: formatDateTime(photo.capturedAt || photo.updatedAt) },
        { label: 'Dimensions', value: `${photo.width} x ${photo.height}` },
        { label: 'Type', value: isVideo ? 'Video' : 'Image' },
        { label: 'Duration', value: isVideo ? formatDuration(photo.duration) : '' },
        { label: 'Path', value: photo.relativePath },
      ].filter((row) => row.value),
    [isVideo, photo],
  )

  const metaRows = useMemo(() => {
    const rows: MetaRow[] = [
      { key: 'camera', label: 'Camera', value: photo.camera, kind: 'camera' },
      { key: 'lens', label: 'Lens', value: photo.lens, kind: 'lens' },
      { key: 'aperture', label: 'Aperture', value: photo.aperture, icon: Aperture },
      { key: 'shutter', label: 'Shutter', value: photo.shutter, icon: Clock3 },
      { key: 'iso', label: 'ISO', value: photo.iso, kind: 'iso' },
      { key: 'focal', label: 'Focal Len', value: photo.focalLength, icon: Search },
    ]

    return rows.filter((row) => row.value)
  }, [photo])

  const handleTouchStart = (event: React.TouchEvent) => {
    touchStartRef.current = {
      x: event.touches[0].clientX,
      y: event.touches[0].clientY,
    }
  }

  const handleTouchEnd = (event: React.TouchEvent) => {
    if (!touchStartRef.current) return
    const dx = event.changedTouches[0].clientX - touchStartRef.current.x
    const dy = event.changedTouches[0].clientY - touchStartRef.current.y
    touchStartRef.current = null

    if (Math.abs(dx) > Math.abs(dy) * 2 && Math.abs(dx) > 80) {
      if (dx < 0) {
        slideDirectionRef.current = 1
        onNext()
      } else {
        slideDirectionRef.current = -1
        onPrev()
      }
    }
  }

  function beginWindowMove(event: React.PointerEvent<HTMLDivElement>) {
    if (!isDesktopWindow || !desktopRect) {
      return
    }

    if ((event.target as HTMLElement).closest('button, a')) {
      return
    }

    liveRectRef.current = desktopRect
    dragStateRef.current = {
      mode: 'move',
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startRect: desktopRect,
    }
    onFocus()
  }

  function beginWindowResize(direction: ResizeDirection, event: React.PointerEvent<HTMLButtonElement>) {
    if (!isDesktopWindow || !desktopRect) {
      return
    }

    event.preventDefault()
    event.stopPropagation()
    liveRectRef.current = desktopRect
    dragStateRef.current = {
      mode: direction,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startRect: desktopRect,
    }
    onFocus()
  }

  if (!isDesktopWindow) {
    return (
      <div
        ref={overlayRef}
        className="pointer-events-auto fixed inset-0 z-[100] flex flex-col bg-[var(--bg)]"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        role="dialog"
        aria-label={photo.alt}
      >
        <div ref={frameRef} className="flex min-h-0 flex-1 flex-col overflow-y-auto" style={{ overscrollBehavior: 'contain', WebkitOverflowScrolling: 'touch' }}>
          <div className="relative shrink-0 bg-[var(--panel-ink)]" style={{ aspectRatio: `${photo.width} / ${photo.height}`, maxHeight: '80vh' }}>
            {isLoading ? (
              <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
                <BarLoader />
              </div>
            ) : null}

            <div className="absolute inset-0">
              {isVideo ? (
                <VideoPlayer
                  key={`${photo.id}-${assetURL}`}
                  src={assetURL || photo.src}
                  poster={photo.placeholder}
                  title={photo.alt}
                  onLoad={() => setLoadedPhotoId(photo.id)}
                  className={`transition-opacity duration-150 ${isLoading ? 'opacity-0' : 'opacity-100'}`}
                />
              ) : (
                <ZoomableImage
                  key={photo.id}
                  src={assetURL || photo.placeholder || photo.src}
                  alt={photo.alt}
                  naturalWidth={photo.width}
                  naturalHeight={photo.height}
                  onLoad={() => setLoadedPhotoId(photo.id)}
                  className={`transition-opacity duration-150 ${isLoading ? 'opacity-0' : 'opacity-100'}`}
                  hideControls
                />
              )}
            </div>

            <button
              type="button"
              onClick={onClose}
              className="forum-button lightbox-title-button absolute right-2 top-2 z-20 !min-h-[28px] !px-[8px]"
              aria-label="Close"
            >
              <X className="h-3.5 w-3.5" />
            </button>

            <button
              type="button"
              onClick={() => onStar(photo.id)}
              className={`forum-button absolute right-12 top-2 z-20 !min-h-[28px] !gap-1 !px-[8px] ${photo.starred ? 'star-marker-active' : ''}`}
              aria-label={photo.starred ? 'Remove star' : 'Add star'}
              aria-pressed={photo.starred}
            >
              <Star className={`h-3.5 w-3.5 ${photo.starred ? 'fill-current' : ''}`} />
              <span className="forum-button-label">{formatCount(photo.starCount)}</span>
            </button>

            {isVideo && videoSources.length > 1 ? (
              <div className="absolute left-2 top-2 z-20">
                <QualityPicker sources={videoSources} value={assetURL} onChange={(src) => setSelectedVideoSrcById((current) => ({ ...current, [photo.id]: src }))} />
              </div>
            ) : null}

          </div>

          {metaRows.length > 0 ? (
            <div className="shrink-0 p-2 pb-0">
              <div className="forum-meta-box">
                <p className="m-0 mb-2 text-[11px] font-bold text-[var(--viewer-ink)]">EXIF Data</p>
                <div className="flex flex-wrap gap-x-5 gap-y-2">
                  {metaRows.map((row) => (
                    <div key={row.key} className="lightbox-detail-row flex items-center gap-1.5 text-[11px] text-[var(--text)]">
                      <MetaIcon row={row} />
                      <span className="font-bold text-[var(--text-soft)]">{row.label}</span>
                      <span className="text-[var(--text-strong)]">{formatMetaValue(row)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : null}

          <div className="shrink-0 p-2">
            <div className="forum-meta-box">
              <p className="m-0 mb-2 text-[11px] font-bold text-[var(--viewer-ink)]">Stats</p>
              <dl className="forum-meta-table text-[11px]">
                <div className="lightbox-detail-row contents">
                  <dt className="forum-meta-term">Views</dt>
                  <dd className="forum-meta-desc">{formatCount(photo.viewCount)} ({formatCount(photo.clickCount)})</dd>
                </div>
                <div className="lightbox-detail-row contents">
                  <dt className="forum-meta-term">Favorites</dt>
                  <dd className="forum-meta-desc">{formatCount(photo.starCount)}</dd>
                </div>
              </dl>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div
      ref={overlayRef}
      className="pointer-events-none fixed inset-0"
      style={{ zIndex }}
    >
      <div className="relative h-full w-full">
        <div
          ref={frameRef}
          className="lightbox-frame pointer-events-auto flex min-h-0 w-full flex-col overflow-hidden border border-[var(--viewer-line)] bg-[var(--viewer-panel)] text-[var(--viewer-ink)] shadow-[0_18px_32px_rgba(0,0,0,0.3)]"
          onPointerDown={onFocus}
          onWheel={(event) => event.stopPropagation()}
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
          role="dialog"
          aria-modal="false"
          aria-label={photo.alt}
          style={{
            position: 'absolute',
            left: `${desktopRect?.x ?? 0}px`,
            top: `${desktopRect?.y ?? 0}px`,
            width: `${desktopRect?.width ?? 0}px`,
            height: `${desktopRect?.height ?? 0}px`,
          }}
        >
          <div
            className="forum-window-bar forum-window-bar-primary"
            style={{ borderBottomColor: 'var(--viewer-line)' }}
            onPointerDown={beginWindowMove}
          >
            <div className="flex min-w-0 items-center gap-2">
              <span className="forum-window-badge">{isVideo ? 'VID' : 'IMG'}</span>
              <span className="truncate text-[12px] font-bold">{isVideo ? 'Video' : 'Image'} Viewer - {getPhotoLabel(photo)}</span>
            </div>
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation()
                onClose()
              }}
              className="forum-button lightbox-title-button !min-h-[20px] !px-[6px] !py-[1px]"
              aria-label="Close"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-1 border-b border-[var(--viewer-line)] bg-[var(--viewer-panel)] px-2 py-1">
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation()
                slideDirectionRef.current = -1
                onPrev()
              }}
              className="forum-button"
            >
              <ChevronLeft className="h-4 w-4" />
              <span className="forum-button-label">Prev</span>
            </button>

            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation()
                slideDirectionRef.current = 1
                onNext()
              }}
              className="forum-button"
            >
              <span className="forum-button-label">Next</span>
              <ChevronRight className="h-4 w-4" />
            </button>

            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation()
                onStar(photo.id)
              }}
              className={`forum-button ${photo.starred ? 'star-marker-active' : ''}`}
              aria-label={photo.starred ? 'Remove star' : 'Add star'}
              aria-pressed={photo.starred}
            >
              <Star className={`h-4 w-4 ${photo.starred ? 'fill-current' : ''}`} />
              <span className="forum-button-label">{formatCount(photo.starCount)}</span>
            </button>

            {isVideo && videoSources.length > 1 ? (
              <QualityPicker sources={videoSources} value={assetURL} onChange={(src) => setSelectedVideoSrcById((current) => ({ ...current, [photo.id]: src }))} />
            ) : null}

            {photo.originalSrc ? (
              <a
                href={photo.originalSrc}
                target="_blank"
                rel="noreferrer"
                className="forum-button"
                onClick={(event) => event.stopPropagation()}
              >
                <ExternalLink className="h-4 w-4" />
                <span className="forum-button-label">Open Original</span>
              </a>
            ) : null}

            <div className="ml-auto text-[10px] uppercase tracking-[0.08em] text-[var(--text-soft)]">
              {activeIndex + 1} / {photos.length}
            </div>
          </div>

          <div className="grid min-h-0 flex-1 gap-0 grid-cols-[minmax(0,1fr)_280px]">
            <section className="flex min-h-0 flex-col border-r border-[var(--viewer-line)]">
              <div className="relative min-h-[320px] flex-1 bg-[var(--bg)] p-2">
                <div
                  className="relative h-full min-h-[300px] border bg-[var(--panel-ink)]"
                  style={{
                    borderTopColor: 'var(--viewer-line)',
                    borderLeftColor: 'var(--viewer-line)',
                    borderRightColor: 'var(--bevel-light)',
                    borderBottomColor: 'var(--bevel-light)',
                    boxShadow: 'inset 1px 1px 0 var(--bevel-dark)',
                  }}
                >
                  {isLoading ? (
                    <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
                      <BarLoader />
                    </div>
                  ) : null}

                  {isVideo ? (
                    <VideoPlayer
                      key={`${photo.id}-${assetURL}`}
                      src={assetURL || photo.src}
                      poster={photo.placeholder}
                      title={photo.alt}
                      onLoad={() => setLoadedPhotoId(photo.id)}
                      className={`transition-opacity duration-150 ${isLoading ? 'opacity-0' : 'opacity-100'}`}
                    />
                  ) : (
                    <ZoomableImage
                      key={photo.id}
                      src={assetURL || photo.placeholder || photo.src}
                      alt={photo.alt}
                      naturalWidth={photo.width}
                      naturalHeight={photo.height}
                      onLoad={() => setLoadedPhotoId(photo.id)}
                      className={`transition-opacity duration-150 ${isLoading ? 'opacity-0' : 'opacity-100'}`}
                    />
                  )}
                </div>
              </div>
            </section>

            <aside className="forum-scrollbar flex min-h-0 flex-col overflow-y-auto bg-[var(--viewer-panel)] p-2" style={{ overscrollBehavior: 'contain' }}>
              <div className="forum-meta-box">
                <p className="m-0 mb-2 text-[11px] font-bold text-[var(--viewer-ink)]">Properties</p>
                <dl className="forum-meta-table text-[11px]">
                  {propertyRows.map((row) => (
                    <div key={row.label} className="lightbox-detail-row contents">
                      <dt className="forum-meta-term">{row.label}</dt>
                      <dd className="forum-meta-desc">{row.value}</dd>
                    </div>
                  ))}
                </dl>
              </div>

              {metaRows.length ? (
                <div className="forum-meta-box mt-2">
                  <p className="m-0 mb-2 text-[11px] font-bold text-[var(--viewer-ink)]">EXIF Data</p>
                  <div className="space-y-2">
                    {metaRows.map((row) => (
                      <div key={row.key} className="lightbox-detail-row flex items-start gap-2 text-[11px] text-[var(--viewer-ink)]">
                        <MetaIcon row={row} />
                        <div className="min-w-0">
                          <p className="m-0 font-bold text-[var(--text-soft)]">{row.label}</p>
                          <p className="m-0 break-words">{formatMetaValue(row)}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              <div className="forum-meta-box mt-2">
                <p className="m-0 mb-2 text-[11px] font-bold text-[var(--viewer-ink)]">Stats</p>
                <dl className="forum-meta-table text-[11px]">
                  <div className="lightbox-detail-row contents">
                    <dt className="forum-meta-term">Views</dt>
                    <dd className="forum-meta-desc">{formatCount(photo.viewCount)} ({formatCount(photo.clickCount)})</dd>
                  </div>
                  <div className="lightbox-detail-row contents">
                    <dt className="forum-meta-term">Favorites</dt>
                    <dd className="forum-meta-desc">{formatCount(photo.starCount)}</dd>
                  </div>
                </dl>
              </div>

              {photo.description || photo.alt ? (
                <div className="forum-meta-box mt-2">
                  <p className="m-0 mb-2 text-[11px] font-bold text-[var(--viewer-ink)]">Notes</p>
                  {photo.alt ? <p className="m-0 text-[11px] leading-5">{photo.alt}</p> : null}
                  {photo.description ? <p className="m-0 mt-2 text-[11px] leading-5">{photo.description}</p> : null}
                </div>
              ) : null}
            </aside>
          </div>

          <>
            {RESIZE_HANDLES.map((handle) => (
              <button
                key={`${windowId}-${handle.direction}`}
                type="button"
                className={handle.className}
                onPointerDown={(event) => beginWindowResize(handle.direction, event)}
                aria-label={`Resize window ${handle.direction}`}
              />
            ))}
          </>
        </div>
      </div>
    </div>
  )
}

type LightboxRect = {
  x: number
  y: number
  width: number
  height: number
}

function clampLightboxRect(rect: LightboxRect, isDesktopWindow: boolean): LightboxRect {
  if (typeof window === 'undefined' || !isDesktopWindow) {
    return rect
  }

  const viewportWidth = window.innerWidth
  const viewportHeight = window.innerHeight
  const width = Math.min(Math.max(LIGHTBOX_MIN_WIDTH, rect.width), Math.max(LIGHTBOX_MIN_WIDTH, viewportWidth - 32))
  const height = Math.min(Math.max(LIGHTBOX_MIN_HEIGHT, rect.height), Math.max(LIGHTBOX_MIN_HEIGHT, viewportHeight - 32))
  const x = Math.min(Math.max(8, rect.x), Math.max(8, viewportWidth - width - 8))
  const y = Math.min(Math.max(8, rect.y), Math.max(8, viewportHeight - height - 8))

  return { x, y, width, height }
}

function clampResizedLightboxRect(startRect: LightboxRect, direction: ResizeDirection, dx: number, dy: number): LightboxRect {
  const minWidth = LIGHTBOX_MIN_WIDTH
  const minHeight = LIGHTBOX_MIN_HEIGHT

  const next = { ...startRect }

  if (direction.includes('e')) {
    next.width = startRect.width + dx
  }
  if (direction.includes('s')) {
    next.height = startRect.height + dy
  }
  if (direction.includes('w')) {
    next.x = startRect.x + dx
    next.width = startRect.width - dx
  }
  if (direction.includes('n')) {
    next.y = startRect.y + dy
    next.height = startRect.height - dy
  }

  if (next.width < minWidth) {
    if (direction.includes('w')) {
      next.x -= minWidth - next.width
    }
    next.width = minWidth
  }

  if (next.height < minHeight) {
    if (direction.includes('n')) {
      next.y -= minHeight - next.height
    }
    next.height = minHeight
  }

  return clampLightboxRect(next, true)
}

function applyLightboxRect(element: HTMLDivElement, rect: LightboxRect) {
  element.style.left = `${rect.x}px`
  element.style.top = `${rect.y}px`
  element.style.width = `${rect.width}px`
  element.style.height = `${rect.height}px`
}

function isSameLightboxRect(a: LightboxRect, b: LightboxRect) {
  return a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height
}

function MetaIcon({ row }: { row: MetaRow }) {
  if (row.kind === 'iso') {
    return <img src="/iso.svg" alt="" aria-hidden="true" className="mt-[1px] h-4 w-4 shrink-0" style={{ filter: 'var(--asset-icon-filter)' }} />
  }
  if (row.kind === 'lens') {
    return <img src="/lens.svg" alt="" aria-hidden="true" className="mt-[1px] h-4 w-4 shrink-0" style={{ filter: 'var(--asset-icon-filter)' }} />
  }
  if (row.kind === 'camera') {
    return <Camera className="mt-[1px] h-4 w-4 shrink-0 text-[var(--viewer-ink)]" />
  }

  const Icon = row.icon ?? Camera
  return <Icon className="mt-[1px] h-4 w-4 shrink-0 text-[var(--viewer-ink)]" />
}

function QualityPicker({
  sources,
  value,
  onChange,
}: {
  sources: GallerySource[]
  value: string
  onChange: (value: string) => void
}) {
  return (
    <label className="forum-button !min-h-[28px] !gap-1">
      <Film className="h-3.5 w-3.5" />
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="bg-transparent text-[11px] font-bold outline-none"
        aria-label="Video quality"
      >
        {sources.map((source) => (
          <option key={source.src} value={source.src}>
            {source.label}
          </option>
        ))}
      </select>
    </label>
  )
}

function VideoPlayer({
  src,
  poster,
  title,
  onLoad,
  className,
}: {
  src: string
  poster: string
  title: string
  onLoad: () => void
  className?: string
}) {
  return (
    <video
      src={src}
      poster={poster}
      title={title}
      autoPlay
      controls
      loop
      muted
      playsInline
      preload="metadata"
      onLoadedData={onLoad}
      className={`h-full w-full bg-black object-contain ${className ?? ''}`}
    />
  )
}

function formatMetaValue(row: MetaRow) {
  if (row.key === 'aperture') {
    return `f/${row.value}`
  }
  return row.value
}

function formatCount(value: number) {
  return new Intl.NumberFormat(undefined, { notation: value >= 10000 ? 'compact' : 'standard' }).format(value)
}

function formatDuration(seconds: number) {
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return ''
  }
  const total = Math.round(seconds)
  const minutes = Math.floor(total / 60)
  const remainingSeconds = total % 60
  return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`
}

const RESIZE_HANDLES: { direction: ResizeDirection; className: string }[] = [
  { direction: 'n', className: 'lightbox-resize lightbox-resize-n' },
  { direction: 's', className: 'lightbox-resize lightbox-resize-s' },
  { direction: 'e', className: 'lightbox-resize lightbox-resize-e' },
  { direction: 'w', className: 'lightbox-resize lightbox-resize-w' },
  { direction: 'ne', className: 'lightbox-resize lightbox-resize-ne' },
  { direction: 'nw', className: 'lightbox-resize lightbox-resize-nw' },
  { direction: 'se', className: 'lightbox-resize lightbox-resize-se' },
  { direction: 'sw', className: 'lightbox-resize lightbox-resize-sw' },
]

function getPhotoLabel(photo: GalleryItem) {
  const label = photo.title || photo.alt || photo.relativePath
  if (!label) {
    return `Photo ${photo.id}`
  }

  const segments = label.split(/[\\/]/)
  return segments[segments.length - 1]
}

function formatDateTime(value?: string | null) {
  if (!value) {
    return ''
  }

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return ''
  }

  return new Intl.DateTimeFormat(undefined, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}
