import crypto from "node:crypto"
import type { NextFunction, Request, Response } from "express"
import { env } from "../config/env.js"
import { logger } from "../config/logger.js"

/**
 * Verifies the `X-Hub-Signature-256` header Meta sends on every webhook
 * POST, proving the payload actually came from Meta and wasn't forged.
 * Requires the raw request body bytes — see app.ts, which captures them
 * via express.json({ verify }) into `req.rawBody` before this runs.
 *
 * If WHATSAPP_APP_SECRET isn't set yet (pre-launch/local dev), this
 * middleware logs a warning and allows the request through so the rest of
 * the webhook pipeline can be built and tested before Meta review lands.
 */
export function verifyWhatsappSignature(req: Request, res: Response, next: NextFunction) {
  if (!env.WHATSAPP_APP_SECRET) {
    logger.warn("WHATSAPP_APP_SECRET not set — skipping webhook signature verification (dev mode only)")
    next()
    return
  }

  const signatureHeader = req.header("x-hub-signature-256")
  const rawBody = (req as Request & { rawBody?: Buffer }).rawBody

  if (!signatureHeader || !rawBody) {
    res.status(401).json({ error: { code: "UNAUTHORIZED", message: "Missing webhook signature" } })
    return
  }

  const expected =
    "sha256=" + crypto.createHmac("sha256", env.WHATSAPP_APP_SECRET).update(rawBody).digest("hex")

  const a = Buffer.from(signatureHeader)
  const b = Buffer.from(expected)
  const valid = a.length === b.length && crypto.timingSafeEqual(a, b)

  if (!valid) {
    logger.warn("Rejected webhook request with invalid signature")
    res.status(401).json({ error: { code: "UNAUTHORIZED", message: "Invalid webhook signature" } })
    return
  }

  next()
}
