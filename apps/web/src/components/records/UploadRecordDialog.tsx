import { useRef, useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { Dialog } from "radix-ui"
import { Loader2, Search, Upload, User, X } from "lucide-react"
import { Input } from "@/components/ui/input"
import { useLang } from "@/lib/i18n"
import { useToast } from "@/lib/toast"
import { api } from "@/lib/api"
import { fileToBase64 } from "@/lib/documents"

type ApiPatientLite = { id: string; full_name: string; phone_e164: string }

/** Staff picks a patient by searching the parent/patient name, then uploads a file for them —
 * hits the real /patients/:id/documents API, shared by the mobile and desktop Records screens
 * (see PatientSnapshotCard for the per-patient desktop counterpart of this same flow). The
 * backend's 12-hour cron then WhatsApps whatever landed in that window to the patient's
 * registered phone, so there's nothing further for staff to do after uploading. */
export function UploadRecordDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
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
