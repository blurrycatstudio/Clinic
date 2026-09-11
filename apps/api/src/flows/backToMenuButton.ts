import { t, type Language } from "@clinic/shared"

/** A tappable "back to menu" control, attached to every non-menu prompt so a patient on mobile never has to scroll up or retype "menu" to escape a screen. Handled centrally in conversationEngine (buttonId "menu" resets to the main menu regardless of state). */
export function backToMenuButton(lang: Language): { id: string; title: string } {
  return { id: "menu", title: t(lang, "backToMenuButton") }
}
