import { format } from "date-fns"
import { toZonedTime } from "date-fns-tz"
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
import { logger } from "../config/logger.js"
import { ValidationError } from "../lib/errors.js"

const HOUR_RANGES: Record<string, [number, number]> = {
  morning: [0, 12],
  afternoon: [12, 17],
  evening: [17, 24],
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
      })
      .parse(req.query)

    let slots = await appointmentService.getAvailableSlots(query.days, 30)

    const range = query.timeOfDay ? HOUR_RANGES[query.timeOfDay] : undefined
    if (range) {
      const [from, to] = range
      slots = slots.filter((s) => {
        const hour = new Date(s.startsAtIso).getUTCHours()
        return hour >= from && hour < to
      })
    }

    res.json({ slots: slots.slice(0, 9) })
  },

  async lookupPatient(req: Request, res: Response) {
    const query = z.object({ phone: z.string().min(4) }).parse(req.query)
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
        phoneE164: z.string().min(4),
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
    const query = z.object({ phone: z.string().min(4) }).parse(req.query)
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
        fullName: z.string().min(2),
        phoneE164: z.string().min(4),
        reason: z.string().default(""),
        startsAtIso: z.string().datetime(),
      })
      .parse(req.body)

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
    const body = z.object({ startsAtIso: z.string().datetime() }).parse(req.body)

    const appointment = await appointmentService.rescheduleAppointment(params.id, body.startsAtIso)
    await notifyBestEffort(appointment.id, "rescheduled")
    res.json({ appointment })
  },

  async cancelAppointment(req: Request, res: Response) {
    const params = z.object({ id: z.string().uuid() }).parse(req.params)
    const body = z.object({ reason: z.string().optional() }).parse(req.body)

    const appointment = await appointmentService.cancelAppointment(params.id, body.reason)
    await notifyBestEffort(appointment.id, "cancelled")
    res.json({ appointment })
  },

  async confirmAttendance(req: Request, res: Response) {
    const params = z.object({ id: z.string().uuid() }).parse(req.params)
    const appointment = await appointmentRepository.updateStatus(params.id, "confirmed")
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
    const body = z.object({ phone: z.string().min(4) }).parse(req.body)
    const settings = await clinicSettingsRepository.get()

    if (settings.latitude === null || settings.longitude === null) {
      throw new ValidationError("Clinic location coordinates are not configured yet")
    }

    const { messageId } = await whatsappService.sendLocationMessage(body.phone, {
      latitude: settings.latitude,
      longitude: settings.longitude,
      name: settings.clinic_name,
      address: settings.address,
    })
    res.json({ sent: true, messageId })
  },

  /** Voice tool: caller asks "send me the available slots on WhatsApp" mid-call. */
  async sendAvailabilityOnWhatsapp(req: Request, res: Response) {
    const body = z
      .object({
        phone: z.string().min(4),
        days: z.coerce.number().min(1).max(60).optional(),
        timeOfDay: z.enum(["morning", "afternoon", "evening", "any"]).optional(),
      })
      .parse(req.body)

    const patient = await patientRepository.findByPhone(body.phone)
    const lang = patient?.language ?? "es"

    let slots = await appointmentService.getAvailableSlots(body.days, 30)
    const range = body.timeOfDay ? HOUR_RANGES[body.timeOfDay] : undefined
    if (range) {
      const [from, to] = range
      slots = slots.filter((s) => {
        const hour = new Date(s.startsAtIso).getUTCHours()
        return hour >= from && hour < to
      })
    }
    slots = slots.slice(0, 9)

    const text =
      slots.length === 0
        ? t(lang, "sharedNoSlotsAvailable")
        : t(lang, "sharedAvailableSlots", { slots: slots.map((s) => `• ${s.label}`).join("\n") })

    const { sent, messageId } = await pushWhatsappText(body.phone, text)
    res.json({ sent, messageId, slotsSent: slots.length })
  },

  /** Voice tool: caller asks "send me my appointment details on WhatsApp" mid-call. */
  async sendAppointmentDetailsOnWhatsapp(req: Request, res: Response) {
    const body = z.object({ phone: z.string().min(4) }).parse(req.body)

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
    res.json({ sent, messageId, appointmentsSent: appointments.length })
  },

  async escalate(req: Request, res: Response) {
    const body = z
      .object({
        phone: z.string().optional(),
        category: z.enum(["angry_patient", "medical_emergency", "complaint", "billing_dispute", "low_confidence", "other"]),
        reason: z.string().min(1),
        urgency: z.enum(["low", "normal", "high", "critical"]),
        callId: z.string().optional(),
      })
      .parse(req.body)

    let patientId: string | null = null
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
      metadata: { category: body.category, reason: body.reason, urgency: body.urgency, phone: body.phone ?? null },
    })

    res.status(201).json({ status: "ESCALATED" })
  },
}
