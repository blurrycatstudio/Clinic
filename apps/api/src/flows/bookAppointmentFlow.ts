import { ConversationState, FlowType, t, type Appointment, type ConversationContext, type Language, type PendingBookingDraft } from "@clinic/shared"
import type { FlowHandler, FlowReply, FlowResult } from "./types.js"
import { appointmentService, type AvailableSlot } from "../services/appointmentService.js"
import { patientRepository } from "../repositories/patientRepository.js"
import { appointmentRepository } from "../repositories/appointmentRepository.js"
import { anchorToDay, parseBookingText, extractBookingReason } from "../lib/parseBookingRequest.js"
import { isAffirmative, isNegative, parseListChoice, startsWithDecline } from "../lib/replyParsing.js"
import { formatClinicDate, formatClinicTime } from "../lib/dateFormat.js"
import { tryAnswerOffScript } from "../lib/offScript.js"
import { ConflictError } from "../lib/errors.js"
import { backToMenuButton } from "./backToMenuButton.js"
import { findSlotsForRequest, pageOfPool, promptForSlots, relistCachedSlots, sameDayAnchor, withNotice, type SlotPage } from "./slotList.js"

/**
 * The reason to file when the patient's message was only about *when* ("book me tomorrow at 3pm") — there's nothing
 * in it to use. Prefers what they came in for last time, since that is what they were just shown at the prompt.
 */
function fallbackReason(lang: Language, lastReason?: string): string {
  return lastReason ?? (lang === "es" ? "Consulta general" : "General consultation")
}

/**
 * A specific day/instant the patient asked for turned out to have nothing open
 * (closed day, fully booked, etc). Rather than a flat "no slots at all" — which
 * reads as the whole clinic being unavailable — fall back to the clinic's next
 * actually-open slots so the patient can still book something in this turn.
 */
async function fallbackToGeneralSlots(lang: Language): Promise<SlotPage> {
  const page = await promptForSlots(lang)
  if (page.slots.length === 0) return page
  return { ...page, reply: withNotice(page.reply, t(lang, "requestedDayUnavailable")) }
}

function buildConfirmText(lang: Language, draft: PendingBookingDraft, slot: AvailableSlot) {
  return t(lang, "confirmBooking", {
    name: draft.fullName ?? "",
    date: formatClinicDate(slot.startsAtIso, lang),
    time: formatClinicTime(slot.startsAtIso),
    reason: draft.reason ?? "",
  })
}

function askReasonReply(lang: Language, lastReason?: string): FlowReply {
  return lastReason
    ? {
        text: t(lang, "askReasonWithHint", { lastReason }),
        buttons: [{ id: "same", title: t(lang, "sameReasonButton") }, backToMenuButton(lang)],
      }
    : { text: t(lang, "askReason"), buttons: [backToMenuButton(lang)] }
}

function confirmationReply(lang: Language, draft: PendingBookingDraft, slot: AvailableSlot) {
  return {
    text: buildConfirmText(lang, draft, slot),
    buttons: [
      { id: "yes", title: t(lang, "confirmYesButton") },
      { id: "no", title: t(lang, "confirmNoButton") },
      backToMenuButton(lang),
    ],
  }
}

/** The patient's own words about why they're coming, with any date/time and booking boilerplate taken out — undefined when the message had none (e.g. a bare "book me" or a date alone). */
export function extractReasonIfPresent(rawText: string): string | undefined {
  return extractBookingReason(rawText) || undefined
}

// "SAME" at the reason prompt: the button's own title, the word the prompt tells them to type, or a natural paraphrase.
const SAME_REASON = /^(?:the\s+)?same(?:\s+(?:reason|one|as\s+(?:before|last\s+time)))?$|^(?:igual|lo\s+mismo|el\s+mismo|mismo(?:\s+motivo)?|el\s+mismo\s+motivo|igual\s+que\s+(?:antes|la\s+vez\s+pasada))$/

function wantsSameReason(text: string): boolean {
  const normalized = text
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
  return SAME_REASON.test(normalized)
}

