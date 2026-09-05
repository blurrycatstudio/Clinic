import type { Strings } from "./i18n"

export type AppointmentType =
  | "typeWellchild"
  | "typeVaccination"
  | "typeGrowth"
  | "typeConsultation"
  | "typeFollowup"
  | "typeSickVisit"
export type AppointmentStatus =
  | "statusCheckedIn"
  | "statusConfirmed"
  | "statusPending"
  | "statusCompleted"
  | "statusCancelled"
  | "statusScheduled"

export type AppointmentRaw = {
  id: string
  time: string
  duration: string
  child: string
  patientId: string
  phone: string
  initials: string
  color: string
  type: AppointmentType
  status: AppointmentStatus
}

export const APPOINTMENTS: AppointmentRaw[] = [
  { id: "a6", time: "08:00 AM", duration: "30 min", child: "Santiago Flores", patientId: "santiago", phone: "+52 664 678 9012", initials: "SF", color: "#0891B2", type: "typeVaccination", status: "statusCompleted" },
  { id: "a7", time: "08:30 AM", duration: "30 min", child: "Isabella Mendoza", patientId: "isabella", phone: "+52 664 789 0123", initials: "IM", color: "#9333EA", type: "typeWellchild", status: "statusCompleted" },
  { id: "a1", time: "09:00 AM", duration: "30 min", child: "Emilia Torres", patientId: "emilia", phone: "+52 664 123 4567", initials: "ET", color: "#16A34A", type: "typeWellchild", status: "statusCheckedIn" },
  { id: "a2", time: "09:30 AM", duration: "20 min", child: "Mateo Ramírez", patientId: "mateo", phone: "+52 664 987 6543", initials: "MR", color: "#F97316", type: "typeVaccination", status: "statusConfirmed" },
  { id: "a3", time: "10:00 AM", duration: "30 min", child: "Sofía Delgado", patientId: "sofia", phone: "+52 664 234 5678", initials: "SD", color: "#0D9488", type: "typeGrowth", status: "statusConfirmed" },
  { id: "a4", time: "10:30 AM", duration: "45 min", child: "Diego Navarro", patientId: "diego", phone: "+52 664 345 6789", initials: "DN", color: "#DC2626", type: "typeConsultation", status: "statusPending" },
  { id: "a5", time: "11:00 AM", duration: "20 min", child: "Valentina Cruz", patientId: "valentina", phone: "+52 664 456 7890", initials: "VC", color: "#2563EB", type: "typeFollowup", status: "statusConfirmed" },
  { id: "a8", time: "11:30 AM", duration: "20 min", child: "Camila Herrera", patientId: "camila", phone: "+52 664 567 8901", initials: "CH", color: "#DB2777", type: "typeConsultation", status: "statusCancelled" },
]

export const STATUS_COLORS: Record<AppointmentStatus, { bg: string; color: string }> = {
  statusCheckedIn: { bg: "#DCFCE7", color: "#16A34A" },
  statusConfirmed: { bg: "#EFF6FF", color: "#2563EB" },
  statusPending: { bg: "#FFEDD5", color: "#C2410C" },
  statusCompleted: { bg: "#FFF7ED", color: "#C2410C" },
  statusCancelled: { bg: "#FFEDD5", color: "#C2410C" },
  statusScheduled: { bg: "#F1F5F9", color: "#64748B" },
}

// ---------- Today's Schedule (Dashboard) ----------
export type ScheduleItem = {
  time: string
  child: string
  initials: string
  color: string
  type: AppointmentType
  status: AppointmentStatus
}

export const TODAYS_SCHEDULE: ScheduleItem[] = [
  { time: "09:00 AM", child: "Emilia Torres", initials: "ET", color: "#F97316", type: "typeWellchild", status: "statusCheckedIn" },
  { time: "09:30 AM", child: "Mateo Ramírez", initials: "MR", color: "#2563EB", type: "typeVaccination", status: "statusConfirmed" },
  { time: "10:00 AM", child: "Sofía Delgado", initials: "SD", color: "#E11D48", type: "typeGrowth", status: "statusConfirmed" },
  { time: "10:30 AM", child: "Diego Navarro", initials: "DN", color: "#0D9488", type: "typeConsultation", status: "statusPending" },
  { time: "11:00 AM", child: "Valentina Cruz", initials: "VC", color: "#DC2626", type: "typeFollowup", status: "statusConfirmed" },
  { time: "11:30 AM", child: "Lucas Mendoza", initials: "LM", color: "#0891B2", type: "typeSickVisit", status: "statusScheduled" },
  { time: "12:00 PM", child: "Isabella Ríos", initials: "IR", color: "#DB2777", type: "typeVaccination", status: "statusScheduled" },
  { time: "12:30 PM", child: "Sebastián Mora", initials: "SM", color: "#9333EA", type: "typeConsultation", status: "statusScheduled" },
]

