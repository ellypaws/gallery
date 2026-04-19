import { useEffect, useMemo, useRef, useState } from 'react'
import { gsap } from 'gsap'
import { Calendar, Grid, LayoutDashboard, MoonStar, SunMedium } from 'lucide-react'

import { AdminPanel } from './components/AdminPanel'
import DarkVeil from './components/DarkVeil'
import { Lightbox } from './components/Lightbox'
import { MasonryGallery } from './components/MasonryGallery'
import { useTheme } from './hooks/useTheme'
import { fetchAdminGallery, fetchGallery } from './lib/api'
import type { GalleryItem } from './lib/types'

function App() {
  const { theme, toggleTheme } = useTheme()
  const shellRef = useRef<HTMLDivElement | null>(null)
  const [photos, setPhotos] = useState<GalleryItem[]>([])
  const [activeIndex, setActiveIndex] = useState<number | null>(null)
  const [isFetching, setIsFetching] = useState(true)
  const [isMasonry, setIsMasonry] = useState(false)
  const [isGrouped, setIsGrouped] = useState(true)

  const isAdmin = window.location.pathname.startsWith('/admin')

  async function loadGallery() {
    setIsFetching(true)
    try {
      const response = isAdmin ? await fetchAdminGallery() : await fetchGallery()
      setPhotos(response.photos)
    } catch {
      setPhotos([])
    } finally {
      setIsFetching(false)
    }
  }

  useEffect(() => {
    void loadGallery()
  }, [isAdmin])

  useEffect(() => {
    if (!shellRef.current || isAdmin) {
      return
    }

    const ctx = gsap.context(() => {
      gsap.fromTo(
        '.hero-copy',
        { autoAlpha: 0, y: 30 },
        { autoAlpha: 1, y: 0, duration: 0.5, ease: 'power3.out' },
      )
    }, shellRef)

    return () => ctx.revert()
  }, [isAdmin, photos.length])

  function animateThemeToggle() {
    gsap.fromTo(
      '.theme-switch',
      { scale: 0.94, rotate: -8 },
      { scale: 1, rotate: 0, duration: 0.35, ease: 'back.out(1.5)' },
    )
    toggleTheme()
  }

  function animateGroupToggle() {
    gsap.fromTo(
      '.group-switch',
      { scale: 0.94, y: 2 },
      { scale: 1, y: 0, duration: 0.35, ease: 'back.out(1.5)' },
    )
    setIsGrouped((g) => !g)
  }

  function animateLayoutToggle() {
    gsap.fromTo(
      '.layout-switch',
      { scale: 0.94, y: 2 },
      { scale: 1, y: 0, duration: 0.35, ease: 'back.out(1.5)' },
    )
    setIsMasonry((m) => !m)
  }

  const groupedPhotos = useMemo<{ label: string; items: { globalIndex: number; photo: GalleryItem }[] }[]>(() => {
    if (!isGrouped) {
      return [{ label: '', items: photos.map((photo, i) => ({ photo, globalIndex: i })) }]
    }

    const map = new Map<string, { photo: GalleryItem; globalIndex: number }[]>()
    const order: string[] = []

    photos.forEach((photo, i) => {
      // @ts-ignore
      const dateVal = photo.capturedAt || photo.updatedAt
      const label = getTimelineGroup(dateVal)
      if (!map.has(label)) {
        map.set(label, [])
        order.push(label)
      }
      map.get(label)!.push({ photo, globalIndex: i })
    })

    return order.map((label) => ({ label, items: map.get(label)! }))
  }, [photos, isGrouped])

  if (isAdmin) {
    return <AdminPanel photos={photos} onRefresh={loadGallery} />
  }

  return (
    <div ref={shellRef} className="relative min-h-screen">
      <div className="pointer-events-none absolute left-0 top-0 z-0 h-[80vh] max-h-[800px] min-h-[400px] w-full overflow-hidden opacity-60 [mask-image:linear-gradient(to_bottom,black_40%,transparent_100%)]">
        <DarkVeil speed={0.2} noiseIntensity={0.08} />
      </div>

      <div className="fixed right-4 top-4 z-40 flex items-center gap-2">
        <button
          type="button"
          onClick={animateGroupToggle}
          className={`group-switch inline-flex h-11 w-11 items-center justify-center rounded-md border transition ${isGrouped ? 'border-[var(--accent)] bg-[var(--accent)] text-white shadow-[0_4px_12px_rgba(201,118,74,0.3)]' : 'border-[var(--line)] bg-[var(--surface)] text-[var(--text)] shadow-[var(--shadow)] hover:border-[var(--accent)]'}`}
          aria-label="Toggle grouping"
        >
          <Calendar className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={animateLayoutToggle}
          className="layout-switch inline-flex h-11 w-11 items-center justify-center rounded-md border border-[var(--line)] bg-[var(--surface)] text-[var(--text)] shadow-[var(--shadow)] transition hover:border-[var(--accent)]"
          aria-label="Toggle layout"
        >
          {isMasonry ? <LayoutDashboard className="h-4 w-4" /> : <Grid className="h-4 w-4" />}
        </button>
        <button
          type="button"
          onClick={animateThemeToggle}
          className="theme-switch inline-flex h-11 w-11 items-center justify-center rounded-md border border-[var(--line)] bg-[var(--surface)] text-[var(--text)] shadow-[var(--shadow)] transition hover:border-[var(--accent)]"
          aria-label="Toggle theme"
        >
          {theme === 'dark' ? <SunMedium className="h-4 w-4" /> : <MoonStar className="h-4 w-4" />}
        </button>
      </div>

      <main className="relative z-10 px-4 pb-8 pt-4 md:px-8 md:pt-6">
        <section className="mx-auto max-w-[1540px]">
          <h1 className="hero-copy pointer-events-none font-teko text-[288px] max-xl:text-[220px] max-lg:text-[160px] max-md:text-[120px] max-sm:text-[96px] font-bold text-[var(--hero-title)] tracking-tight leading-[0.8] -mb-[80px] max-md:-mb-[30px] drop-shadow-sm text-left antialiased block w-full max-w-[1200px] break-words relative z-20 -rotate-2 origin-left">
            Elly
          </h1>
        </section>

        <section className="mx-auto mt-6 max-w-[1540px]">
          {isFetching ? (
            <div className="min-h-[60vh]" />
          ) : (
            <div className="flex flex-col gap-12">
              {groupedPhotos.map((group, index) => (
                <div key={group.label} className="w-full">
                  {group.label && (
                    <h2 className={`mb-6 font-teko text-3xl font-medium tracking-wide text-[var(--text)] opacity-80 md:text-4xl ${index === 0 ? 'text-right' : ''}`}>
                      {group.label}
                    </h2>
                  )}
                  <MasonryGallery items={group.items} onOpen={setActiveIndex} isMasonry={isMasonry} />
                </div>
              ))}
            </div>
          )}
        </section>
      </main>

      {activeIndex !== null ? (
        <Lightbox
          photos={photos}
          activeIndex={activeIndex}
          onClose={() => setActiveIndex(null)}
          onPrev={() => setActiveIndex((current) => (current === null ? 0 : (current - 1 + photos.length) % photos.length))}
          onNext={() => setActiveIndex((current) => (current === null ? 0 : (current + 1) % photos.length))}
        />
      ) : null}
    </div>
  )
}

function getTimelineGroup(dateStr?: string | Date): string {
  if (!dateStr) return 'Long time ago'
  const date = new Date(dateStr)
  if (isNaN(date.getTime())) return 'Long time ago'

  const now = new Date()
  const dropTime = (d: Date) => Math.floor((d.getTime() - d.getTimezoneOffset() * 60000) / 86400000)
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
