import "./env.js"
import { describe, it } from "node:test"
import assert from "node:assert/strict"
import { format } from "date-fns"
import { toZonedTime } from "date-fns-tz"
import type { Language } from "@clinic/shared"
import { extractBookingReason, parseBookingText } from "../src/lib/parseBookingRequest.js"
import { NOW } from "./harness.js"

// "Now" is Thursday 8 Oct 2026, 10:00 in Tijuana (see harness.ts).

type Expectation =
  | null
  | "asap"
  | { kind: "exact"; at: string }
  | { kind: "day_query"; day: string; timeOfDay?: "morning" | "afternoon" | "evening" }

function render(lang: Language, text: string): Expectation {
  const { request } = parseBookingText(text, lang, NOW)
  if (!request) return null
  if (request.kind === "asap") return "asap"
  const local = toZonedTime(request.date, "America/Tijuana")
  if (request.kind === "exact") return { kind: "exact", at: format(local, "yyyy-MM-dd HH:mm") }
  return { kind: "day_query", day: format(local, "yyyy-MM-dd"), ...(request.timeOfDay ? { timeOfDay: request.timeOfDay } : {}) }
}

const exact = (at: string): Expectation => ({ kind: "exact", at })
const day = (d: string, timeOfDay?: "morning" | "afternoon" | "evening"): Expectation => ({ kind: "day_query", day: d, ...(timeOfDay ? { timeOfDay } : {}) })

