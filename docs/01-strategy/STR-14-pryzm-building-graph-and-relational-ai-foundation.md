# PRYZM Building Graph — Relational, AI-Native Foundation + Powerful Graphic Visualization

**Status:** STRATEGY / DRAFT (2026-06-03) · **Tracker:** GRAPH.* (master-execution-tracker) · **Trigger:** founder, after seeing Finch's graph-native pitch.

> Finch's thesis (paraphrased): "Buildings aren't just geometry. They're relationships, systems, constraints, circulation, adjacencies, and intent. Our graph technology describes buildings as connected relational data — a shared language both humans and AI can reason about, so foundation models understand how spaces relate, how buildings function, and how design decisions ripple through a project."

**The good news: PRYZM is already largely here on the data side — arguably ahead.** What we lack is (1) ONE unified, named "Building Graph" surfaced as the canonical relational model, and (2) the **powerful force-directed visual overlay** (nodes = elements/spaces, edges = relationships, drawn over the plan) that makes the graph *legible and exciting*. This doc audits what exists, names the gaps, and gives an architecture + phased plan.

---

## §1 — What PRYZM ALREADY has (cite file:line)

PRYZM is not starting from zero — it has MORE graph substrate than most BIM tools:

| Graph | Where | What it encodes |
|---|---|---|
| **SemanticGraph** | `packages/core-app-model/src/SemanticGraph.ts` (`semanticGraphManager`) | element↔element semantic relations; derivations |
| **TemporalGraph** | `packages/core-app-model/src/TemporalGraph.ts` | every mutation over time (the "how the design evolved" graph) |
| **DependencyResolver** | `packages/core-app-model/src/DependencyResolver.ts` | dependency edges → cascade rebuilds ("decisions ripple") |
| **TopologyLayer** | `packages/room-topology/src/TopologyLayer.ts` | spatial topology — what bounds/connects what |
| **RoomGraphService** | `packages/spatial-index/src/RoomGraphService.ts` | room adjacency / connectivity graph |
| **SemanticQueryEngine** | `packages/ai-host/src/SemanticQueryEngine.ts` | **AI reasoning OVER the graph** (the Finch "shared language") |
| **sightlineGraph / bubbleGraph / LayoutGraph** | `packages/ai-host/src/workflows/apartmentLayout/tgl/` | space-syntax: sightlines, bubble adjacency, the generative layout graph |
| **ConstraintEngine** | data-platform | 17 rules over relationships (privacy, circulation, adjacency, physics) |
| **ProgramRules DB** | `rules/programRules.ts` ([[architectural-program-rules]]) | normative connectivity permission matrix + privacy + program |
| **Apartment Cognition Stack** | [[apartment-cognition-stack-framework]] | 7-layer: Semantic Topology, Spatial Hierarchy, etc. |

We also have the **Inspect tree** (Site→Building→Level→Apt→Room→Element, C20) which is a *hierarchy* (tree) — a subset of the graph.

**So PRYZM already describes buildings relationally.** The relationships are real and AI already queries them (SemanticQueryEngine, cognition stack, D-TGL space-syntax). The gap is unification + visibility, not capability.

## §2 — The gaps vs Finch

1. **No single canonical "Building Graph".** We have ~7 specialised graphs that don't share one node/edge model or one query surface. Finch's edge is the *unified* graph as the substrate everything reads/writes.
2. **No powerful graphic visualization.** Finch's marketing power is the force-directed overlay (nodes pulsing over the plan, edges = adjacency/circulation). PRYZM renders geometry beautifully but never shows the *relational* layer. This is the single highest-wow, lowest-risk win.
3. **AI-over-graph is partial, not first-class.** SemanticQueryEngine + cognition stack exist but aren't framed as "the foundation model reasons over THE graph." Finch sells the graph as the AI's native input.

## §3 — Target architecture: the Unified Building Graph (UBG)

A thin **L2/L3 `@pryzm/building-graph` package** that does NOT replace the specialised graphs — it **projects** them into one queryable model:

