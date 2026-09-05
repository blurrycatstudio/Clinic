import type { AuditAction } from "@clinic/shared"
import { supabase } from "../config/supabase.js"
import { logger } from "../config/logger.js"

export const auditLogRepository = {
  /**
   * Audit logging must never break the caller's actual work — a failed
   * insert here is logged and swallowed rather than thrown, since losing
   * an audit entry is bad but crashing a booking/cancellation over it
   * would be worse.
   */
  async record(input: {
    actorType: "patient" | "system" | "staff" | "ai"
    actorId?: string | null
    action: AuditAction
    entityType: string
    entityId?: string | null
    metadata?: Record<string, unknown>
  }): Promise<void> {
    const { error } = await supabase.from("audit_logs").insert({
      actor_type: input.actorType,
      actor_id: input.actorId ?? null,
      action: input.action,
      entity_type: input.entityType,
      entity_id: input.entityId ?? null,
      metadata: input.metadata ?? null,
    })
    if (error) {
      logger.error({ err: error, action: input.action }, "Failed to write audit log entry")
    }
  },

  async list(params: { entityType?: string; entityId?: string; limit?: number; offset?: number }) {
    let query = supabase.from("audit_logs").select("*", { count: "exact" }).order("created_at", { ascending: false })
    if (params.entityType) query = query.eq("entity_type", params.entityType)
    if (params.entityId) query = query.eq("entity_id", params.entityId)
    const limit = params.limit ?? 100
    const offset = params.offset ?? 0
    query = query.range(offset, offset + limit - 1)

    const { data, error, count } = await query
    if (error) throw error
    return { rows: data ?? [], count: count ?? 0 }
  },
}
