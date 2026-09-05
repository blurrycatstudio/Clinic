import { useState } from "react"
import { ChevronDown } from "lucide-react"
import { Collapsible } from "radix-ui"
import { PatientSnapshotCard } from "@/components/dashboard/PatientSnapshotCard"
import { StatsGrid } from "@/components/dashboard/StatsGrid"
import { TodaysScheduleCard } from "@/components/dashboard/TodaysScheduleCard"
import { useLang } from "@/lib/i18n"
import { cn } from "@/lib/utils"

export default function Dashboard() {
  const [open, setOpen] = useState(true)
  const { t } = useLang()

  return (
    <div className="flex flex-col gap-5">
      <div className="rounded-2xl bg-accent/50 p-5">
        <Collapsible.Root open={open} onOpenChange={setOpen}>
          <div className="flex items-center justify-between gap-3">
            <Collapsible.Trigger className="flex items-center gap-1.5 font-heading text-base font-bold text-foreground">
              <ChevronDown className={cn("size-4 text-muted-foreground transition-transform", !open && "-rotate-90")} strokeWidth={2.4} />
              {t.statsOverviewTitle}
            </Collapsible.Trigger>
            <span className="text-xs text-muted-foreground">
              {t.lastUpdatedLabel}: {t.lastUpdatedValue}
            </span>
          </div>
          <Collapsible.Content className="pt-4">
            <StatsGrid />
          </Collapsible.Content>
        </Collapsible.Root>
      </div>

      <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.7fr)]">
        <TodaysScheduleCard />
        <PatientSnapshotCard />
      </div>
    </div>
  )
}
