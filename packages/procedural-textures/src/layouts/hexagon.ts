// §PROCEDURAL-PATTERNS (L-1802) — HEXAGON TILE.
//
// Point-up hexagons on the standard staggered lattice. `acrossFlatsMm` is the
// FLAT-TO-FLAT dimension, which is how hexagon tile is actually sold (a "200 mm
// hex" is 200 mm across the flats, not across the points).
//
// ⭐ The repeat unit is NOT one hexagon and is the reason this pattern is a common
// seam bug: with circumradius R = acrossFlats / \u221a3, the exact cell is
// `acrossFlats \u00d7 3R` — TWO rows, because the odd rows are offset by half a flat.
// A generator that repeated one row produces a texture that tiles and a floor whose
// stagger inverts every course.

import { hexPiece, polygonArea, type PatternLayout, type Piece } from '../core/Piece.js';

export interface HexagonParams {
  /** Flat-to-flat module, mm (tile + grout). */
  readonly acrossFlatsMm: number;
  /** Grout width, mm. Taken out of the module. */
  readonly groutMm: number;
  readonly repeatX?: number;
  readonly repeatY?: number;
}

export function hexagonLayout(p: HexagonParams): PatternLayout {
  const A = p.acrossFlatsMm;
  if (!(A > 0)) throw new RangeError(`hexagon: acrossFlatsMm must be > 0 (got ${A})`);
  if (p.groutMm < 0 || p.groutMm >= A / 2) {
    throw new RangeError(`hexagon: groutMm ${p.groutMm} does not fit inside a ${A} mm hexagon`);
  }
  const R = A / Math.sqrt(3);
  const rowPitch = 1.5 * R;
  const nx = Math.max(1, Math.round(p.repeatX ?? 2));
  const ny = 2 * Math.max(1, Math.round(p.repeatY ?? 1));
  const cellWidthMm = nx * A;
  const cellHeightMm = ny * rowPitch;
  const inset = p.groutMm / 2;

  const pieces: Piece[] = [];
  let index = 0;
  for (let r = 0; r < ny; r++) {
    const xOff = r % 2 === 0 ? 0 : A / 2;
    for (let c = 0; c < nx; c++) {
      pieces.push(hexPiece(index++, xOff + (c + 0.5) * A, (r + 0.5) * rowPitch, A, inset));
    }
  }
  const pieceAreaMm2 = pieces.reduce((s, pc) => s + Math.abs(polygonArea(pc.poly)), 0);
  return { cellWidthMm, cellHeightMm, pieces, pieceAreaMm2 };
}
