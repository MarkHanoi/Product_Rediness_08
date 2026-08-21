// §PROCEDURAL-PATTERNS (L-1801) — BASKET WEAVE (and its tile cousin).
//
// Bundles of `staveCount` staves, alternating orientation on a checkerboard. The
// bundle is SQUARE by construction — side `staveCount × module` — which is why a
// basket weave is specified by stave width and count, never by a free length: the
// length is derived, and a length that disagrees with the derivation is a mistake
// worth refusing rather than silently rounding.
//
// Exact repeat cell: 2 bundles × 2 bundles, because the checkerboard has period 2.

import { rectPiece, polygonArea, type PatternLayout, type Piece } from '../core/Piece.js';

export interface BasketWeaveParams {
  /** Stave WIDTH module, mm (stave + joint). */
  readonly staveWidthMm: number;
  /** Staves per bundle. 2 and 3 are the traditional weaves. */
  readonly staveCount: number;
  readonly jointMm: number;
  /** Optional cross-check on the derived bundle side. Refuses with both numbers. */
  readonly staveLengthMm?: number;
  readonly repeat?: number;
}

export function basketWeaveLayout(p: BasketWeaveParams): PatternLayout {
  const count = Math.round(p.staveCount);
  if (!(count >= 2)) {
    throw new RangeError(`basketWeave: staveCount must be \u2265 2 (got ${p.staveCount})`);
  }
  const W = p.staveWidthMm;
  if (!(W > 0)) throw new RangeError(`basketWeave: staveWidthMm must be > 0 (got ${W})`);
  const side = W * count;
  if (p.staveLengthMm !== undefined && Math.abs(p.staveLengthMm - side) > 1) {
    throw new RangeError(
      `basketWeave: staveLengthMm ${p.staveLengthMm} mm contradicts the derived bundle side ` +
        `${W} mm \u00d7 ${count} = ${side} mm. A basket weave bundle is square by construction; ` +
        `both numbers are quoted because one of them is the one you meant to change.`,
    );
  }
  if (p.jointMm < 0 || p.jointMm * 2 >= W) {
    throw new RangeError(`basketWeave: jointMm ${p.jointMm} does not fit inside a ${W} mm stave`);
  }
  const rep = Math.max(1, Math.round(p.repeat ?? 1));
  const nBundles = 2 * rep;
  const cellWidthMm = nBundles * side;
  const cellHeightMm = nBundles * side;
  const inset = p.jointMm / 2;

  const pieces: Piece[] = [];
  let index = 0;
  for (let j = 0; j < nBundles; j++) {
    for (let i = 0; i < nBundles; i++) {
      const horizontal = (i + j) % 2 === 0;
      const x0 = i * side;
      const y0 = j * side;
      for (let k = 0; k < count; k++) {
        if (horizontal) {
          pieces.push(
            rectPiece(index++, x0 + side / 2, y0 + (k + 0.5) * W, side, W, 0, inset),
          );
        } else {
          pieces.push(
            rectPiece(index++, x0 + (k + 0.5) * W, y0 + side / 2, side, W, Math.PI / 2, inset),
          );
        }
      }
    }
  }
  const pieceAreaMm2 = pieces.reduce((s, pc) => s + Math.abs(polygonArea(pc.poly)), 0);
  return { cellWidthMm, cellHeightMm, pieces, pieceAreaMm2 };
}
