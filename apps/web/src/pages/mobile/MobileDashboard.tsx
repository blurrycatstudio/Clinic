import { useMemo, type ReactNode } from "react"
import { useMutation, useQuery } from "@tanstack/react-query"
import { useNavigate } from "react-router-dom"
import { Stethoscope, Clock, ChevronRight } from "lucide-react"
import { MobileShell } from "@/components/mobile/MobileShell"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import { useLang } from "@/lib/i18n"
import { api } from "@/lib/api"
import { toDateParam, toDisplayAppointment, type ApiAppointment, type DisplayAppointment } from "@/lib/appointments"
import { useToast } from "@/lib/toast"
import heroDoctor from "@/assests/ChatGPT Image Sep 12, 2026, 05_39_12 PM.png"
import callIcon3d from "@/assests/Cal-button.png"
import whatsappIcon3d from "@/assests/Whatsapp-button.png"
import reminderIcon3d from "@/assests/Send-reminder-button.png"

/** VisionOS-style frosted-glass tile behind a quick-action icon — a translucent
 * gradient + backdrop blur + soft inner highlight, instead of the icon sitting
 * flat on the card. `tint` picks the glass's color wash to loosely match the
 * icon it's holding. */
function GlassIconTile({ tint, children }: { tint: "green" | "amber"; children: ReactNode }) {
  return (
    <div
      className={cn(
        "flex size-14 items-center justify-center rounded-[20px] border backdrop-blur-md",
        tint === "green"
          ? "border-white/70 bg-gradient-to-br from-white/80 to-emerald-100/50 shadow-[0_8px_18px_-9px_rgba(16,185,129,0.45),inset_0_1px_1px_rgba(255,255,255,0.9)]"
          : "border-white/70 bg-gradient-to-br from-white/80 to-amber-100/50 shadow-[0_8px_18px_-9px_rgba(217,119,6,0.4),inset_0_1px_1px_rgba(255,255,255,0.9)]",
      )}
    >
      {children}
    </div>
  )
}

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

  const reminderMutation = useMutation({
    mutationFn: (id: string) => api.post(`/appointments/${id}/reminder`, { which: "24h" }),
    onSuccess: () => toast(t.mobileDashboardReminderSent),
    onError: (err: unknown) => toast(err instanceof Error ? err.message : t.mobileDashboardReminderFailed),
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

  // Opens the phone's own dialer/contacts with the number pre-filled — staff places
  // the call themselves from there, instead of triggering the automated VAPI outbound
  // call (that's a separate feature, gated behind clinic settings, used elsewhere).
  function call(a: DisplayAppointment) {
    if (!a.phone) return
    window.location.href = `tel:${a.phone}`
  }

  function sendReminder(a: DisplayAppointment) {
    if (!window.confirm(t.mobileDashboardSendReminderConfirm.replace("{child}", a.child))) return
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
                disabled={!upNext.phone}
                className="flex flex-col items-center gap-2 rounded-2xl border border-[#F1E4E4] bg-white py-3 text-center disabled:opacity-40"
              >
                <GlassIconTile tint="green">
                  <img src={callIcon3d} alt="" className="size-8 object-contain" />
                </GlassIconTile>
                <span className="text-[11px] font-bold text-[#1F2937]">{t.mobileDashboardCallParent}</span>
              </button>
              <button
                onClick={() => navigate("/mobile/messages", { state: { patientId: upNext.patientId, phone: upNext.phone } })}
                className="flex flex-col items-center gap-2 rounded-2xl border border-[#F1E4E4] bg-white py-3 text-center"
              >
                <GlassIconTile tint="green">
                  <img src={whatsappIcon3d} alt="" className="size-8 object-contain" />
                </GlassIconTile>
                <span className="text-[11px] font-bold text-[#1F2937]">{t.mobileDashboardWhatsApp}</span>
              </button>
              <button
                onClick={() => sendReminder(upNext)}
                disabled={!upNext.phone || (reminderMutation.isPending && reminderMutation.variables === upNext.id)}
                className="flex flex-col items-center gap-2 rounded-2xl border border-[#F1E4E4] bg-white py-3 text-center disabled:opacity-40"
              >
                <GlassIconTile tint="amber">
                  <img src={reminderIcon3d} alt="" className="size-8 object-contain" />
                </GlassIconTile>
                <span className="text-[11px] font-bold text-[#1F2937]">{t.mobileDashboardSendReminder}</span>
              </button>
            </div>
          </Card>
        )}
      </div>
    </MobileShell>
  )
}
