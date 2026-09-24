import { type CSSProperties, type PointerEvent, type ReactNode, useCallback, useEffect, useLayoutEffect, useRef, useMemo, useState } from 'react'
import { useVirtualizer, type VirtualItem } from '@tanstack/react-virtual'

import { crayonArt, type CSSVars } from '../lib/crayonArt'
import type { GalleryItem } from '../lib/types'
import { PencilPhoto } from './PencilPhoto'

const CARD_CHROME_HEIGHT = 78
const MASONRY_LANDSCAPE_RATIOS = [0.666, 0.75, 0.875]
const MASONRY_SQUARE_RATIOS = [1]

type MasonryGalleryProps = {
  photos?: GalleryItem[]
  items?: { photo: GalleryItem; globalIndex: number }[]
  onOpen: (index: number) => void
  onView: (photoID: number) => void
  enableHoverTilt: boolean
  enablePencil: boolean
  isMasonry?: boolean
  lead?: ReactNode
  leadHeight?: number
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
  offset: number
}

export function MasonryGallery({ photos, items, onOpen, onView, enableHoverTilt, enablePencil, isMasonry, lead, leadHeight = 0 }: MasonryGalleryProps) {
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
    const minColumnWidth = isMasonry ? 360 : 500
    const maxColumns = isMasonry ? 5 : 4
    const count =
      width > 0
        ? Math.max(1, Math.min(maxColumns, Math.floor((width + gap) / (minColumnWidth + gap))))
        : isMasonry
          ? 3
          : 2
    const columnWidth = width > 0 ? Math.max(minColumnWidth, Math.floor((width - gap * (count - 1)) / count)) : minColumnWidth
    const offset = lead && count > 1 ? leadHeight : 0
    const next = Array.from({ length: count }, (_, index) => ({
      key: `column-${index}`,
      items: [] as MasonryEntry[],
      height: index === 0 ? offset : 0,
      offset: index === 0 ? offset : 0,
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
      const estimatedHeight = imageHeight + CARD_CHROME_HEIGHT
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
  }, [isMasonry, items, lead, leadHeight, photos, width])

  const isLeadInColumn = columns.columns[0]?.offset > 0

  return (
    <div ref={containerRef} className="w-full">
      {lead && !isLeadInColumn ? <div style={{ height: `${leadHeight}px` }}>{lead}</div> : null}
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
            enablePencil={enablePencil}
            lead={column.offset > 0 ? lead : null}
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
  enablePencil,
  lead,
}: {
  column: MasonryColumn
  gap: number
  columnWidth: number
  scrollElement: HTMLElement | null
  onOpen: (index: number) => void
  onView: (photoID: number) => void
  enableHoverTilt: boolean
  enablePencil: boolean
  lead: ReactNode
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
    <div>
      {column.offset > 0 ? <div style={{ height: `${column.offset}px` }}>{lead}</div> : null}
      <div ref={setParentElement} className="relative" style={{ height: `${column.height - column.offset}px` }}>
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
              enablePencil={enablePencil}
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
  enablePencil,
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
  enablePencil: boolean
  scrollElement: HTMLElement | null
  measureElement: (node: Element | null) => void
}) {
  const [cardElement, setCardElement] = useState<HTMLDivElement | null>(null)
  const tiltCardRef = useRef<HTMLDivElement | null>(null)
  const coverSlotWidth = getCoverSlotWidth(columnWidth, entry.imageHeight, entry.photo.width, entry.photo.height)
  const title = getPhotoLabel(entry.photo)
  const stamp = formatShortDate(entry.photo.capturedAt || entry.photo.updatedAt) || 'Undated'
  const decor = getCardDecor(entry.photo.id)
  const cardStyle: CSSVars = {
    '--tilt-transform': RESTING_TILT,
    '--frame-color': decor.color,
    '--frame-shift': `${-decor.shift}px`,
    '--paper-x': `${-decor.shift}px`,
    '--paper-y': `${-(decor.shift * 3) % 768}px`,
  }
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

    element.style.setProperty('--tilt-transform', RESTING_TILT)
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
        className="crayon-card crayon-frame group w-full"
        role="button"
        tabIndex={0}
        style={cardStyle}
        onPointerMove={handleTiltPointerMove}
        onPointerLeave={handleTiltPointerLeave}
        onClick={() => onOpen(entry.index)}
        onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') onOpen(entry.index) }}
      >
        <div className="crayon-card-photo crayon-frame w-full shrink-0" style={{ aspectRatio: entry.aspectRatio }}>
          <PencilPhoto
            key={entry.photo.src}
            photo={entry.photo}
            sizes={coverSlotWidth > 0 ? `${coverSlotWidth}px` : entry.photo.sizes}
            enabled={enablePencil}
          />
        </div>

        <div className="crayon-caption">
          <img src={crayonArt(decor.camera)} alt="" className="crayon-caption-icon" />
          <div className="min-w-0 flex-1">
            <p className="crayon-caption-title truncate" title={title}>{title}</p>
            <div className="crayon-caption-meta">
              <span>{stamp}</span>
              <span>{entry.photo.width}×{entry.photo.height}</span>
              {entry.photo.starCount > 0 ? (
                <span className="crayon-caption-stars" aria-label={`${formatCount(entry.photo.starCount)} stars`}>
                  <img src={crayonArt('star-yellow')} alt="" style={entry.photo.starred ? undefined : UNSTARRED_STYLE} />
                  <span>{formatCount(entry.photo.starCount)}</span>
                </span>
              ) : null}
            </div>
          </div>
        </div>

        <img src={crayonArt(decor.doodle)} alt="" className="crayon-caption-doodle" />
        {decor.stickers.map((sticker) => (
          <img key={sticker.art} src={crayonArt(sticker.art)} alt="" className="crayon-sticker" style={sticker.style} />
        ))}
      </div>
    </div>
  )
}

