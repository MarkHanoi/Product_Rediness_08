// @pryzm/ai-worker — PDF-to-BIM Stage 2 openings (S52 §4.2).
//
// Spec source:
//   • `phases/PHASE-3A-Q1-M25-M27-VI-AI-ELEMENT-CREATOR.md` §4.2
//     (lines 1296-1483) — door + window symbol matching.
//   • SPEC-45 §2.2 — Stage 2's contract: input is the page's
//     vector primitives + Stage 2-walls' WallCandidates, output is
//     a list of OpeningCandidates anchored to host walls.
//   • ADR-029 Part B — door / window matching is the third stage of
//     the PDF-to-BIM moat; precision targets ≥ 0.75 (door) / ≥ 0.70
//     (window) per S52 exit criteria lines 1489-1490.
//
// SHAPE — `matchOpeningSymbols(page, walls, scale, library)` returns
// `OpeningCandidate[]`. Pure geometry; no AI. The AI-fallback path
// for low-confidence opening candidates lands at S55 alongside the
// real Vision call for page classification.
//
// The `DEFAULT_DOOR_TEMPLATES` library covers the four common
// single-swing widths (700/800/900/1000 mm) — enough to hit the
// precision target on the spec-pinned 10-page sample. Plug-in
// templates can be added by callers passing their own library
// without modifying this file.
//
// PURE — zero deps on @pryzm/command-bus, @pryzm/stores, THREE,
// DOM, or Node primitives. Bake-worker safe.

import type {
  ArcDescriptor,
  OpeningCandidate,
  OpeningSubtype,
  PageDecomposition,
  SymbolTemplate,
  VectorElement,
  WallCandidate,
} from './types.js';

// ─── Tunable constants per spec ────────────────────────────────────────────

/** Minimum match score for a door template per spec line 1349. */
export const DOOR_MATCH_THRESHOLD = 0.6;

/** Window glazing line min length (mm) per spec line 1433. */
export const WINDOW_GLAZING_MIN_LENGTH_MM = 200;

/** Window glazing line max length (mm) per spec line 1433. */
export const WINDOW_GLAZING_MAX_LENGTH_MM = 6000;

/** Window glazing min separation (mm) per spec line 1446. */
export const WINDOW_GLAZING_MIN_SEPARATION_MM = 20;

/** Window glazing min overlap (mm) per spec line 1448. */
export const WINDOW_GLAZING_MIN_OVERLAP_MM = 200;

/** Wall snap radius for arcs (mm) — arcs farther than this from any
 *  wall centerline are dropped. Spec line 1356 implies "snap to
 *  nearest wall"; we use a 250 mm tolerance (= half of WALL_THICKNESS_MAX). */
export const ARC_WALL_SNAP_TOLERANCE_MM = 250;

/** Door swing arc-span tolerance (radians) for the 90° canonical
 *  per spec line 1397. */
export const DOOR_ARC_TOLERANCE_TIGHT = 0.1;

/** Door swing arc-span tolerance (radians) for the relaxed match
 *  per spec line 1398. */
export const DOOR_ARC_TOLERANCE_RELAXED = 0.2;

/** Telemetry-tag namespace for Stage-2 openings. */
export const STAGE2_OPENINGS_OTEL_NAMESPACE = 'pryzm.pdf.stage2.openings' as const;

// ─── Default symbol library ────────────────────────────────────────────────

/** Canonical 90°-swing single door at the four common widths. The
 *  template's normalised features:
 *   • Arc: center at (0,0), radius 1.0, span 0..π/2.
 *   • Panel line: from (0,0) to (1,0).
 *  Width is encoded in the template id so callers can route by
 *  size without re-reading the radius. */
export const DEFAULT_DOOR_TEMPLATES: readonly SymbolTemplate[] = [
  makeSingleSwingTemplate('door-single-700', 700),
  makeSingleSwingTemplate('door-single-800', 800),
  makeSingleSwingTemplate('door-single-900', 900),
  makeSingleSwingTemplate('door-single-1000', 1000),
];

