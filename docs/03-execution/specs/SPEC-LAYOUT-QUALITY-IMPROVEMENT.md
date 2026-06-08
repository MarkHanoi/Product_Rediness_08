# SPEC — D-TGL Layout Generation Quality Improvement

> **Status:** QUEUED (founder-supplied engineering spec, 2026-06-08). Tracked as **A.27**.
> **Goal:** make generated plans read as *architecture*, not area-packing. Four root
> causes, eight prescriptions, seven implementation phases. **All changes additive +
> backward-compatible; the byte-identical baseline invariant (ADR-0061 I2) is preserved.**
>
> **SEQUENCING:** must launch AFTER the A.21.D57–D61 batch merges — it edits the same
> core files (`subdivide.ts`, `programRules.ts`, `wallsAndDoors.ts`, `stairPosition.ts`).
> Implement phase-by-phase; each phase ends by running `pnpm --filter ai-host test:unit`
> and must NOT regress the captured baseline before the next phase starts.

---

## Hard constraints (never violate)

1. **No `Math.random`** — every function deterministic (same input → same output).
2. **No forking `generateDeterministicLayouts`** — additive only (new optional params/hooks; signature stays backward-compatible).
3. **No changes to the Pareto ranker or the 20-axis `ObjectiveVector`** — the objectives are correct; the problem is geometry, not scoring.
4. **No changes to** `windowEmission/`, `weldPartitionsToShell.ts`, `houseEnvelope.ts`, `stairPosition.ts` (well-reasoned already) — *NB: D59 is currently fixing a stairPosition containment bug; this spec's stair work (P4) touches `houseOrchestrator.ts` + `stairCore.ts` + `subdivide.ts`, NOT the stairPosition scorer.*
5. **Every new function PURE** (no I/O/THREE/DOM) — follow the `// PURE + DETERMINISTIC` L2 convention.
6. **Preserve §FEASIBILITY-ALLOC no-drop** — no room that currently generates may be silently dropped.
7. **Byte-identical invariant** holds for the apartment path + single-storey house. Multi-storey house may differ only after Phase 6.

---

## Part 1 — Root causes

| ID | File / symbol | Sev | Cause |
|---|---|---|---|
| **C1** Placement is area-packing, not adjacency-first | `subdivide.ts:allocationOrder`, `bubbleGraph.ts:buildBubbleGraph`, `squarify.ts` | HIGH | Adjacency preferences influence only the P7 scorer, never P3 placement. Squarify is indifferent to adjacency → all 8 strategies share the same wrong physical adjacencies → ranking can't fix it. |
| **C2** Doors are a repair pass, not a design pass | `wallsAndDoors.ts:buildWallsAndDoors`, `§DOOR-CLEAR-OFFSET` | HIGH | 4 reconciliation passes (incl. §CIRCULATION-REROUTE BFS) patch geometry built with no door-position knowledge. Corridor-facing intent never reaches P3. |
| **C3** 8 strategies are geometric transforms, not parti variants | `enumerate.ts:144-152`, `subdivide.ts:trySingleRectCarve` | MED | {axis, order, mirror} change orientation only; all 8 are the same single-loaded `[public\|corridor\|private]` parti → candidates feel similar. |
| **C4** Stair placed as obstacle, not vertical-circulation anchor | `houseOrchestrator.ts:enumeratePerStorey`, `subdivide.ts:tryCarveCorridor` | MED | Stair core known before per-storey call but passed only as a keep-out, not a corridor-origin hint → upper corridor doesn't radiate from the stair head. |

---

## Part 2 — Prescriptions + targeted fixes (with file/symbol)

### Targeted fixes (lowest risk — do first)
- **F1-2** `programRules.ts` — kitchen↔corridor `preferenceBetween` `0.3 → 0.6` (below kitchen↔dining 1.0, but discourages a buried kitchen).
- **F3** `subdivide.ts` — `§MASTER-SURPLUS`: after `runRebalance`, if `masterArea < maxBedroomArea + MIN_MASTER_SURPLUS_M2 (2.0)`, run ≤3 extra rebalance steps (donor = lowest-priority bedroom per `DROP_PRIORITY_RANK`, beneficiary = master). No-drop guarantee holds. Add `MIN_MASTER_SURPLUS_M2` constant; optionally `ROOM_RULES.master.minSurplusOverBedroomM2 = 2.0` as the SoT.
- **F2** `topology/validateCirculationSequence.ts` — `§HALL-ENTRANCE-FACE`: if hall's front edge `> shellMinZ + 1.5` (min-Z = entrance façade), emit a **SOFT** finding (`metric 'hallEntranceFace'`, delta 0.8). Keep soft for now (hard gate risks over-rejecting non-rectangular shells).
- **F1-1** (optional) `topology/validateWetCluster.ts` — promote to a HARD finding when `numGroups ≥ 3 AND wets ≥ 3`.

