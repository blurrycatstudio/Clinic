-- ----------------------------------------------------------------------------
-- Subset of clinic_settings.enabled_menu_options (max 3, WhatsApp's reply-button
-- cap) shown to patients as always-visible quick-action buttons ahead of the
-- full tappable menu list, so the most common action doesn't require a tap
-- to even see. Keys match packages/shared/src/types/menu.ts MENU_OPTION_KEYS.
-- ----------------------------------------------------------------------------

alter table clinic_settings
  add column featured_menu_options text[] not null default array['book'];

alter table clinic_settings
  add constraint chk_featured_menu_options_valid check (
    featured_menu_options <@ array['book', 'reschedule', 'cancel', 'info', 'human', 'status']
    and coalesce(array_length(featured_menu_options, 1), 0) <= 3
  );
