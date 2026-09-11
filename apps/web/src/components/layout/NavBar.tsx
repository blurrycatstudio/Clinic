import { MoreHorizontal } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { NavLink, useLocation } from "react-router-dom"
import { useLang } from "@/lib/i18n"
import { NAV_ITEMS } from "@/lib/nav"
import { cn } from "@/lib/utils"

function NavPill({ item, t }: { item: (typeof NAV_ITEMS)[number]; t: ReturnType<typeof useLang>["t"] }) {
  return (
    <NavLink
      to={item.path}
      end={item.path === "/"}
      className={({ isActive }) =>
        cn(
          "flex shrink-0 items-center gap-2 rounded-full px-4 py-2 font-semibold transition-colors",
          isActive
            ? "bg-[#EFF6FF] text-[#2563EB] shadow-sm"
            : "border border-transparent text-[#64748B] hover:bg-[#F8FAFC] hover:text-foreground",
        )
      }
    >
      <item.icon className="size-4" strokeWidth={2} style={{ color: item.iconColor }} />
      <span className="whitespace-nowrap">{t[item.labelKey]}</span>
      {item.badge ? (
        <span
          className="rounded-full px-1.5 py-0.5 text-[9px] font-bold text-white"
          style={{ backgroundColor: item.badgeColor ?? "#2563EB" }}
        >
          {item.badge}
        </span>
      ) : null}
    </NavLink>
  )
}

export function NavBar() {
  const { t } = useLang()
  const location = useLocation()
  const [moreOpen, setMoreOpen] = useState(false)
  const moreRef = useRef<HTMLDivElement>(null)

  const primaryItems = NAV_ITEMS.filter((item) => item.mobilePrimary)
  const moreItems = NAV_ITEMS.filter((item) => !item.mobilePrimary)
  const moreActive = moreItems.some((item) => item.path === location.pathname)

  useEffect(() => setMoreOpen(false), [location.pathname])

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (moreRef.current && !moreRef.current.contains(e.target as Node)) setMoreOpen(false)
    }
    document.addEventListener("mousedown", onClick)
    return () => document.removeEventListener("mousedown", onClick)
  }, [])

  return (
    <nav className="scrollbar-hide flex h-14 shrink-0 items-center justify-between gap-4 overflow-x-auto border-b border-border/60 bg-white px-3 text-[13.5px] sm:px-6">
      {/* Mobile: only the essentials, everything else tucked under "More". */}
      <div className="flex items-center gap-2 sm:hidden">
        {primaryItems.map((item) => (
          <NavPill key={item.path} item={item} t={t} />
        ))}
        <div ref={moreRef} className="relative shrink-0">
          <button
            onClick={() => setMoreOpen((v) => !v)}
            className={cn(
              "flex shrink-0 items-center gap-2 rounded-full px-4 py-2 font-semibold transition-colors",
              moreActive
                ? "bg-[#EFF6FF] text-[#2563EB] shadow-sm"
                : "border border-transparent text-[#64748B] hover:bg-[#F8FAFC] hover:text-foreground",
            )}
          >
            <MoreHorizontal className="size-4" strokeWidth={2} />
            <span className="whitespace-nowrap">{t.navMore}</span>
          </button>
          {moreOpen && (
            <div className="absolute top-full left-0 z-50 mt-2 flex w-52 flex-col gap-0.5 rounded-xl border bg-card p-1.5 shadow-atelier-elevated">
              {moreItems.map((item) => (
                <NavLink
                  key={item.path}
                  to={item.path}
                  className={({ isActive }) =>
                    cn(
                      "flex items-center gap-2.5 rounded-lg px-2.5 py-2 font-semibold transition-colors",
                      isActive ? "bg-[#EFF6FF] text-[#2563EB]" : "text-[#64748B] hover:bg-muted hover:text-foreground",
                    )
                  }
                >
                  <item.icon className="size-4" strokeWidth={2} style={{ color: item.iconColor }} />
                  <span className="whitespace-nowrap">{t[item.labelKey]}</span>
                </NavLink>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Desktop / tablet: full nav row, plenty of room so nothing needs to hide. */}
      <div className="hidden items-center gap-2 sm:flex">
        {NAV_ITEMS.map((item) => (
          <NavPill key={item.path} item={item} t={t} />
        ))}
      </div>

      <div className="hidden shrink-0 items-center gap-2 text-[11px] text-muted-foreground md:flex">
        <span className="flex items-center gap-1">
          <span className="size-1.5 rounded-full bg-secondary" />
          <strong className="font-semibold text-foreground">{t.clinicActiveLabel}</strong>
        </span>
        <span>•</span>
        <span className="font-heading text-[13px] text-primary italic">{t.sidebarQuote.replace("\n", " ")}</span>
      </div>
    </nav>
  )
}
