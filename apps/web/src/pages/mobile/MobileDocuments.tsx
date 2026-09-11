import { useMemo, useState } from "react"
import { useNavigate } from "react-router-dom"
import { Dialog } from "radix-ui"
import { Activity, Download, FileText, Scan, Search, Syringe, X } from "lucide-react"
import { MobileShell } from "@/components/mobile/MobileShell"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { useLang } from "@/lib/i18n"
import { MEDICAL_RECORDS, PATIENTS, type MedicalRecord, type RecordType } from "@/lib/data"
import { cn } from "@/lib/utils"
import { useToast } from "@/lib/toast"
import { downloadTextFile } from "@/lib/download"

type Filter = "all" | RecordType

const TYPE_META: Record<RecordType, { icon: React.ElementType; color: string; bg: string; labelKey: "recordTypeLab" | "recordTypeVisit" | "recordTypeImaging" | "recordTypeVaccination" }> = {
  lab: { icon: Activity, color: "#1f5fa8", bg: "#e5f0fb", labelKey: "recordTypeLab" },
  visit: { icon: FileText, color: "#227a44", bg: "#e3f3e6", labelKey: "recordTypeVisit" },
  imaging: { icon: Scan, color: "#a8567a", bg: "#f6e3ec", labelKey: "recordTypeImaging" },
  vaccination: { icon: Syringe, color: "#c2882c", bg: "#fdf1de", labelKey: "recordTypeVaccination" },
}

function RecordDetailDialog({ record, patientName, onOpenChange }: { record: MedicalRecord | null; patientName: string; onOpenChange: (v: boolean) => void }) {
  const { t } = useLang()
  const toast = useToast()
  if (!record) return null
  const meta = TYPE_META[record.type]

  function handleDownload() {
    if (!record) return
    downloadTextFile(
      `${record.title}.txt`,
      `${record.title}\nPatient: ${patientName}\nDate: ${record.date}\nDoctor: ${record.doctor}\n\n${record.summary}`,
    )
    toast("Record downloaded")
  }

  return (
    <Dialog.Root open={!!record} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm" />
        <Dialog.Content className="fixed top-1/2 left-1/2 z-50 max-h-[85vh] w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl border border-border bg-card p-5 shadow-2xl">
          <div className="mb-5 flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className="flex size-10 items-center justify-center rounded-[10px]" style={{ background: meta.bg }}>
                <meta.icon className="size-5" style={{ color: meta.color }} strokeWidth={1.8} />
              </div>
              <div>
                <Dialog.Title className="font-heading text-[15px] font-bold">{record.title}</Dialog.Title>
                <div className="mt-0.5 text-[11.5px] text-muted-foreground">{patientName}</div>
              </div>
            </div>
            <Dialog.Close className="flex size-8 shrink-0 items-center justify-center rounded-[9px] border border-border hover:bg-muted">
              <X className="size-4" strokeWidth={2} />
            </Dialog.Close>
          </div>

          <div className="flex flex-col gap-3 text-[13px]">
            <div className="flex justify-between border-b pb-2.5">
              <span className="text-muted-foreground">{t.recordsColDate}</span>
              <span className="font-bold">{record.date}</span>
            </div>
            <div className="flex justify-between border-b pb-2.5">
              <span className="text-muted-foreground">{t.recordDetailDoctor}</span>
              <span className="font-bold">{record.doctor}</span>
            </div>
            <div>
              <div className="mb-1 text-muted-foreground">{t.recordDetailSummary}</div>
              <p className="leading-relaxed text-foreground">{record.summary}</p>
            </div>
          </div>

          <div className="mt-6 flex gap-2.5">
            <Dialog.Close asChild>
              <button className="flex-1 rounded-lg border border-border py-2 text-[13px] font-bold hover:bg-muted">{t.recordDetailClose}</button>
            </Dialog.Close>
            <button onClick={handleDownload} className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-primary py-2 text-[13px] font-bold text-primary-foreground">
              <Download className="size-3.5" strokeWidth={2.2} />
              {t.recordsDownload}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

/** Mobile-first documents list — the phone counterpart of the desktop Medical Records page (same demo data; there's no live document-upload API yet). */
export default function MobileDocuments() {
  const { t } = useLang()
  const navigate = useNavigate()
  const [query, setQuery] = useState("")
  const [filter, setFilter] = useState<Filter>("all")
  const [viewing, setViewing] = useState<MedicalRecord | null>(null)

  const patientById = useMemo(() => new Map(PATIENTS.map((p) => [p.id, p])), [])

  const filtered = useMemo(
    () =>
      MEDICAL_RECORDS.filter((r) => filter === "all" || r.type === filter).filter((r) => {
        if (!query.trim()) return true
        const q = query.toLowerCase()
        const patient = patientById.get(r.patientId)
        return r.title.toLowerCase().includes(q) || patient?.name.toLowerCase().includes(q)
      }),
    [query, filter, patientById],
  )

  return (
    <MobileShell title={t.recordsPageTitle} onBack={() => navigate("/mobile/dashboard")}>
      <div className="flex flex-col gap-3 px-4 py-4">
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t.recordsSearchPh}
            className="h-10 rounded-full border-border pl-10 text-[13px]"
          />
        </div>

        <div className="scrollbar-hide -mx-4 flex gap-1.5 overflow-x-auto px-4">
          {(
            [
              ["all", t.recordsFilterAll],
              ["lab", t.recordsFilterLab],
              ["visit", t.recordsFilterVisit],
              ["imaging", t.recordsFilterImaging],
              ["vaccination", t.recordsFilterVaccination],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setFilter(key)}
              className={cn(
                "shrink-0 rounded-full border px-3.5 py-1.5 text-xs font-bold whitespace-nowrap transition-colors",
                filter === key ? "border-primary bg-primary text-primary-foreground" : "border-border text-foreground hover:bg-muted",
              )}
            >
              {label}
            </button>
          ))}
        </div>

        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
            <div className="flex size-14 items-center justify-center rounded-2xl border border-border bg-accent">
              <FileText className="size-6 text-primary" strokeWidth={1.6} />
            </div>
            <p className="text-sm text-muted-foreground">{t.recordsEmpty}</p>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {filtered.map((r) => {
              const patient = patientById.get(r.patientId)
              const meta = TYPE_META[r.type]
              return (
                <Card
                  key={r.id}
                  onClick={() => setViewing(r)}
                  className="cursor-pointer gap-0 rounded-2xl border p-3 shadow-none hover:bg-muted/40"
                >
                  <div className="flex items-start gap-2.5">
                    <div className="flex size-9 shrink-0 items-center justify-center rounded-[10px]" style={{ background: meta.bg }}>
                      <meta.icon className="size-4" style={{ color: meta.color }} strokeWidth={1.8} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[13px] font-bold">{r.title}</div>
                      <div className="truncate text-[11.5px] text-muted-foreground">{patient?.name}</div>
                      <div className="mt-1 flex items-center gap-1.5">
                        <span className="rounded-full px-2 py-0.5 text-[10px] font-bold whitespace-nowrap" style={{ background: meta.bg, color: meta.color }}>
                          {t[meta.labelKey]}
                        </span>
                        <span className="text-[10.5px] text-muted-foreground">{r.date}</span>
                      </div>
                    </div>
                  </div>
                </Card>
              )
            })}
          </div>
        )}
      </div>

      <RecordDetailDialog
        record={viewing}
        patientName={viewing ? (patientById.get(viewing.patientId)?.name ?? "") : ""}
        onOpenChange={(open) => !open && setViewing(null)}
      />
    </MobileShell>
  )
}
