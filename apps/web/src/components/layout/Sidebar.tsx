import { Heart, Leaf } from "lucide-react"
import { NavLink } from "react-router-dom"
import { useLang } from "@/lib/i18n"
import { NAV_ITEMS } from "@/lib/nav"
import { cn } from "@/lib/utils"

export function Sidebar() {
  const { t } = useLang()

  return (
    <aside className="relative isolate flex h-full w-64 shrink-0 flex-col overflow-hidden bg-sidebar px-4 pt-6 pb-4 text-sidebar-foreground">
      {/* liquid glass backdrop: blurred gradient blobs + frosted glaze */}
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute -top-24 -left-16 size-72 rounded-full bg-[radial-gradient(circle,oklch(0.62_0.14_152/0.55),transparent_70%)] blur-3xl" />
        <div className="absolute top-1/3 -right-20 size-64 rounded-full bg-[radial-gradient(circle,oklch(0.7_0.15_45/0.35),transparent_70%)] blur-3xl" />
        <div className="absolute bottom-0 left-0 size-80 rounded-full bg-[radial-gradient(circle,oklch(0.55_0.1_152/0.45),transparent_70%)] blur-3xl" />
        <div className="absolute inset-0 bg-white/[0.04] backdrop-blur-2xl" />
        <div className="absolute inset-0 bg-gradient-to-b from-white/[0.08] via-transparent to-black/20" />
      </div>
      <div className="pointer-events-none absolute inset-y-0 right-0 w-px bg-gradient-to-b from-white/25 via-white/5 to-transparent" />

      <div className="flex items-center gap-2.5 px-1.5 pb-6">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-[11px] border border-white/15 bg-white/10 shadow-[inset_0_1px_0_rgba(255,255,255,0.25)] backdrop-blur-md">
          <Heart className="size-5 text-white" strokeWidth={1.8} fill="currentColor" fillOpacity={0.15} />
        </div>
        <div className="leading-tight">
          <div className="font-heading text-[19px] font-bold text-white">Pediatra</div>
          <div className="text-[11.5px] text-sidebar-foreground/70">
            {t.brandTagline1}
            <br />
            {t.brandTagline2}
          </div>
        </div>
      </div>

      <nav className="flex flex-col gap-0.5">
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            end={item.path === "/"}
            className={({ isActive }) =>
              cn(
                "flex items-center gap-3 rounded-[10px] px-3 py-2.5 text-sm font-semibold transition-all",
                isActive
                  ? "border border-white/20 bg-white/15 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.3),0_4px_16px_-4px_rgba(0,0,0,0.4)] backdrop-blur-md"
                  : "border border-transparent text-sidebar-foreground/80 hover:border-white/10 hover:bg-white/[0.08]",
              )
            }
          >
            <item.icon className="size-[18px] shrink-0" strokeWidth={1.8} />
            <span className="truncate">{t[item.labelKey]}</span>
            {item.badge ? (
              <span className="ml-auto rounded-full border border-white/15 bg-white/15 px-[7px] py-0.5 text-[11px] font-bold text-white">
                {item.badge}
              </span>
            ) : null}
          </NavLink>
        ))}
      </nav>

      <div className="relative mt-auto">
        <Leaf
          className="pointer-events-none absolute -bottom-6 -left-6 size-28 text-white/[0.07]"
          strokeWidth={1}
          fill="currentColor"
        />
        <div className="relative rounded-[12px] border border-white/10 bg-white/[0.06] p-3.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.15)] backdrop-blur-md">
          <p className="font-heading text-[13px] leading-relaxed whitespace-pre-line text-sidebar-foreground/90 italic">
            {t.sidebarQuote} <Heart className="inline size-3.5 -translate-y-0.5 text-[#e2764a]" fill="currentColor" strokeWidth={0} />
          </p>
        </div>
      </div>
    </aside>
  )
}
