// C29 / C24 — Sheet composition primitives (sheet-α-1).
//
// PaperSize: L0-pure constants + helpers for ISO + architectural paper sizes.
//
// LAYER PURITY: L2 (drawing-primitives). No I/O, no THREE, no DOM, no clock.
// All dimensions are in millimetres. Orientation 'portrait' = height >= width
// for ISO sizes; 'landscape' swaps width and height.

/**
 * Canonical paper sizes (portrait orientation, mm). ISO A0–A4 plus the two
 * common North-American architectural sheet sizes.
 *
 * ARCH-D is 24" × 36" → 609.6 × 914.4 mm.
 * ANSI-D is 22" × 34" → 558.8 × 863.6 mm.
 */
export const PAPER_SIZES_MM = {
  A0: { width: 841, height: 1189 },
  A1: { width: 594, height: 841 },
  A2: { width: 420, height: 594 },
  A3: { width: 297, height: 420 },
  A4: { width: 210, height: 297 },
  'ARCH-D': { width: 609.6, height: 914.4 },
  'ANSI-D': { width: 558.8, height: 863.6 },
} as const;

export type PaperSizeName = keyof typeof PAPER_SIZES_MM;

export interface PaperSize {
  readonly name: PaperSizeName | 'custom';
  readonly widthMm: number;
  readonly heightMm: number;
  readonly orientation: 'portrait' | 'landscape';
}

/**
 * Build a {@link PaperSize} for a named ISO / architectural size.
 *
 * @param name        named paper size (e.g. `'A4'`).
 * @param orientation `'portrait'` (default) keeps the canonical dimensions;
 *                    `'landscape'` swaps width and height.
 */
export function paperSize(
  name: PaperSizeName,
  orientation: 'portrait' | 'landscape' = 'portrait',
): PaperSize {
  const base = PAPER_SIZES_MM[name];
  const widthMm = orientation === 'landscape' ? base.height : base.width;
  const heightMm = orientation === 'landscape' ? base.width : base.height;
  return { name, widthMm, heightMm, orientation };
}

/**
 * Build a custom {@link PaperSize}. Orientation is inferred from the supplied
 * dimensions: if width > height the result is `'landscape'`, otherwise
 * `'portrait'` (square sheets default to `'portrait'`).
 */
export function customPaper(widthMm: number, heightMm: number): PaperSize {
  const orientation: 'portrait' | 'landscape' = widthMm > heightMm ? 'landscape' : 'portrait';
  return { name: 'custom', widthMm, heightMm, orientation };
}
