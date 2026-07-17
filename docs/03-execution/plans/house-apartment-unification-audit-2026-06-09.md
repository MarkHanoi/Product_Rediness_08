# House ↔ Apartment Pipeline Unification — Audit & Staged Plan

*Authored 2026-06-09. Founder brief (verbatim): "WHY DON'T YOU USE FOR THE HOUSE THE SAME
PRINCIPLES WE USE FOR APARTMENT? APARTMENT LOOKS WAY MORE MATURE." Goal: make the house's
**per-storey** plan as mature as the apartment's, keeping only the genuinely-additional
multi-storey spine (stair / roof / slab stacking) as house-specific.*

Cross-references: `docs/03-execution/specs/SPEC-CASA-UNIFAMILIAR-TYPOLOGY.md` (the house typology
spec), `CLAUDE.md` Governance (C11 element-creation pipeline, C15 hosted elements), tracker
`docs/03-execution/plans/master-execution-tracker.md` §A.21.* (Casa Unifamiliar).

---

## §1 — Headline finding

**The room-quality engine is ALREADY 100% shared.** The house does NOT re-implement room
subdivision, wall emission, window placement, program rules, or the finish chain. Per storey it
calls the *exact same* `generateDeterministicLayouts(...)` (D-TGL) the apartment calls, and the
*exact same* `buildLayoutCommands(...)` + opening/door/boundary batch commands the apartment
executor uses, and the *exact same* `nameDetectedRooms` + floor/ceiling/furnish/light chain.

So the founder's "apartment looks more mature" is **not** caused by a worse subdivision engine.
It is caused by **the editor-side ORCHESTRATION the house adds on top** — chiefly:

1. The house's GROUND floor reuses a **pre-drawn, mitred, height-raised** shell that the engine
   did not author, so partition endpoints don't land on the shell centreline → room detection
   fails to close → "one merged room". The house papers over this with a fragile geometric
   **`weldPartitionsToShell`** heuristic (tolerances tuned 0.05 → 0.20 → 0.45 → 0.60 → 0.50 m
   across §WJ-SKEW-1..4). The apartment NEVER hits this: the apartment also reuses a pre-drawn
   shell, but on a small flat plate the residuals are small and the same weld is *not even in its
   path* — the apartment executor has no weld step at all.
2. The house must invent a **program per storey** (`enrichStoreyProgramToPlate`,
   `fillGroundPlate`, `houseStoreyBand`) because the captured brief is sparse and would otherwise
   stretch one room across a 165 m² plate. This is a *parallel* program-sizing path to the
   apartment's `scaleProgramToShell`, and it is the source of the "rooms merged / one giant room"
   reports when its `presentedArea` vs `usableArea` math starves the subdivider (§AREA-AGREEMENT).
3. The **stair** is a real new geometric object that must sit inside a (possibly rotated) shell;
   when it pokes out (`§DIAG-STAIR cornersInShell=1/4`) it conflicts the perimeter and partitions.
   This is genuinely additional and must stay — but its containment is still being fixed
   (`stairContainment.ts`, `§STAIR-CONTAIN-GATE`).

The cure is therefore **not** "share the engine" (already done) — it is **"reduce the house's
extra orchestration to the multi-storey spine, and make every per-storey plate identical to an
apartment plate."**

---

## §2 — Side-by-side pipeline map

