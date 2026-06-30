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

## Addendum — §RESI-CORE-CIRCULATION (founder 2026-06-30): circulation must be CORE-CENTRIC

**Context.** With the plate now well-packed (~9–10 units/floor — corners + mid-edge + side-façade),
the founder's verdict: *"Now the layout is more exploring the gaps but **always circulation needs to
be at the core**."* In the preview circulation graph some apartments appeared chained unit-to-unit /
to a local corridor rather than EVERY apartment connecting to the **central core's** corridor cross.

**Root cause.** Fronting *some* corridor band was the only invariant (`apartmentsReached` counts a
cell that shares ≥ a door width with ANY band). But a band is not guaranteed to trace back to the
core: the §RESI-FILL-SIDEFACADE pass **trims** the mid-zone corridor to the core's X-span (so a
side-façade unit relies on the vertical SPINE reaching the core), and §RESI-RECT-DECOMP wings are
tied to the core only by a **connector column + a transverse tie band** — a small geometric gap
could leave a serving band marooned, so a unit doored onto a corridor that does NOT reach the
stair/lift. The preview graph also *assumed* every apartment was core-connected (it unconditionally
edged each node to the core hub), painting a false core-centric star even if the real layout chained.

**Decision (`platePartition.ts`, §RESI-CORE-CIRCULATION).** After best-of selection, on the WINNING
candidate's corridor network:

- **Connectivity graph + core component.** `coreConnectedBandSet` BFSes the corridor adjacency graph
  (bands are adjacent when they overlap or edge-touch with ≥ a door-width shared run), seeded by the
  bands touching the **core** → the set of bands reachable FROM THE CORE through corridors only.
- **Repair (`repairCoreCirculation`).** Any band that *serves* a placed cell (fronts its door) but is
  NOT in the core component is bridged to the core with a short **spur** (an L of corridor-width legs:
  one column at the core X-centre spanning to the core Z, one row at the stub's Z reaching the core
  spine). Re-BFS until no serving stub remains. **No-op** on a fully-connected network (a clean
  rectangular plate's full-width horizontals all already cross the core spine) → byte-identical.
- **Tag (`tagCoreReachability`).** Each cell is tagged `coreReachable` iff its door edge fronts a
  band in the (repaired) core component. The result carries `apartmentsCoreReachable` (== N on a
  well-formed plate) and the diagnostic reports `§RESI-CORE-CIRCULATION coreReached=N/N`.

**Preview graph (`residentialCirculationGraph.ts`).** Roots every **core-reachable** apartment to the
core hub (a core-centric STAR — stair/lift in the middle, apartments ringing it); a non-reachable
unit is shown **orphaned** (no core edge, `hasDirectAccess:false`) so the founder can SEE any unit
the real layout failed to connect — the graph never paints a false star.

**Consequences.** Every apartment on the founder's ~1213 m² plate (and on rectangular / deep-hybrid /
L-decomposed plates) is reachable FROM THE CORE through corridors only — no unit-to-unit-only
circulation, no marooned stub. Regression tests: `platePartition.test.ts` §RESI-CORE-CIRCULATION (an
INDEPENDENT BFS-from-core check verifies every cell's door fronts a core-connected corridor on
rect / 80×60 hybrid / 34.8² side-façade / L plates; diagnostic asserts `coreReached=N/N`;
determinism) + `residentialCirculationGraph.test.ts` (star-rooting + honest orphan rendering).

---

## §RESI-CORRIDOR-TO-CORE + §RESI-CORE-DOOR — corridor walls butt the core; doors well calculated (2026-06-30)

**Context.** On the residential building the founder marked two plan-view defects near the central
core with arrows: (1) *"the walls of the corridor should arrive **JUST to the core**"* — the corridor
did not terminate cleanly at the core; and (2) *"the door should always be **well calculated**"* — a
small room cluster by the core had a mis-placed entry door (wrong offset along its wall).

**Root cause.**
- **(1) Corridor through the core.** Horizontal corridor bands span the FULL plate width
  `[plate.x0, plate.x1]`. A band whose Z overlaps the core therefore runs STRAIGHT THROUGH the core
  rect (over the stair/lift) — the corridor overshot past the core face into its interior instead of
  butting it. (The §RESI-CORE-SPINE vertical segments were already core-clipped in Z; only the
  full-width horizontals crossed the core.)
- **(2) Door centred on the whole edge.** The executor's geometric door fallback centred the leaf on
  the WHOLE `doorEdge`. For a small core-flank / inner-strip unit whose door edge only PARTIALLY abuts
  a corridor (the rest abuts the core RC wall or a perpendicular party wall), that centre landed at a
  corner — or over the core — rather than on the wall the unit actually shares with circulation.

**Decision (`platePartition.ts`).**
- **§RESI-CORRIDOR-TO-CORE (`clipCorridorBandsToCore`).** After best-of selection, every winning
  corridor band that crosses the core is SPLIT at the core faces: a horizontal run becomes its left
  segment `[band.x0, core.x0]` and right segment `[core.x1, band.x1]` (each keeping the band's Z), so
  each corridor wall terminates EXACTLY on the core's X-face — no gap, no overshoot, no stub inside the
  core. (A vertical band is split at the core's Z-faces.) Both segments still BUTT the core, so the
  §RESI-CORE-CIRCULATION graph is preserved (the spine bridges them across the core lobby). A plate
  whose bands never cross the core is byte-identical. Runs BEFORE the repair/tag passes.
- **§RESI-CORE-DOOR (`computeCoreDoorPlacement`, exported).** For each cell, compute the door's
  along-edge CLEAR SPAN as the widest overlap between the `doorEdge` and the CORE-CONNECTED corridor
  band(s) it fronts, then a sane offset CENTRED in that shared span, clamped clear of each end by a
  jamb. Stamped onto every shipped cell as `coreDoorOffset`/`coreDoorWidth` (absent when the door edge
  shares < a door width with a core-connected band). The executor (`_buildCellPerimeter` /
  `_buildPolygonCellPerimeter`) PREFERS this validated offset over its centre-of-the-whole-edge
  fallback (kept verbatim by the deferred punch — already corner-clamped), so a small core-flank
  unit's door is never mis-placed at a corner / over the core.

**Consequences.** Corridor walls read as a clean spur butting the core; unit doors sit on the
corridor-shared wall, corner-clear. Regression tests: `platePartition.test.ts` §RESI-CORRIDOR-TO-CORE
(no band's interior overlaps the core; a band butts a core face; the full-width core corridor is split
into left+right segments on rect / 40×18 wide / 80×60 hybrid plates) + §RESI-CORE-DOOR (every stamped
door lies inside the corridor-shared span, corner-clear, on rect / 34.8² side-façade / 80×60 plates;
determinism). `residentialPlateFill.test.ts` updated: the single core corridor is now two co-linear
core-butting segments (no full-width band through the core).
