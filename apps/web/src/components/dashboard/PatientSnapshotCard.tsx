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
  Upload,
  User,
} from "lucide-react"
import { useEffect, useState } from "react"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { PhoneCallIcon } from "@/components/icons/PhoneCallIcon"
import { WhatsAppIcon } from "@/components/icons/WhatsAppIcon"
import { getPatientDocuments, HISTORY, PATIENTS, PRESCRIPTIONS, RECENT_VISITS, type Patient } from "@/lib/data"
import { useLang } from "@/lib/i18n"
import type { Strings } from "@/lib/i18n"
import { cn } from "@/lib/utils"

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
  const [tab, setTab] = useState<TabKey>("overview")
  const p = patient

  useEffect(() => {
    setTab("overview")
  }, [p.id])

  const visits = RECENT_VISITS[lang]
  const history = HISTORY.history[lang]
  const vaccinations = HISTORY.vaccinations[lang]
  const growth = HISTORY.notes[lang]
  const prescriptions = PRESCRIPTIONS.filter((rx) => rx.patientId === p.id)
  const activeRx = prescriptions.find((rx) => rx.status === "rxStatusActive") ?? prescriptions[0]
  const documents = getPatientDocuments(p.id)

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
      <div className="flex flex-wrap items-center justify-between gap-4 border-b bg-gradient-to-r from-card via-card to-accent/25 p-5">
        <div className="flex items-center gap-4">
          <div className="relative">
            <Avatar className="size-16 ring-2 ring-primary/60 shadow-md">
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
                  p.status === "active" ? "bg-[#E1EFE8] text-[#22543D]" : "bg-muted text-muted-foreground",
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
              <span>{t.patientIdFullLabel}: <span className="font-mono font-bold text-primary">{p.patientCode}</span></span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2.5">
          <Button className="gap-1.5 rounded-xl font-bold shadow-md">
            <Stethoscope className="size-4" strokeWidth={2} />
            {t.startConsultation}
          </Button>
          <Button variant="outline" size="icon" className="rounded-xl" aria-label="Quick clinical note">
            <PenLine className="size-4" />
          </Button>
          <Button variant="outline" size="icon" className="rounded-xl" aria-label="Export dossier">
            <FileOutput className="size-4" />
          </Button>
        </div>
      </div>

      {/* Tabs row */}
      <div className="flex items-center justify-between gap-3 border-b bg-accent/20 px-5">
        <nav className="flex gap-5 overflow-x-auto text-xs font-bold">
          {tabs.map((tabItem) => (
            <button
              key={tabItem.key}
              onClick={() => setTab(tabItem.key)}
              className={cn(
                "flex items-center gap-1.5 border-b-2 py-3 whitespace-nowrap transition-colors",
                tab === tabItem.key ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              <tabItem.icon className="size-3.5" strokeWidth={2} />
              {t[tabItem.labelKey]}
            </button>
          ))}
        </nav>
        {tab === "prescriptions" && (
          <Button size="sm" className="shrink-0 gap-1.5 rounded-lg font-bold shadow-xs">
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
                <h3 className="font-heading text-[14.5px] font-bold">{t.basicInfoTitle}</h3>
                <button className="flex cursor-pointer items-center gap-1 text-xs font-bold text-primary">
                  <PenLine className="size-3" strokeWidth={2.4} />
                  {t.doctorEdit}
                </button>
              </div>
              <div className="flex flex-col divide-y">
                <InfoRow label={t.patientAgeLabel} value={p.ageFull[lang]} />
                <InfoRow label={t.patientGenderLabel} value={p.gender[lang]} />
                <InfoRow label={t.patientDobFullLabel} value={p.dob} />
                <InfoRow
                  label={t.patientPhoneParentLabel}
                  value={
                    <span className="flex items-center gap-1.5">
                      {p.guardianPhone}
                      <WhatsAppIcon className="size-3.5" />
                    </span>
                  }
                />
                <InfoRow label={t.patientEmailLabel} value={p.email} />
                <InfoRow label={t.patientAddressLabel} value={p.address} />
              </div>
            </div>

            <div className="flex flex-col gap-4">
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <h3 className="font-heading text-[14.5px] font-bold">{t.allergiesTitle}</h3>
                  <button className="flex cursor-pointer items-center gap-1 text-xs font-bold text-primary">
                    <Plus className="size-3" strokeWidth={2.6} />
                    {t.addLabel}
                  </button>
                </div>
                {p.allergies.length === 0 ? (
                  <div className="rounded-xl bg-[#E1EFE8] px-3.5 py-2.5 text-[13px] font-semibold text-[#22543D]">
                    {t.noKnownAllergies}
                  </div>
                ) : (
                  <div className="rounded-xl bg-[#FBECE2] px-3.5 py-2.5 text-[13px] font-semibold text-[#8F4616]">
                    {p.allergies.join(", ")}
                  </div>
                )}
              </div>

              <div>
                <div className="mb-2 flex items-center justify-between">
                  <h3 className="font-heading text-[14.5px] font-bold">{t.medicationsTitle}</h3>
                  <button className="flex cursor-pointer items-center gap-1 text-xs font-bold text-primary">
                    <Plus className="size-3" strokeWidth={2.6} />
                    {t.addLabel}
                  </button>
                </div>
                <div className="flex items-center gap-1.5 rounded-xl bg-[#E1EFE8] px-3.5 py-2.5 text-[13px] font-semibold text-[#22543D]">
                  <CircleCheck className="size-4" strokeWidth={2} />
                  {t.noCurrentMedications}
                </div>
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
                  <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-[#F1F7F4] text-[#2D6A4F]">
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
            <div className="flex items-start justify-between gap-3 rounded-xl border border-[#C4E1D3] bg-[#F1F7F4] p-3.5 text-xs">
              <div className="flex items-start gap-3">
                <div className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg bg-[#E1EFE8] text-[#22543D]">
                  <ShieldCheck className="size-4" strokeWidth={2.2} />
                </div>
                <div>
                  <span className="text-xs font-bold tracking-wide text-[#22543D]">Pediatric Interaction &amp; Allergy Verification</span>
                  <p className="mt-0.5 text-[11px] leading-relaxed text-[#22543D]/90">
                    {p.allergies.length === 0
                      ? "No known allergies on file — no adverse drug-drug interactions detected with current profile."
                      : `Allergy note: ${p.allergies.join(", ")} flagged — verified against current profile before dispensing.`}
                  </p>
                </div>
              </div>
              <span className="shrink-0 rounded-full border border-[#C4E1D3] bg-[#C4E1D3]/60 px-2.5 py-0.5 text-[10px] font-bold text-[#22543D] uppercase">
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
                        <div className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl bg-[#FBECE2] text-[#B25D23]">
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
                  <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-[#FDF7F2] text-[#B25D23]">
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
              <button className="flex cursor-pointer items-center gap-1 text-xs font-bold text-primary">
                <Upload className="size-3" strokeWidth={2.4} />
                {t.qaUploadDocument}
              </button>
            </div>
            {documents.length === 0 ? (
              <div className="rounded-xl bg-muted px-3.5 py-2.5 text-[13px] font-semibold text-muted-foreground">
                {t.noDocumentsUploaded}
              </div>
            ) : (
              <div className="flex flex-col divide-y">
                {documents.map((doc, i) => (
                  <div key={i} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                    <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-[#FDF7F2] text-[#B25D23]">
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
                <span className="font-mono text-[10px] font-bold tracking-widest text-muted-foreground uppercase">Caregiver Concierge</span>
                <span className="rounded-full bg-[#E1EFE8] px-2 py-0.5 text-[10px] font-bold text-[#22543D]">Verified Guardian</span>
              </div>
              <div className="flex items-center gap-3">
                <div className="flex size-10 items-center justify-center rounded-full bg-accent font-heading text-sm font-bold text-primary">
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
              <button className="flex items-center justify-center gap-2 rounded-xl border border-[#C4E1D3] bg-[#F1F7F4] px-3 py-2 text-xs font-bold text-[#22543D] transition-all hover:bg-[#E1EFE8]">
                <WhatsAppIcon className="size-4" />
                {t.qaWhatsappParent}
              </button>
              <button className="flex items-center justify-center gap-2 rounded-xl border bg-card px-3 py-2 text-xs font-bold hover:bg-muted">
                <PhoneCallIcon className="size-4" />
                {t.qaCallParent}
              </button>
            </div>
          </div>

          <div className="rounded-2xl border bg-card p-4 shadow-atelier">
            <div className="mb-3 flex items-center justify-between">
              <span className="font-mono text-[10px] font-bold tracking-widest text-muted-foreground uppercase">{t.recentVisitsTitle}</span>
              <span className="cursor-pointer text-[11px] font-bold text-primary">{t.viewAll} →</span>
            </div>
            <div className="flex flex-col divide-y">
              {visits.map((visit, i) => (
                <div key={i} className="flex items-center justify-between gap-2 py-2.5">
                  <div className="min-w-0">
                    <div className="text-[12.5px] font-bold whitespace-nowrap">{visit.date}</div>
                    <div className="truncate text-[11.5px] text-muted-foreground">{visit.type}</div>
                  </div>
                  <div className="shrink-0 font-heading text-[11.5px] font-semibold text-primary">{visit.doctor}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </Card>
  )
}
