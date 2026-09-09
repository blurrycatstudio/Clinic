import type { Request, Response } from "express"
import { z } from "zod"
import { prescriptionRepository } from "../repositories/prescriptionRepository.js"
import { patientRepository } from "../repositories/patientRepository.js"
import { clinicSettingsRepository } from "../repositories/clinicSettingsRepository.js"
import { pdfService } from "../services/pdfService.js"
import { storageService } from "../services/storageService.js"
import { whatsappService } from "../services/whatsappService.js"
import { NotFoundError } from "../lib/errors.js"

async function buildPdf(prescriptionId: string) {
  const prescription = await prescriptionRepository.findById(prescriptionId)
  if (!prescription) throw new NotFoundError("Prescription not found")
  const patient = await patientRepository.findById(prescription.patient_id)
  if (!patient) throw new NotFoundError("Patient not found")
  const settings = await clinicSettingsRepository.get()

  const buffer = await pdfService.renderPrescription({
    settings,
    prescription,
    items: prescription.prescription_items,
    patientName: patient.full_name,
  })
  return { prescription, patient, buffer }
}

export const prescriptionsController = {
  async list(req: Request, res: Response) {
    const query = z
      .object({
        status: z.enum(["active", "completed"]).optional(),
        limit: z.coerce.number().min(1).max(200).optional(),
        offset: z.coerce.number().min(0).optional(),
      })
      .parse(req.query)
    const result = await prescriptionRepository.list(query)
    res.json(result)
  },

  async get(req: Request, res: Response) {
    const params = z.object({ id: z.string().uuid() }).parse(req.params)
    const prescription = await prescriptionRepository.findById(params.id)
    if (!prescription) throw new NotFoundError("Prescription not found")
    res.json({ prescription })
  },

  async create(req: Request, res: Response) {
    const body = z
      .object({
        patientId: z.string().uuid(),
        appointmentId: z.string().uuid().optional(),
        diagnosis: z.string().default(""),
        notes: z.string().default(""),
        items: z
          .array(
            z.object({
              name: z.string().min(1),
              dose: z.string().default(""),
              frequency: z.string().default(""),
              duration: z.string().default(""),
              route: z.string().default(""),
            }),
          )
          .min(1),
      })
      .parse(req.body)

    const prescription = await prescriptionRepository.create(body)
    res.status(201).json({ prescription })
  },

  /** Downloadable regardless of whether WhatsApp delivery (R2) is configured. */
  async downloadPdf(req: Request, res: Response) {
    const params = z.object({ id: z.string().uuid() }).parse(req.params)
    const { prescription, buffer } = await buildPdf(params.id)
    res.setHeader("Content-Type", "application/pdf")
    res.setHeader("Content-Disposition", `attachment; filename="RX-${1000 + prescription.sequence_number}.pdf"`)
    res.send(buffer)
  },

  /** Staff-triggered: generates the PDF, uploads it, and sends it to the patient's WhatsApp. */
  async send(req: Request, res: Response) {
    const params = z.object({ id: z.string().uuid() }).parse(req.params)
    const { prescription, patient, buffer } = await buildPdf(params.id)

    const pdfUrl = await storageService.uploadPdf(`prescriptions/${prescription.id}.pdf`, buffer)
    const { messageId } = await whatsappService.sendDocumentMessage(patient.phone_e164, {
      link: pdfUrl,
      filename: `RX-${1000 + prescription.sequence_number}.pdf`,
      caption: `Your prescription from ${patient.full_name}'s visit.`,
    })
    await prescriptionRepository.markSent(prescription.id, pdfUrl)

    res.json({ sent: true, pdfUrl, messageId })
  },
}
