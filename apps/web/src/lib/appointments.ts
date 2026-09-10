import type { AppointmentStatus } from "@/lib/data"

export type ApiAppointment = {
  id: string
  patient_id: string
  starts_at: string
  ends_at: string
  reason: string
  status: "scheduled" | "confirmed" | "cancelled" | "completed" | "no_show"
  source: "whatsapp" | "voice" | "dashboard"
  patients: { full_name: string; phone_e164: string } | null
}

export type DisplayAppointment = {
  id: string
  patientId: string
  startsAt: Date
  time: string
  duration: string
  child: string
  phone: string
  initials: string
  color: string
  reason: string
  source: ApiAppointment["source"]
  status: AppointmentStatus
}

const AVATAR_COLORS = ["#16A34A", "#2563EB", "#DC2626", "#9333EA", "#0891B2", "#F97316", "#DB2777", "#0D9488"]

export function colorFor(seed: string): string {
  let hash = 0
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0
  return AVATAR_COLORS[hash % AVATAR_COLORS.length]
}

export function initialsFor(name: string): string {
  const parts = name.trim().split(/\s+/)
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "?"
}

export function mapStatus(status: ApiAppointment["status"]): AppointmentStatus {
  switch (status) {
    case "scheduled":
      return "statusPending"
    case "confirmed":
      return "statusConfirmed"
    case "completed":
      return "statusCompleted"
    default:
      return "statusCancelled"
  }
}

export function toDisplayAppointment(a: ApiAppointment): DisplayAppointment {
  const startsAt = new Date(a.starts_at)
  const minutes = Math.round((new Date(a.ends_at).getTime() - startsAt.getTime()) / 60000)
  const name = a.patients?.full_name ?? "Unknown patient"
  return {
    id: a.id,
    patientId: a.patient_id,
    startsAt,
    time: startsAt.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }),
    duration: `${minutes} min`,
    child: name,
    phone: a.patients?.phone_e164 ?? "",
    initials: initialsFor(name),
    color: colorFor(a.patient_id),
    reason: a.reason,
    source: a.source,
    status: mapStatus(a.status),
  }
}
