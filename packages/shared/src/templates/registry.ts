/**
 * WhatsApp Template Registry
 * ==========================
 * Meta requires pre-approved templates for any message sent outside the
 * 24-hour customer service window (reminders, confirmations, anything the
 * clinic sends to a patient who hasn't just messaged us — including every
 * "I'll send that to your WhatsApp" promise made on a voice call).
 *
 * The `params` / `language` below MUST match the template exactly as it is
 * approved in WhatsApp Manager — Meta rejects a different parameter count
 * (error 132000) or language code (132001). Approved bodies at the time of
 * writing:
 *
 *   appointment_confirmation_en  [en]  6 params: name, doctor, date, time, clinic, clinicShort
 *   appointment_rescheduled_en   [en]  6 params: name, doctor, newDate, newTime, clinic, clinicShort
 *   appointment_reminder_2h_en   [en]  6 params: name, doctor, date, time, clinic, clinicShort
 *   clinic_location_en           [en]  6 params: name, address, hours, parking, mapsUrl, clinicShort
 *   (not yet submitted) voice follow-up opener, appointment cancelled, 24h reminder
 *
 * WHEN A TEMPLATE IS APPROVED:
 *   1. Set its env var (see .env.example) to the exact approved name.
 *   2. Nothing else changes — templateService.ts reads from this registry,
 *      this registry reads from env vars, and every call site references the
 *      registry by semantic key, never by literal string.
 *
 * Until a key's env var is set, `isTemplateReady(key)` is false and callers
 * fall back to a plain session message (only possible inside the 24h window)
 * — and, on the voice channel, tell the agent honestly that nothing was sent.
 */

export type TemplateKey =
  | "appointmentConfirmation"
  | "appointmentReminder24h"
  | "appointmentReminder2h"
  | "appointmentRescheduled"
  | "appointmentCancelled"
  | "clinicLocation"
  | "voiceFollowup"

export type TemplateDefinition = {
  /** The approved Meta template name, injected from env. Empty until approved. */
  name: string
  /** Language code this template was submitted in, matching Meta's template language field EXACTLY (e.g. "en", not "en_US" — verify per-template in WhatsApp Manager, Meta rejects a mismatched code with error 132001). */
  language: "es_MX" | "en_US" | "en" | "es"
  /** Ordered list of body variable names, for documentation + type-safe callers. */
  params: readonly string[]
}

function envTemplateName(key: string): string {
  return process.env[key]?.trim() ?? ""
}

export const templates: Record<TemplateKey, TemplateDefinition> = {
  appointmentConfirmation: {
    name: envTemplateName("WHATSAPP_TEMPLATE_APPOINTMENT_CONFIRMATION"),
    language: "en",
    params: ["patientName", "doctorName", "date", "time", "clinicName", "clinicShortName"],
  },
  appointmentReminder24h: {
    name: envTemplateName("WHATSAPP_TEMPLATE_APPOINTMENT_REMINDER_24H"),
    language: "es_MX",
    params: ["patientName", "date", "time"],
  },
  appointmentReminder2h: {
    name: envTemplateName("WHATSAPP_TEMPLATE_APPOINTMENT_REMINDER_2H"),
    language: "en",
    params: ["patientName", "doctorName", "date", "time", "clinicName", "clinicShortName"],
  },
  appointmentRescheduled: {
    name: envTemplateName("WHATSAPP_TEMPLATE_APPOINTMENT_RESCHEDULED"),
    language: "en",
    params: ["patientName", "doctorName", "newDate", "newTime", "clinicName", "clinicShortName"],
  },
  appointmentCancelled: {
    name: envTemplateName("WHATSAPP_TEMPLATE_APPOINTMENT_CANCELLED"),
    language: "en",
    params: ["patientName", "date", "time"],
  },
  clinicLocation: {
    name: envTemplateName("WHATSAPP_TEMPLATE_CLINIC_LOCATION"),
    language: "en",
    params: ["patientName", "address", "hours", "parking", "mapsUrl", "clinicShortName"],
  },
  /**
   * Generic "thanks for calling" opener with ONE quick-reply button. Lets the voice
   * agent reach a caller who hasn't messaged us in 24h (book / reschedule / cancel /
   * menu / human hand-offs). Tapping the button re-opens the 24h window and carries
   * the original intent back as a `vf:<intent>` payload (see webhookController).
   */
  voiceFollowup: {
    name: envTemplateName("WHATSAPP_TEMPLATE_VOICE_FOLLOWUP"),
    language: "en",
    params: ["patientName", "clinicName", "topic"],
  },
}

export function isTemplateReady(key: TemplateKey): boolean {
  return templates[key].name.length > 0
}

export function getTemplateName(key: TemplateKey): string {
  const def = templates[key]
  if (!def.name) {
    throw new Error(
      `WhatsApp template "${key}" is not yet configured. Set its env var once Meta approves it.`,
    )
  }
  return def.name
}
