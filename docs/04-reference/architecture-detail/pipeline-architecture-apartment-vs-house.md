# Pipeline Architecture — Apartment vs House (the contractual diagram)

> **Status:** living reference. The **contractual architectural diagram** the founder asked for
> after a successful apartment-layout prod test ("worked and honestly better, more coherent"):
> *"Check the orchestration and pipeline of the apartment generator and check it against the
> housing — we should have a clear CONTRACTUAL ARCHITECTURAL DIAGRAM about BOTH pipelines — first
> to work as much as possible in a MODULAR and REUSABLE way and also to be more ROBUST."*
>
> **Read-only doc.** Every claim is grounded in source (`path:NNN`) or in a governing
> contract/ADR. This doc is the *picture*; the prose drill-down is
> [LAYOUT-GENERATION-ALGORITHM](./layout-generation-algorithm.md); the gap audit is
> [HOUSE-APARTMENT-UNIFICATION-AUDIT-2026-06-09](../03-execution/plans/house-apartment-unification-audit-2026-06-09.md);
> the doctrine is [ADR-0063](../02-decisions/adrs/ADR-0063-house-generative-layout-doctrine.md);
> the architecture contract is [C53](../02-decisions/contracts/C53-GENERATIVE-LAYOUT-ENGINE-ARCHITECTURE.md).

---

## 0. One-paragraph mental model

There is **ONE** room-quality engine — **D-TGL** (`generateDeterministicLayouts`,
`packages/ai-host/src/workflows/apartmentLayout/tgl/runDeterministicLayout.ts:86`). Both
generators call it **unchanged**. The **apartment** is that engine on a *single plate*: gather →
generate → commit → finish, with **no orchestrator**. The **house** is the **same engine wrapped
in a storey loop** (`houseOrchestrator.ts`) that adds exactly the multi-storey *spine* — storey
allocation, a vertically-stacked stair core, per-storey level + slab + void stamping, a roof, and
a finish-chain fan-out. The seam between the pure engine and the live editor is **one shape**: the
engine returns a `LayoutOption` (apartment) or a `HouseLayoutResult` of per-storey `LayoutOption`s
(house); **both** executors call the **same** `buildLayoutCommands` and dispatch the **same**
command verbs. Everything that decides *per-plate room maturity* is SHARED; everything the house
adds is either the genuinely-additional spine or **two compensating bolt-ons** (a ground-shell
weld + a parallel program sizer) that exist only because the house feeds the engine a plate
differently — and that ADR-0063 commits to retiring.

---

## 1. Two side-by-side pipeline diagrams

Legend: `█ SHARED core` (identical module, byte-for-byte) · `▒ path-specific spine` (genuinely
additional, KEEP) · `░ compensating bolt-on` (house-only today, SHOULD converge).

### 1.1 Apartment — single plate

