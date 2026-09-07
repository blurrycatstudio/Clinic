/**
 * The Redis-backed conversation state machine.
 *
 * One key per WhatsApp phone number: `conv:{phone_e164}` -> JSON `ConversationContext`,
 * TTL = CONVERSATION_STATE_TTL_SECONDS (24h), refreshed on every turn.
 * A snapshot is mirrored into the `conversation_states` table on every
 * transition so an expired/evicted Redis key can be recovered and so
 * support staff can audit a conversation's history.
 */

export enum ConversationState {
  AWAITING_LANGUAGE_SELECTION = "AWAITING_LANGUAGE_SELECTION",
  AWAITING_MENU_SELECTION = "AWAITING_MENU_SELECTION",

  // Book appointment flow
  AWAITING_RETURNING_PATIENT_CONFIRMATION = "AWAITING_RETURNING_PATIENT_CONFIRMATION",
  AWAITING_NAME = "AWAITING_NAME",
  AWAITING_PHONE = "AWAITING_PHONE",
  AWAITING_REASON = "AWAITING_REASON",
  AWAITING_SLOT_SELECTION = "AWAITING_SLOT_SELECTION",
  AWAITING_BOOKING_CONFIRMATION = "AWAITING_BOOKING_CONFIRMATION",

  // Reschedule flow
  AWAITING_RESCHEDULE_TARGET_SELECTION = "AWAITING_RESCHEDULE_TARGET_SELECTION",
  AWAITING_RESCHEDULE_SLOT_SELECTION = "AWAITING_RESCHEDULE_SLOT_SELECTION",
  AWAITING_RESCHEDULE_CONFIRMATION = "AWAITING_RESCHEDULE_CONFIRMATION",

  // Cancellation flow
  AWAITING_CANCELLATION_TARGET_SELECTION = "AWAITING_CANCELLATION_TARGET_SELECTION",
  AWAITING_CANCELLATION_CONFIRMATION = "AWAITING_CANCELLATION_CONFIRMATION",

  // Clinic info / FAQ
  AWAITING_FAQ_QUESTION = "AWAITING_FAQ_QUESTION",

  // Human support
  ESCALATED_TO_HUMAN = "ESCALATED_TO_HUMAN",

  IDLE = "IDLE",
}

export enum FlowType {
  BOOK = "BOOK",
  RESCHEDULE = "RESCHEDULE",
  CANCEL = "CANCEL",
  INFO = "INFO",
  HUMAN_SUPPORT = "HUMAN_SUPPORT",
  NONE = "NONE",
}

export type CachedSlot = { startsAtIso: string; label: string }

export type PendingBookingDraft = {
  fullName?: string
  phoneE164?: string
  reason?: string
  selectedSlotIso?: string
  /** Slots shown in the last "choose a slot" prompt, so the numeric reply can be resolved without re-querying. */
  cachedSlots?: CachedSlot[]
  /** Reason from the patient's most recent appointment, offered as a quick "reuse this" shortcut when booking again. */
  lastReason?: string
}

export type CachedAppointmentOption = { appointmentId: string; label: string }

export type PendingRescheduleDraft = {
  targetAppointmentId?: string
  selectedSlotIso?: string
  cachedAppointments?: CachedAppointmentOption[]
  cachedSlots?: CachedSlot[]
}

export type PendingCancellationDraft = {
  targetAppointmentId?: string
  cachedAppointments?: CachedAppointmentOption[]
}

export type ConversationContext = {
  conversationId: string
  patientId: string | null
  phoneE164: string
  language: "en" | "es" | null
  state: ConversationState
  activeFlow: FlowType
  booking?: PendingBookingDraft
  reschedule?: PendingRescheduleDraft
  cancellation?: PendingCancellationDraft
  /** Last N turns kept only for OpenAI fallback context, not for business logic. */
  recentTurns: { role: "user" | "assistant"; text: string }[]
  updatedAt: string
}

export enum Intent {
  BOOK_APPOINTMENT = "BOOK_APPOINTMENT",
  RESCHEDULE_APPOINTMENT = "RESCHEDULE_APPOINTMENT",
  CANCEL_APPOINTMENT = "CANCEL_APPOINTMENT",
  CLINIC_INFO = "CLINIC_INFO",
  CHECK_AVAILABILITY = "CHECK_AVAILABILITY",
  HUMAN_SUPPORT = "HUMAN_SUPPORT",
  GREETING = "GREETING",
  UNKNOWN = "UNKNOWN",
}

export type IntentDetectionResult = {
  intent: Intent
  confidence: number
}
