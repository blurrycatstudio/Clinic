import { ConversationState, FlowType, t } from "@clinic/shared"
import type { ConversationContext } from "@clinic/shared"
import { conversationRepository } from "../repositories/conversationRepository.js"
import { messageRepository } from "../repositories/messageRepository.js"
import { clinicSettingsRepository } from "../repositories/clinicSettingsRepository.js"
import { auditLogRepository } from "../repositories/auditLogRepository.js"
import { redisStateService } from "./redisStateService.js"
import { whatsappService } from "./whatsappService.js"
import { openaiService } from "./openaiService.js"
import { languageSelectFlow } from "../flows/languageSelectFlow.js"
import { mainMenuFlow, buildMainMenu } from "../flows/mainMenuFlow.js"
import { bookAppointmentFlow } from "../flows/bookAppointmentFlow.js"
import { rescheduleFlow } from "../flows/rescheduleFlow.js"
import { cancelFlow } from "../flows/cancelFlow.js"
import { clinicInfoFlow } from "../flows/clinicInfoFlow.js"
import { humanSupportFlow } from "../flows/humanSupportFlow.js"
import type { FlowHandler } from "../flows/types.js"
import { logger } from "../config/logger.js"
import { detectLanguageHeuristic } from "../lib/detectLanguage.js"

/**
 * Matches common greeting typos/elongations (hii, hiii, heyy, hellooo,
 * holaaa) in addition to the exact words — patients type these constantly
 * and each one used to fall through to whatever flow was active, e.g.
 * "hii" mid-reschedule got parsed as an invalid appointment number instead
 * of resetting to the main menu.
 */
const GREETING_PATTERN = /^(h+i+|h+e+y+|h+e+ll+o+|hola+|buenas|buenos\s*d[ií]as|menu)$/

function isGreeting(normalizedText: string): boolean {
  return GREETING_PATTERN.test(normalizedText)
}

const FLOW_BY_STATE: Partial<Record<ConversationState, FlowHandler>> = {
  [ConversationState.AWAITING_MENU_SELECTION]: mainMenuFlow,
  [ConversationState.AWAITING_RETURNING_PATIENT_CONFIRMATION]: bookAppointmentFlow,
  [ConversationState.AWAITING_NAME]: bookAppointmentFlow,
  [ConversationState.AWAITING_PHONE]: bookAppointmentFlow,
  [ConversationState.AWAITING_REASON]: bookAppointmentFlow,
  [ConversationState.AWAITING_SLOT_SELECTION]: bookAppointmentFlow,
  [ConversationState.AWAITING_BOOKING_CONFIRMATION]: bookAppointmentFlow,
  [ConversationState.AWAITING_RESCHEDULE_TARGET_SELECTION]: rescheduleFlow,
  [ConversationState.AWAITING_RESCHEDULE_SLOT_SELECTION]: rescheduleFlow,
  [ConversationState.AWAITING_RESCHEDULE_CONFIRMATION]: rescheduleFlow,
  [ConversationState.AWAITING_CANCELLATION_TARGET_SELECTION]: cancelFlow,
  [ConversationState.AWAITING_CANCELLATION_CONFIRMATION]: cancelFlow,
  [ConversationState.AWAITING_FAQ_QUESTION]: clinicInfoFlow,
  [ConversationState.ESCALATED_TO_HUMAN]: humanSupportFlow,
}

// The bot's reply has already reached WhatsApp once sendTextMessage resolves — our
// own outbound audit log doesn't need to block the handler from returning.
function logOutboundText(conversationId: string, body: string, waMessageId: string | null): void {
  messageRepository
    .log({ conversationId, direction: "outbound", messageType: "text", body, waMessageId })
    .catch((err) => logger.warn({ err }, "outbound message log failed"))
}

function logOutboundInteractive(
  conversationId: string,
  body: string,
  payload: Record<string, unknown>,
  waMessageId: string | null,
): void {
  messageRepository
    .log({ conversationId, direction: "outbound", messageType: "interactive", body, payload, waMessageId })
    .catch((err) => logger.warn({ err }, "outbound message log failed"))
}

