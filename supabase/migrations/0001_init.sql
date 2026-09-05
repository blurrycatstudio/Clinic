-- ============================================================================
-- VidaClinic WhatsApp AI Receptionist — initial schema
-- Single clinic, single doctor. All timestamps stored in UTC (timestamptz);
-- the API layer converts to America/Tijuana for display and slot math.
-- ============================================================================

create extension if not exists "pgcrypto";

-- ----------------------------------------------------------------------------
-- updated_at helper trigger
-- ----------------------------------------------------------------------------
create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ----------------------------------------------------------------------------
-- patients
-- ----------------------------------------------------------------------------
create table patients (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  phone_e164 text not null unique,
  language text not null default 'es' check (language in ('en', 'es')),
  date_of_birth date,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_patients_phone on patients (phone_e164);

create trigger trg_patients_updated_at
  before update on patients
  for each row execute function set_updated_at();

-- ----------------------------------------------------------------------------
-- doctor_schedule — weekly recurring availability template
-- ----------------------------------------------------------------------------
create table doctor_schedule (
  id uuid primary key default gen_random_uuid(),
  doctor_id text not null default 'default-doctor',
  weekday smallint not null check (weekday between 0 and 6), -- 0 = Sunday
  start_time time not null,
  end_time time not null,
  break_start_time time,
  break_end_time time,
  is_active boolean not null default true,
  unique (doctor_id, weekday)
);

-- ----------------------------------------------------------------------------
-- clinic_settings — single row, drives the "clinic information" FAQ flow
-- ----------------------------------------------------------------------------
create table clinic_settings (
  id uuid primary key default gen_random_uuid(),
  clinic_name text not null default 'VidaClinic',
  doctor_name text not null default 'Dr. Gamaliel Rodríguez',
  doctor_specialty text not null default 'Pediatría General',
  doctor_license text not null default '',
  address text not null default '',
  google_maps_url text not null default '',
  latitude double precision,
  longitude double precision,
  phone_e164 text not null default '',
  hours_summary_en text not null default 'Monday-Friday, 9:00 AM - 6:00 PM (lunch break 1:00 PM - 2:00 PM)',
  hours_summary_es text not null default 'Lunes a viernes, 9:00 AM - 6:00 PM (descanso de 1:00 PM a 2:00 PM)',
  parking_info_en text not null default '',
  parking_info_es text not null default '',
  fees_info_en text not null default '',
  fees_info_es text not null default '',
  insurance_info_en text not null default '',
  insurance_info_es text not null default '',
  appointment_duration_minutes integer not null default 30,
  updated_at timestamptz not null default now()
);

create trigger trg_clinic_settings_updated_at
  before update on clinic_settings
  for each row execute function set_updated_at();

-- ----------------------------------------------------------------------------
-- appointments
-- ----------------------------------------------------------------------------
create table appointments (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references patients (id) on delete cascade,
  doctor_id text not null default 'default-doctor',
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  reason text not null default '',
  status text not null default 'scheduled'
    check (status in ('scheduled', 'confirmed', 'cancelled', 'completed', 'no_show')),
  source text not null default 'whatsapp' check (source in ('whatsapp', 'voice', 'dashboard')),
  reminder_24h_sent_at timestamptz,
  reminder_2h_sent_at timestamptz,
  cancelled_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint chk_appointment_time_order check (ends_at > starts_at)
);

create index idx_appointments_patient on appointments (patient_id);
create index idx_appointments_starts_at on appointments (starts_at);
create index idx_appointments_status on appointments (status);
-- Prevent double-booking the same doctor for overlapping active appointments.
create unique index uniq_appointments_doctor_slot
  on appointments (doctor_id, starts_at)
  where status in ('scheduled', 'confirmed');

create trigger trg_appointments_updated_at
  before update on appointments
  for each row execute function set_updated_at();

-- ----------------------------------------------------------------------------
-- whatsapp_conversations — one row per patient phone number thread
-- ----------------------------------------------------------------------------
create table whatsapp_conversations (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid references patients (id) on delete set null,
  wa_phone_e164 text not null unique,
  wa_profile_name text,
  language text check (language in ('en', 'es')),
  status text not null default 'active' check (status in ('active', 'closed', 'escalated')),
  last_message_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index idx_wa_conversations_phone on whatsapp_conversations (wa_phone_e164);
create index idx_wa_conversations_status on whatsapp_conversations (status);

-- ----------------------------------------------------------------------------
-- whatsapp_messages — full message log (inbound + outbound), audit trail
-- ----------------------------------------------------------------------------
create table whatsapp_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references whatsapp_conversations (id) on delete cascade,
  wa_message_id text,
  direction text not null check (direction in ('inbound', 'outbound')),
  message_type text not null default 'text'
    check (message_type in ('text', 'template', 'interactive', 'location', 'image', 'audio', 'document', 'system')),
  body text,
  template_name text,
  payload jsonb,
  status text check (status in ('sent', 'delivered', 'read', 'failed', 'received')),
  created_at timestamptz not null default now()
);

create index idx_wa_messages_conversation on whatsapp_messages (conversation_id, created_at);
create unique index uniq_wa_messages_wa_id on whatsapp_messages (wa_message_id) where wa_message_id is not null;

-- ----------------------------------------------------------------------------
-- conversation_states — durable mirror of the Redis state machine
-- (Redis is the source of truth for live routing; this table exists for
-- audit/history and to recover a conversation if its Redis key is evicted
-- before the 24h TTL for reasons other than normal expiry.)
-- ----------------------------------------------------------------------------
create table conversation_states (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references whatsapp_conversations (id) on delete cascade,
  state text not null,
  context jsonb not null default '{}'::jsonb,
  expires_at timestamptz not null,
  updated_at timestamptz not null default now()
);

create unique index uniq_conversation_states_conversation on conversation_states (conversation_id);

-- ----------------------------------------------------------------------------
-- voice_calls / call_transcripts — Vapi voice channel
-- ----------------------------------------------------------------------------
create table voice_calls (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid references patients (id) on delete set null,
  vapi_call_id text not null unique,
  phone_e164 text not null,
  direction text not null check (direction in ('inbound', 'outbound')),
  status text not null default 'in_progress'
    check (status in ('in_progress', 'completed', 'failed', 'no_answer')),
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  duration_seconds integer,
  recording_url text,
  summary text,
  created_at timestamptz not null default now()
);

create index idx_voice_calls_phone on voice_calls (phone_e164);

create table call_transcripts (
  id uuid primary key default gen_random_uuid(),
  voice_call_id uuid not null references voice_calls (id) on delete cascade,
  role text not null check (role in ('assistant', 'user', 'system')),
  content text not null,
  spoken_at timestamptz not null default now()
);

create index idx_call_transcripts_call on call_transcripts (voice_call_id, spoken_at);

-- ----------------------------------------------------------------------------
-- audit_logs — append-only, never updated/deleted by the app
-- ----------------------------------------------------------------------------
create table audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_type text not null check (actor_type in ('patient', 'system', 'staff', 'ai')),
  actor_id text,
  action text not null,
  entity_type text not null,
  entity_id text,
  metadata jsonb,
  created_at timestamptz not null default now()
);

