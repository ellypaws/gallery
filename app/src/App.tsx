import { useEffect, useMemo, useRef, useState } from 'react'
import { gsap } from 'gsap'
import { MoonStar, Settings2, SunMedium } from 'lucide-react'

import { AdminPanel } from './components/AdminPanel'
import { Lightbox } from './components/Lightbox'
import { LoadingDial } from './components/LoadingDial'
import { MasonryGallery } from './components/MasonryGallery'
import { useTheme } from './hooks/useTheme'
import { fetchGallery } from './lib/api'
import type { GalleryItem } from './lib/types'

function App() {
  const { theme, toggleTheme } = useTheme()
  const shellRef = useRef<HTMLDivElement | null>(null)
  const [titleText, setTitleText] = useState('Parallax Frames')
  const [photos, setPhotos] = useState<GalleryItem[]>([])
  const [loadedImages, setLoadedImages] = useState(0)
  const [activeIndex, setActiveIndex] = useState<number | null>(null)
  const [isFetching, setIsFetching] = useState(true)
  const [error, setError] = useState('')

  const isAdmin = window.location.pathname.startsWith('/admin')

  async function loadGallery() {
    setIsFetching(true)
    setError('')
    try {
      const response = await fetchGallery()
      setTitleText(response.title)
      setPhotos(response.photos)
    } catch (fetchError) {
      setError(fetchError instanceof Error ? fetchError.message : 'Unable to load the gallery.')
    } finally {
      setIsFetching(false)
    }
  }

  useEffect(() => {
    void loadGallery()
  }, [])

  useEffect(() => {
    if (!shellRef.current || isAdmin) {
      return
    }

    const ctx = gsap.context(() => {
      gsap.fromTo(
        '.hero-copy > *',
        { autoAlpha: 0, y: 30 },
        { autoAlpha: 1, y: 0, stagger: 0.08, duration: 0.5, ease: 'power3.out' },
      )
      gsap.fromTo(
        '.gallery-card',
        { autoAlpha: 0, y: 24 },
        { autoAlpha: 1, y: 0, stagger: 0.04, duration: 0.35, delay: 0.16, ease: 'power2.out' },
      )
    }, shellRef)

    return () => ctx.revert()
  }, [isAdmin, photos.length])

  useEffect(() => {
    if (!photos.length) {
      setLoadedImages(0)
      return
    }

    let cancelled = false
    let completed = 0

    setLoadedImages(0)
    photos.forEach((photo) => {
      const image = new Image()
      const done = () => {
        if (cancelled) {
          return
        }
        completed += 1
        setLoadedImages(completed)
      }
      image.onload = done
      image.onerror = done
      image.src = photo.src
    })

    return () => {
      cancelled = true
    }
  }, [photos])

  const activePhoto = activeIndex === null ? null : photos[activeIndex]
  const subtitle = useMemo(() => {
    if (!photos.length) {
      return 'Drop JPG or PNG files into ./photos or use /admin to upload new work.'
    }
    return `${photos.length} frames indexed from the live media directory.`
  }, [photos.length])

  function animateThemeToggle() {
    gsap.fromTo(
      '.theme-switch',
      { scale: 0.94, rotate: -8 },
      { scale: 1, rotate: 0, duration: 0.35, ease: 'back.out(1.5)' },
    )
    toggleTheme()
  }

  if (isAdmin) {
    return (
      <>
        <LoadingDial loaded={loadedImages} total={photos.length} />
        <AdminPanel photos={photos} onRefresh={loadGallery} />
      </>
    )
  }

  return (
    <div ref={shellRef} className="min-h-screen">
      <LoadingDial loaded={loadedImages} total={photos.length} />

      <header className="sticky top-0 z-40 border-b border-[var(--line)] bg-[color:color-mix(in_srgb,var(--bg)_72%,transparent)] backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1540px] items-center justify-between gap-4 px-4 py-3 md:px-8">
          <div className="flex items-center gap-3 text-[var(--muted)]">
            <Settings2 className="h-4 w-4" />
            <span className="text-[11px] uppercase tracking-[0.18em]">Photography Library</span>
          </div>
          <div className="flex items-center gap-3">
            <a
              href="/admin"
              className="rounded-md border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-sm font-medium text-[var(--text)] transition hover:border-[var(--accent)]"
            >
              Admin
            </a>
            <button
              type="button"
              onClick={animateThemeToggle}
              className="theme-switch inline-flex items-center gap-2 rounded-md border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-sm font-medium text-[var(--text)] transition hover:border-[var(--accent)]"
              aria-label="Toggle theme"
            >
              {theme === 'dark' ? <SunMedium className="h-4 w-4" /> : <MoonStar className="h-4 w-4" />}
              {theme === 'dark' ? 'Light' : 'Dark'}
            </button>
          </div>
        </div>
      </header>

      <main className="px-4 pb-10 pt-4 md:px-8 md:pt-6">
        <section className="mx-auto max-w-[1540px]">
          <div className="hero-copy pointer-events-none relative z-10">
            <p className="mb-4 text-[11px] uppercase tracking-[0.26em] text-[var(--muted)]">Live archive</p>
            <h1 className="font-teko text-[144px] max-xl:text-[120px] max-lg:text-[96px] max-md:text-[72px] max-sm:text-[56px] font-bold text-[var(--hero-title)] tracking-[0em] leading-[118.8px] max-md:leading-[0.9] -mb-[54px] max-md:-mb-[10px] drop-shadow-sm text-left antialiased block w-full max-w-[945px] break-words relative z-20 -rotate-2 origin-left">
              {titleText}
            </h1>
            <p className="relative z-20 mt-16 max-w-[48ch] text-sm leading-6 text-[var(--muted)] md:mt-10">
              {subtitle}
            </p>
          </div>
        </section>

        <section className="mx-auto mt-8 max-w-[1540px]">
          {isFetching ? (
            <div className="grid min-h-[40vh] place-items-center text-sm text-[var(--muted)]">Reading gallery manifest...</div>
          ) : error ? (
            <div className="rounded-md border border-[var(--line)] bg-[var(--surface)] px-5 py-6 text-sm text-[var(--text)]">
              {error}
            </div>
          ) : photos.length === 0 ? (
            <div className="rounded-md border border-[var(--line)] bg-[var(--surface)] px-5 py-6 text-sm leading-6 text-[var(--muted)]">
              No images indexed yet. Add files to <code className="rounded bg-black/8 px-1 py-0.5 text-[var(--text)]">./photos</code> or use the upload screen.
            </div>
          ) : (
            <MasonryGallery photos={photos} onOpen={setActiveIndex} />
          )}
        </section>
      </main>

      {activePhoto && activeIndex !== null ? (
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

export default App