const NAME_DISQUALIFIERS = /\d|[?¿]/
const BOOKING_INTENT_WORDS = [
  "book", "appointment", "cita", "agendar", "reprogramar", "reschedule", "cancel", "cancelar",
  "fever", "fiebre", "dolor", "pain", "asap", "urgent", "urgente", "doctor", "hola", "hello", "hi",
  // Symptoms/visit types a patient is likely to type at the "confirm your details" prompt instead of a name.
  "cough", "tos", "cold", "gripa", "flu", "sick", "enfermo", "enferma", "vomit", "vomito", "rash", "sarpullido",
  "headache", "stomach", "earache", "throat", "garganta", "vaccine", "vacuna", "checkup", "revision", "diarrhea", "diarrea",
]
// A bare negative/rejection reply ("no", "wrong", "incorrecto") is the patient flagging
// that the saved details are wrong, not a name and not a restated booking request — it
// must not be silently filed as `fullName`, so it's checked before isPlausibleFullName.
const NEGATION_REPLIES = [
  "no", "nope", "nah", "not correct", "incorrect", "wrong", "that's wrong", "not right", "no correcto",
  "incorrecto", "esta mal", "está mal", "mal", "erroneo", "erróneo", "equivocado", "no es correcto",
]

function isNegationReply(text: string): boolean {
  return NEGATION_REPLIES.includes(text.trim().toLowerCase())
}

/** A patient correcting their saved name types 1-6 plain words with no digits/booking language — anything else at that prompt is almost certainly a re-stated request, not a name. */
function isPlausibleFullName(text: string): boolean {
  const trimmed = text.trim()
  if (trimmed.length < 2 || trimmed.length > 60) return false
  if (isNegationReply(trimmed)) return false
  if (NAME_DISQUALIFIERS.test(trimmed)) return false
  const words = trimmed.toLowerCase().split(/\s+/).filter(Boolean)
  if (words.some((w) => BOOKING_INTENT_WORDS.includes(w))) return false
  return words.length <= 6
}

/**
 * Continues an already-identified booking (name/phone known, `draft` may
 * already carry a reason) using whatever free text the patient just sent —
 * shared by a fresh free-text request from an existing patient, by a
 * patient re-stating their request instead of answering the current prompt
 * (e.g. mid returning-patient confirmation), and by a patient naming a
 * different date/time at the slot list or the final confirmation. Never asks
 * a question that `draft`/`rawText` has already answered.
 */
async function resolveBookingContinuation(
  context: ConversationContext,
  rawText: string,
  lang: Language,
  draft: PendingBookingDraft,
  /** The day the patient is currently looking at, so a bare "4pm" means that day rather than today. */
  anchorIso?: string,
): Promise<FlowResult> {
  const parsed = parseBookingText(rawText, lang, new Date())
  const request = parsed.request ? anchorToDay(parsed.request, anchorIso) : null
  const remainder = parsed.remainder
  const withReason: PendingBookingDraft = {
    ...draft,
    reason: draft.reason ?? (extractBookingReason(remainder) || fallbackReason(lang, draft.lastReason)),
    selectedSlotIso: undefined,
    slotNotice: undefined,
  }

  const listSlots = (page: SlotPage, reply: FlowReply = page.reply): FlowResult => ({
    context: {
      ...context,
      state: ConversationState.AWAITING_SLOT_SELECTION,
      activeFlow: FlowType.BOOK,
      booking: { ...withReason, ...page.draft },
    },
    reply,
  })
  const noSlotsAtAll = (reply: FlowReply): FlowResult => ({
    context: { ...context, state: ConversationState.AWAITING_MENU_SELECTION, activeFlow: FlowType.NONE },
    reply,
  })

  if (!request) {
    const page = await promptForSlots(lang)
    return page.slots.length === 0 ? noSlotsAtAll(page.reply) : listSlots(page)
  }

  const match = await findSlotsForRequest(request)

  if (match.pool.length === 0) {
    const fallback = await fallbackToGeneralSlots(lang)
    return fallback.slots.length === 0 ? noSlotsAtAll(fallback.reply) : listSlots(fallback)
  }

  // A single matched slot (ASAP, or an exact date+time that's actually free) can go
  // straight to confirmation; several open slots (or a bare-day query) still need the
  // patient to pick one.
  if (match.pool.length === 1 && request.kind !== "day_query" && !match.exactTimeMissed) {
    const slot = match.pool[0]!
    return {
      context: {
        ...context,
        state: ConversationState.AWAITING_BOOKING_CONFIRMATION,
        activeFlow: FlowType.BOOK,
        booking: { ...withReason, selectedSlotIso: slot.startsAtIso },
      },
      reply: confirmationReply(lang, withReason, slot),
    }
  }

  const page = pageOfPool(lang, match.pool)
  return listSlots(page, match.exactTimeMissed ? withNotice(page.reply, t(lang, "requestedTimeUnavailable")) : page.reply)
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
  const { request, remainder } = parseBookingText(rawText, lang, new Date())
  if (!request) return null

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
  const reason = extractBookingReason(remainder) || fallbackReason(lang)
  const match = await findSlotsForRequest(request)

  let page: SlotPage | null = null
  let notice: PendingBookingDraft["slotNotice"]
  if (match.pool.length === 0) {
    const fallback = await fallbackToGeneralSlots(lang)
    if (fallback.slots.length === 0) {
      return {
        context: { ...context, state: ConversationState.AWAITING_MENU_SELECTION, activeFlow: FlowType.NONE },
        reply: fallback.reply,
      }
    }
    page = fallback
    notice = "requestedDayUnavailable"
  } else if (match.pool.length > 1 || request.kind === "day_query" || match.exactTimeMissed) {
    page = pageOfPool(lang, match.pool)
    if (match.exactTimeMissed) notice = "requestedTimeUnavailable"
  }

  return {
    context: {
      ...context,
      state: ConversationState.AWAITING_NAME,
      activeFlow: FlowType.BOOK,
      booking: page
        ? { reason, ...page.draft, ...(notice ? { slotNotice: notice } : {}) }
        : { reason, selectedSlotIso: match.pool[0]!.startsAtIso },
    },
    // A patient the bot doesn't recognize yet still needs to give their name first —
    // any "that day isn't available, here's what is" framing shows once we list the
    // slots after the name arrives (see AWAITING_NAME below).
    reply: { text: t(lang, "askName"), buttons: [backToMenuButton(lang)] },
  }
}

