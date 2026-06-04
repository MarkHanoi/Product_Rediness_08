// apps/editor — GRAPH.2-wiring: project the real runtime graphs into the UBG.
//
// This is the CONNECTIVE TISSUE between the pure @pryzm/building-graph package
// (GRAPH.1 core + GRAPH.2 adapters, both P5-/L2-pure) and PRYZM's live
// specialised services. The package deliberately takes only plain injected
// snapshots (packages/building-graph/src/adapters/inputs.ts) so it can never
// import the higher-layer services; this L5 editor module does the reading and
// extraction, then hands the snapshots to the adapters.
//
// READ-ONLY projection (strategy §3 + ADR-0058): we never mutate any source
// graph — we only read each service and emit UBG nodes/edges. A future GRAPH.3
// visualisation consumes the returned BuildingGraph via the
// `window.pryzmBuildBuildingGraph()` hook and the `pryzm:building-graph-rebuilt`
// runtime event.
//
// Every source is GUARDED: a service may be absent (white-UI boot, headless
// test, project not yet loaded). An absent service simply skips its adapter — we
// never throw. Each extractor is also wrapped so a single mis-shaped source
// degrades to "no edges from that adapter" instead of crashing the whole build.
//
// Spec: docs/01-strategy/PRYZM-BUILDING-GRAPH-AND-RELATIONAL-AI-FOUNDATION.md.

import {
  BuildingGraph,
  createTopologyAdapter,
  createRoomGraphAdapter,
  createSemanticAdapter,
  createDependencyAdapter,
  createConstraintAdapter,
  DERIVATION_TYPES,
  type TopologySnapshot,
  type RoomGraphSnapshot,
  type SemanticSnapshot,
  type DependencySnapshot,
  type ConstraintSnapshot,
  type TopologyAdjacencyInput,
  type RoomGraphNodeInput,
  type RoomGraphEdgeInput,
  type SemanticRelationshipInput,
  type DependencyEdgeInput,
  type ConstraintViolationInput,
} from '@pryzm/building-graph';

// ── Structural shapes of the live services (no heavy-package imports) ─────────
// We type each service by the MINIMAL surface this module reads, so the editor
// does not have to depend on room-topology / spatial-index / core-app-model /
// ai-host packages. The live singletons (registered on `window` or imported
// elsewhere) satisfy these structurally.

/** TopologyLayer subset — adjacency edges keyed per element. */
export interface TopologyLayerLike {
  /** Adjacency relationships for one element. */
  getAdjacencyRelationships(elementId: string): ReadonlyArray<TopologyAdjacencyInput>;
}

/** One room node as RoomGraphService materialises it (RoomNode subset). */
interface RoomNodeLike {
  roomId: string;
  connectedRooms?: string[];
  adjacentRooms?: string[];
}

/** One door edge as RoomGraphService materialises it (RoomEdge subset). */
interface RoomEdgeLike {
  fromRoomId: string;
  toRoomId: string;
  doorId?: string;
  doorWidth?: number;
}

/** RoomGraphService graph for one level (Map-or-array tolerant). */
interface RoomGraphLike {
  levelId?: string;
  nodes: Map<string, RoomNodeLike> | ReadonlyArray<RoomNodeLike>;
  edges: Map<string, RoomEdgeLike> | ReadonlyArray<RoomEdgeLike>;
}

/** RoomGraphService subset — one graph per level. */
export interface RoomGraphServiceLike {
  getGraph(levelId: string): RoomGraphLike;
}

/** SemanticGraphManager subset — every relationship. */
export interface SemanticGraphManagerLike {
  getAll(): ReadonlyArray<SemanticRelationshipInput & { metadata?: unknown }>;
}

/** Validation-report subset — the constraint violations to project. */
interface RuleViolationLike {
  ruleId: string;
  elementId: string;
  ruleName?: string;
  /** Real RuleViolation carries `severity: { level, code }`; we flatten `.level`. */
  severity?: string | { level?: string; code?: string };
  message?: string;
}

