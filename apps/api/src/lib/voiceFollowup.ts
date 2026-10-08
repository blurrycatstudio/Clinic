/**
 * The voice follow-up template's quick-reply button carries the caller's original intent
 * as `vf:<intent>`. When the patient taps it, the webhook strips the prefix and feeds the
 * intent to the main-menu flow as if they had tapped that menu option — so a caller who
 * asked to book by phone lands directly in the booking flow instead of a generic menu.
 */
export const VOICE_FOLLOWUP_PAYLOAD_PREFIX = "vf:"

export function voiceFollowupPayload(intent: string): string {
  return `${VOICE_FOLLOWUP_PAYLOAD_PREFIX}${intent}`
}
