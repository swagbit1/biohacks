import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { WORDS_TEXT } from '../data/words'
import { GlideDecoder, normalise, resample, smooth, dist, pathLength } from '../lib/decoder'
import { Layout, type Pt } from '../lib/layout'
import { makeRng, makeStroke } from '../lib/synth'
import { buildVocab, defaultVocab, lettersOf, Vocab } from '../lib/vocab'

// The bundled list without the personal words, so these tests do not depend on user_vocab.json.
const decoder = new GlideDecoder(buildVocab(WORDS_TEXT, null))

/** Exact ideal stroke in pixels, dense like real pointer input (a bare polyline of 4 points
 * would be mangled by smoothing). */
function px(d: GlideDecoder, letters: string, k = d.config.keySize): Pt[] {
  return resample(d.idealPath(letters), 80).map((p) => ({ x: p.x * k, y: p.y * k }))
}

describe('geometry', () => {
  it('resample returns n equally spaced points with fixed endpoints', () => {
    const out = resample(
      [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 10, y: 10 },
      ],
      21,
    )
    assert.equal(out.length, 21)
    assert.deepEqual(out[0], { x: 0, y: 0 })
    assert.deepEqual(out[20], { x: 10, y: 10 })
    const steps = out.slice(1).map((p, i) => dist(out[i], p))
    assert.ok(Math.max(...steps) - Math.min(...steps) < 1e-6)
    assert.ok(Math.abs(pathLength(out) - 20) < 1e-6)
  })

  it('resample handles degenerate paths', () => {
    assert.deepEqual(resample([{ x: 3, y: 4 }], 5), Array(5).fill({ x: 3, y: 4 }))
    assert.deepEqual(
      resample(
        [
          { x: 3, y: 4 },
          { x: 3, y: 4 },
        ],
        5,
      ),
      Array(5).fill({ x: 3, y: 4 }),
    )
    assert.deepEqual(resample([], 5), [])
  })

  it('smooth keeps endpoints and reduces jitter', () => {
    const rng = makeRng(1)
    const pts = Array.from({ length: 50 }, (_, i) => ({ x: i, y: rng.gauss(1) }))
    const out = smooth(pts, 7)
    assert.deepEqual(out[0], pts[0])
    assert.deepEqual(out[49], pts[49])
    const energy = (ps: Pt[]) => ps.reduce((s, p) => s + p.y * p.y, 0) / ps.length
    assert.ok(energy(out) < energy(pts))
  })

  it('normalise is translation and scale invariant', () => {
    const a = [
      { x: 0, y: 0 },
      { x: 4, y: 0 },
      { x: 4, y: 2 },
    ]
    const b = a.map((p) => ({ x: 100 + 3 * p.x, y: 50 + 3 * p.y }))
    const na = normalise(a)
    const nb = normalise(b)
    na.pts.forEach((p, i) => assert.ok(dist(p, nb.pts[i]) < 1e-9))
    assert.ok(Math.abs(nb.scale - 3 * na.scale) < 1e-9)
    assert.equal(normalise([{ x: 1, y: 1 }]).scale, 0)
  })

  it('layout has 26 keys with a physical stagger', () => {
    const lay = new Layout()
    assert.equal(lay.keys().length, 26)
    assert.deepEqual(lay.centre('q'), { x: 0.5, y: 0.5 })
    assert.equal(lay.centre('a').x, 0.75) // row 2 shifted a quarter key
    assert.equal(lay.centre('z').y, 2.5)
  })

  it('ideal path collapses repeated letters', () => {
    assert.equal(decoder.idealPath('hello').length, 4) // h e l o
    assert.equal(decoder.idealPath('aa').length, 1)
  })
})

