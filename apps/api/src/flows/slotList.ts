import { addDays } from "date-fns"
import { BOOKING_HORIZON_DAYS, t, type CachedSlot, type Language } from "@clinic/shared"
import { appointmentService, filterByTimeOfDay, type AvailableSlot } from "../services/appointmentService.js"
import type { BookingRequest } from "../lib/parseBookingRequest.js"
import { formatClinicDate, formatClinicSlotLabel } from "../lib/dateFormat.js"
import { backToMenuButton } from "./backToMenuButton.js"
import type { FlowReply } from "./types.js"

/** Slot-list building shared by the booking and reschedule flows, so both page, label and match typed requests identically. */

// 8, not 9, to leave room in WhatsApp's 10-row cap for the trailing "See more" and "Back to menu"
// rows a page can carry alongside the slots themselves. Any list longer than this MUST be paged —
// a day has ~16 half-hour slots, and WhatsApp rejects an interactive list over 10 rows outright.
export const SLOTS_PER_PAGE = 8

type MoreKey = "moreDatesButton" | "moreTimesButton"

/** Each slot becomes a tappable WhatsApp list row (title = the slot's date/time in the patient's language) — one tap selects it, though a typed number still works. */
export function buildSlotListReply(lang: Language, slots: AvailableSlot[], hasMore: boolean, moreKey: MoreKey = "moreDatesButton"): FlowReply {
  if (slots.length === 0) return { text: t(lang, "noSlotsAvailable") }
  const rows = slots.map((s, i) => ({ id: String(i + 1), title: formatClinicSlotLabel(s.startsAtIso, lang) }))
  if (hasMore) rows.push({ id: "more_slots", title: t(lang, moreKey) })
  rows.push(backToMenuButton(lang))
  return {
    text: t(lang, "chooseSlotPrompt"),
    list: { buttonLabel: t(lang, "viewTimesButton"), rows },
  }
}

/** The draft fields that describe the slots currently on screen. Always sets all three — a stale `slotPool` left over from an earlier list would make "See more" page the wrong thing. */
export function slotDraftFields(slots: CachedSlot[], offset: number, pool?: CachedSlot[]): { cachedSlots: CachedSlot[]; slotOffset: number; slotPool: CachedSlot[] | undefined } {
  return { cachedSlots: slots, slotOffset: offset + slots.length, slotPool: pool }
}

export type SlotPage = {
  slots: AvailableSlot[]
  hasMore: boolean
  reply: FlowReply
  /** Spread into the booking/reschedule draft. */
  draft: ReturnType<typeof slotDraftFields>
}

/** Fetches one page of general availability starting at `offset`. Requests one extra slot beyond the page size just to detect whether a further page exists, for the trailing "See more dates" row. */
export async function promptForSlots(lang: Language, offset = 0): Promise<SlotPage> {
  const fetched = await appointmentService.getAvailableSlots(BOOKING_HORIZON_DAYS, SLOTS_PER_PAGE + 1, offset)
  const hasMore = fetched.length > SLOTS_PER_PAGE
  const slots = fetched.slice(0, SLOTS_PER_PAGE)
  return { slots, hasMore, reply: buildSlotListReply(lang, slots, hasMore), draft: slotDraftFields(slots, offset) }
}

/** One list page out of a fixed pool (a specific day's slots) — "See more times" continues from `offset`. Pages are shown in chronological order even when the pool is ranked by closeness. */
export function pageOfPool(lang: Language, pool: AvailableSlot[], offset = 0): SlotPage {
  const slots = pool.slice(offset, offset + SLOTS_PER_PAGE).sort((a, b) => a.startsAtIso.localeCompare(b.startsAtIso))
  const hasMore = pool.length > offset + SLOTS_PER_PAGE
  return {
    slots,
    hasMore,
    reply: buildSlotListReply(lang, slots, hasMore, "moreTimesButton"),
    draft: slotDraftFields(slots, offset, hasMore ? pool : undefined),
  }
}

/** Rebuilds the list the patient is currently looking at (after an invalid reply, or once a new patient has given their name) — including its trailing "See more" row. */
export function relistCachedSlots(lang: Language, cached: CachedSlot[], offset: number | undefined, pool?: CachedSlot[]): FlowReply {
  if (pool) return buildSlotListReply(lang, cached, (offset ?? 0) < pool.length, "moreTimesButton")
  // A full page of general availability almost certainly has more behind it.
  return buildSlotListReply(lang, cached, cached.length >= SLOTS_PER_PAGE)
}

/** When every slot on screen falls on one clinic day (a "what's open Friday?" list), that day — so a bare "3pm" typed next means Friday 3pm. A list spanning several days has no single day to anchor to. */
export function sameDayAnchor(slots: CachedSlot[]): string | undefined {
  const first = slots[0]
  if (!first) return undefined
  const dayOf = (iso: string) => formatClinicDate(iso, "en")
  return slots.every((s) => dayOf(s.startsAtIso) === dayOf(first.startsAtIso)) ? first.startsAtIso : undefined
}

/** Puts a one-line explanation ("that day isn't available…") above a reply's text. */
export function withNotice(reply: FlowReply, notice: string): FlowReply {
  return { ...reply, text: `${notice}\n\n${reply.text ?? ""}`.trimEnd() }
}

export type SlotMatch = {
  /** Slots answering the request, best first. A single entry means "this is it" — go straight to confirmation. */
  pool: AvailableSlot[]
  /** An exact time was asked for but isn't open; `pool` holds the day's closest alternatives instead. */
  exactTimeMissed: boolean
}

const EXACT_MATCH_TOLERANCE_MS = 60_000

/**
 * Resolves a parsed free-text request against REAL availability. An open exact time narrows to that one
 * slot; a taken/off-grid exact time yields the day's slots nearest to it; a bare day (optionally
 * "morning"/"afternoon"/"evening") yields that day's slots; "asap" yields the single earliest slot.
 */
export async function findSlotsForRequest(parsed: BookingRequest): Promise<SlotMatch> {
  if (parsed.kind === "asap") {
    return { pool: await appointmentService.getAvailableSlots(BOOKING_HORIZON_DAYS, 1, 0), exactTimeMissed: false }
  }

  // The clinic only books BOOKING_HORIZON_DAYS ahead ("next year" / "Dec 25" used to be offered as if open).
  if (parsed.date.getTime() > addDays(new Date(), BOOKING_HORIZON_DAYS + 1).getTime()) {
    return { pool: [], exactTimeMissed: false }
  }

  const day = await appointmentService.getSlotsOnDate(parsed.date)

  if (parsed.kind === "exact") {
    const exact = day.find((s) => Math.abs(new Date(s.startsAtIso).getTime() - parsed.date.getTime()) < EXACT_MATCH_TOLERANCE_MS)
    if (exact) return { pool: [exact], exactTimeMissed: false }
    const target = parsed.date.getTime()
    const byCloseness = [...day].sort(
      (a, b) => Math.abs(new Date(a.startsAtIso).getTime() - target) - Math.abs(new Date(b.startsAtIso).getTime() - target),
    )
    return { pool: byCloseness, exactTimeMissed: day.length > 0 }
  }

  // "tomorrow afternoon" — but if that part of the day is full, the rest of the day beats an empty answer.
  const preferred = parsed.timeOfDay ? filterByTimeOfDay(day, parsed.timeOfDay) : day
  return { pool: preferred.length > 0 ? preferred : day, exactTimeMissed: false }
}
