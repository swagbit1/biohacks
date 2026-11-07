// The one integration point for speech output (built separately).
//
//   import { onSentenceReady, registerSentenceReadyHandler } from '<path>/speechgen/speechHook'
//
// The glide UI calls onSentenceReady(text) when the writer presses Ready (or Enter).
// Plug speech in any of three ways:
//   <GlideTyping onSentenceReady={(text) => speak(text)} />
//   registerSentenceReadyHandler((text) => speak(text))
//   window.addEventListener('speechgen:sentence-ready', (e) => speak((e as CustomEvent).detail.text))
// Nothing here speaks. With nobody listening the call is a no-op.

export const SENTENCE_READY_EVENT = 'speechgen:sentence-ready'

type Handler = (text: string) => void
let handler: Handler | null = null

/** Register the single consumer. Returns an unregister function. */
export function registerSentenceReadyHandler(fn: Handler): () => void {
  handler = fn
  return () => {
    if (handler === fn) handler = null
  }
}

/** Called by the UI with the finished sentence as plain text. */
export function onSentenceReady(text: string): void {
  const clean = String(text ?? '').trim()
  if (!clean) return
  handler?.(clean)
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(SENTENCE_READY_EVENT, { detail: { text: clean } }))
  }
}
