import { useMemo } from "react"
import { useMutation, useQuery } from "@tanstack/react-query"
import { useNavigate } from "react-router-dom"
import { Phone, MessageCircle, Stethoscope, ChevronRight, CalendarDays, BellRing } from "lucide-react"
import { MobileShell } from "@/components/mobile/MobileShell"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { useLang } from "@/lib/i18n"
import { api } from "@/lib/api"
import { STATUS_COLORS } from "@/lib/data"
import { toDisplayAppointment, type ApiAppointment, type DisplayAppointment } from "@/lib/appointments"
import { useDashboardStats } from "@/hooks/useDashboardStats"
import { useToast } from "@/lib/toast"

export default function MobileDashboard() {
  const { t } = useLang()
  const navigate = useNavigate()
  const toast = useToast()

  const today = new Date().toISOString().slice(0, 10)
  const { data, isLoading, error } = useQuery({
    queryKey: ["appointments", "today", today],
    queryFn: () => api.get<{ rows: ApiAppointment[]; count: number }>(`/appointments?date=${today}&limit=100`),
    refetchInterval: 30_000,
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

        <div className="flex items-center justify-between">
          <h2 className="font-heading text-[15px] font-bold">{t.mobileDashboardTodaySchedule}</h2>
          <button onClick={() => navigate("/mobile/schedule")} className="text-xs font-bold text-primary">
            {t.mobileDashboardViewAll}
          </button>
        </div>

        {isLoading ? (
          <div className="flex flex-col gap-2">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-16 animate-pulse rounded-xl bg-muted" />
            ))}
          </div>
        ) : schedule.length === 0 ? (
          <Card className="gap-0 rounded-2xl border p-6 text-center shadow-none">
            <div className="mx-auto mb-2 flex size-11 items-center justify-center rounded-2xl bg-accent">
              <CalendarDays className="size-5 text-primary" strokeWidth={1.6} />
            </div>
            <p className="text-[13px] text-muted-foreground">{t.mobileDashboardEmpty}</p>
          </Card>
        ) : (
          <div className="flex flex-col gap-2">
            {schedule.map((a) => {
              const sc = STATUS_COLORS[a.status]
              return (
                <Card
                  key={a.id}
                  onClick={() => navigate(`/mobile/consultation/${a.id}`)}
                  className="cursor-pointer gap-0 rounded-xl border p-3 shadow-none hover:bg-muted/40"
                >
                  <div className="flex items-center gap-2.5">
                    <span className="w-14 shrink-0 font-mono text-[11.5px] font-bold whitespace-nowrap">{a.time}</span>
                    <Avatar className="size-8 shrink-0">
                      <AvatarFallback style={{ background: a.color }} className="text-[10.5px] font-bold text-white">
                        {a.initials}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[13px] font-bold">{a.child}</div>
                      <div className="truncate text-[11px] text-muted-foreground">{a.reason || "—"}</div>
                    </div>
                    <span className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold whitespace-nowrap" style={{ background: sc.bg, color: sc.color }}>
                      {t[a.status]}
                    </span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        sendReminder(a)
                      }}
                      disabled={!a.phone || (reminderMutation.isPending && reminderMutation.variables === a.id)}
                      title={t.mobileDashboardSendReminder}
                      className="flex size-7 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted disabled:opacity-40"
                    >
                      <BellRing className="size-3.5" strokeWidth={2.2} />
                    </button>
                    <ChevronRight className="size-4 shrink-0 text-muted-foreground/60" />
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
