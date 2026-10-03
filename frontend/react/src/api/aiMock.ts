import type { Listing, SearchResponse } from '../types'
import { request } from './client'

/**
 * Dev-only stand-in for the assistant, used when the backend answers 404
 * (route not built yet). It runs the real keyword search - no model
 * involved. Responses carry `demo: true` so the UI labels them.
 */

async function keyword(q: string, type: string | undefined, signal?: AbortSignal): Promise<Listing[]> {
  const res = await request<SearchResponse>('/api/search', { params: { q, type, limit: 12 }, signal })
  if (res.listings.length > 0 || !q.includes(' ')) return res.listings
  // The keyword search needs every word to match; retry with the longest word.
  const longest = q.split(' ').sort((a, b) => b.length - a.length)[0]
  return (await request<SearchResponse>('/api/search', { params: { q: longest, type, limit: 12 }, signal }))
    .listings
}

const TYPE_CHIPS = [
  { code: 'type:material', label: 'Materials' },
  { code: 'type:equipment', label: 'Equipment & tools' },
  { code: 'type:skill', label: 'Skills & jobs' },
]

let demoType: string | undefined

export async function mockAssistantReply(message: string, community: string | null, signal?: AbortSignal) {
  const lower = message.toLowerCase()
  const chip = TYPE_CHIPS.find((c) => lower === c.code || lower === c.label.toLowerCase())
  if (chip) {
    demoType = chip.code.slice(5)
    return {
      text: `Got it - ${chip.label.toLowerCase()}. What exactly do you need? For example "pump set" or "someone to fix a tractor".`,
      chips: [],
      listing_ids: [],
      demo: true,
    }
  }

  const words = lower.replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter((w) => w.length > 2)
  if (words.length === 0 || lower === 'restart' || /^(hi|hello|hey|help|search for something else)\b/.test(lower)) {
    demoType = undefined
    return {
      text: "Hi! I can help you find things to borrow, swap or get help with. What are you looking for?",
      chips: TYPE_CHIPS,
      listing_ids: [],
      demo: true,
    }
  }

  const listings = await keyword(words.join(' '), demoType, signal)
  const sorted = [
    ...listings.filter((l) => l.owner.community === community),
    ...listings.filter((l) => l.owner.community !== community),
  ].slice(0, 4)

  if (sorted.length === 0) {
    return {
      text: "I couldn't find a match for that. Want to try a different word, or pick a type?",
      chips: TYPE_CHIPS,
      listing_ids: [],
      demo: true,
    }
  }
  return {
    text: `Here ${sorted.length === 1 ? 'is 1 listing' : `are ${sorted.length} listings`} that look right${
      community ? ', nearest to ' + community + ' first' : ''
    }. Open one to see how to contact the owner.`,
    chips: [{ code: 'restart', label: 'Search for something else' }],
    listing_ids: sorted.map((l) => l.id),
    demo: true,
  }
}
