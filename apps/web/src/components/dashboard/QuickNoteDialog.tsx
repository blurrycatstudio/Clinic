import { useEffect, useState } from "react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { Dialog } from "radix-ui"
import { Loader2, PenLine, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useLang } from "@/lib/i18n"
import { api } from "@/lib/api"
import { useToast } from "@/lib/toast"

export function QuickNoteDialog({
  open,
  onOpenChange,
  patientId,
  patientName,
  onSaved,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  patientId: string
  patientName: string
  onSaved: (note: string) => void
}) {
  const { t } = useLang()
  const toast = useToast()
  const queryClient = useQueryClient()
  const [note, setNote] = useState("")

  useEffect(() => {
    if (open) setNote("")
  }, [open])

  // A quick note is stored as a consultation record with no diagnosis, so it
  // shows up in this patient's Medical History alongside real visits — the
  // same place the doctor already looks for everything else.
  const saveMutation = useMutation({
    mutationFn: () =>
      api.post("/consultations", {
        patientId,
        chiefComplaint: note.trim(),
        diagnosis: "",
        notes: "",
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["consultations", patientId] })
      onSaved(note.trim())
      toast("Note saved to Medical History")
      onOpenChange(false)
    },
    onError: () => toast("Failed to save note — please try again"),
  })

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm" />
        <Dialog.Content className="fixed top-1/2 left-1/2 z-50 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-border bg-card p-5 shadow-2xl sm:p-6">
          <div className="mb-4 flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-accent text-primary">
                <PenLine className="size-4.5" strokeWidth={2} />
              </div>
              <div>
                <Dialog.Title className="font-heading text-lg leading-tight font-bold">Quick clinical note</Dialog.Title>
                <p className="text-xs text-muted-foreground">
                  For <span className="font-bold text-foreground">{patientName}</span>
                </p>
              </div>
            </div>
            <Dialog.Close className="flex size-8 shrink-0 items-center justify-center rounded-[9px] border border-border hover:bg-muted">
              <X className="size-4" strokeWidth={2} />
            </Dialog.Close>
          </div>

          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="e.g. Parent called, symptoms improving, no fever since yesterday…"
            rows={4}
            autoFocus
            className="w-full resize-none rounded-lg border border-border bg-transparent px-2.5 py-2 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          />
          <p className="mt-2 text-[11.5px] text-muted-foreground">Saved to this patient's Medical History tab.</p>

          <div className="mt-5 flex justify-end gap-2.5">
            <Dialog.Close asChild>
              <Button variant="outline" className="rounded-lg font-bold">
                {t.consultCancel}
              </Button>
            </Dialog.Close>
            <Button
              onClick={() => saveMutation.mutate()}
              disabled={!note.trim() || saveMutation.isPending}
              className="gap-1.5 rounded-lg font-bold"
            >
              {saveMutation.isPending ? <Loader2 className="size-4 animate-spin" /> : <PenLine className="size-4" strokeWidth={2} />}
              {saveMutation.isPending ? t.consultSaving : "Save note"}
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
