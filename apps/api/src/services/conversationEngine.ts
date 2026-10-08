import { ConversationState, FlowType, t } from "@clinic/shared"
import type { ConversationContext, MenuOptionKey } from "@clinic/shared"
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
import { reminderResponseFlow } from "../flows/reminderResponseFlow.js"
import { clinicInfoFlow } from "../flows/clinicInfoFlow.js"
import { humanSupportFlow } from "../flows/humanSupportFlow.js"
import type { FlowHandler, FlowReply } from "../flows/types.js"
import { logger } from "../config/logger.js"
import { detectLanguageHeuristic } from "../lib/detectLanguage.js"
import { patientRepository } from "../repositories/patientRepository.js"
import { appointmentService } from "./appointmentService.js"
import { deliverToPatient, nothingToSend, type VoiceDeliveryResult } from "./voiceDeliveryService.js"
import { voicePendingService } from "./voicePendingService.js"
import {
  appointmentDetailsTemplate,
  clinicInfoTemplate,
  followupTemplate,
  type TemplateTarget,
} from "./voiceTemplateAttempts.js"

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

/** A greeting at the START of a message ("hola", "hi there", "buenos dias, soy ...") — looser than isGreeting, which needs the whole message to be the greeting. */
const STARTS_WITH_GREETING = /^(h+i+|h+e+y+|h+e+ll+o+|hola+|buenas|buenos\s*d[ií]as)\b/

/** States where the patient's next message is a literal answer (their name, a reason) — a "hola" there is data, not a greeting. */
const FREE_TEXT_ENTRY_STATES = [ConversationState.AWAITING_NAME, ConversationState.AWAITING_PHONE, ConversationState.AWAITING_REASON]

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
  [ConversationState.AWAITING_REMINDER_RESPONSE]: reminderResponseFlow,
  [ConversationState.AWAITING_FAQ_QUESTION]: clinicInfoFlow,
  [ConversationState.ESCALATED_TO_HUMAN]: humanSupportFlow,
}

/**
 * Threaded through the send helpers. The inbound-message path leaves this at its default
 * (fire-and-forget logging — the bot's reply has already reached WhatsApp once the send
 * resolves, so our own audit log mustn't delay it). The voice path opts into awaiting the
 * log write instead: a delivery-status webhook can only update a row that already exists,
 * and Vercel may freeze the function the moment the tool response goes out.
 */
export type SendOptions = { awaitLogs?: boolean }
type SendContext = { awaitLogs: boolean; messageIds: string[] }

function newSendContext(opts?: SendOptions): SendContext {
  return { awaitLogs: opts?.awaitLogs ?? false, messageIds: [] }
}

/** Never rejects: a failed audit write must not turn a delivered message into a reported failure. */
function logOutbound(input: Parameters<typeof messageRepository.log>[0]): Promise<void> {
  return messageRepository
    .log(input)
    .then(() => undefined)
    .catch((err) => logger.warn({ err }, "outbound message log failed"))
}

async function track(ctx: SendContext, messageId: string | null, logging: Promise<void>): Promise<void> {
  if (messageId) ctx.messageIds.push(messageId)
  if (ctx.awaitLogs) await logging
}

/** Sends a "Get Directions" CTA-URL button, when a flow's reply carries one — a real tappable button that works off just a maps link, no lat/long needed. */
async function sendCtaUrlIfPresent(
  phoneE164: string,
  conversationId: string,
  ctaUrl: { bodyText: string; displayText: string; url: string } | undefined,
  ctx: SendContext,
): Promise<void> {
  if (!ctaUrl) return
  const { messageId } = await whatsappService.sendCtaUrlButton(phoneE164, ctaUrl.bodyText, ctaUrl.displayText, ctaUrl.url)
  await track(
    ctx,
    messageId,
    logOutbound({ conversationId, direction: "outbound", messageType: "interactive", body: ctaUrl.bodyText, payload: { ctaUrl }, waMessageId: messageId }),
  )
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
  ctx: SendContext = newSendContext(),
): Promise<void> {
  if (reply.buttons) {
    const body = reply.buttonsText ?? reply.text ?? ""
    const { messageId } = await whatsappService.sendInteractiveButtons(phoneE164, body, reply.buttons)
    await track(
      ctx,
      messageId,
      logOutbound({ conversationId, direction: "outbound", messageType: "interactive", body, payload: { buttons: reply.buttons }, waMessageId: messageId }),
    )
  }
  if (reply.list) {
    const { messageId } = await whatsappService.sendInteractiveList(phoneE164, reply.text ?? "", reply.list.buttonLabel, reply.list.rows)
    await track(
      ctx,
      messageId,
      logOutbound({ conversationId, direction: "outbound", messageType: "interactive", body: reply.text ?? "", payload: reply.list, waMessageId: messageId }),
    )
    return
  }
  if (!reply.buttons && reply.text) {
    const { messageId } = await whatsappService.sendTextMessage(phoneE164, reply.text)
    await track(ctx, messageId, logOutbound({ conversationId, direction: "outbound", messageType: "text", body: reply.text, waMessageId: messageId }))
  }
}

