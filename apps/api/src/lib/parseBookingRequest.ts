import * as chrono from "chrono-node"
import { fromZonedTime, toZonedTime } from "date-fns-tz"
import { CLINIC_TIMEZONE, type Language } from "@clinic/shared"

export type TimeOfDay = "morning" | "afternoon" | "evening"

export type BookingRequest =
  | { kind: "asap" }
  | { kind: "exact"; date: Date; hasExplicitTime: boolean; hasExplicitDay: boolean }
  | { kind: "day_query"; date: Date; timeOfDay?: TimeOfDay }

/** `remainder` is the text left once the date/time phrase is taken out — what the patient said besides *when* (usually the reason for the visit). */
export type ParsedBookingText = { request: BookingRequest | null; remainder: string }

const ASAP_PATTERN =
  /\b(asap|as soon as possible|as early as possible|earliest|soonest|first available|next available|next opening|right away|immediately|urgent(?:ly)?|cuanto antes|lo antes posible|lo m[aá]s pronto|lo m[aá]s r[aá]pido|primer(?:a)? (?:horario|disponible|cita|espacio)|pr[oó]xim[oa] (?:horario|disponible)|de inmediato|inmediatamente|urgente|right now|just now|ahora mismo|ahorita)\b/i

const DAY_QUERY_PATTERN =
  /\b(?:what|which|any|is|are|do you have)\b[^.?!]{0,30}\b(?:available|availability|open(?:ings?)?|free|slots?|times?|appointments?)\b|\b(?:qu[eé]|hay|tienen|tienes)\b[^.?!]{0,30}\b(?:disponible|disponibles|disponibilidad|horarios?|espacios?|citas?|lugar)\b/i

const MONTHS_EN = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"]
const MONTHS_ES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"]
const WEEKDAYS = "monday|tuesday|wednesday|thursday|friday|saturday|sunday|lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado|domingo"

// Month words as they appear in free text — used only to decide whether a bare day number ("the 14th") already
// carries its month. "may" counts only before a number (it's also an everyday modal verb).
const MONTH_WORD = new RegExp(
  `\\b(?:${[...MONTHS_EN.filter((m) => m !== "may"), ...MONTHS_ES, "jan", "feb", "apr", "jun", "jul", "aug", "sep", "sept", "oct", "nov", "dec", "ene", "abr", "dic"].join("|")}|may(?=\\s*\\d))\\b`,
  "i",
)
const NUMERIC_DATE = /\b\d{1,2}[/.-]\d{1,2}(?:[/.-]\d{2,4})?\b/

const NUMBER_WORD_VALUE: Record<string, number> = {
  a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  un: 1, una: 1, uno: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10,
}
const NUMBER_WORD = Object.keys(NUMBER_WORD_VALUE).join("|")
const QTY = `(?:\\d+|${NUMBER_WORD}|couple of|few|several|unos|unas|par de|varios|algunos)`
const UNIT = "(?:minutes?|minutos?|hours?|horas?|days?|d[ií]as?|nights?|noches?|weeks?|semanas?|months?|meses|mes|years?|a[nñ]os?)"

/**
 * "How long they've been sick" reads like a date to chrono ("fever for 2 days" -> two days from now), which
 * hijacked the booking into a bogus day query. These phrases are masked out before date parsing and put back
 * into the leftover text, so they stay part of the reason.
 */
