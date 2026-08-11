// @pryzm/ai-worker — PDF-to-BIM TIER 2: algorithmic raster fallback
// (§RASTER-CV, PDF-TO-BIM-AUDIT-2026-08-10 §7).
//
// WHY THIS EXISTS
// ---------------
// Tier 1 (stage1-vectorise + stage2-walls + stage2-openings) is deterministic
// and exact, but it only fires when the PDF carries vector line-work. Scanned
// plans and JPG/PNG uploads have none. Before this module the ONLY fallback was
// the Claude vision relay — and production has neither CF_WORKER_URL nor
// ANTHROPIC_API_KEY, so for a scanned plan the product produced nothing at all.
//
// This is a classical-CV pipeline, pure TypeScript, ZERO external dependencies,
// ZERO tokens:
//
//   RGBA raster
//     └─ grayscale → Otsu threshold → binary ink mask
//        └─ morphological open (despeckle) + close (bridge dashes)
//           └─ boundary extraction   (ink pixels touching background)
//              └─ Hough line accumulator → peaks → segment walking
//                 └─ VectorElement[] line primitives  ← THE SEAM
//                    └─ classifyWallsAndColumns()      (stage2-walls, REUSED)
//                       └─ mergeCollinearWallRuns()    → walls that run THROUGH
//                          │                             door/window gaps
//                          └─ gap classification: band-ink → window (glazing),
//                             annulus arc probe → door, else honest low
//                             confidence
//                             └─ OpeningCandidate[]     (same type as tier 1)
//                                └─ vectorResultToFloorPlanAnalysis()
//
// The seam is deliberate: we feed LINE PRIMITIVES into the existing tier-1
// classifiers rather than writing a second wall model. Wall thickness ranges,
// overlap minima and confidence formulas therefore have exactly one definition
// (stage2-walls.ts) for both tiers.
//
// §CONTEXT-DATA-HONESTY — every rejection is COUNTED in `RasterDiagnostics`,
// never silently dropped. A gap that is the wrong size, or has no arc and no
// glazing, does not become an invented door: it is reported as `gapsRejected`.
//
// PURE — no DOM, no THREE, no native deps. The caller rasterises (browser
// canvas) and hands over an RGBA byte array.

import type {
  OpeningCandidate,
  VectorElement,
  WallCandidate,
} from './types.js';
import { classifyWallsAndColumns } from './stage2-walls.js';
import type { Affine2D } from './adapter-floorplan.js';

// ─── Public option surface ────────────────────────────────────────────────

export interface RasterCvOptions {
  /** Longest edge the CV stage runs at. Larger inputs are box-downsampled;
   *  results are reported back in millimetres, so the caller never sees the
   *  working resolution. Keeps Hough O(edgePixels × θ) bounded. */
  readonly maxWorkingDim: number;
  /** Ink threshold override (0–255). Omit to use Otsu. */
  readonly threshold?: number;
  /** Number of Hough θ bins over [0, π). 180 ⇒ 1° resolution. */
  readonly thetaBins: number;
  /** Shortest line (working px) accepted as a primitive. */
  readonly minLineLengthPx: number;
  /** Max collinear gap (working px) bridged while walking one Hough peak.
   *  Small — real openings are found later, from wall-run breaks. */
  readonly maxWalkGapPx: number;
  /** Perpendicular tolerance (working px) for a pixel to belong to a peak. */
  readonly lineDistTolPx: number;
  /** Cap on Hough peaks examined (highest-vote first). */
  readonly maxPeaks: number;
  /** Thinnest wall (working px) this raster can actually RESOLVE. A pair of
   *  faces closer than this is not a wall: it is stroke width, JPEG ringing, or
   *  a Hough θ-smear peak lying a pixel off a real edge. The shared stage-2
   *  classifier's floor is in MILLIMETRES (50 mm) and cannot express this —
   *  at a coarse raster 50 mm can be a single pixel. */
  readonly minWallThicknessPx: number;
  /** Ink pixels with fewer 8-neighbours than this are dropped as speckle. */
  readonly speckleMinNeighbours: number;
  /** Collinearity tolerance when merging wall runs — radians. */
  readonly mergeAngleTolRad: number;
  /** Max lateral offset (mm) between two wall candidates on one run. */
  readonly mergeLateralTolMm: number;
  /** Max gap (mm) bridged when merging a wall run — an opening wider than
   *  this is treated as two separate walls, not one wall with a hole. */
  readonly maxOpeningGapMm: number;
  /** Smallest break (mm) recorded as a candidate opening site. Below this a
   *  break is a segment-walking artefact (the Hough walk splits a face at any
   *  `maxWalkGapPx` dropout), not a hole in a wall. Recording those would bury
   *  the honest `too_narrow` count under raster noise. */
  readonly minRecordedGapMm: number;
  /** Door opening width window (mm). */
  readonly doorWidthMinMm: number;
  readonly doorWidthMaxMm: number;
  /** Window opening width window (mm). */
  readonly windowWidthMinMm: number;
  readonly windowWidthMaxMm: number;
  /** Ink fraction inside the gap band above which the gap is read as GLAZED
   *  (window) rather than empty (door). */
  readonly glazingInkFraction: number;
  /** Minimum contiguous arc span (radians) at the swing radius for the
   *  annulus probe to call a door arc. */
  readonly arcMinSpanRad: number;
  /** Fraction of annulus samples that must be ink inside the best run. */
  readonly arcMinCoverage: number;
}