/**
 * Sends a flow's reply as WhatsApp message(s): interactive buttons (always-visible,
 * WhatsApp caps these at 3) if present, then an interactive list (>2 tappable options
 * behind a "View options" tap) if present — as two separate messages when both are set,
 * since WhatsApp doesn't support mixing button and list UI in one message. Falls back
 * to plain text only when neither is present.
 */
async function sendFlowReply(
  phoneE164: string,
  conversationId: string,
  reply: {
    text?: string
    list?: { buttonLabel: string; rows: { id: string; title: string }[] }
    buttons?: { id: string; title: string }[]
    buttonsText?: string
  },
): Promise<void> {
  if (reply.buttons) {
    const body = reply.buttonsText ?? reply.text ?? ""
    const { messageId } = await whatsappService.sendInteractiveButtons(phoneE164, body, reply.buttons)
    logOutboundInteractive(conversationId, body, { buttons: reply.buttons }, messageId)
  }
  if (reply.list) {
    const { messageId } = await whatsappService.sendInteractiveList(phoneE164, reply.text ?? "", reply.list.buttonLabel, reply.list.rows)
    logOutboundInteractive(conversationId, reply.text ?? "", reply.list, messageId)
    return
  }
  if (!reply.buttons && reply.text) {
    const { messageId } = await whatsappService.sendTextMessage(phoneE164, reply.text)
    logOutboundText(conversationId, reply.text, messageId)
  }
}

export type InboundMessage = {
  phoneE164: string
  profileName?: string
  text: string
  buttonId?: string | null
  waMessageId?: string | null
}

/**
 * Single entry point for every inbound WhatsApp message. Orchestrates:
 * conversation/patient lookup -> inbound logging -> Redis state load ->
 * deterministic flow routing -> reply send -> outbound logging -> state save.
 *
 * OpenAI is only ever invoked from within clinicInfoFlow (FAQ + intent
 * classification) or as a last-resort fallback below — it never decides
 * appointment state transitions.
 */
