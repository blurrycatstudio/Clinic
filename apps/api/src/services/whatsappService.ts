import { env, isWhatsappConfigured } from "../config/env.js"
import { logger } from "../config/logger.js"
import { WhatsappApiError, sanitizeTemplateParam } from "../lib/whatsappErrors.js"

const GRAPH_BASE = "https://graph.facebook.com"

type WhatsappTextMessage = { messaging_product: "whatsapp"; to: string; type: "text"; text: { body: string; preview_url?: boolean } }
type WhatsappTemplateComponent =
  | { type: "body"; parameters: { type: "text"; text: string }[] }
  | { type: "button"; sub_type: "quick_reply"; index: string; parameters: { type: "payload"; payload: string }[] }
type WhatsappTemplateMessage = {
  messaging_product: "whatsapp"
  to: string
  type: "template"
  template: {
    name: string
    language: { code: string }
    components?: WhatsappTemplateComponent[]
  }
}
type WhatsappLocationMessage = {
  messaging_product: "whatsapp"
  to: string
  type: "location"
  location: { latitude: number; longitude: number; name?: string; address?: string }
}
type WhatsappDocumentMessage = {
  messaging_product: "whatsapp"
  to: string
  type: "document"
  document: { link: string; filename: string; caption?: string }
}
type WhatsappInteractiveButtonsMessage = {
  messaging_product: "whatsapp"
  to: string
  type: "interactive"
  interactive: {
    type: "button"
    body: { text: string }
    action: { buttons: { type: "reply"; reply: { id: string; title: string } }[] }
  }
}
type WhatsappInteractiveListMessage = {
  messaging_product: "whatsapp"
  to: string
  type: "interactive"
  interactive: {
    type: "list"
    body: { text: string }
    action: {
      button: string
      sections: { rows: { id: string; title: string }[] }[]
    }
  }
}
type WhatsappCtaUrlMessage = {
  messaging_product: "whatsapp"
  to: string
  type: "interactive"
  interactive: {
    type: "cta_url"
    body: { text: string }
    action: { name: "cta_url"; parameters: { display_text: string; url: string } }
  }
}

async function callGraphApi(body: unknown): Promise<{ messageId: string | null; debug: Record<string, unknown> }> {
  if (!isWhatsappConfigured) {
    logger.warn({ body }, "WHATSAPP_ACCESS_TOKEN/PHONE_NUMBER_ID not set — simulating send (dev mode)")
    return { messageId: null, debug: { simulated: true } }
  }

  const url = `${GRAPH_BASE}/${env.WHATSAPP_API_VERSION}/${env.WHATSAPP_PHONE_NUMBER_ID}/messages`
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.WHATSAPP_ACCESS_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  })

  const rawText = await res.text()
  let json: { messages?: { id: string }[]; error?: { message: string; code: number; error_data?: { details?: string } } } = {}
  let parseError: string | null = null
  try {
    json = JSON.parse(rawText)
  } catch (err) {
    parseError = err instanceof Error ? err.message : String(err)
  }

  const debug = { status: res.status, rawText: rawText.slice(0, 500), parseError }

  if (!res.ok) {
    logger.error({ status: res.status, response: json }, "WhatsApp Graph API call failed")
    const detail = json.error?.error_data?.details
    const message = json.error?.message ?? `HTTP ${res.status}`
    throw new WhatsappApiError(detail ? `${message} (${detail})` : message, res.status, json.error?.code ?? null, json)
  }

  return { messageId: json.messages?.[0]?.id ?? null, debug }
}

let cachedDisplayNumber: string | null = null

