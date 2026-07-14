// @pryzm/auto-dimension — the 8-stage deterministic pipeline entry point.
//
// PURE DTO → DTO. Same input geometry → byte-identical DimensionString[] (ADR-0061):
// every ordering is a total order with an element-id final tiebreak; no Date.now,
// no Math.random, no Set/Map iteration order trusted for output. P8: the root and
// each stage open an OTel span (tracing.ts).
//
// See docs/03-execution/spikes/SPIKE-AUTODIMENSION-ENGINE.md (§FEAT-AUTODIMENSION-P1).

import {
  DimensionStringSchema,
  type DimensionString,
} from '@pryzm/schemas/annotation/dimension';
import type {
  AutoDimSnapshot, AutoDimOptions, AutoDimResult, AutoDimReport,
  AutoDimWall, PlannedString, PlacedString, WallRun, DimNode, ValidationWarning, TickRef,
} from './types.js';
import { segmentsCrossImpl, type PtXZ } from './geometry.js';
import { partitionBuildings, type BuildingFootprint } from './buildings.js';
import { openingsOnRun, type RunOpening } from './openings.js';
import {
  planOverall, planWallChain, planOpeningChain, planOpeningLocations, dedupKey,
} from './planners.js';
import { placeStrings, polygonCentroidImpl } from './placement.js';
import { resolveConflicts } from './conflicts.js';
import { withAutoDimSpan } from './tracing.js';
// §FIX-OVERALL-DIM-OUTSIDE-AND-OUTERMOST (L-281) — the tier model (tiers.ts).
import { bboxOf, tierMagnitudeM, type FootprintBBox } from './tiers.js';

const DEFAULT_SNAP_EPS_M = 0.20;
const DEFAULT_MIN_SEGMENT_M = 0.05;
/**
 * @deprecated §FIX-OVERALL-DIM-OUTSIDE-AND-OUTERMOST (L-281) — the tier gap replaces the
 * (base, spacing) pair. Kept as the DEFAULT tier gap so a caller that passes neither
 * `tierGapM` nor `stackWorldSpacingM` keeps the spacing it has today (0.5 m ≈ 5 mm on a
 * 1:100 sheet). The executor now passes a scale-derived gap, so this is a floor, not a rule.
 */
const DEFAULT_TIER_GAP_M = 0.5;
const MM_PER_M = 1000;

/**
 * §FIX-AUTODIM-MULTI-BUILDING (L-268) — ONE building on the level.
 *
 * This was the missing concept: before it, the documentation layer had no notion of a
 * "building" at all — the perimeter was singular by construction, so a level with two
 * footprints could only ever be understood as one. A level is now always a LIST of these,
 * and N = 1 is not a special case.
 *
 * It is deliberately NOT defined here. It is the SHARED domain type
 * `BuildingFootprint` (buildings.ts), so that elevation auto-dimension (L-263), auto-tag
 * (L-265) and schedules (C28) partition the level into exactly the same buildings this
 * planner does, from the same code. A second, private definition here is how the concept
 * would drift back apart.
 */
type Building = BuildingFootprint;

function makeMonotonicIdFactory(): () => string {
  let n = 0;
  return () => `dim-auto-${(++n).toString().padStart(6, '0')}`;
}

/**
 * §FIX-OVERALL-DIM-OUTSIDE-AND-OUTERMOST (L-281) — the ONE gap the tier model uses.
 *
 * Precedence: the view-scale-derived `tierGapM` (what the executor now passes, C24) →
 * the legacy `stackWorldSpacingM` (so an existing caller keeps its spacing) → the default.
 * Resolved in exactly one place so the serialiser and the Stage-7 crossing scan cannot
 * drift apart.
 */
function resolveTierGapM(opts: AutoDimOptions): number {
  const g = opts.tierGapM ?? opts.stackWorldSpacingM ?? DEFAULT_TIER_GAP_M;
  return Number.isFinite(g) && g > 0 ? g : DEFAULT_TIER_GAP_M;
}

