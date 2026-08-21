/**
 * buildingGraphMaintainer.ts — the Unified Building Graph, incrementally
 * maintained off the StoreEventBus. STR-14 §3's own promise, built.
 *
 * Layer Affected:  apps/editor engine wiring (L7)
 * File:            apps/editor/src/engine/buildingGraphMaintainer.ts
 * STR:             STR-14 §3 (the UBG is "Incrementally maintained off the StoreEventBus")
 * ADR:             ADR-0058 §4 (adapters project, idempotent) · ADR-0343 §D.7 (the
 *                  BINDING PRECONDITION for hosting the graphs on Analysis)
 * Contracts:       C01 §3.8 (subscribe the bus, never poll the stores) · C66 §1.1
 * Issue log:       L-3251 · closes the wiring half of L-2131 · needs L-3250
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * ⭐ WHAT WAS ACTUALLY WRONG, IN TWO LAYERS
 * ═════════════════════════════════════════════════════════════════════════════
 * Lane ANLZ1 measured layer one: `window.__pryzmBuildingGraph` is written in ONE
 * place — `buildBuildingGraph.ts`'s `window.pryzmBuildBuildingGraph()`, a FULL
 * rebuild — and `installLiveGraphWiring.ts` makes four install calls and
 * subscribes to nothing. So any graph the founder reads is a snapshot from
 * whenever an overlay last rebuilt it. STR-14 §3 was corrected in place to say so.
 *
 * Layer two, measured by this lane and fixed in L-3250: `BuildingGraph` had no
 * retraction primitive at all. addNode / addEdge / clear / fromJSON — all
 * ADDITIVE or TOTAL. **The delete leg of a delta was unrepresentable**, so
 * subscribing alone would not have helped: the only reachable behaviours were
 * "full rebuild per event" (a rebuild on a trigger, not maintenance) or "never
 * retract" (a graph that overstates the model forever).
 *
 * With `retractIncident` in place, this file is the subscriber.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * THE ALGORITHM — RETRACT, THEN RE-PROJECT, OVER A NEIGHBOURHOOD
 * ═════════════════════════════════════════════════════════════════════════════
 * `project()` is idempotent-ADDITIVE. Re-running an adapter re-adds facts that
 * still hold; it can never notice one that STOPPED holding. So every leg here is
 * retract-then-project, keyed on the `evidence` prefix that adapter stamps.
 *
 * ⭐ The topology leg expands the dirty set to its GRAPH NEIGHBOURS first, and
 * that is not an optimisation — it is a correctness requirement. Topology
 * adjacency is symmetric and `extractTopologySnapshot` de-dups the symmetric
 * pair, so the edge `a→b` may have been emitted while scanning `a`. Retracting
 * every topology edge incident to `b` and re-projecting only `b` would yield
 * `b→a` — and then the next time `a` went dirty the graph would hold BOTH
 * directions, drifting upward on every edit. Expanding to the neighbourhood
 * makes the delta the full-rebuild algorithm restricted to a subgraph, which
 * converges to the same answer. Cost is O(|Δ|·deg), still bounded by the edit.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * ⛔ WHAT IS O(Δ) AND WHAT IS NOT — SAY IT, DO NOT ROUND IT UP
 * ═════════════════════════════════════════════════════════════════════════════
 * ADR-0343 §D.4's budget is "O(Δ), never O(n)". Honestly, per leg:
 *
 *  | leg        | reads                                  | this delta        |
 *  |------------|----------------------------------------|-------------------|
 *  | topology   | getAdjacencyRelationships(id), PER ID  | ⭐ EXACT O(|Δ|·deg) |
 *  | roomGraph  | getGraph(levelId), per LEVEL           | level-scoped       |
 *  | semantic   | getAll() — one flat array              | O(R) scan, O(Δ) write |
 *  | dependency | the SAME getAll()                      | O(R) scan, O(Δ) write |
 *  | constraint | the last validation report             | O(V) scan, O(Δ) write |
 *
 * The leg that MATTERS is topology, and it is exact. A full rebuild walks the
 * THREE scene for every element id and issues N topology queries; this issues
 * |Δ|·deg. The three scan legs iterate an already-materialised in-memory array
 * and write only the rows touching a dirty id — O(N) in a pointer walk, O(Δ) in
 * graph mutations and in every geometric or spatial query. That is a real and
 * large difference, and it is not the same claim as "O(Δ) everywhere", so this
 * file does not make that claim and `UbgDeltaReport.legs` reports it per drain.
 *
 * ⚠ The constraint leg's FRESHNESS is bounded by the ConstraintEngine's own
 * 800 ms debounce (`initDataPlatform.ts:304`), not by ours. A `violates` edge is
 * correct as of the last validation run. The liveness record says so rather than
 * implying the delta re-validated anything.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * P-PRINCIPLES
 * ═════════════════════════════════════════════════════════════════════════════
 * P3 — no `requestAnimationFrame`. Coalescing uses
 * `getFrameScheduler().scheduleOnce(...)`, the sanctioned frame-bus path and the
 * same shape `ElementSpatialIndex.scheduleUpsert` already uses.
 * P2 — no THREE. P4 — no `(window as any)`; typed structural interfaces only.
 * P6 — read-only: this never writes an element store.
 * P8 — every exported function carries a span.
 *
 * ⛔ THE BUS IS NOT A LOSSLESS LOG. `storeEventBus.suppressDuring()` and
 * `discardBatch()` are DECLARED exceptions to the §9 "no event drops" guarantee
 * and both fire on project switch/clear. A subscriber that trusted the bus
 * across a project switch would carry the outgoing project's nodes into the
 * incoming one. Hence `pryzm-project-loaded` forces a FULL rebuild — the
 * incremental path is an optimisation over a correct baseline, never a
 * replacement for one.
 */