const SYMPTOM_DURATION_PATTERNS: RegExp[] = [
  new RegExp(`\\b(?:for|during|over)\\s+(?:the\\s+)?(?:(?:past|last)\\s+)?(?:${QTY}\\s*)?${UNIT}\\b`, "giu"),
  new RegExp(`\\b(?:in|over)\\s+the\\s+(?:past|last)\\s+(?:${QTY}\\s*)?${UNIT}\\b`, "giu"),
  new RegExp(`\\b(?:past|last)\\s+${QTY}\\s*${UNIT}\\b`, "giu"),
  new RegExp(`\\b${QTY}\\s*${UNIT}\\s+(?:ago|now)\\b`, "giu"),
  // A pediatric clinic hears ages constantly: "my baby is 2 months old", "tiene 3 años", "un bebé de 5 meses".
  new RegExp(`\\b${QTY}[\\s-]*${UNIT}[\\s-]*(?:old|of\\s+age)\\b`, "giu"),
  new RegExp(`\\b(?:tiene|tengo|tenemos|cumple|cumpli[oó]|con)\\s+${QTY}\\s*${UNIT}\\b`, "giu"),
  // "dentro de 2 semanas" is a request ("in 2 weeks"), so a bare "de" only counts as an age when it isn't part of that.
  new RegExp(`(?<!dentro\\s)\\b(?:de|con)\\s+${QTY}\\s*(?:meses|mes|a[nñ]os?|semanas?)\\b(?!\\s+(?:despu[eé]s|m[aá]s\\s+tarde))`, "giu"),
  new RegExp(`\\b${QTY}\\s*${UNIT}\\s+de\\s+(?:edad|vida|nacid[oa]|fiebre|tos|dolor|v[oó]mito|diarrea|malestar|s[ií]ntomas)\\b`, "giu"),
  new RegExp(`\\b(?:since|desde(?:\\s+(?:el|la|hace))?)\\s+(?:last\\s+|el\\s+|la\\s+|este\\s+)?[\\p{L}\\d]+(?:\\s+${UNIT})?`, "giu"),
  new RegExp(`\\b(?:hace|durante|por|llevo|lleva|llevamos|desde hace)\\s+(?:${QTY}\\s*)?${UNIT}\\b`, "giu"),
  new RegExp(`\\b(?:los|las)\\s+[uú]ltim[oa]s\\s+(?:${QTY}\\s*)?${UNIT}\\b`, "giu"),
  new RegExp(`\\b${QTY}\\s*${UNIT}\\s+atr[aá]s\\b`, "giu"),
]

const placeholderFor = (index: number) => `zzx${String.fromCharCode(97 + index)}x`

function maskSymptomDurations(text: string): { text: string; masked: string[] } {
  const masked: string[] = []
  let out = text
  for (const pattern of SYMPTOM_DURATION_PATTERNS) {
    out = out.replace(pattern, (match) => {
      if (masked.length >= 26) return match
      masked.push(match)
      return ` ${placeholderFor(masked.length - 1)} `
    })
  }
  return { text: out, masked }
}

function unmask(text: string, masked: string[]): string {
  return masked.reduce((acc, original, i) => acc.replaceAll(placeholderFor(i), original), text)
}

/** WhatsApp Spanish is often typed without accents ("manana a las 3"), but chrono only knows "mañana" — and silently ignores the unknown word, booking TODAY instead of tomorrow. */
function restoreSpanishAccents(text: string): string {
  return text
    .replace(/\bmanana\b/giu, "mañana")
    .replace(/\bmiercoles\b/giu, "miércoles")
    .replace(/\bsabado\b/giu, "sábado")
    .replace(/\bdias\b/giu, "días")
    .replace(/\bdia\b/giu, "día")
    .replace(/\bproxim([oa])\b/giu, "próxim$1")
    .replace(/\bdespues\b/giu, "después")
    .replace(/\bmediodia\b/giu, "mediodía")
}

/** "2 de la tarde" -> "2 pm", "10 de la mañana" -> "10 am". chrono's Spanish parser reads the bare "2" as 2 AM. */
function normalizeSpanishMeridiem(text: string): string {
  return text
    .replace(
      /(\d{1,2})(?::(\d{2}))?\s*(?:h|hs|hrs?|horas?)?\s+(?:de\s+la|del|de\s+el|en\s+la|por\s+la)\s+(ma[nñ]ana|madrugada|tarde|noche|mediod[ií]a)/giu,
      (_m, hour: string, minutes: string | undefined, part: string) => {
        const lower = part.toLowerCase()
        const suffix = lower.startsWith("ma") || lower === "madrugada" ? "am" : "pm"
        return `${hour}${minutes ? `:${minutes}` : ""} ${suffix}`
      },
    )
    .replace(/\b(?:a\s+las?|las?)\s+(\d{1,2})\s*(?:h|hs|hrs?|horas?)\b/giu, (_m, hour: string) => `a las ${hour}:00`)
    .replace(/\b(?:al\s+|a\s+)?mediod[ií]a\b/giu, "a las 12 pm")
}

