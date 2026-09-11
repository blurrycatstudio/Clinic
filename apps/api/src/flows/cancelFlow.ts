import { format } from "date-fns"
import { toZonedTime } from "date-fns-tz"
import { CLINIC_TIMEZONE, ConversationState, FlowType, t, type ConversationContext } from "@clinic/shared"
import type { FlowHandler, FlowResult } from "./types.js"
import { appointmentService } from "../services/appointmentService.js"
import { appointmentRepository } from "../repositories/appointmentRepository.js"
import { tryAnswerOffScript } from "../lib/offScript.js"

function renderAppointmentList(options: { label: string }[]): string {
  return options.map((o, i) => `${i + 1}️⃣ ${o.label}`).join("\n")
}

/** Called by mainMenuFlow when the patient picks option 3 — needs a DB lookup. */
export async function enterCancelFlow(context: ConversationContext): Promise<FlowResult> {
  const lang = context.language ?? "es"
  const appointments = await appointmentService.findActiveAppointmentsForPhone(context.phoneE164)

  if (appointments.length === 0) {
    return {
      context: { ...context, state: ConversationState.AWAITING_MENU_SELECTION, activeFlow: FlowType.NONE },
      reply: { text: t(lang, "noAppointmentsFound") },
    }
  }

  const options = appointments.map((a) => ({
    appointmentId: a.id,
    label: format(toZonedTime(new Date(a.starts_at), CLINIC_TIMEZONE), "EEE d MMM, h:mm a"),
  }))

  return {
    context: {
      ...context,
      state: ConversationState.AWAITING_CANCELLATION_TARGET_SELECTION,
      activeFlow: FlowType.CANCEL,
      cancellation: { cachedAppointments: options },
    },
    reply: { text: t(lang, "chooseAppointmentToCancel", { appointments: renderAppointmentList(options) }) },
  }
}

export const cancelFlow: FlowHandler = async ({ text, context, settings }) => {
  const lang = context.language ?? "es"
  const draft = context.cancellation ?? {}

  switch (context.state) {
    case ConversationState.AWAITING_CANCELLATION_TARGET_SELECTION: {
      const options = draft.cachedAppointments ?? []
      const index = Number.parseInt(text.trim(), 10) - 1
      const chosen = options[index]
      if (!chosen) {
        const offScript = await tryAnswerOffScript(text, lang, settings)
        if (offScript) {
          return { context, reply: { text: `${offScript.text}\n\n${t(lang, "chooseAppointmentToCancel", { appointments: renderAppointmentList(options) })}` } }
        }
        return { context, reply: { text: t(lang, "appointmentSelectionInvalid") } }
      }

      const appointment = await appointmentRepository.findById(chosen.appointmentId)
      if (!appointment) {
        return {
          context: { ...context, state: ConversationState.AWAITING_MENU_SELECTION, activeFlow: FlowType.NONE, cancellation: undefined },
          reply: { text: t(lang, "genericFallback") },
        }
      }

      const zoned = toZonedTime(new Date(appointment.starts_at), CLINIC_TIMEZONE)
      return {
        context: {
          ...context,
          state: ConversationState.AWAITING_CANCELLATION_CONFIRMATION,
          cancellation: { targetAppointmentId: chosen.appointmentId },
        },
        reply: {
          text: t(lang, "confirmCancellation", { date: format(zoned, "EEEE d MMMM"), time: format(zoned, "h:mm a") }),
          buttons: [
            { id: "yes", title: t(lang, "confirmYesButton") },
            { id: "no", title: t(lang, "confirmNoButton") },
          ],
        },
      }
    }

    case ConversationState.AWAITING_CANCELLATION_CONFIRMATION: {
      const normalized = text.trim().toLowerCase()
      const isYes = ["si", "sí", "yes", "1"].includes(normalized)
      const isNo = ["no", "2"].includes(normalized)

      if (!isYes && !isNo) {
        const offScript = await tryAnswerOffScript(text, lang, settings)
        if (offScript) return { context, reply: { text: `${offScript.text}\n\n${t(lang, "confirmInvalid")}` } }
        return { context, reply: { text: t(lang, "confirmInvalid") } }
      }
      if (isNo || !draft.targetAppointmentId) {
        return {
          context: { ...context, state: ConversationState.AWAITING_MENU_SELECTION, activeFlow: FlowType.NONE, cancellation: undefined },
          reply: { text: t(lang, "cancellationAborted") },
        }
      }

      await appointmentService.cancelAppointment(draft.targetAppointmentId, "Cancelled by patient via WhatsApp")

      return {
        context: { ...context, state: ConversationState.AWAITING_MENU_SELECTION, activeFlow: FlowType.NONE, cancellation: undefined },
        reply: { text: t(lang, "cancellationConfirmed") },
      }
    }

    default:
      return { context, reply: { text: t(lang, "genericFallback") } }
  }
}
