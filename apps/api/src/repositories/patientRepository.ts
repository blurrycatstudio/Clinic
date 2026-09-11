import type { Patient } from "@clinic/shared"
import { supabase } from "../config/supabase.js"
import { AppError } from "../lib/errors.js"

export const patientRepository = {
  async findByPhone(phoneE164: string): Promise<Patient | null> {
    const { data, error } = await supabase.from("patients").select("*").eq("phone_e164", phoneE164).maybeSingle()
    if (error) throw new AppError(`Failed to look up patient: ${error.message}`)
    return data
  },

  async findById(id: string): Promise<Patient | null> {
    const { data, error } = await supabase.from("patients").select("*").eq("id", id).maybeSingle()
    if (error) throw new AppError(`Failed to load patient: ${error.message}`)
    return data
  },

  async upsertByPhone(input: {
    phoneE164: string
    fullName: string
    language?: "en" | "es"
    dateOfBirth?: string | null
    notes?: string | null
  }): Promise<Patient> {
    const existing = await this.findByPhone(input.phoneE164)
    if (existing) {
      const { data, error } = await supabase
        .from("patients")
        .update({
          full_name: input.fullName,
          ...(input.language ? { language: input.language } : {}),
          ...(input.dateOfBirth !== undefined ? { date_of_birth: input.dateOfBirth } : {}),
          ...(input.notes !== undefined ? { notes: input.notes } : {}),
        })
        .eq("id", existing.id)
        .select("*")
        .single()
      if (error) throw new AppError(`Failed to update patient: ${error.message}`)
      return data
    }

    const { data, error } = await supabase
      .from("patients")
      .insert({
        phone_e164: input.phoneE164,
        full_name: input.fullName,
        language: input.language ?? "es",
        date_of_birth: input.dateOfBirth ?? null,
        notes: input.notes ?? null,
      })
      .select("*")
      .single()
    if (error) throw new AppError(`Failed to create patient: ${error.message}`)
    return data
  },

  async updateBasicInfo(
    id: string,
    input: {
      fullName?: string
      phoneE164?: string
      dateOfBirth?: string | null
      language?: "en" | "es"
      notes?: string | null
    },
  ): Promise<Patient> {
    const { data, error } = await supabase
      .from("patients")
      .update({
        ...(input.fullName !== undefined ? { full_name: input.fullName } : {}),
        ...(input.phoneE164 !== undefined ? { phone_e164: input.phoneE164 } : {}),
        ...(input.dateOfBirth !== undefined ? { date_of_birth: input.dateOfBirth } : {}),
        ...(input.language !== undefined ? { language: input.language } : {}),
        ...(input.notes !== undefined ? { notes: input.notes } : {}),
      })
      .eq("id", id)
      .select("*")
      .single()
    if (error) throw new AppError(`Failed to update patient: ${error.message}`)
    return data
  },

  async updateClinicalInfo(
    id: string,
    input: { allergies?: string[]; currentMedications?: string[] },
  ): Promise<Patient> {
    const { data, error } = await supabase
      .from("patients")
      .update({
        ...(input.allergies !== undefined ? { allergies: input.allergies } : {}),
        ...(input.currentMedications !== undefined ? { current_medications: input.currentMedications } : {}),
      })
      .eq("id", id)
      .select("*")
      .single()
    if (error) throw new AppError(`Failed to update patient: ${error.message}`)
    return data
  },

  async list(params: { search?: string; limit?: number; offset?: number }): Promise<{ rows: Patient[]; count: number }> {
    let query = supabase.from("patients").select("*", { count: "exact" }).order("created_at", { ascending: false })
    if (params.search) {
      query = query.or(`full_name.ilike.%${params.search}%,phone_e164.ilike.%${params.search}%`)
    }
    const limit = params.limit ?? 25
    const offset = params.offset ?? 0
    query = query.range(offset, offset + limit - 1)

    const { data, error, count } = await query
    if (error) throw new AppError(`Failed to list patients: ${error.message}`)
    return { rows: data ?? [], count: count ?? 0 }
  },
}
