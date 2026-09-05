import type { Request, Response } from "express"
import { supabase } from "../config/supabase.js"
import { AppError } from "../lib/errors.js"

/**
 * Backs the web dashboard's `useDashboardStats` hook. Kept as a handful of
 * cheap count queries rather than a materialized view, since a
 * single-doctor clinic's data volume never justifies the added complexity.
 */
export const dashboardController = {
  async getStats(_req: Request, res: Response) {
    const startOfToday = new Date()
    startOfToday.setHours(0, 0, 0, 0)
    const endOfToday = new Date(startOfToday)
    endOfToday.setDate(endOfToday.getDate() + 1)

    const yesterdayStart = new Date(startOfToday)
    yesterdayStart.setDate(yesterdayStart.getDate() - 1)

    const [todayAppts, yesterdayAppts, activePatients, todayWaMessages, todayCalls] = await Promise.all([
      count(
        supabase
          .from("appointments")
          .select("*", { count: "exact", head: true })
          .gte("starts_at", startOfToday.toISOString())
          .lt("starts_at", endOfToday.toISOString())
          .neq("status", "cancelled"),
      ),
      count(
        supabase
          .from("appointments")
          .select("*", { count: "exact", head: true })
          .gte("starts_at", yesterdayStart.toISOString())
          .lt("starts_at", startOfToday.toISOString())
          .neq("status", "cancelled"),
      ),
      count(supabase.from("patients").select("*", { count: "exact", head: true })),
      count(
        supabase
          .from("whatsapp_messages")
          .select("*", { count: "exact", head: true })
          .gte("created_at", startOfToday.toISOString())
          .lt("created_at", endOfToday.toISOString()),
      ),
      count(
        supabase
          .from("voice_calls")
          .select("*", { count: "exact", head: true })
          .gte("started_at", startOfToday.toISOString())
          .lt("started_at", endOfToday.toISOString()),
      ),
    ])

    res.json({
      appointmentsToday: todayAppts,
      appointmentsTrend: percentChange(yesterdayAppts, todayAppts),
      activePatients,
      patientsTrend: 0,
      incomingCalls: todayCalls,
      callsTrend: 0,
      whatsappMessages: todayWaMessages,
      whatsappTrend: 0,
    })
  },
}

async function count(query: PromiseLike<{ count: number | null; error: { message: string } | null }>): Promise<number> {
  const { count: value, error } = await query
  if (error) throw new AppError(`Failed to compute dashboard stat: ${error.message}`)
  return value ?? 0
}

function percentChange(previous: number, current: number): number {
  if (previous === 0) return current > 0 ? 100 : 0
  return Math.round(((current - previous) / previous) * 100)
}
