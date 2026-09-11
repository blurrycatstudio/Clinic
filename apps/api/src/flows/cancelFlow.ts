import { format } from "date-fns"
import { toZonedTime } from "date-fns-tz"
import {
  CLINIC_TIMEZONE,
  ConversationState,
  FlowType,
  Intent,
  t,
  type ClinicSettings,
  type ConversationContext,
  type Language,
} from "@clinic/shared"
import type { FlowHandler, FlowReply, FlowResult } from "./types.js"
import { appointmentService } from "../services/appointmentService.js"
import { appointmentRepository } from "../repositories/appointmentRepository.js"
import { tryAnswerOffScript } from "../lib/offScript.js"
import { startBookingFromFreeText } from "./bookAppointmentFlow.js"
import { enterRescheduleFlow } from "./rescheduleFlow.js"
import { openaiService } from "../services/openaiService.js"
import { backToMenuButton } from "./backToMenuButton.js"

/**
 * A patient mid-cancellation often just restates their whole request instead of
 * answering the current prompt ("actually reschedule it to next week", "book me
 * for the 20th at 2pm") — this detects that and returns a FlowResult that abandons
 * the in-progress cancellation and starts the newly-stated one, instead of making
 * them answer the stale appointment-selection prompt first. Returns null when the
 * text doesn't clearly express a different actionable request.
 */
async function tryRestateIntent(
  rawText: string,
  context: ConversationContext,
  lang: Language,
  settings: ClinicSettings,
): Promise<FlowResult | null> {
  const bookingResult = await startBookingFromFreeText(context, rawText)
  if (bookingResult) return bookingResult

  const { intent } = await openaiService.classifyAndAnswer(rawText, lang, settings)
  if (intent === Intent.RESCHEDULE_APPOINTMENT) return enterRescheduleFlow(context)
  return null
}

/** Each appointment is a tappable WhatsApp list row — the patient selects with one tap; a typed number still works too. */
function appointmentListReply(lang: Language, options: { label: string }[]): FlowReply {
  return {
    text: t(lang, "chooseAppointmentToCancel", { appointments: options.map((o, i) => `${i + 1}️⃣ ${o.label}`).join("\n") }),
    list: {
      buttonLabel: t(lang, "viewTimesButton"),
      rows: [...options.map((o, i) => ({ id: String(i + 1), title: o.label })), backToMenuButton(lang)],
    },
  }
}

function confirmCancellationReply(lang: Language, date: string, time: string): FlowReply {
  return {
    text: t(lang, "confirmCancellation", { date, time }),
    buttons: [
      { id: "yes", title: t(lang, "confirmYesButton") },
      { id: "no", title: t(lang, "confirmNoButton") },
      backToMenuButton(lang),
    ],
  }
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
    reply: appointmentListReply(lang, options),
  }
}

/** Called from the reminder-response flow, where the appointment is already known (from the reminder itself) — skips straight to the confirm step instead of re-asking "which appointment?". */
export async function enterCancelFlowForAppointment(context: ConversationContext, appointmentId: string): Promise<FlowResult> {
  const lang = context.language ?? "es"
  const appointment = await appointmentRepository.findById(appointmentId)

  if (!appointment || !["scheduled", "confirmed"].includes(appointment.status)) {
    return {
      context: { ...context, state: ConversationState.AWAITING_MENU_SELECTION, activeFlow: FlowType.NONE },
      reply: { text: t(lang, "reminderAppointmentGone") },
    }
  }

  const zoned = toZonedTime(new Date(appointment.starts_at), CLINIC_TIMEZONE)
  return {
    context: {
      ...context,
      state: ConversationState.AWAITING_CANCELLATION_CONFIRMATION,
      activeFlow: FlowType.CANCEL,
      cancellation: { targetAppointmentId: appointmentId },
    },
    reply: confirmCancellationReply(lang, format(zoned, "EEEE d MMMM"), format(zoned, "h:mm a")),
  }
}

export const cancelFlow: FlowHandler = async ({ text, buttonId, context, settings }) => {
  const lang = context.language ?? "es"
  const draft = context.cancellation ?? {}

  switch (context.state) {
    case ConversationState.AWAITING_CANCELLATION_TARGET_SELECTION: {
      const options = draft.cachedAppointments ?? []
      const index = Number.parseInt((buttonId ?? text).trim(), 10) - 1
      const chosen = options[index]
      if (!chosen) {
        const restated = await tryRestateIntent(text, context, lang, settings)
        if (restated) return restated

        const offScript = await tryAnswerOffScript(text, lang, settings)
        if (offScript) {
          const listReply = appointmentListReply(lang, options)
          return { context, reply: { ...listReply, text: `${offScript.text}\n\n${listReply.text}` } }
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
        reply: confirmCancellationReply(lang, format(zoned, "EEEE d MMMM"), format(zoned, "h:mm a")),
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
