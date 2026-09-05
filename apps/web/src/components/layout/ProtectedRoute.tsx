import { Navigate, Outlet } from "react-router-dom"
import { useAuth } from "@/lib/useAuth"
import { isSupabaseConfigured } from "@/lib/supabaseClient"

/**
 * Gates the dashboard behind Supabase Auth. Before Supabase is provisioned
 * (isSupabaseConfigured === false), the guard is a no-op so the UI stays
 * previewable during setup — remove that fallback once real credentials
 * are in place if you want the dashboard to be unreachable without them.
 */
export function ProtectedRoute() {
  const { session, loading } = useAuth()

  if (!isSupabaseConfigured) return <Outlet />
  if (loading) return null
  if (!session) return <Navigate to="/login" replace />
  return <Outlet />
}