export const DEFAULT_RASTER_CV_OPTIONS: RasterCvOptions = {
  maxWorkingDim: 1400,
  thetaBins: 180,
  minLineLengthPx: 24,
  maxWalkGapPx: 6,
  lineDistTolPx: 1.6,
  maxPeaks: 400,
  minWallThicknessPx: 4,
  speckleMinNeighbours: 2,
  mergeAngleTolRad: (4 * Math.PI) / 180,
  mergeLateralTolMm: 90,
  // Above the 4000 mm window ceiling on purpose, so a gap between the two is
  // RECORDED and honestly rejected as `too_wide` rather than never merged and
  // therefore never counted at all.
  maxOpeningGapMm: 4500,
  minRecordedGapMm: 50,
  doorWidthMinMm: 550,
  doorWidthMaxMm: 1500,
  windowWidthMinMm: 400,
  windowWidthMaxMm: 4000,
  glazingInkFraction: 0.14,
  arcMinSpanRad: (50 * Math.PI) / 180,
  arcMinCoverage: 0.55,
};

/** Confidence assigned to each opening class. Deliberately conservative:
 *  a gap with no corroborating symbol lands in the `'low'` band so the
 *  wizard and the review queue can see it for what it is. */
export const RASTER_CONF_DOOR_WITH_ARC = 0.82;
export const RASTER_CONF_WINDOW_GLAZED = 0.74;
export const RASTER_CONF_GAP_ONLY = 0.5;

export const RASTER_OTEL_NAMESPACE = 'pryzm.pdf.raster' as const;

// ─── Image types ──────────────────────────────────────────────────────────

export interface GrayImage {
  readonly data: Uint8Array;
  readonly width: number;
  readonly height: number;
}

/** 1 = ink (dark), 0 = background. */
export interface BinaryMask {
  readonly data: Uint8Array;
  readonly width: number;
  readonly height: number;
}

/** A straight stroke found by the Hough stage, in working-pixel space. */
export interface LineSegmentPx {
  readonly x1: number;
  readonly y1: number;
  readonly x2: number;
  readonly y2: number;
  /** Hough votes backing this peak — a rough support measure. */
  readonly votes: number;
}

// ─── Stage 1: grayscale, threshold, morphology ────────────────────────────

/** ITU-R BT.601 luma. Alpha is composited over white — a transparent PNG's
 *  background must read as paper, not as ink. */
export function rgbaToGray(
  rgba: ArrayLike<number>,
  width: number,
  height: number,
): GrayImage {
  const n = width * height;
  const out = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const o = i * 4;
    const a = rgba[o + 3]! / 255;
    const r = rgba[o]! * a + 255 * (1 - a);
    const g = rgba[o + 1]! * a + 255 * (1 - a);
    const b = rgba[o + 2]! * a + 255 * (1 - a);
    out[i] = (0.299 * r + 0.587 * g + 0.114 * b) | 0;
  }
  return { data: out, width, height };
}

/** Box-downsample so the longest edge is ≤ `maxDim`. Returns the integer-free
 *  scale factor actually applied (`1` when no resampling was needed). */
export function downsampleGray(
  gray: GrayImage,
  maxDim: number,
): { readonly image: GrayImage; readonly factor: number } {
  const longest = Math.max(gray.width, gray.height);
  if (longest <= maxDim || maxDim <= 0) return { image: gray, factor: 1 };
  const factor = longest / maxDim;
  const w = Math.max(1, Math.round(gray.width / factor));
  const h = Math.max(1, Math.round(gray.height / factor));
  const out = new Uint8Array(w * h);
  const sx = gray.width / w;
  const sy = gray.height / h;
  for (let y = 0; y < h; y++) {
    const y0 = Math.floor(y * sy);
    const y1 = Math.min(gray.height, Math.max(y0 + 1, Math.floor((y + 1) * sy)));
    for (let x = 0; x < w; x++) {
      const x0 = Math.floor(x * sx);
      const x1 = Math.min(gray.width, Math.max(x0 + 1, Math.floor((x + 1) * sx)));
      // MIN, not mean: thin dark strokes must survive downsampling. A mean
      // filter dissolves a 1 px wall face into the paper and the whole plan
      // vanishes at tier 2 — the classic reason "the scan found nothing".
      let m = 255;
      for (let yy = y0; yy < y1; yy++) {
        const row = yy * gray.width;
        for (let xx = x0; xx < x1; xx++) {
          const v = gray.data[row + xx]!;
          if (v < m) m = v;
        }
      }
      out[y * w + x] = m;
    }
  }
  return { image: { data: out, width: w, height: h }, factor: gray.width / w };
}

/**
 * Otsu's method — the between-class-variance maximising threshold.
 *
 * Returns the FIRST BACKGROUND level, i.e. the value `binarize` compares with
 * `<`. Otsu itself maximises over splits `[0..t] | [t+1..255]`, so the answer
 * is `t + 1`. That +1 is load-bearing, not cosmetic: pure black-on-white
 * line-work has all its ink at 0, every split from t=0 upward scores
 * identically, and the strict `>` in the argmax keeps the FIRST one — t = 0.
 * Returning 0 with a `<` test classifies nothing as ink, and the entire tier
 * silently reports a blank page for a perfectly good plan.
 */
