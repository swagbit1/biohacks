'use client'

import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { DEFAULT_CONFIG, GlideDecoder, type Candidate } from '../lib/decoder'
import { applyOrder } from '../lib/rerank'
import { defaultVocab } from '../lib/vocab'
import { onSentenceReady as emitSentenceReady } from '../speechHook'
import CandidateBar from './CandidateBar'
import GlideKeyboard, { type InputMode } from './GlideKeyboard'
import SentenceBox from './SentenceBox'

interface Props {
  /** Called with the finished sentence when the writer presses Ready (or Enter). The hook in
   *  speechHook.ts is always called too, so either way of listening works. */
  onSentenceReady?: (text: string) => boolean | void
  insertLabel?: string
  /** Route that serves the optional Gemini rerank (see api/glideRoute.ts). null disables it. */
  rerankEndpoint?: string | null
  className?: string
}

export default function GlideTyping({ onSentenceReady, insertLabel, rerankEndpoint = '/api/glide', className = '' }: Props) {
  const decoderRef = useRef<GlideDecoder | null>(null)
  if (!decoderRef.current) decoderRef.current = new GlideDecoder(defaultVocab())
  const decoder = decoderRef.current
  const modeName = useId()

  const [mode, setMode] = useState<InputMode>('drag')
  const [keySize, setKeySize] = useState(DEFAULT_CONFIG.keySize)
  const [tolerance, setTolerance] = useState(DEFAULT_CONFIG.tolerance)
  const [autoAccept, setAutoAccept] = useState(true)
  const [useRerank, setUseRerank] = useState(false)
  const [rerankAvailable, setRerankAvailable] = useState(false)

  const [words, setWords] = useState<string[]>([])
  const [cands, setCands] = useState<Candidate[]>([])
  const [reranked, setReranked] = useState(false)
  const seq = useRef(0) // drops rerank replies that arrive after a newer stroke

  useEffect(() => {
    if (!rerankEndpoint || !['localhost', '127.0.0.1'].includes(location.hostname)) return
    let alive = true
    fetch(rerankEndpoint)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { available?: boolean } | null) => alive && setRerankAvailable(Boolean(d?.available)))
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [rerankEndpoint])

  const handleStroke = useCallback(
    (points: { x: number; y: number }[]) => {
      // Not choosing a candidate means "the first one was right": keep moving.
      let current = words
      if (autoAccept && cands.length) {
        current = [...words, cands[0].word]
        setWords(current)
      }
      const id = ++seq.current
      const result = decoder.decode(points, { keySize, tolerance })
      setCands(result)
      setReranked(false)

      // Reordering uses the sentence so far, so it only helps from the second word on.
      if (rerankEndpoint && rerankAvailable && useRerank && current.length > 0 && result.length > 1) {
        fetch(rerankEndpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ words: result.map((c) => c.word), previousSentence: current.join(' ') }),
        })
          .then((r) => (r.ok ? r.json() : null))
          .then((d: { order?: unknown } | null) => {
            if (id !== seq.current || !d?.order) return
            const next = applyOrder(result, d.order)
            if (next.some((c, i) => c !== result[i])) {
              setCands(next)
              setReranked(true)
            }
          })
          .catch(() => {}) // keep the decoder's own order
      }
    },
    [words, cands, autoAccept, decoder, keySize, tolerance, rerankEndpoint, rerankAvailable, useRerank],
  )

  const pick = useCallback(
    (i: number) => {
      if (!cands[i]) return
      seq.current++
      setWords((w) => [...w, cands[i].word])
      setCands([])
      setReranked(false)
    },
    [cands],
  )

  const backspace = useCallback(() => {
    seq.current++
    setReranked(false)
    if (cands.length) return setCands([]) // first undo the word still being chosen
    setWords((w) => w.slice(0, -1))
  }, [cands])

  const clear = useCallback(() => {
    seq.current++
    setWords([])
    setCands([])
    setReranked(false)
  }, [])

  const ready = useCallback(() => {
    const all = autoAccept && cands.length ? [...words, cands[0].word] : words
    if (all.length === 0) return
    const text = all.join(' ')
    if (onSentenceReady?.(text) === false) return
    seq.current++
    if (insertLabel) {
      setWords([])
      setCands([])
      setReranked(false)
      return
    }
    setWords(all)
    setCands([])
    emitSentenceReady(text) // <- hook for the speech output
  }, [words, cands, autoAccept, onSentenceReady, insertLabel])

  // Shortcuts apply while this panel has focus (click on it first): 1/2/3 pick, Backspace
  // deletes, Enter = Ready. Backspace/Enter are ignored on buttons so they cannot double-fire.
  const onKeyDown = (e: React.KeyboardEvent<HTMLElement>) => {
    const t = e.target as HTMLElement
    if (t instanceof HTMLInputElement && t.type === 'range') return
    if (e.key === '1' || e.key === '2' || e.key === '3') pick(Number(e.key) - 1)
    else if (e.target === e.currentTarget && e.key === 'Backspace') backspace()
    else if (e.target === e.currentTarget && e.key === 'Enter') ready()
  }

  const rerankOn = useRerank && rerankAvailable
  return (
    <section
      tabIndex={0}
      onKeyDown={onKeyDown}
      aria-label="Glide typing"
      className={`glide-typing mx-auto flex w-full min-w-0 max-w-3xl flex-col items-center gap-5 rounded-3xl bg-[var(--navy)] p-3 text-[var(--text)] sm:p-5 outline-none focus-visible:ring-2 focus-visible:ring-[var(--blue)] ${className}`}
    >
      <header className="w-full">
        <h2 className="text-xl font-semibold">Glide typing</h2>
        <p className="text-sm text-[var(--muted)]">One stroke per word. Pick a word, or just keep gliding.</p>
      </header>

      <SentenceBox
        words={words}
        pending={autoAccept && cands.length ? cands[0].word : ''}
        onBackspace={backspace}
        onClear={clear}
        onReady={ready}
        readyLabel={insertLabel}
      />

      <CandidateBar candidates={cands} reranked={reranked} onPick={pick} />

      <GlideKeyboard layout={decoder.layout} keySize={keySize} mode={mode} onStroke={handleStroke} />

      <details className="w-full rounded-2xl bg-[var(--navy-card)] p-4 ring-1 ring-[var(--border)]">
        <summary className="cursor-pointer text-[var(--mist)]">Settings</summary>
        <div className="mt-4 grid gap-4 text-sm text-[var(--mist)] sm:grid-cols-2">
          <fieldset className="flex gap-4" aria-label="Input mode">
            <label className="flex items-center gap-2">
              <input type="radio" name={modeName} checked={mode === 'drag'} onChange={() => setMode('drag')} />
              Press and drag
            </label>
            <label className="flex items-center gap-2">
              <input type="radio" name={modeName} checked={mode === 'tap'} onChange={() => setMode('tap')} />
              Tap to start / end
            </label>
          </fieldset>
          <label className="flex items-center gap-3">
            Key size {keySize}px
            <input type="range" min={32} max={80} value={keySize} onChange={(e) => setKeySize(Number(e.target.value))} />
          </label>
          <label className="flex items-center gap-3">
            Tolerance {tolerance.toFixed(2)}
            <input
              type="range"
              min={0}
              max={0.5}
              step={0.05}
              value={tolerance}
              onChange={(e) => setTolerance(Number(e.target.value))}
            />
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={autoAccept} onChange={(e) => setAutoAccept(e.target.checked)} />
            Accept the first word when I start the next one
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={rerankOn}
              disabled={!rerankAvailable}
              onChange={(e) => {
                seq.current++
                setReranked(false)
                setUseRerank(e.target.checked)
              }}
            />
            Use Gemini to reorder suggestions
            {!rerankAvailable && <span className="text-[var(--muted)]">(not configured)</span>}
          </label>
        </div>
        <p className="mt-2 text-sm text-[var(--muted)]">When enabled, Gemini receives the sentence so far and candidate words.</p>
      </details>
    </section>
  )
}
