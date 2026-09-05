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
