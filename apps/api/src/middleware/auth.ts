import type { NextFunction, Request, Response } from "express"
import { createClient } from "@supabase/supabase-js"
import { env } from "../config/env.js"
import { UnauthorizedError } from "../lib/errors.js"
import { asyncHandler } from "./errorHandler.js"

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      staffUser?: { id: string; email: string | null }
    }
  }
}

/**
 * Protects dashboard REST endpoints. The web app signs in with Supabase Auth
 * and sends the resulting access token as `Authorization: Bearer <token>`.
 * We verify it against Supabase (not just decode it) so a revoked session
 * can't keep calling the API.
 */
const authClient = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
})

export const requireStaffAuth = asyncHandler(async (req: Request, _res: Response, next: NextFunction) => {
  const header = req.header("authorization")
  const token = header?.startsWith("Bearer ") ? header.slice(7) : null

  if (!token) {
    throw new UnauthorizedError("Missing Authorization header")
  }

  const { data, error } = await authClient.auth.getUser(token)
  if (error || !data.user) {
    throw new UnauthorizedError("Invalid or expired session")
  }

  req.staffUser = { id: data.user.id, email: data.user.email ?? null }
  next()
})

/**
 * Protects /api/agent/* — the endpoints the n8n voice-call tool handler
 * calls mid-phone-call, when there is no staff dashboard session at all.
 * A plain shared secret (not a Supabase user JWT) since the caller is a
 * trusted automation, not a person. If AGENT_API_KEY isn't configured,
 * every request is refused rather than silently left open.
 */
export const requireAgentAuth = (req: Request, _res: Response, next: NextFunction) => {
  if (!env.AGENT_API_KEY) {
    throw new UnauthorizedError("Agent API is not configured")
  }
  const key = req.header("x-agent-key")
  if (key !== env.AGENT_API_KEY) {
    throw new UnauthorizedError("Invalid or missing x-agent-key")
  }
  next()
}
