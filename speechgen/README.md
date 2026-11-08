# speechgen: glide typing input

One piece of the BioHacks 2026 project for Alex Chen (ALS, fatiguing hands): write a
sentence with **one continuous stroke per word**, over an on-screen QWERTY, with low
effort. Voice bank and speech output are built separately. This folder only exposes a
hook for them (`onSentenceReady`).

Pure TypeScript plus React client components. **No new dependencies** and no changes
outside this folder: it uses what the app already has (Next 16, React 19, TypeScript 7,
Tailwind 4) and Node's built-in test runner.

```
speechgen/
  lib/            decoder, layout, vocab, rerank, synth strokes, harness (pure TS)
  components/     GlideTyping (the whole UI), GlideKeyboard, CandidateBar, SentenceBox
  api/            glideRoute.ts: Next route handlers for the optional Gemini rerank
  data/           words.ts (frequency list), user_vocab.json (personal words)
  tests/          node:test unit tests
  scripts/        harness CLI
  speechHook.ts   onSentenceReady(text): the integration point for speech
  tsconfig.json   only for running tests/harness (see below)
```

## Add it to the app (two tiny files outside this folder)

I was told to keep every change inside `speechgen/`, so these two files are yours to add.

```tsx
// app/glide/page.tsx   ('use client' is needed because a function prop is passed)
'use client'

import GlideTyping from '../../speechgen/components/GlideTyping'

export default function GlidePage() {
  return <GlideTyping onSentenceReady={(text) => console.log(text)} />
}
```

```ts
// app/api/glide/route.ts   (optional: only needed for the Gemini rerank)
export { GET, POST } from '../../../speechgen/api/glideRoute'
```

Without the route file the component still works; it just skips the rerank. Tailwind 4
picks up the classes in `speechgen/` on its own. The panel brings its own dark background,
so it does not depend on the page theme.

Optional rerank: set `GEMINI_API_KEY` (and optionally `GEMINI_MODEL`) in the root
`.env.local`. `speechgen/.env.example` lists the variables. The key is only read on the
server.

## Hooking up speech

`onSentenceReady(text)` runs when the writer presses **Ready** (or Enter). Use any one:

```tsx
<GlideTyping onSentenceReady={(text) => speak(text)} />
```
```ts
import { registerSentenceReadyHandler } from '../speechgen/speechHook'
registerSentenceReadyHandler((text) => speak(text))
```
```ts
window.addEventListener('speechgen:sentence-ready', (e) => speak((e as CustomEvent).detail.text))
```

`text` is the chosen words joined by spaces, as chosen (no capitalisation or punctuation
added). Nothing in this folder speaks.

## Test and measure

Needs Node 21+ (for the `--test` glob). From the repo root:

```bash
npx tsc -p speechgen/tsconfig.json                    # compiles to speechgen/.build (git-ignored)
node --test "speechgen/.build/tests/*.test.js"        # 42 tests
node speechgen/.build/scripts/harness.js --top 600    # accuracy table on the 600 most common words
node speechgen/.build/scripts/harness.js --top 600 --words 400 --trials 3 --levels 0:0,0.2:0.1,0.4:0.3
node speechgen/.build/scripts/harness.js --corner-cut 3 --help
```

The harness prints top-1 and top-3 accuracy per noise level. Noise is in key widths:
**jitter** is per-point (tremor), **offset** is one constant shift per stroke (aiming
error). Output with the bundled ~9.5k-word list, tested on the 600 most frequent words
(3+ letters), seed 0:

```
 jitter  offset  strokes    top-1    top-3
   0.00    0.00      800    93.8%    98.4%
   0.20    0.15      800    94.4%    99.3%
   0.40    0.30      800    81.6%    93.1%
   0.50    0.40      800    68.9%    84.6%
```

These strokes come from a noise model, not from a person, and the vocabulary is small.
Use the numbers for regressions and for comparing settings, not as a real-world accuracy
claim. Real evaluation needs recorded strokes from real hands.

`speechgen/tsconfig.json` exists only because there is no test runner in the project. TS 7
removed `moduleResolution: node10`, so it compiles to CommonJS with `bundler` resolution.
Type checking and `next build` use the root tsconfig, which already covers this folder.

## Personal words

Edit `data/user_vocab.json` (restart `next dev` if it does not pick the change up):

```json
{ "boost": 3.0, "words": ["Jordan", { "text": "please repeat that", "boost": 6 }] }
```

