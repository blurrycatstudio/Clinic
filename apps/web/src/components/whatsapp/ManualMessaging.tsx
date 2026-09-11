import { useEffect, useRef, useState } from "react"
import { Check, CheckCheck, MoreVertical, Paperclip, Phone, Plus, Search, Send, Video } from "lucide-react"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Card } from "@/components/ui/card"
import { useLang } from "@/lib/i18n"
import { CONTACTS, type Contact } from "@/lib/data"
import { cn } from "@/lib/utils"
import { useToast } from "@/lib/toast"
import { isSupabaseConfigured } from "@/lib/supabaseClient"
import { useConversationMessages, useConversations, useSendMessage, type ApiConversation } from "@/hooks/useConversations"

type DisplayMessage = { from: "me" | "them"; text: string; time: string; status?: string }

function formatNow() {
  const now = new Date()
  let h = now.getHours()
  const ampm = h >= 12 ? "PM" : "AM"
  h = h % 12 || 12
  const mm = String(now.getMinutes()).padStart(2, "0")
  return `${h}:${mm} ${ampm}`
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })
}

function initialsOf(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("")
}

const AVATAR_COLORS = ["#DC2626", "#059669", "#2563EB", "#D97706", "#7C3AED", "#DB2777"]
function colorFor(id: string) {
  let hash = 0
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0
  return AVATAR_COLORS[hash % AVATAR_COLORS.length]
}

function toContact(conv: ApiConversation): Contact {
  const name = conv.wa_profile_name || conv.wa_phone_e164
  return {
    id: conv.id,
    name,
    child: conv.patients?.full_name ?? conv.wa_phone_e164,
    initials: initialsOf(name) || "?",
    bg: colorFor(conv.id),
    time: formatTime(conv.last_message_at),
    unread: false,
    msgs: [],
    unnamed: !conv.wa_profile_name,
  }
}

/** Colored initials for a saved contact, or a gradient "+" badge for a raw, unsaved phone number. */
function ContactAvatar({ contact, className }: { contact: Contact; className?: string }) {
  if (contact.unnamed) {
    return (
      <Avatar className={className}>
        <AvatarFallback className="bg-gradient-to-br from-[#7c6fe8] to-[#4d7ff0] text-white">
          <Plus className="size-4.5" strokeWidth={2.2} />
        </AvatarFallback>
      </Avatar>
    )
  }
  return (
    <Avatar className={className}>
      <AvatarFallback className="text-[12.5px] font-bold text-white" style={{ background: contact.bg }}>
        {contact.initials}
      </AvatarFallback>
    </Avatar>
  )
}

/** Subtle tiled wallpaper approximating WhatsApp's chat background, as an inline SVG data URI. */
const WA_WALLPAPER =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(`
  <svg xmlns="http://www.w3.org/2000/svg" width="100" height="100">
    <g fill="none" stroke="#ffffff" stroke-opacity="0.035" stroke-width="1.2">
      <circle cx="15" cy="20" r="6" />
      <path d="M45 10 q8 8 0 16 q-8 -8 0 -16 z" />
      <path d="M75 55 l6 6 m-6 0 l6 -6" />
      <circle cx="85" cy="85" r="5" />
      <path d="M20 70 q6 10 14 0" />
      <path d="M55 90 l0 10 m-5 -5 l10 0" />
    </g>
  </svg>
`)

function Ticks({ status }: { status?: string }) {
  if (status === "read") return <CheckCheck className="size-3.5 text-[#53bdeb]" strokeWidth={2.2} />
  if (status === "delivered") return <CheckCheck className="size-3.5 text-[#8696a0]" strokeWidth={2.2} />
  if (status === "sent") return <Check className="size-3.5 text-[#8696a0]" strokeWidth={2.2} />
  return null
}

