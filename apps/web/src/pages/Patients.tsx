import { useMemo, useState } from "react"
import { Dialog } from "radix-ui"
import { Baby, Plus, Search, Syringe, UserRound, X } from "lucide-react"
import { PatientSnapshotCard } from "@/components/dashboard/PatientSnapshotCard"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { useLang } from "@/lib/i18n"
import { PATIENTS, type Patient } from "@/lib/data"
import { cn } from "@/lib/utils"

type StatusFilter = "all" | "active" | "inactive"

function PatientProfileDialog({ patient, onOpenChange }: { patient: Patient | null; onOpenChange: (v: boolean) => void }) {
  if (!patient) return null

  return (
    <Dialog.Root open={!!patient} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm" />
        <Dialog.Content className="fixed top-1/2 left-1/2 z-50 max-h-[90vh] w-full max-w-3xl -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl">
          <Dialog.Title className="sr-only">{patient.name}</Dialog.Title>
          <Dialog.Close className="absolute top-3 right-3 z-10 flex size-8 shrink-0 items-center justify-center rounded-[9px] border border-border bg-card hover:bg-muted">
            <X className="size-4" strokeWidth={2} />
          </Dialog.Close>
          <PatientSnapshotCard patient={patient} />
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

export default function Patients() {
  const { t } = useLang()
  const [query, setQuery] = useState("")
  const [status, setStatus] = useState<StatusFilter>("all")
  const [viewing, setViewing] = useState<Patient | null>(null)

  const filtered = useMemo(
    () =>
      PATIENTS.filter((p) => status === "all" || p.status === status).filter((p) => {
        if (!query.trim()) return true
        const q = query.toLowerCase()
        return p.name.toLowerCase().includes(q) || p.guardian.toLowerCase().includes(q)
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
      <div className="mb-5 flex items-start justify-between">
        <div>
          <h1 className="font-heading text-2xl font-bold">{t.patientsPageTitle}</h1>
          <p className="mt-0.5 text-[13.5px] text-muted-foreground">{t.patientsPageSub}</p>
        </div>
        <Button className="gap-1.5 rounded-[10px] font-bold">
          <Plus className="size-3.5" strokeWidth={2.4} />
          {t.patientsNewBtn}
        </Button>
      </div>

      <div className="mb-4.5 grid grid-cols-3 gap-4">
        <Card className="gap-0 rounded-2xl border p-4.5 shadow-none">
          <div className="flex items-center gap-2.5">
            <div className="flex size-9.5 items-center justify-center rounded-[10px] bg-accent">
              <Baby className="size-[19px] text-primary" strokeWidth={1.8} />
            </div>
            <div className="text-[13px] font-semibold text-muted-foreground">{t.patientsStatTotal}</div>
          </div>
          <div className="font-heading mt-2 text-[26px] font-bold">{stats.total}</div>
        </Card>
        <Card className="gap-0 rounded-2xl border p-4.5 shadow-none">
          <div className="flex items-center gap-2.5">
            <div className="flex size-9.5 items-center justify-center rounded-[10px]" style={{ background: "#e3f3e6" }}>
              <UserRound className="size-[19px]" style={{ color: "#227a44" }} strokeWidth={1.8} />
            </div>
            <div className="text-[13px] font-semibold text-muted-foreground">{t.patientsStatActive}</div>
          </div>
          <div className="font-heading mt-2 text-[26px] font-bold text-[#227a44]">{stats.active}</div>
        </Card>
        <Card className="gap-0 rounded-2xl border p-4.5 shadow-none">
          <div className="flex items-center gap-2.5">
            <div className="flex size-9.5 items-center justify-center rounded-[10px]" style={{ background: "#e5f0fb" }}>
              <Syringe className="size-[19px]" style={{ color: "#1f5fa8" }} strokeWidth={1.8} />
            </div>
            <div className="text-[13px] font-semibold text-muted-foreground">{t.patientsStatUpcoming}</div>
          </div>
          <div className="font-heading mt-2 text-[26px] font-bold text-[#1f5fa8]">{stats.upcoming}</div>
        </Card>
      </div>

      <Card className="gap-0 rounded-2xl border p-4.5 shadow-none">
        <div className="mb-4 flex items-center gap-3">
          <div className="relative max-w-90 flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t.patientsSearchPh}
              className="h-9 rounded-full border-border pl-10 text-[13px]"
            />
          </div>
          <div className="flex items-center gap-1.5 rounded-full border border-border p-[3px]">
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
    </div>
  )
}
