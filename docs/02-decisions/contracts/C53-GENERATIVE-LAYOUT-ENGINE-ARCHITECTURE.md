# C53 — Generative Layout Engine Architecture

> **Stamp**: 2026-06-08 · **Status**: CANONICAL (DRAFT — ratifying the AS-IS→TO-BE architecture)
> **Authority**: `01-strategy/product-vision.md` and `01-strategy/architecture.md` supersede this
> contract on conflict; this contract supersedes the SPECs it governs.
> **Scope**: the architecture, layering, determinism, data contracts, variant strategy, scoring, and
> the UI-intent boundary of PRYZM's **deterministic generative residential layout engine** — and the
> binding **separation of Topological Graph Logic from Geometric Solvers**.

**Governs:** [SPEC-TGL-DETERMINISTIC-LAYOUT-ENGINE](../../03-execution/specs/SPEC-TGL-DETERMINISTIC-LAYOUT-ENGINE.md)
(the engine) · [SPEC-APARTMENT-LAYOUT-GENERATOR](../../03-execution/specs/SPEC-APARTMENT-LAYOUT-GENERATOR.md)
(the workflow) · [SPEC-LAYOUT-ALGORITHM-MASTER](../../03-execution/specs/SPEC-LAYOUT-ALGORITHM-MASTER.md)
(the orchestration ruler) · the founder **Room Layout Engine SPEC v3.0** (normative rules).
**Governed by / cross-refs:** [C09](C09-AI-AND-VISIBILITY-INTENT.md) (AI/generative L7.5) ·
[C11](C11-ELEMENT-CREATION-PIPELINE.md) · [C15](C15-HOSTED-ELEMENT-CONTRACT.md) ·
[C16](C16-COMMAND-AUTHORING-PROTOCOL.md) · [C19](C19-SITE-MODEL-AND-PARCEL.md) (SiteContext) ·
[C21](C21-CLIMATE-INGESTION.md) · [C50](C50-TYPOLOGY-PIPELINE.md) · [C52](C52-EDITABLE-BUILDING-GRAPH.md)
(editable graph) · ADR-0061 (determinism substrate) · ADR-0055 (wall-junction resolver).
**Strategy:** [GENERATIVE-LAYOUT-WORLD-MODEL-STRATEGY](../../01-strategy/GENERATIVE-LAYOUT-WORLD-MODEL-STRATEGY.md).

---

## §1 — The binding principle: separate Topology from Geometry

> **L-PRINCIPLE (merge-blocking):** the layout engine MUST keep **Topological Graph Logic** (rooms,
> adjacencies, privacy, program — *no physical dimensions*) strictly separate from **Geometric
> Solvers** (rectangles, walls, coordinates). The topology graph is the source of truth; geometry is
> a **projection** of it. No stage may let a UI value, a coordinate, or a wall position mutate the
> topology graph's *structure* — and no topology rule may hard-code an absolute coordinate.

The single largest class of early-stage layout failures (layout breaks, infinite loops, frozen UI on
a slider drag) comes from a **unified computational layer** where geometry, structural rules, and UI
values are intertwined, so any change regenerates everything from scratch and corrupts state. PRYZM
avoids this by construction. Four invariants make L-PRINCIPLE enforceable:

- **L1 — Topology is dimensionless.** The bubble/semantic graph (`buildBubbleGraph`) carries
  room *relationships, area TARGETS and minima* — never placed coordinates. (Matches v3.0 §5 / the
  founder C53-input §2.)
- **L2 — Geometry is a pure projection.** The geometric solver (`subdivide` → rooms → walls) is a
  **pure function** of (graph, plate, stair-keepout). Same inputs → byte-identical geometry
  (ADR-0061). Geometry never writes back into the graph.
- **L3 — Sliders are INTENT, never dimensions.** A UI control modifies a **relative weight,
  proportion, or priority** on the graph (`EngineTuning`), never an absolute metre value on a wall.
  This is the fix for the slider-reactivity bug (§6).
- **L4 — Edits flow graph→geometry, one direction at author time.** An edit changes a graph node;
  the engine re-projects geometry (C52 editable graph). The reverse (drag a wall → update the graph)
  is a *separate, explicit* reconciliation, never an implicit coupling.

These extend the 8 platform principles (P1–P8, C01); L-PRINCIPLE is the layout-domain principle.

---

## §2 — AS-IS (current state, honestly)

PRYZM **already implements the right shape** (D-TGL is a deterministic topological→geometric engine —
SPEC-TGL), but with three classes of defect that L-PRINCIPLE + the TO-BE pipeline (§3) close:

