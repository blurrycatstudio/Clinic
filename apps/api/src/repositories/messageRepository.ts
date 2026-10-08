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

  /**
   * Applies a Meta delivery-status webhook. Statuses can arrive out of order, so a late
   * "sent" never downgrades "delivered"/"read"/"failed". A "failed" keeps Meta's error
   * (e.g. 131026 "not on WhatsApp") in the row's payload so voice tools and the dashboard
   * can tell WHY a message never arrived.
   */
  async updateStatusByWaId(
    waMessageId: string,
    status: WhatsappMessage["status"],
    deliveryError?: { code: number | null; title?: string; message?: string },
  ): Promise<void> {
    const patch: { status: WhatsappMessage["status"]; payload?: Record<string, unknown> } = { status }
    if (status === "failed" && deliveryError) {
      const { data: row } = await supabase.from("whatsapp_messages").select("payload").eq("wa_message_id", waMessageId).maybeSingle()
      patch.payload = { ...(row?.payload ?? {}), deliveryError }
    }

    let query = supabase.from("whatsapp_messages").update(patch).eq("wa_message_id", waMessageId)
    if (status === "sent") query = query.or("status.is.null,status.eq.sent")
    else if (status === "delivered") query = query.or("status.is.null,status.in.(sent,delivered)")

    const { error } = await query
    if (error) throw new AppError(`Failed to update message status: ${error.message}`)
  },

  /** Current delivery status of messages we just sent, by WhatsApp message id — used to confirm a voice-promised message actually landed. */
  async findDeliveryByWaIds(
    waMessageIds: string[],
  ): Promise<{ waMessageId: string; status: WhatsappMessage["status"]; errorCode: number | null }[]> {
    if (waMessageIds.length === 0) return []
    const { data, error } = await supabase
      .from("whatsapp_messages")
      .select("wa_message_id, status, payload")
      .in("wa_message_id", waMessageIds)
    if (error) throw new AppError(`Failed to read message delivery status: ${error.message}`)
    return (data ?? []).map((row) => {
      const deliveryError = (row.payload as { deliveryError?: { code?: number | null } } | null)?.deliveryError
      return { waMessageId: row.wa_message_id as string, status: row.status, errorCode: deliveryError?.code ?? null }
    })
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
