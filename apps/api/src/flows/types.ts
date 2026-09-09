import type { ClinicSettings, ConversationContext } from "@clinic/shared"

export type FlowReply = {
  text?: string
  /** WhatsApp interactive list ("View options" -> tappable rows), sent as its own message using `text` as its body. */
  list?: { buttonLabel: string; rows: { id: string; title: string }[] }
  /** WhatsApp interactive reply buttons (max 3, always visible inline — no tap needed to reveal them). */
  buttons?: { id: string; title: string }[]
  /** Body text for the `buttons` message specifically, when both `buttons` and `list` are sent as two separate messages. Defaults to `text`. */
  buttonsText?: string
  location?: { latitude: number; longitude: number; name?: string; address?: string }
}

export type FlowResult = {
  context: ConversationContext
  reply: FlowReply
}

export type FlowParams = {
  text: string
  buttonId: string | null
  context: ConversationContext
  settings: ClinicSettings
}

export type FlowHandler = (params: FlowParams) => Promise<FlowResult>
