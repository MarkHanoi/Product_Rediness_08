/**
 * analysisReadModel — the ONE substrate every Analysis widget reads.
 *
 * Layer Affected:  UI — Analysis surface (L7)
 * File:            apps/editor/src/ui/analysis/analysisReadModel.ts
 * ADR:             ADR-0343 §D.4 (the query substrate) · §D.6 (honesty rules)
 * SPEC:            SPEC-ANALYSIS-SURFACE-AND-WIDGETS §2, §3
 * Contracts:       C03 (read-model; this module MUTATES NOTHING) · C66 §1.1 · C10 §1
 * Issue log:       L-3003 (this module) · L-3004 (the O(Δ) gap, stated below)
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * ⚠ WHAT THIS IS, STATED BEFORE ANYTHING ELSE — IT IS NOT WHAT §D.4 SPECIFIES
 * ═════════════════════════════════════════════════════════════════════════════
 * ADR-0343 §D.4 specifies an *"incrementally-maintained analysis read model,
 * built on the SemanticIndex pattern — StoreEventBus-driven, O(Δ) on mutation,
 * O(1) on lookup, serialisable."*
 *
 * ⛔ THIS IS NOT THAT. This is a CACHED FULL PROJECTION: one O(n) scan across a
 * DECLARED table of stores, memoised until something invalidates it. Lookup
 * after the scan is O(1); the scan itself is O(n) and runs again on every
 * invalidation. The O(Δ) maintenance is NOT BUILT — L-3004.
 *
 * That is written at the top rather than buried, because the difference is
 * exactly the kind of thing that gets restated later as "the read model" and
 * then relied on for a budget it cannot hold. What it DOES satisfy, and what
 * made it worth building rather than skipping:
 *
 *   ✓ widgets read a DESCRIPTOR, never a store (§D.3) — so no widget can reach
 *     `ElementStore.getState()` and undercount (§C.3.2 / L-2132);
 *   ✓ identical queries are computed ONCE (the cache is keyed on `query.id`);
 *   ✓ cost is declared BEFORE the query runs and is rendered on the card;
 *   ✓ unreachable ≠ empty ≠ zero, all the way through the envelope.
 *
 * The scan is scheduled, never eager: it runs on demand and only while the
 * Analysis surface is visible. It is NOT on the frame path (P3).
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * ⛔ WHAT THIS MODULE MAY NEVER READ
 * ═════════════════════════════════════════════════════════════════════════════
 *  • `window.__pryzmBuildingGraph` **FOR AGGREGATES** — and the reason has
 *    CHANGED, so read this rather than the sentence it replaced.
 *
 *    ⚠ CORRECTED 2026-08-21 (lane UBG1, L-3258). This bullet read: *"the Unified
 *    Building Graph — STALE BY CONSTRUCTION (ADR-0343 §C.3.1, L-2131). It is
 *    rebuilt only when one of the two graph overlays is opened; nothing
 *    subscribes to store events."* **The second sentence is now false.**
 *    `engine/buildingGraphMaintainer.ts` subscribes the StoreEventBus and applies
 *    O(Δ) deltas, and `installLiveGraphWiring()` installs it (L-3251). The graph
 *    publishes its own freshness at `window.__pryzmUbgLiveness`.
 *
 *    ⛔ THE PROHIBITION STANDS ANYWAY, on the OTHER half of §D.4's argument: the
 *    UBG is a PROJECTION, not a census. A node exists in it only if some adapter
 *    projected a relationship touching it, so counting walls there counts the
 *    walls that participate in a projected edge — an undercount that reads as a
 *    count (§C.3.2). Staleness was never the only reason and is no longer a
 *    reason at all.
 *
 *    ⭐ Relational widgets are the exception §D.4 always carved out (*"The UBG
 *    keeps the relational widgets… but only once it is maintained"*). That
 *    precondition is met, so `source: 'graph'` below reads it — for RELATIONS
 *    only, via `graphReadModel.ts`, which ships a coverage row per edge family
 *    because four of the ten cannot be populated in production at all.
 *  • `ElementStore.getState()` — LRU-resident subset only, typed `ReadonlyMap`
 *    with no way to tell a partial view from a whole one (§C.3.2, L-2132).
 *  • `ScheduleExtractor`'s STRING fields — `:238` emits
 *    `(r.computed?.area ?? 0).toFixed(2)`, so an absent area becomes `"0.00"`
 *    (L-2136). Absence must not be re-parsed back out of a formatted zero.
 *
 * The census reads the SAME per-store `getAll()` surface `computeTakeoff()`
 * reads, which is the honest denominator available today.
 *
 * L7 file. No THREE (P2), no rAF (P3), no `(window as any)` (P4) — the store
 * globals are typed on `Window` in `src/global-window.d.ts`, no store writes
 * (P6), one OTel span per exported function (P8).
 */

import {
  computeTakeoff,
  TAKEOFF_CHAPTERS,
  UNIT_LABEL,
  type CoverageRow,
  type QuantityUnit,
  type TakeoffResult,
} from '@pryzm/core-app-model';
import { withHandlerSpan } from '@pryzm/plugin-sdk';

import { projectGraph, type GraphPlacement } from './graphReadModel';
import { areaCoverageRows, areaStandard } from './areaStandards';

import type {
  AnalysisAxis,
  AnalysisFigure,
  AnalysisQuery,
  AnalysisResult,
} from './AnalysisTypes';
import { projectScopeRegistry } from '@pryzm/core-app-model';

