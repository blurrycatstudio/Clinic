import { useEffect, useState } from "react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { Dialog } from "radix-ui"
import { Stethoscope, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useLang } from "@/lib/i18n"
import { api } from "@/lib/api"
import { usePatientSearch } from "@/hooks/usePatientSearch"
import { useToast } from "@/lib/toast"
import type { Patient } from "@/lib/data"

export type ConsultationResult = {
  chiefComplaint: string
  diagnosis: string
  notes: string
  weightKg: string
  heightCm: string
  tempC: string
  addPrescription: boolean
}

export function StartConsultationDialog({
  open,
  onOpenChange,
  patient,
  onComplete,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  patient: Patient
  onComplete: (result: ConsultationResult) => void
}) {
  const { t } = useLang()
  const toast = useToast()
  const queryClient = useQueryClient()
  const [patientId, setPatientId] = useState("")
  const [chiefComplaint, setChiefComplaint] = useState("")
  const [diagnosis, setDiagnosis] = useState("")
  const [notes, setNotes] = useState("")
  const [weightKg, setWeightKg] = useState("")
  const [heightCm, setHeightCm] = useState("")
  const [tempC, setTempC] = useState("")
  const [addPrescription, setAddPrescription] = useState(false)

  const patients = usePatientSearch("")

  // Best-effort convenience: pre-select the backend record that matches the
  // demo patient shown on the card, but the doctor can always change it —
  // the dashboard's patient list and the real patient directory aren't the
  // same data source yet.
  useEffect(() => {
    if (!open || patientId || !patients.data) return
    const match = patients.data.rows.find((row) => row.full_name.toLowerCase() === patient.name.toLowerCase())
    if (match) setPatientId(match.id)
  }, [open, patientId, patients.data, patient.name])

  function reset() {
    setPatientId("")
    setChiefComplaint("")
    setDiagnosis("")
    setNotes("")
    setWeightKg("")
    setHeightCm("")
    setTempC("")
    setAddPrescription(false)
  }

  const canSave = patientId !== "" && chiefComplaint.trim() !== "" && diagnosis.trim() !== ""

  const createMutation = useMutation({
    mutationFn: () =>
      api.post("/consultations", {
        patientId,
        chiefComplaint: chiefComplaint.trim(),
        diagnosis: diagnosis.trim(),
        notes: notes.trim(),
        weightKg: weightKg.trim() || undefined,
        heightCm: heightCm.trim() || undefined,
        temperatureC: tempC.trim() || undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["consultations"] })
      onComplete({
        chiefComplaint: chiefComplaint.trim(),
        diagnosis: diagnosis.trim(),
        notes: notes.trim(),
        weightKg: weightKg.trim(),
        heightCm: heightCm.trim(),
        tempC: tempC.trim(),
        addPrescription,
      })
      reset()
    },
    onError: () => toast("Failed to save consultation — please try again"),
  })

  function handleSave() {
    if (!canSave || createMutation.isPending) return
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
        <Dialog.Content className="fixed top-1/2 left-1/2 z-50 max-h-[90vh] w-[calc(100%-2rem)] max-w-xl -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl border border-border bg-card p-5 shadow-2xl sm:p-6">
          <div className="mb-5 flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-r from-[#F97316] via-[#EC4899] to-[#8B5CF6] text-white shadow-sm">
                <Stethoscope className="size-5" strokeWidth={2} />
              </div>
              <div>
                <Dialog.Title className="font-heading text-xl leading-tight font-bold">{t.consultModalTitle}</Dialog.Title>
                <p className="text-xs text-muted-foreground">
                  {t.consultModalSub} <span className="font-bold text-foreground">{patient.name}</span>
                </p>
              </div>
            </div>
            <Dialog.Close className="flex size-8 shrink-0 items-center justify-center rounded-[9px] border border-border hover:bg-muted">
              <X className="size-4" strokeWidth={2} />
            </Dialog.Close>
          </div>

          <div className="flex flex-col gap-4.5">
            <div>
              <label className="mb-1.5 block text-xs font-bold">
                {t.rxModalPatient} <span className="text-destructive">*</span>
              </label>
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
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-bold">
                {t.consultChiefComplaint} <span className="text-destructive">*</span>
              </label>
              <Input
                value={chiefComplaint}
                onChange={(e) => setChiefComplaint(e.target.value)}
                placeholder={t.consultChiefComplaintPh}
                className="h-9"
                autoFocus
              />
            </div>

            <div>
              <label className="mb-2 block text-xs font-bold">{t.consultVitalsTitle}</label>
              <div className="grid grid-cols-3 gap-2.5">
                <div>
                  <label className="mb-1 block text-[10.5px] font-bold text-muted-foreground">{t.consultWeightKg}</label>
                  <Input
                    inputMode="decimal"
                    value={weightKg}
                    onChange={(e) => setWeightKg(e.target.value)}
                    placeholder="17.2"
                    className="h-8.5 text-[13px]"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-[10.5px] font-bold text-muted-foreground">{t.consultHeightCm}</label>
                  <Input
                    inputMode="decimal"
                    value={heightCm}
                    onChange={(e) => setHeightCm(e.target.value)}
                    placeholder="104"
                    className="h-8.5 text-[13px]"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-[10.5px] font-bold text-muted-foreground">{t.consultTempC}</label>
                  <Input
                    inputMode="decimal"
                    value={tempC}
                    onChange={(e) => setTempC(e.target.value)}
                    placeholder="36.8"
                    className="h-8.5 text-[13px]"
                  />
                </div>
              </div>
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-bold">
                {t.consultDiagnosis} <span className="text-destructive">*</span>
              </label>
              <Input value={diagnosis} onChange={(e) => setDiagnosis(e.target.value)} placeholder={t.consultDiagnosisPh} className="h-9" />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-bold">{t.consultNotes}</label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder={t.consultNotesPh}
                rows={3}
                className="w-full resize-none rounded-lg border border-border bg-transparent px-2.5 py-2 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              />
            </div>

            <label className="flex cursor-pointer items-center gap-2.5 rounded-xl border border-border bg-accent/25 px-3.5 py-2.5 text-[13px] font-semibold">
              <input
                type="checkbox"
                checked={addPrescription}
                onChange={(e) => setAddPrescription(e.target.checked)}
                className="size-4 cursor-pointer accent-primary"
              />
              {t.consultAddRx}
            </label>

            {!canSave && (patientId || chiefComplaint || diagnosis) && (
              <p className="text-[11.5px] text-muted-foreground">{t.consultRequiredHint}</p>
            )}
          </div>

          <div className="mt-6 flex justify-end gap-2.5">
            <Dialog.Close asChild>
              <Button variant="outline" className="rounded-lg font-bold">
                {t.consultCancel}
              </Button>
            </Dialog.Close>
            <Button
              onClick={handleSave}
              disabled={!canSave || createMutation.isPending}
              className="gap-1.5 rounded-lg bg-gradient-to-r from-[#F97316] via-[#EC4899] to-[#8B5CF6] font-bold text-white hover:opacity-90"
            >
              <Stethoscope className="size-4" strokeWidth={2} />
              {createMutation.isPending ? t.consultSaving : t.consultSave}
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
