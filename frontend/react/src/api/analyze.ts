import { API_BASE_URL, postForm } from './client'

/**
 * Backend route (see backend/main.py + backend/ai/factory.py):
 *
 *   POST /api/analyze   multipart, field name `image` -> AI-suggested fields
 *
 * Which model actually runs is swappable server-side via AI_BACKEND (mock /
 * clip / nvidia) - the response shape is the same either way.
 */
const ANALYZE_PATH = '/api/analyze'

export type AnalyzeResult = {
  name: string
  category: string
  tags: string
  quantity: string
  confidence: number
  /** Relative to the API, e.g. "/uploads/abc.jpg" - see resolveImageUrl. */
  image_url: string
}

/** Upload a photo and get back a suggested name/category/tags/quantity. */
export function analyzeImage(file: File, signal?: AbortSignal): Promise<AnalyzeResult> {
  const formData = new FormData()
  formData.append('image', file)
  return postForm<AnalyzeResult>(ANALYZE_PATH, formData, signal)
}

/** analyzeImage's image_url is API-relative; make it usable in <img src>. */
export function resolveImageUrl(path: string): string {
  return /^https?:\/\//.test(path) ? path : `${API_BASE_URL}${path}`
}