// ── The declared source table ─────────────────────────────────────────────────
//
// ⭐ THIS TABLE IS THE DENOMINATOR, AND IT IS WRITTEN DOWN.
//
// A census whose sources are discovered by iterating `window` cannot tell you
// what it FAILED to find — an absent store is indistinguishable from a store
// that was never in the list. Declaring the list means "the roof store was not
// published" is a REPORTABLE state, which is the whole of §D.6 H5.
//
// `storeName` is the `window` key. Every one of these is assigned in
// `engine/initBuilders.ts`, `engine/initTools.ts` or `engine/engineLauncher.ts`
// (measured 2026-08-21) — but assignment happens during boot, so a read before
// the store lands is a REAL unreachable, not a bug in this table.

interface CensusSource {
  /** `window` key. */
  readonly storeName: string;
  /** Stable group key. */
  readonly key: string;
  /** Human label, singular-agnostic. */
  readonly label: string;
  /**
   * The record field carrying a resolvable TYPE, or `null` when the family
   * carries none. `null` is a stated fact: those elements land in the NAMED
   * `untyped` slice with a reason, never folded into the largest slice
   * (SPEC §4.1 W2).
   */
  readonly typeField: string | null;
}

const CENSUS_SOURCES: readonly CensusSource[] = Object.freeze([
  { storeName: 'wallStore',        key: 'walls',        label: 'Walls',         typeField: 'systemTypeId' },
  { storeName: 'roomStore',        key: 'rooms',        label: 'Rooms',         typeField: 'roomType'     },
  { storeName: 'doorStore',        key: 'doors',        label: 'Doors',         typeField: 'doorType'     },
  { storeName: 'windowStore',      key: 'windows',      label: 'Windows',       typeField: 'windowType'   },
  { storeName: 'slabStore',        key: 'slabs',        label: 'Slabs',         typeField: 'systemTypeId' },
  { storeName: 'floorStore',       key: 'floors',       label: 'Floor finishes', typeField: 'systemTypeId' },
  { storeName: 'ceilingStore',     key: 'ceilings',     label: 'Ceilings',      typeField: 'systemTypeId' },
  { storeName: 'roofStore',        key: 'roofs',        label: 'Roofs',         typeField: 'roofType'     },
  { storeName: 'columnStore',      key: 'columns',      label: 'Columns',       typeField: 'profile'      },
  { storeName: 'beamStore',        key: 'beams',        label: 'Beams',         typeField: 'profile'      },
  { storeName: 'stairStore',       key: 'stairs',       label: 'Stairs',        typeField: 'stairType'    },
  { storeName: 'handrailStore',    key: 'handrails',    label: 'Handrails',     typeField: 'typeId'       },
  { storeName: 'curtainWallStore', key: 'curtainWalls', label: 'Curtain walls', typeField: null           },
  { storeName: 'furnitureStore',   key: 'furniture',    label: 'Furniture',     typeField: 'furnitureType' },
  { storeName: 'plumbingStore',    key: 'plumbing',     label: 'Plumbing',      typeField: 'fixtureType'  },
  { storeName: 'lightingStore',    key: 'lighting',     label: 'Lighting',      typeField: 'fixtureType'  },
  { storeName: 'openingStore',     key: 'openings',     label: 'Openings',      typeField: null           },
  { storeName: 'gridStore',        key: 'grids',        label: 'Grids',         typeField: null           },
]);

// ── The census snapshot ───────────────────────────────────────────────────────

interface CensusRecord {
  readonly id: string;
  readonly levelId: string | null;
  readonly typeId: string | null;
}

interface CensusGroup {
  readonly key: string;
  readonly label: string;
  readonly records: CensusRecord[];
  /** `null` typeField ⇒ this family carries no type; stated, not guessed. */
  readonly typeField: string | null;
}

export interface CensusSnapshot {
  readonly groups: readonly CensusGroup[];
  /** Stores that were not reachable AT ALL. Distinct from empty. */
  readonly unreachable: readonly string[];
  readonly coverage: readonly CoverageRow[];
  readonly total: number;
  readonly computedAt: number;
  readonly elapsedMs: number;
  /** Level id → display name, from the live level authority. */
  readonly levelNames: ReadonlyMap<string, string>;
  /** `false` ⇒ at least one declared source was unreadable. `total` is a FLOOR. */
  readonly complete: boolean;
}

/**
 * Read one declared store. Returns `null` — NOT `[]` — when the store is
 * unreachable, because those are different answers and the whole envelope
 * depends on them staying different (§D.6 H2).
 */
function readStore(name: string): unknown[] | null {
  if (typeof window === 'undefined') return null;
  const store = (window as unknown as Record<string, unknown>)[name] as
    | { getAll?: () => unknown[] }
    | undefined;
  if (!store || typeof store.getAll !== 'function') return null;
  try {
    const rows = store.getAll();
    return Array.isArray(rows) ? rows : [];
  } catch {
    // A store that THREW is unreachable, not empty. Swallowing this into `[]`
    // is exactly how "0 walls" gets asserted to an architect checking a model
    // (§C78-U-INV-4 recorded the same shape on the ELEMENTS card).
    return null;
  }
}

function str(v: unknown): string | null {
  return typeof v === 'string' && v.length > 0 ? v : null;
}

/**
 * Resolve the live level table. `window.levelStore` is a PHANTOM — never
 * assigned in production (ADR-0327 recorded it); `bimManager.getLevels()` is the
 * authority. An empty map is a real answer and produces `unassigned` bars, not
 * dropped elements.
 */
