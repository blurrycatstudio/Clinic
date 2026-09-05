import express, { type Request } from "express"
import cors from "cors"
import { pinoHttp } from "pino-http"
import { env } from "./config/env.js"
import { logger } from "./config/logger.js"
import { apiRouter } from "./routes/index.js"
import { errorHandler, notFoundHandler } from "./middleware/errorHandler.js"

export function createApp() {
  const app = express()

  app.use(
    pinoHttp({
      logger,
      autoLogging: { ignore: (req: Request) => req.url === "/health" },
    }),
  )

  app.use(
    cors({
      origin: env.DASHBOARD_ORIGIN,
      credentials: true,
    }),
  )

  // Capture the raw body bytes for webhook signature verification (WhatsApp + Vapi)
  // while still handing every route a parsed JSON body.
  app.use(
    express.json({
      limit: "2mb",
      verify: (req: Request & { rawBody?: Buffer }, _res, buf) => {
        req.rawBody = Buffer.from(buf)
      },
    }),
  )

  app.use("/api", apiRouter)

  app.use(notFoundHandler)
  app.use(errorHandler)

  return app
}