```
            ░ = none (the apartment has zero bolt-ons — this is WHY it "looks more mature")

 USER ─ draw parcel boundary (GIS/Cesium C19) ─▶ shell walls in wall store
      └ typology brief (sliders / RAC) ─────────▶ ApartmentProgram

 EDITOR SEAM (L5/L7.5)
   apartmentLayoutTrigger.triggerApartmentLayout()        apartment-layout/apartmentLayoutTrigger.ts:33
     └ gatherLayoutPayload(levelId)                        reads walls+isExterior+openings+brief+siteLat
        ─────────────────────────────▶ ApartmentGenerateLayoutPayload         ◀── CONTRACT SEAM ①
     └ requestApartmentLayout(rt, payload) → runtime.ai.layoutOptions plane (C09 in-process)

 █ ENGINE (L2, pure) — generate.ts → generateDeterministicLayouts(shell, program, …)
 █   §PRINCIPAL-AXIS rotate skewed plate → axis-aligned frame
 █   enumerateLayouts():  8 deterministic strategies × P1→P7
 █     P1 decomposeToRects      shell → rects            rectDecomposition.ts
 █     P2 buildBubbleGraph      program → rooms+edges     bubbleGraph.ts   (scaleProgramToShell)
 █     P3 subdivideWithReport   rooms → footprints        subdivide.ts/squarify.ts
 █     D2/D3 shape+fit+envelope gate                      dimensions/*  (validateApartmentEnvelope)
 █     P4 buildWallsAndDoors    footprints → walls+doors  wallsAndDoors.ts
 █     P5 buildSemanticGraph    → LayoutGraph             semanticGraph.ts
 █     T3 topology gate + §TOPO-HARD-REJECT               topology/*, enumerate.ts
 █     P6 spaceSyntax · P7 computeObjectives (20 axes)
 █     GATE 5/7-tier → Pareto dominance → weighted sum (stable)
 █   per ranked candidate: P9 emitGeometry → LayoutOption (mm) incl. windowEmission
 █     rotate back to world · scoreLayout
   ─────────────────────────────▶ ScoredLayoutOption[]                       ◀── CONTRACT SEAM ②

 EDITOR EXECUTOR (L5) — ApartmentLayoutExecutor.ts   (NO weld · NO program sizer · NO stair)
   user picks option ─▶ buildLayoutCommands(option)        executePlan.ts:516   ◀── CONTRACT SEAM ③
 █   wall.batch.create  +  wall.createOpening (door+window)  +  door/window.batch.create
 █   + roomBoundingLine.create (open-plan splitters)     skipExteriorWalls (drawn shell exists)
   ─▶ ONE BatchCoordinator.runBatch (single undo)
 █ ─▶ RoomDetectionEngine re-detect  ─▶  nameDetectedRooms
   ─▶ post-gen chain (floor → ceiling → furnish → light)  fired ONCE on the active level
```

### 1.2 House — multi-storey storey-loop

```
 USER ─ draw parcel boundary (GIS/Cesium C19) ─▶ shell walls  · typology brief ─▶ HouseProgram + storeyCount

 EDITOR SEAM (L5/L7.5)
   houseLayoutTrigger / houseFromBoundary ─▶ HouseLayoutController + HouseLayoutModal (storey count, per-storey cards)
     └ gatherLayoutPayload(...)  (SAME reader)                                  ◀── CONTRACT SEAM ①

 ▒ ORCHESTRATOR (L2, pure) — houseLayout/houseOrchestrator.ts  generateHouseLayout / …Options
 ▒   allocateProgramToStoreys(brief)              storeyAllocation.ts   entranceHall = GROUND-ONLY (§LANDING-NOT-HALL/G14)
 ▒   reserveStairCoreShaped + chooseStairCorePosition (AspectBias, §STAIR-DEFAULT-BIAS H4)   stairCore.ts/stairPosition.ts
 ▒   containStairCoreUpstream  → computeStairWorldFootprint + solveStairContainmentWorld     stairWorldFootprint.ts/stairContainment.ts
 ▒        ⇒ StairCore.containOffsetWorld  · keepOutRectsWorld = world AABB of CONTAINED footprint (H3 §STAIR-CONTAIN-UPSTREAM)
   │
   │  ┌──────────────── FOR EACH STOREY (the spine's outer loop) ────────────────┐
   │  │ ░ enrichStoreyProgramToPlate / fillGroundPlate   houseProgramFloor.ts     │  ░ parallel program sizer
   │  │ ░ validateHouseStorey / houseStoreyBand          houseEnvelope.ts         │  ░ forked envelope validator
   │  │ █ generateDeterministicLayouts(plate, storeyProgram, {keepOutRectsWorld}) │  █ SAME ENGINE — once per storey
   │  │ █   …identical P1→P9 (rect → bubble → subdivide → walls → topo → emit)…   │     stair carved as keep-out (§STAIR-KEEPOUT)
   │  │ █   §RECTIFY-SHELL-PROJECT (rotated-plate room-merge cure, H5)            │
   │  │   ─────────────▶ ScoredLayoutOption per storey                           │
   │  └──────────────────────────────────────────────────────────────────────────┘
 ▒   bestStoreyOptionIndex (variant-0 invariant) · assemble stairs/voids/roof   houseVertical.ts
   ─────────────────────────────▶ HouseLayoutResult { storeys[], perStoreyLayout[], stairs[], voids[], roof }   ◀── SEAM ②(house)

 EDITOR EXECUTOR (L5) — house-layout/HouseLayoutExecutor.ts
   user picks variant ─▶ FOR EACH STOREY:
 ▒   AddLevelCommand (mint storey + a Roof level)
 ▒   GROUND: gatherShellWalls → §GROUND-ENGINE-PERIMETER  ┐  ░ ENGINE-PERIMETER path (clean) | WELD-FALLBACK path (weldPartitionsToShell)
 ▒   UPPER : _buildPerimeterShell (engine ring) → §UPPER-SHELL-WELD  ┘
 █   buildLayoutCommands(storey.option)                              ◀── CONTRACT SEAM ③ (SAME function)
 █     wall.batch.create + wall.createOpening + door/window.batch.create + roomBoundingLine.create  (skipExteriorWalls)
 ▒   CreateSlabCommand (per storey)  ·  CreateStairCommand + slab void  ·  §STAIR-CONTAIN VERIFICATION ({0,0} residual)
 ▒   CreateRoofCommand (over topmost)  ·  view.createDefinition (per upper storey + roof)
   ─▶ ONE BatchCoordinator.runBatch (single undo)
 █ ─▶ RoomDetectionEngine re-detect ─▶ nameDetectedRooms (Landing not Hall upstairs)
 ▒ ─▶ runHousePostGenChain.ts — FANS floor→ceiling→furnish→light across EVERY storey, in sequence
```

