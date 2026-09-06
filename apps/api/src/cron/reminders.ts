import { format } from "date-fns"
import { toZonedTime } from "date-fns-tz"
import { CLINIC_TIMEZONE } from "@clinic/shared"
import { appointmentRepository } from "../repositories/appointmentRepository.js"
import { patientRepository } from "../repositories/patientRepository.js"
import { conversationRepository } from "../repositories/conversationRepository.js"
import { clinicSettingsRepository } from "../repositories/clinicSettingsRepository.js"
import { templateService } from "../services/templateService.js"
import { logger } from "../config/logger.js"

/**
 * Triggered by Vercel Cron (see apps/api/vercel.json) every 10-15 minutes.
 * Windowed rather than exact-time so a cron tick that's a few minutes late
 * never skips a reminder — `listNeedingReminder` also excludes appointments
 * that already got this reminder, so re-running the same window is safe.
 */
export async function runReminderJob(which: "24h" | "2h"): Promise<{ sent: number; failed: number }> {
  const hoursAhead = which === "24h" ? 24 : 2
  const now = new Date()
  const windowStart = new Date(now.getTime() + (hoursAhead - 0.25) * 60 * 60 * 1000)
  const windowEnd = new Date(now.getTime() + (hoursAhead + 0.25) * 60 * 60 * 1000)

  const appointments = await appointmentRepository.listNeedingReminder(which, windowStart.toISOString(), windowEnd.toISOString())
  logger.info({ which, count: appointments.length }, "Running appointment reminder job")

  let sent = 0
  let failed = 0

  for (const appointment of appointments) {
    try {
      const patient = await patientRepository.findById(appointment.patient_id)
      if (!patient) continue

      const conversation = await conversationRepository.getOrCreate(patient.phone_e164)
      const zoned = toZonedTime(new Date(appointment.starts_at), CLINIC_TIMEZONE)
      const date = format(zoned, "EEEE d MMMM")
      const time = format(zoned, "h:mm a")

      if (which === "24h") {
        await templateService.send({
          key: "appointmentReminder24h",
          to: patient.phone_e164,
          conversationId: conversation.id,
          language: patient.language,
          params: [patient.full_name, date, time],
        })
      } else {
        const settings = await clinicSettingsRepository.get()
        await templateService.send({
          key: "appointmentReminder2h",
          to: patient.phone_e164,
          conversationId: conversation.id,
          language: patient.language,
          params: [patient.full_name, settings.doctor_name, date, time, settings.clinic_name, settings.clinic_name],
        })
      }

      await appointmentRepository.markReminderSent(appointment.id, which)
      sent++
    } catch (err) {
      failed++
      logger.error({ err, appointmentId: appointment.id, which }, "Failed to send appointment reminder")
    }
  }

  return { sent, failed }
}
