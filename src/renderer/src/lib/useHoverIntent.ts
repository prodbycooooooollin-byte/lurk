import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Hover mit kurzer Verzögerung beim Öffnen und Schließen, damit Seitenleisten
 * nicht aufklappen, wenn man nur mit der Maus vorbeifährt.
 */
export function useHoverIntent(openDelay = 180, closeDelay = 220) {
  const [hover, setHover] = useState(false)
  const timer = useRef<number | undefined>(undefined)
  const enter = useCallback(() => {
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setHover(true), openDelay)
  }, [openDelay])
  const leave = useCallback(() => {
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setHover(false), closeDelay)
  }, [closeDelay])
  const reset = useCallback(() => {
    window.clearTimeout(timer.current)
    setHover(false)
  }, [])
  useEffect(() => () => window.clearTimeout(timer.current), [])
  return { hover, enter, leave, reset }
}