/** AIService / validation subset — produces a report with violations. */
export interface ConstraintSourceLike {
  validateModel(): { violations?: ReadonlyArray<RuleViolationLike> } | undefined;
}

/**
 * The services `buildBuildingGraph` reads. Each is OPTIONAL — an absent service
 * simply skips that adapter. Injectable so the build is unit-testable with
 * fakes; production callers omit it to use {@link resolveBuildingGraphServices}.
 */
export interface BuildBuildingGraphServices {
  topology?: TopologyLayerLike | null;
  roomGraph?: RoomGraphServiceLike | null;
  semantic?: SemanticGraphManagerLike | null;
  /** DependencyResolver edges are DERIVED from the semantic graph (cascade
   *  pairs); we accept the SemanticGraphManager and derive `dependsOn` pairs. */
  dependencyFrom?: SemanticGraphManagerLike | null;
  constraint?: ConstraintSourceLike | null;
  /**
   * The element ids whose topology adjacency we should read (TopologyLayer is
   * keyed per element, so we need the id set). Also used as the room/level
   * universe. Optional — without it the topology adapter is skipped.
   */
  elementIds?: ReadonlyArray<string> | null;
  /** Level ids whose room graphs to project. Optional — skips roomGraph. */
  levelIds?: ReadonlyArray<string> | null;
  /** Optional id → UBG node-kind resolver for topology nodes (wall/room/…). */
  kindOf?: (id: string) => string | undefined;
}

export interface BuildBuildingGraphOptions {
  /** Injected services (tests). Omit to resolve the live singletons. */
  services?: BuildBuildingGraphServices;
  /** Reuse an existing graph (cleared first) instead of allocating. */
  into?: BuildingGraph;
}

/** The relationship `type`s the dependency projection treats as cascade edges
 *  (`dependent rebuilds when dependsOn changes`). Mirrors the structural /
 *  spatial / hosting relations DependencyResolver cascades on. */
const DEPENDENCY_RELATION_TYPES = new Set<string>([
  'hosts',
  'hostedBy',
  'boundedBy',
  'sitsOn',
  'supports',
  'connectedTo',
  'adjacentTo',
]);

const REBUILT_EVENT = 'pryzm:building-graph-rebuilt' as const;

// ── Extractors: live service → plain inputs.ts snapshot ───────────────────────

/** Aggregate per-element adjacency into one de-duplicated topology snapshot. */
export function extractTopologySnapshot(
  topology: TopologyLayerLike,
  elementIds: ReadonlyArray<string>,
  kindOf?: (id: string) => string | undefined,
): TopologySnapshot {
  const relationships: TopologyAdjacencyInput[] = [];
  const seen = new Set<string>();
  for (const id of elementIds) {
    let rels: ReadonlyArray<TopologyAdjacencyInput> = [];
    try {
      rels = topology.getAdjacencyRelationships(id) ?? [];
    } catch {
      continue;
    }
    for (const rel of rels) {
      if (!rel || !rel.sourceId || !rel.targetId) continue;
      // De-dup the symmetric pair so re-projection is stable (a|b == b|a).
      const a = rel.sourceId;
      const b = rel.targetId;
      const key = a < b ? `${a}|${b}|${rel.kind}` : `${b}|${a}|${rel.kind}`;
      if (seen.has(key)) continue;
      seen.add(key);
      relationships.push({ sourceId: rel.sourceId, targetId: rel.targetId, kind: rel.kind });
    }
  }
  return kindOf ? { relationships, kindOf } : { relationships };
}

function asArray<T>(coll: Map<string, T> | ReadonlyArray<T> | undefined | null): T[] {
  if (!coll) return [];
  if (coll instanceof Map) return [...coll.values()];
  return [...coll];
}

