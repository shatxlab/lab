import type { RefObject } from 'react'
import { useLayoutEffect, useState } from 'react'

/** The element's current width in pixels, kept up to date as it resizes. */
export function useWidth(ref: RefObject<HTMLElement | null>, fallback = 320): number {
  const [width, setWidth] = useState(fallback)
  useLayoutEffect(() => {
    const element = ref.current
    if (!element) return
    setWidth(element.clientWidth || fallback)
    const observer = new ResizeObserver(() => setWidth(element.clientWidth || fallback))
    observer.observe(element)
    return () => observer.disconnect()
  }, [ref, fallback])
  return width
}
