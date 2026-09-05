# Architecture

## Overview

VidaClinic's WhatsApp AI Receptionist is a single-clinic, single-doctor
booking system. Patients interact entirely through WhatsApp; staff manage
the clinic through a small web dashboard. The system is deliberately split
so that **AI never makes a business decision** — OpenAI classifies intent
and answers FAQs, but every appointment state transition is plain,
testable, deterministic TypeScript.

```
┌─────────────┐        ┌──────────────────────────────────────────────┐        ┌──────────────┐
│   Patient    │◄──────►│              apps/api (Express)               │◄──────►│  Supabase    │
│  (WhatsApp)  │  HTTPS │  Vercel serverless functions                  │        │  PostgreSQL  │
└─────────────┘        │                                                │        └──────────────┘
                        │  Webhook → Conversation Engine → Flows        │
                        │       │                    │                  │        ┌──────────────┐
                        │       ▼                    ▼                  │◄──────►│  Upstash     │
                        │  WhatsApp Cloud API    OpenAI (intent/FAQ)    │        │  Redis (REST)│
                        └──────────────────────────────────────────────┘        └──────────────┘
                                        ▲
                                        │ REST (Supabase Auth JWT)
                                        │
                        ┌───────────────────────────────────┐
                        │   apps/web (Vite + React)          │
                        │   Staff dashboard                  │
                        └───────────────────────────────────┘

┌─────────────┐        ┌──────────────────────────────┐
│   Patient    │◄──────►│   Vapi (voice orchestration)   │──── webhooks ──► apps/api (voice_calls, call_transcripts)
│   (phone)    │  call  │   + ElevenLabs (TTS)           │
└─────────────┘        └──────────────────────────────┘
```

## Why these specific choices

- **Upstash Redis over REST, not a TCP redis client.** Vercel functions are
  stateless and short-lived; a pooled TCP connection either leaks or
  reconnects on every cold start. Upstash's REST API turns every Redis op
  into a single HTTPS call, which is the only connection model that's
  actually safe under serverless.
- **Redis is the source of truth for conversation state, Postgres is the
  audit trail.** `conversation_states` mirrors every transition so a
  conversation can be reconstructed if a Redis key is evicted early, but the
  live routing decision never waits on Postgres.
- **OpenAI is scoped to two jobs only:** classify free text into a fixed
  `Intent` enum, and answer FAQs grounded in `clinic_settings`. It is never
  in the call path that creates, modifies, or cancels a row in
  `appointments` — see `appointmentService.ts`, which has zero AI
  dependencies and is unit-testable in isolation.
- **Templates are looked up by semantic key, never by literal string.**
  `packages/shared/templates/registry.ts` is the only file that reads
  `WHATSAPP_TEMPLATE_*` env vars. Every call site (booking flow, cron
  reminders, dashboard-triggered notifications) references
  `"appointmentConfirmation"` etc. Once Meta approves a template, filling in
  its env var is the entire required change.

## Conversation State Machine

```
AWAITING_LANGUAGE_SELECTION
        │ (1=es / 2=en)
        ▼
AWAITING_MENU_SELECTION ──1──► AWAITING_NAME ──► AWAITING_PHONE ──► AWAITING_REASON ──► AWAITING_SLOT_SELECTION ──► AWAITING_BOOKING_CONFIRMATION ──► (back to menu)
        │
        ├──2──► AWAITING_RESCHEDULE_TARGET_SELECTION ──► AWAITING_RESCHEDULE_SLOT_SELECTION ──► AWAITING_RESCHEDULE_CONFIRMATION ──► (back to menu)
        │
        ├──3──► AWAITING_CANCELLATION_TARGET_SELECTION ──► AWAITING_CANCELLATION_CONFIRMATION ──► (back to menu)
        │
        ├──4──► AWAITING_FAQ_QUESTION ──► (OpenAI FAQ answer, stays in this state until "menu")
        │
        └──5──► ESCALATED_TO_HUMAN (bot goes quiet except "menu" escape hatch)
```

Every state lives in Redis at key `conv:{phoneE164}` with a 24-hour TTL,
refreshed on every turn. See `packages/shared/src/types/conversation.ts` for
the full enum and `apps/api/src/services/redisStateService.ts` for the
get/save/recover logic.

## Sequence: First contact + language selection

```mermaid
sequenceDiagram
    participant P as Patient (WhatsApp)
    participant M as Meta Cloud API
    participant W as apps/api Webhook
    participant R as Redis (Upstash)
    participant S as Supabase

    P->>M: "Hola"
    M->>W: POST /api/webhook/whatsapp
    W->>S: getOrCreate conversation by phone
    W->>R: GET conv:{phone} (miss, new conversation)
    W->>S: log inbound message + audit "message.received"
    W->>P: send bilingual language prompt (1=Español, 2=English)
    W->>R: SET conv:{phone} state=AWAITING_LANGUAGE_SELECTION (TTL 24h)
    P->>M: "1"
    M->>W: POST /api/webhook/whatsapp
    W->>R: GET conv:{phone} (hit)
    W->>S: set conversation.language = "es"
    W->>P: send main menu (1-5)
    W->>R: SET conv:{phone} state=AWAITING_MENU_SELECTION
```

