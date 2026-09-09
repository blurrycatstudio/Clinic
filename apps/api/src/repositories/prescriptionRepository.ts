import type { Prescription, PrescriptionItem, PrescriptionStatus } from "@clinic/shared"
import { supabase } from "../config/supabase.js"
import { AppError, NotFoundError } from "../lib/errors.js"

type PrescriptionWithItems = Prescription & { prescription_items: PrescriptionItem[] }

export const prescriptionRepository = {
  async list(params: { status?: PrescriptionStatus; limit?: number; offset?: number }) {
    let query = supabase
      .from("prescriptions")
      .select("*, prescription_items(*), patients(full_name)", { count: "exact" })
      .order("created_at", { ascending: false })
    if (params.status) query = query.eq("status", params.status)
    const limit = params.limit ?? 50
    const offset = params.offset ?? 0
    query = query.range(offset, offset + limit - 1)

    const { data, error, count } = await query
    if (error) throw new AppError(`Failed to list prescriptions: ${error.message}`)
    return { rows: data ?? [], count: count ?? 0 }
  },

  async findById(id: string): Promise<PrescriptionWithItems | null> {
    const { data, error } = await supabase
      .from("prescriptions")
      .select("*, prescription_items(*)")
      .eq("id", id)
      .order("sort_order", { referencedTable: "prescription_items", ascending: true })
      .maybeSingle()
    if (error) throw new AppError(`Failed to load prescription: ${error.message}`)
    return data
  },

  async create(input: {
    patientId: string
    appointmentId?: string | null
    diagnosis: string
    notes: string
    items: { name: string; dose: string; frequency: string; duration: string; route: string }[]
  }): Promise<PrescriptionWithItems> {
    const { data: prescription, error } = await supabase
      .from("prescriptions")
      .insert({
        patient_id: input.patientId,
        appointment_id: input.appointmentId ?? null,
        diagnosis: input.diagnosis,
        notes: input.notes,
      })
      .select("*")
      .single()
    if (error) throw new AppError(`Failed to create prescription: ${error.message}`)

    if (input.items.length > 0) {
      const { error: itemsError } = await supabase.from("prescription_items").insert(
        input.items.map((item, i) => ({
          prescription_id: prescription.id,
          name: item.name,
          dose: item.dose,
          frequency: item.frequency,
          duration: item.duration,
          route: item.route,
          sort_order: i,
        })),
      )
      if (itemsError) throw new AppError(`Failed to add prescription items: ${itemsError.message}`)
    }

    const created = await this.findById(prescription.id)
    if (!created) throw new NotFoundError("Prescription not found after creation")
    return created
  },

  async markSent(id: string, pdfUrl: string): Promise<void> {
    const { error } = await supabase
      .from("prescriptions")
      .update({ pdf_url: pdfUrl, sent_at: new Date().toISOString() })
      .eq("id", id)
    if (error) throw new AppError(`Failed to mark prescription sent: ${error.message}`)
  },
}
