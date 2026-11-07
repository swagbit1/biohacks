// Shape-writing decoder (SHARK2 style).
//
// A stroke is a list of {x, y} pixel points over an on-screen QWERTY. For each
// vocabulary word the ideal path is the polyline through its key centres. Both are
// resampled to N points and compared on two channels:
//
//   shape     the strokes after translation + scale normalisation (so a small or
//             shifted stroke with the right form still matches)
//   location  the strokes as drawn, in key units (so a stroke over the wrong keys is
//             penalised even if its shape is similar)
//
// Per-point distances inside a tolerance radius cost nothing, which is how the decoder
// forgives tremor and imprecision. The remaining error becomes a Gaussian
// log-likelihood, added to a word-frequency log-prior, then a softmax over the
// surviving candidates gives scores that sum to 1.

import { Layout, type Pt } from './layout'
import type { Entry, Vocab } from './vocab'

export interface DecoderConfig {
  nPoints: number // resample length for both stroke and ideal path
  keySize: number // on-screen key width in px; stroke px / keySize = key units
  tolerance: number // key widths of per-point error that costs nothing
  sigma: number // likelihood width in key widths (bigger = more forgiving)
  shapeWeight: number // 0 = location only, 1 = shape only
  endWeight: number // extra weight on landing on the first and last key (people stop on purpose)
  priorWeight: number // how much word frequency counts against the stroke
  smoothWindow: number // moving-average window (odd) applied to raw points
  pruneRadius: number // start/end must be within this many keys of the word's
  topK: number
}

export const DEFAULT_CONFIG: DecoderConfig = {
  nPoints: 40,
  keySize: 56,
  tolerance: 0.1,
  sigma: 0.2,
  shapeWeight: 0.5,
  endWeight: 0.25,
  priorWeight: 0.4,
  smoothWindow: 5,
  pruneRadius: 2,
  topK: 3,
}

export interface Candidate {
  word: string
  score: number // probability among surviving candidates
  distance: number // combined stroke-vs-word distance in key units
  shape: number
  location: number
  personal: boolean
}

// ---- geometry helpers (pure, unit-tested) -----------------------------------------

export const dist = (a: Pt, b: Pt): number => Math.hypot(a.x - b.x, a.y - b.y)

export function pathLength(pts: readonly Pt[]): number {
  let total = 0
  for (let i = 1; i < pts.length; i++) total += dist(pts[i - 1], pts[i])
  return total
}

/**
 * Moving average that keeps the first and last point fixed. The window shrinks
 * symmetrically near the ends so endpoints (which pruning relies on) are not dragged
 * into the interior.
 */
export function smooth(pts: readonly Pt[], window: number): Pt[] {
  const n = pts.length
  const half = Math.max(0, Math.floor(window / 2))
  if (half === 0 || n < 3) return pts.map((p) => ({ ...p }))
  const out: Pt[] = []
  for (let i = 0; i < n; i++) {
    const h = Math.min(half, i, n - 1 - i)
    let sx = 0
    let sy = 0
    for (let j = i - h; j <= i + h; j++) {
      sx += pts[j].x
      sy += pts[j].y
    }
    const len = 2 * h + 1
    out.push({ x: sx / len, y: sy / len })
  }
  return out
}

/** n points equally spaced along the polyline's arc length. */
export function resample(pts: readonly Pt[], n: number): Pt[] {
  if (pts.length === 0) return []
  const total = pathLength(pts)
  if (total < 1e-9) return Array.from({ length: n }, () => ({ ...pts[0] }))
  const step = total / (n - 1)
  const out: Pt[] = [{ ...pts[0] }]
  let acc = 0
  let prev = pts[0]
  let i = 1
  while (i < pts.length && out.length < n) {
    const d = dist(prev, pts[i])
    if (d > 0 && acc + d >= step) {
      const t = (step - acc) / d
      const q = { x: prev.x + t * (pts[i].x - prev.x), y: prev.y + t * (pts[i].y - prev.y) }
      out.push(q)
      prev = q
      acc = 0
    } else {
      acc += d
      prev = pts[i]
      i++
    }
  }
  while (out.length < n) out.push({ ...pts[pts.length - 1] })
  out[n - 1] = { ...pts[pts.length - 1] }
  return out
}