export type RecentVisit = { date: string; type: string; doctor: string }

export const RECENT_VISITS: Record<"en" | "es", RecentVisit[]> = {
  en: [
    { date: "12 Aug 2026", type: "Well-Child Visit", doctor: "Dr. Gamaliel" },
    { date: "05 May 2026", type: "Vaccination", doctor: "Dr. Santos" },
    { date: "10 Feb 2026", type: "Fever & Cold", doctor: "Dr. Gamaliel" },
    { date: "18 Nov 2025", type: "Growth Check", doctor: "Dr. Ruiz" },
  ],
  es: [
    { date: "12 ago 2026", type: "Consulta de Niño Sano", doctor: "Dr. Gamaliel" },
    { date: "05 may 2026", type: "Vacunación", doctor: "Dr. Santos" },
    { date: "10 feb 2026", type: "Fiebre y Resfriado", doctor: "Dr. Gamaliel" },
    { date: "18 nov 2025", type: "Control de Crecimiento", doctor: "Dr. Ruiz" },
  ],
}

export type InteractionTag = "outgoing" | "inbound" | "incoming" | "missed"
export type InteractionRaw = { name: string; en: string; es: string; time: string; tag: InteractionTag }

export const RECENT_WA: InteractionRaw[] = [
  { name: "Fernanda Torres", en: "Appointment confirmed for Emilia — Sep 5, 9:00 AM", es: "Cita confirmada para Emilia — 5 sep, 9:00 AM", time: "08:12 AM", tag: "outgoing" },
  { name: "Gabriela Delgado", en: "Asked about Sofía's growth check availability", es: "Preguntó por disponibilidad del control de Sofía", time: "07:55 AM", tag: "incoming" },
  { name: "Ricardo Ramírez", en: "Vaccination reminder sent for Mateo", es: "Recordatorio de vacuna enviado para Mateo", time: "07:30 AM", tag: "outgoing" },
  { name: "Carmen Cruz", en: "Confirmed follow-up appointment", es: "Confirmó la cita de seguimiento", time: "Yesterday", tag: "inbound" },
]

export const RECENT_CALLS: InteractionRaw[] = [
  { name: "Luis Navarro", en: "Inbound call — asked about consultation", es: "Llamada entrante — preguntó por la consulta", time: "09:40 AM", tag: "inbound" },
  { name: "+52 664 555 2211", en: "Missed call", es: "Llamada perdida", time: "08:50 AM", tag: "missed" },
  { name: "Fernanda Torres", en: "Outbound — confirmed appointment", es: "Saliente — confirmó la cita", time: "08:15 AM", tag: "outgoing" },
  { name: "Gabriela Delgado", en: "Inbound — rescheduled request", es: "Entrante — pidió cambiar la cita", time: "Yesterday", tag: "inbound" },
]

export const TAG_COLORS: Record<InteractionTag, { bg: string; color: string }> = {
  outgoing: { bg: "#DBEAFE", color: "#2563EB" },
  inbound: { bg: "#F1F5F9", color: "#64748B" },
  incoming: { bg: "#F1F5F9", color: "#64748B" },
  missed: { bg: "#FEE2E2", color: "#DC2626" },
}

export type HistoryRow = { date: string; type: string; details: string }
export type PatientTab = "history" | "vaccinations" | "allergies" | "notes"

