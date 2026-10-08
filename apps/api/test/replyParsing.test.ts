import "./env.js"
import { describe, it } from "node:test"
import assert from "node:assert/strict"
import { isAffirmative, isNegative, parseListChoice, startsWithDecline } from "../src/lib/replyParsing.js"

describe("parseListChoice — only a bare number picks a row", () => {
  const picks: [string, number][] = [
    ["1", 1], ["2", 2], ["8", 8], [" 3 ", 3], ["2.", 2], ["#2", 2], ["# 2", 2], ["2️⃣", 2], ["option 2", 2], ["Option 3", 3],
    ["opción 4", 4], ["opcion 4", 4], ["número 5", 5], ["number 6", 6], ["no. 2", 2], ["two", 2], ["dos", 2], ["nine", 9], ["nueve", 9],
    ["the first one", 1], ["first", 1], ["la primera", 1], ["el segundo", 2], ["the second one", 2], ["primera opción", 1],
  ]
  for (const [input, expected] of picks) {
    it(`${JSON.stringify(input)} -> ${expected}`, () => assert.equal(parseListChoice(input), expected))
  }

  // The reported bug: parseInt("2 days after at 2 pm") === 2.
  const notChoices = [
    "2 days after at 2 pm", "2 pm", "2pm", "2:30", "2 days after", "3 de octubre", "12th at 2pm", "5th", "el 2", "el 14 a las 5",
    "tomorrow at 3pm", "1st", "10am", "fever", "", "  ", "yes", "0 pm", "2 weeks", "dos días después", "14/10", "nope", "2nd",
  ]
  for (const input of notChoices) {
    it(`${JSON.stringify(input)} is not a list choice`, () => assert.equal(parseListChoice(input), null))
  }
})

describe("isAffirmative / isNegative", () => {
  const yes = ["yes", "Yes", "YES!", "y", "yeah", "yep", "yes please", "Yes, please", "yes I confirm", "Yes, I confirm.", "si", "sí", "SÍ", "si por favor", "sí, por favor", "sí, confirmo", "confirmo", "confirm", "1"]
  const casualYes = ["ok", "okay", "OK!", "sure", "sounds good", "go ahead", "yeah that works", "yes that works", "yes thats fine", "that works", "dale", "vale", "listo", "claro", "de acuerdo", "sí, está bien", "me parece bien", "👍", "✅"]
  const no = ["no", "No", "NO.", "n", "nope", "nah", "no thanks", "no, thanks", "no gracias", "negativo", "mejor no", "2", "👎", "❌"]
  const neither = ["2 pm", "tomorrow at 3pm", "maybe", "what time is it", "yes tomorrow at 3", "yes but friday", "no, friday at 10", "ok 4pm instead", "wait", "", "hola", "claro que no", "yes no"]

  for (const input of yes) it(`${JSON.stringify(input)} is yes`, () => assert.equal(isAffirmative(input), true))
  for (const input of casualYes) {
    it(`${JSON.stringify(input)} is yes only when casual agreement is allowed`, () => {
      assert.equal(isAffirmative(input, { casual: true }), true)
      assert.equal(isAffirmative(input), false, "a destructive confirmation (cancel) must not accept casual agreement")
    })
  }
  for (const input of no) it(`${JSON.stringify(input)} is no`, () => assert.equal(isNegative(input), true))

  // "cancel" while confirming a BOOKING means "don't book it"; while confirming a CANCELLATION it would mean "yes, cancel it".
  for (const input of ["cancel", "cancelar", "Cancel!", "stop"]) {
    it(`${JSON.stringify(input)} declines a booking/reschedule but is neither answer for a cancellation`, () => {
      assert.equal(isNegative(input, { allowCancel: true }), true)
      assert.equal(isNegative(input), false)
      assert.equal(isAffirmative(input, { casual: true }), false)
    })
  }

  for (const input of ["no, change it", "no that's wrong", "No, otro horario", "nope not that one", "mejor no gracias"]) {
    it(`${JSON.stringify(input)} starts with a decline`, () => assert.equal(startsWithDecline(input), true))
  }
  for (const input of ["nothing", "now", "november", "yes no", "tomorrow", "nombre"]) {
    it(`${JSON.stringify(input)} does not`, () => assert.equal(startsWithDecline(input), false))
  }
  for (const input of neither) {
    it(`${JSON.stringify(input)} is neither yes nor no`, () => {
      assert.equal(isAffirmative(input, { casual: true }), false)
      assert.equal(isNegative(input), false)
    })
  }
})
