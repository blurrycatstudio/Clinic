import { format } from "date-fns"
import { toZonedTime } from "date-fns-tz"
import { CLINIC_TIMEZONE, isTemplateReady, type Appointment, type ClinicSettings, type Language } from "@clinic/shared"
import { templateService } from "./templateService.js"
import { AttemptFailed, type DeliveryAttempt } from "./voiceDeliveryService.js"
import { buildMapsUrl } from "../lib/offScript.js"
import { voiceFollowupPayload } from "../lib/voiceFollowup.js"

/**
 * The approved-template versions of what the voice agent sends — used when the patient's
 * 24h WhatsApp window is closed. Each builder returns null when its template isn't set up
 * (see packages/shared/src/templates/registry.ts), so callers know no template route exists.
 */

export type TemplateTarget = {
  phone: string
  conversationId: string
  language: Language
  /** Patient's full name, or null for a first-time caller we have no record of. */
  patientName: string | null
  settings: ClinicSettings
}

/** Only the first message's id matters for verification; a templated send is always a single message. */
async function sendTemplate(input: Parameters<typeof templateService.send>[0]): Promise<string> {
  const result = await templateService.send(input)
  if (!result.sent || !result.messageId) throw new AttemptFailed(result.failure ?? "unknown")
  return result.messageId
}

const greetingName = (target: TemplateTarget) => target.patientName ?? "there"
const shortClinicName = (settings: ClinicSettings) => settings.clinic_name.split(" ")[0] ?? settings.clinic_name

/** clinic_location_en: address, hours, parking and a maps link in one message. */
export function clinicInfoTemplate(target: TemplateTarget): DeliveryAttempt | null {
  if (!isTemplateReady("clinicLocation")) return null
  const { settings, language } = target
  return async () => {
    const messageId = await sendTemplate({
      key: "clinicLocation",
      to: target.phone,
      conversationId: target.conversationId,
      language,
      params: [
        greetingName(target),
        settings.address,
        language === "es" ? settings.hours_summary_es : settings.hours_summary_en,
        language === "es" ? settings.parking_info_es : settings.parking_info_en,
        settings.google_maps_url || buildMapsUrl(settings.address),
        shortClinicName(settings),
      ],
    })
    return { messageIds: [messageId] }
  }
}

/**
 * appointment_confirmation_en, once per upcoming appointment (capped) — it carries exactly the
 * details a caller asks for ("when is my appointment, with whom, where") and its own
 * Reschedule / Cancel buttons.
 */
export function appointmentDetailsTemplate(target: TemplateTarget, appointments: Appointment[]): DeliveryAttempt | null {
  if (!isTemplateReady("appointmentConfirmation") || appointments.length === 0) return null
  const { settings } = target
  return async () => {
    const messageIds: string[] = []
    for (const appointment of appointments.slice(0, 3)) {
      const zoned = toZonedTime(new Date(appointment.starts_at), CLINIC_TIMEZONE)
      try {
        messageIds.push(
          await sendTemplate({
            key: "appointmentConfirmation",
            to: target.phone,
            conversationId: target.conversationId,
            language: target.language,
            appointmentId: appointment.id,
            params: [
              greetingName(target),
              settings.doctor_name,
              format(zoned, "EEEE d MMMM"),
              format(zoned, "h:mm a"),
              settings.clinic_name,
              shortClinicName(settings),
            ],
          }),
        )
      } catch (err) {
        // One appointment's details already went out — report success rather than fail the whole delivery.
        if (messageIds.length === 0) throw err
      }
    }
    return { messageIds }
  }
}

/** What the follow-up template says the chat is for — fills "continue with {{3}} here on WhatsApp". */
const FOLLOWUP_TOPIC: Record<string, string> = {
  book: "booking your appointment",
  reschedule: "rescheduling your appointment",
  cancel: "cancelling your appointment",
  human: "reaching our team",
  menu: "your request",
  info: "your questions about the clinic",
  status: "checking your appointment",
}

/** Generic "thanks for calling" opener whose button drops the patient straight into the flow they asked for. */
export function followupTemplate(target: TemplateTarget, intent: string): DeliveryAttempt | null {
  if (!isTemplateReady("voiceFollowup")) return null
  return async () => {
    const messageId = await sendTemplate({
      key: "voiceFollowup",
      to: target.phone,
      conversationId: target.conversationId,
      language: target.language,
      params: [greetingName(target), target.settings.clinic_name, FOLLOWUP_TOPIC[intent] ?? FOLLOWUP_TOPIC.menu!],
      quickReplyPayloads: [voiceFollowupPayload(intent)],
    })
    return { messageIds: [messageId] }
  }
}
