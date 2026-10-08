import { fromZonedTime } from "date-fns-tz"
import type { Request, Response } from "express"
import { z } from "zod"
import { CLINIC_TIMEZONE, t } from "@clinic/shared"
import { appointmentService } from "../services/appointmentService.js"
import { appointmentRepository } from "../repositories/appointmentRepository.js"
import { patientRepository } from "../repositories/patientRepository.js"
import { clinicSettingsRepository } from "../repositories/clinicSettingsRepository.js"
import { whatsappService } from "../services/whatsappService.js"
import { auditLogRepository } from "../repositories/auditLogRepository.js"
import { conversationRepository } from "../repositories/conversationRepository.js"
import { notifyPatientSafely } from "../services/notificationService.js"
import { sendFlowReplyOutOfBand, triggerVoiceHandoff } from "../services/conversationEngine.js"
import { deliverToPatient, type VoiceDeliveryResult } from "../services/voiceDeliveryService.js"
import { voicePendingService } from "../services/voicePendingService.js"
import { clinicInfoTemplate, followupTemplate, type TemplateTarget } from "../services/voiceTemplateAttempts.js"
import { logger } from "../config/logger.js"
import { env } from "../config/env.js"
import { AppError, NotFoundError, ValidationError } from "../lib/errors.js"
import { hasCountryCode, normalizePhone, phonesMatch } from "../lib/phone.js"
import { buildMapsUrl, locationReply } from "../lib/offScript.js"
import { effectiveUrgency, guidanceFor, type EscalationCategory, type EscalationUrgency } from "../lib/escalationGuidance.js"
import { filterByTimeOfDay } from "../services/appointmentService.js"

/**
 * Any phone the voice model sends is normalised first, so "+52 55 1234 5678" finds the stored
 * "+525512345678" instead of creating a duplicate patient. The error text is written for the
 * voice MODEL (it reaches the agent verbatim): a hidden caller ID or a number dictated without
 * its country code must lead to "ask the caller", never to a dead end or a message sent to the
 * wrong country.
 */
const PHONE_HELP =
  "I don't have a usable phone number for this caller. Ask for their WhatsApp number including the country code (for example +52 for Mexico, +91 for India), then try again."
const phoneField = z
  .string({ required_error: PHONE_HELP, invalid_type_error: PHONE_HELP })
  .transform(normalizePhone)
  .refine(hasCountryCode, PHONE_HELP)

/** n8n forwards `null` for anything the model left out, and zod's .optional() rejects null — one wrong "language": null used to fail the whole tool call. */
const nullish = <T extends z.ZodTypeAny>(schema: T) => schema.nullish().transform((value) => value ?? undefined)

const languageField = z.enum(["en", "es"])

/**
 * Loads an appointment the caller wants to change and refuses when it's missing,
 * already cancelled/completed (a reschedule would otherwise silently revive a
 * cancelled booking), or — when the voice tool passes the caller's phone — belongs
 * to a different patient. Prevents one caller cancelling someone else's visit by id.
 */
async function loadChangeableAppointment(id: string, callerPhone?: string) {
  const appt = await appointmentRepository.findByIdWithPatient(id)
  if (!appt) throw new NotFoundError("Appointment not found")
  if (appt.status !== "scheduled" && appt.status !== "confirmed") {
    throw new ValidationError(`That appointment is already ${appt.status}, so it can't be changed.`)
  }
  if (callerPhone && appt.patients && !phonesMatch(appt.patients.phone_e164, callerPhone)) {
    throw new AppError("That appointment isn't under this phone number.", 403, "FORBIDDEN")
  }
  return appt
}

/** Voice-agent tools push messages outside the WhatsApp 24h session window, so a
 *  send can be rejected by Meta until the patient has an active session — same
 *  risk already accepted by sendLocation below. We log it but never fail the call. */
async function pushWhatsappText(phone: string, text: string): Promise<{ sent: boolean; messageId: string | null }> {
  try {
    const { messageId } = await whatsappService.sendTextMessage(phone, text)
    return { sent: true, messageId }
  } catch (err) {
    logger.warn({ err, phone }, "Voice-channel WhatsApp push failed (non-fatal)")
    return { sent: false, messageId: null }
  }
}

