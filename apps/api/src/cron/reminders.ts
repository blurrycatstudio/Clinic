import { format } from "date-fns"
import { toZonedTime } from "date-fns-tz"
import { CLINIC_TIMEZONE, ConversationState, FlowType, isTemplateReady, t, type Appointment } from "@clinic/shared"
import { appointmentRepository } from "../repositories/appointmentRepository.js"
import { patientRepository } from "../repositories/patientRepository.js"
import { conversationRepository } from "../repositories/conversationRepository.js"
import { clinicSettingsRepository } from "../repositories/clinicSettingsRepository.js"
import { voiceCallRepository } from "../repositories/voiceCallRepository.js"
import { templateService, type TemplateSendResult } from "../services/templateService.js"
import { redisStateService } from "../services/redisStateService.js"
import { vapiService } from "../services/vapiService.js"
import { sendFlowReplyOutOfBand } from "../services/conversationEngine.js"
import { env, isVapiOutboundConfigured } from "../config/env.js"
import { logger } from "../config/logger.js"
import { buildReminderCallOverrides } from "../lib/reminderCallGreeting.js"
import { locationReply } from "../lib/offScript.js"
import { AppError, NotFoundError } from "../lib/errors.js"
import { classifyWhatsappError, explainFailureForStaff, whatsappFailureToAppError } from "../lib/whatsappErrors.js"

/**
 * Sends the WhatsApp reminder for a single appointment and marks it as sent — but ONLY if
 * WhatsApp actually took it. Shared by the windowed cron job below and by the staff "send now"
 * action so both paths compose the exact same message.
 *
 * Throws (so the cron counts it as failed and retries on its next run, and the dashboard shows
 * a real reason instead of "Reminder message sent") when the reminder could not be delivered.
 */
async function deliverReminder(appointment: Appointment, which: "24h" | "2h"): Promise<void> {
  const patient = await patientRepository.findById(appointment.patient_id)
  if (!patient) throw new NotFoundError("Patient not found")

  const conversation = await conversationRepository.getOrCreate(patient.phone_e164)
  const zoned = toZonedTime(new Date(appointment.starts_at), CLINIC_TIMEZONE)
  const date = format(zoned, "EEEE d MMMM")
  const time = format(zoned, "h:mm a")
  const settings = await clinicSettingsRepository.get()
  const lang = patient.language
  const clinicShortName = settings.clinic_name.split(" ")[0] ?? settings.clinic_name

  // Both reminders carry live Confirm/Reschedule/Cancel buttons — via the approved
  // Meta template once one exists, or (today, since templates are still pending
  // approval — see packages/shared/templates/registry.ts) via these same three
  // buttons attached to the plain session fallback, so the patient always gets a
  // tappable way to act on the reminder instead of a dead block of text.
  const reminderButtons = [
    { id: "confirm", title: t(lang, "reminderConfirmButton") },
    { id: "reschedule", title: t(lang, "reminderRescheduleButton") },
    { id: "cancel", title: t(lang, "reminderCancelButton") },
  ]

  let result: TemplateSendResult
  if (which === "24h") {
    try {
      result = await templateService.send({
        key: "appointmentReminder24h",
        to: patient.phone_e164,
        conversationId: conversation.id,
        language: lang,
        params: [patient.full_name, date, time],
        sessionFallbackText: t(lang, "reminder24hText", { date, time, doctorName: settings.doctor_name }),
        sessionFallbackButtons: reminderButtons,
        appointmentId: appointment.id,
      })
    } catch (err) {
      // No approved day-ahead template yet, so this went out as a plain message — which WhatsApp refuses
      // once the patient's 24h window has closed. The approved booking-confirmation template carries the
      // same details (doctor, date, time, clinic) and a Reschedule / Cancel button pair, so it stands in
      // as the reminder.
      if (classifyWhatsappError(err) !== "session_expired" || !isTemplateReady("appointmentConfirmation")) {
        throw whatsappFailureToAppError(err)
      }
      result = await templateService.send({
        key: "appointmentConfirmation",
        to: patient.phone_e164,
        conversationId: conversation.id,
        language: lang,
        params: [patient.full_name, settings.doctor_name, date, time, settings.clinic_name, clinicShortName],
        appointmentId: appointment.id,
      })
    }
  } else {
    try {
      result = await templateService.send({
        key: "appointmentReminder2h",
        to: patient.phone_e164,
        conversationId: conversation.id,
        language: lang,
        params: [patient.full_name, settings.doctor_name, date, time, settings.clinic_name, clinicShortName],
        sessionFallbackText: t(lang, "reminder2hText", { date, time, doctorName: settings.doctor_name, clinicName: settings.clinic_name }),
        sessionFallbackButtons: reminderButtons,
        appointmentId: appointment.id,
      })
    } catch (err) {
      throw whatsappFailureToAppError(err)
    }
  }

  if (!result.sent) {
    const patientSide = result.failure === "session_expired" || result.failure === "not_on_whatsapp"
    throw new AppError(explainFailureForStaff(result.failure ?? "unknown"), patientSide ? 422 : 502, "WHATSAPP_NOT_DELIVERABLE")
  }

  // The patient has the reminder: record it NOW, before anything optional below, so a hiccup in
  // the extras can never cause the same reminder to be sent again on the next run.
  await appointmentRepository.markReminderSent(appointment.id, which)

  // Park the conversation on a dedicated state so the next inbound message (the
  // button tap, or its typed equivalent) is routed straight to this appointment
  // instead of falling into whatever flow state happened to be left over —
  // needed for both reminders now that both carry actionable buttons.
  try {
    const { context: loaded } = await redisStateService.get(patient.phone_e164, conversation.id)
    await redisStateService.save(patient.phone_e164, {
      ...loaded,
      language: loaded.language ?? lang,
      state: ConversationState.AWAITING_REMINDER_RESPONSE,
      activeFlow: FlowType.NONE,
      reminder: { appointmentId: appointment.id },
    })
  } catch (err) {
    logger.warn({ err, appointmentId: appointment.id }, "Could not park conversation on the reminder state")
  }

  // Attach "Get Directions" (a real tappable maps-link button, plus a native location
  // pin when clinic_settings has coordinates) right after the reminder text so the
  // patient doesn't have to ask where the clinic is. Free-form, so it only lands when the
  // patient's 24h window is open — best effort, never a reason to fail (or repeat) the reminder.
  if (settings.address) {
    try {
      await sendFlowReplyOutOfBand(patient.phone_e164, conversation.id, locationReply(patient.language, settings))
    } catch (err) {
      logger.info({ err, appointmentId: appointment.id }, "Reminder sent, but the directions follow-up could not be (patient's window is closed)")
    }
  }
}

/**
 * Meant to be triggered every 10-15 minutes (the +/-15 min window below assumes it). Vercel Hobby
 * only runs crons once a day, so on that plan drive this from an external scheduler (e.g. n8n's
 * Schedule trigger calling GET /api/cron/reminders?window=2h|24h) or upgrade the Vercel plan.
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
