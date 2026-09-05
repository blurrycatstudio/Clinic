/**
 * Row types mirroring supabase/migrations/0001_init.sql.
 * Keep in sync manually — if the project grows, swap this for
 * `supabase gen types typescript` output.
 */

export type UUID = string
export type ISODateString = string // yyyy-mm-dd
export type ISOTimestamp = string // full ISO 8601

export type Language = "en" | "es"

export type Patient = {
  id: UUID
  full_name: string
  phone_e164: string
  language: Language
  date_of_birth: ISODateString | null
  notes: string | null
  created_at: ISOTimestamp
  updated_at: ISOTimestamp
}

export type AppointmentStatus =
  | "scheduled"
  | "confirmed"
  | "cancelled"
  | "completed"
  | "no_show"

export type Appointment = {
  id: UUID
  patient_id: UUID
  doctor_id: string
  starts_at: ISOTimestamp
  ends_at: ISOTimestamp
  reason: string
  status: AppointmentStatus
  source: "whatsapp" | "voice" | "dashboard"
  reminder_24h_sent_at: ISOTimestamp | null
  reminder_2h_sent_at: ISOTimestamp | null
  cancelled_reason: string | null
  created_at: ISOTimestamp
  updated_at: ISOTimestamp
}

export type DoctorScheduleDay = {
  id: UUID
  doctor_id: string
  weekday: number // 0=Sunday .. 6=Saturday
  start_time: string // "09:00"
  end_time: string // "18:00"
  break_start_time: string | null // "13:00"
  break_end_time: string | null // "14:00"
  is_active: boolean
}

export type ClinicSettings = {
  id: UUID
  clinic_name: string
  doctor_name: string
  doctor_specialty: string
  doctor_license: string
  address: string
  google_maps_url: string
  latitude: number | null
  longitude: number | null
  phone_e164: string
  hours_summary_en: string
  hours_summary_es: string
  parking_info_en: string
  parking_info_es: string
  fees_info_en: string
  fees_info_es: string
  insurance_info_en: string
  insurance_info_es: string
  appointment_duration_minutes: number
  updated_at: ISOTimestamp
}

export type ConversationStatus = "active" | "closed" | "escalated"

export type WhatsappConversation = {
  id: UUID
  patient_id: UUID | null
  wa_phone_e164: string
  wa_profile_name: string | null
  language: Language | null
  status: ConversationStatus
  last_message_at: ISOTimestamp
  created_at: ISOTimestamp
}

export type MessageDirection = "inbound" | "outbound"
export type MessageType = "text" | "template" | "interactive" | "location" | "image" | "audio" | "document" | "system"

export type WhatsappMessage = {
  id: UUID
  conversation_id: UUID
  wa_message_id: string | null
  direction: MessageDirection
  message_type: MessageType
  body: string | null
  template_name: string | null
  payload: Record<string, unknown> | null
  status: "sent" | "delivered" | "read" | "failed" | "received" | null
  created_at: ISOTimestamp
}

/** Durable mirror of the Redis conversation state, for audit + crash recovery. */
export type ConversationStateRow = {
  id: UUID
  conversation_id: UUID
  state: string
  context: Record<string, unknown>
  expires_at: ISOTimestamp
  updated_at: ISOTimestamp
}

export type VoiceCallDirection = "inbound" | "outbound"
export type VoiceCallStatus = "in_progress" | "completed" | "failed" | "no_answer"

export type VoiceCall = {
  id: UUID
  patient_id: UUID | null
  vapi_call_id: string
  phone_e164: string
  direction: VoiceCallDirection
  status: VoiceCallStatus
  started_at: ISOTimestamp
  ended_at: ISOTimestamp | null
  duration_seconds: number | null
  recording_url: string | null
  summary: string | null
  created_at: ISOTimestamp
}

export type CallTranscript = {
  id: UUID
  voice_call_id: UUID
  role: "assistant" | "user" | "system"
  content: string
  spoken_at: ISOTimestamp
}

export type AuditAction =
  | "appointment.created"
  | "appointment.rescheduled"
  | "appointment.cancelled"
  | "appointment.completed"
  | "message.sent"
  | "message.received"
  | "template.sent"
  | "template.failed"
  | "settings.updated"
  | "conversation.escalated"
  | "auth.login"
  | "voice_call.started"
  | "voice_call.completed"

export type AuditLog = {
  id: UUID
  actor_type: "patient" | "system" | "staff" | "ai"
  actor_id: string | null
  action: AuditAction
  entity_type: string
  entity_id: string | null
  metadata: Record<string, unknown> | null
  created_at: ISOTimestamp
}