/** Canonical casement window. Used as the default for window-break
 *  detection (which doesn't actually template-match, but the
 *  subtype string is sourced from this template). */
export const DEFAULT_WINDOW_TEMPLATE: SymbolTemplate = {
  id: 'window-casement-2-pane',
  kind: 'window',
  subtype: 'casement-2-pane',
  features: [],
  anchor: [0, 0],
  openingWidthAxis: 'x',
};

/** All default templates concatenated — pass to
 *  `matchOpeningSymbols` as `symbolLibrary` if you don't have a
 *  project-specific library. */
export const DEFAULT_SYMBOL_LIBRARY: readonly SymbolTemplate[] = [
  ...DEFAULT_DOOR_TEMPLATES,
  DEFAULT_WINDOW_TEMPLATE,
];

function makeSingleSwingTemplate(id: string, widthMm: number): SymbolTemplate {
  return {
    id,
    kind: 'door',
    subtype: 'single-swing-90',
    features: [
      {
        kind: 'arc',
        center: [0, 0],
        radius: 1.0,
        startAngle: 0,
        endAngle: Math.PI / 2,
      },
      {
        kind: 'line',
        p1: [0, 0],
        p2: [1, 0],
      },
    ],
    anchor: [0, 0],
    openingWidthAxis: 'x',
    openingWidthMmHint: widthMm,
  };
}

// ─── Top-level entrypoint ──────────────────────────────────────────────────

/** Match door + window symbols in a page's vector data per spec
 *  lines 1329-1375. Returns one `OpeningCandidate` per detected
 *  opening, with `confidence` boost for canonical sizes. */
export function matchOpeningSymbols(
  page: PageDecomposition,
  walls: readonly WallCandidate[],
  scaleFactor: number,
  symbolLibrary: readonly SymbolTemplate[] = DEFAULT_SYMBOL_LIBRARY,
): OpeningCandidate[] {
  const openings: OpeningCandidate[] = [];

  // Doors: arc + adjacent panel line.
  const arcs = findArcs(page.vectors);
  const doorTemplates = symbolLibrary.filter((t) => t.kind === 'door');

  for (const arc of arcs) {
    const adjacentLines = findAdjacentLines(page.vectors, arc, 5 * scaleFactor);
    if (adjacentLines.length === 0) continue;

    let best: { template: SymbolTemplate; score: number } | null = null;
    for (const tpl of doorTemplates) {
      const score = matchDoorTemplate(arc, adjacentLines, tpl, scaleFactor);
      if (score > DOOR_MATCH_THRESHOLD && (!best || score > best.score)) {
        best = { template: tpl, score };
      }
    }

    if (best) {
      const nearestWall = snapToNearestWall(arc, walls, scaleFactor);
      if (nearestWall) {
        const candidate: OpeningCandidate = {
          kind: 'door',
          subtype: best.template.subtype,
          position: arcCenterMm(arc, scaleFactor),
          openingWidthMm: estimateOpeningWidth(arc, best.template, scaleFactor),
          hostWallCenterLine: nearestWall.centerLine,
          confidence: best.score,
        };
        openings.push(candidate);
      }
    }
  }

  // Windows: parallel-line glazing within a wall pair.
  const windowOpenings = detectWindowBreaks(page.vectors, walls, scaleFactor);
  openings.push(...windowOpenings);

  return openings;
}

// ─── Door detection ────────────────────────────────────────────────────────

/** Extract arc vectors per spec lines 1377-1385. */
export function findArcs(vectors: readonly VectorElement[]): ArcDescriptor[] {
  const arcs: ArcDescriptor[] = [];
  for (const v of vectors) {
    if (v.kind !== 'arc') continue;
    const arc = arcFromVector(v);
    if (arc) arcs.push(arc);
  }
  return arcs;
}

