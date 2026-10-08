import "./env.js"
import { afterEach, beforeEach, describe, it } from "node:test"
import assert from "node:assert/strict"
import { ConversationState } from "@clinic/shared"
import { Chat, FakeClinic, freezeClock, PHONE, unfreezeClock } from "./harness.js"

/**
 * QA scenarios for the WhatsApp booking / reschedule / cancel conversations, played as a patient would,
 * in both languages. "Now" is Thursday 8 Oct 2026, 10:00 Tijuana; the clinic is open Mon-Fri 9-6 with a
 * 1-2pm break, closed Sat/Sun (so Fri 9 Oct has 16 open half-hour slots).
 */

type Lang = "en" | "es"
const LANGS: Lang[] = ["en", "es"]

/** Everything language-specific the scenarios type or expect. */
const S = {
  en: {
    fever: "Fever",
    sameWord: "same",
    twoDaysAfter: "2 days after at 2 pm",
    tomorrow3pm: "tomorrow at 3pm",
    tomorrow: "tomorrow",
    friday: "friday",
    friday3pm: "friday at 3pm",
    friday10: "friday at 10",
    mon10: "monday at 10am",
    actually4pm: "actually 4pm",
    noFriday10: "no, friday at 10",
    tomorrowAfternoon: "tomorrow afternoon",
    tomorrowMorning: "tomorrow morning",
    twoPm: "2 pm",
    satAt2: "book me saturday at 2pm",
    bookTomorrow3: "book me tomorrow at 3pm",
    feverWhen: "fever, tomorrow at 3pm",
    feverWhenReason: "fever",
    feverDuration: "fever for 3 days",
    feverDurationMenu: "my son has had a fever for 3 days",
    babyAge: "my baby is 2 months old, needs vaccines",
    yes: ["yes", "yes please", "ok", "sure", "Yes!"],
    no: ["no", "no thanks", "nope"],
    optionTwo: ["2", "#2", "option 2", "two", "2."],
    blue: "blue",
    optionTexts: { invalid: /not a valid option/i, unavailableDay: /don't have any open slots that day/i, unavailableTime: /exact time isn't available/i },
    fridayLabel: /Friday 9 October/,
    mondayLabel: /Monday 12 October/,
    thuRow: /^Thu 8 Oct/,
    moreTimes: "See more times",
    confirmHeader: /Please confirm your appointment/,
    booked: /Your appointment is confirmed/,
    cancelledMsg: /wasn't booked/,
    name: "Maria Lopez",
    yesButton: "Yes",
    lastReasonLine: /Sick/,
    ageReasonCheck: /2 months old/,
  },
  es: {
    fever: "Fiebre",
    sameWord: "igual",
    twoDaysAfter: "2 días después a las 2 pm",
    tomorrow3pm: "mañana a las 3 de la tarde",
    tomorrow: "mañana",
    friday: "el viernes",
    friday3pm: "el viernes a las 3 de la tarde",
    friday10: "el viernes a las 10 de la mañana",
    mon10: "el lunes a las 10",
    actually4pm: "mejor a las 4 de la tarde",
    noFriday10: "no, el viernes a las 10 de la mañana",
    tomorrowAfternoon: "mañana por la tarde",
    tomorrowMorning: "mañana por la mañana",
    twoPm: "a las 2 pm",
    satAt2: "agéndame el sábado a las 2 de la tarde",
    bookTomorrow3: "quiero una cita mañana a las 3 de la tarde",
    feverWhen: "tos, mañana a las 3 de la tarde",
    feverWhenReason: "tos",
    feverDuration: "fiebre desde hace 3 días",
    feverDurationMenu: "mi hijo tiene fiebre desde hace 3 días",
    babyAge: "mi bebé tiene 2 meses, necesita vacunas",
    yes: ["sí", "si por favor", "dale", "claro", "SÍ!"],
    no: ["no", "no gracias", "mejor no"],
    optionTwo: ["2", "#2", "opción 2", "dos", "2."],
    blue: "azul",
    optionTexts: { invalid: /no es válida/i, unavailableDay: /No tenemos horarios disponibles ese día/i, unavailableTime: /horario exacto no está disponible/i },
    fridayLabel: /viernes 9 de octubre/,
    mondayLabel: /lunes 12 de octubre/,
    thuRow: /^jue 8 oct/,
    moreTimes: "Ver más horarios",
    confirmHeader: /Confirma tu cita/,
    booked: /Tu cita ha sido confirmada/,
    cancelledMsg: /no se agendó la cita/,
    name: "María López",
    yesButton: "Sí",
    lastReasonLine: /Sick/,
    ageReasonCheck: /2 meses/,
  },
} as const

