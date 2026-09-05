import { ConversationState, FlowType, t } from "@clinic/shared"
import type { FlowHandler } from "./types.js"

const MENU_ESCAPE_WORDS = new Set(["menu", "hola", "hi", "hello"])

/**
 * Once escalated, the bot stays quiet on new inbound messages (they're just
 * logged for the human staff to read in the dashboard) except for the
 * explicit "menu" escape hatch, so a patient isn't stuck forever if staff
 * takes a while to respond.
 */
export const humanSupportFlow: FlowHandler = async ({ text, context, settings }) => {
  const lang = context.language ?? "es"
  const trimmed = text.trim().toLowerCase()

  if (MENU_ESCAPE_WORDS.has(trimmed)) {
    return {
      context: { ...context, state: ConversationState.AWAITING_MENU_SELECTION, activeFlow: FlowType.NONE },
      reply: { text: t(lang, "mainMenu", { clinicName: settings.clinic_name }) },
    }
  }

  return { context, reply: {} }
}
