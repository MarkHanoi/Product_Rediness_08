// @pryzm/ai-worker — PDF-to-BIM Stage 2 wall + column classifier
// (S51 Track B).
//
// Spec source: `phases/PHASE-3A-Q1-M25-M27-VI-AI-ELEMENT-CREATOR.md`
// §3.2 lines 850-1093 — verbatim algorithm with the spec's confidence
// formulas, tolerances, and filter ranges. Pure geometry.
//
// PURE — no DOM, no THREE, no native deps. Bake-worker safe. Heavy
// numeric work; the bench at `apps/bench/src/benches/pdf-to-bim-stage2.bench.ts`
// validates p95 ≤ 5 ms on a synthetic 50-line page.
//
// AI-fallback for ambiguous cases (the "+ AI for ambiguous cases"
// half of spec line 853) is a S52 deliverable — Stage 2 today is
// pure heuristic. Confidence scores below `AI_FALLBACK_THRESHOLD`
// (0.6) flag candidates that the S52 fallback will re-evaluate.

import type {
  ClassifiedLayer,
  ClassifiedLine,
  ColumnCandidate,
  PageDecomposition,
  VectorElement,
  WallCandidate,
} from './types.js';

/** Below this confidence, Stage 2 marks the candidate for AI
 *  fallback re-evaluation at S52. Pure heuristic results above this
 *  bar promote straight to Stage 3 (door/window matching, S58). */
export const AI_FALLBACK_THRESHOLD = 0.6;

/** Tiny lines (< 100 mm) are filtered as hatching / detail noise —
 *  per spec line 889. */
export const MIN_LINE_LENGTH_MM = 100;

/** Wall thickness range — per spec line 917 (partition → external). */
export const WALL_THICKNESS_MIN_MM = 50;
export const WALL_THICKNESS_MAX_MM = 600;

/** Minimum overlap a parallel pair needs to count as a wall —
 *  per spec line 920. */
export const WALL_MIN_OVERLAP_MM = 500;

/** Column size range — per spec line 968. */
export const COLUMN_SIZE_MIN_MM = 100;
export const COLUMN_SIZE_MAX_MM = 800;

/** Maximum aspect ratio for a column — beyond this, the rectangle
 *  is too elongated to be a column (likely a furnishing). Per spec
 *  line 973. */
export const COLUMN_MAX_ASPECT_RATIO = 4;

/** Angle tolerance for grouping lines as parallel — 5°. Per spec
 *  line 904. */
const ANGLE_TOLERANCE_RAD = (5 * Math.PI) / 180;

/** Common wall thicknesses used by the confidence booster — mm.
 *  Per spec line 948 (NA + EU stud + masonry sizes). */
const COMMON_WALL_THICKNESSES_MM = [100, 140, 175, 200, 215, 250, 300, 350];

/** Common column sizes used by the confidence booster — mm. Per
 *  spec line 988 (typical RC column dimensions). */
const COMMON_COLUMN_SIZES_MM = [200, 250, 300, 350, 400, 450, 500];

/** Top-level Stage 2 entrypoint. Per spec line 861 — given a
 *  vectorised page + the PDF→mm scale factor, returns walls +
 *  columns. */
export function classifyWallsAndColumns(
  page: PageDecomposition,
  scaleFactor: number,
): Pick<ClassifiedLayer, 'walls' | 'columns'> {
  const lines = extractLines(page.vectors, scaleFactor);
  const walls = detectWallPairs(lines);
  const columns = detectColumns(page.vectors, scaleFactor);
  return { walls, columns };
}

/** Convenience — runs the classifier and packages the result with
 *  the per-page metrics used by `pryzm.pdf.stage2.*` telemetry. */
export function classifyPage(
  page: PageDecomposition,
  scaleFactor: number,
): ClassifiedLayer {
  const { walls, columns } = classifyWallsAndColumns(page, scaleFactor);
  return {
    pageId: page.pageId,
    walls,
    columns,
    metrics: {
      wallsCount: walls.length,
      columnsCount: columns.length,
      avgWallConfidence: avg(walls.map((w) => w.confidence)),
      avgColumnConfidence: avg(columns.map((c) => c.confidence)),
    },
  };
}

/** Extract eligible lines from the page's vector list, scaled to
 *  millimetres + filtered for length. Per spec lines 880-897. */
