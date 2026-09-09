import type { Invoice, InvoiceItem, InvoiceStatus } from "@clinic/shared"
import { supabase } from "../config/supabase.js"
import { AppError, NotFoundError } from "../lib/errors.js"

type InvoiceWithItems = Invoice & { invoice_items: InvoiceItem[] }

export const invoiceRepository = {
  async list(params: { status?: InvoiceStatus; limit?: number; offset?: number }) {
    let query = supabase
      .from("invoices")
      .select("*, invoice_items(*), patients(full_name)", { count: "exact" })
      .order("created_at", { ascending: false })
    if (params.status) query = query.eq("status", params.status)
    const limit = params.limit ?? 50
    const offset = params.offset ?? 0
    query = query.range(offset, offset + limit - 1)

    const { data, error, count } = await query
    if (error) throw new AppError(`Failed to list invoices: ${error.message}`)
    return { rows: data ?? [], count: count ?? 0 }
  },

  async findById(id: string): Promise<InvoiceWithItems | null> {
    const { data, error } = await supabase
      .from("invoices")
      .select("*, invoice_items(*)")
      .eq("id", id)
      .order("sort_order", { referencedTable: "invoice_items", ascending: true })
      .maybeSingle()
    if (error) throw new AppError(`Failed to load invoice: ${error.message}`)
    return data
  },

  async create(input: {
    patientId: string
    appointmentId?: string | null
    dueDate?: string | null
    items: { description: string; quantity: number; unitPrice: number }[]
  }): Promise<InvoiceWithItems> {
    const amountTotal = input.items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0)

    const { data: invoice, error } = await supabase
      .from("invoices")
      .insert({
        patient_id: input.patientId,
        appointment_id: input.appointmentId ?? null,
        due_date: input.dueDate ?? null,
        amount_total: amountTotal,
      })
      .select("*")
      .single()
    if (error) throw new AppError(`Failed to create invoice: ${error.message}`)

    if (input.items.length > 0) {
      const { error: itemsError } = await supabase.from("invoice_items").insert(
        input.items.map((item, i) => ({
          invoice_id: invoice.id,
          description: item.description,
          quantity: item.quantity,
          unit_price: item.unitPrice,
          sort_order: i,
        })),
      )
      if (itemsError) throw new AppError(`Failed to add invoice items: ${itemsError.message}`)
    }

    const created = await this.findById(invoice.id)
    if (!created) throw new NotFoundError("Invoice not found after creation")
    return created
  },

  async markPaid(id: string, paymentMethod: string): Promise<Invoice> {
    const { data, error } = await supabase
      .from("invoices")
      .update({ status: "paid", payment_method: paymentMethod })
      .eq("id", id)
      .select("*")
      .single()
    if (error) throw new AppError(`Failed to mark invoice paid: ${error.message}`)
    if (!data) throw new NotFoundError("Invoice not found")
    return data
  },

  async markSent(id: string, pdfUrl: string): Promise<void> {
    const { error } = await supabase
      .from("invoices")
      .update({ pdf_url: pdfUrl, sent_at: new Date().toISOString() })
      .eq("id", id)
    if (error) throw new AppError(`Failed to mark invoice sent: ${error.message}`)
  },
}
