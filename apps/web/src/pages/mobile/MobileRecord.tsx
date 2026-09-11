import { useMemo } from "react"
import { useQuery } from "@tanstack/react-query"
import { useNavigate, useParams } from "react-router-dom"
import { CalendarPlus, TriangleAlert } from "lucide-react"
import { MobileShell } from "@/components/mobile/MobileShell"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useLang } from "@/lib/i18n"
import { api } from "@/lib/api"
import { colorFor, initialsFor } from "@/lib/appointments"
import type { ApiPrescription } from "@/pages/Prescriptions"

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
  patient_id: string
  chief_complaint: string
  diagnosis: string
  notes: string
  weight_kg: number | null
  height_cm: number | null
  temperature_c: number | null
  created_at: string
}

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

function Sparkline({ points, color }: { points: { x: string; y: number }[]; color: string }) {
  if (points.length < 2) return null
  const values = points.map((p) => p.y)
  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = max - min || 1
  const w = 300
  const h = 90
  const stepX = w / (points.length - 1)
  const coords = points.map((p, i) => {
    const x = i * stepX
    const y = h - ((p.y - min) / span) * (h - 16) - 8
    return `${x},${y}`
  })
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-24 w-full" preserveAspectRatio="none">
      <polyline points={coords.join(" ")} fill="none" stroke={color} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
      {points.map((p, i) => {
        const [x, y] = coords[i].split(",")
        return <circle key={p.x} cx={x} cy={y} r={3} fill={color} />
      })}
    </svg>
  )
}