export const HISTORY: Record<PatientTab, { en: HistoryRow[]; es: HistoryRow[] }> = {
  history: {
    en: [
      { date: "Aug 20, 2026", type: "Well-Child Visit", details: "Routine checkup. Growth on track, weight 17.2kg." },
      { date: "Jun 15, 2026", type: "Vaccination", details: "DTaP booster administered, no reaction." },
      { date: "Apr 2, 2026", type: "Consultation", details: "Mild fever and cough, prescribed rest and fluids." },
      { date: "Jan 10, 2026", type: "Growth Check", details: "Height 102cm, 62nd percentile — healthy range." },
    ],
    es: [
      { date: "20 ago 2026", type: "Consulta de Niño Sano", details: "Revisión de rutina. Crecimiento normal, peso 17.2kg." },
      { date: "15 jun 2026", type: "Vacunación", details: "Refuerzo DTaP aplicado, sin reacción." },
      { date: "2 abr 2026", type: "Consulta", details: "Fiebre leve y tos, se recetó reposo y líquidos." },
      { date: "10 ene 2026", type: "Control de Crecimiento", details: "Talla 102cm, percentil 62 — rango saludable." },
    ],
  },
  vaccinations: {
    en: [
      { date: "Jun 15, 2026", type: "DTaP Booster", details: "4th dose, left arm, no adverse reaction." },
      { date: "Feb 3, 2026", type: "Influenza", details: "Seasonal flu shot administered." },
      { date: "Nov 12, 2025", type: "MMR", details: "2nd dose completed on schedule." },
      { date: "Mar 14, 2025", type: "Hepatitis A", details: "1st dose, well tolerated." },
    ],
    es: [
      { date: "15 jun 2026", type: "Refuerzo DTaP", details: "4ta dosis, brazo izquierdo, sin reacción." },
      { date: "3 feb 2026", type: "Influenza", details: "Vacuna estacional aplicada." },
      { date: "12 nov 2025", type: "SRP (Triple Viral)", details: "2da dosis completada en tiempo." },
      { date: "14 mar 2025", type: "Hepatitis A", details: "1ra dosis, bien tolerada." },
    ],
  },
  allergies: {
    en: [
      { date: "Ongoing", type: "Peanuts", details: "Confirmed mild allergy — avoid direct exposure." },
      { date: "Ongoing", type: "Seasonal Pollen", details: "Mild rhinitis in spring months." },
      { date: "—", type: "No known drug allergies", details: "No reactions reported to date." },
    ],
    es: [
      { date: "Vigente", type: "Cacahuate", details: "Alergia leve confirmada — evitar exposición directa." },
      { date: "Vigente", type: "Polen Estacional", details: "Rinitis leve en primavera." },
      { date: "—", type: "Sin alergias a medicamentos", details: "Sin reacciones reportadas a la fecha." },
    ],
  },
  notes: {
    en: [
      { date: "Aug 20, 2026", type: "Weight", details: "17.2 kg — 58th percentile for age." },
      { date: "Aug 20, 2026", type: "Height", details: "104 cm — 62nd percentile for age." },
      { date: "Jan 10, 2026", type: "BMI", details: "Within healthy range for age and sex." },
    ],
    es: [
      { date: "20 ago 2026", type: "Peso", details: "17.2 kg — percentil 58 para su edad." },
      { date: "20 ago 2026", type: "Talla", details: "104 cm — percentil 62 para su edad." },
      { date: "10 ene 2026", type: "IMC", details: "Dentro del rango saludable para edad y sexo." },
    ],
  },
}

export type PatientDocument = { name: string; date: string; size: string; type: "pdf" | "image" }

export function getPatientDocuments(patientId: string): PatientDocument[] {
  return MEDICAL_RECORDS.filter((rec) => rec.patientId === patientId).map((rec) => ({
    name: `${rec.title}.${rec.type === "imaging" ? "jpg" : "pdf"}`,
    date: rec.date,
    size: rec.fileSize,
    type: rec.type === "imaging" ? "image" : "pdf",
  }))
}

export type TemplateKey = { titleKey: keyof Strings; metaKey: keyof Strings; body: string }

export const TEMPLATES: TemplateKey[] = [
  {
    titleKey: "tpl1Title",
    metaKey: "tpl1Meta",
    body: "Hola [Nombre], le recordamos la cita de [Niño] mañana a las [Hora] con el Dr. Gamaliel. Responda CONFIRMAR o CANCELAR.",
  },
  {
    titleKey: "tpl2Title",
    metaKey: "tpl2Meta",
    body: "Hola [Nombre], [Niño] tiene programada su vacuna de [Vacuna] el [Fecha]. Favor de confirmar asistencia.",
  },
  {
    titleKey: "tpl3Title",
    metaKey: "tpl3Meta",
    body: "¡Bienvenidos a Pediatra! Gracias por confiarnos el cuidado de [Niño]. Cualquier duda, escríbanos por este medio.",
  },
]

export type RxPatient = { id: string; name: string; age: string; initials: string; color: string }

export const RX_PATIENTS: RxPatient[] = [
  { id: "emilia", name: "Emilia Torres", age: "4 yrs", initials: "ET", color: "#16A34A" },
  { id: "mateo", name: "Mateo Ramírez", age: "2 yrs", initials: "MR", color: "#F97316" },
  { id: "sofia", name: "Sofía Delgado", age: "6 yrs", initials: "SD", color: "#0D9488" },
  { id: "diego", name: "Diego Navarro", age: "8 yrs", initials: "DN", color: "#DC2626" },
  { id: "valentina", name: "Valentina Cruz", age: "3 yrs", initials: "VC", color: "#2563EB" },
]

