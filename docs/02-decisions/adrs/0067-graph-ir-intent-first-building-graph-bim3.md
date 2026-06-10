# 0067 — Graph-IR / Intent-First Building Graph (BIM 3.0)

**Status**: PROPOSED
**Date**: 2026-06-10
**Deciders**: architecture team (founder-driven — *"Rooms are NOT the primary node type — that's the mistake every BIM/CAD/generative system makes. The graph should represent intent → spatial systems → geometry, NOT geometry directly — think of it as a COMPILER IR for architecture."*)
**Related contracts**: [C52 — Editable Building Graph](../contracts/C52-EDITABLE-BUILDING-GRAPH.md), [C53 — Generative Layout Engine Architecture](../contracts/C53-GENERATIVE-LAYOUT-ENGINE-ARCHITECTURE.md) (§1 topology-before-geometry), [C50 — Typology Pipeline](../contracts/C50-TYPOLOGY-PIPELINE.md), [C19 — Site Model & Parcel](../contracts/C19-SITE-MODEL-AND-PARCEL.md)
**Related ADRs**: [ADR-0058](./0058-unified-building-graph.md) (unified building graph), [ADR-0060](./0060-living-design-parameters.md) (sliders bind to existing substrate, not a parallel scorer), [ADR-0061](./0061-building-graph-bidirectional-edit-substrate.md) (determinism substrate), [ADR-0062](./0062-layout-engine-deterministic-graph-solver.md) (deterministic graph solver), [ADR-0066](./0066-access-graph-first-generative-layout-doctrine.md) (access-graph-first doctrine — the immediate predecessor)
**Related SPECs**: [SPEC-LIVING-BUILDING-GRAPH](../../03-execution/specs/SPEC-LIVING-BUILDING-GRAPH.md), [SPEC-ACCESS-GRAPH-AND-SPATIAL-GRAMMAR](../../03-execution/specs/SPEC-ACCESS-GRAPH-AND-SPATIAL-GRAMMAR.md), [SPEC-LIVING-DESIGN-PARAMETERS](../../03-execution/specs/SPEC-LIVING-DESIGN-PARAMETERS.md)
**Strategy docs**: [GENERATIVE-LAYOUT-WORLD-MODEL-STRATEGY](../../01-strategy/GENERATIVE-LAYOUT-WORLD-MODEL-STRATEGY.md), [PRYZM-BUILDING-GRAPH-AND-RELATIONAL-AI-FOUNDATION](../../01-strategy/PRYZM-BUILDING-GRAPH-AND-RELATIONAL-AI-FOUNDATION.md)
**Context docs**: [LAYOUT-GENERATION-ALGORITHM](../../04-reference/LAYOUT-GENERATION-ALGORITHM.md) (the master engine walkthrough), master-execution-tracker §47 + §48.

## Context

The founder set the north-star data model for generative architecture as a **compiler IR**, not a
room collection:

> *"Rooms are NOT the primary node type — that's the mistake every BIM/CAD/generative system makes.
> The graph should represent **intent → spatial systems → geometry**, NOT geometry directly — think
> of it as a COMPILER IR for architecture."*

The manifesto, captured verbatim-in-intent:

- **Six top-level node families** — **Intent, Site, Space, System, Geometry, Performance** — plus a
  **7th SpatialCluster** node sitting between Intent and rooms (Private / Public / Service / Sleeping /
  Work Zone).
- **Node kernel** `{ id, type, properties, constraints[], embeddings[], confidence }`;
  **edge kernel** `{ source, target, relation, weight, hard }`. *Most of the information lives in the
  edges.*
- **Edge taxonomy (9):** `INFLUENCES, ADJACENT, SEPARATED_FROM, CONTAINS, ACCESSIBLE_VIA, SERVED_BY,
  FACES, DEPENDS_ON, PART_OF`.
- **Space nodes NEVER know geometry** — no x / y / polygon / wall on a Space.
- **Sliders ARE Intent nodes.** A slider's `priority` (0–1) propagates through `INFLUENCES` edges:
  Privacy↑ → separation/visibility constraints↑ → circulation adjusts → geometry recomputes. No
  hardcoded slider→weight logic; pure graph propagation.
- **The compiler pipeline:** `Intent Graph → Spatial Graph → Constraint Graph → Layout Graph →
  Geometry Graph → BIM Model`. **Geometry is a DERIVED projection, never user-authored.**

