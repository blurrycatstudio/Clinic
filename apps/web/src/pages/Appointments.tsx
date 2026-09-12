import { useMemo, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Calendar, CalendarPlus, CheckCircle2, ChevronLeft, ChevronRight, MessageCircle, Phone, Search, XCircle, X } from "lucide-react"
import { Dialog } from "radix-ui"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { PhoneInput } from "@/components/ui/phone-input"
import { useLang } from "@/lib/i18n"
import { STATUS_COLORS, type AppointmentStatus } from "@/lib/data"
import { api } from "@/lib/api"
import { cn } from "@/lib/utils"
import { useToast } from "@/lib/toast"
import { useDashboardStats } from "@/hooks/useDashboardStats"
import {
  callStatusLabel,
  messageStatusLabel,
  toDateParam,
  toDisplayAppointment,
  type ApiAppointment,
  type DisplayAppointment,
} from "@/lib/appointments"

type StatusFilter = "all" | AppointmentStatus

const FILTERS: { key: StatusFilter; labelKey: "apptsFilterAll" | "statusConfirmed" | "statusPending" | "statusCompleted" | "statusCancelled" }[] = [
  { key: "all", labelKey: "apptsFilterAll" },
  { key: "statusConfirmed", labelKey: "statusConfirmed" },
  { key: "statusPending", labelKey: "statusPending" },
  { key: "statusCompleted", labelKey: "statusCompleted" },
  { key: "statusCancelled", labelKey: "statusCancelled" },
]

