import pino from "pino"
import { env } from "./env.js"

export const logger = pino({
  level: env.NODE_ENV === "production" ? "info" : "debug",
  redact: {
    paths: [
      "req.headers.authorization",
      "*.WHATSAPP_ACCESS_TOKEN",
      "*.OPENAI_API_KEY",
      "*.accessToken",
      "*.token",
    ],
    remove: true,
  },
  transport:
    env.NODE_ENV === "development"
      ? { target: "pino-pretty", options: { colorize: true, translateTime: "HH:MM:ss" } }
      : undefined,
})