The founder additionally supplied a companion **architectural layout optimizer** objective set
(circulation-first): clear the spine before placing rooms; every private room on circulation; stair
as the circulation anchor; the privacy gradient Entrance → Hall → Living → Transition → Private;
a social core (open-plan Living/Dining/Kitchen); wet-core vertical clustering; and a penalty/reward
scoring list.

### The honest A/B split — what already exists vs what genuinely changes

A full read of the engine (`packages/ai-host/src/workflows/apartmentLayout/`), C53 §1, the objective
vector (`tgl/objectives.ts`) and the slider plumbing establishes that **PRYZM already has a large
fraction of this model** — but built *geometry-rooted*, not *intent-rooted*. Honest ledger:

#### (A) ALREADY-BUILT — do not claim PRYZM lacks these

1. **A typed, persistent graph IS the source of truth, and geometry IS already a projection of it
   (in principle).** C53 §1 (`C53-GENERATIVE-LAYOUT-ENGINE-ARCHITECTURE.md:23-28`) is binding:
   *"The topology graph is the source of truth; geometry is a projection of it."* The P5
   `LayoutGraph` (`tgl/semanticGraph.ts:46-50`) is a real persistent graph of typed nodes + typed
   edges with deterministic IFC GUIDs (`ifcGuid.ts`).
2. **The compiler pipeline already exists in spirit.** The doc's P1→P9 (`LAYOUT-GENERATION-ALGORITHM.md`)
   is `program → bubbleGraph → subdivide → semanticGraph → emitGeometry` — i.e.
   *program/topology → spatial → layout → geometry → BIM*, the manifesto's pipeline minus the
   leading Intent-Graph stage.
3. **Typed edges already carry semantic relation.** `tgl/edgeTypes.ts:33-50` defines an architectural
   edge taxonomy — `SOCIAL_FLOW, INTIMATE_ACCESS, BUFFER, SERVICE_ACCESS, CEREMONIAL_THRESHOLD,
   VISUAL_CONNECTION, ACOUSTIC_SEPARATION` — classified from privacy tiers + open/door
   (`classifyEdge` `:76-99`). The structural `LayoutGraph` edges are `BOUNDS, ADJACENT_TO,
   CONNECTS_THROUGH, HOSTED_BY, FILLS, CONTAINS` (`semanticGraph.ts:26`).
4. **The "Performance" family + the optimizer objectives are mostly built.** `ObjectiveVector`
   (`tgl/objectives.ts:24`) is a **21-axis** vector that already encodes `circulation`, `hierarchy`
   (privacy-depth gradient), `adjacency`, `daylight`, `regularity`, `wetStackAlignment`,
   `acousticZoning`, `arrivalSequence`, `entrySightline`, `spatialClimax`, `solarOrientation`,
   `naturalVentilation`, `edgeRealisation`, etc. — i.e. most of the founder's penalty/reward list
   and the circulation-first/privacy-gradient/wet-core objectives.
5. **The privacy gradient + "no bedroom off the hall" + "every room on circulation" are already
   ENFORCED, not just scored.** The `accessFrom` permission matrix (`rules/programRules.ts:200-203`,
   per-type rows `:262`+) and the `§TOPO-HARD-REJECT` gate (`tgl/enumerate.ts:125,187,636,929`)
   hard-reject windowless / land-locked / private-off-hall / overlapping plans.
6. **Sliders already re-weight the ENGINE, not just the scorer.** ADR-0060 + A.25:
   `designParamsToScoringWeights.ts` maps four sliders to `ScoringWeights`, and the A.25.3 four
   tune NON-scoring `EngineTuning` inputs (adjacency strictness, corridor clear-width, solar bias,
   area generosity) — feeding `computeObjectives` / the subdivider / the bubble allocator.
7. **A unified building-graph strategy + editable graph already exist.** ADR-0058 (unified building
   graph), C52 (editable building graph), SPEC-LIVING-BUILDING-GRAPH, and the existing
   SemanticGraph / TemporalGraph / DependencyResolver / RoomGraphService surfaces.

#### (B) GENUINE DELTA — the intent-first inversion (this is the real new work)

1. **The graph is geometry-rooted, not intent-rooted.** Today `NodeKind` is
   `'Space' | 'Wall' | 'Opening' | 'Door' | 'Window' | 'Level'` (`semanticGraph.ts:25`) — there is
   **NO** `Intent`, `SpatialCluster`, `Site`, `System`, or `Performance` node kind. The graph starts
   at *program/Space*, not at *intent*.
