import { patientDocumentRepository } from "../repositories/patientDocumentRepository.js"
import { patientRepository } from "../repositories/patientRepository.js"
import { whatsappService } from "../services/whatsappService.js"
import { logger } from "../config/logger.js"

const WINDOW_HOURS = 12

/**
 * Runs every 12 hours (see vercel.json). Picks up every patient document
 * uploaded since the start of this window that hasn't gone out over
 * WhatsApp yet, sends it to the patient's registered phone number, and
 * marks it delivered so the next run — or a re-run of this same one —
 * never resends it.
 */
export async function runDocumentDeliveryJob(): Promise<{ sent: number; failed: number }> {
  const windowStart = new Date(Date.now() - WINDOW_HOURS * 60 * 60 * 1000).toISOString()
  const documents = await patientDocumentRepository.listPendingDelivery(windowStart)
  logger.info({ count: documents.length }, "Running patient document delivery job")

  let sent = 0
  let failed = 0

  for (const document of documents) {
    try {
      const patient = await patientRepository.findById(document.patient_id)
      if (!patient) {
        logger.warn({ documentId: document.id }, "Skipping document delivery — patient not found")
        continue
      }

      await whatsappService.sendDocumentMessage(patient.phone_e164, {
        link: document.url,
        filename: document.name,
        caption: `New medical record for ${patient.full_name}: ${document.name}`,
      })
      await patientDocumentRepository.markDelivered(document.id)
      sent++
    } catch (err) {
      failed++
      logger.error({ err, documentId: document.id }, "Failed to deliver patient document over WhatsApp")
    }
  }

  return { sent, failed }
}