export function otsuThreshold(gray: GrayImage): number {
  const hist = new Float64Array(256);
  for (let i = 0; i < gray.data.length; i++) hist[gray.data[i]!]! += 1;
  const total = gray.data.length;
  if (total === 0) return 128;
  let sum = 0;
  for (let t = 0; t < 256; t++) sum += t * hist[t]!;
  let sumB = 0;
  let wB = 0;
  let best = 0;
  let bestT = 128;
  for (let t = 0; t < 256; t++) {
    wB += hist[t]!;
    if (wB === 0) continue;
    const wF = total - wB;
    if (wF === 0) break;
    sumB += t * hist[t]!;
    const mB = sumB / wB;
    const mF = (sum - sumB) / wF;
    const between = wB * wF * (mB - mF) * (mB - mF);
    if (between > best) {
      best = between;
      bestT = t;
    }
  }
  return Math.min(255, bestT + 1);
}

/** Ink = strictly darker than the threshold. */
export function binarize(gray: GrayImage, threshold: number): BinaryMask {
  const out = new Uint8Array(gray.data.length);
  for (let i = 0; i < gray.data.length; i++) out[i] = gray.data[i]! < threshold ? 1 : 0;
  return { data: out, width: gray.width, height: gray.height };
}

function morph(mask: BinaryMask, dilate: boolean): BinaryMask {
  const { width: w, height: h, data } = mask;
  const out = new Uint8Array(data.length);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let hit = dilate ? 0 : 1;
      for (let dy = -1; dy <= 1 && (dilate ? !hit : hit); dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= h) {
          // Outside the frame reads as background: erosion at the border
          // clears, dilation gains nothing.
          if (!dilate) hit = 0;
          continue;
        }
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx;
          if (xx < 0 || xx >= w) {
            if (!dilate) hit = 0;
            continue;
          }
          const v = data[yy * w + xx]!;
          if (dilate) {
            if (v) { hit = 1; break; }
          } else if (!v) { hit = 0; break; }
        }
      }
      out[y * w + x] = hit ? 1 : 0;
    }
  }
  return { data: out, width: w, height: h };
}

export const dilate3 = (m: BinaryMask): BinaryMask => morph(m, true);
export const erode3 = (m: BinaryMask): BinaryMask => morph(m, false);
/** Open = erode → dilate. Removes any structure thinner than the 3×3 kernel.
 *
 *  ⚠ NOT used by the pipeline — see `despeckle`. Exported as a primitive
 *  because it is the right tool for blob masks, and as a standing warning:
 *  opening a floor plan DELETES every hairline. Door swing arcs and window
 *  glazing are drawn 1 px wide at ordinary scan resolutions, so an open pass
 *  silently removes exactly the evidence stage 4 classifies on, and the tier
 *  then reports "gap with no symbol evidence" for a perfectly drawn door. */
export const morphOpen3 = (m: BinaryMask): BinaryMask => dilate3(erode3(m));

/**
 * Salt-and-pepper despeckle: drop ink pixels with fewer than `minNeighbours`
 * ink pixels in their 8-neighbourhood.
 *
 * This is the despeckle a LINE drawing can survive. An interior pixel of any
 * stroke — even a 1 px hairline — has two neighbours along the stroke and is
 * kept; an isolated scanner dot has none and goes. Endpoints (one neighbour)
 * are shaved by a pixel, which costs nothing at these scales.
 */
export function despeckle(m: BinaryMask, minNeighbours = 2): BinaryMask {
  const { width: w, height: h, data } = m;
  const out = new Uint8Array(data.length);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (!data[i]) continue;
      let n = 0;
      for (let dy = -1; dy <= 1; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= h) continue;
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;
          const xx = x + dx;
          if (xx < 0 || xx >= w) continue;
          if (data[yy * w + xx]) n++;
        }
      }
      if (n >= minNeighbours) out[i] = 1;
    }
  }
  return { data: out, width: w, height: h };
}
/** Close = dilate → erode. Bridges hairline breaks in a stroke (dashed
 *  hatching, JPEG ringing) WITHOUT closing a real door gap — a 3×3 kernel
 *  bridges ≈2 px, three orders of magnitude below a 900 mm opening. */
export const morphClose3 = (m: BinaryMask): BinaryMask => erode3(dilate3(m));

/** Ink pixels with at least one 4-neighbour background pixel — i.e. the two
 *  FACES of every wall. Feeding faces (not fills) to Hough is what makes the
 *  existing parallel-pair wall detector work unchanged on rasters. */
export function extractBoundary(mask: BinaryMask): BinaryMask {
  const { width: w, height: h, data } = mask;
  const out = new Uint8Array(data.length);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (!data[i]) continue;
      const up = y > 0 ? data[i - w]! : 0;
      const dn = y < h - 1 ? data[i + w]! : 0;
      const lf = x > 0 ? data[i - 1]! : 0;
      const rt = x < w - 1 ? data[i + 1]! : 0;
      if (!up || !dn || !lf || !rt) out[i] = 1;
    }
  }
  return { data: out, width: w, height: h };
}

