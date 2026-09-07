import type { Request, Response } from "express"
import { env } from "../config/env.js"
import { logger } from "../config/logger.js"
import { handleInboundMessage } from "../services/conversationEngine.js"
import { messageRepository } from "../repositories/messageRepository.js"

/** Meta's webhook subscription handshake — GET with hub.mode/verify_token/challenge. */
export function verifyWebhook(req: Request, res: Response) {
  const mode = req.query["hub.mode"]
  const token = req.query["hub.verify_token"]
  const challenge = req.query["hub.challenge"]

  if (mode === "subscribe" && token === env.WHATSAPP_VERIFY_TOKEN) {
    logger.info("WhatsApp webhook verified successfully")
    res.status(200).send(challenge)
    return
  }

  logger.warn({ mode }, "WhatsApp webhook verification failed")
  res.sendStatus(403)
}

type WhatsappWebhookPayload = {
  entry?: {
    changes?: {
      value?: {
        messages?: {
          id: string
          from: string
          type: string
          text?: { body: string }
          interactive?: {
            button_reply?: { id: string; title: string }
            list_reply?: { id: string; title: string }
          }
          button?: { text: string; payload: string }
        }[]
        contacts?: { profile?: { name?: string }; wa_id: string }[]
        statuses?: { id: string; status: "sent" | "delivered" | "read" | "failed" }[]
      }
    }[]
  }[]
}

/**
 * Receives both inbound patient messages and outbound delivery-status
 * updates (sent/delivered/read/failed) in the same payload shape.
 *
 * We await processing fully before responding. We used to ack with 200
 * immediately and process in the background, but on Vercel's serverless
 * runtime the function invocation is frozen/torn down as soon as the HTTP
 * response is sent — nothing after res.sendStatus(200) actually ran, so
 * inbound messages were silently dropped. Meta's retry timeout is generous
 * (~20s) so awaiting the (typically sub-second) processing here is safe.
 */
export async function receiveWebhook(req: Request, res: Response) {
  const payload = req.body as WhatsappWebhookPayload

  try {
    for (const entry of payload.entry ?? []) {
      for (const change of entry.changes ?? []) {
        const value = change.value
        if (!value) continue

        for (const status of value.statuses ?? []) {
          await messageRepository.updateStatusByWaId(status.id, status.status).catch((err) => {
            logger.warn({ err, waMessageId: status.id }, "Failed to update message delivery status")
          })
        }

        const contactName = value.contacts?.[0]?.profile?.name

        for (const message of value.messages ?? []) {
          const text =
            message.text?.body ??
            message.interactive?.button_reply?.title ??
            message.interactive?.list_reply?.title ??
            message.button?.text ??
            ""
          const buttonId = message.interactive?.button_reply?.id ?? message.interactive?.list_reply?.id ?? null

          await handleInboundMessage({
            phoneE164: normalizePhone(message.from),
            profileName: contactName,
            text,
            buttonId,
            waMessageId: message.id,
          })
        }
      }
    }
  } catch (err) {
    logger.error({ err }, "Error processing WhatsApp webhook payload")
  }

  res.sendStatus(200)
}

function normalizePhone(waFrom: string): string {
  return waFrom.startsWith("+") ? waFrom : `+${waFrom}`
}
