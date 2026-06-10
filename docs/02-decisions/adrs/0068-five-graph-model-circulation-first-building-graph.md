# 0068 — Five-Graph Model: Circulation-First Building Graph

**Status**: PROPOSED
**Date**: 2026-06-10
**Deciders**: architecture team (founder-driven — *"The Living Graph is too messy. Split it into five
distinct graphs with a dropdown to switch between them. The Circulation Graph is the master — the
source of truth that drives everything."*)
**Related contracts**: [C52 — Editable Building Graph](../contracts/C52-EDITABLE-BUILDING-GRAPH.md),
[C53 — Generative Layout Engine Architecture](../contracts/C53-GENERATIVE-LAYOUT-ENGINE-ARCHITECTURE.md) (§1 topology-before-geometry),
[C50 — Typology Pipeline](../contracts/C50-TYPOLOGY-PIPELINE.md), [C19 — Site Model & Parcel](../contracts/C19-SITE-MODEL-AND-PARCEL.md)
**Related ADRs**: [ADR-0067](./0067-graph-ir-intent-first-building-graph-bim3.md) (Graph-IR / intent-first — *this ADR concretizes 0067's `intent→spatial` SEPARATED_FROM / ACCESSIBLE_VIA / ADJACENT edge taxonomy for residential, as five user-facing graph VIEWS*), [ADR-0066](./0066-access-graph-first-generative-layout-doctrine.md) (access-graph-first doctrine — the immediate antecedent of "circulation/access drives geometry"), [ADR-0058](./0058-unified-building-graph.md) (one UBG; specialised graphs are PROJECTIONS — the five graphs are five projections, not five stores), [ADR-0061](./0061-building-graph-bidirectional-edit-substrate.md) / [ADR-0062](./0062-layout-engine-deterministic-graph-solver.md) (determinism)
**Related SPECs**: [SPEC-LIVING-BUILDING-GRAPH](../../03-execution/specs/SPEC-LIVING-BUILDING-GRAPH.md), [SPEC-ACCESS-GRAPH-AND-SPATIAL-GRAMMAR](../../03-execution/specs/SPEC-ACCESS-GRAPH-AND-SPATIAL-GRAMMAR.md)
**Strategy docs**: PRYZM-BUILDING-GRAPH-AND-RELATIONAL-AI-FOUNDATION, GENERATIVE-LAYOUT-WORLD-MODEL-STRATEGY (the GRAPH.* unified-building-graph line)
**Context docs**: master-execution-tracker §47 (access-graph) + §48 (Graph-IR) + §49 (this work).

## Context

The Living Graph (`apps/editor/src/ui/living-graph/`) currently renders **one dense relationship
network**: a ~15-room plan produces 80+ edges because every relationship class — physical adjacency,
desired adjacency, circulation, privacy/acoustic separation, floor hierarchy, plumbing/wet-stack — is
mixed into a single graph and shown at once (the five `EdgeLayer` toggle chips are all on by default,
and each edge carries every layer it participates in). The founder's diagnosis, captured faithfully:

> *"An optimizer can't tell 'must connect' from 'should be near' from 'should NOT be near' from
> 'people move through here.' Split it into five graphs, and make the **Circulation Graph the master —
> the source of truth that drives everything**."*

The founder's **five distinct graphs**:

1. **Circulation Graph** *(master)* — walkable routes; sparse (~15 rooms ≈ 18–25 edges, NOT 80+).
   Entrance→Hall→Living→Dining→Kitchen; Hall→Stair→Landing→{B1,B2,B3}.
2. **Access Graph** — "how do I reach this room?": depth / privacy / route-length / visibility from
   the entrance.
3. **Functional Adjacency Graph** — Kitchen↔Dining, Living↔Dining, Master↔Ensuite; weights 0.95
   must-touch / 0.75 preferred / 0.25 optional.
4. **Separation Graph** *(currently missing)* — negative relations: Master‑‑X‑‑Living,
   Bathroom‑‑X‑‑Dining, Bedroom‑‑X‑‑Entrance.
5. **Service Graph** — wet-area clustering (Kitchen | Bathroom | Ensuite) for plumbing/stacking/MEP
   only; must NOT influence circulation.

Plus **node roles** — `ENTRY / CIRCULATION / PUBLIC / SEMI_PRIVATE / PRIVATE / SERVICE / VERTICAL` —
with rules (e.g. **PRIVATE cannot connect directly to ENTRY**); **graph metrics** — betweenness
centrality (Hall high = good, Dining high = bad), privacy depth (distance from entrance), circulation
efficiency (avg shortest path), room-hub penalty (Bedroom/Bathroom degree > 3 penalised; Hall > 5 /
Landing > 4 rewarded); and a **source-graph hierarchy inversion**: HOUSE → Circulation → {Access,
Adjacency, Service} → Geometry Solver, replacing the usual Rooms → Adjacency → Geometry → Corridors.

### The honest A/B split — what already exists vs. what genuinely changes

A full read of the Living Graph (`livingGraphSchema.ts`, `livingGraphData.ts`, `LivingGraphOverlay.ts`,
`LivingGraphCanvas.ts`, `forceSimulation.ts`) and the engine (`tgl/semanticGraph.ts`, `tgl/edgeTypes.ts`,
`rules/programRules.ts`) establishes that **PRYZM already has most of the relationship MACHINERY — but
framed as five environmental/physics layers, not the founder's five intent-graph VIEWS, and with no
Separation graph at all.** Honest ledger:

#### (A) ALREADY-BUILT — do not claim PRYZM lacks these

1. **A five-layer relationship model already exists.** `EdgeLayer = adjacency | circulation |
   environmental | acoustic | structural` (`livingGraphSchema.ts:32-37`), with `EDGE_LAYERS`,
   per-layer colour (`EDGE_LAYER_COLOUR:146`), per-layer dash (`LivingGraphCanvas.ts` `LAYER_DASH:44`),
   toggle chips (`LivingGraphOverlay.ts` `buildChips`), and **per-layer springs** in the force sim
   (`forceSimulation.ts` `edgeActive:152` + `activeLayerCount:160`, summed in `simulateStep:243-259`).
   A single `GraphEdge` carries **every layer it participates in** (`GraphEdge.layers:108`).
2. **A typed engine LayoutGraph with a semantic edge taxonomy.** The P5 `LayoutGraph`
   (`tgl/semanticGraph.ts:46-50`) is a persistent typed graph; `tgl/edgeTypes.ts:33-50` classifies
   `SOCIAL_FLOW / INTIMATE_ACCESS / BUFFER / SERVICE_ACCESS / CEREMONIAL_THRESHOLD / VISUAL_CONNECTION
   / ACOUSTIC_SEPARATION` (`classifyEdge:76-99`) from privacy tiers + open/door — the typed edges that
   can feed each named graph.
3. **The privacy gradient + access doctrine are ENFORCED, not just drawn.** `programRules.ts` carries a
   per-room `privacy` class (`public/private/circulation/service`, `:136`) and an `accessFrom` matrix
   (`:200-203`, per-type rows `:262`+); `doorAllowedBetween(a,b)` (`:739-741`) is THE rule that forbids
   illogical doors, enforced by the `§TOPO-HARD-REJECT` gate (`tgl/enumerate.ts`).
4. **Circulation-as-anchor is already a doctrine.** ADR-0066 (access-graph-first) + the 21-axis
   `ObjectiveVector` (`tgl/objectives.ts`) already score circulation, privacy-depth hierarchy,
   arrival-sequence, entry-sightline — the founder's optimizer penalty/reward list, mostly encoded.
5. **One UBG, specialised graphs as projections.** ADR-0058 + C52: the Living Graph is already a
   read-only projection of the cached UBG (`livingGraphData.ts buildLiveGraph:278` reads
   `window.__pryzmBuildingGraph`).

#### (B) GENUINE DELTA — the five-graph reframe (this is the real new work)

1. **The five layers are the WRONG five.** Today's layers are `adjacency / circulation / environmental
   / acoustic / structural` — a physics/environmental decomposition. The founder wants
   `Circulation(master) / Access / Adjacency / Separation / Service` — an **intent/route**
   decomposition. Mapping: `circulation→Circulation`, `adjacency→Functional Adjacency`,
   `structural(wet/service clustering)→Service`. **`environmental`(sun) and `acoustic` are NOT in the
   founder's five** (they fold into Separation / become metrics), and **`Access` + `Separation` are
   genuinely new**.
2. **The Separation graph does not exist.** There is no negative "should-NOT-touch" relation anywhere
   in the Living Graph. The closest is the `acoustic` layer's loud↔quiet *spring* (`livingGraphData.ts
   augmentEdges:378-386`), which is a physics push-apart, not a declared negative relation derived from
   the privacy gradient (Bedroom‑‑X‑‑Entrance).
3. **The graphs are shown ALL AT ONCE (toggles), not ONE AT A TIME (a chosen view).** The chips let you
   turn layers on/off independently → the dense tangle the founder is reacting to. There is no notion
   of "the graph you are currently looking at", nor a master.
4. **Circulation is not the SOURCE OF TRUTH that drives generation.** It is one of five co-equal layers
   in a VIEW. The engine pipeline is still `program → bubbleGraph → subdivide → geometry`
   (rooms→adjacency→geometry→corridors), the *opposite* of the founder's HOUSE → Circulation →
   {Access, Adjacency, Service} → Geometry inversion (this is the big, engine-side delta — ADR-0066's
   doctrine, not yet the literal pipeline order).
5. **Node roles + graph metrics are not computed.** Nodes carry a functional `RoomKind`
   (`living/sleeping/service/wet/circulation/entry/unknown`, `livingGraphSchema.ts:53`) but **no**
   `ENTRY/CIRCULATION/PUBLIC/SEMI_PRIVATE/PRIVATE/SERVICE/VERTICAL` role, and there is **no**
   betweenness/privacy-depth/efficiency/hub-penalty metric panel.

**So: the founder's model is neither already-done nor absent.** PRYZM has five relationship layers,
per-layer springs, a typed semantic edge taxonomy, the enforced privacy/access matrix, and the
circulation-anchor doctrine. The genuine delta is **(i) reframing the five layers as the five NAMED
graphs**, **(ii) adding the missing Separation graph**, **(iii) a one-at-a-time DROPDOWN with
Circulation as master/default instead of all-on toggles**, **(iv) node roles + role-rules**, **(v) a
graph-metrics panel**, and **(vi) the big one — making Circulation the generation source-of-truth (the
pipeline inversion)**.

## Decision

**Adopt the Five-Graph, Circulation-First model as the structure of the building graph's relational
surface.** The five graphs are five **projections of the one UBG** (ADR-0058), not five stores, and
the **Circulation graph is the master** (default view, and — at maturity, S5 — the source of truth the
geometry solver is driven from). Six binding sub-decisions:

**FG1 — Five named graphs, one shown at a time.** The relational surface is exactly five views —
`Circulation (master) · Access · Functional Adjacency · Separation · Service` — and the user picks
**one** via a dropdown. The dense all-layers-on network is retired as the default presentation. Each
view renders ONLY its own (sparse) edge set.

**FG2 — Circulation is the master.** Circulation is the default selection and the conceptual root of
the source-graph hierarchy: **HOUSE → Circulation → {Access, Adjacency, Service} → Geometry Solver**,
inverting the legacy Rooms → Adjacency → Geometry → Corridors order (the literal engine inversion is
staged work — S5).

**FG3 — Separation is a first-class graph.** The missing negative graph is added, derived from the
privacy gradient: PRIVATE (bedroom/wet) ‑‑X‑‑ PUBLIC (living/kitchen) and ‑‑X‑‑ ENTRY relations. It
renders as a visually-distinct (red) "keep-apart" edge set, never as a "connect-these" edge.

**FG4 — Node roles.** Every node carries an architectural role drawn from
`ENTRY / CIRCULATION / PUBLIC / SEMI_PRIVATE / PRIVATE / SERVICE / VERTICAL`, derived from its
`RoomKind` + privacy class, with role-rules enforced (PRIVATE may not connect directly to ENTRY).
*(Staged — S3.)*

**FG5 — Graph metrics.** The graph computes + surfaces betweenness centrality (Hall high = good,
Dining high = bad), privacy depth (distance from entrance), circulation efficiency (avg shortest
path), and the room-hub penalty/reward (Bedroom/Bathroom degree > 3 penalised; Hall > 5 / Landing > 4
rewarded). *(Staged — S4.)*

**FG6 — Projections, not a fork.** Per ADR-0058 the five graphs are derived views over the single UBG;
no parallel graph store. The existing typed engine edges (`tgl/edgeTypes.ts`) and the `accessFrom`
matrix are the data sources the projections read — the five graphs do not invent new truth, they
*disambiguate* the existing relations into separate, legible lenses.

## Consequences

- **Positive — legibility for both the optimizer and the eye.** A single dense network becomes five
  sparse, single-purpose graphs. "Must connect" (Adjacency), "people move through here" (Circulation),
  "reach-from-entrance" (Access), "must NOT touch" (Separation) and "shares a riser" (Service) are no
  longer conflated.
- **Positive — names the missing relation.** Separation makes negative constraints *visible*, the
  pre-condition for treating them as first-class generation constraints later (ties to ADR-0067's
  `SEPARATED_FROM` edge + `hard` flag).
- **Positive — the natural concretization of ADR-0067 for residential.** 0067's abstract 9-edge
  taxonomy (`ADJACENT / SEPARATED_FROM / ACCESSIBLE_VIA / SERVED_BY …`) becomes five concrete,
  user-facing graphs: Adjacency ⊂ `ADJACENT`, Separation ⊂ `SEPARATED_FROM`, Access ⊂ `ACCESSIBLE_VIA`,
  Service ⊂ `SERVED_BY`, Circulation = the route spine.
- **Determinism preserved.** The projections are pure functions of the UBG + the (deterministic)
  privacy/access rules; the force sim is unchanged (ADR-0061/0062 invariants hold).
- **Honest scope.** The dropdown + the Circulation/Adjacency/Service mapping + the **new Separation
  graph** ship now (S1+S2, this slice). Access (entrance-rooted route/depth solver), node roles, the
  metrics panel, and the generation source-of-truth inversion are **staged, not done**.
- **Cost / staging.** S5 (Circulation drives geometry) is a substantial engine change touching D-TGL +
  bubbleGraph + the enumerate gate; it is a north-star, executed after the cheap presentation slices.

## Migration — staged, additive

Mirrored as the master-tracker §49 checklist:

- **S1 — Reframe the five layers → five named graphs + add Separation.** Add the `GraphView` vocabulary
  + `GRAPH_VIEW_LAYER` mapping to the schema; derive Separation edges from the privacy gradient in the
  binder. *(SHIPPED in this slice.)*
- **S2 — The dropdown UI.** Replace the all-on layer chips with a single-select dropdown (Circulation
  default/master); the canvas renders only the selected view's edges. *(SHIPPED in this slice; Access
  stubbed "(soon)".)*
- **S3 — Node roles + role-rules.** Derive `ENTRY/CIRCULATION/PUBLIC/SEMI_PRIVATE/PRIVATE/SERVICE/
  VERTICAL` per node + enforce "PRIVATE may not connect directly to ENTRY". *(NEW.)*
- **S4 — Graph-metrics panel.** Betweenness, privacy depth, circulation efficiency, hub penalty/reward.
  *(NEW.)*
- **S5 — Circulation as the generation source-of-truth (the pipeline inversion).** HOUSE → Circulation
  → {Access, Adjacency, Service} → Geometry; the big engine-side change. *(NEW — north-star.)*

## Alternatives considered

- **Keep the all-on layer chips, just rename them.** Rejected — does not address the founder's actual
  complaint (the dense conflated network); renaming five toggles still shows five tangled layers at
  once.
- **Build five separate graph stores.** Rejected — violates ADR-0058 (one UBG; specialised graphs are
  projections) and ADR-0060 ("bind, don't fork"). The five graphs are five lenses on one truth.
- **Drop `environmental`/`acoustic` entirely.** Rejected — they remain useful (sun halo, acoustic ring,
  and acoustic feeds Separation). They are demoted from top-level VIEWS to a metric/derivation, not
  deleted.

## Shipped as (provenance)

**S1 + S2 SHIPPED in this slice** (uncommitted at authoring): the `GraphView` model + per-view layer
mapping + Separation derivation (`livingGraphSchema.ts`, `livingGraphData.ts` `separationWeight`), the
two new `access`/`separation` edge layers (colour/dash), and the five-graph **dropdown** replacing the
layer chips (`LivingGraphOverlay.ts` `buildGraphSelector` / `setView`). **S3–S5 are QUEUED**
(master-execution-tracker §49). The (A) substrate it builds on is shipped: the five-layer Living Graph
+ per-layer springs, the typed `tgl/edgeTypes.ts` taxonomy, the `accessFrom` matrix +
`§TOPO-HARD-REJECT` gate, ADR-0058/0066/0067.