/**
 * §FIX-OVERALL-DIM-OUTSIDE-AND-OUTERMOST (L-281) — RULE (a), CHECKED AT THE OUTCOME.
 *
 * "A dimension line NEVER crosses the thing it measures." This is the guard the founder
 * asked for, and it is deliberately written against the FOOTPRINT POLYGON, not the bbox:
 * a bbox test would pass an L-shaped plate whose dim line runs through the notch, which
 * is exactly the class of near-miss that let this ship. It also re-derives the dim line
 * from the SAME `tierMagnitudeM` the serialiser emits, so it cannot vacuously pass by
 * checking a line nobody draws (the defect in the old Stage-7 scan).
 *
 * Exported + pure so an L-shaped plate can be asserted directly in a unit test.
 */
export function detectFootprintCrossings(
  placed: readonly PlacedString[],
  polygon: readonly PtXZ[],
  tierGapM: number,
): ValidationWarning[] {
  if (polygon.length < 3) return [];
  const out: ValidationWarning[] = [];
  const edges: { a: PtXZ; b: PtXZ }[] = polygon.map((a, i) => ({ a, b: polygon[(i + 1) % polygon.length]! }));

  for (const p of placed) {
    if (p.orientation !== 'horizontal' && p.orientation !== 'vertical') continue;
    const horizontal = p.orientation === 'horizontal';
    const lo = Math.min(horizontal ? p.p1.x : p.p1.z, horizontal ? p.p2.x : p.p2.z);
    const hi = Math.max(horizontal ? p.p1.x : p.p1.z, horizontal ? p.p2.x : p.p2.z);
    const anchor = horizontal ? p.p1.z : p.p1.x;
    const perpComp = horizontal ? p.outwardNormal.z : p.outwardNormal.x;
    const pos = anchor + perpComp * tierMagnitudeM(p.clearanceM, p.rowIndex, tierGapM);
    const q1 = horizontal ? { x: lo, z: pos } : { x: pos, z: lo };
    const q2 = horizontal ? { x: hi, z: pos } : { x: pos, z: hi };
    for (const e of edges) {
      if (segmentsCrossImpl(q1, q2, e.a, e.b)) {
        out.push({
          code: 'geometry-crossing',
          detail: `${p.kind} ${p.axisId} crosses the footprint at ${horizontal ? 'z' : 'x'}=${pos.toFixed(3)}`,
        });
        break;
      }
    }
  }
  return out;
}

