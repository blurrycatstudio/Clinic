import type { NextFunction, Request, Response } from "express"
import crypto from "node:crypto"
import { env } from "../config/env.js"
import { logger } from "../config/logger.js"
import { voiceCallRepository, callTranscriptRepository } from "../repositories/voiceCallRepository.js"
import { patientRepository } from "../repositories/patientRepository.js"
import { auditLogRepository } from "../repositories/auditLogRepository.js"

/**
 * Vapi orchestrates the actual phone call (speech-to-text, the LLM turn,
 * ElevenLabs text-to-speech) — this endpoint only receives lifecycle and
 * transcript webhooks so we can log the call for the dashboard's Voice
 * Calls / Call Transcripts pages. Vapi's assistant is configured (in the
 * Vapi dashboard, via VAPI_ASSISTANT_ID) to call this same deterministic
 * appointment logic through function-calling against our REST API rather
 * than inventing appointment outcomes itself — same rule as the WhatsApp
 * channel: the LLM classifies/talks, it never decides booking state.
 */
type VapiWebhookPayload = {
  message: {
    type: "status-update" | "transcript" | "end-of-call-report" | string
    call?: { id: string; customer?: { number?: string } }
    status?: string
    role?: "assistant" | "user"
    transcript?: string
    transcriptType?: "partial" | "final"
    endedReason?: string
    durationSeconds?: number
    recordingUrl?: string
    summary?: string
  }
}

export function verifyVapiSignature(req: Request, res: Response, next: NextFunction) {
  if (!env.VAPI_WEBHOOK_SECRET) {
    next()
    return
  }
  const signature = req.header("x-vapi-signature")
  const rawBody = (req as Request & { rawBody?: Buffer }).rawBody
  if (!signature || !rawBody) {
    res.sendStatus(401)
    return
  }
  const expected = crypto.createHmac("sha256", env.VAPI_WEBHOOK_SECRET).update(rawBody).digest("hex")
  const valid = signature.length === expected.length && crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
  if (!valid) {
    res.sendStatus(401)
    return
  }
  next()
}

/** Vapi reasons that mean the conversation really happened (including a caller going quiet or being transferred to staff). */
const COMPLETED_REASONS = new Set([
  "customer-ended-call",
  "assistant-ended-call",
  "assistant-said-end-call-phrase",
  "silence-timed-out",
  "exceeded-max-duration",
])
const NO_ANSWER_REASONS = new Set([
  "customer-did-not-answer",
  "customer-busy",
  "voicemail",
  "twilio-failed-to-connect-call",
])

function statusFromEndedReason(reason?: string): "completed" | "failed" | "no_answer" {
  if (!reason) return "failed"
  if (COMPLETED_REASONS.has(reason) || reason.includes("forwarded") || reason.includes("transfer")) return "completed"
  if (NO_ANSWER_REASONS.has(reason)) return "no_answer"
  return "failed"
}

async function ensureCallRow(vapiCallId: string, phone?: string) {
  const existing = await voiceCallRepository.findByVapiCallId(vapiCallId)
  if (existing) return existing
  const normalized = phone ?? "unknown"
  const patient = phone ? await patientRepository.findByPhone(phone) : null
  try {
    return await voiceCallRepository.create({
      vapiCallId,
      phoneE164: normalized,
      direction: "inbound",
      patientId: patient?.id ?? null,
    })
  } catch (err) {
    // Two events racing to create the same call: the loser just reads the winner's row.
    const raced = await voiceCallRepository.findByVapiCallId(vapiCallId)
    if (raced) return raced
    throw err
  }
}

export async function receiveVapiWebhook(req: Request, res: Response) {
  res.sendStatus(200)
  const { message } = req.body as VapiWebhookPayload
  if (!message?.call?.id) return

  try {
    switch (message.type) {
      case "status-update": {
        if (message.status === "in-progress") {
          await ensureCallRow(message.call.id, message.call.customer?.number)
        }
        break
      }

      case "transcript": {
        if (message.transcriptType !== "final" || !message.transcript || !message.role) break
        const call = await ensureCallRow(message.call.id, message.call.customer?.number)
        await callTranscriptRepository.append(call.id, message.role, message.transcript)
        break
      }

      case "end-of-call-report": {
        // The "in-progress" status event can arrive late or be dropped; without a row,
        // complete() updates nothing and the whole call vanishes from the dashboard.
        await ensureCallRow(message.call.id, message.call.customer?.number)
        await voiceCallRepository.complete(message.call.id, {
          status: statusFromEndedReason(message.endedReason),
          durationSeconds: message.durationSeconds,
          recordingUrl: message.recordingUrl,
          summary: message.summary,
        })
        await auditLogRepository.record({
          actorType: "system",
          action: "voice_call.completed",
          entityType: "voice_call",
          entityId: message.call.id,
          metadata: { endedReason: message.endedReason },
        })
        break
      }
    }
  } catch (err) {
    logger.error({ err, callId: message.call.id }, "Failed to process Vapi webhook event")
  }
}
