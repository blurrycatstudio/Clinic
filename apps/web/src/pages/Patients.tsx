import { useEffect, useMemo, useState } from "react"
import { Dialog } from "radix-ui"
import { Baby, Phone, Plus, Search, Syringe, TriangleAlert, UserRound, X } from "lucide-react"
import { useLocation, useNavigate } from "react-router-dom"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { PhoneInput } from "@/components/ui/phone-input"
import { useLang } from "@/lib/i18n"
import { HISTORY, PATIENTS, type Patient } from "@/lib/data"
import { cn } from "@/lib/utils"
import { useToast } from "@/lib/toast"

type StatusFilter = "all" | "active" | "inactive"

function NewPatientDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const toast = useToast()
  const [name, setName] = useState("")
  const [guardianPhone, setGuardianPhone] = useState("")

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm" />
        <Dialog.Content className="fixed top-1/2 left-1/2 z-50 max-h-[90vh] w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl border border-border bg-card p-5 shadow-2xl sm:p-6">
          <div className="mb-5 flex items-center justify-between">
            <Dialog.Title className="font-heading text-xl font-bold">New Patient</Dialog.Title>
            <Dialog.Close className="flex size-8 items-center justify-center rounded-[9px] border border-border hover:bg-muted">
              <X className="size-4" strokeWidth={2} />
            </Dialog.Close>
          </div>
          <div className="flex flex-col gap-4">
            <div>
              <label className="mb-1.5 block text-xs font-bold">Full name</label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Child's full name" className="h-9" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1.5 block text-xs font-bold">Date of birth</label>
                <Input type="date" className="h-9" />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-bold">Guardian phone</label>
                <PhoneInput value={guardianPhone} onChange={setGuardianPhone} placeholder="664 000 0000" className="h-9" />
              </div>
            </div>
          </div>
          <div className="mt-6 flex justify-end gap-2.5">
            <Dialog.Close asChild>
              <Button variant="outline" className="rounded-lg font-bold">
                Cancel
              </Button>
            </Dialog.Close>
            <Button
              onClick={() => {
                toast(name.trim() ? `${name.trim()} added to patients` : "New patient added")
                setName("")
                onOpenChange(false)
              }}
              className="rounded-lg font-bold"
            >
              Save
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