// ─── Stage 2: Hough line extraction ───────────────────────────────────────

/**
 * Standard (ρ, θ) Hough transform over the boundary mask, followed by
 * non-maximum suppression and per-peak segment walking.
 *
 * Returns maximal inked runs along each detected line — so a wall face that
 * stops at a door jamb yields TWO segments, which is exactly the evidence the
 * opening stage later reads as a gap.
 */
export function houghSegments(
  boundary: BinaryMask,
  opts: RasterCvOptions = DEFAULT_RASTER_CV_OPTIONS,
): LineSegmentPx[] {
  const { width: w, height: h, data } = boundary;
  const pts: number[] = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) if (data[y * w + x]) pts.push(x, y);
  }
  const nPts = pts.length / 2;
  if (nPts < opts.minLineLengthPx) return [];

  const nTheta = opts.thetaBins;
  const cosT = new Float64Array(nTheta);
  const sinT = new Float64Array(nTheta);
  for (let t = 0; t < nTheta; t++) {
    const a = (Math.PI * t) / nTheta;
    cosT[t] = Math.cos(a);
    sinT[t] = Math.sin(a);
  }
  const rhoMax = Math.ceil(Math.hypot(w, h));
  const nRho = 2 * rhoMax + 1;
  const acc = new Int32Array(nTheta * nRho);

  for (let p = 0; p < nPts; p++) {
    const x = pts[p * 2]!;
    const y = pts[p * 2 + 1]!;
    for (let t = 0; t < nTheta; t++) {
      const r = Math.round(x * cosT[t]! + y * sinT[t]!) + rhoMax;
      acc[t * nRho + r]! += 1;
    }
  }

  // A straight edge of length L contributes ≈L votes from one face.
  const minVotes = Math.max(8, Math.round(opts.minLineLengthPx * 0.6));
  const peaks: Array<{ t: number; r: number; v: number }> = [];
  for (let t = 0; t < nTheta; t++) {
    for (let r = 1; r < nRho - 1; r++) {
      const v = acc[t * nRho + r]!;
      if (v < minVotes) continue;
      let isMax = true;
      for (let dt = -2; dt <= 2 && isMax; dt++) {
        const tt = t + dt;
        if (tt < 0 || tt >= nTheta) continue;
        for (let dr = -2; dr <= 2; dr++) {
          if (dt === 0 && dr === 0) continue;
          const rr = r + dr;
          if (rr < 0 || rr >= nRho) continue;
          const other = acc[tt * nRho + rr]!;
          // Strictly greater wins; on an exact tie the lexicographically
          // first cell survives, so a plateau collapses to ONE peak instead
          // of emitting a fan of near-duplicate segments.
          if (other > v || (other === v && (tt < t || (tt === t && rr < r)))) {
            isMax = false;
            break;
          }
        }
      }
      if (isMax) peaks.push({ t, r: r - rhoMax, v });
    }
  }
  peaks.sort((a, b) => b.v - a.v);
  const kept = peaks.slice(0, opts.maxPeaks);

  const segments: LineSegmentPx[] = [];
  for (const pk of kept) {
    const ct = cosT[pk.t]!;
    const st = sinT[pk.t]!;
    // Direction along the line is perpendicular to (cosθ, sinθ).
    const ux = -st;
    const uy = ct;
    const proj: number[] = [];
    for (let p = 0; p < nPts; p++) {
      const x = pts[p * 2]!;
      const y = pts[p * 2 + 1]!;
      const d = x * ct + y * st - pk.r;
      if (d > opts.lineDistTolPx || d < -opts.lineDistTolPx) continue;
      proj.push(x * ux + y * uy);
    }
    if (proj.length < opts.minLineLengthPx) continue;
    proj.sort((a, b) => a - b);
    // Foot of the perpendicular from the origin — the line's anchor point.
    const ax = pk.r * ct;
    const ay = pk.r * st;
    let runStart = proj[0]!;
    let prev = proj[0]!;
    for (let i = 1; i <= proj.length; i++) {
      const cur = i < proj.length ? proj[i]! : Number.POSITIVE_INFINITY;
      if (cur - prev > opts.maxWalkGapPx) {
        const len = prev - runStart;
        if (len >= opts.minLineLengthPx) {
          segments.push({
            x1: ax + ux * runStart,
            y1: ay + uy * runStart,
            x2: ax + ux * prev,
            y2: ay + uy * prev,
            votes: pk.v,
          });
        }
        runStart = cur;
      }
      prev = cur;
    }
  }
  return segments;
}

