/** Input limits shared by search and the AI features. Kept out of api/ai.ts
 * so the search box doesn't pull the AI code into the first load. */

export const AI_TEXT_LIMIT = 500
export const QUERY_LIMIT = 200
export const QUERY_WORDS = 8
export const REFINE_LIMIT = 40

/** Trim, collapse whitespace, cap length. The backend re-checks all of this. */
export function cleanText(text: string, max: number): string {
  return text.replace(/\s+/g, ' ').trim().slice(0, max)
}

/** A search query: trimmed, whitespace collapsed, at most 200 characters
 * and 8 words. The backend re-checks both. */
export function cleanQuery(text: string): string {
  return cleanText(text, QUERY_LIMIT).split(' ').slice(0, QUERY_WORDS).join(' ')
}

/** Never send contact details or coordinates to the AI. */
export function redactPersonal(text: string): { text: string; redacted: boolean } {
  const redactedText = text
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, '[email removed]')
    .replace(/\+?\d[\d\s-]{7,}\d/g, '[number removed]')
    .replace(/-?\d{1,3}\.\d{3,}\s*,\s*-?\d{1,3}\.\d{3,}/g, '[location removed]')
  return { text: redactedText, redacted: redactedText !== text }
}
