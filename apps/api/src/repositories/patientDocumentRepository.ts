import type { PatientDocument } from "@clinic/shared"
import { supabase } from "../config/supabase.js"
import { AppError } from "../lib/errors.js"

export const patientDocumentRepository = {
  /** Cross-patient feed for the Records screen — every uploaded document, newest first, with
   * the owning patient's name/phone embedded so the list and search don't need a second round trip. */
  async list(params: { limit?: number; offset?: number }) {
    const limit = params.limit ?? 100
    const offset = params.offset ?? 0
    const { data, error, count } = await supabase
      .from("patient_documents")
      .select("*, patients(full_name, phone_e164)", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1)
    if (error) throw new AppError(`Failed to list documents: ${error.message}`)
    return { rows: data ?? [], count: count ?? 0 }
  },

  async listForPatient(patientId: string): Promise<PatientDocument[]> {
    const { data, error } = await supabase
      .from("patient_documents")
      .select("*")
      .eq("patient_id", patientId)
      .order("created_at", { ascending: false })
    if (error) throw new AppError(`Failed to list documents: ${error.message}`)
    return data ?? []
  },

  async create(input: {
    patientId: string
    name: string
    mimeType: string
    sizeBytes: number
    url: string
  }): Promise<PatientDocument> {
    const { data, error } = await supabase
      .from("patient_documents")
      .insert({
        patient_id: input.patientId,
        name: input.name,
        mime_type: input.mimeType,
        size_bytes: input.sizeBytes,
        url: input.url,
      })
      .select("*")
      .single()
    if (error) throw new AppError(`Failed to save document: ${error.message}`)
    return data
  },

  async delete(id: string, patientId: string): Promise<void> {
    const { error } = await supabase.from("patient_documents").delete().eq("id", id).eq("patient_id", patientId)
    if (error) throw new AppError(`Failed to delete document: ${error.message}`)
  },

  /** Documents uploaded since `sinceIso` that haven't been WhatsApp-delivered yet — the 12-hour delivery cron's work queue. */
  async listPendingDelivery(sinceIso: string): Promise<PatientDocument[]> {
    const { data, error } = await supabase
      .from("patient_documents")
      .select("*")
      .is("whatsapp_sent_at", null)
      .gte("created_at", sinceIso)
      .order("created_at", { ascending: true })
    if (error) throw new AppError(`Failed to list pending documents: ${error.message}`)
    return data ?? []
  },

  async markDelivered(id: string): Promise<void> {
    const { error } = await supabase.from("patient_documents").update({ whatsapp_sent_at: new Date().toISOString() }).eq("id", id)
    if (error) throw new AppError(`Failed to mark document delivered: ${error.message}`)
  },
}
