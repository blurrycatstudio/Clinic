import { ConversationState, FlowType, t, type Language } from "@clinic/shared"
import type { FlowHandler } from "./types.js"
import { conversationRepository } from "../repositories/conversationRepository.js"
import { buildMainMenu } from "./mainMenuFlow.js"

export const languageSelectFlow: FlowHandler = async ({ text, buttonId, context, settings }) => {
  const choice = (buttonId ?? text).trim()

  if (choice !== "1" && choice !== "2") {
    return {
      context,
      reply: { text: t("es", "languageInvalid") + "\n" + t("en", "languageInvalid") },
    }
  }

  const language: Language = choice === "1" ? "es" : "en"
  await conversationRepository.setLanguage(context.conversationId, language)

  const next = { ...context, language, state: ConversationState.AWAITING_MENU_SELECTION, activeFlow: FlowType.NONE }
  return {
    context: next,
    reply: buildMainMenu(language, settings),
  }
}
