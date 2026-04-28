import { type CSSProperties, type PointerEvent, useCallback, useEffect, useLayoutEffect, useRef, useMemo, useState } from 'react'
import { useVirtualizer, type VirtualItem } from '@tanstack/react-virtual'
import { Film, Star } from 'lucide-react'

import type { GalleryItem } from '../lib/types'

const CARD_CAPTION_HEIGHT = 50
const MASONRY_LANDSCAPE_RATIOS = [0.666, 0.75, 0.875]
const MASONRY_SQUARE_RATIOS = [1]

type MasonryGalleryProps = {
  photos?: GalleryItem[]
  items?: { photo: GalleryItem; globalIndex: number }[]
  onOpen: (index: number) => void
  onView: (photoID: number) => void
  enableHoverTilt: boolean
  isMasonry?: boolean
}

type MasonryEntry = {
  index: number
  photo: GalleryItem
  imageHeight: number
  estimatedHeight: number
  aspectRatio: string
}

type MasonryColumn = {
  key: string
  items: MasonryEntry[]
  height: number
}

export function MasonryGallery({ photos, items, onOpen, onView, enableHoverTilt, isMasonry }: MasonryGalleryProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [width, setWidth] = useState(0)
  const [scrollElement, setScrollElement] = useState<HTMLElement | null>(null)

  useLayoutEffect(() => {
    if (!containerRef.current) {
      return
    }

    const element = containerRef.current
    const update = () => {
      setWidth(element.clientWidth)
      setScrollElement(findScrollParent(element))
    }
    update()

    const observer = new ResizeObserver(update)
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  const columns = useMemo(() => {
    const gap = width >= 960 ? 14 : 10
    const minColumnWidth = isMasonry ? 420 : 560
    const maxColumns = isMasonry ? 5 : 4
    const count =
      width > 0
        ? Math.max(1, Math.min(maxColumns, Math.floor((width + gap) / (minColumnWidth + gap))))
        : isMasonry
          ? 3
          : 2
    const columnWidth = width > 0 ? Math.max(minColumnWidth, Math.floor((width - gap * (count - 1)) / count)) : minColumnWidth
    const next = Array.from({ length: count }, (_, index) => ({
      key: `column-${index}`,
      items: [] as MasonryEntry[],
      height: 0,
    }))

    const dataSource = items || (photos ? photos.map((photo, index) => ({ photo, globalIndex: index })) : [])

    dataSource.forEach(({ photo, globalIndex }) => {
      let calcRatio = photo.height / photo.width
      let cssRatio = `${photo.width} / ${photo.height}`

      if (isMasonry) {
        calcRatio = getMasonryDisplayRatio(photo)
        cssRatio = `${1 / calcRatio}`
      }

      const imageHeight = Math.max(180, Math.round(columnWidth * calcRatio))
      const estimatedHeight = imageHeight + CARD_CAPTION_HEIGHT
      const target = next.reduce((best, column) => (column.height < best.height ? column : best), next[0])

      target.items.push({
        index: globalIndex,
        photo,
        imageHeight,
        estimatedHeight,
        aspectRatio: cssRatio,
      })
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
  }, [isMasonry, items, photos, width])

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
            columnWidth={columns.columnWidth}
            scrollElement={scrollElement}
            onOpen={onOpen}
            onView={onView}
            enableHoverTilt={enableHoverTilt}
          />
        ))}
      </div>
    </div>
  )
}