Entries may contain spaces or apostrophes. Only the letters form the glide path and the
original text is returned, so a whole phrase is a single stroke. A personal word that is
also in the frequency list keeps its frequency times the boost; otherwise it is treated as
a mid-frequency word times the boost. The shipped file holds example names from the case
file: replace them for someone else. Names, jargon and anything missing from the frequency
list belong here too: a personal word is always findable, and the boost makes it win ties.

The frequency list in `data/words.ts` is the Google Web Trillion Word Corpus 10k list
(first20hours/google-10000-english, "no swears" variant), cleaned (letters only,
abbreviations removed), with everyday-communication words and contractions added back.
Its source licence permits educational, personal and research use: check it before any
wider release. To swap it, replace the text in that file (`word` or `word<TAB>count` per
line, most frequent first).

## Design decisions

**Decoder.** Shape-writing in the SHARK2 style. A stroke and each word's ideal path (a
polyline through its key centres) are both resampled to 40 equally spaced points. Two
distances are blended: *shape* (after centring and scaling both paths, so a small or
shifted stroke of the right form still matches) and *location* (as drawn, so a stroke over
the wrong keys is penalised). Words whose first and last key are more than two keys from
the stroke's ends are skipped before any path is built, which keeps decoding to roughly
6 ms per stroke with the 9.5k-word list. The
distance becomes a Gaussian log-likelihood added to a word-frequency log-prior; a softmax
over the survivors gives the three scores. Landing on the first and last key counts extra
(`endWeight`): people stop there on purpose, unlike at the corners in between, and it helps
separate words that differ only in the last letter. Defaults (`sigma 0.2`, `priorWeight 0.4`,
`endWeight 0.25`, `tolerance 0.1`) came from a sweep on synthetic strokes with the 9.5k list:
a heavier prior lets very common words beat the intended one, and a larger endpoint weight
hurts when the whole stroke is shifted. They are tuned on simulated noise, not real hands,
so re-tune them once you have recorded strokes. The decoder runs in the browser, so there
is no network round trip per word.

**Tremor and imprecision.** Three layers, all configurable. (1) A moving-average filter on
the raw points, which keeps the first and last point fixed (pruning depends on them),
removes jitter before resampling. (2) A per-point dead-zone (`tolerance`, in key widths):
error inside it costs nothing, so wobble around a key centre is free. The remaining error
is combined as an RMS, so one wrong letter is not averaged away (that is what separates
*hello* from *help*). (3) The shape channel ignores a whole-stroke offset or scale, so
aiming a bit off or drawing smaller still works. Key size and tolerance are sliders in
the UI so they can be tuned to the day: Alex is strong in the morning and weaker by the
afternoon.

**Two input modes.** *Press-and-drag* is the natural one for a touchscreen, pen or mouse.
Touchpads have no pen-down state: the only "press" they give is a tap-to-click, and
holding a drag on a touchpad is hard with weak hands. So *tap to start / end* uses a click
to begin recording, records the pointer as it moves with no button held, and a second
click ends the stroke. Esc cancels. Both modes feed the decoder the same point list, so
nothing downstream knows which was used. Tap mode needs a pointer that moves continuously
(touchpad, mouse, trackball), not a touchscreen, where a tap teleports and gives a straight
line.

**Low effort.** One stroke per word. The first candidate already shows in the sentence,
and starting the next word accepts it (toggle in Settings), so the usual case costs zero
taps. Choosing the second or third candidate is one tap, or key 2 / 3 while the panel has
focus. Backspace first drops the word being chosen, then the last word.

**Context rerank.** The route handler asks Gemini to reorder the top three given the
sentence so far. It never invents words: the reply must be exactly a reordering of the
candidates, otherwise (no key, timeout, API error, malformed reply, extra or missing word)
the decoder's order is kept. The sentence is passed as quoted data, the key goes in a
header, and the endpoint validates and size-limits its input. It is available on localhost only and requires the writer to opt in through Settings.

## Known limits

- Words that differ only in the last key can swap places when one is much more common
  (a perfect "hello" stroke can rank "help" first). The right word is still among the
  three candidates, one tap away.
- The 9.5k list lacks names, jargon and rare words: put those in `user_vocab.json`.
- Words must be glidable on the letter keys: no digits or punctuation keys yet.
- Gemini reranking has only been run against a stubbed `fetch`, never the live API.
- The UI was exercised in jsdom (drag, tap, pick, rerank, Ready, Backspace, Clear) and the
  built app was smoke-tested over HTTP, but not on a real touchscreen or touchpad.
- Checked against a stand-in project with your dependency versions (Next 16.4.5, React
  19.3.1, TypeScript 7.0.2, Tailwind 4.3.5), not your actual repo.
