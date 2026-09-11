import { format } from "date-fns"
import { toZonedTime } from "date-fns-tz"
import {
  CLINIC_TIMEZONE,
  ConversationState,
  FlowType,
  Intent,
  MENU_OPTION_KEYS,
  menuOptionButtonLabels,
  menuOptionLabels,
  t,
  type ClinicSettings,
  type ConversationContext,
  type Language,
  type MenuOptionKey,
} from "@clinic/shared"
import type { FlowHandler, FlowReply, FlowResult } from "./types.js"
import { enterRescheduleFlow } from "./rescheduleFlow.js"
import { enterCancelFlow } from "./cancelFlow.js"
import { startBookingFromFreeText, extractReasonIfPresent } from "./bookAppointmentFlow.js"
import { appointmentService } from "../services/appointmentService.js"
import { patientRepository } from "../repositories/patientRepository.js"
import { appointmentRepository } from "../repositories/appointmentRepository.js"
import { locationReply, LOCATION_KEYWORDS } from "../lib/offScript.js"
import { openaiService } from "../services/openaiService.js"

const NUMBER_EMOJI = ["1️⃣", "2️⃣", "3️⃣", "4️⃣", "5️⃣", "6️⃣", "7️⃣", "8️⃣", "9️⃣", "🔟"]

type MenuLayout = {
  /** Every enabled option — the universe a tapped button/list id must belong to. */
  enabledKeys: MenuOptionKey[]
  /** Subset of enabledKeys (max 3) shown as always-visible buttons. */
  featuredKeys: MenuOptionKey[]
  /** enabledKeys minus featuredKeys, in canonical order — what the numbered text actually lists (and what a typed number indexes into), so a featured option never appears twice. */
  numberedKeys: MenuOptionKey[]
}

function buildMenuLayout(settings: ClinicSettings): MenuLayout {
  const enabled = new Set(settings.enabled_menu_options)
  // Filter (rather than trust the stored order) so display order always follows
  // MENU_OPTION_KEYS, regardless of how the dashboard happened to save the list.
  const enabledKeys = MENU_OPTION_KEYS.filter((key) => enabled.has(key))

  const enabledSet = new Set(enabledKeys)
  const featured = new Set(settings.featured_menu_options)
  // Capped at 3 (WhatsApp's reply-button limit) — enforced here, not just at the API edge, in case the two settings ever drift.
  const featuredKeys = MENU_OPTION_KEYS.filter((key) => enabledSet.has(key) && featured.has(key)).slice(0, 3)

  const featuredSet = new Set(featuredKeys)
  const numberedKeys = enabledKeys.filter((key) => !featuredSet.has(key))

  return { enabledKeys, featuredKeys, numberedKeys }
}

/** Resolves a raw reply to a menu key: either a button tap (id === the key itself, from any enabled option) or a number typed against the numbered list. */
function resolveMenuChoice(raw: string, { enabledKeys, numberedKeys }: MenuLayout): MenuOptionKey | null {
  if ((MENU_OPTION_KEYS as readonly string[]).includes(raw)) {
    return enabledKeys.includes(raw as MenuOptionKey) ? (raw as MenuOptionKey) : null
  }
  const index = Number(raw) - 1
  return Number.isInteger(index) && index >= 0 && index < numberedKeys.length ? numberedKeys[index]! : null
}

/**
 * Builds the main menu reply as ONE WhatsApp message: the numbered list as body text (every
 * non-featured option reachable by typing its number) plus — when the dashboard has "featured"
 * options set — up to 3 of those as always-visible tappable buttons on the same message.
 * A featured option is dropped from the numbered list so it isn't offered twice.
 */
export function buildMainMenu(lang: "en" | "es", settings: ClinicSettings): FlowReply {
  const { featuredKeys, numberedKeys } = buildMenuLayout(settings)
  const header = t(lang, "mainMenuHeader", { clinicName: settings.clinic_name })
  const footer = t(lang, featuredKeys.length > 0 ? "mainMenuFooterWithButtons" : "mainMenuFooter")
  const lines = numberedKeys.map((key, i) => `${NUMBER_EMOJI[i] ?? `${i + 1}.`} ${menuOptionLabels[key][lang]}`)
  const listSection = lines.length > 0 ? `${lines.join("\n")}\n\n` : ""

  const reply: FlowReply = {
    text: `${header}\n\n${listSection}${footer}`,
  }

  if (featuredKeys.length > 0) {
    reply.buttons = featuredKeys.map((key) => ({ id: key, title: menuOptionButtonLabels[key][lang] }))
  }

  return reply
}

/**
 * Returning patients (recognized by their WhatsApp number) skip straight past
 * the name/phone questions with their saved details pre-filled — they can
 * still overwrite the name in the confirmation step if it's wrong/outdated.
 * Shared by the "Book Appointment" menu choice and by free text that clearly
 * expresses booking intent without a specific date ("book me an appointment").
 */
