import { Intent, type ClinicSettings, type IntentDetectionResult, type Language } from "@clinic/shared"
import { openai, OPENAI_MODEL } from "../config/openai.js"
import { logger } from "../config/logger.js"

/**
 * OpenAI's ONLY jobs in this system:
 *   1. Classify free-text into one of a fixed Intent enum (detectIntent).
 *   2. Answer clinic FAQ questions using clinic_settings as grounding (answerFaq).
 *   3. Produce a safe fallback reply when nothing else matched (fallbackReply).
 *
 * It never creates, modifies, or cancels an appointment, and it never sees
 * or decides slot availability — appointmentService.ts is 100% deterministic
 * business logic. If OpenAI is unavailable or returns something unparsable,
 * every function here degrades to Intent.UNKNOWN / a generic apology rather
 * than throwing, so a flaky AI call never blocks a booking flow that doesn't
 * actually need it.
 */

const INTENT_VALUES = Object.values(Intent)

export const openaiService = {
  async detectIntent(userText: string, language: Language): Promise<IntentDetectionResult> {
    try {
      const completion = await openai.chat.completions.create({
        model: OPENAI_MODEL,
        temperature: 0,
        max_tokens: 20,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              `Classify the patient's WhatsApp message into exactly one of these intents: ${INTENT_VALUES.join(", ")}. ` +
              `Reply with strict JSON: {"intent": "<ONE_OF_THE_ABOVE>", "confidence": <0 to 1>}. ` +
              `The patient is writing in ${language === "es" ? "Spanish" : "English"}. ` +
              `This is a pediatric clinic receptionist bot. Only classify — never generate a conversational reply.`,
          },
          { role: "user", content: userText },
        ],
      })

      const raw = completion.choices[0]?.message?.content
      if (!raw) return { intent: Intent.UNKNOWN, confidence: 0 }

      const parsed = JSON.parse(raw) as { intent?: string; confidence?: number }
      const intent = INTENT_VALUES.includes(parsed.intent as Intent) ? (parsed.intent as Intent) : Intent.UNKNOWN
      const confidence = typeof parsed.confidence === "number" ? parsed.confidence : 0.5
      return { intent, confidence }
    } catch (err) {
      logger.error({ err }, "OpenAI intent detection failed — defaulting to UNKNOWN")
      return { intent: Intent.UNKNOWN, confidence: 0 }
    }
  },

  async answerFaq(question: string, language: Language, settings: ClinicSettings): Promise<string> {
    try {
      const grounding =
        language === "es"
          ? `Clínica: ${settings.clinic_name}\nDoctor: ${settings.doctor_name} (${settings.doctor_specialty}, cédula ${settings.doctor_license})\nDirección: ${settings.address}\nHorario: ${settings.hours_summary_es}\nEstacionamiento: ${settings.parking_info_es}\nCostos: ${settings.fees_info_es}\nSeguros: ${settings.insurance_info_es}`
          : `Clinic: ${settings.clinic_name}\nDoctor: ${settings.doctor_name} (${settings.doctor_specialty}, license ${settings.doctor_license})\nAddress: ${settings.address}\nHours: ${settings.hours_summary_en}\nParking: ${settings.parking_info_en}\nFees: ${settings.fees_info_en}\nInsurance: ${settings.insurance_info_en}`

      const completion = await openai.chat.completions.create({
        model: OPENAI_MODEL,
        temperature: 0.2,
        max_tokens: 220,
        messages: [
          {
            role: "system",
            content:
              `You are the WhatsApp receptionist assistant for a pediatric clinic. Answer the patient's question ` +
              `ONLY using the clinic facts below. Reply in ${language === "es" ? "Spanish" : "English"}, warmly and ` +
              `concisely (max 3 sentences). If the answer isn't in the facts, say you're not sure and suggest ` +
              `option 5 (human support) — do NOT make anything up, and do NOT offer to book/cancel/reschedule ` +
              `appointments yourself; tell them to use the main menu for that.\n\n${grounding}`,
          },
          { role: "user", content: question },
        ],
      })

      return (
        completion.choices[0]?.message?.content?.trim() ??
        (language === "es"
          ? "No tengo esa información a la mano. Escribe 5 para hablar con nuestro equipo."
          : "I don't have that information handy. Type 5 to talk to our team.")
      )
    } catch (err) {
      logger.error({ err }, "OpenAI FAQ answering failed")
      return language === "es"
        ? "No pude procesar tu pregunta en este momento. Escribe 5 para hablar con nuestro equipo."
        : "I couldn't process that question right now. Type 5 to talk to our team."
    }
  },

  async fallbackReply(userText: string, language: Language): Promise<string> {
    try {
      const completion = await openai.chat.completions.create({
        model: OPENAI_MODEL,
        temperature: 0.3,
        max_tokens: 120,
        messages: [
          {
            role: "system",
            content:
              `You are a WhatsApp receptionist bot for a pediatric clinic. The patient's message didn't match a ` +
              `known menu option or FAQ. Reply briefly and kindly in ${language === "es" ? "Spanish" : "English"}, ` +
              `and steer them back to typing "Hi"/"Hola" to see the main menu. Never invent clinic facts, never ` +
              `promise to book/cancel/reschedule anything yourself.`,
          },
          { role: "user", content: userText },
        ],
      })
      return completion.choices[0]?.message?.content?.trim() ?? ""
    } catch (err) {
      logger.error({ err }, "OpenAI fallback reply failed")
      return ""
    }
  },
}
