import { useState } from "react"
import { Phone } from "lucide-react"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Card } from "@/components/ui/card"
import { useLang } from "@/lib/i18n"
import { HISTORY, type PatientTab } from "@/lib/data"
import { cn } from "@/lib/utils"

const TABS: { key: PatientTab; labelKey: "patientTabHistory" | "patientTabVaccinations" | "patientTabAllergies" | "patientTabNotes" }[] = [
  { key: "history", labelKey: "patientTabHistory" },
  { key: "vaccinations", labelKey: "patientTabVaccinations" },
  { key: "allergies", labelKey: "patientTabAllergies" },
  { key: "notes", labelKey: "patientTabNotes" },
]

export function PatientDetailsCard() {
  const { t, lang } = useLang()
  const [tab, setTab] = useState<PatientTab>("history")
  const rows = HISTORY[tab][lang]

  return (
    <Card className="gap-0 rounded-2xl border p-5 shadow-none">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="font-heading text-base font-bold">{t.patientTitle}</h2>
        <span className="cursor-pointer text-xs font-bold text-primary">{t.doctorEdit}</span>
      </div>
      <div className="mb-3 flex items-center gap-3">
        <Avatar className="size-13">
          <AvatarFallback className="bg-gradient-to-br from-[#e2764a] to-[#c05a30] text-[16px] font-bold text-white">
            ET
          </AvatarFallback>
        </Avatar>
        <div>
          <div className="flex items-center gap-1.5">
            <span className="text-[14.5px] font-bold">Emilia Torres</span>
            <span className="rounded-full bg-[#e3f3e6] px-2 py-0.5 text-[10px] font-bold text-[#227a44]">
              {t.patientReturning}
            </span>
          </div>
          <div className="mt-0.5 text-[11.5px] text-muted-foreground">
            {t.patientIdLabel}: P-20458 · {t.patientDob}: 14 Mar 2022
          </div>
        </div>
      </div>
      <div className="mb-3.5 rounded-[10px] bg-muted px-3 py-2.5 text-[12.5px]">
        <div className="font-bold">
          {t.patientGuardianLabel}: {t.guardianName}
        </div>
        <div className="mt-1 flex items-center gap-1.5 text-muted-foreground">
          <Phone className="size-3.5" strokeWidth={1.8} />
          +52 664 123 4567
        </div>
      </div>

      <div className="mb-3 flex gap-1.5 border-b">
        {TABS.map((tabItem) => (
          <button
            key={tabItem.key}
            onClick={() => setTab(tabItem.key)}
            className={cn(
              "border-b-2 px-3 py-1.5 text-xs font-bold transition-colors",
              tab === tabItem.key ? "border-primary text-primary" : "border-transparent text-muted-foreground",
            )}
          >
            {t[tabItem.labelKey]}
          </button>
        ))}
      </div>

      <div className="flex max-h-52.5 flex-col gap-2.5 overflow-y-auto">
        {rows.map((row, i) => (
          <div key={i} className="border-b pb-2.5 last:border-0">
            <div className="flex justify-between text-xs">
              <span className="font-bold">{row.type}</span>
              <span className="text-muted-foreground">{row.date}</span>
            </div>
            <div className="mt-0.5 text-[11.5px] text-muted-foreground">{row.details}</div>
          </div>
        ))}
      </div>

      <div className="mt-3 text-right">
        <span className="cursor-pointer text-xs font-bold text-primary">{t.patientViewFull} →</span>
      </div>
    </Card>
  )
}