The two pictures are **the same column** (gather → engine → buildLayoutCommands → batch → detect →
finish). The house picture only adds the `▒` ring around the engine call and the `▒` spine
commands after `buildLayoutCommands` — plus the two `░` bolt-ons feeding the plate in.

---

## 2. SHARED-vs-DIVERGENT contract table (post-fix state)

This extends the audit's §2 map to the **current (2026-06-09 post-fix) state**. `S` = shared
verbatim · `K` = house-only, genuinely additional (KEEP) · `B` = compensating bolt-on (SHOULD
converge per ADR-0063 H1).

| Stage | Apartment | House | Class | Evidence |
|---|---|---|---|---|
| Entry / trigger | `apartmentLayoutTrigger.ts:33`, `apartmentFromBoundary.ts` | `houseLayoutTrigger.ts`, `houseFromBoundary.ts` | thin wrappers | — |
| Controller / modal | `ApartmentLayoutController` + `…Modal` | `HouseLayoutController` + `…Modal` (storey count, per-storey cards) | K | — |
| Payload gather | `gatherLayoutPayload.ts` | **SAME** `gatherLayoutPayload.ts` | **S** | algorithm §1.1 |
| **Orchestrator** | none (single plate) | `houseOrchestrator.ts` `generateHouseLayout` storey loop | **K** | `houseOrchestrator.ts:196` |
| Storey split | n/a | `storeyAllocation.ts` `allocateProgramToStoreys` | **K** | entranceHall ground-only §LANDING-NOT-HALL |
| **Program sizer** | engine's `scaleProgramToShell` (`bubbleGraph.ts`) | `houseProgramFloor.ts` `enrichStoreyProgramToPlate`/`fillGroundPlate` then engine | **B** | audit §3 Gap 2; `houseProgramFloor.ts:9-13` |
| **Envelope gate** | `dimensions/validateApartmentEnvelope.ts` (bedroom-count band) | `houseEnvelope.ts` `validateHouseStorey` (full-programme band), injected into engine | **B** | algorithm §5.3 |
| Principal-axis rotation | `§PRINCIPAL-AXIS` | same (via engine) | **S** | `runDeterministicLayout.ts:122` |
| Rect decomposition / `§RECTIFY-QUAD` / `§RECTIFY-SHELL-PROJECT` | `rectDecomposition.ts` | same (via engine) | **S** | ADR-0063 H5 |
| Bubble graph / squarify / subdivide / `§FEASIBILITY-ALLOC` | `bubbleGraph.ts`/`squarify.ts`/`subdivide.ts` | same | **S** | audit §2 |
| Program rules (legality / occupancy / caps) | `rules/programRules.ts` | same | **S** | — |
| Walls + doors + `§SEALED-ROOMS`/`§FRACTURE-SEAL` | `wallsAndDoors.ts` | same | **S** | `wallsAndDoors.ts:35` |
| Window emission + solar | `windowEmission/emitWindows.ts` | same | **S** | — |
| Topology gate + `§TOPO-HARD-REJECT` | `topology/*`, `enumerate.ts` | same (one engine, both paths) | **S** | algorithm §5.4.1 |
| Pareto + weighted rank | `enumerate.ts` | same; house adds `bestStoreyOptionIndex` (variant-0) | **S** (+K wrapper) | `houseOrchestrator.ts:127` |
| Emit geometry P9 | `emitGeometry.ts` | same | **S** | — |
| **Engine entry** | `generateDeterministicLayouts` ×1 | **SAME**, called ×N storeys | **S** | algorithm §0 / ADR-0063 H1 |
| **Plan → commands** | `buildLayoutCommands(option)` `executePlan.ts:516` | **SAME** `buildLayoutCommands(storey.option)` | **S** | `HouseLayoutExecutor.ts:432` |
| Wall / opening / door / window / boundary verbs | `wall.batch.create` · `wall.createOpening` · `door`/`window.batch.create` · `roomBoundingLine.create` | **identical verbs** | **S** | `HouseLayoutExecutor.ts:19,1211` |
| **Stair (containment upstream)** | none | `containStairCoreUpstream` + `CreateStairCommand` + `stairCore`/`stairPosition`/`stairContainment` + slab void | **K** | ADR-0063 H3/H4 |
| **Ground room sealing** | none (small residuals; **no weld in path**) | `§GROUND-ENGINE-PERIMETER` (clean) ‖ `weldPartitionsToShell` (`WELD-FALLBACK`) | **B** | `HouseLayoutExecutor.ts:434-503`; audit §3 Gap 1 |
| **Upper shell** | n/a (one drawn shell) | `_buildPerimeterShell` (engine ring) + `§UPPER-SHELL-WELD` | **K** (ring) / **B** (weld) | `HouseLayoutExecutor.ts:414,998-1040` |
| Levels | single active level | `AddLevelCommand` ×N + Roof level | **K** | — |
| Slabs / void | none stacked | `CreateSlabCommand` per storey + stair void | **K** | — |
| Roof | none | `CreateRoofCommand` + `houseVertical.ts` | **K** | — |
| Per-storey plan views | `vd-sys-plan-l0` default | `view.createDefinition` per upper storey + roof | **K** | `HouseLayoutExecutor.ts:856` |
| Room detection | `RoomDetectionEngine` (shared editor service) | same | **S** | — |
| Room naming | `nameDetectedRooms.ts` | **SAME** (Landing not Hall upstairs) | **S** | `HouseLayoutExecutor.ts:744` |
| Finish chain | per-level triggers, fired ONCE | `runHousePostGenChain.ts` fans the SAME triggers across storeys | **S** engine / **K** fan-out | — |

