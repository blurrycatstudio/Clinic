import { useState } from "react"
import { useNavigate, useParams } from "react-router-dom"
import { Check, CheckCheck, Send } from "lucide-react"
import { MobileShell } from "@/components/mobile/MobileShell"
import { useLang } from "@/lib/i18n"
import { useConversationMessages, useConversations, useSendMessage } from "@/hooks/useConversations"
import { useToast } from "@/lib/toast"
import { cn } from "@/lib/utils"

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })
}

function Ticks({ status }: { status?: string | null }) {
  if (status === "read") return <CheckCheck className="size-3.5 text-[#53bdeb]" strokeWidth={2.2} />
  if (status === "delivered") return <CheckCheck className="size-3.5 text-white/70" strokeWidth={2.2} />
  if (status === "sent") return <Check className="size-3.5 text-white/70" strokeWidth={2.2} />
  return null
}

/** Full-screen WhatsApp thread for one conversation — the mobile counterpart of the desktop chat pane in ManualMessaging, reached via /mobile/messages. */
export default function MobileChat() {
  const { t } = useLang()
  const navigate = useNavigate()
  const toast = useToast()
  const { conversationId } = useParams<{ conversationId: string }>()
  const [draft, setDraft] = useState("")

  const conversationsQuery = useConversations()
  const conversation = conversationsQuery.data?.rows.find((c) => c.id === conversationId)
  const messagesQuery = useConversationMessages(conversationId)
  const sendMessage = useSendMessage(conversationId)

  const messages = messagesQuery.data?.messages ?? []
  const title = conversation ? conversation.wa_profile_name || conversation.wa_phone_e164 : t.mobileMessagesTitle

  function send() {
    const text = draft.trim()
    if (!text) return
    sendMessage.mutate(text, { onError: () => toast(t.mobileMessagesSendFailed) })
    setDraft("")
  }

  return (
    <MobileShell title={title} onBack={() => navigate("/mobile/messages")}>
      <div className="flex h-full flex-col">
        <div className="flex-1 space-y-1.5 overflow-y-auto bg-[#F8FAFC] p-3">
          {messagesQuery.isLoading ? (
            <div className="py-10 text-center text-[13px] text-muted-foreground">{t.mobileMessagesLoading}</div>
          ) : messages.length === 0 ? (
            <div className="py-10 text-center text-[13px] text-muted-foreground">{t.mobileMessagesNoMessages}</div>
          ) : (
            messages.map((m) => {
              const mine = m.direction === "outbound"
              return (
                <div key={m.id} className={cn("flex", mine ? "justify-end" : "justify-start")}>
                  <div
                    className={cn(
                      "max-w-[80%] rounded-lg px-2.5 py-1.5 text-[13px] leading-relaxed shadow-sm",
                      mine ? "rounded-tr-none bg-primary text-primary-foreground" : "rounded-tl-none bg-white text-foreground",
                    )}
                  >
                    <span className="whitespace-pre-wrap">
                      {m.body ?? (m.template_name ? `[template: ${m.template_name}]` : `[${m.message_type}]`)}
                    </span>
                    <div
                      className={cn(
                        "mt-0.5 flex items-center justify-end gap-1 text-[10px]",
                        mine ? "text-primary-foreground/70" : "text-muted-foreground",
                      )}
                    >
                      {formatTime(m.created_at)}
                      {mine && <Ticks status={m.status} />}
                    </div>
                  </div>
                </div>
              )
            })
          )}
        </div>

        <div className="flex shrink-0 items-center gap-2 border-t border-border bg-white px-3 py-2.5">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") send()
            }}
            placeholder={t.waChatPlaceholder}
            className="h-10 flex-1 rounded-full border border-border bg-muted/40 px-4 text-[13px] outline-none"
          />
          <button
            onClick={send}
            className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground disabled:opacity-50"
            disabled={sendMessage.isPending}
          >
            <Send className="size-4" strokeWidth={2} />
          </button>
        </div>
      </div>
    </MobileShell>
  )
}
