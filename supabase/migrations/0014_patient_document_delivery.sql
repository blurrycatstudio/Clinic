-- Tracks whether a patient document has already been sent to the parent over
-- WhatsApp, so the 12-hour delivery cron (see apps/api/src/cron/documentDelivery.ts)
-- can pick up only documents uploaded since its last run and never resend one.
alter table patient_documents add column whatsapp_sent_at timestamptz;

create index idx_patient_documents_pending_delivery on patient_documents (created_at) where whatsapp_sent_at is null;
