'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * P12 · resizable drawer hook with localStorage persistence.
 *
 * The user can grab the resize handle on a drawer's edge and drag to
 * change its width. Width survives reload via localStorage keyed by
 * `storageKey`. Supports both left-anchored drawers (drag right edge,
 * direction='right') and right-anchored drawers (drag left edge,
 * direction='left').
 *
 * Implementation notes:
 *   - listeners attached to document during drag, removed on mouseup,
 *     so the drawer doesn't leak handlers if it unmounts mid-drag
 *   - body cursor + user-select changed during drag for clear UX
 *     and to prevent text selection while dragging
 *   - width clamped to [minWidth, maxWidth] every frame
 *   - throttled localStorage write on drag end (not every move) to
 *     keep the writes off the hot path
 */
export type ResizeDirection = 'left' | 'right'

interface Options {
  storageKey: string
  defaultWidth: number
  minWidth: number
  maxWidth: number
  direction: ResizeDirection
}

export function useResizableDrawer({
  storageKey,
  defaultWidth,
  minWidth,
  maxWidth,
  direction
}: Options) {
  const [width, setWidth] = useState(defaultWidth)
  const draggingRef = useRef(false)
  const startXRef = useRef(0)
  const startWidthRef = useRef(defaultWidth)
  // P12 · keep latest width in a ref so stopDrag (whose listener was
  // captured at mousedown time) can read the live value when mouseup
  // fires. Without this, the useCallback closure captures the width
  // from mousedown and localStorage gets the OLD width on save.
  const widthRef = useRef(defaultWidth)
  const setWidthBoth = useCallback((next: number) => {
    widthRef.current = next
    setWidth(next)
  }, [])

  // Hydrate from localStorage on mount.
  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      const raw = window.localStorage.getItem(storageKey)
      if (raw) {
        const n = Number(raw)
        if (Number.isFinite(n) && n >= minWidth && n <= maxWidth) {
          widthRef.current = n
          setWidth(n)
        }
      }
    } catch {
      // ignore — localStorage can throw in private mode
    }
  }, [storageKey, minWidth, maxWidth])

  const onMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!draggingRef.current) return
      const dx = e.clientX - startXRef.current
      // Left-anchored drawer (chat dock on the left): dragging RIGHT
      // makes it WIDER (delta = +dx). Right-anchored drawer (BMC
      // detail drawer on the right): dragging LEFT makes it WIDER
      // (delta = -dx).
      const delta = direction === 'right' ? dx : -dx
      const next = Math.max(minWidth, Math.min(maxWidth, startWidthRef.current + delta))
      setWidthBoth(next)
    },
    [direction, minWidth, maxWidth, setWidthBoth]
  )

  const stopDrag = useCallback(() => {
    if (!draggingRef.current) return
    draggingRef.current = false
    document.body.style.userSelect = ''
    document.body.style.cursor = ''
    document.removeEventListener('mousemove', onMouseMove)
    document.removeEventListener('mouseup', stopDrag)
    // Persist final width via the ref so we get the LIVE value, not
    // the closure-captured one.
    try {
      window.localStorage.setItem(storageKey, String(widthRef.current))
    } catch {
      // ignore
    }
  }, [onMouseMove, storageKey])

  const startDrag = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      draggingRef.current = true
      startXRef.current = e.clientX
      startWidthRef.current = widthRef.current
      document.body.style.userSelect = 'none'
      document.body.style.cursor = 'col-resize'
      document.addEventListener('mousemove', onMouseMove)
      document.addEventListener('mouseup', stopDrag)
    },
    [onMouseMove, stopDrag]
  )

  // Cleanup if component unmounts mid-drag.
  useEffect(() => {
    return () => {
      if (draggingRef.current) {
        document.removeEventListener('mousemove', onMouseMove)
        document.removeEventListener('mouseup', stopDrag)
        document.body.style.userSelect = ''
        document.body.style.cursor = ''
      }
    }
  }, [onMouseMove, stopDrag])

  return { width, startDrag }
}

/**
 * The resize handle JSX. Position it at the drawer's draggable edge:
 *   - left-anchored drawer (chat): edge = right
 *   - right-anchored drawer (detail): edge = left
 *
 * The handle is 4px wide hairline that turns navy on hover. The
 * caller wraps the drawer in `position: relative` and the handle
 * absolute-positions itself to the chosen edge.
 */
export function ResizeHandle({
  edge,
  onMouseDown
}: {
  edge: ResizeDirection
  onMouseDown: (e: React.MouseEvent) => void
}) {
  const positionClass = edge === 'right' ? 'right-0' : 'left-0'
  return (
    <div
      onMouseDown={onMouseDown}
      role="separator"
      aria-orientation="vertical"
      aria-label="拖动调整宽度"
      className={`absolute top-0 bottom-0 ${positionClass} w-1 cursor-col-resize z-10 group hover:bg-stratum-blue/40 transition-colors`}
    >
      {/* 1.5px visible track that pops on hover */}
      <div className="absolute top-0 bottom-0 left-1/2 -translate-x-1/2 w-[1.5px] bg-transparent group-hover:bg-stratum-navy transition-colors" />
    </div>
  )
}
