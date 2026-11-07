import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { WORDS_TEXT } from '../data/words'
import { GlideDecoder } from '../lib/decoder'
import { evaluate, runHarness } from '../lib/harness'
import { makeRng } from '../lib/synth'
import { buildVocab } from '../lib/vocab'

describe('harness', () => {
  it('prints a table and accuracy falls with noise', () => {
    const out = runHarness(['--words', '40', '--trials', '1', '--levels', '0:0,0.5:0.5', '--no-user-vocab'])
    assert.match(out, /top-1/)
    assert.match(out, /top-3/)
    const rows = out
      .split('\n')
      .filter((l) => /^\s*(0\.00|0\.50)\s/.test(l))
      .map((l) => l.trim().split(/\s+/))
    assert.equal(rows.length, 2)
    const clean = parseFloat(rows[0][3])
    const noisy = parseFloat(rows[1][3])
    assert.ok(clean >= 90, `clean top-1 was ${clean}`)
    assert.ok(noisy < clean)
  })

  it('is deterministic for a seed', () => {
    const vocab = buildVocab(WORDS_TEXT, null)
    const d = new GlideDecoder(vocab)
    const words = vocab.entries.filter((e) => e.letters.length >= 4).slice(0, 20)
    const a = evaluate(d, words, 0.2, 0.1, 1, makeRng(5))
    const b = evaluate(d, words, 0.2, 0.1, 1, makeRng(5))
    assert.deepEqual(a, b)
  })

  it('rejects non-numeric options and shows help', () => {
    assert.throws(() => runHarness(['--words', 'lots']), /--words must be a number/)
    assert.match(runHarness(['--help']), /Usage: harness/)
  })
})