function VirtualColumn({
  column,
  gap,
  columnWidth,
  scrollElement,
  onOpen,
  onView,
  enableHoverTilt,
}: {
  column: MasonryColumn
  gap: number
  columnWidth: number
  scrollElement: HTMLElement | null
  onOpen: (index: number) => void
  onView: (photoID: number) => void
  enableHoverTilt: boolean
}) {
  const [parentElement, setParentElement] = useState<HTMLDivElement | null>(null)
  const [scrollMargin, setScrollMargin] = useState(0)

  useLayoutEffect(() => {
    if (!parentElement || !scrollElement) {
      setScrollMargin(0)
      return
    }

    const updateScrollMargin = () => {
      setScrollMargin(getOffsetTopWithinScrollContainer(parentElement, scrollElement))
    }

    updateScrollMargin()

    const observer = new ResizeObserver(updateScrollMargin)
    observer.observe(parentElement)
    observer.observe(scrollElement)
    return () => observer.disconnect()
  }, [parentElement, scrollElement])

  const virtualizer = useVirtualizer({
    count: column.items.length,
    getScrollElement: () => scrollElement,
    estimateSize: (index) => column.items[index]?.estimatedHeight + gap,
    overscan: 6,
    scrollMargin,
  })

  const items = virtualizer.getVirtualItems()

  useEffect(() => {
    virtualizer.measure()
  }, [column.items.length, scrollMargin, virtualizer])

  return (
    <div ref={setParentElement} className="relative">
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
              columnWidth={columnWidth}
              scrollMargin={virtualizer.options.scrollMargin}
              onOpen={onOpen}
              onView={onView}
              enableHoverTilt={enableHoverTilt}
              scrollElement={scrollElement}
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
  columnWidth,
  scrollMargin,
  onOpen,
  onView,
  enableHoverTilt,
  scrollElement,
  measureElement,
}: {
  virtualItem: VirtualItem
  entry: MasonryEntry
  gap: number
  columnWidth: number
  scrollMargin: number
  onOpen: (index: number) => void
  onView: (photoID: number) => void
  enableHoverTilt: boolean
  scrollElement: HTMLElement | null
  measureElement: (node: Element | null) => void
}) {
  const [cardElement, setCardElement] = useState<HTMLDivElement | null>(null)
  const tiltCardRef = useRef<HTMLDivElement | null>(null)
  const coverSlotWidth = getCoverSlotWidth(columnWidth, entry.imageHeight, entry.photo.width, entry.photo.height)
  const title = getPhotoLabel(entry.photo)
  const stamp = formatShortDate(entry.photo.capturedAt || entry.photo.updatedAt) || 'Undated'
  const setMeasuredElement = useCallback(
    (node: HTMLDivElement | null) => {
      measureElement(node)
      setCardElement(node)
    },
    [measureElement],
  )

  useEffect(() => {
    if (!cardElement) {
      return
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((observerEntry) => observerEntry.isIntersecting && observerEntry.intersectionRatio >= 0.35)) {
          onView(entry.photo.id)
          observer.disconnect()
        }
      },
      {
        root: scrollElement,
        threshold: [0.35],
      },
    )

    observer.observe(cardElement)
    return () => observer.disconnect()
  }, [cardElement, entry.photo.id, onView, scrollElement])

  function handleTiltPointerMove(event: PointerEvent<HTMLDivElement>) {
    if (!enableHoverTilt || !canUseHoverTilt()) {
      return
    }

    const element = tiltCardRef.current
    if (!element) {
      return
    }

    const rect = element.getBoundingClientRect()
    const x = clamp((event.clientX - rect.left) / rect.width, 0, 1)
    const y = clamp((event.clientY - rect.top) / rect.height, 0, 1)
    const rotateX = (0.5 - y) * 9
    const rotateY = (x - 0.5) * 11

    element.style.setProperty('--tilt-transform', `perspective(900px) rotateX(${rotateX.toFixed(2)}deg) rotateY(${rotateY.toFixed(2)}deg) scale(1.018)`)
  }

  function handleTiltPointerLeave() {
    const element = tiltCardRef.current
    if (!element) {
      return
    }

    element.style.setProperty('--tilt-transform', 'perspective(900px) rotateX(0deg) rotateY(0deg) scale(1)')
  }

  return (
    <div
      ref={setMeasuredElement}
      data-index={virtualItem.index}
      className="absolute left-0 w-full"
      style={{
        transform: `translateY(${virtualItem.start - scrollMargin}px)`,
        paddingBottom: `${gap}px`,
      }}
    >
      <div
        ref={tiltCardRef}
        className={`bp-panel group w-full p-1 ${enableHoverTilt ? 'masonry-tilt-card' : ''}`}
        role="button"
        tabIndex={0}
        style={TILT_CARD_STYLE}
        onPointerMove={handleTiltPointerMove}
        onPointerLeave={handleTiltPointerLeave}
        onClick={() => onOpen(entry.index)}
        onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') onOpen(entry.index) }}
      >
        <div
          className="bp-inset relative w-full shrink-0 overflow-hidden"
          style={{ aspectRatio: entry.aspectRatio }}
        >
          {entry.photo.mediaType === 'video' ? (
            <>
              <video
                src={entry.photo.src}
                poster={entry.photo.placeholder}
                muted
                loop
                autoPlay
                playsInline
                preload="metadata"
                className="block h-full w-full object-cover transition-opacity duration-200 group-hover:opacity-90"
              />
              <span className="absolute left-2 top-2 inline-flex h-6 min-w-6 items-center justify-center border border-white/90 bg-black/55 px-1 text-white/90 shadow-[0_1px_2px_rgba(0,0,0,0.45)]">
                <Film className="h-3.5 w-3.5" />
              </span>
            </>
          ) : (
            <img
              src={entry.photo.src}
              srcSet={entry.photo.srcSet}
              sizes={coverSlotWidth > 0 ? `${coverSlotWidth}px` : entry.photo.sizes}
              alt={entry.photo.alt}
              loading="lazy"
              decoding="async"
              className="block h-full w-full object-cover transition-opacity duration-200 group-hover:opacity-90"
            />
          )}
        </div>

        <div className="flex flex-col justify-between px-1 pb-1 pt-2">
          <div className="mb-1 flex min-w-0 items-center justify-between gap-2">
            <p className="m-0 min-w-0 truncate text-[11px] font-bold text-[var(--text-strong)]" title={title}>{title}</p>
            {entry.photo.starCount > 0 ? (
              <span className={`inline-flex shrink-0 items-center gap-1 text-[10px] font-bold ${entry.photo.starred ? 'text-[var(--text-strong)]' : 'text-[var(--text-soft)]'}`}>
                <Star className={`h-3 w-3 ${entry.photo.starred ? 'fill-current' : ''}`} />
                <span>{formatCount(entry.photo.starCount)}</span>
              </span>
            ) : null}
          </div>
          <div className="flex items-center justify-between gap-2 text-[10px] text-[var(--text-soft)]">
            <span>{stamp}</span>
            <span>{entry.photo.width}×{entry.photo.height}</span>
          </div>
        </div>
      </div>
    </div>
  )
}

