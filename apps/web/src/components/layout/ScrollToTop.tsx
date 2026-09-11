import { useEffect } from "react"
import { useLocation } from "react-router-dom"

/**
 * React Router doesn't reset scroll position on navigation (unlike a
 * traditional multi-page site) — without this, clicking into a patient/contact
 * from a scrolled-down list leaves the new screen scrolled to wherever the
 * previous one was, instead of starting at the top.
 */
export function ScrollToTop() {
  const { pathname } = useLocation()

  useEffect(() => {
    window.scrollTo(0, 0)
  }, [pathname])

  return null
}
