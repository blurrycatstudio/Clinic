import { PatientSnapshotCard } from "@/components/dashboard/PatientSnapshotCard"
import { TodaysScheduleCard } from "@/components/dashboard/TodaysScheduleCard"

export default function Dashboard() {
  return (
    <div className="flex flex-col items-start gap-5 lg:h-[calc(100vh-10.25rem)] lg:min-h-[560px] lg:flex-row">
      <TodaysScheduleCard />
      <PatientSnapshotCard />
    </div>
  )
}
