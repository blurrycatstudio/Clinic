import { Calendar, Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { useLang } from "@/lib/i18n"
import { APPOINTMENTS, STATUS_COLORS } from "@/lib/data"

export function AppointmentsCard() {
  const { t } = useLang()

  return (
    <Card className="gap-0 rounded-2xl border p-5 shadow-none">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="flex size-8.5 items-center justify-center rounded-[9px] bg-accent">
            <Calendar className="size-[17px] text-primary" strokeWidth={1.8} />
          </div>
          <h2 className="font-heading text-[17px] font-bold">{t.apptTitle}</h2>
        </div>
        <Button size="sm" className="gap-1.5 rounded-[10px] font-bold">
          <Plus className="size-3.5" strokeWidth={2.4} />
          {t.apptNewBtn}
        </Button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b">
              {[t.thTime, t.thPatient, t.thType, t.thStatus].map((label) => (
                <th
                  key={label}
                  className="px-2 pb-2.5 text-left text-[11.5px] font-bold tracking-wide text-muted-foreground uppercase first:pl-0"
                >
                  {label}
                </th>
              ))}
              <th className="px-2 pb-2.5 pr-0 text-right text-[11.5px] font-bold tracking-wide text-muted-foreground uppercase">
                {t.thActions}
              </th>
            </tr>
          </thead>
          <tbody>
            {APPOINTMENTS.map((a) => {
              const sc = STATUS_COLORS[a.status]
              return (
                <tr key={a.child} className="border-b last:border-0 hover:bg-muted/50">
                  <td className="py-3 pr-2 pl-0 text-[13px] font-semibold whitespace-nowrap">{a.time}</td>
                  <td className="px-2 py-3">
                    <div className="flex items-center gap-2.5">
                      <div
                        className="flex size-8.5 shrink-0 items-center justify-center rounded-full text-[12px] font-bold text-white"
                        style={{ background: a.color }}
                      >
                        {a.initials}
                      </div>
                      <div>
                        <div className="text-[13.5px] font-bold">{a.child}</div>
                        <div className="text-[11.5px] text-muted-foreground">{a.phone}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-2 py-3 text-[13px] whitespace-nowrap text-foreground">{t[a.type]}</td>
                  <td className="px-2 py-3">
                    <span
                      className="rounded-full px-2.5 py-1 text-[11.5px] font-bold whitespace-nowrap"
                      style={{ background: sc.bg, color: sc.color }}
                    >
                      {t[a.status]}
                    </span>
                  </td>
                  <td className="py-3 pr-0 pl-2 text-right whitespace-nowrap">
                    <Button variant="outline" size="sm" className="rounded-lg font-semibold">
                      {t.thView}
                    </Button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </Card>
  )
}
