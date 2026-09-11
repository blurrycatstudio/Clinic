import { ManualMessaging } from "@/components/whatsapp/ManualMessaging"
import { useLang } from "@/lib/i18n"

export default function WhatsAppPage() {
  const { t } = useLang()

  return (
    <div className="-m-3 bg-white p-3 sm:-m-5 sm:p-5">
      <div className="mb-5">
        <h1 className="font-heading text-2xl font-bold">{t.waPageTitle}</h1>
        <p className="mt-0.5 text-[13.5px] text-muted-foreground">{t.waPageSub}</p>
      </div>

      <ManualMessaging />
    </div>
  )
}
