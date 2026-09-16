import PDFDocument from "pdfkit"
import type { ClinicSettings, Invoice, InvoiceItem, Prescription, PrescriptionItem } from "@clinic/shared"
import { existsSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

// Resolves apps/api/assets/fonts regardless of whether this module runs from
// src/ (tsx dev) or dist/src/ (compiled) — the two locations sit at different
// depths below the package root.
const moduleDir = dirname(fileURLToPath(import.meta.url))
const FONTS_DIR = [join(moduleDir, "..", "..", "assets", "fonts"), join(moduleDir, "..", "..", "..", "assets", "fonts")].find((p) =>
  existsSync(p),
)

/** Registers the Poppins weights on this specific PDFDocument instance (registration doesn't carry across documents). Returns the font-name lookup to use — falls back to Helvetica if the font files aren't found on disk. */
function registerPoppinsFonts(doc: PDFKit.PDFDocument) {
  if (FONTS_DIR) {
    doc.registerFont("Poppins-Regular", join(FONTS_DIR, "Poppins-Regular.woff"))
    doc.registerFont("Poppins-SemiBold", join(FONTS_DIR, "Poppins-SemiBold.woff"))
    doc.registerFont("Poppins-Bold", join(FONTS_DIR, "Poppins-Bold.woff"))
    doc.registerFont("Poppins-ExtraBold", join(FONTS_DIR, "Poppins-ExtraBold.woff"))
  }
  return {
    regular: FONTS_DIR ? "Poppins-Regular" : "Helvetica",
    medium: FONTS_DIR ? "Poppins-SemiBold" : "Helvetica-Bold",
    bold: FONTS_DIR ? "Poppins-Bold" : "Helvetica-Bold",
    extraBold: FONTS_DIR ? "Poppins-ExtraBold" : "Helvetica-Bold",
  }
}

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

// Clinic-branded prescription template: green palette + panelled layout matching the printed RX card.
const RX_GREEN_DARK = "#0F5C3D"
const RX_GREEN_MED = "#2F8F5F"
const RX_GREEN_TEXT = "#3E7B5C"
const RX_GREEN_BAND_BG = "#EAF3EC"
const RX_GREEN_TABLE_HEAD = "#DCEAE1"
const RX_GREEN_ROW_ALT = "#F4FAF6"
const RX_BORDER = "#D7E6DC"
const RX_GRAY = "#5B6660"

const RX_MARGIN = 40
const RX_PAGE_W = 595.28
const RX_CONTENT_W = RX_PAGE_W - RX_MARGIN * 2

function rxSectionBand(doc: PDFKit.PDFDocument, y: number, label: string, fontName: string): number {
  const h = 26
  doc.roundedRect(RX_MARGIN, y, RX_CONTENT_W, h, 4).fill(RX_GREEN_BAND_BG)
  doc
    .fillColor(RX_GREEN_DARK)
    .font(fontName)
    .fontSize(10.5)
    .text(label, RX_MARGIN + 14, y + 8, { characterSpacing: 0.4 })
  return y + h + 18
}

/** Nested-hearts mark echoing the clinic's printed letterhead icon. */
function rxLogoMark(doc: PDFKit.PDFDocument, cx: number, cy: number, size: number) {
  const heart = (scale: number, dy: number) => {
    const s = size * scale
    doc
      .moveTo(cx, cy + dy + s * 0.35)
      .bezierCurveTo(cx - s * 1.1, cy + dy - s * 0.55, cx - s * 0.55, cy + dy - s * 1.35, cx, cy + dy - s * 0.6)
      .bezierCurveTo(cx + s * 0.55, cy + dy - s * 1.35, cx + s * 1.1, cy + dy - s * 0.55, cx, cy + dy + s * 0.35)
      .closePath()
  }
  doc.save()
  heart(1, 0)
  doc.fillColor(RX_GREEN_DARK).fill()
  heart(0.5, size * 0.18)
  doc.fillColor("#FFFFFF").fill()
  doc.circle(cx + size * 0.72, cy - size * 0.7, size * 0.14).fillColor(RX_GREEN_MED).fill()
  doc.restore()
}

/** A loose handwritten-style flourish standing in for a physical signature. */
function rxSignatureFlourish(doc: PDFKit.PDFDocument, x: number, y: number) {
  doc.save()
  doc
    .moveTo(x, y + 4)
    .bezierCurveTo(x + 14, y - 14, x + 22, y + 12, x + 34, y - 6)
    .bezierCurveTo(x + 42, y - 18, x + 50, y - 2, x + 60, y - 10)
    .bezierCurveTo(x + 68, y - 16, x + 78, y + 6, x + 92, y - 4)
    .lineWidth(1.4)
    .strokeColor("#2B2B2B")
    .stroke()
  doc.restore()
}

function rxAge(dateOfBirth: string | null): string | null {
  if (!dateOfBirth) return null
  const dob = new Date(dateOfBirth)
  if (Number.isNaN(dob.getTime())) return null
  const now = new Date()
  let years = now.getFullYear() - dob.getFullYear()
  const monthDiff = now.getMonth() - dob.getMonth()
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < dob.getDate())) years -= 1
  return `${years} ${years === 1 ? "Year" : "Years"}`
}