**Roll-up:** **23 stages SHARED** (everything that decides per-plate room maturity) · **11 stages
house-only spine (KEEP)** · **4 compensating bolt-ons that SHOULD converge** — the parallel program
sizer, the forked envelope validator, the ground weld, and the upper-shell weld.

---

## 3. The "contractual" seams (the reuse contract)

The pipeline is modular because four stable interfaces hold the stages apart. These are the
*reuse contract* — change them only with an ADR. Governance: **ADR-0063** (which layer owns what),
**C53** (engine architecture, topology/geometry separation, determinism), **C16** (command
authoring), **C11** (element creation pipeline), **C15** (hosted openings cascade), **C09**
(in-process AI plane).

| # | Seam | Type / signature | Producer → Consumer | Governing contract |
|---|---|---|---|---|
| ① | **Payload in** | `ApartmentGenerateLayoutPayload` (walls + `isExterior` + opening spans + program + tuning + `siteLatitudeDeg`) | `gatherLayoutPayload.ts` → `generate.ts` plane (C09 `runtime.ai.layoutOptions`) | C53 §5, C09, C19 (site lat) |
| ② | **Engine out** | `ScoredLayoutOption` (apartment) · `HouseLayoutResult { storeys[], perStoreyLayout: (ScoredLayoutOption\|null)[], stairs[], voids[], roof }` + `ScoredHouseLayoutOption` (house variant) | `generateDeterministicLayouts` → orchestrator → executor | C53 §5 (`ParametricBIMElement` target shape); `houseLayout/types.ts:176,194` |
| ③ | **Plan → commands** | `buildLayoutCommands(option) → Command[]` (pre-minted ids; `skipExteriorWalls` flag) | engine option → executor batch | C16 (command authoring), C11 (creation pipeline) |
| ④ | **Command verbs** | `wall.batch.create` · `wall.createOpening` (C15 cascade) · `door.batch.create` · `window.batch.create` · `roomBoundingLine.create` — all inside ONE `BatchCoordinator.runBatch` (single undo) | both executors → command bus | C16, C11, C15 |

