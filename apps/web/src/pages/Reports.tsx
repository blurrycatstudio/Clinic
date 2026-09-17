import { useMemo, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { Calendar, CheckCircle2, Download, TrendingUp, Users } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { useLang } from "@/lib/i18n"
import { cn } from "@/lib/utils"
import { useToast } from "@/lib/toast"
import { downloadTextFile, toCsv } from "@/lib/download"
import { api } from "@/lib/api"

type Range = "month" | "quarter" | "year"

const MONTHS_FOR_RANGE: Record<Range, number> = { month: 3, quarter: 6, year: 12 }
const REASON_COLORS = ["#2563EB", "#16A34A", "#DB2777", "#D97706", "#7C3AED", "#0EA5E9", "#DC2626", "#059669"]

type ApiAppointmentLite = { id: string; patient_id: string; starts_at: string; reason: string; status: string }
type ApiInvoiceLite = { id: string; issue_date: string; amount_total: number; status: string }
type ApiPatientLite = { id: string; created_at: string }

const peso = (n: number) => `$${n.toLocaleString("en-US")}`

/** Local month buckets ("Jan", "Feb", ...) for the trailing `count` months, oldest first. */
function monthBuckets(count: number): { key: string; label: string; start: Date; end: Date }[] {
  const now = new Date()
  const buckets: { key: string; label: string; start: Date; end: Date }[] = []
  for (let i = count - 1; i >= 0; i--) {
    const start = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const end = new Date(now.getFullYear(), now.getMonth() - i + 1, 1)
    buckets.push({
      key: `${start.getFullYear()}-${start.getMonth()}`,
      label: start.toLocaleDateString("en-US", { month: "short" }),
      start,
      end,
    })
  }
  return buckets
}

function RevenueBarChart({ data }: { data: { label: string; value: number }[] }) {
  const max = Math.max(1, ...data.map((d) => d.value))
  return (
    <div className="flex h-48 gap-3">
      {data.map((d, i) => (
        <div key={i} className="flex flex-1 flex-col items-center gap-2">
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

function PatientGrowthChart({ data }: { data: { label: string; value: number }[] }) {
  const w = 560
  const h = 160
  const pad = 20
  const values = data.map((d) => d.value)
  const min = Math.min(...values)
  const max = Math.max(...values)
  const points = data.map((d, i) => {
    const x = pad + (i / (data.length - 1 || 1)) * (w - pad * 2)
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

type ReasonBreakdown = { reason: string; count: number; color: string }

function ReasonDonut({ data }: { data: ReasonBreakdown[] }) {
  const total = data.reduce((s, d) => s + d.count, 0)
  const r = 54
  const c = 2 * Math.PI * r
  const segments = data.reduce<{ reason: string; color: string; dash: number; offset: number }[]>((acc, d) => {
    const prevOffset = acc.length ? acc[acc.length - 1].offset + acc[acc.length - 1].dash : 0
    acc.push({ reason: d.reason, color: d.color, dash: (d.count / total) * c, offset: prevOffset })
    return acc
  }, [])

  return (
    <div className="flex items-center gap-6">
      <svg viewBox="0 0 140 140" className="size-36 shrink-0 -rotate-90">
        <circle cx="70" cy="70" r={r} fill="none" stroke="var(--muted)" strokeWidth="18" />
        {segments.map((s) => (
          <circle
            key={s.reason}
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
        {data.map((d) => (
          <div key={d.reason} className="flex items-center gap-2 text-[12.5px]">
            <span className="size-2.5 shrink-0 rounded-full" style={{ background: d.color }} />
            <span className="min-w-0 flex-1 truncate">{d.reason}</span>
            <span className="font-bold">{Math.round((d.count / total) * 100)}%</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function TopReasonsList({ data }: { data: ReasonBreakdown[] }) {
  const max = Math.max(1, ...data.map((d) => d.count))
  return (
    <div className="flex flex-col gap-3.5">
      {data.map((d, i) => (
        <div key={d.reason}>
          <div className="mb-1 flex items-center justify-between text-[12.5px]">
            <span className="font-bold">
              {i + 1}. {d.reason}
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
  const monthsToShow = MONTHS_FOR_RANGE[range]
  const buckets = useMemo(() => monthBuckets(monthsToShow), [monthsToShow])
  const rangeStart = buckets[0].start
  const rangeEnd = buckets[buckets.length - 1].end

  const appointmentsQuery = useQuery({
    queryKey: ["appointments", "reports", monthsToShow],
    queryFn: () =>
      api.get<{ rows: ApiAppointmentLite[]; count: number }>(
        `/appointments?from=${rangeStart.toISOString()}&to=${rangeEnd.toISOString()}&limit=1000`,
      ),
  })
  const invoicesQuery = useQuery({
    queryKey: ["invoices", "reports"],
    queryFn: () => api.get<{ rows: ApiInvoiceLite[]; count: number }>("/invoices?limit=200"),
  })
  const patientsQuery = useQuery({
    queryKey: ["patients", "reports"],
    queryFn: () => api.get<{ rows: ApiPatientLite[]; count: number }>("/patients?limit=200"),
  })

  const appointments = appointmentsQuery.data?.rows ?? []
  const invoices = invoicesQuery.data?.rows ?? []
  const patients = patientsQuery.data?.rows ?? []

  const revenueByMonth = useMemo(
    () =>
      buckets.map((b) => ({
        label: b.label,
        value: invoices
          .filter((inv) => inv.status === "paid")
          .filter((inv) => {
            const d = new Date(inv.issue_date)
            return d >= b.start && d < b.end
          })
          .reduce((sum, inv) => sum + inv.amount_total, 0),
      })),
    [buckets, invoices],
  )

  const patientGrowth = useMemo(
    () =>
      buckets.map((b) => ({
        label: b.label,
        value: patients.filter((p) => new Date(p.created_at) < b.end).length,
      })),
    [buckets, patients],
  )

  const reasonBreakdown: ReasonBreakdown[] = useMemo(() => {
    const counts = new Map<string, number>()
    for (const a of appointments) {
      const reason = a.reason.trim() || t.reportsUnspecifiedReason
      counts.set(reason, (counts.get(reason) ?? 0) + 1)
    }
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([reason, count], i) => ({ reason, count, color: REASON_COLORS[i % REASON_COLORS.length] }))
  }, [appointments, t.reportsUnspecifiedReason])

  const totalRevenue = revenueByMonth.reduce((s, d) => s + d.value, 0)
  const activePatients = new Set(appointments.map((a) => a.patient_id)).size
  const completedVisits = appointments.filter((a) => a.status === "completed").length

  function handleExport() {
    const csv = toCsv(revenueByMonth.map((d) => ({ month: d.label, revenue: d.value })))
    downloadTextFile("revenue_report.csv", csv, "text/csv")
    toast(t.reportsExportSuccess)
  }

  const isLoading = appointmentsQuery.isLoading || invoicesQuery.isLoading || patientsQuery.isLoading
  const hasError = !!appointmentsQuery.error || !!invoicesQuery.error || !!patientsQuery.error

  if (hasError) {
    return (
      <div>
        <div className="mb-5">
          <h1 className="font-heading text-2xl font-bold">{t.reportsPageTitle}</h1>
          <p className="mt-0.5 text-[13.5px] text-muted-foreground">{t.reportsPageSub}</p>
        </div>
        <Card className="gap-0 rounded-2xl border p-16 text-center text-[13px] text-destructive shadow-none">{t.reportsLoadError}</Card>
      </div>
    )
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
          <div className="mt-0.5 text-[24px] font-bold">{peso(totalRevenue)}</div>
        </Card>
        <Card className="gap-0 rounded-2xl border p-4.5 shadow-none">
          <div className="mb-3 flex size-9.5 items-center justify-center rounded-[10px]" style={{ background: "#e5f0fb" }}>
            <Users className="size-[19px]" style={{ color: "#1f5fa8" }} strokeWidth={1.8} />
          </div>
          <div className="text-[13px] font-semibold text-muted-foreground">{t.reportsStatPatients}</div>
          <div className="mt-0.5 text-[26px] font-bold text-[#1f5fa8]">{activePatients}</div>
        </Card>
        <Card className="gap-0 rounded-2xl border p-4.5 shadow-none">
          <div className="mb-3 flex size-9.5 items-center justify-center rounded-[10px]" style={{ background: "#fdf1de" }}>
            <Calendar className="size-[19px]" style={{ color: "#c2882c" }} strokeWidth={1.8} />
          </div>
          <div className="text-[13px] font-semibold text-muted-foreground">{t.reportsStatAppts}</div>
          <div className="mt-0.5 text-[26px] font-bold text-[#c2882c]">{appointments.length}</div>
        </Card>
        <Card className="gap-0 rounded-2xl border p-4.5 shadow-none">
          <div className="mb-3 flex size-9.5 items-center justify-center rounded-[10px]" style={{ background: "#e3f3e6" }}>
            <CheckCircle2 className="size-[19px]" style={{ color: "#227a44" }} strokeWidth={1.8} />
          </div>
          <div className="text-[13px] font-semibold text-muted-foreground">{t.reportsStatCompleted}</div>
          <div className="mt-0.5 text-[26px] font-bold text-[#227a44]">{completedVisits}</div>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4.5 lg:grid-cols-2">
        <Card className="gap-0 rounded-2xl border p-5 shadow-none">
          <h2 className="font-heading text-[15px] font-bold">{t.reportsRevenueTitle}</h2>
          <p className="mt-0.5 mb-4 text-[11.5px] text-muted-foreground">{t.reportsRevenueSub.replace("{n}", String(monthsToShow))}</p>
          {isLoading ? <div className="h-48 animate-pulse rounded-xl bg-muted" /> : <RevenueBarChart data={revenueByMonth} />}
        </Card>

        <Card className="gap-0 rounded-2xl border p-5 shadow-none">
          <h2 className="font-heading text-[15px] font-bold">{t.reportsPatientGrowthTitle}</h2>
          <p className="mt-0.5 mb-4 text-[11.5px] text-muted-foreground">{t.reportsPatientGrowthSub}</p>
          {isLoading ? <div className="h-40 animate-pulse rounded-xl bg-muted" /> : <PatientGrowthChart data={patientGrowth} />}
        </Card>

        <Card className="gap-0 rounded-2xl border p-5 shadow-none">
          <h2 className="font-heading text-[15px] font-bold">{t.reportsApptTypesTitle}</h2>
          <p className="mt-0.5 mb-4 text-[11.5px] text-muted-foreground">{t.reportsApptTypesSub}</p>
          {reasonBreakdown.length === 0 ? (
            <p className="py-8 text-center text-[12.5px] text-muted-foreground">{t.reportsNoReasonData}</p>
          ) : (
            <ReasonDonut data={reasonBreakdown} />
          )}
        </Card>

        <Card className="gap-0 rounded-2xl border p-5 shadow-none">
          <h2 className="font-heading mb-4 text-[15px] font-bold">{t.reportsTopReasonsTitle}</h2>
          {reasonBreakdown.length === 0 ? (
            <p className="py-8 text-center text-[12.5px] text-muted-foreground">{t.reportsNoReasonData}</p>
          ) : (
            <TopReasonsList data={reasonBreakdown} />
          )}
        </Card>
      </div>
    </div>
  )
}
