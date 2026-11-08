'use client'

import {Button} from '../../components/button'

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
      <div className="grid grid-cols-3 gap-2">
        {[0, 1, 2].map((i) => {
          const c = candidates[i]
          return (
            <Button
              key={i}
              type="button"
              variant={c && i === 0 ? 'default' : 'outline'}
              disabled={!c}
              onClick={() => c && onPick(i)}
              className="min-h-14 min-w-0 flex-col gap-0 px-2 py-2 text-base sm:text-xl"
            >
              <span className="block max-w-full truncate">{c ? c.word : '·'}</span>
              <span className="block text-xs font-normal text-[var(--muted)]">{c ? String(i + 1) : ' '}</span>
            </Button>
          )
        })}
      </div>
      <p className="mt-2 h-5 text-sm text-[var(--muted)]" aria-live="polite">
        {reranked ? 'Reordered using the sentence so far' : ''}
      </p>
    </div>
  )
}
