import { useMemo, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { useNavigate } from "react-router-dom"
import { Calendar, ChevronLeft, ChevronRight, Search, ChevronRight as ChevronRightIcon } from "lucide-react"
import { MobileShell } from "@/components/mobile/MobileShell"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { useLang } from "@/lib/i18n"
import { api } from "@/lib/api"
import { STATUS_COLORS, type AppointmentStatus } from "@/lib/data"
import { toDisplayAppointment, type ApiAppointment } from "@/lib/appointments"
import { cn } from "@/lib/utils"

type StatusFilter = "all" | AppointmentStatus

const FILTERS: { key: StatusFilter; labelKey: "apptsFilterAll" | "statusConfirmed" | "statusPending" | "statusCompleted" | "statusCancelled" }[] = [
  { key: "all", labelKey: "apptsFilterAll" },
  { key: "statusConfirmed", labelKey: "statusConfirmed" },
  { key: "statusPending", labelKey: "statusPending" },
  { key: "statusCompleted", labelKey: "statusCompleted" },
  { key: "statusCancelled", labelKey: "statusCancelled" },
]

function toDateParam(date: Date): string {
  return date.toISOString().slice(0, 10)
}

export default function MobileSchedule() {
  const { t } = useLang()
  const navigate = useNavigate()
  const [dayOffset, setDayOffset] = useState(0)
  const [query, setQuery] = useState("")
  const [status, setStatus] = useState<StatusFilter>("all")

  const shownDate = new Date()
  shownDate.setDate(shownDate.getDate() + dayOffset)
  const dateParam = toDateParam(shownDate)
  const dateLabel = shownDate.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" })

  const { data, isLoading, error } = useQuery({
    queryKey: ["appointments", "mobile-schedule", dateParam],
    queryFn: () => api.get<{ rows: ApiAppointment[]; count: number }>(`/appointments?date=${dateParam}&limit=100`),
    refetchInterval: 30_000,
  })

  const appointments = useMemo(
    () => (data?.rows ?? []).map(toDisplayAppointment).sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime()),
    [data],
  )

  const filtered = useMemo(
    () =>
      appointments
        .filter((a) => status === "all" || a.status === status)
        .filter((a) => {
          if (!query.trim()) return true
          const q = query.toLowerCase()
          return a.child.toLowerCase().includes(q) || a.reason.toLowerCase().includes(q)
        }),
    [appointments, query, status],
  )

  return (
    <MobileShell title={t.mobileScheduleTitle} onBack={() => navigate("/mobile/dashboard")}>
      <div className="flex flex-col gap-3 px-4 py-4">
        <div className="flex items-center justify-between gap-2 rounded-xl border border-border bg-white px-3 py-2.5">
          <button onClick={() => setDayOffset((d) => d - 1)} className="flex size-7 items-center justify-center rounded-full hover:bg-muted">
            <ChevronLeft className="size-4" strokeWidth={2.2} />
          </button>
          <div className="flex items-center gap-1.5 text-[13px] font-bold">
            <Calendar className="size-3.5 text-primary" strokeWidth={2} />
            {dateLabel}
          </div>
          <button onClick={() => setDayOffset((d) => d + 1)} className="flex size-7 items-center justify-center rounded-full hover:bg-muted">
            <ChevronRight className="size-4" strokeWidth={2.2} />
          </button>
        </div>

        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t.mobileScheduleSearchPh}
            className="h-10 rounded-full border-border pl-10 text-[13px]"
          />
        </div>

        <div className="scrollbar-hide -mx-4 flex gap-1.5 overflow-x-auto px-4">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setStatus(f.key)}
              className={cn(
                "shrink-0 rounded-full border px-3.5 py-1.5 text-xs font-bold whitespace-nowrap transition-colors",
                status === f.key ? "border-primary bg-primary text-primary-foreground" : "border-border text-foreground hover:bg-muted",
              )}
            >
              {t[f.labelKey]}
            </button>
          ))}
        </div>

        {isLoading ? (
          <div className="flex flex-col gap-2">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="h-20 animate-pulse rounded-2xl bg-muted" />
            ))}
          </div>
        ) : error ? (
          <div className="py-16 text-center text-[13px] text-destructive">{t.mobileScheduleError}</div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
            <div className="flex size-14 items-center justify-center rounded-2xl border border-border bg-accent">
              <Calendar className="size-6 text-primary" strokeWidth={1.6} />
            </div>
            <p className="text-sm text-muted-foreground">{t.mobileScheduleEmpty}</p>
          </div>
        ) : (
          <div className="flex flex-col gap-2.5">
            {filtered.map((a) => {
              const sc = STATUS_COLORS[a.status]
              const cancelled = a.status === "statusCancelled"
              return (
                <Card
                  key={a.id}
                  onClick={() => navigate(`/mobile/consultation/${a.id}`)}
                  className={cn(
                    "cursor-pointer gap-0 rounded-2xl border-l-4 p-3.5 shadow-none hover:bg-muted/40",
                    cancelled && "opacity-60",
                  )}
                  style={{ borderLeftColor: sc.color }}
                >
                  <div className="mb-2 flex items-center justify-between">
                    <span className="font-mono text-[12.5px] font-bold">{a.time}</span>
                    <span className="rounded-full px-2.5 py-0.5 text-[10.5px] font-bold whitespace-nowrap" style={{ background: sc.bg, color: sc.color }}>
                      {t[a.status]}
                    </span>
                  </div>
                  <div className="flex items-center gap-2.5">
                    <Avatar className="size-9 shrink-0">
                      <AvatarFallback style={{ background: a.color }} className="text-[11px] font-bold text-white">
                        {a.initials}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[13.5px] font-bold">{a.child}</div>
                      <div className="truncate text-[11.5px] text-muted-foreground">{a.reason || "—"}</div>
                    </div>
                    <ChevronRightIcon className="size-4 shrink-0 text-muted-foreground/60" />
                  </div>
                </Card>
              )
            })}
          </div>
        )}
      </div>
    </MobileShell>
  )
}
