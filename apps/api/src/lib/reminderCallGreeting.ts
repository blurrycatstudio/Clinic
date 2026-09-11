import { format } from "date-fns"
import { toZonedTime } from "date-fns-tz"
import { CLINIC_TIMEZONE, type ClinicSettings, type Patient, type Appointment } from "@clinic/shared"

/**
 * Builds the Vapi `assistantOverrides` for an outbound call about a specific
 * appointment (reminder cron job or the dashboard's manual "Call" button).
 * Shared so both call sites always open with the same reminder-specific
 * greeting instead of the inbound assistant's default "thank you for
 * calling" — that line only makes sense when the patient called us, never
 * when we called them.
 */
export function buildReminderCallOverrides(
  patient: Patient,
  appointment: Appointment,
  settings: ClinicSettings,
): { firstMessage: string; variableValues: Record<string, string> } {
  const zoned = toZonedTime(new Date(appointment.starts_at), CLINIC_TIMEZONE)
  const date = format(zoned, "EEEE d MMMM")
  const time = format(zoned, "h:mm a")
  const lang = patient.language ?? "es"

  const firstMessage =
    lang === "en"
      ? `Hello ${patient.full_name}, this is ${settings.clinic_name} calling to remind you of your appointment on ${date} at ${time}. Can you confirm you'll be attending?`
      : `Hola ${patient.full_name}, le llamamos de ${settings.clinic_name} para recordarle su cita el ${date} a las ${time}. ¿Puede confirmar que asistirá?`

  return {
    firstMessage,
    variableValues: { appointmentId: appointment.id, callPurpose: "appointment_reminder_call" },
  }
}
