import { useEffect, useMemo, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useNavigate, useParams } from "react-router-dom"
import { MessageCircle, Plus, Save, TriangleAlert, Trash2 } from "lucide-react"
import { MobileShell } from "@/components/mobile/MobileShell"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { useLang } from "@/lib/i18n"
import { api } from "@/lib/api"
import { COMMON_MEDICATIONS, type Medication } from "@/lib/data"
import { toDisplayAppointment, type ApiAppointment } from "@/lib/appointments"
import { useToast } from "@/lib/toast"
import { cn } from "@/lib/utils"

function medicationsMatching(query: string): string[] {
  const q = query.trim().toLowerCase()
  if (!q) return COMMON_MEDICATIONS
  return COMMON_MEDICATIONS.filter((m) => m.toLowerCase().includes(q))
}

type ApiPatient = {
  id: string
  full_name: string
  phone_e164: string
  language: "en" | "es"
  date_of_birth: string | null
  notes: string | null
  allergies: string[]
  current_medications: string[]
}

const ROUTES = ["Oral", "Topical", "Inhaled", "Intramuscular", "Ophthalmic", "Otic"]
const emptyMed = (): Medication => ({ name: "", dose: "", frequency: "", duration: "", route: "Oral" })

function ageFromDob(dob: string | null): string | null {
  if (!dob) return null
  const birth = new Date(dob)
  if (Number.isNaN(birth.getTime())) return null
  const now = new Date()
  let years = now.getFullYear() - birth.getFullYear()
  let months = now.getMonth() - birth.getMonth()
  if (months < 0) {
    years -= 1
    months += 12
  }
  return years > 0 ? `${years}y ${months}m` : `${months}m`
}

