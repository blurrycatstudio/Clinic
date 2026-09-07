import { useState } from "react"
import { Calendar, Download, Heart, TrendingUp, Users } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { useLang } from "@/lib/i18n"
import { APPT_TYPE_BREAKDOWN, PATIENT_GROWTH, REVENUE_BY_MONTH } from "@/lib/data"
import { cn } from "@/lib/utils"
import { useToast } from "@/lib/toast"
import { downloadTextFile, toCsv } from "@/lib/download"

type Range = "month" | "quarter" | "year"

const peso = (n: number) => `$${n.toLocaleString("en-US")}`

function RevenueBarChart() {
  const max = Math.max(...REVENUE_BY_MONTH.map((d) => d.value))
  return (
    <div className="flex h-48 items-end gap-3">
      {REVENUE_BY_MONTH.map((d) => (
        <div key={d.label} className="flex flex-1 flex-col items-center gap-2">
          <span className="text-[10.5px] font-bold text-muted-foreground">{Math.round(d.value / 1000)}k</span>
          <div className="flex w-full flex-1 items-end">
            <div
              className="w-full rounded-t-[6px] bg-gradient-to-t from-primary to-primary/60 transition-all"
              style={{ height: `${(d.value / max) * 100}%` }}
            />
          </div>
          <span className="text-[11px] font-bold text-muted-foreground">{d.label}</span>
        </div>
      ))}
    </div>
  )
}

function PatientGrowthChart() {
  const w = 560
  const h = 160
  const pad = 20
  const values = PATIENT_GROWTH.map((d) => d.value)
  const min = Math.min(...values)
  const max = Math.max(...values)
  const points = PATIENT_GROWTH.map((d, i) => {
    const x = pad + (i / (PATIENT_GROWTH.length - 1)) * (w - pad * 2)
    const y = h - pad - ((d.value - min) / (max - min || 1)) * (h - pad * 2)
    return { x, y, ...d }
  })
  const path = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ")
  const areaPath = `${path} L ${points[points.length - 1].x} ${h - pad} L ${points[0].x} ${h - pad} Z`

  return (
    <svg viewBox={`0 0 ${w} ${h + 22}`} className="w-full" preserveAspectRatio="none">
      <defs>
        <linearGradient id="growthFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--primary)" stopOpacity="0.25" />
          <stop offset="100%" stopColor="var(--primary)" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={areaPath} fill="url(#growthFill)" />
      <path d={path} fill="none" stroke="var(--primary)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      {points.map((p) => (
        <circle key={p.label} cx={p.x} cy={p.y} r="3.5" fill="var(--card)" stroke="var(--primary)" strokeWidth="2.5" />
      ))}
      {points.map((p) => (
        <text key={p.label} x={p.x} y={h + 16} textAnchor="middle" fontSize="10.5" fontWeight="700" fill="var(--muted-foreground)">
          {p.label}
        </text>
      ))}
    </svg>
  )
}

