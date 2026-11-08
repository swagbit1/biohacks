export function insertGlideSentence(draft: string, sentence: string, cursor = draft.length) {
  const limit = 3500
  const position = Math.max(0, Math.min(cursor, draft.length))
  const before = draft.slice(0, position)
  const after = draft.slice(position)
  const leadingSpace = /\S$/.test(before) ? ' ' : ''
  const trailingSpace = /^[^\s.,!?;:]/.test(after) ? ' ' : ''
  const insert = leadingSpace + sentence.trim() + trailingSpace
  if (draft.length + insert.length > limit) {
    return {ok: false, remaining: Math.max(0, limit - draft.length)} as const
  }
  return {ok: true, text: before + insert + after, caret: position + insert.length} as const
}