export default function MobileConsultation() {
  const { t } = useLang()
  const toast = useToast()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { appointmentId } = useParams<{ appointmentId: string }>()

  const appointmentsQuery = useQuery({
    queryKey: ["appointments", "mobile-consult-lookup"],
    queryFn: () => api.get<{ rows: ApiAppointment[]; count: number }>("/appointments?limit=200"),
  })

  const appointment = useMemo(() => {
    const row = appointmentsQuery.data?.rows.find((a) => a.id === appointmentId)
    return row ? toDisplayAppointment(row) : null
  }, [appointmentsQuery.data, appointmentId])

  const patientQuery = useQuery({
    queryKey: ["patient", appointment?.patientId],
    queryFn: () => api.get<{ patient: ApiPatient; upcomingAppointments: unknown[] }>(`/patients/${appointment?.patientId}`),
    enabled: !!appointment?.patientId,
  })
  const patient = patientQuery.data?.patient

  const [chiefComplaint, setChiefComplaint] = useState("")
  const [diagnosis, setDiagnosis] = useState("")
  const [notes, setNotes] = useState("")
  const [weightKg, setWeightKg] = useState("")
  const [heightCm, setHeightCm] = useState("")
  const [tempC, setTempC] = useState("")
  const [meds, setMeds] = useState<Medication[]>([emptyMed()])
  const [draftSaved, setDraftSaved] = useState(false)
  const [attempted, setAttempted] = useState(false)
  const [medDropdownOpen, setMedDropdownOpen] = useState<number | null>(null)

  // Prefill the chief complaint from the appointment's booked reason, once.
  const [prefilled, setPrefilled] = useState(false)
  useEffect(() => {
    if (prefilled || !appointment) return
    setPrefilled(true)
    setChiefComplaint(appointment.reason || "")
  }, [prefilled, appointment])

  function updateMed(i: number, patch: Partial<Medication>) {
    setMeds((prev) => prev.map((m, idx) => (idx === i ? { ...m, ...patch } : m)))
  }
  function removeMed(i: number) {
    setMeds((prev) => (prev.length > 1 ? prev.filter((_, idx) => idx !== i) : prev))
  }

  const canSaveConsult = chiefComplaint.trim() !== "" && diagnosis.trim() !== "" && !!patient
  const filledMeds = meds.filter((m) => m.name.trim())
  const canSend = canSaveConsult && filledMeds.length > 0

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ["consultations"] })
    queryClient.invalidateQueries({ queryKey: ["prescriptions"] })
  }

  async function saveConsultation() {
    if (!patient) return
    await api.post("/consultations", {
      patientId: patient.id,
      appointmentId,
      chiefComplaint: chiefComplaint.trim(),
      diagnosis: diagnosis.trim(),
      notes: notes.trim(),
      weightKg: weightKg.trim() || undefined,
      heightCm: heightCm.trim() || undefined,
      temperatureC: tempC.trim() || undefined,
    })
  }

  const draftMutation = useMutation({
    mutationFn: saveConsultation,
    onSuccess: () => {
      invalidate()
      setDraftSaved(true)
      toast(t.mobileConsultSaved)
    },
    onError: () => toast(t.mobileConsultSaveFailed),
  })

  const completeMutation = useMutation({
    mutationFn: async () => {
      if (!patient) throw new Error("Missing patient")
      if (!draftSaved) await saveConsultation()
      const rxRes = await api.post<{ prescription: { id: string } }>("/prescriptions", {
        patientId: patient.id,
        appointmentId,
        diagnosis: diagnosis.trim(),
        notes: notes.trim(),
        items: filledMeds.map((m) => ({ name: m.name, dose: m.dose, frequency: m.frequency, duration: m.duration, route: m.route })),
      })
      await api.post(`/prescriptions/${rxRes.prescription.id}/send`)
    },
    onSuccess: () => {
      invalidate()
      toast(t.mobileConsultSentSuccess)
      navigate("/mobile/schedule")
    },
    onError: () => toast(t.mobileConsultSendFailed),
  })

  const loading = appointmentsQuery.isLoading || (!!appointment && patientQuery.isLoading)

  if (loading) {
    return (
      <MobileShell title={t.mobileConsultTitle} onBack={() => navigate(-1)}>
        <div className="flex flex-col gap-3 px-4 py-4">
          <div className="h-24 animate-pulse rounded-2xl bg-muted" />
          <div className="h-40 animate-pulse rounded-2xl bg-muted" />
        </div>
      </MobileShell>
    )
  }

  if (!appointment || !patient) {
    return (
      <MobileShell title={t.mobileConsultTitle} onBack={() => navigate(-1)}>
        <div className="px-4 py-16 text-center text-[13px] text-muted-foreground">{t.mobileConsultNotFound}</div>
      </MobileShell>
    )
  }

  const age = ageFromDob(patient.date_of_birth)

  return (
    <MobileShell title={t.mobileConsultTitle} onBack={() => navigate(-1)}>
      <div className="flex flex-col gap-4 px-4 py-4">
        <Card className="gap-0 rounded-2xl border p-4 shadow-none">
          <div className="flex items-center gap-3">
            <Avatar className="size-12 shrink-0">
              <AvatarFallback style={{ background: appointment.color }} className="text-[13px] font-bold text-white">
                {appointment.initials}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[15px] font-bold">{patient.full_name}</div>
              <div className="truncate text-[11.5px] text-muted-foreground">
                {age ? `${age} · ` : ""}
                {patient.phone_e164}
              </div>
            </div>
          </div>

          <div className="mt-3.5 rounded-xl px-3 py-2.5 text-[12.5px] font-semibold" style={patient.allergies.length ? { background: "#FEF2F2", color: "#DC2626" } : { background: "#DCFCE7", color: "#16A34A" }}>
            <div className="mb-0.5 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide">
              <TriangleAlert className="size-3.5" strokeWidth={2.2} />
              {t.mobileConsultAllergyAlert}
            </div>
            {patient.allergies.length ? patient.allergies.join(", ") : t.noKnownAllergies}
          </div>

          <div className="mt-3">
            <div className="mb-1 text-[11px] font-bold text-muted-foreground uppercase">{t.mobileConsultCurrentMeds}</div>
            <div className="text-[12.5px]">{patient.current_medications.length ? patient.current_medications.join(", ") : t.mobileConsultNoMeds}</div>
          </div>
        </Card>

        <div>
          <label className="mb-1.5 block text-xs font-bold">
            {t.consultChiefComplaint} <span className="text-destructive">*</span>
          </label>
          <Input
            value={chiefComplaint}
            onChange={(e) => setChiefComplaint(e.target.value)}
            placeholder={t.consultChiefComplaintPh}
            aria-invalid={attempted && chiefComplaint.trim() === ""}
            className={cn("h-10", attempted && chiefComplaint.trim() === "" && "border-destructive")}
          />
        </div>

        <div>
          <label className="mb-2 block text-xs font-bold">{t.mobileConsultVitals}</label>
          <div className="grid grid-cols-3 gap-2.5">
            <div>
              <label className="mb-1 block text-[10.5px] font-bold text-muted-foreground">{t.mobileConsultWeight}</label>
              <Input inputMode="decimal" value={weightKg} onChange={(e) => setWeightKg(e.target.value)} placeholder="17.2" className="h-9 text-[13px]" />
            </div>
            <div>
              <label className="mb-1 block text-[10.5px] font-bold text-muted-foreground">{t.mobileConsultHeight}</label>
              <Input inputMode="decimal" value={heightCm} onChange={(e) => setHeightCm(e.target.value)} placeholder="104" className="h-9 text-[13px]" />
            </div>
            <div>
              <label className="mb-1 block text-[10.5px] font-bold text-muted-foreground">{t.mobileConsultTemp}</label>
              <Input inputMode="decimal" value={tempC} onChange={(e) => setTempC(e.target.value)} placeholder="36.8" className="h-9 text-[13px]" />
            </div>
          </div>
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-bold">
            {t.consultDiagnosis} <span className="text-destructive">*</span>
          </label>
          <Input
            value={diagnosis}
            onChange={(e) => setDiagnosis(e.target.value)}
            placeholder={t.consultDiagnosisPh}
            aria-invalid={attempted && diagnosis.trim() === ""}
            className={cn("h-10", attempted && diagnosis.trim() === "" && "border-destructive")}
          />
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

        <div>
          <div className="mb-2 flex items-center justify-between">
            <label className="text-xs font-bold">
              {t.mobileConsultDiagnosisRx} <span className="text-destructive">*</span>
            </label>
            <button type="button" onClick={() => setMeds((prev) => [...prev, emptyMed()])} className="flex items-center gap-1 text-xs font-bold text-primary">
              <Plus className="size-3.5" strokeWidth={2.4} />
              {t.mobileConsultAddMed}
            </button>
          </div>
          <div className="flex flex-col gap-3">
            {meds.map((med, i) => {
              const medInvalid = attempted && filledMeds.length === 0 && !med.name.trim()
              const matches = medicationsMatching(med.name)
              return (
                <div key={i} className="rounded-xl border border-border p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-[11px] font-bold text-muted-foreground">
                      {t.rxModalMedName} {i + 1}
                    </span>
                    {meds.length > 1 ? (
                      <button type="button" onClick={() => removeMed(i)} className="flex items-center gap-1 text-[11px] font-bold text-destructive">
                        <Trash2 className="size-3" strokeWidth={2.2} />
                        {t.rxModalRemoveMed}
                      </button>
                    ) : null}
                  </div>
                  <div className="relative mb-2.5">
                    <Input
                      value={med.name}
                      onChange={(e) => {
                        updateMed(i, { name: e.target.value })
                        setMedDropdownOpen(i)
                      }}
                      onFocus={() => setMedDropdownOpen(i)}
                      placeholder={t.rxModalMedNamePh}
                      autoComplete="off"
                      aria-invalid={medInvalid}
                      className={cn("h-9", medInvalid && "border-destructive")}
                    />
                    {medDropdownOpen === i && (
                      <>
                        <div className="fixed inset-0 z-30" onClick={() => setMedDropdownOpen(null)} />
                        <div className="absolute inset-x-0 top-full z-40 mt-1 max-h-48 overflow-y-auto rounded-xl border border-border bg-white shadow-lg">
                          {matches.length === 0 ? (
                            <div className="px-3 py-2.5 text-[12.5px] text-muted-foreground">{t.mobileConsultNoMedMatch}</div>
                          ) : (
                            matches.map((m) => (
                              <button
                                key={m}
                                type="button"
                                onClick={() => {
                                  updateMed(i, { name: m })
                                  setMedDropdownOpen(null)
                                }}
                                className="block w-full truncate px-3 py-2.5 text-left text-[12.5px] hover:bg-muted"
                              >
                                {m}
                              </button>
                            ))
                          )}
                        </div>
                      </>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-2.5">
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
              )
            })}
          </div>
        </div>

        {attempted && (chiefComplaint.trim() === "" || diagnosis.trim() === "") && (
          <p className="text-[11.5px] font-semibold text-destructive">{t.mobileConsultRequiredHint}</p>
        )}
        {attempted && chiefComplaint.trim() !== "" && diagnosis.trim() !== "" && filledMeds.length === 0 && (
          <p className="text-[11.5px] font-semibold text-destructive">{t.mobileConsultMedRequiredHint}</p>
        )}

        <div className="flex gap-2.5 pb-2">
          <Button
            onClick={() => {
              if (!canSaveConsult) {
                setAttempted(true)
                return
              }
              draftMutation.mutate()
            }}
            disabled={draftMutation.isPending}
            variant="outline"
            className="flex-1 gap-1.5 rounded-xl font-bold"
          >
            <Save className="size-4" strokeWidth={2.2} />
            {draftMutation.isPending ? t.mobileConsultSaving : t.mobileConsultSaveDraft}
          </Button>
          <Button
            onClick={() => {
              if (!canSend) {
                setAttempted(true)
                return
              }
              completeMutation.mutate()
            }}
            disabled={completeMutation.isPending}
            className="flex-1 gap-1.5 rounded-xl bg-gradient-to-r from-[#2563EB] to-[#16A34A] font-bold text-white hover:opacity-90"
          >
            <MessageCircle className="size-4" strokeWidth={2.2} />
            {completeMutation.isPending ? t.mobileConsultSending : t.mobileConsultCompleteSend}
          </Button>
        </div>
      </div>
    </MobileShell>
  )
}
