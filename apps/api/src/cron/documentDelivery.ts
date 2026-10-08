import { patientDocumentRepository } from "../repositories/patientDocumentRepository.js"
import { patientRepository } from "../repositories/patientRepository.js"
import { whatsappService } from "../services/whatsappService.js"
import { logger } from "../config/logger.js"

// Free-form WhatsApp documents only reach a patient whose 24h window is open, so a document
// uploaded while the patient is quiet has to be retried on later runs until they next message
// the clinic. 72h gives the daily run three attempts before giving up on a record.
const WINDOW_HOURS = 72

/**
 * Runs once a day (see vercel.json — Vercel Hobby only allows daily crons). Picks up every
 * patient document uploaded in the last 72 hours that hasn't gone out over
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
      // Most often the patient's 24h window is closed — expected, and retried on the next run.
      logger.warn({ err, documentId: document.id }, "Could not deliver patient document over WhatsApp yet")
    }
  }

  return { sent, failed }
}