function ApptTypeDonut() {
  const { t } = useLang()
  const total = APPT_TYPE_BREAKDOWN.reduce((s, d) => s + d.count, 0)
  const r = 54
  const c = 2 * Math.PI * r
  const segments = APPT_TYPE_BREAKDOWN.reduce<{ type: string; color: string; dash: number; offset: number }[]>((acc, d) => {
    const prevOffset = acc.length ? acc[acc.length - 1].offset + acc[acc.length - 1].dash : 0
    acc.push({ type: d.type, color: d.color, dash: (d.count / total) * c, offset: prevOffset })
    return acc
  }, [])

  return (
    <div className="flex items-center gap-6">
      <svg viewBox="0 0 140 140" className="size-36 shrink-0 -rotate-90">
        <circle cx="70" cy="70" r={r} fill="none" stroke="var(--muted)" strokeWidth="18" />
        {segments.map((s) => (
          <circle
            key={s.type}
            cx="70"
            cy="70"
            r={r}
            fill="none"
            stroke={s.color}
            strokeWidth="18"
            strokeDasharray={`${s.dash} ${c - s.dash}`}
            strokeDashoffset={-s.offset}
            strokeLinecap="butt"
          />
        ))}
      </svg>
      <div className="flex flex-1 flex-col gap-2">
        {APPT_TYPE_BREAKDOWN.map((d) => (
          <div key={d.type} className="flex items-center gap-2 text-[12.5px]">
            <span className="size-2.5 shrink-0 rounded-full" style={{ background: d.color }} />
            <span className="min-w-0 flex-1 truncate">{t[d.type]}</span>
            <span className="font-bold">{Math.round((d.count / total) * 100)}%</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function TopReasonsList() {
  const { t } = useLang()
  const max = Math.max(...APPT_TYPE_BREAKDOWN.map((d) => d.count))
  const sorted = [...APPT_TYPE_BREAKDOWN].sort((a, b) => b.count - a.count)

  return (
    <div className="flex flex-col gap-3.5">
      {sorted.map((d, i) => (
        <div key={d.type}>
          <div className="mb-1 flex items-center justify-between text-[12.5px]">
            <span className="font-bold">
              {i + 1}. {t[d.type]}
            </span>
            <span className="text-muted-foreground">{d.count}</span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full transition-all" style={{ width: `${(d.count / max) * 100}%`, background: d.color }} />
          </div>
        </div>
      ))}
    </div>
  )
}

export default function Reports() {
  const { t } = useLang()
  const toast = useToast()
  const [range, setRange] = useState<Range>("month")

  function handleExport() {
    const csv = toCsv(REVENUE_BY_MONTH.map((d) => ({ month: d.label, revenue: d.value })))
    downloadTextFile("revenue_report.csv", csv, "text/csv")
    toast("Report exported")
  }

  return (
    <div>
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="font-heading text-2xl font-bold">{t.reportsPageTitle}</h1>
          <p className="mt-0.5 text-[13.5px] text-muted-foreground">{t.reportsPageSub}</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex flex-wrap items-center gap-1.5 rounded-full border border-border p-[3px]">
            {(
              [
                ["month", t.reportsRangeMonth],
                ["quarter", t.reportsRangeQuarter],
                ["year", t.reportsRangeYear],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setRange(key)}
                className={cn(
                  "rounded-full px-3.5 py-1.5 text-xs font-bold whitespace-nowrap transition-colors",
                  range === key ? "bg-primary text-primary-foreground" : "text-foreground hover:bg-muted",
                )}
              >
                {label}
              </button>
            ))}
          </div>
          <Button onClick={handleExport} variant="outline" className="gap-1.5 rounded-[10px] font-bold">
            <Download className="size-3.5" strokeWidth={2.2} />
            {t.reportsExportBtn}
          </Button>
        </div>
      </div>

      <div className="mb-4.5 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Card className="gap-0 rounded-2xl border p-4.5 shadow-none">
          <div className="mb-3 flex size-9.5 items-center justify-center rounded-[10px] bg-accent">
            <TrendingUp className="size-[19px] text-primary" strokeWidth={1.8} />
          </div>
          <div className="text-[13px] font-semibold text-muted-foreground">{t.reportsStatRevenue}</div>
          <div className="mt-0.5 text-[24px] font-bold">{peso(REVENUE_BY_MONTH.at(-1)!.value)}</div>
        </Card>
        <Card className="gap-0 rounded-2xl border p-4.5 shadow-none">
          <div className="mb-3 flex size-9.5 items-center justify-center rounded-[10px]" style={{ background: "#e5f0fb" }}>
            <Users className="size-[19px]" style={{ color: "#1f5fa8" }} strokeWidth={1.8} />
          </div>
          <div className="text-[13px] font-semibold text-muted-foreground">{t.reportsStatPatients}</div>
          <div className="mt-0.5 text-[26px] font-bold text-[#1f5fa8]">{PATIENT_GROWTH.at(-1)!.value}</div>
        </Card>
        <Card className="gap-0 rounded-2xl border p-4.5 shadow-none">
          <div className="mb-3 flex size-9.5 items-center justify-center rounded-[10px]" style={{ background: "#fdf1de" }}>
            <Calendar className="size-[19px]" style={{ color: "#c2882c" }} strokeWidth={1.8} />
          </div>
          <div className="text-[13px] font-semibold text-muted-foreground">{t.reportsStatAppts}</div>
          <div className="mt-0.5 text-[26px] font-bold text-[#c2882c]">
            {APPT_TYPE_BREAKDOWN.reduce((s, d) => s + d.count, 0)}
          </div>
        </Card>
        <Card className="gap-0 rounded-2xl border p-4.5 shadow-none">
          <div className="mb-3 flex size-9.5 items-center justify-center rounded-[10px]" style={{ background: "#fbe2e6" }}>
            <Heart className="size-[19px]" style={{ color: "#d6486b" }} strokeWidth={1.8} />
          </div>
          <div className="text-[13px] font-semibold text-muted-foreground">{t.reportsStatSatisfaction}</div>
          <div className="mt-0.5 text-[26px] font-bold text-[#d6486b]">98%</div>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4.5 lg:grid-cols-2">
        <Card className="gap-0 rounded-2xl border p-5 shadow-none">
          <h2 className="font-heading text-[15px] font-bold">{t.reportsRevenueTitle}</h2>
          <p className="mt-0.5 mb-4 text-[11.5px] text-muted-foreground">{t.reportsRevenueSub}</p>
          <RevenueBarChart />
        </Card>

        <Card className="gap-0 rounded-2xl border p-5 shadow-none">
          <h2 className="font-heading text-[15px] font-bold">{t.reportsPatientGrowthTitle}</h2>
          <p className="mt-0.5 mb-4 text-[11.5px] text-muted-foreground">{t.reportsPatientGrowthSub}</p>
          <PatientGrowthChart />
        </Card>

        <Card className="gap-0 rounded-2xl border p-5 shadow-none">
          <h2 className="font-heading text-[15px] font-bold">{t.reportsApptTypesTitle}</h2>
          <p className="mt-0.5 mb-4 text-[11.5px] text-muted-foreground">{t.reportsApptTypesSub}</p>
          <ApptTypeDonut />
        </Card>

        <Card className="gap-0 rounded-2xl border p-5 shadow-none">
          <h2 className="font-heading mb-4 text-[15px] font-bold">{t.reportsTopReasonsTitle}</h2>
          <TopReasonsList />
        </Card>
      </div>
    </div>
  )
}
