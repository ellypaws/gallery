import { useEffect, useLayoutEffect, useRef, useState } from 'react'

import type { CSSVars } from '../lib/crayonArt'
import { PENCIL_FRAMES, renderPencil } from '../lib/pencil'
import type { GalleryItem } from '../lib/types'

type PencilState = 'pending' | 'ready' | 'failed'

type SlotSize = {
  width: number
  height: number
}

type PencilPhotoProps = {
  photo: GalleryItem
  sizes: string
  enabled: boolean
}

// Shows the colored-pencil rendering of a photo; the original shows through on hover.
export function PencilPhoto({ photo, sizes, enabled }: PencilPhotoProps) {
  const slotRef = useRef<HTMLDivElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const mediaRef = useRef<HTMLImageElement | HTMLVideoElement | null>(null)
  const [slotSize, setSlotSize] = useState<SlotSize | null>(null)
  const [isMediaReady, setIsMediaReady] = useState(false)
  const [state, setState] = useState<PencilState>('pending')
  const [frames] = useState(() => (window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 1 : PENCIL_FRAMES))

  useLayoutEffect(() => {
    const slot = slotRef.current
    if (!slot) {
      return
    }

    const observer = new ResizeObserver(([entry]) => {
      const width = Math.round(entry.contentRect.width)
      const height = Math.round(entry.contentRect.height)
      setSlotSize((current) => (current?.width === width && current.height === height ? current : { width, height }))
    })
    observer.observe(slot)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!enabled || !photo.crayonSrc || !slotSize || slotSize.width === 0 || slotSize.height === 0 || !canvas) {
      return
    }

    const controller = new AbortController()
    const art = new Image()
    art.src = photo.crayonSrc
    art
      .decode()
      .then(() =>
        renderPencil({
          mode: 'boil',
          source: art,
          sourceWidth: art.naturalWidth,
          sourceHeight: art.naturalHeight,
          width: slotSize.width,
          height: slotSize.height,
          frames,
          seed: (photo.id % 97) * 0.37,
          canvas,
          signal: controller.signal,
        }),
      )
      .then(() => {
        if (!controller.signal.aborted) {
          setState('ready')
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setState('failed')
        }
      })

    return () => controller.abort()
  }, [enabled, frames, photo.crayonSrc, photo.id, slotSize])

  useEffect(() => {
    const canvas = canvasRef.current
    const media = mediaRef.current
    if (!enabled || photo.crayonSrc || !isMediaReady || !slotSize || slotSize.width === 0 || slotSize.height === 0 || !canvas || !media) {
      return
    }

    const controller = new AbortController()
    const sourceWidth = media instanceof HTMLImageElement ? media.naturalWidth : media.videoWidth
    const sourceHeight = media instanceof HTMLImageElement ? media.naturalHeight : media.videoHeight
    renderPencil({
      mode: 'pencil',
      source: media,
      sourceWidth: sourceWidth || photo.width,
      sourceHeight: sourceHeight || photo.height,
      width: slotSize.width,
      height: slotSize.height,
      frames,
      seed: (photo.id % 97) * 0.37,
      canvas,
      signal: controller.signal,
    })
      .then(() => {
        if (!controller.signal.aborted) {
          setState('ready')
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setState('failed')
        }
      })

    return () => controller.abort()
  }, [enabled, frames, isMediaReady, photo.crayonSrc, photo.height, photo.id, photo.width, slotSize])

  useEffect(() => {
    const canvas = canvasRef.current
    return () => {
      if (canvas) {
        canvas.width = 0
        canvas.height = 0
      }
    }
  }, [])

  const spriteStyle: CSSVars = {
    '--frames': frames,
    '--boil-delay': `${-((photo.id * 530) % 3000)}ms`,
  }

  return (
    <div ref={slotRef} className="crayon-card-slot h-full" data-pencil-enabled={enabled}>
      <div className="pencil-sprite" data-ready={state === 'ready'} data-frames={frames} style={spriteStyle} aria-hidden="true">
        <canvas ref={canvasRef} />
      </div>
      {photo.mediaType === 'video' ? (
        <video
          ref={(node) => {
            mediaRef.current = node
          }}
          src={photo.src}
          poster={photo.placeholder}
          muted
          loop
          autoPlay
          playsInline
          preload="metadata"
          onLoadedData={() => setIsMediaReady(true)}
          data-pencil={state}
          className="pencil-media"
        />
      ) : (
        <img
          ref={(node) => {
            mediaRef.current = node
          }}
          src={photo.src}
          srcSet={photo.srcSet}
          sizes={sizes}
          alt={photo.alt}
          loading="lazy"
          decoding="async"
          onLoad={() => setIsMediaReady(true)}
          onError={() => setState('failed')}
          data-pencil={state}
          className="pencil-media"
        />
      )}
    </div>
  )
}
