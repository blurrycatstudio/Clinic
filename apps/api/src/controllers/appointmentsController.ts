import type { Request, Response } from "express"
import { z } from "zod"
import { appointmentRepository } from "../repositories/appointmentRepository.js"
import { appointmentService } from "../services/appointmentService.js"
import { templateService } from "../services/templateService.js"
import { patientRepository } from "../repositories/patientRepository.js"
import { conversationRepository } from "../repositories/conversationRepository.js"
import { clinicSettingsRepository } from "../repositories/clinicSettingsRepository.js"
import { format } from "date-fns"
import { toZonedTime } from "date-fns-tz"
import { CLINIC_TIMEZONE } from "@clinic/shared"
import { ValidationError } from "../lib/errors.js"

export const appointmentsController = {
  async list(req: Request, res: Response) {
    const query = z
      .object({
        date: z.string().optional(),
        status: z.enum(["scheduled", "confirmed", "cancelled", "completed", "no_show"]).optional(),
        limit: z.coerce.number().min(1).max(200).optional(),
        offset: z.coerce.number().min(0).optional(),
      })
      .parse(req.query)

    const result = await appointmentRepository.listForDashboard(query)
    res.json(result)
  },

  async getSlots(req: Request, res: Response) {
    const query = z.object({ days: z.coerce.number().min(1).max(60).optional() }).parse(req.query)
    const slots = await appointmentService.getAvailableSlots(query.days)
    res.json({ slots })
  },

  async create(req: Request, res: Response) {
    const body = z
      .object({
        patientFullName: z.string().min(2),
        patientPhoneE164: z.string().min(8),
        reason: z.string().default(""),
        startsAtIso: z.string().datetime(),
      })
      .parse(req.body)

    const { appointment } = await appointmentService.bookAppointment({
      ...body,
      source: "dashboard",
    })
    await notifyPatient(appointment.id, "confirmed")

    res.status(201).json({ appointment })
  },

  async reschedule(req: Request, res: Response) {
    const params = z.object({ id: z.string().uuid() }).parse(req.params)
    const body = z.object({ startsAtIso: z.string().datetime() }).parse(req.body)

    const appointment = await appointmentService.rescheduleAppointment(params.id, body.startsAtIso)
    await notifyPatient(appointment.id, "rescheduled")
    res.json({ appointment })
  },

  async cancel(req: Request, res: Response) {
    const params = z.object({ id: z.string().uuid() }).parse(req.params)
    const body = z.object({ reason: z.string().optional() }).parse(req.body)

    const appointment = await appointmentService.cancelAppointment(params.id, body.reason)
    await notifyPatient(appointment.id, "cancelled")
    res.json({ appointment })
  },

  async updateStatus(req: Request, res: Response) {
    const params = z.object({ id: z.string().uuid() }).parse(req.params)
    const body = z
      .object({ status: z.enum(["scheduled", "confirmed", "cancelled", "completed", "no_show"]) })
      .parse(req.body)

    const appointment = await appointmentRepository.updateStatus(params.id, body.status)
    res.json({ appointment })
  },
}

/** Staff-initiated changes from the dashboard also notify the patient over WhatsApp. */
async function notifyPatient(appointmentId: string, kind: "confirmed" | "rescheduled" | "cancelled"): Promise<void> {
  const appointment = await appointmentRepository.findById(appointmentId)
  if (!appointment) throw new ValidationError("Appointment not found")

  const patient = await patientRepository.findById(appointment.patient_id)
  if (!patient) return

  const conversation = await conversationRepository.getOrCreate(patient.phone_e164)
  const zoned = toZonedTime(new Date(appointment.starts_at), CLINIC_TIMEZONE)
  const date = format(zoned, "EEEE d MMMM")
  const time = format(zoned, "h:mm a")

  if (kind === "confirmed") {
    await templateService.send({
      key: "appointmentConfirmation",
      to: patient.phone_e164,
      conversationId: conversation.id,
      language: patient.language,
      params: [patient.full_name, date, time, (await clinicSettingsRepository.get()).doctor_name],
      sessionFallbackText:
        patient.language === "es"
          ? `Tu cita fue agendada para el ${date} a las ${time}.`
          : `Your appointment was booked for ${date} at ${time}.`,
    })
  } else if (kind === "rescheduled") {
    await templateService.send({
      key: "appointmentRescheduled",
      to: patient.phone_e164,
      conversationId: conversation.id,
      language: patient.language,
      params: [patient.full_name, date, time],
      sessionFallbackText:
        patient.language === "es"
          ? `Tu cita fue reprogramada para el ${date} a las ${time}.`
          : `Your appointment was moved to ${date} at ${time}.`,
    })
  } else {
    await templateService.send({
      key: "appointmentCancelled",
      to: patient.phone_e164,
      conversationId: conversation.id,
      language: patient.language,
      params: [patient.full_name, date, time],
      sessionFallbackText:
        patient.language === "es"
          ? `Tu cita del ${date} a las ${time} fue cancelada por la clínica.`
          : `Your appointment on ${date} at ${time} was cancelled by the clinic.`,
    })
  }
}
