import { useEffect, useMemo, useState } from "react"
import { useLocation, useNavigate } from "react-router-dom"
import { ChevronRight, MessageCircle, Search } from "lucide-react"
import { MobileShell } from "@/components/mobile/MobileShell"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { useLang } from "@/lib/i18n"
import { useConversations } from "@/hooks/useConversations"

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

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })
}

/** Mobile-first WhatsApp contact list — tapping a conversation opens the full-screen thread at /mobile/messages/:conversationId. */
export default function MobileMessages() {
  const { t } = useLang()
  const navigate = useNavigate()
  const location = useLocation()
  const [query, setQuery] = useState("")

  const conversationsQuery = useConversations()
  const conversations = conversationsQuery.data?.rows ?? []

  // Arriving here from a specific patient's card (e.g. the dashboard's "WhatsApp" quick
  // action) jumps straight into their thread instead of making staff find it in the list.
  useEffect(() => {
    const patientId = (location.state as { patientId?: string } | null)?.patientId
    if (!patientId) return
    const match = conversations.find((c) => c.patient_id === patientId)
    if (match) navigate(`/mobile/messages/${match.id}`, { replace: true })
  }, [location.state, conversations, navigate])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return conversations
    return conversations.filter((c) => {
      const name = c.wa_profile_name || c.wa_phone_e164
      return name.toLowerCase().includes(q) || (c.patients?.full_name ?? "").toLowerCase().includes(q)
    })
  }, [conversations, query])

  return (
    <MobileShell title={t.mobileMessagesTitle} onBack={() => navigate("/mobile/dashboard")}>
      <div className="flex flex-col gap-3 px-4 py-4">
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t.waContactsSearch}
            className="h-10 rounded-full border-border pl-10 text-[13px]"
          />
        </div>

        {conversationsQuery.isLoading ? (
          <div className="flex flex-col gap-2">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="h-16 animate-pulse rounded-2xl bg-muted" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
            <div className="flex size-14 items-center justify-center rounded-2xl border border-border bg-accent">
              <MessageCircle className="size-6 text-primary" strokeWidth={1.6} />
            </div>
            <p className="text-sm text-muted-foreground">{t.mobileMessagesEmpty}</p>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {filtered.map((c) => {
              const name = c.wa_profile_name || c.wa_phone_e164
              return (
                <Card
                  key={c.id}
                  onClick={() => navigate(`/mobile/messages/${c.id}`)}
                  className="cursor-pointer gap-0 rounded-2xl border p-3 shadow-none hover:bg-muted/40"
                >
                  <div className="flex items-center gap-2.5">
                    <Avatar className="size-10 shrink-0">
                      <AvatarFallback className="text-[12px] font-bold text-white" style={{ background: colorFor(c.id) }}>
                        {initialsOf(name) || "?"}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[13.5px] font-bold">{name}</div>
                      <div className="truncate text-[11.5px] text-muted-foreground">{c.patients?.full_name ?? c.wa_phone_e164}</div>
                    </div>
                    <span className="shrink-0 text-[10.5px] text-muted-foreground">{formatTime(c.last_message_at)}</span>
                    <ChevronRight className="size-4 shrink-0 text-muted-foreground/60" />
                  </div>
                </Card>
              )
            })}
          </div>
        )}
      </div>
    </MobileShell>
  )
}
