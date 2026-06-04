# ADR-0058 — Unified Building Graph (UBG) as the relational substrate

**Status:** DRAFT
**Phase:** GRAPH.1 (master-execution-tracker)
**Authors:** PRYZM Architecture team
**Date:** 2026-06-03
**Cross-references:**
- Strategy: `docs/01-strategy/PRYZM-BUILDING-GRAPH-AND-RELATIONAL-AI-FOUNDATION.md` §3 (target architecture), §5 (serialisable), §6 (governance).
- Package: `packages/building-graph` (`@pryzm/building-graph`).
- Sibling aggregate contract: C20 (Site→Building→Level→Apt→Room→Element hierarchy — a *tree* subset of the UBG).

> **Numbering note:** the strategy doc proposed "ADR-0057". That number is already taken
> (`ADR-057-realtime-geometry-and-view-interactivity.md`), so the UBG ADR is **0058**.

---

## Context

PRYZM already describes buildings relationally — but across ~7 *specialised* graphs that do not
share one node/edge model or one query surface (strategy §1):

| Graph | Where | Encodes |
|---|---|---|
| SemanticGraph | `packages/core-app-model/src/SemanticGraph.ts` | element↔element semantic relations / derivations |
| TemporalGraph | `packages/core-app-model/src/TemporalGraph.ts` | every mutation over time |
| DependencyResolver | `packages/core-app-model/src/DependencyResolver.ts` | dependency edges → cascade rebuilds |
| TopologyLayer | `packages/room-topology/src/TopologyLayer.ts` | what bounds / connects what |
| RoomGraphService | `packages/spatial-index/src/RoomGraphService.ts` | room adjacency / connectivity |
| SemanticQueryEngine | `packages/ai-host/src/SemanticQueryEngine.ts` | AI reasoning over the graph |
| sightline/bubble/LayoutGraph | `packages/ai-host/.../tgl/` | space-syntax generative layout |

The gap (strategy §2) is **unification + visibility, not capability**: there is no single canonical
"Building Graph" that the AI host, query engine and a (future) visual overlay all read; and there is
no relational visualization. This ADR governs the first piece — the **core relational substrate**.

## Decision

### 1 — A Unified Building Graph (UBG) projects; it does not replace

`@pryzm/building-graph` is a thin, pure L2 package holding ONE node/edge model. It does **not**
replace the specialised graphs — they remain the sources of truth for their domains. Instead, the
specialised graphs become **projections**: GRAPH.2 *adapters* read each service and emit UBG
nodes/edges. The UBG is the shared relational surface (`query`, `neighbors`, `subgraph`) that
SemanticQueryEngine, the AI host and the GRAPH.3 overlay all consume.

### 2 — The node/edge model

- **Node** = `{ id, kind, props?, refs? }`, keyed by the existing element id. `kind` is a free
  string so the substrate is **typology-agnostic** (apartment / house / office alike); adapters own
  the vocabulary, the core does not constrain it. `props` are opaque to the core.
- **Edge** = `{ from, to, type, weight?, evidence? }`, directed. `type` is a **closed** union of the
  ten relations from strategy §3: `bounds`, `adjacentTo`, `connectsTo`, `circulatesVia`, `hostedIn`,
  `servesZone`, `derivesFrom`, `dependsOn`, `precededBy`, `violates`. The union is closed so span and
  attribute cardinality stays finite and every relation has a documented projection source.
- Both are **L0 Zod** schemas (`src/types.ts`); inferred types are the public surface.

### 3 — P5-pure core

The package has **zero THREE, zero DOM, zero I/O**. It depends only on `zod` (schema) and
`@opentelemetry/api` (spans). Adapters (GRAPH.2) — which *do* depend on the specialised services —
live in their own package(s); the visual overlay (GRAPH.3) lives in a renderer/UI layer. This keeps
the substrate cheap to import anywhere and trivially testable.

### 4 — Adapter contract only (no implementations here)

`src/adapters.ts` defines `UbgAdapter { name; project(graph) }` (+ an optional `UbgAdapterRegistry`).
GRAPH.2 implements one adapter per source (topology→`bounds`/`adjacentTo`,
roomGraph→`connectsTo`, semantic→`derivesFrom`, dependency→`dependsOn`, constraint→`violates`,
D-TGL→`circulatesVia`). Adapters MUST be **idempotent** — re-projecting the same source state yields
the same graph (the store de-duplicates identical nodes by id and identical edges by from/to/type).

### 5 — Serialisable (strategy §5)

