-- ============================================================================
-- Update the clinic's real address and a clickable (keyless) Google Maps
-- search link. No lat/long coordinates are set here — the WhatsApp bot falls
-- back to a plain text link when they're null, which needs no Maps API key.
-- ============================================================================

update clinic_settings
set
  address = 'Avenida Díaz Mirón y Calle Cuarta 7443, Zona Centro, 22000 Tijuana, B.C., Mexico',
  google_maps_url = 'https://www.google.com/maps/search/?api=1&query=Avenida%20D%C3%ADaz%20Mir%C3%B3n%20y%20Calle%20Cuarta%207443%2C%20Zona%20Centro%2C%2022000%20Tijuana%2C%20B.C.%2C%20Mexico';
