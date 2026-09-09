-- ----------------------------------------------------------------------------
-- Outbound calling: link voice_calls to the appointment they're about, track
-- whether a reminder CALL (as opposed to a WhatsApp reminder) has gone out,
-- and let staff configure whether/when reminder calls fire.
-- ----------------------------------------------------------------------------

alter table voice_calls
  add column appointment_id uuid references appointments (id) on delete set null;

alter table appointments
  add column reminder_call_sent_at timestamptz;

alter table clinic_settings
  add column reminder_call_enabled boolean not null default false,
  add column reminder_call_hours_before integer not null default 3
    check (reminder_call_hours_before between 1 and 72);