**Why these four make the system modular:** the engine never knows whether it is producing an
apartment or a house storey (it sees only seam ① in, seam ② out); the executor never knows how the
plate was tiled (it sees only seam ② in, seams ③/④ out). The house spine (`▒`) is *additive on top
of seam ②* — it wraps the engine call and appends spine commands after `buildLayoutCommands` —
without ever reaching inside the engine. **The bolt-ons (`░`) are the only places that violate the
contract's spirit:** they sit *between* seam ① and the engine, mutating the plate/program before
the shared engine sees it, which is exactly why ADR-0063 H1 commits to retiring them into the
shared path.

> **Seam invariant (C53 §1 L-PRINCIPLE):** topology (dimensionless graph) stays separate from
> geometry (the projection). The only coordinate allowed into the topology is the locked stair
> core (`stairLocationLocked`) — which is precisely the house spine's single contractual reach into
> the shared engine, via `keepOutRectsWorld`. This is the architecturally-correct place for the
> house to influence the engine, and it is honoured today (ADR-0063 H3).

---

## 4. Modularity + robustness recommendations

### 4.1 Modularity — make the house reuse MORE of the apartment path

The four `░`/weld rows in §2 are the entire modularity debt. ADR-0063 H1 + audit §4–§5 already
specify the convergence; the smallest ordered set:

- **M-A (Stage 1, smallest first slice — highest leverage).** Make the **GROUND** storey close
  rooms against the **engine-authored perimeter** ring (`_buildPerimeterShell`) the upper storeys
  already use, instead of welding partitions onto the user's post-miter drawn shell. Localised to
  the `isGround` branch (`HouseLayoutExecutor.ts:434-503`); reuses an existing module; kills the #1
  "merged room" defect (audit Gap 1) and lets `weldPartitionsToShell` degrade to a defensive
  fallback. Apartment untouched → zero regression risk. *Status: partially shipped as
  `§GROUND-ENGINE-PERIMETER`, but prod still takes the `WELD-FALLBACK` path on rotated plates (see
  §4.3) — finish it so the ENGINE-PERIMETER path is the default.*
- **M-B (Stage 2).** Retire the **parallel program sizer**: give the engine's `scaleProgramToShell`
  a `plateRole: 'ground'|'upper'|'single'` parameter instead of maintaining
  `enrichStoreyProgramToPlate`/`fillGroundPlate`/`houseStoreyBand` as a second density model. Keep
  `allocateProgramToStoreys` (splitting a whole-house brief is genuinely additional). Remove the
  `presentedArea`/§AREA-AGREEMENT reconciliation that exists only to feed the fork
  (`houseOrchestrator.ts:472-484`).
