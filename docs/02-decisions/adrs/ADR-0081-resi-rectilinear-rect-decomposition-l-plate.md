# ADR-0080 — Residential plate: rectilinear rect-decomposition for L / concave plates

| Field | Value |
|---|---|
| Status | Accepted |
| Date | 2026-06-30 |
| Owner | Residential-building generator (`@pryzm/ai-host` workflows/residentialBuilding) |
| Supersedes | The bbox-only tile + §RESI-CLIP-BOUNDARY drop pass as the SOLE non-rectangular path |
| Spec | [SPEC-NONRECT-APARTMENTS-CORRIDOR-FIRST](../../03-execution/specs/SPEC-NONRECT-APARTMENTS-CORRIDOR-FIRST.md) |
| Contracts | C50 §1.7 (soft-fail, never throw), C53 (polygon-native engine), P8 (≥1 span / exported fn) |

## Context

Founder, 2026-06-29 (with screenshot): a **non-rectangular L-SHAPE boundary** (~1165 m² floor
plate, central core, 5 levels, T1/T2/T3 allowed, min apartment 30 m² / max 100 m²) previewed only
**3 apartments per floor**, with large empty bands and both L-wings wasted. With a 30 m² minimum
there is room for many more units.

**Root cause.** Both the orchestrator (`residentialBuildingOrchestrator.ts`) and the partition
(`platePartition.ts`) run entirely on `bb = bbox(footprint)` — the bounding RECTANGLE of the L:

1. The core is placed at the **bbox centroid**. For a concave L that centroid can land in the
   NOTCH (the missing wing), i.e. OUTSIDE the real building — so the apartments cannot ring it and
   circulation cannot reach a wing.
2. The corridor grid runs full-width across X over the **bbox**, centred on the (notch-located)
   core Z. The wing whose depth does not align with that single bbox-centred grid gets its cells'
   centres dropped by the `clipPolygon` pass.
3. There was **no rectilinear rect-decomposition** — the L was tiled as one bbox band + a clip, so
   only the band straddling the core filled (~3 units); both wings and the mid-edge bands stayed
   empty.

## Decision

Decompose the **real drawn boundary** into axis-aligned rectangles and pack each sub-rectangle with
its own corridor grid, tied to the central core, then select best-of-candidates.

**Partition (`platePartition.ts`, §RESI-RECT-DECOMP):**

- `packPlate` is parameterised by the RECTANGLE it tiles (`plate`, default `bb`) plus
  `{ spineCarve, connectorX }`. With `plate === bb` and defaults it is **byte-identical** to the
  prior bbox packer (the 46 existing partition tests pin this).
- A new `packDecomposed()` candidate decomposes `clipPolygon` via the proven rectilinear slab-sweep
  `decomposeToRects` (exact for L / T / U), subtracts the core via `subtractRectsFromRects`, and
  calls `packPlate(plate = subRect)` once **per wing**:
  - a sub-rect that CONTAINS the core packs around it with the normal core spine;
  - a sub-rect WITHOUT the core is wired to circulation by a CONNECTOR corridor column
    (`connectorX`) aligned with the core spine, carved from its rows so its doors front that
    connector;
  - a transverse band along the core Z joins the per-wing connectors + the core spine into ONE
    circulation network (every cell stays corridor-reachable — verified `reached === N`).
- The candidate enters the EXISTING best-of-candidates selection (feasible-cell count first). It is
  **safe by construction**: a rectangle decomposes to ONE rect ⇒ `packDecomposed` returns `null` ⇒
  the baseline keeps winning ⇒ no regression. It only wins on a genuinely concave plate where it
  fills every wing.

**Orchestrator (`residentialBuildingOrchestrator.ts`, §RESI-CORE-IN-BOUNDARY):**

- When the bbox-centroid core is NOT fully inside the real footprint, relocate it to the centre of
  the LARGEST decomposed sub-rectangle of the de-rotated footprint, clamped so the core fits inside
  that sub-rect. A convex / rectangular plate keeps the bbox centroid EXACTLY (byte-identical).

## Consequences

- The founder's L-plate now packs **27 units/floor** (was 3), filling both wings, every unit
  engine-feasible and reached by the corridor network (`fillRatio ≈ 0.51` of net). Target (8–12+)
  comfortably exceeded.
