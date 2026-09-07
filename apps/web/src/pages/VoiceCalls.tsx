import { useMemo, useState } from "react"
import { Loader2, Phone, PhoneCall, PhoneIncoming, PhoneMissed, PhoneOutgoing, Play, Search } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { useLang } from "@/lib/i18n"
import { CALL_LOGS, type CallDirection } from "@/lib/data"
import { cn } from "@/lib/utils"
import { useToast } from "@/lib/toast"

type Filter = "all" | CallDirection

const DIRECTION_META: Record<CallDirection, { icon: React.ElementType; color: string; bg: string; labelKey: "incoming" | "outgoing" | "missed" }> = {
  incoming: { icon: PhoneIncoming, color: "#1f5fa8", bg: "#e5f0fb", labelKey: "incoming" },
  outgoing: { icon: PhoneOutgoing, color: "#227a44", bg: "#e3f3e6", labelKey: "outgoing" },
  missed: { icon: PhoneMissed, color: "#b03a2e", bg: "#fbe7e5", labelKey: "missed" },
}

export default function VoiceCalls() {
  const { t } = useLang()
  const toast = useToast()
  const [query, setQuery] = useState("")
  const [filter, setFilter] = useState<Filter>("all")
  const [playingId, setPlayingId] = useState<string | null>(null)

  function playRecording(id: string, name: string) {
    if (playingId) return
    setPlayingId(id)
    toast(`Playing recording — ${name}`)
    setTimeout(() => setPlayingId(null), 2500)
  }

  function callBack(phone: string, name: string) {
    toast(`Calling ${name}…`)
    window.location.href = `tel:${phone.replace(/\s+/g, "")}`
  }

  const filtered = useMemo(
    () =>
      CALL_LOGS.filter((c) => filter === "all" || c.direction === filter).filter((c) => {
        if (!query.trim()) return true
        const q = query.toLowerCase()
        return c.name.toLowerCase().includes(q) || c.phone.includes(q)
      }),
    [query, filter],
  )

  const stats = useMemo(() => {
    const total = CALL_LOGS.filter((c) => c.date === "Today").length
    const missed = CALL_LOGS.filter((c) => c.direction === "missed").length
    const answered = CALL_LOGS.filter((c) => c.direction !== "missed")
    const avgSec =
      answered.reduce((sum, c) => {
        const [m, s] = c.duration.split(":").map(Number)
        return sum + m * 60 + s
      }, 0) / (answered.length || 1)
    const answerRate = Math.round((answered.length / CALL_LOGS.length) * 100)
    return {
      total,
      missed,
      avg: `${Math.floor(avgSec / 60)}:${String(Math.round(avgSec % 60)).padStart(2, "0")}`,
      answerRate,
    }
  }, [])

  return (
    <div>
      <div className="mb-5">
        <h1 className="font-heading text-2xl font-bold">{t.callsPageTitle}</h1>
        <p className="mt-0.5 text-[13.5px] text-muted-foreground">{t.callsPageSub}</p>
      </div>

      <div className="mb-4.5 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Card className="gap-0 rounded-2xl border p-4.5 shadow-none">
          <div className="mb-3 flex size-9.5 items-center justify-center rounded-[10px] bg-accent">
            <Phone className="size-[19px] text-primary" strokeWidth={1.8} />
          </div>
          <div className="text-[13px] font-semibold text-muted-foreground">{t.callsStatTotal}</div>
          <div className="mt-0.5 text-[26px] font-bold">{stats.total}</div>
        </Card>
        <Card className="gap-0 rounded-2xl border p-4.5 shadow-none">
          <div className="mb-3 flex size-9.5 items-center justify-center rounded-[10px]" style={{ background: "#fbe7e5" }}>
            <PhoneMissed className="size-[19px]" style={{ color: "#b03a2e" }} strokeWidth={1.8} />
          </div>
          <div className="text-[13px] font-semibold text-muted-foreground">{t.callsStatMissed}</div>
          <div className="mt-0.5 text-[26px] font-bold text-[#b03a2e]">{stats.missed}</div>
        </Card>
        <Card className="gap-0 rounded-2xl border p-4.5 shadow-none">
          <div className="mb-3 flex size-9.5 items-center justify-center rounded-[10px]" style={{ background: "#e5f0fb" }}>
            <PhoneCall className="size-[19px]" style={{ color: "#1f5fa8" }} strokeWidth={1.8} />
          </div>
          <div className="text-[13px] font-semibold text-muted-foreground">{t.callsStatAvgDuration}</div>
          <div className="mt-0.5 text-[26px] font-bold text-[#1f5fa8]">{stats.avg}</div>
        </Card>
        <Card className="gap-0 rounded-2xl border p-4.5 shadow-none">
          <div className="mb-3 flex size-9.5 items-center justify-center rounded-[10px]" style={{ background: "#e3f3e6" }}>
            <PhoneIncoming className="size-[19px]" style={{ color: "#227a44" }} strokeWidth={1.8} />
          </div>
          <div className="text-[13px] font-semibold text-muted-foreground">{t.callsStatAnswerRate}</div>
          <div className="mt-0.5 text-[26px] font-bold text-[#227a44]">{stats.answerRate}%</div>
        </Card>
      </div>

      <Card className="gap-0 rounded-2xl border p-4.5 shadow-none">
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <div className="relative max-w-90 min-w-0 flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t.callsSearchPh}
              className="h-9 rounded-full border-border pl-10 text-[13px]"
            />
          </div>
          <div className="flex flex-wrap items-center gap-1.5 rounded-full border border-border p-[3px]">
            {(
              [
                ["all", t.callsFilterAll],
                ["incoming", t.callsFilterIncoming],
                ["outgoing", t.callsFilterOutgoing],
                ["missed", t.callsFilterMissed],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setFilter(key)}
                className={cn(
                  "rounded-full px-3.5 py-1.5 text-xs font-bold transition-colors",
                  filter === key ? "bg-primary text-primary-foreground" : "text-foreground hover:bg-muted",
                )}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="ml-auto text-xs font-bold text-muted-foreground">{filtered.length}</div>
        </div>

        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
            <div className="flex size-14 items-center justify-center rounded-2xl border border-border bg-accent">
              <Phone className="size-6 text-primary" strokeWidth={1.6} />
            </div>
            <p className="text-sm text-muted-foreground">{t.callsEmpty}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
          <div className="flex min-w-[640px] flex-col">
            {filtered.map((c, i) => {
              const meta = DIRECTION_META[c.direction]
              return (
                <div key={c.id} className={cn("flex items-center gap-3.5 py-3.5", i !== 0 && "border-t")}>
                  <div className="flex size-9.5 shrink-0 items-center justify-center rounded-full text-[12px] font-bold text-white" style={{ background: c.color }}>
                    {c.initials}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-[13.5px] font-bold">{c.name}</span>
                      <span
                        className="flex items-center gap-1 rounded-full px-2 py-0.5 text-[10.5px] font-bold whitespace-nowrap"
                        style={{ background: meta.bg, color: meta.color }}
                      >
                        <meta.icon className="size-3" strokeWidth={2.4} />
                        {t[meta.labelKey]}
                      </span>
                    </div>
                    <div className="mt-0.5 truncate text-[12px] text-muted-foreground">{c.note}</div>
                  </div>
                  <div className="w-24 shrink-0 text-right text-[12px] text-muted-foreground whitespace-nowrap">
                    {c.date} · {c.time}
                  </div>
                  <div className="w-14 shrink-0 text-right text-[13px] font-bold whitespace-nowrap">{c.duration}</div>
                  {c.direction === "missed" ? (
                    <Button onClick={() => callBack(c.phone, c.name)} size="sm" className="shrink-0 gap-1 rounded-lg font-semibold">
                      <PhoneOutgoing className="size-3.5" strokeWidth={2.2} />
                      {t.callsCallBack}
                    </Button>
                  ) : (
                    <Button
                      onClick={() => playRecording(c.id, c.name)}
                      disabled={playingId === c.id}
                      variant="outline"
                      size="sm"
                      className="shrink-0 gap-1 rounded-lg font-semibold"
                    >
                      {playingId === c.id ? (
                        <Loader2 className="size-3.5 animate-spin" strokeWidth={2.2} />
                      ) : (
                        <Play className="size-3.5" strokeWidth={2.2} />
                      )}
                      {t.callsPlay}
                    </Button>
                  )}
                </div>
              )
            })}
          </div>
          </div>
        )}
      </Card>
    </div>
  )
}
