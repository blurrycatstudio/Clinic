import { useMemo, useState } from "react"
import { Calendar, CalendarPlus, CheckCircle2, ChevronLeft, ChevronRight, Search, X } from "lucide-react"
import { Dialog } from "radix-ui"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { useLang } from "@/lib/i18n"
import { APPOINTMENTS, PATIENTS, STATUS_COLORS, type AppointmentStatus } from "@/lib/data"
import { cn } from "@/lib/utils"

type StatusFilter = "all" | AppointmentStatus

const FILTERS: { key: StatusFilter; labelKey: "apptsFilterAll" | "statusConfirmed" | "statusPending" | "statusCompleted" | "statusCancelled" }[] = [
  { key: "all", labelKey: "apptsFilterAll" },
  { key: "statusConfirmed", labelKey: "statusConfirmed" },
  { key: "statusPending", labelKey: "statusPending" },
  { key: "statusCompleted", labelKey: "statusCompleted" },
  { key: "statusCancelled", labelKey: "statusCancelled" },
]

function NewAppointmentDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const { t } = useLang()
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm" />
        <Dialog.Content className="fixed top-1/2 left-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-border bg-card p-6 shadow-2xl">
          <div className="mb-5 flex items-center justify-between">
            <Dialog.Title className="font-heading text-xl font-bold">{t.apptsNewModalTitle}</Dialog.Title>
            <Dialog.Close className="flex size-8 items-center justify-center rounded-[9px] border border-border hover:bg-muted">
              <X className="size-4" strokeWidth={2} />
            </Dialog.Close>
          </div>
          <div className="flex flex-col gap-4">
            <div>
              <label className="mb-1.5 block text-xs font-bold">{t.apptsNewModalPatient}</label>
              <select className="h-9 w-full rounded-lg border border-border bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50">
                <option value="">{t.apptsNewModalSelectPatient}</option>
                {PATIENTS.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} · {p.age}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-bold">{t.apptsNewModalType}</label>
              <select className="h-9 w-full rounded-lg border border-border bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50">
                {(["typeWellchild", "typeVaccination", "typeGrowth", "typeConsultation", "typeFollowup"] as const).map((key) => (
                  <option key={key} value={key}>
                    {t[key]}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1.5 block text-xs font-bold">{t.apptsNewModalDate}</label>
                <Input type="date" className="h-9" defaultValue="2026-09-05" />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-bold">{t.apptsNewModalTime}</label>
                <Input type="time" className="h-9" defaultValue="09:00" />
              </div>
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-bold">{t.apptsNewModalDuration}</label>
              <select className="h-9 w-full rounded-lg border border-border bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50">
                <option>15 min</option>
                <option>20 min</option>
                <option>30 min</option>
                <option>45 min</option>
                <option>60 min</option>
              </select>
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-bold">{t.apptsNewModalNotes}</label>
              <textarea
                rows={3}
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
            <Button onClick={() => onOpenChange(false)} className="rounded-lg font-bold">
              {t.apptsNewModalSave}
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

export default function Appointments() {
  const { t } = useLang()
  const [query, setQuery] = useState("")
  const [status, setStatus] = useState<StatusFilter>("all")
  const [newOpen, setNewOpen] = useState(false)

  const filtered = useMemo(
    () =>
      APPOINTMENTS.filter((a) => status === "all" || a.status === status).filter((a) => {
        if (!query.trim()) return true
        const q = query.toLowerCase()
        return a.child.toLowerCase().includes(q) || a.phone.includes(q) || t[a.type].toLowerCase().includes(q)
      }),
    [query, status, t],
  )

  const stats = useMemo(
    () => ({
      total: APPOINTMENTS.length,
      confirmed: APPOINTMENTS.filter((a) => a.status === "statusConfirmed" || a.status === "statusCheckedIn").length,
      pending: APPOINTMENTS.filter((a) => a.status === "statusPending").length,
      completed: APPOINTMENTS.filter((a) => a.status === "statusCompleted").length,
    }),
    [],
  )

  return (
    <div>
      <div className="mb-5 flex items-start justify-between">
        <div>
          <h1 className="font-heading text-2xl font-bold">{t.apptsPageTitle}</h1>
          <p className="mt-0.5 text-[13.5px] text-muted-foreground">{t.apptsPageSub}</p>
        </div>
        <Button onClick={() => setNewOpen(true)} className="gap-1.5 rounded-[10px] font-bold">
          <CalendarPlus className="size-3.5" strokeWidth={2.4} />
          {t.apptsNewBtn}
        </Button>
      </div>

      <div className="mb-4.5 grid grid-cols-4 gap-4">
        {[
          { label: t.apptsStatTotal, value: stats.total, bg: "var(--accent)", color: "var(--primary)" },
          { label: t.apptsStatConfirmed, value: stats.confirmed, bg: "#e5f0fb", color: "#1f5fa8" },
          { label: t.apptsStatPending, value: stats.pending, bg: "#fdf1de", color: "#c2882c" },
          { label: t.apptsStatCompleted, value: stats.completed, bg: "#eef0e9", color: "#4a5a4e" },
        ].map((s) => (
          <Card key={s.label} className="gap-0 rounded-2xl border p-4.5 shadow-none">
            <div className="text-[13px] font-semibold text-muted-foreground">{s.label}</div>
            <div className="font-heading mt-1.5 text-[26px] font-bold" style={{ color: s.color }}>
              {s.value}
            </div>
          </Card>
        ))}
      </div>

      <Card className="gap-0 rounded-2xl border p-4.5 shadow-none">
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 rounded-full border border-border px-3.5 py-1.5">
            <button className="flex size-5 items-center justify-center rounded-full hover:bg-muted">
              <ChevronLeft className="size-3.5" strokeWidth={2.2} />
            </button>
            <div className="flex items-center gap-1.5 text-[13px] font-bold whitespace-nowrap">
              <Calendar className="size-3.5 text-primary" strokeWidth={2} />
              {t.dateLine}
            </div>
            <button className="flex size-5 items-center justify-center rounded-full hover:bg-muted">
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
            {filtered.length} / {APPOINTMENTS.length}
          </div>
        </div>

        {filtered.length === 0 ? (
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
                  {[t.thTime, t.thPatient, t.thType, t.thDuration, t.thStatus].map((label, i) => (
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
                        <div className="flex items-center gap-2.5">
                          <div
                            className="flex size-8.5 shrink-0 items-center justify-center rounded-full text-[12px] font-bold text-white"
                            style={{ background: a.color }}
                          >
                            {a.initials}
                          </div>
                          <div>
                            <div className="text-[13.5px] font-bold">{a.child}</div>
                            <div className="text-[11px] text-muted-foreground">{a.phone}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-2 py-3 text-[13px]">{t[a.type]}</td>
                      <td className="px-2 py-3 text-[13px] text-muted-foreground whitespace-nowrap">{a.duration}</td>
                      <td className="px-2 py-3">
                        <span className="rounded-full px-2.5 py-1 text-[11.5px] font-bold whitespace-nowrap" style={{ background: sc.bg, color: sc.color }}>
                          {t[a.status]}
                        </span>
                      </td>
                      <td className="py-3 pr-0 pl-2 text-right whitespace-nowrap">
                        {a.status === "statusPending" ? (
                          <Button size="sm" className="gap-1 rounded-lg font-semibold">
                            <CheckCircle2 className="size-3.5" strokeWidth={2.2} />
                            {t.apptsCheckIn}
                          </Button>
                        ) : (
                          <Button variant="outline" size="sm" className="rounded-lg font-semibold" disabled={cancelled}>
                            {t.apptsReschedule}
                          </Button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <NewAppointmentDialog open={newOpen} onOpenChange={setNewOpen} />
    </div>
  )
}
