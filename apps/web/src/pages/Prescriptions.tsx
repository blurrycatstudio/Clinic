import { useMemo, useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { Plus, Search, Syringe } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { NewPrescriptionDialog } from "@/components/prescriptions/NewPrescriptionDialog"
import { PrescriptionDetailDialog } from "@/components/prescriptions/PrescriptionDetailDialog"
import { useLang } from "@/lib/i18n"
import { api } from "@/lib/api"
import { cn } from "@/lib/utils"

export type ApiPrescriptionItem = {
  id: string
  name: string
  dose: string
  frequency: string
  duration: string
  route: string
}

export type ApiPrescription = {
  id: string
  sequence_number: number
  patient_id: string
  diagnosis: string
  notes: string
  status: "active" | "completed"
  pdf_url: string | null
  sent_at: string | null
  created_at: string
  prescription_items: ApiPrescriptionItem[]
  patients: { full_name: string } | null
}

type StatusFilter = "all" | "active" | "completed"

export default function Prescriptions() {
  const { t } = useLang()
  const queryClient = useQueryClient()
  const [query, setQuery] = useState("")
  const [status, setStatus] = useState<StatusFilter>("all")
  const [newOpen, setNewOpen] = useState(false)
  const [viewing, setViewing] = useState<ApiPrescription | null>(null)

  const { data, isLoading, error } = useQuery({
    queryKey: ["prescriptions"],
    queryFn: () => api.get<{ rows: ApiPrescription[]; count: number }>("/prescriptions?limit=200"),
  })
  const prescriptions = data?.rows ?? []

  const filtered = useMemo(
    () =>
      prescriptions
        .filter((rx) => status === "all" || rx.status === status)
        .filter((rx) => {
          if (!query.trim()) return true
          const q = query.toLowerCase()
          return (
            (rx.patients?.full_name ?? "").toLowerCase().includes(q) ||
            rx.diagnosis.toLowerCase().includes(q) ||
            rx.prescription_items.some((m) => m.name.toLowerCase().includes(q))
          )
        }),
    [prescriptions, query, status],
  )

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
              ["active", t.rxStatusActive],
              ["completed", t.rxStatusCompleted],
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

        {isLoading ? (
          <div className="py-16 text-center text-sm text-muted-foreground">Loading prescriptions…</div>
        ) : error ? (
          <div className="py-16 text-center text-sm text-destructive">Couldn't load prescriptions. Is the API reachable and are you signed in?</div>
        ) : filtered.length === 0 ? (
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
                {filtered.map((rx) => (
                  <tr key={rx.id} className="border-b border-border last:border-0 hover:bg-muted/60">
                    <td className="py-3 pr-2 pl-0">
                      <div className="text-[13.5px] font-bold">{rx.patients?.full_name ?? "—"}</div>
                      <div className="text-[11px] text-muted-foreground">RX-{1000 + rx.sequence_number}</div>
                    </td>
                    <td className="px-2 py-3 text-[13px] whitespace-nowrap">{new Date(rx.created_at).toLocaleDateString()}</td>
                    <td className="px-2 py-3 text-[13px]">{rx.diagnosis}</td>
                    <td className="px-2 py-3 text-[12.5px]">
                      {rx.prescription_items.length === 1
                        ? rx.prescription_items[0].name
                        : `${rx.prescription_items[0]?.name ?? ""} +${rx.prescription_items.length - 1}`}
                    </td>
                    <td className="px-2 py-3">
                      <span
                        className={cn(
                          "rounded-full border px-2.5 py-1 text-[11.5px] font-bold whitespace-nowrap",
                          rx.status === "active"
                            ? "border-primary/30 bg-accent text-primary"
                            : "border-border bg-muted text-foreground",
                        )}
                      >
                        {rx.status === "active" ? t.rxStatusActive : t.rxStatusCompleted}
                      </span>
                    </td>
                    <td className="py-3 pr-0 pl-2 text-right whitespace-nowrap">
                      <Button variant="outline" size="sm" className="rounded-lg font-semibold" onClick={() => setViewing(rx)}>
                        {t.rxView}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <NewPrescriptionDialog
        open={newOpen}
        onOpenChange={setNewOpen}
        onCreated={() => queryClient.invalidateQueries({ queryKey: ["prescriptions"] })}
      />
      <PrescriptionDetailDialog rx={viewing} onOpenChange={(open) => !open && setViewing(null)} />
    </div>
  )
}
