import { env, isVapiOutboundConfigured } from "../config/env.js"
import { logger } from "../config/logger.js"
import { ExternalServiceError, ValidationError } from "../lib/errors.js"

const VAPI_BASE = "https://api.vapi.ai"

type CreateCallResponse = { id: string }

/**
 * Places a real outbound phone call through Vapi. Unlike whatsappService's
 * dev-mode simulation, this never pretends to succeed — a "call placed"
 * result must mean a real phone actually rang, since staff and cron jobs
 * both treat a returned call id as proof the patient was reached out to.
 */
export const vapiService = {
  async createOutboundCall(input: {
    phoneE164: string
    assistantId?: string
    metadata?: Record<string, unknown>
    /**
     * Per-call overrides applied on top of the assistant's own config —
     * lets a single Vapi assistant behave differently for outbound calls
     * (e.g. a reminder-specific first message and greeting) without
     * needing a second assistant. See Vapi's `assistantOverrides` on
     * POST /call: https://docs.vapi.ai
     */
    assistantOverrides?: {
      firstMessage?: string
      variableValues?: Record<string, string | number | boolean>
    }
  }): Promise<{ vapiCallId: string }> {
    if (!isVapiOutboundConfigured) {
      throw new ValidationError(
        "Outbound calling isn't configured yet — set VAPI_API_KEY and VAPI_PHONE_NUMBER_ID.",
      )
    }

    const assistantId = input.assistantId || env.VAPI_ASSISTANT_ID
    if (!assistantId) {
      throw new ValidationError("No Vapi assistant configured for outbound calls.")
    }

    const res = await fetch(`${VAPI_BASE}/call`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.VAPI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        assistantId,
        phoneNumberId: env.VAPI_PHONE_NUMBER_ID,
        customer: { number: input.phoneE164 },
        ...(input.metadata ? { metadata: input.metadata } : {}),
        ...(input.assistantOverrides ? { assistantOverrides: input.assistantOverrides } : {}),
      }),
    })

    const rawText = await res.text()
    let json: CreateCallResponse & { message?: string } = {} as CreateCallResponse
    try {
      json = JSON.parse(rawText)
    } catch {
      // leave json empty — handled by the !res.ok branch below
    }

    if (!res.ok) {
      logger.error({ status: res.status, response: json }, "Vapi outbound call request failed")
      throw new ExternalServiceError("Vapi", json.message ?? `HTTP ${res.status}`, json)
    }

    return { vapiCallId: json.id }
  },
}