- **M-C (Stage 3).** Unify the **envelope validator** into one parameterised by "judge by full
  programme" (the house behaviour, arguably correct for apartments too), removing the
  injected-validator fork — one `validateEnvelope(shell, program, mode)` instead of
  `validateApartmentEnvelope` + `validateHouseStorey`.
- **M-D (Stage 4).** Solve **windowless-habitable-room + from-scratch entrance door** ONCE in the
  shared engine/window-emission + a shared entrance helper (apartment-from-scratch can reuse it),
  rather than re-deriving them in `HouseLayoutExecutor.ts:473-518`.

After M-A…M-D the house layer's surface shrinks to exactly the `▒` spine — the diagram's house
picture becomes "apartment column + storey loop + stair/slab/roof commands", nothing else.

### 4.2 Robustness — items surfaced by recent prod fixes

The recent fixes already hardened **both** paths through the shared engine (so the apartment
benefits for free): `§FRACTURE-SEAL` (`wallsAndDoors.ts:35` — multi-storey room-merge: only genuine
shell-ring walls classify as exterior), `§RECTIFY-SHELL-PROJECT` (project bbox-edge partition
endpoints onto the real sheared shell within the 20 mm node grid by construction, ADR-0063 H5),
`§STAIR-CONTAIN-UPSTREAM` (keep-out == shipped footprint, ADR-0063 H3), `§STAIR-DEFAULT-BIAS`
(corner-anchor, never central, ADR-0063 H4), `§TOPO-HARD-REJECT` (prefer hard-valid candidates),
`§WINDOW-MANDATORY-RESCUE` (a windowMandatory room never ships 0 windows), `§LANDING-NOT-HALL`
(entrance hall ground-only). Remaining robustness work:

- **R-1 — finish M-A so the rotated-plate ground stops taking `WELD-FALLBACK`.** §8.5.5 shows the
  same prod run still merged on the rotated ground because the drawn shell drifted off the engine
  ring and the load-bearing weld ran, while `WallJoinResolver` reported `§MULTI-CLUSTER …
  PASS-THROUGH` + one `§WJR-INVALID self-cluster`. M-A removes the weld-fallback cause; the
  upstream stair containment (shipped) removed the partition-cutting cause.
- **R-2 — stair reserve should BOUND the full U/L footprint** so the upstream containment offset
  shrinks toward 0 on a wall-flush stair (ADR-0063 §8.5.4 step-2 refinement). Today the offset can
  be ~1–2 m on a tight plate; the cure made it *consistent* between keep-out and shipped, which
  closes the merge, but a zero-offset reserve is cleaner.
- **R-3 — treat the stair footprint as a first-class circulation node** rather than an obstacle the
  rooms merely tile around (ADR-0063 §8.5.4 step-3).

### 4.3 ⚠ §TOPO-HARD-REJECT-ALL observation (FLAG FOR REVIEW)

**On the successful 146 m² 2-bed apartment prod plot, ALL 8 strategies failed the hard-topology
[W]indow rule yet the layout shipped (least-bad with a loud `§TOPO-HARD-REJECT-ALL`).** This is the
documented safe-floor behaviour — the pool is never emptied (`enumerate.ts` `selectTier`, algorithm
§5.4.1) — so the *engine* did the right thing. But ALL-8 failing the window rule on a not-small
2-bed plate means one of two things, and **it needs review**:

1. **The daylight/frontage gate is too strict** — the **W** rule reuses `validateFrontage`'s hard
   findings intersected with `windowMandatoryFor` (algorithm §5.4.1 rule 1). If a habitable room is
   *barely* interior (e.g. a kitchen tucked behind an open-plan living that genuinely has the
   façade), the gate may be counting it windowless when the open threshold actually carries light.
   → audit whether `windowMandatoryFor` should treat an open-plan-adjacent room as frontage-served.
