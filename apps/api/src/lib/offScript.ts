import { Intent, t, type ClinicSettings, type Language } from "@clinic/shared"
import { openaiService } from "../services/openaiService.js"
import type { FlowReply } from "../flows/types.js"

/** Shared across every flow so "where are you" is answered identically no matter which prompt the patient is mid-way through. */
export const LOCATION_KEYWORDS = [
  "ubicaci", "direcci", "location", "address", "mapa", "map", "donde", "dónde", "where",
  "directions", "located", "situated", "gps", "pin", "waze", "how do i get", "how to get",
  "how do i reach", "how to reach", "como llego", "cómo llego", "como llegar", "cómo llegar",
]

/** Closing pleasantries that don't ask anything — a "thanks" here shouldn't ever get "sorry, I didn't get that". */
const GRATITUDE_KEYWORDS = [
  "gracias", "muchas gracias", "mil gracias", "ok gracias", "okay gracias", "vale gracias",
  "thanks", "thank you", "thankyou", "thank u", "ty", "ok thanks", "okay thanks",
  "perfecto", "perfect", "genial", "great", "awesome", "excelente", "excellent",
]

/** True only for a short pleasantry — a longer sentence that happens to contain "thanks" may still be a real question, so this stays a whole-message match, not a substring one. */
export function isGratitudeMessage(rawText: string): boolean {
  const normalized = rawText
    .trim()
    .toLowerCase()
    .replace(/[!.,¡¿?]/g, "")
    .trim()
  if (!normalized) return false
  return GRATITUDE_KEYWORDS.includes(normalized)
}

export function buildMapsUrl(address: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`
}

/**
 * The "Get Directions" CTA-URL button carries the address and a real tappable button —
 * that's the primary way we share the location, and it works off just a maps link, no
 * coordinates needed. `text` here is kept only for conversation history (suppressTextSend
 * tells conversationEngine not to send it as its own message, since the button already
 * covers it). When coordinates ARE set, we also send WhatsApp's native location pin
 * alongside the button, as a bonus (drop-a-pin apps some patients prefer).
 */
export function locationReply(lang: Language, settings: ClinicSettings): FlowReply {
  const mapsUrl = settings.google_maps_url || buildMapsUrl(settings.address)
  const text = `📍 ${settings.address}\n${mapsUrl}`
  const { latitude, longitude } = settings
  return {
    text,
    suppressTextSend: true,
    ctaUrl: { bodyText: `📍 ${settings.address}`, displayText: t(lang, "getDirectionsButton"), url: mapsUrl },
    ...(latitude != null && longitude != null
      ? { location: { latitude, longitude, name: settings.clinic_name, address: settings.address } }
      : {}),
  }
}

/** Cheap heuristic gate — only messages that plausibly ARE a question get an LLM call, so a mistyped menu number never triggers one. */
const QUESTION_KEYWORDS = [
  "price", "cost", "precio", "costo", "cuanto", "cuánto", "insurance", "seguro", "hours",
  "horario", "parking", "estacionamiento", "doctor", "allerg", "alerg", "fever", "fiebre",
  "pain", "dolor", "vaccine", "vacuna", "cost",
]

function looksLikeAQuestion(text: string): boolean {
  const trimmed = text.trim()
  if (!trimmed) return false
  if (/[?¿]/.test(trimmed)) return true
  const lower = trimmed.toLowerCase()
  if (QUESTION_KEYWORDS.some((kw) => lower.includes(kw))) return true
  return trimmed.split(/\s+/).length >= 4
}

/**
 * Tries to answer free text that didn't match whatever the current flow was
 * expecting, WITHOUT changing conversation state — the caller re-prompts its
 * original question afterward so the patient can still complete it. Returns
 * null when the text doesn't look like a genuine question (garbled replies
 * to the actual prompt fall through to the flow's normal "invalid" message).
 */
export async function tryAnswerOffScript(
  rawText: string,
  lang: Language,
  settings: ClinicSettings,
): Promise<FlowReply | null> {
  const lower = rawText.trim().toLowerCase()
  if (LOCATION_KEYWORDS.some((kw) => lower.includes(kw))) {
    return locationReply(lang, settings)
  }

  if (isGratitudeMessage(rawText)) {
    return { text: t(lang, "gratitudeReply") }
  }

  if (!looksLikeAQuestion(rawText)) return null

  const { intent, answer } = await openaiService.classifyAndAnswer(rawText, lang, settings)
  if (intent === Intent.BOOK_APPOINTMENT || intent === Intent.RESCHEDULE_APPOINTMENT || intent === Intent.CANCEL_APPOINTMENT) {
    return null
  }
  return answer ? { text: answer } : null
}