function readLevelNames(): Map<string, string> {
  const out = new Map<string, string>();
  const bim = window.bimManager;
  if (!bim?.getLevels) return out;
  try {
    const levels = bim.getLevels() as Array<{ id?: string; name?: string }>;
    for (const l of levels ?? []) {
      if (typeof l?.id === 'string') out.set(l.id, typeof l.name === 'string' ? l.name : l.id);
    }
  } catch {
    /* §SWALLOW-LEVEL-READ — an unreadable level table degrades every level to
       its raw id, which is worse-looking but still TRUE. It must not take the
       whole census down with it. */
  }
  return out;
}

// ── Memoisation ───────────────────────────────────────────────────────────────
//
// One scan serves every widget on the surface. `invalidate()` drops the cache;
// the next `runQuery` re-scans. There is no timer and no polling — an
// invalidation is always caused by something that actually happened.

let _census: CensusSnapshot | null = null;
let _takeoff: TakeoffResult | null = null;
const _queryCache = new Map<string, AnalysisResult>();

/**
 * Drop every cached projection. Called on commit and on project load.
 * Cheap and idempotent — it frees, it does not compute.
 */
export function invalidateAnalysisReadModel(): void {
  withHandlerSpan('pryzm.analysis.readmodel.invalidate', { 'pryzm.surface': 'analysis' }, () => {
    _census = null;
    _takeoff = null;
    _areas = null;
    _placement = null;
    _placementFor = null;
    _queryCache.clear();
  });
}

/**
 * The element census — ONE O(n) pass over the declared source table.
 *
 * ⚠ COST: O(n) across ~18 stores, and SPEC §3 records that `O(n)` here is not
 * the textbook one — `FloorStore.getAll()` `structuredClone`s every record on
 * each call. This is why the result is memoised and why no widget may declare
 * `refresh: 'on-frame'` (there is no such value).
 */
export function getCensus(): CensusSnapshot {
  if (_census) return _census;
  return withHandlerSpan(
    'pryzm.analysis.readmodel.census',
    { 'pryzm.surface': 'analysis', 'pryzm.analysis.sources': CENSUS_SOURCES.length },
    () => {
      const t0 = Date.now();
      const groups: CensusGroup[] = [];
      const unreachable: string[] = [];
      const coverage: CoverageRow[] = [];
      let total = 0;

      for (const src of CENSUS_SOURCES) {
        const rows = readStore(src.storeName);
        if (rows === null) {
          unreachable.push(src.storeName);
          coverage.push({
            family: src.label,
            state: 'NOT_MEASURED',
            note: `${src.storeName} was not reachable when the census ran — this is NOT "there are none".`,
          });
          continue;
        }
        const records: CensusRecord[] = [];
        for (const raw of rows) {
          const r = raw as Record<string, unknown>;
          const id = str(r.id);
          if (!id) continue; // an element with no id cannot be traced to, so it cannot be a figure
          records.push({
            id,
            levelId: str(r.levelId),
            typeId: src.typeField ? str(r[src.typeField]) : null,
          });
        }
        total += records.length;
        groups.push({ key: src.key, label: src.label, records, typeField: src.typeField });
        coverage.push(
          records.length === 0
            ? {
                family: src.label,
                state: 'MEASURED',
                // ⭐ SPEC §2.1: "empty" renders as 0 WITH THE AXIS NAMED. A bare
                // "contains none" is the same sentence for every family and is
                // therefore indistinguishable from a template that never ran.
                note: `Store read successfully; the project contains no ${src.label.toLowerCase()}.`,
              }
            : {
                family: src.label,
                state: 'COUNTED_ONLY',
                note: src.typeField
                  ? `Counted from ${src.storeName}; type read from \`${src.typeField}\`. No quantity is derived here — see the take-off.`
                  : `Counted from ${src.storeName}. This family carries no type field, so every element is \`untyped\` by fact, not by failure.`,
              },
        );
      }

      _census = {
        groups,
        unreachable,
        coverage,
        total,
        computedAt: Date.now(),
        elapsedMs: Date.now() - t0,
        levelNames: readLevelNames(),
        complete: unreachable.length === 0,
      };
      return _census;
    },
  );
}

// ── Room areas (§ANALYSIS-AREA-STANDARDS, L-3640) ────────────────────────────
//
// ⛔ READ HERE, NOT IN THE WIDGET. `areaStandards.ts` holds the standards and
// touches no store; this module is the ONE place on this surface that reads a
// store, which is what stops a widget reaching past the read model and
// undercounting (ADR-0343 §D.3, §C.3.2).
//
// ⚠ WHAT `Room.area` IS, measured 2026-08-22 and load-bearing for every figure
// derived from it: `grep -n centerline packages/geometry-kernel/src/producers/
// room.ts` -> :59 "Wall ids whose CENTERLINE edge contributed to the boundary",
// :64 "Half-edge graph from wall CENTERLINES". It is the area enclosed by the
// wall CENTRELINES. Exact for that definition; not the plane any published
// standard measures on. Every basis string this module emits says so.

export interface RoomAreaRecord {
  readonly id: string;
  readonly levelId: string | null;
  /** m², centreline-enclosed. */
  readonly area: number;
  /** m, centreline perimeter. Drives the face-correction bracket. */
  readonly perimeter: number;
  /**
   * Thinnest / thickest BOUNDING wall, or `null` when no bounding wall could be
   * resolved. ⛔ `null` is not 0: a room whose walls cannot be found produces NO
   * bracket contribution and is counted separately, rather than silently
   * contributing a zero correction that would narrow the interval falsely.
   */
  readonly minWallThickness: number | null;
  readonly maxWallThickness: number | null;
}

