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

import { projectGraph } from './graphReadModel';

import type {
  AnalysisFigure,
  AnalysisQuery,
  AnalysisResult,
} from './AnalysisTypes';

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
        const g = projectGraph();
        const result: AnalysisResult = {
          query,
          figures: g.figures,
          coverage: g.coverage,
          unreachable: g.unreachable,
          computedAt: Date.now(),
          computedOverCount: g.totalNodes,
          complete: g.complete,
          elapsedMs: Date.now() - t0,
        };
        return result;
      }

      if (query.source === 'takeoff') {
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
        elapsedMs: Date.now() - t0,
      };
      if (cacheable) _queryCache.set(query.id, result);
      return result;
    },
  );
}

/**
 * The declared census table, for the surface's own provenance panel. Exposed so
 * the product can SHOW its denominator rather than assert one.
 */
export function censusSourceTable(): ReadonlyArray<{ store: string; family: string; typeField: string | null }> {
  return CENSUS_SOURCES.map((s) => ({ store: s.storeName, family: s.label, typeField: s.typeField }));
}
