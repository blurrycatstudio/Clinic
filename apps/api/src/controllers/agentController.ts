import { format } from "date-fns"
import { fromZonedTime, toZonedTime } from "date-fns-tz"
import type { Request, Response } from "express"
import { z } from "zod"
import { CLINIC_TIMEZONE, t } from "@clinic/shared"
import { appointmentService } from "../services/appointmentService.js"
import { appointmentRepository } from "../repositories/appointmentRepository.js"
import { patientRepository } from "../repositories/patientRepository.js"
import { clinicSettingsRepository } from "../repositories/clinicSettingsRepository.js"
import { whatsappService } from "../services/whatsappService.js"
import { auditLogRepository } from "../repositories/auditLogRepository.js"
import { notifyPatientOfAppointmentChange } from "../services/notificationService.js"
import { triggerVoiceHandoff } from "../services/conversationEngine.js"
import { logger } from "../config/logger.js"
import { env } from "../config/env.js"
import { AppError, NotFoundError, ValidationError } from "../lib/errors.js"
import { normalizePhone, phonesMatch } from "../lib/phone.js"
import { buildMapsUrl } from "../lib/offScript.js"
import { effectiveUrgency, guidanceFor } from "../lib/escalationGuidance.js"
import { filterByTimeOfDay } from "../services/appointmentService.js"

/** Any phone the voice model sends is normalised first, so "+52 55 1234 5678" finds the stored "+525512345678" instead of creating a duplicate patient. */
const phoneField = z
  .string()
  .transform(normalizePhone)
  .refine((p) => p.replace(/\D/g, "").length >= 7, "A valid phone number is required")

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

