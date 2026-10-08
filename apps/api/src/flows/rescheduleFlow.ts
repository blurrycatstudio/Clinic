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
import { anchorToDay, parseBookingRequest } from "../lib/parseBookingRequest.js"
import { isAffirmative, isNegative, parseListChoice, startsWithDecline } from "../lib/replyParsing.js"
import { formatClinicDate, formatClinicSlotLabel, formatClinicTime } from "../lib/dateFormat.js"
import { tryAnswerOffScript } from "../lib/offScript.js"
import { startBookingFromFreeText } from "./bookAppointmentFlow.js"
import { enterCancelFlow } from "./cancelFlow.js"
import { openaiService } from "../services/openaiService.js"
import { ConflictError } from "../lib/errors.js"
import { backToMenuButton } from "./backToMenuButton.js"
import { findSlotsForRequest, pageOfPool, promptForSlots, relistCachedSlots, sameDayAnchor, withNotice } from "./slotList.js"

/**
 * A patient mid-reschedule often just restates their whole request instead of
 * answering the current prompt ("book appointment for me on 20 September at 2pm",
 * "actually cancel it") — this detects that and returns a FlowResult that abandons
 * the in-progress reschedule and starts the newly-stated one, instead of making
 * them answer the stale slot/appointment prompt first. Returns null when the text
 * doesn't clearly express a different actionable request, so the caller falls
 * through to its normal off-script/invalid handling.
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
  if (intent === Intent.CANCEL_APPOINTMENT) return enterCancelFlow(context)
  return null
}

/** Each appointment/slot is a tappable WhatsApp list row — the patient selects with one tap; a typed number still works too. */
function appointmentListReply(lang: Language, promptKey: "chooseAppointmentToReschedule", options: { label: string }[]): FlowReply {
  return {
    text: t(lang, promptKey, { appointments: options.map((o, i) => `${i + 1}️⃣ ${o.label}`).join("\n") }),
    list: {
      buttonLabel: t(lang, "viewTimesButton"),
      rows: [...options.map((o, i) => ({ id: String(i + 1), title: o.label })), backToMenuButton(lang)],
    },
  }
}

function rescheduleConfirmationReply(lang: Language, slotIso: string): FlowReply {
  return {
    text: t(lang, "confirmReschedule", { date: formatClinicDate(slotIso, lang), time: formatClinicTime(slotIso) }),
    buttons: [
      { id: "yes", title: t(lang, "confirmYesButton") },
      { id: "no", title: t(lang, "confirmNoButton") },
      backToMenuButton(lang),
    ],
  }
}

/**
 * A patient picking a new slot for the appointment they're rescheduling may
 * type a date/time instead of tapping a list row ("actually the 20th at
 * 2pm") — this resolves that text against real availability and keeps
 * `targetAppointmentId` intact, so it moves the SAME appointment instead of
 * falling through to tryRestateIntent, which would abandon this reschedule
 * and start booking an unrelated new appointment. Returns null when the text
 * doesn't parse as a date/time at all, so the caller can fall through to its
 * normal restate/off-script handling.
 */
