import { createApp } from "./app.js"
import { env } from "./config/env.js"
import { logger } from "./config/logger.js"

/** Local development entry point only — Vercel deploys use api/index.ts instead. */
const app = createApp()

app.listen(env.PORT, () => {
  logger.info(`API listening on http://localhost:${env.PORT}`)
})
