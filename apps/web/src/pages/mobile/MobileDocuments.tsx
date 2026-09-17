import { useMemo, useRef, useState } from "react"
import { useNavigate } from "react-router-dom"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { Dialog } from "radix-ui"
import { Download, File, FileText, Image as ImageIcon, Loader2, Search, Upload, User, X } from "lucide-react"
import { MobileShell } from "@/components/mobile/MobileShell"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { LOCALE, useLang } from "@/lib/i18n"
import { cn } from "@/lib/utils"
import { useToast } from "@/lib/toast"
import { api } from "@/lib/api"

type FileBucket = "pdf" | "image" | "other"
type Filter = "all" | FileBucket

type ApiPatientLite = { id: string; full_name: string; phone_e164: string }

type ApiPatientDocument = {
  id: string
  patient_id: string
  name: string
  mime_type: string
  size_bytes: number
  url: string
  created_at: string
  patients: { full_name: string; phone_e164: string } | null
}

function bucketFor(mimeType: string): FileBucket {
  if (mimeType === "application/pdf") return "pdf"
  if (mimeType.startsWith("image/")) return "image"
  return "other"
}

function formatSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${Math.max(1, Math.round(bytes / 1024))} KB`
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve((reader.result as string).split(",")[1] ?? "")
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

/** Staff picks a patient by searching the parent/patient name, then uploads a file for them — hits the real /patients/:id/documents API (see PatientSnapshotCard for the desktop counterpart of this same flow). The backend's 12-hour cron then WhatsApps whatever landed in that window to the patient's registered phone, so there's nothing further for staff to do after uploading. */
function UploadRecordDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const { t } = useLang()
  const toast = useToast()
  const queryClient = useQueryClient()
  const [search, setSearch] = useState("")
  const [selected, setSelected] = useState<ApiPatientLite | null>(null)
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const patientsQuery = useQuery({
    queryKey: ["patients-search-upload", search],
    queryFn: () => api.get<{ rows: ApiPatientLite[] }>(`/patients?search=${encodeURIComponent(search.trim())}&limit=8`),
    enabled: open && !selected && search.trim().length >= 2,
  })

  function reset() {
    setSearch("")
    setSelected(null)
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ""
    if (!file || !selected) return
    setUploading(true)
    try {
      const dataBase64 = await fileToBase64(file)
      await api.post(`/patients/${selected.id}/documents`, {
        name: file.name,
        mimeType: file.type || (file.name.toLowerCase().endsWith(".pdf") ? "application/pdf" : "application/octet-stream"),
        dataBase64,
      })
      toast(t.recordsUploadedToast.replace("{name}", selected.full_name).replace("{phone}", selected.phone_e164))
      queryClient.invalidateQueries({ queryKey: ["documents"] })
      reset()
      onOpenChange(false)
    } catch {
      toast(t.recordsUploadFailedToast)
    } finally {
      setUploading(false)
    }
  }

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(v) => {
        if (!v) reset()
        onOpenChange(v)
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm" />
        <Dialog.Content className="fixed top-1/2 left-1/2 z-50 max-h-[85vh] w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl border border-border bg-card p-5 shadow-2xl">
          <div className="mb-4 flex items-start justify-between">
            <Dialog.Title className="font-heading text-[15px] font-bold">{t.recordsUploadDialogTitle}</Dialog.Title>
            <Dialog.Close className="flex size-8 shrink-0 items-center justify-center rounded-[9px] border border-border hover:bg-muted">
              <X className="size-4" strokeWidth={2} />
            </Dialog.Close>
          </div>

          {!selected ? (
            <div className="flex flex-col gap-3">
              <div className="relative">
                <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  autoFocus
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={t.recordsUploadSearchPh}
                  className="h-10 rounded-full border-border pl-10 text-[13px]"
                />
              </div>

              {search.trim().length < 2 ? (
                <p className="px-1 py-6 text-center text-[12.5px] text-muted-foreground">{t.recordsUploadSearchHint}</p>
              ) : patientsQuery.isLoading ? (
                <div className="flex items-center justify-center gap-2 py-6 text-[12.5px] text-muted-foreground">
                  <Loader2 className="size-3.5 animate-spin" /> {t.recordsUploadSearching}
                </div>
              ) : (patientsQuery.data?.rows.length ?? 0) === 0 ? (
                <p className="px-1 py-6 text-center text-[12.5px] text-muted-foreground">{t.recordsUploadNoResults}</p>
              ) : (
                <div className="flex max-h-72 flex-col gap-1 overflow-y-auto">
                  {patientsQuery.data!.rows.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => setSelected(p)}
                      className="flex items-center gap-2.5 rounded-xl border border-transparent px-2.5 py-2 text-left hover:border-border hover:bg-muted/60"
                    >
                      <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-accent text-primary">
                        <User className="size-4" strokeWidth={1.8} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[13px] font-bold">{p.full_name}</div>
                        <div className="truncate text-[11.5px] text-muted-foreground">{p.phone_e164}</div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              <div className="flex items-center gap-2.5 rounded-xl border border-border bg-accent/40 px-3 py-2.5">
                <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-accent text-primary">
                  <User className="size-4.5" strokeWidth={1.8} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13.5px] font-bold">{selected.full_name}</div>
                  <div className="truncate text-[11.5px] text-muted-foreground">{selected.phone_e164}</div>
                </div>
                <button onClick={() => setSelected(null)} className="shrink-0 text-[11.5px] font-bold text-primary hover:underline">
                  {t.recordsUploadChangePatient}
                </button>
              </div>

              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="flex items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border py-6 text-[13px] font-bold text-primary transition-colors hover:bg-muted/40 disabled:opacity-50"
              >
                {uploading ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" strokeWidth={2.2} />}
                {uploading ? t.recordsUploadUploading : t.recordsUploadChooseFile}
              </button>
              <input ref={fileInputRef} type="file" className="hidden" onChange={handleFile} />

              <p className="rounded-xl bg-accent/40 px-3 py-2.5 text-[11.5px] leading-relaxed text-muted-foreground">{t.recordsUploadHint}</p>
            </div>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

const TYPE_META: Record<FileBucket, { icon: React.ElementType; color: string; bg: string; labelKey: "recordFileTypePdf" | "recordFileTypeImage" | "recordFileTypeOther" }> = {
  pdf: { icon: FileText, color: "#227a44", bg: "#e3f3e6", labelKey: "recordFileTypePdf" },
  image: { icon: ImageIcon, color: "#a8567a", bg: "#f6e3ec", labelKey: "recordFileTypeImage" },
  other: { icon: File, color: "#1f5fa8", bg: "#e5f0fb", labelKey: "recordFileTypeOther" },
}

function RecordDetailDialog({
  record,
  patientName,
  locale,
  onOpenChange,
}: {
  record: ApiPatientDocument | null
  patientName: string
  locale: string
  onOpenChange: (v: boolean) => void
}) {
  const { t } = useLang()
  if (!record) return null
  const meta = TYPE_META[bucketFor(record.mime_type)]

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
                <Dialog.Title className="font-heading text-[15px] font-bold break-all">{record.name}</Dialog.Title>
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
              <span className="font-bold">{new Date(record.created_at).toLocaleDateString(locale)}</span>
            </div>
            <div className="flex justify-between border-b pb-2.5">
              <span className="text-muted-foreground">{t.recordsColSize}</span>
              <span className="font-bold">{formatSize(record.size_bytes)}</span>
            </div>
          </div>

          <div className="mt-6 flex gap-2.5">
            <Dialog.Close asChild>
              <button className="flex-1 rounded-lg border border-border py-2 text-[13px] font-bold hover:bg-muted">{t.recordDetailClose}</button>
            </Dialog.Close>
            <a
              href={record.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-primary py-2 text-[13px] font-bold text-primary-foreground"
            >
              <Download className="size-3.5" strokeWidth={2.2} />
              {t.recordsDownload}
            </a>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

/** Mobile-first documents list — the phone counterpart of the desktop Medical Records page. Both the list and the upload dialog hit the real per-patient documents API, which the 12-hour cron then delivers over WhatsApp. */
export default function MobileDocuments() {
  const { t, lang } = useLang()
  const navigate = useNavigate()
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

        <button
          onClick={() => setUploadOpen(true)}
          className="flex items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-[#F97316] via-[#EC4899] to-[#8B5CF6] py-2.5 text-[13px] font-bold text-white shadow-md"
        >
          <Upload className="size-4" strokeWidth={2.2} />
          {t.recordsUploadBtn}
        </button>

        <div className="scrollbar-hide -mx-4 flex gap-1.5 overflow-x-auto px-4">
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
                "shrink-0 rounded-full border px-3.5 py-1.5 text-xs font-bold whitespace-nowrap transition-colors",
                filter === key ? "border-primary bg-primary text-primary-foreground" : "border-border text-foreground hover:bg-muted",
              )}
            >
              {label}
            </button>
          ))}
        </div>

        {isLoading ? (
          <div className="flex flex-col gap-2">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="h-16 animate-pulse rounded-2xl bg-muted" />
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
          <div className="flex flex-col gap-2">
            {filtered.map((d) => {
              const meta = TYPE_META[bucketFor(d.mime_type)]
              return (
                <Card
                  key={d.id}
                  onClick={() => setViewing(d)}
                  className="cursor-pointer gap-0 rounded-2xl border p-3 shadow-none hover:bg-muted/40"
                >
                  <div className="flex items-start gap-2.5">
                    <div className="flex size-9 shrink-0 items-center justify-center rounded-[10px]" style={{ background: meta.bg }}>
                      <meta.icon className="size-4" style={{ color: meta.color }} strokeWidth={1.8} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[13px] font-bold">{d.name}</div>
                      <div className="truncate text-[11.5px] text-muted-foreground">{d.patients?.full_name ?? t.recordsUnknownPatient}</div>
                      <div className="mt-1 flex items-center gap-1.5">
                        <span className="rounded-full px-2 py-0.5 text-[10px] font-bold whitespace-nowrap" style={{ background: meta.bg, color: meta.color }}>
                          {t[meta.labelKey]}
                        </span>
                        <span className="text-[10.5px] text-muted-foreground">{new Date(d.created_at).toLocaleDateString(LOCALE[lang])}</span>
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
        patientName={viewing?.patients?.full_name ?? t.recordsUnknownPatient}
        locale={LOCALE[lang]}
        onOpenChange={(open) => !open && setViewing(null)}
      />
      <UploadRecordDialog open={uploadOpen} onOpenChange={setUploadOpen} />
    </MobileShell>
  )
}
