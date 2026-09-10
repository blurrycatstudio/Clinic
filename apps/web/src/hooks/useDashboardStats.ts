import { useQuery } from "@tanstack/react-query"
import { api } from "@/lib/api"
import { isSupabaseConfigured } from "@/lib/supabaseClient"

export type DashboardStats = {
  appointmentsToday: number
  appointmentsTrend: number
  activePatients: number
  patientsTrend: number
  incomingCalls: number
  callsTrend: number
  whatsappMessages: number
  whatsappTrend: number
  callingEnabled: boolean
}

const DEMO_STATS: DashboardStats = {
  appointmentsToday: 24,
  appointmentsTrend: 12,
  activePatients: 18,
  patientsTrend: 20,
  incomingCalls: 5,
  callsTrend: 25,
  whatsappMessages: 3,
  whatsappTrend: 1,
  callingEnabled: false,
}

async function fetchDashboardStats(): Promise<DashboardStats> {
  // Before Supabase/the API are wired up (or in a pure design preview), fall
  // back to demo numbers instead of showing a broken dashboard.
  if (!isSupabaseConfigured) {
    await new Promise((resolve) => setTimeout(resolve, 150))
    return DEMO_STATS
  }
  return api.get<DashboardStats>("/dashboard/stats")
}

export function useDashboardStats() {
  return useQuery({
    queryKey: ["dashboard-stats"],
    queryFn: fetchDashboardStats,
    staleTime: 60_000,
  })
}