/**
 * Wrap raster segments as tier-1 `VectorElement` lines. Coordinates stay in
 * working pixels; `classifyWallsAndColumns` multiplies by the mm-per-working-
 * pixel scale, so the two tiers share one unit convention.
 *
 * §RASTER-SEG-ORIENT — every segment is emitted in a CANONICAL direction.
 * This is load-bearing, not tidiness. `computeCenterline` in stage2-walls
 * averages the two source lines ENDPOINT-WISE (p1↔p1, p2↔p2). The Hough walk
 * orients a segment by its peak's θ bin, and the two faces of one wall can
 * land in bins on opposite sides of the [0, π) wrap (θ ≈ 0° and θ ≈ 179° for a
 * vertical wall) — walking them in OPPOSITE directions. Averaging start against
 * end then yields an X whose "centreline" is a stub across the wall's middle
 * instead of a line along it.
 *
 * The canonical axis is the segment's DOMINANT one: orient by increasing y when
 * |dy| > |dx|, else by increasing x. Sorting every segment by x alone looks
 * equivalent and is not — for two near-vertical faces whose dx differ in sign
 * by a fraction of a pixel, "increasing x" points one face UP and the other
 * DOWN, which is the very collapse this rule exists to prevent.
 */
export function segmentsToVectorElements(
  segments: readonly LineSegmentPx[],
): VectorElement[] {
  return segments.map((s) => {
    const dx = s.x2 - s.x1;
    const dy = s.y2 - s.y1;
    const flip = Math.abs(dy) > Math.abs(dx) ? dy < 0 : dx < 0 || (dx === 0 && dy < 0);
    const a: readonly [number, number] = flip ? [s.x2, s.y2] : [s.x1, s.y1];
    const b: readonly [number, number] = flip ? [s.x1, s.y1] : [s.x2, s.y2];
    return { kind: 'line' as const, points: [a, b] };
  });
}

// ─── Stage 3: wall runs and their breaks ──────────────────────────────────

/** One merged wall run plus the breaks found inside it. */
export interface WallRun {
  /** The merged wall — spans THROUGH its openings, so the batcher can host
   *  them (C15: doors/windows live inside a wall, never between two). */
  readonly wall: WallCandidate;
  /** Breaks along the run, in mm measured from the run's start. */
  readonly gaps: ReadonlyArray<{ readonly startMm: number; readonly endMm: number }>;
  /** How many source wall candidates were fused. */
  readonly memberCount: number;
}

function lineAngle(a: readonly [number, number], b: readonly [number, number]): number {
  return ((Math.atan2(b[1] - a[1], b[0] - a[0]) % Math.PI) + Math.PI) % Math.PI;
}

function angleClose(a: number, b: number, tol: number): boolean {
  const d = Math.abs(a - b);
  return d < tol || Math.abs(d - Math.PI) < tol;
}

/**
 * Fuse collinear wall candidates of similar thickness into single runs and
 * record the breaks between consecutive members.
 *
 * This is the raster answer to `DoorGapInpainter` on the AI path: a wall face
 * drawn with a door gap produces two short faces, hence two short wall pairs.
 * Left alone they would be two abutting walls with the opening BETWEEN them —
 * and an opening between two walls cannot be hosted. Merging restores the
 * single wall the drawing means, with the gap recorded as an opening site.
 */
export function mergeCollinearWallRuns(
  walls: readonly WallCandidate[],
  opts: RasterCvOptions = DEFAULT_RASTER_CV_OPTIONS,
): WallRun[] {
  interface Member {
    readonly w: WallCandidate;
    readonly a: readonly [number, number];
    readonly b: readonly [number, number];
    readonly angle: number;
  }
  const members: Member[] = [];
  for (const w of walls) {
    if (w.centerLine.length < 2) continue;
    const a = w.centerLine[0]!;
    const b = w.centerLine[w.centerLine.length - 1]!;
    members.push({ w, a, b, angle: lineAngle(a, b) });
  }

  const used = new Array<boolean>(members.length).fill(false);
  const runs: WallRun[] = [];

  for (let i = 0; i < members.length; i++) {
    if (used[i]) continue;
    const seed = members[i]!;
    used[i] = true;
    const group: Member[] = [seed];
    // Run axis from the seed; lateral offset measured against it.
    const ux = Math.cos(seed.angle);
    const uy = Math.sin(seed.angle);
    const nx = -uy;
    const ny = ux;
    const lateralOf = (p: readonly [number, number]): number =>
      (p[0] - seed.a[0]) * nx + (p[1] - seed.a[1]) * ny;

    for (let j = i + 1; j < members.length; j++) {
      if (used[j]) continue;
      const m = members[j]!;
      if (!angleClose(seed.angle, m.angle, opts.mergeAngleTolRad)) continue;
      const lat = (lateralOf(m.a) + lateralOf(m.b)) / 2;
      if (Math.abs(lat) > opts.mergeLateralTolMm) continue;
      // Thickness must agree — a 100 mm partition and a 300 mm external wall
      // in line with each other are two walls, not one.
      if (Math.abs(m.w.thickness - seed.w.thickness) > 0.35 * seed.w.thickness + 20) continue;
      group.push(m);
      used[j] = true;
    }

    const alongOf = (p: readonly [number, number]): number =>
      (p[0] - seed.a[0]) * ux + (p[1] - seed.a[1]) * uy;

    const spans = group
      .map((m) => {
        const s = alongOf(m.a);
        const e = alongOf(m.b);
        return { lo: Math.min(s, e), hi: Math.max(s, e), t: m.w.thickness, c: m.w.confidence, m };
      })
      .sort((p, q) => p.lo - q.lo);

    // Sweep: absorb overlaps, record breaks up to maxOpeningGapMm, and START A
    // NEW RUN past anything wider (that is a corridor, not an opening).
    let cursor = 0;
    while (cursor < spans.length) {
      const lo = spans[cursor]!.lo;
      let hi = spans[cursor]!.hi;
      let thick = spans[cursor]!.t;
      let conf = spans[cursor]!.c;
      let count = 1;
      const gaps: Array<{ startMm: number; endMm: number }> = [];
      let k = cursor + 1;
      for (; k < spans.length; k++) {
        const s = spans[k]!;
        const gap = s.lo - hi;
        if (gap > opts.maxOpeningGapMm) break;
        if (gap >= opts.minRecordedGapMm) gaps.push({ startMm: hi - lo, endMm: s.lo - lo });
        hi = Math.max(hi, s.hi);
        thick = (thick * count + s.t) / (count + 1);
        conf = Math.min(conf, s.c);
        count++;
      }
      const start: readonly [number, number] = [seed.a[0] + ux * lo, seed.a[1] + uy * lo];
      const end: readonly [number, number] = [seed.a[0] + ux * hi, seed.a[1] + uy * hi];
      // Debug provenance must come from a member of THIS sub-run, not from
      // group[0] — the sweep can emit several runs from one collinear group.
      const member = spans[cursor]!.m;
      runs.push({
        wall: {
          centerLine: [start, end],
          thickness: thick,
          confidence: conf,
          pairLine1: member.w.pairLine1,
          pairLine2: member.w.pairLine2,
        },
        gaps,
        memberCount: count,
      });
      cursor = k;
    }
  }
  return runs;
}