export interface RoomAreaSnapshot {
  readonly rooms: readonly RoomAreaRecord[];
  readonly unreachable: readonly string[];
  readonly complete: boolean;
  /** Rooms whose cached area is 0 — NOT counted as 0 m² rooms; reported. */
  readonly roomsWithNoArea: number;
  /** Rooms for which no bounding wall thickness resolved. */
  readonly roomsWithoutBracket: number;
  readonly levelNames: ReadonlyMap<string, string>;
  readonly elapsedMs: number;
}

let _areas: RoomAreaSnapshot | null = null;

function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

/**
 * The room-area snapshot. One pass over `roomStore`, plus one index build over
 * `wallStore` for the face-correction bracket.
 *
 * ⚠ COST: O(n + m). Memoised with the census and dropped by the same invalidate.
 */
export function getRoomAreas(): RoomAreaSnapshot {
  if (_areas) return _areas;
  return withHandlerSpan('pryzm.analysis.readmodel.areas', { 'pryzm.surface': 'analysis' }, () => {
    const t0 = Date.now();
    const unreachable: string[] = [];

    const roomRows = readStore('roomStore');
    if (roomRows === null) unreachable.push('roomStore');
    const wallRows = readStore('wallStore');
    // ⛔ An unreadable WALL store does not make the AREAS unreadable — it makes
    // the BRACKET unavailable. Two different figures, two different failures;
    // collapsing them would suppress a real area sum over a missing correction.
    if (wallRows === null) unreachable.push('wallStore (bracket only)');

    const thickness = new Map<string, number>();
    for (const raw of wallRows ?? []) {
      const w = raw as Record<string, unknown>;
      const id = str(w.id);
      const t = num(w.thickness);
      if (id && t !== null && t > 0) thickness.set(id, t);
    }

    const rooms: RoomAreaRecord[] = [];
    let roomsWithNoArea = 0;
    let roomsWithoutBracket = 0;

    for (const raw of roomRows ?? []) {
      const r = raw as Record<string, unknown>;
      const id = str(r.id);
      if (!id) continue;
      const area = num(r.area) ?? 0;
      if (!(area > 0)) roomsWithNoArea++;

      // Either cache is acceptable — `boundingWallIds` is the legacy alias the
      // producer maintains in lockstep with `boundingElementIds` (Room.ts:136).
      const bounding = [
        ...(Array.isArray(r.boundingWallIds) ? (r.boundingWallIds as unknown[]) : []),
        ...(Array.isArray(r.boundingElementIds) ? (r.boundingElementIds as unknown[]) : []),
      ].filter((x): x is string => typeof x === 'string');

      const ts: number[] = [];
      for (const wid of bounding) {
        const t = thickness.get(wid);
        if (t !== undefined) ts.push(t);
      }
      if (ts.length === 0) roomsWithoutBracket++;

      rooms.push({
        id,
        levelId: str(r.levelId),
        area,
        perimeter: num(r.perimeter) ?? 0,
        minWallThickness: ts.length > 0 ? Math.min(...ts) : null,
        maxWallThickness: ts.length > 0 ? Math.max(...ts) : null,
      });
    }

    _areas = {
      rooms,
      unreachable,
      // ⛔ Only an unreadable ROOM store makes the AREA figures a floor. A missing
      // bracket is a missing qualifier, not a missing measurement.
      complete: roomRows !== null,
      roomsWithNoArea,
      roomsWithoutBracket,
      levelNames: readLevelNames(),
      elapsedMs: Date.now() - t0,
    };
    return _areas;
  });
}

/**
 * The take-off, memoised. `computeTakeoff()` is THE measurement authority
 * (ADR-0343 §D.4) — this module derives no quantity of its own, ever.
 *
 * ⚠ COST: O(n·m) — a scan with a per-element derivation. Manual refresh only.
 */
export function getTakeoff(): TakeoffResult {
  if (_takeoff) return _takeoff;
  return withHandlerSpan('pryzm.analysis.readmodel.takeoff', { 'pryzm.surface': 'analysis' }, () => {
    _takeoff = computeTakeoff();
    return _takeoff;
  });
}

// ── Query execution ───────────────────────────────────────────────────────────

function figure(
  key: string,
  label: string,
  value: number,
  unit: QuantityUnit,
  basis: string,
  elementIds: readonly string[],
  qualifiers: readonly string[] = [],
): AnalysisFigure {
  return { key, label, value, unit, basis, elementIds, qualifiers };
}

const CENSUS_BASIS = 'Count of records returned by the element store, one per element id.';

function censusByCategory(c: CensusSnapshot): AnalysisFigure[] {
  return c.groups
    .filter((g) => g.records.length > 0)
    .map((g) => figure(g.key, g.label, g.records.length, 'ud', CENSUS_BASIS, g.records.map((r) => r.id)))
    .sort((a, b) => b.value - a.value);
}

function censusByLevel(c: CensusSnapshot): AnalysisFigure[] {
  const byLevel = new Map<string, string[]>();
  for (const g of c.groups) {
    for (const r of g.records) {
      // ⛔ An element with no levelId is NOT dropped. SPEC §4.1 W3: it becomes a
      // NAMED `unassigned` bar. Dropping it would make the bars sum to less than
      // the headline count with nothing on screen saying why.
      const k = r.levelId ?? 'unassigned';
      const bucket = byLevel.get(k);
      if (bucket) bucket.push(r.id);
      else byLevel.set(k, [r.id]);
    }
  }
  const out: AnalysisFigure[] = [];
  for (const [k, ids] of byLevel) {
    const label = k === 'unassigned' ? 'No level assigned' : (c.levelNames.get(k) ?? k);
    out.push(figure(k, label, ids.length, 'ud', CENSUS_BASIS, ids));
  }
  // Named absence sorts last, so it never leads the chart.
  return out.sort((a, b) => (a.key === 'unassigned' ? 1 : b.key === 'unassigned' ? -1 : b.value - a.value));
}

