// §PROCEDURAL-PATTERNS (L-1801) — CHEVRON / HUNGARIAN POINT.
//
// ⭐ ONE generator, two names, and that is a finding rather than a shortcut.
// "Chevron" and "point de Hongrie" (Hungarian point) are the SAME joinery: boards
// MITRED at both ends so that two mirrored boards butt into a continuous V with no
// end grain showing. The trade distinguishes them only by mitre angle — 45° is
// normally called chevron, 60° Hungarian point. Minting two generators would have
// minted two seam bugs for one geometry, so the angle is a parameter and the two
// names are PRESETS. ⚠ The real distinction worth encoding is chevron vs
// HERRINGBONE: herringbone blocks are sawn square and offset; chevron blocks are
// mitred and meet point to point. Different file, different arithmetic.
//
// ─── Why the mitre is exactly the lay angle ────────────────────────────────────
// A board on the axis (cos θ, sin θ) mitred by θ has an end face whose direction is
//     tanθ·(cos θ, sin θ) + (−sin θ, cos θ) = (0, 1/cos θ)
// i.e. VERTICAL, for every θ. That is what lets the two families butt along a
// straight apex line, and it is why the mitre is not a free parameter.
//
// ─── The tiling ────────────────────────────────────────────────────────────────
// Strips of width L·cos θ alternate family (+θ, −θ). Inside a strip the boards are
// parallelograms with vertical ends of height p = W / cos θ, so they stack by a
// pure VERTICAL translation of p — no horizontal drift, so the apex line stays
// straight. Both families use the same y formula, which is why the V closes.
// Exact repeat cell: (2·L·cos θ) × p.

import { mitredPiece, polygonArea, type PatternLayout, type Piece } from '../core/Piece.js';

export interface ChevronParams {
  /** Board WIDTH module, mm (board width + joint), measured across the board. */
  readonly staveWidthMm: number;
  /** Board LENGTH along its centreline, mm. Free — chevron has no integer constraint. */
  readonly staveLengthMm: number;
  /** Lay angle from the horizontal, degrees. 45 = chevron, 60 = Hungarian point. */
  readonly angleDeg: number;
  readonly jointMm: number;
  /** Horizontal repeats of the intrinsic 2·L·cosθ period. */
  readonly repeatX?: number;
  /** Vertical repeats of the intrinsic W/cosθ period. */
  readonly repeatY?: number;
}

export function chevronLayout(p: ChevronParams): PatternLayout {
  const theta = (p.angleDeg * Math.PI) / 180;
  if (!(p.angleDeg > 5 && p.angleDeg < 85)) {
    throw new RangeError(
      `chevron: angleDeg must lie in (5, 85) (got ${p.angleDeg}). ` +
        `Outside that the mitre approaches a feather edge and the board is not buildable.`,
    );
  }
  const W = p.staveWidthMm;
  const L = p.staveLengthMm;
  if (!(W > 0) || !(L > 0)) {
    throw new RangeError(`chevron: staveWidthMm and staveLengthMm must be > 0 (got ${W}, ${L})`);
  }
  if (p.jointMm < 0 || p.jointMm * 2 >= W) {
    throw new RangeError(`chevron: jointMm ${p.jointMm} does not fit inside a ${W} mm board`);
  }
  const c = Math.cos(theta);
  const strideX = L * c; // one strip
  const pitchY = W / c; // vertical stacking pitch
  const nStrips = 2 * Math.max(1, Math.round(p.repeatX ?? 1));
  const nRows = Math.max(1, Math.round(p.repeatY ?? 1));
  const cellWidthMm = nStrips * strideX;
  const cellHeightMm = nRows * pitchY;
  const inset = p.jointMm / 2;

  const pieces: Piece[] = [];
  let index = 0;
  for (let s = 0; s < nStrips; s++) {
    const sign = s % 2 === 0 ? 1 : -1;
    for (let k = 0; k < nRows; k++) {
      const cx = (s + 0.5) * strideX;
      const cy = k * pitchY + pitchY / 2 - (L * Math.sin(theta)) / 2;
      pieces.push(
        mitredPiece(index++, cx, cy, L, W, sign * theta, sign * theta, inset),
      );
    }
  }
  const pieceAreaMm2 = pieces.reduce((s, pc) => s + Math.abs(polygonArea(pc.poly)), 0);
  return { cellWidthMm, cellHeightMm, pieces, pieceAreaMm2 };
}
