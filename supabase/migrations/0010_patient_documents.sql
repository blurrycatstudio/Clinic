-- Patient-uploaded documents (Documents tab on the patient card). Previously
-- these lived only in React state and vanished on refresh; this persists them.
create table patient_documents (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references patients (id) on delete cascade,
  name text not null,
  mime_type text not null,
  size_bytes integer not null,
  url text not null,
  created_at timestamptz not null default now()
);

create index idx_patient_documents_patient on patient_documents (patient_id);

alter table patient_documents enable row level security;

create policy staff_read_patient_documents on patient_documents for select
  using (
    is_staff() and exists (
      select 1 from patients p
      where p.id = patient_documents.patient_id
        and p.clinic_id = current_staff_clinic_id()
    )
  );