2. **Space nodes DO know geometry today.** The `Space` GraphNode carries
   `geometry: { polygon: rectPolygon(p.rect) }` (`semanticGraph.ts:34,108`) — a direct contradiction
   of the manifesto's "Space nodes NEVER know geometry." Geometry is *attached to* the space rather
   than living in a separate derived Geometry node `PART_OF`-linked to the Space.
3. **Sliders are NOT Intent nodes with INFLUENCES propagation.** They are an *external* numeric
   mapping into weights/tuning (`designParamsToScoringWeights.ts`), per ADR-0060's deliberate
   "bind, don't fork" choice. The manifesto wants the slider to BE a node in the graph whose
   `priority` propagates along `INFLUENCES` edges into constraint nodes — i.e. *graph propagation
   replaces the hand-written mapping*.
4. **The pipeline is `program → geometry`, not `intent → … → geometry`.** There is no explicit
   Intent-Graph or Constraint-Graph stage as a *materialised graph artifact*; the program is the
   entry point, and constraints live as code rules (`programRules.ts`) + the scorer, not as
   first-class `constraints[]` on nodes / `hard` flags on edges.
5. **No Site/System node families in the layout graph.** C19 site data + MEP/structure exist
   elsewhere, but they are not woven into the layout graph as `Site` / `System` nodes with
   `SERVED_BY` / `FACES` edges to spaces.

**So: the manifesto is neither already-done nor absent.** PRYZM has the typed graph, the typed edges,
the projection principle, the performance axes, and the enforcement. The genuine delta is the
**intent-first INVERSION** — promoting Intent + SpatialCluster + Site + System + Performance to
first-class node families, making sliders Intent nodes that propagate via `INFLUENCES`, and making
geometry a fully-derived Geometry-node projection rather than a polygon hung on a Space.

## Decision

**Adopt the intent → spatial → constraint → layout → geometry → BIM Graph-IR as PRYZM's north-star
building-graph data model.** This ADR sets the *target schema and direction*; it is a north-star, not
a rewrite mandate. Five binding sub-decisions:

**GIR1 — The graph represents intent, not geometry.** The canonical building graph's root families are
the seven the founder named: **Intent, SpatialCluster, Site, Space, System, Geometry, Performance**.
The graph is read as a compiler IR: *intent compiles down to geometry*. Rooms (Spaces) are an
*intermediate* representation, never the primary node type.

**GIR2 — The node + edge kernels are normative.** Target node kernel:
`{ id, type, properties, constraints[], embeddings[], confidence }`. Target edge kernel:
`{ source, target, relation, weight, hard }`, with the relation drawn from the **9-edge taxonomy**:
`INFLUENCES, ADJACENT, SEPARATED_FROM, CONTAINS, ACCESSIBLE_VIA, SERVED_BY, FACES, DEPENDS_ON,
PART_OF`. Most semantics live on edges (weight + `hard`). The existing structural `EdgeKind` and the
semantic `EdgeType` are *projections of / refinements within* this taxonomy (e.g. `CONNECTS_THROUGH`
⊂ `ACCESSIBLE_VIA`; `ADJACENT_TO` ⊂ `ADJACENT`; the privacy edge types refine `SEPARATED_FROM` /
`ACCESSIBLE_VIA`).

**GIR3 — Space nodes never know geometry.** A `Space` node carries *intent-level* attributes
(type, target area, privacy, needsWindow) and `constraints[]` only. Concrete geometry lives in a
separate **Geometry** node linked `Geometry --PART_OF--> Space`. Today's `Space.geometry.polygon`
is migrated to a derived Geometry node; the Space becomes geometry-free.

**GIR4 — Sliders are Intent nodes; influence propagates through the graph.** Each design slider is an
**Intent** node with a `priority` (0–1). Its effect reaches the rest of the graph by `INFLUENCES`
edges into constraint/SpatialCluster/Space nodes — *graph propagation, not a hand-written
slider→weight table*. (Privacy↑ raises `SEPARATED_FROM` / visibility constraint weights → circulation
re-solves → geometry recomputes.) ADR-0060's mapping is the *bootstrap*; GIR4 is the *destination*.

**GIR5 — Geometry is a derived projection, never user-authored at the graph level.** Per C53 §1 the
geometry graph is computed from the layout graph; GIR5 makes this explicit at the node level: the
Geometry family is *output*, recomputed when intent/constraints change. User edits to geometry are
re-expressed as edits to intent/constraints/layout (the C52 bidirectional-edit substrate is how an
edit flows back *up* the IR), never as a free-floating polygon that the graph does not own.

## Consequences