export const bookAppointmentFlow: FlowHandler = async ({ text, buttonId, context, settings }) => {
  const lang = context.language ?? "es"
  const draft = context.booking ?? {}

  switch (context.state) {
    case ConversationState.AWAITING_RETURNING_PATIENT_CONFIRMATION: {
      const isYes = buttonId === "yes" || isAffirmative(text, { casual: true })

      if (isYes) {
        // The triggering message may already have carried a reason (e.g. "I have a
        // fever, book me an appointment") — don't re-ask what we already know.
        if (draft.reason) {
          return resolveBookingContinuation(context, "", lang, draft)
        }
        return {
          context: { ...context, state: ConversationState.AWAITING_REASON },
          reply: askReasonReply(lang, draft.lastReason),
        }
      }

      const trimmedText = text.trim()
      if (trimmedText.length < 2 || isNegationReply(trimmedText)) {
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
        reply: askReasonReply(lang, draft.lastReason),
      }
    }

    case ConversationState.AWAITING_NAME: {
      const fullName = text.trim()
      if (fullName.length < 2) {
        return { context, reply: { text: t(lang, "askName"), buttons: [backToMenuButton(lang)] } }
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
        const listReply = relistCachedSlots(lang, updatedDraft.cachedSlots, updatedDraft.slotOffset, updatedDraft.slotPool)
        return {
          context: { ...context, state: ConversationState.AWAITING_SLOT_SELECTION, booking: { ...updatedDraft, slotNotice: undefined } },
          reply: updatedDraft.slotNotice ? withNotice(listReply, t(lang, updatedDraft.slotNotice)) : listReply,
        }
      }
      // A reason was already inferred from the message that started this booking
      // (e.g. "I have a fever, book me an appointment") — go straight to slots.
      if (updatedDraft.reason) {
        return resolveBookingContinuation(context, "", lang, updatedDraft)
      }

      return {
        context: { ...context, state: ConversationState.AWAITING_REASON, booking: updatedDraft },
        reply: askReasonReply(lang),
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
      const trimmed = text.trim()
      if (wantsSameReason(trimmed) && draft.lastReason) {
        const page = await promptForSlots(lang)
        if (page.slots.length === 0) {
          return {
            context: { ...context, state: ConversationState.AWAITING_MENU_SELECTION, activeFlow: FlowType.NONE },
            reply: page.reply,
          }
        }
        return {
          context: { ...context, state: ConversationState.AWAITING_SLOT_SELECTION, booking: { ...draft, reason: draft.lastReason, ...page.draft } },
          reply: page.reply,
        }
      }

      // The patient answered "why" and "when" in one go ("fever, tomorrow at 3pm", "tos, mañana a las 10") —
      // keep the why as the reason and act on the when, instead of filing the whole sentence as the reason
      // and then asking them to pick a time they already gave.
      const { request, remainder } = parseBookingText(trimmed, lang, new Date())
      if (request) {
        const reason = extractBookingReason(remainder) || fallbackReason(lang, draft.lastReason)
        return resolveBookingContinuation(context, trimmed, lang, { ...draft, reason })
      }

      const page = await promptForSlots(lang)
      if (page.slots.length === 0) {
        return {
          context: { ...context, state: ConversationState.AWAITING_MENU_SELECTION, activeFlow: FlowType.NONE },
          reply: page.reply,
        }
      }
      return {
        context: {
          ...context,
          state: ConversationState.AWAITING_SLOT_SELECTION,
          booking: { ...draft, reason: trimmed, ...page.draft },
        },
        reply: page.reply,
      }
    }

    case ConversationState.AWAITING_SLOT_SELECTION: {
      const raw = (buttonId ?? text).trim()

      // "See more" pages forward from where the last batch left off, replacing
      // cachedSlots/slotOffset with the new page — each page renumbers from 1. A day-specific
      // list (slotPool) pages through that day's slots; a general list pages general availability.
      if (raw === "more_slots") {
        const offset = draft.slotOffset ?? draft.cachedSlots?.length ?? 0
        const page = draft.slotPool ? pageOfPool(lang, draft.slotPool, offset) : await promptForSlots(lang, offset)
        if (page.slots.length === 0) {
          return {
            context: { ...context, state: ConversationState.AWAITING_MENU_SELECTION, activeFlow: FlowType.NONE },
            reply: page.reply,
          }
        }
        return {
          context: { ...context, booking: { ...draft, ...page.draft } },
          reply: page.reply,
        }
      }

      const slots = draft.cachedSlots ?? (await appointmentService.getAvailableSlots())

      // Only a message that is *entirely* a list number picks a row. "2 days after at 2 pm" starts with a
      // 2 but is a date — it used to be parsed as option 2 and confirm the wrong slot.
      const choice = parseListChoice(raw)
      const slot = choice !== null ? slots[choice - 1] : undefined
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

      const relist = () => relistCachedSlots(lang, slots, draft.slotOffset, draft.slotPool)

      // A number, but not one on the list — show the list again rather than guessing.
      if (choice !== null) {
        return { context, reply: withNotice(relist(), t(lang, "slotInvalid")) }
      }

      // Not a numeric choice — the patient may be naming a different date/time
      // instead of picking from the list ("actually the 14th at 2pm", "qué hay el
      // 20") — resolve it exactly like a fresh request (including narrowing down
      // to that one instant when it's actually free) rather than just re-listing
      // the whole day.
      const { request } = parseBookingText(text, lang, new Date())
      if (request) {
        return resolveBookingContinuation(context, text, lang, draft, sameDayAnchor(slots))
      }

      const offScript = await tryAnswerOffScript(text, lang, settings)
      if (offScript) {
        return { context, reply: withNotice(relist(), offScript.text ?? "") }
      }
      return { context, reply: withNotice(relist(), t(lang, "slotInvalid")) }
    }

    case ConversationState.AWAITING_BOOKING_CONFIRMATION: {
      const isYes = buttonId === "yes" || isAffirmative(text, { casual: true })
      let isNo = buttonId === "no" || isNegative(text, { allowCancel: true })

      if (!isYes && !isNo) {
        // A different date/time instead of yes/no ("actually make it 3pm", "no, Friday at 10") — move the
        // booking there instead of insisting on a yes/no for a time they've just said they don't want.
        const { request } = parseBookingText(text, lang, new Date())
        if (request) {
          return resolveBookingContinuation(context, text, lang, draft, draft.selectedSlotIso)
        }
        // "no, that's wrong" — a refusal with no new time attached.
        isNo = startsWithDecline(text)
      }

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

      let appointment: Appointment
      let patientId: string
      try {
        ;({ appointment, patientId } = await appointmentService.bookAppointment({
          patientFullName: draft.fullName ?? "",
          patientPhoneE164: draft.phoneE164 ?? context.phoneE164,
          reason: draft.reason ?? "",
          startsAtIso: draft.selectedSlotIso ?? new Date().toISOString(),
          source: "whatsapp",
          language: lang,
        }))
      } catch (err) {
        // Two patients grabbing the same slot at once is rare but real (the DB's
        // partial unique index is the final guard) — re-offer fresh availability
        // instead of a generic "I don't understand" error.
        if (err instanceof ConflictError) {
          const fallback = await fallbackToGeneralSlots(lang)
          const conflictReply = withNotice(fallback.reply, t(lang, "slotConflict"))
          if (fallback.slots.length === 0) {
            return { context: { ...context, state: ConversationState.AWAITING_MENU_SELECTION, activeFlow: FlowType.NONE, booking: undefined }, reply: conflictReply }
          }
          return {
            context: {
              ...context,
              state: ConversationState.AWAITING_SLOT_SELECTION,
              booking: { ...draft, selectedSlotIso: undefined, ...fallback.draft },
            },
            reply: conflictReply,
          }
        }
        throw err
      }

      const confirmedText = t(lang, "bookingConfirmed", {
        date: formatClinicDate(appointment.starts_at, lang),
        time: formatClinicTime(appointment.starts_at),
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