export function extractLines(
  vectors: readonly VectorElement[],
  scale: number,
): ClassifiedLine[] {
  const lines: ClassifiedLine[] = [];
  for (const v of vectors) {
    if (v.kind !== 'line' || v.points.length !== 2) continue;
    const [a, b] = v.points;
    const p1: readonly [number, number] = [a[0] * scale, a[1] * scale];
    const p2: readonly [number, number] = [b[0] * scale, b[1] * scale];
    const dx = p2[0] - p1[0];
    const dy = p2[1] - p1[1];
    const length = Math.hypot(dx, dy);
    if (length < MIN_LINE_LENGTH_MM) continue;
    // Normalise angle to 0–π (collapses ±π flip per spec line 891).
    const angle = (((Math.atan2(dy, dx) % Math.PI) + Math.PI) % Math.PI);
    lines.push({ p1, p2, angle, length });
  }
  return lines;
}

/** Detect wall-pair candidates by parallel-line matching. Per spec
 *  lines 899-940. */
export function detectWallPairs(lines: readonly ClassifiedLine[]): WallCandidate[] {
  const walls: WallCandidate[] = [];
  const groups = groupByAngle(lines, ANGLE_TOLERANCE_RAD);

  for (const group of groups) {
    const used = new Set<number>();
    for (let i = 0; i < group.length; i++) {
      if (used.has(i)) continue;
      for (let j = i + 1; j < group.length; j++) {
        if (used.has(j)) continue;
        const li = group[i]!;
        const lj = group[j]!;
        const spacing = perpendicularDistance(li, lj);
        if (spacing < WALL_THICKNESS_MIN_MM || spacing > WALL_THICKNESS_MAX_MM) continue;
        const overlap = computeOverlap(li, lj);
        if (overlap < WALL_MIN_OVERLAP_MM) continue;
        const centerLine = computeCenterline(li, lj);
        walls.push({
          centerLine,
          thickness: spacing,
          confidence: computeWallConfidence(li, lj, spacing, overlap),
          pairLine1: li,
          pairLine2: lj,
        });
        used.add(i);
        used.add(j);
        break; // li is consumed; move on to the next i
      }
    }
  }
  return walls;
}

/** Detect column candidates by closed-rectangle filtering. Per spec
 *  lines 956-984. */
export function detectColumns(
  vectors: readonly VectorElement[],
  scale: number,
): ColumnCandidate[] {
  const columns: ColumnCandidate[] = [];
  for (const v of vectors) {
    // Spec line 958: closed polygons with 4-8 vertices.
    if (!v.closed) continue;
    if (v.points.length < 4 || v.points.length > 8) continue;
    const pts = v.points.map(
      (p) => [p[0] * scale, p[1] * scale] as readonly [number, number],
    );
    if (!isApproximateRectangle(pts)) continue;
    const bounds = getBounds(pts);
    const w = bounds.maxX - bounds.minX;
    const h = bounds.maxY - bounds.minY;
    if (w < COLUMN_SIZE_MIN_MM || w > COLUMN_SIZE_MAX_MM) continue;
    if (h < COLUMN_SIZE_MIN_MM || h > COLUMN_SIZE_MAX_MM) continue;
    const aspect = Math.max(w, h) / Math.min(w, h);
    if (aspect > COLUMN_MAX_ASPECT_RATIO) continue;
    columns.push({
      position: [(bounds.minX + bounds.maxX) / 2, (bounds.minY + bounds.maxY) / 2],
      width: w,
      depth: h,
      confidence: computeColumnConfidence(w, h, aspect),
    });
  }
  return columns;
}

// ─── Confidence formulas ──────────────────────────────────────────────────

/** Wall confidence — per spec lines 942-954. */
export function computeWallConfidence(
  l1: ClassifiedLine,
  l2: ClassifiedLine,
  spacing: number,
  overlap: number,
): number {
  let score = 0.5;
  const minLen = Math.min(l1.length, l2.length);
  if (minLen > 2000) score += 0.15;
  else if (minLen > 1000) score += 0.10;
  // Common wall thickness booster.
  const nearest = COMMON_WALL_THICKNESSES_MM.reduce((a, b) =>
    Math.abs(a - spacing) < Math.abs(b - spacing) ? a : b,
  );
  if (Math.abs(nearest - spacing) < 10) score += 0.20;
  // Overlap booster.
  if (overlap > 3000) score += 0.15;
  return Math.min(1.0, score);
}

/** Column confidence — per spec lines 986-993. */
export function computeColumnConfidence(w: number, h: number, aspect: number): number {
  let score = 0.5;
  const nearestW = COMMON_COLUMN_SIZES_MM.reduce((a, b) =>
    Math.abs(a - w) < Math.abs(b - w) ? a : b,
  );
  if (Math.abs(nearestW - w) < 15) score += 0.25;
  if (aspect < 1.2) score += 0.15;
  return Math.min(1.0, score);
}

// ─── Geometry utilities ───────────────────────────────────────────────────

/** Group lines by parallel-angle bucket within `tolerance` radians.
 *  Per spec lines 997-1015. */
