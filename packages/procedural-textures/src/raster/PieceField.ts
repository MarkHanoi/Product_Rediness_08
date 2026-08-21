// §PROCEDURAL-PATTERNS (L-1803) — rasterise a PatternLayout onto a TORUS.
//
// ─── The seamlessness argument, stated before the code, because it IS the code ──
// A tiling texture is a function on a TORUS, not on a rectangle. This rasteriser
// never clips to the image: it walks each piece's UNWRAPPED pixel window and writes
// through `((p % n) + n) % n`. A piece running off the right edge lands on the left
// edge of the SAME buffer at the same sub-pixel phase, automatically.
//
// ⭐ Consequence: seamlessness is not a post-process, a mirror or a blend — it is a
// property of the write, and it is CHECKABLE AS A NUMBER. If the layout tiles the
// repeat cell exactly then `overlapPx === 0` and `coveredPx` matches the analytic
// piece area. A layout that does not close reports one or the other wrong.
//
// ⚠ Matching edge PIXELS is the weak form of the claim and this package does not
// rest on it — see `__tests__/seamless.test.ts` arm C, which shifts the sampling
// origin by half a cell and requires the result to equal the image ROLLED by half
// its pixels. Only a pattern that genuinely wraps survives that.
//
// ─── Why `edgeMm` is SIGNED ────────────────────────────────────────────────────
// A 1.5 mm joint at 0.85 px/mm is 1.3 px, and a 0.3 mm parquet joint is a fraction
// of a pixel at any sane texture size. A binary inside/outside test drops those
// joints entirely at some resolutions and doubles them at others — the joint would
// come and go with the texture size, which is the least defensible failure mode
// available. So the field stores the SIGNED distance to the nearest piece edge and
// the shading pass resolves the joint with sub-pixel coverage. ⭐ Grout is not a
// detail: a tile floor without grout lines is a coloured plane.

import { halfPlanes, type PatternLayout, type Piece } from '../core/Piece.js';

/** Per-pixel decomposition of the pattern. All arrays are `width * height`. */
export interface PieceField {
  readonly width: number;
  readonly height: number;
  readonly cellWidthMm: number;
  readonly cellHeightMm: number;
  readonly pxPerMmX: number;
  readonly pxPerMmY: number;
  /** Index of the covering piece, or -1 for a JOINT pixel (grout / gap). */
  readonly pieceIndex: Int32Array;
  /** Signed mm along the piece's grain axis, from the piece centre. */
  readonly alongMm: Float32Array;
  /** Signed mm across the piece's grain axis, from the piece centre. */
  readonly acrossMm: Float32Array;
  /** Signed distance to the nearest piece edge, mm. > 0 inside a piece, < 0 in a joint. */
  readonly edgeMm: Float32Array;
  readonly pieces: readonly Piece[];
  /** Pixel centres strictly inside some piece. */
  readonly coveredPx: number;
  /** Pixel centres inside MORE than one piece. A tiling layout must report 0. */
  readonly overlapPx: number;
}

export interface RasterOptions {
  /** Longest texture dimension in pixels. */
  readonly resolution: number;
  /**
   * Sampling-origin offset in mm. Used by the translation-equivariance arm of the
   * seam test; production callers leave it at 0.
   */
  readonly originXMm?: number;
  readonly originYMm?: number;
}

const mod = (a: number, n: number): number => ((a % n) + n) % n;

