import type { Request, Response } from "express"
import { z } from "zod"
import { appointmentRepository } from "../repositories/appointmentRepository.js"
import { appointmentService } from "../services/appointmentService.js"
import { notifyPatientOfAppointmentChange } from "../services/notificationService.js"
import { patientRepository } from "../repositories/patientRepository.js"
import { voiceCallRepository } from "../repositories/voiceCallRepository.js"
import { messageRepository } from "../repositories/messageRepository.js"
import { vapiService } from "../services/vapiService.js"
import { sendReminderNow } from "../cron/reminders.js"
import { env } from "../config/env.js"
import { NotFoundError } from "../lib/errors.js"
import { buildReminderCallOverrides } from "../lib/reminderCallGreeting.js"
import { clinicSettingsRepository } from "../repositories/clinicSettingsRepository.js"

/**
 * Groups a flat list of calls/messages by appointment_id into a count + the most
 * recent row's status — rows must already be in ascending chronological order, so
 * whichever row is seen last for an appointment is the latest one.
 */
function summarizeByAppointment<T, S>(
  rows: T[],
  getAppointmentId: (row: T) => string | null,
  getStatus: (row: T) => S,
): Map<string, { count: number; lastStatus: S | null }> {
  const summaries = new Map<string, { count: number; lastStatus: S | null }>()
  for (const row of rows) {
    const appointmentId = getAppointmentId(row)
    if (!appointmentId) continue
    const existing = summaries.get(appointmentId) ?? { count: 0, lastStatus: null }
    existing.count += 1
    existing.lastStatus = getStatus(row)
    summaries.set(appointmentId, existing)
  }
  return summaries
}

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
    const ids = result.rows.map((a) => a.id)
    const [calls, messages] = await Promise.all([
      voiceCallRepository.listForAppointmentIds(ids),
      messageRepository.listForAppointmentIds(ids),
    ])

    const callSummaries = summarizeByAppointment(calls, (c) => c.appointment_id, (c) => c.status)
    const messageSummaries = summarizeByAppointment(messages, (m) => m.appointment_id, (m) => m.status)

    const rows = result.rows.map((a) => ({
      ...a,
      callsSummary: callSummaries.get(a.id) ?? { count: 0, lastStatus: null },
      messagesSummary: messageSummaries.get(a.id) ?? { count: 0, lastStatus: null },
    }))

    res.json({ ...result, rows })
  },

  /** Single appointment with its patient joined in — used by the mobile consultation screen to skip a full-list fetch. */
  async getOne(req: Request, res: Response) {
    const params = z.object({ id: z.string().uuid() }).parse(req.params)
    const appointment = await appointmentRepository.findByIdWithPatient(params.id)
    if (!appointment) throw new NotFoundError("Appointment not found")
    res.json({ appointment })
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
    if (body.status === "confirmed") {
      await notifyPatientOfAppointmentChange(appointment.id, "confirmed")
    }
    res.json({ appointment })
  },

  /** Staff-triggered "call to confirm" — places a real outbound call to the patient about this appointment. */
  async callToConfirm(req: Request, res: Response) {
    const params = z.object({ id: z.string().uuid() }).parse(req.params)

    const appointment = await appointmentRepository.findById(params.id)
    if (!appointment) throw new NotFoundError("Appointment not found")
    const patient = await patientRepository.findById(appointment.patient_id)
    if (!patient) throw new NotFoundError("Patient not found")
    const settings = await clinicSettingsRepository.get()

    const { vapiCallId } = await vapiService.createOutboundCall({
      phoneE164: patient.phone_e164,
      assistantId: env.VAPI_REMINDER_ASSISTANT_ID || undefined,
      metadata: { appointmentId: appointment.id, purpose: "appointment_confirmation" },
      assistantOverrides: buildReminderCallOverrides(patient, appointment, settings),
    })
    const call = await voiceCallRepository.create({
      vapiCallId,
      phoneE164: patient.phone_e164,
      direction: "outbound",
      patientId: patient.id,
      appointmentId: appointment.id,
    })

    res.status(201).json({ call })
  },

  /** Staff-triggered manual reminder send — bypasses the cron time-window so it can go out any time. */
  async sendReminder(req: Request, res: Response) {
    const params = z.object({ id: z.string().uuid() }).parse(req.params)
    const body = z.object({ which: z.enum(["24h", "2h"]).default("24h") }).parse(req.body)

    await sendReminderNow(params.id, body.which)

    res.status(200).json({ ok: true })
  },
}
