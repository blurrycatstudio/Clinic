import { format } from "date-fns"
import { es } from "date-fns/locale"
import { toZonedTime } from "date-fns-tz"
import { CLINIC_TIMEZONE, type Language } from "@clinic/shared"

/**
 * Patient-facing date/time text in the patient's own language. Bare `format(zoned, "EEEE d MMMM")`
 * defaults to English, so a Spanish-speaking patient was shown "Fecha: Thursday 8 October".
 * Always formats in the clinic's timezone, whatever the server's own is.
 */
function zoned(input: Date | string): Date {
  return toZonedTime(typeof input === "string" ? new Date(input) : input, CLINIC_TIMEZONE)
}

const localeFor = (lang: Language) => (lang === "es" ? { locale: es } : {})

/** "Thursday 8 October" / "jueves 8 de octubre" */
export function formatClinicDate(input: Date | string, lang: Language): string {
  return format(zoned(input), lang === "es" ? "EEEE d 'de' MMMM" : "EEEE d MMMM", localeFor(lang))
}

/** "2:30 PM" — same in both languages. */
export function formatClinicTime(input: Date | string): string {
  return format(zoned(input), "h:mm a")
}

/** Short tappable-row label: "Thu 8 Oct, 2:30 PM" / "jue 8 oct, 2:30 PM" (WhatsApp list row titles cap at 24 chars). */
export function formatClinicSlotLabel(input: Date | string, lang: Language): string {
  return format(zoned(input), "EEE d MMM, h:mm a", localeFor(lang))
}
