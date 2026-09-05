import { ConversationState, FlowType, t } from "@clinic/shared"
import type { FlowHandler } from "./types.js"
import { enterRescheduleFlow } from "./rescheduleFlow.js"
import { enterCancelFlow } from "./cancelFlow.js"

export const mainMenuFlow: FlowHandler = async ({ text, buttonId, context, settings }) => {
  const lang = context.language ?? "es"
  const choice = (buttonId ?? text).trim()

  switch (choice) {
    case "1":
      return {
        context: { ...context, state: ConversationState.AWAITING_NAME, activeFlow: FlowType.BOOK, booking: {} },
        reply: { text: t(lang, "askName") },
      }
    case "2":
      return enterRescheduleFlow(context)
    case "3":
      return enterCancelFlow(context)
    case "4":
      return {
        context: { ...context, state: ConversationState.AWAITING_FAQ_QUESTION, activeFlow: FlowType.INFO },
        reply: { text: t(lang, "infoPrompt") },
      }
    case "5":
      return {
        context: { ...context, state: ConversationState.ESCALATED_TO_HUMAN, activeFlow: FlowType.HUMAN_SUPPORT },
        reply: { text: t(lang, "humanSupportAck") },
      }
    default:
      return {
        context,
        reply: { text: t(lang, "menuInvalid") },
      }
  }
}

export function mainMenuText(lang: "en" | "es", clinicName: string): string {
  return t(lang, "mainMenu", { clinicName })
}
