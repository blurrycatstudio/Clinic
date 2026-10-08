# Voice agent — scenario coverage

The Vapi assistant's wording lives in the Vapi dashboard; its *behaviour that can
hurt someone* is enforced server-side in `/api/agent/*` so a prompt slip can't
cause a bad booking, a missed emergency, or a false "I've sent it to your WhatsApp".
This file lists every scenario, what the backend guarantees, and the rules the
Vapi system prompt must contain.

## How a voice call reaches WhatsApp (read this first)

A phone call does **not** open WhatsApp's 24-hour customer-service window. For a
caller who hasn't messaged the clinic in the last 24 hours, WhatsApp rejects
free-text, buttons and location pins (Meta error 131047) — only an **approved
template** can start the chat. And a number that isn't on WhatsApp is only
reported *after* the send succeeds (error 131026, via the status webhook).

So every "send it on WhatsApp" tool goes through `voiceDeliveryService`:

1. **Try the rich in-session message** (buttons, map pin, flow prompt).
2. **Window closed → approved template** carrying the same content
   (`clinic_location_en`, `appointment_confirmation_en`, or the follow-up opener
   below) — see *Templates* for which are needed.
3. **Wait up to 3 s for WhatsApp's delivery receipt**, so a dead number is caught
   while the caller is still on the line.
4. **No window and no template? Save it and let the caller message first.** The request is
   stored (Redis, 24 h) and `queued: true` comes back. The agent tells the caller to send
   *Hola* to the clinic's WhatsApp number; the moment that greeting arrives, the saved
   request is delivered (booking prompt, clinic info, appointment details, ...) in the
   language used on the call. **This needs no Meta approval.** Only a plain greeting
   triggers it, so a patient who opens with a real request is never answered with
   something else.
5. **Return an honest verdict** the agent can act on:

```json
{ "sent": true,  "via": "template", "confirmation": "delivered",
  "message": "SENT as a message from the clinic with a button on it. WhatsApp confirms it reached the caller's phone. ..." }

{ "sent": false, "queued": true, "failure": "window_closed", "clinicWhatsappNumber": "+52 ...",
  "message": "NOT SENT. Do NOT tell the caller anything was sent. ... Your request is SAVED. Tell the caller: \"Please send a WhatsApp message saying Hola to ... the moment you do, you'll receive ... automatically.\"" }
```

`failure` is one of `window_closed`, `not_on_whatsapp`, `rate_limited`,
`not_configured`, `technical`, `nothing_to_send`. Every delivery (success or not)
is written to the audit log as `voice.whatsapp_delivery`.

## Prompt rules to paste into the Vapi system prompt

1. **Emergency first, always.** If the caller mentions chest pain, trouble
   breathing, heavy bleeding, stroke signs (face droop, slurred speech, one-sided
   weakness), seizure, unconsciousness, severe allergic reaction, poisoning/overdose,
   a high fever in a newborn, or a pregnancy emergency → **immediately** call
   `escalate` with `category: "medical_emergency"`, then say exactly what the tool
   returns in `instructions`. Interrupt any booking flow. Never diagnose, never
   offer an appointment instead, don't end the call until they confirm.
2. **Self-harm / crisis.** Any mention of suicide, self-harm or harming others →
   `escalate` with `category: "mental_health_crisis"`; follow `instructions`. Stay
   on the line, warm and slow.
3. **Emotion.** Angry → `angry_patient`; crying / scared / grieving / panicking →
   `distressed_patient`. Acknowledge the feeling in one short sentence *before*
   anything else, slow down, never read a menu at a distressed caller, never say
   "calm down". Anger is never answered with defensiveness or policy quotes.
4. **Human on request.** "Talk to a person / the doctor / reception" → `escalate`
   with `wants_human`. Never argue or try to retain the call.
5. **No medical advice.** Dosage, test results, "is this normal?" → `escalate`
   with `clinical_question`, offer an appointment. Severe symptoms → rule 1.
