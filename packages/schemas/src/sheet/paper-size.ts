// PaperSize — paper sizes supported by the sheet engine (S37 / Phase 2C).
//
// Spec: `phases/PHASE-2C-Q3-M19-M21-SHEETS-SCHEDULES.md` §S37 lines 108
// (size enum: A0, A1, A2, A3, A4, ARCH-D, ARCH-E) and §S37 line 128
// ("sheet coordinate system uses millimetres from the sheet's bottom-
// left corner. A1 paper = 594 mm × 841 mm").
//
// CONTRACT
// ─────────────────────────────────────────────────────────────────────────────
// `getSheetDimensions(size, orientation) → { widthMm, heightMm }` returns
// the on-paper dimensions of the chosen sheet in MILLIMETRES.  All ISO A
// sizes are derived from the A0 root (1 m² area, √2 aspect ratio).  ARCH
// sizes are the US architectural sheet sizes (D = 24 × 36 in, E = 36 × 48
// in) converted to millimetres.
//
// Pure data — no DOM, no THREE.

export const PAPER_SIZES = [
  'A0',
  'A1',
  'A2',
  'A3',
  'A4',
  'ARCH-D',
  'ARCH-E',
] as const;

export type PaperSize = (typeof PAPER_SIZES)[number];

export type Orientation = 'landscape' | 'portrait';

/** Portrait dimensions (width × height in mm) of every supported size.
 *  Landscape simply swaps width and height. */
const PORTRAIT_DIMENSIONS_MM: Readonly<Record<PaperSize, { widthMm: number; heightMm: number }>> =
  Object.freeze({
    A0: { widthMm: 841,  heightMm: 1189 },
    A1: { widthMm: 594,  heightMm: 841  },
    A2: { widthMm: 420,  heightMm: 594  },
    A3: { widthMm: 297,  heightMm: 420  },
    A4: { widthMm: 210,  heightMm: 297  },
    'ARCH-D': { widthMm: 609.6,  heightMm: 914.4  }, // 24 × 36 in
    'ARCH-E': { widthMm: 914.4,  heightMm: 1219.2 }, // 36 × 48 in
  });

/** Returns the on-paper dimensions of the requested sheet in millimetres. */
export function getSheetDimensions(
  size: PaperSize,
  orientation: Orientation,
): { readonly widthMm: number; readonly heightMm: number } {
  const portrait = PORTRAIT_DIMENSIONS_MM[size];
  if (!portrait) {
    throw new Error(`[paper-size] unknown PaperSize: ${String(size)}`);
  }
  return orientation === 'landscape'
    ? { widthMm: portrait.heightMm, heightMm: portrait.widthMm }
    : { widthMm: portrait.widthMm,  heightMm: portrait.heightMm };
}

export function isPaperSize(v: unknown): v is PaperSize {
  return typeof v === 'string' && (PAPER_SIZES as readonly string[]).includes(v);
}

export function isOrientation(v: unknown): v is Orientation {
  return v === 'landscape' || v === 'portrait';
}
