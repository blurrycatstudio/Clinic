/**
 * Voice transcription and caller-ID hand-offs produce phone numbers in every
 * shape ("+52 55 1234 5678", "(555) 123-4567", "tel:+5255…", "00 52 …").
 * Patients are stored as compact E.164, so every number coming from the voice
 * agent is normalised before lookup/insert — otherwise "+52 55…" misses the
 * existing patient and silently creates a duplicate.
 */
export function normalizePhone(raw: string): string {
  let value = raw.trim().replace(/^tel:/i, "")
  value = value.replace(/^00\s*(?=\d)/, "+")
  const hasPlus = value.startsWith("+")
  const digits = value.replace(/\D/g, "")
  // 11+ digits can only be country code + number, so the missing "+" is safe to restore
  // (stored patients and WhatsApp conversations are always "+<digits>"). A bare 10-digit
  // number is ambiguous and is rejected by callers via hasCountryCode().
  return hasPlus || digits.length >= 11 ? `+${digits}` : digits
}

/** True when a normalised number carries its country code — required before we message it, or WhatsApp may route it to a stranger abroad. */
export function hasCountryCode(normalized: string): boolean {
  return normalized.startsWith("+") && normalized.replace(/\D/g, "").length >= 8
}

/** True when two numbers refer to the same line, tolerating a missing "+"/country prefix on one side. */
export function phonesMatch(a: string, b: string): boolean {
  const da = normalizePhone(a).replace(/\D/g, "")
  const db = normalizePhone(b).replace(/\D/g, "")
  if (!da || !db) return false
  if (da === db) return true
  const shorter = Math.min(da.length, db.length)
  // Same trailing 10 digits covers "+52 55…" vs "55…" without matching unrelated numbers.
  return shorter >= 10 && da.slice(-10) === db.slice(-10)
}
