import type { Request, Response } from "express"
import { z } from "zod"
import { appointmentService } from "../services/appointmentService.js"
import { appointmentRepository } from "../repositories/appointmentRepository.js"
import { patientRepository } from "../repositories/patientRepository.js"
import { clinicSettingsRepository } from "../repositories/clinicSettingsRepository.js"
import { whatsappService } from "../services/whatsappService.js"
import { auditLogRepository } from "../repositories/auditLogRepository.js"
import { notifyPatientOfAppointmentChange } from "../services/notificationService.js"
import { logger } from "../config/logger.js"
import { ValidationError } from "../lib/errors.js"

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

    const hourRanges: Record<string, [number, number]> = {
      morning: [0, 12],
      afternoon: [12, 17],
      evening: [17, 24],
    }

    let slots = await appointmentService.getAvailableSlots(query.days, 30)

    const range = query.timeOfDay ? hourRanges[query.timeOfDay] : undefined
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