`toJSON()` / `fromJSON()` round-trip a versioned `UbgSnapshot` (`version: 1`). This is how the UBG
persists in the `.pryzm` snapshot and exports as the relational "shared-language" artifact alongside
IFC (GRAPH.5). The snapshot is deterministic (insertion-ordered) so diffs are stable.

### 6 — P8 spans at mutation boundaries

Every UBG **mutation** (`addNode`, `addEdge`, `clear`, `fromJSON`) emits a `pryzm.ubg.{op}` span via
a cached tracer (no allocation when no SDK is configured), mirroring `packages/ai-host/src/tracing.ts`.
Read paths (`query`, `neighbors`, `subgraph`, `getNode`) are pure and span-free by design.

### 7 — GRAPH.2: the concrete adapters (shipped)

GRAPH.2 implements the five adapters the contract (§4) anticipated. They live **inside**
`@pryzm/building-graph` (`src/adapters/*.ts`) yet keep the package L2-/P5-pure by NOT importing the
higher-layer specialised services. Instead each adapter is a **factory** `create<Source>Adapter(snapshot)`
that takes a plain, structurally-typed **input snapshot** (`src/adapters/inputs.ts`) which the caller
(GRAPH.2 wiring / the editor runtime) extracts from the real service. The factory returns a
`UbgAdapter { name; project(graph) }` (the §4 contract), documented as the dependency-injected variant.

| Adapter | Factory | Projected from | Edge type(s) emitted |
|---|---|---|---|
| topology | `createTopologyAdapter` | TopologyLayer `getAdjacencyRelationships` (`intersects`/`adjacentTo`) | **`bounds`** (from `intersects`) + **`adjacentTo`** |
| roomGraph | `createRoomGraphAdapter` | RoomGraphService `getGraph(levelId)` + D-TGL circulation paths | **`connectsTo`** (door edges) + **`circulatesVia`** (circulation paths) |
| semantic | `createSemanticAdapter` | SemanticGraph derivation family (`branchedFrom`/`supersedes`/`precededBy`) | **`derivesFrom`** |
| dependency | `createDependencyAdapter` | DependencyResolver cascade pairs (`RebuildTask`) | **`dependsOn`** |
| constraint | `createConstraintAdapter` | ConstraintEngine validation report violations | **`violates`** (element → synthetic `rule:{ruleId}` node) |

All seven non-deferred edge types from §2 are therefore produced (`hostedIn`, `servesZone`,
`precededBy` remain deferred to later adapters). Each adapter is **idempotent** (§4) — re-projecting
the same snapshot dedupes by node id / edge from·to·type — and emits a single `pryzm.ubg.project` span
carrying the `ubg.adapter` attribute (§6, P8), keeping span cardinality bounded by the closed adapter
set. The barrel `src/adapters/index.ts` re-exports the factories, names, `ruleNodeId`, the
`DERIVATION_TYPES` filter and every input type; the package barrel re-exports them in turn. Coverage:
`__tests__/adapters.test.ts` (11 tests) proves each edge type from a realistic fixture + idempotence +
a compose-all check that all seven coexist in one graph.

## Consequences

### Positive
- One canonical relational model + query surface; the specialised graphs stop being islands.
- Pure substrate → importable from L2 up; fully unit-tested (22 tests: nodes/edges, neighbor
  filtering, subgraph BFS, query, JSON round-trip).
- Typology-agnostic (`kind`/edge vocabulary is open at the node level, closed at the edge level).
- Serialisable from day 1 (versioned snapshot) → no migration debt for persist/export (GRAPH.5).

### Negative / deferred
- This ADR + package are **GRAPH.1 only**: no adapters (GRAPH.2) populate the graph yet, and no
  overlay (GRAPH.3) renders it. The UBG is empty until GRAPH.2 lands.
- The edge-type union is closed; adding a relation is a deliberate schema + ADR change (intended —
  keeps cardinality and the projection-source mapping auditable).
- This is a DRAFT pending the sibling C-contract (strategy §6: "the UBG node/edge model + query
  invariants, sibling to C20") which will formalise the query invariants.

### Risks and mitigations
| Risk | Mitigation |
|---|---|
| The UBG drifts from the specialised graphs it projects. | Adapters are idempotent + driven off the StoreEventBus (GRAPH.2); the UBG is a *projection*, never an independent source of truth. |
| Edge-type cardinality explodes. | Union is closed; widening requires a schema + ADR change. |
| Snapshot format churn. | `UbgSnapshot.version` is a literal `1`; a breaking change bumps to `2` and `fromJSON` validates before load. |
