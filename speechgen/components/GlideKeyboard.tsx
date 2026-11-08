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
  const frame = useRef<number | null>(null)
  const palette = useRef({key: '', text: '', trail: ''})
  const [active, setActive] = useState(false)

  const w = layout.width * keySize + 2 * PAD
  const h = layout.height * keySize + 2 * PAD

  const draw = useCallback(() => {
    const cv = canvasRef.current
    const ctx = cv?.getContext('2d')
    if (!cv || !ctx) return
    const dpr = window.devicePixelRatio || 1
    const width = Math.round(w * dpr)
    const height = Math.round(h * dpr)
    if (cv.width !== width) cv.width = width
    if (cv.height !== height) cv.height = height
    ctx.setTransform(width / w, 0, 0, height / h, 0, 0)
    ctx.clearRect(0, 0, w, h)

    const inset = Math.max(2, keySize * 0.06)
    ctx.font = `600 ${Math.round(keySize * 0.38)}px 'DM Sans', system-ui, sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    for (const k of layout.keys()) {
      const x = PAD + (k.cx - 0.5) * keySize + inset
      const y = PAD + (k.cy - 0.5) * keySize + inset
      const s = keySize - 2 * inset
      ctx.fillStyle = palette.current.key
      ctx.beginPath()
      ctx.roundRect(x, y, s, s, keySize * 0.16)
      ctx.fill()
      ctx.fillStyle = palette.current.text
      ctx.fillText(k.key.toUpperCase(), PAD + k.cx * keySize, PAD + k.cy * keySize)
    }

    const t = trail.current
    if (t.length > 1) {
      ctx.lineJoin = 'round'
      ctx.lineCap = 'round'
      ctx.lineWidth = Math.max(4, keySize * 0.16)
      ctx.strokeStyle = palette.current.trail
      ctx.globalAlpha = recording.current ? .85 : .35
      ctx.beginPath()
      ctx.moveTo(t[0].x, t[0].y)
      for (let i = 1; i < t.length; i++) ctx.lineTo(t[i].x, t[i].y)
      ctx.stroke()
      ctx.globalAlpha = 1
    }
  }, [layout, keySize, w, h])

  const queueDraw = useCallback(() => {
    if (frame.current !== null) return
    frame.current = requestAnimationFrame(() => {
      frame.current = null
      draw()
    })
  }, [draw])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const theme = getComputedStyle(canvas)
    palette.current = {
      key: theme.getPropertyValue('--navy-raised').trim(),
      text: theme.getPropertyValue('--mist').trim(),
      trail: theme.getPropertyValue('--blue').trim(),
    }
    queueDraw()
    window.addEventListener('resize', queueDraw)
    return () => {
      window.removeEventListener('resize', queueDraw)
      if (frame.current !== null) cancelAnimationFrame(frame.current)
      frame.current = null
    }
  }, [queueDraw])

  const pos = (e: { clientX: number; clientY: number }): Pt => {
    const r = canvasRef.current!.getBoundingClientRect()
    return { x: (e.clientX - r.left) * w / r.width, y: (e.clientY - r.top) * h / r.height }
  }
  const start = (p: Pt) => {
    trail.current = [p]
    recording.current = true
    setActive(true)
    queueDraw()
  }
  const add = (p: Pt) => {
    trail.current.push(p)
    queueDraw()
  }
  const cancel = useCallback(() => {
    recording.current = false
    trail.current = []
    setActive(false)
    queueDraw()
  }, [queueDraw])
  const finish = () => {
    if (!recording.current) return
    recording.current = false
    setActive(false)
    const pts = trail.current
    queueDraw()
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
    <div className="flex w-full min-w-0 flex-col items-center gap-2">
      <div className="max-w-full rounded-2xl bg-[var(--navy-card)] ring-1 ring-[var(--border)]">
        <canvas
          ref={canvasRef}
          // The canvas owns every touch/pen gesture inside it: no scroll, zoom or text selection.
          style={{ width: w, maxWidth: '100%', height: 'auto', aspectRatio: w + ' / ' + h, touchAction: 'none', userSelect: 'none', WebkitUserSelect: 'none' }}
          className={`block ${mode === 'tap' ? 'cursor-crosshair' : 'cursor-pointer'}`}
          aria-label="Glide keyboard"
          {...handlers}
        />
      </div>
      <p className="min-h-5 text-sm text-[var(--muted)]" aria-live="polite">
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