const CASES: Record<Language, [string, Expectation][]> = {
  en: [
    // The screenshot: "2 days after at 2 pm" was read as list option #2 (and chrono loses its time).
    ["2 days after at 2 pm", exact("2026-10-10 14:00")],
    ["2 days after at 2pm", exact("2026-10-10 14:00")],
    ["two days after at 2 pm", exact("2026-10-10 14:00")],
    ["2 days after", day("2026-10-10")],
    ["day after tomorrow at 2pm", exact("2026-10-10 14:00")],
    ["the day after tomorrow", day("2026-10-10")],
    ["in 2 days at 2 pm", exact("2026-10-10 14:00")],
    ["2 days from now at 2pm", exact("2026-10-10 14:00")],
    ["3 days later at 11", exact("2026-10-11 11:00")],
    ["a week from today", day("2026-10-15")],
    ["in 2 hours", exact("2026-10-08 12:00")],
    // Specific dates and times, every phrasing a patient plausibly types.
    ["tomorrow at 3pm", exact("2026-10-09 15:00")],
    ["tomorrow at 15:00", exact("2026-10-09 15:00")],
    ["10am tomorrow", exact("2026-10-09 10:00")],
    ["tomorrow", day("2026-10-09")],
    ["today at 5pm", exact("2026-10-08 17:00")],
    ["2 pm", exact("2026-10-08 14:00")],
    ["at 14:30", exact("2026-10-08 14:30")],
    ["next monday at 10am", exact("2026-10-12 10:00")],
    ["monday at 10", exact("2026-10-12 10:00")],
    ["2 pm on saturday", exact("2026-10-10 14:00")],
    ["friday", day("2026-10-09")],
    ["next week friday at 4", exact("2026-10-16 16:00")],
    ["october 12 at 2pm", exact("2026-10-12 14:00")],
    ["oct 9 at 9:30 am", exact("2026-10-09 09:30")],
    ["14th october 3 pm", exact("2026-10-14 15:00")],
    ["14/10 at 3pm", exact("2026-10-14 15:00")],
    // A bare day-of-month: "the 14th", "12th at 2pm" (was today at 2pm), "what's open on the 20th?" (was unparsed).
    ["12th at 2pm", exact("2026-10-12 14:00")],
    ["on the 12th at 2pm", exact("2026-10-12 14:00")],
    ["the 14th", day("2026-10-14")],
    ["what's open on the 20th?", day("2026-10-20")],
    ["the 31st", day("2026-10-31")],
    ["the 5th", day("2026-11-05")],
    ["the 8th at 3pm", exact("2026-10-08 15:00")],
    // Bare hours: the clinic is never open at 5 AM.
    ["at 5", exact("2026-10-08 17:00")],
    ["tomorrow at 2:30", exact("2026-10-09 14:30")],
    // Part of day.
    ["tomorrow morning", day("2026-10-09", "morning")],
    ["tomorrow afternoon", day("2026-10-09", "afternoon")],
    ["friday evening", day("2026-10-09", "evening")],
    ["tonight", day("2026-10-08", "evening")],
    // Urgency.
    ["asap", "asap"],
    ["earliest please", "asap"],
    ["first available", "asap"],
    ["it's urgent", "asap"],
    // NOT dates: symptom durations, ages and past days must never be mistaken for a booking request.
    ["fever for 2 days", null],
    ["she has had a cough for 3 days", null],
    ["my baby is 2 months old and has a fever", null],
    ["he's been sick since yesterday", null],
    ["since monday", null],
    ["yesterday at 2pm", null],
    ["Fever", null],
    ["fever", null],
    ["blue", null],
    ["14", null],
    // Still a date when a symptom phrase is mixed in.
    ["my son has a fever since yesterday, book tomorrow at 3pm", exact("2026-10-09 15:00")],
    ["fever for 3 days, tomorrow at 3pm", exact("2026-10-09 15:00")],
    // Daylight saving: the clinic's clocks fall back on 1 Nov 2026, so "now" (PDT) and Nov 2 (PST) have different UTC offsets.
    ["nov 2 at 4:30pm", exact("2026-11-02 16:30")],
    ["11/10 at 2pm", exact("2026-11-10 14:00")],
    ["this afternoon", day("2026-10-08", "afternoon")],
    ["this evening", day("2026-10-08", "evening")],
    ["tomorrow at noon", exact("2026-10-09 12:00")],
    ["right now", "asap"],
    ["TOMORROW AT 3PM", exact("2026-10-09 15:00")],
    ["tmrw 3pm", exact("2026-10-09 15:00")],
    ["3 pm tomorrow", exact("2026-10-09 15:00")],
    ["friday next week at 2", exact("2026-10-16 14:00")],
    ["in 2 weeks", day("2026-10-22")],
    ["in 1 hour", exact("2026-10-08 11:00")],
    // Spanish typed into an English chat.
    ["mañana a las 3 de la tarde", exact("2026-10-09 15:00")],
  ],
  es: [
    ["2 días después a las 2 pm", exact("2026-10-10 14:00")],
    ["dos días después a las 2 pm", exact("2026-10-10 14:00")],
    ["pasado mañana a las 2 pm", exact("2026-10-10 14:00")],
    ["pasado mañana", day("2026-10-10")],
    ["en 2 días a las 2 pm", exact("2026-10-10 14:00")],
    ["dentro de 2 días a las 2pm", exact("2026-10-10 14:00")],
    ["en dos días", day("2026-10-10")],
    ["en 3 días", day("2026-10-11")],
    ["mañana a las 3pm", exact("2026-10-09 15:00")],
    ["mañana a las 15:00", exact("2026-10-09 15:00")],
    ["mañana", day("2026-10-09")],
    ["hoy a las 5pm", exact("2026-10-08 17:00")],
    ["a las 2 pm", exact("2026-10-08 14:00")],
    ["a las 14:30", exact("2026-10-08 14:30")],
    ["a las 14 hrs", exact("2026-10-08 14:00")],
    ["el lunes a las 10", exact("2026-10-12 10:00")],
    ["el próximo lunes a las 10am", exact("2026-10-12 10:00")],
    ["este sábado a las 11", exact("2026-10-10 11:00")],
    ["viernes", day("2026-10-09")],
    ["el 12 de octubre a las 2pm", exact("2026-10-12 14:00")],
    ["12 de octubre 14:00", exact("2026-10-12 14:00")],
    ["14/10 a las 3 pm", exact("2026-10-14 15:00")],
    // "2 de la tarde" was read as 2 AM.
    ["el sábado a las 2 de la tarde", exact("2026-10-10 14:00")],
    ["mañana a las 2 de la tarde", exact("2026-10-09 14:00")],
    ["el viernes a las 4 de la tarde", exact("2026-10-09 16:00")],
    ["el 20 de octubre a las 10 de la mañana", exact("2026-10-20 10:00")],
    // A bare day number.
    ["el 14", day("2026-10-14")],
    ["el 14 a las 5", exact("2026-10-14 17:00")],
    ["dame cita el 9", day("2026-10-09")],
    ["qué hay disponible el 20?", day("2026-10-20")],
    ["la próxima semana", day("2026-10-15")],
    // Part of day ("mañana" means both tomorrow and morning).
    ["mañana por la tarde", day("2026-10-09", "afternoon")],
    ["el viernes por la mañana", day("2026-10-09", "morning")],
    ["esta noche", day("2026-10-08", "evening")],
    ["lo antes posible", "asap"],
    ["cuanto antes", "asap"],
    // Not dates.
    ["hace 2 días", null],
    ["fiebre desde hace 2 días", null],
    ["tengo fiebre desde hace 3 días", null],
    ["mi bebé tiene 3 meses y tiene fiebre", null],
    ["Fiebre", null],
    ["por la tarde", null],
    // With a reason mixed in.
    ["mi hijo tiene fiebre, quiero cita mañana a las 3", exact("2026-10-09 15:00")],
    ["hola quiero agendar una cita para mi hijo mañana a las 10", exact("2026-10-09 10:00")],
    // WhatsApp Spanish without accents: "manana" used to be ignored, booking TODAY.
    ["manana a las 3 pm", exact("2026-10-09 15:00")],
    ["pasado manana a las 2 de la tarde", exact("2026-10-10 14:00")],
    ["el sabado a las 11", exact("2026-10-10 11:00")],
    ["el miercoles a las 10", exact("2026-10-14 10:00")],
    // A weekday plus a day number is a DATE ("jueves 15"), not an hour.
    ["jueves 15", day("2026-10-15")],
    ["lunes 12", day("2026-10-12")],
    ["el lunes 12 a las 10 de la mañana", exact("2026-10-12 10:00")],
    ["el viernes 9 a las 4 de la tarde", exact("2026-10-09 16:00")],
    ["mañana al mediodía", exact("2026-10-09 12:00")],
    ["ahorita", "asap"],
    ["ahora mismo", "asap"],
    ["1 de noviembre a las 10", exact("2026-11-01 10:00")],
    ["2 de noviembre a las 4:30 pm", exact("2026-11-02 16:30")],
    ["dentro de 2 semanas", day("2026-10-22")],
    ["en una hora", exact("2026-10-08 11:00")],
    // English typed into a Spanish chat.
    ["tomorrow at 3pm", exact("2026-10-09 15:00")],
    ["2 days after at 2 pm", exact("2026-10-10 14:00")],
  ],
}

