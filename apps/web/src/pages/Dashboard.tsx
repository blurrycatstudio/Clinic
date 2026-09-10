import { useEffect, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { PatientSnapshotCard } from "@/components/dashboard/PatientSnapshotCard"
import { TodaysScheduleCard } from "@/components/dashboard/TodaysScheduleCard"
import { api } from "@/lib/api"
import { toDisplayAppointment, type ApiAppointment, type DisplayAppointment } from "@/lib/appointments"

export default function Dashboard() {
  const [selected, setSelected] = useState<DisplayAppointment | null>(null)

  const today = new Date().toISOString().slice(0, 10)
  const { data } = useQuery({
    queryKey: ["appointments", "today", today],
    queryFn: () => api.get<{ rows: ApiAppointment[]; count: number }>(`/appointments?date=${today}&limit=100`),
    refetchInterval: 30_000,
  })

  // Default to the first appointment of the day so the panel isn't empty on load.
  useEffect(() => {
    if (selected || !data?.rows.length) return
    setSelected(toDisplayAppointment(data.rows[0]))
  }, [data, selected])

  return (
    <div className="flex flex-col items-start gap-5 lg:h-[calc(100vh-10.25rem)] lg:min-h-[560px] lg:flex-row">
      <TodaysScheduleCard selectedId={selected?.id ?? null} onSelect={setSelected} />
      <PatientSnapshotCard appointment={selected} />
    </div>
  )
}
