import { addDays, addMinutes, format, isBefore, parse, startOfDay } from "date-fns"
import { fromZonedTime, toZonedTime } from "date-fns-tz"
import { BOOKING_HORIZON_DAYS, CLINIC_TIMEZONE, type Appointment, type DoctorScheduleDay } from "@clinic/shared"
import { appointmentRepository } from "../repositories/appointmentRepository.js"
import { doctorScheduleRepository } from "../repositories/doctorScheduleRepository.js"
import { patientRepository } from "../repositories/patientRepository.js"
import { auditLogRepository } from "../repositories/auditLogRepository.js"
import { ValidationError } from "../lib/errors.js"

export type AvailableSlot = { startsAtIso: string; label: string }

/** Generates every open (unbooked, in-the-future, not-on-break) 30-min slot for a single clinic day. */
function slotsForDay(
  dayInClinic: Date,
  scheduleByWeekday: Map<number, DoctorScheduleDay>,
  bookedStarts: Set<number>,
  now: Date,
): AvailableSlot[] {
  const weekday = dayInClinic.getDay()
  const day = scheduleByWeekday.get(weekday)
  if (!day || !day.is_active) return []

  const dayStr = format(dayInClinic, "yyyy-MM-dd")
  const dayStart = fromZonedTime(`${dayStr}T${day.start_time}`, CLINIC_TIMEZONE)
  const dayEnd = fromZonedTime(`${dayStr}T${day.end_time}`, CLINIC_TIMEZONE)
  const breakStart = day.break_start_time ? fromZonedTime(`${dayStr}T${day.break_start_time}`, CLINIC_TIMEZONE) : null
  const breakEnd = day.break_end_time ? fromZonedTime(`${dayStr}T${day.break_end_time}`, CLINIC_TIMEZONE) : null

  const slots: AvailableSlot[] = []
  let cursor = dayStart
  while (isBefore(addMinutes(cursor, 30), addMinutes(dayEnd, 1))) {
    const slotEnd = addMinutes(cursor, 30)
    const overlapsBreak = breakStart && breakEnd && isBefore(cursor, breakEnd) && isBefore(breakStart, slotEnd)
    const isPast = isBefore(cursor, now)
    const isBooked = bookedStarts.has(cursor.getTime())

    if (!overlapsBreak && !isPast && !isBooked) {
      slots.push({ startsAtIso: cursor.toISOString(), label: formatSlotLabel(cursor) })
    }
    cursor = slotEnd
  }
  return slots
}

/**
 * 100% deterministic scheduling logic — no AI involved anywhere in this
 * file. Slots are generated from doctor_schedule, booked appointments are
 * excluded, and the DB's partial unique index is the final guard against a
 * race between two patients grabbing the same slot at once.
 */
