import {
  CONVERSATION_STATE_TTL_SECONDS,
  ConversationState,
  FlowType,
  type ConversationContext,
  type Language,
} from "@clinic/shared"
import { redis } from "../config/redis.js"
import { conversationStateRepository } from "../repositories/conversationStateRepository.js"
import { logger } from "../config/logger.js"

/**
 * Redis is the source of truth for "where is this conversation right now".
 * Key: `conv:{phoneE164}` -> ConversationContext JSON, TTL 24h, refreshed on
 * every write. If a key is missing (expired, evicted, or first-ever message)
 * we fall back to the Supabase mirror before giving up and starting fresh —
 * see get() below. This keeps the whole flow deterministic and out of
 * OpenAI's hands: state transitions are plain code, never model output.
 */
function redisKey(phoneE164: string): string {
  return `conv:${phoneE164}`
}

function freshContext(phoneE164: string, conversationId: string): ConversationContext {
  return {
    conversationId,
    patientId: null,
    phoneE164,
    language: null,
    state: ConversationState.AWAITING_LANGUAGE_SELECTION,
    activeFlow: FlowType.NONE,
    recentTurns: [],
    updatedAt: new Date().toISOString(),
  }
}

export const redisStateService = {
  async get(phoneE164: string, conversationId: string): Promise<{ context: ConversationContext; isNew: boolean }> {
    const cached = await redis.get<ConversationContext>(redisKey(phoneE164))
    if (cached) {
      return { context: cached, isNew: false }
    }

    logger.info({ phoneE164 }, "No live Redis state found, checking durable snapshot")
    const recovered = await conversationStateRepository.getLatest(conversationId)
    if (recovered) {
      await this.save(phoneE164, recovered)
      return { context: recovered, isNew: false }
    }

    return { context: freshContext(phoneE164, conversationId), isNew: true }
  },

  async save(phoneE164: string, context: ConversationContext): Promise<void> {
    const updated: ConversationContext = { ...context, updatedAt: new Date().toISOString() }
    await redis.set(redisKey(phoneE164), updated, { ex: CONVERSATION_STATE_TTL_SECONDS })

    const expiresAt = new Date(Date.now() + CONVERSATION_STATE_TTL_SECONDS * 1000).toISOString()
    // Fire-and-forget: never let the audit mirror block or fail the live chat turn.
    conversationStateRepository.upsert(context.conversationId, updated, expiresAt).catch((err) => {
      logger.error({ err }, "Failed to mirror conversation state to Supabase")
    })
  },

  async clear(phoneE164: string, conversationId: string): Promise<void> {
    await redis.del(redisKey(phoneE164))
    await this.save(phoneE164, freshContext(phoneE164, conversationId))
  },

  /**
   * Routes the patient's next message (the tap on a template's Reschedule / Cancel button, or its typed
   * equivalent) to this appointment. Those buttons arrive as plain text, so without this the tap lands on
   * whatever flow state was left over — e.g. a stale booking confirmation, where "Cancel Appointment" is
   * rejected as invalid and a following "Yes" books another appointment instead of cancelling this one.
   */
  async parkOnReminderResponse(phoneE164: string, conversationId: string, appointmentId: string, fallbackLanguage: Language): Promise<void> {
    const { context } = await this.get(phoneE164, conversationId)
    await this.save(phoneE164, {
      ...context,
      language: context.language ?? fallbackLanguage,
      state: ConversationState.AWAITING_REMINDER_RESPONSE,
      activeFlow: FlowType.NONE,
      reminder: { appointmentId },
    })
  },

  appendTurn(context: ConversationContext, role: "user" | "assistant", text: string): ConversationContext {
    const recentTurns = [...context.recentTurns, { role, text }].slice(-6)
    return { ...context, recentTurns }
  },
}
