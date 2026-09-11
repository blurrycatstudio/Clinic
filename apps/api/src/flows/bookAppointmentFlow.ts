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

/**
 * A specific day/instant the patient asked for turned out to have nothing open
 * (closed day, fully booked, etc). Rather than a flat "no slots at all" — which
 * reads as the whole clinic being unavailable — fall back to the clinic's next
 * actually-open slots so the patient can still book something in this turn.
 */
async function fallbackToGeneralSlots(lang: Language) {
  const { slots, hasMore, text: promptText } = await promptForSlots(lang)
  if (slots.length === 0) {
    return { slots, hasMore: false, text: t(lang, "noSlotsAvailable") }
  }
  return { slots, hasMore, text: `${t(lang, "requestedDayUnavailable")}\n\n${promptText}` }
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

/** Only extracts a reason when the text actually carries descriptive content — a bare date/availability query shouldn't be mistaken for one. */
export function extractReasonIfPresent(rawText: string): string | undefined {
  const wordCount = rawText.trim().split(/\s+/).filter(Boolean).length
  return wordCount >= MIN_WORDS_FOR_REASON ? rawText.trim() : undefined
}

/** Falls back to the patient's last visit reason, or a generic label, when the free text was just a bare date/availability query with no descriptive content. */
function inferReason(rawText: string, lastReason?: string, lang: Language = "es"): string {
  return extractReasonIfPresent(rawText) ?? lastReason ?? (lang === "es" ? "Consulta general" : "General consultation")
}

const NAME_DISQUALIFIERS = /\d|[?¿]/
const BOOKING_INTENT_WORDS = [
  "book", "appointment", "cita", "agendar", "reprogramar", "reschedule", "cancel", "cancelar",
  "fever", "fiebre", "dolor", "pain", "asap", "urgent", "urgente", "doctor", "hola", "hello", "hi",
]

/** A patient correcting their saved name types 1-6 plain words with no digits/booking language — anything else at that prompt is almost certainly a re-stated request, not a name. */
function isPlausibleFullName(text: string): boolean {
  const trimmed = text.trim()
  if (trimmed.length < 2 || trimmed.length > 60) return false
  if (NAME_DISQUALIFIERS.test(trimmed)) return false
  const lower = trimmed.toLowerCase()
  if (BOOKING_INTENT_WORDS.some((w) => lower.includes(w))) return false
  return trimmed.split(/\s+/).filter(Boolean).length <= 6
}

/**
 * Continues an already-identified booking (name/phone known, `draft` may
 * already carry a reason) using whatever free text the patient just sent —
 * shared by a fresh free-text request from an existing patient and by a
 * patient re-stating their request instead of answering the current prompt
 * (e.g. mid returning-patient confirmation). Never asks a question that
 * `draft`/`rawText` has already answered.
 */
async function resolveBookingContinuation(
  context: ConversationContext,
  rawText: string,
  lang: Language,
  draft: PendingBookingDraft,
): Promise<FlowResult> {
  const parsed = parseBookingRequest(rawText, lang, new Date())
  const withReason: PendingBookingDraft = { ...draft, reason: draft.reason ?? inferReason(rawText, draft.lastReason, lang) }

  if (!parsed) {
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
        activeFlow: FlowType.BOOK,
        booking: { ...withReason, cachedSlots: slots, slotOffset: slots.length },
      },
      reply: {
        text: promptText,
        ...(hasMore ? { buttons: [{ id: "more_slots", title: t(lang, "moreDatesButton") }] } : {}),
      },
    }
  }

  const dayMatches =
    parsed.kind === "asap"
      ? await appointmentService.getAvailableSlots(BOOKING_HORIZON_DAYS, 1, 0)
      : await appointmentService.getSlotsOnDate(parsed.date)
  const exact = parsed.kind === "exact" ? dayMatches.find((s) => Math.abs(new Date(s.startsAtIso).getTime() - parsed.date.getTime()) < 60_000) : null
  const requestedSlots = exact ? [exact] : dayMatches

  if (requestedSlots.length === 0) {
    const fallback = await fallbackToGeneralSlots(lang)
    if (fallback.slots.length === 0) {
      return {
        context: { ...context, state: ConversationState.AWAITING_MENU_SELECTION, activeFlow: FlowType.NONE },
        reply: { text: fallback.text },
      }
    }
    return {
      context: {
        ...context,
        state: ConversationState.AWAITING_SLOT_SELECTION,
        activeFlow: FlowType.BOOK,
        booking: { ...withReason, cachedSlots: fallback.slots, slotOffset: fallback.slots.length },
      },
      reply: {
        text: fallback.text,
        ...(fallback.hasMore ? { buttons: [{ id: "more_slots", title: t(lang, "moreDatesButton") }] } : {}),
      },
    }
  }
  const slots = requestedSlots

  // A single matched slot (ASAP, or an exact date+time that's actually free) can go
  // straight to confirmation; several open slots (or a bare-day query) still need the
  // patient to pick one.
  if (slots.length === 1 && parsed.kind !== "day_query") {
    return {
      context: {
        ...context,
        state: ConversationState.AWAITING_BOOKING_CONFIRMATION,
        activeFlow: FlowType.BOOK,
        booking: { ...withReason, selectedSlotIso: slots[0]!.startsAtIso },
      },
      reply: confirmationReply(lang, withReason, slots[0]!),
    }
  }

  return {
    context: {
      ...context,
      state: ConversationState.AWAITING_SLOT_SELECTION,
      activeFlow: FlowType.BOOK,
      booking: { ...withReason, cachedSlots: slots, slotOffset: slots.length },
    },
    reply: slotListReply(lang, slots),
  }
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
  if (existingPatient) {
    const lastAppointment = await appointmentRepository.findMostRecentForPatient(existingPatient.id)
    return resolveBookingContinuation(context, rawText, lang, {
      fullName: existingPatient.full_name,
      phoneE164: existingPatient.phone_e164,
      ...(lastAppointment?.reason ? { lastReason: lastAppointment.reason } : {}),
    })
  }

  // New patient: still need their name before we can confirm/list anything meaningfully.
  // Resolve the slot(s) now so AWAITING_NAME can jump straight to confirmation/listing.
  const reason = inferReason(rawText, undefined, lang)
  let requestedSlots: AvailableSlot[]
  if (parsed.kind === "asap") {
    requestedSlots = await appointmentService.getAvailableSlots(BOOKING_HORIZON_DAYS, 1, 0)
  } else if (parsed.kind === "exact") {
    const dayMatches = await appointmentService.getSlotsOnDate(parsed.date)
    const exact = dayMatches.find((s) => Math.abs(new Date(s.startsAtIso).getTime() - parsed.date.getTime()) < 60_000)
    requestedSlots = exact ? [exact] : dayMatches
  } else {
    requestedSlots = await appointmentService.getSlotsOnDate(parsed.date)
  }

  let slots = requestedSlots
  if (slots.length === 0) {
    const fallback = await fallbackToGeneralSlots(lang)
    if (fallback.slots.length === 0) {
      return {
        context: { ...context, state: ConversationState.AWAITING_MENU_SELECTION, activeFlow: FlowType.NONE },
        reply: { text: fallback.text },
      }
    }
    slots = fallback.slots
  }

  const singleExactMatch = slots === requestedSlots && slots.length === 1 && parsed.kind !== "day_query"
  return {
    context: {
      ...context,
      state: ConversationState.AWAITING_NAME,
      activeFlow: FlowType.BOOK,
      booking: singleExactMatch
        ? { reason, selectedSlotIso: slots[0]!.startsAtIso }
        : { reason, cachedSlots: slots, slotOffset: slots.length },
    },
    // A patient the bot doesn't recognize yet still needs to give their name first —
    // any "that day isn't available, here's what is" framing shows once we list the
    // slots after the name arrives (see AWAITING_NAME below).
    reply: { text: t(lang, "askName") },
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
        // The triggering message may already have carried a reason (e.g. "I have a
        // fever, book me an appointment") — don't re-ask what we already know.
        if (draft.reason) {
          return resolveBookingContinuation(context, "", lang, draft)
        }
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

      const trimmedText = text.trim()
      if (trimmedText.length < 2) {
        return { context, reply: { text: t(lang, "confirmSavedDetailsInvalid") } }
      }

      // Anything short and name-shaped is treated as a corrected full name rather
      // than a plain invalid reply — patients naturally just retype their name
      // here instead of saying "no" first. Anything else (mentions a date, a
      // symptom, "book"/"appointment", contains digits, etc.) is almost certainly
      // the patient re-stating their whole request instead of confirming/fixing
      // their name — handle it as a continuation of the same booking instead of
      // silently overwriting their saved name with that sentence.
      if (!isPlausibleFullName(trimmedText)) {
        return resolveBookingContinuation(context, trimmedText, lang, draft)
      }

      return {
        context: {
          ...context,
          state: ConversationState.AWAITING_REASON,
          booking: { ...draft, fullName: trimmedText, phoneE164: context.phoneE164 },
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
      // A reason was already inferred from the message that started this booking
      // (e.g. "I have a fever, book me an appointment") — go straight to slots.
      if (updatedDraft.reason) {
        return resolveBookingContinuation(context, "", lang, updatedDraft)
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

        if (newSlots.length === 0) {
          const fallback = await fallbackToGeneralSlots(lang)
          if (fallback.slots.length === 0) {
            return {
              context: { ...context, state: ConversationState.AWAITING_MENU_SELECTION, activeFlow: FlowType.NONE },
              reply: { text: fallback.text },
            }
          }
          return {
            context: { ...context, booking: { ...draft, cachedSlots: fallback.slots, slotOffset: fallback.slots.length } },
            reply: {
              text: fallback.text,
              ...(fallback.hasMore ? { buttons: [{ id: "more_slots", title: t(lang, "moreDatesButton") }] } : {}),
            },
          }
        }

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