function censusByType(c: CensusSnapshot): AnalysisFigure[] {
  const byType = new Map<string, { label: string; ids: string[] }>();
  for (const g of c.groups) {
    for (const r of g.records) {
      // Type keys are namespaced by family: a wall type and a door type may
      // share a raw id string, and merging them would invent a category.
      const k = r.typeId ? `${g.key}:${r.typeId}` : 'untyped';
      const label = r.typeId ? `${g.label} · ${r.typeId}` : 'Untyped';
      const bucket = byType.get(k);
      if (bucket) bucket.ids.push(r.id);
      else byType.set(k, { label, ids: [r.id] });
    }
  }
  const out: AnalysisFigure[] = [];
  for (const [k, v] of byType) out.push(figure(k, v.label, v.ids.length, 'ud', CENSUS_BASIS, v.ids));
  return out.sort((a, b) => (a.key === 'untyped' ? 1 : b.key === 'untyped' ? -1 : b.value - a.value));
}

function takeoffByUnit(t: TakeoffResult, unit: QuantityUnit): AnalysisFigure[] {
  return t.lines
    .filter((l) => l.unit === unit)
    .map((l) =>
      figure(l.code, l.description, l.quantity, l.unit, l.basis, l.elementIds, l.qualifiers),
    )
    .sort((a, b) => b.value - a.value);
}

function takeoffByChapter(t: TakeoffResult, unit: QuantityUnit): AnalysisFigure[] {
  const byChapter = new Map<string, { value: number; ids: string[]; qual: Set<string> }>();
  for (const l of t.lines) {
    if (l.unit !== unit) continue; // ⛔ never sum m² into m³ — SPEC §4.2 W8
    const b = byChapter.get(l.chapter) ?? { value: 0, ids: [], qual: new Set<string>() };
    b.value += l.quantity;
    b.ids.push(...l.elementIds);
    for (const q of l.qualifiers) b.qual.add(q);
    byChapter.set(l.chapter, b);
  }
  const out: AnalysisFigure[] = [];
  for (const [chapter, b] of byChapter) {
    const def = TAKEOFF_CHAPTERS.find((c) => c.id === chapter);
    out.push(
      figure(
        chapter,
        def ? `${def.label} · ${def.labelEs}` : chapter,
        b.value,
        unit,
        `Σ of every ${UNIT_LABEL[unit]} take-off line in this chapter. Each line states its own measurement rule.`,
        [...new Set(b.ids)],
        [...b.qual],
      ),
    );
  }
  return out.sort((a, b) => b.value - a.value);
}

/**
 * Room centreline area per storey. §ANALYSIS-AREA-STANDARDS (L-3640).
 *
 * ⛔ THE BASIS STRING IS THE POINT OF THIS FUNCTION. H1 — "Σ (length × height)
 * − Σ opening voids" is a basis; "floor area" is not. Here the basis has to
 * carry the MEASUREMENT PLANE, because that is the single fact that decides
 * whether the number is GFA, NIA, NGF or none of them. It is none of them.
 *
 * ⛔ The face correction is a BRACKET, never a point value. Per room the true
 * correction from centreline to internal face is Σ over edges of
 * (edge length × that edge's wall thickness ÷ 2). `Room.perimeter` is cached but
 * per-edge attribution is not, so the honest statement is the interval
 * [P·t_min/2, P·t_max/2] over the room's bounding walls — every per-edge
 * assignment lies inside it. Reporting the midpoint would be a guess with the
 * shape of a measurement, which is the one thing this surface refuses.
 *
 * ⚠ The bracket ignores corner effects of order t². Stated on the card.
 */
function areaByLevel(a: RoomAreaSnapshot): AnalysisFigure[] {
  const byLevel = new Map<string, { area: number; ids: string[]; lo: number; hi: number; unbracketed: number }>();
  for (const r of a.rooms) {
    // An element with no levelId becomes a NAMED group, never a dropped one —
    // the same rule the element census follows (SPEC §4.1 W3).
    const k = r.levelId ?? 'unassigned';
    const b = byLevel.get(k) ?? { area: 0, ids: [], lo: 0, hi: 0, unbracketed: 0 };
    b.area += r.area;
    b.ids.push(r.id);
    if (r.minWallThickness !== null && r.maxWallThickness !== null) {
      b.lo += (r.perimeter * r.minWallThickness) / 2;
      b.hi += (r.perimeter * r.maxWallThickness) / 2;
    } else {
      b.unbracketed++;
    }
    byLevel.set(k, b);
  }

  const out: AnalysisFigure[] = [];
  for (const [k, b] of byLevel) {
    const label = k === 'unassigned' ? 'No storey assigned' : (a.levelNames.get(k) ?? k);
    const qualifiers: string[] = [
      'Measured on the WALL CENTRELINE, which is not the plane any published area standard uses — ' +
        'it OVERSTATES every net class (SIA NGF, IPMS 3, RICS NIA) and UNDERSTATES every gross one.',
    ];
    if (b.hi > 0) {
      qualifiers.push(
        `Centreline → internal-face correction for this storey lies between −${b.lo.toFixed(2)} m² and ` +
          `−${b.hi.toFixed(2)} m² (bracketed from the thinnest and thickest bounding wall; corner effects ` +
          'of order t² ignored). It is a BOUND, not an estimate.',
      );
    }
    if (b.unbracketed > 0) {
      qualifiers.push(
        `${b.unbracketed} room(s) on this storey resolved no bounding wall thickness, so they contribute ` +
          'NOTHING to that bracket — the interval above is narrower than the true one by an unknown amount.',
      );
    }
    out.push(
      figure(
        k,
        label,
        b.area,
        'm2',
        'Σ of the cached polygon area of every room on this storey, where that polygon is a face of the ' +
          'wall-CENTRELINE ' +
          'half-edge graph (`geometry-kernel/src/producers/room.ts:64`). Exact for that definition.',
        b.ids,
        qualifiers,
      ),
    );
  }
  return out.sort((x, y) => (x.key === 'unassigned' ? 1 : y.key === 'unassigned' ? -1 : y.value - x.value));
}