/** Canonical wall sort (§SPIKE §14.1): (minX, minZ, id) — total order, id tiebreak. */
function sortWalls(walls: readonly AutoDimWall[]): AutoDimWall[] {
  return [...walls].sort((a, b) => {
    const amx = Math.min(a.a.x, a.b.x), bmx = Math.min(b.a.x, b.b.x);
    if (amx !== bmx) return amx - bmx;
    const amz = Math.min(a.a.z, a.b.z), bmz = Math.min(b.a.z, b.b.z);
    if (amz !== bmz) return amz - bmz;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}

/** Per-wall fallback (open perimeter): one aligned length dim per wall. */
function planPerWallFallback(walls: readonly AutoDimWall[], minSegmentM: number): PlannedString[] {
  const out: PlannedString[] = [];
  for (const w of walls) {
    const dx = w.b.x - w.a.x, dz = w.b.z - w.a.z;
    const L = Math.hypot(dx, dz);
    if (L < minSegmentM) continue;
    const a: TickRef = { elementId: w.id, anchor: 'start', station: 0 };
    const b: TickRef = { elementId: w.id, anchor: 'end', station: L };
    out.push({
      kind: 'linear-element',
      orientation: Math.abs(dx) >= Math.abs(dz) ? 'horizontal' : 'vertical',
      refs: [a, b], axisId: `wall:${w.id}`, rank: 5, rowIndex: 0,
      stationSpan: [0, L],
      p1: w.a, p2: w.b,
    });
  }
  return out;
}

function serialize(
  placed: readonly PlacedString[],
  opts: AutoDimOptions,
  idFactory: () => string,
): DimensionString[] {
  // Total order for positionally-stable ids (§SPIKE §14.4).
  const ordered = [...placed].sort((a, b) => {
    if (a.orientation !== b.orientation) return a.orientation < b.orientation ? -1 : 1;
    if (a.axisId !== b.axisId) return a.axisId < b.axisId ? -1 : 1;
    if (a.rank !== b.rank) return a.rank - b.rank;
    if (a.stationSpan[0] !== b.stationSpan[0]) return a.stationSpan[0] - b.stationSpan[0];
    if (a.stationSpan[1] !== b.stationSpan[1]) return a.stationSpan[1] - b.stationSpan[1];
    return dedupKey(a) < dedupKey(b) ? -1 : 1;
  });

  // §FIX-AUTODIM-OFFSET-WORLD-SCALE (L-155, C56 §Stage-6 / SPEC-AUTODIMENSION §6):
  // the emitted `offsetMm/1000` is consumed as a WORLD-metre standoff — the
  // executor writes it straight into `geometry2D.offset` (metres) and the plan
  // renderer adds it to world coordinates, exactly like a hand-dragged dim. The
  // former sheet-paper magnitude (8 mm base + 8 mm/row) collapsed to 8–24 mm in
  // WORLD space, so every dim line HUGGED the wall instead of standing outside the
  // footprint (L-155). Emit the WORLD standoff instead, reusing the SAME per-row
  // world scale Stage-7 already uses for geometry-crossing detection
  // (`stackWorldBaseM`/`stackWorldSpacingM`) so the rendered dim line lands exactly
  // where the crossing check assumed it would. `side` (P2 per-side outward sign,
  // §SPIKE §8) and `rowIndex` (progressive outward stacking — location dims nearest
  // the wall, the overall furthest out, so exterior chains never overlap opening
  // dims) are BOTH preserved; only the magnitude/scale changes.
  // §FIX-OVERALL-DIM-OUTSIDE-AND-OUTERMOST (L-281) — the standoff is measured from the
  // FOOTPRINT, not from the string's own reference line:
  //     magnitude = clearance(p1 → footprint bbox, along the outward normal)
  //               + gap · (tier + 1)
  // `clearance` is 0 for an ordinary façade chain (its p1 IS on the bbox edge) — so those
  // dims land exactly where they do today — and LARGE for the overall on an L-plate, whose
  // reference corner sits mid-plate. That single term is the whole fix, and it is the same
  // term the Stage-7 crossing scan probes with (`tierMagnitudeM`), so the guard and the
  // drawing can never disagree again.
  const gapM = resolveTierGapM(opts);
  return ordered.map((p) => {
    const magnitudeM = tierMagnitudeM(p.clearanceM, p.rowIndex, gapM);
    const offsetMm = p.side * magnitudeM * MM_PER_M;
    return DimensionStringSchema.parse({
      id: idFactory(),
      kind: p.kind,
      references: p.refs.map((r) => ({ elementId: r.elementId, anchor: r.anchor })),
      orientation: p.orientation,
      offsetMm,
      viewId: opts.viewId,
      ...(opts.levelId ? { levelId: opts.levelId } : {}),
      isAutoGenerated: true,
      autoMode: 'set-out',
    });
  });
}

/** Minimal structural view of a run for coverage QA (also satisfied by `WallRun`). */
export interface ChainCoverageRun {
  readonly id: string;
  readonly nodeRefs: readonly { readonly station: number }[];
}
/** Minimal structural view of a placed string for coverage QA (satisfied by `PlacedString`). */
export interface ChainCoverageString {
  readonly axisId: string;
  readonly kind: string;
  readonly stationSpan: readonly [number, number];
}

/**
 * §FIX-AUTODIM-ORTHO-COMPLETE-CHAINS (L-147, SPEC §4.4 QA-2 / C56 §1.3 DI-3+DI-6)
 * — per-run chain-partition detection. For each exterior run, the chain ticks
 * MUST partition `[firstStation, lastStation]` with no GAP (a façade interval with
 * no covering dim = incomplete documentation) and no OVERLAP (two chain segments
 * measuring the same interval). Returns non-blocking `chain-gap`/`chain-overlap`
 * warnings; never throws. Slivers below `minSeg` are intentionally un-dimensioned
 * (planners.ts skips them) so gaps ≤ `minSeg` are not reported.
 *
 * Exported (structural inputs) so the completeness detection is unit-testable in
 * isolation without fabricating a full PlacedString. Pure + deterministic.
 */
export function detectChainCoverageGaps(
  runs: readonly ChainCoverageRun[],
  planned: readonly ChainCoverageString[],
  minSeg: number,
): ValidationWarning[] {
  // P8 (§1.7) — exported entry opens a `qa`-stage span; nests under the QA span
  // when called from the pipeline, opens its own when unit-tested directly.
  return withAutoDimSpan('qa', () => detectChainCoverageGapsImpl(runs, planned, minSeg));
}

/** Unspanned implementation — the pipeline's Stage-8 QA calls this directly. */
function detectChainCoverageGapsImpl(
  runs: readonly ChainCoverageRun[],
  planned: readonly ChainCoverageString[],
  minSeg: number,
): ValidationWarning[] {
  const out: ValidationWarning[] = [];
  for (const run of runs) {
    const nodeStations = run.nodeRefs.map((r) => r.station);
    if (nodeStations.length < 2) continue;
    const lo = Math.min(...nodeStations);
    const hi = Math.max(...nodeStations);
    if (hi - lo < minSeg) continue;

    // Covered intervals = chain strings on THIS run's axis (excludes overalls,
    // whose axisId is `overall-*`). Sorted ascending, normalised [a,b].
    const intervals = planned
      .filter((p) => p.axisId === run.id && (p.kind === 'linear-chain' || p.kind === 'linear-element'))
      .map((p) => [Math.min(p.stationSpan[0], p.stationSpan[1]), Math.max(p.stationSpan[0], p.stationSpan[1])] as [number, number])
      .sort((a, b) => a[0] - b[0] || a[1] - b[1]);

    if (intervals.length === 0) {
      out.push({ code: 'chain-gap', detail: `${run.id} [${lo.toFixed(3)},${hi.toFixed(3)}] uncovered` });
      continue;
    }

    // Walk left→right: report gaps > minSeg and overlaps > EPSILON.
    let cursor = lo;
    for (const [a, b] of intervals) {
      if (a - cursor > minSeg) {
        out.push({ code: 'chain-gap', detail: `${run.id} [${cursor.toFixed(3)},${a.toFixed(3)}] uncovered` });
      } else if (cursor - a > 0.001) {
        out.push({ code: 'chain-overlap', detail: `${run.id} [${a.toFixed(3)},${Math.min(b, cursor).toFixed(3)}]` });
      }
      cursor = Math.max(cursor, b);
    }
    if (hi - cursor > minSeg) {
      out.push({ code: 'chain-gap', detail: `${run.id} [${cursor.toFixed(3)},${hi.toFixed(3)}] uncovered` });
    }
  }
  return out;
}

function runQA(
  snapshot: AutoDimSnapshot,
  perimNodes: readonly DimNode[],
  planned: readonly PlacedString[],
  runs: readonly WallRun[],
  hasPerimeter: boolean,
  minSeg: number,
  resolutionNotes: readonly ValidationWarning[],
): ValidationWarning[] {
  const warnings: ValidationWarning[] = [...resolutionNotes];
  if (snapshot.walls.length === 0) {
    warnings.push({ code: 'no-walls', detail: 'snapshot has no walls' });
    return warnings;
  }
  if (!hasPerimeter) {
    warnings.push({ code: 'open-perimeter', detail: 'no closed building perimeter — per-wall fallback used' });
  }

  // §FIX-AUTODIM-ORTHO-COMPLETE-CHAINS (L-147, C56 §1.3 DI-7) — the ORTHOGONAL-ONLY
  // invariant. The `overall` bbox extents are axis-aligned by construction (the
  // AABB is world-cardinal); an `overall` that ever arrived non-cardinal would be
  // rendered as a diagonal across the footprint. Defensive guard — never expected
  // to fire (planOverall only emits horizontal/vertical), records if it ever does.
  for (const p of planned) {
    if (p.kind === 'overall' && p.orientation !== 'horizontal' && p.orientation !== 'vertical') {
      warnings.push({ code: 'non-orthogonal-string', detail: `overall ${p.axisId} orientation=${p.orientation}` });
    }
  }

  // §FIX-AUTODIM-ORTHO-COMPLETE-CHAINS (L-147, SPEC §4.4 QA-2) — chain gap/overlap.
  // A full-façade run whose length equals the perimeter AABB extent shares its
  // end-to-end ref-pair with the `overall` and is DEDUPED into it (DI-4, keep the
  // higher-rank overall — SPEC §4.3). That façade IS dimensioned (by the overall),
  // so credit the run's full interval when an overall carries its end-to-end refs.
  if (hasPerimeter) {
    const overallRefKeys = new Set<string>();
    for (const p of planned) {
      if (p.kind !== 'overall') continue;
      overallRefKeys.add([...p.refs].map((r) => `${r.elementId}:${r.anchor}`).sort().join('|'));
    }
    const coverage: ChainCoverageString[] = planned.map((p) => ({
      axisId: p.axisId, kind: p.kind, stationSpan: p.stationSpan,
    }));
    for (const run of runs) {
      const first = run.nodeRefs[0];
      const last = run.nodeRefs[run.nodeRefs.length - 1];
      if (!first || !last) continue;
      const key = [`${first.elementId}:${first.anchor}`, `${last.elementId}:${last.anchor}`].sort().join('|');
      if (overallRefKeys.has(key)) {
        coverage.push({ axisId: run.id, kind: 'linear-chain', stationSpan: [first.station, last.station] });
      }
    }
    // Unspanned impl — already inside the Stage-8 `qa` span (avoid double nesting).
    warnings.push(...detectChainCoverageGapsImpl(runs, coverage, minSeg));
  }

  // QA-1 opening coverage + DI-2 (every opening located AND sized).
  const referenced = new Set<string>();
  for (const p of planned) for (const r of p.refs) referenced.add(r.elementId);
  // A width dim = both refs are the opening's own left/right edges.
  const sizedIds = new Set<string>();
  const locatedIds = new Set<string>();
  for (const p of planned) {
    const ids = p.refs.map((r) => r.elementId);
    if (p.refs.length === 2 && ids[0] === ids[1]) {
      const anchors = new Set(p.refs.map((r) => r.anchor));
      if (anchors.has('left') && anchors.has('right')) sizedIds.add(ids[0]!);
    }
    for (const r of p.refs) if (r.anchor === 'center') locatedIds.add(r.elementId);
  }
  for (const w of snapshot.walls) {
    for (const op of w.openings) {
      if (!referenced.has(op.id)) { warnings.push({ code: 'opening-undimensioned', detail: op.id }); continue; }
      if (!sizedIds.has(op.id)) warnings.push({ code: 'opening-unsized', detail: op.id });
      if (!locatedIds.has(op.id)) warnings.push({ code: 'opening-unlocated', detail: op.id });
    }
  }

  // QA-4 no duplicates survive resolution (same orientation + axis + span).
  const spanSeen = new Set<string>();
  for (const p of planned) {
    const lo = Math.round(Math.min(p.stationSpan[0], p.stationSpan[1]) / 0.001);
    const hi = Math.round(Math.max(p.stationSpan[0], p.stationSpan[1]) / 0.001);
    const k = `${p.orientation}|${p.axisId}|${lo}|${hi}`;
    if (spanSeen.has(k)) warnings.push({ code: 'duplicate-string', detail: k });
    else spanSeen.add(k);
  }

  // QA-3 overall consistency (bbox extent within 0.5%).
  if (perimNodes.length > 0) {
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const n of perimNodes) {
      if (n.point.x < minX) minX = n.point.x;
      if (n.point.x > maxX) maxX = n.point.x;
      if (n.point.z < minZ) minZ = n.point.z;
      if (n.point.z > maxZ) maxZ = n.point.z;
    }
    const spanW = maxX - minX, spanH = maxZ - minZ;
    for (const p of planned) {
      if (p.kind !== 'overall') continue;
      const measured = Math.abs(p.stationSpan[1] - p.stationSpan[0]);
      const expected = p.orientation === 'horizontal' ? spanW : spanH;
      if (expected > 1e-6 && Math.abs(measured - expected) / expected > 0.005) {
        warnings.push({ code: 'overall-mismatch', detail: `${p.orientation} ${measured.toFixed(3)}≠${expected.toFixed(3)}` });
      }
    }
  }
  return warnings;
}

/**
 * Plan a non-redundant, architect-grade dimension set for a floor plan.
 *
 * P1 scope: overall (rank 1) + exterior wall-chain (rank 2) + opening chain
 * (rank 3) + opening location (rank 4) on rectangular + L plans. Full multi-row
 * conflict resolution and interior-room chains are P2/P3 (§SPIKE §16).
 */
export function planAutoDimensions(
  snapshot: AutoDimSnapshot,
  opts: AutoDimOptions,
): AutoDimResult {
  return withAutoDimSpan('plan', () => {
    const idFactory = opts.idFactory ?? makeMonotonicIdFactory();
    const snapEps = opts.snapEpsilonM ?? DEFAULT_SNAP_EPS_M;
    const minSeg = opts.minSegmentM ?? DEFAULT_MIN_SEGMENT_M;
    const walls = sortWalls(snapshot.walls);
    const wallsById = new Map<string, AutoDimWall>(walls.map((w) => [w.id, w]));

    // ── Stage 1: connectivity graph + perimeter, PER BUILDING ───────────────
    //
    // §FIX-AUTODIM-MULTI-BUILDING (L-268). This stage used to call `tracePerimeter`,
    // which returns THE single most-negative-area face — i.e. the LARGEST footprint on
    // the level — and silently threw the rest away. A level with two disjoint buildings
    // therefore got one of them dimensioned and NO warning about the other.
    //
    // The level is now partitioned into buildings ALWAYS: `tracePerimeters` returns one
    // outer face per connected component, and a single building is simply N = 1 down the
    // same path. There is no "if two buildings" branch to forget. Each building keeps its
    // OWN perimeter nodes and its OWN centroid — the centroid matters, because placement
    // pushes dim lines *outward from the centroid*, and a centroid averaged across two
    // separate buildings would push one building's dimensions INTO the other.
    // The partition itself is NOT ours: it is the shared domain concept
    // `partitionBuildings` (buildings.ts), which elevation auto-dimension (L-263), auto-tag
    // (L-265), interior elevations and schedules (C28) all consume. Keeping it out here —
    // rather than inline in this planner, and emphatically rather than in the L5
    // `applyAutoDimensions` executor — is what stops the next consumer re-deriving a
    // singular perimeter and reintroducing exactly this bug.
    const partition = partitionBuildings(walls, snapEps);
    const buildings: readonly Building[] = partition.buildings;
    const hasPerimeter = partition.hasPerimeter;
    const runs: WallRun[] = buildings.flatMap((b) => [...b.runs]);
    const perimNodes: DimNode[] = hasPerimeter
      ? buildings.flatMap((b) => [...b.perimNodes])
      : [...partition.graph.nodes];

    // ── Stage 2/3: openings per run ─────────────────────────────────────────
    const runOpenings = withAutoDimSpan('segment', () => {
      const m = new Map<string, RunOpening[]>();
      for (const run of runs) m.set(run.id, openingsOnRun(run, wallsById));
      return m;
    });

    // ── Stage 4/5: chain planning, PER BUILDING ─────────────────────────────
    //
    // §FIX-AUTODIM-MULTI-BUILDING (L-268) — each building is planned against its OWN
    // perimeter. `planOverall` must never see two buildings' nodes at once: its overall
    // string spans the extreme corners of what it is given, so a shared call would emit
    // one "overall" measuring ACROSS THE GAP between two separate buildings — a number
    // that means nothing on a drawing.
    //
    // Dedup stays GLOBAL (a key seen on building A is not re-emitted on building B), so
    // the non-redundancy guarantee is unchanged for the N = 1 case.
    const plannedByBuilding = withAutoDimSpan('chain', () => {
      const seen = new Set<string>();
      const dedupe = (list: PlannedString[]): PlannedString[] => {
        const byKey = new Map<string, PlannedString>();
        // Keep the higher-rank (lower rank number) string for a duplicate distance.
        for (const p of [...list].sort((a, b) => a.rank - b.rank)) {
          const k = dedupKey(p);
          if (seen.has(k) || byKey.has(k)) continue;
          byKey.set(k, p);
        }
        const out = [...byKey.values()];
        for (const p of out) seen.add(dedupKey(p));
        return out;
      };

      if (!hasPerimeter || runs.length === 0) {
        return [{ id: undefined as string | undefined, polygon: [] as PtXZ[], list: dedupe(planPerWallFallback(walls, minSeg)) }];
      }

      return buildings.map((b) => {
        const list: PlannedString[] = [];
        list.push(...planOverall(b.perimNodes));
        for (const run of b.runs) {
          const ops = runOpenings.get(run.id) ?? [];
          list.push(...planWallChain(run, minSeg));
          list.push(...planOpeningChain(run, ops, minSeg));
          list.push(...planOpeningLocations(run, ops, minSeg));
        }
        return { id: b.id as string | undefined, polygon: b.perimPolygon, list: dedupe(list) };
      });
    });

    // ── Stage 6: true outward-side placement + TIER assignment, PER BUILDING ─
    //
    // The outward side is chosen relative to the building's OWN centroid (§SPIKE §8), so
    // each building's dim stack is pushed away from ITS footprint. A centroid averaged
    // over two buildings would sit in the gap between them and push building A's
    // dimensions straight into building B.
    //
    // §FIX-OVERALL-DIM-OUTSIDE-AND-OUTERMOST (L-281) — each building also brings its OWN
    // footprint BBOX, and every string's standoff is measured from THAT (not from its own
    // reference line). Two buildings ⇒ two independent tier stacks, each clear of its own
    // plate: the bbox is per-building for exactly the reason the centroid is.
    const gapM = resolveTierGapM(opts);
    const bboxByBuilding: (FootprintBBox | null)[] = plannedByBuilding.map(({ polygon }) =>
      polygon.length >= 3 ? bboxOf(polygon) : null,
    );
    const placed = withAutoDimSpan('place', () =>
      plannedByBuilding.flatMap(({ polygon, list, id }, i) =>
        placeStrings(
          list,
          polygon.length >= 3 ? polygonCentroidImpl(polygon) : null,
          opts.labelCharWidthM,
          bboxByBuilding[i] ?? null,
          id,
        ),
      ),
    );

    // ── Stage 7: conflict detection + resolution (deterministic) ────────────
    const { placed: resolved, notes, skipped } = withAutoDimSpan('conflict', () =>
      resolveConflicts(placed, walls, minSeg, gapM),
    );

    // Serialize (deterministic id order).
    const strings = serialize(resolved, opts, idFactory);

    // ── Stage 8: QA (post-resolution validation notes) ──────────────────────
    const warnings = withAutoDimSpan('qa', () => {
      const w = runQA(snapshot, perimNodes, resolved, runs, hasPerimeter, minSeg, notes);
      // §FIX-OVERALL-DIM-OUTSIDE-AND-OUTERMOST (L-281) — RULE (a) checked against the
      // FOOTPRINT POLYGON of each building, at the position the string will actually be
      // DRAWN. Not the bbox: a bbox test passes an L-plate whose dim line runs through the
      // notch. Each building is tested against its OWN plate (a dim outside building A
      // that "crosses" distant building B's polygon is not a defect of A).
      if (hasPerimeter) {
        for (const b of buildings) {
          const mine = resolved.filter((p) => p.buildingId === b.id);
          if (mine.length === 0) continue;
          w.push(...detectFootprintCrossings(mine, b.perimPolygon, gapM));
        }
      }
      return w;
    });

    const openingCount = snapshot.walls.reduce((s, w) => s + w.openings.length, 0);
    const dimensioned = new Set<string>();
    for (const p of resolved) for (const r of p.refs) dimensioned.add(r.elementId);
    let openingsDimensioned = 0;
    for (const w of snapshot.walls) for (const op of w.openings) if (dimensioned.has(op.id)) openingsDimensioned++;

    // §FIX-AUTODIM-MULTI-BUILDING (L-268) — NEVER FAIL SILENTLY AGAIN. A building whose
    // walls were never referenced by any emitted string is an UNDIMENSIONED BUILDING, and
    // the founder must be told, not left to notice. This is the check that would have
    // caught the original bug on the day it shipped.
    const buildingCount = hasPerimeter ? buildings.length : 0;
    if (hasPerimeter) {
      let undimensioned = 0;
      for (const b of buildings) {
        const wallIds = new Set(b.runs.flatMap((r) => [...r.members]));
        const covered = [...wallIds].some((id) => dimensioned.has(id));
        if (!covered && wallIds.size > 0) undimensioned++;
      }
      if (undimensioned > 0) {
        warnings.push({
          code: 'building-undimensioned',
          detail:
            `${undimensioned} of ${buildings.length} building(s) on this level received NO dimensions — ` +
            `the drawing is incomplete`,
        });
      }
    }

    const report: AutoDimReport = {
      coverage: {
        wallCount: snapshot.walls.length,
        openingCount,
        openingsDimensioned,
        stringCount: strings.length,
        runCount: runs.length,
        // §FIX-AUTODIM-MULTI-BUILDING (L-268) — surfaced so the executor can TELL the
        // user how many buildings it dimensioned. Silence is what made this a bug.
        buildingCount,
      },
      warnings,
      skipped,
    };
    return { strings, report };
  }, { wall_count: snapshot.walls.length });
}
