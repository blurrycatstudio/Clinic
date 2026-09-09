import type { Consultation } from "@clinic/shared"
import { supabase } from "../config/supabase.js"
import { AppError, NotFoundError } from "../lib/errors.js"

export const consultationRepository = {
  async list(params: { patientId?: string; limit?: number; offset?: number }) {
    let query = supabase.from("consultations").select("*, patients(full_name)", { count: "exact" }).order("created_at", { ascending: false })
    if (params.patientId) query = query.eq("patient_id", params.patientId)
    const limit = params.limit ?? 50
    const offset = params.offset ?? 0
    query = query.range(offset, offset + limit - 1)

    const { data, error, count } = await query
    if (error) throw new AppError(`Failed to list consultations: ${error.message}`)
    return { rows: data ?? [], count: count ?? 0 }
  },

  async findById(id: string): Promise<Consultation | null> {
    const { data, error } = await supabase.from("consultations").select("*").eq("id", id).maybeSingle()
    if (error) throw new AppError(`Failed to load consultation: ${error.message}`)
    return data
  },

  async create(input: {
    patientId: string
    appointmentId?: string | null
    chiefComplaint: string
    diagnosis: string
    notes: string
    weightKg?: number | null
    heightCm?: number | null
    temperatureC?: number | null
  }): Promise<Consultation> {
    const { data, error } = await supabase
      .from("consultations")
      .insert({
        patient_id: input.patientId,
        appointment_id: input.appointmentId ?? null,
        chief_complaint: input.chiefComplaint,
        diagnosis: input.diagnosis,
        notes: input.notes,
        weight_kg: input.weightKg ?? null,
        height_cm: input.heightCm ?? null,
        temperature_c: input.temperatureC ?? null,
      })
      .select("*")
      .single()
    if (error) throw new AppError(`Failed to create consultation: ${error.message}`)

    const created = await this.findById(data.id)
    if (!created) throw new NotFoundError("Consultation not found after creation")
    return created
  },
}