- **Nodes:** every BIM entity (Site, Building, Level, Unit, Room, Wall, Door, Window, Furniture, System…) + abstract nodes (Zone, Circulation path) — keyed by the existing element ids. Node = `{ id, kind, props, refs }`.
- **Edges (typed, directed):** `bounds`, `adjacentTo`, `connectsTo` (door/opening), `circulatesVia`, `hostedIn` (door-in-wall), `servesZone`, `derivesFrom` (SemanticGraph), `dependsOn` (DependencyResolver), `precededBy` (TemporalGraph), `violates` (ConstraintEngine). Edge = `{ from, to, type, weight, evidence }`.
- **Built by adapters** over the existing services (TopologyLayer→bounds/adjacent, RoomGraphService→connectsTo, SemanticGraph→derivesFrom, DependencyResolver→dependsOn, ConstraintEngine→violates, D-TGL→circulation/sightline). **Incrementally maintained off the StoreEventBus — BUILT 2026-08-21; see both boxes below.**

  > ⚠ **CORRECTED 2026-08-21 (lane ANLZ1, ISSUE-LOG L-2131) — the struck clause describes maintenance
  > that WAS NEVER BUILT, and it is load-bearing for anything that reads the graph.** Measured at HEAD:
  > `window.__pryzmBuildingGraph` is written in exactly one place —
  > `apps/editor/src/engine/buildBuildingGraph.ts:853-855`, inside `window.pryzmBuildBuildingGraph()`,
  > which **rebuilds the whole graph from every source on each call**. Its only production callers are
  > the two graph overlays (`ui/graph/BuildingGraphOverlay.ts:366-367`,
  > `ui/living-graph/LivingGraphOverlay.ts:770,773,905`). `ui/layout/installLiveGraphWiring.ts` makes
  > four install calls and **subscribes to no store event at all**.
  >
  > **The UBG is therefore STALE BY CONSTRUCTION** — it holds the model as it stood the last time
  > somebody opened a graph overlay, and its shape carries no timestamp saying so. That is tolerable
  > for an overlay the user just opened and **not** tolerable for anything left on screen, which is
  > why [ADR-0343](../02-decisions/adrs/ADR-0343-analysis-surface-and-composable-widget-model.md) §D.7
  > makes StoreEventBus maintenance a **binding precondition** of hosting the graphs on the Analysis
  > surface. Adapters that read whole snapshots do not become incremental by being subscribed —
  > **that is the real work.**

  > ⭐ **CLOSED 2026-08-21 (lane UBG1, ISSUE-LOG L-3250…L-3254). The struck clause is now TRUE.**
  > The box above is KEPT, not deleted — the history is the point.
  >
  > `apps/editor/src/engine/buildingGraphMaintainer.ts` subscribes `storeEventBus`, coalesces dirty
  > ids into ONE drain per frame via `getFrameScheduler().scheduleOnce('ubg-maintain', …,
  > 'pre-render')` (no new rAF — P3), and applies a **retract-then-re-project** delta.
  > `installLiveGraphWiring()` installs it — that function previously made four install calls and
  > subscribed to nothing.
  >
  > ⭐ **ANLZ1's diagnosis was correct and INCOMPLETE, and the missing half was the harder one.**
  > Before this work `BuildingGraph` exposed four mutations — `addNode`, `addEdge`, `clear`,
  > `fromJSON` — **all additive or total**. There was no `removeNode` and no `removeEdge`, so **the
  > delete leg of a delta was UNREPRESENTABLE**: subscribing alone could not have helped. L-3250 adds
  > `removeNode` / `removeEdge` / `retractIncident`, the last keyed on the `evidence` prefix every
  > adapter already stamps — which is what lets one leg be re-derived without disturbing the others.
  >
  > **Cost, MEASURED as source reads** (not wall-clock, so it cannot flake): a full rebuild issues
  > **100** topology reads on a 50-element model and **2000** on a 1000-element model; the delta
  > issues **2 on both**. The topology leg is exact O(|Δ|·deg). The semantic / dependency /
  > constraint legs are an O(R) walk of an already-materialised array with O(Δ) writes — **that is
  > not the same claim as "O(Δ) everywhere", and the code does not make it**; `UbgDeltaReport.legs`
  > reports per leg, per drain.
  >
  > ⚠ **TWO FURTHER DEFECTS, both found by the differential test, neither predicted:**
  > **(1) L-3253** — `resolveElementIds()` read `window.pryzmScene`, which **nothing in the repo ever
  > assigns**, so the topology adapter had **never fired in production**: `bounds` and
  > topology-`adjacentTo` were never emitted. The entire spatial half of this graph was empty, and it
  > read exactly like *"this building has no adjacencies"*.
  > **(2) L-3254** — edge DIRECTION was scan-order dependent, so two rebuilds of the same model could
  > disagree, and no neighbourhood-scoped delta could ever converge on a universe-scoped rebuild.
  >
  > ⚠ **FOUR of the ten edge types listed above still cannot be populated in production** —
  > `derivesFrom`, `circulatesVia`, `servesZone`, `precededBy` (L-3258). **Being maintained did not
  > make them real.** The Analysis surface ships a coverage row per family that says so, because an
  > empty `derivesFrom` otherwise renders exactly like a building with no derivations.