import { storeEventBus, type StoreChangeEvent } from '@pryzm/core-app-model';
import { getFrameScheduler } from '@pryzm/frame-scheduler';
import { withHandlerSpan } from '@pryzm/plugin-sdk';
import {
  BuildingGraph,
  createTopologyAdapter,
  createRoomGraphAdapter,
  createSemanticAdapter,
  createDependencyAdapter,
  createConstraintAdapter,
} from '@pryzm/building-graph';

import {
  buildBuildingGraph,
  extractTopologySnapshot,
  extractRoomGraphSnapshot,
  extractSemanticSnapshot,
  extractDependencySnapshot,
  extractConstraintSnapshot,
  resolveBuildingGraphServices,
  resolveLevelIds,
  type BuildBuildingGraphServices,
} from './buildBuildingGraph';
import { onRuntimeEvent } from './runtimeEventBridge';

// ── The liveness record — the graph's own answer to "are you live?" ───────────

/** How the graph last reached its current contents. */
export type UbgFreshness =
  /** Never built. Reading it would be reading nothing. */
  | 'absent'
  /** Built by a full projection (boot, project load, explicit rebuild). */
  | 'rebuilt'
  /** Maintained by at least one applied StoreEventBus delta since the rebuild. */
  | 'maintained'
  /**
   * ⛔ A delta was DROPPED because no graph existed to apply it to. The graph is
   * behind the model by an unknown amount and MUST say so — this is the state
   * the old code was permanently in without a name for it.
   */
  | 'stale';

/** What one drain actually did. Reported, never used to decide anything. */
export interface UbgDeltaReport {
  readonly at: number;
  /** Distinct element ids in the delta — the |Δ| every cost claim is against. */
  readonly elements: number;
  /** Of those, deletions (a `removeNode`, not a re-projection). */
  readonly deletes: number;
  /** Ids pulled in as topology neighbours of a dirty id (the correctness step). */
  readonly neighbours: number;
  readonly edgesRetracted: number;
  readonly edgeCountAfter: number;
  readonly nodeCountAfter: number;
  /** Per-leg honesty. See the table in this file's header. */
  readonly legs: Readonly<Record<string, 'exact' | 'level-scoped' | 'scan' | 'skipped'>>;
  readonly elapsedMs: number;
}

