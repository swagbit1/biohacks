// Evidence harness: top-1 / top-3 accuracy of the glide decoder on synthetic strokes.
// Node-only (uses node:util), not exported from lib/index.ts so it never reaches the browser.
//
//   npx tsc -p speechgen/tsconfig.json
//   node speechgen/.build/scripts/harness.js
//   node speechgen/.build/scripts/harness.js --words 400 --trials 3 --seed 1
//   node speechgen/.build/scripts/harness.js --levels 0:0,0.2:0.1,0.4:0.3
//
// jitter = per-point noise (tremor), offset = one constant shift per stroke (aiming
// error), both standard deviations in key widths. A key is 1.0 wide, so 0.3 jitter plus
// 0.3 offset is a hand that routinely lands a third of a key off target.
//
// The strokes come from lib/synth.ts, a model of hand noise, not from real users. Treat
// the numbers as a regression check and a way to compare settings, not as a claim about
// accuracy on a real hand.

import { parseArgs } from 'node:util'

import { WORDS_TEXT } from '../data/words'
import { GlideDecoder, type DecoderConfig } from './decoder'
import { makeRng, makeStroke, type Rng } from './synth'
import { buildVocab, type Entry } from './vocab'
import userVocab from '../data/user_vocab.json'

export const DEFAULT_LEVELS = ['0:0', '0.1:0.1', '0.2:0.15', '0.3:0.2', '0.4:0.3', '0.5:0.4']

export const USAGE = `Usage: harness [options]
  --words N          vocabulary words to sample (default 300)
  --trials N         strokes per word per noise level (default 2)
  --levels LIST      comma-separated jitter:offset pairs (default ${DEFAULT_LEVELS.join(',')})
  --min-len N        shortest word to test (default 3; 2-letter words are inherently ambiguous)
  --top N            only test words from the N most frequent (default: whole list); closer to what people write
  --corner-cut N     smoothing half-window that rounds corners like a real hand (default 0)
  --seed N           RNG seed (default 0)
  --tolerance X      decoder tolerance in key widths
  --sigma X          decoder likelihood width
  --prior-weight X   weight of the word-frequency prior
  --end-weight X     extra weight on landing on the first and last key
  --no-user-vocab    ignore data/user_vocab.json
  --help`

export interface LevelResult {
  jitter: number
  offset: number
  strokes: number
  top1: number
  top3: number
}

export function evaluate(
  decoder: GlideDecoder,
  words: Entry[],
  jitter: number,
  offset: number,
  trials: number,
  rng: Rng,
  cornerCut = 0,
): LevelResult {
  let top1 = 0
  let top3 = 0
  let n = 0
  for (const w of words) {
    for (let t = 0; t < trials; t++) {
      const got = decoder.decode(makeStroke(decoder, w.letters, rng, { jitter, offset, cornerCut })).map((c) => c.word)
      n++
      if (got[0] === w.text) top1++
      if (got.includes(w.text)) top3++
    }
  }
  return { jitter, offset, strokes: n, top1: top1 / n, top3: top3 / n }
}

function sample<T>(items: T[], k: number, rng: Rng): T[] {
  const a = items.slice()
  const m = Math.min(k, a.length)
  for (let i = 0; i < m; i++) {
    const j = i + Math.floor(rng.random() * (a.length - i))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a.slice(0, m)
}

const pct = (x: number) => `${(x * 100).toFixed(1)}%`

/** Parses CLI args, runs the evaluation and returns the printable report. */
export function runHarness(argv: string[]): string {
  const { values } = parseArgs({
    args: argv,
    options: {
      words: { type: 'string', default: '300' },
      trials: { type: 'string', default: '2' },
      levels: { type: 'string', default: DEFAULT_LEVELS.join(',') },
      'min-len': { type: 'string', default: '3' },
      top: { type: 'string', default: '0' },
      'corner-cut': { type: 'string', default: '0' },
      seed: { type: 'string', default: '0' },
      tolerance: { type: 'string' },
      sigma: { type: 'string' },
      'prior-weight': { type: 'string' },
      'end-weight': { type: 'string' },
      'no-user-vocab': { type: 'boolean', default: false },
      help: { type: 'boolean', default: false },
    },
  })
  if (values.help) return USAGE

  const num = (name: string, v: string) => {
    const x = Number(v)
    if (!Number.isFinite(x)) throw new Error(`--${name} must be a number, got "${v}"`)
    return x
  }
  const nWords = num('words', values.words as string)
  const trials = num('trials', values.trials as string)
  const minLen = num('min-len', values['min-len'] as string)
  const top = num('top', values.top as string)
  const cornerCut = num('corner-cut', values['corner-cut'] as string)
  const seed = num('seed', values.seed as string)
  const levels = (values.levels as string).split(',').map((s) => {
    const [j, o] = s.split(':')
    return { jitter: num('levels', j), offset: num('levels', o ?? '0') }
  })

  const overrides: Partial<DecoderConfig> = {}
  if (values.tolerance !== undefined) overrides.tolerance = num('tolerance', values.tolerance)
  if (values.sigma !== undefined) overrides.sigma = num('sigma', values.sigma)
  if (values['prior-weight'] !== undefined) overrides.priorWeight = num('prior-weight', values['prior-weight'])
  if (values['end-weight'] !== undefined) overrides.endWeight = num('end-weight', values['end-weight'])

  const vocab = buildVocab(WORDS_TEXT, values['no-user-vocab'] ? null : userVocab)
  const decoder = new GlideDecoder(vocab, undefined, overrides)
  const cfg = decoder.config
  const ranked = top > 0 ? [...vocab.entries].sort((a, b) => b.logprior - a.logprior).slice(0, top) : vocab.entries
  const pool = ranked.filter((e) => e.letters.length >= minLen && !e.personal && /^[a-z]+$/i.test(e.text))
  const words = sample(pool, nWords, makeRng(seed))

  const lines = [
    `vocabulary ${vocab.size} entries, testing ${words.length} words (>= ${minLen} letters), ${trials} stroke(s) each, seed ${seed}`,
    `decoder: tolerance ${cfg.tolerance}, sigma ${cfg.sigma}, priorWeight ${cfg.priorWeight}, endWeight ${cfg.endWeight}, smoothWindow ${cfg.smoothWindow}, nPoints ${cfg.nPoints}`,
    '',
    `${'jitter'.padStart(7)} ${'offset'.padStart(7)} ${'strokes'.padStart(8)} ${'top-1'.padStart(8)} ${'top-3'.padStart(8)}`,
    '-'.repeat(42),
  ]
  for (const lv of levels) {
    const r = evaluate(decoder, words, lv.jitter, lv.offset, trials, makeRng(seed + 1), cornerCut)
    lines.push(
      `${r.jitter.toFixed(2).padStart(7)} ${r.offset.toFixed(2).padStart(7)} ${String(r.strokes).padStart(8)} ${pct(r.top1).padStart(8)} ${pct(r.top3).padStart(8)}`,
    )
  }
  lines.push('', 'noise in key widths (std dev); synthetic strokes, see lib/harness.ts')
  return lines.join('\n')
}