export const pdfService = {
  async renderPrescription(input: {
    settings: ClinicSettings
    prescription: Prescription
    items: PrescriptionItem[]
    patientName: string
    patientDateOfBirth?: string | null
  }): Promise<Buffer> {
    return renderToBuffer((doc) => {
      const { settings, prescription, items } = input
      const font = registerPoppinsFonts(doc)
      const rxNumber = `RX-${1000 + prescription.sequence_number}`
      const visitDate = new Date(prescription.created_at)
      const visitDateStr = visitDate.toLocaleDateString(undefined, { day: "2-digit", month: "long", year: "numeric" })

      const isPediatric = /pediat/i.test(settings.doctor_specialty || "")

      // ---- Header: clinic identity (left) + contact block (right) -------------
      let y = RX_MARGIN
      const logoSize = 15
      rxLogoMark(doc, RX_MARGIN + logoSize * 1.1, y + logoSize * 1.3, logoSize)
      const nameX = RX_MARGIN + logoSize * 2.6
      doc.fillColor(RX_GREEN_DARK).font(font.extraBold).fontSize(20).text(settings.clinic_name, nameX, y, { width: 300 })
      if (settings.doctor_specialty) {
        doc.fillColor(RX_GREEN_MED).font(font.bold).fontSize(12).text(settings.doctor_specialty, nameX, doc.y + 2, { width: 300 })
      }
      if (isPediatric) {
        doc.fillColor(RX_GRAY).font(font.medium).fontSize(8).text("HEALTHY CHILDREN  •  BRIGHTER TOMORROWS", nameX, doc.y + 4, { characterSpacing: 0.6 })
      }

      const contactLines = [settings.address, settings.phone_e164].filter(Boolean)
      doc.fillColor(RX_GRAY).font(font.regular).fontSize(9)
      let cy = y
      for (const line of contactLines) {
        doc.circle(RX_PAGE_W - RX_MARGIN - 224, cy + 4, 1.6).fill(RX_GREEN_MED)
        doc.fillColor(RX_GRAY).text(line, RX_PAGE_W - RX_MARGIN - 216, cy, { width: 216, align: "right" })
        cy = doc.y
      }

      y = Math.max(doc.y, cy) + 20
      doc.moveTo(RX_MARGIN, y).lineTo(RX_PAGE_W - RX_MARGIN, y).strokeColor(RX_BORDER).lineWidth(1).stroke()
      y += 22

      // ---- Title + prescription meta ------------------------------------------
      doc.fillColor("#111").font(font.extraBold).fontSize(20).text("MEDICAL PRESCRIPTION", RX_MARGIN, y)
      doc.fillColor(RX_GRAY).font(font.medium).fontSize(9).text("PRESCRIPCIÓN MÉDICA", RX_MARGIN, doc.y + 2, { characterSpacing: 1 })

      const metaW = 190
      const metaX = RX_PAGE_W - RX_MARGIN - metaW
      doc.roundedRect(metaX, y - 4, metaW, 26, 4).fillAndStroke(RX_GREEN_BAND_BG, RX_BORDER)
      doc.fillColor(RX_GRAY).font(font.regular).fontSize(9).text("Prescription No.", metaX + 10, y + 3)
      doc.fillColor(RX_GREEN_DARK).font(font.bold).fontSize(11).text(rxNumber, metaX + 10, y + 3, { width: metaW - 20, align: "right" })
      doc.fillColor(RX_GRAY).font(font.regular).fontSize(9).text(`Date: ${visitDateStr}`, metaX, y + 30, { width: metaW, align: "right" })

      y = Math.max(doc.y, y + 30) + 28

      // ---- Patient information panel -------------------------------------------
      y = rxSectionBand(doc, y, "PATIENT INFORMATION", font.bold)
      const age = rxAge(input.patientDateOfBirth ?? null)
      const rows: Array<[string, string]> = [["Name:", input.patientName]]
      if (input.patientDateOfBirth) rows.push(["Date of Birth:", new Date(input.patientDateOfBirth).toLocaleDateString()])
      if (age) rows.push(["Age:", age])
      rows.push(["Visit Date:", visitDateStr])
      rows.push(["Diagnosis:", prescription.diagnosis || "—"])

      for (const [label, value] of rows) {
        const rowY = doc.y
        doc.fillColor("#222").font(font.bold).fontSize(10).text(label, RX_MARGIN + 4, rowY, { continued: true, width: 400 })
        doc.font(font.regular).fillColor("#333").text(`  ${value}`)
        doc.moveDown(0.35)
      }
      y = doc.y + 26

      // ---- Medications table ------------------------------------------------
      y = rxSectionBand(doc, y, "PRESCRIBED MEDICATION(S)", font.bold)
      const cols = [
        { key: "name", label: "Medication", x: RX_MARGIN, w: 190 },
        { key: "dose", label: "Dosage", x: RX_MARGIN + 190, w: 70 },
        { key: "route", label: "Route", x: RX_MARGIN + 260, w: 65 },
        { key: "frequency", label: "Frequency", x: RX_MARGIN + 325, w: 120 },
        { key: "duration", label: "Duration", x: RX_MARGIN + 445, w: RX_CONTENT_W - 445 },
      ] as const

      const tableTop = y
      const headH = 24
      doc.rect(RX_MARGIN, y, RX_CONTENT_W, headH).fill(RX_GREEN_TABLE_HEAD)
      doc.fillColor(RX_GREEN_DARK).font(font.bold).fontSize(9.5)
      for (const col of cols) doc.text(col.label, col.x + 8, y + 8, { width: col.w - 12 })
      y += headH

      doc.font(font.regular).fontSize(9.5)
      items.forEach((item, idx) => {
        const values: Record<(typeof cols)[number]["key"], string> = {
          name: item.name,
          dose: item.dose || "—",
          route: item.route || "—",
          frequency: item.frequency || "—",
          duration: item.duration || "—",
        }
        doc.font(font.bold).fontSize(10)
        const nameH = doc.heightOfString(item.name, { width: cols[0].w - 16 })
        doc.font(font.regular).fontSize(9.5)
        const rowH = Math.max(32, nameH + 20)
        if (idx % 2 === 1) doc.rect(RX_MARGIN, y, RX_CONTENT_W, rowH).fill(RX_GREEN_ROW_ALT)
        doc.fillColor("#222")
        for (const col of cols) {
          const isName = col.key === "name"
          doc.font(isName ? font.bold : font.regular).fontSize(isName ? 10 : 9.5)
          doc.text(values[col.key], col.x + 8, y + 9, { width: col.w - 16 })
        }
        doc.moveTo(RX_MARGIN, y + rowH).lineTo(RX_PAGE_W - RX_MARGIN, y + rowH).strokeColor(RX_BORDER).lineWidth(0.75).stroke()
        y += rowH
      })
      doc.rect(RX_MARGIN, tableTop, RX_CONTENT_W, y - tableTop).strokeColor(RX_BORDER).lineWidth(0.75).stroke()
      y += 28

      // ---- Additional instructions (from notes) --------------------------------
      if (prescription.notes) {
        y = rxSectionBand(doc, y, "ADDITIONAL INSTRUCTIONS", font.bold)
        doc.fillColor("#333").font(font.regular).fontSize(10)
        const bullets = prescription.notes.split(/\r?\n/).filter((line) => line.trim().length > 0)
        for (const bullet of bullets) {
          doc.text(`•  ${bullet.trim()}`, RX_MARGIN + 4, doc.y, { width: RX_CONTENT_W - 8 })
          doc.moveDown(0.25)
        }
        y = doc.y + 26
      }

      // ---- Footer: signature + license ----------------------------------------
      const footerY = Math.min(Math.max(y, 640), 700)
      rxSignatureFlourish(doc, RX_MARGIN + 10, footerY - 14)
      doc.moveTo(RX_MARGIN, footerY).lineTo(RX_MARGIN + 200, footerY).strokeColor("#222").stroke()
      doc.fillColor(RX_GREEN_DARK).font(font.bold).fontSize(11).text(settings.doctor_name, RX_MARGIN, footerY + 6)
      doc.fillColor(RX_GRAY).font(font.regular).fontSize(9).text(settings.doctor_specialty, RX_MARGIN, doc.y + 1)
      if (settings.doctor_license) doc.text(`Medical License No. ${settings.doctor_license}`, RX_MARGIN, doc.y + 1)
      const licenseColumnBottomY = doc.y

      const thankYouX = RX_MARGIN + 260
      const thankYouW = RX_CONTENT_W - 260
      doc
        .fillColor("#333")
        .font(font.regular)
        .fontSize(9)
        .text(
          isPediatric ? "Thank you for trusting us with your child's health." : "Thank you for trusting us with your care.",
          thankYouX,
          footerY + 6,
          { width: thankYouW },
        )

      const disclaimerY = Math.min(Math.max(licenseColumnBottomY, doc.y) + 20, 780)
      doc.moveTo(RX_MARGIN, disclaimerY - 8).lineTo(RX_PAGE_W - RX_MARGIN, disclaimerY - 8).strokeColor(RX_BORDER).stroke()
      doc
        .fillColor(RX_GRAY)
        .font(font.regular)
        .fontSize(8)
        .text("This prescription is valid only when signed by the attending physician.", RX_MARGIN, disclaimerY, { width: RX_CONTENT_W })
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
