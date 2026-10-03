/**
 * The user's language preference, chosen after "Get started" (and in the
 * avatar menu). Stored per device.
 *
 * Note: this does NOT set <html lang> yet. The UI is still English-only, and
 * declaring lang="hi" on English text would make screen readers read English
 * with a Hindi voice. Once translations ship (frontend/react/I18N_PLAN.md),
 * the chosen language drives both the strings and <html lang>.
 */
export const LANGS = [
  { id: 'en', native: 'English', english: 'English' },
  { id: 'es', native: 'Español', english: 'Spanish' },
  { id: 'hi', native: 'हिन्दी', english: 'Hindi' },
] as const

export type LangId = (typeof LANGS)[number]['id']

const KEY = 'banyan.lang'

export function readLang(): LangId | null {
  try {
    const value = localStorage.getItem(KEY)
    return LANGS.some((l) => l.id === value) ? (value as LangId) : null
  } catch {
    return null
  }
}

export function saveLang(id: LangId) {
  try {
    localStorage.setItem(KEY, id)
  } catch {
    // Not persisted - they can pick again next time.
  }
}
