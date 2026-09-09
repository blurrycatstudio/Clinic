import { Bell, Calendar, Moon, Search, Sun, User } from "lucide-react"
import { useEffect, useMemo, useRef, useState } from "react"
import { useNavigate } from "react-router-dom"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Input } from "@/components/ui/input"
import { useLang } from "@/lib/i18n"
import { cn } from "@/lib/utils"
import { APPOINTMENTS, PATIENTS } from "@/lib/data"
import doctorImg from "@/assests/drgamaliel.png"

type SearchResult =
  | { kind: "patient"; id: string; label: string; sublabel: string }
  | { kind: "appointment"; id: string; label: string; sublabel: string; patientId: string }

function findResults(query: string): SearchResult[] {
  const q = query.trim().toLowerCase()
  if (!q) return []
  const qDigits = q.replace(/\s+/g, "")

  const patientMatches: SearchResult[] = PATIENTS.filter(
    (p) =>
      p.name.toLowerCase().includes(q) ||
      p.guardian.toLowerCase().includes(q) ||
      p.guardianPhone.replace(/\s+/g, "").includes(qDigits),
  ).map((p) => ({ kind: "patient", id: p.id, label: p.name, sublabel: `${p.guardian} · ${p.guardianPhone}` }))

  const appointmentMatches: SearchResult[] = APPOINTMENTS.filter(
    (a) => a.child.toLowerCase().includes(q) || a.phone.replace(/\s+/g, "").includes(qDigits),
  ).map((a) => ({
    kind: "appointment",
    id: a.id,
    label: a.child,
    sublabel: `${a.time} · ${a.duration}`,
    patientId: a.patientId,
  }))

  return [...patientMatches, ...appointmentMatches].slice(0, 8)
}

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
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [resultsOpen, setResultsOpen] = useState(false)
  const notifRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLDivElement>(null)

  const results = useMemo(() => findResults(query), [query])

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) setNotifOpen(false)
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) setResultsOpen(false)
    }
    document.addEventListener("mousedown", onClick)
    return () => document.removeEventListener("mousedown", onClick)
  }, [])

  function goToResult(r: SearchResult) {
    setResultsOpen(false)
    setMobileSearchOpen(false)
    setQuery("")
    const patientId = r.kind === "patient" ? r.id : r.patientId
    navigate("/patients", { state: { openPatientId: patientId } })
  }

  function handleSearchKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      if (results.length > 0) {
        goToResult(results[0])
      } else if (query.trim()) {
        setResultsOpen(false)
        setMobileSearchOpen(false)
        navigate("/patients", { state: { query } })
      }
    } else if (e.key === "Escape") {
      setResultsOpen(false)
    }
  }

  function SearchDropdown() {
    if (!resultsOpen || query.trim() === "") return null
    return (
      <div className="absolute inset-x-0 top-full z-50 mt-2 max-h-80 overflow-y-auto rounded-xl border bg-card p-1.5 shadow-atelier-elevated">
        {results.length === 0 ? (
          <div className="px-3 py-4 text-center text-[12.5px] text-muted-foreground">No matches for "{query}"</div>
        ) : (
          results.map((r) => (
            <button
              key={`${r.kind}-${r.id}`}
              onClick={() => goToResult(r)}
              className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left hover:bg-muted"
            >
              <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-accent text-primary">
                {r.kind === "patient" ? <User className="size-3.5" strokeWidth={2} /> : <Calendar className="size-3.5" strokeWidth={2} />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-bold">{r.label}</span>
                <span className="block truncate text-[11.5px] text-muted-foreground">{r.sublabel}</span>
              </span>
            </button>
          ))
        )}
      </div>
    )
  }

  return (
    <header className="flex h-14 shrink-0 items-center justify-between gap-2 border-b border-border/60 bg-white px-3 shadow-sm sm:h-16 sm:gap-4 sm:px-6 md:gap-7">
      <div className="flex min-w-0 items-center gap-2 sm:gap-3">
        <Avatar className="size-8 shrink-0 shadow-sm sm:size-9">
          <AvatarImage src={doctorImg} alt="Dr. Gamaliel" className="object-cover" style={{ objectPosition: "50% 15%" }} />
          <AvatarFallback className="bg-gradient-to-br from-[#F97316] to-[#EA580C] text-[13px] font-bold text-white">
            DR
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0 leading-tight">
          <div className="flex items-center gap-2">
            <span className="font-heading text-sm font-bold tracking-widest text-foreground uppercase sm:text-base">
              Dr. Gamaliel
            </span>
            <span className="hidden rounded-full border border-[#F97316]/30 bg-[#FFF7ED] px-2 py-0.5 text-[9px] font-bold tracking-wide text-[#EA580C] uppercase sm:inline-block">
              {t.headerBadge}
            </span>
          </div>
          <p className="hidden text-[10.5px] font-medium text-muted-foreground sm:block">
            {t.doctorSpecialtyShort} · {t.brandTagline1}
          </p>
        </div>
      </div>

      <div ref={searchRef} className="relative hidden w-full max-w-96 md:block">
        <Search className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setResultsOpen(true)
          }}
          onFocus={() => setResultsOpen(true)}
          onKeyDown={handleSearchKeyDown}
          placeholder={t.searchPlaceholder}
          className="rounded-full border bg-muted/70 pr-16 pl-10 text-[13.5px] shadow-inner focus-visible:border-primary focus-visible:bg-card"
        />
        <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 rounded-md border border-border bg-muted px-1.5 py-0.5 text-[10.5px] font-semibold text-muted-foreground">
          {t.searchShortcut}
        </span>
        <SearchDropdown />
      </div>

      <button
        onClick={() => setMobileSearchOpen((v) => !v)}
        className="flex size-8.5 shrink-0 items-center justify-center rounded-[10px] hover:bg-muted md:hidden"
        aria-label="Search"
      >
        <Search className="size-[18px] text-foreground" strokeWidth={1.8} />
      </button>

      {mobileSearchOpen && (
        <div className="fixed inset-x-3 top-14 z-50 md:hidden">
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              autoFocus
              value={query}
              onChange={(e) => {
                setQuery(e.target.value)
                setResultsOpen(true)
              }}
              onKeyDown={handleSearchKeyDown}
              placeholder={t.searchPlaceholder}
              className="rounded-full border bg-card pl-10 text-[13.5px] shadow-atelier-elevated"
            />
            <SearchDropdown />
          </div>
        </div>
      )}

      <div className="hidden items-center gap-2 rounded-full border border-[#16A34A]/20 bg-[#F0FDF4] px-3 py-1 text-[11px] font-medium text-[#16A34A] lg:flex">
        <span className="relative flex size-2">
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-[#16A34A] opacity-75" />
          <span className="relative inline-flex size-2 rounded-full bg-[#16A34A]" />
        </span>
        {t.clinicActiveLabel}
      </div>

      <button
        onClick={toggle}
        className="hidden size-9.5 items-center justify-center rounded-[10px] hover:bg-muted sm:flex"
        aria-label="Toggle dark mode"
      >
        {dark ? (
          <Moon className="size-[19px] text-foreground" strokeWidth={1.8} />
        ) : (
          <Sun className="size-[19px] text-foreground" strokeWidth={1.8} />
        )}
      </button>

      <div ref={notifRef} className="relative shrink-0">
        <button
          onClick={() => setNotifOpen((v) => !v)}
          className="relative flex size-8.5 items-center justify-center rounded-[10px] hover:bg-muted sm:size-9.5"
          aria-label="Notifications"
        >
          <Bell className="size-[18px] text-foreground sm:size-[19px]" strokeWidth={1.8} />
          <span className="absolute top-1.5 right-1.5 size-2 rounded-full border-2 border-card bg-destructive" />
        </button>
        {notifOpen && (
          <div className="fixed inset-x-3 top-14 z-50 mt-0 w-auto rounded-xl border bg-card p-2 shadow-atelier-elevated sm:absolute sm:inset-x-auto sm:top-full sm:right-0 sm:mt-2 sm:w-80">
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

      <div className="hidden items-center gap-0.5 rounded-full bg-[#F1F5F9] p-[3px] sm:flex">
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

    </header>
  )
}
