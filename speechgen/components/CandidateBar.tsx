'use client'

import type { Candidate } from '../lib/decoder'

interface Props {
  candidates: Candidate[]
  reranked: boolean
  onPick: (index: number) => void
}

// Up to three candidates for the last stroke. The first is the decoder's best guess;
// tapping any one commits it. Keys 1/2/3 do the same.
export default function CandidateBar({ candidates, reranked, onPick }: Props) {
  return (
    <div className="w-full">
      <div className="grid grid-cols-3 gap-3">
        {[0, 1, 2].map((i) => {
          const c = candidates[i]
          const style = c
            ? i === 0
              ? 'bg-sky-500/20 ring-sky-400 hover:bg-sky-500/30'
              : 'bg-slate-800 ring-slate-700 hover:bg-slate-700'
            : 'bg-slate-900 text-slate-700 ring-slate-800'
          return (
            <button
              key={i}
              type="button"
              disabled={!c}
              onClick={() => c && onPick(i)}
              className={`min-h-16 rounded-2xl px-3 py-3 text-2xl font-semibold ring-1 transition ${style}`}
            >
              <span className="block truncate">{c ? c.word : '·'}</span>
              <span className="block text-xs font-normal text-slate-400">{c ? String(i + 1) : ' '}</span>
            </button>
          )
        })}
      </div>
      <p className="mt-2 h-5 text-sm text-slate-400" aria-live="polite">
        {reranked ? 'Reordered using the sentence so far' : ''}
      </p>
    </div>
  )
}
