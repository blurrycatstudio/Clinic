import { TrendingDown, TrendingUp } from "lucide-react"
import { Card } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { useDashboardStats } from "@/hooks/useDashboardStats"
import { useLang } from "@/lib/i18n"

function TrendBadge({ value, positive }: { value: number; positive: boolean }) {
  return (
    <div
      className="flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11.5px] font-bold"
      style={{ background: positive ? "#e3f3e6" : "#fbe7e5", color: positive ? "#227a44" : "#b03a2e" }}
    >
      {positive ? <TrendingUp className="size-2.5" strokeWidth={3} /> : <TrendingDown className="size-2.5" strokeWidth={3} />}
      {positive ? "+" : "-"}
      {Math.abs(value)}
      {positive ? "%" : ""}
    </div>
  )
}

function StatCard({
  trend,
  positive,
  title,
  value,
  sub,
  loading,
}: {
  trend: number
  positive: boolean
  title: string
  value: number
  sub: string
  loading: boolean
}) {
  return (
    <Card className="gap-0 rounded-2xl border p-4.5 shadow-none">
      <div className="mb-3.5 flex items-center justify-between gap-2">
        <div className="text-[15px] font-semibold text-foreground">{title}</div>
        <TrendBadge value={trend} positive={positive} />
      </div>
      {loading ? (
        <Skeleton className="h-7 w-14" />
      ) : (
        <div className="font-heading text-[26px] font-bold">{value}</div>
      )}
      <div className="mt-0.5 text-xs text-muted-foreground">{sub}</div>
    </Card>
  )
}

export function StatsGrid() {
  const { t } = useLang()
  const { data, isLoading } = useDashboardStats()

  return (
    <div className="grid grid-cols-4 gap-4">
      <StatCard
        trend={data?.appointmentsTrend ?? 12}
        positive
        title={t.statApptTitle2}
        value={data?.appointmentsToday ?? 24}
        sub={t.statApptSub2}
        loading={isLoading}
      />
      <StatCard
        trend={data?.patientsTrend ?? 20}
        positive
        title={t.statPatientsSeenTitle}
        value={data?.activePatients ?? 18}
        sub={t.statPatientsSeenSub}
        loading={isLoading}
      />
      <StatCard
        trend={data?.callsTrend ?? 25}
        positive
        title={t.statNewPatientsTitle}
        value={data?.incomingCalls ?? 5}
        sub={t.statNewPatientsSub}
        loading={isLoading}
      />
      <StatCard
        trend={data?.whatsappTrend ?? 1}
        positive={false}
        title={t.statPendingTitle}
        value={data?.whatsappMessages ?? 3}
        sub={t.statPendingSub}
        loading={isLoading}
      />
    </div>
  )
}
