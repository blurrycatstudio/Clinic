-- ============================================================================
-- Multi-tenancy: introduce `clinics` and `staff_users`, and scope every
-- existing table to a clinic_id. The API always talks to Postgres with the
-- service-role key (see apps/api/src/config/supabase.ts), which bypasses RLS
-- entirely — so these RLS policies are defense-in-depth, not the primary
-- isolation boundary. The real boundary is the application layer: every
-- repository call must be given a clinic_id and filter on it explicitly.
--
-- This migration also backfills a single `clinics` row for the existing
-- VidaClinic data and points every existing row + every existing
-- auth.users login at it, so the app keeps working unmodified for the
-- current clinic while the code is updated to pass clinic_id explicitly.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- clinics — one row per paying customer
-- ----------------------------------------------------------------------------
create table clinics (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  status text not null default 'active' check (status in ('active', 'suspended')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger trg_clinics_updated_at
  before update on clinics
  for each row execute function set_updated_at();

-- ----------------------------------------------------------------------------
-- staff_users — links a Supabase Auth login to exactly one clinic.
-- Nothing plays this role today; `is_staff()` just checks
-- auth.role() = 'authenticated' with no notion of which clinic.
-- ----------------------------------------------------------------------------
create table staff_users (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references clinics (id) on delete cascade,
  auth_user_id uuid not null unique references auth.users (id) on delete cascade,
  role text not null default 'staff' check (role in ('owner', 'staff')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_staff_users_clinic on staff_users (clinic_id);

create trigger trg_staff_users_updated_at
  before update on staff_users
  for each row execute function set_updated_at();

-- ----------------------------------------------------------------------------
-- Seed the default clinic for existing data, and map every existing
-- Supabase Auth user to it as 'owner' (there is exactly one clinic today).
-- ----------------------------------------------------------------------------
do $$
declare
  default_clinic_id uuid;
begin
  insert into clinics (name, slug, status)
  values ('VidaClinic', 'vidaclinic', 'active')
  returning id into default_clinic_id;

  insert into staff_users (clinic_id, auth_user_id, role)
  select default_clinic_id, u.id, 'owner'
  from auth.users u;

  -- ------------------------------------------------------------------------
  -- Add clinic_id to every tenant table, backfill it to the default clinic,
  -- then make it required. Existing global uniqueness constraints that must
  -- become per-clinic are dropped and recreated as composite.
  -- ------------------------------------------------------------------------

  alter table patients add column clinic_id uuid references clinics (id);
  update patients set clinic_id = default_clinic_id;
  alter table patients alter column clinic_id set not null;
  drop index if exists idx_patients_phone;
  alter table patients drop constraint if exists patients_phone_e164_key;
  create unique index uniq_patients_clinic_phone on patients (clinic_id, phone_e164);
  create index idx_patients_clinic on patients (clinic_id);

  alter table appointments add column clinic_id uuid references clinics (id);
  update appointments set clinic_id = default_clinic_id;
  alter table appointments alter column clinic_id set not null;
  create index idx_appointments_clinic on appointments (clinic_id);

  alter table doctor_schedule add column clinic_id uuid references clinics (id);
  update doctor_schedule set clinic_id = default_clinic_id;
  alter table doctor_schedule alter column clinic_id set not null;
  alter table doctor_schedule drop constraint if exists doctor_schedule_doctor_id_weekday_key;
  create unique index uniq_doctor_schedule_clinic_doctor_weekday
    on doctor_schedule (clinic_id, doctor_id, weekday);

  alter table clinic_settings add column clinic_id uuid references clinics (id);
  update clinic_settings set clinic_id = default_clinic_id;
  alter table clinic_settings alter column clinic_id set not null;
  create unique index uniq_clinic_settings_clinic on clinic_settings (clinic_id);
  alter table clinic_settings
    add column whatsapp_phone_number_id text,
    add column vapi_phone_number text;
  create unique index uniq_clinic_settings_whatsapp_phone_number_id
    on clinic_settings (whatsapp_phone_number_id) where whatsapp_phone_number_id is not null;
  create unique index uniq_clinic_settings_vapi_phone_number
    on clinic_settings (vapi_phone_number) where vapi_phone_number is not null;

  alter table whatsapp_conversations add column clinic_id uuid references clinics (id);
  update whatsapp_conversations set clinic_id = default_clinic_id;
  alter table whatsapp_conversations alter column clinic_id set not null;
  drop index if exists idx_wa_conversations_phone;
  alter table whatsapp_conversations drop constraint if exists whatsapp_conversations_wa_phone_e164_key;
  create unique index uniq_wa_conversations_clinic_phone on whatsapp_conversations (clinic_id, wa_phone_e164);
  create index idx_wa_conversations_clinic on whatsapp_conversations (clinic_id);

  alter table whatsapp_messages add column clinic_id uuid references clinics (id);
  update whatsapp_messages set clinic_id = default_clinic_id;
  alter table whatsapp_messages alter column clinic_id set not null;
  create index idx_wa_messages_clinic on whatsapp_messages (clinic_id);

  alter table conversation_states add column clinic_id uuid references clinics (id);
  update conversation_states set clinic_id = default_clinic_id;
  alter table conversation_states alter column clinic_id set not null;
  create index idx_conversation_states_clinic on conversation_states (clinic_id);

  alter table voice_calls add column clinic_id uuid references clinics (id);
  update voice_calls set clinic_id = default_clinic_id;
  alter table voice_calls alter column clinic_id set not null;
  create index idx_voice_calls_clinic on voice_calls (clinic_id);

  alter table call_transcripts add column clinic_id uuid references clinics (id);
  update call_transcripts set clinic_id = default_clinic_id;
  alter table call_transcripts alter column clinic_id set not null;
  create index idx_call_transcripts_clinic on call_transcripts (clinic_id);

  alter table audit_logs add column clinic_id uuid references clinics (id);
  update audit_logs set clinic_id = default_clinic_id;
  alter table audit_logs alter column clinic_id set not null;
  create index idx_audit_logs_clinic on audit_logs (clinic_id);

  alter table prescriptions add column clinic_id uuid references clinics (id);
  update prescriptions set clinic_id = default_clinic_id;
  alter table prescriptions alter column clinic_id set not null;
  create index idx_prescriptions_clinic on prescriptions (clinic_id);

  alter table invoices add column clinic_id uuid references clinics (id);
  update invoices set clinic_id = default_clinic_id;
  alter table invoices alter column clinic_id set not null;
  create index idx_invoices_clinic on invoices (clinic_id);

  alter table consultations add column clinic_id uuid references clinics (id);
  update consultations set clinic_id = default_clinic_id;
  alter table consultations alter column clinic_id set not null;
  create index idx_consultations_clinic on consultations (clinic_id);
end $$;

-- ----------------------------------------------------------------------------
-- RLS: defense-in-depth only (see header note). Replace the blanket
-- "any authenticated user" check with one scoped to the caller's clinic via
-- staff_users, for the day a browser-direct/anon-key path exists.
-- ----------------------------------------------------------------------------
create or replace function is_staff()
returns boolean
language sql
stable
as $$
  select auth.role() = 'authenticated';
$$;

create or replace function current_staff_clinic_id()
returns uuid
language sql
stable
as $$
  select clinic_id from staff_users where auth_user_id = auth.uid();
$$;

alter table clinics enable row level security;
alter table staff_users enable row level security;

create policy staff_read_own_clinic on clinics for select
  using (id = current_staff_clinic_id());
create policy staff_read_own_staff_users on staff_users for select
  using (clinic_id = current_staff_clinic_id());

-- Re-scope every existing "staff_read_*" policy from is_staff() alone to
-- also require clinic_id = current_staff_clinic_id().
drop policy if exists staff_read_patients on patients;
create policy staff_read_patients on patients for select
  using (is_staff() and clinic_id = current_staff_clinic_id());

drop policy if exists staff_read_appointments on appointments;
create policy staff_read_appointments on appointments for select
  using (is_staff() and clinic_id = current_staff_clinic_id());

drop policy if exists staff_read_doctor_schedule on doctor_schedule;
create policy staff_read_doctor_schedule on doctor_schedule for select
  using (is_staff() and clinic_id = current_staff_clinic_id());

drop policy if exists staff_read_clinic_settings on clinic_settings;
create policy staff_read_clinic_settings on clinic_settings for select
  using (is_staff() and clinic_id = current_staff_clinic_id());

drop policy if exists staff_write_clinic_settings on clinic_settings;
create policy staff_write_clinic_settings on clinic_settings for update
  using (is_staff() and clinic_id = current_staff_clinic_id());

drop policy if exists staff_read_wa_conversations on whatsapp_conversations;
create policy staff_read_wa_conversations on whatsapp_conversations for select
  using (is_staff() and clinic_id = current_staff_clinic_id());

drop policy if exists staff_read_wa_messages on whatsapp_messages;
create policy staff_read_wa_messages on whatsapp_messages for select
  using (is_staff() and clinic_id = current_staff_clinic_id());

drop policy if exists staff_read_conversation_states on conversation_states;
create policy staff_read_conversation_states on conversation_states for select
  using (is_staff() and clinic_id = current_staff_clinic_id());

drop policy if exists staff_read_voice_calls on voice_calls;
create policy staff_read_voice_calls on voice_calls for select
  using (is_staff() and clinic_id = current_staff_clinic_id());

drop policy if exists staff_read_call_transcripts on call_transcripts;
create policy staff_read_call_transcripts on call_transcripts for select
  using (is_staff() and clinic_id = current_staff_clinic_id());

drop policy if exists staff_read_audit_logs on audit_logs;
create policy staff_read_audit_logs on audit_logs for select
  using (is_staff() and clinic_id = current_staff_clinic_id());

drop policy if exists staff_read_prescriptions on prescriptions;
create policy staff_read_prescriptions on prescriptions for select
  using (is_staff() and clinic_id = current_staff_clinic_id());

drop policy if exists staff_read_invoices on invoices;
create policy staff_read_invoices on invoices for select
  using (is_staff() and clinic_id = current_staff_clinic_id());

-- prescription_items / invoice_items have no clinic_id of their own; they're
-- scoped implicitly through their parent row's clinic_id via a join.
drop policy if exists staff_read_prescription_items on prescription_items;
create policy staff_read_prescription_items on prescription_items for select
  using (
    is_staff() and exists (
      select 1 from prescriptions p
      where p.id = prescription_items.prescription_id
        and p.clinic_id = current_staff_clinic_id()
    )
  );

drop policy if exists staff_read_invoice_items on invoice_items;
create policy staff_read_invoice_items on invoice_items for select
  using (
    is_staff() and exists (
      select 1 from invoices i
      where i.id = invoice_items.invoice_id
        and i.clinic_id = current_staff_clinic_id()
    )
  );

drop policy if exists staff_read_consultations on consultations;
create policy staff_read_consultations on consultations for select
  using (is_staff() and clinic_id = current_staff_clinic_id());
