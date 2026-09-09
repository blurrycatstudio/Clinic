import { BOOKING_HORIZON_DAYS, CLINIC_TIMEZONE, ConversationState, FlowType, t } from "@clinic/shared"
import type { FlowHandler } from "./types.js"
import { appointmentService, type AvailableSlot } from "../services/appointmentService.js"
import { format } from "date-fns"
import { toZonedTime } from "date-fns-tz"

const SLOTS_PER_PAGE = 9

function renderSlotList(slots: AvailableSlot[]): string {
  return slots.map((s, i) => `${i + 1}️⃣ ${s.label}`).join("\n")
}

/** Fetches one page of slots starting at `offset`. Requests one extra slot beyond the page size just to detect whether a further page exists, for the "See more dates" button. */
async function promptForSlots(lang: "en" | "es", offset = 0) {
  const fetched = await appointmentService.getAvailableSlots(BOOKING_HORIZON_DAYS, SLOTS_PER_PAGE + 1, offset)
  const hasMore = fetched.length > SLOTS_PER_PAGE
  const slots = fetched.slice(0, SLOTS_PER_PAGE)
  if (slots.length === 0) {
    return { slots, hasMore: false, text: t(lang, "noSlotsAvailable") }
  }
  return { slots, hasMore, text: t(lang, "chooseSlot", { slots: renderSlotList(slots) }) }
}

export const bookAppointmentFlow: FlowHandler = async ({ text, buttonId, context, settings }) => {
  const lang = context.language ?? "es"
  const draft = context.booking ?? {}

  switch (context.state) {
    case ConversationState.AWAITING_RETURNING_PATIENT_CONFIRMATION: {
      const normalized = text.trim().toLowerCase()
      const isYes = ["si", "sí", "yes", "1"].includes(normalized)

      if (isYes) {
        return {
          context: { ...context, state: ConversationState.AWAITING_REASON },
          reply: draft.lastReason
            ? {
                text: t(lang, "askReasonWithHint", { lastReason: draft.lastReason }),
                buttons: [{ id: "same", title: t(lang, "sameReasonButton") }],
              }
            : { text: t(lang, "askReason") },
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
        reply: draft.lastReason
          ? {
              text: t(lang, "askReasonWithHint", { lastReason: draft.lastReason }),
              buttons: [{ id: "same", title: t(lang, "sameReasonButton") }],
            }
          : { text: t(lang, "askReason") },
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
      const { slots, hasMore, text: promptText } = await promptForSlots(lang)
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
          booking: { ...draft, reason, cachedSlots: slots, slotOffset: slots.length },
        },
        reply: {
          text: promptText,
          ...(hasMore ? { buttons: [{ id: "more_slots", title: t(lang, "moreDatesButton") }] } : {}),
        },
      }
    }

    case ConversationState.AWAITING_SLOT_SELECTION: {
      // "See more dates" pages forward from where the last batch left off, replacing
      // cachedSlots/slotOffset with the new page — each page renumbers from 1.
      if ((buttonId ?? text).trim() === "more_slots") {
        const offset = draft.slotOffset ?? draft.cachedSlots?.length ?? 0
        const { slots: nextSlots, hasMore, text: promptText } = await promptForSlots(lang, offset)
        if (nextSlots.length === 0) {
          return {
            context: { ...context, state: ConversationState.AWAITING_MENU_SELECTION, activeFlow: FlowType.NONE },
            reply: { text: promptText },
          }
        }
        return {
          context: { ...context, booking: { ...draft, cachedSlots: nextSlots, slotOffset: offset + nextSlots.length } },
          reply: {
            text: promptText,
            ...(hasMore ? { buttons: [{ id: "more_slots", title: t(lang, "moreDatesButton") }] } : {}),
          },
        }
      }

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
