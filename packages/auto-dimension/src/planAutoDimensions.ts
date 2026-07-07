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
import type { PtXZ } from './geometry.js';
import { buildGraph, tracePerimeter, splitRuns, type DimGraph } from './perimeter.js';
import { openingsOnRun, type RunOpening } from './openings.js';
import {
  planOverall, planWallChain, planOpeningChain, planOpeningLocations, dedupKey,
} from './planners.js';
import { placeStrings, polygonCentroidImpl } from './placement.js';
import { resolveConflicts } from './conflicts.js';
import { withAutoDimSpan } from './tracing.js';

const DEFAULT_SNAP_EPS_M = 0.20;
const DEFAULT_MIN_SEGMENT_M = 0.05;
const DEFAULT_STACK_WORLD_BASE_M = 0.5;
const DEFAULT_STACK_WORLD_SPACING_M = 0.5;
const MM_PER_M = 1000;

function makeMonotonicIdFactory(): () => string {
  let n = 0;
  return () => `dim-auto-${(++n).toString().padStart(6, '0')}`;
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
  const worldBaseM = opts.stackWorldBaseM ?? DEFAULT_STACK_WORLD_BASE_M;
  const worldSpacingM = opts.stackWorldSpacingM ?? DEFAULT_STACK_WORLD_SPACING_M;
  return ordered.map((p) => {
    const magnitudeM = worldBaseM + p.rowIndex * worldSpacingM;
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

    // ── Stage 1: connectivity graph + perimeter ─────────────────────────────
    const { runs, perimNodes, perimPolygon, hasPerimeter } = withAutoDimSpan('graph', () => {
      const g: DimGraph = buildGraph(walls, snapEps);
      const ring = tracePerimeter(g);
      if (!ring) {
        return { runs: [] as WallRun[], perimNodes: g.nodes, perimPolygon: [] as PtXZ[], hasPerimeter: false };
      }
      const rs = splitRuns(ring, g);
      const perimNodeSet = new Set(ring.nodeIds);
      const pn = g.nodes.filter((n) => perimNodeSet.has(n.id));
      const posById = new Map<string, PtXZ>(g.nodes.map((n) => [n.id, n.point]));
      const poly = ring.nodeIds.map((id) => posById.get(id)!).filter(Boolean);
      return { runs: rs, perimNodes: pn, perimPolygon: poly, hasPerimeter: true };
    }, { wall_count: walls.length });

    // ── Stage 2/3: openings per run ─────────────────────────────────────────
    const runOpenings = withAutoDimSpan('segment', () => {
      const m = new Map<string, RunOpening[]>();
      for (const run of runs) m.set(run.id, openingsOnRun(run, wallsById));
      return m;
    });

    // ── Stage 4/5: chain planning ───────────────────────────────────────────
    const planned = withAutoDimSpan('chain', () => {
      let list: PlannedString[] = [];
      if (hasPerimeter && runs.length > 0) {
        list.push(...planOverall(perimNodes));
        for (const run of runs) {
          const ops = runOpenings.get(run.id) ?? [];
          list.push(...planWallChain(run, minSeg));
          list.push(...planOpeningChain(run, ops, minSeg));
          list.push(...planOpeningLocations(run, ops, minSeg));
        }
      } else {
        list.push(...planPerWallFallback(walls, minSeg));
      }
      // Dedup identical (orientation, ref-pair) strings — never dimension the
      // same distance twice; keep the higher-rank (lower rank number) one.
      const byKey = new Map<string, PlannedString>();
      for (const p of list.sort((a, b) => a.rank - b.rank)) {
        const k = dedupKey(p);
        if (!byKey.has(k)) byKey.set(k, p);
      }
      list = [...byKey.values()];
      return list;
    });

    // ── Stage 6: true outward-side placement + row stacking ─────────────────
    const placed = withAutoDimSpan('place', () => {
      const centroid = hasPerimeter && perimPolygon.length >= 3
        ? polygonCentroidImpl(perimPolygon)
        : null;
      return placeStrings(planned, centroid, opts.labelCharWidthM);
    });

    // ── Stage 7: conflict detection + resolution (deterministic) ────────────
    const { placed: resolved, notes, skipped } = withAutoDimSpan('conflict', () =>
      resolveConflicts(
        placed,
        walls,
        minSeg,
        opts.stackWorldBaseM ?? DEFAULT_STACK_WORLD_BASE_M,
        opts.stackWorldSpacingM ?? DEFAULT_STACK_WORLD_SPACING_M,
      ),
    );

    // Serialize (deterministic id order).
    const strings = serialize(resolved, opts, idFactory);

    // ── Stage 8: QA (post-resolution validation notes) ──────────────────────
    const warnings = withAutoDimSpan('qa', () => runQA(snapshot, perimNodes, resolved, runs, hasPerimeter, minSeg, notes));

    const openingCount = snapshot.walls.reduce((s, w) => s + w.openings.length, 0);
    const dimensioned = new Set<string>();
    for (const p of resolved) for (const r of p.refs) dimensioned.add(r.elementId);
    let openingsDimensioned = 0;
    for (const w of snapshot.walls) for (const op of w.openings) if (dimensioned.has(op.id)) openingsDimensioned++;

    const report: AutoDimReport = {
      coverage: {
        wallCount: snapshot.walls.length,
        openingCount,
        openingsDimensioned,
        stringCount: strings.length,
        runCount: runs.length,
      },
      warnings,
      skipped,
    };
    return { strings, report };
  }, { wall_count: snapshot.walls.length });
}
