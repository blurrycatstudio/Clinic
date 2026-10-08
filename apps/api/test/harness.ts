import "./env.js"
import { mock } from "node:test"
import {
  ConversationState,
  FlowType,
  Intent,
  type Appointment,
  type ClinicSettings,
  type ConversationContext,
  type DoctorScheduleDay,
  type Language,
  type Patient,
} from "@clinic/shared"
import { appointmentRepository } from "../src/repositories/appointmentRepository.js"
import { patientRepository } from "../src/repositories/patientRepository.js"
import { doctorScheduleRepository } from "../src/repositories/doctorScheduleRepository.js"
import { auditLogRepository } from "../src/repositories/auditLogRepository.js"
import { openaiService } from "../src/services/openaiService.js"
import { ConflictError } from "../src/lib/errors.js"
import type { FlowHandler, FlowReply } from "../src/flows/types.js"
import { mainMenuFlow } from "../src/flows/mainMenuFlow.js"
import { bookAppointmentFlow } from "../src/flows/bookAppointmentFlow.js"
import { rescheduleFlow } from "../src/flows/rescheduleFlow.js"
import { cancelFlow } from "../src/flows/cancelFlow.js"
import { reminderResponseFlow } from "../src/flows/reminderResponseFlow.js"

/** Thursday 8 October 2026, 10:00 in Tijuana (PDT, UTC-7). Every relative phrase in the tests ("tomorrow", "in 2 days") resolves against this. */
export const NOW = new Date("2026-10-08T17:00:00Z")

export function freezeClock(): void {
  mock.timers.enable({ apis: ["Date"], now: NOW })
}
export function unfreezeClock(): void {
  mock.timers.reset()
}

const DAY: Omit<DoctorScheduleDay, "id" | "weekday" | "is_active"> = {
  clinic_id: "clinic-1",
  doctor_id: "default-doctor",
  start_time: "09:00",
  end_time: "18:00",
  break_start_time: "13:00",
  break_end_time: "14:00",
}

/** Same weekly schedule as supabase/migrations/0002_seed.sql: Mon-Fri 09:00-18:00 with a 13:00-14:00 break, closed Sat/Sun. */
const SCHEDULE: DoctorScheduleDay[] = [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({
  ...DAY,
  id: `sched-${weekday}`,
  weekday,
  is_active: weekday >= 1 && weekday <= 5,
}))

export const SETTINGS = {
  clinic_name: "VidaClinic",
  doctor_name: "Dr. Gamaliel Rodríguez",
  doctor_specialty: "Pediatría General",
  doctor_license: "8452193-B",
  address: "Av. Revolución 1234, Tijuana",
  google_maps_url: "https://maps.google.com/?q=VidaClinic",
  latitude: null,
  longitude: null,
  phone_e164: "+526641234567",
  hours_summary_en: "Mon-Fri 9-6",
  hours_summary_es: "Lun-Vie 9-6",
  parking_info_en: "Free parking",
  parking_info_es: "Estacionamiento gratis",
  fees_info_en: "$700",
  fees_info_es: "$700",
  insurance_info_en: "Most plans",
  insurance_info_es: "La mayoría",
  appointment_duration_minutes: 30,
  enabled_menu_options: ["book", "reschedule", "cancel", "info", "human", "status"],
  featured_menu_options: ["book", "reschedule", "cancel"],
} as unknown as ClinicSettings

/** Stands in for Supabase: patients and appointments live in memory; the repositories the flows call are swapped for in-memory versions, while appointmentService's real slot logic runs on top. */
export class FakeClinic {
  patients: Patient[] = []
  appointments: Appointment[] = []
  /** Every question the flows would have sent to OpenAI. */
  aiCalls: string[] = []
  private seq = 0

  private id(prefix: string): string {
    this.seq += 1
    return `${prefix}-${this.seq}`
  }

  addPatient(fullName: string, phoneE164: string, language: Language = "en"): Patient {
    const patient = { id: this.id("pat"), clinic_id: "clinic-1", full_name: fullName, phone_e164: phoneE164, language } as Patient
    this.patients.push(patient)
    return patient
  }

  addAppointment(patientId: string, startsAtIso: string, reason = "Checkup", status: Appointment["status"] = "scheduled"): Appointment {
    const appointment = {
      id: this.id("appt"),
      clinic_id: "clinic-1",
      patient_id: patientId,
      doctor_id: "default-doctor",
      starts_at: new Date(startsAtIso).toISOString(),
      ends_at: new Date(new Date(startsAtIso).getTime() + 30 * 60_000).toISOString(),
      reason,
      status,
      source: "whatsapp",
    } as Appointment
    this.appointments.push(appointment)
    return appointment
  }

