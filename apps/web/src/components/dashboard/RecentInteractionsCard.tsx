import { useState } from "react"
import { Card } from "@/components/ui/card"
import { PhoneCallIcon } from "@/components/icons/PhoneCallIcon"
import { WhatsAppIcon } from "@/components/icons/WhatsAppIcon"
import { useLang } from "@/lib/i18n"
import { RECENT_CALLS, RECENT_WA, TAG_COLORS } from "@/lib/data"
import { cn } from "@/lib/utils"

export function RecentInteractionsCard() {
  const { t, lang } = useLang()
  const [tab, setTab] = useState<"whatsapp" | "calls">("whatsapp")
  const source = tab === "whatsapp" ? RECENT_WA : RECENT_CALLS

  return (
    <Card className="min-w-0 flex-1 gap-0 rounded-2xl border p-4.5 shadow-none">
      <div className="mb-3.5 flex items-center justify-between">
        <h2 className="font-heading text-[15px] font-bold">{t.recentTitle}</h2>
        <span className="cursor-pointer text-xs font-bold text-primary">{t.recentViewAll}</span>
      </div>
      <div className="mb-3 flex gap-1.5">
        {(["whatsapp", "calls"] as const).map((tabKey) => (
          <button
            key={tabKey}
            onClick={() => setTab(tabKey)}
            className={cn(
              "rounded-full px-3.5 py-1.5 text-xs font-bold transition-colors",
              tab === tabKey ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted",
            )}
          >
            {tabKey === "whatsapp" ? t.recentTabWa : t.recentTabCalls}
          </button>
        ))}
      </div>
      <div className="flex flex-col">
        {source.map((r, i) => {
          const tc = TAG_COLORS[r.tag]
          return (
            <div key={i} className="flex items-start gap-2.5 rounded-[10px] px-1.5 py-2.5 hover:bg-muted/60">
              <div className="mt-0.5 flex size-7.5 shrink-0 items-center justify-center rounded-full border border-border">
                {tab === "whatsapp" ? (
                  <WhatsAppIcon className="size-6" />
                ) : (
                  <PhoneCallIcon className="size-6" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-[13px] font-bold">{r.name}</div>
                <div className="truncate text-[11.5px] text-muted-foreground">{lang === "en" ? r.en : r.es}</div>
              </div>
              <div className="shrink-0 text-right">
                <div className="text-[11px] text-muted-foreground">{r.time}</div>
                <span
                  className="mt-0.5 inline-block rounded-full px-1.5 py-0.5 text-[10.5px] font-bold"
                  style={{ background: tc.bg, color: tc.color }}
                >
                  {t[r.tag]}
                </span>
              </div>
            </div>
          )
        })}
      </div>
    </Card>
  )
}
