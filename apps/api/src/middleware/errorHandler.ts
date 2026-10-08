import type { NextFunction, Request, Response } from "express"
import { ZodError } from "zod"
import { AppError } from "../lib/errors.js"
import { logger } from "../config/logger.js"

export function notFoundHandler(req: Request, res: Response) {
  res.status(404).json({ error: { code: "NOT_FOUND", message: `No route for ${req.method} ${req.path}` } })
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction) {
  if (err instanceof ZodError) {
    logger.warn({ issues: err.issues, path: req.path }, "Request validation failed")
    // Spell out WHICH field failed and why — voice tools relay this message straight to the
    // model, which can only recover ("ask the caller for their number") if it can read the cause.
    const reasons = err.issues.map((issue) => (issue.path.length > 0 ? `${issue.path.join(".")}: ${issue.message}` : issue.message))
    res.status(400).json({
      error: { code: "VALIDATION_ERROR", message: `Invalid request — ${[...new Set(reasons)].join("; ")}`, details: err.issues },
    })
    return
  }

  if (err instanceof AppError) {
    if (err.statusCode >= 500) {
      logger.error({ err, path: req.path }, err.message)
    } else {
      logger.warn({ code: err.code, path: req.path }, err.message)
    }
    res.status(err.statusCode).json({ error: { code: err.code, message: err.message, details: err.details } })
    return
  }

  logger.error({ err, path: req.path }, "Unhandled error")
  res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Something went wrong. Please try again." } })
}

/** Wrap an async route handler so thrown/rejected errors reach errorHandler. */
export function asyncHandler<T extends (req: Request, res: Response, next: NextFunction) => Promise<unknown>>(
  fn: T,
) {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res, next).catch(next)
  }
}
