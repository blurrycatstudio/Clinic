# VidaClinic — WhatsApp AI Receptionist

A production-ready WhatsApp AI receptionist for a single-doctor pediatric
clinic in Tijuana, Mexico. Patients book, reschedule, and cancel
appointments, ask clinic questions, and get the clinic's location — all
through WhatsApp, in the language they pick at the start of the chat
(Spanish or English). A small staff dashboard manages appointments,
patients, and conversations.

## Status

The WhatsApp Business Account exists but its message templates are still
pending Meta's review. **The entire system is built and functional today**
using plain session messages; the only remaining step once templates are
approved is pasting their names into environment variables — see
[`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md#9-once-whatsapp-templates-are-approved)
and [`packages/shared/src/templates/registry.ts`](packages/shared/src/templates/registry.ts).

## Repository layout

```
apps/api/       Express backend — conversation engine, webhooks, REST API (deploys to Vercel serverless)
apps/web/       React + Vite staff dashboard
packages/shared/  Shared types, template registry, i18n copy, business constants
supabase/       SQL migrations + seed data
docs/           Architecture, deployment, security, error handling
```

## Documentation

- [Architecture](docs/ARCHITECTURE.md) — system diagram, state machine, sequence diagrams
- [Deployment Guide](docs/DEPLOYMENT.md) — step-by-step, from provisioning to go-live
- [Security Strategy](docs/SECURITY.md)
- [Error Handling Strategy](docs/ERROR_HANDLING.md)

## Quick start (local development)

```bash
npm install                              # installs apps/api + apps/web + packages/shared (npm workspaces)
cp .env.example apps/api/.env            # fill in Supabase/Redis/OpenAI credentials
cp apps/web/.env.example apps/web/.env.local

npm run dev:api    # http://localhost:4000
npm run dev:web    # http://localhost:5173
```

## Tech stack

React · Vite · TypeScript · Tailwind · shadcn/ui · React Router · TanStack
Query · Node.js · Express · Supabase (Postgres + Auth) · Cloudflare R2 ·
Upstash Redis · WhatsApp Cloud API · OpenAI API · Vapi · ElevenLabs ·
Google Maps API · Vercel.

## Design principle worth calling out

**OpenAI never books, reschedules, or cancels anything.** It classifies
free text into a fixed intent and answers FAQs grounded in the clinic's own
settings. Every appointment state change goes through
[`appointmentService.ts`](apps/api/src/services/appointmentService.ts), a
plain deterministic module with zero AI dependencies — the same logic the
staff dashboard, the WhatsApp flows, and (via function-calling) the Vapi
voice assistant all call into.

## Note on this repo's history

An earlier design pass produced a fully mocked staff dashboard, scaffolded
as the standalone Vite app at `pediatra-clinic/` (since moved to
`apps/web/` and folded into the npm workspace). It's now connected to
live data for dashboard stats and staff auth (Supabase Auth, a real API
client hitting `apps/api`); pages outside the ten tables this system's
brief specifies (Prescriptions, Invoices, Medical Records, Reports) remain
on their original mock data, since those aren't part of the WhatsApp
receptionist system's scope.
