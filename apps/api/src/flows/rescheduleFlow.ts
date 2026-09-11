import { format } from "date-fns"
import { toZonedTime } from "date-fns-tz"
import { CLINIC_TIMEZONE, ConversationState, FlowType, t, type ConversationContext, type Language } from "@clinic/shared"
import type { FlowHandler, FlowReply, FlowResult } from "./types.js"
import { appointmentService, type AvailableSlot } from "../services/appointmentService.js"
import { tryAnswerOffScript } from "../lib/offScript.js"

/** Each appointment/slot is a tappable WhatsApp list row — the patient selects with one tap; a typed number still works too. */
function appointmentListReply(lang: Language, promptKey: "chooseAppointmentToReschedule", options: { label: string }[]): FlowReply {
  return {
    text: t(lang, promptKey, { appointments: options.map((o, i) => `${i + 1}️⃣ ${o.label}`).join("\n") }),
    list: { buttonLabel: t(lang, "viewTimesButton"), rows: options.map((o, i) => ({ id: String(i + 1), title: o.label })) },
  }
}

function slotListReply(lang: Language, slots: AvailableSlot[]): FlowReply {
  if (slots.length === 0) return { text: t(lang, "noSlotsAvailable") }
  return {
    text: t(lang, "chooseSlotPrompt"),
    list: { buttonLabel: t(lang, "viewTimesButton"), rows: slots.map((s, i) => ({ id: String(i + 1), title: s.label })) },
  }
}

/** Called by mainMenuFlow when the patient picks option 2 — needs a DB lookup, so it can't be a plain switch branch. */
export async function enterRescheduleFlow(context: ConversationContext): Promise<FlowResult> {
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
      state: ConversationState.AWAITING_RESCHEDULE_TARGET_SELECTION,
      activeFlow: FlowType.RESCHEDULE,
      reschedule: { cachedAppointments: options },
    },
    reply: appointmentListReply(lang, "chooseAppointmentToReschedule", options),
  }
}

export const rescheduleFlow: FlowHandler = async ({ text, buttonId, context, settings }) => {
  const lang = context.language ?? "es"
  const draft = context.reschedule ?? {}

  switch (context.state) {
    case ConversationState.AWAITING_RESCHEDULE_TARGET_SELECTION: {
      const options = draft.cachedAppointments ?? []
      const index = Number.parseInt((buttonId ?? text).trim(), 10) - 1
      const chosen = options[index]
      if (!chosen) {
        const offScript = await tryAnswerOffScript(text, lang, settings)
        if (offScript) {
          const listReply = appointmentListReply(lang, "chooseAppointmentToReschedule", options)
          return { context, reply: { ...listReply, text: `${offScript.text}\n\n${listReply.text}` } }
        }
        return { context, reply: { text: t(lang, "appointmentSelectionInvalid") } }
      }

      const slots = await appointmentService.getAvailableSlots()
      if (slots.length === 0) {
        return {
          context: { ...context, state: ConversationState.AWAITING_MENU_SELECTION, activeFlow: FlowType.NONE },
          reply: { text: t(lang, "noSlotsAvailable") },
        }
      }

      return {
        context: {
          ...context,
          state: ConversationState.AWAITING_RESCHEDULE_SLOT_SELECTION,
          reschedule: { ...draft, targetAppointmentId: chosen.appointmentId, cachedSlots: slots },
        },
        reply: slotListReply(lang, slots),
      }
    }

    case ConversationState.AWAITING_RESCHEDULE_SLOT_SELECTION: {
      const slots = draft.cachedSlots ?? []
      const index = Number.parseInt((buttonId ?? text).trim(), 10) - 1
      const slot = slots[index]
      if (!slot) {
        const offScript = await tryAnswerOffScript(text, lang, settings)
        if (offScript) {
          const listReply = slotListReply(lang, slots)
          return { context, reply: { ...listReply, text: `${offScript.text}\n\n${listReply.text}` } }
        }
        return { context, reply: { text: t(lang, "slotInvalid") } }
      }

      const zoned = toZonedTime(new Date(slot.startsAtIso), CLINIC_TIMEZONE)
      return {
        context: {
          ...context,
          state: ConversationState.AWAITING_RESCHEDULE_CONFIRMATION,
          reschedule: { ...draft, selectedSlotIso: slot.startsAtIso },
        },
        reply: {
          text: t(lang, "confirmReschedule", { date: format(zoned, "EEEE d MMMM"), time: format(zoned, "h:mm a") }),
          buttons: [
            { id: "yes", title: t(lang, "confirmYesButton") },
            { id: "no", title: t(lang, "confirmNoButton") },
          ],
        },
      }
    }

    case ConversationState.AWAITING_RESCHEDULE_CONFIRMATION: {
      const normalized = text.trim().toLowerCase()
      const isYes = ["si", "sí", "yes", "1"].includes(normalized)
      const isNo = ["no", "2"].includes(normalized)

      if (!isYes && !isNo) {
        const offScript = await tryAnswerOffScript(text, lang, settings)
        if (offScript) return { context, reply: { text: `${offScript.text}\n\n${t(lang, "confirmInvalid")}` } }
        return { context, reply: { text: t(lang, "confirmInvalid") } }
      }
      if (isNo) {
        return {
          context: { ...context, state: ConversationState.AWAITING_MENU_SELECTION, activeFlow: FlowType.NONE, reschedule: undefined },
          reply: { text: t(lang, "rescheduleCancelledByUser") },
        }
      }

      if (!draft.targetAppointmentId || !draft.selectedSlotIso) {
        return {
          context: { ...context, state: ConversationState.AWAITING_MENU_SELECTION, activeFlow: FlowType.NONE, reschedule: undefined },
          reply: { text: t(lang, "genericFallback") },
        }
      }

      const updated = await appointmentService.rescheduleAppointment(draft.targetAppointmentId, draft.selectedSlotIso)
      const zoned = toZonedTime(new Date(updated.starts_at), CLINIC_TIMEZONE)

      return {
        context: { ...context, state: ConversationState.AWAITING_MENU_SELECTION, activeFlow: FlowType.NONE, reschedule: undefined },
        reply: {
          text: t(lang, "rescheduleConfirmed", { date: format(zoned, "EEEE d MMMM"), time: format(zoned, "h:mm a") }),
        },
      }
    }

    default:
      return { context, reply: { text: t(lang, "genericFallback") } }
  }
}