describe('decoding', () => {
  for (const word of ['water', 'morning', 'thanks', 'tomorrow', 'family', 'friend']) {
    it(`clean stroke decodes ${word} as top-1`, () => {
      assert.equal(decoder.decode(px(decoder, word))[0].word, word)
    })
  }

  it('an exact stroke for a word that differs from a much commoner one only in its last key stays in the top 3', () => {
    // hello vs help: o and p are neighbours and "help" is far more frequent, so with a
    // frequency prior "help" can rank first. The writer still sees "hello" one tap away.
    const words = decoder.decode(px(decoder, 'hello')).map((c) => c.word)
    assert.ok(words.includes('hello'), words.join(', '))
  })

  it('returns three candidates with ordered, normalised scores', () => {
    const c = decoder.decode(px(decoder, 'water'))
    assert.equal(c.length, 3)
    assert.ok(c[0].score >= c[1].score && c[1].score >= c[2].score)
    const total = c.reduce((s, x) => s + x.score, 0)
    assert.ok(total > 0 && total <= 1 + 1e-9)
  })

  it('tolerates tremor and offset', () => {
    const rng = makeRng(7)
    const words = ['morning', 'family', 'tomorrow', 'students', 'afternoon', 'understand']
    let hits = 0
    for (const w of words) {
      for (let i = 0; i < 5; i++) {
        if (decoder.decode(makeStroke(decoder, w, rng, { jitter: 0.15, offset: 0.15 }))[0].word === w) hits++
      }
    }
    assert.ok(hits / (words.length * 5) >= 0.8, `only ${hits}/${words.length * 5}`)
  })

  it('a bigger, shifted stroke of the right shape still matches', () => {
    const stroke = px(decoder, 'afternoon').map((p) => ({ x: p.x * 1.15 + 5, y: p.y * 1.15 + 12 }))
    assert.equal(decoder.decode(stroke)[0].word, 'afternoon')
  })

  it('decodes a single-key stroke', () => {
    const k = decoder.config.keySize
    const a = decoder.layout.centre('a')
    const c = decoder.decode([
      { x: a.x * k, y: a.y * k },
      { x: a.x * k + 1, y: a.y * k },
    ])
    assert.equal(c[0].word, 'a')
  })

  it('returns nothing for an empty stroke', () => {
    assert.deepEqual(decoder.decode([]), [])
  })

  it('still answers when the stroke is nowhere near any key', () => {
    const far = [
      { x: -900, y: -900 },
      { x: -850, y: -880 },
    ]
    assert.ok(decoder.decode(far).length > 0)
  })

  it('the bundled list is large and keeps the everyday and contraction words', () => {
    const texts = new Set(buildVocab(WORDS_TEXT, null).entries.map((e) => e.text))
    assert.ok(texts.size > 5000, `only ${texts.size} words`)
    for (const w of ['tired', 'thanks', 'water', "don't", "i'm", "let's"]) assert.ok(texts.has(w), w)
  })

  it('keySize override scales pixels', () => {
    assert.equal(decoder.decode(px(decoder, 'water', 80), { keySize: 80 })[0].word, 'water')
  })

  it('a larger tolerance lowers the distance of a noisy stroke', () => {
    const stroke = makeStroke(decoder, 'family', makeRng(3), { jitter: 0.2 })
    const tight = decoder.decode(stroke, { tolerance: 0 })[0].distance
    const loose = decoder.decode(stroke, { tolerance: 0.4 })[0].distance
    assert.ok(loose < tight)
  })

  it('the frequency prior breaks a tie', () => {
    const d = new GlideDecoder(
      new Vocab([
        { text: 'ab', letters: 'ab', logprior: Math.log(0.9), personal: false },
        { text: 'ab2', letters: 'ab', logprior: Math.log(0.1), personal: false },
      ]),
    )
    assert.equal(d.decode(px(d, 'ab'))[0].word, 'ab')
  })
})

describe('vocabulary and personal words', () => {
  it('a personal boost decides between near-identical strokes', () => {
    // "hat" and "hay" differ only in the last key (t and y are neighbours). A stroke that
    // ends exactly between them is a coin toss for the shape; the boost decides.
    const text = ['the', 'hat', 'hay', 'and', 'you'].join('\n')
    const plain = new GlideDecoder(buildVocab(text, null))
    const boosted = new GlideDecoder(buildVocab(text, { boost: 50, words: ['Hay'] }))
    const lay = boosted.layout
    const t = lay.centre('t')
    const y = lay.centre('y')
    const mid = { x: (t.x + y.x) / 2, y: (t.y + y.y) / 2 }
    const k = boosted.config.keySize
    const stroke = resample([lay.centre('h'), lay.centre('a'), mid], 80).map((p) => ({ x: p.x * k, y: p.y * k }))

    assert.equal(plain.decode(stroke)[0].word, 'hat') // higher-ranked in the list
    const top = boosted.decode(stroke)[0]
    assert.equal(top.word, 'Hay') // display text keeps the user's casing
    assert.equal(top.personal, true)
  })

  it('a personal phrase glides as one stroke', () => {
    const d = new GlideDecoder(
      buildVocab(['the', 'and', 'you', 'see', 'soon'].join('\n'), {
        words: [{ text: 'see you soon', boost: 5 }],
      }),
    )
    assert.equal(d.decode(px(d, lettersOf('see you soon')))[0].word, 'see you soon')
  })

  it('missing or malformed user vocab is ignored', () => {
    const base = buildVocab('the\nand', null).size
    assert.equal(buildVocab('the\nand', {}).size, base)
    assert.equal(buildVocab('the\nand', { words: 'nope' } as never).size, base)
    assert.equal(buildVocab('the\nand', { words: [42, null, { boost: 3 }, ''] } as never).size, base)
  })

  it('counts in the word list override the rank prior', () => {
    const v = buildVocab('rare\t1\ncommon\t1000', null)
    const lp = Object.fromEntries(v.entries.map((e) => [e.text, e.logprior]))
    assert.ok(lp.common > lp.rare)
  })

  it('the bundled user_vocab.json loads', () => {
    assert.ok(defaultVocab().entries.some((e) => e.personal))
  })
})