export const COMMON_MEDICATIONS = [
  "Amoxicillin 250mg/5mL Suspension",
  "Paracetamol (Acetaminophen) 160mg/5mL",
  "Ibuprofen 100mg/5mL Suspension",
  "Amoxicillin/Clavulanate 400mg/5mL",
  "Cetirizine 5mg/5mL Syrup",
  "Salbutamol Inhaler 100mcg",
  "Azithromycin 200mg/5mL Suspension",
  "Oral Rehydration Salts (ORS)",
  "Prednisolone 15mg/5mL Solution",
  "Mupirocin 2% Ointment",
]

export type Medication = {
  name: string
  dose: string
  frequency: string
  duration: string
  route: string
}

export type Prescription = {
  id: string
  patientId: string
  date: string
  diagnosis: string
  medications: Medication[]
  notes: string
  status: "rxStatusActive" | "rxStatusCompleted"
}

export const PRESCRIPTIONS: Prescription[] = [
  {
    id: "RX-1042",
    patientId: "emilia",
    date: "2026-08-20",
    diagnosis: "Acute otitis media",
    medications: [
      { name: "Amoxicillin 250mg/5mL Suspension", dose: "5 mL", frequency: "Every 8 hours", duration: "7 days", route: "Oral" },
      { name: "Paracetamol (Acetaminophen) 160mg/5mL", dose: "4 mL", frequency: "Every 6 hours as needed", duration: "3 days", route: "Oral" },
    ],
    notes: "Take with food. Complete the full antibiotic course even if symptoms improve.",
    status: "rxStatusActive",
  },
  {
    id: "RX-1038",
    patientId: "mateo",
    date: "2026-08-12",
    diagnosis: "Seasonal allergic rhinitis",
    medications: [{ name: "Cetirizine 5mg/5mL Syrup", dose: "2.5 mL", frequency: "Once daily", duration: "14 days", route: "Oral" }],
    notes: "May cause mild drowsiness. Avoid driving equipment (n/a for patient age).",
    status: "rxStatusActive",
  },
  {
    id: "RX-1021",
    patientId: "sofia",
    date: "2026-07-02",
    diagnosis: "Mild fever and cough",
    medications: [
      { name: "Paracetamol (Acetaminophen) 160mg/5mL", dose: "6 mL", frequency: "Every 6 hours as needed", duration: "3 days", route: "Oral" },
    ],
    notes: "Rest and fluids. Return if fever exceeds 39°C or persists beyond 3 days.",
    status: "rxStatusCompleted",
  },
  {
    id: "RX-1009",
    patientId: "diego",
    date: "2026-06-18",
    diagnosis: "Impetigo",
    medications: [{ name: "Mupirocin 2% Ointment", dose: "Thin layer", frequency: "3 times daily", duration: "5 days", route: "Topical" }],
    notes: "Wash hands before and after application. Keep affected area clean and dry.",
    status: "rxStatusCompleted",
  },
  {
    id: "RX-1005",
    patientId: "valentina",
    date: "2026-05-30",
    diagnosis: "Suspected amoxicillin allergy — follow-up",
    medications: [{ name: "Cetirizine 5mg/5mL Syrup", dose: "2 mL", frequency: "Once daily as needed", duration: "7 days", route: "Oral" }],
    notes: "Avoid amoxicillin and related penicillins. Monitor for rash or swelling.",
    status: "rxStatusCompleted",
  },
  {
    id: "RX-0998",
    patientId: "camila",
    date: "2026-04-14",
    diagnosis: "Annual physical — no acute concerns",
    medications: [{ name: "Oral Rehydration Salts (ORS)", dose: "As needed", frequency: "As needed", duration: "N/A", route: "Oral" }],
    notes: "No active prescription required. ORS sent home as a precaution for the season.",
    status: "rxStatusCompleted",
  },
  {
    id: "RX-1046",
    patientId: "santiago",
    date: "2026-08-28",
    diagnosis: "Post-vaccination mild fever",
    medications: [{ name: "Paracetamol (Acetaminophen) 160mg/5mL", dose: "2.5 mL", frequency: "Every 6 hours as needed", duration: "2 days", route: "Oral" }],
    notes: "Expected reaction to Hepatitis B dose. Return if fever exceeds 38.5°C.",
    status: "rxStatusActive",
  },
  {
    id: "RX-0972",
    patientId: "isabella",
    date: "2026-03-03",
    diagnosis: "Dust mite allergic rhinitis",
    medications: [{ name: "Cetirizine 5mg/5mL Syrup", dose: "5 mL", frequency: "Once daily", duration: "30 days", route: "Oral" }],
    notes: "Recommend dust-mite covers for bedding. Follow up if symptoms persist.",
    status: "rxStatusCompleted",
  },
]