## Sequence: Book appointment

```mermaid
sequenceDiagram
    participant P as Patient
    participant W as Webhook/ConversationEngine
    participant F as bookAppointmentFlow
    participant AS as appointmentService (deterministic)
    participant DB as Supabase
    participant WA as WhatsApp Service

    P->>W: "1" (main menu)
    W->>F: route to AWAITING_NAME
    F->>P: "What's the patient's full name?"
    P->>W: "Emilia Torres"
    F->>P: "Contact phone number?"
    P->>W: "+52 664 123 4567"
    F->>P: "Reason for visit?"
    P->>W: "Fever and cough"
    F->>AS: getAvailableSlots()
    AS->>DB: doctor_schedule + appointments (existing bookings)
    AS-->>F: 9 open 30-min slots, cached on context.booking.cachedSlots
    F->>P: numbered slot list
    P->>W: "3"
    F->>P: confirmation summary, "Reply YES or NO"
    P->>W: "YES"
    F->>AS: bookAppointment({...})
    AS->>DB: upsert patient by phone
    AS->>DB: INSERT appointment (unique index guards double-booking)
    AS->>DB: audit_logs "appointment.created"
    F->>P: "✅ Confirmed! {date} at {time}"
    Note over WA: Sent as plain text — still inside the 24h session window,<br/>so no approved template is required here.
```

## Sequence: 24h reminder (outside the session window — requires a template)

```mermaid
sequenceDiagram
    participant Cron as Vercel Cron
    participant API as /api/cron/reminders
    participant DB as Supabase
    participant TS as templateService
    participant WA as WhatsApp Cloud API
    participant P as Patient

    Cron->>API: GET ?window=24h (every 15 min, Bearer CRON_SECRET)
    API->>DB: appointments starting in ~24h, reminder_24h_sent_at IS NULL
    loop each appointment
        API->>TS: send("appointmentReminder24h", ...)
        alt template approved
            TS->>WA: template message
            WA-->>P: "Reminder: your appointment is tomorrow at 10:00 AM"
            TS->>DB: log message + audit "template.sent"
            API->>DB: mark reminder_24h_sent_at = now()
        else template not yet approved
            TS->>DB: audit "template.failed" (reason: template_not_configured)
            Note over TS: No plain-text fallback sent — Meta requires an<br/>approved template outside the 24h session window.
        end
    end
```

## Sequence: Voice call (Vapi + ElevenLabs)

```mermaid
sequenceDiagram
    participant P as Patient (phone call)
    participant Vapi as Vapi (STT + LLM + function-calling)
    participant EL as ElevenLabs (TTS)
    participant API as apps/api /webhook/vapi
    participant DB as Supabase

    P->>Vapi: calls clinic number
    Vapi->>API: status-update (in-progress)
    API->>DB: INSERT voice_calls (status=in_progress)
    loop conversation turns
        P->>Vapi: speech
        Vapi->>API: transcript (role=user)
        API->>DB: INSERT call_transcripts
        Vapi->>Vapi: LLM turn — for booking-shaped requests, calls the SAME<br/>REST endpoints as the dashboard (deterministic appointmentService)
        Vapi->>EL: text to synthesize
        EL-->>Vapi: audio
        Vapi-->>P: spoken reply
        Vapi->>API: transcript (role=assistant)
        API->>DB: INSERT call_transcripts
    end
    Vapi->>API: end-of-call-report
    API->>DB: UPDATE voice_calls (status, duration, recording_url, summary)
    API->>DB: audit_logs "voice_call.completed"
```

## Repository layout

```
.
├── apps/
│   ├── api/                     # Express API, deployed as Vercel serverless functions
│   │   ├── api/index.ts         # Vercel entry point (exports the Express app)
│   │   └── src/
│   │       ├── config/          # env, supabase, redis, openai, logger
│   │       ├── middleware/      # error handling, webhook signature verification, staff auth
│   │       ├── repositories/    # one file per DB table — the only code that touches Supabase
│   │       ├── services/        # redisStateService, whatsappService, openaiService,
│   │       │                    # appointmentService (deterministic), templateService,
│   │       │                    # conversationEngine (orchestrator)
│   │       ├── flows/           # one file per WhatsApp menu flow (book/reschedule/cancel/info/human)
│   │       ├── controllers/     # webhook + dashboard REST controllers
│   │       ├── routes/          # Express routers
│   │       └── cron/            # reminder job, triggered by Vercel Cron
│   └── web/                      # React + Vite staff dashboard
├── packages/
│   └── shared/                  # DB row types, conversation state types, template registry, i18n
├── supabase/
│   └── migrations/              # SQL schema + seed data
└── docs/                        # this file, DEPLOYMENT.md, SECURITY.md, ERROR_HANDLING.md
```
