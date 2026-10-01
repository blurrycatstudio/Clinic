export type EscalationCategory =
  | "angry_patient"
  | "distressed_patient"
  | "medical_emergency"
  | "mental_health_crisis"
  | "wants_human"
  | "clinical_question"
  | "complaint"
  | "billing_dispute"
  | "low_confidence"
  | "other"

export type EscalationUrgency = "low" | "normal" | "high" | "critical"

/** Categories where a delay could hurt someone — urgency is forced to critical no matter what the model sent. */
const ALWAYS_CRITICAL: ReadonlySet<EscalationCategory> = new Set(["medical_emergency", "mental_health_crisis"])

export function effectiveUrgency(category: EscalationCategory, urgency: EscalationUrgency): EscalationUrgency {
  return ALWAYS_CRITICAL.has(category) ? "critical" : urgency
}

/**
 * Returned to the voice model as the tool result so it knows exactly what to
 * say next. The escalation endpoint can only log + alert staff; it cannot
 * speak, so the safety-critical wording lives here, not in the dashboard-only
 * Vapi prompt where it could drift or be forgotten.
 */
export function guidanceFor(category: EscalationCategory): string {
  switch (category) {
    case "medical_emergency":
      return (
        "Tell the caller calmly and clearly, in their language, to hang up and call local emergency services " +
        "(911 in the US/Canada, 112 in Europe, 911 in Mexico) or go to the nearest emergency room right now, " +
        "and not to wait for a clinic appointment. Do NOT offer a booking, do NOT diagnose, and do NOT end the call " +
        "until they confirm they will do that. Staff have been alerted."
      )
    case "mental_health_crisis":
      return (
        "Stay warm and unhurried. Acknowledge what they said, do not argue or minimise, and do not diagnose. " +
        "Urge them to contact local emergency services or a crisis line right now (988 in the US, 800-911-2000 in Mexico, " +
        "or 112/their local number elsewhere), and to be with someone they trust. Do not end the call first. " +
        "Staff have been alerted and will follow up."
      )
    case "angry_patient":
      return (
        "Apologise sincerely once, do not defend or interrupt, summarise their problem back in one sentence, and say " +
        "a staff member has been notified and will contact them. Offer the one concrete next step you can do now."
      )
    case "distressed_patient":
      return (
        "Slow down, use a gentle tone, acknowledge the feeling in one short sentence, then offer the single next step. " +
        "Do not rush them through the booking flow. Staff have been notified in case they want a personal call back."
      )
    case "wants_human":
      return (
        "Do not try to talk them out of it. Say you have notified the team and someone from the clinic will contact them " +
        "back on this number as soon as possible. Offer to help meanwhile only if they want that."
      )
    case "clinical_question":
      return (
        "Do not give medical advice, dosage, or interpretation. Say the doctor needs to answer that, that staff have been " +
        "notified to follow up, and offer to book an appointment. If any symptoms sound severe, treat it as a medical emergency instead."
      )
    case "billing_dispute":
    case "complaint":
      return "Listen without arguing, confirm you have recorded it, and say a staff member will contact them. Do not promise refunds or outcomes."
    case "low_confidence":
    case "other":
    default:
      return "Be honest that you could not fully help, say a staff member has been notified and will contact them, and confirm the best number to reach them."
  }
}