function selectionBreakdown(c: CensusSnapshot, selectedIds: readonly string[]): AnalysisFigure[] {
  if (selectedIds.length === 0) return [];
  const wanted = new Set(selectedIds);
  const out: AnalysisFigure[] = [];
  let matched = 0;
  for (const g of c.groups) {
    const hit = g.records.filter((r) => wanted.has(r.id));
    if (hit.length === 0) continue;
    matched += hit.length;
    out.push(figure(g.key, g.label, hit.length, 'ud', CENSUS_BASIS, hit.map((r) => r.id)));
  }
  // ⛔ Selected ids the census could not place are REPORTED, not dropped. They
  // are the visible edge of the census's own coverage: an id selected in the
  // viewport that no declared store claims is a real fact about this table.
  const unplaced = selectedIds.length - matched;
  if (unplaced > 0) {
    out.push(
      figure(
        'unmeasured',
        'Selected, not in any censused store',
        unplaced,
        'ud',
        'Selected element ids that no store in the declared census table returned. NOT an element type — a gap in this table.',
        selectedIds.filter((id) => !c.groups.some((g) => g.records.some((r) => r.id === id))),
      ),
    );
  }
  return out.sort((a, b) => (a.key === 'unmeasured' ? 1 : b.key === 'unmeasured' ? -1 : b.value - a.value));
}

/**
 * Execute a query descriptor. THE only way a widget obtains numbers.
 *
 * Results are memoised on `query.id`, so two widgets declaring the same query
 * share one computation — ADR-0343 §D.3.
 *
 * ⛔ An axis the read model does not project THROWS. Returning an empty result
 * would render as "nothing here", which is the invented-aggregate failure H3
 * exists to prevent; a throw is caught by the surface and rendered as a stated
 * error naming the axis.
 */
export function runQuery(query: AnalysisQuery, selectedIds: readonly string[] = []): AnalysisResult {
  // Selection queries are NOT memoised on id alone — the selection is part of
  // the input, and caching on the descriptor would freeze the first selection.
  const cacheable = query.source !== 'selection';
  if (cacheable) {
    const hit = _queryCache.get(query.id);
    if (hit) return hit;
  }

  return withHandlerSpan(
    'pryzm.analysis.readmodel.query',
    {
      'pryzm.surface': 'analysis',
      'pryzm.analysis.query': query.id,
      'pryzm.analysis.source': query.source,
      'pryzm.analysis.groupby': query.groupBy,
      'pryzm.analysis.cost': query.cost,
    },
    () => {
      const t0 = Date.now();
      let figures: AnalysisFigure[];
      let coverage: readonly CoverageRow[];
      let unreachable: readonly string[];
      let over: number;
      let complete: boolean;

      if (query.source === 'graph') {
        // ⭐ The relational source. ADR-0343 §D.4 ruled the UBG IN for relational
        // widgets "but only once it is maintained" — L-3251 satisfied that, and
        // this branch is the first consumer to depend on it.
        //
        // ⛔ NOT memoised alongside the census/take-off caches, and deliberately:
        // those are invalidated by `invalidateAnalysisReadModel()` on a model
        // event, whereas the UBG is maintained on its OWN cadence (a frame-bus
        // drain off the StoreEventBus). Caching it here would let a card show a
        // graph older than the graph, which is the L-2131 defect rebuilt one
        // layer up. `projectGraph()` is a read of an already-materialised
        // in-memory structure; re-reading it is cheap and is the correct answer.
        if (query.groupBy !== 'relationship') {
          throw new Error(
            `[analysis] source "graph" projects only the "relationship" axis, not "${query.groupBy}". ` +
            'The UBG indexes relations, not element attributes — grouping it by level or category ' +
            'would count only the elements that happen to participate in a projected edge, ' +
            'which is an undercount that reads as a count (ADR-0343 §C.3.2, §D.6 H3).',
          );
        }
        const g = projectGraph(censusPlacement());
        const result: AnalysisResult = {
          query,
          figures: g.figures,
          coverage: g.coverage,
          unreachable: g.unreachable,
          computedAt: Date.now(),
          computedOverCount: g.totalNodes,
          complete: g.complete,
          incompleteReason: g.incompleteReason,
          elapsedMs: Date.now() - t0,
        };
        return result;
      }

      if (query.source === 'area') {
        // §ANALYSIS-AREA-STANDARDS (L-3640). The FIGURES are the centreline sums;
        // the COVERAGE is the selected standard's class ledger. They are two
        // different statements deliberately shipped on one result: "here is what
        // this build measures" and "here is what the standard you picked asks
        // for, and which of it this build cannot give you".
        if (query.groupBy !== 'level') {
          throw new Error(
            `[analysis] source "area" projects only the "level" axis, not "${query.groupBy}". ` +
            'Every published area standard is organised per storey, and an area total with no storey ' +
            'axis cannot be checked against one (ADR-0343 §D.6 H3).',
          );
        }
        const a = getRoomAreas();
        figures = areaByLevel(a);
        coverage = areaCoverageRows(areaStandard());
        unreachable = a.unreachable;
        over = a.rooms.length;
        complete = a.complete;
      } else if (query.source === 'takeoff') {
        const t = getTakeoff();
        const unit = query.unit ?? 'm2';
        figures = query.groupBy === 'chapter' ? takeoffByChapter(t, unit) : takeoffByUnit(t, unit);
        coverage = t.coverage;
        unreachable = t.unreadableStores;
        over = t.measuredElementCount;
        // The take-off's own honesty: an unreadable store means the totals are
        // a floor. `computeTakeoff` reports which; this carries it forward.
        complete = t.unreadableStores.length === 0;
      } else {
        const c = getCensus();
        coverage = c.coverage;
        unreachable = c.unreachable;
        complete = c.complete;
        if (query.source === 'selection') {
          figures = selectionBreakdown(c, selectedIds);
          over = selectedIds.length;
        } else {
          switch (query.groupBy) {
            case 'category': figures = censusByCategory(c); break;
            case 'level':    figures = censusByLevel(c);    break;
            case 'type':     figures = censusByType(c);     break;
            default:
              throw new Error(
                `[analysis] the read model does not project the axis "${query.groupBy}" for source "${query.source}". ` +
                'Aggregating over an unindexed axis would be an invented figure (ADR-0343 §D.6 H3).',
              );
          }
          over = c.total;
        }
      }

      const result: AnalysisResult = {
        query,
        figures,
        coverage,
        unreachable,
        computedAt: Date.now(),
        computedOverCount: over,
        complete,
        // §ANALYSIS-INCOMPLETE-REASON (L-3303). For census and take-off the ONE
        // cause is an unreadable source, so the reason names the stores by name —
        // "the wall store was not published" is checkable; "0 sources" is not.
        incompleteReason: complete
          ? []
          : unreachable.length > 0
            ? [`${unreachable.length} declared source(s) could not be read: ${unreachable.join(', ')}`]
            : ['the source reported an incomplete read but named no unreadable store'],
        elapsedMs: Date.now() - t0,
      };
      if (cacheable) _queryCache.set(query.id, result);
      return result;
    },
  );
}

