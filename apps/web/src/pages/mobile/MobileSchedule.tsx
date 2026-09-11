import { useMemo, useRef, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useNavigate } from "react-router-dom"
import { Dialog } from "radix-ui"
import { Calendar, ChevronLeft, ChevronRight, Search, ChevronRight as ChevronRightIcon, Phone, CheckCircle2, XCircle, X } from "lucide-react"
import { MobileShell } from "@/components/mobile/MobileShell"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { useLang } from "@/lib/i18n"
import { api } from "@/lib/api"
import { STATUS_COLORS, type AppointmentStatus } from "@/lib/data"
import { toDateParam, toDisplayAppointment, type ApiAppointment, type DisplayAppointment } from "@/lib/appointments"
import { useDashboardStats } from "@/hooks/useDashboardStats"
import { cn } from "@/lib/utils"
import { useToast } from "@/lib/toast"

type StatusFilter = "all" | AppointmentStatus

const FILTERS: { key: StatusFilter; labelKey: "apptsFilterAll" | "statusConfirmed" | "statusPending" | "statusCancelled" | "statusCompleted" }[] = [
  { key: "all", labelKey: "apptsFilterAll" },
  { key: "statusConfirmed", labelKey: "statusConfirmed" },
  { key: "statusPending", labelKey: "statusPending" },
  { key: "statusCancelled", labelKey: "statusCancelled" },
  { key: "statusCompleted", labelKey: "statusCompleted" },
]

// Confirmed, pending, cancelled first (in that order), completed last — matches the filter tab order above.
const STATUS_SORT_ORDER: Record<AppointmentStatus, number> = {
  statusConfirmed: 0,
  statusCheckedIn: 0,
  statusPending: 1,
  statusScheduled: 1,
  statusCancelled: 2,
  statusCompleted: 3,
}

/** Appointment actions reachable from the schedule's Call button: call the patient, or open a centered
 * confirm/reschedule/cancel dialog — replacing native window.confirm/prompt popups. */
