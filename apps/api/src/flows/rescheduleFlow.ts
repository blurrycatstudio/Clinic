import { format } from "date-fns"
import { toZonedTime } from "date-fns-tz"
import { CLINIC_TIMEZONE, ConversationState, FlowType, t, type ConversationContext } from "@clinic/shared"
import type { FlowHandler, FlowResult } from "./types.js"
import { appointmentService, type AvailableSlot } from "../services/appointmentService.js"

function renderAppointmentList(options: { label: string }[]): string {
  return options.map((o, i) => `${i + 1}️⃣ ${o.label}`).join("\n")
}

function renderSlotList(slots: AvailableSlot[]): string {
  return slots.map((s, i) => `${i + 1}️⃣ ${s.label}`).join("\n")
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
    reply: { text: t(lang, "chooseAppointmentToReschedule", { appointments: renderAppointmentList(options) }) },
  }
}

export const rescheduleFlow: FlowHandler = async ({ text, context }) => {
  const lang = context.language ?? "es"
  const draft = context.reschedule ?? {}

  switch (context.state) {
    case ConversationState.AWAITING_RESCHEDULE_TARGET_SELECTION: {
      const options = draft.cachedAppointments ?? []
      const index = Number.parseInt(text.trim(), 10) - 1
      const chosen = options[index]
      if (!chosen) {
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
        reply: { text: t(lang, "chooseSlot", { slots: renderSlotList(slots) }) },
      }
    }

    case ConversationState.AWAITING_RESCHEDULE_SLOT_SELECTION: {
      const slots = draft.cachedSlots ?? []
      const index = Number.parseInt(text.trim(), 10) - 1
      const slot = slots[index]
      if (!slot) {
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
        },
      }
    }

    case ConversationState.AWAITING_RESCHEDULE_CONFIRMATION: {
      const normalized = text.trim().toLowerCase()
      const isYes = ["si", "sí", "yes", "1"].includes(normalized)
      const isNo = ["no", "2"].includes(normalized)

      if (!isYes && !isNo) {
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
