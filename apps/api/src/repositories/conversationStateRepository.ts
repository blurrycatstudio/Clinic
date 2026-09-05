import { supabase } from "../config/supabase.js"
import { AppError } from "../lib/errors.js"
import type { ConversationContext } from "@clinic/shared"

/**
 * Durable mirror of the Redis state, written on every transition (fire and
 * forget from the caller's perspective — see redisStateService.ts). Not on
 * the hot path for routing; purely audit + crash recovery.
 */
export const conversationStateRepository = {
  async upsert(conversationId: string, context: ConversationContext, expiresAtIso: string): Promise<void> {
    const { error } = await supabase.from("conversation_states").upsert(
      {
        conversation_id: conversationId,
        state: context.state,
        context: context as unknown as Record<string, unknown>,
        expires_at: expiresAtIso,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "conversation_id" },
    )
    if (error) throw new AppError(`Failed to persist conversation state snapshot: ${error.message}`)
  },

  async getLatest(conversationId: string): Promise<ConversationContext | null> {
    const { data, error } = await supabase
      .from("conversation_states")
      .select("context, expires_at")
      .eq("conversation_id", conversationId)
      .maybeSingle()
    if (error) throw new AppError(`Failed to load conversation state snapshot: ${error.message}`)
    if (!data) return null
    if (new Date(data.expires_at).getTime() < Date.now()) return null
    return data.context as unknown as ConversationContext
  },
}