function extent(pts: readonly Pt[]): number {
  let minX = Infinity
  let maxX = -Infinity
  let minY = Infinity
  let maxY = -Infinity
  for (const p of pts) {
    if (p.x < minX) minX = p.x
    if (p.x > maxX) maxX = p.x
    if (p.y < minY) minY = p.y
    if (p.y > maxY) maxY = p.y
  }
  return Math.max(maxX - minX, maxY - minY)
}

/**
 * Translate the centroid to the origin and scale so the larger bbox side is 1.
 * A zero-extent path returns scale 0.
 */
export function normalise(pts: readonly Pt[]): { pts: Pt[]; scale: number } {
  const cx = pts.reduce((s, p) => s + p.x, 0) / pts.length
  const cy = pts.reduce((s, p) => s + p.y, 0) / pts.length
  const scale = extent(pts)
  if (scale < 1e-9) return { pts: pts.map(() => ({ x: 0, y: 0 })), scale: 0 }
  return { pts: pts.map((p) => ({ x: (p.x - cx) / scale, y: (p.y - cy) / scale })), scale }
}

/**
 * RMS of the error left after forgiving `tol` per point. RMS rather than mean so a
 * stroke that is right for most of the word but wrong at one letter (hello vs help) is
 * not averaged back into a near-match.
 */
function deadZoneRms(ds: readonly number[], tol: number): number {
  let sum = 0
  for (const d of ds) {
    const e = Math.max(0, d - tol)
    sum += e * e
  }
  return Math.sqrt(sum / ds.length)
}

// ---- decoder ----------------------------------------------------------------------

interface Ideal {
  path: Pt[]
  norm: Pt[]
  scale: number
  start: Pt
  end: Pt
}

export class GlideDecoder {
  readonly layout: Layout
  readonly config: DecoderConfig
  private readonly idealCache = new Map<string, Ideal | null>()
  private index: Array<{ entry: Entry; start: Pt; end: Pt }> | null = null

  constructor(
    readonly vocab: Vocab,
    layout: Layout = new Layout(),
    config: Partial<DecoderConfig> = {},
  ) {
    this.layout = layout
    this.config = { ...DEFAULT_CONFIG, ...config }
  }

  /** Polyline through key centres, consecutive repeats collapsed (key units). */
  idealPath(letters: string): Pt[] {
    const pts: Pt[] = []
    for (const ch of letters) {
      if (!this.layout.has(ch)) continue
      const c = this.layout.centre(ch)
      const last = pts[pts.length - 1]
      if (!last || last.x !== c.x || last.y !== c.y) pts.push(c)
    }
    return pts
  }

  /** Entries with their first/last key centres, built once. Cheap enough to scan per stroke. */
  private indexed(): Array<{ entry: Entry; start: Pt; end: Pt }> {
    if (!this.index) {
      this.index = []
      for (const entry of this.vocab.entries) {
        const pts = this.idealPath(entry.letters)
        if (pts.length) this.index.push({ entry, start: pts[0], end: pts[pts.length - 1] })
      }
    }
    return this.index
  }

  private ideal(letters: string, n: number): Ideal | null {
    const key = `${n}:${letters}`
    const hit = this.idealCache.get(key)
    if (hit !== undefined) return hit
    const pts = this.idealPath(letters)
    let value: Ideal | null = null
    if (pts.length) {
      const path = resample(pts, n)
      const { pts: norm, scale } = normalise(path)
      value = { path, norm, scale, start: pts[0], end: pts[pts.length - 1] }
    }
    this.idealCache.set(key, value)
    return value
  }

