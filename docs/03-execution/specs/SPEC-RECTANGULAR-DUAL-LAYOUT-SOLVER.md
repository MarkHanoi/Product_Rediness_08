# SPEC — Rectangular Dual-Graph Layout Solver (Tier-4 geometric solver upgrade)

| Field | Value |
|---|---|
| Status | **DRAFT — normative target.** Documentation-complete; not yet implemented. |
| Version | 0.1 (2026-06-08) |
| Owner | Computational design / layout engine |
| Governed by | [C53 §3/§12 D2](../../02-decisions/contracts/C53-GENERATIVE-LAYOUT-ENGINE-ARCHITECTURE.md) · [ADR-0062 D2](../../02-decisions/adrs/0062-layout-engine-deterministic-graph-solver.md) · [SPEC-TGL](SPEC-TGL-DETERMINISTIC-LAYOUT-ENGINE.md) (the engine it upgrades) · ADR-0061 (determinism) |
| Hard constraints | **Deterministic** (byte-identical), **synchronous in-browser < 2 s**, **no `Math.random`**, **pure** (L2 of `packages/geometry-kernel` or `packages/ai-host` tgl), **graph-edge ⇒ shared-wall guaranteed by construction**. |

> **Why this SPEC exists.** PRYZM's current Tier-4 solver (`subdivideWithReport` → `tryCarveCorridor`
> + `squarify` + `packMultiRect`) is **top-down slicing**: it sizes rectangles by area but **cannot
> guarantee that two rooms adjacent in the bubble graph actually share a wall**. That non-guarantee is
> the root of the adjacency failures (a planned hall↔living wall that never materialises) and the
> "broken sliders" feel. A **bottom-up rectangular dual** of a maximal planar embedding guarantees, by
> construction, that *every bubble-graph edge becomes a shared partition*. This is ADR-0062 D2 — the
> deepest TO-BE upgrade.

## §1 — Algorithm

**Name:** Rectangular Dual via Regular Edge Labeling (REL) / Schnyder-realizer floorplanning.
**Input:** a `SemanticLayoutGraph` (C53 §5) — nodes (rooms, target areas, min-dims, aspect range) +
**positive** adjacency edges (negatives already resolved at the zonal-cut phase, ADR-0062 D3) — and a
rectangular plate (one zone band, post stair-keepout).
**Output:** one axis-aligned rectangle per node, tiling the plate, where **every graph edge corresponds
to a shared wall segment** (the rectangular dual property).

Pipeline (each step pure + deterministic):
1. **Triangulate to a maximal planar graph.** Add the 4 outer "wall" nodes (N/E/S/W); make the
   adjacency graph internally triangulated (a *properly triangulated planar graph*, PTPG). Deterministic
   edge-completion order (by node id).
2. **Compute a Regular Edge Labeling (REL) / Schnyder realizer.** A REL 2-colours the inner edges into
   two directed trees (T1/T2) such that each interior vertex has the canonical N/E/S/W edge pattern.
   Deterministic canonical REL (the *minimum* REL in the distributive lattice — unique, reproducible).
3. **Derive the rectangular dual.** From the REL, compute each room's [x0,x1]×[z0,z1] via the two
   topological orders (T1 → x-coordinates, T2 → z-coordinates). This yields a *dimensionless*
   combinatorial floorplan: the adjacency structure is now geometric.
4. **Size to area targets (in-cell squarify).** Solve the rectangle widths/heights to meet each room's
   `targetArea` within its `aspectRatioRange` and `minWidth`, as a deterministic constrained
   adjustment over the dual's grid lines (a linear pass per grid coordinate — NOT a re-slice). Keep the
   existing `squarify` only as the *intra-cell* sizing primitive.
5. **Feasibility + report.** If a room cannot meet its hard minimum within the dual, emit a
   `droppedRooms` entry (existing §FEASIBILITY-ALLOC contract) — never silently.

## §2 — Guarantees (the contract)

- **G1 — Adjacency fidelity:** `edge(A,B) ∈ graph ⇒ rooms A,B share a wall segment` (by construction of
  the dual). This is the property slicing cannot provide.
- **G2 — Tiling:** rooms exactly partition the plate (no gaps/overlaps) — eliminates the gap-then-merge
  class at the source (complements the editor-side §CONSENSUS-ON-CENTRELINE fix).
- **G3 — Determinism:** the canonical REL is unique → byte-identical output for identical input
  (ADR-0061). A golden test pins it.
- **G4 — On-axis:** all walls axis-aligned in the plate-local frame; rotation applied once at projection.

## §3 — Integration & staging

- **Where:** a new pure module (`packages/ai-host/src/workflows/apartmentLayout/tgl/rectangularDual.ts`
  or a new `geometry-kernel` unit) called by `subdivideWithReport` for the single-rect / dominant-rect
  carve path, **behind a flag** (`window.__pryzmDualSolver` / an `EngineTuning` opt-in), exactly as the
  ADR-0055 wall-pipeline V2 was staged.
- **Fallback:** when no valid rectangular dual exists (non-PTPG / dense degenerate graphs) OR the flag
  is off, fall through to the EXISTING `tryCarveCorridor`+`squarify`+`packMultiRect` path verbatim —
  so absent-flag is byte-identical to today (no regression, ADR-0061).
- **Corridor:** the corridor remains a first-class node in the graph (it must share a wall with every
  private/service room — §EVERY-ROOM-ACCESS). The dual makes this a *graph constraint* (corridor has
  an edge to each served room) rather than a post-hoc carve.

## §4 — Test obligations

1. **Adjacency-fidelity test:** for a battery of bubble graphs, assert every graph edge → a shared wall
   in the dual output (G1). This is the test slicing fails.
2. **Determinism golden:** same graph+plate → byte-identical rectangles (G3).
3. **Tiling test:** rooms partition the plate, sum of areas = plate area, no overlaps (G2).
4. **Fallback byte-identity:** flag OFF → output identical to the current `subdivide` (no regression).
5. **Feasibility report:** over-program → `droppedRooms` populated, never silent.

## §5 — Relationship

Upgrades **SPEC-TGL §P5** (subdivision). Governed by **C53 §12 D2** + **ADR-0062**. Consumes the
signed-weights-resolved-at-zonal-cut output (ADR-0062 D3). Its guarantee (G1/G2) is the *constructive*
complement to the editor-side **§CONSENSUS-ON-CENTRELINE** fix (which repairs geometry the slicing path
produces); once the dual solver ships, far fewer junctions need repair because the tiling is exact.

## §6 — Open questions (resolve before implementation)
- Canonical-REL choice (min vs max of the lattice) — pick the one with a published deterministic
  construction; pin with the golden test.
- Where to host (geometry-kernel L1 pure vs ai-host tgl) — prefer **geometry-kernel** (reusable,
  L1-pure) if no ai-host-only types leak in.
- Performance on 10+ room graphs (REL is O(n) but the area-sizing LP must stay < 2 s) — bench before GA.