6. **Never invent.** Times, prices, doctor names, hours come only from tool
   results. If a tool fails or says nothing is available, say so plainly and offer
   the fallback (other day, WhatsApp, staff callback). Never go silent.
7. **Confirm before writing.** Read back name, date, time and the phone number
   before `book`; read back which appointment before `cancel`/`reschedule`.
8. **Identity.** Use caller ID as `phone`. Pass the caller's `phone` on every
   cancel / reschedule / confirm call. If they want to change a booking made under
   a different number, use `verify-phone-suffix`; if it fails, `escalate`
   `other`, don't retry endlessly.
9. **Language.** Reply in the caller's language (en/es); switch if they switch.
   Always pass `language` on WhatsApp tools so the message matches the call.
10. **Calls that go wrong.** Silence, bad line, can't understand twice → offer
    WhatsApp or a callback, don't loop. Third-party callers ("for my mother") are
    fine — book under the patient's name, ask for the patient's details. Minors:
    ask for the guardian's number. Spam/prank/abuse: one polite warning, then end.
11. **Never claim a WhatsApp message was sent unless the tool result says so.**
    Say "I've sent it" / "check your WhatsApp" **only** when the result has
    `sent: true`. When `sent` is `false`, do not hint that anything is on its way —
    follow `message` (it says exactly what to tell the caller). The same goes for
    `whatsappConfirmation` on book / reschedule / cancel results.
12. **Caller asks for details "in writing".** Use the matching tool, then confirm
    the number first if it isn't the caller ID:
    - clinic address / hours / fees / parking / insurance → `send_clinic_info_whatsapp` (or `whatsapp_handoff` `info` for address + hours + parking)
    - their appointment details → `whatsapp_handoff` with `intent: "status"`
    - open times → `send_available_slots_whatsapp`
    - to book / reschedule / cancel → `whatsapp_handoff` with that intent
13. **No phone number?** If a tool errors that there is no usable number
    (withheld caller ID, or a number given without a country code), ask the caller
    for their WhatsApp number *with country code* and try again. Read the number
    back before sending.

## Tools

| Vapi tool (n8n function name) | Endpoint | Notes |
|---|---|---|
| `whatsapp_handoff` | `POST /api/agent/whatsapp-handoff` | `intent`: book / reschedule / cancel / info / human / status / menu. Returns the delivery verdict. |
| `send_clinic_info_whatsapp` | `POST /api/agent/whatsapp-clinic-info` | `topic`: all / address / hours / fees / parking / insurance. On failure returns `info` to read aloud. |
| `send_available_slots_whatsapp` | `POST /api/agent/whatsapp-availability` | `days`, `timeOfDay`. On failure returns `slots` to read aloud. |
| `send_location_whatsapp` | `POST /api/agent/whatsapp-location` | Always returns `address` + `mapsUrl` to read aloud. (`whatsapp_handoff` `info` covers this too.) |
| `send_appointment_details_whatsapp` | `POST /api/agent/whatsapp-appointment-details` | Same as handoff `status`; details are never echoed back to the model. |
| `get_appointment_status` / `check_availability` / `get_clinic_faq` | read-only | Spoken answers. |
| `escalate_to_human`, `confirm_attendance`, `verify_phone_suffix` | see above | |

All WhatsApp tools take `phone` (E.164, country code required), optional
`language` (`en`/`es`) and optional `callId`. `null` for any optional field is accepted.

Vapi function definitions for the two new tools (add in the Vapi dashboard →
Tools → Custom Function, server URL = the n8n webhook):

```json
{
  "name": "send_clinic_info_whatsapp",
  "description": "Send the caller clinic information in writing on WhatsApp. Say it was sent ONLY if the result has sent:true; otherwise follow the result's message.",
  "parameters": {
    "type": "object",
    "properties": {
      "topic": { "type": "string", "enum": ["all", "address", "hours", "fees", "parking", "insurance"] },
      "phone": { "type": "string", "description": "Only if the caller wants it sent to a different number than the one they are calling from. Include country code." },
      "language": { "type": "string", "enum": ["en", "es"] }
    },
    "required": ["topic"]
  }
}
```

