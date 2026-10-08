import { isWhatsappConfigured } from "../config/env.js"
import { logger } from "../config/logger.js"
import { auditLogRepository } from "../repositories/auditLogRepository.js"
import { messageRepository } from "../repositories/messageRepository.js"
import { whatsappService } from "./whatsappService.js"
import { classifyMetaCode, classifyWhatsappError, type WhatsappFailureKind } from "../lib/whatsappErrors.js"

/**
 * Everything the voice agent promises to "send on WhatsApp" goes through here, so the
 * agent can only ever say "sent" when WhatsApp really took the message — and is told
 * exactly what to say when it didn't.
 *
 * Why this exists: a phone call does NOT open WhatsApp's 24-hour customer-service
 * window. For anyone who hasn't messaged the clinic in the last day, free-text and
 * interactive messages are rejected (Meta error 131047) and only an approved template
 * can start the chat. And a "number isn't on WhatsApp" failure (131026) is reported
 * asynchronously — the send call itself succeeds. So each delivery:
 *
 *   1. tries the rich in-session message (buttons, map pin, ...);
 *   2. if the window is closed, falls back to an approved template carrying the same content;
 *   3. waits a few seconds for WhatsApp's delivery receipt, so a dead number is caught
 *      while the caller is still on the line;
 *   4. returns an honest, agent-readable verdict.
 */

export type VoiceDeliveryFailure =
  /** 24h window closed and no approved template covers this content. */
  | "window_closed"
  | "not_on_whatsapp"
  | "rate_limited"
  | "not_configured"
  | "technical"
  | "nothing_to_send"

export type VoiceDeliveryResult = {
  /** True only when WhatsApp accepted a message for this number. */
  sent: boolean
  via: "session" | "template" | null
  /** "delivered": WhatsApp confirmed the phone received it. "accepted": WhatsApp took it but the phone hasn't confirmed yet (slow / offline). */
  confirmation: "delivered" | "accepted" | null
  failure?: VoiceDeliveryFailure
  /** The clinic's WhatsApp number, only when the caller has to message us first (failure === "window_closed"). */
  clinicWhatsappNumber?: string
  /** True when the request was saved and will be delivered automatically the moment the caller messages the clinic first. */
  queued?: boolean
  /** Instruction for the voice model: what happened and exactly what to tell the caller. */
  message: string
}

/** One way of getting content to the patient. Throws on rejection; resolves with the WhatsApp message ids accepted. */
export type DeliveryAttempt = () => Promise<{ messageIds: string[] }>

/** Thrown by an attempt whose underlying sender already swallowed Meta's error but kept its classification. */
export class AttemptFailed extends Error {
  readonly kind: WhatsappFailureKind
  constructor(kind: WhatsappFailureKind) {
    super(`WhatsApp delivery attempt failed (${kind})`)
    this.name = "AttemptFailed"
    this.kind = kind
  }
}

/** Voice tool calls have a hard timeout upstream; the check must stay well inside it. */
const DELIVERY_CHECK_MS = 3000
const DELIVERY_POLL_MS = 500

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

type DeliveryState = { state: "delivered" | "accepted" } | { state: "failed"; kind: WhatsappFailureKind }

/**
 * Watches the delivery receipts Meta posts to our webhook. Returns "failed" the moment one
 * arrives (e.g. 131026, number not on WhatsApp), "delivered" once all are on the phone, and
 * "accepted" if the receipt hasn't come back within the budget.
 */
async function awaitDeliveryState(messageIds: string[]): Promise<DeliveryState> {
  const deadline = Date.now() + DELIVERY_CHECK_MS
  for (;;) {
    const rows = await messageRepository.findDeliveryByWaIds(messageIds).catch((err) => {
      logger.warn({ err }, "Could not read WhatsApp delivery status")
      return []
    })
    const failed = rows.find((row) => row.status === "failed")
    if (failed) return { state: "failed", kind: classifyMetaCode(failed.errorCode) }
    if (rows.length === messageIds.length && rows.every((row) => row.status === "delivered" || row.status === "read")) {
      return { state: "delivered" }
    }
    if (Date.now() >= deadline) return { state: "accepted" }
    await sleep(DELIVERY_POLL_MS)
  }
}

type AttemptOutcome = { ok: true; state: "delivered" | "accepted" } | { ok: false; kind: WhatsappFailureKind }

async function runAttempt(attempt: DeliveryAttempt): Promise<AttemptOutcome> {
  try {
    const { messageIds } = await attempt()
    if (messageIds.length === 0) {
      // Nothing went out: either WhatsApp is in dev-simulation mode, or the reply was empty.
      return { ok: false, kind: isWhatsappConfigured ? "unknown" : "not_configured" }
    }
    const delivery = await awaitDeliveryState(messageIds)
    return delivery.state === "failed" ? { ok: false, kind: delivery.kind } : { ok: true, state: delivery.state }
  } catch (err) {
    const kind = err instanceof AttemptFailed ? err.kind : classifyWhatsappError(err)
    logger.warn({ err, kind }, "Voice WhatsApp delivery attempt failed")
    return { ok: false, kind }
  }
}

function toFailure(kind: WhatsappFailureKind): VoiceDeliveryFailure {
  switch (kind) {
    case "session_expired":
      return "window_closed"
    case "not_on_whatsapp":
      return "not_on_whatsapp"
    case "rate_limited":
      return "rate_limited"
    case "not_configured":
      return "not_configured"
    default:
      return "technical"
  }
}

const READ_ALOUD_HINT = "Offer to read the details out loud right now."

