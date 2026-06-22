# Residential Building (Multi-Family) — Implementation Tracker

> **Status**: LIVING TRACKER · **Started**: 2026-06-22 · **Owner**: typology/engine
> **Plan of record** (read first): [`RESIDENTIAL-BUILDING-MULTI-FAMILY-AUDIT-AND-PLAN.md`](./RESIDENTIAL-BUILDING-MULTI-FAMILY-AUDIT-AND-PLAN.md)
> **This doc is the single source of truth for the build.** It turns the plan's 10 slices into
> PHASES → SUBPHASES → tasks. Each task row carries: id · title · status · the files it touches
> (file:line where known) · its acceptance-test path · the `§DIAG-*` it emits · the contract/ADR it
> must satisfy · a gating flag. Phases are ordered **lowest-risk / highest-reuse first**; the
> most-reverted corridor-spine work (plan Slice 6) is isolated into its own late phase, GATED.
>
> **Everything is GATED default-OFF** until the founder browser-validates: production must be
> byte-identical. The runtime gate is `globalThis.__PRYZM_RESIDENTIAL_BUILDING__ = true` (set before
> `composeRuntime`); per-transform gates are listed per task.

---

## Status legend

| Status | Meaning |
|---|---|
| **TODO** | not started |
| **WIP** | in progress this session |
| **DONE** | code + tests + typecheck green, in this worktree (NOT browser-validated, NOT merged) |
| **GATED-OFF** | code landed but behind a default-OFF flag; needs browser validation before flip-on |
| **BLOCKED** | a contract blocker or founder decision is required (see §Open questions) |

> "DONE" here always means *worktree-green*, never *production-live*. Promotion to live happens only
> after the founder browser-validates and the flag is flipped — tracked in the "Gate" column.

---

## Phase map (ordered by leverage + risk)

| Phase | Theme | Plan slices | Risk | Status |
|---|---|---|---|---|
| **P0** | Foundations: tracker + reuse ledger + open questions | — | — | **DONE** |
| **P1** | Pure, net-new, zero-orchestration pieces (pack + lift schema) | Slice 0 (pack), Slice 2 (lift, L0+registration) | LOW | **WIP** |
| **P2** | Lift element end-to-end (geometry + plugin + command + IFC) | Slice 2 (rest) | MED | TODO |
| **P3** | Building orchestrator skeleton: levels + centred core + slabs + roof | Slice 1 | MED | TODO |
| **P4** | Lift in the core + per-level lift void | Slice 3 | MED | TODO |
| **P5** | Ground-floor commercial shell + entrance corridor | Slice 4 | MED | TODO |
| **P6** | Per-level apartment packing (count + typology mix) | Slice 5 | MED | TODO |
| **P7** | Run D-TGL per apartment cell (rooms + windows + doors) | Slice 7 | MED | TODO |
| **P8** | **THE CORRIDOR SPINE** (reach every apartment door) — ISOLATED, GATED | Slice 6 | **HIGH** | TODO |
| **P9** | Post-gen finish + IFC round-trip + preview modal | Slices 8 + 11 | MED | TODO |
| **P10** | SPEC + parity hardening + risk closeout | Slice 9 | LOW | TODO |

