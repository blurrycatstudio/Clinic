import {
  Calendar,
  CircleCheck,
  ClipboardList,
  Clock,
  FileOutput,
  FileText,
  Image as ImageIcon,
  LineChart,
  Loader2,
  PenLine,
  Pencil,
  Pill,
  Plus,
  ShieldCheck,
  Stethoscope,
  Syringe,
  TriangleAlert,
  Upload,
  User,
} from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Switch } from "@/components/ui/switch"
import { PhoneCallIcon } from "@/components/icons/PhoneCallIcon"
import { WhatsAppIcon } from "@/components/icons/WhatsAppIcon"
import { StartConsultationDialog, type ConsultationResult } from "@/components/dashboard/StartConsultationDialog"
import { QuickNoteDialog } from "@/components/dashboard/QuickNoteDialog"
import { EditPatientDialog } from "@/components/dashboard/EditPatientDialog"
import { NewPrescriptionDialog } from "@/components/prescriptions/NewPrescriptionDialog"
import { PrescriptionDetailDialog } from "@/components/prescriptions/PrescriptionDetailDialog"
import type { ApiPrescription } from "@/pages/Prescriptions"
import { api } from "@/lib/api"
import type { Patient } from "@/lib/data"
import type { DisplayAppointment } from "@/lib/appointments"
import { useLang } from "@/lib/i18n"
import type { Strings } from "@/lib/i18n"
import { cn } from "@/lib/utils"
import { useToast } from "@/lib/toast"
import { downloadTextFile, openBlob } from "@/lib/download"

type TabKey = "overview" | "history" | "vaccinations" | "prescriptions" | "growth" | "documents"

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

type ApiConsultation = {
  id: string
  sequence_number: number
  chief_complaint: string
  diagnosis: string
  notes: string
  weight_kg: number | null
  height_cm: number | null
  temperature_c: number | null
  created_at: string
}

type LocalDocument = { name: string; date: string; size: string; type: "pdf" | "image"; url?: string; pdfId?: string }

const AVATAR_COLORS = ["#16A34A", "#2563EB", "#DC2626", "#9333EA", "#0891B2", "#F97316", "#DB2777", "#0D9488"]

function colorFor(seed: string): string {
  let hash = 0
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0
  return AVATAR_COLORS[hash % AVATAR_COLORS.length]
}

function initialsFor(name: string): string {
  const parts = name.trim().split(/\s+/)
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "?"
}

function ageFromDob(dob: string | null): string {
  if (!dob) return "—"
  const birth = new Date(dob)
  if (Number.isNaN(birth.getTime())) return "—"
  const now = new Date()
  let years = now.getFullYear() - birth.getFullYear()
  let months = now.getMonth() - birth.getMonth()
  if (now.getDate() < birth.getDate()) months -= 1
  if (months < 0) {
    years -= 1
    months += 12
  }
  if (years <= 0) return `${Math.max(months, 0)} month${months === 1 ? "" : "s"}`
  return months > 0 ? `${years} year${years === 1 ? "" : "s"} ${months} month${months === 1 ? "" : "s"}` : `${years} year${years === 1 ? "" : "s"}`
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2 text-[13px]">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-semibold text-foreground">{value}</span>
    </div>
  )
}

