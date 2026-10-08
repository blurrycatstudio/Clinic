import type { MenuOptionKey } from "@clinic/shared"
import { redis } from "../config/redis.js"
import { logger } from "../config/logger.js"

/**
 * "Message us first" for voice callers.
 *
 * WhatsApp won't let the clinic start a chat with free text — only a patient who has messaged
 * in the last 24 hours can receive it. When a caller asks for something to be sent on WhatsApp and
 * their window is closed (and no approved template covers it), the request is parked here. The
 * agent tells the caller to send "Hola" to the clinic's WhatsApp; the moment that greeting arrives
 * (see handleInboundMessage) the parked request is delivered, instead of the generic menu.
 */

export type PendingVoiceRequest = {
  /** Run this main-menu option as if the caller had tapped it (book / info / status / ...). */
  intent?: MenuOptionKey | "menu"
  /** Or send this exact text (e.g. the fees they asked about). */
  text?: string
  language: "en" | "es"
  callId?: string | null
  savedAt: string
}

const TTL_SECONDS = 24 * 60 * 60

/**
 * Keyed on the last 10 digits so the number the voice platform reports ("+52 664…") and the one
 * WhatsApp reports for the same person ("+52 1 664…") find the same request.
 */
function key(phone: string): string {
  return `voice-pending:${phone.replace(/\D/g, "").slice(-10)}`
}

export const voicePendingService = {
  /** Never throws — a Redis hiccup must not break the call (or the patient's incoming message). */
  async save(phone: string, request: Omit<PendingVoiceRequest, "savedAt">): Promise<boolean> {
    try {
      await redis.set(key(phone), { ...request, savedAt: new Date().toISOString() }, { ex: TTL_SECONDS })
      return true
    } catch (err) {
      logger.warn({ err }, "Could not save pending voice request")
      return false
    }
  },

  /** Reads and removes the request in one step, so two quick messages can't deliver it twice. */
  async take(phone: string): Promise<PendingVoiceRequest | null> {
    try {
      const pending = await redis.get<PendingVoiceRequest>(key(phone))
      if (!pending) return null
      await redis.del(key(phone))
      return pending
    } catch (err) {
      logger.warn({ err }, "Could not read pending voice request")
      return null
    }
  },
}