/**
 * Sends a full FlowReply (ctaUrl button, native location pin, then text/list/buttons)
 * outside the normal inbound-message turn — used wherever a flow's reply needs sending
 * on its own, e.g. a voice handoff or a cron-triggered reminder attaching directions.
 * Resolves with the WhatsApp message ids that were accepted, so a caller that promised
 * the patient something can verify it actually landed.
 */
export async function sendFlowReplyOutOfBand(
  phoneE164: string,
  conversationId: string,
  reply: FlowReply,
  opts?: SendOptions,
): Promise<{ messageIds: string[] }> {
  const ctx = newSendContext(opts)
  // Sent first, ahead of the text, so the "Get Directions" button (or native pin, if
  // coordinates exist) leads the reply instead of trailing behind any body text.
  await sendCtaUrlIfPresent(phoneE164, conversationId, reply.ctaUrl, ctx)
  if (reply.location) {
    const { messageId } = await whatsappService.sendLocationMessage(phoneE164, reply.location)
    await track(
      ctx,
      messageId,
      logOutbound({ conversationId, direction: "outbound", messageType: "location", payload: reply.location, waMessageId: messageId }),
    )
  }

  // suppressTextSend is set when `text` is only address+link duplicating the native
  // location pin sent above (see locationReply) — kept for history, but not sent twice.
  if ((reply.text && !reply.suppressTextSend) || reply.list || reply.buttons) {
    await sendFlowReply(phoneE164, conversationId, reply, ctx)
  }
  return { messageIds: ctx.messageIds }
}

export type InboundMessage = {
  phoneE164: string
  profileName?: string
  text: string
  buttonId?: string | null
  waMessageId?: string | null
}

export type VoiceHandoffResult = VoiceDeliveryResult & { state: ConversationState | null }

/** What the agent can still do for the caller when the WhatsApp message could not go out. */
const HANDOFF_FALLBACK_HINT: Record<MenuOptionKey | "menu", string> = {
  info: "Offer to read the clinic details out loud instead (use get_clinic_faq).",
  status: "Offer to read their appointment details out loud instead (use get_appointment_status).",
  book: "Offer a callback from the team to book it for them.",
  reschedule: "Offer a callback from the team to reschedule it for them.",
  cancel: "Offer a callback from the team to cancel it for them.",
  human: "Use escalate_to_human so the team is alerted, and keep helping by voice.",
  menu: "Keep helping by voice, or offer a callback from the team.",
}

/** Completes "…the moment you do, you'll receive ___ automatically" in the agent's instructions. */
const HANDOFF_QUEUED_SUMMARY: Record<MenuOptionKey | "menu", string> = {
  info: "the clinic's address, hours and parking",
  status: "your appointment details",
  book: "the steps to book your appointment",
  reschedule: "the steps to reschedule your appointment",
  cancel: "the steps to cancel your appointment",
  human: "the clinic's contact options",
  menu: "the clinic's menu",
}

/**
 * Entry point for the voice channel handing a call off to WhatsApp. The voice
 * agent no longer collects booking details itself — it identifies intent,
 * then calls this to push the patient straight into the matching WhatsApp
 * flow, reusing the exact same mainMenuFlow/buildMainMenu logic (and Redis
 * state) that inbound WhatsApp messages use, so a patient who continues on
 * WhatsApp lands in a consistent conversation regardless of which channel
 * started it.
 *
 * A phone call does not open WhatsApp's 24h session window, so the in-session reply
 * only works for patients who messaged recently. Everyone else gets an approved
 * template instead (clinic info / appointment details / a follow-up opener whose
 * button resumes the flow) — and if neither is possible the result says so plainly,
 * so the agent never claims a message that was never sent.
 */
