import { Calendar, ChevronDown, ChevronLeft, ChevronRight, Plus } from "lucide-react"
import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { useNavigate } from "react-router-dom"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { useLang } from "@/lib/i18n"
import { STATUS_COLORS } from "@/lib/data"
import { api } from "@/lib/api"
import { toDisplayAppointment, type ApiAppointment, type DisplayAppointment } from "@/lib/appointments"
import { cn } from "@/lib/utils"

function toDateParam(date: Date): string {
  return date.toISOString().slice(0, 10)
}

export function TodaysScheduleCard({
  selectedId,
  onSelect,
}: {
  selectedId: string | null
  onSelect: (appointment: DisplayAppointment) => void
}) {
  const { t } = useLang()
  const navigate = useNavigate()
  const [dayOffset, setDayOffset] = useState(0)

  const shownDate = new Date()
  shownDate.setDate(shownDate.getDate() + dayOffset)
  const dateParam = toDateParam(shownDate)
  const dateLabel = shownDate.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })

  const { data, isLoading, error } = useQuery({
    queryKey: ["appointments", "today", dateParam],
    queryFn: () => api.get<{ rows: ApiAppointment[]; count: number }>(`/appointments?date=${dateParam}&limit=100`),
    refetchInterval: 30_000,
  })

  const schedule = (data?.rows ?? []).map(toDisplayAppointment)
  const checkedInCount = schedule.filter((item) => item.status === "statusConfirmed" || item.status === "statusCompleted").length

  return (
    <Card className="h-[480px] w-full shrink-0 gap-0 overflow-hidden rounded-2xl border p-0 shadow-atelier lg:h-full lg:w-80 xl:w-[360px]">
      <div className="flex items-center justify-between gap-3 border-b bg-[#F8FAFC] p-4">
        <div>
          <div className="flex items-center gap-2">
            <Calendar className="size-[15px] text-primary" strokeWidth={2} />
            <h2 className="font-heading text-[15px] font-bold">{t.scheduleTitle}</h2>
          </div>
          <div className="mt-1.5 flex items-center gap-1 text-[12.5px] text-muted-foreground">
            <button
              onClick={() => setDayOffset((d) => d - 1)}
              className="flex size-5 items-center justify-center rounded hover:bg-muted"
              aria-label="Previous day"
            >
              <ChevronLeft className="size-3.5" strokeWidth={2} />
            </button>
            <span className="font-semibold text-foreground">{dateLabel}</span>
            <button
              onClick={() => setDayOffset((d) => d + 1)}
              className="flex size-5 items-center justify-center rounded hover:bg-muted"
              aria-label="Next day"
            >
              <ChevronRight className="size-3.5" strokeWidth={2} />
            </button>
            <button onClick={() => setDayOffset(0)} aria-label="Reset to today">
              <ChevronDown className="size-3.5" strokeWidth={2} />
            </button>
          </div>
        </div>
        <Button
          onClick={() => navigate("/appointments")}
          size="sm"
          className="shrink-0 gap-1 rounded-xl bg-[#2563EB] font-bold text-white shadow-sm hover:bg-[#1D4ED8]"
        >
          <Plus className="size-3.5" strokeWidth={2.4} />
          {t.addBtn}
        </Button>
      </div>

      <div className="flex-1 space-y-1.5 overflow-y-auto p-2.5">
        {isLoading ? (
          <div className="py-10 text-center text-[12.5px] text-muted-foreground">Loading schedule…</div>
        ) : error ? (
          <div className="py-10 text-center text-[12.5px] text-destructive">Couldn't load today's schedule.</div>
        ) : schedule.length === 0 ? (
          <div className="py-10 text-center text-[12.5px] text-muted-foreground">No appointments for this day.</div>
        ) : (
          schedule.map((item) => {
            const sc = STATUS_COLORS[item.status]
            const active = item.id === selectedId
            return (
              <div
                key={item.id}
                role="button"
                tabIndex={0}
                onClick={() => onSelect(item)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") onSelect(item)
                }}
                className={cn(
                  "cursor-pointer rounded-xl p-3 transition-all",
                  active
                    ? "border border-[#2563EB]/20 border-l-4 border-l-[#2563EB] bg-[#EFF6FF] shadow-sm"
                    : "border border-transparent hover:bg-muted/60",
                )}
              >
                <div className="mb-1.5 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-bold whitespace-nowrap">{item.time}</span>
                    {active && <span className="size-2 animate-pulse rounded-full bg-secondary" />}
                  </div>
                  <span
                    className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold whitespace-nowrap"
                    style={{ background: sc.bg, color: sc.color }}
                  >
                    {t[item.status]}
                  </span>
                </div>
                <div className="flex items-center gap-2.5">
                  <Avatar className="size-8.5 shrink-0">
                    <AvatarFallback style={{ background: item.color }} className="text-[11px] font-bold text-white">
                      {item.initials}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13px] font-bold">{item.child}</div>
                    <div className="truncate text-[11px] text-muted-foreground">{item.reason || "—"}</div>
                  </div>
                  <ChevronRight className="size-4 shrink-0 text-muted-foreground/60" />
                </div>
              </div>
            )
          })
        )}
      </div>

      <div className="flex items-center justify-between gap-2 border-t bg-[#F8FAFC] p-3 text-[11px] text-muted-foreground">
        <span className="font-semibold text-foreground">
          {schedule.length} {t.scheduleSummaryScheduledSuffix}
        </span>
        <span>•</span>
        <span className="font-semibold text-[#2563EB]">
          {checkedInCount} {t.scheduleSummaryInRoomSuffix}
        </span>
      </div>
    </Card>
  )
}
