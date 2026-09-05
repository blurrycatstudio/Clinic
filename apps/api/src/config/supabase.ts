import { createClient } from "@supabase/supabase-js"
import { env } from "./env.js"

/**
 * Service-role client. Only ever used server-side — bypasses RLS entirely,
 * so every repository function here is the actual authorization boundary.
 * Never send this key to the browser.
 */
export const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
})
