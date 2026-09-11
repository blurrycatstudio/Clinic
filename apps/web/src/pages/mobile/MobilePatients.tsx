import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { useNavigate } from "react-router-dom"
import { Baby, ChevronRight, Search, TriangleAlert } from "lucide-react"
import { MobileShell } from "@/components/mobile/MobileShell"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { useLang } from "@/lib/i18n"
import { api } from "@/lib/api"
import { colorFor, initialsFor } from "@/lib/appointments"

type ApiPatient = {
  id: string
  full_name: string
  phone_e164: string
  date_of_birth: string | null
  allergies: string[]
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

/** Mobile-first patient roster — tapping a patient opens the same detailed record view (/mobile/records/:patientId) used from the schedule/consultation flows. */
export default function MobilePatients() {
  const { t } = useLang()
  const navigate = useNavigate()
  const [query, setQuery] = useState("")

  const { data, isLoading, error } = useQuery({
    queryKey: ["patients", "mobile-list", query],
    queryFn: () =>
      api.get<{ rows: ApiPatient[]; count: number }>(
        `/patients?limit=100${query.trim() ? `&search=${encodeURIComponent(query.trim())}` : ""}`,
      ),
  })

  const patients = data?.rows ?? []

  return (
    <MobileShell title={t.mobilePatientsTitle} onBack={() => navigate("/mobile/dashboard")}>
      <div className="flex flex-col gap-3 px-4 py-4">
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t.mobilePatientsSearchPh}
            className="h-10 rounded-full border-border pl-10 text-[13px]"
          />
        </div>

        {isLoading ? (
          <div className="flex flex-col gap-2">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="h-16 animate-pulse rounded-2xl bg-muted" />
            ))}
          </div>
        ) : error ? (
          <div className="py-16 text-center text-[13px] text-destructive">{t.mobilePatientsError}</div>
        ) : patients.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
            <div className="flex size-14 items-center justify-center rounded-2xl border border-border bg-accent">
              <Baby className="size-6 text-primary" strokeWidth={1.6} />
            </div>
            <p className="text-sm text-muted-foreground">{t.mobilePatientsEmpty}</p>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {patients.map((p) => {
              const age = ageFromDob(p.date_of_birth)
              return (
                <Card
                  key={p.id}
                  onClick={() => navigate(`/mobile/records/${p.id}`)}
                  className="cursor-pointer gap-0 rounded-2xl border p-3 shadow-none hover:bg-muted/40"
                >
                  <div className="flex items-center gap-2.5">
                    <Avatar className="size-9.5 shrink-0">
                      <AvatarFallback style={{ background: colorFor(p.id) }} className="text-[11px] font-bold text-white">
                        {initialsFor(p.full_name)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[13.5px] font-bold">{p.full_name}</div>
                      <div className="truncate text-[11.5px] text-muted-foreground">
                        {age ? `${age} · ` : ""}
                        {p.phone_e164}
                      </div>
                    </div>
                    {p.allergies.length > 0 && <TriangleAlert className="size-4 shrink-0 text-destructive" strokeWidth={2.2} />}
                    <ChevronRight className="size-4 shrink-0 text-muted-foreground/60" />
                  </div>
                </Card>
              )
            })}
          </div>
        )}
      </div>
    </MobileShell>
  )
}
