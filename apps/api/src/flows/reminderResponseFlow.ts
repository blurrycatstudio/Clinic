import { ConversationState, FlowType, t } from "@clinic/shared"
import type { FlowHandler } from "./types.js"
import { formatClinicDate, formatClinicTime } from "../lib/dateFormat.js"
import { appointmentService } from "../services/appointmentService.js"
import { appointmentRepository } from "../repositories/appointmentRepository.js"
import { enterRescheduleFlowForAppointment } from "./rescheduleFlow.js"
import { enterCancelFlowForAppointment } from "./cancelFlow.js"

const CONFIRM_WORDS = ["confirm", "confirmar", "si", "sí", "yes", "1"]
// Includes the labels of the approved templates' quick-reply buttons ("Reschedule", "Cancel Appointment"),
// which arrive as plain text — without them a tap on the template's Cancel button was rejected as invalid.
const RESCHEDULE_WORDS = ["reschedule", "reschedule appointment", "reprogramar", "reprogramar cita", "cambiar", "2"]
const CANCEL_WORDS = ["cancel", "cancel appointment", "cancelar", "cancelar cita", "3"]

/**
 * Handles a reply to the appointment reminder's Confirm/Reschedule/Cancel
 * quick-reply buttons. The reminder isn't part of a menu-driven flow, so
 * `context.reminder.appointmentId` (set by cron/reminders.ts when the
 * reminder was sent) is the only way to know which appointment this reply
 * is about — without it we'd have no way to tell "Confirm" apart from any
 * other stray message.
 */
export const reminderResponseFlow: FlowHandler = async ({ text, buttonId, context }) => {
  const lang = context.language ?? "es"
  const appointmentId = context.reminder?.appointmentId
  const raw = (buttonId ?? text).trim().toLowerCase()

  if (!appointmentId) {
    return {
      context: { ...context, state: ConversationState.AWAITING_MENU_SELECTION, activeFlow: FlowType.NONE, reminder: undefined },
      reply: { text: t(lang, "genericFallback") },
    }
  }

  if (CONFIRM_WORDS.includes(raw)) {
    const appointment = await appointmentRepository.findById(appointmentId)
    if (!appointment || !["scheduled", "confirmed"].includes(appointment.status)) {
      return {
        context: { ...context, state: ConversationState.AWAITING_MENU_SELECTION, activeFlow: FlowType.NONE, reminder: undefined },
        reply: { text: t(lang, "reminderAppointmentGone") },
      }
    }

    await appointmentService.confirmAppointment(appointmentId)

    return {
      context: { ...context, state: ConversationState.AWAITING_MENU_SELECTION, activeFlow: FlowType.NONE, reminder: undefined },
      reply: { text: t(lang, "reminderConfirmed", { date: formatClinicDate(appointment.starts_at, lang), time: formatClinicTime(appointment.starts_at) }) },
    }
  }

  if (RESCHEDULE_WORDS.includes(raw)) {
    const result = await enterRescheduleFlowForAppointment(context, appointmentId)
    return { ...result, context: { ...result.context, reminder: undefined } }
  }

  if (CANCEL_WORDS.includes(raw)) {
    const result = await enterCancelFlowForAppointment(context, appointmentId)
    return { ...result, context: { ...result.context, reminder: undefined } }
  }

  return { context, reply: { text: t(lang, "reminderInvalid") } }
}
