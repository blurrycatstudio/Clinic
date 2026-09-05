/**
 * Single source of truth for clinic business rules referenced by both
 * the API (booking engine) and the web dashboard (display only).
 * The authoritative, editable copy of these values lives in the
 * `clinic_settings` / `doctor_schedule` DB tables — these are the
 * fallback defaults used to seed that data and for local development.
 */

export const CLINIC_TIMEZONE = "America/Tijuana"

export const APPOINTMENT_DURATION_MINUTES = 30

export const CLINIC_WORKING_DAYS = [1, 2, 3, 4, 5] as const // Mon-Fri (0=Sun)

export const CLINIC_HOURS = {
  start: "09:00",
  end: "18:00",
  lunchStart: "13:00",
  lunchEnd: "14:00",
} as const

/** How long a Redis conversation-state entry lives before auto-expiring. */
export const CONVERSATION_STATE_TTL_SECONDS = 24 * 60 * 60 // 24 hours

/** How far ahead patients can book, in days. */
export const BOOKING_HORIZON_DAYS = 60

export const DEFAULT_CLINIC_NAME = "VidaClinic"
