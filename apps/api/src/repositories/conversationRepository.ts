import type { ConversationStatus, Language, WhatsappConversation } from "@clinic/shared"
import { supabase } from "../config/supabase.js"
import { AppError } from "../lib/errors.js"

export const conversationRepository = {
  async findById(id: string): Promise<WhatsappConversation | null> {
    const { data, error } = await supabase.from("whatsapp_conversations").select("*").eq("id", id).maybeSingle()
    if (error) throw new AppError(`Failed to load conversation: ${error.message}`)
    return data
  },

  async findByPhone(phoneE164: string): Promise<WhatsappConversation | null> {
    const { data, error } = await supabase
      .from("whatsapp_conversations")
      .select("*")
      .eq("wa_phone_e164", phoneE164)
      .maybeSingle()
    if (error) throw new AppError(`Failed to load conversation: ${error.message}`)
    return data
  },

  async getOrCreate(phoneE164: string, profileName?: string): Promise<WhatsappConversation> {
    const existing = await this.findByPhone(phoneE164)
    if (existing) return existing

    const { data, error } = await supabase
      .from("whatsapp_conversations")
      .insert({ wa_phone_e164: phoneE164, wa_profile_name: profileName ?? null, status: "active" })
      .select("*")
      .single()
    if (error) throw new AppError(`Failed to create conversation: ${error.message}`)
    return data
  },

  async touch(id: string): Promise<void> {
    const { error } = await supabase
      .from("whatsapp_conversations")
      .update({ last_message_at: new Date().toISOString() })
      .eq("id", id)
    if (error) throw new AppError(`Failed to touch conversation: ${error.message}`)
  },

  async setLanguage(id: string, language: Language): Promise<void> {
    const { error } = await supabase.from("whatsapp_conversations").update({ language }).eq("id", id)
    if (error) throw new AppError(`Failed to set conversation language: ${error.message}`)
  },

  async linkPatient(id: string, patientId: string): Promise<void> {
    const { error } = await supabase.from("whatsapp_conversations").update({ patient_id: patientId }).eq("id", id)
    if (error) throw new AppError(`Failed to link patient to conversation: ${error.message}`)
  },

  async setStatus(id: string, status: ConversationStatus): Promise<void> {
    const { error } = await supabase.from("whatsapp_conversations").update({ status }).eq("id", id)
    if (error) throw new AppError(`Failed to update conversation status: ${error.message}`)
  },

  async list(params: { status?: ConversationStatus; limit?: number; offset?: number }) {
    let query = supabase
      .from("whatsapp_conversations")
      .select("*, patients(full_name)", { count: "exact" })
      .order("last_message_at", { ascending: false })
    if (params.status) query = query.eq("status", params.status)
    const limit = params.limit ?? 50
    const offset = params.offset ?? 0
    query = query.range(offset, offset + limit - 1)

    const { data, error, count } = await query
    if (error) throw new AppError(`Failed to list conversations: ${error.message}`)
    return { rows: data ?? [], count: count ?? 0 }
  },
}