export interface UbgLiveness {
  readonly freshness: UbgFreshness;
  /** ms epoch of the last FULL rebuild, or 0. */
  readonly lastRebuiltAt: number;
  /** ms epoch of the last applied delta, or 0. */
  readonly lastDeltaAt: number;
  /** Deltas applied since install. */
  readonly deltasApplied: number;
  /** Store events observed since install (≥ deltasApplied; they coalesce). */
  readonly eventsObserved: number;
  /** Full rebuilds since install. */
  readonly rebuilds: number;
  /** The most recent drain's report, or null. */
  readonly lastDelta: UbgDeltaReport | null;
  /**
   * ⚠ The `violates` leg is only as fresh as the ConstraintEngine's own 800 ms
   * debounce. Carried explicitly so a UI cannot imply the delta re-validated.
   */
  readonly constraintLegIsEngineFresh: boolean;
}

/** Runtime event emitted after a delta is applied. Payload: {@link UbgDeltaReport}. */
export const UBG_DELTA_EVENT = 'pryzm:building-graph-delta' as const;

// ── Which element types can move which leg ───────────────────────────────────

/**
 * Element types whose change can alter ROOM CONNECTIVITY, and so require the
 * level-scoped roomGraph leg. `elementType` on the bus is a free `string` and is
 * INCONSISTENTLY CASED across ~80 emitters (`'wall'` 192 sites vs `'Wall'` 3),
 * so everything here is compared lower-cased. A type not in this set still gets
 * the topology + semantic legs; it just does not re-read a level's room graph.
 */
const CONNECTIVITY_TYPES: ReadonlySet<string> = new Set([
  'wall', 'door', 'window', 'room', 'space', 'opening', 'curtainwall', 'curtain-panel', 'stair',
]);

/**
 * Types that are project/view METADATA, not model elements. They churn on the
 * bus (view definitions re-emit on every LOD change) and have no UBG projection,
 * so admitting them would spend a drain to change nothing.
 */
const IGNORED_TYPES: ReadonlySet<string> = new Set([
  'view-definition', 'sheet-definition', 'project', '_batch', 'assetcatalogentry',
]);

// ── Module state ─────────────────────────────────────────────────────────────

type DirtyOp = 'upsert' | 'delete';

let _dirty: Map<string, DirtyOp> = new Map();
let _connectivityDirty = false;
let _drainArmed: (() => void) | null = null;
let _installed = false;

let _liveness: UbgLiveness = {
  freshness: 'absent',
  lastRebuiltAt: 0,
  lastDeltaAt: 0,
  deltasApplied: 0,
  eventsObserved: 0,
  rebuilds: 0,
  lastDelta: null,
  constraintLegIsEngineFresh: true,
};

interface MaintainerWindow {
  __pryzmBuildingGraph?: BuildingGraph;
  __pryzmUbgLiveness?: UbgLiveness;
  runtime?: { events?: { emit(event: string, payload: unknown): void } };
}

function mw(): MaintainerWindow | undefined {
  return typeof window === 'undefined'
    ? undefined
    : (window as unknown as MaintainerWindow);
}

function publishLiveness(next: UbgLiveness): void {
  _liveness = next;
  const w = mw();
  if (w) w.__pryzmUbgLiveness = next;
}

/**
 * The graph's current liveness. ⭐ A consumer that renders the UBG MUST render
 * this too: before this file existed the honest label was permanently "stale by
 * construction", and a surface that shows a graph without showing its freshness
 * is making a claim the substrate does not support.
 *
 * P8: `pryzm.ubg.liveness`.
 */
