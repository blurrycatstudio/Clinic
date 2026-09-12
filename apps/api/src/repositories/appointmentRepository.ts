import type { Appointment, AppointmentStatus, Patient } from "@clinic/shared"
import { CLINIC_TIMEZONE } from "@clinic/shared"
import { fromZonedTime } from "date-fns-tz"
import { supabase } from "../config/supabase.js"
import { AppError, ConflictError, NotFoundError } from "../lib/errors.js"

const DOCTOR_ID = "default-doctor"

export const appointmentRepository = {
  async findById(id: string): Promise<Appointment | null> {
    const { data, error } = await supabase.from("appointments").select("*").eq("id", id).maybeSingle()
    if (error) throw new AppError(`Failed to load appointment: ${error.message}`)
    return data
  },

  /** Single appointment + its patient in one round trip — avoids fetching the whole list to look up one row. */
  async findByIdWithPatient(id: string): Promise<(Appointment & { patients: Patient | null }) | null> {
    const { data, error } = await supabase.from("appointments").select("*, patients(*)").eq("id", id).maybeSingle()
    if (error) throw new AppError(`Failed to load appointment: ${error.message}`)
    return data as never
  },

  async listUpcomingForPatient(patientId: string): Promise<Appointment[]> {
    const { data, error } = await supabase
      .from("appointments")
      .select("*")
      .eq("patient_id", patientId)
      .in("status", ["scheduled", "confirmed"])
      .gte("starts_at", new Date().toISOString())
      .order("starts_at", { ascending: true })
    if (error) throw new AppError(`Failed to list appointments: ${error.message}`)
    return data ?? []
  },

  /** Most recent appointment regardless of status, purely to recall context like the visit reason. */
  async findMostRecentForPatient(patientId: string): Promise<Appointment | null> {
    const { data, error } = await supabase
      .from("appointments")
      .select("*")
      .eq("patient_id", patientId)
      .order("starts_at", { ascending: false })
      .limit(1)
      .maybeSingle()
    if (error) throw new AppError(`Failed to load most recent appointment: ${error.message}`)
    return data
  },

  async listBetween(startIso: string, endIso: string): Promise<Appointment[]> {
    const { data, error } = await supabase
      .from("appointments")
      .select("*")
      .eq("doctor_id", DOCTOR_ID)
      .in("status", ["scheduled", "confirmed"])
      .gte("starts_at", startIso)
      .lt("starts_at", endIso)
      .order("starts_at", { ascending: true })
    if (error) throw new AppError(`Failed to list appointments: ${error.message}`)
    return data ?? []
  },

  async listForDashboard(params: {
    date?: string
    status?: AppointmentStatus
    limit?: number
    offset?: number
  }): Promise<{ rows: (Appointment & { patients: { full_name: string; phone_e164: string } | null })[]; count: number }> {
    // No frontend caller reads the returned `count`, so skip Postgres's exact
    // COUNT(*) — it's a full scan on every poll and was the main cost here.
    let query = supabase
      .from("appointments")
      .select("*, patients(full_name, phone_e164)")
      .order("starts_at", { ascending: true })

    if (params.date) {
      const dayStart = fromZonedTime(`${params.date}T00:00:00.000`, CLINIC_TIMEZONE).toISOString()
      const dayEnd = fromZonedTime(`${params.date}T23:59:59.999`, CLINIC_TIMEZONE).toISOString()
      query = query.gte("starts_at", dayStart).lte("starts_at", dayEnd)
    }
    if (params.status) {
      query = query.eq("status", params.status)
    }
    const limit = params.limit ?? 50
    const offset = params.offset ?? 0
    query = query.range(offset, offset + limit - 1)

    const { data, error, count } = await query
    if (error) throw new AppError(`Failed to list appointments: ${error.message}`)
    return { rows: (data as never) ?? [], count: count ?? 0 }
  },

  /**
   * Creates an appointment, relying on the DB's partial unique index
   * (doctor_id, starts_at) WHERE status in ('scheduled','confirmed') as the
   * final race-condition guard — the availability check in appointmentService
   * is what makes double-booking rare, this is what makes it impossible.
   */
  async create(input: {
    patientId: string
    startsAtIso: string
    endsAtIso: string
    reason: string
    source: "whatsapp" | "voice" | "dashboard"
  }): Promise<Appointment> {
    const { data, error } = await supabase
      .from("appointments")
      .insert({
        patient_id: input.patientId,
        doctor_id: DOCTOR_ID,
        starts_at: input.startsAtIso,
        ends_at: input.endsAtIso,
        reason: input.reason,
        status: "scheduled",
        source: input.source,
      })
      .select("*")
      .single()

    if (error) {
      if (error.code === "23505") {
        throw new ConflictError("That time slot was just booked by someone else. Please choose another.")
      }
      throw new AppError(`Failed to create appointment: ${error.message}`)
    }
    return data
  },

  async reschedule(id: string, startsAtIso: string, endsAtIso: string): Promise<Appointment> {
    const { data, error } = await supabase
      .from("appointments")
      .update({ starts_at: startsAtIso, ends_at: endsAtIso, status: "scheduled" })
      .eq("id", id)
      .select("*")
      .single()

    if (error) {
      if (error.code === "23505") {
        throw new ConflictError("That time slot was just booked by someone else. Please choose another.")
      }
      throw new AppError(`Failed to reschedule appointment: ${error.message}`)
    }
    if (!data) throw new NotFoundError("Appointment not found")
    return data
  },

  async cancel(id: string, reason?: string): Promise<Appointment> {
    const { data, error } = await supabase
      .from("appointments")
      .update({ status: "cancelled", cancelled_reason: reason ?? null })
      .eq("id", id)
      .select("*")
      .single()
    if (error) throw new AppError(`Failed to cancel appointment: ${error.message}`)
    if (!data) throw new NotFoundError("Appointment not found")
    return data
  },

  async updateStatus(id: string, status: AppointmentStatus): Promise<Appointment> {
    const { data, error } = await supabase.from("appointments").update({ status }).eq("id", id).select("*").single()
    if (error) throw new AppError(`Failed to update appointment: ${error.message}`)
    if (!data) throw new NotFoundError("Appointment not found")
    return data
  },

  async markReminderSent(id: string, which: "24h" | "2h"): Promise<void> {
    const column = which === "24h" ? "reminder_24h_sent_at" : "reminder_2h_sent_at"
    const { error } = await supabase.from("appointments").update({ [column]: new Date().toISOString() }).eq("id", id)
    if (error) throw new AppError(`Failed to mark reminder sent: ${error.message}`)
  },

  /** Appointments starting within [fromIso, toIso) that haven't had this reminder sent yet. */
  async listNeedingReminder(which: "24h" | "2h", fromIso: string, toIso: string): Promise<Appointment[]> {
    const column = which === "24h" ? "reminder_24h_sent_at" : "reminder_2h_sent_at"
    const { data, error } = await supabase
      .from("appointments")
      .select("*")
      .in("status", ["scheduled", "confirmed"])
      .is(column, null)
      .gte("starts_at", fromIso)
      .lt("starts_at", toIso)
    if (error) throw new AppError(`Failed to list appointments needing reminders: ${error.message}`)
    return data ?? []
  },

  async markCallReminderSent(id: string): Promise<void> {
    const { error } = await supabase
      .from("appointments")
      .update({ reminder_call_sent_at: new Date().toISOString() })
      .eq("id", id)
    if (error) throw new AppError(`Failed to mark call reminder sent: ${error.message}`)
  },

  /** Appointments starting within [fromIso, toIso) that haven't had a reminder CALL placed yet. */
  async listNeedingCallReminder(fromIso: string, toIso: string): Promise<Appointment[]> {
    const { data, error } = await supabase
      .from("appointments")
      .select("*")
      .in("status", ["scheduled", "confirmed"])
      .is("reminder_call_sent_at", null)
      .gte("starts_at", fromIso)
      .lt("starts_at", toIso)
    if (error) throw new AppError(`Failed to list appointments needing call reminders: ${error.message}`)
    return data ?? []
  },
}

export const DEFAULT_DOCTOR_ID = DOCTOR_ID