export default function MobileRecord() {
  const { t } = useLang()
  const navigate = useNavigate()
  const { patientId } = useParams<{ patientId: string }>()

  const patientQuery = useQuery({
    queryKey: ["patient", patientId],
    queryFn: () => api.get<{ patient: ApiPatient; upcomingAppointments: unknown[] }>(`/patients/${patientId}`),
    enabled: !!patientId,
  })
  const patient = patientQuery.data?.patient

  const consultationsQuery = useQuery({
    queryKey: ["consultations", patientId],
    queryFn: () => api.get<{ rows: ApiConsultation[]; count: number }>(`/consultations?patientId=${patientId}&limit=50`),
    enabled: !!patientId,
  })
  const consultations = useMemo(
    () => (consultationsQuery.data?.rows ?? []).slice().sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()),
    [consultationsQuery.data],
  )
  const latestConsult = consultations[consultations.length - 1]

  const prescriptionsQuery = useQuery({
    queryKey: ["prescriptions", patientId],
    queryFn: () => api.get<{ rows: ApiPrescription[]; count: number }>(`/prescriptions?patientId=${patientId}&limit=50`),
    enabled: !!patientId,
  })
  const prescriptions = prescriptionsQuery.data?.rows ?? []

  const weightPoints = useMemo(
    () => consultations.filter((c) => c.weight_kg != null).map((c) => ({ x: c.id, y: c.weight_kg as number })),
    [consultations],
  )
  const heightPoints = useMemo(
    () => consultations.filter((c) => c.height_cm != null).map((c) => ({ x: c.id, y: c.height_cm as number })),
    [consultations],
  )

  const loading = patientQuery.isLoading
  const error = patientQuery.error

  if (loading) {
    return (
      <MobileShell title={t.mobileRecordTitle} onBack={() => navigate(-1)}>
        <div className="flex flex-col gap-3 px-4 py-4">
          <div className="h-28 animate-pulse rounded-2xl bg-muted" />
          <div className="h-40 animate-pulse rounded-2xl bg-muted" />
        </div>
      </MobileShell>
    )
  }

  if (error || !patient) {
    return (
      <MobileShell title={t.mobileRecordTitle} onBack={() => navigate(-1)}>
        <div className="px-4 py-16 text-center text-[13px] text-destructive">{error ? t.mobileRecordError : t.mobileRecordNotFound}</div>
      </MobileShell>
    )
  }

  const age = ageFromDob(patient.date_of_birth)
  const color = colorFor(patient.id)
  const initials = initialsFor(patient.full_name)

  return (
    <MobileShell title={t.mobileRecordTitle} onBack={() => navigate(-1)}>
      <div className="flex flex-col gap-4 px-4 py-4">
        <Card className="gap-0 rounded-2xl border p-4 shadow-none">
          <div className="flex items-center gap-3">
            <Avatar className="size-13 shrink-0">
              <AvatarFallback style={{ background: color }} className="text-[15px] font-bold text-white">
                {initials}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[16px] font-bold">{patient.full_name}</div>
              <div className="truncate text-[12px] text-muted-foreground">
                {age ? `${age} · ` : ""}
                {patient.phone_e164}
              </div>
            </div>
          </div>
          {patient.allergies.length > 0 && (
            <div className="mt-3.5 flex items-center gap-1.5 rounded-xl px-3 py-2.5 text-[12.5px] font-semibold" style={{ background: "#FEF2F2", color: "#DC2626" }}>
              <TriangleAlert className="size-3.5 shrink-0" strokeWidth={2.2} />
              {patient.allergies.join(", ")}
            </div>
          )}
        </Card>

        <Tabs defaultValue="overview">
          <TabsList className="w-full">
            <TabsTrigger value="overview">{t.mobileRecordTabOverview}</TabsTrigger>
            <TabsTrigger value="growth">{t.mobileRecordTabGrowth}</TabsTrigger>
            <TabsTrigger value="rx">{t.mobileRecordTabRx}</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="mt-3 flex flex-col gap-3">
            <Card className="gap-0 rounded-2xl border p-4 shadow-none">
              <div className="mb-3 text-xs font-bold text-muted-foreground uppercase">{t.mobileRecordVitalsLatest}</div>
              {latestConsult ? (
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="rounded-xl bg-[#EFF6FF] py-3">
                    <div className="text-[17px] font-bold text-[#2563EB]">{latestConsult.weight_kg ?? "—"}</div>
                    <div className="text-[10.5px] text-muted-foreground">{t.mobileRecordWeight} kg</div>
                  </div>
                  <div className="rounded-xl bg-[#E3F3E6] py-3">
                    <div className="text-[17px] font-bold text-[#227a44]">{latestConsult.height_cm ?? "—"}</div>
                    <div className="text-[10.5px] text-muted-foreground">{t.mobileRecordHeight} cm</div>
                  </div>
                  <div className="rounded-xl bg-[#FDF1DE] py-3">
                    <div className="text-[17px] font-bold text-[#C2882C]">{latestConsult.temperature_c ?? "—"}</div>
                    <div className="text-[10.5px] text-muted-foreground">{t.mobileRecordTemp} °C</div>
                  </div>
                </div>
              ) : (
                <p className="py-4 text-center text-[12.5px] text-muted-foreground">{t.mobileRecordNoData}</p>
              )}
            </Card>

            <Card className="gap-0 rounded-2xl border p-4 shadow-none">
              <div className="mb-2 text-xs font-bold text-muted-foreground uppercase">{t.mobileConsultCurrentMeds}</div>
              <p className="text-[13px]">{patient.current_medications.length ? patient.current_medications.join(", ") : t.mobileConsultNoMeds}</p>
            </Card>

            <Button onClick={() => navigate("/appointments")} className="w-full gap-1.5 rounded-xl font-bold">
              <CalendarPlus className="size-4" strokeWidth={2.2} />
              {t.mobileRecordBookFollowup}
            </Button>
          </TabsContent>

          <TabsContent value="growth" className="mt-3 flex flex-col gap-3">
            <Card className="gap-0 rounded-2xl border p-4 shadow-none">
              <div className="mb-2 text-xs font-bold text-muted-foreground uppercase">{t.mobileRecordGrowthCurve} — {t.mobileRecordWeight} (kg)</div>
              {weightPoints.length >= 2 ? <Sparkline points={weightPoints} color="#2563EB" /> : <p className="py-6 text-center text-[12.5px] text-muted-foreground">{t.mobileRecordNoData}</p>}
            </Card>
            <Card className="gap-0 rounded-2xl border p-4 shadow-none">
              <div className="mb-2 text-xs font-bold text-muted-foreground uppercase">{t.mobileRecordGrowthCurve} — {t.mobileRecordHeight} (cm)</div>
              {heightPoints.length >= 2 ? <Sparkline points={heightPoints} color="#16A34A" /> : <p className="py-6 text-center text-[12.5px] text-muted-foreground">{t.mobileRecordNoData}</p>}
            </Card>
          </TabsContent>

          <TabsContent value="rx" className="mt-3 flex flex-col gap-2.5">
            {prescriptions.length === 0 ? (
              <p className="py-8 text-center text-[13px] text-muted-foreground">{t.mobileRecordNoRx}</p>
            ) : (
              prescriptions.map((rx) => (
                <Card key={rx.id} className="gap-0 rounded-2xl border p-3.5 shadow-none">
                  <div className="mb-1.5 flex items-center justify-between">
                    <span className="text-[12px] font-bold text-muted-foreground">RX-{1000 + rx.sequence_number}</span>
                    <div className="flex items-center gap-1.5">
                      <span
                        className="rounded-full px-2 py-0.5 text-[10px] font-bold whitespace-nowrap"
                        style={rx.status === "active" ? { background: "#EFF6FF", color: "#2563EB" } : { background: "#F1F5F9", color: "#64748B" }}
                      >
                        {rx.status === "active" ? t.rxStatusActive : t.rxStatusCompleted}
                      </span>
                      <span className="rounded-full px-2 py-0.5 text-[10px] font-bold whitespace-nowrap" style={rx.sent_at ? { background: "#DCFCE7", color: "#16A34A" } : { background: "#FFEDD5", color: "#C2410C" }}>
                        {rx.sent_at ? t.mobileRecordSent : t.mobileRecordDraft}
                      </span>
                    </div>
                  </div>
                  <div className="text-[13px] font-bold">{rx.diagnosis || "—"}</div>
                  <div className="mt-0.5 text-[12px] text-muted-foreground">
                    {rx.prescription_items.length === 1 ? rx.prescription_items[0].name : `${rx.prescription_items[0]?.name ?? ""} +${rx.prescription_items.length - 1}`}
                  </div>
                  <div className="mt-1.5 text-[11px] text-muted-foreground">{new Date(rx.created_at).toLocaleDateString()}</div>
                </Card>
              ))
            )}
          </TabsContent>
        </Tabs>
      </div>
    </MobileShell>
  )
}