- Rectangular and convex plates are unchanged (all 122 residential-building tests + the new L-shape
  acceptance tests pass).
- The mechanism is general for any rectilinear concave polygon (L / T / U / staircase), not just the
  one L; the slab-sweep handles them all.

## Alternatives considered

- **Refactor the single bbox grid to be notch-aware in place** — rejected: the deeply-coupled
  `packRow` / `runsFor` / mid-edge / corner machinery is proven on rectangles; a per-wing call that
  reuses it unchanged is far lower-risk than threading concavity through every code path.
- **Move ONLY the core into the boundary and keep one grid** — insufficient: a single bbox-centred
  grid still abandons the wing whose depth does not align with it; the L needs a grid PER wing.

## Addendum — §RESI-FILL-SIDEFACADE (founder 2026-06-30): fill the SIDE plate-edge mid-edge bands

**Context.** After the rect-decomposition shipped, the founder tested a **near-rectangular
~1213 m² plate** (≈35×35 m, central core, min apartment **60 m²**) and reported the preview still
showed **only ~3 corner units**, with large empty bands **beside the central core**. Verdict:
"apartments fit the corners always — great approach — BUT they don't need to be square; rectangular
is fine, and there's still a lot of space around to fit MORE."

**Preview vs real packer — resolved.** The setup-modal preview (`residentialPlanThumbnail.ts` →
`buildResidentialPlanDescriptor`) consumes the REAL orchestrator output
(`ResidentialBuildingOk.perLevelApartments`), i.e. the actual `partitionLevelPlate` packing — it is
NOT a separate simplified path. So the under-fill is in the **packer**, not a preview mismatch.

**Root cause.** On a ~35×35 m plate the corridor grid tiles the **TOP and BOTTOM façade bands**
(4 corner + 4 mid-edge units = 8), but the **LEFT and RIGHT plate-edge façades in the central
Z-zone** — the strips between the top-corner band and the bottom-corner band, beside the core — sit
empty: the inter-corridor rows there are sub-feasible (~3–6 m) slivers, and `absorbResidual`'s
interior pockets are landlocked (no façade → the window-needing D-TGL engine produces **no layout**
and the cell soft-fails). Net: 8 units, the side mid-edge bands wasted.

**Decision (`platePartition.ts`, §RESI-FILL-SIDEFACADE).** After the corridor-grid row loop, a new
pass packs the two **side-façade bands** directly, but ONLY when they are genuinely empty:

- The central zone is bounded in Z by the corridor just ABOVE the core and the one just BELOW it.
  A full-width horizontal corridor running strictly INSIDE that zone (the core's own corridor) is
  redundant in the side X-range (side units reach the core via the vertical SPINE), so its band is
  **trimmed to the core's X-span** — eliminating the fragmenting sliver.
- Each side band hosts up to two **RECTANGULAR (elongated)** units: one hugging the plate edge and
  fronting the corridor ABOVE the zone (door + façade), one fronting the corridor BELOW. Each is
  capped at the outer-band depth, gated for engine feasibility (≥ ~7.5 m each side, area ≥ the
  demand min) and a **sane aspect ≤ 3.5:1** (the founder's "rectangular is fine … respect a sane
  max aspect"). Corner units stay roughly square; the side-band units stretch to fill.
- **Safe by construction.** The pass is gated on the side zone being EMPTY (no existing placement
  overlaps it) and every minted cell is overlap-checked against the core, placements, and corridor
  bands. On a DEEP plate the corridor grid already fills the central rows ⇒ the side zone is
  occupied ⇒ the pass is a **no-op** (no regression — all 70 partition/large-plate tests pass).

**Consequences.** The founder's ~1213 m² plate now packs **10 units/floor** (4 corner + 4 top/bottom
mid-edge + 2 side-façade), every one engine-feasible (laid out) and core-reachable — comfortably in
the 8–14 target, up from the deployed 3. The side mid-edge bands the founder saw empty now carry
rectangular apartments. Regression tests: `residentialLargePlate.test.ts` §RESI-FILL-SIDEFACADE
(founder plate ≥8 units + side-band occupied + every unit OK; a 40×30 plate yields a non-square
unit with aspect ≤ 3.5:1; an L-plate still places ≥8; determinism).
