/**
 * The WhatsApp main menu options a clinic can turn on/off from the dashboard.
 * Order here is the canonical display order — `clinic_settings.enabled_menu_options`
 * stores a subset of these keys, and the bot numbers/lists only the enabled ones.
 */
export const MENU_OPTION_KEYS = ["book", "reschedule", "cancel", "info", "human", "status"] as const

export type MenuOptionKey = (typeof MENU_OPTION_KEYS)[number]
