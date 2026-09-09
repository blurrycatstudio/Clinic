import { z } from "zod"

/**
 * All required runtime configuration, validated once at boot.
 * WhatsApp + template env vars are intentionally optional right now
 * (templates are pending Meta review) — see packages/shared/templates/registry.ts.
 */
const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().default(4000),

  // --- Supabase ---
  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  SUPABASE_JWT_SECRET: z.string().min(1).optional(),

  // --- Redis (Upstash REST — serverless-friendly) ---
  UPSTASH_REDIS_REST_URL: z.string().url(),
  UPSTASH_REDIS_REST_TOKEN: z.string().min(1),

  // --- OpenAI ---
  OPENAI_API_KEY: z.string().min(1),
  OPENAI_MODEL: z.string().default("gpt-4o-mini"),

  // --- WhatsApp Cloud API (filled in once the business account is live) ---
  WHATSAPP_ACCESS_TOKEN: z.string().optional().default(""),
  WHATSAPP_PHONE_NUMBER_ID: z.string().optional().default(""),
  WHATSAPP_BUSINESS_ACCOUNT_ID: z.string().optional().default(""),
  WHATSAPP_VERIFY_TOKEN: z.string().optional().default(""),
  WHATSAPP_APP_SECRET: z.string().optional().default(""),
  WHATSAPP_API_VERSION: z.string().default("v20.0"),

  // --- Template names (populated once Meta approves them) ---
  WHATSAPP_TEMPLATE_APPOINTMENT_CONFIRMATION: z.string().optional().default(""),
  WHATSAPP_TEMPLATE_APPOINTMENT_REMINDER_24H: z.string().optional().default(""),
  WHATSAPP_TEMPLATE_APPOINTMENT_REMINDER_2H: z.string().optional().default(""),
  WHATSAPP_TEMPLATE_APPOINTMENT_RESCHEDULED: z.string().optional().default(""),
  WHATSAPP_TEMPLATE_APPOINTMENT_CANCELLED: z.string().optional().default(""),
  WHATSAPP_TEMPLATE_CLINIC_LOCATION: z.string().optional().default(""),

  // --- Voice (Vapi + ElevenLabs) ---
  VAPI_API_KEY: z.string().optional().default(""),
  VAPI_WEBHOOK_SECRET: z.string().optional().default(""),
  VAPI_ASSISTANT_ID: z.string().optional().default(""),
  // Vapi's phone number resource ID that outbound calls are placed from
  // (Vapi dashboard -> Phone Numbers). Required for any outbound call.
  VAPI_PHONE_NUMBER_ID: z.string().optional().default(""),
  // A second assistant scripted specifically for outbound confirmation/reminder
  // calls (distinct script from the inbound assistant). Used by both the manual
  // "call to confirm" action and the automated reminder-call cron job.
  VAPI_REMINDER_ASSISTANT_ID: z.string().optional().default(""),
  ELEVENLABS_API_KEY: z.string().optional().default(""),
  ELEVENLABS_VOICE_ID: z.string().optional().default(""),

  // --- Google Maps ---
  GOOGLE_MAPS_API_KEY: z.string().optional().default(""),

  // --- Cloudflare R2 ---
  R2_ACCOUNT_ID: z.string().optional().default(""),
  R2_ACCESS_KEY_ID: z.string().optional().default(""),
  R2_SECRET_ACCESS_KEY: z.string().optional().default(""),
  R2_BUCKET_NAME: z.string().optional().default(""),
  R2_PUBLIC_URL: z.string().optional().default(""),

  // --- Misc ---
  CRON_SECRET: z.string().optional().default(""),
  DASHBOARD_ORIGIN: z.string().default("http://localhost:5173"),

  // --- Voice/automation agent (n8n) machine auth ---
  // Shared secret for non-staff callers (n8n's Vapi tool-call handler) that
  // need to book/reschedule/cancel appointments without a Supabase staff
  // session. If empty, /api/agent/* refuses every request.
  AGENT_API_KEY: z.string().optional().default(""),
})

export type Env = z.infer<typeof envSchema>

function loadEnv(): Env {
  const parsed = envSchema.safeParse(process.env)
  if (!parsed.success) {
    console.error("Invalid environment configuration:", parsed.error.flatten().fieldErrors)
    throw new Error("Invalid environment configuration. Check .env against .env.example.")
  }
  return parsed.data
}

export const env = loadEnv()

export const isWhatsappConfigured =
  env.WHATSAPP_ACCESS_TOKEN.length > 0 && env.WHATSAPP_PHONE_NUMBER_ID.length > 0

export const isVapiOutboundConfigured =
  env.VAPI_API_KEY.length > 0 && env.VAPI_PHONE_NUMBER_ID.length > 0