| Stage | Apartment | House | SHARE / DIVERGE |
|---|---|---|---|
| Entry / console | `apartmentLayoutTrigger.ts`, `apartmentFromBoundary.ts` | `houseLayoutTrigger.ts`, `houseFromBoundary.ts` | DIVERGE (thin wrappers) |
| Controller / modal | `ApartmentLayoutController.ts` + `ApartmentLayoutModal.ts` | `HouseLayoutController.ts` + `HouseLayoutModal.ts` | DIVERGE (house adds storey count, per-storey preview cards) |
| Orchestrator | (none — single plate) | `houseLayout/houseOrchestrator.ts` `generateHouseLayout` / `generateHouseLayoutOptions` | **DIVERGE — house-only outer loop** |
| Storey split | n/a | `houseLayout/storeyAllocation.ts` `allocateProgramToStoreys` | DIVERGE (genuinely additional) |
| **Program source** | `briefToProgram.ts` → engine's internal `scaleProgramToShell` (bubbleGraph) | **`houseLayout/houseProgramFloor.ts` `enrichStoreyProgramToPlate` / `fillGroundPlate` + `houseEnvelope.ts` `houseStoreyBand`** then engine | **DIVERGE — parallel program-sizing path** |
| Envelope gate | `dimensions/validateApartmentEnvelope.ts` (bedroom-count band) | `houseLayout/houseEnvelope.ts` `validateHouseStorey` (full-programme band), injected into the engine | DIVERGE (house injects a different validator into the SAME engine) |
| **Subdivision** | `apartmentLayout/tgl/runDeterministicLayout.ts` `generateDeterministicLayouts` | **SAME `generateDeterministicLayouts`, called once per storey** | **SHARE — identical** |
| Bubble graph / rect decomposition / squarify | `tgl/bubbleGraph.ts`, `rectDecomposition.ts`, `squarify.ts`, `subdivide.ts` | same (via the shared engine) | **SHARE** |
| Program rules (legality / occupancy) | `rules/programRules.ts` (used inside `emitGeometry.ts:17`, `bubbleGraph.ts:11`) | same (via the shared engine) | **SHARE** |
| Wall + door emission | `tgl/wallsAndDoors.ts` → `tgl/emitGeometry.ts` | same (via the shared engine) | **SHARE** |
| Window emission | `windowEmission/emitWindows.ts` (used `emitGeometry.ts:18`), solar orientation | same (via the shared engine) | **SHARE** |
| **Plan → commands** | `buildLayoutCommands(...)` (ai-host) | **SAME `buildLayoutCommands(...)`** (`HouseLayoutExecutor.ts:432`) | **SHARE** |
| Wall batch | `wall.batch.create` | same verb | **SHARE** |
| Door / window openings | `CreateWallOpeningsBatchCommand` | same | **SHARE** |
| Open-plan boundaries | `CreateRoomBoundingLinesBatchCommand` | same | **SHARE** |
| **Room sealing on GROUND** | none needed — shell residuals are small; **no weld step in the apartment executor** | **`weldPartitionsToShell.ts` + `HouseLayoutExecutor._weldGroundPartitions`** | **DIVERGE — house-only heuristic** |
| Room detection | `RoomDetectionEngine` (shared editor service) | same | SHARE |
| Room naming / occupancy tag | `nameDetectedRooms.ts` | **SAME** (`HouseLayoutExecutor.ts:744`) | **SHARE** |
| Finish chain (floor/ceiling/furnish/light) | per-level triggers, fired once | `runHousePostGenChain.ts` — fans the SAME triggers across storeys | SHARE engine, DIVERGE fan-out (additional) |
| Levels | single active level | mints storeys + a Roof level (`AddLevelCommand`) | DIVERGE (additional) |
| Slabs | (apartment does not stack slabs) | `CreateSlabCommand` per storey | DIVERGE (additional) |
| **Stair** | none | `CreateStairCommand` + `stairCore.ts` + `stairPosition.ts` + `stairContainment.ts` + slab void | **DIVERGE (genuinely additional)** |
| Roof | none | `CreateRoofCommand` + `houseVertical.ts` | DIVERGE (additional) |
| Per-storey plan views | `vd-sys-plan-l0` default | `view.createDefinition` per upper storey + roof (`§FLR-VIEWS`) | DIVERGE (additional) |

**Summary:** everything that determines *per-plate room maturity* is SHARE. Everything the house
ADDS is either (a) the multi-storey spine (legitimately additional) or (b) **two compensating
heuristics** — the ground weld and the per-storey program enrichment — that only exist because the
house plate is fed to the engine differently from an apartment plate.

---

## §3 — Why the house output is less mature (top gaps, with evidence)

### Gap 1 — GROUND floor "one merged room", patched by a fragile weld
`packages/ai-host/src/workflows/houseLayout/weldPartitionsToShell.ts:1-21` documents the recurring
defect verbatim:

> "on the GROUND floor of a generated multi-storey house the interior partition walls are emitted
> but room detection finds only ONE merged room — while the UPPER floors subdivide fine. The upper
> storeys build their shell with the SAME emitter that produced the partitions … The GROUND reuses
> the user's PRE-DRAWN shell … so a partition endpoint … can sit > the RoomDetectionEngine's 20 mm
> node grid away from the actual (post-miter) shell-wall centreline, and the loop never closes →
> `rooms_total=1`."

