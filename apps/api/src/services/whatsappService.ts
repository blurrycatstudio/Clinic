import { env, isWhatsappConfigured } from "../config/env.js"
import { logger } from "../config/logger.js"
import { ExternalServiceError } from "../lib/errors.js"

const GRAPH_BASE = "https://graph.facebook.com"

type WhatsappTextMessage = { messaging_product: "whatsapp"; to: string; type: "text"; text: { body: string; preview_url?: boolean } }
type WhatsappTemplateMessage = {
  messaging_product: "whatsapp"
  to: string
  type: "template"
  template: {
    name: string
    language: { code: string }
    components?: { type: "body"; parameters: { type: "text"; text: string }[] }[]
  }
}
type WhatsappLocationMessage = {
  messaging_product: "whatsapp"
  to: string
  type: "location"
  location: { latitude: number; longitude: number; name?: string; address?: string }
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

async function callGraphApi(body: unknown): Promise<{ messageId: string | null }> {
  if (!isWhatsappConfigured) {
    logger.warn({ body }, "WHATSAPP_ACCESS_TOKEN/PHONE_NUMBER_ID not set — simulating send (dev mode)")
    return { messageId: null }
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

  const json = (await res.json().catch(() => ({}))) as {
    messages?: { id: string }[]
    error?: { message: string; code: number }
  }

  if (!res.ok) {
    logger.error({ status: res.status, response: json }, "WhatsApp Graph API call failed")
    throw new ExternalServiceError("WhatsApp Cloud API", json.error?.message ?? `HTTP ${res.status}`, json)
  }

  return { messageId: json.messages?.[0]?.id ?? null }
}

export const whatsappService = {
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
  ): Promise<{ messageId: string | null }> {
    const payload: WhatsappTemplateMessage = {
      messaging_product: "whatsapp",
      to,
      type: "template",
      template: {
        name: templateName,
        language: { code: languageCode },
        ...(params.length > 0
          ? { components: [{ type: "body", parameters: params.map((text) => ({ type: "text", text })) }] }
          : {}),
      },
    }
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
