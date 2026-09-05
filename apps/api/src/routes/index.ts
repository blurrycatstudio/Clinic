import { Router } from "express"
import { healthRouter } from "./health.js"
import { webhookRouter } from "./webhook.js"
import { voiceWebhookRouter } from "./voiceWebhook.js"
import { appointmentsRouter } from "./appointments.js"
import { patientsRouter } from "./patients.js"
import { conversationsRouter } from "./conversations.js"
import { settingsRouter } from "./settings.js"
import { dashboardRouter } from "./dashboard.js"
import { voiceCallsRouter } from "./voiceCalls.js"
import { auditLogsRouter } from "./auditLogs.js"
import { cronRouter } from "./cron.js"

export const apiRouter = Router()

apiRouter.use("/health", healthRouter)
apiRouter.use("/webhook/whatsapp", webhookRouter)
apiRouter.use("/webhook/vapi", voiceWebhookRouter)
apiRouter.use("/appointments", appointmentsRouter)
apiRouter.use("/patients", patientsRouter)
apiRouter.use("/conversations", conversationsRouter)
apiRouter.use("/settings", settingsRouter)
apiRouter.use("/dashboard", dashboardRouter)
apiRouter.use("/voice-calls", voiceCallsRouter)
apiRouter.use("/audit-logs", auditLogsRouter)
apiRouter.use("/cron", cronRouter)