2. **A real frontage shortfall** — the plate genuinely cannot give every windowMandatory room a
   perimeter wall (a deep plan with too many habitable rooms for its façade length). → this is a
   *brief/plate* mismatch the modal should surface, not silently ship.

Either way the **modal should surface the `§TOPO-HARD-REJECT-ALL` reason** (which rule, which
rooms) the way `§ENVELOPE-DIAGNOSTIC` surfaces a rejection — so "shipped least-bad" is an informed
choice, not invisible. Recommend a focused investigation: re-run the 146 m² plot with
`§DIAG-TOPO-GATE` logging on, confirm which rooms the W rule flags, and decide gate-loosen
(case 1) vs surface-and-warn (case 2). *This is the one concrete robustness gap the successful prod
test exposed.*

---

## 5. Contract recommendation

**Promote, do not multiply.** The shared generative-layout pipeline is *already* governed:

- **C53** owns the **engine architecture** (topology/geometry separation, determinism, the
  data-contract seams ①②, scoring, slider-intent) — this is the "shared generative-layout pipeline
  contract" the brief asks whether to create. **It already exists.** The reuse seams ③④
  (`buildLayoutCommands` + command verbs) are governed by **C16** + **C11** + **C15**, also extant.
- **ADR-0063** owns the **house doctrine** (per-storey apartment pipeline + spine-only additions;
  H1–H5). It is the layer-ownership decision that the diagram visualises.

So a **new C-number is NOT warranted** — it would duplicate C53 + ADR-0063 and violate the "edit
the canonical doc in place, never write a derivative" governance rule (CLAUDE.md). The right move:

1. **Add a one-line cross-reference in C53 §10** pointing to this diagram doc as the *canonical
   picture* of the apartment-vs-house split, and to ADR-0063 as the house-layer doctrine.
2. **Add the four contractual seams (§3 table) into C53 §5** as the named, ADR-governed reuse
   contract (C53 §5 currently describes the topology/geometry data contract but does not name seams
   ③/④ — `buildLayoutCommands` + the command verbs — as part of the contract surface).
3. **Promote ADR-0063 from a doctrine ADR to a referenced clause in C53** by linking it from C53 as
   the binding house-layer ruling (C53 already cross-refs ADR-0061/0062; add ADR-0063). No new
   contract; ADR-0063 *is* the promotion vehicle.

This keeps a single source of truth: **C53 = the pipeline contract**, **ADR-0063 = the house split
ruling**, **this doc = the diagram**, **LAYOUT-GENERATION-ALGORITHM = the code walkthrough**.

---

## 6. Cross-references

- [HOUSE-APARTMENT-UNIFICATION-AUDIT-2026-06-09](../03-execution/plans/house-apartment-unification-audit-2026-06-09.md) — the gap audit + staged plan (this doc's §2 table extends its §2).
- [ADR-0063](../02-decisions/adrs/ADR-0063-house-generative-layout-doctrine.md) — house generative-layout doctrine (H1–H5); the layer-ownership ruling the diagram draws.
- [C53 — Generative Layout Engine Architecture](../02-decisions/contracts/C53-GENERATIVE-LAYOUT-ENGINE-ARCHITECTURE.md) — the engine architecture contract (seams ①②, determinism, topology/geometry).
- [C16](../02-decisions/contracts/C16-COMMAND-AUTHORING-PROTOCOL.md) · [C11](../02-decisions/contracts/C11-ELEMENT-CREATION-PIPELINE.md) · [C15](../02-decisions/contracts/C15-HOSTED-ELEMENT-CONTRACT.md) — seams ③④ (command authoring / creation / hosted openings).
- [LAYOUT-GENERATION-ALGORITHM](./layout-generation-algorithm.md) — the prose drill-down (§8.4 why-apartment-beats-house, §8.5 stair root-cause, Appendix A §-tag glossary).
- [SPEC-CASA-UNIFAMILIAR-TYPOLOGY](../03-execution/specs/SPEC-CASA-UNIFAMILIAR-TYPOLOGY.md) — the house typology spec (orchestration / stair / envelope).
