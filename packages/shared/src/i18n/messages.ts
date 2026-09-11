/**
 * Deterministic bot copy for the WhatsApp conversation engine.
 * This is NOT the OpenAI FAQ answer text (that's generated per-question) —
 * these are the fixed menu/prompt/confirmation strings the state machine
 * sends verbatim, in the language the patient picked at the start of the
 * chat (stored on `whatsapp_conversations.language`).
 */

import type { Language } from "../types/database.js"
import type { MenuOptionKey } from "../types/menu.js"

export type BotMessages = typeof botMessages.es

/** Short labels (WhatsApp list rows cap titles at 24 chars) for the toggleable main-menu options. */
export const menuOptionLabels: Record<MenuOptionKey, Record<Language, string>> = {
  book: { es: "Agendar cita", en: "Book Appointment" },
  reschedule: { es: "Reprogramar cita", en: "Reschedule Appointment" },
  cancel: { es: "Cancelar cita", en: "Cancel Appointment" },
  info: { es: "Info de la clínica", en: "Clinic Information" },
  human: { es: "Hablar con un humano", en: "Human Support" },
  status: { es: "Ver estado de mi cita", en: "Appointment Status" },
}

/** Even shorter labels for the "featured" options shown as always-visible reply buttons — WhatsApp caps button titles at 20 chars. */
export const menuOptionButtonLabels: Record<MenuOptionKey, Record<Language, string>> = {
  book: { es: "Agendar cita", en: "Book Appointment" },
  reschedule: { es: "Reprogramar", en: "Reschedule" },
  cancel: { es: "Cancelar cita", en: "Cancel Appointment" },
  info: { es: "Info de la clínica", en: "Clinic Information" },
  human: { es: "Hablar con humano", en: "Human Support" },
  status: { es: "Ver estado de cita", en: "Appointment Status" },
}

