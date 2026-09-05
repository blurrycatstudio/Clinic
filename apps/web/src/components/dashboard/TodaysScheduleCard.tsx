import { Calendar, ChevronDown, ChevronLeft, ChevronRight, Plus } from "lucide-react"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { useLang } from "@/lib/i18n"
import { STATUS_COLORS, TODAYS_SCHEDULE } from "@/lib/data"

export function TodaysScheduleCard() {
  const { t } = useLang()

  return (
    <Card className="min-w-0 gap-0 rounded-2xl border p-4.5 shadow-none">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Calendar className="size-[17px] text-foreground" strokeWidth={1.8} />
            <h2 className="font-heading text-[15px] font-bold">{t.scheduleTitle}</h2>
          </div>
          <div className="mt-1.5 flex items-center gap-1 text-[12.5px] text-muted-foreground">
            <ChevronDown className="size-3.5" strokeWidth={2} />
            <span>{t.scheduleDateValue}</span>
            <button className="ml-1 flex size-5 items-center justify-center rounded hover:bg-muted" aria-label="Previous day">
              <ChevronLeft className="size-3.5" strokeWidth={2} />
            </button>
            <button className="flex size-5 items-center justify-center rounded hover:bg-muted" aria-label="Next day">
              <ChevronRight className="size-3.5" strokeWidth={2} />
            </button>
          </div>
        </div>
        <Button size="sm" className="shrink-0 gap-1 rounded-full font-bold">
          <Plus className="size-3.5" strokeWidth={2.4} />
          {t.addBtn}
        </Button>
      </div>
      <div className="flex flex-col">
        {TODAYS_SCHEDULE.map((item, i) => {
          const sc = STATUS_COLORS[item.status]
          return (
            <div
              key={i}
              className="flex items-center gap-2.5 border-b py-2.5 last:border-0"
            >
              <span className="w-[62px] shrink-0 text-[12px] font-bold whitespace-nowrap">{item.time}</span>
              <span className="size-2 shrink-0 rounded-full" style={{ background: sc.color }} />
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
              <span
                className="shrink-0 rounded-full px-2.5 py-1 text-[10.5px] font-bold whitespace-nowrap"
                style={{ background: sc.bg, color: sc.color }}
              >
                {t[item.status]}
              </span>
              <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
            </div>
          )
        })}
      </div>
    </Card>
  )
}
