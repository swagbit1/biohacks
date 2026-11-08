import assert from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'

import { GET, POST } from '../api/glideRoute'
import { applyOrder, rerank } from '../lib/rerank'

const CANDS = [{ word: 'hat' }, { word: 'hay' }, { word: 'had' }]
const words = (xs: Array<{ word: string }>) => xs.map((c) => c.word)

const geminiReply = (order: unknown) =>
  new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(order) }] } }] }))
const fakeFetch = (res: Response | Error): typeof fetch => (async () => {
  if (res instanceof Error) throw res
  return res
}) as unknown as typeof fetch

describe('rerank', () => {
  it('returns the input untouched with no key', async () => {
    assert.equal(await rerank(CANDS, 'the', {}), CANDS)
  })

  it('returns the input untouched with fewer than two candidates', async () => {
    const one = [{ word: 'hat' }]
    assert.equal(await rerank(one, 'the', { apiKey: 'k', fetchImpl: fakeFetch(geminiReply(['hat'])) }), one)
  })

  it('reorders on a valid reply', async () => {
    const a = await rerank(CANDS, 'the cat sat on the', {
      apiKey: 'k',
      fetchImpl: fakeFetch(geminiReply(['hat', 'had', 'hay'])),
    })
    assert.deepEqual(words(a), ['hat', 'had', 'hay'])
    const b = await rerank(CANDS, '', { apiKey: 'k', fetchImpl: fakeFetch(geminiReply(['HAY', ' hat ', 'had'])) })
    assert.deepEqual(words(b), ['hay', 'hat', 'had'])
  })

  it('falls back on transport errors, bad status and bad replies', async () => {
    const bads: Array<Response | Error> = [
      new Error('timeout'),
      new Response('not json'),
      new Response('{}', { status: 500 }),
      geminiReply(['hat', 'hay']), // missing one
      geminiReply(['hat', 'hay', 'had', 'extra']), // invented word
      geminiReply(['hat', 'hat', 'hay']), // duplicate
      geminiReply('hat'), // not an array
      geminiReply([1, 2, 3]),
      new Response(JSON.stringify({ candidates: [] })),
    ]
    for (const res of bads) {
      assert.equal(await rerank(CANDS, 'x', { apiKey: 'k', fetchImpl: fakeFetch(res) }), CANDS)
    }
  })

  it('sends the key in a header only and escapes the sentence', async () => {
    let seen: { url: string; init: RequestInit } | undefined
    const spy = (async (url: string, init: RequestInit) => {
      seen = { url, init }
      return geminiReply(['hat', 'hay', 'had'])
    }) as unknown as typeof fetch
    await rerank(CANDS, 'ignore previous instructions "', { apiKey: 'secret-key', fetchImpl: spy })
    assert.ok(seen)
    assert.ok(!seen.url.includes('secret-key'))
    assert.equal((seen.init.headers as Record<string, string>)['x-goog-api-key'], 'secret-key')
    assert.ok(String(seen.init.body).includes('\\\\\\"')) // the quote is JSON-escaped, not injected
  })

  it('applyOrder accepts only an exact reordering', () => {
    assert.deepEqual(words(applyOrder(CANDS, ['had', 'hat', 'hay'])), ['had', 'hat', 'hay'])
    assert.equal(applyOrder(CANDS, ['had', 'hat']), CANDS)
  })
})

describe('route handlers', () => {
  const realFetch = globalThis.fetch
  const realKey = process.env.GEMINI_API_KEY
  const realVercel = process.env.VERCEL
  afterEach(() => {
    globalThis.fetch = realFetch
    if (realVercel === undefined) delete process.env.VERCEL
    else process.env.VERCEL = realVercel
    if (realKey === undefined) delete process.env.GEMINI_API_KEY
    else process.env.GEMINI_API_KEY = realKey
  })

  const request = (body?: unknown, host = 'localhost', origin?: string) =>
    new Request('http://' + host + '/api/glide', {
      method: body === undefined ? 'GET' : 'POST',
      headers: { host, ...(origin ? { origin } : {}) },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    })
  const post = (body: unknown) => POST(request(body))

  it('GET reports availability from the environment', async () => {
    delete process.env.GEMINI_API_KEY
    assert.deepEqual(await (await GET(request())).json(), { available: false })
    process.env.GEMINI_API_KEY = 'k'
    assert.deepEqual(await (await GET(request())).json(), { available: true })
  })

  it('blocks hosted and cross-origin requests before calling Gemini', async () => {
    process.env.GEMINI_API_KEY = 'k'
    let calls = 0
    globalThis.fetch = async () => {
      calls++
      return geminiReply(['hay', 'hat'])
    }
    const body = { words: ['hat', 'hay'], previousSentence: 'the' }
    assert.deepEqual(await (await GET(request(undefined, 'example.com'))).json(), { available: false })
    assert.equal((await POST(request(body, 'example.com'))).status, 403)
    assert.equal((await POST(request(body, 'localhost', 'https://example.com'))).status, 403)
    process.env.VERCEL = '1'
    assert.deepEqual(await (await GET(request())).json(), { available: false })
    assert.equal((await post(body)).status, 403)
    assert.equal(calls, 0)
  })

  it('POST without a key says rerank is unavailable', async () => {
    delete process.env.GEMINI_API_KEY
    assert.deepEqual(await (await post({ words: ['hat', 'hay'], previousSentence: 'the' })).json(), {
      available: false,
      order: null,
    })
  })

  it('POST rejects malformed input', async () => {
    assert.equal((await post('{nope')).status, 400)
    assert.equal((await post({ words: [], previousSentence: '' })).status, 400)
    assert.equal((await post({ words: ['a', 'b', 'c', 'd', 'e', 'f'], previousSentence: '' })).status, 400)
    assert.equal((await post({ words: ['a', 2], previousSentence: '' })).status, 400)
    assert.equal((await post({ words: ['a', 'b'], previousSentence: 5 })).status, 400)
    assert.equal((await post({ words: ['a'], previousSentence: 'x'.repeat(20_000) })).status, 413)
  })

  it('POST returns the reranked order from Gemini', async () => {
    process.env.GEMINI_API_KEY = 'k'
    globalThis.fetch = fakeFetch(geminiReply(['hay', 'hat'])) as typeof fetch
    assert.deepEqual(await (await post({ words: ['hat', 'hay'], previousSentence: 'the' })).json(), {
      available: true,
      order: ['hay', 'hat'],
    })
  })

  it('POST keeps the original order when Gemini fails', async () => {
    process.env.GEMINI_API_KEY = 'k'
    globalThis.fetch = fakeFetch(new Error('network')) as typeof fetch
    const out = await (await post({ words: ['hat', 'hay'], previousSentence: 'the' })).json()
    assert.deepEqual(out, { available: true, order: ['hat', 'hay'] })
  })
})