```json
{
  "name": "send_available_slots_whatsapp",
  "description": "Send the caller the open appointment times on WhatsApp. Say it was sent ONLY if the result has sent:true; otherwise read the returned slots aloud.",
  "parameters": {
    "type": "object",
    "properties": {
      "days": { "type": "number" },
      "timeOfDay": { "type": "string", "enum": ["morning", "afternoon", "evening", "any"] },
      "phone": { "type": "string" },
      "language": { "type": "string", "enum": ["en", "es"] }
    }
  }
}
```

## Templates (what Meta must approve)

Currently approved in the clinic's WhatsApp Manager and used by the code:

| Env var | Template | Used for |
|---|---|---|
| `WHATSAPP_TEMPLATE_APPOINTMENT_CONFIRMATION` | `appointment_confirmation_en` | booking confirmation; also "send my appointment details" when the window is closed |
| `WHATSAPP_TEMPLATE_CLINIC_LOCATION` | `clinic_location_en` | address + hours + parking + maps link when the window is closed |
| `WHATSAPP_TEMPLATE_APPOINTMENT_RESCHEDULED` | `appointment_rescheduled_en` | reschedule confirmation |
| `WHATSAPP_TEMPLATE_APPOINTMENT_REMINDER_2H` | `appointment_reminder_2h_en` | 2-hour reminder |

All of these must be set on the deployed API (Vercel → Project Settings → Environment
Variables). `clinic_location_en` and `appointment_rescheduled_en` are approved but were
**not** wired up before — set them or those messages silently fall back to a
session message that fails for anyone outside the 24h window.

Optional (UTILITY category, language English `en`) — **not required**, because
"message us first" already covers everything while these are pending (Meta review takes
~2 days). `voice_followup_en` lets the clinic reach a caller proactively instead of
asking them to message first.

**`voice_followup_en`** → `WHATSAPP_TEMPLATE_VOICE_FOLLOWUP`
- Body: `Hello {{1}}, thanks for calling {{2}}. As we discussed on the phone, tap the button below to continue with {{3}} here on WhatsApp.`
- Samples: `Ana` / `VidaClinic` / `booking your appointment`
- Button: Quick reply — `Continue`
- The code fills `{{3}}` with "booking your appointment" / "rescheduling your appointment" / "cancelling your appointment" / "reaching our team" / "your request", and stamps the button payload `vf:<intent>` so the tap drops the patient straight into that flow.

**`appointment_cancelled_en`** → `WHATSAPP_TEMPLATE_APPOINTMENT_CANCELLED`
- Body: `Hello {{1}}, your appointment on {{2}} at {{3}} has been cancelled. Reply to this message whenever you would like to book a new one. Thank you.`
- Samples: `Ana` / `Monday 12 October` / `10:00 AM`

## Scenario matrix

