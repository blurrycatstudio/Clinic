import { useEffect, useState } from "react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { Dialog } from "radix-ui"
import { Loader2, Save, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useLang } from "@/lib/i18n"
import { api } from "@/lib/api"
import { useToast } from "@/lib/toast"

type EditablePatient = {
  id: string
  full_name: string
  phone_e164: string
  date_of_birth: string | null
  language: "en" | "es"
  notes: string | null
}

export function EditPatientDialog({
  open,
  onOpenChange,
  patient,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  patient: EditablePatient
}) {
  const { t } = useLang()
  const toast = useToast()
  const queryClient = useQueryClient()

  const [fullName, setFullName] = useState(patient.full_name)
  const [phone, setPhone] = useState(patient.phone_e164)
  const [dob, setDob] = useState(patient.date_of_birth ?? "")
  const [language, setLanguage] = useState<"en" | "es">(patient.language)
  const [notes, setNotes] = useState(patient.notes ?? "")

  useEffect(() => {
    if (open) {
      setFullName(patient.full_name)
      setPhone(patient.phone_e164)
      setDob(patient.date_of_birth ?? "")
      setLanguage(patient.language)
      setNotes(patient.notes ?? "")
    }
  }, [open, patient])

  const saveMutation = useMutation({
    mutationFn: () =>
      api.patch(`/patients/${patient.id}`, {
        fullName: fullName.trim(),
        phoneE164: phone.trim(),
        dateOfBirth: dob || null,
        language,
        notes: notes.trim() || null,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["patient", patient.id] })
      toast(t.editSaved)
      onOpenChange(false)
    },
    onError: () => toast("Failed to save — please try again"),
  })

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm" />
        <Dialog.Content className="fixed top-1/2 left-1/2 z-50 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-border bg-card p-5 shadow-2xl sm:p-6">
          <div className="mb-4 flex items-start justify-between">
            <div>
              <Dialog.Title className="font-heading text-lg leading-tight font-bold">{t.editPatientTitle}</Dialog.Title>
              <p className="text-xs text-muted-foreground">
                {t.editPatientSub} <span className="font-bold text-foreground">{patient.full_name}</span>
              </p>
            </div>
            <Dialog.Close className="flex size-8 shrink-0 items-center justify-center rounded-[9px] border border-border hover:bg-muted">
              <X className="size-4" strokeWidth={2} />
            </Dialog.Close>
          </div>

          <div className="flex flex-col gap-3.5">
            <label className="flex flex-col gap-1.5 text-xs font-bold">
              {t.editFullName}
              <input
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="rounded-lg border border-border bg-transparent px-2.5 py-2 text-sm font-normal outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              />
            </label>

            <label className="flex flex-col gap-1.5 text-xs font-bold">
              {t.editPhone}
              <input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+52 664 123 4567"
                className="rounded-lg border border-border bg-transparent px-2.5 py-2 text-sm font-normal outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              />
            </label>

            <div className="grid grid-cols-2 gap-3">
              <label className="flex flex-col gap-1.5 text-xs font-bold">
                {t.editDob}
                <input
                  type="date"
                  value={dob}
                  onChange={(e) => setDob(e.target.value)}
                  className="rounded-lg border border-border bg-transparent px-2.5 py-2 text-sm font-normal outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                />
              </label>

              <label className="flex flex-col gap-1.5 text-xs font-bold">
                {t.editLanguage}
                <select
                  value={language}
                  onChange={(e) => setLanguage(e.target.value as "en" | "es")}
                  className="rounded-lg border border-border bg-transparent px-2.5 py-2 text-sm font-normal outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                  <option value="en">English</option>
                  <option value="es">Español</option>
                </select>
              </label>
            </div>

            <label className="flex flex-col gap-1.5 text-xs font-bold">
              {t.editNotes}
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder={t.editNotesPh}
                rows={3}
                className="resize-none rounded-lg border border-border bg-transparent px-2.5 py-2 text-sm font-normal outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              />
            </label>
          </div>

          <div className="mt-5 flex justify-end gap-2.5">
            <Dialog.Close asChild>
              <Button variant="outline" className="rounded-lg font-bold">
                {t.consultCancel}
              </Button>
            </Dialog.Close>
            <Button
              onClick={() => saveMutation.mutate()}
              disabled={!fullName.trim() || !phone.trim() || saveMutation.isPending}
              className="gap-1.5 rounded-lg font-bold"
            >
              {saveMutation.isPending ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" strokeWidth={2} />}
              {saveMutation.isPending ? t.consultSaving : t.editSaveChanges}
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