// ─── Stage 4: gap classification (door vs window vs "just a gap") ─────────

/** Why a break in a wall run did NOT become an opening. Counted, never hidden. */
export type GapRejectReason =
  | 'too_narrow'
  | 'too_wide'
  | 'no_symbol_evidence';

export interface RasterDiagnostics {
  readonly workingWidthPx: number;
  readonly workingHeightPx: number;
  readonly downsampleFactor: number;
  readonly inkThreshold: number;
  readonly boundaryPixels: number;
  readonly lineSegments: number;
  readonly wallPairsRaw: number;
  /** Pairs discarded as thinner than the raster can resolve — see
   *  `minWallThicknessPx`. Counted, so "few walls" is never mistaken for
   *  "clean plan". */
  readonly wallPairsBelowResolution: number;
  readonly wallRuns: number;
  readonly gapsFound: number;
  readonly doorsWithArc: number;
  readonly doorsGapOnly: number;
  readonly windowsGlazed: number;
  readonly gapsRejected: Readonly<Record<GapRejectReason, number>>;
}

interface MaskProbe {
  readonly mask: BinaryMask;
  /** mm per working pixel. */
  readonly mmPerPx: number;
}

function inkAt(mask: BinaryMask, x: number, y: number): boolean {
  const xi = Math.round(x);
  const yi = Math.round(y);
  if (xi < 0 || yi < 0 || xi >= mask.width || yi >= mask.height) return false;
  return mask.data[yi * mask.width + xi] === 1;
}

/** Ink coverage inside the wall band across a gap — glazing lines drawn
 *  through a window opening light this up; an empty door gap does not. */
export function gapBandInkFraction(
  probe: MaskProbe,
  centreMm: readonly [number, number],
  dirMm: readonly [number, number],
  lengthMm: number,
  thicknessMm: number,
): number {
  const s = 1 / probe.mmPerPx; // mm → working px
  const ux = dirMm[0];
  const uy = dirMm[1];
  const nx = -uy;
  const ny = ux;
  const nAlong = Math.max(4, Math.round((lengthMm * s) / 2));
  const halfBand = (thicknessMm * 0.35) * s;
  const nAcross = Math.max(3, Math.round(halfBand));
  let hits = 0;
  let total = 0;
  for (let i = 0; i < nAlong; i++) {
    const t = (i + 0.5) / nAlong - 0.5; // −0.5 … +0.5
    const alongPx = t * lengthMm * s;
    for (let j = -nAcross; j <= nAcross; j++) {
      const acrossPx = (j / nAcross) * halfBand;
      const x = (centreMm[0] * s) + ux * alongPx + nx * acrossPx;
      const y = (centreMm[1] * s) + uy * alongPx + ny * acrossPx;
      total++;
      if (inkAt(probe.mask, x, y)) hits++;
    }
  }
  return total === 0 ? 0 : hits / total;
}

/**
 * Circular-Hough-lite: sample the annulus of radius `radiusMm` around a jamb
 * and return the longest CONTIGUOUS inked angular run. A single-swing door
 * leaf sweeps ~90°; noise does not.
 */
