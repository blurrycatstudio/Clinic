import { format } from "date-fns"
import { toZonedTime } from "date-fns-tz"
import { CLINIC_TIMEZONE, ConversationState, FlowType, t } from "@clinic/shared"
import type { FlowHandler } from "./types.js"
import { appointmentService } from "../services/appointmentService.js"
import { appointmentRepository } from "../repositories/appointmentRepository.js"
import { enterRescheduleFlowForAppointment } from "./rescheduleFlow.js"
import { enterCancelFlowForAppointment } from "./cancelFlow.js"

const CONFIRM_WORDS = ["confirm", "confirmar", "si", "sí", "yes", "1"]
const RESCHEDULE_WORDS = ["reschedule", "reprogramar", "cambiar", "2"]
const CANCEL_WORDS = ["cancel", "cancelar", "3"]

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
    const zoned = toZonedTime(new Date(appointment.starts_at), CLINIC_TIMEZONE)

    return {
      context: { ...context, state: ConversationState.AWAITING_MENU_SELECTION, activeFlow: FlowType.NONE, reminder: undefined },
      reply: { text: t(lang, "reminderConfirmed", { date: format(zoned, "EEEE d MMMM"), time: format(zoned, "h:mm a") }) },
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
