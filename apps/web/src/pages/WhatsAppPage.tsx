import { AutomationPanel } from "@/components/whatsapp/AutomationPanel"
import { ManualMessaging } from "@/components/whatsapp/ManualMessaging"
import { TemplatesCard } from "@/components/whatsapp/TemplatesCard"
import { useLang } from "@/lib/i18n"

export default function WhatsAppPage() {
  const { t } = useLang()

  return (
    <div>
      <div className="mb-5">
        <h1 className="font-heading text-2xl font-bold">{t.waPageTitle}</h1>
        <p className="mt-0.5 text-[13.5px] text-muted-foreground">{t.waPageSub}</p>
      </div>

      <div className="flex items-start gap-5">
        <div className="flex flex-col gap-4.5">
          <AutomationPanel />
          <TemplatesCard />
        </div>
        <ManualMessaging />
      </div>
    </div>
  )
}
