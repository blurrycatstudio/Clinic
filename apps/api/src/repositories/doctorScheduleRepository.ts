import type { DoctorScheduleDay } from "@clinic/shared"
import { supabase } from "../config/supabase.js"
import { AppError } from "../lib/errors.js"
import { DEFAULT_DOCTOR_ID } from "./appointmentRepository.js"

export const doctorScheduleRepository = {
  async getWeeklySchedule(): Promise<DoctorScheduleDay[]> {
    const { data, error } = await supabase
      .from("doctor_schedule")
      .select("*")
      .eq("doctor_id", DEFAULT_DOCTOR_ID)
      .order("weekday", { ascending: true })
    if (error) throw new AppError(`Failed to load doctor schedule: ${error.message}`)
    return data ?? []
  },
}
