import { useEffect, useState } from "react"

/** True when the viewport is narrower than the given breakpoint (default: Tailwind's `sm`, 640px). Updates live on resize. */
export function useIsMobileViewport(breakpoint = 640): boolean {
  const [isMobile, setIsMobile] = useState(() => window.matchMedia(`(max-width: ${breakpoint - 1}px)`).matches)

  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${breakpoint - 1}px)`)
    const handler = () => setIsMobile(mq.matches)
    handler()
    mq.addEventListener("change", handler)
    return () => mq.removeEventListener("change", handler)
  }, [breakpoint])

  return isMobile
}
