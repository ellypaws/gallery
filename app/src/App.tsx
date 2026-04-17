import { useEffect, useRef, useState } from 'react'
import { gsap } from 'gsap'
import { MoonStar, SunMedium } from 'lucide-react'

import { AdminPanel } from './components/AdminPanel'
import { Lightbox } from './components/Lightbox'
import { MasonryGallery } from './components/MasonryGallery'
import { useTheme } from './hooks/useTheme'
import { fetchGallery } from './lib/api'
import type { GalleryItem } from './lib/types'

function App() {
  const { theme, toggleTheme } = useTheme()
  const shellRef = useRef<HTMLDivElement | null>(null)
  const [photos, setPhotos] = useState<GalleryItem[]>([])
  const [activeIndex, setActiveIndex] = useState<number | null>(null)
  const [isFetching, setIsFetching] = useState(true)

  const isAdmin = window.location.pathname.startsWith('/admin')

  async function loadGallery() {
    setIsFetching(true)
    try {
      const response = await fetchGallery()
      setPhotos(response.photos)
    } catch {
      setPhotos([])
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

  if (isAdmin) {
    return <AdminPanel photos={photos} onRefresh={loadGallery} />
  }

  return (
    <div ref={shellRef} className="min-h-screen">
      <button
        type="button"
        onClick={animateThemeToggle}
        className="theme-switch fixed right-4 top-4 z-40 inline-flex h-11 w-11 items-center justify-center rounded-md border border-[var(--line)] bg-[var(--surface)] text-[var(--text)] shadow-[var(--shadow)] transition hover:border-[var(--accent)]"
        aria-label="Toggle theme"
      >
        {theme === 'dark' ? <SunMedium className="h-4 w-4" /> : <MoonStar className="h-4 w-4" />}
      </button>

      <main className="px-4 pb-8 pt-4 md:px-8 md:pt-6">
        <section className="mx-auto max-w-[1540px]">
          <h1 className="hero-copy pointer-events-none font-teko text-[288px] max-xl:text-[220px] max-lg:text-[160px] max-md:text-[120px] max-sm:text-[96px] font-bold text-[var(--hero-title)] tracking-tight leading-[0.8] -mb-[80px] max-md:-mb-[30px] drop-shadow-sm text-left antialiased block w-full max-w-[1200px] break-words relative z-20 -rotate-2 origin-left">
            Elly
          </h1>
        </section>

        <section className="mx-auto mt-6 max-w-[1540px]">
          {isFetching ? <div className="min-h-[60vh]" /> : <MasonryGallery photos={photos} onOpen={setActiveIndex} />}
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

export default App