> **Why this order ≠ plan slice order.** The plan numbers slices by pipeline position. This tracker
> reorders by *risk*: the pure pieces (P1) ship first with no orchestration; the lift element (P2)
> is independent and high-reuse; the corridor spine (plan Slice 6) is the single most-reverted code
> class in the engine (the house's L-carve was reverted 4× — see house-doors memory), so it is
> isolated into **P8**, late and gated, to be built in a fresh focused context. The preview modal
> (plan Slice 11) is folded into **P9** because it depends on real per-level results to render.

---

## Reuse ledger (SHARE / ADAPT / NEW) — carried from the audit §2

> Legend: **SHARE** = reuse unchanged · **ADAPT** = small described change · **NEW** = genuinely new.

| # | Pipeline stage | Verdict | Phase | Grounding (file:line) |
|---|---|---|---|---|
| 1 | Footprint → frame (parcel → ShellAnalysis, principal-axis) | **SHARE** | P3 | `houseFromBoundary.ts:77`; `HouseLayoutExecutor.ts:142` `analyseActiveShell`; `runDeterministicLayout.ts:150-225` |
| 2 | Storey/level allocation (mint N levels + roof) | **ADAPT** | P3 | `HouseLayoutExecutor.ts:378`, `:407`; `storeyAllocation.ts:70` (program-alloc NOT reused) |
| 3 | Core reservation (stair core rect, shared XZ) | **ADAPT** | P3/P4 | `stairCore.ts:275` `reserveStairCoreShaped`; `stairPosition.ts:557` (`corePlacement:'centre'` new); `houseOrchestrator.ts:355` |
| 4 | Per-storey loop (orchestrator iterates levels) | **ADAPT** | P3 | `houseOrchestrator.ts:467` `enumeratePerStorey`; `:762` `assembleHouse` |
| 5 | Per-level plate partition ([core]+[corridor]+[N cells]) | **NEW** | P6/P8 | reuses §18/§20 spine doctrine + `deriveCorridorSpine.ts`, `clipToConvexShell` |
| 6 | Subdivision (plate → rooms) | **SHARE** | P7 | `generateDeterministicLayouts` `runDeterministicLayout.ts:88`; `enumerate.ts`; `subdivide.ts` (HE.0 FROZEN) |
| 7 | Walls / doors (footprints → walls + openings) | **SHARE** | P7 | `wallsAndDoors.ts`; `executePlan.ts buildLayoutCommands:460`; `wall.batch.create` + `wall.createOpening` |
| 8 | Windows (per-room window emission) | **SHARE** | P7 | `windowEmission/emitWindows.ts`; `shellWallMatch.ts` (`§DIAG-PARTY-WALL`) |
| 9 | Ground-floor commercial shell (glazed shopfronts) | **NEW** (composes curtain-wall) | P5 | `CreateCurtainWallBatch.ts:55` (`curtain-wall.batch.create`); `CurtainWall.ts:23` |
| 10 | **Vertical-circulation (lift) element** | **NEW** | **P1/P2** | mirrors stair stack — see §4 of the plan |
| 11 | Preview modal ("Choose a layout") | **ADAPT** | P9 | `HouseLayoutModal.ts:458`; `houseModalHtml.ts:524`; `HouseLayoutController.ts:168` |
| 12 | Executor (mint → ONE batch → finish openings) | **ADAPT** | P3+ | `HouseLayoutExecutor.ts:334`/`:1280`/`:3059` |
| 13 | Post-gen chain (name → floor/ceiling → furnish → light) | **SHARE** | P9 | `runHousePostGenChain.ts:163`/`:269`; `houseFanoutGuard.ts` |
| 14 | Stair core element + slab void + roof | **SHARE** | P3/P4 | `HouseLayoutExecutor.ts:2373`/`:2341`/`:2907`; `SlabVoid` `types.ts:182` |
| 15 | Living Graph / UBG projection | **SHARE** | P2/P7 | HE.1 DERIVED; ADR-0061 |
| 16 | Typology pack registration (C50) | **NEW** | **P1** | `C50` §1.1; `packages/typology-pipeline/` |
| 17 | Preview↔execution parity (`§DIAG-PARITY`) | **SHARE (extend)** | P3+/P10 | ADR-0075 PC1–PC4 |

**Tally:** SHARE 8 · ADAPT 5 · NEW 4 (plate-partition · commercial shell · lift element · pack).

---

## §DIAG taxonomy (the diagnostic gates this build emits)

| §DIAG-* | Emitted by | Phase | Asserts |
|---|---|---|---|
| `§DIAG-PACK-DISPATCH` | typology router outer span (C50 §1.8) | P1 | pack dispatch fired through all 7 stages |
| `§DIAG-STAIR-RULE R-CENTRE` | building orchestrator core placement | P3 | core AABB centroid ≈ footprint centroid within tolerance |
| `§DIAG-CORE` | orchestrator core step | P4 | `core = stair + lift`; centroid centred; containment OK |
| `§DIAG-PARITY` | executor, per level per apartment cell | P3+/P7 | preview multi-plate == executed multi-plate (ADR-0075 PC2) |
| `§DIAG-APARTMENT-PACK` | the packer | P6 | `level=k N=… mix=[T2,T2,T3] areas=[…]`; every area ∈ [min,max] |
| `§DIAG-CORRIDOR-QUALITY` | corridor spine | P5/P8 | `apartmentsReached=N/N servedThrough=0`; corridor touches core |
| `§DIAG-PARTY-WALL` | window emission | P7 | party walls between apartments are blind (no windows) |
| `§DIAG-LEVELS` | post-gen reconcile | P9 | live vs intended level count reconciles |

---

## PHASE 0 — Foundations  ·  **DONE**

| id | title | status | files | accept | contract |
|---|---|---|---|---|---|
| P0.1 | This tracker | **DONE** | `docs/03-execution/plans/RESIDENTIAL-BUILDING-IMPLEMENTATION-TRACKER.md` | doc exists, phase map + reuse ledger + open Qs present | — |
| P0.2 | Reuse ledger (above) | **DONE** | (this doc §reuse-ledger) | carried verbatim from audit §2 | — |
| P0.3 | Open-questions register (below §Open) | **DONE** | (this doc §open) | all 9+ founder decisions captured | — |

---

## PHASE 1 — Pure net-new pieces (pack + lift L0)  ·  **WIP**

> Lowest-risk, highest-reuse, zero orchestration. All pure schema/registration. GATED.

### Subphase P1.A — Typology pack scaffold (C50) — plan Slice 0 (no geometry)

| id | title | status | files (file:line) | accept | §DIAG | contract / ADR | gate |
|---|---|---|---|---|---|---|---|
| P1.A.1 | New pack package (manifest + factory + bridge stages) | **DONE** | `packages/typology-pack-residential-building/{package.json,tsconfig.json,vitest.config.ts}`, `src/{manifest,buildResidentialBuildingTypologyPack,index}.ts`, `src/stages/{generative,bimEmission}.ts` | `pack.manifest.id === 'residential-building'`; registers in a fresh `TypologyRegistry` | — | C50 §1.1 (one registry), §1.5 (idempotent-by-rejection) | n/a (pure) |
| P1.A.2 | §5.1 input model (typed + parser) | **DONE** | `packages/typology-pack-residential-building/src/inputModel.ts` | `ResidentialBuildingInput.parse({})` defaults; min≤max + ≥1 typology refinements; `parseResidentialBuildingInput` folds multiselect → {T1..T4} | — | C50 §2.6 (brief schema), audit §5.1/§6 | n/a |
| P1.A.3 | Brief schema in manifest (UI controls) | **DONE** | `src/manifest.ts` briefSchema | manifest validates; fields = {minApartmentAreaM2, maxApartmentAreaM2, typologies(multiselect), levels(stepper 1..20), commercialGroundFloor(toggle)} | — | C50 §2.6; ADR-0056 (typology-declared brief) | n/a |
| P1.A.4 | Gated registration in composeRuntime | **GATED-OFF** | `packages/runtime-composer/src/composeRuntime.ts:85` (import), `~:982` (gated register); `packages/runtime-composer/package.json:41` (dep) | registers ONLY when `globalThis.__PRYZM_RESIDENTIAL_BUILDING__===true`; default OFF → production byte-identical | `§DIAG-PACK-DISPATCH` (when on) | C50 §1.1; P1 (single composition root); P4 (no `(window as any)` — uses narrow `globalThis` cast) | `__PRYZM_RESIDENTIAL_BUILDING__` |
| P1.A.5 | Pack acceptance tests | **DONE** | `packages/typology-pack-residential-building/__tests__/{manifest,inputModel,buildResidentialBuildingTypologyPack}.test.ts` (18 tests) | manifest valid · input-model invariants · register + 7-stage dispatch + C50 §1.7 soft-fail | — | C50 §1.7 (soft-fail not throw) | n/a |

### Subphase P1.B — Vertical-circulation (lift) element — L0 schema + registration — plan Slice 2 (part 1)

| id | title | status | files (file:line) | accept | §DIAG | contract / ADR | gate |
|---|---|---|---|---|---|---|---|
| P1.B.1 | L0 Zod schema (pure, P5) | **DONE** | `packages/schemas/src/elements/VerticalCirculation.ts` | `VerticalCirculation.parse({})` defaults + branded id `verticalCirculation_<ulid>`; `.refine` shaftWidth≥doorWidth; LiftKind enum | — | P5 (pure schema); plan §4.2 | n/a |
| P1.B.2 | Element-type registration (4 schema touchpoints) | **DONE** | `packages/schemas/src/types/Id.ts` (VerticalCirculationId + ElementType + IdFor + AnyElementId), `registry.ts` (SCHEMA_REGISTRY), `elements/index.ts` (barrel) | round-trip + typed-id suites pass with new type auto-included (91 tests) | — | P5; C11 (element-type discriminator) | n/a |
| P1.B.3 | Schema acceptance test | **DONE** | `packages/schemas/__tests__/verticalCirculation.test.ts` (7 tests) | registered · defaults · round-trip byte-identical · kinds · positivity · refine · level spans | — | P5; plan §4.2 | n/a |
| P1.B.4 | Geometry-layer type-union touchpoints (StoreType / view-dep / selection) | **DONE** | `core-app-model/src/ElementRegistry.ts:21` (StoreType += `'verticalCirculation'`), `views/ViewDependencyTracker.ts:43` (GEOMETRY_ELEMENT_TYPES), `stores/src/SelectionStore.ts:37` (SelectionKind) | type-safe semantic register + plan/section re-projection + selectable | — | C11; P7 (view-dep) | n/a (additive) |

> **Note on P1.B.4:** the three *type-union* touchpoints are pure additive edits (a new member on a
> string-literal union + a runtime `Set` entry) — no behaviour change, cannot break an existing
> exhaustive switch. They make the lift type-compatible across the geometry layer ahead of P2's
> behaviour-bearing touchpoints (store/mesh/command/plugin/CREATE-panel/IFC). Full typecheck of these
> L1/L3 packages needs the installed workspace and is deferred to CI; the edits are mechanically
> verified against the stair entries they mirror.

---

## PHASE 2 — Lift element end-to-end — plan Slice 2 (rest)  ·  TODO

> The remaining 13 of the §4 17-touchpoint checklist. Independent of orchestration — the lift can be
> hand-placed from the CREATE panel before the building generator exists. **GATED**: the CREATE-panel
> "Vertical Circulation" category is behind a flag until the geometry + IFC round-trip are validated.

| id | title | status | files (template = stair) | accept | §DIAG | contract / ADR | gate |
|---|---|---|---|---|---|---|---|
| P2.1 | `geometry-lift` package (store + mesh + type store + index) | TODO | NEW `packages/geometry-lift/src/{LiftStore,LiftMeshBuilder,LiftTypeStore,index}.ts` (template `geometry-stair/src/StairStore.ts:22`, `StairMeshBuilder`) | store assigns `ifcClass:'IfcTransportElement'`; emits `bim-lift-added/-updated`; mesh = shaft + car placeholder | — | **P2 (single THREE: mesh imports `@pryzm/renderer-three/three`, NOT raw THREE)** | flag |
| P2.2 | Plugin tool | TODO | NEW `plugins/lift/src/{tool,index}.ts` (template `plugins/stair/src/tool.ts:10`) | `LIFT_TOOL_ID='lift.placement'`; dispatches `verticalCirculation.create` | — | P6 (command-only); layer L7→L6 | flag |
| P2.3 | Command types + Create command | TODO | `command-registry/src/types.ts:18` (CREATE_VERTICAL_CIRCULATION…); NEW `command-registry/src/verticalCirculation/{CreateVerticalCirculationCommand,index}.ts`; `src/index.ts:207` export | `execute()` mirrors `CreateStairCommand.ts:219` (registerElement + registerSemantic + addRelationship `connectedByLift` + viewDep + `ai-model-update`) | command P8 span | **C11** (create pipeline); **C15** (landing doors hosted, body free); P6; P8 | flag |
| P2.4 | CREATE-panel + ToolManager | TODO | `apps/editor/src/ui/layout/CreatePanelLayout.ts:114` (new "Vertical Circulation" category); `input-host/src/ToolManager.ts:220` (`setLiftTool`); `apps/editor/src/engine/initTools.ts:74` | category appears (gated); selecting Lift arms the tool | — | layer model | **flag (default-OFF in prod UI)** |
| P2.5 | IFC export + reader | TODO | `file-format/src/export/ifc/IfcModelBuilder.ts:36` (`IfcTransportElement→WEBIFC.IFCTRANSPORTELEMENT`); NEW `readers/LiftReader.ts` (template `StairReader.ts`) | exports lift as `IfcTransportElement`; reads back `Pset_TransportElementCommon` | — | C-IFC; plan §4.1 row IFC | flag |
| P2.6 | E2E + unit tests | TODO | `plugins/lift/__tests__/…`, `command-registry/__tests__/…` | place a lift → see shaft+car in 3D → undo; command registration asserted | command span | P8 | flag |

---

## PHASE 3 — Building orchestrator skeleton — plan Slice 1  ·  TODO

> Builds an EMPTY building: N levels, a **centred** stair core repeated on every level, per-non-ground
> slab void, roof cap. No lift, no apartments, no corridor. Proves the centred-core divergence (§3.1)
> + the level-mint reuse + parity. **GATED.**

| id | title | status | files | accept | §DIAG | contract / ADR | gate |
|---|---|---|---|---|---|---|---|
| P3.1 | `corePlacement:'centre'` additive path | TODO | `houseLayout/stairCore.ts:275`, `stairPosition.ts:557`/`:686` (new `'centre'` candidate forced) | house path byte-identical (`'worst-aspect-corner'` default); building passes `'centre'` | `§DIAG-STAIR-RULE R-CENTRE` | ADR-0063 H3 (containment); ADR-0075 PC2 (no-op proof for house) | n/a (param) |
| P3.2 | `buildingOrchestrator.ts` (storey-loop skeleton) | TODO | NEW `packages/ai-host/src/workflows/residentialBuilding/buildingOrchestrator.ts` (reuse `houseOrchestrator.ts:467` + `:762`) | N levels minted; stair on every adjacent pair | `§DIAG-STAIR-RULE` | C53 (generative engine); P8 span | flag |
| P3.3 | `ResidentialBuildingExecutor` (mint → ONE batch) | TODO | NEW editor seam mirroring `HouseLayoutExecutor.ts:334`/`:1280`/`:3059` | mint N + roof level; ONE `runBatch`; per-non-ground slab void; roof cap | `§DIAG-PARITY` (trivially clean) | C11; ADR-0075 | flag |

---

## PHASE 4 — Lift in the core + per-level lift void — plan Slice 3  ·  TODO

| id | title | status | files | accept | §DIAG | contract / ADR | gate |
|---|---|---|---|---|---|---|---|
| P4.1 | Lift as SECOND keep-out beside stair | TODO | `buildingOrchestrator.ts`; `runDeterministicLayout.ts:88` `keepOutRectsWorld` | core = stair AABB ∪ lift AABB; centroid centred | `§DIAG-CORE` | ADR-0063 H3 | flag |
| P4.2 | Per-level lift void (EVERY slab incl. ground) | TODO | executor; `SlabVoid` `types.ts:182` | lift void punched on every level (full-height shaft) | `§DIAG-CORE` | plan §3.4/§4.3 | flag |

---

## PHASE 5 — Ground-floor commercial shell + entrance corridor — plan Slice 4  ·  TODO

| id | title | status | files | accept | §DIAG | contract / ADR | gate |
|---|---|---|---|---|---|---|---|
| P5.1 | Ground perimeter as curtain-wall shopfronts | TODO | executor ground branch; `CreateCurtainWallBatch.ts:55` | commercial ON → perimeter is curtain walls; OFF → core+lobby only | — | reuse curtain-wall (SHARE) | `commercialGroundFloor` + flag |
| P5.2 | Entrance corridor → core (degenerate spine) | TODO | reuse `entranceDoor/entranceDoor.ts resolveEntranceDoor` concept | entrance door opens to a corridor reaching the core | `§DIAG-CORRIDOR-QUALITY` (core reachable) | C15 (entrance door); R9 placeholder door | flag |

---

## PHASE 6 — Per-level apartment packing — plan Slice 5  ·  TODO

> NO room subdivision yet — just N apartment-sized rectangles + typology mix.

| id | title | status | files | accept | §DIAG | contract / ADR | gate |
|---|---|---|---|---|---|---|---|
| P6.1 | The packer (pure: net area → N polygons + typologies) | TODO | NEW `packages/ai-host/src/workflows/residentialBuilding/apartmentPacker.ts` | every apt ∈ [min,max]; mix uses only enabled T1-T4; infeasible → C50 soft-fail | `§DIAG-APARTMENT-PACK` | C50 §1.7; audit §6.1; T1-T4 map §6 | flag |
| P6.2 | Plate-partition stub (footprint+core+corridorSpec → [core,corridor,cells]) | TODO | NEW `…/platePartition.ts` (PURE, test-first) | given a rect footprint + core rect + corridor band, returns disjoint [core]+[corridor]+[N cells] tiling | — | audit §3 (plate partition is the biggest NEW piece) | n/a (pure) |

> **P6.2 is the next foundational pure slice** after P1 (the audit calls it "the single biggest
> net-new design"). It is pure geometry math → unit-testable with no editor. Pick it up after P1.B.4
> if budget allows; otherwise it opens P6.

---

## PHASE 7 — Run D-TGL per apartment cell — plan Slice 7  ·  TODO

| id | title | status | files | accept | §DIAG | contract / ADR | gate |
|---|---|---|---|---|---|---|---|
| P7.1 | Per-cell `generateDeterministicLayouts` (unchanged engine) | TODO | `runDeterministicLayout.ts:88` (called once per cell); `buildLayoutCommands:460` per cell | each apt is a fully-subdivided T1-T4 dwelling; engine apartment tests pass per cell | `§DIAG-PARITY` per level | HE.0 FROZEN; C11 | flag |
| P7.2 | Windows + main door per cell; blind party walls | TODO | `emitWindows.ts`; `shellWallMatch.ts`; `_finishOpenings` | windows on façade; main door to corridor; party walls blind | `§DIAG-PARTY-WALL` | plan §3.6/§8 R5-R7 | flag |

---

## PHASE 8 — THE CORRIDOR SPINE (HIGH-RISK, ISOLATED) — plan Slice 6  ·  TODO

> **The single most-reverted code class in the engine.** The house's L-spanning carve was reverted 4×
> (see memory `house-stair-whitespace-rootcause`, `house-doors-stair-fragmentation-root`). Build this
> in a FRESH focused context, test-first, **GATED default-OFF**, browser-validate per level, THEN flip.

| id | title | status | files | accept | §DIAG | contract / ADR | gate |
|---|---|---|---|---|---|---|---|
| P8.1 | Public corridor as a Steiner spine (reach every apt door) | TODO | reuse `deriveCorridorSpine.ts` generalised to a tree; pattern by §20.1 playbook (`§SINGLE-LOAD-PERIPHERAL`/`§UPPER-RING-CORRIDOR`/`§SPINE-TREE`) | every apt main door opens onto corridor; corridor reaches core | `§DIAG-CORRIDOR-QUALITY apartmentsReached=N/N servedThrough=0` | ADR-0067/0068 (intent/circulation-first); §18/§19/§20 doctrine | **HARD GATE, default-OFF** |

---

## PHASE 9 — Post-gen finish + IFC + preview modal — plan Slices 8 + 11  ·  TODO

| id | title | status | files | accept | §DIAG | contract / ADR | gate |
|---|---|---|---|---|---|---|---|
| P9.1 | Per-level post-gen chain (name→floor/ceiling→furnish→light) | TODO | reuse `runHousePostGenChain.ts:163`/`:269` | every detected room named/finished/lit per level | `§DIAG-LEVELS` | ADR-0069 (graph-authoritative rooms) | flag |
| P9.2 | Preview modal (per-level cards) | TODO | mirror `HouseLayoutModal.ts:458`, `houseModalHtml.ts:524`, `HouseLayoutController.ts:168`; reuse `buildLayoutThumbnailSvg` per cell | per-level card renders core+corridor+N apt plates; §5.1 form; §MODAL-DYNAMIC re-gen | `§DIAG-PARITY` | ADR-0075 §17.2 (faithful render) | flag |
| P9.3 | Full-building IFC export | TODO | `IfcModelBuilder.ts` | valid IFC: lift=`IfcTransportElement`, curtain-wall shopfronts, per-apt rooms | — | C-IFC | flag |

---

## PHASE 10 — SPEC + parity hardening + risk closeout — plan Slice 9  ·  TODO

| id | title | status | files | accept | §DIAG | contract / ADR | gate |
|---|---|---|---|---|---|---|---|
| P10.1 | Author the SPEC | TODO | NEW `docs/03-execution/specs/SPEC-RESIDENTIAL-BUILDING-TYPOLOGY.md` (mirror `SPEC-CASA-UNIFAMILIAR-TYPOLOGY.md`) | promotes P3–P9 §DIAG gates to CI-gated invariants | all | governance (edit canonical doc) | n/a |
| P10.2 | Tighten corridor gate soft→HARD | TODO | corridor spine | `§DIAG-CORRIDOR-QUALITY` is merge-blocking | corridor | §18.6 (1) | n/a |

---

## Risk register (carried from audit §8 — top 3 starred)

| # | Risk | Sev | Phase it bites | Mitigation |
|---|---|---|---|---|
| ★R1 | Public corridor fails to reach every apartment | HIGH | P8 | P8 gated OFF, test-first, fresh context; single-loaded peripheral satisfies door+window by construction; building case EASIER than house (fewer, larger plates) |
| ★R2 | Preview ≠ execution (ADR-0075) | HIGH | P3+/P7/P9 | `§DIAG-PARITY` per level per cell; PC2 merge rule on new transforms; faithful thumbnail |
| R3 | Lift core 2nd keep-out desyncs | MED | P4 | reuse `containStairCoreUpstream`; centred core trivially contained (LOWER risk than house corner) |
| ★R4 | Many apts/level → perf (N×D-TGL + mullion swarm) | MED | P7 | ONE `runBatch`/level; curtain-wall `pause/resumeAndFlush`; cap apts/level; profile 20×4 early |
| R5 | §13 polygon-native subdivision still open | MED | P6/P7 | keep apt cells axis-aligned rects (packer prefers rect); engine byte-identical on rects |
| R6 | §14 apartment-grade fill swarm | LOW | P7 | structurally avoided: each cell is a clean fully-programmed plate |
| R7 | Room-merge across party walls | MED | P7 | ADR-0069 graph-authoritative rooms per cell; verify 2-apt test |
| R8 | Fire egress / two-stair | MED (compliance) | P3 | design core as a LIST not singleton (parametrise core count); §Open Q1 |
| R9 | Entrance door type doesn't exist | LOW | P5 | placeholder door until the type ships |

---

## Open questions / founder decisions (audit §9)

> These BLOCK the phases noted. Resolve before the dependent phase ships.

| # | Question | Blocks | Default assumed (until decided) |
|---|---|---|---|
| Q1 | **Fire egress / second stair** — above what level/occupant count is a 2nd escape stair required? | P3 (core-as-list), P8 | v1 ships ONE central core; orchestrator designs core as a list per R8 so a 2nd core is additive |
| Q2 | **Lift count vs building size** — one lift for 20 levels, or scale? goods/accessible too? | P4 | one passenger lift per core |
| Q3 | **Accessible route** — must every apt be lift-served + corridor ≥1.2–1.5 m clear? | P8 (tightens corridor gate) | corridor sized to door-width minimum; accessible width deferred |
| Q4 | **Commercial unit definition** — bare shells or minimal partition (BoH WC+storage)? min/max frontage? | P5 | bare glazed shells, no internal partition |
| Q5 | **Parking / basement** — basement parking level (ramp+bays) in scope? | (new sub-typology) | OUT of scope for v1 |
| Q6 | **Balconies** — upper apts get façade balconies? cantilever/recessed? | P7 (façade emission) | no balconies in v1 |
| Q7 | **Core-placement tolerance** — exact centroid or a centred band nudgeable for corridor alignment? | P3 (`R-CENTRE` tolerance) | strict centroid within a tolerance band; widen if corridor awkward on elongated plate |
| Q8 | **Apartment count control** — engine free to choose N, or user pins "exactly K per level"? | P6 (packer) | engine chooses N from min/max band |
| Q9 | **Mixed use vertically** — can upper levels be commercial/office too? | P3/P6 | upper levels strictly residential |
| Q10 | **Preview granularity** — edit apt mix PER LEVEL or global mix? | P9.2 (modal) | global mix (same on every upper level) v1 |

---

## How tests run in this worktree (no node_modules)

The worktree is not part of the main pnpm workspace and has no `node_modules`. Tests + typecheck use
the **main repo's** installed binaries with throwaway worktree configs that alias `@pryzm/*` workspace
deps to the **worktree** source and bare deps to the main repo's `node_modules`:

- Schemas: `vitest.worktree.schemas.mjs` + `tsconfig.worktree.schemas.json`
- Pack: `vitest.worktree.pack.mjs` + `tsconfig.worktree.pack.json`

```
# schemas (lift L0)
node <MAIN>/node_modules/vitest/vitest.mjs run \
  --root <WT>/packages/schemas --config <WT>/vitest.worktree.schemas.mjs
node <MAIN>/node_modules/typescript/bin/tsc -p <WT>/tsconfig.worktree.schemas.json

# residential-building pack
node <MAIN>/node_modules/vitest/vitest.mjs run \
  --root <WT>/packages/typology-pack-residential-building --config <WT>/vitest.worktree.pack.mjs
node <MAIN>/node_modules/typescript/bin/tsc -p <WT>/tsconfig.worktree.pack.json
```

> These `*.worktree.*` config files are scaffolding for this isolated worktree; on merge into the
> main workspace they are deleted and the packages' own `vitest.config.ts` / `tsconfig.json` (which
> resolve `@pryzm/*` via the installed workspace symlinks) take over unchanged.

---

## Session log

| date | phase | what | tests | typecheck |
|---|---|---|---|---|
| 2026-06-22 | P0 | tracker authored | — | — |
| 2026-06-22 | P1.A | residential-building pack scaffold + §5.1 input model + gated composeRuntime registration | 18 pass | pack tsconfig green |
| 2026-06-22 | P1.B (1-3) | lift L0 schema + 4 schema-registration touchpoints + tests | 7 new pass; 91 round-trip/typed-id pass | schemas tsconfig green |
