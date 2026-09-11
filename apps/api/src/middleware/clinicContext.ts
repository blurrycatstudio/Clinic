import type { NextFunction, Request, Response } from "express"
import { supabase } from "../config/supabase.js"
import { UnauthorizedError } from "../lib/errors.js"
import { asyncHandler } from "./errorHandler.js"

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      clinicId?: string
    }
  }
}

/**
 * Must run after requireStaffAuth. Looks up which clinic the authenticated
 * staff user belongs to and attaches it as req.clinicId — the value every
 * repository call is scoped by. There is no notion of a staff user without
 * a clinic, so a missing mapping is a hard 401 rather than falling back to
 * any default clinic.
 */
export const requireClinicContext = asyncHandler(async (req: Request, _res: Response, next: NextFunction) => {
  if (!req.staffUser) {
    throw new UnauthorizedError("requireClinicContext must run after requireStaffAuth")
  }

  const { data, error } = await supabase
    .from("staff_users")
    .select("clinic_id")
    .eq("auth_user_id", req.staffUser.id)
    .maybeSingle()

  if (error || !data) {
    throw new UnauthorizedError("This account is not linked to a clinic")
  }

  req.clinicId = data.clinic_id
  next()
})
