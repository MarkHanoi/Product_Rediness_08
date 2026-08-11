// @pryzm/ai-worker — vector-extraction → FloorPlanAnalysis adapter
// (§VEC-WIRE 2026-08-10, PDF-TO-BIM-AUDIT-2026-08-10 §4.1).
//
// Maps the Stage 2 vector classifier's mm-space output (WallCandidate /
// OpeningCandidate) onto the SAME intermediate representation the AI
// recognition path produces (`FloorPlanAnalysis`, image-pixel space), so the
// entire proven materialization path — FloorPlanCommandBatcher with its
// §PDF-OFFSET-LEFTEDGE / §PDF-SCALE-EFFECTIVE / §PDF-HOST-DIST-GUARD /
// §PDF-OCCUPANCY-PREFLIGHT fixes — runs unchanged downstream.
//
// CONVENTIONS (do not regress):
//  • `DetectedOpening.centrePx` is the opening's CENTRE. The batcher converts
//    centre → LEFT-EDGE `offset` (offset = centre − width/2) per
//    §OPENING-OFFSET-LEFTEDGE-UNIFY. This adapter therefore must emit the gap
//    CENTRE — for a door the extractor's `position` is the swing-arc centre,
//    i.e. the HINGE (a jamb, off by width/2): the true centre is derived from
//    the hinge and the arc endpoint that lands on the host wall.
//  • Pixel coordinates are in the RENDERED raster image space (origin
//    top-left, y down) — the same space the AI path reports in — via the
//    caller-supplied mm→px affine (viewport transform ÷ mm-per-pt).
//
// Type-only dependency on @pryzm/ai-host (already a workspace dependency of
// this app); erased at runtime, so importing this module pulls no AI code.

import type {
  DetectedOpening,
  DetectedWall,
  FloorPlanAnalysis,
} from '@pryzm/ai-host';
import type { OpeningCandidate, WallCandidate } from './types.js';
import { emptyAdapterTally, type AdapterRejectionTally } from './rejections.js';

/** Minimum wall-pair count for the vector path to be trusted end-to-end;
 *  below this the caller should fall back to AI recognition. */
export const VECTOR_MIN_WALLS = 4;

/** 2D affine [a, b, c, d, e, f]: px = [a·x + c·y + e, b·x + d·y + f]. */
export type Affine2D = readonly [number, number, number, number, number, number];

/**
 * Compose the mm→px affine from the pdf.js viewport transform (page user
 * space pt → rendered px, includes the y-flip and any page rotation) and the
 * pt→mm scale factor used for classification.
 */
export function composeMmToPx(
  viewportTransform: ArrayLike<number>,
  mmPerPt: number,
): Affine2D {
  const v = viewportTransform;
  const s = 1 / mmPerPt; // mm → pt
  return [v[0]! * s, v[1]! * s, v[2]! * s, v[3]! * s, v[4]!, v[5]!];
}

function applyAffine(m: Affine2D, p: readonly [number, number]): { x: number; y: number } {
  return { x: m[0] * p[0] + m[2] * p[1] + m[4], y: m[1] * p[0] + m[3] * p[1] + m[5] };
}

/** Uniform scale magnitude of the affine (px per mm). */
function scaleOf(m: Affine2D): number {
  return Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2]));
}

function toBand(confidence: number): 'high' | 'medium' | 'low' {
  if (confidence >= 0.8) return 'high';
  if (confidence >= 0.6) return 'medium';
  return 'low';
}

export interface VectorAnalysisInput {
  readonly walls: readonly WallCandidate[];
  readonly openings: readonly OpeningCandidate[];
  /** mm (page space) → rendered image px. Use `composeMmToPx`. */
  readonly mmToPx: Affine2D;
  readonly imageWidthPx: number;
  readonly imageHeightPx: number;
}

/**
 * Build a `FloorPlanAnalysis` from the vector classifier's output. `slab` is
 * left null on purpose — the batcher's planar-topology outer face computes
 * the slab deterministically from the walls (its primary path). `furniture`
 * is empty — the vector extractor does not classify furniture; the caller
 * may still enrich it via the AI Stage C.
 */
export function vectorResultToFloorPlanAnalysis(
  input: VectorAnalysisInput,
): FloorPlanAnalysis {
  return vectorResultToFloorPlanAnalysisWithDiagnostics(input).analysis;
}

/**
 * §VEC-REJECT-TALLY — the same adaptation, plus an account of what it dropped.
 *
 * The adapter is the LAST place a detected opening can silently vanish: a
 * matched door whose host wall was filtered out (and for which no fallback wall
 * exists) is discarded with no trace. `vectorResultToFloorPlanAnalysis` now
 * delegates here so the two can never diverge.
 */
