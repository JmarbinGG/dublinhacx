import { readLang, saveLang, type LangId } from '../lib/lang'
import en, { type Key } from './en'

/**
 * Interface text in English, Spanish or Hindi (I18N_PLAN.md).
 *
 * English ships in the bundle; es.ts / hi.ts are separate chunks loaded only
 * when chosen (~4-6 KB gzipped, then cached by the service worker). Both
 * are typed Record<Key, string>, so a missing translation fails the build.
 *
 * Listings, bios and AI answers come from the backend in the chosen
 * language too: api/client.ts sends X-Lang with every request.
 *
 * Changing language re-renders the whole app (main.tsx keys the tree on
 * it), so module-level labels can be getters that call t().
 */

export type { Key }
type Dict = Record<Key, string>
type Vars = Record<string, string | number>

let lang: LangId = 'en'
let dict: Dict = en
const listeners = new Set<() => void>()

const loaders: Record<Exclude<LangId, 'en'>, () => Promise<{ default: Dict }>> = {
  es: () => import('./es'),
  hi: () => import('./hi'),
}

export function currentLang(): LangId {
  return lang
}

/** Load a language's strings (if needed) and switch to it. */
export async function setLanguage(id: LangId): Promise<void> {
  const next = id === 'en' ? en : (await loaders[id]()).default
  lang = id
  dict = next
  saveLang(id)
  document.documentElement.lang = id
  listeners.forEach((fn) => fn())
}

/** Before the first render: the saved language, so nothing flashes in English. */
export async function initLanguage(): Promise<void> {
  const saved = readLang()
  if (saved && saved !== 'en') {
    try {
      await setLanguage(saved)
      return
    } catch {
      // Offline on a first visit with no cached strings: English for now.
    }
  }
  document.documentElement.lang = 'en'
}

export function onLanguageChange(fn: () => void): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

/** t('home.title'), t('home.seeAll', { n: 12 }) - {name} placeholders. */
export function t(key: Key, vars?: Vars): string {
  const text = dict[key] ?? en[key] ?? key
  return vars ? text.replace(/\{(\w+)\}/g, (m, name: string) => (name in vars ? String(vars[name]) : m)) : text
}

const plural = new Map<LangId, Intl.PluralRules>()

/** Plural-aware: picks `${key}_one` or `${key}_other` (both must exist). */
export function tn(key: string, n: number, vars?: Vars): string {
  let rules = plural.get(lang)
  if (!rules) plural.set(lang, (rules = new Intl.PluralRules(lang)))
  const form = rules.select(n) === 'one' ? 'one' : 'other'
  return t(`${key}_${form}` as Key, { n: formatNumber(n), ...vars })
}

export function formatNumber(n: number): string {
  return new Intl.NumberFormat(lang === 'hi' ? 'hi-IN' : lang).format(n)
}