function PatientProfileDialog({ patient, onOpenChange }: { patient: Patient | null; onOpenChange: (v: boolean) => void }) {
  const { t, lang } = useLang()
  const navigate = useNavigate()
  if (!patient) return null
  const history = HISTORY.history[lang]

  return (
    <Dialog.Root open={!!patient} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm" />
        <Dialog.Content className="fixed top-1/2 left-1/2 z-50 max-h-[90vh] w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl border border-border bg-card p-5 shadow-2xl sm:p-6">
          <Dialog.Title className="sr-only">{patient.name}</Dialog.Title>
          <div className="mb-4 flex items-start justify-between">
            <div className="flex items-center gap-3">
              <Avatar className="size-12">
                <AvatarFallback className="font-bold text-white" style={{ background: patient.color }}>
                  {patient.initials}
                </AvatarFallback>
              </Avatar>
              <div>
                <div className="font-heading text-lg font-bold">{patient.name}</div>
                <div className="text-xs text-muted-foreground">
                  {patient.ageFull[lang]} · {patient.gender[lang]} · {t.patientDobFullLabel}: {patient.dob}
                </div>
              </div>
            </div>
            <Dialog.Close className="flex size-8 shrink-0 items-center justify-center rounded-[9px] border border-border hover:bg-muted">
              <X className="size-4" strokeWidth={2} />
            </Dialog.Close>
          </div>

          <div className="mb-4 flex items-center gap-2 rounded-xl bg-muted px-3.5 py-2.5 text-[13px]">
            <Phone className="size-3.5 text-muted-foreground" strokeWidth={1.8} />
            <span className="font-semibold">{patient.guardian}</span>
            <span className="text-muted-foreground">· {patient.guardianPhone}</span>
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

          <div className="mb-5">
            <div className="mb-1.5 text-xs font-bold">{t.tabMedicalHistory}</div>
            <div className="flex flex-col divide-y">
              {history.map((row, i) => (
                <div key={i} className="py-2 first:pt-0 last:pb-0">
                  <div className="flex items-center justify-between text-[12.5px]">
                    <span className="font-bold">{row.type}</span>
                    <span className="text-muted-foreground">{row.date}</span>
                  </div>
                  <div className="mt-0.5 text-[11.5px] text-muted-foreground">{row.details}</div>
                </div>
              ))}
            </div>
          </div>

          <Button
            onClick={() => {
              onOpenChange(false)
              navigate("/appointments")
            }}
            className="w-full rounded-lg font-bold"
          >
            View live appointments →
          </Button>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

export default function Patients() {
  const { t } = useLang()
  const location = useLocation()
  const [query, setQuery] = useState(() => (location.state as { query?: string } | null)?.query ?? "")
  const [status, setStatus] = useState<StatusFilter>("all")
  const [viewing, setViewing] = useState<Patient | null>(null)
  const [newOpen, setNewOpen] = useState(false)

  useEffect(() => {
    const state = location.state as { openPatientId?: string; query?: string } | null
    if (state?.openPatientId) {
      const match = PATIENTS.find((p) => p.id === state.openPatientId)
      if (match) setViewing(match)
    }
    if (state?.query !== undefined) setQuery(state.query)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.state])

  const filtered = useMemo(
    () =>
      PATIENTS.filter((p) => status === "all" || p.status === status).filter((p) => {
        if (!query.trim()) return true
        const q = query.toLowerCase()
        return (
          p.name.toLowerCase().includes(q) ||
          p.guardian.toLowerCase().includes(q) ||
          p.guardianPhone.replace(/\s+/g, "").includes(q.replace(/\s+/g, ""))
        )
      }),
    [query, status],
  )

  const stats = useMemo(
    () => ({
      total: PATIENTS.length,
      active: PATIENTS.filter((p) => p.status === "active").length,
      upcoming: PATIENTS.filter((p) => p.nextVisit).length,
    }),
    [],
  )

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
            <div className="flex size-9.5 items-center justify-center rounded-[10px]" style={{ background: "#e3f3e6" }}>
              <UserRound className="size-[19px]" style={{ color: "#227a44" }} strokeWidth={1.8} />
            </div>
            <div className="text-[13px] font-semibold text-muted-foreground">{t.patientsStatActive}</div>
          </div>
          <div className="mt-2 text-[26px] font-bold text-[#227a44]">{stats.active}</div>
        </Card>
        <Card className="gap-0 rounded-2xl border p-4.5 shadow-none">
          <div className="flex items-center gap-2.5">
            <div className="flex size-9.5 items-center justify-center rounded-[10px]" style={{ background: "#e5f0fb" }}>
              <Syringe className="size-[19px]" style={{ color: "#1f5fa8" }} strokeWidth={1.8} />
            </div>
            <div className="text-[13px] font-semibold text-muted-foreground">{t.patientsStatUpcoming}</div>
          </div>
          <div className="mt-2 text-[26px] font-bold text-[#1f5fa8]">{stats.upcoming}</div>
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
          <div className="flex flex-wrap items-center gap-1.5 rounded-full border border-border p-[3px]">
            {(
              [
                ["all", t.patientsFilterAll],
                ["active", t.patientsFilterActive],
                ["inactive", t.patientsFilterInactive],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setStatus(key)}
                className={cn(
                  "rounded-full px-3.5 py-1.5 text-xs font-bold transition-colors",
                  status === key ? "bg-primary text-primary-foreground" : "text-foreground hover:bg-muted",
                )}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="ml-auto text-xs font-bold text-muted-foreground">
            {filtered.length} {t.patientsCount}
          </div>
        </div>

        {filtered.length === 0 ? (
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
                  {[t.thPatient, t.patientsColAge, t.patientsColGuardian, t.patientsColLastVisit, t.patientsColNext, t.patientsColStatus].map((label, i) => (
                    <th key={i} className="px-2 pb-2.5 text-left text-[11.5px] font-bold tracking-wide text-muted-foreground uppercase first:pl-0">
                      {label}
                    </th>
                  ))}
                  <th className="px-2 pb-2.5 pr-0 text-right text-[11.5px] font-bold tracking-wide text-muted-foreground uppercase">{t.patientsColActions}</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((p) => (
                  <tr key={p.id} className="border-b border-border last:border-0 hover:bg-muted/60">
                    <td className="py-3 pr-2 pl-0">
                      <div className="flex items-center gap-2.5">
                        <div className="flex size-8.5 shrink-0 items-center justify-center rounded-full text-[12px] font-bold text-white" style={{ background: p.color }}>
                          {p.initials}
                        </div>
                        <div className="text-[13.5px] font-bold">{p.name}</div>
                      </div>
                    </td>
                    <td className="px-2 py-3 text-[13px] whitespace-nowrap">{p.age}</td>
                    <td className="px-2 py-3 text-[13px]">{p.guardian}</td>
                    <td className="px-2 py-3 text-[13px] whitespace-nowrap">{p.lastVisit}</td>
                    <td className="px-2 py-3 text-[13px] whitespace-nowrap text-muted-foreground">{p.nextVisit ?? "—"}</td>
                    <td className="px-2 py-3">
                      <span
                        className={cn(
                          "rounded-full px-2.5 py-1 text-[11.5px] font-bold whitespace-nowrap",
                          p.status === "active" ? "bg-[#e3f3e6] text-[#227a44]" : "bg-muted text-muted-foreground",
                        )}
                      >
                        {p.status === "active" ? t.patientsStatusActive : t.patientsStatusInactive}
                      </span>
                    </td>
                    <td className="py-3 pr-0 pl-2 text-right whitespace-nowrap">
                      <Button variant="outline" size="sm" className="rounded-lg font-semibold" onClick={() => setViewing(p)}>
                        {t.patientsView}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <PatientProfileDialog patient={viewing} onOpenChange={(open) => !open && setViewing(null)} />
      <NewPatientDialog open={newOpen} onOpenChange={setNewOpen} />
    </div>
  )
}