export const whatsappService = {
  /**
   * The clinic's own WhatsApp number as patients see it, e.g. "+52 55 1234 5678". Lets the voice
   * agent tell a caller who the message must come to when WhatsApp won't let us message them first.
   * Best-effort and cached — null when unknown, never throws.
   */
  async getDisplayPhoneNumber(): Promise<string | null> {
    if (cachedDisplayNumber) return cachedDisplayNumber
    if (!isWhatsappConfigured) return null
    try {
      const url = `${GRAPH_BASE}/${env.WHATSAPP_API_VERSION}/${env.WHATSAPP_PHONE_NUMBER_ID}?fields=display_phone_number`
      const res = await fetch(url, { headers: { Authorization: `Bearer ${env.WHATSAPP_ACCESS_TOKEN}` } })
      if (!res.ok) return null
      const json = (await res.json()) as { display_phone_number?: string }
      cachedDisplayNumber = json.display_phone_number ?? null
    } catch (err) {
      logger.warn({ err }, "Could not read the clinic's WhatsApp display number")
    }
    return cachedDisplayNumber
  },

  async sendTextMessage(to: string, body: string): Promise<{ messageId: string | null }> {
    const payload: WhatsappTextMessage = {
      messaging_product: "whatsapp",
      to,
      type: "text",
      text: { body, preview_url: false },
    }
    return callGraphApi(payload)
  },

  /**
   * Required for any outbound message sent outside the 24h customer-service
   * window (reminders, confirmations sent after a delay, etc). `params` are
   * substituted into the template's body variables IN ORDER — see
   * packages/shared/templates/registry.ts for each template's param list.
   */
  async sendTemplateMessage(
    to: string,
    templateName: string,
    languageCode: string,
    params: string[],
    /** Payloads for the template's quick-reply buttons, in button order — echoed back on the webhook when the patient taps one. */
    quickReplyPayloads: string[] = [],
  ): Promise<{ messageId: string | null; debug: Record<string, unknown> }> {
    const components: WhatsappTemplateComponent[] = []
    if (params.length > 0) {
      // Meta rejects empty / multi-line parameters — sanitized here so no caller can forget.
      components.push({ type: "body", parameters: params.map((text) => ({ type: "text", text: sanitizeTemplateParam(text) })) })
    }
    quickReplyPayloads.forEach((payload, index) => {
      components.push({ type: "button", sub_type: "quick_reply", index: String(index), parameters: [{ type: "payload", payload }] })
    })

    const payload: WhatsappTemplateMessage = {
      messaging_product: "whatsapp",
      to,
      type: "template",
      template: {
        name: templateName,
        language: { code: languageCode },
        ...(components.length > 0 ? { components } : {}),
      },
    }
    return callGraphApi(payload)
  },

  async sendDocumentMessage(
    to: string,
    document: { link: string; filename: string; caption?: string },
  ): Promise<{ messageId: string | null }> {
    const payload: WhatsappDocumentMessage = { messaging_product: "whatsapp", to, type: "document", document }
    return callGraphApi(payload)
  },

  async sendLocationMessage(
    to: string,
    location: { latitude: number; longitude: number; name?: string; address?: string },
  ): Promise<{ messageId: string | null }> {
    const payload: WhatsappLocationMessage = { messaging_product: "whatsapp", to, type: "location", location }
    return callGraphApi(payload)
  },

  async sendInteractiveButtons(
    to: string,
    bodyText: string,
    buttons: { id: string; title: string }[],
  ): Promise<{ messageId: string | null }> {
    const payload: WhatsappInteractiveButtonsMessage = {
      messaging_product: "whatsapp",
      to,
      type: "interactive",
      interactive: {
        type: "button",
        body: { text: bodyText },
        action: { buttons: buttons.map((b) => ({ type: "reply", reply: b })) },
      },
    }
    return callGraphApi(payload)
  },

  /** WhatsApp caps reply buttons at 3 — use this "dropdown" style list for menus with more options (max 10 rows). */
  async sendInteractiveList(
    to: string,
    bodyText: string,
    buttonLabel: string,
    rows: { id: string; title: string }[],
  ): Promise<{ messageId: string | null }> {
    const payload: WhatsappInteractiveListMessage = {
      messaging_product: "whatsapp",
      to,
      type: "interactive",
      interactive: {
        type: "list",
        body: { text: bodyText },
        action: { button: buttonLabel, sections: [{ rows }] },
      },
    }
    return callGraphApi(payload)
  },

  /** A real tappable button that opens `url` — works with just a maps link, no lat/long pin required. */
  async sendCtaUrlButton(to: string, bodyText: string, displayText: string, url: string): Promise<{ messageId: string | null }> {
    const payload: WhatsappCtaUrlMessage = {
      messaging_product: "whatsapp",
      to,
      type: "interactive",
      interactive: {
        type: "cta_url",
        body: { text: bodyText },
        action: { name: "cta_url", parameters: { display_text: displayText, url } },
      },
    }
    return callGraphApi(payload)
  },

  async markAsRead(waMessageId: string): Promise<void> {
    if (!isWhatsappConfigured) return
    const url = `${GRAPH_BASE}/${env.WHATSAPP_API_VERSION}/${env.WHATSAPP_PHONE_NUMBER_ID}/messages`
    const res = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${env.WHATSAPP_ACCESS_TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({ messaging_product: "whatsapp", status: "read", message_id: waMessageId }),
    })
    if (!res.ok) {
      logger.warn({ status: res.status, waMessageId }, "Failed to mark WhatsApp message as read")
    }
  },
}
