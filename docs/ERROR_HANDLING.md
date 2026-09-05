# Error Handling Strategy

## Principles

1. **A flaky third-party call never breaks a booking.** OpenAI, WhatsApp
   template sends, and audit logging all degrade gracefully rather than
   throwing into the critical path.
2. **A webhook always returns 200 fast.** Meta retries aggressively on
   non-200 responses; `receiveWebhook` acknowledges immediately and processes
   asynchronously so a slow downstream call can't cause Meta to redeliver
   the same message repeatedly.
3. **Errors are typed, not stringly-checked.** `lib/errors.ts` defines a
   small hierarchy (`AppError`, `NotFoundError`, `ValidationError`,
   `ConflictError`, `UnauthorizedError`, `ExternalServiceError`) so
   `errorHandler` middleware can map any thrown error to the right HTTP
   status and a consistent JSON shape: `{ error: { code, message, details } }`.

## Layer-by-layer behavior

| Layer | Failure mode | Behavior |
|---|---|---|
| `verifyWhatsappSignature` | Missing/invalid signature | 401, request never reaches business logic |
| `webhookController.receiveWebhook` | Any error while processing a batch of messages | Logged, swallowed — response was already sent 200 before processing began |
| `redisStateService.get` | Redis key missing/expired | Falls back to the Supabase `conversation_states` snapshot, then to a fresh context — never throws |
| `openaiService.*` | API error, timeout, unparsable response | Returns `Intent.UNKNOWN` / a generic apology string — the conversation always gets *some* reply |
| `appointmentRepository.create/reschedule` | Postgres unique-violation (`23505`, double-booked slot) | Mapped to `ConflictError` (409), surfaced to the patient as "please choose another slot" |
| `templateService.send` | Template not yet approved by Meta | Logs `template.failed` to `audit_logs`, uses a plain-text session fallback where policy allows (see SECURITY.md) |
| `templateService.send` | WhatsApp Graph API error | Logs `template.failed` with the error message, does not throw — a reminder failing for one patient must not abort the whole cron batch |
| `auditLogRepository.record` | Insert fails | Logged via `logger.error`, swallowed — losing an audit row must never crash the actual user-facing action |
| Dashboard REST controllers | Zod validation failure | zod throws a `ZodError`, caught by the global `errorHandler` and returned as a 400 (extend `errorHandler` to special-case `ZodError` -> `VALIDATION_ERROR` if you want friendlier field-level messages) |
| Any unhandled exception | — | Global `errorHandler` logs full details server-side, returns a generic 500 to the client (never leaks stack traces or internals) |

## Conversation engine resilience

`conversationEngine.handleInboundMessage` wraps the actual flow-handler
invocation in a try/catch:

```ts
try {
  result = await handler({ ... })
} catch (err) {
  logger.error({ err, state: context.state }, "Flow handler threw")
  result = { context: resetToMenu, reply: { text: genericFallback } }
}
```

So a bug in one flow (e.g. an unexpected null somewhere in the reschedule
flow) degrades to "sorry, I didn't understand — here's the menu again"
instead of the patient's message going unanswered.

## Cron job resilience

`runReminderJob` processes each due appointment independently inside its
own try/catch — one patient's invalid phone number or a transient WhatsApp
API blip increments a `failed` counter but does not stop the loop from
sending reminders to everyone else in the batch. The job returns
`{ sent, failed }` so you can alert on a high failure rate.

## Client-side (dashboard)

- TanStack Query's default retry/error boundaries surface failed requests
  as inline error states rather than crashing the SPA.
- `apps/web/src/lib/api.ts` throws a typed `ApiError` (with the HTTP status
  attached) so components can distinguish, e.g., a 409 slot conflict from a
  generic failure.

## Logging

All structured logs go through `pino` (`config/logger.ts`), with request
logging via `pino-http`. In production, logs are JSON (suitable for
ingestion by any log aggregator); in development, `pino-pretty` renders
them human-readably. Secrets are redacted at the logger level, not left to
each call site to remember.