async function resolveRescheduleDate(
  context: ConversationContext,
  rawText: string,
  lang: Language,
  draft: { targetAppointmentId?: string },
  /** The day the patient is currently looking at, so a bare "4pm" means that day rather than today. */
  anchorIso?: string,
): Promise<FlowResult | null> {
  const requested = parseBookingRequest(rawText, lang, new Date())
  if (!requested) return null
  const parsed = anchorToDay(requested, anchorIso)

  const base = { targetAppointmentId: draft.targetAppointmentId }
  const match = await findSlotsForRequest(parsed)

  if (match.pool.length === 0) {
    const page = await promptForSlots(lang)
    if (page.slots.length === 0) {
      return { context: { ...context, state: ConversationState.AWAITING_MENU_SELECTION, activeFlow: FlowType.NONE, reschedule: undefined }, reply: page.reply }
    }
    return {
      context: {
        ...context,
        state: ConversationState.AWAITING_RESCHEDULE_SLOT_SELECTION,
        reschedule: { ...base, ...page.draft },
      },
      reply: withNotice(page.reply, t(lang, "requestedDayUnavailable")),
    }
  }

  if (match.pool.length === 1 && parsed.kind !== "day_query" && !match.exactTimeMissed) {
    const slot = match.pool[0]!
    return {
      context: { ...context, state: ConversationState.AWAITING_RESCHEDULE_CONFIRMATION, reschedule: { ...base, selectedSlotIso: slot.startsAtIso } },
      reply: rescheduleConfirmationReply(lang, slot.startsAtIso),
    }
  }

  const page = pageOfPool(lang, match.pool)
  return {
    context: {
      ...context,
      state: ConversationState.AWAITING_RESCHEDULE_SLOT_SELECTION,
      reschedule: { ...base, ...page.draft },
    },
    reply: match.exactTimeMissed ? withNotice(page.reply, t(lang, "requestedTimeUnavailable")) : page.reply,
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
    label: formatClinicSlotLabel(a.starts_at, lang),
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

/** Called from the reminder-response flow, where the appointment is already known (from the reminder itself) — skips straight to slot selection instead of re-asking "which appointment?". */
export async function enterRescheduleFlowForAppointment(context: ConversationContext, appointmentId: string): Promise<FlowResult> {
  const lang = context.language ?? "es"
  const appointment = await appointmentRepository.findById(appointmentId)

  if (!appointment || !["scheduled", "confirmed"].includes(appointment.status)) {
    return {
      context: { ...context, state: ConversationState.AWAITING_MENU_SELECTION, activeFlow: FlowType.NONE },
      reply: { text: t(lang, "reminderAppointmentGone") },
    }
  }

  const page = await promptForSlots(lang)

  if (page.slots.length === 0) {
    return { context: { ...context, state: ConversationState.AWAITING_MENU_SELECTION, activeFlow: FlowType.NONE }, reply: page.reply }
  }

  return {
    context: {
      ...context,
      state: ConversationState.AWAITING_RESCHEDULE_SLOT_SELECTION,
      activeFlow: FlowType.RESCHEDULE,
      reschedule: { targetAppointmentId: appointmentId, ...page.draft },
    },
    reply: page.reply,
  }
}

export const rescheduleFlow: FlowHandler = async ({ text, buttonId, context, settings }) => {
  const lang = context.language ?? "es"
  const draft = context.reschedule ?? {}

  switch (context.state) {
    case ConversationState.AWAITING_RESCHEDULE_TARGET_SELECTION: {
      const options = draft.cachedAppointments ?? []
      // Only a message that is entirely a number picks a row ("2 pm" is a time, not appointment #2).
      const choice = parseListChoice(buttonId ?? text)
      const chosen = choice !== null ? options[choice - 1] : undefined
      if (!chosen) {
        // A number that isn't on the list: show the list again rather than reading it as a new request.
        if (choice !== null) {
          const listReply = appointmentListReply(lang, "chooseAppointmentToReschedule", options)
          return { context, reply: withNotice(listReply, t(lang, "appointmentSelectionInvalid")) }
        }

        const restated = await tryRestateIntent(text, context, lang, settings)
        if (restated) return restated

        const offScript = await tryAnswerOffScript(text, lang, settings)
        if (offScript) {
          const listReply = appointmentListReply(lang, "chooseAppointmentToReschedule", options)
          return { context, reply: { ...listReply, text: `${offScript.text}\n\n${listReply.text}` } }
        }
        return { context, reply: { text: t(lang, "appointmentSelectionInvalid") } }
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
          state: ConversationState.AWAITING_RESCHEDULE_SLOT_SELECTION,
          reschedule: { ...draft, targetAppointmentId: chosen.appointmentId, ...page.draft },
        },
        reply: page.reply,
      }
    }

    case ConversationState.AWAITING_RESCHEDULE_SLOT_SELECTION: {
      // "See more" pages forward from where the last batch left off, replacing
      // cachedSlots/slotOffset with the new page — each page renumbers from 1. A day-specific
      // list (slotPool) pages through that day's slots; a general list pages general availability.
      if ((buttonId ?? text).trim() === "more_slots") {
        const offset = draft.slotOffset ?? draft.cachedSlots?.length ?? 0
        const page = draft.slotPool ? pageOfPool(lang, draft.slotPool, offset) : await promptForSlots(lang, offset)
        if (page.slots.length === 0) {
          return {
            context: { ...context, state: ConversationState.AWAITING_MENU_SELECTION, activeFlow: FlowType.NONE },
            reply: page.reply,
          }
        }
        return {
          context: { ...context, reschedule: { ...draft, ...page.draft } },
          reply: page.reply,
        }
      }

      const slots = draft.cachedSlots ?? []
      // Only a message that is entirely a list number picks a row — "2 days after at 2 pm" is a date, not option 2.
      const choice = parseListChoice(buttonId ?? text)
      const slot = choice !== null ? slots[choice - 1] : undefined
      if (!slot) {
        const relist = () => relistCachedSlots(lang, slots, draft.slotOffset, draft.slotPool)

        // A number, but not one on the list — show the list again rather than guessing.
        if (choice !== null) return { context, reply: withNotice(relist(), t(lang, "slotInvalid")) }

        // Typed a date/time instead of picking a row — resolve it against real
        // availability for THIS reschedule before considering it a restated,
        // unrelated request (see resolveRescheduleDate for why the order matters).
        const dateMatch = await resolveRescheduleDate(context, text, lang, draft, sameDayAnchor(slots))
        if (dateMatch) return dateMatch

        const restated = await tryRestateIntent(text, context, lang, settings)
        if (restated) return restated

        const offScript = await tryAnswerOffScript(text, lang, settings)
        if (offScript) {
          return { context, reply: withNotice(relist(), offScript.text ?? "") }
        }
        return { context, reply: withNotice(relist(), t(lang, "slotInvalid")) }
      }

      return {
        context: {
          ...context,
          state: ConversationState.AWAITING_RESCHEDULE_CONFIRMATION,
          reschedule: { ...draft, selectedSlotIso: slot.startsAtIso },
        },
        reply: rescheduleConfirmationReply(lang, slot.startsAtIso),
      }
    }

    case ConversationState.AWAITING_RESCHEDULE_CONFIRMATION: {
      const isYes = buttonId === "yes" || isAffirmative(text, { casual: true })
      let isNo = buttonId === "no" || isNegative(text, { allowCancel: true })

      if (!isYes && !isNo) {
        // A different date/time instead of yes/no ("actually Friday at 10") — move THIS reschedule there.
        const dateMatch = await resolveRescheduleDate(context, text, lang, draft, draft.selectedSlotIso)
        if (dateMatch) return dateMatch
        // "no, that's wrong" — a refusal with no new time attached.
        isNo = startsWithDecline(text)
      }

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

      // Staff may have cancelled/completed this visit while the patient was choosing a new time —
      // don't quietly revive it.
      const target = await appointmentRepository.findById(draft.targetAppointmentId)
      if (!target || !["scheduled", "confirmed"].includes(target.status)) {
        return {
          context: { ...context, state: ConversationState.AWAITING_MENU_SELECTION, activeFlow: FlowType.NONE, reschedule: undefined },
          reply: { text: t(lang, "reminderAppointmentGone") },
        }
      }

      let updated
      try {
        updated = await appointmentService.rescheduleAppointment(draft.targetAppointmentId, draft.selectedSlotIso)
      } catch (err) {
        // Someone else took that slot a moment ago (the DB's unique index is the final guard) —
        // re-offer fresh times instead of a generic "I didn't understand" error.
        if (err instanceof ConflictError) {
          const page = await promptForSlots(lang)
          const conflictReply: FlowReply = withNotice(page.reply, t(lang, "slotConflict"))
          if (page.slots.length === 0) {
            return {
              context: { ...context, state: ConversationState.AWAITING_MENU_SELECTION, activeFlow: FlowType.NONE, reschedule: undefined },
              reply: conflictReply,
            }
          }
          return {
            context: {
              ...context,
              state: ConversationState.AWAITING_RESCHEDULE_SLOT_SELECTION,
              reschedule: { ...draft, selectedSlotIso: undefined, ...page.draft },
            },
            reply: conflictReply,
          }
        }
        throw err
      }

      return {
        context: { ...context, state: ConversationState.AWAITING_MENU_SELECTION, activeFlow: FlowType.NONE, reschedule: undefined },
        reply: {
          text: t(lang, "rescheduleConfirmed", { date: formatClinicDate(updated.starts_at, lang), time: formatClinicTime(updated.starts_at) }),
        },
      }
    }

    default:
      return { context, reply: { text: t(lang, "genericFallback") } }
  }
}