function AppointmentActionsDialog({
  appointment,
  onOpenChange,
  callingEnabled,
  onCall,
  onConfirm,
  onReschedule,
  onCancel,
  callPending,
  confirmPending,
  reschedulePending,
  cancelPending,
}: {
  appointment: DisplayAppointment | null
  onOpenChange: (v: boolean) => void
  callingEnabled: boolean
  onCall: (a: DisplayAppointment) => void
  onConfirm: (a: DisplayAppointment) => void
  onReschedule: (a: DisplayAppointment, startsAtIso: string) => void
  onCancel: (a: DisplayAppointment) => void
  callPending: boolean
  confirmPending: boolean
  reschedulePending: boolean
  cancelPending: boolean
}) {
  const { t } = useLang()
  const [view, setView] = useState<"menu" | "reschedule" | "cancel">("menu")
  const [date, setDate] = useState("")
  const [time, setTime] = useState("")
  const cancelled = appointment?.status === "statusCancelled"

  function reset(open: boolean) {
    if (!open) setView("menu")
    onOpenChange(open)
  }

  function openReschedule() {
    if (!appointment) return
    setDate(toDateParam(appointment.startsAt))
    setTime(appointment.startsAt.toTimeString().slice(0, 5))
    setView("reschedule")
  }

  function saveReschedule() {
    if (!appointment || !date || !time) return
    onReschedule(appointment, new Date(`${date}T${time}:00`).toISOString())
  }

  return (
    <Dialog.Root open={appointment !== null} onOpenChange={reset}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm" />
        <Dialog.Content className="fixed top-1/2 left-1/2 z-50 w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-border bg-card p-5 shadow-2xl">
          {appointment && (
            <>
              <div className="mb-5 flex items-center justify-between">
                <div>
                  <Dialog.Title className="font-heading text-lg font-bold">{appointment.child}</Dialog.Title>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {appointment.time} · {appointment.phone}
                  </p>
                </div>
                <Dialog.Close className="flex size-8 items-center justify-center rounded-[9px] border border-border hover:bg-muted">
                  <X className="size-4" strokeWidth={2} />
                </Dialog.Close>
              </div>

              {view === "menu" && (
                <div className="flex flex-col gap-2">
                  <Button
                    onClick={() => onCall(appointment)}
                    disabled={!callingEnabled || !appointment.phone || callPending}
                    className="w-full justify-center gap-1.5 rounded-lg font-bold"
                    title={callingEnabled ? undefined : "Outbound calling isn't configured yet"}
                  >
                    <Phone className="size-3.5" strokeWidth={2.2} />
                    Call patient
                  </Button>
                  {appointment.status === "statusPending" && (
                    <Button
                      onClick={() => onConfirm(appointment)}
                      disabled={confirmPending}
                      variant="outline"
                      className="w-full justify-center gap-1.5 rounded-lg font-bold"
                    >
                      <CheckCircle2 className="size-3.5" strokeWidth={2.2} />
                      {t.apptsCheckIn}
                    </Button>
                  )}
                  <Button onClick={openReschedule} variant="outline" disabled={cancelled} className="w-full justify-center rounded-lg font-bold">
                    {t.apptsReschedule}
                  </Button>
                  <Button
                    onClick={() => setView("cancel")}
                    variant="outline"
                    disabled={cancelled || cancelPending}
                    className="w-full justify-center gap-1.5 rounded-lg font-bold text-destructive hover:bg-destructive/10"
                  >
                    <XCircle className="size-3.5" strokeWidth={2.2} />
                    {t.apptsCancel}
                  </Button>
                </div>
              )}

              {view === "reschedule" && (
                <div className="flex flex-col gap-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="mb-1.5 block text-xs font-bold">Date</label>
                      <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="h-10" />
                    </div>
                    <div>
                      <label className="mb-1.5 block text-xs font-bold">Time</label>
                      <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} className="h-10" />
                    </div>
                  </div>
                  <div className="mt-1 flex gap-2.5">
                    <Button variant="outline" onClick={() => setView("menu")} className="flex-1 justify-center rounded-lg font-bold">
                      Back
                    </Button>
                    <Button onClick={saveReschedule} disabled={!date || !time || reschedulePending} className="flex-1 justify-center rounded-lg font-bold">
                      Save
                    </Button>
                  </div>
                </div>
              )}

              {view === "cancel" && (
                <div className="flex flex-col gap-3">
                  <p className="text-sm text-foreground">Cancel {appointment.child}'s appointment at {appointment.time}?</p>
                  <div className="mt-1 flex gap-2.5">
                    <Button variant="outline" onClick={() => setView("menu")} className="flex-1 justify-center rounded-lg font-bold">
                      Back
                    </Button>
                    <Button
                      onClick={() => onCancel(appointment)}
                      disabled={cancelPending}
                      className="flex-1 justify-center rounded-lg font-bold text-destructive-foreground bg-destructive hover:bg-destructive/85"
                    >
                      {t.apptsCancel}
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

export default function MobileSchedule() {
  const { t } = useLang()
  const navigate = useNavigate()
  const toast = useToast()
  const queryClient = useQueryClient()
  const [selectedDate, setSelectedDate] = useState(() => new Date())
  const [query, setQuery] = useState("")
  const [status, setStatus] = useState<StatusFilter>("all")
  const [actionsFor, setActionsFor] = useState<DisplayAppointment | null>(null)
  const dateInputRef = useRef<HTMLInputElement>(null)

  const dateParam = toDateParam(selectedDate)
  const dateLabel = selectedDate.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" })
  const { data: dashboardStats } = useDashboardStats()
  const callingEnabled = dashboardStats?.callingEnabled ?? false

  const { data, isLoading, error } = useQuery({
    queryKey: ["appointments", "mobile-schedule", dateParam],
    queryFn: () => api.get<{ rows: ApiAppointment[]; count: number }>(`/appointments?date=${dateParam}&limit=100`),
    refetchInterval: 10_000,
  })

  const appointments = useMemo(
    () => (data?.rows ?? []).map(toDisplayAppointment).sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime()),
    [data],
  )

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ["appointments"] })
  }

  const callMutation = useMutation({
    mutationFn: (id: string) => api.post(`/appointments/${id}/call`),
    onSuccess: () => {
      setActionsFor(null)
      toast("Calling now…")
    },
    onError: (err: unknown) => toast(err instanceof Error ? err.message : "Failed to place call"),
  })

  const confirmMutation = useMutation({
    mutationFn: (id: string) => api.patch(`/appointments/${id}/status`, { status: "confirmed" }),
    onSuccess: () => {
      invalidate()
      setActionsFor(null)
      toast("Patient checked in")
    },
    onError: () => toast("Failed to check in patient"),
  })

  const rescheduleMutation = useMutation({
    mutationFn: ({ id, startsAtIso }: { id: string; startsAtIso: string }) => api.patch(`/appointments/${id}/reschedule`, { startsAtIso }),
    onSuccess: () => {
      invalidate()
      setActionsFor(null)
      toast("Appointment rescheduled")
    },
    onError: () => toast("Failed to reschedule — that slot may already be booked"),
  })

  const cancelMutation = useMutation({
    mutationFn: (id: string) => api.patch(`/appointments/${id}/cancel`, {}),
    onSuccess: () => {
      invalidate()
      setActionsFor(null)
      toast("Appointment cancelled")
    },
    onError: () => toast("Failed to cancel appointment"),
  })

  const filtered = useMemo(
    () =>
      appointments
        .filter((a) => status === "all" || a.status === status)
        .filter((a) => {
          if (!query.trim()) return true
          const q = query.toLowerCase()
          return a.child.toLowerCase().includes(q) || a.reason.toLowerCase().includes(q)
        })
        .sort((a, b) => STATUS_SORT_ORDER[a.status] - STATUS_SORT_ORDER[b.status] || a.startsAt.getTime() - b.startsAt.getTime()),
    [appointments, query, status],
  )

  return (
    <MobileShell title={t.mobileScheduleTitle} onBack={() => navigate("/mobile/dashboard")}>
      <div className="flex flex-col gap-3 px-4 py-4">
        <div className="flex items-center justify-between gap-2 rounded-xl border border-border bg-white px-3 py-2.5">
          <button
            onClick={() => setSelectedDate((d) => new Date(d.getFullYear(), d.getMonth(), d.getDate() - 1))}
            className="flex size-7 items-center justify-center rounded-full hover:bg-muted"
          >
            <ChevronLeft className="size-4" strokeWidth={2.2} />
          </button>
          <button
            onClick={() => dateInputRef.current?.showPicker?.() ?? dateInputRef.current?.click()}
            className="relative flex items-center gap-1.5 text-[13px] font-bold hover:text-primary"
          >
            <Calendar className="size-3.5 text-primary" strokeWidth={2} />
            {dateLabel}
            <input
              ref={dateInputRef}
              type="date"
              value={dateParam}
              onChange={(e) => {
                if (!e.target.value) return
                const [y, m, d] = e.target.value.split("-").map(Number)
                setSelectedDate(new Date(y, m - 1, d))
              }}
              className="absolute inset-0 size-full opacity-0"
            />
          </button>
          <button
            onClick={() => setSelectedDate((d) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1))}
            className="flex size-7 items-center justify-center rounded-full hover:bg-muted"
          >
            <ChevronRight className="size-4" strokeWidth={2.2} />
          </button>
        </div>

        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t.mobileScheduleSearchPh}
            className="h-10 rounded-full border-border pl-10 text-[13px]"
          />
        </div>

        <div className="scrollbar-hide -mx-4 flex gap-1.5 overflow-x-auto px-4">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setStatus(f.key)}
              className={cn(
                "shrink-0 rounded-full border px-3.5 py-1.5 text-xs font-bold whitespace-nowrap transition-colors",
                status === f.key ? "border-primary bg-primary text-primary-foreground" : "border-border text-foreground hover:bg-muted",
              )}
            >
              {t[f.labelKey]}
            </button>
          ))}
        </div>

        {isLoading ? (
          <div className="flex flex-col gap-2">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="h-20 animate-pulse rounded-2xl bg-muted" />
            ))}
          </div>
        ) : error ? (
          <div className="py-16 text-center text-[13px] text-destructive">{t.mobileScheduleError}</div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
            <div className="flex size-14 items-center justify-center rounded-2xl border border-border bg-accent">
              <Calendar className="size-6 text-primary" strokeWidth={1.6} />
            </div>
            <p className="text-sm text-muted-foreground">{t.mobileScheduleEmpty}</p>
          </div>
        ) : (
          <div className="flex flex-col gap-2.5">
            {filtered.map((a) => {
              const sc = STATUS_COLORS[a.status]
              const cancelled = a.status === "statusCancelled"
              return (
                <Card
                  key={a.id}
                  onClick={() => navigate(`/mobile/consultation/${a.id}`)}
                  className={cn(
                    "cursor-pointer gap-0 rounded-2xl border-l-4 p-3.5 shadow-none hover:bg-muted/40",
                    cancelled && "opacity-60",
                  )}
                  style={{ borderLeftColor: sc.color }}
                >
                  <div className="mb-2 flex items-center justify-between">
                    <span className="font-mono text-[12.5px] font-bold">{a.time}</span>
                    <span className="rounded-full px-2.5 py-0.5 text-[10.5px] font-bold whitespace-nowrap" style={{ background: sc.bg, color: sc.color }}>
                      {t[a.status]}
                    </span>
                  </div>
                  <div className="flex items-center gap-2.5">
                    <Avatar className="size-9 shrink-0">
                      <AvatarFallback style={{ background: a.color }} className="text-[11px] font-bold text-white">
                        {a.initials}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[13.5px] font-bold">{a.child}</div>
                      <div className="truncate text-[11.5px] text-muted-foreground">{a.reason || "—"}</div>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        setActionsFor(a)
                      }}
                      disabled={!a.phone}
                      title="Call"
                      className="flex size-7 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted disabled:opacity-40"
                    >
                      <Phone className="size-3.5" strokeWidth={2.2} />
                    </button>
                    <ChevronRightIcon className="size-4 shrink-0 text-muted-foreground/60" />
                  </div>
                </Card>
              )
            })}
          </div>
        )}
      </div>

      <AppointmentActionsDialog
        appointment={actionsFor}
        onOpenChange={(v) => !v && setActionsFor(null)}
        callingEnabled={callingEnabled}
        onCall={(a) => callMutation.mutate(a.id)}
        onConfirm={(a) => confirmMutation.mutate(a.id)}
        onReschedule={(a, startsAtIso) => rescheduleMutation.mutate({ id: a.id, startsAtIso })}
        onCancel={(a) => cancelMutation.mutate(a.id)}
        callPending={callMutation.isPending}
        confirmPending={confirmMutation.isPending}
        reschedulePending={rescheduleMutation.isPending}
        cancelPending={cancelMutation.isPending}
      />
    </MobileShell>
  )
}
