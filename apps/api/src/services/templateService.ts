import { isTemplateReady, getTemplateName, templates, type TemplateKey, type Language } from "@clinic/shared"
import { whatsappService } from "./whatsappService.js"
import { messageRepository } from "../repositories/messageRepository.js"
import { auditLogRepository } from "../repositories/auditLogRepository.js"
import { classifyWhatsappError, type WhatsappFailureKind } from "../lib/whatsappErrors.js"
import { logger } from "../config/logger.js"

const WA_LANGUAGE_CODE: Record<Language, string> = { es: "es_MX", en: "en_US" }

export type TemplateSendResult = {
  /** True only when WhatsApp accepted a message for this number (a simulated dev-mode send is NOT a send). */
  sent: boolean
  via: "template" | "session" | null
  messageId: string | null
  failure?: WhatsappFailureKind
}

/** A failed log write must never turn an already-delivered message into a reported failure. */
async function logOutbound(input: Parameters<typeof messageRepository.log>[0]): Promise<void> {
  try {
    await messageRepository.log(input)
  } catch (err) {
    logger.warn({ err }, "Failed to log outbound WhatsApp message")
  }
}

/**
 * Every template send goes through here so that call sites (appointmentFlow,
 * cron/reminders.ts, etc) never touch env vars or Meta template names
 * directly. Until Meta approves the templates (see
 * packages/shared/templates/registry.ts), sends are logged as skipped
 * instead of thrown, so the rest of the system keeps working end-to-end in
 * demo/dev mode.
 *
 * Returns what actually happened so callers that make a promise to a person
 * (the voice agent saying "I've sent it") can stay truthful.
 */
export const templateService = {
  async send(input: {
    key: TemplateKey
    to: string
    conversationId: string
    language: Language
    params: string[]
    /** Plain-text version to send instead, ONLY valid inside WhatsApp's 24h session window. */
    sessionFallbackText?: string
    /** Tappable reply buttons (max 3) to attach to the session-fallback text — e.g. the reminder's Confirm/Reschedule/Cancel, which the approved template would otherwise carry. Ignored without sessionFallbackText. */
    sessionFallbackButtons?: { id: string; title: string }[]
    /** Payloads for the template's own quick-reply buttons, in button order (echoed back on the webhook when tapped). */
    quickReplyPayloads?: string[]
    /** Links this send back to an appointment (e.g. a reminder), for dashboard delivery/read status. */
    appointmentId?: string
  }): Promise<TemplateSendResult> {
    const sendSessionFallback = async (): Promise<TemplateSendResult> => {
      if (input.sessionFallbackText && input.sessionFallbackButtons?.length) {
        const { messageId } = await whatsappService.sendInteractiveButtons(input.to, input.sessionFallbackText, input.sessionFallbackButtons)
        await logOutbound({
          conversationId: input.conversationId,
          direction: "outbound",
          messageType: "interactive",
          body: input.sessionFallbackText,
          payload: { buttons: input.sessionFallbackButtons },
          waMessageId: messageId,
          appointmentId: input.appointmentId,
        })
        return { sent: messageId !== null, via: "session", messageId, ...(messageId === null ? { failure: "not_configured" as const } : {}) }
      }
      const { messageId } = await whatsappService.sendTextMessage(input.to, input.sessionFallbackText ?? "")
      await logOutbound({
        conversationId: input.conversationId,
        direction: "outbound",
        messageType: "text",
        body: input.sessionFallbackText,
        waMessageId: messageId,
        appointmentId: input.appointmentId,
      })
      return { sent: messageId !== null, via: "session", messageId, ...(messageId === null ? { failure: "not_configured" as const } : {}) }
    }

    if (!isTemplateReady(input.key)) {
      logger.warn({ key: input.key }, "Template not yet approved — using session fallback if provided")
      if (input.sessionFallbackText) {
        return sendSessionFallback()
      }
      await auditLogRepository.record({
        actorType: "system",
        action: "template.failed",
        entityType: "whatsapp_template",
        entityId: input.key,
        metadata: { reason: "template_not_configured", to: input.to },
      })
      return { sent: false, via: null, messageId: null, failure: "template" }
    }

    const templateName = getTemplateName(input.key)
    const languageCode = templates[input.key].language ?? WA_LANGUAGE_CODE[input.language]

    try {
      const { messageId, debug } = await whatsappService.sendTemplateMessage(
        input.to,
        templateName,
        languageCode,
        input.params,
        input.quickReplyPayloads,
      )
      await logOutbound({
        conversationId: input.conversationId,
        direction: "outbound",
        messageType: "template",
        templateName,
        payload: { params: input.params, debug },
        waMessageId: messageId,
        appointmentId: input.appointmentId,
      })
      await auditLogRepository.record({
        actorType: "system",
        action: "template.sent",
        entityType: "whatsapp_template",
        entityId: templateName,
        metadata: { to: input.to, messageId, debug },
      })
      return { sent: messageId !== null, via: "template", messageId, ...(messageId === null ? { failure: "not_configured" as const } : {}) }
    } catch (err) {
      logger.error({ err, key: input.key }, "Failed to send WhatsApp template")
      await auditLogRepository.record({
        actorType: "system",
        action: "template.failed",
        entityType: "whatsapp_template",
        entityId: input.key,
        metadata: { to: input.to, error: err instanceof Error ? err.message : String(err) },
      })
      const failure = classifyWhatsappError(err)

      // A broken/paused template shouldn't silently drop the message when the patient's
      // 24h window happens to be open — try the plain-text version before giving up.
      if (input.sessionFallbackText && failure !== "not_on_whatsapp") {
        try {
          return await sendSessionFallback()
        } catch (fallbackErr) {
          logger.warn({ err: fallbackErr, key: input.key }, "Session fallback after template failure also failed")
        }
      }
      return { sent: false, via: null, messageId: null, failure }
    }
  },
}