// ---------- Patients ----------
export type Patient = {
  id: string
  patientCode: string
  name: string
  initials: string
  color: string
  age: string
  ageFull: { en: string; es: string }
  gender: { en: string; es: string }
  dob: string
  guardian: string
  guardianPhone: string
  email: string
  address: string
  bloodType: string
  lastVisit: string
  nextVisit: string | null
  status: "active" | "inactive"
  allergies: string[]
}

export const PATIENTS: Patient[] = [
  { id: "emilia", patientCode: "PT-2026-0015", name: "Emilia Torres", initials: "ET", color: "#16A34A", age: "4 yrs", ageFull: { en: "4 years 2 months", es: "4 años 2 meses" }, gender: { en: "Female", es: "Femenino" }, dob: "14 Mar 2022", guardian: "Fernanda Torres (mother)", guardianPhone: "+52 664 123 4567", email: "fernanda.torres@gmail.com", address: "Tijuana, B.C.", bloodType: "O+", lastVisit: "Aug 20, 2026", nextVisit: "Sep 5, 2026", status: "active", allergies: ["Peanuts"] },
  { id: "mateo", patientCode: "PT-2026-0022", name: "Mateo Ramírez", initials: "MR", color: "#F97316", age: "2 yrs", ageFull: { en: "2 years", es: "2 años" }, gender: { en: "Male", es: "Masculino" }, dob: "02 Jul 2024", guardian: "Ricardo Ramírez (father)", guardianPhone: "+52 664 987 6543", email: "ricardo.ramirez@hotmail.com", address: "Tijuana, B.C.", bloodType: "A+", lastVisit: "Aug 12, 2026", nextVisit: "Sep 5, 2026", status: "active", allergies: [] },
  { id: "sofia", patientCode: "PT-2026-0031", name: "Sofía Delgado", initials: "SD", color: "#0D9488", age: "6 yrs", ageFull: { en: "6 years", es: "6 años" }, gender: { en: "Female", es: "Femenino" }, dob: "28 Nov 2019", guardian: "Gabriela Delgado (mother)", guardianPhone: "+52 664 234 5678", email: "gaby.delgado@gmail.com", address: "Tijuana, B.C.", bloodType: "B+", lastVisit: "Jul 2, 2026", nextVisit: "Sep 5, 2026", status: "active", allergies: ["Seasonal Pollen"] },
  { id: "diego", patientCode: "PT-2026-0008", name: "Diego Navarro", initials: "DN", color: "#DC2626", age: "8 yrs", ageFull: { en: "8 years", es: "8 años" }, gender: { en: "Male", es: "Masculino" }, dob: "16 Feb 2018", guardian: "Luis Navarro (father)", guardianPhone: "+52 664 345 6789", email: "luis.navarro@outlook.com", address: "Tijuana, B.C.", bloodType: "AB+", lastVisit: "Jun 18, 2026", nextVisit: "Sep 5, 2026", status: "active", allergies: [] },
  { id: "valentina", patientCode: "PT-2026-0019", name: "Valentina Cruz", initials: "VC", color: "#2563EB", age: "3 yrs", ageFull: { en: "3 years", es: "3 años" }, gender: { en: "Female", es: "Femenino" }, dob: "09 Sep 2023", guardian: "Carmen Cruz (mother)", guardianPhone: "+52 664 456 7890", email: "carmen.cruz@gmail.com", address: "Tijuana, B.C.", bloodType: "O-", lastVisit: "May 30, 2026", nextVisit: "Sep 5, 2026", status: "active", allergies: ["Amoxicillin"] },
  { id: "camila", patientCode: "PT-2026-0044", name: "Camila Herrera", initials: "CH", color: "#DB2777", age: "5 yrs", ageFull: { en: "5 years", es: "5 años" }, gender: { en: "Female", es: "Femenino" }, dob: "21 Jan 2021", guardian: "Patricia Herrera (mother)", guardianPhone: "+52 664 567 8901", email: "paty.herrera@gmail.com", address: "Tijuana, B.C.", bloodType: "A-", lastVisit: "Apr 14, 2026", nextVisit: null, status: "inactive", allergies: [] },
  { id: "santiago", patientCode: "PT-2026-0051", name: "Santiago Flores", initials: "SF", color: "#0891B2", age: "1 yr", ageFull: { en: "1 year", es: "1 año" }, gender: { en: "Male", es: "Masculino" }, dob: "03 Jun 2025", guardian: "Andrea Flores (mother)", guardianPhone: "+52 664 678 9012", email: "andrea.flores@gmail.com", address: "Tijuana, B.C.", bloodType: "B-", lastVisit: "Aug 28, 2026", nextVisit: "Sep 12, 2026", status: "active", allergies: [] },
  { id: "isabella", patientCode: "PT-2026-0037", name: "Isabella Mendoza", initials: "IM", color: "#9333EA", age: "7 yrs", ageFull: { en: "7 years", es: "7 años" }, gender: { en: "Female", es: "Femenino" }, dob: "12 Oct 2018", guardian: "Roberto Mendoza (father)", guardianPhone: "+52 664 789 0123", email: "r.mendoza@gmail.com", address: "Tijuana, B.C.", bloodType: "O+", lastVisit: "Mar 3, 2026", nextVisit: null, status: "inactive", allergies: ["Dust mites"] },
]

