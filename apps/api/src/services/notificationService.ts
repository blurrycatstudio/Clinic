import { format } from "date-fns"
import { toZonedTime } from "date-fns-tz"
import { CLINIC_TIMEZONE } from "@clinic/shared"
import { appointmentRepository } from "../repositories/appointmentRepository.js"
import { patientRepository } from "../repositories/patientRepository.js"
import { conversationRepository } from "../repositories/conversationRepository.js"
import { clinicSettingsRepository } from "../repositories/clinicSettingsRepository.js"
import { templateService, type TemplateSendResult } from "./templateService.js"
import { redisStateService } from "./redisStateService.js"
import { ValidationError } from "../lib/errors.js"
import { classifyWhatsappError, explainFailureForStaff, type WhatsappFailureKind } from "../lib/whatsappErrors.js"
import { logger } from "../config/logger.js"

export type AppointmentChangeKind = "confirmed" | "rescheduled" | "cancelled"

/**
 * Sends the patient a WhatsApp notification for a booking/reschedule/cancel
 * that happened on any channel (dashboard, voice). Shared so a voice-call
 * booking notifies the same way a staff-made change does.
 */
export async function notifyPatientOfAppointmentChange(
  appointmentId: string,
  kind: AppointmentChangeKind,
): Promise<TemplateSendResult | null> {
  const appointment = await appointmentRepository.findById(appointmentId)
  if (!appointment) throw new ValidationError("Appointment not found")

  const patient = await patientRepository.findById(appointment.patient_id)
  if (!patient) return null

  const conversation = await conversationRepository.getOrCreate(patient.phone_e164)
  const zoned = toZonedTime(new Date(appointment.starts_at), CLINIC_TIMEZONE)
  const date = format(zoned, "EEEE d MMMM")
  const time = format(zoned, "h:mm a")

  if (kind === "confirmed") {
    const settings = await clinicSettingsRepository.get()
    const clinicShortName = settings.clinic_name.split(" ")[0] ?? settings.clinic_name
    const result = await templateService.send({
      key: "appointmentConfirmation",
      to: patient.phone_e164,
      conversationId: conversation.id,
      language: patient.language,
      params: [patient.full_name, settings.doctor_name, date, time, settings.clinic_name, clinicShortName],
      sessionFallbackText:
        patient.language === "es"
          ? `Tu cita fue agendada para el ${date} a las ${time}.`
          : `Your appointment was booked for ${date} at ${time}.`,
    })

    // The template carries Reschedule / Cancel buttons; route the patient's tap to this appointment.
    // Best effort — the booking and the message are already done, so a state hiccup must not fail them.
    if (result.sent && result.via === "template") {
      try {
        await redisStateService.parkOnReminderResponse(patient.phone_e164, conversation.id, appointment.id, patient.language)
      } catch (err) {
        logger.warn({ err, appointmentId: appointment.id }, "Could not park conversation on the reminder state after the confirmation template")
      }
    }
    return result
  } else if (kind === "rescheduled") {
    const settings = await clinicSettingsRepository.get()
    const clinicShortName = settings.clinic_name.split(" ")[0] ?? settings.clinic_name
    return templateService.send({
      key: "appointmentRescheduled",
      to: patient.phone_e164,
      conversationId: conversation.id,
      language: patient.language,
      // Matches the approved appointment_rescheduled_en body: name, doctor, new date, new time, clinic, short name.
      params: [patient.full_name, settings.doctor_name, date, time, settings.clinic_name, clinicShortName],
      sessionFallbackText:
        patient.language === "es"
          ? `Tu cita fue reprogramada para el ${date} a las ${time}.`
          : `Your appointment was moved to ${date} at ${time}.`,
    })
  } else {
    return templateService.send({
      key: "appointmentCancelled",
      to: patient.phone_e164,
      conversationId: conversation.id,
      language: patient.language,
      params: [patient.full_name, date, time],
      sessionFallbackText:
        patient.language === "es"
          ? `Tu cita del ${date} a las ${time} fue cancelada por la clínica.`
          : `Your appointment on ${date} at ${time} was cancelled by the clinic.`,
    })
  }
}

export type NotificationOutcome = {
  sent: boolean
  /** Why the patient wasn't messaged — plain language, ready to show staff. Only set when `sent` is false. */
  message?: string
  /** Machine-readable cause (session_expired = patient's 24h window is closed, not_on_whatsapp, ...). */
  failure?: WhatsappFailureKind
}

/**
 * Same as notifyPatientOfAppointmentChange, but never throws and reports what happened. The
 * appointment change itself has already been saved by the time this runs, so a WhatsApp problem
 * (patient outside the 24h window, number not on WhatsApp, ...) must not make the dashboard or
 * the voice agent report the whole action as failed — and must not be swallowed silently either.
 */
export async function notifyPatientSafely(
  appointmentId: string,
  kind: AppointmentChangeKind,
): Promise<NotificationOutcome> {
  try {
    const result = await notifyPatientOfAppointmentChange(appointmentId, kind)
    if (result === null) return { sent: false, message: "The patient record for this appointment was not found.", failure: "unknown" }
    if (result.sent) return { sent: true }
    const failure = result.failure ?? "unknown"
    return { sent: false, message: explainFailureForStaff(failure), failure }
  } catch (err) {
    logger.warn({ err, appointmentId, kind }, "Appointment notification could not be delivered (change was saved)")
    const failure = classifyWhatsappError(err)
    return { sent: false, message: explainFailureForStaff(failure), failure }
  }
}
