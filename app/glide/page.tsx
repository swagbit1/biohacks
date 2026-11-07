'use client'

import GlideTyping from '../../speechgen/components/GlideTyping'

export default function GlidePage() {
  return <GlideTyping onSentenceReady={(text) => console.log(text)} />
}