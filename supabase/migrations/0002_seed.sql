-- ============================================================================
-- Seed data: doctor's weekly schedule and the single clinic_settings row.
-- Safe to re-run (idempotent upserts).
-- ============================================================================

-- Mon-Fri, 09:00-18:00, lunch break 13:00-14:00. Sat/Sun inactive.
insert into doctor_schedule (doctor_id, weekday, start_time, end_time, break_start_time, break_end_time, is_active)
values
  ('default-doctor', 0, '09:00', '18:00', '13:00', '14:00', false), -- Sunday
  ('default-doctor', 1, '09:00', '18:00', '13:00', '14:00', true),  -- Monday
  ('default-doctor', 2, '09:00', '18:00', '13:00', '14:00', true),  -- Tuesday
  ('default-doctor', 3, '09:00', '18:00', '13:00', '14:00', true),  -- Wednesday
  ('default-doctor', 4, '09:00', '18:00', '13:00', '14:00', true),  -- Thursday
  ('default-doctor', 5, '09:00', '18:00', '13:00', '14:00', true),  -- Friday
  ('default-doctor', 6, '09:00', '18:00', '13:00', '14:00', false)  -- Saturday
on conflict (doctor_id, weekday) do update
  set start_time = excluded.start_time,
      end_time = excluded.end_time,
      break_start_time = excluded.break_start_time,
      break_end_time = excluded.break_end_time,
      is_active = excluded.is_active;

insert into clinic_settings (
  clinic_name, doctor_name, doctor_specialty, doctor_license,
  address, google_maps_url, phone_e164,
  hours_summary_en, hours_summary_es,
  parking_info_en, parking_info_es,
  fees_info_en, fees_info_es,
  insurance_info_en, insurance_info_es,
  appointment_duration_minutes
)
select
  'VidaClinic',
  'Dr. Gamaliel Rodríguez',
  'Pediatría General',
  '8452193-B',
  'Av. Revolución 1234, Zona Centro, Tijuana, B.C., México',
  'https://maps.google.com/?q=VidaClinic+Tijuana',
  '+526641234567',
  'Monday-Friday, 9:00 AM - 6:00 PM (lunch break 1:00 PM - 2:00 PM). Closed Saturday and Sunday.',
  'Lunes a viernes, 9:00 AM a 6:00 PM (descanso de 1:00 PM a 2:00 PM). Cerrado sábado y domingo.',
  'Free parking available in front of the clinic.',
  'Estacionamiento gratuito frente a la clínica.',
  'Consultation fee: $700 MXN. Vaccination and lab fees vary — ask our team for details.',
  'Consulta general: $700 MXN. Vacunas y laboratorio tienen costo aparte — pregunta a nuestro equipo.',
  'We accept most major private insurance plans. Please bring your policy details to your visit.',
  'Aceptamos la mayoría de los seguros privados. Trae los datos de tu póliza a tu cita.',
  30
where not exists (select 1 from clinic_settings);
