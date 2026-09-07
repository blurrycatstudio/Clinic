import { ConversationState, FlowType, Intent, t } from "@clinic/shared"
import type { FlowHandler } from "./types.js"
import { openaiService } from "../services/openaiService.js"

const MENU_ESCAPE_WORDS = new Set(["menu", "hola", "hi", "hello"])
const LOCATION_KEYWORDS = ["ubicaci", "direcci", "location", "address", "mapa", "map", "donde", "dónde", "where"]

export const clinicInfoFlow: FlowHandler = async ({ text, context, settings }) => {
  const lang = context.language ?? "es"
  const trimmed = text.trim()

  if (MENU_ESCAPE_WORDS.has(trimmed.toLowerCase())) {
    return {
      context: { ...context, state: ConversationState.AWAITING_MENU_SELECTION, activeFlow: FlowType.NONE },
      reply: { text: t(lang, "mainMenu", { clinicName: settings.clinic_name }) },
    }
  }

  const lowerText = trimmed.toLowerCase()
  if (LOCATION_KEYWORDS.some((kw) => lowerText.includes(kw)) && settings.latitude != null && settings.longitude != null) {
    return {
      context,
      reply: {
        text: lang === "es" ? `📍 ${settings.address}` : `📍 ${settings.address}`,
        location: {
          latitude: settings.latitude,
          longitude: settings.longitude,
          name: settings.clinic_name,
          address: settings.address,
        },
      },
    }
  }

  const { intent, answer } = await openaiService.classifyAndAnswer(trimmed, lang, settings)
  if (intent === Intent.BOOK_APPOINTMENT || intent === Intent.RESCHEDULE_APPOINTMENT || intent === Intent.CANCEL_APPOINTMENT) {
    // OpenAI only classifies — it never books. Redirect the patient to the deterministic menu flow.
    return {
      context: { ...context, state: ConversationState.AWAITING_MENU_SELECTION, activeFlow: FlowType.NONE },
      reply: { text: t(lang, "mainMenu", { clinicName: settings.clinic_name }) },
    }
  }

  const faqAnswer = answer ?? (await openaiService.answerFaq(trimmed, lang, settings))
  return {
    context,
    reply: { text: faqAnswer },
  }
}
