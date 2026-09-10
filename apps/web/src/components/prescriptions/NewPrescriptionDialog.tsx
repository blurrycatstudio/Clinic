import { useEffect, useState } from "react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { Dialog } from "radix-ui"
import { Plus, Trash2, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useLang } from "@/lib/i18n"
import { COMMON_MEDICATIONS, type Medication } from "@/lib/data"
import { api } from "@/lib/api"
import { usePatientSearch } from "@/hooks/usePatientSearch"
import { useToast } from "@/lib/toast"

const ROUTES = ["Oral", "Topical", "Inhaled", "Intramuscular", "Ophthalmic", "Otic"]

const emptyMed = (): Medication => ({ name: "", dose: "", frequency: "", duration: "", route: "Oral" })

export function NewPrescriptionDialog({
  open,
  onOpenChange,
  onCreated,
  initialPatientId,
  initialDiagnosis,
  lockPatient,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated: () => void
  /** Pre-selects the patient when opened from a specific patient's chart. */
  initialPatientId?: string
  initialDiagnosis?: string
  /** Hides the patient picker when the patient is already known (e.g. from a patient's chart). */
  lockPatient?: boolean
}) {
  const { t } = useLang()
  const toast = useToast()
  const queryClient = useQueryClient()
  const [patientId, setPatientId] = useState(initialPatientId ?? "")
  const [diagnosis, setDiagnosis] = useState(initialDiagnosis ?? "")
  const [notes, setNotes] = useState("")
  const [meds, setMeds] = useState<Medication[]>([emptyMed()])

  const patients = usePatientSearch("")
  const lockedPatientName = patients.data?.rows.find((p) => p.id === initialPatientId)?.full_name

  useEffect(() => {
    if (open) {
      setPatientId(initialPatientId ?? "")
      setDiagnosis(initialDiagnosis ?? "")
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialPatientId, initialDiagnosis])

  function reset() {
    setPatientId(initialPatientId ?? "")
    setDiagnosis(initialDiagnosis ?? "")
    setNotes("")
    setMeds([emptyMed()])
  }

  function updateMed(i: number, patch: Partial<Medication>) {
    setMeds((prev) => prev.map((m, idx) => (idx === i ? { ...m, ...patch } : m)))
  }

  function removeMed(i: number) {
    setMeds((prev) => (prev.length > 1 ? prev.filter((_, idx) => idx !== i) : prev))
  }

  const canSave = patientId !== "" && diagnosis.trim() !== "" && meds.every((m) => m.name.trim() && m.dose.trim() && m.frequency.trim() && m.duration.trim())

  const createMutation = useMutation({
    mutationFn: () =>
      api.post("/prescriptions", {
        patientId,
        diagnosis: diagnosis.trim(),
        notes: notes.trim(),
        items: meds.map((m) => ({ name: m.name, dose: m.dose, frequency: m.frequency, duration: m.duration, route: m.route })),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["prescriptions"] })
      onCreated()
      reset()
      onOpenChange(false)
      toast("Prescription created")
    },
    onError: () => toast("Failed to create prescription"),
  })

  function handleSave() {
    if (!canSave) return
    createMutation.mutate()
  }

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(v) => {
        onOpenChange(v)
        if (!v) reset()
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm" />
        <Dialog.Content className="fixed top-1/2 left-1/2 z-50 max-h-[90vh] w-[calc(100%-2rem)] max-w-2xl -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl border border-border bg-card p-5 shadow-2xl sm:p-6">
          <div className="mb-5 flex items-center justify-between">
            <Dialog.Title className="font-heading text-xl font-bold">{t.rxModalTitle}</Dialog.Title>
            <Dialog.Close className="flex size-8 items-center justify-center rounded-[9px] border border-border hover:bg-muted">
              <X className="size-4" strokeWidth={2} />
            </Dialog.Close>
          </div>

          <div className="flex flex-col gap-4.5">
            <div>
              <label className="mb-1.5 block text-xs font-bold">{t.rxModalPatient}</label>
              {lockPatient && patientId ? (
                <div className="flex h-9 items-center rounded-lg border border-border bg-muted/50 px-2.5 text-sm font-semibold">
                  {lockedPatientName ?? "Selected patient"}
                </div>
              ) : (
                <select
                  value={patientId}
                  onChange={(e) => setPatientId(e.target.value)}
                  className="h-9 w-full rounded-lg border border-border bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                  <option value="">{t.rxModalSelectPatient}</option>
                  {(patients.data?.rows ?? []).map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.full_name} · {p.phone_e164}
                    </option>
                  ))}
                </select>
              )}
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-bold">{t.rxModalDiagnosis}</label>
              <Input value={diagnosis} onChange={(e) => setDiagnosis(e.target.value)} placeholder={t.rxModalDiagnosisPh} className="h-9" />
            </div>

            <div>
              <div className="mb-2 flex items-center justify-between">
                <label className="text-xs font-bold">{t.rxModalMedications}</label>
                <button
                  type="button"
                  onClick={() => setMeds((prev) => [...prev, emptyMed()])}
                  className="flex items-center gap-1 text-xs font-bold text-primary"
                >
                  <Plus className="size-3.5" strokeWidth={2.4} />
                  {t.rxModalAddMed}
                </button>
              </div>

              <div className="flex flex-col gap-3">
                {meds.map((med, i) => (
                  <div key={i} className="rounded-xl border border-border p-3.5">
                    <div className="mb-2.5 flex items-center justify-between">
                      <span className="text-[11px] font-bold text-muted-foreground">
                        {t.rxModalMedName} {i + 1}
                      </span>
                      {meds.length > 1 ? (
                        <button
                          type="button"
                          onClick={() => removeMed(i)}
                          className="flex items-center gap-1 text-[11px] font-bold text-destructive"
                        >
                          <Trash2 className="size-3" strokeWidth={2.2} />
                          {t.rxModalRemoveMed}
                        </button>
                      ) : null}
                    </div>

                    <div className="mb-2.5">
                      <Input
                        list="medication-suggestions"
                        value={med.name}
                        onChange={(e) => updateMed(i, { name: e.target.value })}
                        placeholder={t.rxModalMedNamePh}
                        className="h-9"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                      <div>
                        <label className="mb-1 block text-[10.5px] font-bold text-muted-foreground">{t.rxModalDose}</label>
                        <Input value={med.dose} onChange={(e) => updateMed(i, { dose: e.target.value })} placeholder={t.rxModalDosePh} className="h-8.5 text-[13px]" />
                      </div>
                      <div>
                        <label className="mb-1 block text-[10.5px] font-bold text-muted-foreground">{t.rxModalFreq}</label>
                        <Input value={med.frequency} onChange={(e) => updateMed(i, { frequency: e.target.value })} placeholder={t.rxModalFreqPh} className="h-8.5 text-[13px]" />
                      </div>
                      <div>
                        <label className="mb-1 block text-[10.5px] font-bold text-muted-foreground">{t.rxModalDuration}</label>
                        <Input value={med.duration} onChange={(e) => updateMed(i, { duration: e.target.value })} placeholder={t.rxModalDurationPh} className="h-8.5 text-[13px]" />
                      </div>
                      <div>
                        <label className="mb-1 block text-[10.5px] font-bold text-muted-foreground">{t.rxModalRoute}</label>
                        <select
                          value={med.route}
                          onChange={(e) => updateMed(i, { route: e.target.value })}
                          className="h-8.5 w-full rounded-lg border border-border bg-transparent px-2 text-[13px] outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                        >
                          {ROUTES.map((r) => (
                            <option key={r} value={r}>
                              {r}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <datalist id="medication-suggestions">
                {COMMON_MEDICATIONS.map((m) => (
                  <option key={m} value={m} />
                ))}
              </datalist>
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-bold">{t.rxModalNotes}</label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder={t.rxModalNotesPh}
                rows={3}
                className="w-full resize-none rounded-lg border border-border bg-transparent px-2.5 py-2 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              />
            </div>
          </div>

          <div className="mt-6 flex justify-end gap-2.5">
            <Dialog.Close asChild>
              <Button variant="outline" className="rounded-lg font-bold">
                {t.rxModalCancel}
              </Button>
            </Dialog.Close>
            <Button onClick={handleSave} disabled={!canSave || createMutation.isPending} className="rounded-lg font-bold">
              {t.rxModalSave}
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