1. **Topology↔geometry leakage at the editor seam (the dominant failure).** The ai-host engine emits
   correct topology+geometry, but the editor's `WallJoinResolver` (a geometric stage) mutated wall
   positions in a way that *merged the engine's separate rooms* (the "Living/Kitchen/Dining/Hall
   259.8 m²" blob — G1). Root: a geometric solver trimming to an off-centreline consensus.
   **Fixed v70** (§CONSENSUS-ON-CENTRELINE) — geometry now stays on-axis. The contract makes
   "geometric stages must not destroy topological separateness" a *gate* (§9).
2. **Program/plate disagreement dropping rooms (G12, fixed v69).** A geometry-side area cap starved
   the topology budget → §FEASIBILITY-ALLOC dropped rooms → generic "Room" voids.
3. **Sliders not fully wired as intent (G13).** Target-area/style/master-floor sliders aren't yet
   threaded into `EngineTuning` (they should modify graph weights — L3), and some design-param
   sliders are correct but under-used. The reactivity-bug *risk* the founder describes is latent;
   L3 + §6 make it impossible by contract.

Full live state: [SPEC-LAYOUT-ALGORITHM-MASTER §7 gap map](../../03-execution/specs/SPEC-LAYOUT-ALGORITHM-MASTER.md)
(G1–G20).

---

## §3 — TO-BE: the six-tier pipeline (architecture)

A strict multi-tiered pipeline; each tier is a pure, composable, individually-testable stage over the
shared typed model. Tiers 1–3 are **topological/orchestration**; tier 4 is the **geometric solver**;
tiers 5–6 are **emission + evaluation**.

| Tier | Name | Layer | Owns | PRYZM module |
|---|---|---|---|---|
| **1** | Boundary Ingestion | topo | perimeter sanitise + classify (Convex/L/T/U) + shell-face inventory + SiteContext/GIS | `decomposeToRects` + (TO-BE) classifier + C19 SiteContext |
| **2** | Topological Resolution | **topo (dimensionless)** | brief → program → **bubble/semantic graph** (rooms, adjacency, weights — NO coordinates) | `allocateProgramToStoreys` · `enrichStoreyProgramToPlate` · `buildBubbleGraph` |
| **3** | Vertical Stack & Stair Orchestrator | topo/geom bridge | **lock the stair core + load-bearing + plumbing chases across ALL storeys FIRST**, subtract from every plate | `reserveStairCoreShaped` + keep-out subtract (`subtractRectsFromRects`) |
| **4** | Geometric Spatial Solver | **geom (pure projection)** | plate + graph → room boxes via **rectangular dual + squarify**, aspect/min-dim enforced | `subdivideWithReport` (carve + `squarify` + feasibility) |
| **5** | Opening & Object Emission | geom | entrance door (reserved FIRST) → internal doors → windows (climate) → furniture-fit | `entranceDoor` · `wallsAndDoors` · `windowEmission` · D-FLE |
| **6** | Evaluation, Scoring & Interfacing | scoring | Pareto rank ~21 axes → top-3 BIM variants + metrics back to UI | `objectives` · `envDrivers` · `enumerate` |

**Determinism note (vs the founder input §4 "24 variants by sampling"):** PRYZM keeps a
**deterministic enumeration** (ADR-0061). The founder's degrees-of-freedom (zone-cut ratio, corridor
orientation, open-plan, master position) are adopted as **fixed deterministic strategy dimensions**,
not random samples — same intent, byte-identical output. The three named variants (§7) are seed
configs, deterministically generated.

---

## §4 — Execution pipeline (low-level, ordered)

The canonical thread a generation (or a slider re-solve) runs, mapped to §3 tiers and the §DIAG
provenance tags (the observability surface):

1. **SiteContext + Perimeter** (T1) → straight-skeleton/depth + facade headings + solar/noise class. `§DIAG-ALLOC`
2. **Program Resolution & Targets** (T2) → typed `RoomLayoutNode[]` with `A_target`, `W_min`, aspect range. `§DIAG-ENRICH/BUBBLE`
3. **Stair Core & Shaft Lock** (T3) → reserve the vertical core on every storey *before* subdivision. `§DIAG-STAIR`
4. **Zone Cut Partitioning** (T2→T4) → Social / Private / Service bands by plan-depth + core proximity. `§DIAG-RECTS`
5. **Graph Mapping (dual-graph embedding)** (T4) → planar graph → rectangular dual (edge = shared wall).
6. **Geometric Optimisation (squarify)** (T4) → size boxes to targets within aspect bounds; feasibility drop reported. `§DIAG-BRANCH`
7. **Primary Entrance Door Allocation** (T5) → lock entrance span on the street-facing hall wall BEFORE windows. `§A.21.D29`
8. **Circulation Spine Routing** (T5) → minimum connected polyline hall→every private/service box → corridor box. `§DIAG-DOORS`
9. **Interior Openings & Furniture-Fit** (T5) → doors (matrix+caps+widths) · windows (climate) · greedy furniture pack. `§DIAG-WIN`
10. **Evaluate, Rank, Output BIM** (T6) → Pareto top-3 → parametric BIM entities + metrics. `§DIAG-WINNER`