const clinic = new FakeClinic()

beforeEach(() => {
  freezeClock()
  clinic.install()
})
afterEach(() => unfreezeClock())

/** A returning patient whose last visit was for "Sick" — the patient in the bug report's screenshot. */
async function returningPatientAtReasonPrompt(lang: Lang): Promise<Chat> {
  const patient = clinic.addPatient("Ashutosh Singh", PHONE, lang)
  clinic.addAppointment(patient.id, "2026-09-18T20:00:00Z", "Sick", "completed")
  const chat = new Chat(lang)
  await chat.tap("book", "Book")
  assert.equal(chat.state, ConversationState.AWAITING_RETURNING_PATIENT_CONFIRMATION)
  await chat.tap("yes", S[lang].yesButton)
  assert.equal(chat.state, ConversationState.AWAITING_REASON)
  return chat
}

async function returningPatientAtSlotList(lang: Lang, reason = S[lang].fever): Promise<Chat> {
  const chat = await returningPatientAtReasonPrompt(lang)
  await chat.say(reason)
  assert.equal(chat.state, ConversationState.AWAITING_SLOT_SELECTION)
  return chat
}

function bookedAppointments() {
  return clinic.appointments.filter((a) => a.status === "scheduled")
}

for (const lang of LANGS) {
  const s = S[lang]

  describe(`[${lang}] the reported bug: a typed date/time at the slot list`, () => {
    it("is NOT read as list option 2 (\"2 days after at 2 pm\")", async () => {
      const chat = await returningPatientAtSlotList(lang)
      assert.equal(chat.slotTitles.length, 8)
      assert.equal(chat.rows.length, 10, "8 slots + See more + Back to menu")

      await chat.say(s.twoDaysAfter)

      // Saturday: the clinic is closed, so the honest answer is "nothing that day, here's what's next" — never a confirmation of slot #2.
      assert.equal(chat.state, ConversationState.AWAITING_SLOT_SELECTION, chat.transcript.join("\n"))
      assert.match(chat.text, s.optionTexts.unavailableDay)
      assert.equal(chat.context.booking?.selectedSlotIso, undefined)
      assert.equal(bookedAppointments().length, 0)
    })

    it("an open date+time goes straight to confirmation of exactly that slot, keeping the reason", async () => {
      const chat = await returningPatientAtSlotList(lang)
      await chat.say(s.tomorrow3pm)

      assert.equal(chat.state, ConversationState.AWAITING_BOOKING_CONFIRMATION)
      assert.match(chat.text, s.confirmHeader)
      assert.match(chat.text, s.fridayLabel)
      assert.match(chat.text, /3:00 PM/)
      assert.match(chat.text, new RegExp(s.fever))
      assert.deepEqual(chat.buttonTitles.slice(0, 2), [s.yesButton, lang === "es" ? "No" : "No"])
    })

    it("works for a weekday name + time too", async () => {
      const chat = await returningPatientAtSlotList(lang)
      await chat.say(s.mon10)
      assert.equal(chat.state, ConversationState.AWAITING_BOOKING_CONFIRMATION)
      assert.match(chat.text, s.mondayLabel)
      assert.match(chat.text, /10:00 AM/)
    })

    it("\"2 pm\" means 2 PM today, not option 2", async () => {
      const chat = await returningPatientAtSlotList(lang)
      await chat.say(s.twoPm)
      assert.equal(chat.state, ConversationState.AWAITING_BOOKING_CONFIRMATION)
      assert.match(chat.text, /2:00 PM/)
    })
  })

  describe(`[${lang}] choosing a slot by number`, () => {
    for (const typed of S[lang].optionTwo) {
      it(`${JSON.stringify(typed)} picks row 2`, async () => {
        const chat = await returningPatientAtSlotList(lang)
        await chat.say(typed)
        assert.equal(chat.state, ConversationState.AWAITING_BOOKING_CONFIRMATION)
        assert.match(chat.text, /10:30 AM/)
      })
    }

    it("tapping a list row picks it by id", async () => {
      const chat = await returningPatientAtSlotList(lang)
      await chat.tap("3", "ignored title")
      assert.match(chat.text, /11:00 AM/)
    })

    it("tapping the row by its title works end to end", async () => {
      const chat = await returningPatientAtSlotList(lang)
      await chat.tapRow(chat.slotTitles[4]!)
      assert.equal(chat.state, ConversationState.AWAITING_BOOKING_CONFIRMATION)
      assert.match(chat.text, /12:00 PM/)
    })

    for (const typed of ["9", "14", "0"]) {
      it(`${JSON.stringify(typed)} is not on the list: invalid notice and the list again`, async () => {
        const chat = await returningPatientAtSlotList(lang)
        await chat.say(typed)
        assert.equal(chat.state, ConversationState.AWAITING_SLOT_SELECTION)
        assert.match(chat.text, s.optionTexts.invalid)
        assert.equal(chat.slotTitles.length, 8, "the list is shown again so the patient doesn't have to scroll")
      })
    }

    it("random text re-shows the list instead of dead-ending", async () => {
      const chat = await returningPatientAtSlotList(lang)
      await chat.say(s.blue)
      assert.equal(chat.state, ConversationState.AWAITING_SLOT_SELECTION)
      assert.match(chat.text, s.optionTexts.invalid)
      assert.equal(chat.slotTitles.length, 8)
    })

    it("a day already gone (\"yesterday\") is not a date and doesn't confirm anything", async () => {
      const chat = await returningPatientAtSlotList(lang)
      await chat.say(lang === "en" ? "yesterday at 2pm" : "ayer a las 2 de la tarde")
      assert.equal(chat.state, ConversationState.AWAITING_SLOT_SELECTION)
      assert.equal(chat.context.booking?.selectedSlotIso, undefined)
    })
  })

  describe(`[${lang}] day queries fit WhatsApp's 10-row list cap`, () => {
    it("a whole day (16 slots) is paged: 8 + See more times + Back to menu", async () => {
      const chat = await returningPatientAtSlotList(lang)
      await chat.say(s.friday)

      assert.equal(chat.state, ConversationState.AWAITING_SLOT_SELECTION)
      assert.equal(chat.slotTitles.length, 8)
      assert.equal(chat.rows.length, 10)
      assert.ok(chat.rows.some((r) => r.id === "more_slots" && r.title === s.moreTimes), "a See more times row")
      assert.match(chat.slotTitles[0]!, lang === "en" ? /^Fri 9 Oct, 9:00 AM$/ : /^vie 9 oct, 9:00 AM$/)

      await chat.tap("more_slots", s.moreTimes)
      assert.equal(chat.slotTitles.length, 8)
      assert.ok(!chat.rows.some((r) => r.id === "more_slots"), "no See more on the last page")
      assert.match(chat.slotTitles[0]!, /2:00 PM$/)
      assert.ok(chat.slotTitles.every((t) => /9 oct/i.test(t)), "still Friday")

      await chat.say("3")
      assert.equal(chat.state, ConversationState.AWAITING_BOOKING_CONFIRMATION)
      assert.match(chat.text, /3:00 PM/, "numbers on page 2 index page 2")
      assert.match(chat.text, s.fridayLabel)
    })

    it("a bare time after a day list means THAT day (\"3pm\" after listing Friday)", async () => {
      const chat = await returningPatientAtSlotList(lang)
      await chat.say(s.friday)
      await chat.say("3pm")
      assert.equal(chat.state, ConversationState.AWAITING_BOOKING_CONFIRMATION)
      assert.match(chat.text, s.fridayLabel)
      assert.match(chat.text, /3:00 PM/)
    })

    it("afternoon / morning preferences filter the day's slots", async () => {
      const chat = await returningPatientAtSlotList(lang)
      await chat.say(s.tomorrowAfternoon)
      assert.equal(chat.slotTitles.length, 8)
      assert.ok(chat.slotTitles.every((t) => /PM$/.test(t)), `afternoon only: ${chat.slotTitles.join(", ")}`)

      await chat.say(s.tomorrowMorning)
      assert.equal(chat.slotTitles.length, 6, "9:00-11:30")
      assert.ok(chat.slotTitles.every((t) => /AM$/.test(t)), `morning only: ${chat.slotTitles.join(", ")}`)
    })

    it("an exact time that's taken offers the closest open times, saying so", async () => {
      const other = clinic.addPatient("Someone Else", "+526641234000")
      clinic.addAppointment(other.id, "2026-10-09T22:00:00Z") // Fri 3:00 PM Tijuana
      const chat = await returningPatientAtSlotList(lang)

      await chat.say(s.tomorrow3pm)
      assert.equal(chat.state, ConversationState.AWAITING_SLOT_SELECTION)
      assert.match(chat.text, s.optionTexts.unavailableTime)
      assert.ok(!chat.slotTitles.some((t) => /3:00 PM/.test(t)), "the taken slot isn't offered")
      assert.ok(chat.slotTitles.some((t) => /2:30 PM/.test(t)) && chat.slotTitles.some((t) => /3:30 PM/.test(t)), chat.slotTitles.join(", "))
    })

    it("a closed day falls back to the next open times", async () => {
      const chat = await returningPatientAtSlotList(lang)
      await chat.say(lang === "en" ? "saturday" : "el sábado")
      assert.equal(chat.state, ConversationState.AWAITING_SLOT_SELECTION)
      assert.match(chat.text, s.optionTexts.unavailableDay)
      assert.equal(chat.slotTitles.length, 8)
    })
  })

  describe(`[${lang}] giving the reason and the time in one message`, () => {
    it("\"reason, tomorrow at 3pm\" at the reason prompt keeps the reason and uses the time", async () => {
      const chat = await returningPatientAtReasonPrompt(lang)
      await chat.say(s.feverWhen)
      assert.equal(chat.state, ConversationState.AWAITING_BOOKING_CONFIRMATION, chat.transcript.join("\n"))
      assert.match(chat.text, s.fridayLabel)
      assert.match(chat.text, /3:00 PM/)
      assert.match(chat.text, new RegExp(`Motivo: ${s.feverWhenReason}$|Reason: ${s.feverWhenReason}$`, "m"))
    })

    it("only a time at the reason prompt reuses the last visit's reason (shown on the confirmation)", async () => {
      const chat = await returningPatientAtReasonPrompt(lang)
      await chat.say(s.tomorrow3pm)
      assert.equal(chat.state, ConversationState.AWAITING_BOOKING_CONFIRMATION)
      assert.match(chat.text, s.lastReasonLine)
    })

    it("a plain reason still goes to the slot list with the reason kept", async () => {
      const chat = await returningPatientAtSlotList(lang, "Fever")
      await chat.tap("1", "x")
      assert.match(chat.text, /Fever/)
      assert.doesNotMatch(chat.text, /Sick/)
    })

    it("symptom duration at the reason prompt is part of the reason, not a date", async () => {
      const chat = await returningPatientAtReasonPrompt(lang)
      await chat.say(s.feverDuration)
      assert.equal(chat.state, ConversationState.AWAITING_SLOT_SELECTION)
      assert.match(chat.slotTitles[0]!, s.thuRow, "general availability, starting today — not a day two days out")
      await chat.say("1")
      assert.match(chat.text, new RegExp(s.feverDuration))
    })

    it("a baby's age at the reason prompt isn't a date either", async () => {
      const chat = await returningPatientAtReasonPrompt(lang)
      await chat.say(s.babyAge)
      assert.equal(chat.state, ConversationState.AWAITING_SLOT_SELECTION)
      assert.match(chat.slotTitles[0]!, s.thuRow)
      await chat.say("1")
      assert.match(chat.text, s.ageReasonCheck)
    })

    it(`"${s.sameWord}" reuses the last visit's reason`, async () => {
      const chat = await returningPatientAtReasonPrompt(lang)
      await chat.say(s.sameWord)
      assert.equal(chat.state, ConversationState.AWAITING_SLOT_SELECTION)
      await chat.say("1")
      assert.match(chat.text, /Sick/)
    })

    it("tapping the Same button reuses it too", async () => {
      const chat = await returningPatientAtReasonPrompt(lang)
      await chat.tap("same", lang === "en" ? "Same" : "Igual")
      await chat.say("1")
      assert.match(chat.text, /Sick/)
    })
  })

  describe(`[${lang}] returning-patient prompt`, () => {
    it("a symptom typed instead of confirming becomes the reason (not the patient's name, not dropped)", async () => {
      const patient = clinic.addPatient("Ashutosh Singh", PHONE, lang)
      clinic.addAppointment(patient.id, "2026-09-18T20:00:00Z", "Sick", "completed")
      const chat = new Chat(lang)
      await chat.tap("book", "Book")

      await chat.say(s.fever)
      assert.equal(chat.state, ConversationState.AWAITING_SLOT_SELECTION)
      await chat.say("1")
      assert.match(chat.text, new RegExp(s.fever))
      assert.match(chat.text, /Ashutosh Singh/, "the saved name is kept")
    })

    it("a natural yes (\"ok\", \"yes please\") continues", async () => {
      for (const yes of s.yes) {
        const patient = clinic.addPatient("Ashutosh Singh", PHONE, lang)
        const chat = new Chat(lang)
        await chat.tap("book", "Book")
        await chat.say(yes)
        assert.equal(chat.state, ConversationState.AWAITING_REASON, `${yes} -> ${chat.state}`)
        clinic.patients = clinic.patients.filter((p) => p.id !== patient.id)
      }
    })
  })

  describe(`[${lang}] confirmation step`, () => {
    async function atConfirmation(): Promise<Chat> {
      const chat = await returningPatientAtSlotList(lang)
      await chat.say(s.tomorrow3pm)
      assert.equal(chat.state, ConversationState.AWAITING_BOOKING_CONFIRMATION)
      return chat
    }

    for (const yes of S[lang].yes) {
      it(`${JSON.stringify(yes)} books it`, async () => {
        const chat = await atConfirmation()
        await chat.say(yes)
        assert.match(chat.text, s.booked)
        assert.equal(chat.state, ConversationState.AWAITING_MENU_SELECTION)
        assert.equal(bookedAppointments().length, 1)
        assert.equal(bookedAppointments()[0]!.starts_at, "2026-10-09T22:00:00.000Z")
        assert.equal(bookedAppointments()[0]!.reason, s.fever)
      })
    }

    for (const no of S[lang].no) {
      it(`${JSON.stringify(no)} abandons it without booking`, async () => {
        const chat = await atConfirmation()
        await chat.say(no)
        assert.match(chat.text, s.cancelledMsg)
        assert.equal(bookedAppointments().length, 0)
      })
    }

    it("the Yes button books it", async () => {
      const chat = await atConfirmation()
      await chat.tap("yes", s.yesButton)
      assert.match(chat.text, s.booked)
    })

    it("\"actually 4pm\" moves the booking to 4 PM on the SAME day (not today)", async () => {
      const chat = await atConfirmation()
      await chat.say(s.actually4pm)
      assert.equal(chat.state, ConversationState.AWAITING_BOOKING_CONFIRMATION, chat.transcript.join("\n"))
      assert.match(chat.text, s.fridayLabel)
      assert.match(chat.text, /4:00 PM/)
      assert.match(chat.text, new RegExp(s.fever), "reason survives the change")

      await chat.say(s.yes[0]!)
      assert.equal(bookedAppointments().length, 1)
      assert.equal(bookedAppointments()[0]!.starts_at, "2026-10-09T23:00:00.000Z")
    })

    it("\"no, friday at 10\" changes the booking instead of cancelling it", async () => {
      const chat = await atConfirmation()
      await chat.say(s.noFriday10)
      assert.equal(chat.state, ConversationState.AWAITING_BOOKING_CONFIRMATION)
      assert.match(chat.text, /10:00 AM/)
      assert.equal(bookedAppointments().length, 0)
    })

    it("a change to a closed day offers open times", async () => {
      const chat = await atConfirmation()
      await chat.say(lang === "en" ? "saturday at 11am" : "el sábado a las 11 de la mañana")
      assert.equal(chat.state, ConversationState.AWAITING_SLOT_SELECTION)
      assert.match(chat.text, s.optionTexts.unavailableDay)
    })

    it("someone else grabbing the slot in the meantime re-offers times instead of erroring", async () => {
      const chat = await atConfirmation()
      const other = clinic.addPatient("Someone Else", "+526641234000")
      clinic.addAppointment(other.id, "2026-10-09T22:00:00Z")
      await chat.say(s.yes[0]!)
      assert.equal(chat.state, ConversationState.AWAITING_SLOT_SELECTION)
      assert.equal(chat.slotTitles.length, 8)
      assert.equal(bookedAppointments().length, 1, "only the other patient's booking exists")
    })

    it("a longer yes (\"yes I confirm\", \"sí, confirmo\") books it", async () => {
      const chat = await atConfirmation()
      await chat.say(lang === "en" ? "Yes, I confirm" : "Sí, confirmo")
      assert.match(chat.text, s.booked)
    })

    it("\"yes\" with a NEW time moves the booking and does not book the old one", async () => {
      const chat = await atConfirmation()
      await chat.say(lang === "en" ? "yes but 4pm" : "sí pero a las 4 de la tarde")
      assert.equal(chat.state, ConversationState.AWAITING_BOOKING_CONFIRMATION)
      assert.match(chat.text, /4:00 PM/)
      assert.equal(bookedAppointments().length, 0)
    })

    it("\"cancel\" and \"no, that's wrong\" abandon the booking attempt", async () => {
      for (const say of [lang === "en" ? "cancel" : "cancelar", lang === "en" ? "no, that's wrong" : "no, está mal"]) {
        const chat = await atConfirmation()
        await chat.say(say)
        assert.match(chat.text, s.cancelledMsg, say)
        assert.equal(bookedAppointments().length, 0)
      }
    })

    it("garbage keeps asking yes/no", async () => {
      const chat = await atConfirmation()
      await chat.say(s.blue)
      assert.equal(chat.state, ConversationState.AWAITING_BOOKING_CONFIRMATION)
    })
  })

  describe(`[${lang}] new patient typing the request on the menu`, () => {
    it("asks the name, then goes straight to confirming the requested time", async () => {
      const chat = new Chat(lang)
      await chat.say(s.bookTomorrow3)
      assert.equal(chat.state, ConversationState.AWAITING_NAME, chat.transcript.join("\n"))
      await chat.say(s.name)
      assert.equal(chat.state, ConversationState.AWAITING_BOOKING_CONFIRMATION)
      assert.match(chat.text, s.fridayLabel)
      assert.match(chat.text, /3:00 PM/)
      assert.match(chat.text, new RegExp(s.name))
      await chat.say(s.yes[0]!)
      assert.match(chat.text, s.booked)
      assert.equal(bookedAppointments().length, 1)
    })

    it("a closed day: name first, then the list WITH the \"that day is closed\" explanation", async () => {
      const chat = new Chat(lang)
      await chat.say(s.satAt2)
      assert.equal(chat.state, ConversationState.AWAITING_NAME)
      await chat.say(s.name)
      assert.equal(chat.state, ConversationState.AWAITING_SLOT_SELECTION)
      assert.match(chat.text, s.optionTexts.unavailableDay)
      assert.equal(chat.slotTitles.length, 8)
    })

    it("a whole-day question for a new patient pages the day too", async () => {
      const chat = new Chat(lang)
      await chat.say(lang === "en" ? "what's open on friday?" : "qué hay disponible el viernes?")
      assert.equal(chat.state, ConversationState.AWAITING_NAME)
      await chat.say(s.name)
      assert.equal(chat.state, ConversationState.AWAITING_SLOT_SELECTION)
      assert.equal(chat.slotTitles.length, 8)
      assert.ok(chat.rows.some((r) => r.id === "more_slots"))
    })

    it("a symptom duration with no date is not hijacked into a booking", async () => {
      const chat = new Chat(lang)
      await chat.say(s.feverDurationMenu)
      assert.notEqual(chat.state, ConversationState.AWAITING_NAME)
      assert.notEqual(chat.state, ConversationState.AWAITING_SLOT_SELECTION)
      assert.equal(clinic.aiCalls.length, 1, "falls through to the normal intent handling")
    })
  })

  describe(`[${lang}] reschedule`, () => {
    async function twoUpcoming(): Promise<{ chat: Chat; firstId: string; secondId: string }> {
      const patient = clinic.addPatient("Ashutosh Singh", PHONE, lang)
      const first = clinic.addAppointment(patient.id, "2026-10-13T17:00:00Z") // Tue 13 Oct 10:00
      const second = clinic.addAppointment(patient.id, "2026-10-14T18:00:00Z") // Wed 14 Oct 11:00
      const chat = new Chat(lang)
      await chat.tap("reschedule", "Reschedule")
      assert.equal(chat.state, ConversationState.AWAITING_RESCHEDULE_TARGET_SELECTION)
      return { chat, firstId: first.id, secondId: second.id }
    }

    it("appointment rows are labelled in the patient's language", async () => {
      const { chat } = await twoUpcoming()
      assert.match(chat.rows[0]!.title, lang === "en" ? /^Tue 13 Oct, 10:00 AM$/ : /^mar 13 oct, 10:00 AM$/)
    })

    it("a typed time at the appointment picker is NOT 'appointment #2'", async () => {
      const { chat } = await twoUpcoming()
      await chat.say(s.twoPm)
      assert.notEqual(chat.state, ConversationState.AWAITING_RESCHEDULE_SLOT_SELECTION)
      assert.equal(chat.context.reschedule?.targetAppointmentId, undefined)
    })

    it("a number off the list re-shows the appointments", async () => {
      const { chat } = await twoUpcoming()
      await chat.say("7")
      assert.equal(chat.state, ConversationState.AWAITING_RESCHEDULE_TARGET_SELECTION)
      assert.equal(chat.rows.length, 3, "2 appointments + Back to menu")
    })

    it("moves the SAME appointment to a typed date/time (and not option #2 for \"2 days after at 2 pm\")", async () => {
      const { chat, firstId } = await twoUpcoming()
      await chat.say("1")
      assert.equal(chat.state, ConversationState.AWAITING_RESCHEDULE_SLOT_SELECTION)

      await chat.say(s.twoDaysAfter)
      assert.equal(chat.state, ConversationState.AWAITING_RESCHEDULE_SLOT_SELECTION, "Saturday is closed -> list again, not a confirmation")
      assert.match(chat.text, s.optionTexts.unavailableDay)
      assert.equal(chat.context.reschedule?.targetAppointmentId, firstId)

      await chat.say(s.friday3pm)
      assert.equal(chat.state, ConversationState.AWAITING_RESCHEDULE_CONFIRMATION)
      assert.match(chat.text, s.fridayLabel)
      assert.match(chat.text, /3:00 PM/)

      await chat.say(s.actually4pm)
      assert.equal(chat.state, ConversationState.AWAITING_RESCHEDULE_CONFIRMATION)
      assert.match(chat.text, s.fridayLabel, "a bare time keeps the day being confirmed")
      assert.match(chat.text, /4:00 PM/)

      await chat.say(s.yes[0]!)
      assert.equal(chat.state, ConversationState.AWAITING_MENU_SELECTION)
      const moved = clinic.appointments.find((a) => a.id === firstId)!
      assert.equal(moved.starts_at, "2026-10-09T23:00:00.000Z")
      assert.equal(clinic.appointments.length, 2, "rescheduled in place — no new appointment")
    })

    it("a day query is paged here too", async () => {
      const { chat } = await twoUpcoming()
      await chat.say("1")
      await chat.say(s.friday)
      assert.equal(chat.slotTitles.length, 8)
      assert.ok(chat.rows.some((r) => r.id === "more_slots"))
      await chat.tap("more_slots", s.moreTimes)
      assert.equal(chat.slotTitles.length, 8)
      await chat.say("1")
      assert.equal(chat.state, ConversationState.AWAITING_RESCHEDULE_CONFIRMATION)
      assert.match(chat.text, /2:00 PM/)
    })

    it("\"2 pm\" at the slot list is a time, not option 2", async () => {
      const { chat } = await twoUpcoming()
      await chat.say("1")
      await chat.say(s.twoPm)
      assert.equal(chat.state, ConversationState.AWAITING_RESCHEDULE_CONFIRMATION)
      assert.match(chat.text, /2:00 PM/)
    })

    it("\"no\" at the confirmation leaves the appointment alone", async () => {
      const { chat, firstId } = await twoUpcoming()
      await chat.say("1")
      await chat.say(s.friday3pm)
      await chat.say(s.no[1]!)
      assert.equal(chat.state, ConversationState.AWAITING_MENU_SELECTION)
      assert.equal(clinic.appointments.find((a) => a.id === firstId)!.starts_at, "2026-10-13T17:00:00.000Z")
    })
  })

  describe(`[${lang}] cancel`, () => {
    async function twoUpcoming(): Promise<{ chat: Chat; firstId: string; secondId: string }> {
      const patient = clinic.addPatient("Ashutosh Singh", PHONE, lang)
      const first = clinic.addAppointment(patient.id, "2026-10-13T17:00:00Z")
      const second = clinic.addAppointment(patient.id, "2026-10-14T18:00:00Z")
      const chat = new Chat(lang)
      await chat.tap("cancel", "Cancel")
      assert.equal(chat.state, ConversationState.AWAITING_CANCELLATION_TARGET_SELECTION)
      return { chat, firstId: first.id, secondId: second.id }
    }

    it("a typed time at the picker doesn't select (or cancel) appointment #2", async () => {
      const { chat, secondId } = await twoUpcoming()
      await chat.say(s.twoPm)
      assert.notEqual(chat.state, ConversationState.AWAITING_CANCELLATION_CONFIRMATION)
      assert.equal(clinic.appointments.find((a) => a.id === secondId)!.status, "scheduled")
    })

    it("casual agreement (\"ok\") must NOT cancel; an explicit yes does", async () => {
      const { chat, firstId } = await twoUpcoming()
      await chat.say("1")
      assert.equal(chat.state, ConversationState.AWAITING_CANCELLATION_CONFIRMATION)
      assert.match(chat.text, lang === "en" ? /Tuesday 13 October/ : /martes 13 de octubre/)

      await chat.say(lang === "en" ? "ok" : "vale")
      assert.equal(chat.state, ConversationState.AWAITING_CANCELLATION_CONFIRMATION)
      assert.equal(clinic.appointments.find((a) => a.id === firstId)!.status, "scheduled")

      await chat.say(lang === "en" ? "yes please" : "sí por favor")
      assert.equal(clinic.appointments.find((a) => a.id === firstId)!.status, "cancelled")
    })

    it("\"cancel\" is not a refusal here, and \"no, keep it\" keeps the appointment", async () => {
      const { chat, firstId } = await twoUpcoming()
      await chat.say("1")
      await chat.say(lang === "en" ? "cancel" : "cancelar")
      assert.equal(chat.state, ConversationState.AWAITING_CANCELLATION_CONFIRMATION, "asks yes/no again — neither a refusal nor a confirmation")
      assert.equal(clinic.appointments.find((a) => a.id === firstId)!.status, "scheduled")

      await chat.say(lang === "en" ? "no, keep it" : "no, mantenerla")
      assert.equal(chat.state, ConversationState.AWAITING_MENU_SELECTION)
      assert.equal(clinic.appointments.find((a) => a.id === firstId)!.status, "scheduled")
    })

    it("\"no thanks\" keeps the appointment", async () => {
      const { chat, firstId } = await twoUpcoming()
      await chat.say("1")
      await chat.say(s.no[1]!)
      assert.equal(chat.state, ConversationState.AWAITING_MENU_SELECTION)
      assert.equal(clinic.appointments.find((a) => a.id === firstId)!.status, "scheduled")
    })
  })

describe(`[${lang}] availability correctness`, () => {
    it("a booked evening slot is not offered again (day-range timezone bug)", async () => {
      const other = clinic.addPatient("Someone Else", "+526641234000")
      clinic.addAppointment(other.id, "2026-10-10T00:00:00Z") // Fri 5:00 PM Tijuana
      clinic.addAppointment(other.id, "2026-10-10T00:30:00Z") // Fri 5:30 PM Tijuana
      const chat = await returningPatientAtSlotList(lang)
      await chat.say(s.friday)
      await chat.tap("more_slots", s.moreTimes)
      assert.ok(!chat.slotTitles.some((t) => /5:00 PM|5:30 PM/.test(t)), `booked slots offered again: ${chat.slotTitles.join(", ")}`)
      assert.equal(chat.slotTitles.length, 6, "2:00-4:30")
    })

    it("a date after the clocks change keeps its wall-clock time and stores the right instant", async () => {
      const chat = await returningPatientAtSlotList(lang)
      await chat.say(lang === "en" ? "nov 2 at 4:30pm" : "2 de noviembre a las 4:30 pm")
      assert.equal(chat.state, ConversationState.AWAITING_BOOKING_CONFIRMATION)
      assert.match(chat.text, lang === "en" ? /Monday 2 November/ : /lunes 2 de noviembre/)
      assert.match(chat.text, /4:30 PM/)
      await chat.say(s.yes[0]!)
      assert.equal(bookedAppointments()[0]!.starts_at, "2026-11-03T00:30:00.000Z", "4:30 PM PST is 00:30Z (UTC-8), not 23:30Z")
    })

    it("a date beyond the 60-day booking window is declined with the next openings, not offered", async () => {
      const chat = await returningPatientAtSlotList(lang)
      await chat.say(lang === "en" ? "dec 25 at 10am" : "25 de diciembre a las 10 de la mañana")
      assert.equal(chat.state, ConversationState.AWAITING_SLOT_SELECTION)
      assert.match(chat.text, s.optionTexts.unavailableDay)
      assert.match(chat.slotTitles[0]!, s.thuRow)
    })
  })

  describe(`[${lang}] status and dates are localized`, () => {
    it("appointment status lists the date in the patient's language", async () => {
      const patient = clinic.addPatient("Ashutosh Singh", PHONE, lang)
      clinic.addAppointment(patient.id, "2026-10-13T17:00:00Z")
      const chat = new Chat(lang)
      await chat.tap("status", "Status")
      assert.match(chat.text, lang === "en" ? /Tuesday 13 October/ : /martes 13 de octubre/)
      if (lang === "es") assert.doesNotMatch(chat.text, /Tuesday|October/)
    })
  })
}

describe("language mixing", () => {
  it("English typed in a Spanish chat is understood", async () => {
    const chat = await returningPatientAtSlotList("es", "Fiebre")
    await chat.say("tomorrow at 3pm")
    assert.equal(chat.state, ConversationState.AWAITING_BOOKING_CONFIRMATION)
    assert.match(chat.text, /viernes 9 de octubre/, "the reply stays in the chat's language")
    assert.match(chat.text, /3:00 PM/)
  })

  it("Spanish typed in an English chat is understood", async () => {
    const chat = await returningPatientAtSlotList("en", "Fever")
    await chat.say("pasado mañana a las 2 de la tarde")
    assert.equal(chat.state, ConversationState.AWAITING_SLOT_SELECTION, "Saturday is closed")
    await chat.say("el lunes a las 10 de la mañana")
    assert.equal(chat.state, ConversationState.AWAITING_BOOKING_CONFIRMATION)
    assert.match(chat.text, /Monday 12 October/)
  })
})