export async function triggerVoiceHandoff(
  phoneE164: string,
  intent: MenuOptionKey | "menu",
  language?: "en" | "es",
  callId?: string | null,
): Promise<VoiceHandoffResult> {
  const conversation = await conversationRepository.getOrCreate(phoneE164)
  await conversationRepository.touch(conversation.id).catch((err) => logger.warn({ err }, "conversation touch failed"))

  const [{ context: loaded }, settings, patient] = await Promise.all([
    redisStateService.get(phoneE164, conversation.id),
    clinicSettingsRepository.get(),
    patientRepository.findByPhone(phoneE164),
  ])

  const lang = language ?? loaded.language ?? patient?.language ?? "es"
  const context: ConversationContext = { ...loaded, language: lang }

  // "Send me my appointment details" with nothing booked: there is nothing worth sending,
  // and the agent can answer it directly.
  const upcoming = intent === "status" ? await appointmentService.findActiveAppointmentsForPhone(phoneE164) : []
  if (intent === "status" && upcoming.length === 0) {
    return {
      ...nothingToSend("There are no upcoming appointments booked under this number. Tell the caller that and offer to book one."),
      state: null,
    }
  }

  const result =
    intent === "menu"
      ? {
          context: { ...context, state: ConversationState.AWAITING_MENU_SELECTION, activeFlow: FlowType.NONE },
          reply: buildMainMenu(lang, settings),
        }
      : await mainMenuFlow({
          text: "",
          buttonId: intent,
          context: { ...context, state: ConversationState.AWAITING_MENU_SELECTION },
          settings,
        })

  const target: TemplateTarget = {
    phone: phoneE164,
    conversationId: conversation.id,
    language: lang,
    patientName: patient?.full_name ?? null,
    settings,
  }
  const template =
    intent === "info"
      ? clinicInfoTemplate(target)
      : intent === "status"
        ? appointmentDetailsTemplate(target, upcoming)
        : followupTemplate(target, intent)

  const delivery = await deliverToPatient({
    phone: phoneE164,
    purpose: `handoff:${intent}`,
    callId,
    session: () => sendFlowReplyOutOfBand(phoneE164, conversation.id, result.reply, { awaitLogs: true }),
    template,
    fallbackHint: HANDOFF_FALLBACK_HINT[intent],
    // No window, no template: remember the request and deliver it the moment the caller messages first.
    queue: {
      save: () => voicePendingService.save(phoneE164, { intent, language: lang, callId }),
      summary: HANDOFF_QUEUED_SUMMARY[intent],
    },
  })

  await auditLogRepository.record({
    actorType: "system",
    action: "voice.whatsapp_handoff",
    entityType: "whatsapp_conversation",
    entityId: conversation.id,
    metadata: { intent, language: lang, sent: delivery.sent, via: delivery.via, failure: delivery.failure ?? null, callId: callId ?? null },
  })

  if (!delivery.sent) return { ...delivery, state: null }

  // In-session: the patient is now sitting at whatever the flow asked. Via template: they
  // haven't answered anything yet, so park them at the menu — their button tap carries the
  // original intent (see webhookController) and takes it from there.
  const nextContext =
    delivery.via === "session"
      ? result.context
      : { ...context, state: ConversationState.AWAITING_MENU_SELECTION, activeFlow: FlowType.NONE }
  const assistantTurn = delivery.via === "session" ? (result.reply.text ?? "") : `[Follow-up message sent after the phone call: ${intent}]`
  await redisStateService.save(phoneE164, redisStateService.appendTurn(nextContext, "assistant", assistantTurn))

  if (nextContext.state === ConversationState.ESCALATED_TO_HUMAN) {
    await conversationRepository.setStatus(conversation.id, "escalated").catch((err) => logger.warn({ err }, "escalation status update failed"))
  }

  return { ...delivery, state: nextContext.state }
}

/**
 * Delivers what a caller asked the voice agent to send once they've messaged the clinic first
 * (see voicePendingService). Returns true when it handled the message; false means "nothing was
 * waiting (or it failed) — carry on with the normal conversation".
 */