function detectTimeOfDay(text: string): TimeOfDay | undefined {
  const lower = text.toLowerCase()
  if (/\b(?:tonight|this evening|esta noche|esta tarde-noche)\b|(?:por|en|de)\s+la\s+noche\b|\bevening\b/.test(lower)) return "evening"
  if (/\bafternoon\b|(?:por|en|de)\s+la\s+tarde\b|\besta\s+tarde\b/.test(lower)) return "afternoon"
  if (/\bmorning\b|(?:por|en|de)\s+la\s+ma[nñ]ana\b|\besta\s+ma[nñ]ana\b|\bmadrugada\b/.test(lower)) return "morning"
  return undefined
}

/**
 * Takes the time-of-day wording out of the text handed to chrono. In Spanish "mañana" is both "tomorrow" and
 * "morning", so "por la mañana" alone would otherwise be read as a request for tomorrow. The preference itself
 * is kept (see detectTimeOfDay) and applied later as a filter on the day's slots.
 */
function stripTimeOfDayWords(text: string): string {
  return text
    .replace(/\bthis\s+(?:morning|afternoon|evening)\b/giu, "today")
    .replace(/\b(?:in the |during the )?(?:morning|afternoon|evening)\b/giu, " ")
    .replace(/\b(?:por|en|de|durante)\s+la\s+(?:ma[nñ]ana|tarde|noche|madrugada)\b/giu, " ")
    .replace(/\s+/g, " ")
    .trim()
}

/** "in 2 days" / "en 2 días" — the form each chrono parser resolves reliably. `unit` is any en/es day/week/month word. */
function unitPhrase(value: number, unit: string, parserLang: Language): string {
  const u = unit.toLowerCase()
  const kind = u.startsWith("w") || u.startsWith("sem") ? "week" : u.startsWith("m") ? "month" : "day"
  const plural = value !== 1
  if (parserLang === "es") {
    const word = { day: plural ? "días" : "día", week: plural ? "semanas" : "semana", month: plural ? "meses" : "mes" }[kind]
    return `en ${value} ${word}`
  }
  return `in ${value} ${kind}${plural ? "s" : ""}`
}

/**
 * Phrasings chrono resolves wrongly or not at all, rewritten into ones it gets right:
 *  - "2 days after / later / from now" (es: "2 días después") -> "in 2 days". es "2 días después a las 2 pm" came
 *    back as TODAY at 2 pm, and "2 days after at 2 pm" lost its time.
 *  - "day after tomorrow" / "pasado mañana" -> "in 2 days" (chrono's "pasado mañana" is just tomorrow).
 *  - "next week friday" / "la próxima semana el viernes" -> "next friday".
 *  - "next week" alone -> "in 1 week" (es: previously unparsed).
 */
