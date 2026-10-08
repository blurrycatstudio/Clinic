import "./env.js"
import { afterEach, beforeEach, describe, it } from "node:test"
import assert from "node:assert/strict"
import { ConversationState, FlowType, type ConversationContext } from "@clinic/shared"
import { redisStateService } from "../src/services/redisStateService.js"
import { templateService, type TemplateSendResult } from "../src/services/templateService.js"
import { notifyPatientOfAppointmentChange } from "../src/services/notificationService.js"
import { patientRepository } from "../src/repositories/patientRepository.js"
import { conversationRepository } from "../src/repositories/conversationRepository.js"
import { clinicSettingsRepository } from "../src/repositories/clinicSettingsRepository.js"
import { Chat, FakeClinic, freezeClock, NOW, PHONE, unfreezeClock } from "./harness.js"

/**
 * The booking-confirmation template (and the reminder) carry Reschedule / Cancel Appointment buttons. A tap
 * arrives as plain text, so it only works if the conversation was parked on the appointment when the
 * template went out — otherwise it lands on whatever flow was left open and "Yes" does the wrong thing.
 */

const CONV = "conv-1"

describe("tapping a template's Cancel Appointment button", () => {
  const clinic = new FakeClinic()
  beforeEach(() => {
    freezeClock()
    clinic.install()
  })
  afterEach(unfreezeClock)

  for (const lang of ["en", "es"] as const) {
    it(`cancels the appointment on the following yes [${lang}]`, async () => {
      const patient = clinic.addPatient("Ashutosh Singh", PHONE, lang)
      const appointment = clinic.addAppointment(patient.id, "2026-10-09T19:30:00Z")

      const chat = new Chat(lang)
      chat.context = {
        ...chat.context,
        state: ConversationState.AWAITING_REMINDER_RESPONSE,
        reminder: { appointmentId: appointment.id },
      }

      // A template quick-reply button comes back as plain text with no button id (see webhookController).
      await chat.say(lang === "en" ? "Cancel Appointment" : "Cancelar cita")
      assert.equal(chat.state, ConversationState.AWAITING_CANCELLATION_CONFIRMATION)
      assert.deepEqual(chat.buttonTitles.slice(0, 2), lang === "en" ? ["Yes", "No"] : ["Sí", "No"])

      await chat.tap("yes", lang === "en" ? "Yes" : "Sí")
      assert.equal(appointment.status, "cancelled")
      assert.equal(chat.state, ConversationState.AWAITING_MENU_SELECTION)
      assert.equal(clinic.appointments.filter((a) => a.status === "scheduled").length, 0, "nothing new may be booked")
    })
  }
})

describe("redisStateService.parkOnReminderResponse", () => {
  const originalGet = redisStateService.get
  const originalSave = redisStateService.save
  let saved: ConversationContext | null

  // What a patient who abandoned a WhatsApp booking at its confirm step leaves behind.
  const stale: ConversationContext = {
    conversationId: CONV,
    patientId: null,
    phoneE164: PHONE,
    language: "en",
    state: ConversationState.AWAITING_BOOKING_CONFIRMATION,
    activeFlow: FlowType.BOOK,
    booking: { fullName: "Ashutosh Singh", selectedSlotIso: "2026-10-09T19:30:00Z" },
    recentTurns: [],
    updatedAt: NOW.toISOString(),
  }

  beforeEach(() => {
    saved = null
    redisStateService.get = async () => ({ context: stale, isNew: false })
    redisStateService.save = async (_phone, context) => {
      saved = context
    }
  })
  afterEach(() => {
    redisStateService.get = originalGet
    redisStateService.save = originalSave
  })

  it("replaces a stale booking-confirmation state so the button tap is routed to the appointment", async () => {
    await redisStateService.parkOnReminderResponse(PHONE, CONV, "appt-1", "es")

    assert.ok(saved)
    assert.equal(saved.state, ConversationState.AWAITING_REMINDER_RESPONSE)
    assert.equal(saved.activeFlow, FlowType.NONE)
    assert.deepEqual(saved.reminder, { appointmentId: "appt-1" })
    assert.equal(saved.language, "en", "keeps the language the patient already chose")
  })

  it("uses the fallback language when the patient hasn't picked one yet", async () => {
    redisStateService.get = async () => ({ context: { ...stale, language: null }, isNew: false })
    await redisStateService.parkOnReminderResponse(PHONE, CONV, "appt-1", "es")

    assert.equal(saved?.language, "es")
  })
})

describe("booking-confirmation notification", () => {
  const clinic = new FakeClinic()
  const originals = {
    send: templateService.send,
    park: redisStateService.parkOnReminderResponse,
    getOrCreate: conversationRepository.getOrCreate,
    settings: clinicSettingsRepository.get,
    findPatient: patientRepository.findById,
  }
  let parked: unknown[][]
  let sendResult: TemplateSendResult
  let parkThrows: boolean

  beforeEach(() => {
    freezeClock()
    clinic.install()
    parked = []
    parkThrows = false
    sendResult = { sent: true, via: "template", messageId: "wamid.1" }

    templateService.send = async () => sendResult
    redisStateService.parkOnReminderResponse = async (...args) => {
      parked.push(args)
      if (parkThrows) throw new Error("redis down")
    }
    conversationRepository.getOrCreate = (async () => ({ id: CONV })) as unknown as typeof conversationRepository.getOrCreate
    clinicSettingsRepository.get = (async () => ({ clinic_name: "Pediatra Clinic", doctor_name: "Dr. Gamaliel" })) as unknown as typeof clinicSettingsRepository.get
    patientRepository.findById = async (id) => clinic.patients.find((p) => p.id === id) ?? null
  })
  afterEach(() => {
    unfreezeClock()
    templateService.send = originals.send
    redisStateService.parkOnReminderResponse = originals.park
    conversationRepository.getOrCreate = originals.getOrCreate
    clinicSettingsRepository.get = originals.settings
    patientRepository.findById = originals.findPatient
  })

  function bookedAppointment() {
    const patient = clinic.addPatient("Ashutosh Singh", PHONE, "en")
    return clinic.addAppointment(patient.id, "2026-10-09T19:30:00Z")
  }

  it("parks the conversation on the appointment once the template with the buttons is delivered", async () => {
    const appointment = bookedAppointment()
    const result = await notifyPatientOfAppointmentChange(appointment.id, "confirmed")

    assert.equal(result?.sent, true)
    assert.deepEqual(parked, [[PHONE, CONV, appointment.id, "en"]])
  })

  it("does not park when only the plain-text fallback went out (it has no buttons)", async () => {
    sendResult = { sent: true, via: "session", messageId: "wamid.2" }
    await notifyPatientOfAppointmentChange(bookedAppointment().id, "confirmed")
    assert.equal(parked.length, 0)
  })

  it("does not park when nothing was delivered", async () => {
    sendResult = { sent: false, via: null, messageId: null, failure: "session_expired" }
    await notifyPatientOfAppointmentChange(bookedAppointment().id, "confirmed")
    assert.equal(parked.length, 0)
  })

  it("does not park for reschedule / cancel notifications", async () => {
    const appointment = bookedAppointment()
    await notifyPatientOfAppointmentChange(appointment.id, "rescheduled")
    await notifyPatientOfAppointmentChange(appointment.id, "cancelled")
    assert.equal(parked.length, 0)
  })

  it("still reports the message as sent if saving the state fails", async () => {
    parkThrows = true
    const result = await notifyPatientOfAppointmentChange(bookedAppointment().id, "confirmed")
    assert.equal(result?.sent, true)
  })
})