/**
 * Endpoints for the voice-call tool handler (n8n, driven by Vapi's
 * function-calling) and any other non-staff automation. Everything here
 * goes through the SAME deterministic appointmentService the dashboard
 * and WhatsApp flows use — this file only adapts request/response shapes,
 * it never decides booking state itself.
 */

type WhatsappConfirmation = { sent: boolean; message: string }

/**
 * WhatsApp notification failures must never fail a booking made over the phone — but the agent
 * has to KNOW whether the confirmation went out, or it will promise "you'll get it on WhatsApp"
 * to someone who won't.
 */
async function notifyBestEffort(
  appointmentId: string,
  kind: "confirmed" | "rescheduled" | "cancelled",
): Promise<WhatsappConfirmation> {
  const notSent: WhatsappConfirmation = {
    sent: false,
    message:
      "The WhatsApp confirmation could NOT be sent. Do not tell the caller one is coming; read the appointment details back to them instead.",
  }
  const outcome = await notifyPatientSafely(appointmentId, kind)
  if (outcome.sent) {
    return { sent: true, message: "A WhatsApp confirmation was sent. You can tell the caller to check WhatsApp." }
  }
  logger.warn({ appointmentId, kind, reason: outcome.message }, "Voice-channel appointment notification was not delivered")
  return notSent
}

/** Language, name and conversation for a number we're about to message — shared by every WhatsApp-sending tool. */
async function resolveRecipient(phone: string, requestedLanguage?: "en" | "es") {
  const [patient, conversation, settings] = await Promise.all([
    patientRepository.findByPhone(phone),
    conversationRepository.getOrCreate(phone),
    clinicSettingsRepository.get(),
  ])
  const language = requestedLanguage ?? patient?.language ?? conversation.language ?? "es"
  const target: TemplateTarget = {
    phone,
    conversationId: conversation.id,
    language,
    patientName: patient?.full_name ?? null,
    settings,
  }
  return { patient, conversation, settings, language, target }
}

const ESCALATION_CATEGORIES = [
  "angry_patient",
  "distressed_patient",
  "medical_emergency",
  "mental_health_crisis",
  "wants_human",
  "clinical_question",
  "complaint",
  "billing_dispute",
  "low_confidence",
  "other",
] as const satisfies readonly EscalationCategory[]
const ESCALATION_URGENCIES = ["low", "normal", "high", "critical"] as const satisfies readonly EscalationUrgency[]

/**
 * Escalation is the one tool that must NEVER fail validation: if the model sends a null phone
 * (hidden caller ID), an unknown category or a missing reason while a caller describes chest
 * pain, the caller still has to hear the emergency guidance. So every field degrades to a safe
 * default — an unrecognised category is treated as "high" urgency so staff still look at it.
 */
function parseEscalation(raw: unknown): {
  phone?: string
  category: EscalationCategory
  reason: string
  urgency: EscalationUrgency
  callId?: string
} {
  const input = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>
  const category = ESCALATION_CATEGORIES.find((c) => c === input.category)
  const urgency = ESCALATION_URGENCIES.find((u) => u === input.urgency)
  const phone = typeof input.phone === "string" ? normalizePhone(input.phone) : undefined
  return {
    phone: phone && phone.replace(/\D/g, "").length >= 7 ? phone : undefined,
    category: category ?? "other",
    reason: typeof input.reason === "string" && input.reason.trim() ? input.reason.trim() : "No reason given",
    urgency: urgency ?? (category ? "normal" : "high"),
    callId: typeof input.callId === "string" && input.callId ? input.callId : undefined,
  }
}

type HandoffIntent = "book" | "reschedule" | "cancel" | "info" | "human" | "status" | "menu"

/** Runs a WhatsApp hand-off and turns any unexpected crash (Redis down, ...) into an honest "not sent" instead of a 500 mid-call. */
async function handoff(
  phone: string,
  intent: HandoffIntent,
  language?: "en" | "es",
  callId?: string | null,
): Promise<VoiceDeliveryResult & { state?: string | null }> {
  try {
    return await triggerVoiceHandoff(phone, intent, language, callId)
  } catch (err) {
    logger.error({ err, intent }, "Voice -> WhatsApp handoff crashed")
    return {
      sent: false,
      via: null,
      confirmation: null,
      failure: "technical",
      message:
        "NOT SENT. A technical problem stopped the WhatsApp message. Do NOT tell the caller anything was sent. Keep helping by voice, or offer a callback from the team.",
    }
  }
}

