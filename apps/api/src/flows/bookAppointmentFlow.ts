import { BOOKING_HORIZON_DAYS, CLINIC_TIMEZONE, ConversationState, FlowType, t, type ConversationContext, type Language, type PendingBookingDraft } from "@clinic/shared"
import type { FlowHandler, FlowResult } from "./types.js"
import { appointmentService, type AvailableSlot } from "../services/appointmentService.js"
import { patientRepository } from "../repositories/patientRepository.js"
import { appointmentRepository } from "../repositories/appointmentRepository.js"
import { parseBookingRequest } from "../lib/parseBookingRequest.js"
import { tryAnswerOffScript } from "../lib/offScript.js"
import { format } from "date-fns"
import { toZonedTime } from "date-fns-tz"

const SLOTS_PER_PAGE = 9
const MIN_WORDS_FOR_REASON = 4

function renderSlotList(slots: AvailableSlot[]): string {
  return slots.map((s, i) => `${i + 1}️⃣ ${s.label}`).join("\n")
}

/** Fetches one page of slots starting at `offset`. Requests one extra slot beyond the page size just to detect whether a further page exists, for the "See more dates" button. */
async function promptForSlots(lang: Language, offset = 0) {
  const fetched = await appointmentService.getAvailableSlots(BOOKING_HORIZON_DAYS, SLOTS_PER_PAGE + 1, offset)
  const hasMore = fetched.length > SLOTS_PER_PAGE
  const slots = fetched.slice(0, SLOTS_PER_PAGE)
  if (slots.length === 0) {
    return { slots, hasMore: false, text: t(lang, "noSlotsAvailable") }
  }
  return { slots, hasMore, text: t(lang, "chooseSlot", { slots: renderSlotList(slots) }) }
}

function slotListReply(lang: Language, slots: AvailableSlot[]) {
  if (slots.length === 0) return { text: t(lang, "noSlotsAvailable") }
  return { text: t(lang, "chooseSlot", { slots: renderSlotList(slots) }) }
}

function buildConfirmText(lang: Language, draft: PendingBookingDraft, slot: AvailableSlot) {
  const zoned = toZonedTime(new Date(slot.startsAtIso), CLINIC_TIMEZONE)
  return t(lang, "confirmBooking", {
    name: draft.fullName ?? "",
    date: format(zoned, "EEEE d MMMM"),
    time: format(zoned, "h:mm a"),
    reason: draft.reason ?? "",
  })
}

function confirmationReply(lang: Language, draft: PendingBookingDraft, slot: AvailableSlot) {
  return {
    text: buildConfirmText(lang, draft, slot),
    buttons: [
      { id: "yes", title: t(lang, "confirmYesButton") },
      { id: "no", title: t(lang, "confirmNoButton") },
    ],
  }
}

/** Falls back to the patient's last visit reason, or a generic label, when the free text was just a bare date/availability query with no descriptive content. */
function inferReason(rawText: string, lastReason?: string, lang: Language = "es"): string {
  const wordCount = rawText.trim().split(/\s+/).filter(Boolean).length
  if (wordCount >= MIN_WORDS_FOR_REASON) return rawText.trim()
  return lastReason ?? (lang === "es" ? "Consulta general" : "General consultation")
}

/**
 * Entry point for a booking request typed as free text on the main menu
 * (e.g. "I have a fever, book me asap", "book me for Sept 14 at 5pm", "what's
 * open on the 20th?") instead of tapping "Book Appointment" first. Returns
 * null when the text doesn't parse as a date/time/urgency request at all, so
 * the caller can fall through to its normal off-script handling.
 */