/** Extract one level's RoomGraph into a plain roomGraph snapshot. */
export function extractRoomGraphSnapshot(graph: RoomGraphLike): RoomGraphSnapshot {
  const nodes: RoomGraphNodeInput[] = asArray(graph.nodes)
    .filter((n) => n && n.roomId)
    .map((n) => ({ roomId: n.roomId }));

  const edges: RoomGraphEdgeInput[] = asArray(graph.edges)
    .filter((e) => e && e.fromRoomId && e.toRoomId)
    .map((e) => ({
      fromRoomId: e.fromRoomId,
      toRoomId: e.toRoomId,
      ...(e.doorId !== undefined ? { doorId: e.doorId } : {}),
      ...(typeof e.doorWidth === 'number' ? { doorWidth: e.doorWidth } : {}),
    }));

  return graph.levelId !== undefined ? { levelId: graph.levelId, nodes, edges } : { nodes, edges };
}

/** Extract the semantic derivation relations into a plain semantic snapshot. */
export function extractSemanticSnapshot(mgr: SemanticGraphManagerLike): SemanticSnapshot {
  const all = mgr.getAll() ?? [];
  const relationships: SemanticRelationshipInput[] = [];
  for (const r of all) {
    if (!r || !r.sourceId || !r.targetId || !r.type) continue;
    relationships.push({ sourceId: r.sourceId, targetId: r.targetId, type: r.type });
  }
  return { relationships };
}

/** Derive cascade `dependsOn` pairs from the semantic graph's structural
 *  relations (the same source DependencyResolver computes RebuildTasks from).
 *  The affected/dependent element points at the trigger it depends on. */