function rewriteRelativePhrases(text: string, parserLang: Language): string {
  let out = text
  out = out.replace(
    new RegExp(`\\b(${QTY})\\s*(days?|d[ií]as?|weeks?|semanas?|months?|meses|mes)\\s+(?:after|later|from\\s+now|from\\s+today|hence|despu[eé]s|m[aá]s\\s+tarde|luego|desde\\s+hoy|de\\s+hoy)\\b`, "giu"),
    (match, qty: string, unit: string) => {
      const value = /^\d+$/.test(qty) ? Number.parseInt(qty, 10) : NUMBER_WORD_VALUE[qty.toLowerCase()]
      return value ? unitPhrase(value, unit, parserLang) : match
    },
  )
  out = out.replace(/\b(?:the\s+)?day\s+after\s+tomorrow\b/giu, unitPhrase(2, "days", parserLang))
  out = out.replace(/\bpasado\s+ma[nñ]ana\b/giu, unitPhrase(2, "days", parserLang))
  out = out.replace(new RegExp(`\\bnext\\s+week\\s+(?:on\\s+)?(${WEEKDAYS})\\b`, "giu"), "next $1")
  out = out.replace(
    new RegExp(`\\b(?:(?:el\\s+)?(${WEEKDAYS})\\s+de\\s+la\\s+(?:pr[oó]xima|siguiente)\\s+semana|la\\s+(?:pr[oó]xima|siguiente)\\s+semana\\s+(?:el\\s+)?(${WEEKDAYS}))\\b`, "giu"),
    (_m, a: string | undefined, b: string | undefined) => `el próximo ${a ?? b}`,
  )
  return out.replace(
    /\b(?:la\s+)?(?:pr[oó]xima|siguiente)\s+semana\b|\bla\s+semana\s+(?:que\s+viene|pr[oó]xima)\b/giu,
    unitPhrase(1, "week", parserLang),
  )
}

/**
 * "the 14th" / "el 14" / "what's open on the 20th?" carry only a day number — chrono doesn't resolve those on
 * their own (and "12th at 2pm" came back as today). Spell the month out (the next one in which that day still
 * lies ahead) so chrono sees a complete date and keeps any time that follows.
 */
function addMonthToBareDayNumbers(input: string, parserLang: Language, today: Date): string {
  if (MONTH_WORD.test(input) || NUMERIC_DATE.test(input)) return input

  const notATime = "(?!\\s*(?::|h\\b|hs\\b|hrs?\\b|horas?\\b|[ap]\\.?\\s?m\\b|de\\s+la\\b|del\\b|o'clock))"

  // "jueves 15" / "el lunes 12" in Spanish name the DATE (chrono read them as 3 PM / 12 noon). The month is the first
  // upcoming one in which that day number really falls on that weekday.
  const weekdayIndex: Record<string, number> = { domingo: 0, lunes: 1, martes: 2, miercoles: 3, jueves: 4, viernes: 5, sabado: 6 }
  const text =
    parserLang !== "es"
      ? input
      : input.replace(
          new RegExp(`\\b(domingo|lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado)\\s+(?:el\\s+)?(\\d{1,2})\\b${notATime}`, "giu"),
          (match, weekday: string, dayText: string) => {
            const wanted = weekdayIndex[weekday.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")]
            const day = Number.parseInt(dayText, 10)
            const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate())
            for (let i = 0; i < 14; i++) {
              const first = new Date(today.getFullYear(), today.getMonth() + i, 1)
              const candidate = new Date(first.getFullYear(), first.getMonth(), day)
              if (candidate.getMonth() === first.getMonth() && candidate >= startOfToday && candidate.getDay() === wanted) {
                return `${weekday} ${day} de ${MONTHS_ES[first.getMonth()]}`
              }
            }
            return match
          },
        )
  if (MONTH_WORD.test(text)) return text

  const resolve = (dayText: string): string | null => {
    const day = Number.parseInt(dayText, 10)
    if (!(day >= 1 && day <= 31)) return null
    for (let i = 0; i < 12; i++) {
      const first = new Date(today.getFullYear(), today.getMonth() + i, 1)
      const daysInMonth = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate()
      if (day > daysInMonth || (i === 0 && day < today.getDate())) continue
      return parserLang === "es" ? `${day} de ${MONTHS_ES[first.getMonth()]}` : `${MONTHS_EN[first.getMonth()]} ${day}`
    }
    return null
  }

  return text
    .replace(new RegExp(`\\b(?:on\\s+)?(?:the\\s+)?(\\d{1,2})(?:st|nd|rd|th)\\b`, "giu"), (match, d: string) => resolve(d) ?? match)
    .replace(new RegExp(`\\bon\\s+the\\s+(\\d{1,2})\\b${notATime}`, "giu"), (match, d: string) => resolve(d) ?? match)
    .replace(new RegExp(`\\b(?:el\\s+d[ií]a|el|d[ií]a)\\s+(\\d{1,2})\\b${notATime}`, "giu"), (match, d: string) => resolve(d) ?? match)
}

