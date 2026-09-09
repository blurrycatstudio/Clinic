-- ----------------------------------------------------------------------------
-- Consultations — the visit record a doctor completes from the dashboard's
-- "Start Consultation" flow (chief complaint, diagnosis, vitals, notes).
-- `sequence_number` backs a future human-facing CN-#### code the same way
-- prescriptions/invoices already do, in case that's needed later.
-- ----------------------------------------------------------------------------

create table consultations (
  id uuid primary key default gen_random_uuid(),
  sequence_number bigint generated always as identity,
  patient_id uuid not null references patients (id) on delete cascade,
  appointment_id uuid references appointments (id) on delete set null,
  chief_complaint text not null default '',
  diagnosis text not null default '',
  notes text not null default '',
  weight_kg numeric(5, 2),
  height_cm numeric(5, 2),
  temperature_c numeric(4, 1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_consultations_patient on consultations (patient_id);

create trigger trg_consultations_updated_at
  before update on consultations
  for each row execute function set_updated_at();

alter table consultations enable row level security;

create policy staff_read_consultations on consultations for select using (is_staff());
