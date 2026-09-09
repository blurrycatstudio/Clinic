import { Router } from "express"
import { z } from "zod"
import { env } from "../config/env.js"
import { runReminderJob, runReminderCallJob } from "../cron/reminders.js"
import { asyncHandler } from "../middleware/errorHandler.js"
import { UnauthorizedError } from "../lib/errors.js"

export const cronRouter = Router()

/**
 * Vercel Cron calls this with `Authorization: Bearer $CRON_SECRET` when
 * CRON_SECRET is set (Vercel adds this automatically for cron-triggered
 * requests to your own deployment). Reject anything else so this endpoint
 * can't be used by a third party to spam reminder sends.
 */
function requireCronSecret(req: import("express").Request) {
  if (!env.CRON_SECRET) return
  const header = req.header("authorization")
  if (header !== `Bearer ${env.CRON_SECRET}`) {
    throw new UnauthorizedError("Invalid cron secret")
  }
}

cronRouter.get(
  "/reminders",
  asyncHandler(async (req, res) => {
    requireCronSecret(req)
    const query = z.object({ window: z.enum(["24h", "2h"]) }).parse(req.query)
    const result = await runReminderJob(query.window)
    res.json(result)
  }),
)

cronRouter.get(
  "/call-reminders",
  asyncHandler(async (req, res) => {
    requireCronSecret(req)
    const result = await runReminderCallJob()
    res.json(result)
  }),
)
