import PDFDocument from "pdfkit"
import type { ClinicSettings, Invoice, InvoiceItem, Prescription, PrescriptionItem } from "@clinic/shared"

function renderToBuffer(draw: (doc: PDFKit.PDFDocument) => void): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 50 })
    const chunks: Buffer[] = []
    doc.on("data", (chunk: Buffer) => chunks.push(chunk))
    doc.on("end", () => resolve(Buffer.concat(chunks)))
    doc.on("error", reject)
    draw(doc)
    doc.end()
  })
}

function header(doc: PDFKit.PDFDocument, settings: ClinicSettings, title: string) {
  doc.fontSize(18).font("Helvetica-Bold").text(settings.clinic_name)
  doc.fontSize(10).font("Helvetica").fillColor("#555").text(settings.address)
  doc.text(`${settings.doctor_name} — ${settings.doctor_specialty}${settings.doctor_license ? ` — Lic. ${settings.doctor_license}` : ""}`)
  doc.moveDown(1.2)
  doc.fillColor("#000").fontSize(15).font("Helvetica-Bold").text(title)
  doc.moveDown(0.8)
  doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor("#ddd").stroke()
  doc.moveDown(0.8)
}

export const pdfService = {
  async renderPrescription(input: {
    settings: ClinicSettings
    prescription: Prescription
    items: PrescriptionItem[]
    patientName: string
  }): Promise<Buffer> {
    return renderToBuffer((doc) => {
      header(doc, input.settings, `Prescription RX-${1000 + input.prescription.sequence_number}`)

      doc.fontSize(11).font("Helvetica-Bold").text("Patient: ", { continued: true }).font("Helvetica").text(input.patientName)
      doc.font("Helvetica-Bold").text("Date: ", { continued: true }).font("Helvetica").text(new Date(input.prescription.created_at).toLocaleDateString())
      doc.font("Helvetica-Bold").text("Diagnosis: ", { continued: true }).font("Helvetica").text(input.prescription.diagnosis || "—")
      doc.moveDown(1)

      doc.font("Helvetica-Bold").fontSize(12).text("Medications")
      doc.moveDown(0.4)
      for (const item of input.items) {
        doc.fontSize(11).font("Helvetica-Bold").text(`• ${item.name}`)
        const details = [item.dose, item.frequency, item.duration, item.route].filter(Boolean).join("  ·  ")
        if (details) doc.fontSize(10).font("Helvetica").fillColor("#444").text(`   ${details}`).fillColor("#000")
        doc.moveDown(0.4)
      }

      if (input.prescription.notes) {
        doc.moveDown(0.6)
        doc.font("Helvetica-Bold").fontSize(11).text("Notes")
        doc.font("Helvetica").fontSize(10).text(input.prescription.notes)
      }

      doc.moveDown(2)
      doc.moveTo(350, doc.y).lineTo(545, doc.y).strokeColor("#000").stroke()
      doc.fontSize(9).text(input.settings.doctor_name, 350, doc.y + 2, { width: 195, align: "center" })
    })
  },

  async renderInvoice(input: {
    settings: ClinicSettings
    invoice: Invoice
    items: InvoiceItem[]
    patientName: string
  }): Promise<Buffer> {
    return renderToBuffer((doc) => {
      header(doc, input.settings, `Invoice INV-${3000 + input.invoice.sequence_number}`)

      doc.fontSize(11).font("Helvetica-Bold").text("Bill to: ", { continued: true }).font("Helvetica").text(input.patientName)
      doc.font("Helvetica-Bold").text("Issue date: ", { continued: true }).font("Helvetica").text(input.invoice.issue_date)
      if (input.invoice.due_date) {
        doc.font("Helvetica-Bold").text("Due date: ", { continued: true }).font("Helvetica").text(input.invoice.due_date)
      }
      doc.moveDown(1)

      const colX = { desc: 50, qty: 350, price: 410, total: 480 }
      doc.font("Helvetica-Bold").fontSize(10)
      doc.text("Item", colX.desc, doc.y, { width: 290 })
      doc.text("Qty", colX.qty, doc.y - doc.currentLineHeight(), { width: 50, align: "right" })
      doc.text("Price", colX.price, doc.y - doc.currentLineHeight(), { width: 60, align: "right" })
      doc.text("Total", colX.total, doc.y - doc.currentLineHeight(), { width: 65, align: "right" })
      doc.moveDown(0.3)
      doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor("#ddd").stroke()
      doc.moveDown(0.3)

      doc.font("Helvetica").fontSize(10)
      for (const item of input.items) {
        const lineTotal = item.quantity * item.unit_price
        const y = doc.y
        doc.text(item.description, colX.desc, y, { width: 290 })
        doc.text(String(item.quantity), colX.qty, y, { width: 50, align: "right" })
        doc.text(`$${item.unit_price.toFixed(2)}`, colX.price, y, { width: 60, align: "right" })
        doc.text(`$${lineTotal.toFixed(2)}`, colX.total, y, { width: 65, align: "right" })
        doc.moveDown(0.5)
      }

      doc.moveTo(350, doc.y).lineTo(545, doc.y).strokeColor("#ddd").stroke()
      doc.moveDown(0.4)
      doc.font("Helvetica-Bold").fontSize(12).text(`Total: $${input.invoice.amount_total.toFixed(2)} MXN`, colX.total - 130, doc.y, { width: 195, align: "right" })

      doc.moveDown(1)
      doc.font("Helvetica").fontSize(10).fillColor("#555")
      doc.text(`Status: ${input.invoice.status}${input.invoice.payment_method ? `  ·  Paid via ${input.invoice.payment_method}` : ""}`)
    })
  },
}
