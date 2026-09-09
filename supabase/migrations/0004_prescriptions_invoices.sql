-- ----------------------------------------------------------------------------
-- Prescriptions and invoices — previously frontend-only mock pages, now
-- persisted so staff can generate a real PDF and send it to the patient's
-- WhatsApp. `sequence_number` backs the human-facing RX-#### / INV-#### code
-- shown in the dashboard (computed in the application layer from it).
-- ----------------------------------------------------------------------------

create table prescriptions (
  id uuid primary key default gen_random_uuid(),
  sequence_number bigint generated always as identity,
  patient_id uuid not null references patients (id) on delete cascade,
  appointment_id uuid references appointments (id) on delete set null,
  diagnosis text not null default '',
  notes text not null default '',
  status text not null default 'active' check (status in ('active', 'completed')),
  pdf_url text,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table prescription_items (
  id uuid primary key default gen_random_uuid(),
  prescription_id uuid not null references prescriptions (id) on delete cascade,
  name text not null,
  dose text not null default '',
  frequency text not null default '',
  duration text not null default '',
  route text not null default '',
  sort_order integer not null default 0
);

create index idx_prescription_items_prescription on prescription_items (prescription_id, sort_order);
create index idx_prescriptions_patient on prescriptions (patient_id);

create table invoices (
  id uuid primary key default gen_random_uuid(),
  sequence_number bigint generated always as identity,
  patient_id uuid not null references patients (id) on delete cascade,
  appointment_id uuid references appointments (id) on delete set null,
  issue_date date not null default current_date,
  due_date date,
  amount_total numeric(10, 2) not null default 0,
  status text not null default 'pending' check (status in ('paid', 'pending', 'overdue')),
  payment_method text,
  pdf_url text,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table invoice_items (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references invoices (id) on delete cascade,
  description text not null,
  quantity integer not null default 1,
  unit_price numeric(10, 2) not null default 0,
  sort_order integer not null default 0
);

create index idx_invoice_items_invoice on invoice_items (invoice_id, sort_order);
create index idx_invoices_patient on invoices (patient_id);

alter table prescriptions enable row level security;
alter table prescription_items enable row level security;
alter table invoices enable row level security;
alter table invoice_items enable row level security;

create policy staff_read_prescriptions on prescriptions for select using (is_staff());
create policy staff_read_prescription_items on prescription_items for select using (is_staff());
create policy staff_read_invoices on invoices for select using (is_staff());
create policy staff_read_invoice_items on invoice_items for select using (is_staff());
