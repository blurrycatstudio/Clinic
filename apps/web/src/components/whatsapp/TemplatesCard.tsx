import { Card } from "@/components/ui/card"
import { useLang } from "@/lib/i18n"
import { TEMPLATES } from "@/lib/data"

export function TemplatesCard() {
  const { t } = useLang()

  return (
    <Card className="w-95 shrink-0 gap-0 rounded-2xl border p-4.5 shadow-none">
      <h3 className="font-heading mb-3 text-[15px] font-bold">{t.waTemplatesTitle}</h3>
      <div className="flex flex-col gap-2.5">
        {TEMPLATES.map((tpl) => (
          <div key={tpl.titleKey} className="rounded-xl border p-3 transition-colors hover:border-primary">
            <div className="mb-1.5 flex items-center justify-between">
              <div className="text-[13px] font-bold">{t[tpl.titleKey]}</div>
              <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-bold text-muted-foreground">
                es-MX
              </span>
            </div>
            <div className="mb-1.5 text-[11px] text-muted-foreground">{t[tpl.metaKey]}</div>
            <div className="rounded-lg bg-muted/60 px-2.5 py-2 text-[11.5px] leading-relaxed">{tpl.body}</div>
          </div>
        ))}
      </div>
    </Card>
  )
}
