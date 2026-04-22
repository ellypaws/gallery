import { useEffect, useMemo, useRef, useState } from 'react'
import { gsap } from 'gsap'
import { Calendar, Grid, LayoutDashboard, MoonStar, SunMedium } from 'lucide-react'

import { AdminPanel } from './components/AdminPanel'
import { Lightbox } from './components/Lightbox'
import { LoadingDial } from './components/LoadingDial'
import { MasonryGallery } from './components/MasonryGallery'
import { useTheme } from './hooks/useTheme'
import { fetchAdminGallery, fetchGallery } from './lib/api'
import type { GalleryItem } from './lib/types'

const MASONRY_STORAGE_KEY = 'gallery-masonry'
const GROUPED_STORAGE_KEY = 'gallery-grouped'

function App() {
  const { theme, toggleTheme } = useTheme()
  const shellRef = useRef<HTMLDivElement | null>(null)
  const nextWindowIdRef = useRef(1)
  const nextZIndexRef = useRef(10)
  const [photos, setPhotos] = useState<GalleryItem[]>([])
  const [isFetching, setIsFetching] = useState(true)
  const [isMasonry, setIsMasonry] = useState(() => getStoredViewFlag(MASONRY_STORAGE_KEY, true))
  const [isGrouped, setIsGrouped] = useState(() => getStoredViewFlag(GROUPED_STORAGE_KEY, false))
  const [lightboxWindows, setLightboxWindows] = useState<LightboxWindowState[]>([])
  const [lastCustomDesktopRect, setLastCustomDesktopRect] = useState<DesktopLightboxRect | null>(null)

  const isAdmin = window.location.pathname.startsWith('/admin')

  async function loadGallery() {
    setIsFetching(true)
    try {
      setPhotos(await loadGalleryPhotos(isAdmin))
    } catch {
      setPhotos([])
    } finally {
      setIsFetching(false)
    }
  }

  useEffect(() => {
    let cancelled = false

    const run = async () => {
      setIsFetching(true)
      try {
        const nextPhotos = await loadGalleryPhotos(isAdmin)
        if (!cancelled) {
          setPhotos(nextPhotos)
        }
      } catch {
        if (!cancelled) {
          setPhotos([])
        }
      } finally {
        if (!cancelled) {
          setIsFetching(false)
        }
      }
    }

    void run()

    return () => {
      cancelled = true
    }
  }, [isAdmin])

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }
    window.localStorage.setItem(MASONRY_STORAGE_KEY, String(isMasonry))
  }, [isMasonry])

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }
    window.localStorage.setItem(GROUPED_STORAGE_KEY, String(isGrouped))
  }, [isGrouped])

  useEffect(() => {
    if (!shellRef.current || isAdmin) {
      return
    }

    const ctx = gsap.context(() => {
      gsap.fromTo(
        '.forum-animate-in',
        { autoAlpha: 0, y: 18 },
        { autoAlpha: 1, y: 0, duration: 0.42, stagger: 0.06, ease: 'power2.out' },
      )
    }, shellRef)

    return () => ctx.revert()
  }, [isAdmin, photos.length, isFetching])

  function animateThemeToggle() {
    gsap.fromTo(
      '.theme-switch',
      { scale: 0.96, y: 1 },
      { scale: 1, y: 0, duration: 0.2, ease: 'power2.out' },
    )
    toggleTheme()
  }

  function animateGroupToggle() {
    gsap.fromTo(
      '.group-switch',
      { scale: 0.96, y: 1 },
      { scale: 1, y: 0, duration: 0.2, ease: 'power2.out' },
    )
    setIsGrouped((value) => !value)
  }

  function animateLayoutToggle() {
    gsap.fromTo(
      '.layout-switch',
      { scale: 0.96, y: 1 },
      { scale: 1, y: 0, duration: 0.2, ease: 'power2.out' },
    )
    setIsMasonry((value) => !value)
  }

  const groupedPhotos = useMemo<{ label: string; items: { globalIndex: number; photo: GalleryItem }[] }[]>(() => {
    if (!isGrouped) {
      return [{ label: '', items: photos.map((photo, index) => ({ photo, globalIndex: index })) }]
    }

    const map = new Map<string, { photo: GalleryItem; globalIndex: number }[]>()
    const order: string[] = []

    photos.forEach((photo, index) => {
      const label = photo.timelineGroup || getTimelineGroup(photo.capturedAt || photo.updatedAt)
      if (!map.has(label)) {
        map.set(label, [])
        order.push(label)
      }
      map.get(label)!.push({ photo, globalIndex: index })
    })

    return order.map((label) => ({ label, items: map.get(label)! }))
  }, [photos, isGrouped])

  const summary = useMemo(
    () => ({
      photoCount: photos.length,
      groupCount: groupedPhotos.filter((group) => group.items.length > 0).length,
    }),
    [groupedPhotos, photos.length],
  )

  if (isAdmin) {
    return <AdminPanel photos={photos} onRefresh={loadGallery} />
  }

  function openPhotoWindow(index: number) {
    const photo = photos[index]
    setLightboxWindows((current) => {
      const id = nextWindowIdRef.current++
      const zIndex = ++nextZIndexRef.current
      const desktopRect = getNextDesktopLightboxRect(current, lastCustomDesktopRect, photo?.width ?? 0, photo?.height ?? 0)
      const isDesktop = typeof window !== 'undefined' ? window.innerWidth >= 1024 : false

      return [
        ...current,
        {
          id,
          activeIndex: index,
          zIndex,
          desktopRect: isDesktop ? desktopRect : null,
          isCustomSized: isDesktop ? current.length > 0 && lastCustomDesktopRect !== null : false,
        },
      ]
    })
  }

  function closeWindow(id: number) {
    setLightboxWindows((current) => current.filter((windowItem) => windowItem.id !== id))
  }

  function focusWindow(id: number) {
    setLightboxWindows((current) => {
      const currentWindow = current.find((windowItem) => windowItem.id === id)
      if (!currentWindow) {
        return current
      }

      const zIndex = ++nextZIndexRef.current
      return current.map((windowItem) => (windowItem.id === id ? { ...windowItem, zIndex } : windowItem))
    })
  }

  function updateWindowRect(id: number, rect: DesktopLightboxRect, isCustomSized: boolean) {
    setLightboxWindows((current) =>
      current.map((windowItem) =>
        windowItem.id === id
          ? {
              ...windowItem,
              desktopRect: rect,
              isCustomSized: isCustomSized || windowItem.isCustomSized,
            }
          : windowItem,
      ),
    )

    if (isCustomSized) {
      setLastCustomDesktopRect(rect)
    }
  }

  function setWindowPhoto(id: number, updater: (currentIndex: number) => number) {
    setLightboxWindows((current) =>
      current.map((windowItem) =>
        windowItem.id === id
          ? {
              ...windowItem,
              activeIndex: updater(windowItem.activeIndex),
            }
          : windowItem,
      ),
    )
  }

  const topWindowId =
    lightboxWindows.length > 0
      ? lightboxWindows.reduce((top, windowItem) => (windowItem.zIndex > top.zIndex ? windowItem : top)).id
      : null
  const shouldDimBackground = lightboxWindows.length > 0 && !lightboxWindows.some((windowItem) => windowItem.isCustomSized)
  const sortedWindows = [...lightboxWindows].sort((a, b) => a.zIndex - b.zIndex)

  return (
    <div ref={shellRef} className="forum-app-shell">
      <div className="forum-page">
        <section className="forum-window forum-main-window forum-animate-in">
          <div className="forum-window-bar forum-window-bar-primary">
            <div className="flex min-w-0 items-center gap-2">
              <span className="forum-window-badge">🐕‍🦺</span>
              <span className="truncate text-[12px] font-bold">Gallery - {summary.photoCount} items</span>
            </div>
            <div className="forum-window-actions">
              <button
                type="button"
                onClick={animateLayoutToggle}
                className="forum-icon-button layout-switch"
                aria-label={isMasonry ? 'Switch to aligned layout' : 'Switch to masonry layout'}
                aria-pressed={isMasonry}
              >
                {isMasonry ? <LayoutDashboard className="h-3.5 w-3.5" /> : <Grid className="h-3.5 w-3.5" />}
              </button>
              <button
                type="button"
                onClick={animateGroupToggle}
                className="forum-icon-button group-switch"
                aria-label={isGrouped ? 'Disable grouping' : 'Enable grouping'}
                aria-pressed={isGrouped}
              >
                <Calendar className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={animateThemeToggle}
                className="forum-icon-button theme-switch"
                aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
                aria-pressed={theme === 'dark'}
              >
                {theme === 'dark' ? <SunMedium className="h-3.5 w-3.5" /> : <MoonStar className="h-3.5 w-3.5" />}
              </button>
            </div>
          </div>

          <div className="forum-toolbar-strip">
            <div className="min-w-0 pr-2">
              <h1 className="forum-heading forum-heading-compact -rotate-2 tracking-tight pointer-events-none relative text-[90px] z-20 -mb-[90px] antialiased drop-shadow-sm shrink-0">Elly</h1>
            </div>

            <div className="forum-toolbar-meta">
              <span>{summary.photoCount} items</span>
              {isGrouped ? (
                <>
                  <span className="forum-toolbar-separator" />
                  <span>{summary.groupCount} groups</span>
                </>
              ) : null}
            </div>
          </div>

          <div className="forum-content-frame">
            {isFetching ? (
              <div className="forum-empty-state flex min-h-[320px] flex-col items-center justify-center gap-3">
                <LoadingDial />
                <p className="m-0 text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--text-soft)]">Loading</p>
              </div>
            ) : photos.length === 0 ? (
              <div className="forum-empty-state">
                <p className="m-0 text-sm font-bold text-[var(--text-strong)]">No photos available</p>
              </div>
            ) : (
              <div
                className="forum-scrollbar flex h-full flex-col gap-5 overflow-y-auto p-2 md:p-3"
              >
                {groupedPhotos.map((group, index) => (
                  <section key={group.label || `group-${index}`} className="flex flex-col gap-2">
                    {group.label ? (
                      <div className="forum-group-heading">
                        <span>{group.label}</span>
                        <span>{group.items.length}</span>
                      </div>
                    ) : null}

                    <MasonryGallery items={group.items} onOpen={openPhotoWindow} isMasonry={isMasonry} />
                  </section>
                ))}
              </div>
            )}
          </div>
        </section>
      </div>

      {lightboxWindows.length > 0 ? (
        <div className="forum-window-layer pointer-events-none fixed inset-0 z-[60]">
          <div
            className={`absolute inset-0 transition-colors duration-150 ${lightboxWindows.length === 1 ? 'pointer-events-auto cursor-default' : 'pointer-events-none'} ${shouldDimBackground ? 'bg-[rgba(8,10,14,0.2)]' : 'bg-transparent'}`}
            onClick={() => {
              if (lightboxWindows.length === 1 && topWindowId !== null) {
                closeWindow(topWindowId)
              }
            }}
          />
          {sortedWindows.map((windowItem) => (
            <Lightbox
              key={windowItem.id}
              windowId={windowItem.id}
              photos={photos}
              activeIndex={windowItem.activeIndex}
              zIndex={windowItem.zIndex}
              desktopRect={windowItem.desktopRect}
              isActive={windowItem.id === topWindowId}
              onFocus={() => focusWindow(windowItem.id)}
              onRectChange={(rect, customSized) => updateWindowRect(windowItem.id, rect, customSized)}
              onClose={() => closeWindow(windowItem.id)}
              onPrev={() => setWindowPhoto(windowItem.id, (current) => (current - 1 + photos.length) % photos.length)}
              onNext={() => setWindowPhoto(windowItem.id, (current) => (current + 1) % photos.length)}
            />
          ))}
        </div>
      ) : null}
    </div>
  )
}