- **Positive — one mental model.** The compiler-IR framing unifies the generative engine, the
  editable building graph (C52), the typology pipeline (C50), the living-design sliders (ADR-0060),
  and site/climate (C19) under a single intent→geometry spine. New typologies declare *intent + edges*,
  not bespoke geometry code.
- **Positive — sliders become first-class + explainable.** Intent-node propagation makes "why did this
  layout change?" answerable by tracing `INFLUENCES` edges, and lets the AI reason over intent rather
  than over polygons (ties into the relational-AI foundation strategy doc).
- **Determinism preserved.** The IR is still solved by the deterministic graph solver (ADR-0062) over
  the existing seeded pipeline; propagation is a pure function of node priorities + edge weights. No
  randomness introduced (ADR-0061 I2 byte-identical invariant for the existing single-plate path is
  protected during migration).
- **Honest scope.** (A) is large and shipped — the typed graph, the typed edges, the projection
  principle, the 21-axis performance vector, the enforcement gates. (B) is the genuine, staged work —
  the node-family inversion, geometry-free Spaces, sliders-as-Intent-nodes, and Site/System/Performance
  as first-class node families.
- **Cost / staging.** This is a **multi-quarter north-star**, executed incrementally (see Migration),
  NOT a rewrite. The mature, tested, deterministic engine is preserved; the IR is grown *around and
  above* it, starting with additive node families that do not disturb the shipped single-plate path.

## Migration — incremental, not a rewrite

The existing `LayoutGraph` / `objectives.ts` / sliders evolve toward the IR in additive stages
(mirrored as the master-tracker §48 checklist):

- **S1 — Add Intent + SpatialCluster node families to the schema.** Extend `NodeKind`
  (`semanticGraph.ts:25`) with `Intent` and `SpatialCluster`; the program (bedroom count, brief)
  becomes Intent nodes, and the Private/Public/Service/Sleeping/Work zones become SpatialCluster nodes
  `CONTAINS`-linking Spaces. Additive only — existing nodes unchanged; the shipped path stays
  byte-identical.
- **S2 — Sliders → Intent nodes + INFLUENCES propagation.** Reframe the ADR-0060 sliders as Intent
  nodes whose `priority` propagates via `INFLUENCES` edges; `designParamsToScoringWeights.ts` becomes
  a *propagation function over the graph* rather than a static table (initially producing identical
  weights, to protect the Pareto-equality invariant).
- **S3 — Site / System / Performance as first-class node families.** Weave C19 site context as `Site`
  nodes (`FACES` / climate edges), MEP/structure as `System` nodes (`SERVED_BY`), and promote the
  `ObjectiveVector` axes to `Performance` nodes linked to the Spaces/Systems they measure.
- **S4 — Geometry-as-derived-projection formalised.** Move `Space.geometry.polygon`
  (`semanticGraph.ts:108`) out of the Space into a derived `Geometry` node
  (`Geometry --PART_OF--> Space`), making the Space geometry-free (GIR3) and the Geometry family an
  explicit recomputed output (GIR5).

Each stage is independently shippable and gated by the existing determinism + topo-reject invariants.

## Alternatives considered

- **Declare it already done.** Rejected — dishonest: the node families are geometry-rooted, Spaces
  carry polygons, and sliders are an external table, not Intent nodes (the (B) delta is real).
- **Rewrite the engine intent-first now.** Rejected — the engine is mature, tested, deterministic, and
  C53 §1 already mandates topology-first; an inversion is achievable additively (S1→S4) without
  discarding the solver, the objective vector, or the enforcement gates.
- **Fork a parallel intent graph beside the LayoutGraph.** Rejected — violates ADR-0058 (one unified
  building graph) and ADR-0060 ("bind, don't fork"); the IR must be the *same* graph, grown upward.

## Shipped as (provenance)

**Nothing is shipped yet — this ADR is the north-star direction (PROPOSED).** The (A) substrate it
builds on is shipped: P5 `LayoutGraph` (`tgl/semanticGraph.ts`), the semantic edge taxonomy
(`tgl/edgeTypes.ts`), the 21-axis `ObjectiveVector` (`tgl/objectives.ts`), the `accessFrom` matrix +
`§TOPO-HARD-REJECT` gate (`rules/programRules.ts`, `tgl/enumerate.ts`), the ADR-0060 living-design
sliders (`designParamsToScoringWeights.ts`), and C52/ADR-0058 (unified editable building graph).
S1–S4 are QUEUED (master-execution-tracker §48).
