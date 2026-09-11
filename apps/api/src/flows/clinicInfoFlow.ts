import { ConversationState, FlowType, Intent } from "@clinic/shared"
import type { FlowHandler } from "./types.js"
import { openaiService } from "../services/openaiService.js"
import { buildMainMenu, startBookingChoice } from "./mainMenuFlow.js"
import { startBookingFromFreeText } from "./bookAppointmentFlow.js"
import { enterRescheduleFlow } from "./rescheduleFlow.js"
import { enterCancelFlow } from "./cancelFlow.js"
import { LOCATION_KEYWORDS, locationReply } from "../lib/offScript.js"
import { backToMenuButton } from "./backToMenuButton.js"

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

  // A fully-specified booking request ("book me for the 14th at 5pm") is resolved
  // deterministically before even asking OpenAI to classify it.
  const bookingResult = await startBookingFromFreeText(context, trimmed)
  if (bookingResult) return bookingResult

  const { intent, answer } = await openaiService.classifyAndAnswer(trimmed, lang, settings)
  // OpenAI only classifies — it never books. A booking/reschedule/cancel intent with no
  // specific date/time still needs to actually start that flow, not just point back at
  // the menu and make the patient repeat themselves.
  if (intent === Intent.BOOK_APPOINTMENT) return startBookingChoice(context, lang, trimmed)
  if (intent === Intent.RESCHEDULE_APPOINTMENT) return enterRescheduleFlow(context)
  if (intent === Intent.CANCEL_APPOINTMENT) return enterCancelFlow(context)

  const faqAnswer = answer ?? (await openaiService.answerFaq(trimmed, lang, settings))
  return {
    context,
    reply: { text: faqAnswer, buttons: [backToMenuButton(lang)] },
  }
}