The weld tolerance has been re-tuned five times (`weldPartitionsToShell.ts:51-84`,
`DEFAULT_PARTITION_WELD_M = 0.50`) with a room-safety guard bolted on (§WJ-SKEW-4). The apartment
executor has **no weld at all** (`ApartmentLayoutExecutor.ts` — `buildLayoutCommands` → batches,
no `weldPartitionsToShell` import). This is the single biggest maturity gap and it is a
**house-only orchestration artefact**, not an engine difference.

### Gap 2 — Parallel program-sizing path starves / over-packs storeys
`houseProgramFloor.ts` (`enrichStoreyProgramToPlate`, `fillGroundPlate`) is a *second* program
sizer that exists "because the apartment's `scaleProgramToShell` density … is tuned for a single
small flat plate, NOT a house storey" (`houseProgramFloor.ts:9-13`). It then needs the
`houseOrchestrator.ts` `presentedArea` reconciliation (`houseOrchestrator.ts:472-484`,
§AREA-AGREEMENT) to avoid feeding the engine a wrong area. The comment at
`houseOrchestrator.ts:472-478` explicitly names the failure mode this introduces:

> "capping it shrinks the bubble-graph budget and starves the program, forcing §FEASIBILITY-ALLOC
> to drop rooms on a plate that is actually big enough (the founder's generic 'Room 00-00x' voids)."

So a *correctly-sized* apartment program path was forked into a house path that can both
under-fill (giant room) and over-pack (dropped rooms) depending on the area math.

### Gap 3 — Stair pokes out of the shell, conflicting walls/partitions (genuinely additional)
`HouseLayoutExecutor.ts:1000-1008` and `stairContainment.ts:1-16`:

> "on a strongly-rotated plate the generated house stair pokes OUT of the shell — §DIAG-STAIR logs
> `cornersInShell=1/4` every time. … the stair body is ANCHORED at a start corner and GROWN in a
> fixed direction; only the anchor is positioned, the FULL footprint is never validated against
> the (rotated) shell."

This is a *real* additional concern (the apartment has no stair) and must stay — but it is still
being stabilised (`§STAIR-CONTAIN-GATE`, second-attempt-toward-centroid fallback at
`HouseLayoutExecutor.ts:1040+`).

### Gap 4 — Upper-storey shell built by a different path than the ground
The house emits an explicit perimeter for upper storeys (`_buildPerimeterShell`,
`HouseLayoutExecutor.ts:414-416`, §PERIMETER-SHELL) and sets `skipExteriorWalls:true`, while the
ground reuses the drawn shell. Two shell-construction paths → two room-closure behaviours → the
weld only needed on one of them. The apartment has exactly one (drawn) shell path.

### Gap 5 — Entrance door / windowless-room handling re-derived in the executor
`HouseLayoutExecutor.ts:473-518` re-resolves the ground entrance door (`resolveEntranceDoor`,
§A.21.D29) and §DIAG-ROOMS flags windowless habitable rooms (`:461-465`). The apartment assumes
the user hand-placed the front door before generating; the house has to synthesize one. This is
partly additional (a from-scratch house needs a door) but the *windowless-room* concern is shared
engine output and should be solved once in the engine/window-emission layer, not re-checked here.

---

## §4 — Unification recommendation

**Doctrine: "per storey, run the apartment pipeline; the house layer only adds the multi-storey
spine (stair / roof / slab + footprint stacking)."** Concretely:

### RETIRE (fold into the apartment path)
- **`weldPartitionsToShell.ts` + `HouseLayoutExecutor._weldGroundPartitions`** — *as a house-only
  step*. The right home for "close rooms against a pre-drawn, post-miter shell" is the shared
  executor path, so BOTH apartment and house benefit (the apartment is just lucky today). Either
  (a) make `buildLayoutCommands` / the shared executor always weld interior partitions onto the
  gathered shell when `skipExteriorWalls` is set, or (b) better, have the engine emit the
  perimeter as the authoritative ring for the ground too (see smallest-slice below) so no weld is
  needed at all.
- **`enrichStoreyProgramToPlate` / `fillGroundPlate` / `houseStoreyBand` as a parallel sizer** —
  converge onto the apartment's `scaleProgramToShell` by giving it a "plate role" parameter
  (ground / upper / single) rather than maintaining a second density model. Keep
  `allocateProgramToStoreys` (splitting a whole-house brief across storeys is genuinely additional)
  but feed each storey's sub-program through the *same* shell-scaling the apartment uses.
- **`validateHouseStorey` vs `validateApartmentEnvelope`** — unify into one envelope validator
  parameterised by "judge by full programme" (already the house behaviour and arguably correct for
  apartments too), removing the injected-validator fork.

### KEEP (genuinely additional multi-storey spine)
- `houseOrchestrator.ts` outer loop, `allocateProgramToStoreys`, level minting + Roof level,
  per-storey `CreateSlabCommand`, `CreateStairCommand` + `stairCore.ts` + `stairPosition.ts` +
  `stairContainment.ts` + the slab void, `CreateRoofCommand` + `houseVertical.ts`,
  `runHousePostGenChain.ts` (fan the SAME finish chain across storeys), per-storey/roof
  `view.createDefinition`, footprint stacking + inter-floor wall/slab continuity (§WALL-SLAB-
  CONTINUITY).

### Staged plan
- **Stage 0 (this doc).** Audit + doctrine. No code.
- **Stage 1 — Smallest first slice (see §5).** Make the ground storey use the SAME
  engine-authored perimeter the upper storeys use, eliminating the weld for the common case.
- **Stage 2.** Converge program sizing: parameterise `scaleProgramToShell` with a plate role;
  delete `enrichStoreyProgramToPlate`/`fillGroundPlate` as a separate model (keep the storey
  split). Remove the `presentedArea`/§AREA-AGREEMENT reconciliation that only exists to feed the
  fork.
- **Stage 3.** Unify the envelope validator (one validator, "by full programme").
- **Stage 4.** Solve windowless-habitable-room + entrance-door defaults once in the shared
  engine/window-emission + a shared "from-scratch entrance" helper (apartment-from-scratch can use
  it too).
- **Stage 5.** Stair containment hardening (already in flight via §STAIR-CONTAIN-GATE) — keep
  house-only; this is the last legitimately-house-specific quality item.

---

## §5 — Smallest first slice (highest maturity per unit work)

**Make the GROUND storey use an engine-authored perimeter, so the ground closes rooms exactly the
way the upper storeys do — and delete the weld from the common path.**

Today (`HouseLayoutExecutor.ts:413-420`): ground → `gatherShellWalls` (drawn, mitred shell) +
`_weldGroundPartitions`; upper → `_buildPerimeterShell` (engine footprint ring, exact shared
endpoints, no weld). The upper path is the one that "subdivides fine" (Gap 1 evidence).

**Slice:** for the ground storey too, emit the footprint perimeter from the engine's
`shell.perimeter` (the same ring `_buildPerimeterShell` uses) as the authoritative interior-facing
ring that the partitions terminate on, instead of welding partitions back onto the user's
post-miter drawn walls. The drawn exterior walls stay for the building envelope; room *detection*
keys off the engine ring whose endpoints are bit-exact with the partition endpoints
(`buildLayoutCommands` produced both). This removes the `§WJ-SKEW`/weld tolerance class of bugs for
the standard case in one change and makes the ground plate byte-comparable to an apartment plate.

**Why smallest + highest leverage:**
- It is localised to the `isGround` branch of `HouseLayoutExecutor` (≈ the block at lines
  413-448) plus reuse of the existing `_buildPerimeterShell` — no engine change, no new module.
- It directly kills **Gap 1** (the #1 founder-visible "merged room" defect) and removes the need
  for the most heavily re-tuned house-only file (`weldPartitionsToShell.ts`).
- It is the prerequisite for Stage 2/3 (once the ground plate is engine-authored, the program
  sizer and envelope can converge without fighting post-miter residuals).
- Apartment path is untouched (it has no upper-storey perimeter concept) → zero regression risk
  to the mature pipeline.

**Acceptance:** on the founder's repro plot, `§DIAG-ROOMS` reports `rooms ≈ programme room count`
on the GROUND storey with the weld disabled, and `§DIAG-LEVELS` shows no missing walls. Then the
weld can be deleted (or kept only as a defensive fallback behind a flag).

---

## §6 — One-line answer to the founder

The house already uses the apartment's engine for every room; it "looks less mature" because of
two compensating bolt-ons the apartment never needs (a fragile ground-floor weld and a parallel
program sizer) plus the genuinely-new stair. Fix the smallest slice — let the ground floor use the
engine's own perimeter like the upper floors do — and the per-storey plan becomes as crisp as the
apartment's, leaving the house layer to do only what's truly multi-storey: stairs, slabs, and the
roof.