function getTimelineGroup(dateStr?: string | Date): string {
  if (!dateStr) return 'Long time ago'
  const date = new Date(dateStr)
  if (isNaN(date.getTime())) return 'Long time ago'

  const now = new Date()
  const dropTime = (value: Date) => Math.floor((value.getTime() - value.getTimezoneOffset() * 60000) / 86400000)
  const today = dropTime(now)
  const target = dropTime(date)
  const diffDays = today - target

  if (diffDays < 0) return 'Future'
  if (diffDays === 0) return 'Today'
  if (diffDays === 1) return 'Yesterday'
  if (diffDays <= 14) return `${diffDays} days ago`

  const diffWeeks = Math.floor(diffDays / 7)
  if (diffWeeks <= 4) return `${diffWeeks} weeks ago`

  const diffMonths = (now.getFullYear() - date.getFullYear()) * 12 + now.getMonth() - date.getMonth()
  if (diffMonths === 1) return '1 month ago'
  if (diffMonths <= 11 && diffMonths > 0) return `${diffMonths} months ago`

  const diffYears = now.getFullYear() - date.getFullYear()
  if (diffYears === 1) return '1 year ago'
  if (diffYears === 2) return '2 years ago'

  return 'Long time ago'
}

export default App

function getStoredViewFlag(key: string, fallback: boolean) {
  if (typeof window === 'undefined') {
    return fallback
  }

  const stored = window.localStorage.getItem(key)
  if (stored === 'true') {
    return true
  }
  if (stored === 'false') {
    return false
  }
  return fallback
}

