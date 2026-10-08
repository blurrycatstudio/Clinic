/**
 * Strict readers for the short replies a flow expects ("2", "yes", "sí"), shared by every
 * flow so they all agree on what counts as one — and, more importantly, on what does NOT.
 *
 * The bug these replace: `Number.parseInt("2 days after at 2 pm")` is 2, so a patient who typed a
 * date/time at a "pick a slot" prompt silently got list option #2. A reply is only a list choice
 * when the WHOLE message is a number; anything longer is a date/time/question for the caller to read.
 */

const NUMBER_WORDS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  uno: 1, una: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10,
}

// "the first one" / "la primera" — whole-message ordinals only. A bare "2nd"/"el 2" is deliberately NOT
// here: at a slot prompt it means a calendar date, not option 2.
const ORDINAL_WORDS: Record<string, number> = {
  first: 1, second: 2, third: 3, fourth: 4, fifth: 5, sixth: 6, seventh: 7, eighth: 8,
  primero: 1, primera: 1, segundo: 2, segunda: 2, tercero: 3, tercera: 3, cuarto: 4, cuarta: 4,
  quinto: 5, quinta: 5, sexto: 6, sexta: 6, septimo: 7, septima: 7, octavo: 8, octava: 8,
}

/** Lowercases, drops accents, emoji variation selectors and punctuation, and collapses whitespace. */
function normalizeReply(raw: string): string {
  return raw
    .normalize("NFKC") // fullwidth digits ("２") -> "2"
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ️⃣]/g, "")
    .replace(/[^\p{L}\p{N}\s#]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
}

/**
 * The 1-based list position a reply picks, or null when the reply isn't a bare choice. Accepts "2", "2.",
 * "#2", "2️⃣", "option 2", "opción 2", "number two", "dos", "the first one", "la primera".
 * Rejects anything with other content — "2 pm", "2 days after at 2 pm", "14".
 */
export function parseListChoice(raw: string): number | null {
  const text = normalizeReply(raw)
  if (!text) return null

  // The prefix needs a separator after it so "nine"/"nueve" aren't misread as "n" + "ine".
  const withoutPrefix = text.replace(/^(?:(?:option|opt|number|num|no|opcion|numero|n)(?:\s+#?\s*|#\s*)|#\s*)/, "").trim()
  if (/^\d{1,2}$/.test(withoutPrefix)) return Number.parseInt(withoutPrefix, 10)

  const number = NUMBER_WORDS[withoutPrefix]
  if (number) return number

  const ordinal = withoutPrefix.replace(/^(?:the|el|la)\s+/, "").replace(/\s+(?:one|option|opcion|choice)$/, "")
  return ORDINAL_WORDS[ordinal] ?? null
}

const YES_STRICT = new Set(["yes", "y", "yeah", "yep", "yup", "confirm", "confirmed", "si", "s", "confirmo", "confirmar", "confirmada", "1"])
// Courtesies and confirmations that may follow a yes without changing its meaning: "yes I confirm", "sí, confirmo", "yes thanks".
const YES_TAIL = String.raw`(?:\s+(?:please|pls|thanks|thank you|gracias|por favor|porfa|i confirm|confirmo|confirmado|que si|claro que si))*`
const YES_STRICT_RE = new RegExp(String.raw`^(?:yes|yeah|yep|yup|y|si|s|confirm|confirmed|confirmo|confirmar)${YES_TAIL}$`)
// Casual agreement is fine for booking a visit but too loose for cancelling one — "ok" after
// "Reply YES to cancel your appointment" must not cancel it.
const YES_CASUAL = new Set([
  "ok", "okay", "sure", "correct", "right", "thats right", "sounds good", "go ahead", "book it", "do it", "perfect",
  "that works", "works for me", "thats fine", "thats good", "thats perfect", "fine", "great",
  "vale", "dale", "listo", "claro", "correcto", "de acuerdo", "esta bien", "adelante", "perfecto", "agendala", "me parece bien", "esta perfecto",
])
const YES_CASUAL_RE = new RegExp(
  String.raw`^(?:yes|yeah|yep|yup|si|ok|okay|sure|claro|dale|vale|listo)(?:\s+(?:that works|works for me|thats (?:fine|good|right|perfect)|sounds good|it is|esta bien|me parece bien|perfecto|de acuerdo|asi es))*${YES_TAIL}$`,
)
const NO = new Set([
  "no", "n", "nope", "nah", "no thanks", "no thank you", "not really", "negative", "never mind", "nevermind",
  "no gracias", "negativo", "mejor no", "no quiero", "no por favor", "2",
])
// Saying "cancel" while being asked to confirm a BOOKING (or a reschedule) means "don't". It is not offered for the
// cancel-an-appointment confirmation, where it would mean the opposite.
const NO_CANCEL = new Set(["cancel", "cancelar", "stop", "dont", "olvidalo", "mejor despues"])

const POSITIVE_EMOJI = /^[\s👍✅👌🙌✔☑]+$/u
const NEGATIVE_EMOJI = /^[\s👎❌🚫✖]+$/u

/** Removes a trailing courtesy so "yes please" / "no gracias" reduce to the bare answer without enumerating every pairing. */
function stripCourtesy(text: string): string {
  return text.replace(/\s+(?:please|pls|thanks|thank you|gracias|por favor|porfa)$/, "").trim()
}

export function isAffirmative(raw: string, { casual = false }: { casual?: boolean } = {}): boolean {
  if (POSITIVE_EMOJI.test(raw)) return casual
  const text = normalizeReply(raw)
  const bare = stripCourtesy(text)
  if (YES_STRICT.has(text) || YES_STRICT.has(bare) || YES_STRICT_RE.test(text)) return true
  return casual && (YES_CASUAL.has(text) || YES_CASUAL.has(bare) || YES_CASUAL_RE.test(text))
}

export function isNegative(raw: string, { allowCancel = false }: { allowCancel?: boolean } = {}): boolean {
  if (NEGATIVE_EMOJI.test(raw)) return true
  const text = normalizeReply(raw)
  const bare = stripCourtesy(text)
  return NO.has(text) || NO.has(bare) || (allowCancel && (NO_CANCEL.has(text) || NO_CANCEL.has(bare)))
}

/**
 * "no, change it" / "no that's wrong" — starts with a refusal but says more. Checked only AFTER a date/time has been
 * ruled out (so "no, friday at 10" still moves the booking instead of dropping it), and only where the safe reading of
 * a refusal is "don't go ahead".
 */
export function startsWithDecline(raw: string): boolean {
  return /^(?:no|nope|nah|negativo|mejor no)\b/.test(normalizeReply(raw))
}
