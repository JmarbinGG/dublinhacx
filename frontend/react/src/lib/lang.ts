/**
 * The user's language preference, chosen after "Get started" (and in the
 * avatar menu). Stored per device.
 *
 * i18n/index.ts loads the chosen language's strings and sets <html lang>.
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
