import { format } from "date-fns"
import { toZonedTime } from "date-fns-tz"
import { CLINIC_TIMEZONE } from "@clinic/shared"
import { appointmentRepository } from "../repositories/appointmentRepository.js"
import { patientRepository } from "../repositories/patientRepository.js"
import { conversationRepository } from "../repositories/conversationRepository.js"
import { clinicSettingsRepository } from "../repositories/clinicSettingsRepository.js"
import { templateService } from "./templateService.js"
import { ValidationError } from "../lib/errors.js"

export type AppointmentChangeKind = "confirmed" | "rescheduled" | "cancelled"

/**
 * Sends the patient a WhatsApp notification for a booking/reschedule/cancel
 * that happened on any channel (dashboard, voice). Shared so a voice-call
 * booking notifies the same way a staff-made change does.
 */
export async function notifyPatientOfAppointmentChange(
  appointmentId: string,
  kind: AppointmentChangeKind,
): Promise<void> {
  const appointment = await appointmentRepository.findById(appointmentId)
  if (!appointment) throw new ValidationError("Appointment not found")

  const patient = await patientRepository.findById(appointment.patient_id)
  if (!patient) return

  const conversation = await conversationRepository.getOrCreate(patient.phone_e164)
  const zoned = toZonedTime(new Date(appointment.starts_at), CLINIC_TIMEZONE)
  const date = format(zoned, "EEEE d MMMM")
  const time = format(zoned, "h:mm a")

  if (kind === "confirmed") {
    await templateService.send({
      key: "appointmentConfirmation",
      to: patient.phone_e164,
      conversationId: conversation.id,
      language: patient.language,
      params: [patient.full_name, date, time, (await clinicSettingsRepository.get()).doctor_name],
      sessionFallbackText:
        patient.language === "es"
          ? `Tu cita fue agendada para el ${date} a las ${time}.`
          : `Your appointment was booked for ${date} at ${time}.`,
    })
  } else if (kind === "rescheduled") {
    await templateService.send({
      key: "appointmentRescheduled",
      to: patient.phone_e164,
      conversationId: conversation.id,
      language: patient.language,
      params: [patient.full_name, date, time],
      sessionFallbackText:
        patient.language === "es"
          ? `Tu cita fue reprogramada para el ${date} a las ${time}.`
          : `Your appointment was moved to ${date} at ${time}.`,
    })
  } else {
    await templateService.send({
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
