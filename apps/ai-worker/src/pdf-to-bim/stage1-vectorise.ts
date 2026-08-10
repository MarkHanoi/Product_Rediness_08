// @pryzm/ai-worker — PDF-to-BIM Stage 1 vectoriser (§VEC-WIRE 2026-08-10).
//
// Converts a pdf.js `getOperatorList()` result into the `VectorElement[]`
// that Stage 2 (`classifyWallsAndColumns`, `matchOpeningSymbols`) consumes.
// This is the missing Stage 1 of SPEC-45 §2.3 — the reason the vector-first
// extractor sat authored-but-unwired (PDF-TO-BIM-AUDIT-2026-08-10 §4.1).
//
// PURE — no pdfjs-dist import. The caller (who owns the pdf.js dependency,
// today `packages/file-format/PDFToImageConverter`) passes the raw
// `{ fnArray, argsArray }` plus the numeric values of the operators we care
// about (from `pdfjsLib.OPS`). This keeps the layer graph clean: file-format
// (L3) never imports this app; the editor (L7) composes both.
//
// pdf.js ≥ 4 path encoding (verified against pdfjs-dist 5.7.284):
//   fnArray[i] === OPS.constructPath
//   argsArray[i] === [paintOp, [drawOps], minMax]
//   where drawOps is a flat Float32Array of
//     0 moveTo x y · 1 lineTo x y · 2 curveTo x1 y1 x2 y2 x3 y3
//     3 quadraticCurveTo x1 y1 x y  · 4 closePath
//   Rectangles are pre-flattened by the worker into moveTo/lineTo/closePath.
//   Coordinates are in the CURRENT user space — OPS.transform / save /
//   restore must be simulated to land in page user space (PDF points).
//
// Door swing arcs in PDFs are cubic Béziers (PDF has no arc primitive).
// Curve runs are sampled and circle-fitted; runs that fit a circular arc
// become `kind: 'arc'` elements using the `[center, startPt, endPt]`
// convention of `stage2-openings.arcFromVector`. Non-circular curve runs
// (furniture squiggles, fillets) are dropped as noise.

import type { VectorElement } from './types.js';

/** Raw operator list, exactly as returned by pdf.js `page.getOperatorList()`. */
export interface PdfOperatorList {
  readonly fnArray: ArrayLike<number>;
  readonly argsArray: ArrayLike<unknown>;
}

/** The numeric operator codes this vectoriser needs — pass `pdfjsLib.OPS`
 *  (extra keys are ignored). Codes are stable within a pdf.js major but are
 *  passed in rather than hard-coded so a pdf.js upgrade cannot silently
 *  desynchronise this file. */
export interface PdfOpsSubset {
  readonly save: number;
  readonly restore: number;
  readonly transform: number;
  readonly constructPath: number;
  /** Optional — lets us tag stroke widths for downstream filtering. */
  readonly setLineWidth?: number;
  /** Optional — `endPath` consumes a clip path; such paths are NOT drawn
   *  geometry and are skipped when this code is provided. */
  readonly endPath?: number;
}

/** Drawing sub-op codes inside a constructPath data array (pdf.js DrawOPS). */
const DRAW_MOVE_TO = 0;
const DRAW_LINE_TO = 1;
const DRAW_CURVE_TO = 2;
const DRAW_QUAD_TO = 3;
const DRAW_CLOSE = 4;

/** Relative tolerance for the circular-arc fit — max deviation of any
 *  sample from the fitted circle, as a fraction of the radius. */
const ARC_FIT_REL_TOL = 0.04;
/** Absolute floor for the arc-fit tolerance, in PDF points (~0.18 mm paper). */
const ARC_FIT_ABS_TOL_PT = 0.5;
/** Arc sweeps outside this range are not door-swing-like: near-0 sweeps are
 *  numerical noise, near-360 sweeps are full circles (handled as 'circle'). */
const ARC_MIN_SWEEP_RAD = (10 * Math.PI) / 180;
const ARC_MAX_SWEEP_RAD = (350 * Math.PI) / 180;

type Mat = readonly [number, number, number, number, number, number];
const IDENTITY: Mat = [1, 0, 0, 1, 0, 0];

