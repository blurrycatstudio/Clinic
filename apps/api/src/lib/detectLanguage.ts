import type { Language } from "@clinic/shared"

/**
 * Deterministic, no-LLM language guess for a patient's very first message.
 * Only returns a language when reasonably confident — ambiguous input (e.g. a
 * bare emoji, a number) returns null so the caller falls back to the explicit
 * 1/2 picker instead of guessing wrong on the very first turn.
 */

const SPANISH_GREETING = /^(hola+|buenas|buenos\s*d[ií]as|buenas\s*tardes|buenas\s*noches|qu[eé]\s*tal|oye)\b/
const ENGLISH_GREETING = /^(h+i+|h+e+y+|h+e+ll+o+|good\s*(morning|afternoon|evening)|sup|yo)\b/

const SPANISH_WORDS = new Set([
  "el", "la", "los", "las", "de", "que", "quiero", "tengo", "necesito", "cita", "citas",
  "doctor", "doctora", "dolor", "niño", "nino", "niña", "nina", "hijo", "hija", "mi", "para",
  "una", "un", "por", "favor", "gracias", "cuando", "cuándo", "hoy", "mañana", "manana",
  "puedo", "podria", "podría", "quisiera", "buenas", "consulta", "medico", "médico",
])

const ENGLISH_WORDS = new Set([
  "the", "have", "want", "need", "appointment", "book", "booking", "for", "my", "son",
  "daughter", "kid", "child", "doctor", "pain", "fever", "today", "tomorrow", "please",
  "thanks", "thank", "when", "can", "could", "would", "like", "visit", "asap", "soon",
])

function stripDiacritics(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "")
}

export function detectLanguageHeuristic(rawText: string): Language | null {
  const normalized = rawText.trim().toLowerCase()
  if (!normalized) return null

  if (SPANISH_GREETING.test(normalized)) return "es"
  if (ENGLISH_GREETING.test(normalized)) return "en"

  // Strong, unambiguous Spanish signal: inverted punctuation, ñ, or accented vowels.
  const hasSpanishMarks = /[¿¡ñ]|[áéíóú]/.test(normalized)

  const words = stripDiacritics(normalized)
    .replace(/[^\p{L}\s]/gu, " ")
    .split(/\s+/)
    .filter(Boolean)

  let esScore = hasSpanishMarks ? 2 : 0
  let enScore = 0
  for (const word of words) {
    if (SPANISH_WORDS.has(word)) esScore++
    if (ENGLISH_WORDS.has(word)) enScore++
  }

  if (esScore === 0 && enScore === 0) return null
  if (esScore >= 2 && esScore >= enScore * 2) return "es"
  if (enScore >= 2 && enScore >= esScore * 2) return "en"
  return null
}
