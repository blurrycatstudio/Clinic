import { useMemo } from "react"
import { useMutation, useQuery } from "@tanstack/react-query"
import { useNavigate } from "react-router-dom"
import { Phone, MessageCircle, Stethoscope, BellRing } from "lucide-react"
import { MobileShell } from "@/components/mobile/MobileShell"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { useLang } from "@/lib/i18n"
import { api } from "@/lib/api"
import { toDateParam, toDisplayAppointment, type ApiAppointment, type DisplayAppointment } from "@/lib/appointments"
import { useDashboardStats } from "@/hooks/useDashboardStats"
import { useToast } from "@/lib/toast"

export default function MobileDashboard() {
  const { t } = useLang()
  const navigate = useNavigate()
  const toast = useToast()

  const today = toDateParam(new Date())
  const { data, isLoading, error } = useQuery({
    queryKey: ["appointments", "today", today],
    queryFn: () => api.get<{ rows: ApiAppointment[]; count: number }>(`/appointments?date=${today}&limit=100`),
    refetchInterval: 10_000,
  })

  const { data: dashboardStats } = useDashboardStats()
  const callingEnabled = dashboardStats?.callingEnabled ?? false

  const callMutation = useMutation({
    mutationFn: (id: string) => api.post(`/appointments/${id}/call`),
    onSuccess: () => toast("Calling now…"),
    onError: (err: unknown) => toast(err instanceof Error ? err.message : "Failed to place call"),
  })

  const reminderMutation = useMutation({
    mutationFn: (id: string) => api.post(`/appointments/${id}/reminder`, { which: "24h" }),
    onSuccess: () => toast(t.mobileDashboardReminderSent),
    onError: (err: unknown) => toast(err instanceof Error ? err.message : "Failed to send reminder"),
  })

  const schedule = useMemo(() => (data?.rows ?? []).map(toDisplayAppointment).sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime()), [data])

  const upNext = useMemo(() => {
    const now = Date.now()
    return (
      schedule.find((a) => a.status !== "statusCompleted" && a.status !== "statusCancelled" && a.startsAt.getTime() >= now) ??
      schedule.find((a) => a.status !== "statusCompleted" && a.status !== "statusCancelled")
    )
  }, [schedule])

  function call(a: DisplayAppointment) {
    if (!window.confirm(`Call ${a.child} at ${a.phone} now?`)) return
    callMutation.mutate(a.id)
  }

  function sendReminder(a: DisplayAppointment) {
    if (!window.confirm(`Send a reminder to ${a.child} now?`)) return
    reminderMutation.mutate(a.id)
  }

  return (
    <MobileShell>
      <div className="flex flex-col gap-4 px-4 py-4">
        <div>
          <div className="text-[13px] text-muted-foreground">{t.mobileDashboardGreeting}</div>
          <h1 className="font-heading text-lg font-bold">{t.mobileDashboardUpNext}</h1>
        </div>

        {isLoading ? (
          <Card className="gap-0 rounded-2xl border p-4.5 shadow-none">
            <div className="h-24 animate-pulse rounded-xl bg-muted" />
          </Card>
        ) : error ? (
          <Card className="gap-0 rounded-2xl border p-4.5 text-center text-[13px] text-destructive shadow-none">{t.mobileDashboardError}</Card>
        ) : !upNext ? (
          <Card className="gap-0 rounded-2xl border p-6 text-center text-[13px] text-muted-foreground shadow-none">{t.mobileDashboardNoUpcoming}</Card>
        ) : (
          <Card className="gap-0 overflow-hidden rounded-2xl border-0 bg-gradient-to-br from-[#2563EB] to-[#1D4ED8] p-4.5 text-white shadow-atelier">
            <div className="mb-3 flex items-center justify-between">
              <span className="rounded-full bg-white/20 px-2.5 py-1 text-[10.5px] font-bold whitespace-nowrap">
                {upNext.status === "statusConfirmed" || upNext.status === "statusCheckedIn" ? t.mobileDashboardInSession : t.mobileDashboardUpNext}
              </span>
              <span className="font-mono text-[13px] font-bold">{upNext.time}</span>
            </div>
            <div className="mb-4 flex items-center gap-3">
              <Avatar className="size-11 shrink-0">
                <AvatarFallback className="bg-white/25 text-[13px] font-bold text-white">{upNext.initials}</AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[15px] font-bold">{upNext.child}</div>
                <div className="truncate text-[12px] text-white/80">{upNext.reason || "—"}</div>
              </div>
            </div>
            <Button
              onClick={() => navigate(`/mobile/consultation/${upNext.id}`)}
              className="mb-2.5 w-full gap-1.5 rounded-xl bg-white font-bold text-primary hover:bg-white/90"
            >
              <Stethoscope className="size-4" strokeWidth={2.2} />
              {t.mobileDashboardStartConsult}
            </Button>
            <div className="flex gap-2">
              <Button
                onClick={() => call(upNext)}
                disabled={!callingEnabled || !upNext.phone || (callMutation.isPending && callMutation.variables === upNext.id)}
                variant="outline"
                className="flex-1 gap-1.5 rounded-xl border-white/30 bg-transparent font-semibold text-white hover:bg-white/10"
              >
                <Phone className="size-3.5" strokeWidth={2.2} />
                {t.mobileDashboardCallParent}
              </Button>
              <Button
                onClick={() => navigate("/mobile/messages", { state: { patientId: upNext.patientId } })}
                variant="outline"
                className="flex-1 gap-1.5 rounded-xl border-white/30 bg-transparent font-semibold text-white hover:bg-white/10"
              >
                <MessageCircle className="size-3.5" strokeWidth={2.2} />
                {t.mobileDashboardWhatsApp}
              </Button>
            </div>
            <Button
              onClick={() => sendReminder(upNext)}
              disabled={!upNext.phone || (reminderMutation.isPending && reminderMutation.variables === upNext.id)}
              variant="outline"
              className="mt-2 w-full gap-1.5 rounded-xl border-white/30 bg-transparent font-semibold text-white hover:bg-white/10"
            >
              <BellRing className="size-3.5" strokeWidth={2.2} />
              {t.mobileDashboardSendReminder}
            </Button>
          </Card>
        )}
      </div>
    </MobileShell>
  )
}
