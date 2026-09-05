import type { ClinicSettings } from "@clinic/shared"
import { supabase } from "../config/supabase.js"
import { AppError, NotFoundError } from "../lib/errors.js"

export const clinicSettingsRepository = {
  async get(): Promise<ClinicSettings> {
    const { data, error } = await supabase.from("clinic_settings").select("*").limit(1).maybeSingle()
    if (error) throw new AppError(`Failed to load clinic settings: ${error.message}`)
    if (!data) throw new NotFoundError("Clinic settings have not been seeded yet")
    return data
  },

  async update(id: string, patch: Partial<ClinicSettings>): Promise<ClinicSettings> {
    const { data, error } = await supabase.from("clinic_settings").update(patch).eq("id", id).select("*").single()
    if (error) throw new AppError(`Failed to update clinic settings: ${error.message}`)
    return data
  },
}