export async function handleInboundMessage(input: InboundMessage): Promise<void> {
  const conversation = await conversationRepository.getOrCreate(input.phoneE164, input.profileName)
  // touch() only bumps last_message_at — doesn't need to block the reply.
  conversationRepository.touch(conversation.id).catch((err) => logger.warn({ err }, "conversation touch failed"))

  // The inbound log write and audit record are independent of each other and
  // of everything below — run them together instead of one after another.
  const inboundLog = messageRepository.log({
    conversationId: conversation.id,
    direction: "inbound",
    messageType: input.buttonId ? "interactive" : "text",
    body: input.text,
    waMessageId: input.waMessageId,
  })
  const inboundAudit = auditLogRepository.record({
    actorType: "patient",
    actorId: conversation.patient_id,
    action: "message.received",
    entityType: "whatsapp_conversation",
    entityId: conversation.id,
    metadata: { text: input.text },
  })

  if (input.waMessageId) {
    whatsappService.markAsRead(input.waMessageId).catch((err) => logger.warn({ err }, "markAsRead failed"))
  }

  const [{ context: loaded, isNew }, settings] = await Promise.all([
    redisStateService.get(input.phoneE164, conversation.id),
    clinicSettingsRepository.get(),
    inboundLog,
    inboundAudit,
  ])

  const normalizedText = input.text.trim().toLowerCase()
  let context: ConversationContext = loaded

  // Very first turn (or the patient hasn't picked a language yet and just greeted us):
  // try to infer the language from their own wording first ("hii" -> English, "hola" ->
  // Spanish) instead of always interrupting with a picker. Only when that's ambiguous do
  // we fall back to asking explicitly.
  if (!context.language && (isNew || isGreeting(normalizedText))) {
    const detected = detectLanguageHeuristic(input.text)
    if (detected) {
      await conversationRepository.setLanguage(conversation.id, detected)
      context = { ...context, language: detected, state: ConversationState.AWAITING_MENU_SELECTION }
      // Fall through to normal dispatch below so a message like "I have a fever, book
      // me asap" both sets the language AND gets acted on in this same turn.
    } else {
      const promptText = t("es", "languagePrompt", { clinicName: settings.clinic_name })
      // Button titles are bilingual on purpose — the patient hasn't picked a language yet.
      await sendFlowReply(input.phoneE164, conversation.id, {
        text: promptText,
        buttons: [
          { id: "1", title: "Español" },
          { id: "2", title: "English" },
        ],
      })
      await redisStateService.save(input.phoneE164, {
        ...context,
        state: ConversationState.AWAITING_LANGUAGE_SELECTION,
      })
      return
    }
  }

  // Global escape hatch: typing a greeting/menu word anytime resets to the main menu,
  // unless the patient is mid-way through providing free-text booking details, where
  // "hola"/"hi" as a literal answer (e.g. a child named "Hola") would be nonsensical
  // but still rare enough that we only special-case it outside active data-entry states.
  const inFreeTextEntry = [
    ConversationState.AWAITING_NAME,
    ConversationState.AWAITING_PHONE,
    ConversationState.AWAITING_REASON,
  ].includes(context.state)

  // Always short-circuit straight to the menu on a greeting, even if the patient is
  // already sitting at AWAITING_MENU_SELECTION — mainMenuFlow has no case for "hi",
  // so without this a repeated "hi" after one invalid choice would loop on
  // menuInvalid forever instead of ever re-showing the menu.
  if (context.language && isGreeting(normalizedText) && !inFreeTextEntry) {
    const next = { ...context, state: ConversationState.AWAITING_MENU_SELECTION, activeFlow: FlowType.NONE }
    const menuReply = buildMainMenu(context.language, settings)
    await sendFlowReply(input.phoneE164, conversation.id, menuReply)
    const withHistory = redisStateService.appendTurn(
      redisStateService.appendTurn(next, "user", input.text),
      "assistant",
      menuReply.text ?? "",
    )
    await redisStateService.save(input.phoneE164, withHistory)
    return
  }

  const handler = context.language
    ? FLOW_BY_STATE[context.state] ?? mainMenuFlow
    : languageSelectFlow

  let result
  try {
    result = await handler({ text: input.text, buttonId: input.buttonId ?? null, context, settings })
  } catch (err) {
    logger.error({ err, state: context.state }, "Flow handler threw — falling back to generic error reply")
    result = {
      context: { ...context, state: ConversationState.AWAITING_MENU_SELECTION, activeFlow: FlowType.NONE },
      reply: { text: t(context.language ?? "es", "genericFallback") },
    }
  }

  // If a flow produced no text at all (shouldn't normally happen) and OpenAI has
  // context, use it purely to phrase a graceful fallback — never to alter state.
  if (!result.reply.text && !result.reply.location && context.language) {
    const fallback = await openaiService.fallbackReply(input.text, context.language)
    result.reply.text = fallback || t(context.language, "genericFallback")
  }

  if (result.reply.text || result.reply.list || result.reply.buttons) {
    await sendFlowReply(input.phoneE164, conversation.id, result.reply)
  }

  if (result.reply.location) {
    const { messageId } = await whatsappService.sendLocationMessage(input.phoneE164, result.reply.location)
    messageRepository
      .log({
        conversationId: conversation.id,
        direction: "outbound",
        messageType: "location",
        payload: result.reply.location,
        waMessageId: messageId,
      })
      .catch((err) => logger.warn({ err }, "outbound location log failed"))
  }

  if (result.context.state === ConversationState.ESCALATED_TO_HUMAN) {
    await conversationRepository.setStatus(conversation.id, "escalated")
    await auditLogRepository.record({
      actorType: "system",
      action: "conversation.escalated",
      entityType: "whatsapp_conversation",
      entityId: conversation.id,
    })
  }

  const withHistory = redisStateService.appendTurn(
    redisStateService.appendTurn(result.context, "user", input.text),
    "assistant",
    result.reply.text ?? "",
  )
  await redisStateService.save(input.phoneE164, withHistory)
}
