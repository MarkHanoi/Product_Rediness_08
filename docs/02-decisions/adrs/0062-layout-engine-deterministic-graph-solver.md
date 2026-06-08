# ADR-0062 — Layout engine: deterministic combinatorial expansion + rectangular dual-graph solver

> **Status:** ACCEPTED (2026-06-08) · **Supersedes:** the implicit "slicing/squarify + 8-strategy"
> approach where it conflicts · **Normative form:** [C53 — Generative Layout Engine Architecture](../contracts/C53-GENERATIVE-LAYOUT-ENGINE-ARCHITECTURE.md)
> · **Context docs:** [GENERATIVE-LAYOUT-WORLD-MODEL-STRATEGY](../../01-strategy/GENERATIVE-LAYOUT-WORLD-MODEL-STRATEGY.md),
> [SPEC-TGL](../../03-execution/specs/SPEC-TGL-DETERMINISTIC-LAYOUT-ENGINE.md), ADR-0061 (determinism).

## Context

PRYZM's residential layout engine (D-TGL) is the right *shape* — deterministic, topology-first — but
an expert architecture audit (2026-06-08) of the world-model strategy, validated against Finch
(graph rules + a Cassowary-style LP solver), Forma (API-cached climate lookups, separated from the
geometry engine) and TestFit (deterministic computational geometry, never mixed with statistics),
identified seven decisions that separate a robust engine from one that produces layout failures and
slider-reactivity bugs. This ADR records them. They all reinforce the **L-PRINCIPLE** (C53 §1):
topology is truth; geometry is a pure, deterministic projection.

## Decisions

**D1 — Deterministic Combinatorial Variant Expansion (NOT sampling).** Generate variants by a finite
**strategy matrix** over discrete degrees of freedom (e.g. core position {L,C,R} × kitchen typology
{open,galley,island} × zonal-cut ratio {0.40,0.50,0.60} = 27), run *all* deterministically, keep the
top-3 by Pareto score. Random/Monte-Carlo sampling is rejected: it destroys byte-identity, breaks
undo/redo, and makes a 1 % slider tweak reorganise the whole plan. **Corollary:** a slider maps to a
*smooth transformation path across known matrix states*, not a re-roll. (Refines C53 §3/§7; consistent
with ADR-0061.)

**D2 — Rectangular Dual-Graph Geometric Solver (Schnyder Realizer / REL) is the core T4 solver.** Pure
top-down *slicing/squarify* cannot guarantee that two rooms adjacent in the bubble graph actually
share a wall — it is the root of the adjacency failures and the "feels broken" sliders. A **bottom-up
rectangular dual** of a maximal planar embedding *guarantees by construction* that every graph edge =
a shared partition. **Decision:** upgrade the T4 geometric solver to a rectangular-dual embedding;
keep squarify only as the *area-sizing* step inside each dual cell and as the documented fallback when
a valid dual does not exist (dense/degenerate graphs). This is the highest-leverage TO-BE upgrade.

**D3 — Signed adjacency weights are resolved at the ZONAL-CUT phase, not the geometric phase.** Negative
weights (e.g. bedroom↔kitchen = −2) must NOT enter a physical spring/energy embedder (spring-embedders
diverge / loop with negative weights). Instead, treat the weights as an **Adjacency Energy Matrix**
consumed during zoning (T2→T4 §4-zone cut): negative pairs are assigned to *different spatial zones* so
they can never share a dual-graph edge; positive pairs pull toward shared walls. `preferenceBetween`
extends from `[0,1]` to signed `[-5,+5]`. (Refines C53 §5.)

