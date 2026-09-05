import { createClient } from "@supabase/supabase-js"

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

/**
 * Staff sign-in for the dashboard only — patients never touch Supabase Auth,
 * they interact purely through WhatsApp. If these env vars aren't set yet
 * (e.g. running the UI standalone before Supabase is provisioned), auth
 * calls fail gracefully instead of crashing the app at import time.
 */
export const supabase =
  url && anonKey
    ? createClient(url, anonKey)
    : null

export const isSupabaseConfigured = Boolean(url && anonKey)