// ---------- Voice Calls ----------
export type CallDirection = "incoming" | "outgoing" | "missed"
export type CallLog = {
  id: string
  name: string
  phone: string
  initials: string
  color: string
  direction: CallDirection
  duration: string
  date: string
  time: string
  note: string
}

export const CALL_LOGS: CallLog[] = [
  { id: "c1", name: "Luis Navarro", phone: "+52 664 345 6789", initials: "LN", color: "#DC2626", direction: "incoming", duration: "4:12", date: "Today", time: "09:40 AM", note: "Asked about consultation availability for Diego's cough." },
  { id: "c2", name: "Unknown Caller", phone: "+52 664 555 2211", initials: "?", color: "#6B7280", direction: "missed", duration: "—", date: "Today", time: "08:50 AM", note: "No voicemail left." },
  { id: "c3", name: "Fernanda Torres", phone: "+52 664 123 4567", initials: "FT", color: "#16A34A", direction: "outgoing", duration: "2:35", date: "Today", time: "08:15 AM", note: "Confirmed Emilia's appointment for tomorrow 9:00 AM." },
  { id: "c4", name: "Gabriela Delgado", phone: "+52 664 234 5678", initials: "GD", color: "#0D9488", direction: "incoming", duration: "6:48", date: "Yesterday", time: "04:22 PM", note: "Requested to reschedule Sofía's growth check." },
  { id: "c5", name: "Ricardo Ramírez", phone: "+52 664 987 6543", initials: "RR", color: "#F97316", direction: "outgoing", duration: "1:52", date: "Yesterday", time: "11:05 AM", note: "Reminder call for Mateo's DTaP booster." },
  { id: "c6", name: "Unknown Caller", phone: "+52 664 900 3344", initials: "?", color: "#6B7280", direction: "missed", duration: "—", date: "Yesterday", time: "09:12 AM", note: "Called back — no answer." },
  { id: "c7", name: "Carmen Cruz", phone: "+52 664 456 7890", initials: "CC", color: "#2563EB", direction: "incoming", duration: "3:20", date: "Sep 3, 2026", time: "02:40 PM", note: "Asked about Valentina's allergy test results." },
  { id: "c8", name: "Andrea Flores", phone: "+52 664 678 9012", initials: "AF", color: "#0891B2", direction: "outgoing", duration: "5:03", date: "Sep 2, 2026", time: "10:18 AM", note: "Discussed Santiago's feeding schedule concerns." },
]

// ---------- Medical Records ----------
export type RecordType = "lab" | "visit" | "imaging" | "vaccination"
export type MedicalRecord = {
  id: string
  patientId: string
  type: RecordType
  title: string
  date: string
  doctor: string
  summary: string
  fileSize: string
}

