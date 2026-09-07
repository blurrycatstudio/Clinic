import type { ClinicSettings } from "@clinic/shared"
import { supabase } from "../config/supabase.js"
import { AppError, NotFoundError } from "../lib/errors.js"

const CACHE_TTL_MS = 60_000
let cached: { value: ClinicSettings; expiresAt: number } | null = null

export const clinicSettingsRepository = {
  // Settings change only from the staff dashboard and are read on every single
  // inbound WhatsApp message — cache in-process for a short TTL instead of a
  // Supabase round trip per message. The warm serverless instance keeps this
  // between invocations; a stale read for up to a minute after an edit is fine.
  async get(): Promise<ClinicSettings> {
    if (cached && cached.expiresAt > Date.now()) return cached.value

    const { data, error } = await supabase.from("clinic_settings").select("*").limit(1).maybeSingle()
    if (error) throw new AppError(`Failed to load clinic settings: ${error.message}`)
    if (!data) throw new NotFoundError("Clinic settings have not been seeded yet")

    cached = { value: data, expiresAt: Date.now() + CACHE_TTL_MS }
    return data
  },

  async update(id: string, patch: Partial<ClinicSettings>): Promise<ClinicSettings> {
    const { data, error } = await supabase.from("clinic_settings").update(patch).eq("id", id).select("*").single()
    if (error) throw new AppError(`Failed to update clinic settings: ${error.message}`)
    cached = { value: data, expiresAt: Date.now() + CACHE_TTL_MS }
    return data
  },
}