export function getUbgLiveness(): UbgLiveness {
  return withHandlerSpan('pryzm.ubg.liveness', { 'pryzm.surface': 'building-graph' }, () => _liveness);
}

// ── The delta ────────────────────────────────────────────────────────────────

/**
 * Apply one coalesced batch of dirty element ids to an existing graph.
 *
 * Retract-then-project per leg, keyed on each adapter's `evidence` prefix so the
 * legs stay independent: re-deriving an element's topology must not disturb its
 * semantic or constraint edges, because this call did not re-read those sources
 * for it.
 *
 * Exported for the differential test (ADR-0343's "Negative / deferred": *"a new
 * read model is a new index to keep correct… it needs a differential test
 * against a full scan from day one"*).
 *
 * P8: `pryzm.ubg.delta`.
 */
export function applyUbgDelta(
  graph: BuildingGraph,
  dirty: ReadonlyMap<string, DirtyOp>,
  connectivityDirty: boolean,
  services: BuildBuildingGraphServices,
): UbgDeltaReport {
  return withHandlerSpan(
    'pryzm.ubg.delta',
    { 'pryzm.surface': 'building-graph', 'ubg.delta.size': dirty.size },
    () => {
      const t0 = now();
      let retracted = 0;
      let deletes = 0;
      const legs: Record<string, 'exact' | 'level-scoped' | 'scan' | 'skipped'> = {
        topology: 'skipped',
        roomGraph: 'skipped',
        semantic: 'skipped',
        dependency: 'skipped',
        constraint: 'skipped',
      };

      // ── 0. Deletions first. A deleted element takes its node and EVERY
      //      incident edge with it, whatever adapter produced them — the element
      //      is gone, so no projection of it can still hold.
      //
      //      ⭐ Every endpoint of an edge we withdraw becomes an ORPHAN
      //      CANDIDATE. See `sweepOrphans` — a node that existed ONLY because an
      //      edge referenced it must not outlive that edge, or the delta reports
      //      elements a full rebuild would not.
      const orphanCandidates = new Set<string>();
      const upserts: string[] = [];
      for (const [id, op] of dirty) {
        if (op === 'delete') {
          for (const e of graph.outEdges(id)) orphanCandidates.add(e.to);
          for (const e of graph.inEdges(id)) orphanCandidates.add(e.from);
          const n = graph.removeNode(id);
          if (n > 0) retracted += n;
          deletes++;
        } else {
          upserts.push(id);
        }
      }

      // ── 1. Topology — the exact leg, over the dirty NEIGHBOURHOOD.
      //      See this file's header: retracting a symmetric edge and re-projecting
      //      only one endpoint flips its direction and drifts the edge count up on
      //      every subsequent edit. The neighbourhood makes the delta the full
      //      algorithm restricted to a subgraph.
      const touched = new Set<string>(upserts);
      if (services.topology && upserts.length > 0) {
        for (const id of upserts) {
          for (const e of graph.outEdges(id)) if (isTopology(e.evidence)) touched.add(e.to);
          for (const e of graph.inEdges(id)) if (isTopology(e.evidence)) touched.add(e.from);
        }
        for (const id of touched) {
          orphanCandidates.add(id);
          for (const e of graph.outEdges(id)) if (isTopology(e.evidence)) orphanCandidates.add(e.to);
          for (const e of graph.inEdges(id)) if (isTopology(e.evidence)) orphanCandidates.add(e.from);
          retracted += graph.retractIncident(id, 'topology');
        }
        guarded(() => {
          const snap = extractTopologySnapshot(
            services.topology!,
            [...touched],
            services.kindOf,
          );
          if (snap.relationships.length > 0) createTopologyAdapter(snap).project(graph);
        });
        legs.topology = 'exact';
      }

      // ── 1b. Sweep the orphans the retraction created. MUST run after the
      //       topology re-projection (which re-materialises everything that is
      //       still related) and BEFORE the remaining legs (which re-add the
      //       nodes they own).
      sweepOrphans(graph, orphanCandidates);

      // ── 2. roomGraph — level-scoped. The bus carries no levelId
      //      (`StoreChangeEvent` is { elementId, elementType, operation,
      //      timestamp }), so a dirty element cannot name its storey. We re-read
      //      the levels rather than guess, and only when a CONNECTIVITY type moved.
      if (connectivityDirty && services.roomGraph) {
        const levelIds = services.levelIds ?? resolveLevelIds(undefined);
        for (const levelId of levelIds) {
          guarded(() => {
            const snap = extractRoomGraphSnapshot(services.roomGraph!.getGraph(levelId));
            // Retract this level's roomGraph edges before re-projecting, so a
            // door that was removed stops connecting two rooms. Scope = the rooms
            // the level reports NOW plus any node already tagged with this level
            // (a room deleted from the level would otherwise keep its edges).
            for (const n of snap.nodes) retracted += graph.retractIncident(n.roomId, 'roomGraph');
            for (const n of graph.query({ kind: 'room' }).nodes) {
              if (n.props?.levelId === levelId) {
                retracted += graph.retractIncident(n.id, 'roomGraph');
              }
            }
            if (snap.nodes.length > 0 || snap.edges.length > 0) {
              createRoomGraphAdapter(snap).project(graph);
            }
          });
        }
        legs.roomGraph = 'level-scoped';
      }

      // ── 3/4. semantic + dependency — one O(R) walk of an in-memory array,
      //        writing only the rows that touch a dirty id.
      if (services.semantic && upserts.length > 0) {
        const dirtySet = new Set(upserts);
        guarded(() => {
          for (const id of upserts) retracted += graph.retractIncident(id, 'semantic');
          const all = extractSemanticSnapshot(services.semantic!);
          const rows = all.relationships.filter(
            (r) => dirtySet.has(r.sourceId) || dirtySet.has(r.targetId),
          );
          if (rows.length > 0) createSemanticAdapter({ relationships: rows }).project(graph);
        });
        legs.semantic = 'scan';

        if (services.dependencyFrom) {
          guarded(() => {
            for (const id of upserts) retracted += graph.retractIncident(id, 'dependency');
            const all = extractDependencySnapshot(services.dependencyFrom!);
            const rows = all.edges.filter(
              (e) => dirtySet.has(e.dependentId) || dirtySet.has(e.dependsOnId),
            );
            if (rows.length > 0) createDependencyAdapter({ edges: rows }).project(graph);
          });
          legs.dependency = 'scan';
        }
      }

      // ── 5. constraint — correct AS OF THE LAST VALIDATION RUN, which this
      //      delta does not trigger. Freshness is the engine's 800 ms debounce.
      if (services.constraint && upserts.length > 0) {
        const dirtySet = new Set(upserts);
        guarded(() => {
          for (const id of upserts) retracted += graph.retractIncident(id, 'constraint');
          const all = extractConstraintSnapshot(services.constraint!);
          const rows = all.violations.filter((v) => dirtySet.has(v.elementId));
          if (rows.length > 0) createConstraintAdapter({ violations: rows }).project(graph);
        });
        legs.constraint = 'scan';
      }

      return {
        at: Date.now(),
        elements: dirty.size,
        deletes,
        neighbours: Math.max(0, touched.size - upserts.length),
        edgesRetracted: retracted,
        edgeCountAfter: graph.edgeCount,
        nodeCountAfter: graph.nodeCount,
        legs,
        elapsedMs: now() - t0,
      };
    },
  );
}

