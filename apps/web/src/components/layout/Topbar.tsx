import { Bell, ChevronDown, Heart, Moon, Search, Sun } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { useNavigate } from "react-router-dom"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Input } from "@/components/ui/input"
import { useLang } from "@/lib/i18n"
import { cn } from "@/lib/utils"

const NOTIFICATIONS = [
  { title: "Appointment reminder", detail: "Emilia Torres checks in at 9:00 AM today.", time: "5m ago" },
  { title: "Lab results ready", detail: "Sofía Delgado's chest X-ray results are in.", time: "1h ago" },
  { title: "Invoice overdue", detail: "INV-3009 for Diego Navarro is past due.", time: "3h ago" },
]

function useDarkMode() {
  const [dark, setDark] = useState(() => document.documentElement.classList.contains("dark"))

  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark)
  }, [dark])

  return { dark, toggle: () => setDark((v) => !v) }
}

export function Topbar() {
  const { lang, setLang, t } = useLang()
  const navigate = useNavigate()
  const { dark, toggle } = useDarkMode()
  const [notifOpen, setNotifOpen] = useState(false)
  const notifRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) setNotifOpen(false)
    }
    document.addEventListener("mousedown", onClick)
    return () => document.removeEventListener("mousedown", onClick)
  }, [])

  return (
    <header className="flex h-16 shrink-0 items-center justify-between gap-7 border-b border-border/60 bg-white px-6 shadow-sm">
      <div className="flex items-center gap-3">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[#F97316] via-[#EC4899] to-[#2563EB] text-white shadow-sm">
          <Heart className="size-4.5" strokeWidth={1.8} fill="currentColor" fillOpacity={0.25} />
        </div>
        <div className="leading-tight">
          <div className="flex items-center gap-2">
            <span className="font-heading text-base font-bold tracking-widest text-foreground uppercase">Pediatra</span>
            <span className="rounded-full border border-[#F97316]/30 bg-[#FFF7ED] px-2 py-0.5 text-[9px] font-bold tracking-wide text-[#EA580C] uppercase">
              {t.headerBadge}
            </span>
          </div>
          <p className="text-[10.5px] font-medium text-muted-foreground">
            {t.brandTagline1} · {t.brandTagline2}
          </p>
        </div>
      </div>

      <div className="relative w-full max-w-96">
        <Search className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder={t.searchPlaceholder}
          className="rounded-full border bg-muted/70 pr-16 pl-10 text-[13.5px] shadow-inner focus-visible:border-primary focus-visible:bg-card"
        />
        <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 rounded-md border border-border bg-muted px-1.5 py-0.5 text-[10.5px] font-semibold text-muted-foreground">
          {t.searchShortcut}
        </span>
      </div>

      <div className="hidden items-center gap-2 rounded-full border border-[#16A34A]/20 bg-[#F0FDF4] px-3 py-1 text-[11px] font-medium text-[#16A34A] lg:flex">
        <span className="relative flex size-2">
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-[#16A34A] opacity-75" />
          <span className="relative inline-flex size-2 rounded-full bg-[#16A34A]" />
        </span>
        {t.clinicActiveLabel}
      </div>

      <button
        onClick={toggle}
        className="flex size-9.5 items-center justify-center rounded-[10px] hover:bg-muted"
        aria-label="Toggle dark mode"
      >
        {dark ? (
          <Moon className="size-[19px] text-foreground" strokeWidth={1.8} />
        ) : (
          <Sun className="size-[19px] text-foreground" strokeWidth={1.8} />
        )}
      </button>

      <div ref={notifRef} className="relative">
        <button
          onClick={() => setNotifOpen((v) => !v)}
          className="relative flex size-9.5 items-center justify-center rounded-[10px] hover:bg-muted"
          aria-label="Notifications"
        >
          <Bell className="size-[19px] text-foreground" strokeWidth={1.8} />
          <span className="absolute top-1.5 right-1.5 size-2 rounded-full border-2 border-card bg-destructive" />
        </button>
        {notifOpen && (
          <div className="absolute top-full right-0 z-50 mt-2 w-80 rounded-xl border bg-card p-2 shadow-atelier-elevated">
            <div className="px-2 py-1.5 text-xs font-bold text-muted-foreground uppercase">Notifications</div>
            <div className="flex flex-col divide-y">
              {NOTIFICATIONS.map((n, i) => (
                <div key={i} className="px-2 py-2.5 text-[12.5px]">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-bold">{n.title}</span>
                    <span className="shrink-0 text-[10.5px] text-muted-foreground">{n.time}</span>
                  </div>
                  <p className="mt-0.5 text-muted-foreground">{n.detail}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="flex items-center gap-0.5 rounded-full bg-[#F1F5F9] p-[3px]">
        {(["en", "es"] as const).map((code) => (
          <button
            key={code}
            onClick={() => setLang(code)}
            className={cn(
              "rounded-full px-3.5 py-1.5 text-xs font-bold transition-colors",
              lang === code ? "bg-[#2563EB] text-white shadow-sm" : "text-[#64748B] hover:text-foreground",
            )}
          >
            {code === "en" ? "EN" : "ES-MX"}
          </button>
        ))}
      </div>

      <button
        onClick={() => navigate("/settings")}
        className="flex items-center gap-2.5 hover:opacity-80"
      >
        <Avatar className="size-9.5">
          <AvatarFallback className="bg-gradient-to-br from-[#F97316] to-[#EA580C] text-[13px] font-bold text-white">
            DR
          </AvatarFallback>
        </Avatar>
        <div className="leading-tight">
          <div className="text-[13.5px] font-bold">Dr. Gamaliel</div>
          <div className="text-[11.5px] text-muted-foreground">{t.doctorSpecialtyShort}</div>
        </div>
        <ChevronDown className="size-3.5 text-foreground" />
      </button>
    </header>
  )
}