export const agentController = {
  async getAvailability(req: Request, res: Response) {
    const query = z
      .object({
        days: z.coerce.number().min(1).max(60).optional(),
        timeOfDay: z.enum(["morning", "afternoon", "evening", "any"]).optional(),
        /** "What's open on the 14th?" — a specific clinic-local day, yyyy-MM-dd. */
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      })
      .parse(req.query)

    let slots = query.date
      ? await appointmentService.getSlotsOnDate(fromZonedTime(`${query.date}T12:00:00`, CLINIC_TIMEZONE))
      : // Pull a deep pool before filtering: with only the 30 earliest slots, "evening" often
        // filtered down to nothing even though later days had evening openings.
        await appointmentService.getAvailableSlots(query.days, query.timeOfDay && query.timeOfDay !== "any" ? 200 : 30)

    slots = filterByTimeOfDay(slots, query.timeOfDay)

    res.json({
      slots: slots.slice(0, 9),
      // Explicit so the model says "nothing open" instead of inventing a time or going silent.
      ...(slots.length === 0
        ? { message: "No open slots match that request. Offer a different day or time of day, or offer to send availability on WhatsApp." }
        : {}),
    })
  },

  async lookupPatient(req: Request, res: Response) {
    const query = z.object({ phone: phoneField }).parse(req.query)
    const patient = await patientRepository.findByPhone(query.phone)
    if (!patient) {
      res.json({ found: false })
      return
    }
    res.json({ found: true, patient })
  },

  async upsertPatient(req: Request, res: Response) {
    const body = z
      .object({
        fullName: z.string().min(2),
        phoneE164: phoneField,
        dateOfBirth: z.string().optional(),
        notes: z.string().optional(),
      })
      .parse(req.body)

    const patient = await patientRepository.upsertByPhone({
      phoneE164: body.phoneE164,
      fullName: body.fullName,
      dateOfBirth: body.dateOfBirth,
      notes: body.notes,
    })
    res.status(201).json({ patient })
  },

  async searchAppointments(req: Request, res: Response) {
    const query = z.object({ phone: phoneField }).parse(req.query)
    const patient = await patientRepository.findByPhone(query.phone)
    if (!patient) {
      res.json({ found: false, appointments: [] })
      return
    }
    const appointments = await appointmentRepository.listUpcomingForPatient(patient.id)
    res.json({ found: appointments.length > 0, patient, appointments })
  },

  async bookAppointment(req: Request, res: Response) {
    const body = z
      .object({
        fullName: z.string().trim().min(2),
        phoneE164: phoneField,
        reason: z.string().default(""),
        startsAtIso: z.string().datetime(),
      })
      .parse(req.body)

    await appointmentService.assertSlotIsOpen(body.startsAtIso)

    // Voice retries (dropped line, model re-calling the tool) must not create a second visit.
    const existing = await patientRepository.findByPhone(body.phoneE164)
    if (existing) {
      const upcoming = await appointmentRepository.listUpcomingForPatient(existing.id)
      const startMs = new Date(body.startsAtIso).getTime()
      const duplicate = upcoming.find((a) => new Date(a.starts_at).getTime() === startMs)
      if (duplicate) {
        res.status(200).json({
          appointment: duplicate,
          alreadyBooked: true,
          whatsappConfirmation: {
            sent: false,
            message: "This booking already existed (a repeat request), so no new WhatsApp message was sent just now. Do not promise a new one.",
          },
        })
        return
      }
    }

    const { appointment } = await appointmentService.bookAppointment({
      patientFullName: body.fullName,
      patientPhoneE164: body.phoneE164,
      reason: body.reason,
      startsAtIso: body.startsAtIso,
      source: "voice",
    })
    const whatsappConfirmation = await notifyBestEffort(appointment.id, "confirmed")

    res.status(201).json({ appointment, whatsappConfirmation })
  },

  async rescheduleAppointment(req: Request, res: Response) {
    const params = z.object({ id: z.string().uuid() }).parse(req.params)
    // `phone` is the caller's number; when sent, the appointment must belong to it.
    const body = z.object({ startsAtIso: z.string().datetime(), phone: nullish(phoneField) }).parse(req.body)

    await loadChangeableAppointment(params.id, body.phone)
    await appointmentService.assertSlotIsOpen(body.startsAtIso)

    const appointment = await appointmentService.rescheduleAppointment(params.id, body.startsAtIso)
    const whatsappConfirmation = await notifyBestEffort(appointment.id, "rescheduled")
    res.json({ appointment, whatsappConfirmation })
  },

  async cancelAppointment(req: Request, res: Response) {
    const params = z.object({ id: z.string().uuid() }).parse(req.params)
    const body = z.object({ reason: nullish(z.string()), phone: nullish(phoneField) }).parse(req.body)

    await loadChangeableAppointment(params.id, body.phone)

    const appointment = await appointmentService.cancelAppointment(params.id, body.reason)
    const whatsappConfirmation = await notifyBestEffort(appointment.id, "cancelled")
    res.json({ appointment, whatsappConfirmation })
  },

  async confirmAttendance(req: Request, res: Response) {
    const params = z.object({ id: z.string().uuid() }).parse(req.params)
    const body = z.object({ phone: nullish(phoneField) }).parse(req.body ?? {})

    await loadChangeableAppointment(params.id, body.phone)
    const appointment = await appointmentService.confirmAppointment(params.id)
    res.json({ appointment })
  },

  async getFaq(req: Request, res: Response) {
    const query = z
      .object({
        topic: z.enum(["fees", "hours", "address", "parking", "payment_methods", "insurance", "all"]).default("all"),
        language: z.enum(["en", "es"]).default("es"),
      })
      .parse(req.query)

    const settings = await clinicSettingsRepository.get()
    const suffix = query.language === "es" ? "_es" : "_en"
    const shaped = {
      address: settings.address,
      map_url: settings.google_maps_url,
      hours: settings[`hours_summary${suffix}` as "hours_summary_es"],
      fees: settings[`fees_info${suffix}` as "fees_info_es"],
      parking: settings[`parking_info${suffix}` as "parking_info_es"],
      insurance: settings[`insurance_info${suffix}` as "insurance_info_es"],
    }

    if (query.topic === "all") {
      res.json(shaped)
      return
    }
    const topicMap: Record<string, unknown> = {
      fees: shaped.fees,
      hours: shaped.hours,
      address: { address: shaped.address, map_url: shaped.map_url },
      parking: shaped.parking,
      payment_methods: shaped.fees, // no dedicated payment-methods column yet — folded into fees info
      insurance: shaped.insurance,
    }
    res.json({ topic: query.topic, value: topicMap[query.topic] })
  },

  /** Voice tool: caller asks "send me the clinic's location" mid-call. */
  async sendLocation(req: Request, res: Response) {
    const body = z.object({ phone: phoneField, language: nullish(languageField), callId: nullish(z.string()) }).parse(req.body)
    const { conversation, settings, language, target } = await resolveRecipient(body.phone, body.language)
    const mapsUrl = settings.google_maps_url || buildMapsUrl(settings.address)

    // The address always comes back so the agent can say it out loud whatever happens to the send.
    const spoken = { address: settings.address, mapsUrl }
    const delivery = await deliverToPatient({
      phone: body.phone,
      purpose: "clinic_location",
      callId: body.callId,
      session: () => sendFlowReplyOutOfBand(body.phone, conversation.id, locationReply(language, settings), { awaitLogs: true }),
      template: clinicInfoTemplate(target),
      fallbackHint: "Read the address out loud now (it is in this response).",
      queue: { save: () => voicePendingService.save(body.phone, { intent: "info", language, callId: body.callId }), summary: "the clinic's location" },
    })
    res.json({ ...delivery, ...spoken })
  },

  /** Voice tool: caller asks "send me the available slots on WhatsApp" mid-call. */
  async sendAvailabilityOnWhatsapp(req: Request, res: Response) {
    const body = z
      .object({
        phone: phoneField,
        days: nullish(z.coerce.number().min(1).max(60)),
        timeOfDay: nullish(z.enum(["morning", "afternoon", "evening", "any"])),
        language: nullish(languageField),
        callId: nullish(z.string()),
      })
      .parse(req.body)

    const { conversation, language, target } = await resolveRecipient(body.phone, body.language)

    const pool = await appointmentService.getAvailableSlots(
      body.days,
      body.timeOfDay && body.timeOfDay !== "any" ? 200 : 30,
    )
    const slots = filterByTimeOfDay(pool, body.timeOfDay).slice(0, 9)

    if (slots.length === 0) {
      res.json({
        sent: false,
        slotsSent: 0,
        failure: "nothing_to_send",
        message:
          "NOT SENT. No open slots match that request, so nothing was sent. Tell the caller and offer a different day or time of day.",
      })
      return
    }

    const text = t(language, "sharedAvailableSlots", { slots: slots.map((s) => `• ${s.label}`).join("\n") })
    const delivery = await deliverToPatient({
      phone: body.phone,
      purpose: "available_slots",
      callId: body.callId,
      session: () => sendFlowReplyOutOfBand(body.phone, conversation.id, { text }, { awaitLogs: true }),
      // A slot list can't ride in a template; the booking follow-up opens the live booking flow, which shows them.
      template: followupTemplate(target, "book"),
      fallbackHint: "Read these options to the caller instead (they are in this response).",
      queue: { save: () => voicePendingService.save(body.phone, { intent: "book", language, callId: body.callId }), summary: "the available times to book" },
    })
    res.json({ ...delivery, slotsSent: delivery.sent ? slots.length : 0, ...(delivery.sent ? {} : { slots }) })
  },

  /**
   * Voice tool: caller asks "send me my appointment details on WhatsApp" mid-call. Sent ONLY to the
   * number the appointments are booked under, and the details are never echoed back to the model —
   * so naming someone else's number can't be used to learn their appointments.
   */
  async sendAppointmentDetailsOnWhatsapp(req: Request, res: Response) {
    const body = z.object({ phone: phoneField, language: nullish(languageField), callId: nullish(z.string()) }).parse(req.body)
    res.json(await handoff(body.phone, "status", body.language, body.callId))
  },

  /** Voice tool: caller asks for hours / fees / parking / insurance / address "in writing". */
  async sendClinicInfoOnWhatsapp(req: Request, res: Response) {
    const body = z
      .object({
        phone: phoneField,
        topic: nullish(z.enum(["all", "address", "hours", "fees", "parking", "insurance"])),
        language: nullish(languageField),
        callId: nullish(z.string()),
      })
      .parse(req.body)
    const topic = body.topic ?? "all"
    const { conversation, settings, language, target } = await resolveRecipient(body.phone, body.language)

    const es = language === "es"
    const mapsUrl = settings.google_maps_url || buildMapsUrl(settings.address)
    const sections = {
      address: { icon: "📍", value: `${settings.address}\n${mapsUrl}` },
      hours: { icon: "🗓️", value: es ? settings.hours_summary_es : settings.hours_summary_en },
      fees: { icon: "💳", value: es ? settings.fees_info_es : settings.fees_info_en },
      parking: { icon: "🅿️", value: es ? settings.parking_info_es : settings.parking_info_en },
      insurance: { icon: "🏥", value: es ? settings.insurance_info_es : settings.insurance_info_en },
    }
    const wanted = topic === "all" ? (["address", "hours", "fees", "parking", "insurance"] as const) : ([topic] as const)
    const parts = wanted.filter((key) => sections[key].value?.trim()).map((key) => `${sections[key].icon} ${sections[key].value.trim()}`)

    if (parts.length === 0) {
      res.json({
        sent: false,
        failure: "nothing_to_send",
        message: "NOT SENT. The clinic has no information saved for that topic. Say so, and offer a callback from the team.",
      })
      return
    }
    const text = [`*${settings.clinic_name}*`, ...parts].join("\n\n")

    const delivery = await deliverToPatient({
      phone: body.phone,
      purpose: `clinic_info:${topic}`,
      callId: body.callId,
      session: () => sendFlowReplyOutOfBand(body.phone, conversation.id, { text }, { awaitLogs: true }),
      // The approved template carries address, hours, parking and the maps link — not fees or insurance.
      template: topic === "fees" || topic === "insurance" ? null : clinicInfoTemplate(target),
      fallbackHint: "Read the information out loud now (it is in this response).",
      queue: { save: () => voicePendingService.save(body.phone, { text, language, callId: body.callId }), summary: "the information you asked for" },
    })
    res.json({ ...delivery, ...(delivery.sent ? {} : { info: text }) })
  },

  async escalate(req: Request, res: Response) {
    const body = parseEscalation(req.body)

    const urgency = effectiveUrgency(body.category, body.urgency)

    // The agent-facing guidance must come back even if bookkeeping fails — a caller
    // describing chest pain must hear "call emergency services" whatever the DB is doing.
    let patientId: string | null = null
    try {
      if (body.phone) {
        const patient = await patientRepository.findByPhone(body.phone)
        patientId = patient?.id ?? null
      }
      await auditLogRepository.record({
        actorType: "ai",
        actorId: patientId,
        action: "conversation.escalated",
        entityType: "voice_call",
        entityId: body.callId ?? null,
        metadata: { category: body.category, reason: body.reason, urgency, phone: body.phone ?? null },
      })
    } catch (err) {
      logger.error({ err, category: body.category }, "Escalation bookkeeping failed")
    }

    let staffAlerted = false
    if (urgency === "high" || urgency === "critical") {
      logger.error({ category: body.category, urgency, phone: body.phone ?? null, reason: body.reason }, "VOICE ESCALATION — needs staff attention")
      if (env.STAFF_ALERT_PHONE_E164) {
        const label = urgency === "critical" ? "🚨 URGENT" : "⚠️ Attention"
        const { sent } = await pushWhatsappText(
          env.STAFF_ALERT_PHONE_E164,
          `${label} — voice agent escalation (${body.category})\nCaller: ${body.phone ?? "unknown"}\n${body.reason}`,
        )
        staffAlerted = sent
      }
    }

    res.status(201).json({
      status: "ESCALATED",
      urgency,
      staffAlerted,
      instructions: guidanceFor(body.category),
    })
  },

  /**
   * Voice tool: the caller stated an intent (book/reschedule/cancel/info/
   * human/status), and the voice agent hands the rest off to WhatsApp
   * instead of collecting details itself. Reuses the same flow logic and
   * conversation state as inbound WhatsApp messages via triggerVoiceHandoff,
   * so the patient continues in a consistent conversation on WhatsApp.
   *
   * The response says whether anything actually went out (`sent`) and what the agent
   * must tell the caller (`message`) — it must never promise WhatsApp unless `sent` is true.
   */
  async whatsappHandoff(req: Request, res: Response) {
    const body = z
      .object({
        phone: phoneField,
        intent: z.enum(["book", "reschedule", "cancel", "info", "human", "status", "menu"]),
        language: nullish(languageField),
        callId: nullish(z.string()),
      })
      .parse(req.body)

    res.json(await handoff(body.phone, body.intent, body.language, body.callId))
  },

  /**
   * Voice tool: before handing a reschedule request off to WhatsApp, the
   * caller confirms the last 2 digits of the phone number the appointment
   * was booked under. This is a spoken-confirmation check against a number
   * we already have (caller ID, or a number the caller explicitly gave) —
   * not a lookup — so it never reveals any phone number back to the caller,
   * it only confirms whether what they said matches.
   */
  async verifyPhoneSuffix(req: Request, res: Response) {
    const body = z
      .object({
        phone: phoneField,
        lastTwoDigits: z.string().min(1).max(12),
      })
      .parse(req.body)

    const actualDigits = body.phone.replace(/\D/g, "")
    const providedDigits = body.lastTwoDigits.replace(/\D/g, "")
    // Needs a full two digits — a single heard digit matched far too easily.
    const verified = providedDigits.length >= 2 && actualDigits.slice(-2) === providedDigits.slice(-2)

    res.json({ verified })
  },
}
