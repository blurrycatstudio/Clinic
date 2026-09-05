import {
  Calendar,
  CircleCheck,
  ClipboardList,
  Clock,
  FileText,
  Image as ImageIcon,
  LineChart,
  MoreVertical,
  Pencil,
  Plus,
  Receipt,
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
  const documents = getPatientDocuments(p.id)

  const tabs: { key: TabKey; icon: React.ElementType; labelKey: keyof Strings }[] = [
    { key: "overview", icon: User, labelKey: "tabOverview" },
    { key: "history", icon: Clock, labelKey: "tabMedicalHistory" },
    { key: "vaccinations", icon: Syringe, labelKey: "tabVaccinationsFull" },
    { key: "prescriptions", icon: ClipboardList, labelKey: "tabPrescriptionsFull" },
    { key: "growth", icon: LineChart, labelKey: "tabGrowthFull" },
    { key: "documents", icon: FileText, labelKey: "tabDocuments" },
  ]

  const quickActions = [
    { icon: WhatsAppIcon, label: t.qaWhatsappParent, bg: "#e3f3e6", logo: true },
    { icon: PhoneCallIcon, label: t.qaCallParent, bg: "#e5f0fb", logo: true },
    { icon: Receipt, label: t.qaNewPrescription, bg: "#efe6fb", color: "#7440b8" },
    { icon: Calendar, label: t.quickNewAppt, bg: "#fdf1de", color: "#c2882c" },
    { icon: Receipt, label: t.quickGenerateInvoice, bg: "#fdf3c7", color: "#a8862c" },
    { icon: Upload, label: t.qaUploadDocument, bg: "#e5f0fb", color: "#1f5fa8" },
  ]

  return (
    <Card className="min-w-0 gap-0 rounded-2xl border p-5 shadow-none">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <Avatar className="size-16">
            <AvatarFallback className="text-xl font-bold text-white" style={{ background: p.color }}>
              {p.initials}
            </AvatarFallback>
          </Avatar>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-heading text-lg font-bold">{p.name}</span>
              <span
                className={cn(
                  "rounded-full px-2.5 py-0.5 text-[11px] font-bold",
                  p.status === "active" ? "bg-[#e3f3e6] text-[#227a44]" : "bg-muted text-muted-foreground",
                )}
              >
                {p.status === "active" ? t.patientsStatusActive : t.patientsStatusInactive}
              </span>
            </div>
            <div className="mt-1 text-[12.5px] text-muted-foreground">
              {p.ageFull[lang]} &nbsp;|&nbsp; {p.gender[lang]} &nbsp;|&nbsp; {t.patientDobFullLabel}: {p.dob}
            </div>
            <div className="mt-0.5 text-[12.5px] text-muted-foreground">
              {t.patientIdFullLabel}: {p.patientCode}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button className="gap-1.5 rounded-full font-bold">
            <Stethoscope className="size-4" strokeWidth={2} />
            {t.startConsultation}
          </Button>
          <Button variant="outline" size="icon" className="rounded-full" aria-label="More options">
            <MoreVertical className="size-4" />
          </Button>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap gap-1 border-b">
        {tabs.map((tabItem) => (
          <button
            key={tabItem.key}
            onClick={() => setTab(tabItem.key)}
            className={cn(
              "flex items-center gap-1.5 border-b-2 px-3 py-2 text-[12.5px] font-bold whitespace-nowrap transition-colors",
              tab === tabItem.key ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            <tabItem.icon className="size-3.5" strokeWidth={2} />
            {t[tabItem.labelKey]}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <div className="flex flex-col gap-4">
          {tab === "overview" && (
            <>
              <div className="rounded-[14px] border p-4">
                <div className="mb-1 flex items-center justify-between">
                  <h3 className="font-heading text-[14.5px] font-bold">{t.basicInfoTitle}</h3>
                  <button className="flex cursor-pointer items-center gap-1 text-xs font-bold text-primary">
                    <Pencil className="size-3" strokeWidth={2.4} />
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

              <div>
                <div className="mb-2 flex items-center justify-between">
                  <h3 className="font-heading text-[14.5px] font-bold">{t.allergiesTitle}</h3>
                  <button className="flex cursor-pointer items-center gap-1 text-xs font-bold text-primary">
                    <Plus className="size-3" strokeWidth={2.6} />
                    {t.addLabel}
                  </button>
                </div>
                {p.allergies.length === 0 ? (
                  <div className="rounded-[10px] bg-[#e3f3e6] px-3.5 py-2.5 text-[13px] font-semibold text-[#227a44]">
                    {t.noKnownAllergies}
                  </div>
                ) : (
                  <div className="rounded-[10px] bg-[#fbe7e5] px-3.5 py-2.5 text-[13px] font-semibold text-[#b03a2e]">
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
                <div className="flex items-center gap-1.5 rounded-[10px] bg-[#e3f3e6] px-3.5 py-2.5 text-[13px] font-semibold text-[#227a44]">
                  <CircleCheck className="size-4" strokeWidth={2} />
                  {t.noCurrentMedications}
                </div>
              </div>
            </>
          )}

          {tab === "history" && (
            <div className="rounded-[14px] border p-4">
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
            <div className="rounded-[14px] border p-4">
              <h3 className="mb-3 font-heading text-[14.5px] font-bold">{t.tabVaccinationsFull}</h3>
              <div className="flex flex-col divide-y">
                {vaccinations.map((row, i) => (
                  <div key={i} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                    <div className="flex size-8 shrink-0 items-center justify-center rounded-[10px] bg-[#e5f0fb]">
                      <Syringe className="size-4" style={{ color: "#1f5fa8" }} strokeWidth={1.8} />
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
            <div className="rounded-[14px] border p-4">
              <h3 className="mb-3 font-heading text-[14.5px] font-bold">{t.tabPrescriptionsFull}</h3>
              <div className="flex flex-col divide-y">
                {prescriptions.map((rx) => (
                  <div key={rx.id} className="py-3 first:pt-0 last:pb-0">
                    <div className="flex items-center justify-between">
                      <span className="text-[13px] font-bold">{rx.id}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-[11.5px] text-muted-foreground">{rx.date}</span>
                        <Badge variant={rx.status === "rxStatusActive" ? "default" : "secondary"}>{t[rx.status]}</Badge>
                      </div>
                    </div>
                    <div className="mt-1 text-[12.5px] text-muted-foreground">
                      {t.diagnosisLabel}: {rx.diagnosis}
                    </div>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {rx.medications.map((med) => (
                        <span key={med.name} className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold">
                          {med.name}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {tab === "growth" && (
            <div className="rounded-[14px] border p-4">
              <h3 className="mb-3 font-heading text-[14.5px] font-bold">{t.tabGrowthFull}</h3>
              <div className="flex flex-col divide-y">
                {growth.map((row, i) => (
                  <div key={i} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                    <div className="flex size-8 shrink-0 items-center justify-center rounded-[10px] bg-[#eef4ea]">
                      <LineChart className="size-4" style={{ color: "#3f7d52" }} strokeWidth={1.8} />
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
            <div className="rounded-[14px] border p-4">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="font-heading text-[14.5px] font-bold">{t.tabDocuments}</h3>
                <button className="flex cursor-pointer items-center gap-1 text-xs font-bold text-primary">
                  <Upload className="size-3" strokeWidth={2.4} />
                  {t.qaUploadDocument}
                </button>
              </div>
              {documents.length === 0 ? (
                <div className="rounded-[10px] bg-muted px-3.5 py-2.5 text-[13px] font-semibold text-muted-foreground">
                  {t.noDocumentsUploaded}
                </div>
              ) : (
                <div className="flex flex-col divide-y">
                  {documents.map((doc, i) => (
                    <div key={i} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                      <div className="flex size-8 shrink-0 items-center justify-center rounded-[10px] bg-[#fdf3c7]">
                        {doc.type === "pdf" ? (
                          <FileText className="size-4" style={{ color: "#a8862c" }} strokeWidth={1.8} />
                        ) : (
                          <ImageIcon className="size-4" style={{ color: "#a8862c" }} strokeWidth={1.8} />
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
        </div>

        <div className="flex flex-col gap-4">
          <div>
            <div className="mb-1 flex items-center justify-between">
              <h3 className="font-heading text-[14.5px] font-bold">{t.recentVisitsTitle}</h3>
              <span className="cursor-pointer text-xs font-bold text-primary">{t.viewAll} →</span>
            </div>
            <div className="flex flex-col divide-y">
              {visits.map((visit, i) => (
                <div key={i} className="flex items-center justify-between gap-2 py-2.5">
                  <div className="min-w-0">
                    <div className="text-[12.5px] font-bold whitespace-nowrap">{visit.date}</div>
                    <div className="truncate text-[11.5px] text-muted-foreground">{visit.type}</div>
                  </div>
                  <div className="shrink-0 text-[11.5px] text-muted-foreground">{visit.doctor}</div>
                </div>
              ))}
            </div>
          </div>

          <div>
            <h3 className="mb-2.5 font-heading text-[14.5px] font-bold">{t.quickTitle}</h3>
            <div className="grid grid-cols-2 gap-2.5">
              {quickActions.map((action) => (
                <button
                  key={action.label}
                  className="flex cursor-pointer flex-col items-center gap-2 rounded-xl border p-3.5 text-center transition-all hover:-translate-y-0.5 hover:border-primary hover:shadow-md"
                >
                  <div className="flex size-9 items-center justify-center rounded-[10px]" style={{ background: action.bg }}>
                    {action.logo ? (
                      <action.icon className="size-[18px]" />
                    ) : (
                      <action.icon className="size-[18px]" style={{ color: action.color }} strokeWidth={1.8} />
                    )}
                  </div>
                  <div className="text-[11.5px] leading-tight font-bold">{action.label}</div>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </Card>
  )
}