async function loadGalleryPhotos(isAdmin: boolean) {
  const response = isAdmin ? await fetchAdminGallery() : await fetchGallery()
  return response.photos
}

type DesktopLightboxRect = {
  x: number
  y: number
  width: number
  height: number
}

type LightboxWindowState = {
  id: number
  activeIndex: number
  zIndex: number
  desktopRect: DesktopLightboxRect | null
  isCustomSized: boolean
}

function getNextDesktopLightboxRect(
  current: LightboxWindowState[],
  lastCustomDesktopRect: DesktopLightboxRect | null,
  photoWidth: number,
  photoHeight: number,
): DesktopLightboxRect | null {
  if (typeof window === 'undefined' || window.innerWidth < 1024) {
    return null
  }

  if (current.length === 0) {
    return getAspectAwareDesktopLightboxRect(photoWidth, photoHeight)
  }

  if (lastCustomDesktopRect) {
    return offsetDesktopLightboxRect(lastCustomDesktopRect)
  }

  const topWindow = current.reduce((top, windowItem) => (windowItem.zIndex > top.zIndex ? windowItem : top))
  if (topWindow.desktopRect) {
    return offsetDesktopLightboxRect(topWindow.desktopRect)
  }

  return offsetDesktopLightboxRect(getAspectAwareDesktopLightboxRect(photoWidth, photoHeight))
}

