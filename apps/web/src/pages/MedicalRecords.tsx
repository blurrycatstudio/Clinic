import { useMemo, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { Dialog } from "radix-ui"
import { Download, File, FileText, Image as ImageIcon, Search, Upload, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { useLang } from "@/lib/i18n"
import { cn } from "@/lib/utils"
import { api } from "@/lib/api"
import { bucketFor, formatFileSize, type ApiPatientDocument, type FileBucket } from "@/lib/documents"
import { UploadRecordDialog } from "@/components/records/UploadRecordDialog"

type Filter = "all" | FileBucket

const TYPE_META: Record<FileBucket, { icon: React.ElementType; color: string; bg: string; labelKey: "recordFileTypePdf" | "recordFileTypeImage" | "recordFileTypeOther" }> = {
  pdf: { icon: FileText, color: "#227a44", bg: "#e3f3e6", labelKey: "recordFileTypePdf" },
  image: { icon: ImageIcon, color: "#a8567a", bg: "#f6e3ec", labelKey: "recordFileTypeImage" },
  other: { icon: File, color: "#1f5fa8", bg: "#e5f0fb", labelKey: "recordFileTypeOther" },
}

function RecordDetailDialog({ record, patientName, onOpenChange }: { record: ApiPatientDocument | null; patientName: string; onOpenChange: (v: boolean) => void }) {
  const { t } = useLang()
  if (!record) return null
  const meta = TYPE_META[bucketFor(record.mime_type)]

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
                <Dialog.Title className="font-heading text-[16px] font-bold break-all">{record.name}</Dialog.Title>
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
              <span className="font-bold">{new Date(record.created_at).toLocaleDateString()}</span>
            </div>
            <div className="flex justify-between border-b pb-2.5">
              <span className="text-muted-foreground">{t.recordsColType}</span>
              <span className="rounded-full px-2 py-0.5 text-[11px] font-bold" style={{ background: meta.bg, color: meta.color }}>
                {t[meta.labelKey]}
              </span>
            </div>
            <div className="flex justify-between border-b pb-2.5">
              <span className="text-muted-foreground">{t.recordsColSize}</span>
              <span className="font-bold">{formatFileSize(record.size_bytes)}</span>
            </div>
          </div>

          <div className="mt-6 flex justify-end gap-2.5">
            <Dialog.Close asChild>
              <Button variant="outline" className="rounded-lg font-bold">
                {t.recordDetailClose}
              </Button>
            </Dialog.Close>
            <Button asChild className="gap-1.5 rounded-lg font-bold">
              <a href={record.url} target="_blank" rel="noopener noreferrer">
                <Download className="size-3.5" strokeWidth={2.2} />
                {t.recordsDownload}
              </a>
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

export default function MedicalRecords() {
  const { t } = useLang()
  const [query, setQuery] = useState("")
  const [filter, setFilter] = useState<Filter>("all")
  const [viewing, setViewing] = useState<ApiPatientDocument | null>(null)
  const [uploadOpen, setUploadOpen] = useState(false)

  const { data, isLoading, error } = useQuery({
    queryKey: ["documents"],
    queryFn: () => api.get<{ rows: ApiPatientDocument[]; count: number }>("/documents?limit=200"),
  })

  const filtered = useMemo(
    () =>
      (data?.rows ?? []).filter((d) => filter === "all" || bucketFor(d.mime_type) === filter).filter((d) => {
        if (!query.trim()) return true
        const q = query.toLowerCase()
        return d.name.toLowerCase().includes(q) || (d.patients?.full_name ?? "").toLowerCase().includes(q)
      }),
    [data, query, filter],
  )

  return (
    <div>
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="font-heading text-2xl font-bold">{t.recordsPageTitle}</h1>
          <p className="mt-0.5 text-[13.5px] text-muted-foreground">{t.recordsPageSub}</p>
        </div>
        <Button onClick={() => setUploadOpen(true)} className="self-start gap-1.5 rounded-[10px] font-bold">
          <Upload className="size-3.5" strokeWidth={2.4} />
          {t.recordsUploadBtn}
        </Button>
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
                ["pdf", t.recordsFilterPdf],
                ["image", t.recordsFilterImage],
                ["other", t.recordsFilterOther],
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

        {isLoading ? (
          <div className="flex flex-col gap-2">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="h-12 animate-pulse rounded-xl bg-muted" />
            ))}
          </div>
        ) : error ? (
          <div className="py-16 text-center text-[13px] text-destructive">{t.recordsLoadError}</div>
        ) : filtered.length === 0 ? (
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
                {filtered.map((d) => {
                  const meta = TYPE_META[bucketFor(d.mime_type)]
                  return (
                    <tr key={d.id} className="border-b border-border last:border-0 hover:bg-muted/60">
                      <td className="py-3 pr-2 pl-0 text-[13.5px] font-bold">{d.patients?.full_name ?? t.recordsUnknownPatient}</td>
                      <td className="px-2 py-3 text-[13px]">{d.name}</td>
                      <td className="px-2 py-3">
                        <span className="flex w-fit items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold whitespace-nowrap" style={{ background: meta.bg, color: meta.color }}>
                          <meta.icon className="size-3" strokeWidth={2.4} />
                          {t[meta.labelKey]}
                        </span>
                      </td>
                      <td className="px-2 py-3 text-[13px] whitespace-nowrap">{new Date(d.created_at).toLocaleDateString()}</td>
                      <td className="px-2 py-3 text-[12.5px] whitespace-nowrap text-muted-foreground">{formatFileSize(d.size_bytes)}</td>
                      <td className="py-3 pr-0 pl-2 text-right whitespace-nowrap">
                        <Button variant="outline" size="sm" className="rounded-lg font-semibold" onClick={() => setViewing(d)}>
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

      <RecordDetailDialog record={viewing} patientName={viewing?.patients?.full_name ?? t.recordsUnknownPatient} onOpenChange={(open) => !open && setViewing(null)} />
      <UploadRecordDialog open={uploadOpen} onOpenChange={setUploadOpen} />
    </div>
  )
}
