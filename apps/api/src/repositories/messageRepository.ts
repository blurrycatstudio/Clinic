import type { MessageDirection, MessageType, WhatsappMessage } from "@clinic/shared"
import { supabase } from "../config/supabase.js"
import { AppError } from "../lib/errors.js"

export const messageRepository = {
  async log(input: {
    conversationId: string
    direction: MessageDirection
    messageType: MessageType
    body?: string | null
    templateName?: string | null
    waMessageId?: string | null
    payload?: Record<string, unknown> | null
    status?: WhatsappMessage["status"]
    appointmentId?: string | null
  }): Promise<WhatsappMessage> {
    const { data, error } = await supabase
      .from("whatsapp_messages")
      .insert({
        conversation_id: input.conversationId,
        direction: input.direction,
        message_type: input.messageType,
        body: input.body ?? null,
        template_name: input.templateName ?? null,
        wa_message_id: input.waMessageId ?? null,
        payload: input.payload ?? null,
        status: input.status ?? (input.direction === "inbound" ? "received" : "sent"),
        appointment_id: input.appointmentId ?? null,
      })
      .select("*")
      .single()
    if (error) throw new AppError(`Failed to log message: ${error.message}`)
    return data
  },

  /** Bulk status/count lookup for the dashboard Schedule row — one query for all appointments on the visible day instead of N. */
  async listForAppointmentIds(appointmentIds: string[]): Promise<WhatsappMessage[]> {
    if (appointmentIds.length === 0) return []
    const { data, error } = await supabase
      .from("whatsapp_messages")
      .select("*")
      .in("appointment_id", appointmentIds)
      .eq("direction", "outbound")
      .order("created_at", { ascending: true })
    if (error) throw new AppError(`Failed to list messages for appointments: ${error.message}`)
    return data ?? []
  },

  async updateStatusByWaId(waMessageId: string, status: WhatsappMessage["status"]): Promise<void> {
    const { error } = await supabase.from("whatsapp_messages").update({ status }).eq("wa_message_id", waMessageId)
    if (error) throw new AppError(`Failed to update message status: ${error.message}`)
  },

  async listForConversation(conversationId: string, limit = 100): Promise<WhatsappMessage[]> {
    const { data, error } = await supabase
      .from("whatsapp_messages")
      .select("*")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: true })
      .limit(limit)
    if (error) throw new AppError(`Failed to list messages: ${error.message}`)
    return data ?? []
  },
}