- **One query surface** (`ubg.query(...)`, `ubg.neighbors(id, edgeType)`, `ubg.subgraph(roomId)`) that SemanticQueryEngine + the AI host + the visual overlay all consume. Pure, P5-safe core; spans per P8.
- **Serialisable** → persists in the `.pryzm` snapshot + exports as the relational view alongside IFC (the "shared language" artifact).

This is **typology-agnostic** ([[platform-spine-typology-agnostic]]) — the graph is the substrate for apartment, house, office alike.

## §4 — Powerful graphic visualization (the wow)

A new **Graph Overlay view** in the editor — the Finch-style force-directed layer:
- Nodes = rooms/elements (size by area/importance, colour by kind/zone), edges = adjacency/circulation/dependency, drawn as a glowing overlay registered to the plan (toggleable opacity over the 2D plan or floating in 3D).
- **Force-directed layout** (d3-force or a lightweight WASM sim) for the "constellation" look, OR snapped-to-geometry mode (nodes at room centroids, like the founder's Finch screenshots).
- **Live + interactive:** hover a node → highlight its relationships; filter by edge type (show only circulation, or only privacy violations); animate "ripple" when a decision changes (drives home "design decisions ripple").
- **Rendering:** a 2D canvas/SVG overlay layer (cheap, P2-safe — no THREE needed) bound to the active view; or a renderer-three line layer for the 3D constellation. Reuse the parcel-overlay/annotation overlay pattern.
- This is the demo that makes PRYZM look AI-native, not just a modeller.

### §4.1 — Aesthetic north-star: fluid, living — not stiff lines (founder, 2026-06-03)

The graph should NOT read as a dry node-link diagram. The target is **fluid, nearly liquid — a living blob**: think the landing page's **purple-mesh / fluid background** (`LandingPage` hero shader / `lp-skel` mesh, [[landing-skeleton-vs-real-mismatch]]) but where the fluid *is* the building graph. Relationships render as flowing fields/metaballs, not segments; spaces are soft organisms that swell with use; the whole building reads as a **living blob in the city that adjusts to its inhabitants** — "the living city becomes more than lights and traffic." Techniques to explore (GRAPH.3.b): metaball / signed-distance-field blending between related nodes (edges become liquid bridges); a force-sim driving a fluid/curl-noise field (reuse the landing hero's shader vocabulary); soft-body / gooey node halos that merge when adjacency is strong; subtle perpetual motion + ripple-on-change so it feels alive. Default to a tasteful, legible version (the founder also values clarity), with the full "living blob" as the hero/marketing mode. Render P2-safe (2D canvas/WebGL shader overlay, or a renderer-three TSL fluid layer — the editor is already WebGPU/TSL, so a fluid node-field is feasible without leaving the renderer).

## §5 — Phased plan (tracker GRAPH.1–GRAPH.5)

- **GRAPH.1 — UBG core package** (`@pryzm/building-graph`): node/edge schema (L0 Zod), in-memory store, adapter interfaces. Pure + tested.
- **GRAPH.2 — Adapters** over Topology/RoomGraph/Semantic/Dependency/Constraint → populate the UBG off the StoreEventBus, incrementally.
- **GRAPH.3 — Graph Overlay view** (the powerful visualization): force-directed + snapped modes, hover/filter, brand-styled. THE wow deliverable.
- **GRAPH.4 — AI-over-graph**: point SemanticQueryEngine + the AI host at the UBG as the canonical context; "explain this layout", "what depends on this wall", "show circulation bottlenecks" answered FROM the graph.
- **GRAPH.5 — Persist + export**: UBG in the `.pryzm` snapshot + a relational export (graph JSON / RDF-ish) as the shared-language artifact alongside IFC.

## §6 — Governance

- This STRATEGY doc → an **ADR** ("Unified Building Graph as the relational substrate") + a **C-contract** (the UBG node/edge model + query invariants, sibling to C20 aggregates). The specialised graphs become *adapters/projections*, not competitors. Spans (P8) at every UBG mutation boundary.
- Differentiator vs Finch: PRYZM already has geometry + CRDT collab + IFC/Revit round-trip + the cognition stack; the UBG + overlay make the relational story **visible and AI-native** on top of that — a fuller stack than graph-only.
