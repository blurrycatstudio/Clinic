import { format } from "date-fns"
import { toZonedTime } from "date-fns-tz"
import { CLINIC_TIMEZONE, ConversationState, FlowType, type Appointment } from "@clinic/shared"
import { appointmentRepository } from "../repositories/appointmentRepository.js"
import { patientRepository } from "../repositories/patientRepository.js"
import { conversationRepository } from "../repositories/conversationRepository.js"
import { clinicSettingsRepository } from "../repositories/clinicSettingsRepository.js"
import { voiceCallRepository } from "../repositories/voiceCallRepository.js"
import { templateService } from "../services/templateService.js"
import { redisStateService } from "../services/redisStateService.js"
import { vapiService } from "../services/vapiService.js"
import { sendFlowReplyOutOfBand } from "../services/conversationEngine.js"
import { env, isVapiOutboundConfigured } from "../config/env.js"
import { logger } from "../config/logger.js"
import { buildReminderCallOverrides } from "../lib/reminderCallGreeting.js"
import { locationReply } from "../lib/offScript.js"
import { NotFoundError } from "../lib/errors.js"

/**
 * Sends the WhatsApp reminder for a single appointment and marks it as sent.
 * Shared by the windowed cron job below and by the staff "send now" action
 * so both paths compose the exact same message.
 */
async function deliverReminder(appointment: Appointment, which: "24h" | "2h"): Promise<void> {
  const patient = await patientRepository.findById(appointment.patient_id)
  if (!patient) throw new NotFoundError("Patient not found")

  const conversation = await conversationRepository.getOrCreate(patient.phone_e164)
  const zoned = toZonedTime(new Date(appointment.starts_at), CLINIC_TIMEZONE)
  const date = format(zoned, "EEEE d MMMM")
  const time = format(zoned, "h:mm a")
  const settings = await clinicSettingsRepository.get()

  if (which === "24h") {
    await templateService.send({
      key: "appointmentReminder24h",
      to: patient.phone_e164,
      conversationId: conversation.id,
      language: patient.language,
      params: [patient.full_name, date, time],
      sessionFallbackText:
        patient.language === "es"
          ? `Recordatorio: tienes una cita mañana ${date} a las ${time}.`
          : `Reminder: you have an appointment tomorrow, ${date} at ${time}.`,
      appointmentId: appointment.id,
    })
  } else {
    const clinicShortName = settings.clinic_name.split(" ")[0] ?? settings.clinic_name
    await templateService.send({
      key: "appointmentReminder2h",
      to: patient.phone_e164,
      conversationId: conversation.id,
      language: patient.language,
      params: [patient.full_name, settings.doctor_name, date, time, settings.clinic_name, clinicShortName],
      sessionFallbackText:
        patient.language === "es"
          ? `Recordatorio: tu cita con ${settings.doctor_name} es hoy a las ${time} en ${settings.clinic_name}.`
          : `Reminder: your appointment with ${settings.doctor_name} is today at ${time} at ${settings.clinic_name}.`,
      appointmentId: appointment.id,
    })

    // The 2h reminder is the one whose template carries Confirm/Reschedule/Cancel
    // quick-reply buttons — park the conversation on a dedicated state so the next
    // inbound message (the button tap) is routed straight to this appointment
    // instead of falling into whatever flow state happened to be left over.
    const { context: loaded } = await redisStateService.get(patient.phone_e164, conversation.id)
    await redisStateService.save(patient.phone_e164, {
      ...loaded,
      language: loaded.language ?? patient.language,
      state: ConversationState.AWAITING_REMINDER_RESPONSE,
      activeFlow: FlowType.NONE,
      reminder: { appointmentId: appointment.id },
    })
  }

  // Attach "Get Directions" (a real tappable maps-link button, plus a native location
  // pin when clinic_settings has coordinates) right after the reminder text so the
  // patient doesn't have to ask where the clinic is.
  if (settings.address) {
    await sendFlowReplyOutOfBand(patient.phone_e164, conversation.id, locationReply(patient.language, settings))
  }

  await appointmentRepository.markReminderSent(appointment.id, which)
}

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
      await deliverReminder(appointment, which)
      sent++
    } catch (err) {
      failed++
      logger.error({ err, appointmentId: appointment.id, which }, "Failed to send appointment reminder")
    }
  }

  return { sent, failed }
}

/**
 * Staff-triggered manual send from the dashboard — bypasses the time-window
 * check entirely so a reminder can go out whenever staff wants, not just
 * within the 24h/2h cron window.
 */
export async function sendReminderNow(appointmentId: string, which: "24h" | "2h"): Promise<void> {
  const appointment = await appointmentRepository.findById(appointmentId)
  if (!appointment) throw new NotFoundError("Appointment not found")
  await deliverReminder(appointment, which)
}

/**
 * Auto-calls patients to confirm an upcoming appointment, `reminder_call_hours_before`
 * (a staff-configurable clinic setting) ahead of the appointment time. Same windowed
 * + already-sent-tracking pattern as the WhatsApp reminder job above, and a no-op
 * whenever the setting is off or outbound calling isn't configured.
 */
export async function runReminderCallJob(): Promise<{ sent: number; failed: number; skipped: boolean }> {
  const settings = await clinicSettingsRepository.get()
  if (!settings.reminder_call_enabled || !isVapiOutboundConfigured) {
    return { sent: 0, failed: 0, skipped: true }
  }

  const hoursAhead = settings.reminder_call_hours_before
  const now = new Date()
  const windowStart = new Date(now.getTime() + (hoursAhead - 0.25) * 60 * 60 * 1000)
  const windowEnd = new Date(now.getTime() + (hoursAhead + 0.25) * 60 * 60 * 1000)

  const appointments = await appointmentRepository.listNeedingCallReminder(windowStart.toISOString(), windowEnd.toISOString())
  logger.info({ count: appointments.length }, "Running appointment reminder-call job")

  let sent = 0
  let failed = 0

  for (const appointment of appointments) {
    try {
      const patient = await patientRepository.findById(appointment.patient_id)
      if (!patient) continue

      const { vapiCallId } = await vapiService.createOutboundCall({
        phoneE164: patient.phone_e164,
        assistantId: env.VAPI_REMINDER_ASSISTANT_ID || undefined,
        metadata: { appointmentId: appointment.id, purpose: "appointment_reminder_call" },
        assistantOverrides: buildReminderCallOverrides(patient, appointment, settings),
      })
      await voiceCallRepository.create({
        vapiCallId,
        phoneE164: patient.phone_e164,
        direction: "outbound",
        patientId: patient.id,
        appointmentId: appointment.id,
      })

      await appointmentRepository.markCallReminderSent(appointment.id)
      sent++
    } catch (err) {
      failed++
      logger.error({ err, appointmentId: appointment.id }, "Failed to place appointment reminder call")
    }
  }

  return { sent, failed, skipped: false }
}
