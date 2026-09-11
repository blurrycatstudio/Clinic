import { ListChecks, Star } from "lucide-react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Card } from "@/components/ui/card"
import { Switch } from "@/components/ui/switch"
import { api } from "@/lib/api"
import { useToast } from "@/lib/toast"

// Mirrors packages/shared/src/types/menu.ts MENU_OPTION_KEYS — kept in sync manually,
// same as the rest of this dashboard's local mirrors of the API's shared types.
type MenuOptionKey = "book" | "reschedule" | "cancel" | "info" | "human" | "status"

const MAX_FEATURED = 3

const MENU_OPTIONS: { key: MenuOptionKey; label: string; description: string }[] = [
  { key: "book", label: "Book Appointment", description: "Patients can start a new booking." },
  { key: "reschedule", label: "Reschedule Appointment", description: "Patients can move an existing appointment." },
  { key: "cancel", label: "Cancel Appointment", description: "Patients can cancel an existing appointment." },
  { key: "info", label: "Clinic Information", description: "Hours, address, parking, fees and insurance FAQs." },
  { key: "human", label: "Contact Support", description: "Escalates the chat for staff to take over." },
  { key: "status", label: "Check Appointment Status", description: "Patients can look up their upcoming appointments." },
]

type ClinicSettings = {
  id: string
  enabled_menu_options: MenuOptionKey[]
  featured_menu_options: MenuOptionKey[]
}

/** Lets staff choose which options the WhatsApp bot's main menu offers patients, and which (up to 3) show as always-visible quick-action buttons. */
export function MenuOptionsCard() {
  const toast = useToast()
  const queryClient = useQueryClient()

  const { data } = useQuery({
    queryKey: ["settings"],
    queryFn: () => api.get<{ settings: ClinicSettings }>("/settings"),
  })
  const settings = data?.settings

  const update = useMutation({
    mutationFn: (patch: Partial<Pick<ClinicSettings, "enabled_menu_options" | "featured_menu_options">>) =>
      api.patch<{ settings: ClinicSettings }>("/settings", patch),
    onSuccess: (res) => {
      queryClient.setQueryData(["settings"], res)
      toast("Menu options updated")
    },
    onError: () => toast("Failed to update menu options"),
  })

  if (!settings) return null

  const enabled = new Set(settings.enabled_menu_options)
  const featured = new Set(settings.featured_menu_options)

  function toggleEnabled(key: MenuOptionKey, checked: boolean) {
    if (!settings) return
    const next = checked
      ? [...settings.enabled_menu_options, key]
      : settings.enabled_menu_options.filter((k) => k !== key)

    // The bot needs at least one option to show — block turning the last one off.
    if (next.length === 0) {
      toast("At least one menu option must stay enabled")
      return
    }

    // Turning an option off can't leave it featured.
    const nextFeatured = checked
      ? settings.featured_menu_options
      : settings.featured_menu_options.filter((k) => k !== key)

    update.mutate(
      nextFeatured.length !== settings.featured_menu_options.length
        ? { enabled_menu_options: next, featured_menu_options: nextFeatured }
        : { enabled_menu_options: next },
    )
  }

  function toggleFeatured(key: MenuOptionKey) {
    if (!settings) return
    if (featured.has(key)) {
      update.mutate({ featured_menu_options: settings.featured_menu_options.filter((k) => k !== key) })
      return
    }
    if (settings.featured_menu_options.length >= MAX_FEATURED) {
      toast(`You can feature up to ${MAX_FEATURED} quick-action buttons`)
      return
    }
    update.mutate({ featured_menu_options: [...settings.featured_menu_options, key] })
  }

  return (
    <Card className="gap-0 rounded-2xl border p-4.5 shadow-none">
      <div className="mb-3.5 flex items-center gap-2.5">
        <div className="flex size-8 shrink-0 items-center justify-center rounded-[9px] bg-accent">
          <ListChecks className="size-4 text-primary" strokeWidth={1.8} />
        </div>
        <div className="min-w-0">
          <h3 className="font-heading text-[15px] font-bold">Menu Options</h3>
          <p className="mt-0.5 text-[11.5px] text-muted-foreground">
            Choose what patients see in the WhatsApp bot's main menu. Star up to {MAX_FEATURED} as quick-action
            buttons shown right away, above the full list.
          </p>
        </div>
      </div>
      <div className="flex flex-col gap-3.5">
        {MENU_OPTIONS.map((option) => {
          const isEnabled = enabled.has(option.key)
          const isFeatured = featured.has(option.key)
          return (
            <div key={option.key} className="flex items-start justify-between gap-2.5">
              <div className="flex min-w-0 flex-1 items-start gap-2">
                <button
                  type="button"
                  onClick={() => toggleFeatured(option.key)}
                  disabled={!isEnabled}
                  title={isFeatured ? "Remove quick-action button" : "Show as a quick-action button"}
                  className="mt-0.5 shrink-0 cursor-pointer disabled:cursor-not-allowed disabled:opacity-30"
                >
                  <Star
                    className={isFeatured ? "size-3.5 fill-primary text-primary" : "size-3.5 text-muted-foreground"}
                    strokeWidth={1.8}
                  />
                </button>
                <div className="min-w-0">
                  <div className="text-[13px] font-bold">{option.label}</div>
                  <div className="mt-0.5 text-[11.5px] text-muted-foreground">{option.description}</div>
                </div>
              </div>
              <Switch
                checked={isEnabled}
                onCheckedChange={(checked) => toggleEnabled(option.key, checked)}
                className="mt-0.5 shrink-0"
              />
            </div>
          )
        })}
      </div>
    </Card>
  )
}