/** Real conversations come from the WhatsApp Cloud API via the backend; falls back to demo data when Supabase isn't configured. */
export function ManualMessaging() {
  const { t } = useLang()
  const toast = useToast()
  const live = isSupabaseConfigured

  const [demoContacts, setDemoContacts] = useState<Contact[]>(CONTACTS)
  const [activeId, setActiveId] = useState<string | undefined>(live ? undefined : CONTACTS[0].id)
  const [draft, setDraft] = useState("")
  const [contactSearch, setContactSearch] = useState("")
  const fileInputRef = useRef<HTMLInputElement>(null)

  const conversationsQuery = useConversations()
  const conversations = conversationsQuery.data?.rows ?? []
  const messagesQuery = useConversationMessages(live ? activeId : undefined)
  const sendMessage = useSendMessage(activeId)

  useEffect(() => {
    if (live && !activeId && conversations.length > 0) setActiveId(conversations[0].id)
  }, [live, activeId, conversations])

  const allContacts: Contact[] = live ? conversations.map(toContact) : demoContacts
  const active = allContacts.find((c) => c.id === activeId) ?? allContacts[0]

  const query = contactSearch.trim().toLowerCase()
  const contacts = query
    ? allContacts.filter((c) => c.name.toLowerCase().includes(query) || c.child.toLowerCase().includes(query))
    : allContacts

  const liveMessages: DisplayMessage[] = (messagesQuery.data?.messages ?? []).map((m) => ({
    from: m.direction === "outbound" ? "me" : "them",
    text: m.body ?? (m.template_name ? `[template: ${m.template_name}]` : `[${m.message_type}]`),
    time: formatTime(m.created_at),
    status: m.direction === "outbound" ? (m.status ?? undefined) : undefined,
  }))
  const displayMsgs: DisplayMessage[] = live ? liveMessages : (active?.msgs ?? [])

  function send() {
    const text = draft.trim()
    if (!text || !active) return

    if (live) {
      sendMessage.mutate(text, { onError: () => toast("Failed to send message") })
      setDraft("")
      return
    }

    const msg = { from: "me" as const, text, time: formatNow() }
    setDemoContacts((prev) => prev.map((c) => (c.id === activeId ? { ...c, msgs: [...c.msgs, msg] } : c)))
    setDraft("")
  }

  function handleAttach(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (live) {
      toast("File attachments aren't supported yet")
      e.target.value = ""
      return
    }
    const msg = { from: "me" as const, text: `📎 ${file.name}`, time: formatNow() }
    setDemoContacts((prev) => prev.map((c) => (c.id === activeId ? { ...c, msgs: [...c.msgs, msg] } : c)))
    toast(`Attached ${file.name}`)
    e.target.value = ""
  }

  if (live && !active) {
    return (
      <Card className="flex h-[70vh] w-full flex-1 items-center justify-center rounded-2xl border border-[#2a3942] bg-[#111b21] p-6 text-sm text-[#8696a0] shadow-none sm:h-160">
        {conversationsQuery.isLoading ? "Loading conversations…" : "No WhatsApp conversations yet."}
      </Card>
    )
  }

  return (
    <Card className="flex h-[70vh] min-w-0 w-full flex-1 flex-row gap-0 overflow-hidden rounded-2xl border border-[#2a3942] bg-[#111b21] p-0 shadow-none sm:h-160">
      {/* Contacts list */}
      <div className="flex w-16 shrink-0 flex-col border-r border-[#2a3942] bg-[#111b21] sm:w-67.5">
        <div className="border-b border-[#2a3942] p-2.5 sm:p-4">
          <h3 className="font-heading mb-2.5 hidden text-[15px] font-bold text-[#e9edef] sm:block">{t.waManualTitle}</h3>
          <div className="relative hidden sm:block">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-[#8696a0]" />
            <input
              value={contactSearch}
              onChange={(e) => setContactSearch(e.target.value)}
              placeholder={t.waContactsSearch}
              className="h-9 w-full rounded-full border-none bg-[#202c33] pl-8.5 text-xs text-[#e9edef] placeholder:text-[#8696a0] outline-none focus:ring-1 focus:ring-[#00a884]"
            />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {contacts.length === 0 && (
            <div className="hidden p-4 text-center text-[12px] text-[#8696a0] sm:block">No contacts found.</div>
          )}
          {contacts.map((c) => {
            const last = live ? null : c.msgs[c.msgs.length - 1]
            const selected = c.id === activeId
            return (
              <button
                key={c.id}
                onClick={() => setActiveId(c.id)}
                className={cn(
                  "flex w-full items-center justify-center gap-2.5 border-b border-[#2a3942]/60 px-2.5 py-3 text-left transition-colors hover:bg-[#202c33] sm:justify-start sm:px-4",
                  selected && "bg-[#2a3942] hover:bg-[#2a3942]",
                )}
              >
                <ContactAvatar contact={c} className="size-9.5 shrink-0" />
                <div className="hidden min-w-0 flex-1 sm:block">
                  <div className="flex items-center justify-between">
                    <div className="text-[13px] font-bold text-[#e9edef]">{c.name}</div>
                    <div className="text-[10.5px] text-[#8696a0]">{c.time}</div>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="max-w-37.5 truncate text-[11.5px] text-[#8696a0]">{last?.text}</div>
                    {c.unread && <div className="size-2 shrink-0 rounded-full bg-[#00a884]" />}
                  </div>
                </div>
              </button>
            )
          })}
        </div>
      </div>

      {/* Chat */}
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center gap-2 border-b border-[#2a3942] bg-[#202c33] px-3 py-3 sm:gap-3 sm:px-4.5 sm:py-3.5">
          <ContactAvatar contact={active} className="size-9.5 shrink-0" />
          <div className="min-w-0 flex-1">
            <div className="truncate text-[13.5px] font-bold text-[#e9edef]">{active.name}</div>
            <div className="truncate text-[11px] text-[#8696a0]">{active.child}</div>
          </div>
          <button
            onClick={() => {
              window.location.href = "tel:"
              toast(`Calling ${active.name}…`)
            }}
            className="flex size-8.5 shrink-0 items-center justify-center rounded-full hover:bg-[#2a3942]"
          >
            <Phone className="size-4.5 text-[#aebac1]" strokeWidth={1.8} />
          </button>
          <button onClick={() => toast(`Starting video call with ${active.name}…`)} className="hidden size-8.5 shrink-0 items-center justify-center rounded-full hover:bg-[#2a3942] sm:flex">
            <Video className="size-4.5 text-[#aebac1]" strokeWidth={1.8} />
          </button>
          <button onClick={() => toast("More options")} className="flex size-8.5 shrink-0 items-center justify-center rounded-full hover:bg-[#2a3942]">
            <MoreVertical className="size-4.5 text-[#aebac1]" strokeWidth={1.8} />
          </button>
        </div>

        <div
          className="flex-1 space-y-1.5 overflow-y-auto bg-[#0b141a] p-3 sm:p-4.5"
          style={{ backgroundImage: `url("${WA_WALLPAPER}")`, backgroundRepeat: "repeat" }}
        >
          {displayMsgs.map((m, i) => {
            const mine = m.from === "me"
            return (
              <div key={i} className={cn("flex", mine ? "justify-end" : "justify-start")}>
                <div
                  className={cn(
                    "max-w-[85%] rounded-lg px-2.5 py-1.5 text-[13.5px] leading-relaxed shadow-sm sm:max-w-[72%]",
                    mine ? "rounded-tr-none bg-[#005c4b] text-[#e9edef]" : "rounded-tl-none bg-[#202c33] text-[#e9edef]",
                  )}
                >
                  <span className="whitespace-pre-wrap">{m.text}</span>
                  <div
                    className={cn(
                      "mt-0.5 flex items-center justify-end gap-1 text-[10.5px]",
                      mine ? "text-[#e9edef]/60" : "text-[#8696a0]",
                    )}
                  >
                    {m.time}
                    {mine && <Ticks status={m.status} />}
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        <div className="flex items-center gap-2 border-t border-[#2a3942] bg-[#202c33] px-3 py-3 sm:gap-2.5 sm:px-4.5 sm:py-3.5">
          <button onClick={() => fileInputRef.current?.click()} className="flex size-9 shrink-0 items-center justify-center rounded-full hover:bg-[#2a3942]">
            <Paperclip className="size-4.5 text-[#8696a0]" strokeWidth={1.8} />
          </button>
          <input ref={fileInputRef} type="file" className="hidden" onChange={handleAttach} />
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") send()
            }}
            placeholder={t.waChatPlaceholder}
            className="h-10 flex-1 rounded-full border-none bg-[#2a3942] px-4 text-[13px] text-[#e9edef] placeholder:text-[#8696a0] outline-none"
          />
          <button
            onClick={send}
            className="flex size-10 shrink-0 items-center justify-center rounded-full bg-[#00a884] text-white hover:brightness-110"
          >
            <Send className="size-4" strokeWidth={2} />
          </button>
        </div>
      </div>
    </Card>
  )
}
