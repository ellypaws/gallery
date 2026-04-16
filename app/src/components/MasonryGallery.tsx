import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useWindowVirtualizer } from '@tanstack/react-virtual'

import type { GalleryItem } from '../lib/types'

type MasonryGalleryProps = {
  photos: GalleryItem[]
  onOpen: (index: number) => void
}

type MasonryEntry = {
  index: number
  photo: GalleryItem
  estimatedHeight: number
}

type MasonryColumn = {
  key: string
  items: MasonryEntry[]
  height: number
}

export function MasonryGallery({ photos, onOpen }: MasonryGalleryProps) {
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
    const count = width >= 1440 ? 4 : width >= 960 ? 3 : width >= 640 ? 2 : 1
    const columnWidth = width > 0 ? Math.max(240, Math.floor((width - gap * (count - 1)) / count)) : 320
    const next = Array.from({ length: count }, (_, index) => ({
      key: `column-${index}`,
      items: [] as MasonryEntry[],
      height: 0,
    }))

    photos.forEach((photo, index) => {
      const estimatedHeight = Math.max(180, Math.round(columnWidth * (photo.height / photo.width)))
      const target = next.reduce((best, column) => (column.height < best.height ? column : best), next[0])
      target.items.push({ index, photo, estimatedHeight })
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
  }, [photos, width])

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
            <div
              key={virtualItem.key}
              ref={virtualizer.measureElement}
              data-index={virtualItem.index}
              className="gallery-card absolute left-0 w-full"
              style={{
                transform: `translateY(${virtualItem.start - virtualizer.options.scrollMargin}px)`,
                paddingBottom: `${gap}px`,
              }}
            >
              <button
                type="button"
                onClick={() => onOpen(entry.index)}
                className="block w-full overflow-hidden text-left transition duration-300 hover:-translate-y-1"
              >
                <div
                  className="relative overflow-hidden"
                  style={{
                    aspectRatio: `${entry.photo.width} / ${entry.photo.height}`,
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
          )
        })}
      </div>
    </div>
  )
}