export function groupByAngle(
  lines: readonly ClassifiedLine[],
  tolerance: number,
): ClassifiedLine[][] {
  const groups: ClassifiedLine[][] = [];
  const grouped = new Set<number>();
  for (let i = 0; i < lines.length; i++) {
    if (grouped.has(i)) continue;
    const group: ClassifiedLine[] = [lines[i]!];
    grouped.add(i);
    for (let j = i + 1; j < lines.length; j++) {
      if (grouped.has(j)) continue;
      const angleDiff = Math.abs(lines[i]!.angle - lines[j]!.angle);
      if (angleDiff < tolerance || Math.abs(angleDiff - Math.PI) < tolerance) {
        group.push(lines[j]!);
        grouped.add(j);
      }
    }
    groups.push(group);
  }
  return groups;
}

/** Perpendicular distance from l1's midpoint to l2's infinite line.
 *  Per spec lines 1018-1026. */
export function perpendicularDistance(
  l1: ClassifiedLine,
  l2: ClassifiedLine,
): number {
  const mid1: [number, number] = [
    (l1.p1[0] + l1.p2[0]) / 2,
    (l1.p1[1] + l1.p2[1]) / 2,
  ];
  const dx = l2.p2[0] - l2.p1[0];
  const dy = l2.p2[1] - l2.p1[1];
  const len = Math.hypot(dx, dy);
  if (len === 0) return Infinity;
  return (
    Math.abs((mid1[0] - l2.p1[0]) * dy - (mid1[1] - l2.p1[1]) * dx) / len
  );
}

/** Overlap of l1 and l2 projected onto l1's axis. Per spec lines
 *  1028-1042. */
export function computeOverlap(
  l1: ClassifiedLine,
  l2: ClassifiedLine,
): number {
  const dx = l1.p2[0] - l1.p1[0];
  const dy = l1.p2[1] - l1.p1[1];
  const len = Math.hypot(dx, dy);
  if (len === 0) return 0;
  const ux = dx / len;
  const uy = dy / len;
  const proj = (p: readonly [number, number]) => p[0] * ux + p[1] * uy;
  const l1min = Math.min(proj(l1.p1), proj(l1.p2));
  const l1max = Math.max(proj(l1.p1), proj(l1.p2));
  const l2min = Math.min(proj(l2.p1), proj(l2.p2));
  const l2max = Math.max(proj(l2.p1), proj(l2.p2));
  return Math.max(0, Math.min(l1max, l2max) - Math.max(l1min, l2min));
}

/** Centerline of two parallel lines. Per spec lines 1044-1050. */
export function computeCenterline(
  l1: ClassifiedLine,
  l2: ClassifiedLine,
): ReadonlyArray<readonly [number, number]> {
  return [
    [(l1.p1[0] + l2.p1[0]) / 2, (l1.p1[1] + l2.p1[1]) / 2],
    [(l1.p2[0] + l2.p2[0]) / 2, (l1.p2[1] + l2.p2[1]) / 2],
  ];
}

/** True iff a 4-vertex polygon's interior angles are all within
 *  ~11° of 90°. Per spec lines 1052-1067. */
export function isApproximateRectangle(
  pts: ReadonlyArray<readonly [number, number]>,
): boolean {
  if (pts.length !== 4) return false;
  for (let i = 0; i < 4; i++) {
    const prev = pts[(i + 3) % 4]!;
    const curr = pts[i]!;
    const next = pts[(i + 1) % 4]!;
    const v1: [number, number] = [curr[0] - prev[0], curr[1] - prev[1]];
    const v2: [number, number] = [next[0] - curr[0], next[1] - curr[1]];
    const dot = v1[0] * v2[0] + v1[1] * v2[1];
    const cross = v1[0] * v2[1] - v1[1] * v2[0];
    const angle = Math.atan2(Math.abs(cross), dot);
    if (Math.abs(angle - Math.PI / 2) > 0.2) return false;
  }
  return true;
}

/** Axis-aligned bounding box. Per spec lines 1069-1076. */
export function getBounds(
  pts: ReadonlyArray<readonly [number, number]>,
): Readonly<{ minX: number; maxX: number; minY: number; maxY: number }> {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const p of pts) {
    if (p[0] < minX) minX = p[0];
    if (p[0] > maxX) maxX = p[0];
    if (p[1] < minY) minY = p[1];
    if (p[1] > maxY) maxY = p[1];
  }
  return { minX, maxX, minY, maxY };
}

function avg(xs: readonly number[]): number {
  if (xs.length === 0) return 0;
  let s = 0;
  for (const x of xs) s += x;
  return s / xs.length;
}
