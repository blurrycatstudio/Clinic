import { useState } from "react"
import { Card } from "@/components/ui/card"
import { Switch } from "@/components/ui/switch"
import { useLang } from "@/lib/i18n"
import type { Strings } from "@/lib/i18n"

type Rule = {
  key: string
  titleKey: keyof Strings
  descKey: keyof Strings
}

const RULES: Rule[] = [
  { key: "confirm", titleKey: "r1Title", descKey: "r1Desc" },
  { key: "vaccine", titleKey: "r2Title", descKey: "r2Desc" },
  { key: "missed", titleKey: "r3Title", descKey: "r3Desc" },
]

export function AutomationPanel() {
  const { t } = useLang()
  const [master, setMaster] = useState(true)
  const [rules, setRules] = useState({ confirm: true, vaccine: true, missed: true, after: false })

  const toggleRule = (key: keyof typeof rules) => setRules((prev) => ({ ...prev, [key]: !prev[key] }))

  return (
    <div className="flex w-full shrink-0 flex-col gap-4.5 lg:w-95">
      <Card className="gap-0 rounded-2xl border p-4.5 shadow-none">
        <div className="flex items-start justify-between gap-2.5">
          <div className="min-w-0 flex-1">
            <h3 className="text-[15px] font-bold">{t.waMasterLabel}</h3>
            <p className="mt-1.5 text-[11.5px] text-muted-foreground">{t.waMasterDesc}</p>
          </div>
          <Switch checked={master} onCheckedChange={setMaster} className="mt-0.5 shrink-0" />
        </div>
      </Card>

      <Card className="gap-0 rounded-2xl border p-4.5 shadow-none">
        <h3 className="mb-3.5 text-[15px] font-bold">{t.waRulesTitle}</h3>
        <div className="flex flex-col gap-3.5">
          {RULES.map((rule) => (
            <div key={rule.key} className="flex items-start justify-between gap-2.5">
              <div className="min-w-0 flex-1">
                <div className="text-[13px] font-bold">{t[rule.titleKey]}</div>
                <div className="mt-0.5 text-[11.5px] text-muted-foreground">{t[rule.descKey]}</div>
              </div>
              <Switch
                checked={rules[rule.key as keyof typeof rules]}
                onCheckedChange={() => toggleRule(rule.key as keyof typeof rules)}
                className="mt-0.5 shrink-0"
              />
            </div>
          ))}
          <div className="flex items-start justify-between gap-2.5">
            <div className="min-w-0 flex-1">
              <div className="text-[13px] font-bold">{t.r4Title}</div>
              <div className="mt-0.5 text-[11.5px] text-muted-foreground">{t.r4Desc}</div>
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
