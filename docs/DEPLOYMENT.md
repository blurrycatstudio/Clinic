# Deployment Guide

## 0. Prerequisites

- A Supabase project (Postgres + Auth)
- An Upstash Redis database (REST API, not the TCP endpoint)
- An OpenAI API key
- A Vercel account, with the Vercel CLI (`npm i -g vercel`) or GitHub integration
- The WhatsApp Business Account, phone number, and app secret (per the brief, these already exist — you're just plugging in the values)

## 1. Provision Supabase

1. Create a new Supabase project.
2. Run the migrations against it, in order:
   ```bash
   supabase db push
   # or, without the Supabase CLI, paste each file's contents into the SQL editor in order:
   #   supabase/migrations/0001_init.sql
   #   supabase/migrations/0002_seed.sql
   ```
3. Copy the **Project URL**, **anon key**, and **service_role key** from
   Project Settings → API. The service_role key goes ONLY in `apps/api`'s
   environment, never in the frontend.
4. Under Authentication, create a staff user (email/password) for the
   doctor/front-desk to log into the dashboard with.

## 2. Provision Upstash Redis

1. Create a Redis database at [upstash.com](https://upstash.com) (any
   region close to your Vercel deployment region).
2. Copy the **REST URL** and **REST Token** — not the `redis://` connection
   string, the API uses the REST client (`@upstash/redis`) specifically so
   it works from Vercel's stateless serverless functions.

## 3. Install dependencies

`apps/api`, `apps/web`, and `packages/shared` are npm workspaces, installed
together from the repo root:

```bash
npm install                     # apps/api + apps/web + packages/shared
```

## 4. Configure environment variables

Copy `.env.example` to `apps/api/.env` for local development and fill in
everything you have so far. WhatsApp template name vars can stay empty
until Meta approves them — see "Once templates are approved" below.

Copy `apps/web/.env.example` to `apps/web/.env.local` and fill in the
Supabase URL/anon key and your local API URL.

## 5. Run locally

```bash
npm run dev:api   # Express API on http://localhost:4000
npm run dev:web   # Vite dashboard on http://localhost:5173
```

Point the WhatsApp webhook at a tunneled URL (e.g. `ngrok http 4000`) during
local testing, or skip that and just exercise the conversation engine via
the dashboard/Postman against `/api/webhook/whatsapp` with a synthetic
payload shaped like Meta's.

## 6. Deploy apps/api to Vercel

```bash
cd apps/api
vercel link
vercel env add SUPABASE_URL production
vercel env add SUPABASE_SERVICE_ROLE_KEY production
vercel env add UPSTASH_REDIS_REST_URL production
vercel env add UPSTASH_REDIS_REST_TOKEN production
vercel env add OPENAI_API_KEY production
vercel env add CRON_SECRET production
vercel env add DASHBOARD_ORIGIN production   # your deployed dashboard URL
# ... repeat for every var in .env.example you have a real value for
vercel --prod
```

Note the deployed API's URL (e.g. `https://vidaclinic-api.vercel.app`).

Vercel Cron (configured in `apps/api/vercel.json`) will automatically start
hitting `/api/cron/reminders` on schedule once deployed — no extra setup.

## 7. Deploy apps/web to Vercel

```bash
cd apps/web
vercel link
vercel env add VITE_SUPABASE_URL production
vercel env add VITE_SUPABASE_ANON_KEY production
vercel env add VITE_API_BASE_URL production   # the apps/api URL from step 6, + /api
vercel --prod
```

Update `DASHBOARD_ORIGIN` on the `apps/api` project to this dashboard's
final URL and redeploy the API so CORS allows it.

## 8. Configure the WhatsApp webhook

In Meta's App Dashboard → WhatsApp → Configuration:

- **Callback URL**: `https://<your-api-domain>/api/webhook/whatsapp`
- **Verify token**: same value as `WHATSAPP_VERIFY_TOKEN`
- Subscribe to the `messages` webhook field.

Then set the real values for:
```
WHATSAPP_ACCESS_TOKEN
WHATSAPP_PHONE_NUMBER_ID
WHATSAPP_BUSINESS_ACCOUNT_ID
WHATSAPP_VERIFY_TOKEN
WHATSAPP_APP_SECRET
```
on the `apps/api` Vercel project and redeploy.

## 9. Once WhatsApp templates are approved

This is the entire remaining checklist per the project brief — no code
changes required:

1. In WhatsApp Manager, copy each approved template's exact name.
2. Set these env vars on the `apps/api` Vercel project:
   ```
   WHATSAPP_TEMPLATE_APPOINTMENT_CONFIRMATION
   WHATSAPP_TEMPLATE_APPOINTMENT_REMINDER_24H
   WHATSAPP_TEMPLATE_APPOINTMENT_REMINDER_2H
   WHATSAPP_TEMPLATE_APPOINTMENT_RESCHEDULED
   WHATSAPP_TEMPLATE_APPOINTMENT_CANCELLED
   WHATSAPP_TEMPLATE_CLINIC_LOCATION
   ```
3. Redeploy (`vercel --prod`).

`packages/shared/src/templates/registry.ts` reads these at runtime; every
call site already references templates by semantic key, so nothing else in
the codebase changes.

## 10. Optional: Vapi + ElevenLabs (voice channel)

1. Create a Vapi assistant, configure it to speak with an ElevenLabs voice
   (`ELEVENLABS_API_KEY` / `ELEVENLABS_VOICE_ID`), and point its
   function-calling tools at the same `apps/api` REST endpoints used by the
   dashboard (`/api/appointments/slots`, `/api/appointments`, etc.) so voice
   bookings go through the identical deterministic `appointmentService`.
2. Set the assistant's webhook URL to `https://<your-api-domain>/api/webhook/vapi`.
3. Set `VAPI_API_KEY`, `VAPI_ASSISTANT_ID`, and `VAPI_WEBHOOK_SECRET` on the
   `apps/api` Vercel project.

## 11. Optional: Cloudflare R2 / Google Maps

- R2 is provisioned for future use (e.g. storing voice call recordings or
  patient-uploaded documents) — set `R2_*` vars when you wire that up.
- `GOOGLE_MAPS_API_KEY` powers the "clinic location" flow if you extend
  `clinicInfoFlow.ts` to call the Places/Geocoding API instead of using the
  static lat/long stored in `clinic_settings`.

## Rollback

Every Vercel deployment is immutable and instantly reversible from the
Vercel dashboard ("Promote to Production" on a previous deployment) —
there's no separate rollback tooling to build.