const FRAME_COLORS = [
  { color: 'var(--crayon-pink)', camera: 'camera-pink' },
  { color: 'var(--crayon-blue)', camera: 'camera-blue' },
  { color: 'var(--crayon-purple)', camera: 'camera-purple' },
  { color: 'var(--crayon-lilac)', camera: 'camera-lilac' },
  { color: 'var(--crayon-yellow)', camera: 'camera-yellow' },
  { color: 'var(--crayon-green)', camera: 'camera-green' },
]

const CAPTION_DOODLES = ['heart-small', 'smiley-green', 'star-yellow', 'flower-pink', 'paw-small', 'smiley-yellow', 'heart-blue', 'flower-blue']

type Sticker = {
  art: string
  style: CSSVars
}

const STICKER_SETS: Sticker[][] = [
  [
    { art: 'bear-small-sticker', style: { right: '16px', bottom: '72px', width: '55px' } },
    { art: 'heart-small-sticker', style: { left: '-13px', top: '58%', width: '28px', '--r': '-12deg' } },
  ],
  [{ art: 'flower-teal-sticker', style: { right: '-15px', top: '-15px', width: '48px' } }],
  [{ art: 'tape-gingham', style: { left: '-22px', top: '-17px', width: '60px', '--r': '-6deg' } }],
  [
    { art: 'star-yellow-sticker', style: { left: '-13px', top: '-13px', width: '39px' } },
    { art: 'heart-blue-sticker', style: { right: '-9px', top: '-9px', width: '30px', '--r': '12deg' } },
    { art: 'flower-blue-sticker', style: { left: '-11px', bottom: '52px', width: '32px' } },
  ],
  [],
  [{ art: 'tape-purple', style: { right: '-20px', bottom: '-15px', width: '64px', '--r': '4deg' } }],
  [{ art: 'smiley-yellow-sticker', style: { right: '-13px', top: '-13px', width: '37px' } }],
  [
    { art: 'sparkle-small-yellow-sticker', style: { right: '18px', top: '18px', width: '26px' } },
    { art: 'heart-small-sticker', style: { left: '-13px', top: '-13px', width: '30px', '--r': '-10deg' } },
  ],
]

const UNSTARRED_STYLE: CSSProperties = { filter: 'grayscale(1)', opacity: 0.6 }

function getCardDecor(photoID: number) {
  const hash = Math.imul(photoID + 1, 2654435761) >>> 0
  const frame = FRAME_COLORS[hash % FRAME_COLORS.length]
  return {
    ...frame,
    doodle: CAPTION_DOODLES[(hash >>> 5) % CAPTION_DOODLES.length],
    stickers: STICKER_SETS[(hash >>> 11) % STICKER_SETS.length],
    shift: (hash >>> 17) % 340,
  }
}

const RESTING_TILT = 'perspective(900px) rotateX(0deg) rotateY(0deg) scale(1)'

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
