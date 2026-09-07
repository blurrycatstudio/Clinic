import { useMemo, useRef, useState } from "react"
import { Dialog } from "radix-ui"
import { Activity, Download, FileText, Scan, Search, Syringe, Upload, X } from "lucide-react"
import { Button } from "@/components/ui/button"
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
        <Dialog.Content className="fixed top-1/2 left-1/2 z-50 max-h-[90vh] w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl border border-border bg-card p-5 shadow-2xl sm:p-6">
          <div className="mb-5 flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className="flex size-10 items-center justify-center rounded-[10px]" style={{ background: meta.bg }}>
                <meta.icon className="size-5" style={{ color: meta.color }} strokeWidth={1.8} />
              </div>
              <div>
                <Dialog.Title className="font-heading text-[16px] font-bold">{record.title}</Dialog.Title>
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
            <div className="flex justify-between border-b pb-2.5">
              <span className="text-muted-foreground">{t.recordsColType}</span>
              <span className="rounded-full px-2 py-0.5 text-[11px] font-bold" style={{ background: meta.bg, color: meta.color }}>
                {t[meta.labelKey]}
              </span>
            </div>
            <div>
              <div className="mb-1 text-muted-foreground">{t.recordDetailSummary}</div>
              <p className="leading-relaxed text-foreground">{record.summary}</p>
            </div>
          </div>

          <div className="mt-6 flex justify-end gap-2.5">
            <Dialog.Close asChild>
              <Button variant="outline" className="rounded-lg font-bold">
                {t.recordDetailClose}
              </Button>
            </Dialog.Close>
            <Button onClick={handleDownload} className="gap-1.5 rounded-lg font-bold">
              <Download className="size-3.5" strokeWidth={2.2} />
              {t.recordsDownload}
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

export default function MedicalRecords() {
  const { t } = useLang()
  const toast = useToast()
  const [query, setQuery] = useState("")
  const [filter, setFilter] = useState<Filter>("all")
  const [viewing, setViewing] = useState<MedicalRecord | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files
    if (files && files.length > 0) toast(`Uploaded ${files.length} record${files.length > 1 ? "s" : ""}`)
    e.target.value = ""
  }

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
    <div>
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="font-heading text-2xl font-bold">{t.recordsPageTitle}</h1>
          <p className="mt-0.5 text-[13.5px] text-muted-foreground">{t.recordsPageSub}</p>
        </div>
        <Button onClick={() => fileInputRef.current?.click()} className="self-start gap-1.5 rounded-[10px] font-bold">
          <Upload className="size-3.5" strokeWidth={2.4} />
          {t.recordsUploadBtn}
        </Button>
        <input ref={fileInputRef} type="file" multiple className="hidden" onChange={handleUpload} />
      </div>

      <Card className="gap-0 rounded-2xl border p-4.5 shadow-none">
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <div className="relative max-w-90 flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t.recordsSearchPh}
              className="h-9 rounded-full border-border pl-10 text-[13px]"
            />
          </div>
          <div className="flex flex-wrap items-center gap-1.5 rounded-full border border-border p-[3px]">
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
                  "rounded-full px-3.5 py-1.5 text-xs font-bold whitespace-nowrap transition-colors",
                  filter === key ? "bg-primary text-primary-foreground" : "text-foreground hover:bg-muted",
                )}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="ml-auto text-xs font-bold whitespace-nowrap text-muted-foreground">
            {filtered.length} {t.recordsCount}
          </div>
        </div>

        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
            <div className="flex size-14 items-center justify-center rounded-2xl border border-border bg-accent">
              <FileText className="size-6 text-primary" strokeWidth={1.6} />
            </div>
            <p className="text-sm text-muted-foreground">{t.recordsEmpty}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-border">
                  {[t.recordsColPatient, t.recordsColRecord, t.recordsColType, t.recordsColDate, t.recordsColSize].map((label, i) => (
                    <th key={i} className="px-2 pb-2.5 text-left text-[11.5px] font-bold tracking-wide text-muted-foreground uppercase first:pl-0">
                      {label}
                    </th>
                  ))}
                  <th className="px-2 pb-2.5 pr-0 text-right text-[11.5px] font-bold tracking-wide text-muted-foreground uppercase">{t.recordsColActions}</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => {
                  const patient = patientById.get(r.patientId)
                  const meta = TYPE_META[r.type]
                  return (
                    <tr key={r.id} className="border-b border-border last:border-0 hover:bg-muted/60">
                      <td className="py-3 pr-2 pl-0">
                        <div className="flex items-center gap-2.5">
                          <div className="flex size-8.5 shrink-0 items-center justify-center rounded-full text-[12px] font-bold text-white" style={{ background: patient?.color }}>
                            {patient?.initials}
                          </div>
                          <div className="text-[13.5px] font-bold">{patient?.name}</div>
                        </div>
                      </td>
                      <td className="px-2 py-3 text-[13px]">{r.title}</td>
                      <td className="px-2 py-3">
                        <span className="flex w-fit items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold whitespace-nowrap" style={{ background: meta.bg, color: meta.color }}>
                          <meta.icon className="size-3" strokeWidth={2.4} />
                          {t[meta.labelKey]}
                        </span>
                      </td>
                      <td className="px-2 py-3 text-[13px] whitespace-nowrap">{r.date}</td>
                      <td className="px-2 py-3 text-[12.5px] whitespace-nowrap text-muted-foreground">{r.fileSize}</td>
                      <td className="py-3 pr-0 pl-2 text-right whitespace-nowrap">
                        <Button variant="outline" size="sm" className="rounded-lg font-semibold" onClick={() => setViewing(r)}>
                          {t.recordsView}
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

      <RecordDetailDialog
        record={viewing}
        patientName={viewing ? (patientById.get(viewing.patientId)?.name ?? "") : ""}
        onOpenChange={(open) => !open && setViewing(null)}
      />
    </div>
  )
}
