import { format } from "date-fns"
import { toZonedTime } from "date-fns-tz"
import {
  BOOKING_HORIZON_DAYS,
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
import { appointmentService, type AvailableSlot } from "../services/appointmentService.js"
import { appointmentRepository } from "../repositories/appointmentRepository.js"
import { tryAnswerOffScript } from "../lib/offScript.js"
import { startBookingFromFreeText } from "./bookAppointmentFlow.js"
import { enterCancelFlow } from "./cancelFlow.js"
import { openaiService } from "../services/openaiService.js"
import { backToMenuButton } from "./backToMenuButton.js"

// 8, not 9, to leave room in WhatsApp's 10-row cap for the trailing "See more dates"
// and "Back to menu" rows a page can carry alongside the slots themselves.
const SLOTS_PER_PAGE = 8

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

/** Each slot becomes a tappable WhatsApp list row; a trailing "See more dates" row (when `hasMore`) and a "Back to menu" row both fit within WhatsApp's 10-row cap since a page is 8 slots. */
function buildSlotListReply(lang: Language, slots: AvailableSlot[], hasMore: boolean): FlowReply {
  if (slots.length === 0) return { text: t(lang, "noSlotsAvailable") }
  const rows = slots.map((s, i) => ({ id: String(i + 1), title: s.label }))
  if (hasMore) rows.push({ id: "more_slots", title: t(lang, "moreDatesButton") })
  rows.push(backToMenuButton(lang))
  return {
    text: t(lang, "chooseSlotPrompt"),
    list: { buttonLabel: t(lang, "viewTimesButton"), rows },
  }
}

/** Fetches one page of slots starting at `offset`. Requests one extra slot beyond the page size just to detect whether a further page exists, for the trailing "See more dates" row. */
async function promptForSlots(lang: Language, offset = 0): Promise<{ slots: AvailableSlot[]; hasMore: boolean; reply: FlowReply }> {
  const fetched = await appointmentService.getAvailableSlots(BOOKING_HORIZON_DAYS, SLOTS_PER_PAGE + 1, offset)
  const hasMore = fetched.length > SLOTS_PER_PAGE
  const slots = fetched.slice(0, SLOTS_PER_PAGE)
  return { slots, hasMore, reply: buildSlotListReply(lang, slots, hasMore) }
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

  const { slots, reply } = await promptForSlots(lang)

  if (slots.length === 0) {
    return { context: { ...context, state: ConversationState.AWAITING_MENU_SELECTION, activeFlow: FlowType.NONE }, reply }
  }

  return {
    context: {
      ...context,
      state: ConversationState.AWAITING_RESCHEDULE_SLOT_SELECTION,
      activeFlow: FlowType.RESCHEDULE,
      reschedule: { targetAppointmentId: appointmentId, cachedSlots: slots, slotOffset: slots.length },
    },
    reply,
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
        const restated = await tryRestateIntent(text, context, lang, settings)
        if (restated) return restated

        const offScript = await tryAnswerOffScript(text, lang, settings)
        if (offScript) {
          const listReply = appointmentListReply(lang, "chooseAppointmentToReschedule", options)
          return { context, reply: { ...listReply, text: `${offScript.text}\n\n${listReply.text}` } }
        }
        return { context, reply: { text: t(lang, "appointmentSelectionInvalid") } }
      }

      const { slots, hasMore, reply } = await promptForSlots(lang)
      if (slots.length === 0) {
        return {
          context: { ...context, state: ConversationState.AWAITING_MENU_SELECTION, activeFlow: FlowType.NONE },
          reply,
        }
      }

      return {
        context: {
          ...context,
          state: ConversationState.AWAITING_RESCHEDULE_SLOT_SELECTION,
          reschedule: { ...draft, targetAppointmentId: chosen.appointmentId, cachedSlots: slots, slotOffset: slots.length },
        },
        reply,
      }
    }

    case ConversationState.AWAITING_RESCHEDULE_SLOT_SELECTION: {
      // "See more dates" pages forward from where the last batch left off, replacing
      // cachedSlots/slotOffset with the new page — each page renumbers from 1.
      if ((buttonId ?? text).trim() === "more_slots") {
        const offset = draft.slotOffset ?? draft.cachedSlots?.length ?? 0
        const { slots: nextSlots, reply } = await promptForSlots(lang, offset)
        if (nextSlots.length === 0) {
          return {
            context: { ...context, state: ConversationState.AWAITING_MENU_SELECTION, activeFlow: FlowType.NONE },
            reply,
          }
        }
        return {
          context: { ...context, reschedule: { ...draft, cachedSlots: nextSlots, slotOffset: offset + nextSlots.length } },
          reply,
        }
      }

      const slots = draft.cachedSlots ?? []
      const index = Number.parseInt((buttonId ?? text).trim(), 10) - 1
      const slot = slots[index]
      if (!slot) {
        const restated = await tryRestateIntent(text, context, lang, settings)
        if (restated) return restated

        const offScript = await tryAnswerOffScript(text, lang, settings)
        if (offScript) {
          const listReply = buildSlotListReply(lang, slots, false)
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
            backToMenuButton(lang),
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