### P3 — Door approach quality (`wallsAndDoors.ts:findClearOffset`)
When ≥2 candidate offsets are clear, prefer the one centring the door on the longest unobstructed run: `score = min(offset − nearestObstacleLeft, wallLen − offset − doorWidth − nearestObstacleRight)`; highest wins, tie-break = existing first-found. **Do not change signature/return type.** Verify no increase in `unroutedToCirculationRoomIds` length.

### P1 — Adjacency-constrained cell assignment (`subdivide.ts` + `squarify.ts` + `enumerate.ts`)
New pure `adjacencySortForZone(rooms, bubble): RoomNode[]` after `allocationOrder`: greedy insertion sort keyed on `preferenceBetween` (seed = highest total weight; append highest-weight-to-last; tie-break lowest room id). Thread `bubble` through `subdivideWithReport`; apply **separately** to the public zone (living/kitchen/dining/hall) and private zone (bedrooms/master/ensuite/baths). Corridor never sorted. **Invariant guard + test:** uniform weights ⇒ same order as input ⇒ byte-identical.

### P2 (5) — Corridor-face hint (`squarify.ts` + `subdivide.ts`)
`squarify` gains `corridorFaceHint?: 'x'|'z'`; ADD a soft `CORRIDOR_FACE_WEIGHT = 0.15` (additive, never degrades aspect by more than the weight) to split-lines giving rooms a long dimension parallel to the hint axis. `tryCarveCorridor` sets `corridorFaceAxis = corridorRunsAlongZ ? 'x' : 'z'` and passes it to the **private-zone** squarify only.

### P4 (6) — Stair-head corridor alignment (upper storeys) (`houseOrchestrator.ts` + `types.ts` + `subdivide.ts` + `stairCore.ts`)
Surface `positionKind` on `StairCoreShaped` (from `chooseStairCorePosition`). In `enumeratePerStorey` for `role === 'upper'`: `stairHeadAxis = (kind==='left'||kind==='right') ? 'z' : 'x'`; pass as `tuning.corridorAxis`. Add `corridorAxis?: 'x'|'z'` to `EngineTuning`. `tryCarveCorridor` uses it as a **tiebreak only when the two axes are within 20%** (nearly square); else longer-axis rule wins (enclosure guarantee). Ground floor byte-identical.

### P7 — Double-loaded corridor parti (most invasive — last) (`subdivide.ts` + `enumerate.ts`)
New `tryDoubleLoadedCarve`: corridor runs CENTRALLY along the longer axis; public rooms one half, private the other; squarify each half independently with the same §FEASIBILITY-ALLOC rebalance; same output shape as `trySingleRectCarve`; set `corridorFaceAxis` for both halves; **return null if longer dim < 7.0 m**. Extend `Strategy` with `parti?: 'single-loaded'|'double-loaded'` (default undefined = single). Add strategy 9 `{axis:false, order:'fwd', mirror:false, parti:'double-loaded'}`; in `buildCandidate` branch on parti (null → skip/drop, don't throw). **No changes to ranker/objectives/emitter.**

---

## Part 3 — Implementation order (each independently testable; baseline must not regress)

| # | Item | Test criterion |
|---|---|---|
| 1 | F1-2 kitchen weight | kitchen not in private zone on a 3-bed; no regression |
| 2 | F2 hall entrance-face (soft) | interior hall scores lower than entrance-facing |
| 3 | F3 master surplus | master ≥ 2 m² larger than each bedroom; no-drop holds |
| 4 | P3 door approach | doors centred on long approach wall; sealed-room rate unchanged |
| 5 | P4 stair-head corridor axis | upper corridor ⟂ stair head; ground floor byte-identical |
| 6 | P1 adjacency-sort | kitchen↔dining adjacent ≥80%; master↔ensuite always; uniform-weight invariant test passes |
| 7 | P2/P5 corridor-face hint | bedroom corridor-facing walls host a min-door+clearance ≥90%; aspect not degraded |
| 8 | P7 double-loaded parti | on ≥8 m plans the double-loaded variant generates + appears; on 6×6 skipped → 8-strategy baseline unchanged |

## Part 4 — Do NOT modify
`windowEmission/`, `objectives.ts` (20 axes), the Pareto ranker, `weldPartitionsToShell.ts`, `storeyAllocation.ts`, `houseEnvelope.ts`.

## Per-phase documentation
After each phase: update `SPEC-TGL-DETERMINISTIC-LAYOUT-ENGINE.md` (what/why/§-tag/invariant note) + the `LAYOUT-GENERATION-ALGORITHM.md` Appendix A (§-tag glossary) + Appendix B (recently-changed). New §-tags: `§ADJACENCY-SORT`, `§MASTER-SURPLUS`, `§CORRIDOR-FACE-HINT`, `§STAIR-HEAD-AXIS`, `§DOUBLE-LOADED-PARTI`, `§HALL-ENTRANCE-FACE`.