function prepare(text: string, parserLang: Language, today: Date): { text: string; masked: string[]; timeOfDay: TimeOfDay | undefined } {
  const relative = rewriteRelativePhrases(restoreSpanishAccents(text), parserLang)
  const { text: unmasked, masked } = maskSymptomDurations(relative)
  const meridiem = normalizeSpanishMeridiem(unmasked)
  const timeOfDay = detectTimeOfDay(meridiem)
  const prepared = addMonthToBareDayNumbers(stripTimeOfDayWords(meridiem), parserLang, today)
  return { text: prepared, masked, timeOfDay }
}

/** `request` is null when the text named a day that has already passed — that still counts as the best reading of the message, so the other language's parser can't override it with a worse one. */
type Attempt = { request: BookingRequest | null; remainder: string; matchedLength: number }

/** Same calendar day or later, in the clinic's timezone — a request for a day that's already gone isn't a booking request. */
function isTodayOrLater(date: Date, now: Date): boolean {
  const day = toZonedTime(date, CLINIC_TIMEZONE)
  const today = toZonedTime(now, CLINIC_TIMEZONE)
  const key = (d: Date) => d.getFullYear() * 10_000 + d.getMonth() * 100 + d.getDate()
  return key(day) >= key(today)
}

const pad2 = (n: number) => String(n).padStart(2, "0")

/**
 * chrono is run on the clinic's WALL-CLOCK timeline: it's handed the clinic's current local time written out as if it
 * were UTC, and told the zone is UTC, so every date it returns carries the wall-clock time the patient meant in its
 * UTC fields. `wallClockToInstant` then turns that into the real instant using the clinic's zone rules *for that date*.
 * (Passing chrono today's UTC offset instead put every request after a daylight-saving change one hour off —
 * "Nov 2 at 4:30pm" came back as 3:30 PM once the clinic clocks fell back on Nov 1.)
 */
function instantAsWallClock(real: Date): Date {
  const w = toZonedTime(real, CLINIC_TIMEZONE)
  return new Date(Date.UTC(w.getFullYear(), w.getMonth(), w.getDate(), w.getHours(), w.getMinutes(), w.getSeconds()))
}

function wallClockToInstant(wall: Date): Date {
  const iso = `${wall.getUTCFullYear()}-${pad2(wall.getUTCMonth() + 1)}-${pad2(wall.getUTCDate())}T${pad2(wall.getUTCHours())}:${pad2(wall.getUTCMinutes())}:${pad2(wall.getUTCSeconds())}`
  return fromZonedTime(iso, CLINIC_TIMEZONE)
}

