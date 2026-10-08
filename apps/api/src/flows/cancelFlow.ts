import {
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
import { isAffirmative, isNegative, parseListChoice, startsWithDecline } from "../lib/replyParsing.js"
import { formatClinicDate, formatClinicSlotLabel, formatClinicTime } from "../lib/dateFormat.js"
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
    label: formatClinicSlotLabel(a.starts_at, lang),
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

  return {
    context: {
      ...context,
      state: ConversationState.AWAITING_CANCELLATION_CONFIRMATION,
      activeFlow: FlowType.CANCEL,
      cancellation: { targetAppointmentId: appointmentId },
    },
    reply: confirmCancellationReply(lang, formatClinicDate(appointment.starts_at, lang), formatClinicTime(appointment.starts_at)),
  }
}

export const cancelFlow: FlowHandler = async ({ text, buttonId, context, settings }) => {
  const lang = context.language ?? "es"
  const draft = context.cancellation ?? {}

  switch (context.state) {
    case ConversationState.AWAITING_CANCELLATION_TARGET_SELECTION: {
      const options = draft.cachedAppointments ?? []
      // Only a message that is entirely a number picks a row ("2 pm" is a time, not appointment #2).
      const choice = parseListChoice(buttonId ?? text)
      const chosen = choice !== null ? options[choice - 1] : undefined
      if (!chosen) {
        // A number that isn't on the list: show the list again rather than reading it as a new request.
        if (choice !== null) {
          const listReply = appointmentListReply(lang, options)
          return { context, reply: { ...listReply, text: `${t(lang, "appointmentSelectionInvalid")}\n\n${listReply.text}` } }
        }

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

      return {
        context: {
          ...context,
          state: ConversationState.AWAITING_CANCELLATION_CONFIRMATION,
          cancellation: { targetAppointmentId: chosen.appointmentId },
        },
        reply: confirmCancellationReply(lang, formatClinicDate(appointment.starts_at, lang), formatClinicTime(appointment.starts_at)),
      }
    }

    case ConversationState.AWAITING_CANCELLATION_CONFIRMATION: {
      // Strict yes only (no casual "ok"/"sure"): this one is destructive. Any refusal ("no", "no, keep it")
      // keeps the appointment, and "cancel" is NOT a refusal here — it's what they're being asked to confirm.
      const isYes = buttonId === "yes" || isAffirmative(text)
      const isNo = buttonId === "no" || isNegative(text) || startsWithDecline(text)

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
