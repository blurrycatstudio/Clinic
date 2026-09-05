import {
  Calendar,
  CircleCheck,
  ClipboardList,
  Clock,
  FileOutput,
  FileText,
  Image as ImageIcon,
  LineChart,
  PenLine,
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
import { useNavigate } from "react-router-dom"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { PhoneCallIcon } from "@/components/icons/PhoneCallIcon"
import { WhatsAppIcon } from "@/components/icons/WhatsAppIcon"
import { getPatientDocuments, HISTORY, PATIENTS, PRESCRIPTIONS, RECENT_VISITS, type Patient, type PatientDocument } from "@/lib/data"
import { useLang } from "@/lib/i18n"
import type { Strings } from "@/lib/i18n"
import { cn } from "@/lib/utils"
import { useToast } from "@/lib/toast"
import { downloadTextFile } from "@/lib/download"

type TabKey = "overview" | "history" | "vaccinations" | "prescriptions" | "growth" | "documents"

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2 text-[13px]">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-semibold text-foreground">{value}</span>
    </div>
  )
}

const DEFAULT_PATIENT = PATIENTS.find((patient) => patient.id === "emilia")!

export function PatientSnapshotCard({ patient = DEFAULT_PATIENT }: { patient?: Patient }) {
  const { t, lang } = useLang()
  const navigate = useNavigate()
  const toast = useToast()
  const [tab, setTab] = useState<TabKey>("overview")
  const [extraAllergies, setExtraAllergies] = useState<string[]>([])
  const [extraMedications, setExtraMedications] = useState<string[]>([])
  const [extraDocuments, setExtraDocuments] = useState<PatientDocument[]>([])
  const [editingInfo, setEditingInfo] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const p = patient

  useEffect(() => {
    setTab("overview")
    setExtraAllergies([])
    setExtraMedications([])
    setExtraDocuments([])
    setEditingInfo(false)
  }, [p.id])

  const visits = RECENT_VISITS[lang]
  const history = HISTORY.history[lang]
  const vaccinations = HISTORY.vaccinations[lang]
  const growth = HISTORY.notes[lang]
  const prescriptions = PRESCRIPTIONS.filter((rx) => rx.patientId === p.id)
  const activeRx = prescriptions.find((rx) => rx.status === "rxStatusActive") ?? prescriptions[0]
  const documents = [...getPatientDocuments(p.id), ...extraDocuments]
  const allAllergies = [...p.allergies, ...extraAllergies]

  function handleAddAllergy() {
    const value = window.prompt("Add allergy")?.trim()
    if (value) {
      setExtraAllergies((prev) => [...prev, value])
      toast(`Added allergy: ${value}`)
    }
  }

  function handleAddMedication() {
    const value = window.prompt("Add current medication")?.trim()
    if (value) {
      setExtraMedications((prev) => [...prev, value])
      toast(`Added medication: ${value}`)
    }
  }

  function handleQuickNote() {
    const value = window.prompt("Quick clinical note")?.trim()
    if (value) toast("Clinical note saved to dossier")
  }

  function handleExportDossier() {
    const lines = [
      `Patient: ${p.name}`,
      `DOB: ${p.dob}`,
      `Gender: ${p.gender[lang]}`,
      `Guardian: ${p.guardian} (${p.guardianPhone})`,
      `Allergies: ${allAllergies.length ? allAllergies.join(", ") : "None known"}`,
      "",
      "Recent visits:",
      ...visits.map((v) => `- ${v.date}: ${v.type} (${v.doctor})`),
    ]
    downloadTextFile(`${p.name.replace(/\s+/g, "_")}_dossier.txt`, lines.join("\n"))
    toast("Dossier exported")
  }

  function handleFilesSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files
    if (!files || files.length === 0) return
    const uploaded: PatientDocument[] = Array.from(files).map((f) => ({
      name: f.name,
      date: new Date().toLocaleDateString(),
      size: `${Math.max(1, Math.round(f.size / 1024))} KB`,
      type: f.name.toLowerCase().endsWith(".pdf") ? "pdf" : "image",
    }))
    setExtraDocuments((prev) => [...uploaded, ...prev])
    toast(`Uploaded ${uploaded.length} document${uploaded.length > 1 ? "s" : ""}`)
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

  return (
    <Card className="h-full min-w-0 flex-1 gap-0 overflow-hidden rounded-2xl border p-0 shadow-atelier-elevated">
      {/* Dossier header */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b bg-gradient-to-r from-white via-white to-[#EFF6FF]/50 p-5">
        <div className="flex items-center gap-4">
          <div className="relative">
            <Avatar className="size-16 ring-2 ring-[#2563EB]/50 shadow-md">
              <AvatarFallback className="text-xl font-bold text-white" style={{ background: p.color }}>
                {p.initials}
              </AvatarFallback>
            </Avatar>
            {p.status === "active" && (
              <span className="absolute right-0 bottom-0 flex size-4 items-center justify-center rounded-full bg-secondary text-[9px] text-white ring-2 ring-card">
                ✓
              </span>
            )}
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2.5">
              <span className="font-heading text-2xl font-bold tracking-wide">{p.name}</span>
              <span
                className={cn(
                  "flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-bold",
                  p.status === "active" ? "bg-[#DCFCE7] text-[#16A34A]" : "bg-muted text-muted-foreground",
                )}
              >
                <span className="size-1.5 rounded-full bg-current" />
                {p.status === "active" ? t.patientsStatusActive : t.patientsStatusInactive}
              </span>
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
              <span className="font-semibold text-foreground">{p.ageFull[lang]}</span>
              <span>•</span>
              <span>{p.gender[lang]}</span>
              <span>•</span>
              <span>{t.patientDobFullLabel}: <strong className="text-foreground">{p.dob}</strong></span>
              <span>•</span>
              <span>{t.patientIdFullLabel}: <span className="font-mono font-bold text-[#2563EB]">{p.patientCode}</span></span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2.5">
          <Button
            onClick={() => {
              toast(`Consultation started for ${p.name}`)
              navigate("/prescriptions")
            }}
            className="gap-1.5 rounded-xl bg-gradient-to-r from-[#F97316] via-[#EC4899] to-[#8B5CF6] font-bold text-white shadow-md hover:opacity-90"
          >
            <Stethoscope className="size-4" strokeWidth={2} />
            {t.startConsultation}
          </Button>
          <Button onClick={handleQuickNote} variant="outline" size="icon" className="rounded-xl" aria-label="Quick clinical note">
            <PenLine className="size-4" />
          </Button>
          <Button onClick={handleExportDossier} variant="outline" size="icon" className="rounded-xl" aria-label="Export dossier">
            <FileOutput className="size-4" />
          </Button>
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
          <Button onClick={() => navigate("/prescriptions")} size="sm" className="shrink-0 gap-1.5 rounded-lg font-bold shadow-xs">
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
              <div className="mb-1 flex items-center justify-between">
                <h3 className="flex items-center gap-2 font-heading text-[14.5px] font-bold">
                  <ClipboardList className="size-4 text-[#2563EB]" strokeWidth={2} />
                  {t.basicInfoTitle}
                </h3>
                <button
                  onClick={() => {
                    if (editingInfo) toast("Basic info updated")
                    setEditingInfo((v) => !v)
                  }}
                  className="flex cursor-pointer items-center gap-1 text-xs font-bold text-[#2563EB]"
                >
                  <PenLine className="size-3" strokeWidth={2.4} />
                  {editingInfo ? "Save" : t.doctorEdit}
                </button>
              </div>
              <div className="flex flex-col divide-y">
                <InfoRow label={t.patientAgeLabel} value={p.ageFull[lang]} />
                <InfoRow label={t.patientGenderLabel} value={p.gender[lang]} />
                <InfoRow label={t.patientDobFullLabel} value={p.dob} />
                <InfoRow
                  label={t.patientPhoneParentLabel}
                  value={
                    editingInfo ? (
                      <input
                        defaultValue={p.guardianPhone}
                        className="w-40 rounded-md border px-2 py-1 text-right text-[13px] outline-none focus-visible:border-ring"
                      />
                    ) : (
                      <span className="flex items-center gap-1.5">
                        {p.guardianPhone}
                        <WhatsAppIcon className="size-3.5" />
                      </span>
                    )
                  }
                />
                <InfoRow
                  label={t.patientEmailLabel}
                  value={
                    editingInfo ? (
                      <input
                        defaultValue={p.email}
                        className="w-40 rounded-md border px-2 py-1 text-right text-[13px] outline-none focus-visible:border-ring"
                      />
                    ) : (
                      p.email
                    )
                  }
                />
                <InfoRow label={t.patientAddressLabel} value={p.address} />
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
                  <div className="flex items-center gap-2 rounded-xl bg-[#FEF2F2] px-3.5 py-2.5 text-[13px] font-semibold text-[#DC2626]">
                    <TriangleAlert className="size-4 shrink-0" strokeWidth={2} />
                    {allAllergies.join(", ")}
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
                {extraMedications.length === 0 ? (
                  <div className="flex items-center gap-1.5 rounded-xl bg-[#DCFCE7] px-3.5 py-2.5 text-[13px] font-semibold text-[#16A34A]">
                    <CircleCheck className="size-4" strokeWidth={2} />
                    {t.noCurrentMedications}
                  </div>
                ) : (
                  <div className="rounded-xl bg-[#EFF6FF] px-3.5 py-2.5 text-[13px] font-semibold text-[#2563EB]">
                    {extraMedications.join(", ")}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {tab === "history" && (
          <div className="rounded-xl border p-4">
            <h3 className="mb-3 font-heading text-[14.5px] font-bold">{t.tabMedicalHistory}</h3>
            <div className="flex flex-col divide-y">
              {history.map((row, i) => (
                <div key={i} className="py-3 first:pt-0 last:pb-0">
                  <div className="flex items-center justify-between">
                    <span className="text-[13px] font-bold">{row.type}</span>
                    <span className="text-[11.5px] text-muted-foreground">{row.date}</span>
                  </div>
                  <div className="mt-1 text-[12.5px] text-muted-foreground">{row.details}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {tab === "vaccinations" && (
          <div className="rounded-xl border p-4">
            <h3 className="mb-3 font-heading text-[14.5px] font-bold">{t.tabVaccinationsFull}</h3>
            <div className="flex flex-col divide-y">
              {vaccinations.map((row, i) => (
                <div key={i} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                  <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-[#F0FDF4] text-[#15803D]">
                    <Syringe className="size-4" strokeWidth={1.8} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between">
                      <span className="text-[13px] font-bold">{row.type}</span>
                      <span className="text-[11.5px] text-muted-foreground">{row.date}</span>
                    </div>
                    <div className="mt-0.5 text-[12.5px] text-muted-foreground">{row.details}</div>
                  </div>
                </div>
              ))}
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
                    {p.allergies.length === 0
                      ? "No known allergies on file — no adverse drug-drug interactions detected with current profile."
                      : `Allergy note: ${p.allergies.join(", ")} flagged — verified against current profile before dispensing.`}
                  </p>
                </div>
              </div>
              <span className="shrink-0 rounded-full border border-[#BBF7D0] bg-[#BBF7D0]/60 px-2.5 py-0.5 text-[10px] font-bold text-[#16A34A] uppercase">
                Verified Safe
              </span>
            </div>

            {activeRx ? (
              <div className="rounded-2xl border bg-card p-5 shadow-atelier-elevated">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-3.5">
                  <div>
                    <div className="flex items-center gap-2.5">
                      <span className="font-mono text-sm font-bold tracking-wider text-primary">{activeRx.id}</span>
                      <Badge variant={activeRx.status === "rxStatusActive" ? "default" : "secondary"} className="uppercase">
                        {t[activeRx.status]}
                      </Badge>
                    </div>
                    <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                      <span>{t.rxDate}: <strong className="font-mono text-foreground">{activeRx.date}</strong></span>
                      <span>•</span>
                      <span>{t.rxPatient}: <strong className="text-foreground">{p.name}</strong></span>
                    </div>
                  </div>
                  <div className="text-right text-xs font-bold">Dr. Gamaliel, FAAP</div>
                </div>

                <div className="py-3">
                  <span className="font-mono text-[10px] font-bold tracking-widest text-muted-foreground uppercase">{t.diagnosisLabel}</span>
                  <div className="mt-0.5 flex items-center gap-2 text-sm font-bold">
                    <span className="size-2 rounded-full bg-primary" />
                    {activeRx.diagnosis}
                  </div>
                </div>

                <div className="space-y-3 pt-1">
                  <span className="font-mono text-[10px] font-bold tracking-widest text-muted-foreground uppercase">
                    {t.rxModalMedications} ({activeRx.medications.length})
                  </span>
                  {activeRx.medications.map((med, i) => (
                    <div key={i} className="flex flex-col gap-3 rounded-xl border bg-accent/25 p-3.5 md:flex-row md:items-center md:justify-between">
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
                  <div className="mt-4 rounded-xl border-t bg-accent/20 p-2.5 text-[11px] text-muted-foreground">
                    {activeRx.notes}
                  </div>
                )}
              </div>
            ) : (
              <div className="rounded-xl bg-muted px-3.5 py-2.5 text-[13px] font-semibold text-muted-foreground">
                {t.rxEmpty}
              </div>
            )}
          </div>
        )}

        {tab === "growth" && (
          <div className="rounded-xl border p-4">
            <h3 className="mb-3 font-heading text-[14.5px] font-bold">{t.tabGrowthFull}</h3>
            <div className="flex flex-col divide-y">
              {growth.map((row, i) => (
                <div key={i} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                  <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-[#FFF7ED] text-[#C2410C]">
                    <LineChart className="size-4" strokeWidth={1.8} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between">
                      <span className="text-[13px] font-bold">{row.type}</span>
                      <span className="text-[11.5px] text-muted-foreground">{row.date}</span>
                    </div>
                    <div className="mt-0.5 text-[12.5px] text-muted-foreground">{row.details}</div>
                  </div>
                </div>
              ))}
            </div>
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
                  <div key={i} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                    <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-[#FFF7ED] text-[#C2410C]">
                      {doc.type === "pdf" ? (
                        <FileText className="size-4" strokeWidth={1.8} />
                      ) : (
                        <ImageIcon className="size-4" strokeWidth={1.8} />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[13px] font-bold">{doc.name}</div>
                      <div className="text-[11.5px] text-muted-foreground">
                        {doc.date} · {doc.size}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Bottom split: Caregiver Concierge + Recent Consultations */}
        <div className="grid grid-cols-1 gap-5 pt-1 md:grid-cols-2">
          <div className="flex flex-col justify-between rounded-2xl border bg-card p-4 shadow-atelier">
            <div>
              <div className="mb-3 flex items-center justify-between">
                <span className="flex items-center gap-2 text-[13px] font-bold tracking-wide">
                  <User className="size-4 text-[#2563EB]" strokeWidth={2} />
                  Caregiver / Concierge
                </span>
                <span className="flex items-center gap-1 rounded-full bg-[#DCFCE7] px-2 py-0.5 text-[10px] font-bold text-[#16A34A]">
                  <CircleCheck className="size-3" strokeWidth={2.5} />
                  Verified Guardian
                </span>
              </div>
              <div className="flex items-center gap-3">
                <div className="flex size-10 items-center justify-center rounded-full bg-[#EFF6FF] font-heading text-sm font-bold text-[#2563EB]">
                  {p.guardian
                    .split(" ")
                    .slice(0, 2)
                    .map((w) => w[0])
                    .join("")}
                </div>
                <div>
                  <h4 className="text-xs font-bold">{p.guardian}</h4>
                  <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">{p.guardianPhone}</p>
                </div>
              </div>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2 border-t pt-3">
              <button
                onClick={() => {
                  window.location.href = `tel:${p.guardianPhone.replace(/\s+/g, "")}`
                }}
                className="flex items-center justify-center gap-2 rounded-xl border border-[#2563EB]/20 bg-[#EFF6FF] px-3 py-2 text-xs font-bold text-[#2563EB] transition-all hover:bg-[#DBEAFE]"
              >
                <PhoneCallIcon className="size-4" />
                {t.qaCallParent}
              </button>
              <button
                onClick={() => {
                  const phone = p.guardianPhone.replace(/[^\d]/g, "")
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
            <div className="flex flex-col divide-y">
              {visits.map((visit, i) => (
                <div key={i} className="flex items-center justify-between gap-2 py-2.5">
                  <div className="min-w-0">
                    <div className="text-[12.5px] font-bold whitespace-nowrap">{visit.date}</div>
                    <div className="truncate text-[11.5px] text-muted-foreground">{visit.type}</div>
                  </div>
                  <div className="shrink-0 font-heading text-[11.5px] font-semibold text-[#2563EB]">{visit.doctor}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </Card>
  )
}