function failureMessage(failure: VoiceDeliveryFailure, hint: string, clinicNumber: string | null, queuedSummary?: string): string {
  const head = "NOT SENT. Do NOT tell the caller anything was sent."
  switch (failure) {
    case "window_closed":
      if (queuedSummary) {
        return (
          `${head} WhatsApp only lets the clinic start a chat with someone who has messaged first, and this number hasn't in the last 24 hours. ` +
          `Your request is SAVED. Tell the caller: "Please send a WhatsApp message saying Hola to the clinic${clinicNumber ? ` at ${clinicNumber}` : ""} — ` +
          `the moment you do, you'll receive ${queuedSummary} automatically." ${hint}`
        )
      }
      return (
        `${head} This number hasn't messaged the clinic on WhatsApp in the last 24 hours, and WhatsApp doesn't allow the clinic to start the chat with free text. ` +
        `Tell the caller: if they send a message saying "Hola" to the clinic's WhatsApp${clinicNumber ? ` (${clinicNumber})` : ""}, the clinic answers right there. ${hint}`
      )
    case "not_on_whatsapp":
      return (
        `${head} WhatsApp says this number has no WhatsApp account. Ask whether they have another number that uses WhatsApp ` +
        `(then call this tool again with that number as "phone"). Otherwise: ${hint}`
      )
    case "rate_limited":
      return `${head} WhatsApp is temporarily limiting messages. Don't retry during this call. ${hint} Say a team member will send it afterwards.`
    case "not_configured":
    case "technical":
      return `${head} A technical problem stopped it. Don't promise it will arrive. ${hint} Offer a callback from the team if they'd like the details in writing.`
    case "nothing_to_send":
      return `${head} There was nothing to send. ${hint}`
  }
}

function successMessage(via: "session" | "template", confirmation: "delivered" | "accepted"): string {
  const how = via === "template" ? " as a message from the clinic with a button on it" : ""
  return confirmation === "delivered"
    ? `SENT${how}. WhatsApp confirms it reached the caller's phone. Tell the caller it's there and to check WhatsApp.`
    : `SENT${how}. WhatsApp accepted it and will show it on the caller's phone in a moment (longer if their phone is offline). Tell the caller to check WhatsApp shortly.`
}

export function nothingToSend(message: string): VoiceDeliveryResult {
  return { sent: false, via: null, confirmation: null, failure: "nothing_to_send", message: `NOT SENT. ${message}` }
}

export async function deliverToPatient(input: {
  phone: string
  /** What is being delivered ("clinic_info", "appointment_details", ...) — for the audit trail. */
  purpose: string
  callId?: string | null
  session: DeliveryAttempt
  /** Approved-template route for when the 24h window is closed. Omit when no approved template covers this content. */
  template?: DeliveryAttempt | null
  /** What the agent can do instead when this fails — usually "read it aloud", with the content in the same response. */
  fallbackHint?: string
  /**
   * When the 24h window is closed and no template covers this: save the request so it is delivered
   * automatically as soon as the caller messages the clinic. `summary` completes "you'll receive ___".
   */
  queue?: { save: () => Promise<boolean>; summary: string }
}): Promise<VoiceDeliveryResult> {
  const hint = input.fallbackHint ?? READ_ALOUD_HINT

  const finish = async (result: Omit<VoiceDeliveryResult, "message"> & { message?: string }): Promise<VoiceDeliveryResult> => {
    let clinicWhatsappNumber: string | undefined
    let queued = false
    if (result.failure === "window_closed") {
      clinicWhatsappNumber = (await whatsappService.getDisplayPhoneNumber()) ?? undefined
      if (input.queue) queued = await input.queue.save().catch(() => false)
    }
    const message =
      result.message ??
      (result.sent
        ? successMessage(result.via ?? "session", result.confirmation ?? "accepted")
        : failureMessage(result.failure ?? "technical", hint, clinicWhatsappNumber ?? null, queued ? input.queue?.summary : undefined))
    const final: VoiceDeliveryResult = {
      ...result,
      ...(clinicWhatsappNumber ? { clinicWhatsappNumber } : {}),
      ...(queued ? { queued: true } : {}),
      message,
    }

    if (!final.sent) {
      logger.error({ purpose: input.purpose, phone: input.phone, failure: final.failure }, "Voice agent could not deliver a WhatsApp message")
    }
    await auditLogRepository.record({
      actorType: "ai",
      action: "voice.whatsapp_delivery",
      entityType: "voice_call",
      entityId: input.callId ?? null,
      metadata: {
        purpose: input.purpose,
        phone: input.phone,
        sent: final.sent,
        via: final.via,
        confirmation: final.confirmation,
        failure: final.failure ?? null,
        queued,
      },
    })
    return final
  }

  if (!isWhatsappConfigured) {
    return finish({ sent: false, via: null, confirmation: null, failure: "not_configured" })
  }

  const viaSession = await runAttempt(input.session)
  if (viaSession.ok) return finish({ sent: true, via: "session", confirmation: viaSession.state })

  // The 24h window is closed — the only thing WhatsApp will accept is an approved template.
  if (viaSession.kind === "session_expired" && input.template) {
    const viaTemplate = await runAttempt(input.template)
    if (viaTemplate.ok) return finish({ sent: true, via: "template", confirmation: viaTemplate.state })
    return finish({ sent: false, via: null, confirmation: null, failure: toFailure(viaTemplate.kind) })
  }

  return finish({ sent: false, via: null, confirmation: null, failure: toFailure(viaSession.kind) })
}
