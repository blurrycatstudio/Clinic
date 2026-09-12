-- ----------------------------------------------------------------------------
-- Link whatsapp_messages to the appointment a reminder was about, so the
-- dashboard can show per-appointment "reminder sent / delivered / read"
-- status instead of only a dispatch timestamp.
-- ----------------------------------------------------------------------------

alter table whatsapp_messages
  add column appointment_id uuid references appointments (id) on delete set null;

create index whatsapp_messages_appointment_id_idx on whatsapp_messages (appointment_id);