export const MEDICAL_RECORDS: MedicalRecord[] = [
  { id: "rec1", patientId: "emilia", type: "visit", title: "Well-Child Visit Summary", date: "Aug 20, 2026", doctor: "Dr. Gamaliel Rodríguez", summary: "Routine checkup, growth on track, weight 17.2kg, no concerns raised.", fileSize: "212 KB" },
  { id: "rec2", patientId: "emilia", type: "lab", title: "Complete Blood Count (CBC)", date: "Aug 20, 2026", doctor: "Dr. Gamaliel Rodríguez", summary: "All values within normal pediatric reference range.", fileSize: "98 KB" },
  { id: "rec3", patientId: "mateo", type: "vaccination", title: "DTaP Booster Certificate", date: "Jun 15, 2026", doctor: "Dr. Gamaliel Rodríguez", summary: "4th dose administered, left arm, no adverse reaction observed.", fileSize: "64 KB" },
  { id: "rec4", patientId: "sofia", type: "imaging", title: "Chest X-Ray", date: "Jul 2, 2026", doctor: "Dr. Gamaliel Rodríguez", summary: "Clear lung fields, no signs of infiltrate or consolidation.", fileSize: "3.4 MB" },
  { id: "rec5", patientId: "diego", type: "visit", title: "Consultation Notes — Impetigo", date: "Jun 18, 2026", doctor: "Dr. Gamaliel Rodríguez", summary: "Localized impetigo on forearm, treated with topical mupirocin.", fileSize: "156 KB" },
  { id: "rec6", patientId: "valentina", type: "lab", title: "Allergy Panel Results", date: "May 30, 2026", doctor: "Dr. Gamaliel Rodríguez", summary: "Confirmed amoxicillin sensitivity, no other reactive allergens found.", fileSize: "184 KB" },
  { id: "rec7", patientId: "santiago", type: "vaccination", title: "Hepatitis B — 2nd Dose", date: "Aug 28, 2026", doctor: "Dr. Gamaliel Rodríguez", summary: "Second dose on schedule, well tolerated, no side effects.", fileSize: "58 KB" },
  { id: "rec8", patientId: "camila", type: "visit", title: "Annual Physical Exam", date: "Apr 14, 2026", doctor: "Dr. Gamaliel Rodríguez", summary: "Healthy growth trajectory, vision and hearing screens passed.", fileSize: "220 KB" },
  { id: "rec9", patientId: "isabella", type: "lab", title: "Allergy Panel — Dust Mites", date: "Mar 3, 2026", doctor: "Dr. Gamaliel Rodríguez", summary: "Confirmed dust mite sensitivity, no other reactive allergens found.", fileSize: "142 KB" },
]

// ---------- Invoices & Payments ----------
export type InvoiceStatus = "paid" | "pending" | "overdue"
export type InvoiceItem = { desc: string; qty: number; price: number }
export type Invoice = {
  id: string
  patientId: string
  date: string
  dueDate: string
  amount: number
  status: InvoiceStatus
  method: string | null
  items: InvoiceItem[]
}

export const INVOICES: Invoice[] = [
  { id: "INV-3021", patientId: "emilia", date: "Aug 20, 2026", dueDate: "Sep 3, 2026", amount: 1450, status: "paid", method: "Credit Card", items: [{ desc: "Well-Child Consultation", qty: 1, price: 900 }, { desc: "CBC Lab Panel", qty: 1, price: 550 }] },
  { id: "INV-3018", patientId: "mateo", date: "Aug 12, 2026", dueDate: "Aug 26, 2026", amount: 850, status: "paid", method: "Cash", items: [{ desc: "DTaP Booster + Administration", qty: 1, price: 850 }] },
  { id: "INV-3015", patientId: "sofia", date: "Jul 2, 2026", dueDate: "Jul 16, 2026", amount: 2100, status: "pending", method: null, items: [{ desc: "Consultation — Fever & Cough", qty: 1, price: 700 }, { desc: "Chest X-Ray", qty: 1, price: 1400 }] },
  { id: "INV-3009", patientId: "diego", date: "Jun 18, 2026", dueDate: "Jul 2, 2026", amount: 620, status: "overdue", method: null, items: [{ desc: "Consultation — Impetigo", qty: 1, price: 450 }, { desc: "Mupirocin Ointment (dispensed)", qty: 1, price: 170 }] },
  { id: "INV-3002", patientId: "valentina", date: "May 30, 2026", dueDate: "Jun 13, 2026", amount: 1780, status: "overdue", method: null, items: [{ desc: "Allergy Panel Test", qty: 1, price: 1500 }, { desc: "Follow-Up Consultation", qty: 1, price: 280 }] },
  { id: "INV-2996", patientId: "santiago", date: "Aug 28, 2026", dueDate: "Sep 11, 2026", amount: 690, status: "pending", method: null, items: [{ desc: "Hepatitis B Vaccine — 2nd Dose", qty: 1, price: 690 }] },
  { id: "INV-2988", patientId: "camila", date: "Apr 14, 2026", dueDate: "Apr 28, 2026", amount: 950, status: "paid", method: "Bank Transfer", items: [{ desc: "Annual Physical Exam", qty: 1, price: 950 }] },
  { id: "INV-2975", patientId: "isabella", date: "Mar 3, 2026", dueDate: "Mar 17, 2026", amount: 1120, status: "paid", method: "Credit Card", items: [{ desc: "Consultation — Dust Allergy Follow-Up", qty: 1, price: 620 }, { desc: "Nasal Spray (dispensed)", qty: 1, price: 500 }] },
]