function attempt(text: string, parserLang: Language, referenceDate: Date): Attempt | null {
  const today = toZonedTime(referenceDate, CLINIC_TIMEZONE)
  const { text: prepared, masked, timeOfDay } = prepare(text, parserLang, today)

  const wallNow = instantAsWallClock(referenceDate)
  const parser = parserLang === "es" ? chrono.es : chrono.en
  const results = parser.parse(prepared, { instant: wallNow, timezone: 0 }, { forwardDate: true })
  // The longest match is the one that actually captured the date — a stray early token ("2" in "I have 2 kids") shouldn't win.
  const result = results.reduce<(typeof results)[number] | undefined>((best, r) => (!best || r.text.length > best.text.length ? r : best), undefined)
  if (!result) return null

  let wall = result.start.date()
  const hasExplicitTime = result.start.isCertain("hour")
  const dayNamed = result.start.isCertain("day") || result.start.isCertain("weekday") || result.start.isCertain("month")

  // The clinic is never open at 2 AM, so a bare hour 1-6 ("at 5", "a las 2:30") means the afternoon.
  if (hasExplicitTime && !result.start.isCertain("meridiem")) {
    const hour = result.start.get("hour")
    if (hour !== null && hour >= 1 && hour <= 6) {
      const HALF_DAY_MS = 12 * 60 * 60_000
      wall = new Date(wall.getTime() + HALF_DAY_MS)
      // With no day named, chrono may have rolled "5" to tomorrow only because 5 AM today is already past —
      // 5 PM today is still ahead, and that's what the patient meant.
      const sameTimeToday = new Date(wall.getTime() - 2 * HALF_DAY_MS)
      if (!dayNamed && sameTimeToday.getTime() > wallNow.getTime()) wall = sameTimeToday
    }
  }
  const date = wallClockToInstant(wall)

  const leftover = unmask(`${prepared.slice(0, result.index)} ${prepared.slice(result.index + result.text.length)}`, masked)
    .replace(/\s+([,.;:!?])/g, "$1")
    .replace(/\s+/g, " ")
    .trim()

  if (!isTodayOrLater(date, referenceDate)) return { request: null, remainder: leftover, matchedLength: result.text.length }

  // "What's open on the 20th?" is a question about availability, not a reason for the visit.
  const isDayQuery = DAY_QUERY_PATTERN.test(text)
  const request: BookingRequest =
    isDayQuery || !hasExplicitTime
      ? { kind: "day_query", date, ...(timeOfDay ? { timeOfDay } : {}) }
      : { kind: "exact", date, hasExplicitTime: true, hasExplicitDay: dayNamed }
  return { request, remainder: isDayQuery ? "" : leftover, matchedLength: result.text.length }
}

/**
 * Deterministic natural-language date/time extraction — never decides
 * anything by itself, just turns free text into a request that the caller
 * checks against real availability via appointmentService. Returns
 * `request: null` when the text doesn't look like a date/time/booking-urgency
 * request at all.
 *
 * Understands English and Spanish regardless of the conversation's language
 * (patients mix them — "tomorrow at 3pm" in a Spanish chat): both parsers run
 * and the one that explains more of the message wins, ties going to `lang`.
 *
 * `referenceDate` must be the real current instant (not a timezone-shifted
 * "fake local" Date) — clinic-local interpretation of the parsed text is
 * handled by passing chrono a numeric UTC offset for CLINIC_TIMEZONE (chrono's
 * `timezone` reference option only accepts a minute offset or a known
 * abbreviation, not an IANA zone name), so "5pm" always means 5pm in Tijuana
 * regardless of the server's own timezone/DST state.
 */
export function parseBookingText(text: string, lang: Language, referenceDate: Date): ParsedBookingText {
  const normalized = text.trim()
  if (!normalized) return { request: null, remainder: "" }

  if (ASAP_PATTERN.test(normalized)) {
    return { request: { kind: "asap" }, remainder: normalized.replace(ASAP_PATTERN, " ").replace(/\s+/g, " ").trim() }
  }

  const other: Language = lang === "es" ? "en" : "es"
  const primary = attempt(normalized, lang, referenceDate)
  const secondary = attempt(normalized, other, referenceDate)
  const best = secondary && (!primary || secondary.matchedLength > primary.matchedLength) ? secondary : primary
  if (!best || !best.request) return { request: null, remainder: normalized }
  return { request: best.request, remainder: best.remainder }
}

export function parseBookingRequest(text: string, lang: Language, referenceDate: Date): BookingRequest | null {
  return parseBookingText(text, lang, referenceDate).request
}

/**
 * A time with no day ("actually 4pm", "mejor a las 4") means the day the patient is already looking at — the
 * slot they're confirming, or the day whose times were just listed — not "today", which is all a bare time
 * resolves to on its own. Requests that do name a day (or aren't an exact time) pass through untouched.
 */
