import * as chrono from "chrono-node"
import { getTimezoneOffset } from "date-fns-tz"
import { CLINIC_TIMEZONE, type Language } from "@clinic/shared"

export type BookingRequest =
  | { kind: "asap" }
  | { kind: "exact"; date: Date; hasExplicitTime: boolean }
  | { kind: "day_query"; date: Date }

const ASAP_PATTERN = /\b(asap|as soon as possible|cuanto antes|lo antes posible|lo m[aá]s pronto posible|urgent(e)?)\b/i
const DAY_QUERY_PATTERN =
  /\b(what|which)\b.{0,15}\b(available|open|free|slots?)\b|\b(qu[eé])\b.{0,15}\b(disponible|horarios?|hay)\b/i

/**
 * Deterministic natural-language date/time extraction — never decides
 * anything by itself, just turns free text into a request that the caller
 * checks against real availability via appointmentService. Returns null when
 * the text doesn't look like a date/time/booking-urgency request at all.
 *
 * `referenceDate` must be the real current instant (not a timezone-shifted
 * "fake local" Date) — clinic-local interpretation of the parsed text is
 * handled by passing chrono a numeric UTC offset for CLINIC_TIMEZONE (chrono's
 * `timezone` reference option only accepts a minute offset or a known
 * abbreviation, not an IANA zone name), so "5pm" always means 5pm in Tijuana
 * regardless of the server's own timezone/DST state.
 */
export function parseBookingRequest(text: string, lang: Language, referenceDate: Date): BookingRequest | null {
  const normalized = text.trim()
  if (!normalized) return null

  if (ASAP_PATTERN.test(normalized)) {
    return { kind: "asap" }
  }

  const clinicOffsetMinutes = getTimezoneOffset(CLINIC_TIMEZONE, referenceDate) / 60_000
  const parser = lang === "es" ? chrono.es : chrono.en
  const results = parser.parse(normalized, { instant: referenceDate, timezone: clinicOffsetMinutes }, { forwardDate: true })
  const result = results[0]
  if (!result) return null

  const date = result.start.date()
  const hasExplicitTime = result.start.isCertain("hour")
  const isDayQuery = DAY_QUERY_PATTERN.test(normalized)

  if (isDayQuery || !hasExplicitTime) {
    return { kind: "day_query", date }
  }
  return { kind: "exact", date, hasExplicitTime: true }
}
