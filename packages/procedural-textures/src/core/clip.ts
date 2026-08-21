// §PROCEDURAL-PATTERNS (L-1801) — convex clipping, needed by the panel layouts.
//
// A Versailles panel is a FRAME with a woven field inside it, and the field's boards
// run past the frame. Without clipping those boards would overlap the frame, and the
// rasteriser would report `overlapPx > 0` — which is exactly the signal the seam test
// keys on. So the panel clips rather than hoping.

import { halfPlanes, polygonArea, type HalfPlane, type Piece } from './Piece.js';

/** Sutherland–Hodgman against inward half-planes. Convex in ⇒ convex out. */
export function clipConvex(poly: readonly number[], planes: readonly HalfPlane[]): number[] {
  let cur = poly.slice();
  for (const p of planes) {
    if (cur.length === 0) return [];
    const next: number[] = [];
    const n = cur.length / 2;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const xi = cur[i * 2] as number;
      const yi = cur[i * 2 + 1] as number;
      const xj = cur[j * 2] as number;
      const yj = cur[j * 2 + 1] as number;
      const di = p.nx * xi + p.ny * yi + p.d;
      const dj = p.nx * xj + p.ny * yj + p.d;
      if (di >= 0) next.push(xi, yi);
      if (di >= 0 !== dj >= 0) {
        const t = di / (di - dj);
        next.push(xi + (xj - xi) * t, yi + (yj - yi) * t);
      }
    }
    cur = next;
  }
  return cur;
}

/**
 * Clip a piece to a convex region, preserving its grain axis and local frame.
 * Returns `null` when nothing survives, or when the survivor is a sliver too small
 * to be a real board (below `minAreaMm2`) — a sliver is a joinery defect, not a piece.
 */
export function clipPiece(
  piece: Piece,
  planes: readonly HalfPlane[],
  minAreaMm2 = 4,
): Piece | null {
  const poly = clipConvex(piece.poly, planes);
  if (poly.length < 6) return null;
  if (Math.abs(polygonArea(poly)) < minAreaMm2) return null;
  return { ...piece, poly };
}

export function regionPlanes(poly: readonly number[]): HalfPlane[] {
  return halfPlanes(poly);
}

/** Shrink a convex polygon by `d` mm on every side — the joint, for non-rectangles. */
export function insetPolygon(poly: readonly number[], d: number): number[] {
  if (d <= 0) return poly.slice();
  const planes = halfPlanes(poly).map((h) => ({ nx: h.nx, ny: h.ny, d: h.d - d }));
  return clipConvex(poly, planes);
}