---

## §5 — Data contract (the typed shared model)

The topology↔geometry boundary is enforced by *types*: the topology graph carries no coordinates; the
geometric output carries no free-form weights. (PRYZM's live types are the normative source; the
founder C53-input types below are the target shape they are reconciled toward.)

```typescript
// TOPOLOGY (dimensionless — Tier 2). No x/y here.
interface RoomLayoutNode {
  id: string; type: RoomType; targetArea: number; minWidth: number;
  aspectRatioRange: [number, number]; windowMandatory: boolean; assignedStorey: number;
}
interface AdjacencyEdge {
  nodeAId: string; nodeBId: string;
  weight: number;                       // -5 (forbidden) … +5 (mandatory) — SIGNED (extends preferenceBetween)
  connectionType: 'door' | 'open-threshold' | 'shared-wall';
}
interface SemanticLayoutGraph {         // the master topology schema → geometric solver
  nodes: RoomLayoutNode[]; edges: AdjacencyEdge[];
  stairLocationLocked: { min: Vector2D; max: Vector2D };   // the ONLY coordinate in the topology — the locked core
}

// GEOMETRY (projection — Tiers 4-6). Coordinates live ONLY here.
interface ParametricBIMElement {
  id: string; type: RoomType; storey: number; geometryPolygon: Vector2D[];
  doors:   Array<{ position: Vector2D; width: number; targetRoomId: string }>;
  windows: Array<{ position: Vector2D; width: number; area: number }>;
  isValid: boolean;
  scoreMetrics: { circulationEfficiency: number; daylightFactor: number; acousticSeparation: number };
}
```

**Reconciliation tasks (TO-BE):** (a) extend PRYZM's `preferenceBetween` from `[0,1]` to **signed
`[-5,+5]`** to support forbidden/penalty edges (v3.0 §5 bedroom↔kitchen −2); (b) add `connectionType`
to the adjacency model; (c) surface `scoreMetrics` per element to the UI (C52/inspect). Schemas live
in `packages/schemas` (P5 pure).

---

## §6 — Determinism + the slider-as-intent invariant (the reactivity fix)

> **L3 (binding):** a UI slider/control MUST modify a **relative weight, proportion, or priority** on
> the topology graph (a field of `EngineTuning`), NEVER an absolute geometric dimension. Re-solving
> from a changed weight is a pure, deterministic re-projection — it cannot break the structural plan.

| Control (UI intent) | What it modifies in the engine (NOT geometry) |
|---|---|
| Living vs Sleeping priority | area-allocation `A_target` modifier in Program Resolution (T2) |
| Privacy sensitivity | the (signed) acoustic edge weights in the bubble graph (T2) |
| Glazing aperture scale | target window-to-wall ratio in the climate opening module (T5) |
| Openness index | an adjacency edge's `connectionType`: `shared-wall` ↔ `open-threshold` (T2) |

Because the change is a graph weight, the geometric solver (T4) re-runs as a **pure function** and
the plan updates smoothly — no hard-coded metre value to break when the shell changes. This is the
architectural cure for "slider overwrites a wall dimension → layout breaks / freezes". Determinism
(ADR-0061: no `Math.random`, fixed strategy order, byte-identical) makes the re-solve safe to run on
every slider tick (debounced).

---

## §7 — Three deterministic variants (seed strategies)

Exactly three *distinct, functional* options (not near-duplicates), generated from three deterministic
seed configurations of the topology + zone-cut:

- **A — Core-Centric / Integrated Spine (efficiency):** stair adjacent to the entrance hall;
  open-plan kitchen↔living; corridor area forced < 6 % of plan.
- **B — Perimeter-Spread / Zonal (privacy):** social on one wing/floor, private on another; spine
  along the interior core wall; higher private↔social edge penalties → max separation, all rooms on
  the perimeter for daylight.
- **C — Courtyard / Deep-Split (amenity):** BSP deep-split toward outdoor features; kitchen as a
  standalone buffer between public and private.

Each runs the full §4 pipeline deterministically and is Pareto-ranked (§8). (Implementation: these
map to the existing 8-strategy enumeration + the new DOF dimensions — they are *labels over*
deterministic strategies, not random seeds.)

---

## §8 — Multi-objective Pareto scoring