export function arcSpanAtRadius(
  probe: MaskProbe,
  centreMm: readonly [number, number],
  radiusMm: number,
  samples = 144,
): { readonly spanRad: number; readonly coverage: number } {
  const s = 1 / probe.mmPerPx;
  const rPx = radiusMm * s;
  if (rPx < 3) return { spanRad: 0, coverage: 0 };
  const cx = centreMm[0] * s;
  const cy = centreMm[1] * s;
  const hit = new Uint8Array(samples);
  for (let i = 0; i < samples; i++) {
    const a = (2 * Math.PI * i) / samples;
    const dx = Math.cos(a);
    const dy = Math.sin(a);
    // ±1.5 px radial tolerance — the stroke has width and the raster is noisy.
    let h = 0;
    for (let dr = -1.5; dr <= 1.5 && !h; dr += 0.75) {
      if (inkAt(probe.mask, cx + dx * (rPx + dr), cy + dy * (rPx + dr))) h = 1;
    }
    hit[i] = h;
  }
  // Longest circular run of hits, allowing single-sample dropouts.
  let bestLen = 0;
  let bestHits = 0;
  for (let start = 0; start < samples; start++) {
    if (!hit[start]) continue;
    let run = 0;
    let runHits = 0;
    let hitsSoFar = 0;
    let misses = 0;
    for (let k = 0; k < samples; k++) {
      const idx = (start + k) % samples;
      if (hit[idx]) {
        hitsSoFar++;
        run = k + 1;
        runHits = hitsSoFar;
        misses = 0;
      } else if (++misses > 1) break;
    }
    if (run > bestLen) { bestLen = run; bestHits = runHits; }
  }
  return {
    spanRad: (2 * Math.PI * bestLen) / samples,
    coverage: bestLen === 0 ? 0 : bestHits / bestLen,
  };
}

/**
 * Turn wall-run breaks into `OpeningCandidate`s.
 *
 * §RASTER-GAP-CENTRE — `position` is the gap's TRUE CENTRE and
 * `arcEndpointsMm` is deliberately omitted. `openingCentreMm()` in
 * adapter-floorplan returns `position` unchanged in that case, and the batcher
 * then computes `offset = centre − width/2` (§PDF-OFFSET-LEFTEDGE). Do NOT
 * "fix" this by emitting the hinge here: unlike the vector tier, the raster
 * tier measures the gap itself, so the centre is known directly.
 */
export function classifyRunGaps(
  runs: readonly WallRun[],
  probe: MaskProbe,
  opts: RasterCvOptions = DEFAULT_RASTER_CV_OPTIONS,
): {
  readonly openings: OpeningCandidate[];
  readonly gapsFound: number;
  readonly doorsWithArc: number;
  readonly doorsGapOnly: number;
  readonly windowsGlazed: number;
  readonly rejected: Record<GapRejectReason, number>;
} {
  const openings: OpeningCandidate[] = [];
  const rejected: Record<GapRejectReason, number> = {
    too_narrow: 0,
    too_wide: 0,
    no_symbol_evidence: 0,
  };
  let gapsFound = 0;
  let doorsWithArc = 0;
  let doorsGapOnly = 0;
  let windowsGlazed = 0;

  for (const run of runs) {
    const a = run.wall.centerLine[0]!;
    const b = run.wall.centerLine[run.wall.centerLine.length - 1]!;
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (len < 1e-6) continue;
    const ux = (b[0] - a[0]) / len;
    const uy = (b[1] - a[1]) / len;

    for (const g of run.gaps) {
      gapsFound++;
      const widthMm = g.endMm - g.startMm;
      const minW = Math.min(opts.doorWidthMinMm, opts.windowWidthMinMm);
      const maxW = Math.max(opts.doorWidthMaxMm, opts.windowWidthMaxMm);
      if (widthMm < minW) { rejected.too_narrow++; continue; }
      if (widthMm > maxW) { rejected.too_wide++; continue; }

      const midAlong = (g.startMm + g.endMm) / 2;
      const centre: readonly [number, number] = [a[0] + ux * midAlong, a[1] + uy * midAlong];

      const inkFrac = gapBandInkFraction(
        probe, centre, [ux, uy], widthMm, run.wall.thickness,
      );

      // Window first: glazing drawn THROUGH the gap is unambiguous evidence.
      if (
        inkFrac >= opts.glazingInkFraction &&
        widthMm >= opts.windowWidthMinMm &&
        widthMm <= opts.windowWidthMaxMm
      ) {
        windowsGlazed++;
        openings.push({
          kind: 'window',
          subtype: 'raster-glazed',
          position: centre,
          openingWidthMm: widthMm,
          hostWallCenterLine: run.wall.centerLine,
          confidence: RASTER_CONF_WINDOW_GLAZED,
        });
        continue;
      }

      const doorSized = widthMm >= opts.doorWidthMinMm && widthMm <= opts.doorWidthMaxMm;
      if (doorSized) {
        // Swing-arc probe at each jamb, radius = the opening width.
        //
        // §RASTER-HINGE-OFFSET — the hinge sits on a wall FACE, not on the
        // centreline: probing only the centreline point mis-centres the
        // annulus by thickness/2, and a circle offset from the true arc meets
        // it near tangency only, so a perfectly drawn 90° swing scores as
        // "no arc". Probe both faces as well and keep the best evidence.
        const nx = -uy;
        const ny = ux;
        const half = run.wall.thickness / 2;
        let best = { spanRad: 0, coverage: 0 };
        for (const along of [g.startMm, g.endMm]) {
          const jx = a[0] + ux * along;
          const jy = a[1] + uy * along;
          for (const side of [0, 1, -1]) {
            const c: readonly [number, number] = [jx + nx * half * side, jy + ny * half * side];
            const s = arcSpanAtRadius(probe, c, widthMm);
            if (s.spanRad > best.spanRad) best = s;
          }
        }
        const hasArc =
          best.spanRad >= opts.arcMinSpanRad && best.coverage >= opts.arcMinCoverage;
        if (hasArc) doorsWithArc++; else doorsGapOnly++;
        openings.push({
          kind: 'door',
          subtype: hasArc ? 'raster-swing-arc' : 'raster-gap-only',
          position: centre, // §RASTER-GAP-CENTRE — TRUE centre, not the hinge.
          openingWidthMm: widthMm,
          hostWallCenterLine: run.wall.centerLine,
          confidence: hasArc ? RASTER_CONF_DOOR_WITH_ARC : RASTER_CONF_GAP_ONLY,
        });
        continue;
      }

      // Window-sized but unglazed, or between the two size windows: we have a
      // hole in a wall and no evidence of what it is. Say so; invent nothing.
      rejected.no_symbol_evidence++;
    }
  }

  return { openings, gapsFound, doorsWithArc, doorsGapOnly, windowsGlazed, rejected };
}

