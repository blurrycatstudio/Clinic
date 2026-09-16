import type { PatientDocument } from "@clinic/shared"
import { supabase } from "../config/supabase.js"
import { AppError } from "../lib/errors.js"

export const patientDocumentRepository = {
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