| # | Scenario | Backend guarantee |
|---|----------|-------------------|
| 1 | Medical emergency mid-call | `escalate` forces `critical`, returns spoken `instructions` (call emergency services), audit-logs, logs at error level, pings `STAFF_ALERT_PHONE_E164` if set. Returns guidance even if the audit write fails. |
| 2 | Suicidal / self-harm | Same path, `mental_health_crisis` forced `critical`, crisis-line guidance. |
| 3 | Angry / distressed caller | `angry_patient` / `distressed_patient` guidance; staff alerted at high+. |
| 4 | Asks for a human | `wants_human` escalation, no pushback. |
| 5 | Medical-advice question | `clinical_question` — no advice, staff follow-up. |
| 6 | Book — time heard wrong / hallucinated / past / 3am / lunch break | `assertSlotIsOpen` rejects with a message telling the agent to re-check availability. |
| 7 | Book — slot taken a second ago | 409 `ConflictError` (DB unique index); message tells agent to offer another. |
| 8 | Book — model retries the tool after a dropped line | Same patient + same time returns the existing appointment (`alreadyBooked: true`), no duplicate. |
| 9 | Phone given with spaces, dashes, `00`, `tel:`, or missing `+` | All phone inputs normalised → finds the existing patient instead of creating a duplicate. |
| 10 | "Anything in the morning / evening?" | Time-of-day filter uses **clinic local time** and searches a deep pool. |
| 11 | "What's open on the 14th?" | `GET /availability?date=yyyy-MM-dd`. |
| 12 | Nothing available | Response carries an explicit `message`, so the agent says so rather than inventing. |
| 13 | Cancel / reschedule someone else's appointment by id | `403` when `phone` doesn't match the appointment's patient. |
| 14 | Cancel / reschedule an already-cancelled or completed appointment | `400` — a reschedule can no longer silently revive a cancelled booking. |
| 15 | Reschedule to the same/a taken slot | Rejected by slot validation. |
| 16 | Phone-suffix check with one digit | Needs two digits; one heard digit no longer verifies. |
| 17 | **WhatsApp send fails** (not on WhatsApp, 24h window, not configured, rate limit, token) | Every WhatsApp tool returns `sent:false` + a `failure` code + an agent-readable `message`; read-aloud content (address, slots, info) comes back in the same response. Never a 500 mid-call. |
| 18 | **Caller hasn't messaged in 24h** (the normal voice-first case) | Approved template carries the content when one exists (`clinic_location_en`, `appointment_confirmation_en`, later `voice_followup_en`). Otherwise the request is **saved** and delivered automatically when the caller sends *Hola* to the clinic's WhatsApp (`queued: true`; the agent is told what to say). |
| 19 | **Number isn't on WhatsApp** (landline, no account) | Caught within ~3 s via the delivery receipt → `not_on_whatsapp`; agent is told to ask for another number or read it aloud. Previously the agent said "sent" and nothing arrived. |
| 20 | **Message accepted but phone offline** | `sent:true, confirmation:"accepted"` — agent says it will show shortly, not that it arrived. |
| 21 | **Dev/unconfigured WhatsApp, or nothing actually went out** | Never reported as sent (`not_configured` / `technical`). |
| 22 | **n8n forwards `null`** for an omitted `language` / `callId` / `phone` | Accepted (was a hard 400 on every handoff without a language). |
| 23 | **Withheld caller ID, or number dictated without country code** | Clear instruction to the agent: ask for the WhatsApp number with country code. Nothing is sent to a number that might route to a stranger abroad. |
| 24 | **Escalation with bad/missing fields** (null phone, unknown category) | Still returns guidance — unknown category is treated as `high` urgency. Emergencies can no longer be lost to a validation error. |
| 25 | **Book / reschedule / cancel confirmation** | Response includes `whatsappConfirmation: {sent, message}` so the agent only promises a WhatsApp confirmation that actually went out. |
| 26 | Appointment details asked for a number that isn't the caller's | Sent only to the number the appointments are booked under; details are never returned to the model. |
| 27 | Template param with newlines / empty / long runs of spaces (multi-line hours or parking text) | Flattened to one line, empty → `-` (Meta rejects them with error 132018). |
| 28 | Template send fails (paused, wrong params) while the 24h window is open | Falls back to the plain-text version instead of dropping the message. |
| 29 | Patient taps the follow-up button | Webhook turns `vf:<intent>` into a menu choice → they land directly in the booking / reschedule / cancel flow. |
| 29b | Patient types "I want to talk to a person" instead of tapping Contact Support | Classified as human support → conversation escalated and flagged in the dashboard; the bot then stays quiet so staff can answer. The support reply shows the clinic's own phone from Settings (it used to show a hard-coded `+91` test number). |
| 29c | Reminder (cron or dashboard "Send reminder") | Marked sent **only** if WhatsApp took it, so a failed one is retried and the dashboard shows a real reason. The directions follow-up is best-effort — before, it failing outside the 24h window caused the *same reminder to be re-sent on every run*. 24h reminder outside the window uses the approved confirmation template (Reschedule / Cancel buttons) until a 24h template is approved. |
| 29d | Patient taps "Cancel Appointment" / "Reschedule" on a template button | Recognised (the template's own button labels were not in the reply vocabulary, so "Cancel Appointment" was rejected as invalid). |
| 29e | Reschedule target slot taken a moment ago / appointment cancelled meanwhile | Friendly "someone just booked that" with fresh slots; a cancelled visit is not silently revived. |
| 29f | Dashboard create / reschedule / cancel / check-in when the patient can't be messaged | The change is **saved** and the response carries `notification: {sent, failure, message}`; the UI shows e.g. "Appointment cancelled — WhatsApp message NOT sent (patient hasn't messaged in the last 24h)". Previously the API returned an error even though the change had been saved. |
| 29g | Staff manual message / send prescription / send invoice outside the 24h window | 422 with a plain explanation instead of Meta's raw error. |
| 30 | Vapi "in-progress" webhook dropped/late | `end-of-call-report` and transcripts create the call row if missing. |
| 31 | Call ended by silence, transfer, or no answer | Mapped to `completed` / `no_answer` instead of everything being `failed`. |

