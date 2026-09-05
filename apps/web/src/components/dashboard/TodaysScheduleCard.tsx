import { Calendar, ChevronDown, ChevronLeft, ChevronRight, Plus } from "lucide-react"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { useLang } from "@/lib/i18n"
import { STATUS_COLORS, TODAYS_SCHEDULE } from "@/lib/data"
import { cn } from "@/lib/utils"

export function TodaysScheduleCard() {
  const { t } = useLang()
  const checkedInCount = TODAYS_SCHEDULE.filter((item) => item.status === "statusCheckedIn").length

  return (
    <Card className="h-full w-80 shrink-0 gap-0 overflow-hidden rounded-2xl border p-0 shadow-atelier lg:w-[360px]">
      <div className="flex items-center justify-between gap-3 border-b bg-accent/40 p-4">
        <div>
          <div className="flex items-center gap-2">
            <Calendar className="size-[15px] text-primary" strokeWidth={2} />
            <h2 className="font-heading text-[15px] font-bold">{t.scheduleTitle}</h2>
          </div>
          <div className="mt-1.5 flex items-center gap-1 text-[12.5px] text-muted-foreground">
            <button className="flex size-5 items-center justify-center rounded hover:bg-muted" aria-label="Previous day">
              <ChevronLeft className="size-3.5" strokeWidth={2} />
            </button>
            <span className="font-semibold text-foreground">{t.scheduleDateValue}</span>
            <button className="flex size-5 items-center justify-center rounded hover:bg-muted" aria-label="Next day">
              <ChevronRight className="size-3.5" strokeWidth={2} />
            </button>
            <ChevronDown className="size-3.5" strokeWidth={2} />
          </div>
        </div>
        <Button size="sm" className="shrink-0 gap-1 rounded-xl font-bold shadow-sm">
          <Plus className="size-3.5" strokeWidth={2.4} />
          {t.addBtn}
        </Button>
      </div>

      <div className="flex-1 space-y-1.5 overflow-y-auto p-2.5">
        {TODAYS_SCHEDULE.map((item, i) => {
          const sc = STATUS_COLORS[item.status]
          const active = item.status === "statusCheckedIn"
          return (
            <div
              key={i}
              className={cn(
                "cursor-pointer rounded-xl p-3 transition-all",
                active
                  ? "border border-primary/25 border-l-4 border-l-primary bg-accent/60 shadow-sm"
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
                  <AvatarFallback
                    style={{ background: item.color }}
                    className="text-[11px] font-bold text-white"
                  >
                    {item.initials}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13px] font-bold">{item.child}</div>
                  <div className="truncate text-[11px] text-muted-foreground">{t[item.type]}</div>
                </div>
                <ChevronRight className="size-4 shrink-0 text-muted-foreground/60" />
              </div>
            </div>
          )
        })}
      </div>

      <div className="flex items-center justify-between gap-2 border-t bg-accent/30 p-3 text-[11px] text-muted-foreground">
        <span className="font-semibold text-foreground">
          {TODAYS_SCHEDULE.length} {t.scheduleSummaryScheduledSuffix}
        </span>
        <span>•</span>
        <span className="font-semibold text-primary">
          {checkedInCount} {t.scheduleSummaryInRoomSuffix}
        </span>
      </div>
    </Card>
  )
}