export async function startBookingFromFreeText(
  context: ConversationContext,
  rawText: string,
): Promise<FlowResult | null> {
  const lang = context.language ?? "es"
  const parsed = parseBookingRequest(rawText, lang, new Date())
  if (!parsed) return null

  const existingPatient = await patientRepository.findByPhone(context.phoneE164)
  const lastAppointment = existingPatient ? await appointmentRepository.findMostRecentForPatient(existingPatient.id) : null
  const reason = inferReason(rawText, lastAppointment?.reason, lang)

  let slots: AvailableSlot[]
  if (parsed.kind === "asap") {
    slots = await appointmentService.getAvailableSlots(BOOKING_HORIZON_DAYS, 1, 0)
  } else if (parsed.kind === "exact") {
    const dayMatches = await appointmentService.getSlotsOnDate(parsed.date)
    const exact = dayMatches.find((s) => Math.abs(new Date(s.startsAtIso).getTime() - parsed.date.getTime()) < 60_000)
    slots = exact ? [exact] : dayMatches
  } else {
    slots = await appointmentService.getSlotsOnDate(parsed.date)
  }

  const baseDraft: PendingBookingDraft = {
    ...(existingPatient ? { fullName: existingPatient.full_name, phoneE164: existingPatient.phone_e164 } : {}),
    reason,
  }

  if (slots.length === 0) {
    return {
      context: { ...context, state: ConversationState.AWAITING_MENU_SELECTION, activeFlow: FlowType.NONE },
      reply: { text: t(lang, "noSlotsAvailable") },
    }
  }

  // A single matched slot (ASAP, or an exact date+time that's actually free) can go
  // straight to confirmation once we know who's booking; several open slots means the
  // patient still needs to pick one.
  const singleExactMatch = slots.length === 1 && parsed.kind !== "day_query"

  if (!existingPatient) {
    // New patient: still need their name before we can confirm/list anything meaningfully.
    return {
      context: {
        ...context,
        state: ConversationState.AWAITING_NAME,
        activeFlow: FlowType.BOOK,
        booking: singleExactMatch ? { ...baseDraft, selectedSlotIso: slots[0]!.startsAtIso } : { ...baseDraft, cachedSlots: slots, slotOffset: slots.length },
      },
      reply: { text: t(lang, "askName") },
    }
  }

  if (singleExactMatch) {
    return {
      context: {
        ...context,
        state: ConversationState.AWAITING_BOOKING_CONFIRMATION,
        activeFlow: FlowType.BOOK,
        booking: { ...baseDraft, selectedSlotIso: slots[0]!.startsAtIso },
      },
      reply: confirmationReply(lang, baseDraft, slots[0]!),
    }
  }

  return {
    context: {
      ...context,
      state: ConversationState.AWAITING_SLOT_SELECTION,
      activeFlow: FlowType.BOOK,
      booking: { ...baseDraft, cachedSlots: slots, slotOffset: slots.length },
    },
    reply: slotListReply(lang, slots),
  }
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
      const updatedDraft = { ...draft, fullName, phoneE164: context.phoneE164 }

      // A free-text booking request (see startBookingFromFreeText) may have already
      // resolved a slot or a day's slot list before we knew the patient's name —
      // pick up right where it left off instead of re-asking for the reason.
      if (updatedDraft.selectedSlotIso) {
        const slot: AvailableSlot = { startsAtIso: updatedDraft.selectedSlotIso, label: "" }
        return {
          context: { ...context, state: ConversationState.AWAITING_BOOKING_CONFIRMATION, booking: updatedDraft },
          reply: confirmationReply(lang, updatedDraft, slot),
        }
      }
      if (updatedDraft.cachedSlots && updatedDraft.cachedSlots.length > 0) {
        return {
          context: { ...context, state: ConversationState.AWAITING_SLOT_SELECTION, booking: updatedDraft },
          reply: slotListReply(lang, updatedDraft.cachedSlots),
        }
      }

      return {
        context: { ...context, state: ConversationState.AWAITING_REASON, booking: updatedDraft },
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
      if (slot) {
        return {
          context: {
            ...context,
            state: ConversationState.AWAITING_BOOKING_CONFIRMATION,
            booking: { ...draft, selectedSlotIso: slot.startsAtIso },
          },
          reply: confirmationReply(lang, draft, slot),
        }
      }

      // Not a numeric choice — the patient may be naming a different date instead
      // of picking from the list ("actually the 14th", "qué hay el 20").
      const parsed = parseBookingRequest(text, lang, new Date())
      if (parsed) {
        const newSlots =
          parsed.kind === "asap"
            ? await appointmentService.getAvailableSlots(BOOKING_HORIZON_DAYS, 1, 0)
            : await appointmentService.getSlotsOnDate(parsed.date)

        if (newSlots.length === 1 && parsed.kind !== "day_query") {
          return {
            context: { ...context, state: ConversationState.AWAITING_BOOKING_CONFIRMATION, booking: { ...draft, selectedSlotIso: newSlots[0]!.startsAtIso } },
            reply: confirmationReply(lang, draft, newSlots[0]!),
          }
        }
        return {
          context: { ...context, booking: { ...draft, cachedSlots: newSlots, slotOffset: newSlots.length } },
          reply: slotListReply(lang, newSlots),
        }
      }

      const offScript = await tryAnswerOffScript(text, lang, settings)
      if (offScript) {
        return { context, reply: { text: `${offScript.text}\n\n${slotListReply(lang, slots).text}` } }
      }
      return { context, reply: { text: t(lang, "slotInvalid") } }
    }

    case ConversationState.AWAITING_BOOKING_CONFIRMATION: {
      const normalized = text.trim().toLowerCase()
      const isYes = ["si", "sí", "yes", "1"].includes(normalized)
      const isNo = ["no", "2"].includes(normalized)

      if (!isYes && !isNo) {
        const offScript = await tryAnswerOffScript(text, lang, settings)
        if (offScript && draft.selectedSlotIso) {
          const slot: AvailableSlot = { startsAtIso: draft.selectedSlotIso, label: "" }
          return { context, reply: { text: `${offScript.text}\n\n${buildConfirmText(lang, draft, slot)}` } }
        }
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
