import { ConversationState, FlowType, t } from "@clinic/shared"
import type { FlowHandler } from "./types.js"
import { appointmentService, type AvailableSlot } from "../services/appointmentService.js"
import { format } from "date-fns"
import { toZonedTime } from "date-fns-tz"
import { CLINIC_TIMEZONE } from "@clinic/shared"

function renderSlotList(slots: AvailableSlot[]): string {
  return slots.map((s, i) => `${i + 1}️⃣ ${s.label}`).join("\n")
}

async function promptForSlots(lang: "en" | "es") {
  const slots = await appointmentService.getAvailableSlots()
  if (slots.length === 0) {
    return { slots, text: t(lang, "noSlotsAvailable") }
  }
  return { slots, text: t(lang, "chooseSlot", { slots: renderSlotList(slots) }) }
}

export const bookAppointmentFlow: FlowHandler = async ({ text, context, settings }) => {
  const lang = context.language ?? "es"
  const draft = context.booking ?? {}

  switch (context.state) {
    case ConversationState.AWAITING_RETURNING_PATIENT_CONFIRMATION: {
      const normalized = text.trim().toLowerCase()
      const isYes = ["si", "sí", "yes", "1"].includes(normalized)

      if (isYes) {
        return {
          context: { ...context, state: ConversationState.AWAITING_REASON },
          reply: {
            text: draft.lastReason
              ? t(lang, "askReasonWithHint", { lastReason: draft.lastReason })
              : t(lang, "askReason"),
          },
        }
      }

      // Anything else is treated as a corrected full name rather than a plain
      // invalid reply — patients naturally just retype their name here instead
      // of saying "no" first.
      const fullName = text.trim()
      if (fullName.length < 2) {
        return { context, reply: { text: t(lang, "confirmSavedDetailsInvalid") } }
      }
      return {
        context: {
          ...context,
          state: ConversationState.AWAITING_REASON,
          booking: { ...draft, fullName, phoneE164: context.phoneE164 },
        },
        reply: {
          text: draft.lastReason
            ? t(lang, "askReasonWithHint", { lastReason: draft.lastReason })
            : t(lang, "askReason"),
        },
      }
    }

    case ConversationState.AWAITING_NAME: {
      const fullName = text.trim()
      if (fullName.length < 2) {
        return { context, reply: { text: t(lang, "askName") } }
      }
      // The patient's WhatsApp number *is* their contact number — asking for it
      // again as free text let it drift out of sync with context.phoneE164,
      // which is what every lookup (status/reschedule/cancel) keys off, silently
      // orphaning the booking. So we just use the verified sender number.
      return {
        context: {
          ...context,
          state: ConversationState.AWAITING_REASON,
          booking: { ...draft, fullName, phoneE164: context.phoneE164 },
        },
        reply: { text: t(lang, "askReason") },
      }
    }

    case ConversationState.AWAITING_PHONE: {
      // No longer reachable from the flows above (kept only so an in-flight
      // conversation mid-upgrade doesn't hit an unhandled state) -- resolves
      // straight to the reason question using the WhatsApp sender's number.
      return {
        context: {
          ...context,
          state: ConversationState.AWAITING_REASON,
          booking: { ...draft, phoneE164: context.phoneE164 },
        },
        reply: { text: t(lang, "askReason") },
      }
    }

    case ConversationState.AWAITING_REASON: {
      const normalized = text.trim().toLowerCase()
      const wantsSameReason = ["igual", "same", "mismo"].includes(normalized)
      const reason = wantsSameReason && draft.lastReason ? draft.lastReason : text.trim()
      const { slots, text: promptText } = await promptForSlots(lang)
      if (slots.length === 0) {
        return {
          context: { ...context, state: ConversationState.AWAITING_MENU_SELECTION, activeFlow: FlowType.NONE },
          reply: { text: promptText },
        }
      }
      return {
        context: {
          ...context,
          state: ConversationState.AWAITING_SLOT_SELECTION,
          booking: { ...draft, reason, cachedSlots: slots },
        },
        reply: { text: promptText },
      }
    }

    case ConversationState.AWAITING_SLOT_SELECTION: {
      const slots = draft.cachedSlots ?? (await appointmentService.getAvailableSlots())
      const index = Number.parseInt(text.trim(), 10) - 1
      const slot = slots[index]
      if (!slot) {
        return { context, reply: { text: t(lang, "slotInvalid") } }
      }

      const zoned = toZonedTime(new Date(slot.startsAtIso), CLINIC_TIMEZONE)
      const confirmText = t(lang, "confirmBooking", {
        name: draft.fullName ?? "",
        date: format(zoned, "EEEE d MMMM"),
        time: format(zoned, "h:mm a"),
        reason: draft.reason ?? "",
      })

      return {
        context: {
          ...context,
          state: ConversationState.AWAITING_BOOKING_CONFIRMATION,
          booking: { ...draft, selectedSlotIso: slot.startsAtIso },
        },
        reply: { text: confirmText },
      }
    }

    case ConversationState.AWAITING_BOOKING_CONFIRMATION: {
      const normalized = text.trim().toLowerCase()
      const isYes = ["si", "sí", "yes", "1"].includes(normalized)
      const isNo = ["no", "2"].includes(normalized)

      if (!isYes && !isNo) {
        return { context, reply: { text: t(lang, "confirmInvalid") } }
      }
      if (isNo) {
        return {
          context: { ...context, state: ConversationState.AWAITING_MENU_SELECTION, activeFlow: FlowType.NONE, booking: undefined },
          reply: { text: t(lang, "bookingCancelled") },
        }
      }

      const { appointment, patientId } = await appointmentService.bookAppointment({
        patientFullName: draft.fullName ?? "",
        patientPhoneE164: draft.phoneE164 ?? context.phoneE164,
        reason: draft.reason ?? "",
        startsAtIso: draft.selectedSlotIso ?? new Date().toISOString(),
        source: "whatsapp",
        language: lang,
      })

      const zoned = toZonedTime(new Date(appointment.starts_at), CLINIC_TIMEZONE)
      const confirmedText = t(lang, "bookingConfirmed", {
        date: format(zoned, "EEEE d MMMM"),
        time: format(zoned, "h:mm a"),
        doctorName: settings.doctor_name,
      })

      return {
        context: {
          ...context,
          patientId,
          state: ConversationState.AWAITING_MENU_SELECTION,
          activeFlow: FlowType.NONE,
          booking: undefined,
        },
        reply: { text: confirmedText },
      }
    }

    default:
      return { context, reply: { text: t(lang, "genericFallback") } }
  }
}