const SIDEBAR_WIDTH = 280
const TOOLBAR_HEIGHT = 60
const VIEWPORT_PADDING = 32
const MIN_WINDOW_WIDTH = 880
const MIN_WINDOW_HEIGHT = 620

function getAspectAwareDesktopLightboxRect(photoWidth: number, photoHeight: number): DesktopLightboxRect {
  const vw = window.innerWidth
  const vh = window.innerHeight
  const maxWidth = vw - VIEWPORT_PADDING * 2
  const maxHeight = vh - VIEWPORT_PADDING * 2

  if (!photoWidth || !photoHeight) {
    const width = Math.max(MIN_WINDOW_WIDTH, maxWidth)
    const height = Math.max(MIN_WINDOW_HEIGHT, maxHeight)
    return {
      x: Math.max(16, Math.round((vw - width) / 2)),
      y: Math.max(16, Math.round((vh - height) / 2)),
      width,
      height,
    }
  }

  const imageAspect = photoWidth / photoHeight
  const availImageWidth = maxWidth - SIDEBAR_WIDTH
  const availImageHeight = maxHeight - TOOLBAR_HEIGHT

  let imageW: number
  let imageH: number
  if (imageAspect > availImageWidth / availImageHeight) {
    imageW = availImageWidth
    imageH = imageW / imageAspect
  } else {
    imageH = availImageHeight
    imageW = imageH * imageAspect
  }

  const width = Math.max(MIN_WINDOW_WIDTH, Math.min(maxWidth, Math.round(imageW + SIDEBAR_WIDTH)))
  const height = Math.max(MIN_WINDOW_HEIGHT, Math.min(maxHeight, Math.round(imageH + TOOLBAR_HEIGHT)))

  return {
    x: Math.max(16, Math.round((vw - width) / 2)),
    y: Math.max(16, Math.round((vh - height) / 2)),
    width,
    height,
  }
}

function offsetDesktopLightboxRect(rect: DesktopLightboxRect): DesktopLightboxRect {
  if (typeof window === 'undefined') {
    return rect
  }

  const x = Math.min(Math.max(0, rect.x + 24), Math.max(0, window.innerWidth - rect.width))
  const y = Math.min(Math.max(0, rect.y + 24), Math.max(0, window.innerHeight - rect.height))
  return { ...rect, x, y }
}
