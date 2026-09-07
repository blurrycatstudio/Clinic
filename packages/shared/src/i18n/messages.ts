/**
 * Deterministic bot copy for the WhatsApp conversation engine.
 * This is NOT the OpenAI FAQ answer text (that's generated per-question) —
 * these are the fixed menu/prompt/confirmation strings the state machine
 * sends verbatim, in the language the patient picked at the start of the
 * chat (stored on `whatsapp_conversations.language`).
 */

import type { Language } from "../types/database.js"

export type BotMessages = typeof botMessages.es

export const botMessages = {
  es: {
    languagePrompt:
      "¡Hola! Bienvenido a *{clinicName}* 🏥\nPor favor elige tu idioma / Please choose your language:\n\n1️⃣ Español\n2️⃣ English",
    languageInvalid: "Por favor responde 1 para Español o 2 para English.",
    mainMenu:
      "Bienvenido a *{clinicName}*.\n\n1️⃣ Agendar cita\n2️⃣ Reprogramar cita\n3️⃣ Cancelar cita\n4️⃣ Información de la clínica\n5️⃣ Hablar con un humano\n6️⃣ Ver estado de mi cita\n\nResponde con el número de tu opción.",
    menuInvalid: "No entendí esa opción. Responde con un número del 1 al 6.",
    askName: "Perfecto, vamos a agendar tu cita. ¿Cuál es el nombre completo del paciente?",
    askPhone: "Gracias, {name}. ¿Cuál es tu número de teléfono de contacto?",
    askReason: "¿Cuál es el motivo de la consulta?",
    noSlotsAvailable:
      "Lo sentimos, no encontramos horarios disponibles en los próximos días. Un miembro del equipo te contactará pronto.",
    chooseSlot: "Estos son los horarios disponibles. Responde con el número de tu opción:\n\n{slots}",
    slotInvalid: "Esa opción no es válida. Elige uno de los números de la lista.",
    confirmBooking:
      "Confirma tu cita:\n\n👤 Paciente: {name}\n📅 Fecha: {date}\n🕐 Hora: {time}\n📝 Motivo: {reason}\n\nResponde *SI* para confirmar o *NO* para cancelar.",
    bookingConfirmed:
      "✅ ¡Tu cita ha sido confirmada!\n\n📅 {date} a las {time}\n👨‍⚕️ {doctorName}\n\nTe enviaremos un recordatorio antes de tu cita.",
    bookingCancelled: "Entendido, no se agendó la cita. Escribe *Hola* si necesitas algo más.",
    confirmInvalid: "Por favor responde *SI* o *NO*.",
    noAppointmentsFound:
      "No encontramos citas activas asociadas a tu número. Si crees que es un error, elige la opción 5 para hablar con un humano.",
    yourAppointmentsStatus:
      "📋 Estas son tus citas activas:\n\n{appointments}\n\nEscribe *Hola* para volver al menú principal.",
    appointmentStatusLine: "📅 {date} a las {time} — {status}",
    statusScheduled: "Agendada",
    statusConfirmed: "Confirmada",
    chooseAppointmentToReschedule:
      "¿Cuál cita deseas reprogramar? Responde con el número:\n\n{appointments}",
    chooseAppointmentToCancel:
      "¿Cuál cita deseas cancelar? Responde con el número:\n\n{appointments}",
    appointmentSelectionInvalid: "Esa opción no es válida. Elige uno de los números de la lista.",
    confirmReschedule:
      "Confirma el cambio:\n\n📅 Nueva fecha: {date}\n🕐 Nueva hora: {time}\n\nResponde *SI* para confirmar o *NO* para cancelar.",
    rescheduleConfirmed: "✅ Tu cita fue reprogramada para el {date} a las {time}.",
    rescheduleCancelledByUser: "No se realizó ningún cambio. Escribe *Hola* si necesitas algo más.",
    confirmCancellation:
      "¿Confirmas que deseas cancelar tu cita del {date} a las {time}? Responde *SI* o *NO*.",
    cancellationConfirmed: "✅ Tu cita ha sido cancelada. Escribe *Hola* si deseas agendar una nueva.",
    cancellationAborted: "Tu cita se mantiene sin cambios. Escribe *Hola* si necesitas algo más.",
    infoPrompt:
      "Puedes preguntarme sobre horarios, dirección, estacionamiento, costos, seguros o sobre el doctor. ¿Qué te gustaría saber?",
    infoFallback:
      "Para esa pregunta lo mejor es que hables directo con nuestro equipo. Escribe *5* para que un humano te atienda.",
    humanSupportAck:
      "Entendido, un miembro de nuestro equipo revisará tu conversación y te contactará lo antes posible durante horario de atención.",
    genericFallback:
      "No estoy seguro de haber entendido. Escribe *Hola* para ver el menú principal.",
    sessionExpired: "Tu sesión anterior expiró. Escribe *Hola* para comenzar de nuevo.",
    goodbye: "¡Gracias por contactar a {clinicName}! Que tengas un buen día. 😊",
  },
  en: {
    languagePrompt:
      "Hi! Welcome to *{clinicName}* 🏥\nPlease choose your language / Por favor elige tu idioma:\n\n1️⃣ Español\n2️⃣ English",
    languageInvalid: "Please reply 1 for Español or 2 for English.",
    mainMenu:
      "Welcome to *{clinicName}*.\n\n1️⃣ Book Appointment\n2️⃣ Reschedule Appointment\n3️⃣ Cancel Appointment\n4️⃣ Clinic Information\n5️⃣ Human Support\n6️⃣ Check Appointment Status\n\nReply with the number of your choice.",
    menuInvalid: "Sorry, I didn't get that. Reply with a number from 1 to 6.",
    askName: "Great, let's book your appointment. What's the patient's full name?",
    askPhone: "Thanks, {name}. What's the best contact phone number?",
    askReason: "What's the reason for the visit?",
    noSlotsAvailable:
      "Sorry, we couldn't find any open slots in the coming days. A team member will reach out shortly.",
    chooseSlot: "Here are the available time slots. Reply with the number of your choice:\n\n{slots}",
    slotInvalid: "That's not a valid option. Please choose one of the listed numbers.",
    confirmBooking:
      "Please confirm your appointment:\n\n👤 Patient: {name}\n📅 Date: {date}\n🕐 Time: {time}\n📝 Reason: {reason}\n\nReply *YES* to confirm or *NO* to cancel.",
    bookingConfirmed:
      "✅ Your appointment is confirmed!\n\n📅 {date} at {time}\n👨‍⚕️ {doctorName}\n\nWe'll send you a reminder before your visit.",
    bookingCancelled: "No problem, the appointment wasn't booked. Type *Hi* if you need anything else.",
    confirmInvalid: "Please reply *YES* or *NO*.",
    noAppointmentsFound:
      "We couldn't find any active appointments under your number. If you think this is a mistake, choose option 5 to talk to a human.",
    yourAppointmentsStatus: "📋 Here are your active appointments:\n\n{appointments}\n\nType *Hi* to go back to the main menu.",
    appointmentStatusLine: "📅 {date} at {time} — {status}",
    statusScheduled: "Scheduled",
    statusConfirmed: "Confirmed",
    chooseAppointmentToReschedule: "Which appointment would you like to reschedule? Reply with the number:\n\n{appointments}",
    chooseAppointmentToCancel: "Which appointment would you like to cancel? Reply with the number:\n\n{appointments}",
    appointmentSelectionInvalid: "That's not a valid option. Please choose one of the listed numbers.",
    confirmReschedule:
      "Please confirm the change:\n\n📅 New date: {date}\n🕐 New time: {time}\n\nReply *YES* to confirm or *NO* to cancel.",
    rescheduleConfirmed: "✅ Your appointment was moved to {date} at {time}.",
    rescheduleCancelledByUser: "No changes were made. Type *Hi* if you need anything else.",
    confirmCancellation: "Do you confirm cancelling your appointment on {date} at {time}? Reply *YES* or *NO*.",
    cancellationConfirmed: "✅ Your appointment has been cancelled. Type *Hi* if you'd like to book a new one.",
    cancellationAborted: "Your appointment remains unchanged. Type *Hi* if you need anything else.",
    infoPrompt:
      "You can ask me about hours, address, parking, fees, insurance, or the doctor. What would you like to know?",
    infoFallback: "For that question it's best to speak with our team directly. Type *5* to reach a human.",
    humanSupportAck:
      "Got it — a member of our team will review your conversation and reach out as soon as possible during business hours.",
    genericFallback: "I'm not sure I understood that. Type *Hi* to see the main menu.",
    sessionExpired: "Your previous session expired. Type *Hi* to start again.",
    goodbye: "Thanks for contacting {clinicName}! Have a great day. 😊",
  },
} as const satisfies Record<Language, Record<string, string>>

export function t(lang: Language, key: keyof BotMessages, vars?: Record<string, string>): string {
  let template: string = botMessages[lang][key]
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      template = template.replaceAll(`{${k}}`, v)
    }
  }
  return template
}
