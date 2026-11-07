'use client'

interface Props {
  words: string[]
  pending: string
  onBackspace: () => void
  onClear: () => void
  onReady: () => void
}

export default function SentenceBox({ words, pending, onBackspace, onClear, onReady }: Props) {
  const empty = words.length === 0 && !pending
  const secondary =
    'rounded-xl bg-slate-800 px-5 py-3 text-lg ring-1 ring-slate-700 hover:bg-slate-700 disabled:opacity-40'
  return (
    <div className="w-full rounded-2xl bg-slate-900 p-4 ring-1 ring-slate-800">
      <div className="min-h-20 text-3xl leading-snug break-words" aria-live="polite" aria-label="Sentence">
        {empty && <span className="text-slate-600">Your sentence appears here</span>}
        {words.join(' ')}
        {pending && (
          <span className="text-sky-300/70">
            {words.length ? ' ' : ''}
            {pending}
          </span>
        )}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button type="button" onClick={onBackspace} disabled={empty} className={secondary}>
          ⌫ Backspace
        </button>
        <button type="button" onClick={onClear} disabled={empty} className={secondary}>
          Clear
        </button>
        <button
          type="button"
          onClick={onReady}
          disabled={empty}
          className="ml-auto rounded-xl bg-emerald-500 px-7 py-3 text-lg font-semibold text-slate-950 hover:bg-emerald-400 disabled:opacity-40"
        >
          Ready ▸
        </button>
      </div>
    </div>
  )
}