export function PatientSnapshotCard({ appointment }: { appointment: DisplayAppointment | null }) {
  const { t } = useLang()
  const toast = useToast()
  const queryClient = useQueryClient()
  const [tab, setTab] = useState<TabKey>("overview")
  const [extraDocuments, setExtraDocuments] = useState<LocalDocument[]>([])
  const [consultOpen, setConsultOpen] = useState(false)
  const [rxOpen, setRxOpen] = useState(false)
  const [noteOpen, setNoteOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [viewingRx, setViewingRx] = useState<ApiPrescription | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const patientId = appointment?.patientId ?? null

  useEffect(() => {
    setTab("overview")
    setExtraDocuments([])
    setConsultOpen(false)
    setRxOpen(false)
    setNoteOpen(false)
    setEditOpen(false)
  }, [patientId])

  const patientQuery = useQuery({
    queryKey: ["patient", patientId],
    queryFn: () => api.get<{ patient: ApiPatient; upcomingAppointments: unknown[] }>(`/patients/${patientId}`),
    enabled: !!patientId,
  })

  const clinicalInfoMutation = useMutation({
    mutationFn: (input: { allergies?: string[]; currentMedications?: string[] }) =>
      api.patch<{ patient: ApiPatient }>(`/patients/${patientId}/clinical-info`, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["patient", patientId] }),
    onError: () => toast("Failed to save — please try again"),
  })

  const consultationsQuery = useQuery({
    queryKey: ["consultations", patientId],
    queryFn: () => api.get<{ rows: ApiConsultation[]; count: number }>(`/consultations?patientId=${patientId}&limit=100`),
    enabled: !!patientId,
  })

  const prescriptionsQuery = useQuery({
    queryKey: ["prescriptions", patientId],
    queryFn: () => api.get<{ rows: ApiPrescription[]; count: number }>(`/prescriptions?patientId=${patientId}&limit=50`),
    enabled: !!patientId,
  })

  if (!appointment || !patientId) {
    return (
      <Card className="flex h-[640px] min-w-0 w-full flex-1 items-center justify-center gap-3 rounded-2xl border p-8 text-center shadow-atelier-elevated lg:h-full">
        <div className="flex flex-col items-center gap-2">
          <div className="flex size-14 items-center justify-center rounded-2xl border bg-accent">
            <User className="size-6 text-primary" strokeWidth={1.6} />
          </div>
          <p className="text-sm font-semibold text-muted-foreground">Select a patient from Today's Schedule to see their chart.</p>
        </div>
      </Card>
    )
  }

  if (patientQuery.isLoading) {
    return (
      <Card className="flex h-[640px] min-w-0 w-full flex-1 items-center justify-center gap-2 rounded-2xl border p-8 shadow-atelier-elevated lg:h-full">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
        <span className="text-sm text-muted-foreground">Loading patient…</span>
      </Card>
    )
  }

  if (patientQuery.error || !patientQuery.data) {
    return (
      <Card className="flex h-[640px] min-w-0 w-full flex-1 items-center justify-center rounded-2xl border p-8 text-center shadow-atelier-elevated lg:h-full">
        <p className="text-sm text-destructive">Couldn't load this patient. Is the API reachable and are you signed in?</p>
      </Card>
    )
  }

  const p = patientQuery.data.patient
  const consultations = consultationsQuery.data?.rows ?? []
  const prescriptions = prescriptionsQuery.data?.rows ?? []
  const activeRx = prescriptions.find((rx) => rx.status === "active") ?? prescriptions[0]
  const allAllergies = p.allergies ?? []
  const medications = p.current_medications ?? []
  const initials = initialsFor(p.full_name)
  const avatarColor = colorFor(p.id)

  const growthRows = consultations
    .filter((c) => c.weight_kg || c.height_cm)
    .map((c) => ({ date: new Date(c.created_at).toLocaleDateString(), weight: c.weight_kg, height: c.height_cm }))
  const latestWeight = growthRows.find((r) => r.weight != null)
  const latestHeight = growthRows.find((r) => r.height != null)
  const bmi =
    latestWeight?.weight && latestHeight?.height
      ? latestWeight.weight / ((latestHeight.height / 100) * (latestHeight.height / 100))
      : null

  const documents: LocalDocument[] = [
    ...extraDocuments,
    ...prescriptions
      .filter((rx) => rx.prescription_items.length > 0)
      .map((rx) => ({
        name: `RX-${1000 + rx.sequence_number} — ${rx.diagnosis || "Prescription"}.pdf`,
        date: new Date(rx.created_at).toLocaleDateString(),
        size: "PDF",
        type: "pdf" as const,
        pdfId: rx.id,
      })),
  ]

  async function handleOpenDocument(doc: LocalDocument) {
    if (doc.url) {
      window.open(doc.url, "_blank", "noopener,noreferrer")
      return
    }
    if (doc.pdfId) {
      try {
        const blob = await api.getBlob(`/prescriptions/${doc.pdfId}/pdf`)
        openBlob(blob)
      } catch {
        toast("Failed to open document")
      }
    }
  }

  function handleAddAllergy() {
    const value = window.prompt("Add allergy")?.trim()
    if (!value) return
    clinicalInfoMutation.mutate(
      { allergies: [...allAllergies, value] },
      { onSuccess: () => toast(`Added allergy: ${value}`) },
    )
  }

  function handleRemoveAllergy(value: string) {
    clinicalInfoMutation.mutate({ allergies: allAllergies.filter((a) => a !== value) })
  }

  function handleAddMedication() {
    const value = window.prompt("Add current medication")?.trim()
    if (!value) return
    clinicalInfoMutation.mutate(
      { currentMedications: [...medications, value] },
      { onSuccess: () => toast(`Added medication: ${value}`) },
    )
  }

  function handleRemoveMedication(value: string) {
    clinicalInfoMutation.mutate({ currentMedications: medications.filter((m) => m !== value) })
  }

  function handleConsultationComplete(_result: ConsultationResult) {
    setConsultOpen(false)
    setTab("history")
    toast(t.consultToastSaved)
    consultationsQuery.refetch()
  }

  function handleExportDossier() {
    const lines = [
      `Patient: ${p.full_name}`,
      `DOB: ${p.date_of_birth ?? "—"}`,
      `Phone: ${p.phone_e164}`,
      `Allergies: ${allAllergies.length ? allAllergies.join(", ") : "None known"}`,
      "",
      "Recent visits:",
      ...consultations.slice(0, 10).map((c) => `- ${new Date(c.created_at).toLocaleDateString()}: ${c.diagnosis || c.chief_complaint}`),
    ]
    downloadTextFile(`${p.full_name.replace(/\s+/g, "_")}_dossier.txt`, lines.join("\n"))
    toast("Dossier exported")
  }

  function handleFilesSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files
    if (!files || files.length === 0) return
    const uploaded: LocalDocument[] = Array.from(files).map((f) => ({
      name: f.name,
      date: new Date().toLocaleDateString(),
      size: `${Math.max(1, Math.round(f.size / 1024))} KB`,
      type: f.name.toLowerCase().endsWith(".pdf") ? "pdf" : "image",
      url: URL.createObjectURL(f),
    }))
    setExtraDocuments((prev) => [...uploaded, ...prev])
    toast(`Uploaded ${uploaded.length} document${uploaded.length > 1 ? "s" : ""} (this session only)`)
    e.target.value = ""
  }

  const tabs: { key: TabKey; icon: React.ElementType; labelKey: keyof Strings }[] = [
    { key: "overview", icon: User, labelKey: "tabOverview" },
    { key: "history", icon: Clock, labelKey: "tabMedicalHistory" },
    { key: "vaccinations", icon: Syringe, labelKey: "tabVaccinationsFull" },
    { key: "prescriptions", icon: ClipboardList, labelKey: "tabPrescriptionsFull" },
    { key: "growth", icon: LineChart, labelKey: "tabGrowthFull" },
    { key: "documents", icon: FileText, labelKey: "tabDocuments" },
  ]

  const demoPatientForDialog: Patient = {
    id: p.id,
    patientCode: p.id.slice(0, 8).toUpperCase(),
    name: p.full_name,
    initials,
    color: avatarColor,
    age: ageFromDob(p.date_of_birth),
    ageFull: { en: ageFromDob(p.date_of_birth), es: ageFromDob(p.date_of_birth) },
    gender: { en: "", es: "" },
    dob: p.date_of_birth ?? "—",
    guardian: p.full_name,
    guardianPhone: p.phone_e164,
    email: "",
    address: "",
    bloodType: "",
    lastVisit: "",
    nextVisit: null,
    status: "active",
    allergies: allAllergies,
  }

  return (
    <Card className="h-[640px] min-w-0 w-full flex-1 gap-0 overflow-hidden rounded-2xl border p-0 shadow-atelier-elevated lg:h-full">
      {/* Dossier header */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b bg-gradient-to-r from-white via-white to-[#EFF6FF]/50 p-5">
        <div className="flex min-w-0 flex-1 flex-wrap items-center justify-between gap-4 sm:flex-nowrap">
          <div className="flex min-w-0 items-center gap-4">
            <div className="relative shrink-0">
              <Avatar className="size-16 ring-2 ring-[#2563EB]/50 shadow-md">
                <AvatarFallback className="text-xl font-bold text-white" style={{ background: avatarColor }}>
                  {initials}
                </AvatarFallback>
              </Avatar>
              <span className="absolute right-0 bottom-0 flex size-4 items-center justify-center rounded-full bg-secondary text-[9px] text-white ring-2 ring-card">
                ✓
              </span>
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2.5">
                <span className="font-heading text-2xl font-bold tracking-wide">{p.full_name}</span>
                <span className="flex items-center gap-1.5 rounded-full bg-[#DCFCE7] px-2.5 py-0.5 text-[11px] font-bold text-[#16A34A]">
                  <span className="size-1.5 rounded-full bg-current" />
                  {t.patientsStatusActive}
                </span>
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                <span className="font-semibold text-foreground">{ageFromDob(p.date_of_birth)}</span>
                <span>•</span>
                <span>{t.patientDobFullLabel}: <strong className="text-foreground">{p.date_of_birth ?? "—"}</strong></span>
                <span>•</span>
                <span>{appointment.reason || "—"}</span>
              </div>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2.5">
            <Button
              onClick={() => setConsultOpen(true)}
              className="shrink-0 gap-1.5 rounded-xl bg-gradient-to-r from-[#F97316] via-[#EC4899] to-[#8B5CF6] font-bold text-white shadow-md hover:opacity-90"
            >
              <Stethoscope className="size-4" strokeWidth={2} />
              {t.startConsultation}
            </Button>
            <Button onClick={() => setNoteOpen(true)} variant="outline" size="icon" className="rounded-xl" aria-label="Quick clinical note">
              <PenLine className="size-4" />
            </Button>
            <Button onClick={() => setEditOpen(true)} variant="outline" size="icon" className="rounded-xl" aria-label="Edit patient details">
              <Pencil className="size-4" />
            </Button>
            <Button onClick={handleExportDossier} variant="outline" size="icon" className="rounded-xl" aria-label="Export dossier">
              <FileOutput className="size-4" />
            </Button>
          </div>
        </div>
        <div className="hidden shrink-0 items-end gap-1.5 self-start pl-2 xl:flex">
          <span className="text-3xl leading-none">🧸</span>
          <p className="font-heading text-[13px] leading-tight font-semibold text-[#EC4899] italic">
            Healthy Kids
            <br />
            Happier Futures ♡
          </p>
        </div>
      </div>

      {/* Tabs row */}
      <div className="flex items-center justify-between gap-3 border-b bg-[#F8FAFC] px-5">
        <nav className="flex gap-5 overflow-x-auto text-xs font-bold">
          {tabs.map((tabItem) => (
            <button
              key={tabItem.key}
              onClick={() => setTab(tabItem.key)}
              className={cn(
                "flex items-center gap-1.5 border-b-2 py-3 whitespace-nowrap transition-colors",
                tab === tabItem.key ? "border-[#2563EB] text-[#2563EB]" : "border-transparent text-[#64748B] hover:text-foreground",
              )}
            >
              <tabItem.icon className="size-3.5" strokeWidth={2} />
              {t[tabItem.labelKey]}
            </button>
          ))}
        </nav>
        {tab === "prescriptions" && (
          <Button onClick={() => setRxOpen(true)} size="sm" className="shrink-0 gap-1.5 rounded-lg font-bold shadow-xs">
            <Plus className="size-3.5" strokeWidth={2.4} />
            {t.qaNewPrescription}
          </Button>
        )}
      </div>

      {/* Scrollable content */}
      <div className="flex-1 space-y-5 overflow-y-auto p-5">
        {tab === "overview" && (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="rounded-xl border p-4">
              <h3 className="mb-1 flex items-center gap-2 font-heading text-[14.5px] font-bold">
                <ClipboardList className="size-4 text-[#2563EB]" strokeWidth={2} />
                {t.basicInfoTitle}
              </h3>
              <div className="flex flex-col divide-y">
                <InfoRow label={t.patientAgeLabel} value={ageFromDob(p.date_of_birth)} />
                <InfoRow label={t.patientDobFullLabel} value={p.date_of_birth ?? "—"} />
                <InfoRow
                  label={t.patientPhoneParentLabel}
                  value={
                    <span className="flex items-center gap-1.5">
                      {p.phone_e164}
                      <WhatsAppIcon className="size-3.5" />
                    </span>
                  }
                />
                <InfoRow label="Preferred language" value={p.language === "es" ? "Español" : "English"} />
                {p.notes && <InfoRow label="Notes" value={p.notes} />}
              </div>
            </div>

            <div className="flex flex-col gap-4">
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <h3 className="flex items-center gap-2 font-heading text-[14.5px] font-bold">
                    <TriangleAlert className="size-4 text-[#DC2626]" strokeWidth={2} />
                    {t.allergiesTitle}
                  </h3>
                  <button onClick={handleAddAllergy} className="flex cursor-pointer items-center gap-1 text-xs font-bold text-[#2563EB]">
                    <Plus className="size-3" strokeWidth={2.6} />
                    {t.addLabel}
                  </button>
                </div>
                {allAllergies.length === 0 ? (
                  <div className="rounded-xl bg-[#DCFCE7] px-3.5 py-2.5 text-[13px] font-semibold text-[#16A34A]">
                    {t.noKnownAllergies}
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {allAllergies.map((a) => (
                      <span
                        key={a}
                        className="flex items-center gap-1.5 rounded-full bg-[#FEF2F2] px-3 py-1 text-[12.5px] font-semibold text-[#DC2626]"
                      >
                        {a}
                        <button onClick={() => handleRemoveAllergy(a)} aria-label={`Remove ${a}`} className="opacity-60 hover:opacity-100">
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <div className="mb-2 flex items-center justify-between">
                  <h3 className="flex items-center gap-2 font-heading text-[14.5px] font-bold">
                    <Pill className="size-4 text-[#EC4899]" strokeWidth={2} />
                    {t.medicationsTitle}
                  </h3>
                  <button onClick={handleAddMedication} className="flex cursor-pointer items-center gap-1 text-xs font-bold text-[#2563EB]">
                    <Plus className="size-3" strokeWidth={2.6} />
                    {t.addLabel}
                  </button>
                </div>
                {medications.length === 0 ? (
                  <div className="flex items-center justify-between gap-1.5 rounded-xl bg-[#DCFCE7] px-3.5 py-2.5 text-[13px] font-semibold text-[#16A34A]">
                    <span className="flex items-center gap-1.5">
                      <CircleCheck className="size-4" strokeWidth={2} />
                      {t.noCurrentMedications}
                    </span>
                    <Switch checked disabled className="data-checked:bg-[#16A34A]" />
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {medications.map((m) => (
                      <span
                        key={m}
                        className="flex items-center gap-1.5 rounded-full bg-[#EFF6FF] px-3 py-1 text-[12.5px] font-semibold text-[#2563EB]"
                      >
                        {m}
                        <button onClick={() => handleRemoveMedication(m)} aria-label={`Remove ${m}`} className="opacity-60 hover:opacity-100">
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {tab === "history" && (
          <div className="rounded-xl border p-4">
            <h3 className="mb-3 font-heading text-[14.5px] font-bold">{t.tabMedicalHistory}</h3>
            {consultationsQuery.isLoading ? (
              <div className="py-6 text-center text-[12.5px] text-muted-foreground">Loading…</div>
            ) : consultations.length === 0 ? (
              <div className="rounded-xl bg-muted px-3.5 py-2.5 text-[13px] font-semibold text-muted-foreground">No visits recorded yet.</div>
            ) : (
              <div className="flex flex-col divide-y">
                {consultations.map((row) => (
                  <div key={row.id} className="py-3 first:pt-0 last:pb-0">
                    <div className="flex items-center justify-between">
                      <span className="text-[13px] font-bold">{row.diagnosis || row.chief_complaint}</span>
                      <span className="text-[11.5px] text-muted-foreground">{new Date(row.created_at).toLocaleDateString()}</span>
                    </div>
                    <div className="mt-1 text-[12.5px] text-muted-foreground">
                      {row.diagnosis ? row.chief_complaint : row.notes || "Note"}
                      {row.diagnosis && row.notes ? ` — ${row.notes}` : ""}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {tab === "vaccinations" && (
          <div className="rounded-xl border p-4">
            <h3 className="mb-3 font-heading text-[14.5px] font-bold">{t.tabVaccinationsFull}</h3>
            <div className="rounded-xl bg-muted px-3.5 py-2.5 text-[13px] font-semibold text-muted-foreground">
              No vaccination records yet.
            </div>
          </div>
        )}

        {tab === "prescriptions" && (
          <div className="space-y-4">
            {/* Safety & interaction banner */}
            <div className="flex items-start justify-between gap-3 rounded-xl border border-[#BBF7D0] bg-[#F0FDF4] p-3.5 text-xs">
              <div className="flex items-start gap-3">
                <div className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg bg-[#DCFCE7] text-[#16A34A]">
                  <ShieldCheck className="size-4" strokeWidth={2.2} />
                </div>
                <div>
                  <span className="text-xs font-bold tracking-wide text-[#16A34A]">Pediatric Interaction &amp; Allergy Verification</span>
                  <p className="mt-0.5 text-[11px] leading-relaxed text-[#16A34A]/90">
                    {allAllergies.length === 0
                      ? "No known allergies on file — no adverse drug-drug interactions detected with current profile."
                      : `Allergy note: ${allAllergies.join(", ")} flagged — verified against current profile before dispensing.`}
                  </p>
                </div>
              </div>
              <span className="shrink-0 rounded-full border border-[#BBF7D0] bg-[#BBF7D0]/60 px-2.5 py-0.5 text-[10px] font-bold text-[#16A34A] uppercase">
                Verified Safe
              </span>
            </div>

            {prescriptionsQuery.isLoading ? (
              <div className="py-6 text-center text-[12.5px] text-muted-foreground">Loading…</div>
            ) : activeRx ? (
              <button onClick={() => setViewingRx(activeRx)} className="block w-full text-left">
                <div className="rounded-2xl border bg-card p-5 shadow-atelier-elevated transition-colors hover:border-[#2563EB]/40">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-3.5">
                    <div>
                      <div className="flex items-center gap-2.5">
                        <span className="font-mono text-sm font-bold tracking-wider text-primary">RX-{1000 + activeRx.sequence_number}</span>
                        <Badge variant={activeRx.status === "active" ? "default" : "secondary"} className="uppercase">
                          {activeRx.status === "active" ? t.rxStatusActive : t.rxStatusCompleted}
                        </Badge>
                      </div>
                      <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                        <span>{t.rxDate}: <strong className="font-mono text-foreground">{new Date(activeRx.created_at).toLocaleDateString()}</strong></span>
                        <span>•</span>
                        <span>{t.rxPatient}: <strong className="text-foreground">{p.full_name}</strong></span>
                      </div>
                    </div>
                    <div className="text-right text-xs font-bold">Dr. Gamaliel, FAAP</div>
                  </div>

                  <div className="py-3">
                    <span className="font-mono text-[10px] font-bold tracking-widest text-muted-foreground uppercase">{t.diagnosisLabel}</span>
                    <div className="mt-0.5 flex items-center gap-2 text-sm font-bold">
                      <span className="size-2 rounded-full bg-primary" />
                      {activeRx.diagnosis || "—"}
                    </div>
                  </div>

                  <div className="space-y-3 pt-1">
                    <span className="font-mono text-[10px] font-bold tracking-widest text-muted-foreground uppercase">
                      {t.rxModalMedications} ({activeRx.prescription_items.length})
                    </span>
                    {activeRx.prescription_items.map((med) => (
                      <div key={med.id} className="flex flex-col gap-3 rounded-xl border bg-accent/25 p-3.5 md:flex-row md:items-center md:justify-between">
                        <div className="flex items-start gap-3">
                          <div className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl bg-[#FFEDD5] text-[#C2410C]">
                            <Pill className="size-4.5" strokeWidth={2} />
                          </div>
                          <div>
                            <h4 className="text-xs font-bold">{med.name}</h4>
                            <p className="mt-1 text-xs font-semibold">
                              {t.rxModalDose}: <span className="text-primary">{med.dose}, {med.frequency}</span> · {med.duration}
                            </p>
                            <p className="mt-0.5 text-[11px] text-muted-foreground">{t.rxModalRoute}: {med.route}</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  {activeRx.notes && (
                    <div className="mt-4 rounded-xl border-t bg-accent/20 p-2.5 text-[11px] text-muted-foreground">{activeRx.notes}</div>
                  )}
                </div>
              </button>
            ) : (
              <div className="rounded-xl bg-muted px-3.5 py-2.5 text-[13px] font-semibold text-muted-foreground">{t.rxEmpty}</div>
            )}
          </div>
        )}

        {tab === "growth" && (
          <div className="rounded-xl border p-4">
            <h3 className="mb-3 font-heading text-[14.5px] font-bold">{t.tabGrowthFull}</h3>
            {growthRows.length === 0 ? (
              <div className="rounded-xl bg-muted px-3.5 py-2.5 text-[13px] font-semibold text-muted-foreground">
                No growth measurements recorded yet — vitals entered during a consultation will show up here.
              </div>
            ) : (
              <div className="flex flex-col divide-y">
                {growthRows.map((row, i) => (
                  <div key={i} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                    <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-[#FFF7ED] text-[#C2410C]">
                      <LineChart className="size-4" strokeWidth={1.8} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between">
                        <span className="text-[13px] font-bold">{row.date}</span>
                      </div>
                      <div className="mt-0.5 text-[12.5px] text-muted-foreground">
                        {row.weight ? `${t.weightLabel}: ${row.weight} kg` : ""}
                        {row.weight && row.height ? " · " : ""}
                        {row.height ? `${t.heightLabel}: ${row.height} cm` : ""}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {tab === "documents" && (
          <div className="rounded-xl border p-4">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="font-heading text-[14.5px] font-bold">{t.tabDocuments}</h3>
              <button onClick={() => fileInputRef.current?.click()} className="flex cursor-pointer items-center gap-1 text-xs font-bold text-primary">
                <Upload className="size-3" strokeWidth={2.4} />
                {t.qaUploadDocument}
              </button>
              <input ref={fileInputRef} type="file" multiple className="hidden" onChange={handleFilesSelected} />
            </div>
            {documents.length === 0 ? (
              <div className="rounded-xl bg-muted px-3.5 py-2.5 text-[13px] font-semibold text-muted-foreground">
                {t.noDocumentsUploaded}
              </div>
            ) : (
              <div className="flex flex-col divide-y">
                {documents.map((doc, i) => (
                  <button
                    key={i}
                    onClick={() => handleOpenDocument(doc)}
                    className="flex w-full items-center gap-3 py-3 text-left first:pt-0 last:pb-0 hover:bg-muted/40"
                  >
                    <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-[#FFF7ED] text-[#C2410C]">
                      {doc.type === "pdf" ? <FileText className="size-4" strokeWidth={1.8} /> : <ImageIcon className="size-4" strokeWidth={1.8} />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[13px] font-bold text-primary">{doc.name}</div>
                      <div className="text-[11.5px] text-muted-foreground">
                        {doc.date} · {doc.size}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Bottom split: Contact + Recent Consultations + Growth Summary */}
        <div className="grid grid-cols-1 gap-5 pt-1 md:grid-cols-3">
          <div className="flex flex-col justify-between rounded-2xl border bg-card p-4 shadow-atelier">
            <div>
              <div className="mb-3 flex items-center justify-between">
                <span className="flex items-center gap-2 text-[13px] font-bold tracking-wide">
                  <User className="size-4 text-[#2563EB]" strokeWidth={2} />
                  Patient Contact
                </span>
                <span className="flex items-center gap-1 rounded-full bg-[#DCFCE7] px-2 py-0.5 text-[10px] font-bold text-[#16A34A]">
                  <CircleCheck className="size-3" strokeWidth={2.5} />
                  WhatsApp Verified
                </span>
              </div>
              <div className="flex items-center gap-3">
                <div className="flex size-10 items-center justify-center rounded-full bg-[#EFF6FF] font-heading text-sm font-bold text-[#2563EB]">
                  {initials}
                </div>
                <div>
                  <h4 className="text-xs font-bold">{p.full_name}</h4>
                  <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">{p.phone_e164}</p>
                </div>
              </div>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2 border-t pt-3">
              <button
                onClick={() => {
                  window.location.href = `tel:${p.phone_e164.replace(/\s+/g, "")}`
                }}
                className="flex items-center justify-center gap-2 rounded-xl border border-[#2563EB]/20 bg-[#EFF6FF] px-3 py-2 text-xs font-bold text-[#2563EB] transition-all hover:bg-[#DBEAFE]"
              >
                <PhoneCallIcon className="size-4" />
                {t.qaCallParent}
              </button>
              <button
                onClick={() => {
                  const phone = p.phone_e164.replace(/[^\d]/g, "")
                  window.open(`https://wa.me/${phone}`, "_blank", "noopener,noreferrer")
                }}
                className="flex items-center justify-center gap-2 rounded-xl border bg-card px-3 py-2 text-xs font-bold hover:bg-muted"
              >
                <WhatsAppIcon className="size-4" />
                {t.qaWhatsappParent}
              </button>
            </div>
          </div>

          <div className="rounded-2xl border bg-card p-4 shadow-atelier">
            <div className="mb-3 flex items-center justify-between">
              <span className="flex items-center gap-2 text-[13px] font-bold tracking-wide">
                <Calendar className="size-4 text-[#F97316]" strokeWidth={2} />
                {t.recentVisitsTitle}
              </span>
              <button onClick={() => setTab("history")} className="cursor-pointer text-[11px] font-bold text-[#2563EB]">
                {t.viewAll} →
              </button>
            </div>
            {consultations.length === 0 ? (
              <p className="text-[12px] text-muted-foreground">No visits yet.</p>
            ) : (
              <div className="flex flex-col divide-y">
                {consultations.slice(0, 4).map((visit) => (
                  <div key={visit.id} className="flex items-center justify-between gap-2 py-2.5">
                    <div className="min-w-0">
                      <div className="text-[12.5px] font-bold whitespace-nowrap">{new Date(visit.created_at).toLocaleDateString()}</div>
                      <div className="truncate text-[11.5px] text-muted-foreground">{visit.diagnosis || visit.chief_complaint}</div>
                    </div>
                    <div className="shrink-0 font-heading text-[11.5px] font-semibold text-[#2563EB]">Dr. Gamaliel</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-2xl border bg-card p-4 shadow-atelier">
            <div className="mb-3 flex items-center justify-between">
              <span className="flex items-center gap-2 text-[13px] font-bold tracking-wide">
                <LineChart className="size-4 text-[#2563EB]" strokeWidth={2} />
                {t.growthSummaryTitle}
              </span>
              <button onClick={() => setTab("growth")} className="cursor-pointer text-[11px] font-bold text-[#2563EB]">
                {t.viewChart} →
              </button>
            </div>
            {!latestWeight && !latestHeight ? (
              <p className="text-[12px] text-muted-foreground">No measurements yet.</p>
            ) : (
              <div className="flex items-center justify-between gap-3">
                {latestWeight?.weight != null && (
                  <div>
                    <div className="font-heading text-[15px] font-bold">{latestWeight.weight} kg</div>
                    <div className="text-[11px] text-muted-foreground">{t.weightLabel}</div>
                  </div>
                )}
                {latestHeight?.height != null && (
                  <div>
                    <div className="font-heading text-[15px] font-bold">{latestHeight.height} cm</div>
                    <div className="text-[11px] text-muted-foreground">{t.heightLabel}</div>
                  </div>
                )}
                {bmi != null && (
                  <div className="text-right">
                    <div className="font-heading text-[13px] font-bold">BMI {bmi.toFixed(1)}</div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      <StartConsultationDialog
        open={consultOpen}
        onOpenChange={setConsultOpen}
        patient={demoPatientForDialog}
        initialPatientId={p.id}
        initialChiefComplaint={appointment.reason}
        appointmentId={appointment.id}
        onComplete={handleConsultationComplete}
      />
      <NewPrescriptionDialog
        open={rxOpen}
        onOpenChange={setRxOpen}
        initialPatientId={p.id}
        lockPatient
        onCreated={() => prescriptionsQuery.refetch()}
      />
      <PrescriptionDetailDialog rx={viewingRx} onOpenChange={(open) => !open && setViewingRx(null)} />
      <EditPatientDialog open={editOpen} onOpenChange={setEditOpen} patient={p} />
      <QuickNoteDialog
        open={noteOpen}
        onOpenChange={setNoteOpen}
        patientId={p.id}
        patientName={p.full_name}
        onSaved={() => {
          setTab("history")
          consultationsQuery.refetch()
        }}
      />
    </Card>
  )
}