  /** Raw px points -> smoothed, resampled stroke in key units. */
  prepareStroke(points: readonly Pt[], cfg: DecoderConfig): Pt[] {
    const units = points.map((p) => ({ x: p.x / cfg.keySize, y: p.y / cfg.keySize }))
    // Drop consecutive duplicates (pointer events often repeat a position).
    const clean: Pt[] = units.length ? [units[0]] : []
    for (let i = 1; i < units.length; i++) {
      if (dist(units[i], clean[clean.length - 1]) > 1e-6) clean.push(units[i])
    }
    if (!clean.length) return []
    // Never smooth away a short stroke: keep the window under a third of its length.
    const window = clean.length >= 3 ? Math.min(cfg.smoothWindow, Math.floor(clean.length / 3) | 1) : 1
    return resample(smooth(clean, window), cfg.nPoints)
  }

  /**
   * Top candidates for a stroke, best first. overrides set any DecoderConfig field for
   * this call only (the UI passes its current key size and tolerance).
   */
  decode(points: readonly Pt[], overrides: Partial<DecoderConfig> = {}): Candidate[] {
    const cfg: DecoderConfig = { ...this.config, ...overrides }
    if (points.length < 1 || this.vocab.entries.length === 0) return []
    const stroke = this.prepareStroke(points, cfg)
    if (!stroke.length) return []
    const { pts: sNorm } = normalise(stroke)
    const sStart = stroke[0]
    const sEnd = stroke[stroke.length - 1]

    // Prune on the first and last key before building any resampled path: with a large
    // vocabulary only the few words that start and end near the stroke are scored, and only
    // those ever get a cached ideal path.
    const all = this.indexed()
    let near = all.filter((w) => dist(sStart, w.start) <= cfg.pruneRadius && dist(sEnd, w.end) <= cfg.pruneRadius)
    if (!near.length) {
      // Stroke ended nowhere near any word: do not return nothing, score the closest few hundred.
      near = all
        .map((w) => ({ w, d: dist(sStart, w.start) + dist(sEnd, w.end) }))
        .sort((a, b) => a.d - b.d)
        .slice(0, 300)
        .map((x) => x.w)
    }
    const kept: Array<{ entry: Entry; ideal: Ideal }> = []
    for (const { entry } of near) {
      const ideal = this.ideal(entry.letters, cfg.nPoints)
      if (ideal) kept.push({ entry, ideal })
    }

    const scored = kept.map(({ entry, ideal }) => {
      const locDs = stroke.map((p, i) => dist(p, ideal.path[i]))
      const location = deadZoneRms(locDs, cfg.tolerance)
      let shape: number
      if (ideal.scale < 1e-9) {
        shape = location // single-key word: shape carries no information
      } else {
        // compare normalised forms, express error in key units via the ideal's size
        const shDs = sNorm.map((p, i) => dist(p, ideal.norm[i]) * ideal.scale)
        shape = deadZoneRms(shDs, cfg.tolerance)
      }
      // The first and last key are deliberate stops, unlike the corners in between, so an
      // ending on the wrong key counts for more than the path average suggests (hello vs help).
      const endErr =
        (Math.max(0, dist(sStart, ideal.start) - cfg.tolerance) + Math.max(0, dist(sEnd, ideal.end) - cfg.tolerance)) / 2
      const d = cfg.shapeWeight * shape + (1 - cfg.shapeWeight) * location + cfg.endWeight * endErr
      const logp = -0.5 * (d / cfg.sigma) ** 2 + cfg.priorWeight * entry.logprior
      return { logp, entry, d, shape, location }
    })

    scored.sort((a, b) => b.logp - a.logp)
    const best = scored[0].logp
    const z = scored.reduce((s, t) => s + Math.exp(t.logp - best), 0)
    return scored.slice(0, cfg.topK).map((t) => ({
      word: t.entry.text,
      score: Math.exp(t.logp - best) / z,
      distance: t.d,
      shape: t.shape,
      location: t.location,
      personal: t.entry.personal,
    }))
  }
}
