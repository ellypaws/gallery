import { type PointerEvent, type ReactNode, useLayoutEffect, useRef, useState } from 'react'

const ARROW_HEIGHT = 34
const MIN_THUMB_HEIGHT = 44
const ARROW_STEP = 140

type ThumbMetrics = {
  top: number
  height: number
  visible: boolean
}

type DragState = {
  pointerId: number
  startY: number
  startScroll: number
}

// Scroll container with the crayon scrollbar drawn over a hidden native one.
export function CrayonScrollArea({ children }: { children: ReactNode }) {
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const trackRef = useRef<HTMLDivElement | null>(null)
  const dragRef = useRef<DragState | null>(null)
  const [thumb, setThumb] = useState<ThumbMetrics>({ top: ARROW_HEIGHT, height: MIN_THUMB_HEIGHT, visible: false })

  useLayoutEffect(() => {
    const scroller = scrollRef.current
    const track = trackRef.current
    if (!scroller || !track) {
      return
    }

    let frame = 0
    const update = () => {
      frame = 0
      const range = track.clientHeight - ARROW_HEIGHT * 2
      const { scrollHeight, clientHeight, scrollTop } = scroller
      const visible = scrollHeight > clientHeight + 1
      const height = Math.max(MIN_THUMB_HEIGHT, Math.round((clientHeight / scrollHeight) * range))
      const maxScroll = scrollHeight - clientHeight
      const top = ARROW_HEIGHT + (maxScroll > 0 ? Math.round((scrollTop / maxScroll) * (range - height)) : 0)
      setThumb((current) =>
        current.top === top && current.height === height && current.visible === visible ? current : { top, height, visible },
      )
    }
    const schedule = () => {
      if (frame === 0) {
        frame = requestAnimationFrame(update)
      }
    }

    update()
    scroller.addEventListener('scroll', schedule, { passive: true })
    const resizeObserver = new ResizeObserver(schedule)
    resizeObserver.observe(scroller)
    resizeObserver.observe(track)
    const mutationObserver = new MutationObserver(schedule)
    mutationObserver.observe(scroller, { childList: true, subtree: true, attributes: true, attributeFilter: ['style'] })

    return () => {
      cancelAnimationFrame(frame)
      scroller.removeEventListener('scroll', schedule)
      resizeObserver.disconnect()
      mutationObserver.disconnect()
    }
  }, [])

  function scrollByStep(direction: 1 | -1) {
    scrollRef.current?.scrollBy({ top: direction * ARROW_STEP, behavior: 'smooth' })
  }

  function handleTrackPointerDown(event: PointerEvent<HTMLDivElement>) {
    const scroller = scrollRef.current
    if (!scroller || event.target !== event.currentTarget) {
      return
    }
    const rect = event.currentTarget.getBoundingClientRect()
    const direction = event.clientY - rect.top < thumb.top ? -1 : 1
    scroller.scrollBy({ top: direction * scroller.clientHeight * 0.9, behavior: 'smooth' })
  }

  function handleThumbPointerDown(event: PointerEvent<HTMLDivElement>) {
    const scroller = scrollRef.current
    if (!scroller) {
      return
    }
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    dragRef.current = { pointerId: event.pointerId, startY: event.clientY, startScroll: scroller.scrollTop }
  }

  function handleThumbPointerMove(event: PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current
    const scroller = scrollRef.current
    const track = trackRef.current
    if (!drag || drag.pointerId !== event.pointerId || !scroller || !track) {
      return
    }
    const range = track.clientHeight - ARROW_HEIGHT * 2 - thumb.height
    const maxScroll = scroller.scrollHeight - scroller.clientHeight
    if (range > 0) {
      scroller.scrollTop = drag.startScroll + ((event.clientY - drag.startY) / range) * maxScroll
    }
  }

  function handleThumbPointerUp(event: PointerEvent<HTMLDivElement>) {
    if (dragRef.current?.pointerId === event.pointerId) {
      dragRef.current = null
    }
  }

  return (
    <div className="crayon-scroll-area">
      <div ref={scrollRef} className="crayon-scroll">
        {children}
      </div>
      <div
        ref={trackRef}
        className="crayon-scrollbar"
        style={{ visibility: thumb.visible ? 'visible' : 'hidden' }}
        onPointerDown={handleTrackPointerDown}
        aria-hidden="true"
      >
        <button type="button" tabIndex={-1} className="crayon-scrollbar-arrow crayon-scrollbar-arrow-up" onClick={() => scrollByStep(-1)} />
        <div
          className="crayon-scrollbar-thumb"
          style={{ top: `${thumb.top}px`, height: `${thumb.height}px` }}
          onPointerDown={handleThumbPointerDown}
          onPointerMove={handleThumbPointerMove}
          onPointerUp={handleThumbPointerUp}
          onPointerCancel={handleThumbPointerUp}
        />
        <button type="button" tabIndex={-1} className="crayon-scrollbar-arrow crayon-scrollbar-arrow-down" onClick={() => scrollByStep(1)} />
      </div>
    </div>
  )
}
