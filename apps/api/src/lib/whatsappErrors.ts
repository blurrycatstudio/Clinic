import { AppError, ExternalServiceError } from "./errors.js"

/**
 * A rejection from the WhatsApp Cloud API, keeping Meta's own error code so callers can
 * tell "outside the 24h window" (fixable with a template) apart from "this number isn't
 * on WhatsApp" (not fixable) instead of treating every failure the same.
 */
export class WhatsappApiError extends ExternalServiceError {
  readonly metaCode: number | null
  readonly httpStatus: number

  constructor(message: string, httpStatus: number, metaCode: number | null, details?: unknown) {
    super("WhatsApp Cloud API", message, details)
    this.name = "WhatsappApiError"
    this.httpStatus = httpStatus
    this.metaCode = metaCode
  }
}

export type WhatsappFailureKind =
  /** Outside the 24h customer-service window — only an approved template can start the conversation. */
  | "session_expired"
  /** The number has no WhatsApp account (or hasn't accepted WhatsApp's terms). */
  | "not_on_whatsapp"
  /** Sandbox/dev mode: the recipient isn't on the app's allowed list. */
  | "not_allowed"
  | "rate_limited"
  /** Access token expired/invalid or missing permission — needs a developer, not a retry. */
  | "auth"
  /** The template is missing, paused, in another language, or got the wrong parameters. */
  | "template"
  | "not_configured"
  | "unknown"

const SESSION_EXPIRED_CODES = new Set([131047, 131051])
const NOT_ON_WHATSAPP_CODES = new Set([131026, 133010])
const NOT_ALLOWED_CODES = new Set([131030])
const RATE_LIMIT_CODES = new Set([130429, 131056, 80007, 4, 17, 32, 613])
const AUTH_CODES = new Set([0, 10, 190, 200, 131031, 131042, 131045])
const TEMPLATE_CODES = new Set([132000, 132001, 132005, 132007, 132012, 132015, 132016, 132018, 131008, 131009])

/** Maps a Meta error code to a failure kind. Accepts a bare number so webhook status errors (which carry only a code) share the logic. */
export function classifyMetaCode(code: number | null | undefined): WhatsappFailureKind {
  if (code == null) return "unknown"
  if (SESSION_EXPIRED_CODES.has(code)) return "session_expired"
  if (NOT_ON_WHATSAPP_CODES.has(code)) return "not_on_whatsapp"
  if (NOT_ALLOWED_CODES.has(code)) return "not_allowed"
  if (RATE_LIMIT_CODES.has(code)) return "rate_limited"
  if (AUTH_CODES.has(code)) return "auth"
  if (TEMPLATE_CODES.has(code)) return "template"
  return "unknown"
}

export function classifyWhatsappError(err: unknown): WhatsappFailureKind {
  if (err instanceof WhatsappApiError) return classifyMetaCode(err.metaCode)
  return "unknown"
}

export function metaCodeOf(err: unknown): number | null {
  return err instanceof WhatsappApiError ? err.metaCode : null
}

/**
 * Meta rejects template parameters that are empty, contain newlines or tabs, or have more
 * than 4 consecutive spaces (error 132018 / 100). Clinic settings like "hours" and "parking"
 * are routinely multi-line, so every parameter is flattened to a single line here —
 * one place, so no call site can forget.
 */
export function sanitizeTemplateParam(value: string | null | undefined): string {
  const flat = (value ?? "")
    .split(/[\r\n\t]+/)
    .map((part) => part.replace(/ {2,}/g, " ").trim())
    .filter(Boolean)
    .join(" · ")
  if (flat.length === 0) return "-"
  // Body is capped at 1024 chars in total; no single variable should ever need more than this.
  return flat.length > 600 ? `${flat.slice(0, 597)}...` : flat
}

/** Plain-language reason for the dashboard ("Reminder not sent: ...") — staff can act on this, unlike Meta's raw error text. */
export function explainFailureForStaff(kind: WhatsappFailureKind): string {
  switch (kind) {
    case "session_expired":
      return "This patient hasn't messaged the clinic on WhatsApp in the last 24 hours, and WhatsApp only allows free-text messages inside that window. Ask them to send \"Hola\" to the clinic's WhatsApp number, then try again."
    case "not_on_whatsapp":
      return "WhatsApp says this phone number has no WhatsApp account."
    case "not_allowed":
      return "The clinic's WhatsApp line is still in test mode and can only message approved test numbers."
    case "rate_limited":
      return "WhatsApp is temporarily limiting messages. Please try again in a few minutes."
    case "auth":
      return "The clinic's WhatsApp connection needs attention (access token or permissions). Ask your developer to check it."
    case "template":
      return "The WhatsApp message template for this is missing, paused or misconfigured."
    case "not_configured":
      return "WhatsApp isn't configured on the server."
    default:
      return "WhatsApp couldn't deliver this message right now. Please try again in a moment."
  }
}

/** Failures caused by the patient's side (window closed, no WhatsApp) are a 422 the UI can show as-is; the rest are server-side problems (502). */
export function whatsappFailureToAppError(err: unknown): AppError {
  const kind = classifyWhatsappError(err)
  const patientSide = kind === "session_expired" || kind === "not_on_whatsapp"
  return new AppError(explainFailureForStaff(kind), patientSide ? 422 : 502, "WHATSAPP_NOT_DELIVERABLE", { kind })
}
