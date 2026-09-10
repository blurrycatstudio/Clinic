-- ----------------------------------------------------------------------------
-- Allergies and current medications, tracked directly on the patient record
-- so the dashboard's chart can persist what used to be session-only
-- "Add allergy" / "Add medication" prompts.
-- ----------------------------------------------------------------------------

alter table patients
  add column allergies text[] not null default '{}',
  add column current_medications text[] not null default '{}';
