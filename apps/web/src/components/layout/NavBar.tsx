import { NavLink } from "react-router-dom"
import { useLang } from "@/lib/i18n"
import { NAV_ITEMS } from "@/lib/nav"
import { cn } from "@/lib/utils"

export function NavBar() {
  const { t } = useLang()

  return (
    <nav className="scrollbar-hide flex h-11 shrink-0 items-center justify-between gap-4 overflow-x-auto border-b border-border/60 bg-white px-6 text-xs">
      <div className="flex items-center gap-1.5">
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            end={item.path === "/"}
            className={({ isActive }) =>
              cn(
                "flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1 font-semibold transition-colors",
                isActive
                  ? "bg-[#EFF6FF] text-[#2563EB] shadow-sm"
                  : "border border-transparent text-[#64748B] hover:bg-[#F8FAFC] hover:text-foreground",
              )
            }
          >
            <item.icon className="size-3.5" strokeWidth={2} style={{ color: item.iconColor }} />
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