`TotalScore = Σ Wᵢ·Sᵢ` over a Pareto-non-dominated set (no single weighted scalar wins; the front is
surfaced — the option modal). The three headline axes the founder names, mapped to PRYZM's ~21-axis
vector:

1. **Circulation efficiency** — Dijkstra shortest-path hall→every space; long corridors/dead-ends
   score low (→ the D-PROX walking-distance axis, G6).
2. **Acoustic privacy** — wet/noisy walls vs bedroom walls; a bedroom↔kitchen/living shared partition
   tanks it (→ `acousticZoningScore`, signed edges).
3. **Environmental orientation** — bedrooms vs noise bearing; living windows vs solar axis from
   climate (→ `solarOrientationScore` + climate, C21).

Ties broken by fixed strategy order (determinism). Scores are explainable via `§DIAG-WINNER`.

---

## §9 — Enforcement (CI gates — make L-PRINCIPLE real)

The contract is binding only if checkable. Gates (to add to `tools/ga-gate/` / `scripts/`):

1. **Determinism gate** — a golden test: same (graph, plate, solar) → byte-identical geometry
   (extends the ai-host determinism suite; ADR-0061).
2. **Topology-purity gate** — the bubble/semantic graph types carry **no coordinate fields** (a type
   + lint check on `RoomLayoutNode`/`AdjacencyEdge` — no `x/y/position` except the locked core).
3. **No-merge gate** — a generation test asserting the editor's geometric stages do not reduce the
   engine's room count (locks G1 / §CONSENSUS-ON-CENTRELINE — the cornerFlush regression test is the
   seed; extend to a full-plate generation test).
4. **Slider-intent gate** — a check that UI controls write only to `EngineTuning` weights, never to a
   wall/room dimension command (audit `gatherLayoutPayload`).
5. **Acceptance suite** — the v3.0 §19 criteria as a single pass/fail gate with §DIAG provenance.

---

## §10 — Relationship map

- **Vision/strategy:** GENERATIVE-LAYOUT-WORLD-MODEL-STRATEGY (the world-model living-graph thesis +
  competitor benchmark + roadmap).
- **Rules (normative):** Room Layout Engine SPEC v3.0 (per-element rules, climate, acoustic, validation).
- **Orchestration:** SPEC-LAYOUT-ALGORITHM-MASTER (the live pipeline + gap map + §DIAG surface).
- **Engine:** SPEC-TGL (the deterministic P1–P9 algorithm); LAYOUT-GENERATION-ALGORITHM (code walkthrough).
- **Context:** C19 SiteContext · C21 climate · C50 typology · C52 editable graph.
- **This contract (C53):** the *architecture & layering* that binds them — the topology/geometry
  separation, the tiers, the data contract, determinism, slider-intent, variants, scoring, gates.

---

## §11 — AS-IS → TO-BE migration (the required execution steps)

Ordered; each step is verifiable and preserves determinism. (Detailed per-step plan to be expanded in
`docs/03-execution/plans/` per the founder instruction "document the execution steps after the
architecture + contracts".)

| # | Step | Tier | Status |
|---|---|---|---|
| M0 | Structural correctness: geometric stages must not destroy topology (no-merge) | T4/editor | §CONSENSUS-ON-CENTRELINE **done v70**; gate §9.3 pending |
| M1 | Program↔plate agreement (no starved drops) | T2/T3 | §AREA-AGREEMENT + §STAIR-FRAGMENT **done v69** |
| M2 | Slider-intent wiring: all UI controls → `EngineTuning` weights (signed edges) | UI/T2 | **TO-DO** (G13) — the reactivity cure (§6) |
| M3 | Constructive frontage swap → every habitable room on shell + windowed | T4/T5 | **TO-DO** (G11) — v3.0 §12 |
| M4 | Graph-metric scoring: D-PROX walking-distance + bedroom solar + acoustic as Pareto axes | T6 | partial→**promote** (G6/§14/§6) |
| M5 | SiteContext + climate ingestion (Köppen/WWR/cross-vent) feeding scoring | T1/T5 | **TO-DO** (G14-G20) — C19/C21 |
| M6 | Three named deterministic variants (A/B/C) + Pareto front surfaced | T6 | partial→**label + DOF dims** |
| M7 | Validation taxonomy (FATAL/VIOLATION/WARNING) + acceptance suite gate | T6 | **TO-DO** (v3.0 §§18,19) |
| M8 | Furniture-fit as a pre-rank validity gate | T5/T6 | **TO-DO** (v3.0 §16) |
| M9 | CI gates (§9) wired merge-blocking | CI | **TO-DO** |

> M0–M1 are shipped. M2 (slider-intent) is the next highest-leverage step — it closes the
> reactivity-bug class the founder flagged AND unlocks the smooth-refine UX (§6 / the user journey).