  private isActive(a: Appointment): boolean {
    return a.status === "scheduled" || a.status === "confirmed"
  }

  install(): void {
    this.patients = []
    this.appointments = []
    this.aiCalls = []
    this.seq = 0

    doctorScheduleRepository.getWeeklySchedule = async () => SCHEDULE
    auditLogRepository.record = (async () => undefined) as typeof auditLogRepository.record

    patientRepository.findByPhone = async (phone) => this.patients.find((p) => p.phone_e164 === phone) ?? null
    patientRepository.upsertByPhone = (async ({ phoneE164, fullName, language }: { phoneE164: string; fullName: string; language?: Language }) => {
      const existing = this.patients.find((p) => p.phone_e164 === phoneE164)
      if (existing) return existing
      return this.addPatient(fullName, phoneE164, language ?? "en")
    }) as typeof patientRepository.upsertByPhone

    appointmentRepository.listBetween = async (startIso, endIso) =>
      this.appointments.filter((a) => this.isActive(a) && a.starts_at >= startIso && a.starts_at < endIso)
    appointmentRepository.findById = async (id) => this.appointments.find((a) => a.id === id) ?? null
    appointmentRepository.listUpcomingForPatient = async (patientId) =>
      this.appointments
        .filter((a) => a.patient_id === patientId && this.isActive(a) && new Date(a.starts_at) > new Date())
        .sort((a, b) => a.starts_at.localeCompare(b.starts_at))
    appointmentRepository.findMostRecentForPatient = async (patientId) =>
      [...this.appointments].filter((a) => a.patient_id === patientId).sort((a, b) => b.starts_at.localeCompare(a.starts_at))[0] ?? null
    appointmentRepository.create = (async (input: { patientId: string; startsAtIso: string; endsAtIso: string; reason: string; source: Appointment["source"] }) => {
      // The real DB's partial unique index is the last line of defence against a double booking.
      if (this.appointments.some((a) => this.isActive(a) && a.starts_at === input.startsAtIso)) throw new ConflictError("slot taken")
      return this.addAppointment(input.patientId, input.startsAtIso, input.reason)
    }) as typeof appointmentRepository.create
    appointmentRepository.reschedule = async (id, startsAtIso, endsAtIso) => {
      const appt = this.appointments.find((a) => a.id === id)
      if (!appt) throw new Error("no such appointment")
      if (this.appointments.some((a) => a.id !== id && this.isActive(a) && a.starts_at === startsAtIso)) throw new ConflictError("slot taken")
      appt.starts_at = startsAtIso
      appt.ends_at = endsAtIso
      return appt
    }
    appointmentRepository.cancel = async (id, reason) => {
      const appt = this.appointments.find((a) => a.id === id)
      if (!appt) throw new Error("no such appointment")
      appt.status = "cancelled"
      appt.cancelled_reason = reason ?? null
      return appt
    }

    openaiService.classifyAndAnswer = async (question: string) => {
      this.aiCalls.push(question)
      return { intent: Intent.UNKNOWN, answer: null }
    }
  }
}

const FLOW_BY_STATE: Partial<Record<ConversationState, FlowHandler>> = {
  [ConversationState.AWAITING_MENU_SELECTION]: mainMenuFlow,
  [ConversationState.AWAITING_RETURNING_PATIENT_CONFIRMATION]: bookAppointmentFlow,
  [ConversationState.AWAITING_NAME]: bookAppointmentFlow,
  [ConversationState.AWAITING_PHONE]: bookAppointmentFlow,
  [ConversationState.AWAITING_REASON]: bookAppointmentFlow,
  [ConversationState.AWAITING_SLOT_SELECTION]: bookAppointmentFlow,
  [ConversationState.AWAITING_BOOKING_CONFIRMATION]: bookAppointmentFlow,
  [ConversationState.AWAITING_RESCHEDULE_TARGET_SELECTION]: rescheduleFlow,
  [ConversationState.AWAITING_RESCHEDULE_SLOT_SELECTION]: rescheduleFlow,
  [ConversationState.AWAITING_RESCHEDULE_CONFIRMATION]: rescheduleFlow,
  [ConversationState.AWAITING_CANCELLATION_TARGET_SELECTION]: cancelFlow,
  [ConversationState.AWAITING_CANCELLATION_CONFIRMATION]: cancelFlow,
  [ConversationState.AWAITING_REMINDER_RESPONSE]: reminderResponseFlow,
}