export function extractDependencySnapshot(mgr: SemanticGraphManagerLike): DependencySnapshot {
  const all = mgr.getAll() ?? [];
  const edges: DependencyEdgeInput[] = [];
  const seen = new Set<string>();
  for (const r of all) {
    if (!r || !r.sourceId || !r.targetId || !r.type) continue;
    if (!DEPENDENCY_RELATION_TYPES.has(r.type)) continue;
    // Normalise to "dependent → dependsOn" using the relation's documented
    // direction. For the host/structure family the SOURCE owns/affects the
    // TARGET, so the TARGET is the dependent (door dependsOn wall via `hosts`).
    // For boundedBy/adjacentTo/connectedTo the SOURCE (room) is the element
    // revalidated, so the SOURCE is the dependent. We collapse both into a
    // single de-duplicated pair.
    const ownerIsTarget =
      r.type === 'boundedBy' || r.type === 'adjacentTo' || r.type === 'connectedTo';
    const dependentId = ownerIsTarget ? r.sourceId : r.targetId;
    const dependsOnId = ownerIsTarget ? r.targetId : r.sourceId;
    if (dependentId === dependsOnId) continue;
    const key = `${dependentId}|${dependsOnId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    edges.push({ dependentId, dependsOnId });
  }
  return { edges };
}

/** Flatten a validation report's violations into a plain constraint snapshot. */
export function extractConstraintSnapshot(source: ConstraintSourceLike): ConstraintSnapshot {
  const report = source.validateModel();
  const raw = report?.violations ?? [];
  const violations: ConstraintViolationInput[] = [];
  for (const v of raw) {
    if (!v || !v.ruleId || !v.elementId) continue;
    const severity =
      typeof v.severity === 'string'
        ? v.severity
        : (v.severity?.level ?? undefined);
    violations.push({
      ruleId: v.ruleId,
      elementId: v.elementId,
      ...(v.ruleName !== undefined ? { ruleName: v.ruleName } : {}),
      ...(severity !== undefined ? { severity } : {}),
      ...(v.message !== undefined ? { message: v.message } : {}),
    });
  }
  return { violations };
}

// ── The build ─────────────────────────────────────────────────────────────────

/**
 * Project the real runtime graphs into ONE BuildingGraph (the UBG).
 *
 * Reads each available service, extracts the plain `inputs.ts` snapshot, runs
 * that source's adapter, and returns the populated graph. Every source is
 * guarded — an absent or throwing service is skipped, never fatal. READ-ONLY:
 * no source graph is mutated.
 *
 * @returns the populated {@link BuildingGraph}. Empty if no service is present.
 */
export function buildBuildingGraph(opts: BuildBuildingGraphOptions = {}): BuildingGraph {
  const services = opts.services ?? resolveBuildingGraphServices();
  const graph = opts.into ?? new BuildingGraph();
  if (opts.into) graph.clear();

  // 1. topology → bounds / adjacentTo (needs the element-id universe).
  if (services.topology && services.elementIds && services.elementIds.length > 0) {
    runGuarded(() => {
      const snap = extractTopologySnapshot(
        services.topology!,
        services.elementIds!,
        services.kindOf,
      );
      if (snap.relationships.length > 0) createTopologyAdapter(snap).project(graph);
    });
  }

  // 2. roomGraph → connectsTo (per level).
  if (services.roomGraph && services.levelIds && services.levelIds.length > 0) {
    for (const levelId of services.levelIds) {
      runGuarded(() => {
        const rg = services.roomGraph!.getGraph(levelId);
        const snap = extractRoomGraphSnapshot(rg);
        if (snap.nodes.length > 0 || snap.edges.length > 0) {
          createRoomGraphAdapter(snap).project(graph);
        }
      });
    }
  }

  // 3. semantic → derivesFrom.
  if (services.semantic) {
    runGuarded(() => {
      const snap = extractSemanticSnapshot(services.semantic!);
      if (snap.relationships.some((r) => (DERIVATION_TYPES as readonly string[]).includes(r.type))) {
        createSemanticAdapter(snap).project(graph);
      }
    });
  }

  // 4. dependency → dependsOn (derived from the semantic graph).
  if (services.dependencyFrom) {
    runGuarded(() => {
      const snap = extractDependencySnapshot(services.dependencyFrom!);
      if (snap.edges.length > 0) createDependencyAdapter(snap).project(graph);
    });
  }

  // 5. constraint → violates.
  if (services.constraint) {
    runGuarded(() => {
      const snap = extractConstraintSnapshot(services.constraint!);
      if (snap.violations.length > 0) createConstraintAdapter(snap).project(graph);
    });
  }

  return graph;
}

function runGuarded(fn: () => void): void {
  try {
    fn();
  } catch (err) {
    // A single mis-shaped source must not abort the whole projection.
    console.warn('[buildBuildingGraph] adapter projection skipped:', (err as Error)?.message ?? err);
  }
}

// ── Live-singleton resolver (guarded; window-registered services) ─────────────

interface WindowLike {
  __topologyLayer?: unknown;
  roomGraphService?: unknown;
  projectContext?: { activeLevelId?: string | null };
  bimManager?: {
    getActiveLevel?: () => { id?: string } | undefined;
    getAllLevels?: () => ReadonlyArray<{ id?: string }> | undefined;
  };
}

/**
 * Resolve the live PRYZM singletons into a {@link BuildBuildingGraphServices}
 * bag, reading from `window` where each service registers itself. Each lookup is
 * defensive — anything missing is left undefined so its adapter is skipped. The
 * semantic + constraint sources are attached lazily by
 * {@link provideLiveGraphSources} (the editor wires its already-imported
 * singletons in), so this module needs no direct package import of
 * core-app-model / ai-host.
 */
export function resolveBuildingGraphServices(): BuildBuildingGraphServices {
  const w = (typeof window !== 'undefined' ? window : undefined) as unknown as
    | WindowLike
    | undefined;

  const topology = (w?.__topologyLayer as TopologyLayerLike | undefined) ?? null;
  const roomGraph = (w?.roomGraphService as RoomGraphServiceLike | undefined) ?? null;

  // Level universe: every known level (so all room graphs project), falling
  // back to just the active level.
  const levelIds = resolveLevelIds(w);

  // Element-id universe for topology: the scene's element ids if reachable.
  const elementIds = resolveElementIds();

  return {
    topology,
    roomGraph,
    semantic: liveSemantic(),
    dependencyFrom: liveSemantic(),
    constraint: liveConstraint(),
    elementIds,
    levelIds,
  };
}

function resolveLevelIds(w: WindowLike | undefined): string[] {
  const all = w?.bimManager?.getAllLevels?.() ?? [];
  const ids = all.map((l) => l?.id).filter((id): id is string => typeof id === 'string');
  if (ids.length > 0) return ids;
  const active = w?.projectContext?.activeLevelId ?? w?.bimManager?.getActiveLevel?.()?.id;
  return typeof active === 'string' ? [active] : [];
}

interface SceneLike {
  children?: ReadonlyArray<{ userData?: { id?: string; isPreview?: boolean; isHelper?: boolean } }>;
}

function resolveElementIds(): string[] {
  // Best-effort: read element ids off the live THREE scene if exposed. This is
  // intentionally loose — absent ⇒ topology adapter is skipped (guarded by the
  // caller).
  const w = (typeof window !== 'undefined' ? window : undefined) as
    | { pryzmScene?: SceneLike; __pryzmScene?: SceneLike }
    | undefined;
  const scene = w?.pryzmScene ?? w?.__pryzmScene;
  const children = scene?.children ?? [];
  const ids: string[] = [];
  for (const child of children) {
    const id = child?.userData?.id;
    if (!id) continue;
    if (child.userData?.isPreview || child.userData?.isHelper) continue;
    ids.push(id);
  }
  return ids;
}

// The semantic graph manager + AI validation service are real editor singletons
// living in higher-layer packages. We let the editor inject them via
// provideLiveGraphSources so this module imports neither (minimal dep surface +
// testable). Resolved lazily and memoised; absent until provided.
let _semantic: SemanticGraphManagerLike | null | undefined;
let _constraint: ConstraintSourceLike | null | undefined;

function liveSemantic(): SemanticGraphManagerLike | null {
  return _semantic ?? null;
}

function liveConstraint(): ConstraintSourceLike | null {
  return _constraint ?? null;
}

/**
 * Attach the live SemanticGraphManager + constraint source (AIService) to the
 * resolver. Called once (e.g. from boot) with the editor's already-imported
 * singletons so this module needs no direct package import of core-app-model /
 * ai-host. Idempotent — last write wins; pass `null` to detach.
 */
export function provideLiveGraphSources(sources: {
  semantic?: SemanticGraphManagerLike | null;
  constraint?: ConstraintSourceLike | null;
}): void {
  if (sources.semantic !== undefined) _semantic = sources.semantic;
  if (sources.constraint !== undefined) _constraint = sources.constraint;
}

// ── Exposure: window hook + typed rebuilt event ───────────────────────────────

interface RuntimeEventsLike {
  events?: { emit(event: string, payload: unknown): void };
}

/** Payload of the `pryzm:building-graph-rebuilt` runtime event. */
export interface BuildingGraphRebuiltEvent {
  graph: BuildingGraph;
  nodeCount: number;
  edgeCount: number;
}

interface BuildingGraphWindow {
  /** GRAPH.2-wiring — (re)build the UBG from the live graphs and return it. A
   *  future GRAPH.3 overlay consumes this. Read-only projection. */
  pryzmBuildBuildingGraph?: () => BuildingGraph;
  /** The most recently built UBG, cached for synchronous overlay reads. */
  __pryzmBuildingGraph?: BuildingGraph;
  runtime?: RuntimeEventsLike;
}

/**
 * Install the `window.pryzmBuildBuildingGraph()` hook. Each call rebuilds the
 * UBG from the live services, caches it on `window.__pryzmBuildingGraph`, and
 * emits `pryzm:building-graph-rebuilt` on the runtime event bus so a future
 * GRAPH.3 visualisation can react. Safe to call once at boot.
 */
export function installBuildBuildingGraph(): void {
  if (typeof window === 'undefined') return;
  const w = window as unknown as BuildingGraphWindow;
  w.pryzmBuildBuildingGraph = () => {
    const graph = buildBuildingGraph();
    w.__pryzmBuildingGraph = graph;
    const payload: BuildingGraphRebuiltEvent = {
      graph,
      nodeCount: graph.nodeCount,
      edgeCount: graph.edgeCount,
    };
    try {
      w.runtime?.events?.emit(REBUILT_EVENT, payload);
    } catch {
      /* event bus absent — non-fatal */
    }
    return graph;
  };
}

export { REBUILT_EVENT as BUILDING_GRAPH_REBUILT_EVENT };
