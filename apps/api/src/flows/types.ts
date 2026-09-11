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
  /** A tappable "Get Directions"-style button opening a maps URL — sent as its own message, ahead of `text`. Works without coordinates, unlike `location`. */
  ctaUrl?: { bodyText: string; displayText: string; url: string }
  /** When true, `text` is kept for conversation history only — not sent as its own WhatsApp message (e.g. address+link text that a `location` pin in the same reply already covers). */
  suppressTextSend?: boolean
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
