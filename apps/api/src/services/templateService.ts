import { isTemplateReady, getTemplateName, templates, type TemplateKey, type Language } from "@clinic/shared"
import { whatsappService } from "./whatsappService.js"
import { messageRepository } from "../repositories/messageRepository.js"
import { auditLogRepository } from "../repositories/auditLogRepository.js"
import { logger } from "../config/logger.js"

const WA_LANGUAGE_CODE: Record<Language, string> = { es: "es_MX", en: "en_US" }

/**
 * Every template send goes through here so that call sites (appointmentFlow,
 * cron/reminders.ts, etc) never touch env vars or Meta template names
 * directly. Until Meta approves the templates (see
 * packages/shared/templates/registry.ts), sends are logged as skipped
 * instead of thrown, so the rest of the system keeps working end-to-end in
 * demo/dev mode.
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
    /** Links this send back to an appointment (e.g. a reminder), for dashboard delivery/read status. */
    appointmentId?: string
  }): Promise<void> {
    if (!isTemplateReady(input.key)) {
      logger.warn({ key: input.key }, "Template not yet approved — using session fallback if provided")
      if (input.sessionFallbackText) {
        const { messageId } = await whatsappService.sendTextMessage(input.to, input.sessionFallbackText)
        await messageRepository.log({
          conversationId: input.conversationId,
          direction: "outbound",
          messageType: "text",
          body: input.sessionFallbackText,
          waMessageId: messageId,
          appointmentId: input.appointmentId,
        })
      } else {
        await auditLogRepository.record({
          actorType: "system",
          action: "template.failed",
          entityType: "whatsapp_template",
          entityId: input.key,
          metadata: { reason: "template_not_configured", to: input.to },
        })
      }
      return
    }

    const templateName = getTemplateName(input.key)
    const languageCode = templates[input.key].language ?? WA_LANGUAGE_CODE[input.language]

    try {
      const { messageId, debug } = await whatsappService.sendTemplateMessage(input.to, templateName, languageCode, input.params)
      await messageRepository.log({
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
    } catch (err) {
      logger.error({ err, key: input.key }, "Failed to send WhatsApp template")
      await auditLogRepository.record({
        actorType: "system",
        action: "template.failed",
        entityType: "whatsapp_template",
        entityId: input.key,
        metadata: { to: input.to, error: err instanceof Error ? err.message : String(err) },
      })
    }
  },
}
