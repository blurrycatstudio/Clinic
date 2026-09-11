import { ConversationState, FlowType, Intent } from "@clinic/shared"
import type { FlowHandler } from "./types.js"
import { openaiService } from "../services/openaiService.js"
import { buildMainMenu } from "./mainMenuFlow.js"
import { LOCATION_KEYWORDS, locationReply } from "../lib/offScript.js"

const MENU_ESCAPE_WORDS = new Set(["menu", "hola", "hi", "hello"])

export const clinicInfoFlow: FlowHandler = async ({ text, context, settings }) => {
  const lang = context.language ?? "es"
  const trimmed = text.trim()

  if (MENU_ESCAPE_WORDS.has(trimmed.toLowerCase())) {
    return {
      context: { ...context, state: ConversationState.AWAITING_MENU_SELECTION, activeFlow: FlowType.NONE },
      reply: buildMainMenu(lang, settings),
    }
  }

  const lowerText = trimmed.toLowerCase()
  if (LOCATION_KEYWORDS.some((kw) => lowerText.includes(kw))) {
    return { context, reply: locationReply(lang, settings) }
  }

  const { intent, answer } = await openaiService.classifyAndAnswer(trimmed, lang, settings)
  if (intent === Intent.BOOK_APPOINTMENT || intent === Intent.RESCHEDULE_APPOINTMENT || intent === Intent.CANCEL_APPOINTMENT) {
    // OpenAI only classifies — it never books. Redirect the patient to the deterministic menu flow.
    return {
      context: { ...context, state: ConversationState.AWAITING_MENU_SELECTION, activeFlow: FlowType.NONE },
      reply: buildMainMenu(lang, settings),
    }
  }

  const faqAnswer = answer ?? (await openaiService.answerFaq(trimmed, lang, settings))
  return {
    context,
    reply: { text: faqAnswer },
  }
}