export function vectorResultToFloorPlanAnalysisWithDiagnostics(
  input: VectorAnalysisInput,
): { readonly analysis: FloorPlanAnalysis; readonly rejections: AdapterRejectionTally } {
  const { walls, openings, mmToPx } = input;
  const pxPerMm = scaleOf(mmToPx);
  const tally = emptyAdapterTally();
  tally.wallsIn = walls.length;
  tally.openingsIn = openings.length;

  const detectedWalls: DetectedWall[] = [];
  /** Reference identity of `WallCandidate.centerLine` → assigned wall id.
   *  `matchOpeningSymbols` passes the SAME array reference through as
   *  `hostWallCenterLine`, so this lookup is exact. */
  const wallIdByCenterLine = new Map<ReadonlyArray<readonly [number, number]>, string>();

  for (let i = 0; i < walls.length; i++) {
    const w = walls[i]!;
    if (w.centerLine.length < 2) {
      tally.wallsRejectedDegenerateCentreLine++;
      continue;
    }
    const id = `vw${i + 1}`;
    const startPx = applyAffine(mmToPx, w.centerLine[0]!);
    const endPx = applyAffine(mmToPx, w.centerLine[w.centerLine.length - 1]!);
    detectedWalls.push({
      id,
      startPx,
      endPx,
      thicknessPx: w.thickness * pxPerMm,
      // The vector detector does not see hatching or the building perimeter;
      // 'unknown' is the honest classification (§CONTEXT-DATA-HONESTY). The
      // batcher's unknown-type thickness clamp [0.10, 0.50 m] covers both.
      wallType: 'unknown',
      confidence: toBand(w.confidence),
    });
    wallIdByCenterLine.set(w.centerLine, id);
  }

  const detectedOpenings: DetectedOpening[] = [];
  for (let i = 0; i < openings.length; i++) {
    const o = openings[i]!;
    const hostId = resolveHostWallId(o, walls, wallIdByCenterLine);
    if (!hostId) {
      // No wall to host on — the batcher would drop it anyway. COUNTED, not
      // silent: a plan whose doors all vanish here looks identical to a plan
      // with no doors unless this number is reported.
      tally.openingsRejectedNoHostWall++;
      continue;
    }
    const centreMm = openingCentreMm(o);
    detectedOpenings.push({
      id: `vo${i + 1}`,
      hostWallId: hostId,
      type: o.kind,
      centrePx: applyAffine(mmToPx, centreMm),
      widthPx: o.openingWidthMm * pxPerMm,
      confidence: toBand(o.confidence),
    });
  }

  tally.wallsOut = detectedWalls.length;
  tally.openingsOut = detectedOpenings.length;

  return {
    analysis: {
      walls: detectedWalls,
      openings: detectedOpenings,
      slab: null,
      furniture: [],
      imageDimensions: { widthPx: input.imageWidthPx, heightPx: input.imageHeightPx },
    },
    rejections: tally,
  };
}

/**
 * The opening's CENTRE in mm.
 *  • Window: `position` is already the glazing midpoint — the centre.
 *  • Door: `position` is the arc centre = the HINGE. The opening spans from
 *    the hinge's projection on the wall to the projection of whichever arc
 *    endpoint lies nearer the wall centreline (the far jamb, where the swing
 *    lands on the wall). Centre = midpoint of those two projections.
 *    Without `arcEndpointsMm` (older callers) the hinge is the best
 *    available answer — off by width/2, but the batcher's gap probe usually
 *    re-centres it from the wall-stub gap.
 */
export function openingCentreMm(o: OpeningCandidate): readonly [number, number] {
  if (o.kind !== 'door' || !o.arcEndpointsMm || o.hostWallCenterLine.length < 2) {
    return o.position;
  }
  const a = o.hostWallCenterLine[0]!;
  const b = o.hostWallCenterLine[o.hostWallCenterLine.length - 1]!;
  const [e1, e2] = o.arcEndpointsMm;
  const farJamb =
    distToSegment(e1, a, b) <= distToSegment(e2, a, b) ? e1 : e2;
  const hinge = projectOntoSegment(o.position, a, b);
  const jamb = projectOntoSegment(farJamb, a, b);
  return [(hinge[0] + jamb[0]) / 2, (hinge[1] + jamb[1]) / 2];
}

function resolveHostWallId(
  o: OpeningCandidate,
  walls: readonly WallCandidate[],
  byRef: ReadonlyMap<ReadonlyArray<readonly [number, number]>, string>,
): string | null {
  const direct = byRef.get(o.hostWallCenterLine);
  if (direct) return direct;
  // Fallback (host wall was filtered out or came from another run): nearest
  // wall centreline to the opening position.
  let best: { id: string; d: number } | null = null;
  for (const w of walls) {
    const id = byRef.get(w.centerLine);
    if (!id || w.centerLine.length < 2) continue;
    const d = distToSegment(o.position, w.centerLine[0]!, w.centerLine[w.centerLine.length - 1]!);
    if (!best || d < best.d) best = { id, d };
  }
  return best ? best.id : null;
}

function projectOntoSegment(
  p: readonly [number, number],
  a: readonly [number, number],
  b: readonly [number, number],
): [number, number] {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len2 = dx * dx + dy * dy;
  if (len2 < 1e-12) return [a[0], a[1]];
  let t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return [a[0] + t * dx, a[1] + t * dy];
}

function distToSegment(
  p: readonly [number, number],
  a: readonly [number, number],
  b: readonly [number, number],
): number {
  const q = projectOntoSegment(p, a, b);
  return Math.hypot(p[0] - q[0], p[1] - q[1]);
}
