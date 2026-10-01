# Voice agent — scenario coverage

The Vapi assistant's wording lives in the Vapi dashboard; its *behaviour that can
hurt someone* is enforced server-side in `/api/agent/*` so a prompt slip can't
cause a bad booking or a missed emergency. This file lists every scenario, what
the backend guarantees, and the rules the Vapi system prompt must contain.

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
10. **Calls that go wrong.** Silence, bad line, can't understand twice → offer
    WhatsApp or a callback, don't loop. Third-party callers ("for my mother") are
    fine — book under the patient's name, ask for the patient's details. Minors:
    ask for the guardian's number. Spam/prank/abuse: one polite warning, then end.

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
| 9 | Phone given with spaces, dashes, `00`, `tel:` | All phone inputs normalised → finds the existing patient instead of creating a duplicate. |
| 10 | "Anything in the morning / evening?" | Time-of-day filter now uses **clinic local time** (was UTC) and searches a deep pool, so evening isn't empty by accident. |
| 11 | "What's open on the 14th?" | `GET /availability?date=yyyy-MM-dd`. |
| 12 | Nothing available | Response carries an explicit `message`, so the agent says so rather than inventing. |
| 13 | Cancel / reschedule someone else's appointment by id | `403` when `phone` doesn't match the appointment's patient. |
| 14 | Cancel / reschedule an already-cancelled or completed appointment | `400` — a reschedule can no longer silently revive a cancelled booking. |
| 15 | Reschedule to the same/a taken slot | Rejected by slot validation. |
| 16 | Phone-suffix check with one digit | Needs two digits; one heard digit no longer verifies. |
| 17 | WhatsApp send fails (not on WhatsApp, 24h window, not configured) | Location / availability / details return the data + a message to read it aloud; handoff returns `sent:false` with guidance — never a 500 mid-call. |
| 18 | Clinic pin coordinates missing | Falls back to a text + Maps-link message instead of failing. |
| 19 | Vapi "in-progress" webhook dropped/late | `end-of-call-report` and transcripts create the call row if missing, so the call never disappears from the dashboard. |
| 20 | Call ended by silence, transfer, or no answer | Mapped to `completed` / `no_answer` instead of everything being `failed`. |

## Needs a human decision / outside this repo

- **Vapi prompt & tools**: paste the rules above; make the n8n/Vapi tool
  definitions pass `phone` on cancel/reschedule/confirm and accept the new
  `escalate` categories and the `instructions` field in the response.
- **Live transfer**: if you want the agent to *transfer* an emergency/human
  request to a staff line, configure a Vapi `transferCall` tool with a staffed
  number — the API can alert staff but can't bridge a call.
- **`STAFF_ALERT_PHONE_E164`**: set it, and make sure that number has messaged
  the clinic's WhatsApp within 24h (Meta's session rule) or the alert will fail
  (it's logged at error level either way).
- **Ownership check is opt-in** (`phone` is optional) so the live n8n workflow
  doesn't break; make it required once the workflow sends it.