## Needs a human decision / outside this repo

- **Vapi prompt & tools**: paste rules 11–13; add the two new tool definitions above;
  make sure every WhatsApp tool passes `language`.
- **n8n workflow** (`Clinic Voice Receptionist (Vapi Webhook)`): map the new
  function names to the endpoints in the table, and pass `callId` on WhatsApp tools.
  The *published* version maps only 5 tools; `check_availability` and
  `get_appointment_status` exist in the draft but aren't published, so the agent gets
  "Unknown function" for them today.
- **Spanish callers** get the English templates (all approved templates are `en`).
  Submit `_es` variants if the clinic wants Spanish messages outside the 24h window.
- **Live transfer**: if you want the agent to *transfer* an emergency/human
  request to a staff line, configure a Vapi `transferCall` tool with a staffed
  number — the API can alert staff but can't bridge a call.
- **`STAFF_ALERT_PHONE_E164`**: set it, and make sure that number has messaged
  the clinic's WhatsApp within 24h (Meta's session rule) or the alert will fail
  (it's logged at error level either way).
- **Ownership check is opt-in** (`phone` is optional) so the live n8n workflow
  doesn't break; make it required once the workflow sends it.
- **`get_appointment_status`** returns appointments for whatever `phone` the agent
  passes — rule 8 (verify-phone-suffix) is the only guard when that isn't the caller ID.
- **Vercel deploys**: the `clinic-api` deployments for the two previous API commits
  *failed* ("Vercel – clinic-api: Deployment failed") — most likely because the document-delivery cron was set to
  `0 */12 * * *`, which Vercel Hobby rejects (the build log has the exact reason). It is now once a day in `apps/api/vercel.json`;
  check the Vercel dashboard that the next deploy goes green, otherwise none of this is live.
- **Reminder timing**: Vercel Hobby runs crons once a day, but the reminder jobs look at a
  ±15-minute window and need to run every 10–15 minutes — so the 24h / 2h reminders effectively
  never fire. Drive `GET /api/cron/reminders?window=24h|2h` every 10 minutes from n8n's
  Schedule trigger (or upgrade the Vercel plan).
- **`CRON_SECRET`** is not set on the deployed API, so `/api/cron/*` can be triggered by anyone.
  Set it in Vercel (Vercel's own cron then sends it automatically) and in whatever scheduler you add.
- **Dashboard "Patient checked in"** sets status `confirmed`, which sends the patient the
  "Your appointment has been confirmed" template. Probably not what a check-in should say.
