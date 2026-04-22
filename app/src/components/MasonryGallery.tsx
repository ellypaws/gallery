import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useVirtualizer, type VirtualItem } from '@tanstack/react-virtual'

import type { GalleryItem } from '../lib/types'

const CARD_CAPTION_HEIGHT = 68

type MasonryGalleryProps = {
  photos?: GalleryItem[]
  items?: { photo: GalleryItem; globalIndex: number }[]
  onOpen: (index: number) => void
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

export function MasonryGallery({ photos, items, onOpen, isMasonry }: MasonryGalleryProps) {
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
        const ratios = [1.0, 1.333, 0.75, 1.5, 0.666]
        calcRatio = ratios[photo.id % ratios.length]
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
}: {
  column: MasonryColumn
  gap: number
  columnWidth: number
  scrollElement: HTMLElement | null
  onOpen: (index: number) => void
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
  measureElement,
}: {
  virtualItem: VirtualItem
  entry: MasonryEntry
  gap: number
  columnWidth: number
  scrollMargin: number
  onOpen: (index: number) => void
  measureElement: (node: Element | null) => void
}) {
  const coverSlotWidth = getCoverSlotWidth(columnWidth, entry.imageHeight, entry.photo.width, entry.photo.height)
  const title = getPhotoLabel(entry.photo)
  const stamp = formatShortDate(entry.photo.capturedAt || entry.photo.updatedAt) || 'Undated'

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
      <div className="w-full">
        <button
          type="button"
          onClick={() => onOpen(entry.index)}
          className="group block w-full overflow-hidden border border-[var(--line-strong)] bg-[var(--panel)] text-left shadow-[inset_1px_1px_0_var(--bp-inset),inset_-1px_-1px_0_var(--bp-border-dark)] transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent-strong)]"
        >
          <div className="border-b border-[var(--line)] bg-[linear-gradient(180deg,var(--panel-strong)_0%,var(--panel-soft)_100%)] px-2 py-1">
            <div className="flex items-center justify-between gap-2 text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--text-soft)]">
              <span className="truncate">{stamp}</span>
              <span>{entry.photo.width}×{entry.photo.height}</span>
            </div>
          </div>

          <div
            className="relative overflow-hidden border-b border-[var(--line)] bg-[var(--panel-ink)]"
            style={{
              aspectRatio: entry.aspectRatio,
            }}
          >
            <img
              src={entry.photo.src}
              srcSet={entry.photo.srcSet}
              sizes={coverSlotWidth > 0 ? `${coverSlotWidth}px` : entry.photo.sizes}
              alt={entry.photo.alt}
              loading="lazy"
              decoding="async"
              className="h-full w-full object-cover transition duration-200 group-hover:contrast-[1.04] group-hover:saturate-[0.94] group-hover:brightness-[1.02]"
            />
          </div>

          <div className="flex h-[42px] items-center bg-[linear-gradient(180deg,var(--panel-strong)_0%,var(--panel)_100%)] px-3 py-2">
            <p className="m-0 truncate text-[12px] font-bold text-[var(--text-strong)]">{title}</p>
          </div>
        </button>
      </div>
    </div>
  )
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
