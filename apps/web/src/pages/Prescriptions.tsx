import { useMemo, useState } from "react"
import { Plus, Search, Syringe } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { NewPrescriptionDialog } from "@/components/prescriptions/NewPrescriptionDialog"
import { PrescriptionDetailDialog } from "@/components/prescriptions/PrescriptionDetailDialog"
import { useLang } from "@/lib/i18n"
import { PRESCRIPTIONS as INITIAL_PRESCRIPTIONS, RX_PATIENTS, type Prescription } from "@/lib/data"
import { cn } from "@/lib/utils"

type StatusFilter = "all" | "rxStatusActive" | "rxStatusCompleted"

export default function Prescriptions() {
  const { t } = useLang()
  const [prescriptions, setPrescriptions] = useState<Prescription[]>(INITIAL_PRESCRIPTIONS)
  const [query, setQuery] = useState("")
  const [status, setStatus] = useState<StatusFilter>("all")
  const [newOpen, setNewOpen] = useState(false)
  const [viewing, setViewing] = useState<Prescription | null>(null)

  const patientById = useMemo(() => new Map(RX_PATIENTS.map((p) => [p.id, p])), [])

  const filtered = prescriptions
    .filter((rx) => status === "all" || rx.status === status)
    .filter((rx) => {
      if (!query.trim()) return true
      const q = query.toLowerCase()
      const patient = patientById.get(rx.patientId)
      return (
        patient?.name.toLowerCase().includes(q) ||
        rx.diagnosis.toLowerCase().includes(q) ||
        rx.medications.some((m) => m.name.toLowerCase().includes(q)) ||
        rx.id.toLowerCase().includes(q)
      )
    })
    .sort((a, b) => (a.date < b.date ? 1 : -1))

  return (
    <div>
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="font-heading text-2xl font-bold">{t.rxPageTitle}</h1>
          <p className="mt-0.5 text-[13.5px] text-muted-foreground">{t.rxPageSub}</p>
        </div>
        <Button onClick={() => setNewOpen(true)} className="self-start gap-1.5 rounded-[10px] font-bold">
          <Plus className="size-3.5" strokeWidth={2.4} />
          {t.rxNewBtn}
        </Button>
      </div>

      <Card className="gap-0 rounded-2xl border p-4.5 shadow-none">
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <div className="relative max-w-90 min-w-0 flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t.rxSearchPlaceholder}
              className="h-9 rounded-full border-border pl-10 text-[13px]"
            />
          </div>
          <div className="flex flex-wrap items-center gap-1.5 rounded-full border border-border p-[3px]">
            {([
              ["all", t.rxAll],
              ["rxStatusActive", t.rxStatusActive],
              ["rxStatusCompleted", t.rxStatusCompleted],
            ] as const).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setStatus(key)}
                className={cn(
                  "rounded-full px-3.5 py-1.5 text-xs font-bold transition-colors",
                  status === key ? "bg-primary text-primary-foreground" : "text-foreground hover:bg-muted",
                )}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="ml-auto text-xs font-bold text-muted-foreground">
            {filtered.length} {t.rxCount}
          </div>
        </div>

        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
            <div className="flex size-14 items-center justify-center rounded-2xl border border-border bg-accent">
              <Syringe className="size-6 text-primary" strokeWidth={1.6} />
            </div>
            <p className="text-sm text-muted-foreground">{t.rxEmpty}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-border">
                  {[t.rxPatient, t.rxDate, t.rxDiagnosisLabel, t.rxMeds, t.rxStatus].map((label, i) => (
                    <th
                      key={i}
                      className="px-2 pb-2.5 text-left text-[11.5px] font-bold tracking-wide text-muted-foreground uppercase first:pl-0"
                    >
                      {label}
                    </th>
                  ))}
                  <th className="px-2 pb-2.5 pr-0 text-right text-[11.5px] font-bold tracking-wide text-muted-foreground uppercase">
                    {t.rxActions}
                  </th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((rx) => {
                  const patient = patientById.get(rx.patientId)
                  return (
                    <tr key={rx.id} className="border-b border-border last:border-0 hover:bg-muted/60">
                      <td className="py-3 pr-2 pl-0">
                        <div className="flex items-center gap-2.5">
                          <div
                            className="flex size-8.5 shrink-0 items-center justify-center rounded-full text-[12px] font-bold text-white"
                            style={{ background: patient?.color }}
                          >
                            {patient?.initials}
                          </div>
                          <div>
                            <div className="text-[13.5px] font-bold">{patient?.name}</div>
                            <div className="text-[11px] text-muted-foreground">{rx.id}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-2 py-3 text-[13px] whitespace-nowrap">{rx.date}</td>
                      <td className="px-2 py-3 text-[13px]">{rx.diagnosis}</td>
                      <td className="px-2 py-3 text-[12.5px]">
                        {rx.medications.length === 1 ? rx.medications[0].name : `${rx.medications[0].name} +${rx.medications.length - 1}`}
                      </td>
                      <td className="px-2 py-3">
                        <span
                          className={cn(
                            "rounded-full border px-2.5 py-1 text-[11.5px] font-bold whitespace-nowrap",
                            rx.status === "rxStatusActive"
                              ? "border-primary/30 bg-accent text-primary"
                              : "border-border bg-muted text-foreground",
                          )}
                        >
                          {t[rx.status]}
                        </span>
                      </td>
                      <td className="py-3 pr-0 pl-2 text-right whitespace-nowrap">
                        <Button variant="outline" size="sm" className="rounded-lg font-semibold" onClick={() => setViewing(rx)}>
                          {t.rxView}
                        </Button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <NewPrescriptionDialog
        open={newOpen}
        onOpenChange={setNewOpen}
        onCreate={(rx) => setPrescriptions((prev) => [rx, ...prev])}
      />
      <PrescriptionDetailDialog rx={viewing} onOpenChange={(open) => !open && setViewing(null)} />
    </div>
  )
}
