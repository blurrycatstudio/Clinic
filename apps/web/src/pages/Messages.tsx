import { useState } from "react"
import { MessageSquarePlus, Paperclip, Phone, Search, Send, Video } from "lucide-react"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { useLang } from "@/lib/i18n"
import { CONTACTS, type ChatMessage, type Contact } from "@/lib/data"
import { cn } from "@/lib/utils"

function formatNow() {
  const now = new Date()
  let h = now.getHours()
  const ampm = h >= 12 ? "PM" : "AM"
  h = h % 12 || 12
  const mm = String(now.getMinutes()).padStart(2, "0")
  return `${h}:${mm} ${ampm}`
}

export default function Messages() {
  const { t } = useLang()
  const [contacts, setContacts] = useState<Contact[]>(CONTACTS)
  const [activeId, setActiveId] = useState<string | null>(CONTACTS[0].id)
  const [query, setQuery] = useState("")
  const [draft, setDraft] = useState("")

  const active = contacts.find((c) => c.id === activeId) ?? null
  const filteredContacts = contacts.filter((c) => c.name.toLowerCase().includes(query.toLowerCase()))

  function send() {
    const text = draft.trim()
    if (!text || !activeId) return
    const msg: ChatMessage = { from: "me", text, time: formatNow() }
    setContacts((prev) => prev.map((c) => (c.id === activeId ? { ...c, msgs: [...c.msgs, msg] } : c)))
    setDraft("")
  }

  return (
    <div>
      <div className="mb-5 flex items-start justify-between">
        <div>
          <h1 className="font-heading text-2xl font-bold">{t.messagesPageTitle}</h1>
          <p className="mt-0.5 text-[13.5px] text-muted-foreground">{t.messagesPageSub}</p>
        </div>
        <Button className="gap-1.5 rounded-[10px] font-bold">
          <MessageSquarePlus className="size-3.5" strokeWidth={2.4} />
          {t.messagesNew}
        </Button>
      </div>

      <Card className="flex h-160 flex-row gap-0 overflow-hidden rounded-2xl border p-0 shadow-none">
        <div className="flex w-72 shrink-0 flex-col border-r">
          <div className="border-b p-4">
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t.messagesSearchPh}
                className="rounded-full border-none bg-muted pl-8.5 text-xs shadow-none"
              />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto">
            {filteredContacts.map((c) => {
              const last = c.msgs[c.msgs.length - 1]
              const selected = c.id === activeId
              return (
                <button
                  key={c.id}
                  onClick={() => setActiveId(c.id)}
                  className={cn("flex w-full items-center gap-2.5 px-4 py-3 text-left transition-colors hover:bg-muted/60", selected && "bg-accent")}
                >
                  <Avatar className="size-9.5 shrink-0">
                    <AvatarFallback className="text-[12.5px] font-bold text-white" style={{ background: c.bg }}>
                      {c.initials}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between">
                      <div className="text-[13px] font-bold">{c.name}</div>
                      <div className="text-[10.5px] text-muted-foreground">{c.time}</div>
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="max-w-40 truncate text-[11.5px] text-muted-foreground">{last?.text}</div>
                      {c.unread && <div className="size-2 shrink-0 rounded-full bg-primary" />}
                    </div>
                  </div>
                </button>
              )
            })}
          </div>
        </div>

        <div className="flex min-w-0 flex-1 flex-col">
          {active ? (
            <>
              <div className="flex items-center gap-3 border-b px-4.5 py-3.5">
                <Avatar className="size-9.5 shrink-0">
                  <AvatarFallback className="text-[12.5px] font-bold text-white" style={{ background: active.bg }}>
                    {active.initials}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1">
                  <div className="text-[13.5px] font-bold">{active.name}</div>
                  <div className="text-[11px] text-muted-foreground">{active.child}</div>
                </div>
                <button className="flex size-8.5 items-center justify-center rounded-[9px] hover:bg-muted">
                  <Phone className="size-4.5 text-foreground" strokeWidth={1.8} />
                </button>
                <button className="flex size-8.5 items-center justify-center rounded-[9px] hover:bg-muted">
                  <Video className="size-4.5 text-foreground" strokeWidth={1.8} />
                </button>
              </div>

              <div className="flex-1 space-y-2.5 overflow-y-auto bg-muted/40 p-4.5">
                {active.msgs.map((m, i) => {
                  const mine = m.from === "me"
                  return (
                    <div key={i} className={cn("flex", mine ? "justify-end" : "justify-start")}>
                      <div
                        className={cn(
                          "max-w-[72%] rounded-2xl px-3.5 py-2.5 text-[13px] leading-relaxed",
                          mine ? "rounded-br-[4px] bg-primary text-primary-foreground" : "rounded-bl-[4px] border bg-card",
                        )}
                      >
                        {m.text}
                        <div className={cn("mt-1 text-right text-[10px]", mine ? "text-primary-foreground/75" : "text-muted-foreground")}>{m.time}</div>
                      </div>
                    </div>
                  )
                })}
              </div>

              <div className="flex items-center gap-2.5 border-t px-4.5 py-3.5">
                <button className="flex size-9 shrink-0 items-center justify-center rounded-[9px] hover:bg-muted">
                  <Paperclip className="size-4.5 text-muted-foreground" strokeWidth={1.8} />
                </button>
                <Input
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") send()
                  }}
                  placeholder={t.waChatPlaceholder}
                  className="flex-1 rounded-full text-[13px]"
                />
                <button onClick={send} className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground hover:brightness-110">
                  <Send className="size-4" strokeWidth={2} />
                </button>
              </div>
            </>
          ) : (
            <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">{t.messagesEmptyThread}</div>
          )}
        </div>
      </Card>
    </div>
  )
}
