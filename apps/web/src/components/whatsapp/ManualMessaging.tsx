import { useRef, useState } from "react"
import { Paperclip, Phone, Search, Send, Video } from "lucide-react"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { useLang } from "@/lib/i18n"
import { CONTACTS, type ChatMessage, type Contact } from "@/lib/data"
import { cn } from "@/lib/utils"
import { useToast } from "@/lib/toast"

function formatNow() {
  const now = new Date()
  let h = now.getHours()
  const ampm = h >= 12 ? "PM" : "AM"
  h = h % 12 || 12
  const mm = String(now.getMinutes()).padStart(2, "0")
  return `${h}:${mm} ${ampm}`
}

export function ManualMessaging() {
  const { t } = useLang()
  const toast = useToast()
  const [contacts, setContacts] = useState<Contact[]>(CONTACTS)
  const [activeId, setActiveId] = useState(CONTACTS[0].id)
  const [draft, setDraft] = useState("")
  const fileInputRef = useRef<HTMLInputElement>(null)

  const active = contacts.find((c) => c.id === activeId) ?? contacts[0]

  function send() {
    const text = draft.trim()
    if (!text) return
    const msg: ChatMessage = { from: "me", text, time: formatNow() }
    setContacts((prev) => prev.map((c) => (c.id === activeId ? { ...c, msgs: [...c.msgs, msg] } : c)))
    setDraft("")
  }

  function handleAttach(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const msg: ChatMessage = { from: "me", text: `📎 ${file.name}`, time: formatNow() }
    setContacts((prev) => prev.map((c) => (c.id === activeId ? { ...c, msgs: [...c.msgs, msg] } : c)))
    toast(`Attached ${file.name}`)
    e.target.value = ""
  }

  return (
    <Card className="flex h-[70vh] min-w-0 w-full flex-1 flex-row gap-0 overflow-hidden rounded-2xl border p-0 shadow-none sm:h-160">
      {/* Contacts list */}
      <div className="flex w-16 shrink-0 flex-col border-r sm:w-67.5">
        <div className="border-b p-2.5 sm:p-4">
          <h3 className="font-heading mb-2.5 hidden text-[15px] font-bold sm:block">{t.waManualTitle}</h3>
          <div className="relative hidden sm:block">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder={t.waContactsSearch}
              className="rounded-full border-none bg-muted pl-8.5 text-xs shadow-none"
            />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {contacts.map((c) => {
            const last = c.msgs[c.msgs.length - 1]
            const selected = c.id === activeId
            return (
              <button
                key={c.id}
                onClick={() => setActiveId(c.id)}
                className={cn(
                  "flex w-full items-center justify-center gap-2.5 px-2.5 py-3 text-left transition-colors hover:bg-muted/60 sm:justify-start sm:px-4",
                  selected && "bg-accent",
                )}
              >
                <Avatar className="size-9.5 shrink-0">
                  <AvatarFallback className="text-[12.5px] font-bold text-white" style={{ background: c.bg }}>
                    {c.initials}
                  </AvatarFallback>
                </Avatar>
                <div className="hidden min-w-0 flex-1 sm:block">
                  <div className="flex items-center justify-between">
                    <div className="text-[13px] font-bold">{c.name}</div>
                    <div className="text-[10.5px] text-muted-foreground">{c.time}</div>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="max-w-37.5 truncate text-[11.5px] text-muted-foreground">{last?.text}</div>
                    {c.unread && <div className="size-2 shrink-0 rounded-full bg-primary" />}
                  </div>
                </div>
              </button>
            )
          })}
        </div>
      </div>

      {/* Chat */}
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center gap-2 border-b px-3 py-3 sm:gap-3 sm:px-4.5 sm:py-3.5">
          <Avatar className="size-9.5 shrink-0">
            <AvatarFallback className="text-[12.5px] font-bold text-white" style={{ background: active.bg }}>
              {active.initials}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <div className="truncate text-[13.5px] font-bold">{active.name}</div>
            <div className="truncate text-[11px] text-muted-foreground">{active.child}</div>
          </div>
          <button
            onClick={() => {
              window.location.href = "tel:"
              toast(`Calling ${active.name}…`)
            }}
            className="flex size-8.5 shrink-0 items-center justify-center rounded-[9px] hover:bg-muted"
          >
            <Phone className="size-4.5 text-foreground" strokeWidth={1.8} />
          </button>
          <button onClick={() => toast(`Starting video call with ${active.name}…`)} className="hidden size-8.5 shrink-0 items-center justify-center rounded-[9px] hover:bg-muted sm:flex">
            <Video className="size-4.5 text-foreground" strokeWidth={1.8} />
          </button>
        </div>

        <div className="flex-1 space-y-2.5 overflow-y-auto bg-muted/40 p-3 sm:p-4.5">
          {active.msgs.map((m, i) => {
            const mine = m.from === "me"
            return (
              <div key={i} className={cn("flex", mine ? "justify-end" : "justify-start")}>
                <div
                  className={cn(
                    "max-w-[85%] rounded-2xl px-3.5 py-2.5 text-[13px] leading-relaxed sm:max-w-[72%]",
                    mine
                      ? "rounded-br-[4px] bg-primary text-primary-foreground"
                      : "rounded-bl-[4px] border bg-card",
                  )}
                >
                  {m.text}
                  <div className={cn("mt-1 text-right text-[10px]", mine ? "text-primary-foreground/75" : "text-muted-foreground")}>
                    {m.time}
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        <div className="flex items-center gap-2 border-t px-3 py-3 sm:gap-2.5 sm:px-4.5 sm:py-3.5">
          <button onClick={() => fileInputRef.current?.click()} className="flex size-9 shrink-0 items-center justify-center rounded-[9px] hover:bg-muted">
            <Paperclip className="size-4.5 text-muted-foreground" strokeWidth={1.8} />
          </button>
          <input ref={fileInputRef} type="file" className="hidden" onChange={handleAttach} />
          <Input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") send()
            }}
            placeholder={t.waChatPlaceholder}
            className="flex-1 rounded-full text-[13px]"
          />
          <button
            onClick={send}
            className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground hover:brightness-110"
          >
            <Send className="size-4" strokeWidth={2} />
          </button>
        </div>
      </div>
    </Card>
  )
}
