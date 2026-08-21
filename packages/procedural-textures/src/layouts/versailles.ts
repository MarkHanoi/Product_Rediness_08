// §PROCEDURAL-PATTERNS (L-1801) — VERSAILLES PANEL.
//
// ⚠ STATED HONESTLY, BECAUSE THE NAME IS A CLAIM: this is a STYLISED Versailles
// panel — a mitred four-board frame enclosing a 45\u00b0 woven field — and NOT a
// measured reproduction of the Ch\u00e2teau de Versailles panneau, whose interior
// lattice is a specific interlaced diamond that this generator does not attempt.
// It reads as a Versailles panel and it is buildable; it is not a facsimile. The
// gap is named here rather than left for someone to discover in a render.
//
// ⭐ The reuse that made it cheap: the interior is the SAME herringbone lattice as
// `herringbone.ts`, rotated 45\u00b0 and CLIPPED to the panel opening. That is why
// this file is short. Clipping is also why it is correct: without it the field
// boards would overlap the frame, and the rasteriser's `overlapPx` would say so.

import { rectPiece, rotatePiece, polyPiece, polygonArea, type PatternLayout, type Piece } from '../core/Piece.js';
import { clipPiece, insetPolygon, regionPlanes } from '../core/clip.js';

export interface VersaillesParams {
  /** Panel module, mm, edge to edge. Traditional panels are ~800–1000 mm square. */
  readonly panelSizeMm: number;
  /** Frame board width, mm. */
  readonly frameWidthMm: number;
  /** Interior stave WIDTH module, mm. */
  readonly staveWidthMm: number;
  /** Whole-number length:width ratio of the interior staves. */
  readonly lengthRatio: number;
  readonly jointMm: number;
  readonly repeat?: number;
}

export function versaillesLayout(p: VersaillesParams): PatternLayout {
  const P = p.panelSizeMm;
  const F = p.frameWidthMm;
  const n = Math.round(p.lengthRatio);
  if (!(P > 0) || !(F > 0) || F * 2 >= P) {
    throw new RangeError(
      `versailles: frameWidthMm ${F} must be > 0 and leave an opening inside panelSizeMm ${P}`,
    );
  }
  if (!(n >= 2) || Math.abs(n - p.lengthRatio) > 1e-9) {
    throw new RangeError(`versailles: lengthRatio must be a whole number \u2265 2 (got ${p.lengthRatio})`);
  }
  if (!(p.staveWidthMm > 0)) throw new RangeError(`versailles: staveWidthMm must be > 0`);
  const inset = p.jointMm / 2;
  const rep = Math.max(1, Math.round(p.repeat ?? 1));
  const cellWidthMm = P * rep;
  const cellHeightMm = P * rep;

  const pieces: Piece[] = [];
  let index = 0;

  for (let py = 0; py < rep; py++) {
    for (let px = 0; px < rep; px++) {
      const bx = px * P;
      const by = py * P;
      // ── The mitred frame: four trapezoids meeting on the 45° corner lines. ──
      const frames: Array<{ poly: number[]; ax: number; ay: number }> = [
        { poly: [bx, by, bx + P, by, bx + P - F, by + F, bx + F, by + F], ax: 1, ay: 0 },
        { poly: [bx + P, by, bx + P, by + P, bx + P - F, by + P - F, bx + P - F, by + F], ax: 0, ay: 1 },
        { poly: [bx + P, by + P, bx, by + P, bx + F, by + P - F, bx + P - F, by + P - F], ax: 1, ay: 0 },
        { poly: [bx, by + P, bx, by, bx + F, by + F, bx + F, by + P - F], ax: 0, ay: 1 },
      ];
      for (const f of frames) {
        const poly = insetPolygon(f.poly, inset);
        if (poly.length >= 6) pieces.push(polyPiece(index++, poly, f.ax, f.ay));
      }

      // ── The opening, and the 45° herringbone field clipped into it. ──
      const o0 = bx + F;
      const o1 = bx + P - F;
      const q0 = by + F;
      const q1 = by + P - F;
      const opening = insetPolygon([o0, q0, o1, q0, o1, q1, o0, q1], inset);
      if (opening.length < 6) continue;
      const planes = regionPlanes(opening);
      const cx = bx + P / 2;
      const cy = by + P / 2;
      const W = p.staveWidthMm;
      const L = W * n;
      // Enough lattice cosets to cover the rotated opening's circumradius.
      const reach = Math.ceil((P * Math.SQRT2) / (2 * W)) + n + 2;
      for (let a = -reach; a <= reach; a++) {
        for (let b = -reach; b <= reach; b++) {
          const tx = -a + b * (n + 1);
          const ty = a + b * (n - 1);
          if (Math.abs(tx) > reach + n + 1 || Math.abs(ty) > reach + n + 1) continue;
          const hx = cx + (tx + n / 2) * W - (P * Math.SQRT2) / 2;
          const hy = cy + (ty + 0.5) * W - (P * Math.SQRT2) / 2;
          const vx = cx + (tx + n + 0.5) * W - (P * Math.SQRT2) / 2;
          const vy = cy + (ty + n / 2) * W - (P * Math.SQRT2) / 2;
          const h = rotatePiece(rectPiece(0, hx, hy, L, W, 0, inset), Math.PI / 4, cx, cy);
          const v = rotatePiece(rectPiece(0, vx, vy, L, W, Math.PI / 2, inset), Math.PI / 4, cx, cy);
          for (const piece of [h, v]) {
            const clipped = clipPiece(piece, planes, W * W * 0.02);
            if (clipped) pieces.push({ ...clipped, index: index++ });
          }
        }
      }
    }
  }

  const pieceAreaMm2 = pieces.reduce((s, pc) => s + Math.abs(polygonArea(pc.poly)), 0);
  return { cellWidthMm, cellHeightMm, pieces, pieceAreaMm2 };
}