// ─── Orchestration ────────────────────────────────────────────────────────

export interface RasterAnalysisInput {
  /** RGBA8 bytes, row-major, length = 4·width·height. */
  readonly rgba: ArrayLike<number>;
  readonly width: number;
  readonly height: number;
  /** Millimetres per pixel of THIS raster (full resolution). */
  readonly mmPerPx: number;
  readonly options?: Partial<RasterCvOptions>;
}

export interface RasterAnalysisResult {
  /** Merged wall runs, centre-lines in millimetres. */
  readonly walls: readonly WallCandidate[];
  readonly openings: readonly OpeningCandidate[];
  readonly diagnostics: RasterDiagnostics;
}

/**
 * mm → source-image px affine for `vectorResultToFloorPlanAnalysis`.
 *
 * The raster tier's mm space is derived from the source pixel grid itself, so
 * the mapping back is a pure uniform scale with no translation and no y-flip —
 * and it is INDEPENDENT of the working downsample factor (mm-per-working-px =
 * mmPerPx × factor, working-px → source-px = × factor; the factors cancel).
 */
export function rasterMmToPx(mmPerPx: number): Affine2D {
  const s = 1 / mmPerPx;
  return [s, 0, 0, s, 0, 0];
}

/** Run the whole tier-2 pipeline. Deterministic; no I/O; no tokens. */
export function analyseRasterFloorPlan(
  input: RasterAnalysisInput,
): RasterAnalysisResult {
  const opts: RasterCvOptions = { ...DEFAULT_RASTER_CV_OPTIONS, ...input.options };
  const gray0 = rgbaToGray(input.rgba, input.width, input.height);
  const { image: gray, factor } = downsampleGray(gray0, opts.maxWorkingDim);
  const mmPerWorkingPx = input.mmPerPx * factor;

  const threshold = opts.threshold ?? otsuThreshold(gray);
  let mask = binarize(gray, threshold);
  // Despeckle, NOT morphological open — see `morphOpen3`'s warning: opening
  // deletes the 1 px arcs and glazing this pipeline classifies openings on.
  mask = despeckle(mask, opts.speckleMinNeighbours);
  mask = morphClose3(mask);

  const boundary = extractBoundary(mask);
  let boundaryPixels = 0;
  for (let i = 0; i < boundary.data.length; i++) boundaryPixels += boundary.data[i]!;

  const segments = houghSegments(boundary, opts);
  const vectors = segmentsToVectorElements(segments);
  const { walls: allPairs } = classifyWallsAndColumns(
    { pageId: 'raster', pageWidthPt: gray.width, pageHeightPt: gray.height, vectors },
    mmPerWorkingPx,
  );
  const minThickMm = opts.minWallThicknessPx * mmPerWorkingPx;
  const rawWalls = allPairs.filter((w) => w.thickness >= minThickMm);
  const runs = mergeCollinearWallRuns(rawWalls, opts);
  const probe: MaskProbe = { mask, mmPerPx: mmPerWorkingPx };
  const gapResult = classifyRunGaps(runs, probe, opts);

  return {
    walls: runs.map((r) => r.wall),
    openings: gapResult.openings,
    diagnostics: {
      workingWidthPx: gray.width,
      workingHeightPx: gray.height,
      downsampleFactor: factor,
      inkThreshold: threshold,
      boundaryPixels,
      lineSegments: segments.length,
      wallPairsRaw: rawWalls.length,
      wallPairsBelowResolution: allPairs.length - rawWalls.length,
      wallRuns: runs.length,
      gapsFound: gapResult.gapsFound,
      doorsWithArc: gapResult.doorsWithArc,
      doorsGapOnly: gapResult.doorsGapOnly,
      windowsGlazed: gapResult.windowsGlazed,
      gapsRejected: gapResult.rejected,
    },
  };
}

/** Minimum merged wall runs for the raster tier to be trusted end-to-end.
 *  Below this the caller must NOT present a floor plan — it must say the
 *  raster analysis found too little and offer the remaining tier. */
export const RASTER_MIN_WALLS = 4;