/** m ∘ n — apply n first, then m (the ctx.transform composition order). */
function mul(m: Mat, n: Mat): Mat {
  return [
    m[0] * n[0] + m[2] * n[1],
    m[1] * n[0] + m[3] * n[1],
    m[0] * n[2] + m[2] * n[3],
    m[1] * n[2] + m[3] * n[3],
    m[0] * n[4] + m[2] * n[5] + m[4],
    m[1] * n[4] + m[3] * n[5] + m[5],
  ];
}

function apply(m: Mat, x: number, y: number): [number, number] {
  return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
}

/** Circumcenter of three points, or null when near-collinear. */
function circumcenter(
  a: readonly [number, number],
  b: readonly [number, number],
  c: readonly [number, number],
): [number, number] | null {
  const d = 2 * (a[0] * (b[1] - c[1]) + b[0] * (c[1] - a[1]) + c[0] * (a[1] - b[1]));
  if (Math.abs(d) < 1e-9) return null;
  const a2 = a[0] * a[0] + a[1] * a[1];
  const b2 = b[0] * b[0] + b[1] * b[1];
  const c2 = c[0] * c[0] + c[1] * c[1];
  return [
    (a2 * (b[1] - c[1]) + b2 * (c[1] - a[1]) + c2 * (a[1] - b[1])) / d,
    (a2 * (c[0] - b[0]) + b2 * (a[0] - c[0]) + c2 * (b[0] - a[0])) / d,
  ];
}

/** Sample a cubic Bézier at t. */
function cubicAt(
  p0: readonly [number, number],
  p1: readonly [number, number],
  p2: readonly [number, number],
  p3: readonly [number, number],
  t: number,
): [number, number] {
  const u = 1 - t;
  const w0 = u * u * u;
  const w1 = 3 * u * u * t;
  const w2 = 3 * u * t * t;
  const w3 = t * t * t;
  return [
    w0 * p0[0] + w1 * p1[0] + w2 * p2[0] + w3 * p3[0],
    w0 * p0[1] + w1 * p1[1] + w2 * p2[1] + w3 * p3[1],
  ];
}

/** Fit a circular arc to a sampled curve run. Returns the arc element
 *  (convention `[center, startPt, endPt]`) or null when the run is not
 *  circular / not door-swing-like. Exported for unit tests. */
export function fitArc(
  samples: ReadonlyArray<readonly [number, number]>,
  strokeWidth?: number,
): VectorElement | null {
  if (samples.length < 5) return null;
  const first = samples[0]!;
  const mid = samples[Math.floor(samples.length / 2)]!;
  const last = samples[samples.length - 1]!;
  const center = circumcenter(first, mid, last);
  if (!center) return null;
  const radius = Math.hypot(first[0] - center[0], first[1] - center[1]);
  if (!(radius > 1e-6)) return null;
  const tol = Math.max(ARC_FIT_ABS_TOL_PT, radius * ARC_FIT_REL_TOL);
  let sweep = 0;
  let prevAngle = Math.atan2(first[1] - center[1], first[0] - center[0]);
  for (let i = 1; i < samples.length; i++) {
    const s = samples[i]!;
    const r = Math.hypot(s[0] - center[0], s[1] - center[1]);
    if (Math.abs(r - radius) > tol) return null;
    const angle = Math.atan2(s[1] - center[1], s[0] - center[0]);
    let d = angle - prevAngle;
    while (d > Math.PI) d -= 2 * Math.PI;
    while (d < -Math.PI) d += 2 * Math.PI;
    sweep += d;
    prevAngle = angle;
  }
  const absSweep = Math.abs(sweep);
  if (absSweep < ARC_MIN_SWEEP_RAD) return null;
  if (absSweep > ARC_MAX_SWEEP_RAD) {
    // Full (or nearly full) circle — a column/fixture symbol, not a swing.
    return {
      kind: 'circle',
      points: [center, first],
      ...(strokeWidth !== undefined ? { strokeWidth } : {}),
    };
  }
  return {
    kind: 'arc',
    points: [center, first, last],
    ...(strokeWidth !== undefined ? { strokeWidth } : {}),
  };
}

