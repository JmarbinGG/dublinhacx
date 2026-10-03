import { request } from './client'

/**
 * POST /api/analyze (signed in, multipart field `image`). The server
 * verifies it's a real image, strips EXIF/GPS, shrinks it to 800px and
 * recompresses it, then returns AI-suggested fields plus the stored size.
 * Which model runs is swappable server-side via AI_BACKEND.
 */
export type AnalyzeResult = {
  title: string
  category: string
  description: string
  tags: string
  quantity: string
  confidence: number
  /** API-relative, e.g. "/uploads/abc.jpg" - see resolveImageUrl. */
  image_url: string
  image_size_kb: number
}

export function analyzeImage(file: File, token: string, signal?: AbortSignal): Promise<AnalyzeResult> {
  const form = new FormData()
  form.append('image', file)
  return request<AnalyzeResult>('/api/analyze', { method: 'POST', form, token, signal })
}
