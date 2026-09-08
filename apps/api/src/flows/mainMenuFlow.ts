import { format } from "date-fns"
import { toZonedTime } from "date-fns-tz"
import { CLINIC_TIMEZONE, ConversationState, FlowType, t } from "@clinic/shared"
import type { FlowHandler } from "./types.js"
import { enterRescheduleFlow } from "./rescheduleFlow.js"
import { enterCancelFlow } from "./cancelFlow.js"
import { appointmentService } from "../services/appointmentService.js"
import { patientRepository } from "../repositories/patientRepository.js"
import { appointmentRepository } from "../repositories/appointmentRepository.js"

export const mainMenuFlow: FlowHandler = async ({ text, buttonId, context, settings }) => {
  const lang = context.language ?? "es"
  const choice = (buttonId ?? text).trim()

  switch (choice) {
    case "1": {
      // Returning patients (recognized by their WhatsApp number) skip straight past
      // the name/phone questions with their saved details pre-filled — they can
      // still overwrite the name in the confirmation step if it's wrong/outdated.
      const existingPatient = await patientRepository.findByPhone(context.phoneE164)
      if (existingPatient) {
        const lastAppointment = await appointmentRepository.findMostRecentForPatient(existingPatient.id)
        const lastReason = lastAppointment?.reason
        const reasonLine = lastReason ? t(lang, "lastVisitReasonLine", { reason: lastReason }) : ""

        return {
          context: {
            ...context,
            state: ConversationState.AWAITING_RETURNING_PATIENT_CONFIRMATION,
            activeFlow: FlowType.BOOK,
            booking: {
              fullName: existingPatient.full_name,
              phoneE164: existingPatient.phone_e164,
              ...(lastReason ? { lastReason } : {}),
            },
          },
          reply: {
            text: t(lang, "confirmSavedDetails", {
              name: existingPatient.full_name,
              phone: existingPatient.phone_e164,
              reasonLine,
            }),
          },
        }
      }
      return {
        context: { ...context, state: ConversationState.AWAITING_NAME, activeFlow: FlowType.BOOK, booking: {} },
        reply: { text: t(lang, "askName") },
      }
    }
    case "2":
      return enterRescheduleFlow(context)
    case "3":
      return enterCancelFlow(context)
    case "4": {
      const hours = lang === "es" ? settings.hours_summary_es : settings.hours_summary_en
      const parking = lang === "es" ? settings.parking_info_es : settings.parking_info_en
      const overview = t(lang, "clinicOverview", { address: settings.address, hours, parking })

      return {
        context: { ...context, state: ConversationState.AWAITING_FAQ_QUESTION, activeFlow: FlowType.INFO },
        reply: {
          text: `${overview}\n\n${t(lang, "infoPrompt")}`,
          ...(settings.latitude != null && settings.longitude != null
            ? {
                location: {
                  latitude: settings.latitude,
                  longitude: settings.longitude,
                  name: settings.clinic_name,
                  address: settings.address,
                },
              }
            : {}),
        },
      }
    }
    case "5":
      return {
        context: { ...context, state: ConversationState.ESCALATED_TO_HUMAN, activeFlow: FlowType.HUMAN_SUPPORT },
        reply: { text: t(lang, "humanSupportAck") },
      }
    case "6": {
      const appointments = await appointmentService.findActiveAppointmentsForPhone(context.phoneE164)
      const resetContext = { ...context, state: ConversationState.AWAITING_MENU_SELECTION, activeFlow: FlowType.NONE }

      if (appointments.length === 0) {
        return { context: resetContext, reply: { text: t(lang, "noAppointmentsFound") } }
      }

      const lines = appointments
        .map((a) => {
          const zoned = toZonedTime(new Date(a.starts_at), CLINIC_TIMEZONE)
          const statusKey = a.status === "confirmed" ? "statusConfirmed" : "statusScheduled"
          return t(lang, "appointmentStatusLine", {
            date: format(zoned, "EEEE d MMMM"),
            time: format(zoned, "h:mm a"),
            status: t(lang, statusKey),
          })
        })
        .join("\n")

      return { context: resetContext, reply: { text: t(lang, "yourAppointmentsStatus", { appointments: lines }) } }
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