function arcFromVector(v: VectorElement): ArcDescriptor | null {
  // Convention: arc points are [center, edgeStart, edgeEnd] in PDF pt.
  if (v.points.length < 3) return null;
  const center = v.points[0]!;
  const startPt = v.points[1]!;
  const endPt = v.points[2]!;
  const radius = Math.hypot(startPt[0] - center[0], startPt[1] - center[1]);
  if (radius <= 0) return null;
  const startAngle = Math.atan2(startPt[1] - center[1], startPt[0] - center[0]);
  const endAngle = Math.atan2(endPt[1] - center[1], endPt[0] - center[0]);
  return { center, radius, startAngle, endAngle, rawVector: v };
}

/** Find lines whose endpoint sits within `tolerance` (PDF pt) of
 *  the arc's center — these are candidate door panels. */
export function findAdjacentLines(
  vectors: readonly VectorElement[],
  arc: ArcDescriptor,
  tolerancePt: number,
): VectorElement[] {
  const out: VectorElement[] = [];
  for (const v of vectors) {
    if (v.kind !== 'line' || v.points.length !== 2) continue;
    const p1 = v.points[0]!;
    const p2 = v.points[1]!;
    const d1 = Math.hypot(p1[0] - arc.center[0], p1[1] - arc.center[1]);
    const d2 = Math.hypot(p2[0] - arc.center[0], p2[1] - arc.center[1]);
    if (Math.min(d1, d2) <= tolerancePt) out.push(v);
  }
  return out;
}

/** Match an arc + adjacent lines against a door template per spec
 *  lines 1387-1414. Returns a score in [0, 1]. */
export function matchDoorTemplate(
  arc: ArcDescriptor,
  lines: readonly VectorElement[],
  template: SymbolTemplate,
  scaleFactor: number,
): number {
  if (template.kind !== 'door') return 0;

  const arcSpan = Math.abs(normaliseAngleDiff(arc.endAngle - arc.startAngle));
  let score = 0;

  // 90°-swing match per spec line 1397-1398.
  if (Math.abs(arcSpan - Math.PI / 2) < DOOR_ARC_TOLERANCE_TIGHT) {
    score += 0.35;
  } else if (Math.abs(arcSpan - Math.PI / 2) < DOOR_ARC_TOLERANCE_RELAXED) {
    score += 0.20;
  }

  // Panel line length within 15% of arc radius per spec line 1401-1404.
  const radiusMm = arc.radius * scaleFactor;
  const panelLine = lines.find((l) => {
    if (l.points.length !== 2) return false;
    const lengthMm = lineLengthMm(l, scaleFactor);
    if (radiusMm <= 0) return false;
    return Math.abs(lengthMm - radiusMm) / radiusMm < 0.15;
  });
  if (panelLine) score += 0.35;

  // Panel start coincident with arc center (within 20 mm) per spec lines 1407-1411.
  if (panelLine) {
    const p1 = panelLine.points[0]!;
    const p2 = panelLine.points[1]!;
    const d1 = Math.hypot(p1[0] - arc.center[0], p1[1] - arc.center[1]) * scaleFactor;
    const d2 = Math.hypot(p2[0] - arc.center[0], p2[1] - arc.center[1]) * scaleFactor;
    if (Math.min(d1, d2) < 20) score += 0.15;
  }

  // Bonus: openingWidthMmHint matches the template within 10%.
  const hint = template.openingWidthMmHint;
  if (hint !== undefined && radiusMm > 0) {
    if (Math.abs(radiusMm - hint) / hint < 0.10) score += 0.15;
  }

  return Math.min(1.0, score);
}

/** Snap the arc to the nearest wall per spec lines 1356-1357. Returns
 *  the wall whose centerline is closest to the arc center, or `null`
 *  if no wall is within `ARC_WALL_SNAP_TOLERANCE_MM`. */
export function snapToNearestWall(
  arc: ArcDescriptor,
  walls: readonly WallCandidate[],
  scaleFactor: number,
): WallCandidate | null {
  if (walls.length === 0) return null;
  const arcCenterMmCoords = arcCenterMm(arc, scaleFactor);
  let best: { wall: WallCandidate; distMm: number } | null = null;
  for (const wall of walls) {
    if (wall.centerLine.length < 2) continue;
    const a = wall.centerLine[0]!;
    const b = wall.centerLine[1]!;
    const distMm = pointToSegmentDistance(arcCenterMmCoords, a, b);
    if (!best || distMm < best.distMm) best = { wall, distMm };
  }
  if (!best) return null;
  if (best.distMm > ARC_WALL_SNAP_TOLERANCE_MM) return null;
  return best.wall;
}