/**
 * The census as a PLACEMENT INDEX — id → storey — for the relationship scope.
 *
 * §ANALYSIS-GRAPH-LEVEL-FILTER (L-3620). `UbgNode` carries no level (measured:
 * `packages/building-graph/src/types.ts:65-72` is `.strict()` over id/kind/
 * props/refs, and only `roomGraphAdapter` stamps `props.levelId`, only on rooms).
 * The census already knows where every element in the eighteen declared stores
 * lives, so the level filter joins through it rather than through a second,
 * rival idea of what a storey is.
 *
 * ⭐ THE RETURN VALUE HAS THREE STATES AND THAT IS THE POINT. `undefined` means
 * "this table does not claim that id" — a synthetic `rule` node, or an element
 * in a store outside the declared table. It is NOT `null` ("claimed, no level")
 * and it is certainly not "on another storey". The graph counts the three
 * separately and only `undefined` makes a filtered figure a lower bound.
 *
 * Built once per census, from the memoised snapshot — it costs one Map, not a
 * second scan.
 */
let _placement: GraphPlacement | null = null;
let _placementFor: CensusSnapshot | null = null;

export function censusPlacement(): GraphPlacement {
  const c = getCensus();
  if (_placement && _placementFor === c) return _placement;
  const index = new Map<string, string | null>();
  for (const g of c.groups) for (const r of g.records) index.set(r.id, r.levelId);
  _placement = {
    levelOf: (id: string) => index.get(id),
    levelNames: c.levelNames,
  };
  _placementFor = c;
  return _placement;
}

/**
 * Every storey the level authority knows, for the relationship scope picker.
 * ⛔ Read from the SAME snapshot the figures are computed over, so the picker can
 * never offer a level the figures were not computed against.
 */
export function censusLevels(): ReadonlyArray<{ id: string; name: string }> {
  const c = getCensus();
  return [...c.levelNames].map(([id, name]) => ({ id, name }));
}

/**
 * The declared census table, for the surface's own provenance panel. Exposed so
 * the product can SHOW its denominator rather than assert one.
 */
export function censusSourceTable(): ReadonlyArray<{ store: string; family: string; typeField: string | null }> {
  return CENSUS_SOURCES.map((s) => ({ store: s.storeName, family: s.label, typeField: s.typeField }));
}

