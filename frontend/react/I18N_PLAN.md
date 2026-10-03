# Translations on a 1 GB/month connection

The goal is to show Banyan in English, Spanish or Hindi without adding real
weight to anyone's data plan. Each phone downloads only its own language,
once, and every visit after that is free.

## 1. Interface strings: one small file per language, loaded on demand

- **Ship English in the bundle.** It's the source language and the fallback,
  so it's always there.
- **One file per other language.** `src/i18n/es.json` and
  `src/i18n/hi.json` are loaded with a dynamic `import()` only when that
  language is chosen. Vite turns each into its own small hashed file.
  - The app has roughly 300 strings, about 3–5 KB gzipped per language.
  - Hindi is a bit larger: each Devanagari character takes 3 bytes in UTF-8
    instead of 1, but it compresses well.
- **The service worker caches it** like any other `/assets/*` file. It's
  downloaded once and reused offline.
- **No i18n library.** Use a ~30-line `t(key, vars)` helper backed by a
  plain object, plus the browser's built-in `Intl.PluralRules`,
  `Intl.NumberFormat`, `Intl.DateTimeFormat` and
  `Intl.RelativeTimeFormat("hi")`. Libraries like i18next or FormatJS add
  10–40 KB for features we don't need.
- **Keys are compile-time checked.** Type `es.json` and `hi.json` as
  `Record<keyof typeof en, string>`, so a missing translation fails the
  build instead of showing a raw key.
- **Fonts:** none to download. Devanagari uses the phone's system font
  (Noto on Android, Kohinoor on iOS, Nirmala on Windows).
- **When the language is chosen:**
  - set `<html lang>` to it (not before; see below)
  - load its strings file
  - re-render
  - keep the choice in `localStorage` (already done: `banyan.lang`)
- **Why `<html lang>` isn't set yet:** the interface is still English.
  Marking English text as `lang="hi"` would make screen readers read it
  with a Hindi voice.

## 2. Listings people write: translate on request, never automatically

- **Show listings as written** by default. Most neighbours share a language,
  and translating every card would multiply the data cost.
- **Offer a "Translate" link** on the listing page only, never on cards.
  - It calls a backend endpoint, for example
    `GET /api/listings/{id}/translate?to=hi`.
  - The backend translates with the model it already has (Qwen3-4B on
    Featherless).
  - It returns only `{title, description}`, a few hundred bytes.
- **Cache on both ends.** The backend stores each translation per listing
  and language, so it's paid for once. The phone keeps it in the existing
  offline cache.
- **Search already handles mixed languages.** The smart search's model can
  turn "मुझे पंप चाहिए" into the terms `pump`, so search needs no separate
  translation step.

## 3. What it costs

| What | When | Size |
|---|---|---|
| English strings | in the app bundle | already included |
| Spanish or Hindi strings | once, on choosing the language | ~3–5 KB gzipped, then cached |
| Devanagari font | never | 0 (system font) |
| One listing translation | only when "Translate" is tapped | ~0.3–0.6 KB, cached |

That's a one-off cost of about 5 KB per language, compared with the current
47 KB first load.

## 4. Order of work

1. Move the existing English strings into `src/i18n/en.ts` behind `t()`.
   No visible change.
2. Add `es.json` and `hi.json`. A native speaker reviews them, the same
   check the landing headline needs.
3. Wire up the language choice (landing sheet and avatar menu), and set
   `<html lang>`.
4. Backend: a per-listing translate endpoint with caching, plus a
   "Translate" link on the listing page.
