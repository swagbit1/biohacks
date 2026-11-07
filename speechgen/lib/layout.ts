// QWERTY geometry in key units (1.0 = one key width). Pixel scaling happens elsewhere.

export const ROWS = ['qwertyuiop', 'asdfghjkl', 'zxcvbnm'] as const
// Horizontal stagger of each row in key widths (matches a physical QWERTY).
export const OFFSETS = [0, 0.25, 0.75] as const

export interface Pt {
  x: number
  y: number
}

export interface KeyCentre {
  key: string
  cx: number
  cy: number
}

export class Layout {
  readonly width: number
  readonly height: number
  private readonly centres = new Map<string, Pt>()
  private readonly list: KeyCentre[] = []

  constructor(rows: readonly string[] = ROWS, offsets: readonly number[] = OFFSETS) {
    let width = 0
    rows.forEach((row, r) => {
      const off = offsets[r] ?? 0
      width = Math.max(width, off + row.length)
      for (let c = 0; c < row.length; c++) {
        const key = row[c]
        const centre = { x: off + c + 0.5, y: r + 0.5 }
        this.centres.set(key, centre)
        this.list.push({ key, cx: centre.x, cy: centre.y })
      }
    })
    this.width = width
    this.height = rows.length
  }

  centre(ch: string): Pt {
    const c = this.centres.get(ch)
    if (!c) throw new Error(`no key for "${ch}"`)
    return c
  }

  has(ch: string): boolean {
    return this.centres.has(ch)
  }

  /** Key centres for drawing the keyboard, in key units. */
  keys(): readonly KeyCentre[] {
    return this.list
  }
}
