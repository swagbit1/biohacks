'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { Layout, Pt } from '../lib/layout'

export const PAD = 12 // px between the canvas edge and the keyboard origin
export type InputMode = 'drag' | 'tap'

interface Props {
  layout: Layout
  keySize: number
  mode: InputMode
  onStroke: (points: Pt[]) => void
  disabled?: boolean
}

// Two ways to produce one stroke:
//  drag: press, move, release (touchscreen, pen, mouse with the button held)
//  tap:  click to start, move the pointer freely, click to end. For touchpads, which have
//        no reliable pen-down state: a tap-to-click is the only "press" they give.
export default function GlideKeyboard({ layout, keySize, mode, onStroke, disabled = false }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const trail = useRef<Pt[]>([]) // canvas-space px; the last stroke stays visible until the next
  const recording = useRef(false)
  const [active, setActive] = useState(false)

  const w = layout.width * keySize + 2 * PAD
  const h = layout.height * keySize + 2 * PAD

  const draw = useCallback(() => {
    const cv = canvasRef.current
    const ctx = cv?.getContext('2d')
    if (!cv || !ctx) return
    const dpr = window.devicePixelRatio || 1
    cv.width = w * dpr
    cv.height = h * dpr
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, w, h)

    const inset = Math.max(2, keySize * 0.06)
    ctx.font = `600 ${Math.round(keySize * 0.38)}px ui-sans-serif, system-ui, sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    for (const k of layout.keys()) {
      const x = PAD + (k.cx - 0.5) * keySize + inset
      const y = PAD + (k.cy - 0.5) * keySize + inset
      const s = keySize - 2 * inset
      ctx.fillStyle = '#1e293b'
      ctx.beginPath()
      ctx.roundRect(x, y, s, s, keySize * 0.16)
      ctx.fill()
      ctx.fillStyle = '#cbd5e1'
      ctx.fillText(k.key.toUpperCase(), PAD + k.cx * keySize, PAD + k.cy * keySize)
    }

    const t = trail.current
    if (t.length > 1) {
      ctx.lineJoin = 'round'
      ctx.lineCap = 'round'
      ctx.lineWidth = Math.max(4, keySize * 0.16)
      ctx.strokeStyle = recording.current ? 'rgba(56,189,248,0.85)' : 'rgba(56,189,248,0.35)'
      ctx.beginPath()
      ctx.moveTo(t[0].x, t[0].y)
      for (let i = 1; i < t.length; i++) ctx.lineTo(t[i].x, t[i].y)
      ctx.stroke()
    }
  }, [layout, keySize, w, h])

  useEffect(draw, [draw])

  const pos = (e: { clientX: number; clientY: number }): Pt => {
    const r = canvasRef.current!.getBoundingClientRect()
    return { x: e.clientX - r.left, y: e.clientY - r.top }
  }
  const start = (p: Pt) => {
    trail.current = [p]
    recording.current = true
    setActive(true)
    draw()
  }
  const add = (p: Pt) => {
    trail.current.push(p)
    draw()
  }
  const cancel = useCallback(() => {
    recording.current = false
    trail.current = []
    setActive(false)
    draw()
  }, [draw])
  const finish = () => {
    if (!recording.current) return
    recording.current = false
    setActive(false)
    const pts = trail.current
    draw()
    // Strokes are reported relative to the keyboard origin, in px; the decoder divides by keySize.
    if (pts.length >= 2) onStroke(pts.map((p) => ({ x: p.x - PAD, y: p.y - PAD })))
  }

  // Escape abandons a stroke (useful in tap mode, where there is no "lift off to cancel").
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && recording.current) cancel()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [cancel])

  // Switching mode or disabling mid-stroke drops the stroke rather than half-committing it.
  useEffect(() => {
    cancel()
  }, [mode, disabled, cancel])

  const handlers =
    mode === 'drag'
      ? {
          onPointerDown: (e: React.PointerEvent<HTMLCanvasElement>) => {
            if (disabled) return
            e.currentTarget.setPointerCapture?.(e.pointerId)
            start(pos(e))
          },
          onPointerMove: (e: React.PointerEvent<HTMLCanvasElement>) => {
            if (recording.current) add(pos(e))
          },
          onPointerUp: (e: React.PointerEvent<HTMLCanvasElement>) => {
            if (!recording.current) return
            add(pos(e))
            finish()
          },
          onPointerCancel: cancel,
        }
      : {
          onPointerMove: (e: React.PointerEvent<HTMLCanvasElement>) => {
            if (recording.current) add(pos(e))
          },
          onClick: (e: React.MouseEvent<HTMLCanvasElement>) => {
            if (disabled) return
            if (!recording.current) return start(pos(e))
            add(pos(e))
            finish()
          },
        }

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="max-w-full overflow-x-auto rounded-2xl bg-slate-900 ring-1 ring-slate-800">
        <canvas
          ref={canvasRef}
          // The canvas owns every touch/pen gesture inside it: no scroll, zoom or text selection.
          style={{ width: w, height: h, touchAction: 'none', userSelect: 'none', WebkitUserSelect: 'none' }}
          className={`block ${mode === 'tap' ? 'cursor-crosshair' : 'cursor-pointer'}`}
          aria-label="Glide keyboard"
          {...handlers}
        />
      </div>
      <p className="h-5 text-sm text-slate-400" aria-live="polite">
        {mode === 'drag'
          ? active
            ? 'Release to finish the word'
            : 'Press on the first letter, glide through the letters, release'
          : active
            ? 'Move over the letters, then tap on the last one (Esc cancels)'
            : 'Tap on the first letter, move to the last, tap again'}
      </p>
    </div>
  )
}