function isTopology(evidence: string | undefined): boolean {
  return evidence?.startsWith('topology') === true;
}

/**
 * Drop nodes that exist ONLY because a now-withdrawn edge referenced them.
 *
 * ⭐ WHY THIS IS NOT OPTIONAL. The topology adapter materialises both endpoints
 * of every relationship (`addNode(source); addNode(target); addEdge(...)`). A
 * full rebuild therefore NEVER holds a node with no relationships — an element
 * with no adjacency is simply never mentioned. A delta that retracts the last
 * edge touching `room_1` and stops there leaves `room_1` standing, and the
 * maintained graph then reports a node the authority does not have. Counted on a
 * dashboard, that is an OVERSTATEMENT — the exact failure mode L-3250's ARM D
 * covers for edges, one level up.
 *
 * `ubgDeltaConvergence.test.ts` ARM 3 and ARM 5 both failed on precisely this
 * before the sweep existed. It was not predicted; the differential test found it.
 *
 * ⛔ THE PREDICATE IS DELIBERATELY NARROW: a candidate is dropped only if it is
 * isolated AND carries neither `props` nor `refs`. Those two fields are the mark
 * of a node some OTHER projection owns — `roomGraph` stamps `props.levelId` on
 * every room and `refs` on every door node; the A.21.D16 enrichment pass stamps
 * name/occupancy/area/façade. Those legs did not run in this delta, so their
 * nodes are not this delta's to withdraw. A bare `{ id, kind }` node, by
 * contrast, can only have come from an edge projection, and that edge is gone.
 */