/**
 * Extract drawn vector primitives from a pdf.js operator list, in PDF page
 * user space (points, y-up). See file header for the encoding handled.
 */
export function extractVectorElements(
  opList: PdfOperatorList,
  ops: PdfOpsSubset,
): VectorElement[] {
  const out: VectorElement[] = [];
  const { fnArray, argsArray } = opList;

  const stack: Mat[] = [];
  let ctm: Mat = IDENTITY;
  const widthStack: number[] = [];
  let lineWidth = 1;

  for (let i = 0; i < fnArray.length; i++) {
    const fn = fnArray[i]!;
    if (fn === ops.save) {
      stack.push(ctm);
      widthStack.push(lineWidth);
      continue;
    }
    if (fn === ops.restore) {
      ctm = stack.pop() ?? IDENTITY;
      lineWidth = widthStack.pop() ?? 1;
      continue;
    }
    if (fn === ops.transform) {
      const a = argsArray[i] as ArrayLike<number> | null;
      if (a && a.length >= 6) {
        ctm = mul(ctm, [a[0]!, a[1]!, a[2]!, a[3]!, a[4]!, a[5]!]);
      }
      continue;
    }
    if (ops.setLineWidth !== undefined && fn === ops.setLineWidth) {
      const a = argsArray[i] as ArrayLike<number> | null;
      if (a && a.length >= 1 && isFinite(a[0]!)) lineWidth = a[0]!;
      continue;
    }
    if (fn !== ops.constructPath) continue;

    const args = argsArray[i] as unknown[] | null;
    if (!args || args.length < 2) continue;
    const paintOp = args[0];
    // A path consumed by `endPath` is a CLIP, not drawn geometry.
    if (ops.endPath !== undefined && paintOp === ops.endPath) continue;
    const data = args[1] as unknown[] | null;
    const drawOps = data?.[0] as ArrayLike<number> | undefined;
    // On a re-executed operator list pdf.js caches a Path2D here — nothing
    // to decode. Only the first pass exposes the raw draw-ops array.
    if (!drawOps || typeof (drawOps as ArrayLike<number>).length !== 'number') continue;

    decodePath(drawOps, ctm, lineWidth, out);
  }

  return out;
}

