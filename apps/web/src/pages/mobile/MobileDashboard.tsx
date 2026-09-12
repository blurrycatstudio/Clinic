import { useMemo } from "react"
import { useMutation, useQuery } from "@tanstack/react-query"
import { useNavigate } from "react-router-dom"
import { Phone, MessageCircle, Stethoscope, BellRing, Clock, ChevronRight } from "lucide-react"
import { MobileShell } from "@/components/mobile/MobileShell"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { useLang } from "@/lib/i18n"
import { api } from "@/lib/api"
import { toDateParam, toDisplayAppointment, type ApiAppointment, type DisplayAppointment } from "@/lib/appointments"
import { useDashboardStats } from "@/hooks/useDashboardStats"
import { useToast } from "@/lib/toast"
import heroDoctor from "@/assests/ChatGPT Image Sep 12, 2026, 05_39_12 PM.png"

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

  // `schedule` is sorted by start time, so the first entry that hasn't ended yet is either
  // the one currently in session or the next one coming up — anything fully in the past
  // is left out, instead of wrongly sticking around as "Up Next" once its time has passed.
  const upNext = useMemo(() => {
    const now = Date.now()
    return schedule.find((a) => a.status !== "statusCompleted" && a.status !== "statusCancelled" && a.endsAt.getTime() >= now)
  }, [schedule])

  const isInSession = !!upNext && Date.now() >= upNext.startsAt.getTime() && Date.now() <= upNext.endsAt.getTime()

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
        <div
          className="relative overflow-hidden rounded-3xl py-5 pr-28 pl-4.5"
          style={{ background: "linear-gradient(135deg, #FBF7F6 0%, #FBEEF3 55%, #F2ECFA 100%)" }}
        >
          <div className="relative text-[13px] font-medium text-[#9CA3AF]">{t.mobileDashboardGreeting},</div>
          <h1 className="relative font-heading text-2xl leading-tight font-extrabold text-[#1F2937]">Dr. Gamaliel</h1>
          <p className="relative mt-1 text-[12px] leading-snug text-[#6B7280]">{t.mobileDashboardTagline} 💗</p>
          <img
            src={heroDoctor}
            alt=""
            className="pointer-events-none absolute -top-3 -right-2 w-32 shrink-0 mix-blend-multiply select-none"
          />
        </div>

        {isLoading ? (
          <Card className="gap-0 rounded-3xl border-0 p-4.5 shadow-none">
            <div className="h-24 animate-pulse rounded-xl bg-muted" />
          </Card>
        ) : error ? (
          <Card className="gap-0 rounded-3xl border-0 p-4.5 text-center text-[13px] text-destructive shadow-none">{t.mobileDashboardError}</Card>
        ) : !upNext ? (
          <Card className="gap-0 rounded-3xl border-0 p-6 text-center text-[13px] text-muted-foreground shadow-none">{t.mobileDashboardNoUpcoming}</Card>
        ) : (
          <Card
            className="gap-0 overflow-hidden rounded-3xl border-0 p-4.5 shadow-[0_12px_28px_-14px_rgba(219,39,119,0.25)]"
            style={{ background: "linear-gradient(180deg, #FDEAF1 0%, #FFF9FB 100%)" }}
          >
            <div className="mb-3 flex items-center justify-between">
              <span className="text-[15px] font-bold text-[#1F2937]">
                {isInSession ? t.mobileDashboardInSession : t.mobileDashboardUpNext}
              </span>
              <span className="flex items-center gap-1 rounded-full bg-[#FDF0F5] px-2.5 py-1 text-[12px] font-bold text-[#DB2777]">
                <Clock className="size-3" strokeWidth={2.4} />
                {upNext.time}
              </span>
            </div>
            <div className="mb-4 flex items-center gap-3">
              <Avatar className="size-11 shrink-0">
                <AvatarFallback
                  className="text-[13px] font-bold text-white"
                  style={{ background: "linear-gradient(135deg, #FB923C 0%, #EC4899 100%)" }}
                >
                  {upNext.initials}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[15px] font-bold text-[#1F2937]">{upNext.child}</div>
                <div className="truncate text-[12px] text-muted-foreground">{upNext.reason || "—"}</div>
              </div>
            </div>
            <Button
              onClick={() => navigate(`/mobile/consultation/${upNext.id}`)}
              className="mb-2.5 h-12 w-full gap-2 rounded-2xl border-0 px-5 text-[14.5px] font-bold text-white hover:opacity-90"
              style={{ background: "linear-gradient(90deg, #FB923C 0%, #EC4899 55%, #A855F7 100%)" }}
            >
              <Stethoscope className="size-4" strokeWidth={2.2} />
              {t.mobileDashboardStartConsult}
              <ChevronRight className="ml-auto size-4" strokeWidth={2.4} />
            </Button>
            <div className="grid grid-cols-3 gap-2">
              <button
                onClick={() => call(upNext)}
                disabled={!callingEnabled || !upNext.phone || (callMutation.isPending && callMutation.variables === upNext.id)}
                className="flex flex-col items-center gap-1.5 rounded-2xl border border-[#F1E4E4] bg-white py-3 text-center disabled:opacity-40"
              >
                <span className="flex size-9 items-center justify-center rounded-full bg-[#DCFCE7] text-[#16A34A]">
                  <Phone className="size-4" strokeWidth={2.2} />
                </span>
                <span className="text-[11px] font-bold text-[#1F2937]">{t.mobileDashboardCallParent}</span>
              </button>
              <button
                onClick={() => navigate("/mobile/messages", { state: { patientId: upNext.patientId } })}
                className="flex flex-col items-center gap-1.5 rounded-2xl border border-[#F1E4E4] bg-white py-3 text-center"
              >
                <span className="flex size-9 items-center justify-center rounded-full bg-[#DCFCE7] text-[#16A34A]">
                  <MessageCircle className="size-4" strokeWidth={2.2} />
                </span>
                <span className="text-[11px] font-bold text-[#1F2937]">{t.mobileDashboardWhatsApp}</span>
              </button>
              <button
                onClick={() => sendReminder(upNext)}
                disabled={!upNext.phone || (reminderMutation.isPending && reminderMutation.variables === upNext.id)}
                className="flex flex-col items-center gap-1.5 rounded-2xl border border-[#F1E4E4] bg-white py-3 text-center disabled:opacity-40"
              >
                <span className="relative flex size-9 items-center justify-center rounded-full bg-[#FFEDD5] text-[#EA580C]">
                  <BellRing className="size-4" strokeWidth={2.2} />
                  <span className="absolute top-0 right-0 size-1.5 rounded-full bg-[#DB2777]" />
                </span>
                <span className="text-[11px] font-bold text-[#1F2937]">{t.mobileDashboardSendReminder}</span>
              </button>
            </div>
          </Card>
        )}
      </div>
    </MobileShell>
  )
}
