# Security Strategy

## Webhook authenticity

- **WhatsApp → API**: every inbound POST to `/api/webhook/whatsapp` is
  verified against Meta's `X-Hub-Signature-256` header (HMAC-SHA256 over the
  raw request body, keyed with `WHATSAPP_APP_SECRET`). See
  `apps/api/src/middleware/verifyWhatsappSignature.ts`. Requests without a
  valid signature are rejected with 401 before any business logic runs.
- **Webhook verification handshake**: the `GET` verification request is
  matched against `WHATSAPP_VERIFY_TOKEN`, a shared secret you set both in
  Meta's App Dashboard and in the environment.
- **Vapi → API**: `/api/webhook/vapi` verifies `x-vapi-signature` the same
  way, keyed with `VAPI_WEBHOOK_SECRET`.
- **Cron → API**: `/api/cron/reminders` requires
  `Authorization: Bearer $CRON_SECRET`, which Vercel Cron injects
  automatically for its own scheduled invocations. Anyone else calling that
  path without the secret gets a 401.

## Dashboard authentication & authorization

- Staff sign in via **Supabase Auth** (email/password). The web app never
  talks to Postgres directly — every dashboard action goes through the
  Express API, which re-verifies the bearer token against Supabase
  (`middleware/auth.ts`) rather than trusting a client-decoded JWT.
- The API's Supabase client uses the **service_role key**, which bypasses
  Row Level Security entirely. That means **the Express layer is the actual
  authorization boundary** — every dashboard route is wrapped in
  `requireStaffAuth`, and RLS policies on the tables (see migration
  `0001_init.sql`) are a defense-in-depth backstop against the anon/authenticated
  keys ever being used directly (e.g. if a key leaked to a client bundle).
- The service_role key must **never** be sent to the browser or committed to
  the repo. Only `apps/api`'s server-side environment holds it.

## Secrets handling

- All secrets live in environment variables (`.env.example` documents every
  one), injected via Vercel's encrypted environment variable store in
  production. Nothing sensitive is hardcoded.
- `logger.ts` redacts `Authorization` headers and known token/key field
  names from structured logs.
- Template names and WhatsApp/OpenAI/Vapi/ElevenLabs credentials are read
  once at boot via a zod-validated schema (`config/env.ts`) — a missing
  *required* var fails fast at startup rather than surfacing as a confusing
  runtime error later. WhatsApp/voice/template vars are intentionally
  optional so the system can be built, tested, and deployed before Meta
  approves the WhatsApp Business Account's templates.

## Data protection

- Patient PII (name, phone, notes) lives only in `patients` and is never
  logged in plaintext application logs beyond what's needed for debugging
  (and even then, structured logs redact obvious secret-shaped fields).
- RLS is enabled on every table; the default policies here grant read
  access to any authenticated Supabase user and write access only through
  the service-role-backed API. Tighten `is_staff()` in the migration if you
  introduce more than one staff role (e.g. front-desk vs. doctor).
- `audit_logs` is append-only from the application's perspective — no
  repository method updates or deletes a row in that table.

## Abuse prevention

- The DB's partial unique index on `appointments (doctor_id, starts_at)`
  (for active statuses) makes double-booking impossible even under a race
  between two concurrent WhatsApp conversations or a WhatsApp booking
  racing a dashboard booking.
- Conversation state expires after 24 hours (`CONVERSATION_STATE_TTL_SECONDS`),
  so an abandoned conversation can't be resumed indefinitely or used to hold
  a slot in limbo.
- OpenAI calls are wrapped in try/catch with safe fallbacks everywhere
  (`openaiService.ts`) — a prompt-injection attempt via a patient's message
  can, at worst, get a slightly off FAQ answer; it cannot reach
  `appointmentService.ts`, cancel another patient's appointment, or execute
  any state transition, because OpenAI's output is never used as anything
  but classification text or a rendered answer string.

## Transport security

- All external calls (WhatsApp Graph API, OpenAI, Supabase, Upstash) are
  HTTPS. Vercel terminates TLS for all inbound traffic to the API and the
  dashboard.

## Recommended hardening before go-live

- Rotate `WHATSAPP_VERIFY_TOKEN`, `CRON_SECRET`, and `VAPI_WEBHOOK_SECRET`
  to long random values (32+ bytes) — the `.env.example` placeholders are
  not safe defaults.
- Add rate limiting in front of `/api/webhook/whatsapp` if you observe abuse
  (Vercel's edge/WAF rules or a Redis-backed token bucket keyed by phone
  number are both good fits given Redis is already in the stack).
- Restrict `DASHBOARD_ORIGIN` (CORS) to the exact deployed dashboard URL in
  production instead of `*` or a wildcard.