/** Estimate the opening width per spec line 1362. The arc's radius
 *  IS the door panel length, so opening width = radius (in mm). */
export function estimateOpeningWidth(
  arc: ArcDescriptor,
  _template: SymbolTemplate,
  scaleFactor: number,
): number {
  return arc.radius * scaleFactor;
}

/** Arc center in millimetres. */
export function arcCenterMm(
  arc: ArcDescriptor,
  scaleFactor: number,
): readonly [number, number] {
  return [arc.center[0] * scaleFactor, arc.center[1] * scaleFactor];
}

// ─── Window detection ──────────────────────────────────────────────────────

/** Detect window breaks per spec lines 1416-1463. A window is two
 *  parallel glazing lines, both close together and parallel to a
 *  host wall. */
export function detectWindowBreaks(
  vectors: readonly VectorElement[],
  walls: readonly WallCandidate[],
  scaleFactor: number,
): OpeningCandidate[] {
  const out: OpeningCandidate[] = [];
  if (walls.length === 0) return out;

  // Index lines once.
  const lineVectors = vectors.filter((v) => v.kind === 'line' && v.points.length === 2);

  for (const wall of walls) {
    if (wall.centerLine.length < 2) continue;
    const wallStart = wall.centerLine[0]!;
    const wallEnd = wall.centerLine[1]!;
    const wallAngle = Math.atan2(wallEnd[1] - wallStart[1], wallEnd[0] - wallStart[0]);
    const wallThickMm = wall.thickness;

    const candidates: VectorElement[] = [];
    for (const line of lineVectors) {
      const lengthMm = lineLengthMm(line, scaleFactor);
      if (lengthMm < WINDOW_GLAZING_MIN_LENGTH_MM || lengthMm > WINDOW_GLAZING_MAX_LENGTH_MM) continue;
      const lineAngle = lineAngleRadians(line);
      const angleDiff = Math.abs(normaliseAngleDiff(lineAngle - wallAngle));
      if (angleDiff < 0.15 || Math.abs(angleDiff - Math.PI) < 0.15) {
        candidates.push(line);
      }
    }

    // Pair each candidate with each other within the wall thickness.
    for (let i = 0; i < candidates.length; i++) {
      for (let j = i + 1; j < candidates.length; j++) {
        const g1 = candidates[i]!;
        const g2 = candidates[j]!;
        const separationMm = perpendicularSeparationMm(g1, g2, scaleFactor);
        if (separationMm < WINDOW_GLAZING_MIN_SEPARATION_MM) continue;
        if (separationMm > wallThickMm + 50) continue;
        const overlapMm = lineOverlapMm(g1, g2, scaleFactor);
        if (overlapMm < WINDOW_GLAZING_MIN_OVERLAP_MM) continue;

        // Confidence — base 0.65 + small boost for a wider opening.
        let confidence = 0.65;
        if (overlapMm > 1000) confidence += 0.10;
        if (overlapMm > 2000) confidence += 0.05;
        confidence = Math.min(1.0, confidence);

        out.push({
          kind: 'window',
          subtype: 'casement-2-pane',
          position: midpointBetweenLinesMm(g1, g2, scaleFactor),
          openingWidthMm: overlapMm,
          hostWallCenterLine: wall.centerLine,
          confidence,
        });
      }
    }
  }

  return out;
}

// ─── Geometry utilities ────────────────────────────────────────────────────

/** Length of a 2-point line in millimetres. */
export function lineLengthMm(v: VectorElement, scaleFactor: number): number {
  if (v.points.length !== 2) return 0;
  const dx = v.points[1]![0] - v.points[0]![0];
  const dy = v.points[1]![1] - v.points[0]![1];
  return Math.hypot(dx, dy) * scaleFactor;
}

