import { Intent, type ClinicSettings, type Language } from "@clinic/shared"
import { openaiService } from "../services/openaiService.js"
import type { FlowReply } from "../flows/types.js"

/** Shared across every flow so "where are you" is answered identically no matter which prompt the patient is mid-way through. */
export const LOCATION_KEYWORDS = [
  "ubicaci", "direcci", "location", "address", "mapa", "map", "donde", "dónde", "where",
]

function buildMapsUrl(address: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`
}

export function locationReply(lang: Language, settings: ClinicSettings): FlowReply {
  const mapsUrl = settings.google_maps_url || buildMapsUrl(settings.address)
  const text = `📍 ${settings.address}\n${mapsUrl}`
  return {
    text,
    ...(settings.latitude != null && settings.longitude != null
      ? { location: { latitude: settings.latitude, longitude: settings.longitude, name: settings.clinic_name, address: settings.address } }
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

  if (!looksLikeAQuestion(rawText)) return null

  const { intent, answer } = await openaiService.classifyAndAnswer(rawText, lang, settings)
  if (intent === Intent.BOOK_APPOINTMENT || intent === Intent.RESCHEDULE_APPOINTMENT || intent === Intent.CANCEL_APPOINTMENT) {
    return null
  }
  return answer ? { text: answer } : null
}
