# 0063 — House generative-layout doctrine: per-storey apartment pipeline + multi-storey spine only

**Status**: ACCEPTED
**Date**: 2026-06-09
**Deciders**: architecture team (founder-driven — "why don't you use for the house the same principles we use for apartment? apartment looks way more mature")
**Related contracts**: [C53 — Generative Layout Engine Architecture](../contracts/C53-GENERATIVE-LAYOUT-ENGINE-ARCHITECTURE.md), [C20 — Building & Apartment Aggregates](../contracts/C20-BUILDING-AND-APARTMENT-AGGREGATES.md), [C11 — Element Creation Pipeline](../contracts/C11-ELEMENT-CREATION-PIPELINE.md)
**Related ADRs**: [ADR-0062](./0062-layout-engine-deterministic-graph-solver.md) (D5 vertical structural stacking is a HARD constraint), [ADR-0061](./0061-building-graph-bidirectional-edit-substrate.md) (determinism)
**Context docs**: [HOUSE-APARTMENT-UNIFICATION-AUDIT-2026-06-09](../../03-execution/plans/HOUSE-APARTMENT-UNIFICATION-AUDIT-2026-06-09.md), [SPEC-CASA-UNIFAMILIAR-TYPOLOGY](../../03-execution/specs/SPEC-CASA-UNIFAMILIAR-TYPOLOGY.md), [STAIR-CREATION-PIPELINE-AND-ANCHOR-ANALYSIS](../../04-reference/STAIR-CREATION-PIPELINE-AND-ANCHOR-ANALYSIS.md)

## Context

The multi-storey house generator (`casa-unifamiliar`) shipped on top of the mature single-plate
apartment engine, but the house output read as *less mature* than the apartment — recurring
"one merged room" on the ground storey, dropped/voided rooms, and a stair poking out of a rotated
shell. A full pipeline audit (HOUSE-APARTMENT-UNIFICATION-AUDIT-2026-06-09) established the
**headline finding: the room-quality engine is already 100 % shared** — the house calls the *exact
same* `generateDeterministicLayouts` (D-TGL), `buildLayoutCommands`, opening/door/boundary batch
commands, and the same name/floor/ceiling/furnish/light chain the apartment does, per storey.

The maturity gap was therefore **not** a worse engine; it was the *editor-side orchestration the
house adds on top* — chiefly (1) two compensating heuristics the apartment never needs (a fragile
ground-floor `weldPartitionsToShell` and a parallel per-storey program sizer) and (2) the genuinely
new stair, whose containment had a structural desync: the stair was positioned, a keep-out was
carved, rooms were tiled around it, and only *then* was the body nudged inward — so the carved
keep-out and the shipped stair footprint diverged (`§DIAG-STAIR cornersInShell=1/4`), conflicting
the perimeter and partitions.

This ADR records the *doctrine* that resolves the founder's question and governs all house-layout
work. ADR-0062 D5 already made vertical structural stacking a hard constraint; this ADR is the
house-specific companion: it fixes *which layer owns what*, and pins the stair-placement invariants.

## Decision

**The house is "per storey, run the apartment pipeline; the house layer adds ONLY the multi-storey
spine."** Four binding sub-decisions:

**H1 — Per-storey plate == apartment plate.** Every storey is fed to the shared D-TGL engine and
the shared executor *exactly* as an apartment plate is. The two house-only compensating heuristics —
the ground `weldPartitionsToShell` and the parallel program sizer (`enrichStoreyProgramToPlate` /
`fillGroundPlate` / `houseStoreyBand`) — are **bolt-ons to be retired into the shared path**, not
the house's permanent shape. The smallest-slice cure (shipped as `§GROUND-ENGINE-PERIMETER`) is to
let the GROUND storey close rooms against the *engine-authored* perimeter ring — the same ring the
upper storeys already use (`_buildPerimeterShell`) whose endpoints are bit-exact with the partition
endpoints — instead of welding partitions back onto the user's post-miter drawn walls.

**H2 — The house layer adds ONLY the multi-storey spine.** Legitimately house-specific, KEPT:
the outer orchestration loop (`houseOrchestrator`), `allocateProgramToStoreys`, level minting +
a Roof level, per-storey `CreateSlabCommand`, the stair (`CreateStairCommand` + `stairCore` +
`stairPosition` + `stairContainment` + the slab void), `CreateRoofCommand` + `houseVertical`, the
finish-chain fan-out across storeys (`runHousePostGenChain`), and per-storey/roof view definitions.
Anything that determines *per-plate room maturity* is NOT a house concern — it is shared.

**H3 — The stair is contained UPSTREAM: the carved keep-out == the shipped footprint, by
construction.** Containment is solved in `houseOrchestrator` *before* the keep-out is carved
(`containStairCoreUpstream` → `computeStairWorldFootprint` + `solveStairContainmentWorld`), the
keep-out becomes the world AABB of the *contained* footprint (rooms tile around the FINAL stair
position), and the world offset rides `StairCore.containOffsetWorld` to the executor which applies
the *same* shift. The executor's downstream `§STAIR-CONTAIN` is demoted to a VERIFICATION that
re-solves on the shifted body and expects `{0,0}` residual (loud `§STAIR-CONTAIN ⚠ DESYNC`
otherwise). This closes the position→keep-out→tile→nudge desync at its root.

