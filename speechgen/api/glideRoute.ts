// Next.js route handlers for the optional Gemini rerank. This file is not a route by
// itself (routes live under app/); re-export it from a two-line route file:
//
//   // app/api/glide/route.ts
//   export { GET, POST } from '../../../speechgen/api/glideRoute'
//
// GET  -> { available: boolean }              is a GEMINI_API_KEY configured?
// POST -> { available, order: string[]|null } body { words: string[], previousSentence }
//
// The key stays on the server (process.env.GEMINI_API_KEY, set in the root .env.local).
// Note: this endpoint is unauthenticated. Anyone who can reach it can spend your Gemini
// quota, so put rate limiting or auth in front of it if the app is ever public.

import { rerank } from '../lib/rerank'

const MAX_BODY_CHARS = 16_384
const MAX_WORDS = 5
const MAX_WORD_CHARS = 64
const MAX_SENTENCE_CHARS = 2000

const bad = (message: string, status = 400) => Response.json({ error: message }, { status })

export async function GET(): Promise<Response> {
  return Response.json({ available: Boolean(process.env.GEMINI_API_KEY) })
}

export async function POST(req: Request): Promise<Response> {
  let body: unknown
  try {
    const text = await req.text()
    if (text.length > MAX_BODY_CHARS) return bad('body too large', 413)
    body = JSON.parse(text)
  } catch {
    return bad('invalid JSON')
  }

  const { words, previousSentence } = (body ?? {}) as { words?: unknown; previousSentence?: unknown }
  if (
    !Array.isArray(words) ||
    words.length < 1 ||
    words.length > MAX_WORDS ||
    !words.every((w) => typeof w === 'string' && w.length > 0 && w.length <= MAX_WORD_CHARS)
  ) {
    return bad(`words must be 1-${MAX_WORDS} non-empty strings`)
  }
  if (typeof previousSentence !== 'string' || previousSentence.length > MAX_SENTENCE_CHARS) {
    return bad('previousSentence must be a string')
  }

  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) return Response.json({ available: false, order: null })

  const ranked = await rerank(
    (words as string[]).map((word) => ({ word })),
    previousSentence,
    { apiKey, model: process.env.GEMINI_MODEL || undefined },
  )
  return Response.json({ available: true, order: ranked.map((c) => c.word) })
}
