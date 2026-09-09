import type { CallTranscript, VoiceCall, VoiceCallStatus } from "@clinic/shared"
import { supabase } from "../config/supabase.js"
import { AppError } from "../lib/errors.js"

export const voiceCallRepository = {
  async findById(id: string): Promise<VoiceCall | null> {
    const { data, error } = await supabase.from("voice_calls").select("*").eq("id", id).maybeSingle()
    if (error) throw new AppError(`Failed to load voice call: ${error.message}`)
    return data
  },

  async findByVapiCallId(vapiCallId: string): Promise<VoiceCall | null> {
    const { data, error } = await supabase.from("voice_calls").select("*").eq("vapi_call_id", vapiCallId).maybeSingle()
    if (error) throw new AppError(`Failed to load voice call: ${error.message}`)
    return data
  },

  async create(input: {
    vapiCallId: string
    phoneE164: string
    direction: "inbound" | "outbound"
    patientId?: string | null
    appointmentId?: string | null
  }): Promise<VoiceCall> {
    const { data, error } = await supabase
      .from("voice_calls")
      .insert({
        vapi_call_id: input.vapiCallId,
        phone_e164: input.phoneE164,
        direction: input.direction,
        patient_id: input.patientId ?? null,
        appointment_id: input.appointmentId ?? null,
        status: "in_progress",
      })
      .select("*")
      .single()
    if (error) throw new AppError(`Failed to create voice call: ${error.message}`)
    return data
  },

  async complete(
    vapiCallId: string,
    input: { status: VoiceCallStatus; durationSeconds?: number; recordingUrl?: string; summary?: string },
  ): Promise<void> {
    const { error } = await supabase
      .from("voice_calls")
      .update({
        status: input.status,
        ended_at: new Date().toISOString(),
        duration_seconds: input.durationSeconds ?? null,
        recording_url: input.recordingUrl ?? null,
        summary: input.summary ?? null,
      })
      .eq("vapi_call_id", vapiCallId)
    if (error) throw new AppError(`Failed to finalize voice call: ${error.message}`)
  },

  async list(params: { limit?: number; offset?: number }) {
    const limit = params.limit ?? 50
    const offset = params.offset ?? 0
    const { data, error, count } = await supabase
      .from("voice_calls")
      .select("*", { count: "exact" })
      .order("started_at", { ascending: false })
      .range(offset, offset + limit - 1)
    if (error) throw new AppError(`Failed to list voice calls: ${error.message}`)
    return { rows: data ?? [], count: count ?? 0 }
  },
}

export const callTranscriptRepository = {
  async append(voiceCallId: string, role: CallTranscript["role"], content: string): Promise<void> {
    const { error } = await supabase.from("call_transcripts").insert({ voice_call_id: voiceCallId, role, content })
    if (error) throw new AppError(`Failed to append call transcript: ${error.message}`)
  },

  async listForCall(voiceCallId: string): Promise<CallTranscript[]> {
    const { data, error } = await supabase
      .from("call_transcripts")
      .select("*")
      .eq("voice_call_id", voiceCallId)
      .order("spoken_at", { ascending: true })
    if (error) throw new AppError(`Failed to load call transcript: ${error.message}`)
    return data ?? []
  },
}
