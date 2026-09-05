import { Redis } from "@upstash/redis"
import { env } from "./env.js"

/**
 * Upstash Redis over REST — chosen specifically because Vercel serverless
 * functions are stateless/cold-start-prone and can't hold a persistent TCP
 * connection pool the way a long-running Redis client normally would.
 * Every call here is a single HTTPS request, safe from any function instance.
 */
export const redis = new Redis({
  url: env.UPSTASH_REDIS_REST_URL,
  token: env.UPSTASH_REDIS_REST_TOKEN,
})