create index idx_audit_logs_entity on audit_logs (entity_type, entity_id);
create index idx_audit_logs_created_at on audit_logs (created_at);

-- ============================================================================
-- Row Level Security
-- All tables are only ever written by the backend using the Supabase
-- service_role key (which bypasses RLS). RLS below only governs access via
-- the anon/authenticated keys, i.e. staff signed into the dashboard through
-- Supabase Auth. Adjust the `is_staff()` check to your real staff-role model.
-- ============================================================================

create or replace function is_staff()
returns boolean
language sql
stable
as $$
  select auth.role() = 'authenticated';
$$;

alter table patients enable row level security;
alter table appointments enable row level security;
alter table doctor_schedule enable row level security;
alter table clinic_settings enable row level security;
alter table whatsapp_conversations enable row level security;
alter table whatsapp_messages enable row level security;
alter table conversation_states enable row level security;
alter table voice_calls enable row level security;
alter table call_transcripts enable row level security;
alter table audit_logs enable row level security;

create policy staff_read_patients on patients for select using (is_staff());
create policy staff_read_appointments on appointments for select using (is_staff());
create policy staff_read_doctor_schedule on doctor_schedule for select using (is_staff());
create policy staff_read_clinic_settings on clinic_settings for select using (is_staff());
create policy staff_write_clinic_settings on clinic_settings for update using (is_staff());
create policy staff_read_wa_conversations on whatsapp_conversations for select using (is_staff());
create policy staff_read_wa_messages on whatsapp_messages for select using (is_staff());
create policy staff_read_conversation_states on conversation_states for select using (is_staff());
create policy staff_read_voice_calls on voice_calls for select using (is_staff());
create policy staff_read_call_transcripts on call_transcripts for select using (is_staff());
create policy staff_read_audit_logs on audit_logs for select using (is_staff());
