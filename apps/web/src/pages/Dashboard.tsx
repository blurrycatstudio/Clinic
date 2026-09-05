import { PatientSnapshotCard } from "@/components/dashboard/PatientSnapshotCard"
import { TodaysScheduleCard } from "@/components/dashboard/TodaysScheduleCard"

export default function Dashboard() {
  return (
    <div className="flex h-[calc(100vh-9.5rem)] min-h-[560px] items-start gap-5">
      <TodaysScheduleCard />
      <PatientSnapshotCard />
    </div>
  )
}
