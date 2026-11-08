'use client';

import Link from 'next/link';
import GlideTyping from '../../speechgen/components/GlideTyping';

export default function GlidePage(){
  return <main className="compact-page mx-auto max-w-5xl px-4 py-3 sm:px-6">
    <header className="flex items-center justify-between gap-2 border-b pb-2">
      <div><p className="kicker">EverVoice</p><h1 className="display text-3xl">Glide workspace</h1></div>
      <Link href="/studio">← Back to Studio</Link>
    </header>
    <div className="compact-pane py-2">
      <div className="panel mx-auto max-w-3xl">
        <GlideTyping/>
      </div>
    </div>
  </main>;
}