function sweepOrphans(graph: BuildingGraph, candidates: ReadonlySet<string>): void {
  for (const id of candidates) {
    const node = graph.getNode(id);
    if (node === undefined) continue;
    if (node.props !== undefined || node.refs !== undefined) continue;
    if (graph.outEdges(id).length > 0 || graph.inEdges(id).length > 0) continue;
    graph.removeNode(id);
  }
}

function guarded(fn: () => void): void {
  try {
    fn();
  } catch (err) {
    // One mis-shaped source must not abort the whole delta — same rule the full
    // projection already applies (`buildBuildingGraph.runGuarded`).
    console.warn('[ubg-maintainer] leg skipped:', (err as Error)?.message ?? err);
  }
}

function now(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

// ── Install ──────────────────────────────────────────────────────────────────

/**
 * Subscribe the UBG to the StoreEventBus and keep it maintained.
 *
 * Idempotent — a second call returns the existing disposer's twin and does not
 * double-subscribe (both graph overlays and the Analysis surface may want this
 * and none of them should have to know who else asked).
 *
 * P8: `pryzm.ubg.maintainer.install`.
 *
 * @returns a disposer that unsubscribes and disarms any pending drain.
 */
export function installBuildingGraphMaintainer(): () => void {
  return withHandlerSpan(
    'pryzm.ubg.maintainer.install',
    { 'pryzm.surface': 'building-graph' },
    () => {
      if (_installed) return () => {};
      _installed = true;

      const unsubBus = storeEventBus.subscribe(onStoreEvent);

      // ⛔ The bus drops events during project clear/switch (suppressDuring /
      // discardBatch — both DECLARED exceptions to the §9 no-drops guarantee).
      // A full rebuild on project load is therefore not belt-and-braces, it is
      // the only correct baseline the incremental path can optimise over.
      const unsubLoad = onRuntimeEvent('pryzm-project-loaded', () => {
        rebuildUbgNow('project-loaded');
      });

      console.log('[ubg-maintainer] subscribed to StoreEventBus — STR-14 §3, L-3251');
      publishLiveness({ ..._liveness });

      return () => {
        unsubBus();
        unsubLoad();
        _drainArmed?.();
        _drainArmed = null;
        _dirty = new Map();
        _connectivityDirty = false;
        _installed = false;
      };
    },
  );
}

function onStoreEvent(event: StoreChangeEvent): void {
  const type = (event.elementType ?? '').toLowerCase();
  if (IGNORED_TYPES.has(type)) return;
  if (!event.elementId) return;

  _liveness = { ..._liveness, eventsObserved: _liveness.eventsObserved + 1 };

  // A delete beats a same-frame upsert: created-then-deleted inside one batch
  // must not leave a node behind.
  const op: DirtyOp = event.operation === 'delete' ? 'delete' : 'upsert';
  if (op === 'delete' || !_dirty.has(event.elementId)) _dirty.set(event.elementId, op);

  if (CONNECTIVITY_TYPES.has(type)) _connectivityDirty = true;

  arm();
}

/**
 * Coalesce into ONE drain per frame via the frame bus (P3 — the single rAF owner
 * is `packages/frame-scheduler/src/RafAdapter.ts`; nothing here calls it). This
 * is the shape `ElementSpatialIndex.scheduleUpsert` already uses.
 *
 * ⭐ This is also what makes project load survivable: `ProjectLoader` uses the
 * plain `beginBatch()`/`endBatch()` path, so the whole flush arrives as N
 * synchronous emits in ONE task. Accumulating into a Map and draining once
 * afterwards turns N deltas into one.
 */
function arm(): void {
  if (_drainArmed !== null) return;
  _drainArmed = getFrameScheduler().scheduleOnce(
    'ubg-maintain',
    () => {
      _drainArmed = null;
      drain();
    },
    'pre-render',
  );
}

function drain(): void {
  const dirty = _dirty;
  const connectivityDirty = _connectivityDirty;
  _dirty = new Map();
  _connectivityDirty = false;
  if (dirty.size === 0) return;

  const graph = mw()?.__pryzmBuildingGraph;
  if (!graph) {
    // ⛔ Nothing to maintain. Do NOT silently drop this — the graph is now behind
    // the model by an amount nobody counted, and that unnamed state is exactly
    // what "stale by construction" was.
    publishLiveness({ ..._liveness, freshness: 'stale' });
    return;
  }

  const services = resolveBuildingGraphServices();
  const report = applyUbgDelta(graph, dirty, connectivityDirty, services);

  publishLiveness({
    ..._liveness,
    freshness: 'maintained',
    lastDeltaAt: report.at,
    deltasApplied: _liveness.deltasApplied + 1,
    lastDelta: report,
    constraintLegIsEngineFresh: report.legs.constraint !== 'skipped',
  });

  try {
    mw()?.runtime?.events?.emit(UBG_DELTA_EVENT, report);
  } catch {
    /* event bus absent — non-fatal */
  }
}

/**
 * Force a FULL projection into the cached graph and reset freshness to `rebuilt`.
 * Used on project load (where the bus legitimately drops events) and by any
 * consumer that needs a correct baseline rather than a maintained one.
 *
 * P8: `pryzm.ubg.rebuild`.
 */
export function rebuildUbgNow(reason: string): BuildingGraph | null {
  return withHandlerSpan(
    'pryzm.ubg.rebuild',
    { 'pryzm.surface': 'building-graph', 'ubg.rebuild.reason': reason },
    () => {
      const w = mw();
      if (!w) return null;
      const into = w.__pryzmBuildingGraph ?? new BuildingGraph();
      const graph = buildBuildingGraph({ into });
      w.__pryzmBuildingGraph = graph;
      _dirty = new Map();
      _connectivityDirty = false;
      publishLiveness({
        ..._liveness,
        freshness: 'rebuilt',
        lastRebuiltAt: Date.now(),
        rebuilds: _liveness.rebuilds + 1,
      });
      return graph;
    },
  );
}

/** Test-only — drop all subscriptions and reset counters. */
export function _resetUbgMaintainerForTest(): void {
  _drainArmed?.();
  _drainArmed = null;
  _dirty = new Map();
  _connectivityDirty = false;
  _installed = false;
  _liveness = {
    freshness: 'absent',
    lastRebuiltAt: 0,
    lastDeltaAt: 0,
    deltasApplied: 0,
    eventsObserved: 0,
    rebuilds: 0,
    lastDelta: null,
    constraintLegIsEngineFresh: true,
  };
}
