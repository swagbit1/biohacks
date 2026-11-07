// Vocabulary: bundled frequency list plus personal words from user_vocab.json.
//
// Frequency text is one word per line, most frequent first, optionally "word<TAB>count".
// Without counts a Zipf prior (1 / rank) is used.
//
// user_vocab.json:
//   { "boost": 3.0, "words": ["Jordan", "Maya", { "text": "see you soon", "boost": 8 }] }
// Entries may contain spaces or apostrophes. Only letters form the glide path, the
// original text is what gets returned, so a whole phrase can be a single stroke.

import { WORDS_TEXT } from '../data/words'
import userVocabJson from '../data/user_vocab.json'

export interface Entry {
  text: string // what is shown and returned
  letters: string // lowercase letters that define the glide path
  logprior: number
  personal: boolean
}

export interface UserVocabFile {
  boost?: number
  words?: Array<string | { text?: string; boost?: number }>
}

export function lettersOf(text: string): string {
  return text.toLowerCase().replace(/[^a-z]/g, '')
}

export class Vocab {
  constructor(readonly entries: Entry[]) {}

  get size(): number {
    return this.entries.length
  }
}

export function buildVocab(wordsText: string, user: UserVocabFile | null = null, defaultBoost = 3): Vocab {
  const base = parseWords(wordsText)
  const byKey = new Map<string, Entry>(base.map((e) => [e.text.toLowerCase(), e]))
  // A personal word with no frequency of its own is treated as mid-frequency.
  const floor = base.length ? base[Math.min(base.length - 1, 300)].logprior : Math.log(1e-6)

  for (const { text, boost } of userEntries(user, defaultBoost)) {
    const letters = lettersOf(text)
    if (!letters) continue
    const prev = byKey.get(text.toLowerCase())
    byKey.set(text.toLowerCase(), {
      text,
      letters,
      logprior: (prev ? prev.logprior : floor) + Math.log(boost),
      personal: true,
    })
  }
  return new Vocab([...byKey.values()])
}

/** The bundled list plus speechgen/data/user_vocab.json. */
export function defaultVocab(): Vocab {
  return buildVocab(WORDS_TEXT, userVocabJson as UserVocabFile)
}

function parseWords(text: string): Entry[] {
  const rows: Array<{ word: string; count: number | null }> = []
  for (const raw of text.split('\n')) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    const parts = line.split(/\s+/)
    const n = parts.length > 1 ? Number(parts[1]) : NaN
    rows.push({ word: parts[0], count: Number.isFinite(n) && n > 0 ? n : null })
  }
  const out: Entry[] = []
  const seen = new Set<string>()
  rows.forEach(({ word, count }, rank) => {
    const letters = lettersOf(word)
    if (!letters || seen.has(word.toLowerCase())) return
    seen.add(word.toLowerCase())
    out.push({ text: word, letters, logprior: Math.log(count ?? 1 / (rank + 1)), personal: false })
  })
  // Normalise so priors are log-probabilities over the list.
  const max = Math.max(...out.map((e) => e.logprior))
  const total = max + Math.log(out.reduce((s, e) => s + Math.exp(e.logprior - max), 0))
  return out.map((e) => ({ ...e, logprior: e.logprior - total }))
}

function userEntries(user: UserVocabFile | null, defaultBoost: number): Array<{ text: string; boost: number }> {
  if (!user || !Array.isArray(user.words)) return []
  const boost = Number(user.boost ?? defaultBoost)
  const base = Number.isFinite(boost) && boost > 0 ? boost : defaultBoost
  const out: Array<{ text: string; boost: number }> = []
  for (const item of user.words) {
    if (typeof item === 'string') out.push({ text: item, boost: base })
    else if (item && typeof item.text === 'string' && item.text) {
      const b = Number(item.boost ?? base)
      out.push({ text: item.text, boost: Number.isFinite(b) && b > 0 ? b : base })
    }
  }
  return out
}
