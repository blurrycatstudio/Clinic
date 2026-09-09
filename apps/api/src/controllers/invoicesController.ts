import type { Request, Response } from "express"
import { z } from "zod"
import { invoiceRepository } from "../repositories/invoiceRepository.js"
import { patientRepository } from "../repositories/patientRepository.js"
import { clinicSettingsRepository } from "../repositories/clinicSettingsRepository.js"
import { pdfService } from "../services/pdfService.js"
import { storageService } from "../services/storageService.js"
import { whatsappService } from "../services/whatsappService.js"
import { NotFoundError } from "../lib/errors.js"

async function buildPdf(invoiceId: string) {
  const invoice = await invoiceRepository.findById(invoiceId)
  if (!invoice) throw new NotFoundError("Invoice not found")
  const patient = await patientRepository.findById(invoice.patient_id)
  if (!patient) throw new NotFoundError("Patient not found")
  const settings = await clinicSettingsRepository.get()

  const buffer = await pdfService.renderInvoice({
    settings,
    invoice,
    items: invoice.invoice_items,
    patientName: patient.full_name,
  })
  return { invoice, patient, buffer }
}

export const invoicesController = {
  async list(req: Request, res: Response) {
    const query = z
      .object({
        status: z.enum(["paid", "pending", "overdue"]).optional(),
        limit: z.coerce.number().min(1).max(200).optional(),
        offset: z.coerce.number().min(0).optional(),
      })
      .parse(req.query)
    const result = await invoiceRepository.list(query)
    res.json(result)
  },

  async get(req: Request, res: Response) {
    const params = z.object({ id: z.string().uuid() }).parse(req.params)
    const invoice = await invoiceRepository.findById(params.id)
    if (!invoice) throw new NotFoundError("Invoice not found")
    res.json({ invoice })
  },

  async create(req: Request, res: Response) {
    const body = z
      .object({
        patientId: z.string().uuid(),
        appointmentId: z.string().uuid().optional(),
        dueDate: z.string().optional(),
        items: z
          .array(
            z.object({
              description: z.string().min(1),
              quantity: z.number().int().min(1).default(1),
              unitPrice: z.number().min(0),
            }),
          )
          .min(1),
      })
      .parse(req.body)

    const invoice = await invoiceRepository.create(body)
    res.status(201).json({ invoice })
  },

  async markPaid(req: Request, res: Response) {
    const params = z.object({ id: z.string().uuid() }).parse(req.params)
    const body = z.object({ paymentMethod: z.string().min(1) }).parse(req.body)
    const invoice = await invoiceRepository.markPaid(params.id, body.paymentMethod)
    res.json({ invoice })
  },

  /** Downloadable regardless of whether WhatsApp delivery (R2) is configured. */
  async downloadPdf(req: Request, res: Response) {
    const params = z.object({ id: z.string().uuid() }).parse(req.params)
    const { invoice, buffer } = await buildPdf(params.id)
    res.setHeader("Content-Type", "application/pdf")
    res.setHeader("Content-Disposition", `attachment; filename="INV-${3000 + invoice.sequence_number}.pdf"`)
    res.send(buffer)
  },

  /** Staff-triggered: generates the PDF, uploads it, and sends it to the patient's WhatsApp. */
  async send(req: Request, res: Response) {
    const params = z.object({ id: z.string().uuid() }).parse(req.params)
    const { invoice, patient, buffer } = await buildPdf(params.id)

    const pdfUrl = await storageService.uploadPdf(`invoices/${invoice.id}.pdf`, buffer)
    const { messageId } = await whatsappService.sendDocumentMessage(patient.phone_e164, {
      link: pdfUrl,
      filename: `INV-${3000 + invoice.sequence_number}.pdf`,
      caption: `Your invoice from ${patient.full_name}'s visit — total $${invoice.amount_total.toFixed(2)} MXN.`,
    })
    await invoiceRepository.markSent(invoice.id, pdfUrl)

    res.json({ sent: true, pdfUrl, messageId })
  },
}
