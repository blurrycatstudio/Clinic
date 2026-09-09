-- ----------------------------------------------------------------------------
-- Lets staff pick, from the dashboard, which options the WhatsApp bot's main
-- menu shows to patients (e.g. hide "Human Support" outside business hours).
-- Keys match packages/shared/src/types/menu.ts MENU_OPTION_KEYS — kept in
-- sync manually since this project doesn't generate DB types.
-- ----------------------------------------------------------------------------

alter table clinic_settings
  add column enabled_menu_options text[] not null default array[
    'book', 'reschedule', 'cancel', 'info', 'human', 'status'
  ];

alter table clinic_settings
  add constraint chk_enabled_menu_options_valid check (
    enabled_menu_options <@ array['book', 'reschedule', 'cancel', 'info', 'human', 'status']
  );