/** Decode one constructPath draw-ops array into vector elements. */
function decodePath(
  drawOps: ArrayLike<number>,
  ctm: Mat,
  strokeWidth: number,
  out: VectorElement[],
): void {
  // Per-subpath state.
  let linePts: Array<readonly [number, number]> = [];
  let curveRun: Array<readonly [number, number]> | null = null;
  let cursor: readonly [number, number] | null = null;
  let subpathStart: readonly [number, number] | null = null;
  let sawCurve = false;

  const flushCurveRun = (): void => {
    if (curveRun && curveRun.length >= 5) {
      const arc = fitArc(curveRun, strokeWidth);
      if (arc) out.push(arc);
    }
    curveRun = null;
  };

  const flushLines = (closed: boolean): void => {
    // Drop consecutive duplicates.
    const pts: Array<readonly [number, number]> = [];
    for (const p of linePts) {
      const prev = pts[pts.length - 1];
      if (!prev || Math.hypot(p[0] - prev[0], p[1] - prev[1]) > 1e-6) pts.push(p);
    }
    if (pts.length >= 2) {
      if (pts.length === 2 && !closed) {
        out.push({ kind: 'line', points: pts, strokeWidth });
      } else if (closed && !sawCurve) {
        out.push({ kind: 'polygon', points: pts, closed: true, strokeWidth });
      } else {
        out.push({ kind: 'polyline', points: pts, strokeWidth });
      }
    }
    linePts = [];
  };

  const endSubpath = (closed: boolean): void => {
    flushCurveRun();
    flushLines(closed);
    sawCurve = false;
  };

  for (let i = 0, n = drawOps.length; i < n; ) {
    const op = drawOps[i++]!;
    switch (op) {
      case DRAW_MOVE_TO: {
        endSubpath(false);
        cursor = apply(ctm, drawOps[i++]!, drawOps[i++]!);
        subpathStart = cursor;
        linePts = [cursor];
        break;
      }
      case DRAW_LINE_TO: {
        flushCurveRun();
        const p = apply(ctm, drawOps[i++]!, drawOps[i++]!);
        if (linePts.length === 0 && cursor) linePts.push(cursor);
        linePts.push(p);
        cursor = p;
        break;
      }
      case DRAW_CURVE_TO:
      case DRAW_QUAD_TO: {
        // Interrupt any pending polyline; curves get their own run.
        flushLines(false);
        sawCurve = true;
        let p1: [number, number];
        let p2: [number, number];
        let p3: [number, number];
        if (op === DRAW_CURVE_TO) {
          p1 = apply(ctm, drawOps[i++]!, drawOps[i++]!);
          p2 = apply(ctm, drawOps[i++]!, drawOps[i++]!);
          p3 = apply(ctm, drawOps[i++]!, drawOps[i++]!);
        } else {
          // Elevate the quadratic to a cubic.
          const q = apply(ctm, drawOps[i++]!, drawOps[i++]!);
          p3 = apply(ctm, drawOps[i++]!, drawOps[i++]!);
          const c0 = cursor ?? q;
          p1 = [c0[0] + (2 / 3) * (q[0] - c0[0]), c0[1] + (2 / 3) * (q[1] - c0[1])];
          p2 = [p3[0] + (2 / 3) * (q[0] - p3[0]), p3[1] + (2 / 3) * (q[1] - p3[1])];
        }
        const p0 = cursor ?? p1;
        if (!curveRun) curveRun = [p0];
        for (let t = 1; t <= 8; t++) {
          curveRun.push(cubicAt(p0, p1, p2, p3, t / 8));
        }
        cursor = p3;
        break;
      }
      case DRAW_CLOSE: {
        // If the drawn ring already repeats the start point, drop the
        // duplicate — `detectColumns` requires a rectangle to have exactly
        // 4 DISTINCT vertices, and the polygon's `closed: true` flag plus
        // `explodeVectorLines`'s modular closing edge carry the closure.
        if (subpathStart && linePts.length >= 3) {
          const lastPt = linePts[linePts.length - 1]!;
          const d = Math.hypot(lastPt[0] - subpathStart[0], lastPt[1] - subpathStart[1]);
          if (d <= 1e-6) linePts.pop();
        }
        endSubpath(true);
        cursor = subpathStart;
        break;
      }
      default:
        // Unknown sub-op — cannot know its arity; abandon this path safely.
        endSubpath(false);
        return;
    }
  }
  endSubpath(false);
}

/**
 * Stage 2's `extractLines` consumes only 2-point `'line'` elements, but CAD
 * exporters routinely draw wall faces as polylines and wall bodies as filled
 * rectangles (closed polygons). Explode those into constituent 2-point lines
 * so the wall-pair detector can see them, KEEPING the originals (the column
 * detector needs the closed polygons intact).
 */
export function explodeVectorLines(
  vectors: readonly VectorElement[],
): VectorElement[] {
  const out: VectorElement[] = [...vectors];
  for (const v of vectors) {
    if (v.kind !== 'polyline' && v.kind !== 'polygon') continue;
    const pts = v.points;
    const n = pts.length;
    if (n < 2) continue;
    const last = v.kind === 'polygon' ? n : n - 1; // polygon: include closing edge
    for (let i = 0; i < last; i++) {
      const a = pts[i]!;
      const b = pts[(i + 1) % n]!;
      if (Math.hypot(b[0] - a[0], b[1] - a[1]) < 1e-6) continue;
      out.push({
        kind: 'line',
        points: [a, b],
        ...(v.strokeWidth !== undefined ? { strokeWidth: v.strokeWidth } : {}),
      });
    }
  }
  return out;
}

/** True when the extracted vector set plausibly contains a drawn floor plan
 *  (enough straight line-work to attempt wall-pair detection). */
export function hasUsableVectorLineWork(
  vectors: readonly VectorElement[],
  minLinePrimitives = 24,
): boolean {
  let n = 0;
  for (const v of vectors) {
    if (v.kind === 'line' || v.kind === 'polyline' || v.kind === 'polygon') n++;
    if (n >= minLinePrimitives) return true;
  }
  return false;
}
