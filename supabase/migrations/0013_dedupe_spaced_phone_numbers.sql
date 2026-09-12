-- ============================================================================
-- One-time cleanup: the PhoneInput bug (fixed in phone-input.tsx) stored some
-- phone numbers as "+91 9219583594" instead of "+919219583594". Because
-- patients.phone_e164 is UNIQUE, every spaced number collided with an
-- already-existing clean record instead of updating it, silently creating a
-- duplicate patient (with its own duplicate conversation/appointments/calls)
-- for the same real person. This merges each duplicate back into the
-- canonical (clean-phone) patient and deletes the leftovers.
-- ============================================================================

-- 1) "Verification Test Patient" (+91 9219583594) — created during this
--    session's own feature testing, a pure duplicate of the real patient
--    "Ashutosh Singh" (d7dc8b7b-dbb7-453a-a10a-379845bda8b2). No real data,
--    safe to delete outright.
delete from appointments where patient_id = '88a3fa2e-0c69-44c7-9d63-02d0987736cd';
delete from whatsapp_messages where conversation_id = '825e6332-4765-4ac5-9798-c2de16b64d6c';
delete from whatsapp_conversations where id = '825e6332-4765-4ac5-9798-c2de16b64d6c';
delete from patients where id = '88a3fa2e-0c69-44c7-9d63-02d0987736cd';

-- 2) "Ekansh Saxena" (+91 6386639197) — a pre-existing duplicate of the
--    canonical patient f6a7ed7d-4db5-4469-b4de-3fe0e9112e5c (whose name was
--    itself corrupted by an earlier, separate bug: a patient replying "hi"
--    where a name was expected got parsed as a booking request instead of a
--    name correction, so it kept the placeholder "what is capital of india").
--    Merging fixes both bugs' leftover data at once: reassign the
--    duplicate's appointment/message/calls to the canonical patient, rename
--    the canonical patient to the real name, then remove the duplicate.
update appointments set patient_id = 'f6a7ed7d-4db5-4469-b4de-3fe0e9112e5c'
  where patient_id = '6d5c4049-17f4-4989-b1f4-308caca7262e';

update whatsapp_messages set conversation_id = '403236dd-8460-4fb8-b5d4-bab7f06afd2e'
  where conversation_id = '9982b39f-e6a0-4b1e-a6b7-16548dbe7aef';

update voice_calls set patient_id = 'f6a7ed7d-4db5-4469-b4de-3fe0e9112e5c', phone_e164 = '+916386639197'
  where patient_id = '6d5c4049-17f4-4989-b1f4-308caca7262e';

update patients set full_name = 'Ekansh Saxena'
  where id = 'f6a7ed7d-4db5-4469-b4de-3fe0e9112e5c';

delete from whatsapp_conversations where id = '9982b39f-e6a0-4b1e-a6b7-16548dbe7aef';
delete from patients where id = '6d5c4049-17f4-4989-b1f4-308caca7262e';
