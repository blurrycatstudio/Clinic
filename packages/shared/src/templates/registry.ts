/**
 * WhatsApp Template Registry
 * ==========================
 * Meta requires pre-approved templates for any message sent outside the
 * 24-hour customer service window (reminders, confirmations, etc).
 * Our templates are currently pending review.
 *
 * WHEN META APPROVES THE TEMPLATES:
 *   1. Add the approved template names as env vars (see .env.example).
 *   2. Nothing else changes — templateService.ts reads from this registry,
 *      this registry reads from env vars, and every call site already
 *      references the registry by semantic key, never by literal string.
 *
 * Until then, `templates.<key>` is an empty string and
 * `isTemplateReady(key)` returns false, so templateService.ts falls back
 * to a plain session message (only possible inside the 24h window) and
 * logs a warning instead of throwing.
 */

export type TemplateKey =
  | "appointmentConfirmation"
  | "appointmentReminder24h"
  | "appointmentReminder2h"
  | "appointmentRescheduled"
  | "appointmentCancelled"
  | "clinicLocation"

export type TemplateDefinition = {
  /** The approved Meta template name, injected from env. Empty until approved. */
  name: string
  /** BCP-47-ish language codes this template was submitted in, matching Meta's template language field. */
  language: "es_MX" | "en_US"
  /** Ordered list of body variable names, for documentation + type-safe callers. */
  params: readonly string[]
}

function envTemplateName(key: string): string {
  return process.env[key]?.trim() ?? ""
}

export const templates: Record<TemplateKey, TemplateDefinition> = {
  appointmentConfirmation: {
    name: envTemplateName("WHATSAPP_TEMPLATE_APPOINTMENT_CONFIRMATION"),
    language: "es_MX",
    params: ["patientName", "date", "time", "doctorName"],
  },
  appointmentReminder24h: {
    name: envTemplateName("WHATSAPP_TEMPLATE_APPOINTMENT_REMINDER_24H"),
    language: "es_MX",
    params: ["patientName", "date", "time"],
  },
  appointmentReminder2h: {
    name: envTemplateName("WHATSAPP_TEMPLATE_APPOINTMENT_REMINDER_2H"),
    language: "es_MX",
    params: ["patientName", "time"],
  },
  appointmentRescheduled: {
    name: envTemplateName("WHATSAPP_TEMPLATE_APPOINTMENT_RESCHEDULED"),
    language: "es_MX",
    params: ["patientName", "newDate", "newTime"],
  },
  appointmentCancelled: {
    name: envTemplateName("WHATSAPP_TEMPLATE_APPOINTMENT_CANCELLED"),
    language: "es_MX",
    params: ["patientName", "date", "time"],
  },
  clinicLocation: {
    name: envTemplateName("WHATSAPP_TEMPLATE_CLINIC_LOCATION"),
    language: "es_MX",
    params: ["clinicName"],
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