/** WhatsApp notification failures must never fail a booking made over the phone. */
async function notifyBestEffort(appointmentId: string, kind: "confirmed" | "rescheduled" | "cancelled") {
  try {
    await notifyPatientOfAppointmentChange(appointmentId, kind)
  } catch (err) {
    logger.warn({ err, appointmentId, kind }, "Voice-channel appointment notification failed (non-fatal)")
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
        res.status(200).json({ appointment: duplicate, alreadyBooked: true })
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
    await notifyBestEffort(appointment.id, "confirmed")

    res.status(201).json({ appointment })
  },

  async rescheduleAppointment(req: Request, res: Response) {
    const params = z.object({ id: z.string().uuid() }).parse(req.params)
    // `phone` is the caller's number; when sent, the appointment must belong to it.
    const body = z.object({ startsAtIso: z.string().datetime(), phone: phoneField.optional() }).parse(req.body)

    await loadChangeableAppointment(params.id, body.phone)
    await appointmentService.assertSlotIsOpen(body.startsAtIso)

    const appointment = await appointmentService.rescheduleAppointment(params.id, body.startsAtIso)
    await notifyBestEffort(appointment.id, "rescheduled")
    res.json({ appointment })
  },

  async cancelAppointment(req: Request, res: Response) {
    const params = z.object({ id: z.string().uuid() }).parse(req.params)
    const body = z.object({ reason: z.string().optional(), phone: phoneField.optional() }).parse(req.body)

    await loadChangeableAppointment(params.id, body.phone)

    const appointment = await appointmentService.cancelAppointment(params.id, body.reason)
    await notifyBestEffort(appointment.id, "cancelled")
    res.json({ appointment })
  },

  async confirmAttendance(req: Request, res: Response) {
    const params = z.object({ id: z.string().uuid() }).parse(req.params)
    const body = z.object({ phone: phoneField.optional() }).parse(req.body ?? {})

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

  async sendLocation(req: Request, res: Response) {
    const body = z.object({ phone: phoneField }).parse(req.body)
    const settings = await clinicSettingsRepository.get()
    const mapsUrl = settings.google_maps_url || buildMapsUrl(settings.address)

    // Never fail the call over a missing pin or a rejected WhatsApp send — the agent
    // always gets the address back so it can say it out loud as the fallback.
    const spoken = { address: settings.address, mapsUrl }
    if (settings.latitude !== null && settings.longitude !== null) {
      try {
        const { messageId } = await whatsappService.sendLocationMessage(body.phone, {
          latitude: settings.latitude,
          longitude: settings.longitude,
          name: settings.clinic_name,
          address: settings.address,
        })
        res.json({ sent: true, messageId, ...spoken })
        return
      } catch (err) {
        logger.warn({ err }, "Voice-channel WhatsApp location pin failed — falling back to text link")
      }
    }

    const { sent, messageId } = await pushWhatsappText(body.phone, `📍 ${settings.clinic_name}\n${settings.address}\n${mapsUrl}`)
    res.json({
      sent,
      messageId,
      ...spoken,
      ...(sent ? {} : { message: "Couldn't send on WhatsApp. Read the address to the caller instead." }),
    })
  },

  /** Voice tool: caller asks "send me the available slots on WhatsApp" mid-call. */
  async sendAvailabilityOnWhatsapp(req: Request, res: Response) {
    const body = z
      .object({
        phone: phoneField,
        days: z.coerce.number().min(1).max(60).optional(),
        timeOfDay: z.enum(["morning", "afternoon", "evening", "any"]).optional(),
      })
      .parse(req.body)

    const patient = await patientRepository.findByPhone(body.phone)
    const lang = patient?.language ?? "es"

    const pool = await appointmentService.getAvailableSlots(
      body.days,
      body.timeOfDay && body.timeOfDay !== "any" ? 200 : 30,
    )
    const slots = filterByTimeOfDay(pool, body.timeOfDay).slice(0, 9)

    const text =
      slots.length === 0
        ? t(lang, "sharedNoSlotsAvailable")
        : t(lang, "sharedAvailableSlots", { slots: slots.map((s) => `• ${s.label}`).join("\n") })

    const { sent, messageId } = await pushWhatsappText(body.phone, text)
    res.json({
      sent,
      messageId,
      slotsSent: slots.length,
      // If WhatsApp refused the push, hand the model the slots so it can read them aloud instead.
      ...(sent ? {} : { slots, message: "Couldn't send on WhatsApp. Read these options to the caller instead." }),
    })
  },

  /** Voice tool: caller asks "send me my appointment details on WhatsApp" mid-call. */
  async sendAppointmentDetailsOnWhatsapp(req: Request, res: Response) {
    const body = z.object({ phone: phoneField }).parse(req.body)

    const patient = await patientRepository.findByPhone(body.phone)
    const lang = patient?.language ?? "es"

    const appointments = patient ? await appointmentRepository.listUpcomingForPatient(patient.id) : []

    const text =
      appointments.length === 0
        ? t(lang, "sharedNoAppointmentsFound")
        : t(lang, "sharedAppointmentDetails", {
            appointments: appointments
              .map((a) => {
                const zoned = toZonedTime(new Date(a.starts_at), CLINIC_TIMEZONE)
                const statusKey = a.status === "confirmed" ? "statusConfirmed" : "statusScheduled"
                return t(lang, "appointmentStatusLine", {
                  date: format(zoned, "EEEE d MMMM"),
                  time: format(zoned, "h:mm a"),
                  status: t(lang, statusKey),
                })
              })
              .join("\n"),
          })

    const { sent, messageId } = await pushWhatsappText(body.phone, text)
    res.json({
      sent,
      messageId,
      appointmentsSent: appointments.length,
      ...(sent ? {} : { appointments, message: "Couldn't send on WhatsApp. Read the details to the caller instead." }),
    })
  },

  async escalate(req: Request, res: Response) {
    const body = z
      .object({
        phone: phoneField.optional(),
        category: z.enum([
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
        ]),
        reason: z.string().min(1).default("No reason given"),
        urgency: z.enum(["low", "normal", "high", "critical"]).default("normal"),
        callId: z.string().optional(),
      })
      .parse(req.body)

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
   */
  async whatsappHandoff(req: Request, res: Response) {
    const body = z
      .object({
        phone: phoneField,
        intent: z.enum(["book", "reschedule", "cancel", "info", "human", "status", "menu"]),
        language: z.enum(["en", "es"]).optional(),
      })
      .parse(req.body)

    // WhatsApp can refuse (number not on WhatsApp, outside the 24h window, not configured).
    // That must not surface as a 500 — the agent needs to know to keep helping by voice.
    try {
      const { sent, state } = await triggerVoiceHandoff(body.phone, body.intent, body.language)
      res.json({ sent, state })
    } catch (err) {
      logger.warn({ err, intent: body.intent }, "Voice -> WhatsApp handoff failed (non-fatal)")
      res.json({
        sent: false,
        message:
          "Couldn't reach this number on WhatsApp. Don't promise a WhatsApp message — continue helping by voice, or offer a staff callback.",
      })
    }
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