function NewAppointmentDialog({
  open,
  onOpenChange,
  onSubmit,
  pending,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  onSubmit: (input: { fullName: string; phone: string; reason: string; startsAtIso: string }) => void
  pending: boolean
}) {
  const { t } = useLang()
  const [fullName, setFullName] = useState("")
  const [phone, setPhone] = useState("")
  const [reason, setReason] = useState("")
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [time, setTime] = useState("09:00")

  function handleSave() {
    if (!fullName.trim() || !phone.trim() || !date || !time) return
    onSubmit({ fullName: fullName.trim(), phone: phone.trim(), reason, startsAtIso: new Date(`${date}T${time}:00`).toISOString() })
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm" />
        <Dialog.Content className="fixed top-1/2 left-1/2 z-50 max-h-[90vh] w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl border border-border bg-card p-5 shadow-2xl sm:p-6">
          <div className="mb-5 flex items-center justify-between">
            <Dialog.Title className="font-heading text-xl font-bold">{t.apptsNewModalTitle}</Dialog.Title>
            <Dialog.Close className="flex size-8 items-center justify-center rounded-[9px] border border-border hover:bg-muted">
              <X className="size-4" strokeWidth={2} />
            </Dialog.Close>
          </div>
          <div className="flex flex-col gap-4">
            <div>
              <label className="mb-1.5 block text-xs font-bold">{t.apptsNewModalPatient}</label>
              <Input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Full name" className="h-9" />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-bold">Phone</label>
              <PhoneInput value={phone} onChange={setPhone} placeholder="664 123 4567" className="h-9" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1.5 block text-xs font-bold">{t.apptsNewModalDate}</label>
                <Input type="date" className="h-9" value={date} onChange={(e) => setDate(e.target.value)} />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-bold">{t.apptsNewModalTime}</label>
                <Input type="time" className="h-9" value={time} onChange={(e) => setTime(e.target.value)} />
              </div>
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-bold">{t.apptsNewModalNotes}</label>
              <textarea
                rows={3}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder={t.apptsNewModalNotesPh}
                className="w-full resize-none rounded-lg border border-border bg-transparent px-2.5 py-2 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              />
            </div>
          </div>
          <div className="mt-6 flex justify-end gap-2.5">
            <Dialog.Close asChild>
              <Button variant="outline" className="rounded-lg font-bold">
                {t.apptsNewModalCancel}
              </Button>
            </Dialog.Close>
            <Button onClick={handleSave} disabled={!fullName.trim() || !phone.trim() || pending} className="rounded-lg font-bold">
              {t.apptsNewModalSave}
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

function AppointmentActionsDialog({
  appointment,
  onOpenChange,
  onConfirm,
  onReschedule,
  onCancel,
  confirmPending,
  cancelPending,
}: {
  appointment: DisplayAppointment | null
  onOpenChange: (v: boolean) => void
  onConfirm: (a: DisplayAppointment) => void
  onReschedule: (a: DisplayAppointment) => void
  onCancel: (a: DisplayAppointment) => void
  confirmPending: boolean
  cancelPending: boolean
}) {
  const { t } = useLang()
  const cancelled = appointment?.status === "statusCancelled"

  return (
    <Dialog.Root open={appointment !== null} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm" />
        <Dialog.Content className="fixed top-1/2 left-1/2 z-50 w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-border bg-card p-5 shadow-2xl sm:p-6">
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
              <div className="flex flex-col gap-2">
                {appointment.status === "statusPending" && (
                  <Button
                    onClick={() => onConfirm(appointment)}
                    disabled={confirmPending}
                    className="w-full justify-center gap-1.5 rounded-lg font-bold"
                  >
                    <CheckCircle2 className="size-3.5" strokeWidth={2.2} />
                    {t.apptsCheckIn}
                  </Button>
                )}
                <Button
                  onClick={() => onReschedule(appointment)}
                  variant="outline"
                  disabled={cancelled}
                  className="w-full justify-center rounded-lg font-bold"
                >
                  {t.apptsReschedule}
                </Button>
                <Button
                  onClick={() => onCancel(appointment)}
                  variant="outline"
                  disabled={cancelled || cancelPending}
                  className="w-full justify-center gap-1.5 rounded-lg font-bold text-destructive hover:bg-destructive/10"
                >
                  <XCircle className="size-3.5" strokeWidth={2.2} />
                  {t.apptsCancel}
                </Button>
              </div>
            </>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

export default function Appointments() {
  const { t } = useLang()
  const toast = useToast()
  const queryClient = useQueryClient()
  const [query, setQuery] = useState("")
  const [status, setStatus] = useState<StatusFilter>("all")
  const [newOpen, setNewOpen] = useState(false)
  const [dayOffset, setDayOffset] = useState(0)
  const [selectedAppointment, setSelectedAppointment] = useState<DisplayAppointment | null>(null)

  const shownDate = new Date()
  shownDate.setDate(shownDate.getDate() + dayOffset)
  const dateLabel = shownDate.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })
  const dateParam = toDateParam(shownDate)

  const { data, isLoading, error } = useQuery({
    queryKey: ["appointments", dateParam],
    queryFn: () => api.get<{ rows: ApiAppointment[]; count: number }>(`/appointments?limit=200&date=${dateParam}`),
    refetchInterval: 10_000,
  })

  const appointments = useMemo(() => (data?.rows ?? []).map(toDisplayAppointment), [data])
  const { data: dashboardStats } = useDashboardStats()
  const callingEnabled = dashboardStats?.callingEnabled ?? false

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ["appointments"] })
  }

  const confirmMutation = useMutation({
    mutationFn: (id: string) => api.patch(`/appointments/${id}/status`, { status: "confirmed" }),
    onSuccess: () => {
      invalidate()
      setSelectedAppointment(null)
      toast("Patient checked in")
    },
    onError: () => toast("Failed to check in patient"),
  })

  const rescheduleMutation = useMutation({
    mutationFn: ({ id, startsAtIso }: { id: string; startsAtIso: string }) => api.patch(`/appointments/${id}/reschedule`, { startsAtIso }),
    onSuccess: () => {
      invalidate()
      setSelectedAppointment(null)
      toast("Appointment rescheduled")
    },
    onError: () => toast("Failed to reschedule — that slot may already be booked"),
  })

  const cancelMutation = useMutation({
    mutationFn: (id: string) => api.patch(`/appointments/${id}/cancel`, {}),
    onSuccess: () => {
      invalidate()
      setSelectedAppointment(null)
      toast("Appointment cancelled")
    },
    onError: () => toast("Failed to cancel appointment"),
  })

  const callMutation = useMutation({
    mutationFn: (id: string) => api.post(`/appointments/${id}/call`),
    onSuccess: () => toast("Calling now…"),
    onError: (err: unknown) => {
      const message = err instanceof Error ? err.message : "Failed to place call"
      toast(message)
    },
  })

  function callToConfirm(a: DisplayAppointment) {
    if (!window.confirm(`Call ${a.child} at ${a.phone} now to confirm this appointment?`)) return
    callMutation.mutate(a.id)
  }

  const sendMessageMutation = useMutation({
    mutationFn: ({ id, which }: { id: string; which: "24h" | "2h" }) => api.post(`/appointments/${id}/reminder`, { which }),
    onSuccess: () => {
      invalidate()
      toast("Reminder message sent")
    },
    onError: (err: unknown) => {
      const message = err instanceof Error ? err.message : "Failed to send message"
      toast(message)
    },
  })

  function sendMessage(a: DisplayAppointment) {
    if (!window.confirm(`Send a WhatsApp reminder to ${a.child} at ${a.phone} now?`)) return
    // Within 3h of the appointment, send the same same-day template the 2h cron job
    // uses (includes Confirm/Reschedule/Cancel buttons); otherwise the day-ahead one.
    const hoursAway = (a.startsAt.getTime() - Date.now()) / 3_600_000
    sendMessageMutation.mutate({ id: a.id, which: hoursAway <= 3 ? "2h" : "24h" })
  }

  const createMutation = useMutation({
    mutationFn: (input: { fullName: string; phone: string; reason: string; startsAtIso: string }) =>
      api.post("/appointments", { patientFullName: input.fullName, patientPhoneE164: input.phone, reason: input.reason, startsAtIso: input.startsAtIso }),
    onSuccess: () => {
      invalidate()
      setNewOpen(false)
      toast("Appointment created")
    },
    onError: () => toast("Failed to create appointment"),
  })

  const filtered = useMemo(
    () =>
      appointments.filter((a) => status === "all" || a.status === status).filter((a) => {
        if (!query.trim()) return true
        const q = query.toLowerCase()
        return a.child.toLowerCase().includes(q) || a.phone.includes(q) || a.reason.toLowerCase().includes(q)
      }),
    [appointments, query, status],
  )

  const stats = useMemo(
    () => ({
      total: appointments.length,
      confirmed: appointments.filter((a) => a.status === "statusConfirmed" || a.status === "statusCheckedIn").length,
      pending: appointments.filter((a) => a.status === "statusPending").length,
      completed: appointments.filter((a) => a.status === "statusCompleted").length,
    }),
    [appointments],
  )

  function reschedule(a: DisplayAppointment) {
    const newDate = window.prompt("New date (YYYY-MM-DD)", a.startsAt.toISOString().slice(0, 10))?.trim()
    if (!newDate) return
    const newTime = window.prompt("New time (HH:mm, 24h)", a.startsAt.toTimeString().slice(0, 5))?.trim()
    if (!newTime) return
    rescheduleMutation.mutate({ id: a.id, startsAtIso: new Date(`${newDate}T${newTime}:00`).toISOString() })
  }

  function cancelAppointment(a: DisplayAppointment) {
    if (!window.confirm(`Cancel ${a.child}'s appointment at ${a.time}?`)) return
    cancelMutation.mutate(a.id)
  }

  return (
    <div>
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="font-heading text-2xl font-bold">{t.apptsPageTitle}</h1>
          <p className="mt-0.5 text-[13.5px] text-muted-foreground">{t.apptsPageSub}</p>
        </div>
        <Button onClick={() => setNewOpen(true)} className="gap-1.5 self-start rounded-[10px] font-bold">
          <CalendarPlus className="size-3.5" strokeWidth={2.4} />
          {t.apptsNewBtn}
        </Button>
      </div>

      <div className="mb-4.5 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[
          { label: t.apptsStatTotal, value: stats.total, bg: "var(--accent)", color: "var(--primary)" },
          { label: t.apptsStatConfirmed, value: stats.confirmed, bg: "#e5f0fb", color: "#1f5fa8" },
          { label: t.apptsStatPending, value: stats.pending, bg: "#fdf1de", color: "#c2882c" },
          { label: t.apptsStatCompleted, value: stats.completed, bg: "#eef0e9", color: "#4a5a4e" },
        ].map((s) => (
          <Card key={s.label} className="gap-0 rounded-2xl border p-4.5 shadow-none">
            <div className="text-[13px] font-semibold text-muted-foreground">{s.label}</div>
            <div className="mt-1.5 text-[26px] font-bold" style={{ color: s.color }}>
              {s.value}
            </div>
          </Card>
        ))}
      </div>

      <Card className="gap-0 rounded-2xl border p-4.5 shadow-none">
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 rounded-full border border-border px-3.5 py-1.5">
            <button onClick={() => setDayOffset((d) => d - 1)} className="flex size-5 items-center justify-center rounded-full hover:bg-muted">
              <ChevronLeft className="size-3.5" strokeWidth={2.2} />
            </button>
            <div className="flex items-center gap-1.5 text-[13px] font-bold whitespace-nowrap">
              <Calendar className="size-3.5 text-primary" strokeWidth={2} />
              {dateLabel}
            </div>
            <button onClick={() => setDayOffset((d) => d + 1)} className="flex size-5 items-center justify-center rounded-full hover:bg-muted">
              <ChevronRight className="size-3.5" strokeWidth={2.2} />
            </button>
          </div>

          <div className="relative max-w-80 flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t.apptsSearchPh}
              className="h-9 rounded-full border-border pl-10 text-[13px]"
            />
          </div>

          <div className="flex flex-wrap items-center gap-1.5 rounded-full border border-border p-[3px]">
            {FILTERS.map((f) => (
              <button
                key={f.key}
                onClick={() => setStatus(f.key)}
                className={cn(
                  "rounded-full px-3.5 py-1.5 text-xs font-bold whitespace-nowrap transition-colors",
                  status === f.key ? "bg-primary text-primary-foreground" : "text-foreground hover:bg-muted",
                )}
              >
                {t[f.labelKey]}
              </button>
            ))}
          </div>

          <div className="ml-auto text-xs font-bold whitespace-nowrap text-muted-foreground">
            {filtered.length} / {appointments.length}
          </div>
        </div>

        {isLoading ? (
          <div className="py-16 text-center text-sm text-muted-foreground">Loading appointments…</div>
        ) : error ? (
          <div className="py-16 text-center text-sm text-destructive">Couldn't load appointments. Is the API reachable and are you signed in?</div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
            <div className="flex size-14 items-center justify-center rounded-2xl border border-border bg-accent">
              <Calendar className="size-6 text-primary" strokeWidth={1.6} />
            </div>
            <p className="text-sm text-muted-foreground">{t.apptsEmpty}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-border">
                  {[t.thTime, t.thPatient, "Reason", t.thDuration, t.thStatus].map((label, i) => (
                    <th key={i} className="px-2 pb-2.5 text-left text-[11.5px] font-bold tracking-wide text-muted-foreground uppercase first:pl-0">
                      {label}
                    </th>
                  ))}
                  <th className="px-2 pb-2.5 pr-0 text-right text-[11.5px] font-bold tracking-wide text-muted-foreground uppercase">{t.thActions}</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((a) => {
                  const sc = STATUS_COLORS[a.status]
                  const cancelled = a.status === "statusCancelled"
                  return (
                    <tr key={a.id} className={cn("border-b border-border last:border-0 hover:bg-muted/60", cancelled && "opacity-60")}>
                      <td className="py-3 pr-2 pl-0 text-[13px] font-bold whitespace-nowrap">{a.time}</td>
                      <td className="px-2 py-3">
                        <button
                          onClick={() => setSelectedAppointment(a)}
                          className="flex items-center gap-2.5 rounded-lg text-left hover:underline"
                        >
                          <div
                            className="flex size-8.5 shrink-0 items-center justify-center rounded-full text-[12px] font-bold text-white"
                            style={{ background: a.color }}
                          >
                            {a.initials}
                          </div>
                          <div>
                            <div className="text-[13.5px] font-bold">{a.child}</div>
                            <div className="text-[11px] text-muted-foreground">
                              {a.phone} · <span className="uppercase">{a.source}</span>
                            </div>
                            {(a.calls.count > 0 || a.messages.count > 0) && (
                              <div className="mt-0.5 flex items-center gap-2 text-[10.5px] font-semibold text-muted-foreground">
                                {a.calls.count > 0 && (
                                  <span className="flex items-center gap-0.5" title={`${a.calls.count} call(s) — last: ${callStatusLabel(a.calls.lastStatus)}`}>
                                    <Phone className="size-2.5" strokeWidth={2.4} />
                                    {a.calls.count} {callStatusLabel(a.calls.lastStatus)}
                                  </span>
                                )}
                                {a.messages.count > 0 && (
                                  <span
                                    className="flex items-center gap-0.5"
                                    title={`${a.messages.count} message(s) — last: ${messageStatusLabel(a.messages.lastStatus)}`}
                                  >
                                    <MessageCircle className="size-2.5" strokeWidth={2.4} />
                                    {a.messages.count} {messageStatusLabel(a.messages.lastStatus)}
                                  </span>
                                )}
                              </div>
                            )}
                          </div>
                        </button>
                      </td>
                      <td className="px-2 py-3 text-[13px]">{a.reason || "—"}</td>
                      <td className="px-2 py-3 text-[13px] text-muted-foreground whitespace-nowrap">{a.duration}</td>
                      <td className="px-2 py-3">
                        <span className="rounded-full px-2.5 py-1 text-[11.5px] font-bold whitespace-nowrap" style={{ background: sc.bg, color: sc.color }}>
                          {t[a.status]}
                        </span>
                      </td>
                      <td className="py-3 pr-0 pl-2 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1.5">
                          {!cancelled && (
                            <Button
                              onClick={() => callToConfirm(a)}
                              disabled={!callingEnabled || !a.phone || (callMutation.isPending && callMutation.variables === a.id)}
                              variant="outline"
                              size="sm"
                              className="gap-1 rounded-lg font-semibold"
                              title={callingEnabled ? "Call to confirm" : "Outbound calling isn't configured yet"}
                            >
                              <Phone className="size-3.5" strokeWidth={2.2} />
                            </Button>
                          )}
                          {!cancelled && (
                            <Button
                              onClick={() => sendMessage(a)}
                              disabled={!a.phone || (sendMessageMutation.isPending && sendMessageMutation.variables?.id === a.id)}
                              variant="outline"
                              size="sm"
                              className="gap-1 rounded-lg font-semibold"
                              title="Send WhatsApp reminder now"
                            >
                              <MessageCircle className="size-3.5" strokeWidth={2.2} />
                            </Button>
                          )}
                          {a.status === "statusPending" ? (
                            <Button
                              onClick={() => confirmMutation.mutate(a.id)}
                              disabled={confirmMutation.isPending}
                              size="sm"
                              className="gap-1 rounded-lg font-semibold"
                            >
                              <CheckCircle2 className="size-3.5" strokeWidth={2.2} />
                              {t.apptsCheckIn}
                            </Button>
                          ) : (
                            <Button
                              onClick={() => reschedule(a)}
                              variant="outline"
                              size="sm"
                              className="rounded-lg font-semibold"
                              disabled={cancelled || rescheduleMutation.isPending}
                            >
                              {t.apptsReschedule}
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <NewAppointmentDialog
        open={newOpen}
        onOpenChange={setNewOpen}
        onSubmit={(input) => createMutation.mutate(input)}
        pending={createMutation.isPending}
      />

      <AppointmentActionsDialog
        appointment={selectedAppointment}
        onOpenChange={(v) => !v && setSelectedAppointment(null)}
        onConfirm={(a) => confirmMutation.mutate(a.id)}
        onReschedule={(a) => {
          setSelectedAppointment(null)
          reschedule(a)
        }}
        onCancel={(a) => {
          setSelectedAppointment(null)
          cancelAppointment(a)
        }}
        confirmPending={confirmMutation.isPending}
        cancelPending={cancelMutation.isPending}
      />
    </div>
  )
}
