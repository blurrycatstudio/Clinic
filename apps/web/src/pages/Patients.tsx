import { useEffect, useMemo, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Dialog } from "radix-ui"
import { Baby, Phone, Plus, Search, TriangleAlert, UserRound, X } from "lucide-react"
import { useLocation, useNavigate } from "react-router-dom"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { PhoneInput } from "@/components/ui/phone-input"
import { LOCALE, useLang } from "@/lib/i18n"
import { useToast } from "@/lib/toast"
import { api } from "@/lib/api"
import { colorFor, initialsFor } from "@/lib/appointments"

type ApiPatient = {
  id: string
  full_name: string
  phone_e164: string
  date_of_birth: string | null
  allergies: string[]
  current_medications: string[]
  created_at: string
}

type ApiConsultation = {
  id: string
  chief_complaint: string
  diagnosis: string
  created_at: string
}

function ageFromDob(dob: string | null, yearsAbbr: string, monthsAbbr: string): string | null {
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
  return years > 0 ? `${years}${yearsAbbr} ${months}${monthsAbbr}` : `${months}${monthsAbbr}`
}

function NewPatientDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const { t } = useLang()
  const toast = useToast()
  const queryClient = useQueryClient()
  const [name, setName] = useState("")
  const [dob, setDob] = useState("")
  const [guardianPhone, setGuardianPhone] = useState("")

  function reset() {
    setName("")
    setDob("")
    setGuardianPhone("")
  }

  const createMutation = useMutation({
    mutationFn: () =>
      api.post("/patients", {
        fullName: name.trim(),
        phoneE164: guardianPhone.trim(),
        dateOfBirth: dob || null,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["patients"] })
      toast(t.patientsNewModalSaved.replace("{name}", name.trim()))
      reset()
      onOpenChange(false)
    },
    onError: () => toast(t.patientsNewModalFailed),
  })

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(v) => {
        if (!v) reset()
        onOpenChange(v)
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm" />
        <Dialog.Content className="fixed top-1/2 left-1/2 z-50 max-h-[90vh] w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl border border-border bg-card p-5 shadow-2xl sm:p-6">
          <div className="mb-5 flex items-center justify-between">
            <Dialog.Title className="font-heading text-xl font-bold">{t.patientsNewModalTitle}</Dialog.Title>
            <Dialog.Close className="flex size-8 items-center justify-center rounded-[9px] border border-border hover:bg-muted">
              <X className="size-4" strokeWidth={2} />
            </Dialog.Close>
          </div>
          <div className="flex flex-col gap-4">
            <div>
              <label className="mb-1.5 block text-xs font-bold">{t.patientsNewModalNameLabel}</label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={t.patientsNewModalNamePh} className="h-9" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1.5 block text-xs font-bold">{t.patientDobFullLabel}</label>
                <Input type="date" className="h-9" value={dob} onChange={(e) => setDob(e.target.value)} />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-bold">{t.patientsNewModalPhoneLabel}</label>
                <PhoneInput value={guardianPhone} onChange={setGuardianPhone} placeholder="664 000 0000" className="h-9" />
              </div>
            </div>
          </div>
          <div className="mt-6 flex justify-end gap-2.5">
            <Dialog.Close asChild>
              <Button variant="outline" className="rounded-lg font-bold">
                {t.rxModalCancel}
              </Button>
            </Dialog.Close>
            <Button
              onClick={() => createMutation.mutate()}
              disabled={!name.trim() || !guardianPhone.trim() || createMutation.isPending}
              className="rounded-lg font-bold"
            >
              {t.apptsSaveBtn}
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

function PatientProfileDialog({ patient, onOpenChange }: { patient: ApiPatient | null; onOpenChange: (v: boolean) => void }) {
  const { t, lang } = useLang()
  const navigate = useNavigate()

  const consultationsQuery = useQuery({
    queryKey: ["consultations", patient?.id],
    queryFn: () => api.get<{ rows: ApiConsultation[]; count: number }>(`/consultations?patientId=${patient!.id}&limit=10`),
    enabled: !!patient,
  })

  if (!patient) return null
  const age = ageFromDob(patient.date_of_birth, t.ageYearsAbbr, t.ageMonthsAbbr)
  const initials = initialsFor(patient.full_name)
  const color = colorFor(patient.id)
  const history = consultationsQuery.data?.rows ?? []

  return (
    <Dialog.Root open={!!patient} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm" />
        <Dialog.Content className="fixed top-1/2 left-1/2 z-50 max-h-[90vh] w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl border border-border bg-card p-5 shadow-2xl sm:p-6">
          <Dialog.Title className="sr-only">{patient.full_name}</Dialog.Title>
          <div className="mb-4 flex items-start justify-between">
            <div className="flex items-center gap-3">
              <Avatar className="size-12">
                <AvatarFallback className="font-bold text-white" style={{ background: color }}>
                  {initials}
                </AvatarFallback>
              </Avatar>
              <div>
                <div className="font-heading text-lg font-bold">{patient.full_name}</div>
                <div className="text-xs text-muted-foreground">
                  {age ?? "—"}
                  {patient.date_of_birth && ` · ${t.patientDobFullLabel}: ${new Date(patient.date_of_birth).toLocaleDateString(LOCALE[lang])}`}
                </div>
              </div>
            </div>
            <Dialog.Close className="flex size-8 shrink-0 items-center justify-center rounded-[9px] border border-border hover:bg-muted">
              <X className="size-4" strokeWidth={2} />
            </Dialog.Close>
          </div>

          <div className="mb-4 flex items-center gap-2 rounded-xl bg-muted px-3.5 py-2.5 text-[13px]">
            <Phone className="size-3.5 text-muted-foreground" strokeWidth={1.8} />
            <span className="font-semibold">{patient.phone_e164}</span>
          </div>

          <div className="mb-4">
            <div className="mb-1.5 flex items-center gap-2 text-xs font-bold">
              <TriangleAlert className="size-3.5 text-[#DC2626]" strokeWidth={2} />
              {t.allergiesTitle}
            </div>
            {patient.allergies.length === 0 ? (
              <div className="rounded-lg bg-[#DCFCE7] px-3 py-2 text-[12.5px] font-semibold text-[#16A34A]">{t.noKnownAllergies}</div>
            ) : (
              <div className="rounded-lg bg-[#FEF2F2] px-3 py-2 text-[12.5px] font-semibold text-[#DC2626]">{patient.allergies.join(", ")}</div>
            )}
          </div>

          <div className="mb-4">
            <div className="mb-1.5 text-xs font-bold">{t.mobileConsultCurrentMeds}</div>
            <div className="rounded-lg bg-muted px-3 py-2 text-[12.5px] font-semibold text-muted-foreground">
              {patient.current_medications.length ? patient.current_medications.join(", ") : t.mobileConsultNoMeds}
            </div>
          </div>

          <div className="mb-5">
            <div className="mb-1.5 text-xs font-bold">{t.tabMedicalHistory}</div>
            {history.length === 0 ? (
              <p className="text-[12.5px] text-muted-foreground">{t.patientProfileNoHistory}</p>
            ) : (
              <div className="flex flex-col divide-y">
                {history.map((row) => (
                  <div key={row.id} className="py-2 first:pt-0 last:pb-0">
                    <div className="flex items-center justify-between text-[12.5px]">
                      <span className="font-bold">{row.diagnosis || row.chief_complaint || "—"}</span>
                      <span className="text-muted-foreground">{new Date(row.created_at).toLocaleDateString(LOCALE[lang])}</span>
                    </div>
                    {row.diagnosis && row.chief_complaint && <div className="mt-0.5 text-[11.5px] text-muted-foreground">{row.chief_complaint}</div>}
                  </div>
                ))}
              </div>
            )}
          </div>

          <Button
            onClick={() => {
              onOpenChange(false)
              navigate("/appointments")
            }}
            className="w-full rounded-lg font-bold"
          >
            {t.patientsViewAppointments}
          </Button>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

export default function Patients() {
  const { t } = useLang()
  const location = useLocation()
  const navigate = useNavigate()
  const [query, setQuery] = useState(() => (location.state as { query?: string } | null)?.query ?? "")
  const [viewingId, setViewingId] = useState<string | null>(
    () => (location.state as { openPatientId?: string } | null)?.openPatientId ?? null,
  )
  const [newOpen, setNewOpen] = useState(false)

  useEffect(() => {
    const state = location.state as { openPatientId?: string; query?: string } | null
    if (state?.openPatientId) setViewingId(state.openPatientId)
    if (state?.query !== undefined) setQuery(state.query)
    if (state) navigate(location.pathname, { replace: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.state])

  const { data, isLoading, error } = useQuery({
    queryKey: ["patients", "desktop-list", query],
    queryFn: () => api.get<{ rows: ApiPatient[]; count: number }>(`/patients?limit=200${query.trim() ? `&search=${encodeURIComponent(query.trim())}` : ""}`),
  })

  const patients = data?.rows ?? []
  const viewing = patients.find((p) => p.id === viewingId) ?? null

  const stats = useMemo(() => {
    const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000
    return {
      total: data?.count ?? patients.length,
      withAllergies: patients.filter((p) => p.allergies.length > 0).length,
      newLast30: patients.filter((p) => new Date(p.created_at).getTime() >= thirtyDaysAgo).length,
    }
  }, [data])

  return (
    <div>
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="font-heading text-2xl font-bold">{t.patientsPageTitle}</h1>
          <p className="mt-0.5 text-[13.5px] text-muted-foreground">{t.patientsPageSub}</p>
        </div>
        <Button onClick={() => setNewOpen(true)} className="gap-1.5 self-start rounded-[10px] font-bold">
          <Plus className="size-3.5" strokeWidth={2.4} />
          {t.patientsNewBtn}
        </Button>
      </div>

      <div className="mb-4.5 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card className="gap-0 rounded-2xl border p-4.5 shadow-none">
          <div className="flex items-center gap-2.5">
            <div className="flex size-9.5 items-center justify-center rounded-[10px] bg-accent">
              <Baby className="size-[19px] text-primary" strokeWidth={1.8} />
            </div>
            <div className="text-[13px] font-semibold text-muted-foreground">{t.patientsStatTotal}</div>
          </div>
          <div className="mt-2 text-[26px] font-bold">{stats.total}</div>
        </Card>
        <Card className="gap-0 rounded-2xl border p-4.5 shadow-none">
          <div className="flex items-center gap-2.5">
            <div className="flex size-9.5 items-center justify-center rounded-[10px]" style={{ background: "#FEF2F2" }}>
              <TriangleAlert className="size-[19px]" style={{ color: "#DC2626" }} strokeWidth={1.8} />
            </div>
            <div className="text-[13px] font-semibold text-muted-foreground">{t.patientsStatAllergies}</div>
          </div>
          <div className="mt-2 text-[26px] font-bold text-[#DC2626]">{stats.withAllergies}</div>
        </Card>
        <Card className="gap-0 rounded-2xl border p-4.5 shadow-none">
          <div className="flex items-center gap-2.5">
            <div className="flex size-9.5 items-center justify-center rounded-[10px]" style={{ background: "#e3f3e6" }}>
              <UserRound className="size-[19px]" style={{ color: "#227a44" }} strokeWidth={1.8} />
            </div>
            <div className="text-[13px] font-semibold text-muted-foreground">{t.patientsStatNew}</div>
          </div>
          <div className="mt-2 text-[26px] font-bold text-[#227a44]">{stats.newLast30}</div>
        </Card>
      </div>

      <Card className="gap-0 rounded-2xl border p-4.5 shadow-none">
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <div className="relative max-w-90 min-w-0 flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t.patientsSearchPh}
              className="h-9 rounded-full border-border pl-10 text-[13px]"
            />
          </div>
          <div className="ml-auto text-xs font-bold text-muted-foreground">
            {patients.length} {t.patientsCount}
          </div>
        </div>

        {isLoading ? (
          <div className="flex flex-col gap-2">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="h-12 animate-pulse rounded-xl bg-muted" />
            ))}
          </div>
        ) : error ? (
          <div className="py-16 text-center text-[13px] text-destructive">{t.patientsLoadError}</div>
        ) : patients.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
            <div className="flex size-14 items-center justify-center rounded-2xl border border-border bg-accent">
              <Baby className="size-6 text-primary" strokeWidth={1.6} />
            </div>
            <p className="text-sm text-muted-foreground">{t.patientsEmpty}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-border">
                  {[t.thPatient, t.patientsColAge, t.patientsColPhone, t.patientsColAllergies].map((label, i) => (
                    <th key={i} className="px-2 pb-2.5 text-left text-[11.5px] font-bold tracking-wide text-muted-foreground uppercase first:pl-0">
                      {label}
                    </th>
                  ))}
                  <th className="px-2 pb-2.5 pr-0 text-right text-[11.5px] font-bold tracking-wide text-muted-foreground uppercase">{t.patientsColActions}</th>
                </tr>
              </thead>
              <tbody>
                {patients.map((p) => {
                  const age = ageFromDob(p.date_of_birth, t.ageYearsAbbr, t.ageMonthsAbbr)
                  return (
                    <tr key={p.id} className="border-b border-border last:border-0 hover:bg-muted/60">
                      <td className="py-3 pr-2 pl-0">
                        <div className="flex items-center gap-2.5">
                          <div
                            className="flex size-8.5 shrink-0 items-center justify-center rounded-full text-[12px] font-bold text-white"
                            style={{ background: colorFor(p.id) }}
                          >
                            {initialsFor(p.full_name)}
                          </div>
                          <div className="text-[13.5px] font-bold">{p.full_name}</div>
                        </div>
                      </td>
                      <td className="px-2 py-3 text-[13px] whitespace-nowrap">{age ?? "—"}</td>
                      <td className="px-2 py-3 text-[13px] whitespace-nowrap">{p.phone_e164}</td>
                      <td className="px-2 py-3">
                        {p.allergies.length > 0 ? (
                          <span className="rounded-full bg-[#FEF2F2] px-2.5 py-1 text-[11.5px] font-bold whitespace-nowrap text-[#DC2626]">{p.allergies.join(", ")}</span>
                        ) : (
                          <span className="text-[12.5px] text-muted-foreground">{t.noKnownAllergies}</span>
                        )}
                      </td>
                      <td className="py-3 pr-0 pl-2 text-right whitespace-nowrap">
                        <Button variant="outline" size="sm" className="rounded-lg font-semibold" onClick={() => setViewingId(p.id)}>
                          {t.patientsView}
                        </Button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <PatientProfileDialog patient={viewing} onOpenChange={(open) => !open && setViewingId(null)} />
      <NewPatientDialog open={newOpen} onOpenChange={setNewOpen} />
    </div>
  )
}