/** Angle of a 2-point line in radians (raw atan2). */
export function lineAngleRadians(v: VectorElement): number {
  if (v.points.length !== 2) return 0;
  const dx = v.points[1]![0] - v.points[0]![0];
  const dy = v.points[1]![1] - v.points[0]![1];
  return Math.atan2(dy, dx);
}

/** Normalise an angle delta to [-π, π]. */
function normaliseAngleDiff(d: number): number {
  let r = d;
  while (r > Math.PI) r -= 2 * Math.PI;
  while (r < -Math.PI) r += 2 * Math.PI;
  return r;
}

/** Perpendicular distance from line g1's midpoint to line g2's
 *  infinite line, in millimetres. */
export function perpendicularSeparationMm(
  g1: VectorElement,
  g2: VectorElement,
  scaleFactor: number,
): number {
  if (g1.points.length !== 2 || g2.points.length !== 2) return Infinity;
  const mid: [number, number] = [
    (g1.points[0]![0] + g1.points[1]![0]) / 2,
    (g1.points[0]![1] + g1.points[1]![1]) / 2,
  ];
  const dx = g2.points[1]![0] - g2.points[0]![0];
  const dy = g2.points[1]![1] - g2.points[0]![1];
  const len = Math.hypot(dx, dy);
  if (len === 0) return Infinity;
  return (
    (Math.abs((mid[0] - g2.points[0]![0]) * dy - (mid[1] - g2.points[0]![1]) * dx) / len) *
    scaleFactor
  );
}

/** Overlap of two parallel lines projected onto g1's axis, in mm. */
export function lineOverlapMm(
  g1: VectorElement,
  g2: VectorElement,
  scaleFactor: number,
): number {
  if (g1.points.length !== 2 || g2.points.length !== 2) return 0;
  const dx = g1.points[1]![0] - g1.points[0]![0];
  const dy = g1.points[1]![1] - g1.points[0]![1];
  const len = Math.hypot(dx, dy);
  if (len === 0) return 0;
  const ux = dx / len;
  const uy = dy / len;
  const proj = (p: readonly [number, number]) => p[0] * ux + p[1] * uy;
  const a1 = proj(g1.points[0]!);
  const a2 = proj(g1.points[1]!);
  const b1 = proj(g2.points[0]!);
  const b2 = proj(g2.points[1]!);
  const lo = Math.max(Math.min(a1, a2), Math.min(b1, b2));
  const hi = Math.min(Math.max(a1, a2), Math.max(b1, b2));
  return Math.max(0, hi - lo) * scaleFactor;
}

/** Midpoint between the centroids of two lines, in millimetres. */
export function midpointBetweenLinesMm(
  g1: VectorElement,
  g2: VectorElement,
  scaleFactor: number,
): readonly [number, number] {
  if (g1.points.length !== 2 || g2.points.length !== 2) return [0, 0];
  const c1: [number, number] = [
    (g1.points[0]![0] + g1.points[1]![0]) / 2,
    (g1.points[0]![1] + g1.points[1]![1]) / 2,
  ];
  const c2: [number, number] = [
    (g2.points[0]![0] + g2.points[1]![0]) / 2,
    (g2.points[0]![1] + g2.points[1]![1]) / 2,
  ];
  return [
    ((c1[0] + c2[0]) / 2) * scaleFactor,
    ((c1[1] + c2[1]) / 2) * scaleFactor,
  ];
}

/** Distance from point p (mm) to segment [a, b] (mm). */
export function pointToSegmentDistance(
  p: readonly [number, number],
  a: readonly [number, number],
  b: readonly [number, number],
): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(p[0] - a[0], p[1] - a[1]);
  let t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / lenSq;
  if (t < 0) t = 0;
  else if (t > 1) t = 1;
  const projX = a[0] + t * dx;
  const projY = a[1] + t * dy;
  return Math.hypot(p[0] - projX, p[1] - projY);
}

/** Re-export the OpeningSubtype string union for callers building
 *  custom symbol templates. */
export type { OpeningSubtype };
