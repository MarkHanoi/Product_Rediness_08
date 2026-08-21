// §PROCEDURAL-PATTERNS (L-1801/L-1802) — RUNNING BOND.
//
// ⭐ ONE layout serves the timber plank floor, the stack-bond tile grid and the
// offset/subway tile, because they ARE one layout: rectangles in rows with a
// per-row offset of p/q of a module. Stack bond is p/q = 0, subway is 1/2, a
// timber floor is typically 1/3 or 1/4, and "brick bond" is 1/2 under another name.
// Minting three generators for one geometry would have minted three seam bugs.
//
// ─── The module convention, stated once and used everywhere in this package ───
// ⭐ `lengthMm` / `widthMm` are MODULES — centre-to-centre, board-or-tile PLUS its
// share of the joint. The joint is then taken OUT of the module by insetting the
// piece, so the laid face is `module − joint`. This is the convention a setting-out
// drawing uses, and it is the only one under which the repeat cell is an exact
// multiple of the module and therefore seamless.

import { rectPiece, polygonArea, type PatternLayout, type Piece } from '../core/Piece.js';

export interface RunningBondParams {
  /** Module along the row, mm (tile/board length + joint). */
  readonly lengthMm: number;
  /** Module across the rows, mm (tile/board width + joint). */
  readonly widthMm: number;
  /** Visible joint / grout width, mm. Taken out of the module. */
  readonly jointMm: number;
  /** Row-to-row offset as the fraction `offsetNum / offsetDen` of one length module. */
  readonly offsetNum: number;
  readonly offsetDen: number;
  /** Modules across the repeat cell. Raises variety at the cost of texture area. */
  readonly repeatX: number;
  /** Multiplier on the intrinsic row period. */
  readonly repeatY: number;
}

const gcd = (a: number, b: number): number => (b === 0 ? Math.abs(a) : gcd(b, a % b));

/**
 * ⭐ THE ROW PERIOD, and why a naive `repeatY` is the "matches at the edge but the
 * pattern breaks" defect in its commonest form.
 *
 * After `nRows` rows the running bond has drifted sideways by
 * `nRows · (num/den) · lengthMm`. For the texture to reproduce the INFINITE bond
 * when tiled, that drift must be a whole number of CELL widths — not merely a whole
 * number of modules. Get it wrong and the image still wraps perfectly (the torus
 * guarantees that), the edge pixels still match, and the floor still shows a visible
 * step every `nRows` rows. So the period is computed, never chosen:
 *
 *   nRows · num ≡ 0  (mod den · nCols)
 */
export function rowPeriod(num: number, den: number, nCols: number): number {
  if (num === 0) return 1;
  const m = den * nCols;
  return m / gcd(Math.abs(num), m);
}

export function runningBondLayout(p: RunningBondParams): PatternLayout {
  if (!(p.lengthMm > 0) || !(p.widthMm > 0)) {
    throw new RangeError(
      `runningBond: lengthMm and widthMm must be > 0 (got ${p.lengthMm} × ${p.widthMm})`,
    );
  }
  if (p.jointMm < 0 || p.jointMm * 2 >= Math.min(p.lengthMm, p.widthMm)) {
    throw new RangeError(
      `runningBond: jointMm ${p.jointMm} does not fit inside the ${Math.min(p.lengthMm, p.widthMm)} mm module`,
    );
  }
  const den = Math.max(1, Math.round(p.offsetDen));
  const num = Math.round(p.offsetNum) % den;
  const nCols = Math.max(1, Math.round(p.repeatX));
  const nRows = rowPeriod(num, den, nCols) * Math.max(1, Math.round(p.repeatY));
  const cellWidthMm = nCols * p.lengthMm;
  const cellHeightMm = nRows * p.widthMm;
  const inset = p.jointMm / 2;

  const pieces: Piece[] = [];
  let index = 0;
  for (let r = 0; r < nRows; r++) {
    const off = ((r * num) / den) * p.lengthMm;
    for (let c = 0; c < nCols; c++) {
      pieces.push(
        rectPiece(
          index++,
          off + (c + 0.5) * p.lengthMm,
          (r + 0.5) * p.widthMm,
          p.lengthMm,
          p.widthMm,
          0,
          inset,
        ),
      );
    }
  }
  const pieceAreaMm2 = pieces.reduce((s, pc) => s + Math.abs(polygonArea(pc.poly)), 0);
  return { cellWidthMm, cellHeightMm, pieces, pieceAreaMm2 };
}