export const botMessages = {
  es: {
    languagePrompt:
      "¡Hola! Bienvenido a *{clinicName}* 🏥\nPor favor elige tu idioma / Please choose your language:\n\n1️⃣ Español\n2️⃣ English",
    languageInvalid: "Por favor responde 1 para Español o 2 para English.",
    mainMenuHeader: "Bienvenido a *{clinicName}*.",
    mainMenuFooter: "Responde con el número de tu opción.",
    mainMenuFooterWithButtons: "Toca una opción rápida arriba o responde con el número de tu elección.",
    menuInvalid: "No entendí esa opción. Elige una opción rápida o responde con su número.",
    gratitudeReply: "¡Con gusto! Si necesitas algo más, aquí estamos.",
    confirmSavedDetails:
      "¡Bienvenido de nuevo! Tenemos estos datos guardados:\n\n👤 {name}\n📱 {phone}{reasonLine}\n\nResponde *SI* para usarlos, o escribe el nombre completo correcto si necesitas actualizarlo.",
    confirmYesButton: "Sí",
    confirmNoButton: "No",
    sameReasonButton: "Igual",
    moreDatesButton: "Ver más fechas",
    confirmSavedDetailsInvalid:
      "Responde *SI* para usar tus datos guardados, o escribe el nombre completo del paciente para actualizarlo.",
    lastVisitReasonLine: "\n📝 Motivo de tu última visita: {reason}",
    askName: "Perfecto, vamos a agendar tu cita. ¿Cuál es el nombre completo del paciente?",
    askPhone: "Gracias, {name}. ¿Cuál es tu número de teléfono de contacto?",
    askReason: "¿Cuál es el motivo de la consulta?",
    askReasonWithHint:
      "¿Cuál es el motivo de la consulta? Tu última visita fue por: *{lastReason}*.\nResponde *IGUAL* para usar el mismo motivo, o escribe uno nuevo.",
    noSlotsAvailable:
      "Lo sentimos, no encontramos horarios disponibles en los próximos días. Un miembro del equipo te contactará pronto.",
    requestedDayUnavailable: "No tenemos horarios disponibles ese día. Estos son los próximos horarios disponibles:",
    slotConflict: "Uy, alguien más acaba de reservar ese horario. Aquí tienes los próximos horarios disponibles:",
    chooseSlot: "Estos son los horarios disponibles. Responde con el número de tu opción:\n\n{slots}",
    chooseSlotPrompt: "Estos son los horarios disponibles. Toca uno para elegirlo, o responde con su número:",
    viewTimesButton: "Ver horarios",
    slotInvalid: "Esa opción no es válida. Elige uno de los números de la lista.",
    confirmBooking:
      "Confirma tu cita:\n\n👤 Paciente: {name}\n📅 Fecha: {date}\n🕐 Hora: {time}\n📝 Motivo: {reason}\n\nResponde *SI* para confirmar o *NO* para cancelar.",
    bookingConfirmed:
      "✅ ¡Tu cita ha sido confirmada!\n\n📅 {date} a las {time}\n👨‍⚕️ {doctorName}\n\nTe enviaremos un recordatorio antes de tu cita.",
    bookingCancelled: "Entendido, no se agendó la cita. Escribe *Hola* si necesitas algo más.",
    confirmInvalid: "Por favor responde *SI* o *NO*.",
    noAppointmentsFound:
      "No encontramos citas activas asociadas a tu número. Si crees que es un error, escribe *Hola* y elige hablar con un humano.",
    yourAppointmentsStatus:
      "📋 Estas son tus citas activas:\n\n{appointments}\n\nEscribe *Hola* para volver al menú principal.",
    appointmentStatusLine: "📅 {date} a las {time} — {status}",
    statusScheduled: "Agendada",
    statusConfirmed: "Confirmada",
    sharedAvailableSlots: "📅 Aquí tienes los horarios disponibles:\n\n{slots}\n\nEscribe *Hola* para agendar uno de estos horarios.",
    sharedNoSlotsAvailable: "Por el momento no encontramos horarios disponibles. Un miembro de nuestro equipo te contactará pronto.",
    sharedAppointmentDetails: "📋 Aquí están los detalles de tu cita:\n\n{appointments}",
    sharedNoAppointmentsFound: "No encontramos citas activas asociadas a tu número.",
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
    clinicOverview:
      "📍 *Ubicación*\n{address}\n\n🗓️ *Horario*\n{hours}\n\n🅿️ *Estacionamiento*\n{parking}",
    infoPrompt:
      "¿Algo más que quieras saber? Puedo darte información sobre costos, seguros o el doctor.",
    infoFallback:
      "Para esa pregunta lo mejor es que hables directo con nuestro equipo. Escribe *Hola* y elige hablar con un humano.",
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
    mainMenuHeader: "Welcome to *{clinicName}*.",
    mainMenuFooter: "Reply with the number of your choice.",
    mainMenuFooterWithButtons: "Tap a quick option above or reply with the number of your choice.",
    menuInvalid: "Sorry, I didn't get that. Choose a quick option or reply with its number.",
    gratitudeReply: "You're welcome! Let us know if you need anything else.",
    confirmSavedDetails:
      "Welcome back! We have these details on file:\n\n👤 {name}\n📱 {phone}{reasonLine}\n\nReply *YES* to use them, or type the correct full name if you need to update it.",
    confirmYesButton: "Yes",
    confirmNoButton: "No",
    sameReasonButton: "Same",
    moreDatesButton: "See more dates",
    confirmSavedDetailsInvalid:
      "Reply *YES* to use your saved details, or type the patient's full name to update it.",
    lastVisitReasonLine: "\n📝 Reason from your last visit: {reason}",
    askName: "Great, let's book your appointment. What's the patient's full name?",
    askPhone: "Thanks, {name}. What's the best contact phone number?",
    askReason: "What's the reason for the visit?",
    askReasonWithHint:
      "What's the reason for the visit? Your last visit was for: *{lastReason}*.\nReply *SAME* to use the same reason, or type a new one.",
    noSlotsAvailable:
      "Sorry, we couldn't find any open slots in the coming days. A team member will reach out shortly.",
    requestedDayUnavailable: "We don't have any open slots that day. Here are the next available times:",
    slotConflict: "Oops, someone else just booked that time. Here are the next available slots:",
    chooseSlot: "Here are the available time slots. Reply with the number of your choice:\n\n{slots}",
    chooseSlotPrompt: "Here are the available time slots. Tap one to select it, or reply with its number:",
    viewTimesButton: "View times",
    slotInvalid: "That's not a valid option. Please choose one of the listed numbers.",
    confirmBooking:
      "Please confirm your appointment:\n\n👤 Patient: {name}\n📅 Date: {date}\n🕐 Time: {time}\n📝 Reason: {reason}\n\nReply *YES* to confirm or *NO* to cancel.",
    bookingConfirmed:
      "✅ Your appointment is confirmed!\n\n📅 {date} at {time}\n👨‍⚕️ {doctorName}\n\nWe'll send you a reminder before your visit.",
    bookingCancelled: "No problem, the appointment wasn't booked. Type *Hi* if you need anything else.",
    confirmInvalid: "Please reply *YES* or *NO*.",
    noAppointmentsFound:
      "We couldn't find any active appointments under your number. If you think this is a mistake, type *Hi* and choose to talk to a human.",
    yourAppointmentsStatus: "📋 Here are your active appointments:\n\n{appointments}\n\nType *Hi* to go back to the main menu.",
    appointmentStatusLine: "📅 {date} at {time} — {status}",
    statusScheduled: "Scheduled",
    statusConfirmed: "Confirmed",
    sharedAvailableSlots: "📅 Here are the available time slots:\n\n{slots}\n\nType *Hi* to book one of these.",
    sharedNoSlotsAvailable: "We couldn't find any available slots right now. A member of our team will reach out soon.",
    sharedAppointmentDetails: "📋 Here are your appointment details:\n\n{appointments}",
    sharedNoAppointmentsFound: "We couldn't find any active appointments under your number.",
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
    clinicOverview:
      "📍 *Location*\n{address}\n\n🗓️ *Hours*\n{hours}\n\n🅿️ *Parking*\n{parking}",
    infoPrompt:
      "Anything else you'd like to know? I can tell you about fees, insurance, or the doctor.",
    infoFallback: "For that question it's best to speak with our team directly. Type *Hi* and choose to talk to a human.",
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