**H4 — The stair corner-anchors, never central.** The orchestrator ALWAYS supplies an `AspectBias`
to `chooseStairCorePosition` (default N-hemisphere when no site solar) so `PERIMETER_PREFERENCE` +
`FRAGMENT_PENALTY` always fire and the stair takes a back/side CORNER of one dominant rectangle — a
central stair fragments the plate into a merged private blob. This is a topology-level placement
invariant (`§STAIR-DEFAULT-BIAS`, with `DOMINANT_FRACTION` 0.40 so a corner-carved plate reliably
triggers the obstacle carve). On upper floors the stair arrival is a **Landing** (circulation), never
an "Entrance Hall" — the entrance hall is GROUND-ONLY (`§LANDING-NOT-HALL`, G14).

## Consequences

- **Positive:** the per-storey plan becomes byte-comparable to an apartment plate; the #1 founder-
  visible "merged room" defect (Gap 1) is killed by construction once the ground uses the engine ring;
  the stair desync class (`cornersInShell=1/4`) is closed; the house layer's surface shrinks to the
  genuinely-additional spine, lowering future maintenance.
- **Determinism preserved:** apartment and single-storey paths are byte-identical (no stair core ⇒
  the upstream-containment block is skipped); the corner-bias and topology gate are deterministic.
- **Cost / staging:** retiring the weld + parallel sizer is staged (audit §4 Stages 1–5); the weld is
  kept behind a defensive fallback until the engine-ring path is proven on the founder's repro plot.
  Stair containment (H3/H4) remains the last legitimately house-specific quality item.

## Alternatives considered

- **"Share the engine" (do more in D-TGL).** Rejected as already done — the audit proved the engine
  is 100 % shared; the gap is orchestration, not subdivision.
- **Keep tuning the ground weld tolerance.** Rejected: the weld was re-tuned five times
  (0.05→0.20→0.45→0.60→0.50 m, §WJ-SKEW-1..4) and is inherently fragile because it fights post-miter
  residuals. The engine-authored perimeter removes the need for a tolerance entirely.
- **Position the stair, then nudge after tiling (the prior behaviour).** Rejected: it is the desync
  itself — keep-out and shipped footprint can never be guaranteed equal that way.
- **Allow a central stair when it scores best.** Rejected: a central stair fragments the plate into a
  merged private zone on real plots; corner-anchoring is a hard placement bias, not a soft score.

## Shipped as (provenance)

`§GROUND-ENGINE-PERIMETER` (H1, v90), `§UPPER-SHELL-WELD` (H2 upper-plate weld-to-minted-perimeter,
v91), `§STAIR-CONTAIN-UPSTREAM` (H3, v93, `stairContainUpstream.test.ts` ×8), `§STAIR-DEFAULT-BIAS`
+ `DOMINANT_FRACTION 0.40` (H4, v83), `§LANDING-NOT-HALL` (H4 landing, v91),
`§RECTIFY-SHELL-PROJECT` (H5 — the by-construction rotated/sheared-plate room-merge cure, v95).
Tracker: §24.2 + §A.21.*. CI invariant: `houseLayoutInvariants.test.ts` (stair-corner I1 / no
merged-name I3 / no silent-drop I4).

### H5 — `§RECTIFY-SHELL-PROJECT` (rotated/sheared-plate room-merge, the by-construction cure)

`§RECTIFY-QUAD` (`rectDecomposition.ts`) rectifies a sheared convex-quad shell to its axis-aligned
**bounding box** before tiling, so the interior subdivides cleanly. But the partition endpoints
that should **terminate on the perimeter** then land on the **bbox edge**, while the executor's
perimeter ring (`HouseLayoutExecutor._buildPerimeterShell`, from `storey.footprint ===
shell.perimeter`) is the **real sheared shell** — sitting inside the bbox by up to **~1.9–2.1 m**
on a freehand quad (verified numerically; a 0.75-fill quad diverges 2.12 m at a corner). The
0.60 m weld (`§SHELL-SNAP-WIDEN`) cannot bridge that → an open seam → RoomDetection floods →
**one merged room** per storey. This was the dominant remaining maturity gap on rotated plots
(prior §8.5.5 OPEN item).

**Decision:** project the **interior** partition endpoints that lie on a rectified-bbox edge
onto the **real** shell polygon, **in the same principal-axis-rotated frame the partitions were
tiled in, after `emitGeometry` and before `rotateOptionBack`** (`runDeterministicLayout.ts` →
`projectPartitionEndpointsToShell`). The endpoint is cast along the bbox-edge perpendicular onto
the real ring (keep-x for top/bottom edges, keep-z for left/right), so a vertical partition stays
vertical and meets the perimeter at the same plan position. The interior keeps its clean
rectangular tiling; only the perimeter contacts move onto the true ring → the partitions meet the
executor ring **within the 20 mm RoomDetection node grid by construction**, and the weld +
`§UPPER-SHELL-WELD` + `§SHELL-ANCHOR-PRESERVE` become a safety net rather than the primary seal.

**Safety / no-regression:** when the shell does NOT rectify (axis-aligned rectangle, concave
L/U/T, >4 vertices, or sub-fill quad), the helper returns the walls **unchanged (same
reference)** → byte-identical output for the apartment (whose flat plates never rectify) and
every rectilinear plate. External/perimeter walls are never moved (dropped by
`skipExteriorWalls`; moving them would shift already-emitted window offsets). Pure L2 (no I/O /
THREE / DOM). Proven in `rectShellProject.test.ts` (7 unit tests, incl. axis-aligned + apartment
byte-identical + external-wall-untouched) and `tglRunDeterministicLayout.test.ts` (the ≤20 mm
by-construction property on a sheared quad through the real engine + an axis-aligned
byte-identical assertion). 2140 ai-host + 50 geometry-wall tests green.
