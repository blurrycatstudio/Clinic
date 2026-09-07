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
import { mainMenuFlow } from "../flows/mainMenuFlow.js"
import { bookAppointmentFlow } from "../flows/bookAppointmentFlow.js"
import { rescheduleFlow } from "../flows/rescheduleFlow.js"
import { cancelFlow } from "../flows/cancelFlow.js"
import { clinicInfoFlow } from "../flows/clinicInfoFlow.js"
import { humanSupportFlow } from "../flows/humanSupportFlow.js"
import type { FlowHandler } from "../flows/types.js"
import { logger } from "../config/logger.js"

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
  await conversationRepository.touch(conversation.id)

  await messageRepository.log({
    conversationId: conversation.id,
    direction: "inbound",
    messageType: input.buttonId ? "interactive" : "text",
    body: input.text,
    waMessageId: input.waMessageId,
  })
  await auditLogRepository.record({
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

  const { context: loaded, isNew } = await redisStateService.get(input.phoneE164, conversation.id)
  const settings = await clinicSettingsRepository.get()

  const normalizedText = input.text.trim().toLowerCase()
  let context: ConversationContext = loaded

  // Very first turn (or the patient hasn't picked a language yet and just greeted us):
  // show the language picker verbatim instead of trying to parse "Hi" as a 1/2 choice.
  if (!context.language && (isNew || isGreeting(normalizedText))) {
    const promptText = t("es", "languagePrompt", { clinicName: settings.clinic_name })
    const { messageId } = await whatsappService.sendTextMessage(input.phoneE164, promptText)
    await messageRepository.log({
      conversationId: conversation.id,
      direction: "outbound",
      messageType: "text",
      body: promptText,
      waMessageId: messageId,
    })
    await redisStateService.save(input.phoneE164, {
      ...context,
      state: ConversationState.AWAITING_LANGUAGE_SELECTION,
    })
    return
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
    const menuText = t(context.language, "mainMenu", { clinicName: settings.clinic_name })
    const { messageId } = await whatsappService.sendTextMessage(input.phoneE164, menuText)
    await messageRepository.log({
      conversationId: conversation.id,
      direction: "outbound",
      messageType: "text",
      body: menuText,
      waMessageId: messageId,
    })
    const withHistory = redisStateService.appendTurn(
      redisStateService.appendTurn(next, "user", input.text),
      "assistant",
      menuText,
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

  if (result.reply.text) {
    const { messageId } = await whatsappService.sendTextMessage(input.phoneE164, result.reply.text)
    await messageRepository.log({
      conversationId: conversation.id,
      direction: "outbound",
      messageType: "text",
      body: result.reply.text,
      waMessageId: messageId,
    })
  }

  if (result.reply.location) {
    const { messageId } = await whatsappService.sendLocationMessage(input.phoneE164, result.reply.location)
    await messageRepository.log({
      conversationId: conversation.id,
      direction: "outbound",
      messageType: "location",
      payload: result.reply.location,
      waMessageId: messageId,
    })
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
