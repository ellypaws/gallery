import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useWindowVirtualizer, type VirtualItem } from '@tanstack/react-virtual'
import { gsap } from 'gsap'

import type { GalleryItem } from '../lib/types'

type MasonryGalleryProps = {
  photos?: GalleryItem[]
  items?: { photo: GalleryItem; globalIndex: number }[]
  onOpen: (index: number) => void
  isMasonry?: boolean
}

type MasonryEntry = {
  index: number
  photo: GalleryItem
  estimatedHeight: number
  aspectRatio: string
}

type MasonryColumn = {
  key: string
  items: MasonryEntry[]
  height: number
}

export function MasonryGallery({ photos, items, onOpen, isMasonry }: MasonryGalleryProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [width, setWidth] = useState(0)

  useLayoutEffect(() => {
    if (!containerRef.current) {
      return
    }

    const element = containerRef.current
    const update = () => setWidth(element.clientWidth)
    update()

    const observer = new ResizeObserver(update)
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  const columns = useMemo(() => {
    const gap = width >= 960 ? 14 : 10
    let count = width >= 2560 ? 4 : width >= 1920 ? 3 : width >= 1440 ? 2 : 1
    if (isMasonry) {
      count += 1
    }
    const columnWidth = width > 0 ? Math.max(240, Math.floor((width - gap * (count - 1)) / count)) : 320
    const next = Array.from({ length: count }, (_, index) => ({
      key: `column-${index}`,
      items: [] as MasonryEntry[],
      height: 0,
    }))

    const dataSource = items || (photos ? photos.map((photo, i) => ({ photo, globalIndex: i })) : [])

    dataSource.forEach(({ photo, globalIndex }) => {
      let calcRatio = photo.height / photo.width
      let cssRatio = `${photo.width} / ${photo.height}`

      if (isMasonry) {
        const ratios = [1.0, 1.333, 0.75, 1.5, 0.666]
        calcRatio = ratios[photo.id % ratios.length]
        cssRatio = `${1 / calcRatio}`
      }

      const estimatedHeight = Math.max(180, Math.round(columnWidth * calcRatio))
      const target = next.reduce((best, column) => (column.height < best.height ? column : best), next[0])
      target.items.push({ index: globalIndex, photo, estimatedHeight, aspectRatio: cssRatio })
      target.height += estimatedHeight + gap
    })

    return {
      gap,
      columnWidth,
      columns: next.map((column) => ({
        ...column,
        height: Math.max(0, column.height - gap),
      })),
    }
  }, [photos, items, width, isMasonry])

  return (
    <div ref={containerRef} className="w-full">
      <div
        className="grid items-start"
        style={{
          gridTemplateColumns: `repeat(${columns.columns.length}, minmax(0, 1fr))`,
          columnGap: `${columns.gap}px`,
        }}
      >
        {columns.columns.map((column) => (
          <VirtualColumn
            key={column.key}
            column={column}
            gap={columns.gap}
            onOpen={onOpen}
          />
        ))}
      </div>
    </div>
  )
}

function VirtualColumn({
  column,
  gap,
  onOpen,
}: {
  column: MasonryColumn
  gap: number
  onOpen: (index: number) => void
}) {
  const parentRef = useRef<HTMLDivElement | null>(null)
  const [scrollMargin, setScrollMargin] = useState(0)

  useLayoutEffect(() => {
    setScrollMargin(parentRef.current?.offsetTop ?? 0)
  }, [])

  const virtualizer = useWindowVirtualizer({
    count: column.items.length,
    estimateSize: (index) => column.items[index]?.estimatedHeight + gap,
    overscan: 4,
    scrollMargin,
  })

  const items = virtualizer.getVirtualItems()

  useEffect(() => {
    virtualizer.measure()
  }, [column.items.length, virtualizer])

  return (
    <div ref={parentRef} className="relative">
      <div style={{ height: `${column.height}px`, position: 'relative' }}>
        {items.map((virtualItem) => {
          const entry = column.items[virtualItem.index]
          if (!entry) {
            return null
          }

          return (
            <GalleryCard
              key={virtualItem.key}
              virtualItem={virtualItem}
              entry={entry}
              gap={gap}
              scrollMargin={virtualizer.options.scrollMargin}
              onOpen={onOpen}
              measureElement={virtualizer.measureElement}
            />
          )
        })}
      </div>
    </div>
  )
}

function GalleryCard({
  virtualItem,
  entry,
  gap,
  scrollMargin,
  onOpen,
  measureElement,
}: {
  virtualItem: VirtualItem
  entry: MasonryEntry
  gap: number
  scrollMargin: number
  onOpen: (index: number) => void
  measureElement: (node: Element | null) => void
}) {
  const wrapperRef = useRef<HTMLDivElement | null>(null)

  useLayoutEffect(() => {
    const el = wrapperRef.current
    if (!el) return

    gsap.set(el, { autoAlpha: 0, y: 60 })

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          gsap.to(el, {
            autoAlpha: 1,
            y: 0,
            duration: 0.7,
            ease: 'power3.out',
          })
          observer.disconnect()
        }
      },
      { rootMargin: '0px 0px -150px 0px', threshold: 0.1 }
    )

    observer.observe(el)

    return () => observer.disconnect()
  }, [])

  return (
    <div
      ref={measureElement}
      data-index={virtualItem.index}
      className="absolute left-0 w-full"
      style={{
        transform: `translateY(${virtualItem.start - scrollMargin}px)`,
        paddingBottom: `${gap}px`,
      }}
    >
      <div ref={wrapperRef} className="gallery-card w-full">
        <button
          type="button"
          onClick={() => onOpen(entry.index)}
          className="block w-full overflow-hidden text-left transition duration-300 hover:-translate-y-1"
        >
          <div
            className="relative overflow-hidden"
            style={{
              aspectRatio: entry.aspectRatio,
            }}
          >
            <img
              src={entry.photo.src}
              srcSet={entry.photo.srcSet}
              sizes={entry.photo.sizes}
              alt={entry.photo.alt}
              loading="lazy"
              decoding="async"
              className="h-full w-full object-cover"
            />
          </div>
        </button>
      </div>
    </div>
  )
}
