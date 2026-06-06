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

// ── A.21.D16 enrichment: store shapes for richer node labels + rationale ──────
// These power the "human label · room relationship · why it's here" surface. Each
// is the MINIMAL read surface of the live element stores (window-registered), so
// the editor needs no heavy package import. All OPTIONAL — absent ⇒ that piece of
// enrichment is skipped (never fatal).

/** One room as RoomStore.getById returns it (subset for labels + rationale). */
export interface RoomRecordLike {
  id?: string;
  name?: string;
  /** program tag — `'Bedroom'`, `'Bathroom'`, `'Kitchen'`… (Room.occupancy). */
  occupancy?: string;
  /** Some stores carry the program tag as `occupancyType` (detected-room shape). */
  occupancyType?: string;
  /** Direct floor area (m²) when the store exposes it at the top level. */
  area?: number;
  /** Detected-room shape: metrics live under `computed` (`computed.area`). */
  computed?: { area?: number } | null;
  /** Detected-room shape: the room boundary polygon (world-XZ vertices). */
  boundary?: { polygon?: ReadonlyArray<{ x?: number; z?: number }> } | null;
}

/** RoomStore subset — read a room record by id. */
export interface RoomStoreLike {
  getById(id: string): RoomRecordLike | undefined | null;
}

/** A wall record (subset) — baseLine endpoints in world-XZ, for façade math. */
export interface WallRecordLike {
  id?: string;
  baseLine?: ReadonlyArray<{ x?: number; z?: number }>;
}

/** WallStore subset — read a wall by id (host-wall geometry for window façade). */
export interface WallStoreLike {
  getById(id: string): WallRecordLike | undefined | null;
}

/** A window record (subset) — its host wall + position, for façade + hostedIn. */
export interface WindowRecordLike {
  id?: string;
  wallId?: string;
  width?: number;
  height?: number;
}

/** WindowStore subset — every window, so we can materialise window nodes. */
export interface WindowStoreLike {
  getAll(): ReadonlyArray<WindowRecordLike>;
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

