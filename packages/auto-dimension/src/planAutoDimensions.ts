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
// §GA-EDITORIAL-LAYER (L-1620/L-1621) — THE EDITORIAL LAYER (SPEC-AUTODIMENSION §12).
// Stages 1-7 answer WHERE a dimension goes; these two answer WHETHER IT SHOULD EXIST
// (§12.3) and WHETHER THE SHEET IS READABLE YET (§12.12). See editorial.ts for why the
// interior flood is a CLASSIFICATION defect (a cell loop is a room, not a building) and
// not a filter threshold.
import {
  classifyEnclosures, filterInteriorDimensions, planRoomExtents, DEFAULT_INTERIOR_POLICY,
  type EnclosureClassification,
} from './editorial.js';
import { traceRoomFaces, type RoomFace } from './perimeter.js';
import { optimiseDimensionSet, DEFAULT_MAX_OPTIMISE_ITERATIONS } from './optimise.js';

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
      // §GA-EDITORIAL-LAYER (L-1620) — an interior string that survived §12.3 was
      // re-stamped `'room-bounding'` by the editorial filter; everything else is a
      // set-out dimension as before.
      autoMode: p.autoMode ?? 'set-out',
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
  /**
   * §GA-EDITORIAL-LAYER (L-1622) — THE CHAIN THIS SEGMENT BELONGS TO.
   *
   * A façade carries SEVERAL chains, one per §12.2 string: the wall chain (rank 2) ticks
   * corner to corner, the opening chain (rank 3) subdivides the SAME run at pier/opening
   * edges. Both partition the run correctly, at different levels of detail — that is what
   * an architect draws — but merged into one interval list they overlap on every façade
   * with an opening, and QA-2 reported it as a defect every time.
   *
   * Each chain is therefore checked against the run SEPARATELY. Optional, defaulting to a
   * single group, so the existing structural callers (and the unit tests) are unchanged.
   */
  readonly rank?: number;
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

    // Covered intervals = chain strings on THIS run's axis (excludes overalls, whose
    // axisId is `overall-*`), grouped PER CHAIN (§GA-EDITORIAL-LAYER L-1622): a façade
    // carries the wall chain and the opening chain, each partitioning the run at its own
    // level of detail. Merging them made every multi-opening façade report an overlap.
    const byRank = new Map<number, [number, number][]>();
    for (const p of planned) {
      if (p.axisId !== run.id) continue;
      if (p.kind !== 'linear-chain' && p.kind !== 'linear-element') continue;
      const key = p.rank ?? 0;
      const iv: [number, number] = [
        Math.min(p.stationSpan[0], p.stationSpan[1]),
        Math.max(p.stationSpan[0], p.stationSpan[1]),
      ];
      const list = byRank.get(key);
      if (list) list.push(iv); else byRank.set(key, [iv]);
    }

    if (byRank.size === 0) {
      out.push({ code: 'chain-gap', detail: `${run.id} [${lo.toFixed(3)},${hi.toFixed(3)}] uncovered` });
      continue;
    }

    for (const rank of [...byRank.keys()].sort((a, b) => a - b)) {
      const intervals = byRank.get(rank)!.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
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
  // §GA-EDITORIAL-LAYER (L-1620, SPEC §12.3) — the walls that are on a BUILDING'S
  // PERIMETER. QA-1/DI-2 ("every opening located and sized") is now asserted for
  // EXTERIOR openings only, because §12.3 deliberately leaves interior openings
  // un-dimensioned and §12 wins over §4 where they disagree (SPEC §12 preamble). An
  // interior opening is not a silent omission: it is recorded in `skipped` with the
  // clause that dropped it.
  exteriorWallIds: ReadonlySet<string>,
  interiorSkips: { id: string; reason: string }[],
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
    // §GA-EDITORIAL-LAYER (L-1622) — QA-2 COVERS *CHAINS*, AND ONLY CHAINS.
    //
    // ⚠ THIS WAS A FALSE-WARNING FACTORY, and it is a large part of the "34 warnings"
    // SPEC §13 records. QA-2 (SPEC §4.4) asks whether a run's CHAIN INTERVALS PARTITION
    // the façade. This map used to feed it every `linear-chain` AND `linear-element`
    // string on the run — which includes the rank-4 OPENING LOCATION dims, each measured
    // from the run DATUM to an opening centre. Those are nested by construction (0→2.4,
    // 0→5.0, 0→9.1 …), so they overlap each other and the chain ALWAYS. The result was a
    // `chain-overlap` warning for every façade carrying more than one opening — 42 of the
    // 51 warnings on the GA plate, none of them describing a real defect.
    //
    // A warning that fires on every correct drawing is not a diagnostic; it is what makes
    // a warning count unreadable, and an unreadable warning count is how the engine came
    // to ship a drawing it had already judged unreadable. A location dim is not a chain
    // interval, so it is not evidence about whether the chain partitions the run.
    //
    // This NARROWS the input, not the rule: real gaps and real overlaps between chain
    // segments are still reported, and `detectChainCoverageGaps`' own contract (and its
    // unit tests, which pass only `linear-chain`) is unchanged.
    const coverage: ChainCoverageString[] = planned
      .filter((p) => p.kind === 'linear-chain')
      .map((p) => ({ axisId: p.axisId, kind: p.kind, stationSpan: p.stationSpan, rank: p.rank }));
    for (const run of runs) {
      const first = run.nodeRefs[0];
      const last = run.nodeRefs[run.nodeRefs.length - 1];
      if (!first || !last) continue;
      const key = [`${first.elementId}:${first.anchor}`, `${last.elementId}:${last.anchor}`].sort().join('|');
      if (overallRefKeys.has(key)) {
        // Credited for BOTH façade chains: the overall carries this run end to end, so
        // neither the wall chain nor the opening chain has a gap there.
        coverage.push({ axisId: run.id, kind: 'linear-chain', stationSpan: [first.station, last.station], rank: 2 });
        coverage.push({ axisId: run.id, kind: 'linear-chain', stationSpan: [first.station, last.station], rank: 3 });
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
    const exterior = exteriorWallIds.size === 0 || exteriorWallIds.has(w.id);
    for (const op of w.openings) {
      if (!exterior) {
        // §12.3 — an interior door/window is located by its tag and its schedule, not by
        // a dimension on a GA. Declared, never silent.
        if (!referenced.has(op.id)) {
          interiorSkips.push({ id: op.id, reason: '§12.3 interior-opening-not-dimensioned' });
        }
        continue;
      }
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

    // ── Stage 1.5: ENCLOSURE CLASSIFICATION + ROOMS (§12.3) ─────────────────
    //
    // §GA-EDITORIAL-LAYER (L-1620). Two facts the engine never had, and both are needed
    // before a single dimension can be judged:
    //
    //   (a) WHICH ENCLOSURES ARE BUILDINGS. L-268 traces one outer face per connected
    //       component — right for two buildings on a site, wrong for an apartment-cell
    //       loop inside a shell, which it also called a building and dimensioned in full.
    //       An enclosure inside an enclosure is a ROOM.
    //   (b) WHAT THE ROOMS ARE. §12.3 caps interior dimensions "per room", and the rooms
    //       are the INTERIOR faces of the same half-edge walk — which `tracePerimeters`
    //       computes and discards. They are NOT the components: the endpoint-clustering
    //       band (0.20 m) is wider than the gap a generator leaves between adjacent cells
    //       (~0.10-0.15 m), so five cells arrive as ONE component whose outer face is the
    //       outline of all five. Reading rooms off components would have capped a BAND.
    const interiorPolicy = opts.interiorPolicy ?? DEFAULT_INTERIOR_POLICY;
    const classification: EnclosureClassification = classifyEnclosures(buildings);
    const envelopeRingWallSets = classification.envelopes.map(
      (b) => new Set(b.runs.flatMap((r) => [...r.members])),
    );
    const roomFaces: RoomFace[] = hasPerimeter
      ? traceRoomFaces(partition.graph, envelopeRingWallSets, interiorPolicy.minRoomAreaM2)
      : [];

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
    // §GA-EDITORIAL-LAYER (L-1620) — §12.3's ALLOW-LIST is PLANNED, not merely filtered.
    // The GA plate carried 68 interior dimensions and not one of them was a corridor
    // width: §12.3 was over-supplied with room edges AND under-supplied with the
    // construction-critical set at the same time. `planRoomExtents` emits at most one
    // width and one length for each room the geometry says is critical (a corridor, a
    // stair, a service room) — the cap satisfied by construction.
    const roomExtents = planRoomExtents(roomFaces, interiorPolicy);
    const placed = withAutoDimSpan('place', () => [
      ...plannedByBuilding.flatMap(({ polygon, list, id }, i) =>
        placeStrings(
          list,
          polygon.length >= 3 ? polygonCentroidImpl(polygon) : null,
          opts.labelCharWidthM,
          bboxByBuilding[i] ?? null,
          id,
        ),
      ),
      // INWARD: an internal dimension is drawn inside the space it measures (see
      // `placeStrings`). Its `buildingId` is the ROOM's id, which is what §12.3's
      // per-room cap keys on.
      ...roomExtents.plans.flatMap((plan) =>
        placeStrings(
          plan.strings,
          polygonCentroidImpl(plan.room.polygon),
          opts.labelCharWidthM,
          null,
          plan.room.id,
          true,
        ),
      ),
    ]);

    // ── Stage 6.5: THE EDITORIAL FILTER — SPEC-AUTODIMENSION §12.3 ──────────
    //
    // §GA-EDITORIAL-LAYER (L-1620). Everything above answers WHERE a dimension goes.
    // Nothing above ever asked WHETHER IT SHOULD EXIST, and that is the whole of the
    // founder's complaint: a real 12-room plate came back geometrically defensible and
    // unreadable, carrying a dimension on every room edge — which §12.3 explicitly
    // forbids.
    //
    // The root is a CLASSIFICATION, not a threshold. The shipped layout generators emit
    // interior partitions as CLOSED wall loops that touch the shell only by coordinate
    // coincidence (`ResidentialBuildingExecutor._buildCellPerimeter`;
    // `weldPartitionsToShell` welds onto the shell CENTRELINE and never cuts it), so
    // L-268's "one outer face per connected component" — correct for two buildings on a
    // site — called every apartment cell A BUILDING and dimensioned it in full. An
    // enclosure inside an enclosure is a ROOM. `classifyEnclosures` says so once, and
    // §12.3 is then a small readable rule on top of it (editorial.ts).
    //
    // ⛔ EXTERIOR STRINGS ARE RETURNED BY IDENTITY. §12.2's three perimeter strings and
    // the tier model that places them (L-281) are a separate, stricter contract; the
    // filter must be invisible to them.
    const {
      kept: editorial,
      dropped: editorialDrops,
    } = filterInteriorDimensions(placed, classification, interiorPolicy);

    // ── Stage 7: conflict detection + resolution (deterministic) ────────────
    const { placed: resolved, notes, skipped } = withAutoDimSpan('conflict', () =>
      resolveConflicts(editorial, walls, minSeg, gapM),
    );

    // ── Stage 7.5: THE OPTIMISATION PASS — SPEC-AUTODIMENSION §12.12 ────────
    //
    // §GA-EDITORIAL-LAYER (L-1621). Stage 8 below EMITS WARNINGS AND STOPS; 34 of them on
    // one plate is the engine correctly noticing it produced an unreadable drawing and
    // shipping it anyway. This is the missing half: remove duplicate dimensions →
    // straighten chains → push outward where possible, repeated to FIXPOINT. It cannot
    // spin — every term it moves is monotone (optimise.ts) — and the iteration bound is a
    // guard whose breach is REPORTED, never swallowed.
    const optimised = optimiseDimensionSet(
      resolved,
      opts.maxOptimiseIterations ?? DEFAULT_MAX_OPTIMISE_ITERATIONS,
    );
    const finalPlaced = optimised.placed;

    // Serialize (deterministic id order).
    const strings = serialize(finalPlaced, opts, idFactory);

    // ── Stage 8: QA (post-resolution validation notes) ──────────────────────
    //
    // §GA-EDITORIAL-LAYER (L-1620) — QA is now asserted against ENVELOPES, not against
    // every enclosure. QA-2 is defined over "each EXTERIOR run" (SPEC §4.4); a room's
    // wall loop was only ever labelled exterior because it had been mis-classified as a
    // building, and demanding chain coverage of every room edge is the exact drawing
    // §12.3 forbids. This narrows the denominator by fixing the classification — it does
    // NOT suppress a warning: every string the editorial filter removed is in `skipped`
    // with the clause that removed it.
    const envelopePerimNodes: DimNode[] = hasPerimeter
      ? classification.envelopes.flatMap((b) => [...b.perimNodes])
      : perimNodes;
    const envelopeRuns: WallRun[] = classification.envelopes.flatMap((b) => [...b.runs]);
    const exteriorWallIds = new Set<string>(
      classification.envelopes.flatMap((b) => b.runs.flatMap((r) => [...r.members])),
    );
    const interiorSkips: { id: string; reason: string }[] = [];
    const warnings = withAutoDimSpan('qa', () => {
      const w = runQA(
        snapshot, envelopePerimNodes, finalPlaced, envelopeRuns, hasPerimeter, minSeg,
        [...notes, ...optimised.notes], exteriorWallIds, interiorSkips,
      );
      // §FIX-OVERALL-DIM-OUTSIDE-AND-OUTERMOST (L-281) — RULE (a) checked against the
      // FOOTPRINT POLYGON of each building, at the position the string will actually be
      // DRAWN. Not the bbox: a bbox test passes an L-plate whose dim line runs through the
      // notch. Each building is tested against its OWN plate (a dim outside building A
      // that "crosses" distant building B's polygon is not a defect of A).
      if (hasPerimeter) {
        for (const b of buildings) {
          const mine = finalPlaced.filter((p) => p.buildingId === b.id);
          if (mine.length === 0) continue;
          w.push(...detectFootprintCrossings(mine, b.perimPolygon, gapM));
        }
      }
      return w;
    });

    const openingCount = snapshot.walls.reduce((s, w) => s + w.openings.length, 0);
    const dimensioned = new Set<string>();
    for (const p of finalPlaced) for (const r of p.refs) dimensioned.add(r.elementId);
    let openingsDimensioned = 0;
    for (const w of snapshot.walls) for (const op of w.openings) if (dimensioned.has(op.id)) openingsDimensioned++;

    // §FIX-AUTODIM-MULTI-BUILDING (L-268) — NEVER FAIL SILENTLY AGAIN. A building whose
    // walls were never referenced by any emitted string is an UNDIMENSIONED BUILDING, and
    // the founder must be told, not left to notice. This is the check that would have
    // caught the original bug on the day it shipped.
    // §GA-EDITORIAL-LAYER (L-1620) — count BUILDINGS, not enclosures. L-268 reported a
    // 12-room plate as thirteen buildings, which is how the interior flood was able to
    // look like coverage.
    const buildingCount = hasPerimeter ? classification.envelopes.length : 0;
    if (hasPerimeter) {
      let undimensioned = 0;
      for (const b of classification.envelopes) {
        const wallIds = new Set(b.runs.flatMap((r) => [...r.members]));
        const covered = [...wallIds].some((id) => dimensioned.has(id));
        if (!covered && wallIds.size > 0) undimensioned++;
      }
      if (undimensioned > 0) {
        warnings.push({
          code: 'building-undimensioned',
          detail:
            `${undimensioned} of ${classification.envelopes.length} building(s) on this level received NO dimensions — ` +
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
        // §GA-EDITORIAL-LAYER (L-1620) — rooms are counted, never dimensioned wholesale.
        roomCount: roomFaces.length,
        interiorDimCount: finalPlaced.filter((p) => p.autoMode === 'room-bounding').length,
      },
      warnings,
      // INV-3, "surface, don't silently omit": every editorial removal (§12.3), every
      // duplicate the optimisation pass collapsed (§12.12) and every interior opening
      // deliberately left un-dimensioned is named here with the clause responsible.
      skipped: [...skipped, ...editorialDrops, ...optimised.dropped, ...interiorSkips],
    };
    return { strings, report };
  }, { wall_count: snapshot.walls.length });
}
