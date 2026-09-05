import { useState } from "react"
import { CheckCircle2, Clock, Syringe } from "lucide-react"
import { Card } from "@/components/ui/card"
import { Switch } from "@/components/ui/switch"
import { useLang } from "@/lib/i18n"
import type { Strings } from "@/lib/i18n"

type Rule = {
  key: string
  icon: React.ElementType
  iconBg: string
  iconColor: string
  titleKey: keyof Strings
  descKey: keyof Strings
}

const RULES: Rule[] = [
  { key: "confirm", icon: CheckCircle2, iconBg: "var(--accent)", iconColor: "var(--primary)", titleKey: "r1Title", descKey: "r1Desc" },
  { key: "vaccine", icon: Syringe, iconBg: "#fbe5d9", iconColor: "#e2764a", titleKey: "r2Title", descKey: "r2Desc" },
  { key: "missed", icon: Clock, iconBg: "#e5f0fb", iconColor: "#1f5fa8", titleKey: "r3Title", descKey: "r3Desc" },
]

export function AutomationPanel() {
  const { t } = useLang()
  const [master, setMaster] = useState(true)
  const [rules, setRules] = useState({ confirm: true, vaccine: true, missed: true, after: false })

  const toggleRule = (key: keyof typeof rules) => setRules((prev) => ({ ...prev, [key]: !prev[key] }))

  return (
    <div className="flex w-95 shrink-0 flex-col gap-4.5">
      <Card className="gap-0 rounded-2xl border p-4.5 shadow-none">
        <div className="flex items-start justify-between">
          <div>
            <h3 className="font-heading text-[15px] font-bold">{t.waMasterLabel}</h3>
            <p className="mt-1.5 max-w-62 text-[11.5px] text-muted-foreground">{t.waMasterDesc}</p>
          </div>
          <Switch checked={master} onCheckedChange={setMaster} />
        </div>
        <div className="mt-3 inline-block rounded-[10px] bg-accent px-3 py-2 text-xs font-bold text-accent-foreground">
          {t.waSentToday}
        </div>
      </Card>

      <Card className="gap-0 rounded-2xl border p-4.5 shadow-none">
        <h3 className="font-heading mb-3.5 text-[15px] font-bold">{t.waRulesTitle}</h3>
        <div className="flex flex-col gap-3.5">
          {RULES.map((rule) => (
            <div key={rule.key} className="flex items-start justify-between gap-2.5">
              <div className="flex gap-2.5">
                <div
                  className="flex size-8 shrink-0 items-center justify-center rounded-[9px]"
                  style={{ background: rule.iconBg }}
                >
                  <rule.icon className="size-4" style={{ color: rule.iconColor }} strokeWidth={1.8} />
                </div>
                <div>
                  <div className="text-[13px] font-bold">{t[rule.titleKey]}</div>
                  <div className="mt-0.5 text-[11.5px] text-muted-foreground">{t[rule.descKey]}</div>
                </div>
              </div>
              <Switch
                checked={rules[rule.key as keyof typeof rules]}
                onCheckedChange={() => toggleRule(rule.key as keyof typeof rules)}
                className="mt-0.5 shrink-0"
              />
            </div>
          ))}
          <div className="flex items-start justify-between gap-2.5">
            <div className="flex gap-2.5">
              <div className="flex size-8 shrink-0 items-center justify-center rounded-[9px] bg-muted">
                <Clock className="size-4 text-muted-foreground" strokeWidth={1.8} />
              </div>
              <div>
                <div className="text-[13px] font-bold">{t.r4Title}</div>
                <div className="mt-0.5 text-[11.5px] text-muted-foreground">{t.r4Desc}</div>
              </div>
            </div>
            <Switch
              checked={rules.after}
              onCheckedChange={() => toggleRule("after")}
              className="mt-0.5 shrink-0"
            />
          </div>
        </div>
      </Card>
    </div>
  )
}