// ═════════════════════════════════════════════════════════════════════════════
// §FEAT-ANALYSIS-FACET-CROSS-FILTER (L-6602) — RESOLVING A FACET TO ELEMENT IDS
// ═════════════════════════════════════════════════════════════════════════════
//
// Founder: *"if walls for example and level 1 are selected - then wall in level 1
// should be highlighted"*.
//
// ⭐ THE FUNCTION BELOW IS WHY THAT SENTENCE NEEDS FACETS AND NOT A FLAT ID SET.
//
// "Walls ∩ Level 1" spans TWO WIDGETS on two different axes. A flat set of the
// 312 wall ids cannot answer "now also filter to Level 1" — it has forgotten
// that it ever meant *walls*, so the second click can only replace it or union
// with it. A facet remembers the QUESTION (`axis` + `key`), not the answer, and
// two questions intersect. See ADR-0358 §2.
//
// ⭐ AND IT IS WHY THE FACET RE-RESOLVES INSTEAD OF PINNING IDS. A facet stores
// no ids; it asks this function again on every refresh. So a selection made
// before a wall was drawn, a storey was added, or the project was re-read stays
// TRUE rather than decaying into a list of ids that no longer name anything.
// A pinned id set would be a screenshot of a query, and would silently shrink
// as the model moved — the reader would see fewer purple walls with nothing on
// screen saying why. Cost is one pass over the memoised census, not a rescan.
//
// ⛔ `null` MEANS "THIS AXIS IS NOT RE-RESOLVABLE HERE" AND IS NOT AN EMPTY SET.
// The same three-state discipline `GraphPlacement.levelOf` uses. An empty set is
// a real answer ("no elements match this facet"); `null` says the read model
// cannot recompute this axis at all, and the caller must fall back to the ids it
// captured at click time AND SAY SO. Collapsing the two would let a facet the
// model can no longer resolve render as a facet that matches nothing, which is
// the [[context-data-honesty-family]] defect at the smallest possible scale.

/**
 * Every element id belonging to one facet — `(axis, key)` — recomputed NOW.
 *
 * `null` ⇒ this module does not project that axis; the caller must use the ids
 * captured when the reader clicked, and must render that difference.
 */
export function idsForFacet(axis: AnalysisAxis, key: string): ReadonlySet<string> | null {
  return withHandlerSpan(
    'pryzm.analysis.readmodel.facet',
    { 'pryzm.surface': 'analysis', 'pryzm.analysis.facet_axis': axis },
    () => {
      switch (axis) {
        case 'category': {
          const g = getCensus().groups.find((x) => x.key === key);
          // ⛔ A key naming no group is `null`, not `∅`. "The wall family is not
          // in this census" and "there are no walls" are different answers and
          // the whole surface depends on them staying different (§D.6 H2).
          return g ? new Set(g.records.map((r) => r.id)) : null;
        }
        case 'level': {
          const c = getCensus();
          // `unassigned` is a REAL, NAMED group here exactly as it is in
          // `censusByLevel` — an element with no storey is filterable, not lost.
          const out = new Set<string>();
          for (const g of c.groups) {
            for (const r of g.records) {
              if ((r.levelId ?? 'unassigned') === key) out.add(r.id);
            }
          }
          // A storey the level authority does not know is unresolvable, not empty.
          if (out.size === 0 && key !== 'unassigned' && !c.levelNames.has(key)) return null;
          return out;
        }
        case 'type': {
          // Type keys are namespaced `family:typeId` by `censusByType`, because a
          // wall type and a door type may share a raw id string. Re-derive the
          // SAME key here rather than parsing it apart — a split on ':' would
          // break the first time a type id contains one.
          const c = getCensus();
          const out = new Set<string>();
          for (const g of c.groups) {
            for (const r of g.records) {
              if ((r.typeId ? `${g.key}:${r.typeId}` : 'untyped') === key) out.add(r.id);
            }
          }
          return out.size > 0 ? out : null;
        }
        case 'chapter': {
          // ⚠ Reads the MEMOISED take-off. This axis is only ever asked for after
          // a take-off widget rendered — which is what ran `computeTakeoff()` in
          // the first place — so resolving a chapter facet costs a scan of
          // `t.lines`, never a fresh O(n·m) take-off.
          const t = getTakeoff();
          const out = new Set<string>();
          let matched = false;
          for (const l of t.lines) {
            if (l.chapter !== key) continue;
            matched = true;
            for (const id of l.elementIds) out.add(id);
          }
          return matched ? out : null;
        }
        case 'unit': {
          // ⛔ NOT the unit. `takeoffByUnit` emits `figure(l.code, …)`, so a figure
          // on the `unit` axis is keyed by take-off LINE CODE — the axis names how
          // the card was grouped, not what the key is. Resolving by `l.unit` here
          // would select every line sharing m², which is a different and much
          // larger set than the one the reader clicked.
          const t = getTakeoff();
          const line = t.lines.find((l) => l.code === key);
          return line ? new Set(line.elementIds) : null;
        }
        case 'relationship':
          // ⭐ REFUSED, and the refusal is the honest answer. A relationship figure
          // counts EDGES, not elements, and its `elementIds` are the nodes incident
          // to that family — including SYNTHETIC nodes (`rule`, `circulation`) that
          // name no element in any store. Re-resolving it here would need the UBG,
          // which is maintained on its own cadence and is not this module's to
          // read (ADR-0343 §D.4). The caller falls back to the captured ids and
          // labels the chip, so the reader knows this one facet is a snapshot.
          return null;
        default:
          return null;
      }
    },
  );
}

// ── §C13-CANDIDATE-OWNERS (L-8110) — project-switch owner ────────────────────
//
// Every field this module memoises (`_census`, `_takeoff`, `_areas`, `_placement`,
// `_placementFor`, `_queryCache`) is derived from the OPEN project's element stores,
// and each is served from cache until something invalidates it. Carried across a
// switch, the Analysis surface reports project A's element counts, takeoff quantities
// and room areas under project B's name — a wrong number presented as a measurement,
// which is the §CONTEXT-DATA-HONESTY failure in its most expensive form.
//
// `invalidateAnalysisReadModel()` already exists and its own doc says "Called on
// commit and on project load"; this registration is what makes the second half of
// that sentence true on every project-entry path rather than only where a caller
// happened to remember.
projectScopeRegistry.register({
    scopeName: 'analysis.readModel',
    clear: () => invalidateAnalysisReadModel(),
});