const TILT_CARD_STYLE = {
  '--tilt-transform': 'perspective(900px) rotateX(0deg) rotateY(0deg) scale(1)',
} as CSSProperties

function canUseHoverTilt() {
  return (
    typeof window !== 'undefined' &&
    window.innerWidth >= 768 &&
    window.matchMedia('(hover: hover) and (pointer: fine)').matches
  )
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

function getMasonryDisplayRatio(photo: GalleryItem) {
  const intrinsicRatio = photo.height / photo.width
  if (intrinsicRatio > 1) {
    return intrinsicRatio
  }

  const ratios = intrinsicRatio < 1 ? MASONRY_LANDSCAPE_RATIOS : MASONRY_SQUARE_RATIOS

  return ratios[photo.id % ratios.length]
}

function formatCount(value: number) {
  return new Intl.NumberFormat(undefined, { notation: value >= 10000 ? 'compact' : 'standard' }).format(value)
}

function getCoverSlotWidth(containerWidth: number, containerHeight: number, imageWidth: number, imageHeight: number) {
  if (containerWidth <= 0 || containerHeight <= 0 || imageWidth <= 0 || imageHeight <= 0) {
    return containerWidth
  }

  const imageAspect = imageWidth / imageHeight
  return Math.ceil(Math.max(containerWidth, containerHeight * imageAspect))
}

function getPhotoLabel(photo: GalleryItem) {
  const label = photo.title || photo.alt || photo.relativePath
  if (!label) {
    return `Photo ${photo.id}`
  }

  const segments = label.split(/[\\/]/)
  return segments[segments.length - 1]
}

function formatShortDate(value?: string | null) {
  if (!value) {
    return ''
  }

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return ''
  }

  return new Intl.DateTimeFormat(undefined, {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
  }).format(date)
}

function findScrollParent(element: HTMLElement): HTMLElement {
  let current = element.parentElement

  while (current) {
    const style = window.getComputedStyle(current)
    if ((style.overflowY === 'auto' || style.overflowY === 'scroll') && current.scrollHeight > current.clientHeight) {
      return current
    }
    current = current.parentElement
  }

  return document.documentElement
}

function getOffsetTopWithinScrollContainer(element: HTMLElement, scrollContainer: HTMLElement) {
  let offset = 0
  let current: HTMLElement | null = element

  while (current && current !== scrollContainer) {
    offset += current.offsetTop
    current = current.offsetParent instanceof HTMLElement ? current.offsetParent : null
  }

  return offset
}