export async function startBookingChoice(context: ConversationContext, lang: Language, rawText?: string): Promise<FlowResult> {
  // A booking intent detected from free text may already state why ("I have a
  // fever, book me an appointment") — carry it along so later steps don't ask again.
  const reason = rawText ? extractReasonIfPresent(rawText) : undefined

  const existingPatient = await patientRepository.findByPhone(context.phoneE164)
  if (existingPatient) {
    const lastAppointment = await appointmentRepository.findMostRecentForPatient(existingPatient.id)
    const lastReason = lastAppointment?.reason
    const reasonLine = lastReason ? t(lang, "lastVisitReasonLine", { reason: lastReason }) : ""

    return {
      context: {
        ...context,
        state: ConversationState.AWAITING_RETURNING_PATIENT_CONFIRMATION,
        activeFlow: FlowType.BOOK,
        booking: {
          fullName: existingPatient.full_name,
          phoneE164: existingPatient.phone_e164,
          ...(lastReason ? { lastReason } : {}),
          ...(reason ? { reason } : {}),
        },
      },
      reply: {
        text: t(lang, "confirmSavedDetails", {
          name: existingPatient.full_name,
          phone: existingPatient.phone_e164,
          reasonLine,
        }),
        // No "No" button here — there's no dedicated no-op branch, typing the
        // corrected name already serves as the "these details are wrong" path.
        buttons: [{ id: "yes", title: t(lang, "confirmYesButton") }],
      },
    }
  }
  return {
    context: { ...context, state: ConversationState.AWAITING_NAME, activeFlow: FlowType.BOOK, booking: reason ? { reason } : {} },
    reply: { text: t(lang, "askName") },
  }
}

export const mainMenuFlow: FlowHandler = async ({ text, buttonId, context, settings }) => {
  const lang = context.language ?? "es"
  const layout = buildMenuLayout(settings)
  const choice = resolveMenuChoice((buttonId ?? text).trim(), layout)

  switch (choice) {
    case "book":
      return startBookingChoice(context, lang)
    case "reschedule":
      return enterRescheduleFlow(context)
    case "cancel":
      return enterCancelFlow(context)
    case "info": {
      const hours = lang === "es" ? settings.hours_summary_es : settings.hours_summary_en
      const parking = lang === "es" ? settings.parking_info_es : settings.parking_info_en
      const overview = t(lang, "clinicOverview", { address: settings.address, hours, parking })
      const { latitude, longitude } = settings
      const hasCoordinates = latitude != null && longitude != null
      // The maps link is only needed in the text when there's no pin to carry it —
      // with coordinates, the location message below already gives a tap-to-open-in-Maps pin.
      const mapsLine = !hasCoordinates && settings.google_maps_url ? `\n${settings.google_maps_url}` : ""

      return {
        context: { ...context, state: ConversationState.AWAITING_FAQ_QUESTION, activeFlow: FlowType.INFO },
        reply: {
          text: `${overview}${mapsLine}\n\n${t(lang, "infoPrompt")}`,
          ...(latitude != null && longitude != null
            ? {
                location: {
                  latitude,
                  longitude,
                  name: settings.clinic_name,
                  address: settings.address,
                },
              }
            : {}),
        },
      }
    }
    case "human":
      return {
        context: { ...context, state: ConversationState.ESCALATED_TO_HUMAN, activeFlow: FlowType.HUMAN_SUPPORT },
        reply: { text: t(lang, "humanSupportAck") },
      }
    case "status": {
      const appointments = await appointmentService.findActiveAppointmentsForPhone(context.phoneE164)
      const resetContext = { ...context, state: ConversationState.AWAITING_MENU_SELECTION, activeFlow: FlowType.NONE }

      if (appointments.length === 0) {
        return { context: resetContext, reply: { text: t(lang, "noAppointmentsFound") } }
      }

      const lines = appointments
        .map((a) => {
          const zoned = toZonedTime(new Date(a.starts_at), CLINIC_TIMEZONE)
          const statusKey = a.status === "confirmed" ? "statusConfirmed" : "statusScheduled"
          return t(lang, "appointmentStatusLine", {
            date: format(zoned, "EEEE d MMMM"),
            time: format(zoned, "h:mm a"),
            status: t(lang, statusKey),
          })
        })
        .join("\n")

      return { context: resetContext, reply: { text: t(lang, "yourAppointmentsStatus", { appointments: lines }) } }
    }
    default: {
      // Free text that didn't match a menu number/button — first check whether it's
      // actually a booking request in disguise ("I have a fever, book me asap",
      // "book me for the 14th at 5pm", "what's open next Tuesday?").
      const rawText = (buttonId ?? text).trim()
      const bookingResult = await startBookingFromFreeText(context, rawText)
      if (bookingResult) return bookingResult

      const lowerText = rawText.toLowerCase()
      if (LOCATION_KEYWORDS.some((kw) => lowerText.includes(kw))) {
        return { context, reply: locationReply(lang, settings) }
      }

      // No parseable date/time, but the message may still clearly express booking/
      // reschedule/cancel intent with no specifics ("book me an appointment", "I need
      // to cancel my visit") — route those into the real deterministic flow instead of
      // treating them as an unanswerable off-script question (OpenAI never books).
      const { intent, answer } = await openaiService.classifyAndAnswer(rawText, lang, settings)
      if (intent === Intent.BOOK_APPOINTMENT) return startBookingChoice(context, lang, rawText)
      if (intent === Intent.RESCHEDULE_APPOINTMENT) return enterRescheduleFlow(context)
      if (intent === Intent.CANCEL_APPOINTMENT) return enterCancelFlow(context)

      if (answer) {
        return { context, reply: { text: `${answer}\n\n${buildMainMenu(lang, settings).text}` } }
      }

      return {
        context,
        reply: { text: t(lang, "menuInvalid") },
      }
    }
  }
}