export function anchorToDay(request: BookingRequest, anchorIso: string | undefined): BookingRequest {
  if (!anchorIso || request.kind !== "exact" || request.hasExplicitDay) return request
  const time = toZonedTime(request.date, CLINIC_TIMEZONE)
  const anchorDay = toZonedTime(new Date(anchorIso), CLINIC_TIMEZONE)
  const iso = `${anchorDay.getFullYear()}-${pad2(anchorDay.getMonth() + 1)}-${pad2(anchorDay.getDate())}T${pad2(time.getHours())}:${pad2(time.getMinutes())}:00`
  return { ...request, date: fromZonedTime(iso, CLINIC_TIMEZONE) }
}

// Booking boilerplate around the real content: "I'd like to book an appointment for my son, he has a fever" -> "he has a fever".
const REASON_FILLER: RegExp[] = [
  /\b(?:hi|hello|hey|hola|buenos d[ií]as|buenas tardes|buenas noches)\b/giu,
  /\b(?:can|could|may)\s+(?:i|we|you)\s+(?:please\s+)?(?:get|have|book|make|schedule|set up|come(?:\s+in)?|stop by|drop by|be seen)?/giu,
  /\b(?:i|we)(?:'d|\s+would)?\s+(?:like|want|need|wanna)(?:\s+to)?/giu,
  /\b(?:book|schedule|make|set up|get|reserve)(?:\s+(?:me|us|him|her|them))?(?:\s+(?:an?|the|my))?(?:\s+(?:appointment|appt|visit|consultation|check-?up))?\b/giu,
  /\b(?:an?\s+)?(?:appointment|appt|visit|consultation|check-?up)\b/giu,
  /\bfor\s+my\s+(?:son|daughter|baby|kid|child|boy|girl|toddler|little one)\b/giu,
  /\b(?:puedo|podr[ií]a|podemos)\s+(?:ir|pasar|venir|visitar)\b/giu,
  /\b(?:quiero|quisiera|necesito|me gustar[ií]a|quer[ií]a|deseo|puedo|podr[ií]a|d[aá]me|me\s+(?:das|dan|puedes\s+dar|podr[ií]as\s+dar))\b/giu,
  /\b(?:any\s*time|some\s*time|cualquier\s+hora)\b/giu,
  /\b(?:agendar|ag[eé]ndame|agendame|reservar|programar|sacar|hacer|pedir|apartar)(?:\s+(?:me|una|un|la|mi|el))*(?:\s+(?:cita|consulta|turno))?\b/giu,
  /\b(?:una\s+|la\s+)?(?:cita|consulta|turno)\b/giu,
  /\bpara\s+mi\s+(?:hij[oa]|beb[eé]|ni[ñn][oa]|bebito|chiquit[oa])\b/giu,
  /\b(?:please|pls|thanks|thank you|por favor|porfa|gracias)\b/giu,
]
const DANGLING_CONNECTORS = /^(?:(?:for|on|at|to|the|and|then|para|el|la|a las?|de|y|que|pero|but)\b[\s,.;:!?-]*)+|(?:[\s,.;:!?-]*\b(?:for|on|at|to|the|and|then|para|el|la|a las?|de|y|que|pero|but))+$/giu

/** What's left of a booking message after the date and the boilerplate — the patient's own words about why they're coming, or "" when there are none. */
export function extractBookingReason(remainder: string): string {
  let out = remainder
  for (const pattern of REASON_FILLER) out = out.replace(pattern, " ")
  out = out.replace(/\s+/g, " ").trim()
  out = out.replace(/^[\s,.;:!?¡¿-]+|[\s,.;:!?¡¿-]+$/g, "")
  out = out.replace(DANGLING_CONNECTORS, "").replace(/^[\s,.;:!?¡¿-]+|[\s,.;:!?¡¿-]+$/g, "").trim()
  return (out.match(/\p{L}/gu) ?? []).length >= 3 ? out : ""
}