// ---------- Reports ----------
export const REVENUE_BY_MONTH = [
  { label: "Mar", value: 42000 },
  { label: "Apr", value: 48500 },
  { label: "May", value: 45200 },
  { label: "Jun", value: 53800 },
  { label: "Jul", value: 58100 },
  { label: "Aug", value: 61900 },
  { label: "Sep", value: 34200 },
]

export const PATIENT_GROWTH = [
  { label: "Mar", value: 142 },
  { label: "Apr", value: 151 },
  { label: "May", value: 158 },
  { label: "Jun", value: 167 },
  { label: "Jul", value: 179 },
  { label: "Aug", value: 188 },
  { label: "Sep", value: 193 },
]

export const APPT_TYPE_BREAKDOWN: { type: AppointmentType; count: number; color: string }[] = [
  { type: "typeWellchild", count: 38, color: "#16A34A" },
  { type: "typeVaccination", count: 26, color: "#F97316" },
  { type: "typeConsultation", count: 31, color: "#2563EB" },
  { type: "typeGrowth", count: 18, color: "#0D9488" },
  { type: "typeFollowup", count: 14, color: "#D97706" },
]

export type ChatMessage = { from: "me" | "them"; text: string; time: string }
export type Contact = {
  id: string
  name: string
  child: string
  initials: string
  bg: string
  time: string
  unread: boolean
  msgs: ChatMessage[]
}

export const CONTACTS: Contact[] = [
  {
    id: "fernanda",
    name: "Fernanda Torres",
    child: "Emilia Torres",
    initials: "FT",
    bg: "#16A34A",
    time: "09:16 AM",
    unread: false,
    msgs: [
      { from: "them", text: "Hola doctor, ¿confirmamos la cita de Emilia para mañana a las 9:00 AM?", time: "09:12 AM" },
      { from: "me", text: "¡Buenos días Fernanda! Sí, queda confirmada para mañana a las 9:00 AM.", time: "09:15 AM" },
      { from: "them", text: "Perfecto, muchas gracias.", time: "09:16 AM" },
    ],
  },
  {
    id: "ricardo",
    name: "Ricardo Ramírez",
    child: "Mateo Ramírez",
    initials: "RR",
    bg: "#F97316",
    time: "07:41 AM",
    unread: true,
    msgs: [
      { from: "me", text: "Hola Ricardo, le recordamos que Mateo tiene su vacuna DTaP programada para el jueves.", time: "07:30 AM" },
      { from: "them", text: "Gracias por avisar, ahí estaremos.", time: "07:41 AM" },
    ],
  },
  {
    id: "gabriela",
    name: "Gabriela Delgado",
    child: "Sofía Delgado",
    initials: "GD",
    bg: "#0D9488",
    time: "08:02 AM",
    unread: true,
    msgs: [
      { from: "them", text: "Buenos días, ¿tienen espacio esta semana para el control de crecimiento de Sofía?", time: "07:55 AM" },
      { from: "me", text: "Sí, tenemos disponibilidad el jueves a las 10:00 AM. ¿Le funciona?", time: "08:02 AM" },
    ],
  },
  {
    id: "luis",
    name: "Luis Navarro",
    child: "Diego Navarro",
    initials: "LN",
    bg: "#DC2626",
    time: "Ayer",
    unread: false,
    msgs: [
      { from: "them", text: "Hola, quisiera agendar una consulta para Diego, ha tenido tos.", time: "Ayer" },
      { from: "me", text: "Claro, tenemos espacio hoy a las 10:30 AM. ¿Lo confirmamos?", time: "Ayer" },
      { from: "them", text: "Sí, ahí estaremos. Gracias.", time: "Ayer" },
    ],
  },
  {
    id: "carmen",
    name: "Carmen Cruz",
    child: "Valentina Cruz",
    initials: "CC",
    bg: "#2563EB",
    time: "Ayer",
    unread: false,
    msgs: [
      { from: "me", text: "Hola Carmen, confirmamos la cita de seguimiento de Valentina para hoy a las 11:00 AM.", time: "Ayer" },
      { from: "them", text: "Confirmado, gracias doctor.", time: "Ayer" },
    ],
  },
]