  // ── A.21.D16 enrichment sources (all optional) ────────────────────────────
  /** RoomStore — stamps human name/occupancy/area onto room nodes. */
  roomStore?: RoomStoreLike | null;
  /** WallStore — host-wall geometry for window-façade orientation. */
  wallStore?: WallStoreLike | null;
  /** WindowStore — materialises window nodes (façade + hostedIn edge). */
  windowStore?: WindowStoreLike | null;
  /** Site latitude (decimal degrees) for the equator-facing daylight reason. */
  latDeg?: number | null;
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

// ── A.21.D16 enrichment — human labels + element rationale data ───────────────
//
// These passes run AFTER the adapters and stamp the extra props the building-graph
// rationale helpers read (facade / occupancy / role / latDeg). They are READ-ONLY
// projections from the live stores — no store is mutated.

/** The eight compass façade slugs the building-graph rationale understands. */
type FacadeSlug =
  | 'north' | 'south' | 'east' | 'west'
  | 'northeast' | 'northwest' | 'southeast' | 'southwest';

/**
 * Compass façade for a wall, from its world-XZ baseLine outward normal pointing
 * AWAY from the room centroid. Mirrors the CONCEPT of
 * ai-host/.../windowEmission/solarOrientation.outwardNormal (we do NOT import
 * ai-host across the layer boundary — this is the same maths re-expressed in the
 * editor's world frame). LTP-ENU convention: world +x = East, scene −z = North,
 * so a normal pointing toward −z is NORTH and toward +z is SOUTH.
 *
 * Returns null for a degenerate wall or when the room centroid is unknown.
 */
export function wallFacadeCompass(
  a: { x?: number; z?: number },
  b: { x?: number; z?: number },
  roomCentroid: { x: number; z: number } | null,
): FacadeSlug | null {
  const ax = a?.x, az = a?.z, bx = b?.x, bz = b?.z;
  if (
    typeof ax !== 'number' || typeof az !== 'number' ||
    typeof bx !== 'number' || typeof bz !== 'number'
  ) {
    return null;
  }
  const dx = bx - ax, dz = bz - az;
  const len = Math.hypot(dx, dz);
  if (len < 1e-6) return null;
  // Two unit normals to the segment; pick the one pointing away from the room.
  let nx = -dz / len, nz = dx / len;
  if (roomCentroid) {
    const mx = (ax + bx) / 2, mz = (az + bz) / 2;
    if ((mx - roomCentroid.x) * nx + (mz - roomCentroid.z) * nz < 0) {
      nx = -nx; nz = -nz;
    }
  }
  // Map the (East = +x, North = −z) normal to a compass slug. Bias toward the
  // four cardinals (±67.5° band) before falling back to the diagonals.
  const eastish = nx, northish = -nz;
  const ax2 = Math.abs(eastish), nz2 = Math.abs(northish);
  const diagonal = Math.min(ax2, nz2) / Math.max(ax2, nz2 || 1) > 0.414; // tan(22.5°)
  const ew = eastish >= 0 ? 'east' : 'west';
  const ns = northish >= 0 ? 'north' : 'south';
  if (diagonal) return `${ns}${ew}` as FacadeSlug;
  return (nz2 >= ax2 ? ns : ew) as FacadeSlug;
}

/** Centroid (world-XZ) of a room from its bounding wall baselines. */
function roomCentroidFrom(
  roomId: string,
  graph: BuildingGraph,
  wallStore: WallStoreLike,
): { x: number; z: number } | null {
  // Use the room's bounding walls (`bounds` in-edges) to estimate a centroid.
  let sx = 0, sz = 0, n = 0;
  try {
    for (const e of graph.inEdges(roomId, 'bounds')) {
      const w = wallStore.getById(e.from);
      const bl = w?.baseLine;
      if (!bl || bl.length < 2) continue;
      for (const p of bl) {
        if (typeof p?.x === 'number' && typeof p?.z === 'number') {
          sx += p.x; sz += p.z; n++;
        }
      }
    }
  } catch {
    /* ignore */
  }
  return n > 0 ? { x: sx / n, z: sz / n } : null;
}

/**
 * Stamp human props onto room nodes (name / occupancy / area) and emit room-to-room
 * `adjacentTo` edges from RoomGraphService adjacency. Read-only.
 */
export function enrichRoomNodes(
  graph: BuildingGraph,
  roomStore: RoomStoreLike | null | undefined,
  roomGraph: RoomGraphServiceLike | null | undefined,
  levelIds: ReadonlyArray<string> | null | undefined,
): void {
  if (roomStore) {
    for (const node of graph.allNodes()) {
      if (node.kind !== 'room') continue;
      const rec = safeGet(() => roomStore.getById(node.id));
      if (!rec) continue;
      const extra: Record<string, unknown> = {};
      if (typeof rec.name === 'string' && rec.name.length > 0) extra.name = rec.name;
      // Occupancy tag — `occupancy` (L0 Room) OR `occupancyType` (detected room).
      const occ =
        (typeof rec.occupancy === 'string' && rec.occupancy.length > 0 && rec.occupancy) ||
        (typeof rec.occupancyType === 'string' && rec.occupancyType.length > 0 && rec.occupancyType) ||
        null;
      if (occ) extra.occupancy = occ;
      // Floor area — top-level `area` OR the detected-room `computed.area`. Without
      // this the detected-room store (whose area lives at `computed.area`) stamped
      // NO area onto the node, so both graph inspectors showed "— m²" (§LG-REAL-AREA).
      const area =
        (typeof rec.area === 'number' && rec.area > 0 && rec.area) ||
        (typeof rec.computed?.area === 'number' && rec.computed.area > 0 && rec.computed.area) ||
        0;
      if (area > 0) extra.area = area;
      // Boundary polygon — lets the Living Graph compute area by shoelace as a
      // last-resort fallback when no scalar metric is present.
      const poly = rec.boundary?.polygon;
      if (Array.isArray(poly) && poly.length >= 3) {
        extra.polygon = poly.map((v) => ({ x: v?.x, z: v?.z }));
      }
      if (Object.keys(extra).length > 0) {
        graph.addNode({ ...node, props: { ...(node.props ?? {}), ...extra } });
      }
    }
  }

  // Room-to-room `adjacentTo` from each level's RoomGraph (rooms sharing a wall).
  if (roomGraph && levelIds) {
    for (const levelId of levelIds) {
      const rg = safeGet(() => roomGraph.getGraph(levelId));
      const nodes = asArray(rg?.nodes as never);
      for (const rn of nodes as ReadonlyArray<{ roomId?: string; adjacentRooms?: string[] }>) {
        if (!rn?.roomId) continue;
        for (const other of rn.adjacentRooms ?? []) {
          if (!other || other === rn.roomId) continue;
          // De-dup symmetric pairs (a|b == b|a) by emitting only from the lower id.
          if (rn.roomId > other) continue;
          if (!graph.hasNode(other)) continue;
          graph.addEdge({ from: rn.roomId, to: other, type: 'adjacentTo', evidence: 'roomAdjacency' });
        }
      }
    }
  }
}

/**
 * Materialise WINDOW nodes with the data the rationale reads: `facade` (host-wall
 * outward normal), `latDeg` (site latitude), plus a `hostedIn` edge to the host
 * wall and a `bounds`-derived host-wall role. Read-only.
 */
export function enrichWindowNodes(
  graph: BuildingGraph,
  windowStore: WindowStoreLike | null | undefined,
  wallStore: WallStoreLike | null | undefined,
  latDeg: number | null | undefined,
): void {
  if (!windowStore) return;
  const windows = safeGet(() => windowStore.getAll()) ?? [];
  for (const win of windows) {
    const id = win?.id;
    if (!id) continue;
    const props: Record<string, unknown> = {};
    if (typeof latDeg === 'number' && Number.isFinite(latDeg)) props.latDeg = latDeg;
    if (typeof win.width === 'number') props.width = win.width;
    if (typeof win.height === 'number') props.height = win.height;

    const wallId = win.wallId;
    if (wallId && wallStore) {
      const wall = safeGet(() => wallStore.getById(wallId));
      const bl = wall?.baseLine;
      if (bl && bl.length >= 2) {
        // The host wall bounds a room → use that room's centroid to orient the
        // outward normal. If we can't find the room, the normal still resolves
        // (just unsigned) — better a façade guess than none.
        const room = firstBoundedRoom(graph, wallId);
        const centroid = room ? roomCentroidFrom(room, graph, wallStore) : null;
        const facade = wallFacadeCompass(bl[0]!, bl[1]!, centroid);
        if (facade) props.facade = facade;
      }
    }

    graph.addNode({
      id,
      kind: 'window',
      props,
      ...(wallId ? { refs: [wallId] } : {}),
    });
    if (wallId && graph.hasNode(wallId)) {
      graph.addEdge({ from: id, to: wallId, type: 'hostedIn', evidence: 'windowHost' });
    }
  }
}

/** The first room a wall `bounds` (its bounds out-edge target), or null. */
function firstBoundedRoom(graph: BuildingGraph, wallId: string): string | null {
  try {
    for (const e of graph.outEdges(wallId, 'bounds')) {
      const n = graph.getNode(e.to);
      if (n?.kind === 'room') return e.to;
    }
  } catch {
    /* ignore */
  }
  return null;
}

function safeGet<T>(fn: () => T): T | undefined {
  try {
    return fn();
  } catch {
    return undefined;
  }
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

  // 6. A.21.D16 enrichment — human room props + adjacency, then window façades.
  //    Window enrichment runs AFTER room enrichment so the host-wall→room
  //    centroid (used to orient the façade normal) sees the bounds edges.
  runGuarded(() => {
    enrichRoomNodes(graph, services.roomStore, services.roomGraph, services.levelIds);
  });
  runGuarded(() => {
    enrichWindowNodes(graph, services.windowStore, services.wallStore, services.latDeg);
  });

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

/** Anything that can enumerate levels — a `{id}` list keyed by one of these. */
interface LevelEnumeratorLike {
  /** Canonical BimManager level enumerator (every storey of the building). */
  getLevels?: () => ReadonlyArray<{ id?: string }> | undefined;
  /** Legacy alias some surfaces expose — kept for tolerance. */
  getAllLevels?: () => ReadonlyArray<{ id?: string }> | undefined;
}

interface WindowLike {
  __topologyLayer?: unknown;
  roomGraphService?: unknown;
  projectContext?: { activeLevelId?: string | null; levels?: ReadonlyArray<{ id?: string }> | null };
  bimManager?: LevelEnumeratorLike & {
    getActiveLevel?: () => { id?: string } | undefined;
  };
  // A.21.D16 enrichment sources (initBuilders registers these on window).
  roomStore?: unknown;
  /** WallStore — enrichment source AND a last-resort level enumerator. */
  wallStore?: unknown;
  windowStore?: unknown;
  /** composeRuntime slot — site location carries the parcel latitude (C19). */
  runtime?: { siteModelStore?: { getLocation?: () => { latitude?: number } | null } };
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

  // A.21.D16 enrichment sources — element stores + site latitude (all optional).
  const roomStore = (w?.roomStore as RoomStoreLike | undefined) ?? null;
  const wallStore = (w?.wallStore as WallStoreLike | undefined) ?? null;
  const windowStore = (w?.windowStore as WindowStoreLike | undefined) ?? null;
  const lat = (() => {
    const v = w?.runtime?.siteModelStore?.getLocation?.()?.latitude;
    return typeof v === 'number' && Number.isFinite(v) ? v : null;
  })();

  return {
    topology,
    roomGraph,
    semantic: liveSemantic(),
    dependencyFrom: liveSemantic(),
    constraint: liveConstraint(),
    elementIds,
    levelIds,
    roomStore,
    wallStore,
    windowStore,
    latDeg: lat,
    kindOf: kindFromId,
  };
}

/**
 * UBG node kind from a PRYZM element id (`<type>_<ulid>`). Element ids are minted
 * by `createId(prefix)` so the prefix is the element type — a free, exact kind for
 * topology nodes so walls/doors render as "Wall"/"Door", not the generic
 * "Element". Unknown/un-prefixed ids fall back to `undefined` (→ `element`).
 */
export function kindFromId(id: string): string | undefined {
  const i = id.indexOf('_');
  if (i <= 0) return undefined;
  const prefix = id.slice(0, i);
  const KNOWN = new Set([
    'wall', 'room', 'door', 'window', 'slab', 'floor', 'ceiling',
    'roof', 'stair', 'column', 'beam', 'level', 'curtainwall', 'space',
  ]);
  return KNOWN.has(prefix) ? prefix : undefined;
}

/**
 * The level universe whose room graphs we project — EVERY storey of the building,
 * so a multi-storey house shows all its rooms (not just the active level).
 *
 * §UBG-ALL-LEVELS — the canonical live BimManager exposes `getLevels()`; some
 * surfaces also expose the legacy `getAllLevels()`, and the WallStore /
 * projectContext can enumerate levels too. We try EACH source in turn and use the
 * first that yields ≥1 level id, de-duplicated. ONLY when none enumerates do we
 * fall back to the single active level (so a cold/headless boot still shows
 * something). Previously this read `getAllLevels()` ALONE — which is undefined on
 * the real BimManager (whose method is `getLevels()`), so the UBG silently
 * collapsed to the active level only and upper storeys never appeared in the graph.
 */
export function resolveLevelIds(w: WindowLike | undefined): string[] {
  const ws = w?.wallStore as LevelEnumeratorLike | undefined;
  const enumerators: Array<() => ReadonlyArray<{ id?: string }> | undefined> = [
    () => w?.bimManager?.getLevels?.(),
    () => w?.bimManager?.getAllLevels?.(),
    () => ws?.getLevels?.(),
    () => (w?.projectContext?.levels ?? undefined) as ReadonlyArray<{ id?: string }> | undefined,
  ];
  for (const get of enumerators) {
    let list: ReadonlyArray<{ id?: string }> | undefined;
    try {
      list = get();
    } catch {
      continue;
    }
    if (!list || list.length === 0) continue;
    const ids = uniqueStrings(list.map((l) => l?.id));
    if (ids.length > 0) return ids;
  }
  // Last resort: just the active level (cold boot / no enumerator available).
  const active = w?.projectContext?.activeLevelId ?? w?.bimManager?.getActiveLevel?.()?.id;
  return typeof active === 'string' ? [active] : [];
}

/** De-duplicate (insertion-order stable) the defined string ids. */
function uniqueStrings(values: ReadonlyArray<string | undefined>): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of values) {
    if (typeof v !== 'string' || v.length === 0 || seen.has(v)) continue;
    seen.add(v);
    out.push(v);
  }
  return out;
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
