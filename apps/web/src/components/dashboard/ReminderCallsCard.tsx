import { useEffect, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { PhoneCall } from "lucide-react"
import { Card } from "@/components/ui/card"
import { Switch } from "@/components/ui/switch"
import { api } from "@/lib/api"
import { useToast } from "@/lib/toast"

type ClinicSettings = {
  id: string
  reminder_call_enabled: boolean
  reminder_call_hours_before: number
}

/** Lets staff turn on automated confirmation calls before appointments, and set how far ahead they fire. */
export function ReminderCallsCard() {
  const toast = useToast()
  const queryClient = useQueryClient()

  const { data } = useQuery({
    queryKey: ["settings"],
    queryFn: () => api.get<{ settings: ClinicSettings }>("/settings"),
  })
  const settings = data?.settings

  const [hoursBefore, setHoursBefore] = useState(3)
  useEffect(() => {
    if (settings) setHoursBefore(settings.reminder_call_hours_before)
  }, [settings])

  const update = useMutation({
    mutationFn: (patch: Partial<Pick<ClinicSettings, "reminder_call_enabled" | "reminder_call_hours_before">>) =>
      api.patch<{ settings: ClinicSettings }>("/settings", patch),
    onSuccess: (res) => {
      queryClient.setQueryData(["settings"], res)
      toast("Reminder call settings updated")
    },
    onError: () => toast("Failed to update reminder call settings"),
  })

  if (!settings) return null

  return (
    <Card className="gap-0 rounded-2xl border p-4.5 shadow-none">
      <div className="flex items-start justify-between gap-2.5">
        <div className="flex min-w-0 flex-1 gap-2.5">
          <div className="flex size-8 shrink-0 items-center justify-center rounded-[9px] bg-accent">
            <PhoneCall className="size-4 text-primary" strokeWidth={1.8} />
          </div>
          <div className="min-w-0">
            <h3 className="font-heading text-[15px] font-bold">Reminder Calls</h3>
            <p className="mt-1.5 text-[11.5px] text-muted-foreground">
              Automatically call patients to confirm their appointment ahead of time.
            </p>
          </div>
        </div>
        <Switch
          checked={settings.reminder_call_enabled}
          onCheckedChange={(checked) => update.mutate({ reminder_call_enabled: checked })}
          className="mt-0.5 shrink-0"
        />
      </div>

      <div className="mt-4 flex items-center gap-2.5">
        <label className="text-[12.5px] font-semibold text-foreground">Call this many hours before:</label>
        <input
          type="number"
          min={1}
          max={72}
          value={hoursBefore}
          onChange={(e) => setHoursBefore(Number(e.target.value))}
          onBlur={() => {
            if (hoursBefore !== settings.reminder_call_hours_before && hoursBefore >= 1 && hoursBefore <= 72) {
              update.mutate({ reminder_call_hours_before: hoursBefore })
            }
          }}
          disabled={!settings.reminder_call_enabled}
          className="h-8 w-16 rounded-md border border-border bg-transparent px-2 text-[12.5px] outline-none focus-visible:border-ring disabled:opacity-50"
        />
        <span className="text-[12.5px] text-muted-foreground">hours</span>
      </div>
    </Card>
  )
}