export const PHONE = "+526640000001"

/**
 * One patient's WhatsApp conversation. Mirrors conversationEngine's dispatch (state -> flow) without its
 * Redis/WhatsApp plumbing, and checks every reply against WhatsApp's hard limits — a reply the Cloud API
 * would reject is a bug even if the logic is right.
 */
export class Chat {
  context: ConversationContext
  last: FlowReply = {}
  readonly transcript: string[] = []

  constructor(readonly lang: Language, readonly phone = PHONE) {
    this.context = {
      conversationId: "conv-1",
      patientId: null,
      phoneE164: phone,
      language: lang,
      state: ConversationState.AWAITING_MENU_SELECTION,
      activeFlow: FlowType.NONE,
      recentTurns: [],
      updatedAt: NOW.toISOString(),
    }
  }

  get state(): ConversationState {
    return this.context.state
  }

  /** The patient types `text`. */
  async say(text: string): Promise<FlowReply> {
    return this.dispatch(text, null)
  }

  /** The patient taps a button/list row. Like WhatsApp's webhook, `text` becomes the row title and `buttonId` its id. */
  async tap(id: string, title = id): Promise<FlowReply> {
    if (id === "menu") {
      this.transcript.push(`[tap ${id}]`)
      this.context = { ...this.context, state: ConversationState.AWAITING_MENU_SELECTION, activeFlow: FlowType.NONE }
      this.last = { text: "(main menu)" }
      return this.last
    }
    return this.dispatch(title, id)
  }

  /** Taps the list row whose title equals `title` — what a real patient does. */
  async tapRow(title: string): Promise<FlowReply> {
    const row = this.rows.find((r) => r.title === title)
    if (!row) throw new Error(`No list row titled "${title}". Rows: ${this.rows.map((r) => r.title).join(" | ")}`)
    return this.tap(row.id, row.title)
  }

  get rows(): { id: string; title: string }[] {
    return this.last.list?.rows ?? []
  }

  /** Titles of the real slot rows (no "see more"/"menu" rows). */
  get slotTitles(): string[] {
    return this.rows.filter((r) => /^\d+$/.test(r.id)).map((r) => r.title)
  }

  get text(): string {
    return this.last.text ?? ""
  }

  get buttonTitles(): string[] {
    return (this.last.buttons ?? []).map((b) => b.title)
  }

  private async dispatch(text: string, buttonId: string | null): Promise<FlowReply> {
    const handler = FLOW_BY_STATE[this.context.state] ?? mainMenuFlow
    const result = await handler({ text, buttonId, context: this.context, settings: SETTINGS })
    this.context = result.context
    this.last = result.reply
    this.transcript.push(`> ${buttonId ? `[tap ${buttonId}] ` : ""}${text}`, `< ${(result.reply.text ?? "").split("\n")[0]} [${this.state}]`)
    assertWithinWhatsappLimits(result.reply)
    return result.reply
  }
}

/** WhatsApp Cloud API limits that, if exceeded, make the send fail outright (the patient gets nothing). */
export function assertWithinWhatsappLimits(reply: FlowReply): void {
  const fail = (msg: string) => {
    throw new Error(`WhatsApp limit violated: ${msg}\n${JSON.stringify(reply, null, 2)}`)
  }
  if (reply.list) {
    if (reply.list.rows.length > 10) fail(`${reply.list.rows.length} list rows (max 10)`)
    for (const row of reply.list.rows) if (row.title.length > 24) fail(`row title "${row.title}" is ${row.title.length} chars (max 24)`)
    if (reply.list.buttonLabel.length > 20) fail(`list button label "${reply.list.buttonLabel}" too long (max 20)`)
    const ids = reply.list.rows.map((r) => r.id)
    if (new Set(ids).size !== ids.length) fail("duplicate list row ids")
  }
  if (reply.buttons) {
    if (reply.buttons.length > 3) fail(`${reply.buttons.length} buttons (max 3)`)
    for (const b of reply.buttons) if (b.title.length > 20) fail(`button title "${b.title}" is ${b.title.length} chars (max 20)`)
  }
  if ((reply.text ?? "").length > 1024) fail("body over 1024 chars")
}
