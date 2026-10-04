/** Input limits shared by search and the AI features. Kept out of api/ai.ts
 * so the search box doesn't pull the AI code into the first load. */

export const AI_TEXT_LIMIT = 500
export const QUERY_LIMIT = 200

/** Trim, collapse whitespace, cap length. The backend re-checks all of this. */
export function cleanText(text: string, max: number): string {
  return text.replace(/\s+/g, ' ').trim().slice(0, max)
}

/** A search query: trimmed, whitespace collapsed, at most 200 characters.
 * No word cap: "things I can use to cut down a tree" needs every word for the
 * model to understand it. The backend caps keyword matching itself. */
export function cleanQuery(text: string): string {
  return cleanText(text, QUERY_LIMIT)
}

/** Never send contact details or coordinates to the AI. */
export function redactPersonal(text: string): { text: string; redacted: boolean } {
  const redactedText = text
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, '[email removed]')
    .replace(/\+?\d[\d\s-]{7,}\d/g, '[number removed]')
    .replace(/-?\d{1,3}\.\d{3,}\s*,\s*-?\d{1,3}\.\d{3,}/g, '[location removed]')
  return { text: redactedText, redacted: redactedText !== text }
}
