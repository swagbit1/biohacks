'use client'

import {Button} from '../../components/button'

interface Props {
  words: string[]
  pending: string
  onBackspace: () => void
  onClear: () => void
  onReady: () => void
  readyLabel?: string
}

export default function SentenceBox({ words, pending, onBackspace, onClear, onReady, readyLabel = 'Ready' }: Props) {
  const empty = words.length === 0 && !pending
  return (
    <div className="w-full rounded-2xl bg-[var(--navy-card)] p-4 ring-1 ring-[var(--border)]">
      <div className="min-h-20 text-xl sm:text-2xl leading-snug break-words" aria-live="polite" aria-label="Sentence">
        {empty && <span className="text-[var(--muted)]">Your sentence appears here</span>}
        {words.join(' ')}
        {pending && (
          <span className="text-[var(--blue)]">
            {words.length ? ' ' : ''}
            {pending}
          </span>
        )}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <Button icon="backspace" type="button" variant="outline" onClick={onBackspace} disabled={empty}>
          Backspace
        </Button>
        <Button icon="close" type="button" variant="outline" onClick={onClear} disabled={empty}>
          Clear
        </Button>
        <Button icon="next"
          type="button"
          onClick={onReady}
          disabled={empty}
          className="ml-auto"
        >
          {readyLabel}
        </Button>
      </div>
    </div>
  )
}