**D4 — Dynamic Boundary Softening (graceful degradation).** Hard gates (ZONE_VIOLATION,
ACOUSTIC_INFEASIBLE, …) MUST NOT return zero options on small/odd parcels. Run with hard gates
enabled; if no option survives, **automatically downgrade the offending rule Fatal→Violation**, ship
the best option with a diagnostic tag + visual warning ("Bedroom placed near noise source due to
narrow site"). Never an empty result. (Refines C53 §9 / the v3.0 §18 taxonomy.)

**D5 — Vertical structural stacking is a HARD constraint (not soft).** For ≥2-storey houses the stair
core + main structural boundary zones are LOCKED on the ground plate and **projected straight up
through every level before any room packaging begins**. Misaligned structural walls / plumbing stacks
on a 3-storey building are unbuildable, not a cosmetic penalty. (Promotes v3.0 §9.3 / C53 §3 from soft
to hard; wet-room plumbing-stack alignment stays soft-scored.)

**D6 — Three-tier validation severity.** `FATAL` (discard the option) · `VIOLATION` (keep, reduce
score, flag) · `WARNING` (advisory, surfaced in metadata). A single enum + acceptance suite with
`§DIAG` provenance. (Formalises v3.0 §§18-19 / C53 §9.)

**D7 — SiteContext resolved ONCE, cached as a vector field.** Köppen/PVGIS/ERA5/NOAA lookups happen
when the user sets the parcel boundary, normalised into a per-site cached **cost/exposure field** over
the polygon; the layout loop reads the local cache instantly — never a web call inside generation.
(Refines C53 §4 / v3.0 §1; aligns with C19/C21.)

**D8 — Enrichment is capped by external WINDOW-FACADE capacity, not just area (the §DIAG-revealed
runaway).** Live console trace: `enrichStoreyProgramToPlate` grew a 1-bedroom brief to **5 bedrooms +
2 baths** on a 176 m² plate purely to fill *area*, producing 10 crammed rooms → elongated tunnels.
**Decision:** the program grow-loop must stop adding habitable rooms once their mandatory windows can
no longer fit the available external shell frontage (a frontage budget), not merely when area fills.
Owning: `houseProgramFloor.enrichStoreyProgramToPlate`. (New; the over-program *mechanism* behind G12's
tunnels.)

**D4 (SHARPENED) — hard-gate FIRST, soften ONLY as last resort.** The live trace showed the engine
shipping `topologyQuality=0.00` (every candidate `topoOK=false circRouted=false`, 4 rooms sealed) via
the §CIRCULATION-REROUTE escape-hatch. The reroute is too permissive. **`topoOK` + `circRouted` are a
HARD gate**: reject `topologyQuality=0.00` whenever ANY better candidate exists; a *sealed room* is
FATAL. Dynamic softening (D4) applies ONLY when NO valid option survives across the whole matrix — then
it downgrades + tags, never silently ships garbage. (This is the highest-leverage layout fix.)

## Consequences

- **Positive:** guaranteed adjacencies (D2) fix the root layout failures; byte-identity preserved (D1,
  ADR-0061); negative weights become stable (D3); no empty results on odd sites (D4); buildable
  multi-storey (D5); stable UI (D4/D6); instant slider re-solve (D1/D7).
- **Cost:** D2 (rectangular-dual solver) is a substantial engine addition — staged behind a flag,
  squarify-fallback retained, byte-identity gated by a golden test. D5 may reduce yield on tiny plots
  (mitigated by D4 softening).
- **Determinism:** all decisions are pure/deterministic; no `Math.random`; gated-when-absent for the
  new context inputs (D7) so absent site data is byte-identical to today.

## Implementation (maps to C53 §11 migration steps)

Documentation-first, then implement subphase-by-subphase: **M2** signed schema + slider-intent (D3) ·
**M2.b** deterministic combinatorial grid (D1) · **M7** 3-tier severity + softening (D4/D6) ·
**M3/M4** frontage + graph-metric scoring · **M5** SiteContext cache (D7) · **D5** hard vertical
stacking · **D2** rectangular-dual solver (the deepest; its own SPEC). Each ships byte-identical-safe,
ai-host suite green, behind the determinism + no-merge CI gates (C53 §9).