export function rasterizeLayout(layout: PatternLayout, opts: RasterOptions): PieceField {
  const { cellWidthMm, cellHeightMm, pieces } = layout;
  const longest = Math.max(cellWidthMm, cellHeightMm);
  const scale = opts.resolution / longest;
  const width = Math.max(4, Math.round(cellWidthMm * scale));
  const height = Math.max(4, Math.round(cellHeightMm * scale));
  // Derived AFTER rounding so `width` pixels is EXACTLY `cellWidthMm`. The wrap and
  // the mm↔px map must agree to the last pixel or the seam comes straight back.
  const pxPerMmX = width / cellWidthMm;
  const pxPerMmY = height / cellHeightMm;
  const ox = opts.originXMm ?? 0;
  const oy = opts.originYMm ?? 0;
  // How far OUTSIDE a piece we still record a distance: two pixels is enough for
  // sub-pixel joint coverage plus the bevel ramp's outer foot.
  const reachMm = 2 / Math.min(pxPerMmX, pxPerMmY);

  const n = width * height;
  const pieceIndex = new Int32Array(n).fill(-1);
  const alongMm = new Float32Array(n);
  const acrossMm = new Float32Array(n);
  const edgeMm = new Float32Array(n);
  const outside = new Float32Array(n).fill(-Infinity);
  const claimed = new Uint8Array(n);
  let coveredPx = 0;
  let overlapPx = 0;

  for (const piece of pieces) {
    const hp = halfPlanes(piece.poly);
    if (hp.length === 0) continue;
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (let i = 0; i < piece.poly.length; i += 2) {
      const x = piece.poly[i] as number;
      const y = piece.poly[i + 1] as number;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
    const pad = reachMm + 1 / Math.min(pxPerMmX, pxPerMmY);
    const px0 = Math.floor((minX - pad - ox) * pxPerMmX);
    const px1 = Math.ceil((maxX + pad - ox) * pxPerMmX);
    const py0 = Math.floor((minY - pad - oy) * pxPerMmY);
    const py1 = Math.ceil((maxY + pad - oy) * pxPerMmY);

    for (let py = py0; py <= py1; py++) {
      const yMm = (py + 0.5) / pxPerMmY + oy;
      const rowBase = mod(py, height) * width;
      for (let px = px0; px <= px1; px++) {
        const xMm = (px + 0.5) / pxPerMmX + ox;
        let dist = Infinity;
        for (let k = 0; k < hp.length; k++) {
          const h = hp[k] as { nx: number; ny: number; d: number };
          const v = h.nx * xMm + h.ny * yMm + h.d;
          if (v < dist) dist = v;
          if (dist <= -reachMm) break;
        }
        if (dist <= -reachMm) continue;
        const idx = rowBase + mod(px, width);
        if (dist < 0) {
          // Outside this piece but within reach — keep the CLOSEST approach so the
          // joint's sub-pixel coverage and the bevel foot are correct.
          if (dist > (outside[idx] as number)) outside[idx] = dist;
          continue;
        }
        if (claimed[idx] === 1) {
          // ⚠ A pixel CENTRE landing exactly on a shared edge is a sampling
          // coincidence of measure zero, not two pieces occupying one area: two
          // polygons that abut share an edge by construction. Real overlap means
          // both pieces claim the pixel STRICTLY inside, so that is what is counted.
          if (dist > 0 && (edgeMm[idx] as number) > 0) overlapPx++;
          // Deepest-interior wins, so the result does not depend on piece order.
          if (dist <= (edgeMm[idx] as number)) continue;
        } else {
          claimed[idx] = 1;
          coveredPx++;
        }
        pieceIndex[idx] = piece.index;
        const dx = xMm - piece.cx;
        const dy = yMm - piece.cy;
        alongMm[idx] = dx * piece.alongX + dy * piece.alongY;
        acrossMm[idx] = -dx * piece.alongY + dy * piece.alongX;
        edgeMm[idx] = dist;
      }
    }
  }

  for (let i = 0; i < n; i++) {
    if (claimed[i] === 0) {
      const o = outside[i] as number;
      edgeMm[i] = o === -Infinity ? -reachMm : o;
    }
  }

  return {
    width,
    height,
    cellWidthMm,
    cellHeightMm,
    pxPerMmX,
    pxPerMmY,
    pieceIndex,
    alongMm,
    acrossMm,
    edgeMm,
    pieces,
    coveredPx,
    overlapPx,
  };
}