export const appointmentService = {
  /** `offset` skips the earliest N open slots — used for the "See more dates" button, which pages forward instead of re-showing the same first slots. */
  async getAvailableSlots(daysAhead = BOOKING_HORIZON_DAYS, maxSlotsReturned = 9, offset = 0): Promise<AvailableSlot[]> {
    const totalNeeded = offset + maxSlotsReturned
    const schedule = await doctorScheduleRepository.getWeeklySchedule()
    const scheduleByWeekday = new Map(schedule.map((d) => [d.weekday, d]))

    const now = new Date()
    const nowInClinic = toZonedTime(now, CLINIC_TIMEZONE)
    const horizonStart = startOfDay(nowInClinic)
    const horizonEnd = addDays(horizonStart, daysAhead + 1)

    // Single range query for the whole horizon instead of one Supabase round trip
    // per active clinic day — with a 60-day horizon that was up to ~50 sequential
    // network calls before the bot could even list slots.
    const existing = await appointmentRepository.listBetween(horizonStart.toISOString(), horizonEnd.toISOString())
    const bookedStarts = new Set(existing.map((a) => new Date(a.starts_at).getTime()))

    const slots: AvailableSlot[] = []

    for (let dayOffset = 0; dayOffset <= daysAhead && slots.length < totalNeeded * 4; dayOffset++) {
      const dayInClinic = addDays(horizonStart, dayOffset)
      slots.push(...slotsForDay(dayInClinic, scheduleByWeekday, bookedStarts, now))
      if (slots.length >= totalNeeded) break
    }

    return slots.slice(offset, totalNeeded)
  },

  /** All open slots on one specific clinic-local day — used for "what's open on the 14th?" and for a booking request with a date but no explicit time. */
  async getSlotsOnDate(dateInClinic: Date): Promise<AvailableSlot[]> {
    const schedule = await doctorScheduleRepository.getWeeklySchedule()
    const scheduleByWeekday = new Map(schedule.map((d) => [d.weekday, d]))

    const now = new Date()
    const dayStart = startOfDay(toZonedTime(dateInClinic, CLINIC_TIMEZONE))
    const dayEnd = addDays(dayStart, 1)

    const existing = await appointmentRepository.listBetween(dayStart.toISOString(), dayEnd.toISOString())
    const bookedStarts = new Set(existing.map((a) => new Date(a.starts_at).getTime()))

    return slotsForDay(dayStart, scheduleByWeekday, bookedStarts, now)
  },

  async bookAppointment(input: {
    patientFullName: string
    patientPhoneE164: string
    reason: string
    startsAtIso: string
    source: "whatsapp" | "voice" | "dashboard"
    language?: "en" | "es"
  }): Promise<{ appointment: Appointment; patientId: string }> {
    const startsAt = new Date(input.startsAtIso)
    const endsAt = addMinutes(startsAt, 30)

    const patient = await patientRepository.upsertByPhone({
      phoneE164: input.patientPhoneE164,
      fullName: input.patientFullName,
      language: input.language,
    })

    const appointment = await appointmentRepository.create({
      patientId: patient.id,
      startsAtIso: startsAt.toISOString(),
      endsAtIso: endsAt.toISOString(),
      reason: input.reason,
      source: input.source,
    })

    await auditLogRepository.record({
      actorType: input.source === "dashboard" ? "staff" : "patient",
      actorId: patient.id,
      action: "appointment.created",
      entityType: "appointment",
      entityId: appointment.id,
      metadata: { source: input.source, startsAt: appointment.starts_at },
    })

    return { appointment, patientId: patient.id }
  },

  async rescheduleAppointment(appointmentId: string, newStartsAtIso: string): Promise<Appointment> {
    const newStartsAt = new Date(newStartsAtIso)
    const newEndsAt = addMinutes(newStartsAt, 30)
    const updated = await appointmentRepository.reschedule(appointmentId, newStartsAt.toISOString(), newEndsAt.toISOString())

    await auditLogRepository.record({
      actorType: "patient",
      action: "appointment.rescheduled",
      entityType: "appointment",
      entityId: appointmentId,
      metadata: { newStartsAt: updated.starts_at },
    })

    return updated
  },

  async confirmAppointment(appointmentId: string): Promise<Appointment> {
    const updated = await appointmentRepository.updateStatus(appointmentId, "confirmed")

    await auditLogRepository.record({
      actorType: "patient",
      action: "appointment.confirmed",
      entityType: "appointment",
      entityId: appointmentId,
    })

    return updated
  },

  async cancelAppointment(appointmentId: string, reason?: string): Promise<Appointment> {
    const updated = await appointmentRepository.cancel(appointmentId, reason)

    await auditLogRepository.record({
      actorType: "patient",
      action: "appointment.cancelled",
      entityType: "appointment",
      entityId: appointmentId,
      metadata: { reason: reason ?? null },
    })

    return updated
  },

  async findActiveAppointmentsForPhone(phoneE164: string): Promise<Appointment[]> {
    const patient = await patientRepository.findByPhone(phoneE164)
    if (!patient) return []
    return appointmentRepository.listUpcomingForPatient(patient.id)
  },

  validateSlotSelection(slots: AvailableSlot[], index: number): AvailableSlot {
    const slot = slots[index]
    if (!slot) throw new ValidationError("Invalid slot selection")
    return slot
  },
}

function formatSlotLabel(date: Date): string {
  const zoned = toZonedTime(date, CLINIC_TIMEZONE)
  return format(zoned, "EEE d MMM, h:mm a")
}

/** Parses a "yyyy-MM-dd HH:mm" clinic-local string into a UTC Date. Exposed for cron/tests. */
export function clinicLocalToUtc(dateStr: string, timeStr: string): Date {
  const parsed = parse(`${dateStr} ${timeStr}`, "yyyy-MM-dd HH:mm", new Date())
  return fromZonedTime(parsed, CLINIC_TIMEZONE)
}
