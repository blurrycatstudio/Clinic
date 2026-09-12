-- Public bucket used as the storage backend for prescription PDFs and patient
-- documents whenever Cloudflare R2 isn't configured (see apps/api/src/services/storageService.ts).
insert into storage.buckets (id, name, public)
values ('clinic-files', 'clinic-files', true)
on conflict (id) do nothing;

-- Service-role uploads (this app's API always uses the service-role key) bypass RLS entirely,
-- but the bucket needs a public-read policy so the URLs handed to WhatsApp/patients are fetchable.
create policy "clinic-files public read"
  on storage.objects for select
  using (bucket_id = 'clinic-files');
