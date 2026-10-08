/**
 * The API saves an appointment change first and then tries to WhatsApp the patient. When that
 * message can't be delivered (most often: the patient hasn't messaged the clinic in the last 24h,
 * so WhatsApp refuses free text) the change is still saved — this turns the API's `notification`
 * verdict into the toast staff should see, instead of an unqualified "done".
 */
type NotificationVerdict = { sent: boolean; message?: string; failure?: string }

const SHORT_REASON: Record<string, string> = {
  session_expired: "patient hasn't messaged in the last 24h",
  not_on_whatsapp: "number isn't on WhatsApp",
  not_allowed: "WhatsApp line is in test mode",
  rate_limited: "WhatsApp is rate-limiting",
  auth: "WhatsApp connection needs attention",
  template: "message template missing",
  not_configured: "WhatsApp isn't configured",
}

export function withNotificationNote(base: string, response: unknown): { text: string; variant: "success" | "info" } {
  const notification = (response as { notification?: NotificationVerdict } | undefined)?.notification
  if (!notification || notification.sent) return { text: base, variant: "success" }
  const reason = (notification.failure && SHORT_REASON[notification.failure]) || "see details in the API logs"
  return { text: `${base} — WhatsApp message NOT sent (${reason})`, variant: "info" }
}
