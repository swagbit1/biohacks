// Synthetic glide strokes for tests and the evidence harness.
//
// A stroke is the word's ideal key-centre path, optionally with corners cut, sampled at
// uneven speed, then perturbed by:
//   offset  one constant (dx, dy) per stroke   - aiming a bit off target
//   jitter  independent noise on every point   - tremor / pointer noise
// Both are standard deviations in key widths. Output is in pixels.

import { GlideDecoder, resample, smooth } from './decoder'
import type { Pt } from './layout'

export interface Rng {
  random(): number
  gauss(sd: number): number
}

/** Small seeded generator (mulberry32) so harness runs and tests are reproducible. */
export function makeRng(seed: number): Rng {
  let a = seed >>> 0
  const random = () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  const gauss = (sd: number) => {
    if (sd === 0) return 0
    const u = 1 - random()
    const v = random()
    return sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
  }
  return { random, gauss }
}

export interface StrokeOptions {
  jitter?: number
  offset?: number
  cornerCut?: number // smoothing half-window that rounds corners like a real hand
  rawPoints?: number
  keySize?: number
}

export function makeStroke(decoder: GlideDecoder, letters: string, rng: Rng, opts: StrokeOptions = {}): Pt[] {
  const { jitter = 0, offset = 0, cornerCut = 0, rawPoints = 90 } = opts
  const keySize = opts.keySize ?? decoder.config.keySize
  let ideal = decoder.idealPath(letters)
  if (!ideal.length) return []
  if (ideal.length === 1) ideal = [ideal[0], ideal[0]]
  // Uniform samples along the path, then warp time so speed varies like a hand.
  const dense = resample(ideal, rawPoints)
  const ts = Array.from({ length: rawPoints - 2 }, () => rng.random()).sort((a, b) => a - b)
  const warped = [
    dense[0],
    ...ts.map((t) => dense[Math.min(rawPoints - 1, Math.floor(t * (rawPoints - 1)))]),
    dense[rawPoints - 1],
  ]
  const pts = cornerCut ? smooth(warped, 2 * cornerCut + 1) : warped
  const ox = rng.gauss(offset)
  const oy = rng.gauss(offset)
  return pts.map((p) => ({
    x: (p.x + ox + rng.gauss(jitter)) * keySize,
    y: (p.y + oy + rng.gauss(jitter)) * keySize,
  }))
}