for (const lang of ["en", "es"] as const) {
  describe(`parseBookingText (${lang})`, () => {
    for (const [text, expected] of CASES[lang]) {
      it(`${JSON.stringify(text)}`, () => {
        assert.deepEqual(render(lang, text), expected)
      })
    }
  })
}

describe("extractBookingReason", () => {
  const cases: [string, string][] = [
    ["I have a fever, book me", "I have a fever"],
    ["book me", ""],
    ["I'd like to book an appointment", ""],
    ["my son has a fever since yesterday , book", "my son has a fever since yesterday"],
    ["hola quiero agendar una cita para mi hijo", ""],
    ["mi hijo tiene fiebre, quiero cita", "mi hijo tiene fiebre"],
    ["any time", ""],
    ["el", ""],
    ["a", ""],
    ["tos", "tos"],
    ["Fever", "Fever"],
    ["dame cita", ""],
    ["fever for 3 days,", "fever for 3 days"],
  ]
  for (const [input, expected] of cases) {
    it(`${JSON.stringify(input)} -> ${JSON.stringify(expected)}`, () => {
      assert.equal(extractBookingReason(input), expected)
    })
  }
})

describe("parseBookingText remainder", () => {
  it("keeps symptom durations in the reason while ignoring them as dates", () => {
    const { request, remainder } = parseBookingText("fever for 3 days, tomorrow at 3pm", "en", NOW)
    assert.equal(request?.kind, "exact")
    assert.equal(extractBookingReason(remainder), "fever for 3 days")
  })
  it("treats a day question as having no reason", () => {
    const { remainder } = parseBookingText("what's open on the 20th?", "en", NOW)
    assert.equal(extractBookingReason(remainder), "")
  })
})
