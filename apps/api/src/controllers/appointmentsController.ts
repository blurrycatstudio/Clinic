import type { Request, Response } from "express"
import { z } from "zod"
import { appointmentRepository } from "../repositories/appointmentRepository.js"
import { appointmentService } from "../services/appointmentService.js"
import { notifyPatientOfAppointmentChange } from "../services/notificationService.js"

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
    await notifyPatientOfAppointmentChange(appointment.id, "confirmed")

    res.status(201).json({ appointment })
  },

  async reschedule(req: Request, res: Response) {
    const params = z.object({ id: z.string().uuid() }).parse(req.params)
    const body = z.object({ startsAtIso: z.string().datetime() }).parse(req.body)

    const appointment = await appointmentService.rescheduleAppointment(params.id, body.startsAtIso)
    await notifyPatientOfAppointmentChange(appointment.id, "rescheduled")
    res.json({ appointment })
  },

  async cancel(req: Request, res: Response) {
    const params = z.object({ id: z.string().uuid() }).parse(req.params)
    const body = z.object({ reason: z.string().optional() }).parse(req.body)

    const appointment = await appointmentService.cancelAppointment(params.id, body.reason)
    await notifyPatientOfAppointmentChange(appointment.id, "cancelled")
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