async function deliverPendingVoiceRequest(
  phoneE164: string,
  conversationId: string,
  loadedContext: ConversationContext,
  settings: Awaited<ReturnType<typeof clinicSettingsRepository.get>>,
): Promise<boolean> {
  const pending = await voicePendingService.take(phoneE164)
  if (!pending) return false

  try {
    const lang = pending.language
    await conversationRepository.setLanguage(conversationId, lang)
    const context: ConversationContext = { ...loadedContext, language: lang, state: ConversationState.AWAITING_MENU_SELECTION, activeFlow: FlowType.NONE }

    let nextContext = context
    let shown = ""
    if (pending.text) {
      const { messageId } = await whatsappService.sendTextMessage(phoneE164, pending.text)
      await messageRepository.log({ conversationId, direction: "outbound", messageType: "text", body: pending.text, waMessageId: messageId })
      shown = pending.text
    } else {
      const result =
        !pending.intent || pending.intent === "menu"
          ? { context, reply: buildMainMenu(lang, settings) }
          : await mainMenuFlow({ text: "", buttonId: pending.intent, context, settings })
      await sendFlowReplyOutOfBand(phoneE164, conversationId, result.reply, { awaitLogs: true })
      nextContext = result.context
      shown = result.reply.text ?? ""
    }

    await redisStateService.save(phoneE164, redisStateService.appendTurn(nextContext, "assistant", shown))
    if (nextContext.state === ConversationState.ESCALATED_TO_HUMAN) {
      await conversationRepository.setStatus(conversationId, "escalated").catch((err) => logger.warn({ err }, "escalation status update failed"))
    }
    await auditLogRepository.record({
      actorType: "system",
      action: "voice.whatsapp_delivery",
      entityType: "whatsapp_conversation",
      entityId: conversationId,
      metadata: { purpose: `pending:${pending.intent ?? "text"}`, phone: phoneE164, sent: true, via: "session", afterPatientMessaged: true, callId: pending.callId ?? null },
    })
    return true
  } catch (err) {
    // Put it back so the patient's next greeting tries again, and let this message get the normal menu.
    logger.error({ err }, "Could not deliver a pending voice request after the patient messaged")
    await voicePendingService.save(phoneE164, { intent: pending.intent, text: pending.text, language: pending.language, callId: pending.callId })
    return false
  }
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

  // A caller who asked the voice agent for something on WhatsApp but hadn't messaged us yet gets it
  // now: their greeting is what opens the 24h window. Only a plain greeting triggers this, so a
  // patient who opens with a real request ("cancel my appointment") is never answered with something else.
  if (STARTS_WITH_GREETING.test(normalizedText) && !FREE_TEXT_ENTRY_STATES.includes(context.state)) {
    const delivered = await deliverPendingVoiceRequest(input.phoneE164, conversation.id, context, settings)
    if (delivered) return
  }

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

  // The patient already has a language on file but just greeted us in the other one
  // (e.g. "hola" after a previous conversation that started in English) — switch so
  // the menu we're about to show, and everything downstream, matches what they just
  // typed instead of staying stuck in whatever language got set first.
  if (context.language && isGreeting(normalizedText)) {
    const detected = detectLanguageHeuristic(input.text)
    if (detected && detected !== context.language) {
      await conversationRepository.setLanguage(conversation.id, detected)
      context = { ...context, language: detected }
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

  // A tapped "🔙 Menu" button (id "menu", attached to nearly every prompt so mobile
  // patients always have a way out without scrolling back up or retyping "menu") is
  // unambiguous — unlike the literal typed word, which could coincidentally be a
  // patient's actual name/reason — so it resets to the menu even mid free-text entry.
  const tappedBackToMenu = input.buttonId === "menu"

  // Always short-circuit straight to the menu on a greeting, even if the patient is
  // already sitting at AWAITING_MENU_SELECTION — mainMenuFlow has no case for "hi",
  // so without this a repeated "hi" after one invalid choice would loop on
  // menuInvalid forever instead of ever re-showing the menu.
  if (context.language && (tappedBackToMenu || (isGreeting(normalizedText) && !inFreeTextEntry))) {
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
  // (Not for an escalated chat: there the bot is meant to stay quiet so staff can answer.)
  if (!result.reply.text && !result.reply.location && context.language && result.context.state !== ConversationState.ESCALATED_TO_HUMAN) {
    const fallback = await openaiService.fallbackReply(input.text, context.language)
    result.reply.text = fallback || t(context.language, "genericFallback")
  }

  await sendFlowReplyOutOfBand(input.phoneE164, conversation.id, result.reply)

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
