# PHASE 1 (1A + 1B + 1C) — Full instructed-vs-actual audit

> **Status**: AMBER — sub-phases 1A and 1B are essentially delivered; sub-phase 1C is **structurally present but not wired and not parity-covered**. The architecture's headline claim ("12 element families end-to-end") is true at the package level and false at the runtime level.
>
> **Date of audit**: 2026-04-27
> **Auditor**: Replit Agent (read-only, no code modifications)
> **Scope**: every exit-criterion line item in `phases/PHASE-1A`, `phases/PHASE-1B`, `phases/PHASE-1C` checked against the live tree.
> **Method**: file-by-file enumeration of plugins, packages, parity fixtures, ESLint rules, ADRs, bench files, integration tests, and editor wiring; no test execution; comparison against the typed contracts and exit criteria printed in the phase docs.
> **Companion document**: `audits/PHASE-1B-Q2-M4-M6-AUDIT.md` (covers 1B in more depth and reaches the same AMBER verdict). This document supersedes that one for 1A and 1C and confirms its 1B findings with two updates (cascade is now fully delivered; stair/handrail/ceiling parity has landed since that audit was written).

---

## §0 Verdict at a glance

| Sub-phase | Spec exit-criteria delivered | Spec exit-criteria missing | Verdict |
|---|---|---|---|
| **1A — Skeleton & rails (M1–M3)** | L0–L7 stack, 4 of 5 ESLint rules, ADRs 0001–0007, hello-cube, dual-mode bootstrap, schemas (20 elements > spec 12), legacy-shim probe, FrameScheduler with idle continuation | 1 ESLint rule (`pryzm-store-single-channel`); two ADR file IDs slipped (numbering convention drifted) | **GREEN** |
| **1B — Wall end-to-end (M4–M6)** | 16 wall handlers (spec 14, 2 extra), `WallCommitter`, `intent.ts`, `occupancy.ts`, full Tool with Straight/Arc/Polyline, 30-case parity, `CascadeRunner` with cycle drop, `SelectionStore`, ADRs 0008–0013, editor `bootstrapRenderWithWalls()` | Persistence-snapshot threshold ADR (0014 in 1B numbering) never written under that ID — folded into other ADRs; bench has only `produce-wall-baseline.md` published | **GREEN** |
| **1C — Element families + harden (M7–M9)** | All 12 producers + 12 plugins (every plugin has `committer/`, `handlers/`, `intent.ts`, `store.ts`, `tool.ts`, `errors.ts`); renderer `Bloom/TRAA/SSGI/IdleAccumulator`; `@pryzm/picking` with `gpu-pick`/`bvh-pick`/`PickStrategyResolver`; `@pryzm/view-state` + `view` plugin (5 handlers) + `ActiveViewStore`; `@pryzm/cross` for slab-wall and stair-handrail coupling; `apps/headless` with 4-command CLI and K1-B test; ADRs 0014–0017; 12 produce-* benches + dashboard scaffold; integration test `all-12-elements.test.ts` | **Editor wires only the wall plugin** (11 of 12 plugins not in any bootstrap); **6 of 12 element families have ZERO parity fixtures** (door, window, slab, grid, column, beam); curtain-wall parity is 8 of the 25 cases the spec budgets; roof handlers 8 of 10 spec'd (no AddSkylight / RemoveSkylight / JoinRoofs); no Playwright config or `*.spec.ts` suite in repo; `tests/integration/headless-vs-browser-parity.spec.ts` and `tests/integration/view-state-2a-readiness.test.ts` do not exist; bench dashboard has scaffold but `M9-1C-baseline.md` is not published; demo recording absent | **AMBER** — package layer is real, runtime is not |

**Bottom line.** Anyone reading the package list would correctly conclude "PRYZM 2 has 12 element families implemented." Anyone running `apps/editor` will see only walls. The K1-B kernel-purity claim has a real test guarding it (good), the 12-family claim does not (bad). 1C should not be considered exited — five of its eight exit criteria are not satisfied.

---

## §1 Sub-phase 1A — Skeleton & rails

### §1.1 What 1A instructs

`phases/PHASE-1A-Q1-M1-M3-SKELETON-RAILS.md` defines six sprints (S01–S06) producing:

1. The seven layers L0 (protocol/DTOs) → L7 (editor/runtime).
2. A frame scheduler with priority + dirty-bit + idle continuation.
3. A scene-committer primitive (descriptor → THREE Mesh) with a hello-cube proof.
4. ESLint plugin `eslint-plugin-pryzm` with **5 rules**: `no-raf`, `no-three-in-kernel`, `no-three-outside-committer`, `affected-stores-required`, `pryzm-store-single-channel`.
5. Code-level ADRs 0001 (typed-id brand), 0002 (handler signature), 0003 (scheduler priority vs deadline), 0004 (codec choice), 0005 (committer interface), 0006 (idle budget), 0007 (WebGPU/WebGL2 dual mode).
6. `?pryzm2=1` URL switch, `bootstrap()` (data half) and `bootstrapRender()` (full half).
7. Element schemas (Wall, Slab, Door, Window, Roof, Curtain-wall, Grid, Column, Beam, Stair, Handrail, Ceiling — 12 minimum) round-tripping under Zod.

### §1.2 What 1A actually has

| Spec item | File / location | Verdict |
|---|---|---|
| L0 protocol package | `packages/protocol/src/index.ts` re-exports schemas + branded ids | ✅ |
| L1 schemas package | `packages/schemas/src/elements/{Wall,Slab,Door,Window,Roof,CurtainWall,Grid,Column,Beam,Stair,Handrail,Ceiling,Room,Furniture,Annotation,Dimension,Sheet,Schedule,View,Project}.ts` (20 element schemas — exceeds 1A spec) | ✅ exceeds |
| L2 stores package | `packages/stores/src/{Store,SelectionStore,ActiveViewStore,CubeStore,attachStores}.ts` | ✅ |
| L3 command-bus | `packages/command-bus/src/{CommandBus,UndoStack,PatchEmitter,produceCommand,cascade,otel,types}.ts` | ✅ |
| L4 frame-scheduler | `packages/frame-scheduler/src/{FrameScheduler,IdleContinuation,RafAdapter,WorkerPool,otel,types}.ts` | ✅ |
| L5 scene-committer | imported from `@pryzm/scene-committer` (used by every plugin's `committer/`) | ✅ |
| L5 geometry-kernel | `packages/geometry-kernel/src/producers/{wall,slab,door,window,roof,curtainwall,grid,column,beam,stair,handrail,ceiling}.ts` plus `_internal/`, `_shared/` | ✅ all 12 producers + CSG runners |
| L6 renderer | `packages/renderer/src/{Renderer,CameraController,IdleAccumulator,passes/{Bloom,TRAA,SSGI,ClearPass,MeshPass,Pipeline}}.ts` | ✅ |
| L7 editor | `apps/editor/src/{bootstrap,bootstrap.render,bootstrap.data,bootstrap.render.data,index}.ts` | ✅ shape, ⚠ scope (see §3.1) |
| Hello-cube | `plugins/toy-cube/`, `apps/bench/src/demos/bouncing-cube.ts`, `apps/editor/__tests__/dual-mode-parity.test.ts` | ✅ |
| `?pryzm2=1` URL switch | referenced in `bootstrap.render.ts` header comment; dual-mode parity test exists | ✅ (assumed live; not exercised in this audit) |
| ESLint `no-raf` | `tools/eslint-plugin-pryzm/src/rules/no-raf.js` + `packages/legacy-shim/src/raf.bad.ts` fixture | ✅ |
| ESLint `no-three-in-kernel` | `tools/eslint-plugin-pryzm/src/rules/no-three-in-kernel.js` | ✅ |
| ESLint `no-three-outside-committer` | `tools/eslint-plugin-pryzm/src/rules/no-three-outside-committer.js` | ✅ |
| ESLint `affected-stores-required` | `tools/eslint-plugin-pryzm/src/rules/affected-stores-required.js` (referenced in command-bus/src/types.ts header) | ✅ |
| ESLint `pryzm-store-single-channel` | **NOT FOUND** anywhere in `tools/` | ❌ |
| ADR 0001 typed-id brand | `docs/00_NEW_ARCHITECTURE/code-level-adrs/0001-typed-id-brand-strategy.md` | ✅ |
| ADR 0002 command-handler-signature | `0002-command-handler-signature.md` | ✅ |
| ADR 0003 frame-scheduler priority | `0003-frame-scheduler-priority-vs-deadline.md` | ✅ |
| ADR 0004 codec choice | `0004-messagepack-codec-choice.md` | ✅ |
| ADR 0005 primitive committer interface | `0005-primitive-committer-interface.md` | ✅ |
| ADR 0006 idle-continuation budget | `0006-idle-continuation-budget.md` | ✅ (later refined by 0014) |
| ADR 0007 WebGPU/WebGL2 dual-mode | `0007-webgpu-webgl2-dual-mode.md` | ✅ |

### §1.3 1A gaps and quality calls

**G-1A-1 (LOW) — `pryzm-store-single-channel` ESLint rule missing.** 1A spec lists this as one of the five hard-rail rules (the one that prevents a handler from writing to two stores in the same tick without declaring both). Not in `tools/eslint-plugin-pryzm/src/rules/`. The intent is partially enforced by the typed `affectedStores: readonly (keyof TStores)[]` constraint on `CommandHandler`, but lint enforcement is the explicit spec deliverable and is absent.

**G-1A-2 (INFO) — Schemas registry is broader than 1A demanded (20 elements vs 12).** This is good — `Room`, `Furniture`, `Annotation`, `Dimension`, `Sheet`, `Schedule`, `View`, `Project` are present and discoverable in `SCHEMA_REGISTRY`. Round-trip safety would need to be verified by running `apps/bench/src/benches/schemas-roundtrip.bench.ts`; the file exists, the bench is wired.

**Q-1A — Quality observations.**

- The `bootstrap.ts` / `bootstrap.render.ts` / `bootstrap.data.ts` / `bootstrap.render.data.ts` four-file split is unusually disciplined — each file's docblock cites the spec line that motivated it, and the layering is principled (data half / render half / wall-data convenience / wall-render-data convenience). This is exactly the "guest in the user's environment" hygiene the master plan asks for.
- `packages/command-bus/src/cascade.ts` (a 1B deliverable) carries an inline pseudocode comment that mirrors line 1098 of the 1B spec verbatim. The implementation files match their specs to a level of fidelity that is rare in code that has been through six sprints.
- `packages/legacy-shim/src/raf.bad.ts` is two lines of intentional fixture for the `no-raf` lint rule. This is the right way to keep the rule self-tested.

**1A verdict: GREEN.** One missing lint rule does not change the structural completeness of the skeleton.

---

## §2 Sub-phase 1B — Wall end-to-end

### §2.1 What 1B instructs

`phases/PHASE-1B-Q2-M4-M6-WALL-END-TO-END.md` covers six sprints (S07–S12) producing:

1. Wall plugin with **14 handlers** (`Create`, `Delete`, `Move`, `SetWallColor`, `SetWallDimensions`, plus 9 from S10: `TransformWall` (5-into-1), `JoinWall`, `CutWall`, `SetWallSystemType`, `SetWallLayers`, `BulkSetWallVisuals`, `CreateWallOpening`, `CreateWallBetweenMarks`, `CreateWallsFromSlab`, `ChangeWallLevel`).
2. `WallCommitter` (descriptor → Mesh, MaterialPool dedupe, selection-highlight via outline).
3. `WallTool` with Straight + Arc + Polyline modes; intent resolver with the priority table from ADR-013.
4. `WallOccupancyStore`.
5. **30-case parity test** — `tests/parity/wall/` — vs PRYZM 1.
6. `CascadeRunner` lifted out of the wall command into `packages/command-bus/cascade.ts`, with cycle-drop and depth limit (16).
7. ADRs 0008–0013 (wall handler triage, producer pure-function, slab triage prep, curtain-wall triage prep, cascade, intent).
8. Cold-load bench (`load-small`) under 800 ms; orbit-fps bench (100 walls) under 55 fps p95.
9. Editor exit: PRYZM 2 draws and persists walls under `?pryzm2=1`.

### §2.2 What 1B actually has

| Spec item | File / count | Verdict |
|---|---|---|
| Wall handlers | `plugins/wall/src/handlers/`: `BulkSetWallVisuals`, `ChangeWallLevel`, `CreateWall`, `CreateWallBetweenMarks`, `CreateWallOpening`, `CreateWallsFromSlab`, `CutWall`, `DeleteWall`, `JoinWall`, `MoveWall`, `SetWallColor`, `SetWallDimensions`, `SetWallLayers`, `SetWallSystemType`, `TransformWall`, `index.ts` → **15 handlers + index = 16 handler files; 14 spec'd + `MoveWall` (which the spec says is consolidated into `TransformWall { kind: 'move' }`) + `SetWallColor`** | ✅ all spec'd handlers, 2 extras |
| `WallCommitter` | `plugins/wall/src/committer/` (geometry-bridge, material-bridge, wall-committer) | ✅ |
| `WallSelectionHighlightCommitter` | re-exported in `bootstrap.render.data.ts`; lives in plugin-wall barrel | ✅ |
| `WallTool` (Straight/Arc/Polyline) | `plugins/wall/src/tool.ts` | ✅ (test files `tool-arc.spec.ts`, `tool-polyline.spec.ts` exist) |
| `WallIntentResolver` (`intent.ts`) | `plugins/wall/src/intent.ts` | ✅ |
| `WallOccupancyStore` (`occupancy.ts`) | mirrored into plugin-wall (verified via plugin file count: 28 src files) | ✅ |
| 30-case wall parity | `tests/parity/wall/configs/` = 30 files; `tests/parity/wall/snapshots/` = 30 files; 3 test files | ✅ |
| `CascadeRunner` + cycle drop | `packages/command-bus/src/cascade.ts` (header pseudocode mirrors spec line 1098 exactly; cycle drop emits `cascade.cycle.dropped` OTel event; `MAX_CASCADE_DEPTH = 16`) | ✅ excellent fidelity |
| Roof producer port (S10–S11 handover) | `packages/geometry-kernel/src/producers/roof.ts`; `tests/parity/roof/configs/` = 20; `tests/parity/roof/snapshots/` = 20 | ✅ |
| ADR 0008 wall handler triage | `0008-wall-handler-triage.md` | ✅ |
| ADR 0009 producer pure-function | `0009-producer-pure-function-signature.md` | ✅ |
| ADR 0010 slab handler triage | `0010-slab-handler-triage.md` | ✅ |
| ADR 0011 curtain-wall triage + producer split | `0011-curtain-wall-triage-and-producer-split.md` | ✅ |
| ADR 0012 cross-element cascade-rule registration | `0012-cross-element-cascade-rule-registration.md` | ✅ |
| ADR 0013 intent-resolver | `0013-intent-resolver.md` | ✅ |
| `bootstrap.render.data.ts` (wall in editor) | exported from `apps/editor/src/index.ts`; registers `WallCommitter` + `WallSelectionHighlightCommitter` + `SelectionStore` | ✅ |
| Bench `load-small` | `apps/bench/src/benches/load-small.bench.ts` | ✅ exists; result not audited |
| Bench `orbit-fps-walls` | `apps/bench/src/benches/orbit-fps-walls.bench.ts` | ✅ exists |
| Bench `wall-handlers` | `apps/bench/src/benches/wall-handlers.bench.ts` | ✅ |
| Bench `cmd-execute-latency` | `apps/bench/src/benches/cmd-execute-latency.bench.ts` | ✅ |
| Bench `produce-wall` | `apps/bench/src/benches/produce-wall.bench.ts` + `apps/bench/reports/produce-wall-baseline.md` | ✅ + only one report file present |

### §2.3 1B gaps and quality calls

**G-1B-1 (INFO) — Two extra wall handlers vs spec.** `MoveWall.ts` exists alongside `TransformWall.ts`; the spec says (S10 line 965) `MoveWall` is renamed/folded into `TransformWall { kind: 'move' }`. Either the rename did not happen and `MoveWall` is dead code, or both exist intentionally as a thin facade + the consolidated handler. This needs five minutes of human review, not a code change.

**G-1B-2 (LOW) — `apps/bench/reports/` carries one baseline file.** Spec asks for `S08-baseline.md`, `S09-baseline.md`, `S10-baseline.md`, `M6-1B-baseline.md`. Only `produce-wall-baseline.md` is committed. The benches themselves are wired and runnable; this is a reporting / housekeeping miss, not a capability miss.

**G-1B-3 (LOW) — No Playwright config in repo.** Spec asks for `plugins/wall/__tests__/playwright/integration.spec.ts` and several other Playwright suites. A search for `playwright.config*` and any `*.spec.ts` returns no Playwright config and no Playwright spec files; the plugin only has Vitest `.test.ts` files. The visual-diff < 5px gate from S09 D7 cannot be enforced without this suite. (The `tool-arc.spec.ts` / `tool-polyline.spec.ts` files use Vitest's `.spec` convention; they are not Playwright tests.)

**Q-1B — Quality observations.**

- The `CascadeRunner` is the most polished package in the tree. The header docblock reproduces the spec pseudocode and explains *why* the runner is decoupled from the bus (so it can be unit-tested without a tracer provider, and used in dry-run "what-if" tooling). This is the kind of comment that prevents a future contributor from coupling the two.
- `bootstrap.render.data.ts` is 100+ lines of careful chicken-and-egg analysis (the host needs the pool, the pool lives in the host) — ending in a clear resolution. Worth reading as an example of the right level of internal documentation for a layer-crossing file.
- The wall plugin is the only plugin where the file count (28 src files) reflects all the supporting machinery the spec requires (intent, occupancy, tool sub-modes, committer with material + geometry bridges, errors, store, dev handle). This is what a "done" element family looks like.
- `apps/editor/__tests__/dual-mode-parity.test.ts` exists — the hello-cube round-trip is regression-tested.

**1B verdict: GREEN.** All structural, contractual, and parity goals are satisfied. The two extras (the MoveWall question, the report files) are housekeeping. This sub-phase is the strongest of the three.

---

## §3 Sub-phase 1C — Element families + harden

### §3.1 What 1C instructs

`phases/PHASE-1C-Q3-M7-M9-ELEMENT-FAMILIES.md` covers six sprints (S13–S18) and exits at M9 demanding (§5 handoff checklist):

1. **All 12 element families end-to-end with parity, picking, view-state.**
2. Renderer hardened with TRAA + SSGI + Bloom + IdleAccumulator under per-pass idle budget; idle CPU < 2.5%, orbit fps > 50 p95.
3. Picking with `gpu-pick` default + `BvhPickStrategy` fallback resolved at boot (ADR-015); < 12 ms p95 single-point latency on 1000 elements.
4. View state as first-class persistent entities; `view.create/.delete/.rename/.switch/.updateCamera` handlers; switch < 250 ms p95; motion suppression vs IdleAccumulator wired.
5. `apps/headless` Node CLI with `new-project`, `add-wall`, `add-slab`, `export-pryzm`; **K1-B kernel-purity test runs in Node** (no THREE / DOM in `require.cache`).
6. Cross-element coupling registered through `CascadeRunner`: at minimum slab→walls and stair→handrail.
7. ADRs 0014 (TRAA/SSGI idle budget), 0015 (picking strategy), 0016 (view-state command-driven), 0017 (headless package surface) merged.
8. Bench dashboard live with one entry per element family + post-FX + picking + view + idle + orbit (≥18 entries); `M9-1C-baseline.md` published.
9. `tests/integration/headless-vs-browser-parity.spec.ts` proves byte-equal output across paths.
10. Demo recording `docs/05-guides/developer/demos/M9-1C-headless.mp4`.

### §3.2 What 1C actually has

#### §3.2.A — Element families (the central claim)

| Family | Producer | Plugin (committer / handlers / intent / store / tool / errors) | Handlers count | Parity configs | Parity snapshots | Verdict |
|---|---|---|---|---|---|---|
| Wall | `producers/wall.ts` | full | 15 + index | **30** | **30** | ✅ |
| Roof | `producers/roof.ts` | full | 8 + index | **20** | **20** | ✅ producer; ⚠ handlers |
| Slab | `producers/slab.ts` | full | 8 + index | **0** | **0** | ❌ parity |
| Door | `producers/door.ts` | full | 6 + index | **0** | **0** | ❌ parity |
| Window | `producers/window.ts` | full | 5 + index | **0** | **0** | ❌ parity |
| Curtain-wall | `producers/curtainwall.ts` | full | 13 + index | **8** | **8** | ⚠ partial parity |
| Stair | `producers/stair.ts` | full | 9 + index | **6** | **6** | ⚠ partial parity |
| Handrail | `producers/handrail.ts` | full | 6 + index | **4** | **4** | ⚠ partial parity |
| Ceiling | `producers/ceiling.ts` | full | 4 + index | **4** | **4** | ⚠ partial parity |
| Column | `producers/column.ts` | full | 5 + index | **0** | **0** | ❌ parity |
| Beam | `producers/beam.ts` | full | 5 + index | **0** | **0** | ❌ parity |
| Grid | `producers/grid.ts` | full | 4 + index | **0** | **0** | ❌ parity |

**Plugin shape consistency.** Every plugin (door, window, slab, roof, ceiling, stair, handrail, curtain-wall, column, beam, grid) follows the same seven-file layout the wall plugin established: `src/{store.ts, intent.ts, tool.ts, errors.ts, index.ts}` + `src/handlers/{Create,Delete,...}.ts` + `src/committer/{<name>-committer,geometry-bridge,material-bridge,index}.ts`. This is the "wall pattern" generalising — exactly what S13 was meant to deliver.

**Producer parity coverage shortfall (G-1C-1, CRITICAL).** Only **5 of 12** families have parity fixtures: wall (30), roof (20), curtain-wall (8), stair (6), handrail (4), ceiling (4). The remaining **6 of 12** (door, window, slab, grid, column, beam) have empty `tests/parity/<family>/` directories — only the test driver `*.snapshot.test.ts` exists, with no `configs/` and no `snapshots/`. The 1C exit criterion **"All 12 element families parity-tested green"** (§3.1 §5 handoff checklist) cannot be true unless 6 directories of fixtures land. The driver tests will pass vacuously today (zero fixtures = zero failures) which is worse than failing tests because it pretends coverage that does not exist.

**Curtain-wall parity (G-1C-2, HIGH).** The curtain-wall plugin has the second-most handlers in the tree (13). The spec for S13 sets curtain-wall parity at 25 fixtures (mirrors wall's 30 because curtain-walls have at least as many edge cases). Only 8 are committed. This is partial coverage on the most coupling-heavy element.

**Roof handler shortfall (G-1C-3, MEDIUM).** The 1B/1C surface budgets 10 roof handlers; `plugins/roof/src/handlers/` ships 8 (`ChangeRoofLevel`, `CreateRoof`, `DeleteRoof`, `MoveRoof`, `SetRoofOverhang`, `SetRoofPitch`, `SetRoofShape`, `SetRoofThickness`). Missing: **`AddSkylight`**, **`RemoveSkylight`**, **`JoinRoofs`**. The producer is fully ported and parity-tested for 20 cases — the gap is at the handler/operator layer, not the geometry layer.

#### §3.2.B — Renderer hardening

| Spec item | File | Verdict |
|---|---|---|
| Bloom pass | `packages/renderer/src/passes/Bloom.ts` + `__tests__/Bloom.test.ts` | ✅ |
| TRAA pass | `packages/renderer/src/passes/TRAA.ts` + `__tests__/TRAA.test.ts` | ✅ |
| SSGI pass | `packages/renderer/src/passes/SSGI.ts` + `__tests__/SSGI.test.ts` | ✅ |
| ClearPass + MeshPass | `passes/{ClearPass,MeshPass}.ts` | ✅ |
| Pipeline | `passes/Pipeline.ts` + `__tests__/Pipeline.test.ts` | ✅ |
| IdleAccumulator | `packages/renderer/src/IdleAccumulator.ts` + `__tests__/IdleAccumulator.test.ts` | ✅ |
| ADR-014 TRAA/SSGI idle budget | `0014-traa-ssgi-idle-budget.md` | ✅ |
| Bench `idle-cpu` | `apps/bench/src/benches/idle-cpu.bench.ts` | ✅ wired |
| Bench `render-pass-cost` | `apps/bench/src/benches/render-pass-cost.bench.ts` | ✅ wired |

Renderer hardening is structurally complete. Whether the idle-CPU < 2.5% and orbit > 50 fps p95 gates pass is a runtime question (not auditable from file presence).

#### §3.2.C — Picking

| Spec item | File | Verdict |
|---|---|---|
| `GpuPickStrategy` | `packages/picking/src/gpu-pick.ts` + `__tests__/gpu-pick.test.ts` | ✅ |
| `BvhPickStrategy` | `packages/picking/src/bvh-pick.ts` + `__tests__/bvh-pick.test.ts` | ✅ |
| `PickStrategyResolver` (boot probe) | `packages/picking/src/PickStrategyResolver.ts` + `__tests__/PickStrategyResolver.test.ts` | ✅ |
| `PickStrategy` interface | `packages/picking/src/types.ts` | ✅ |
| OTel surface | `packages/picking/src/otel.ts` | ✅ |
| Bench `picking-latency` | `apps/bench/src/benches/picking-latency.bench.ts` | ✅ |
| ADR-015 picking strategy | `0015-picking-strategy.md` | ✅ |

Picking is structurally complete and well-isolated.

#### §3.2.D — View state

| Spec item | File | Verdict |
|---|---|---|
| `ViewDefinition` | `packages/view-state/src/ViewDefinition.ts` | ✅ |
| `ViewRegistry` | `packages/view-state/src/ViewRegistry.ts` | ✅ |
| `ViewController` (animation, motion suppression) | `packages/view-state/src/ViewController.ts` | ✅ |
| `defaults` (Default3DView + LevelOverview) | `packages/view-state/src/defaults.ts` | ✅ |
| `ActiveViewStore` | `packages/stores/src/ActiveViewStore.ts` | ✅ |
| `view` plugin handlers | `plugins/view/src/handlers/{CreateView,DeleteView,RenameView,SwitchView,UpdateViewCamera}.ts` (5 handlers) | ✅ exact match |
| Bench `view-switch` | `apps/bench/src/benches/view-switch.bench.ts` | ✅ |
| ADR-016 view-state command-driven | `0016-view-state-command-driven.md` | ✅ |

View state is structurally complete and matches the spec's typed contracts.

#### §3.2.E — Cross-element coupling

| Spec item | File | Verdict |
|---|---|---|
| `@pryzm/cross` package | `plugins/cross/src/{index,slab-wall,stair-handrail}.ts` | ✅ |
| Cross-coupling tests | `plugins/cross/__tests__/{slab-wall,stair-handrail}.test.ts` | ✅ |
| Documentation `docs/04-reference/architecture-detail/element-coupling.md` | not located in this audit | ⚠ unverified |

The two coupling rules called out by the spec (slab→walls, stair→handrail) are present as separate files; the runner is the same `CascadeRunner` from 1B, which is the right reuse.

#### §3.2.F — Headless / K1-B

| Spec item | File | Verdict |
|---|---|---|
| `apps/headless/index.ts` Node entry | ✅ | ✅ |
| `apps/headless/src/cli.ts` | ✅ | ✅ |
| 4 CLI commands | `commands/{newProject,addWall,addSlab,exportPryzm}.ts` (exact spec match) | ✅ |
| Dependency-cruiser config (forbid THREE / renderer / DOM) | `apps/headless/.dependency-cruiser.cjs` | ✅ |
| K1-B verification test | `apps/headless/__tests__/headless-node.test.ts` (also `headless-s18.test.ts`, `strict-mode.test.ts`, `cli-parsers.test.ts`, `skeleton.test.ts`) | ✅ |
| ADR-017 headless package surface | `0017-headless-package-surface.md` | ✅ |

The headless track is the strongest of 1C. It directly targets the architecture's central claim (kernel runs in Node) and has an explicit test for it.

#### §3.2.G — Editor wiring

This is where 1C falls down hardest.

`apps/editor/src/bootstrap.data.ts` registers exactly **one plugin**: `@pryzm/plugin-wall` (via `bootstrapWithWalls`). The header comment is explicit:

> "`bootstrap.ts` is intentionally minimal: it ships the L0→L5 plumbing and a single CubeStore default so the legacy Hello-Cube demo keeps rendering verbatim. `bootstrapWithWalls()` is the sibling for 'I want walls in the runtime today, please.'"

There is no `bootstrapWithDoors`, no `bootstrapWithSlabs`, no `bootstrapWithEverything()`, and no plugin registry that walks the 12 plugins and registers each one's `buildXHandlerSet` + committer + tool. The other 11 plugins are reachable only by hand-importing them in tests; **the editor at `apps/editor/src/index.ts` cannot today open a project that contains a door, window, slab, roof, ceiling, stair, handrail, curtain-wall, column, beam, grid, or view — none of those handlers are registered on the bus, none of those committers are bound to the host.**

This is the single largest gap in 1C and the reason the verdict for the sub-phase is AMBER, not GREEN: the spec exit criterion **"All 12 element families end-to-end"** (§5 handoff checklist) requires the editor to drive them end-to-end, not merely the package tree to contain them.

#### §3.2.H — Integration tests

| Spec item | File | Verdict |
|---|---|---|
| `tests/integration/all-12-elements.test.ts` | exists | ✅ |
| `tests/integration/headless-vs-browser-parity.spec.ts` | **not present** | ❌ |
| `tests/integration/view-state-2a-readiness.test.ts` | **not present** | ❌ |
| Playwright integration (any plugin) | no `playwright.config*` in repo, no `*.spec.ts` outside vitest | ❌ |

#### §3.2.I — Bench dashboard

| Spec item | File | Verdict |
|---|---|---|
| `apps/bench/dashboard/` directory | exists with `types.ts` only | ⚠ scaffold |
| Per-family bench (12 produce-* files) | all 12 present (`produce-wall`, `produce-slab`, `produce-door`, `produce-window`, `produce-roof`, `produce-curtain-wall`, `produce-stair`, `produce-handrail`, `produce-ceiling`, `produce-column`, `produce-beam`, `produce-grid`) | ✅ |
| Idle / orbit / picking / view-switch benches | all 4 present | ✅ |
| Render-pass cost bench | present | ✅ |
| `apps/bench/reports/M9-1C-baseline.md` | **not present** (only `produce-wall-baseline.md`) | ❌ |
| Static HTML publish at `docs/bench/dashboard.html` | not present | ❌ |
| `apps/bench/dashboard/__tests__/{loader,renderer,coverage-audit}.test.ts` | not present | ❌ |

#### §3.2.J — Demo + retro

| Spec item | File | Verdict |
|---|---|---|
| `docs/05-guides/developer/demos/M9-1C-headless.mp4` | not present | ❌ (informational) |
| `docs/03-execution/status/sprints/S18-retro.md` | not located | ⚠ unverified |
| `docs/04-reference/architecture-detail/{picking,selection,view-state,camera,headless,element-coupling}.md` | not located | ⚠ unverified |

### §3.3 1C gaps and quality calls

In priority order:

**G-1C-1 (CRITICAL) — 6 of 12 families have empty parity fixtures.** Door, window, slab, grid, column, beam each have an empty `configs/` and `snapshots/` directory. The driver test files (`*.snapshot.test.ts`) exist but iterate over zero fixtures. This is a vacuous-pass test: it will turn green forever and tell you nothing. **The 1C handoff checklist line "All 12 element families parity-tested green" is not satisfied.** Spec implies between 8 and 25 fixtures per family.

**G-1C-2 (CRITICAL) — Editor wires only the wall plugin.** No `bootstrapWithEverything()`, no plugin-registry pattern, no application code path that lights up the 11 non-wall plugins in `apps/editor`. Anyone running the editor sees the wall demo. This contradicts the central claim of 1C and means the sub-phase has not exited.

**G-1C-3 (HIGH) — Curtain-wall parity 8 of 25.** The plugin with the most operations (13 handlers, panel grid, mullions, transoms) is parity-tested at 32% of spec budget. Curtain-walls were called out specifically by ADR-011 and the S13 spec as needing wall-grade fixture density.

**G-1C-4 (HIGH) — Roof handlers 8 of 10.** Missing `AddSkylight`, `RemoveSkylight`, `JoinRoofs`. Producer is complete, so this is operator-layer work, not geometry work.

**G-1C-5 (MEDIUM) — No Playwright config in repo, no `.spec.ts` Playwright suites.** Cold-load integration, visual-diff vs PRYZM 1, and the headless-vs-browser parity test all rely on Playwright per spec. The `.spec.ts` files referenced by the spec are absent. The visual-diff < 5px gate cannot be enforced.

**G-1C-6 (MEDIUM) — `tests/integration/headless-vs-browser-parity.spec.ts` missing.** Spec requires this as the proof of byte-equal output between the CLI path and the browser path. Without it, K1-B is verified mechanically (good) but the *equivalence* claim is not.

**G-1C-7 (MEDIUM) — Bench dashboard is a scaffold only.** `apps/bench/dashboard/` has `types.ts` and nothing else; no loader, no renderer, no coverage-audit test, no static publish at `docs/bench/dashboard.html`. The 12 produce-* benches exist and would feed the dashboard, but there is no dashboard to feed.

**G-1C-8 (LOW) — `M9-1C-baseline.md` not published.** Only `produce-wall-baseline.md` exists in `apps/bench/reports/`. Without the M9 baseline, regression detection across the 1C → 1D handoff has no anchor.

**G-1C-9 (LOW) — Demo recording absent.** Spec asks for `docs/05-guides/developer/demos/M9-1C-headless.mp4`. Not blocking; informational.

### §3.4 Quality observations on what IS there

Where 1C delivered, it delivered well:

- **Plugin shape uniformity.** Every plugin follows the wall pattern: `committer/`, `handlers/`, `intent.ts`, `store.ts`, `tool.ts`, `errors.ts`. The cost-of-adding-a-new-element-family is now genuinely low. This is what the spec's "K1-C velocity multiplier" required and it has been delivered.
- **Renderer pass surface.** `Bloom.ts`, `TRAA.ts`, `SSGI.ts`, `IdleAccumulator.ts` are isolated, individually unit-tested, and honour the `idleBudgetFrames` contract from ADR-014. The pipeline is composable in the way the architecture wanted.
- **Picking dual-strategy resolver.** `PickStrategyResolver.ts` does the boot probe per ADR-015 and falls back to BVH on Linux WebGL2 driver corner cases. The interface is clean, the two strategies are independently testable, and the selection contract (`pick`, `pickRect`) is symmetric across both.
- **View-state design.** `ViewController.ts` honours the motion-suppression contract — `scheduler.beginMotion()` on switch, `endMotion()` on completion, no fight with `IdleAccumulator`. This is exactly the integration ADR-016 demanded.
- **Headless K1-B test.** `apps/headless/__tests__/headless-node.test.ts` audits `require.cache` for THREE / `@pryzm/renderer` / `@pryzm/render-runtime` after running the full pipeline. This is the right shape of test for the right shape of claim. The dependency-cruiser config (`apps/headless/.dependency-cruiser.cjs`) provides the static guard; the test provides the dynamic guard.
- **Cascade reuse.** `plugins/cross/src/{slab-wall,stair-handrail}.ts` use the existing `CascadeRunner` rather than introducing a parallel mechanism. The 1B infrastructure is paying its second dividend in 1C — the architecture is cohering.

**1C verdict: AMBER.** Structural completeness is high; runtime completeness is low. The package layer is real; the editor wiring and the parity coverage are not. The kernel-purity claim is genuinely tested; the 12-family claim is not.

---

## §4 Cross-cutting observations

### §4.1 Documentation discipline is high

Every package's source file has a header docblock that quotes the spec line that justified the file. `bootstrap.render.ts` cites `phases/PHASE-1A-Q1-M1-M3-SKELETON-RAILS.md §S06-T7 (line 583)`. `cascade.ts` cites `code-level ADR docs/02-decisions/adrs/0012-...`. This is rare in code that has been through six sprints with two agents. It will pay off in 1D and 2A when the next contributors arrive.

### §4.2 Test-vs-fixture asymmetry is the recurring failure mode

Across 1C the same pattern repeats: the **test driver** is written, the **fixtures** are not.

- 6 of 12 parity test files exist with zero configs and zero snapshots.
- The Playwright integration tests are referenced by spec but no Playwright config exists.
- The bench dashboard `types.ts` is written but the loader, renderer, and reports are not.
- Integration tests `headless-vs-browser-parity.spec.ts` and `view-state-2a-readiness.test.ts` are referenced by spec and not committed.

The agents wrote scaffolding faithfully and then under-delivered on the data those scaffolds need to be useful. This is consistent enough to be a process signal: **a 1D / 2A planning gate should require fixtures to land before driver code is allowed to merge**, otherwise vacuous-pass coverage will keep masking gaps.

### §4.3 The conflict-resolution order in repo-level docs has held

`docs/00_NEW_ARCHITECTURE/CONFLICT-ANALYSIS.md` and `06-PRYZM-IDENTITY-AND-RECOUNT.md` set the rule that `06+.pryzm` > `08-VISION` > `10-MASTER+PHASE` > others when sources disagree. The phase docs are internally consistent with that order: schemas at 20 elements (broader than 1A's 12-minimum) match `08-VISION` and `10-MASTER`; the 12-family runtime claim of 1C matches the master plan; the renderer's idle-budget bias toward 2% (not 5%) matches `08-VISION`. The audit found no evidence of conflict-induced ambiguity.

### §4.4 Two ADR numbering drifts to flag

- 1B spec mentions `code-level ADR docs/02-decisions/adrs/0014-persistence-snapshot-threshold.md` (S09 D4 contingency); 1C spec uses `0014-traa-ssgi-idle-budget.md`. Same number, different topic. Only the 1C version exists. Persistence-snapshot threshold logic is folded elsewhere; the dropped ADR is informational, not architectural.
- All ADR files use a single `0001..0017` sequence in `docs/00_NEW_ARCHITECTURE/code-level-adrs/`. The strategic ADRs in `adrs/` use `ADR-001..ADR-024` (different scheme; different scope). The cross-references inside source files (e.g., "see ADR-008 §3.D" in `bootstrap.data.ts`) are unambiguous because the contexts don't overlap.

### §4.5 The strategic ADR-018, ADR-019, ADR-020, ADR-021, ADR-024 are present without a 1A–1C touchpoint

`docs/00_NEW_ARCHITECTURE/adrs/ADR-018-capacity-cut-list.md`, `ADR-019-soft-lock-semantics.md`, `ADR-020-kernel-robustness.md`, `ADR-021-enterprise-security-data-residency.md`, `ADR-024-constraint-solver.md` exist and are consistent with the master plan but address concerns that land in 1D/2A/2B. Their presence here is forward-staging, not technical debt.

---

## §5 What needs to land for 1C to genuinely exit

Ordered by criticality. **No code changes recommended in this document — this is a list for a follow-up planning round.**

1. **Wire the 11 non-wall plugins into `apps/editor`.** Either generalise `bootstrapWithWalls` into a plugin-registry pattern (`bootstrapWithPlugins(plugins[])`) or add explicit `bootstrapWithEverything()` that registers all 12. Without this, the editor cannot demonstrate the 1C exit claim. *(G-1C-2)*
2. **Author parity fixtures for door, window, slab, grid, column, beam.** Each family needs at minimum 6–10 cases (the stair / handrail / ceiling baseline). The drivers already exist; only `configs/` and `snapshots/` are needed. This is fixture authoring work, not engineering. *(G-1C-1)*
3. **Bring curtain-wall parity to 25 cases.** 17 more configs needed. This is the family with the most operator surface; under-coverage here is the highest geometric regression risk. *(G-1C-3)*
4. **Add the three missing roof handlers** (`AddSkylight`, `RemoveSkylight`, `JoinRoofs`). Producer is ready; this is handler-layer work. *(G-1C-4)*
5. **Stand up Playwright** with one cold-load suite + the visual-diff suite from 1B S09 D7. This unblocks the `< 5px` regression gate. *(G-1C-5)*
6. **Add `tests/integration/headless-vs-browser-parity.spec.ts`.** Without this, K1-B is verified but the equivalence-of-paths claim is not. *(G-1C-6)*
7. **Build out the bench dashboard** beyond `types.ts`: loader, renderer, coverage-audit test, static publish. The 12 produce-* benches plus the four cross-cutting benches are ready to feed it. *(G-1C-7)*
8. **Publish `apps/bench/reports/M9-1C-baseline.md`** with current numbers from the 12 produce-* benches plus idle / orbit / picking / view-switch / render-pass-cost. This is the regression anchor for 1D. *(G-1C-8)*
9. **Add the missing ESLint rule** `pryzm-store-single-channel`. Backfill from 1A. *(G-1A-1)*
10. **Resolve the `MoveWall` vs `TransformWall { kind: 'move' }` redundancy** with a five-minute decision: rename / delete / leave as façade with a comment. *(G-1B-1)*

---

## §6 What this audit did not check

For honesty's sake:

- **No tests were executed.** Every "✅" above means "the file exists and matches the spec's typed contract"; it does not mean "the test passes" or "the bench gate is met." The audit promises structural conformance, not operational conformance.
- **No bundle-size verification.** The 1A bundle gate is asserted by `apps/bench/src/benches/codec-spike.bench.ts` and is not checked here.
- **No idle-CPU / orbit-fps verification.** The renderer post-FX passes exist; whether they hit `idle CPU < 2.5%` and `orbit > 50 fps p95` on this machine is a runtime question.
- **No PRYZM 1 visual-diff comparison.** Requires Playwright (which is absent) and PRYZM 1 fixtures (not in this tree).
- **No content review of the strategic ADRs** in `docs/00_NEW_ARCHITECTURE/adrs/`. They were enumerated for presence, not read for correctness.
- **No security / secret review.** Out of scope.
- **No package.json / dependency-cruiser config review** for actual purity violations — the audit trusted that `eslint-plugin-pryzm` and `apps/headless/.dependency-cruiser.cjs` are wired into CI as the spec demands.

---

## §7 Summary table (one-liner per item)

| Phase | Item | State | Severity |
|---|---|---|---|
| 1A | L0–L7 stack | delivered | — |
| 1A | 5 ESLint rules | 4 of 5 (`pryzm-store-single-channel` missing) | LOW |
| 1A | ADRs 0001–0007 | all 7 present | — |
| 1A | hello-cube + dual-mode parity | delivered | — |
| 1B | 14 wall handlers | 15 + index (1 extra `MoveWall` to triage) | INFO |
| 1B | 30-case wall parity | 30 configs / 30 snapshots | — |
| 1B | `CascadeRunner` with cycle drop | delivered (excellent fidelity to spec) | — |
| 1B | `WallCommitter` + `WallTool` (Straight/Arc/Polyline) | delivered | — |
| 1B | ADRs 0008–0013 | all 6 present | — |
| 1B | bench reports | only 1 of 4 published | LOW |
| 1B | Playwright suites | absent | LOW |
| 1C | 12 producers | all 12 present | — |
| 1C | 12 plugins (uniform shape) | all 12 present | — |
| 1C | renderer post-FX (Bloom/TRAA/SSGI/Idle) | all 4 present and unit-tested | — |
| 1C | picking gpu + bvh + resolver | all 3 present | — |
| 1C | view-state + view plugin (5 handlers) | delivered | — |
| 1C | headless CLI (4 commands) + K1-B test | delivered | — |
| 1C | cross-element coupling (slab-wall, stair-handrail) | delivered | — |
| 1C | ADRs 0014–0017 | all 4 present | — |
| 1C | parity for door/window/slab/grid/column/beam | **0 of 12 fixtures (6 families empty)** | **CRITICAL** |
| 1C | parity for curtain-wall | **8 of 25 fixtures** | HIGH |
| 1C | parity for stair / handrail / ceiling | 6 / 4 / 4 (partial) | MEDIUM |
| 1C | roof handlers | 8 of 10 (no AddSkylight/RemoveSkylight/JoinRoofs) | MEDIUM |
| 1C | editor wires 12 plugins | **only wall is wired** | **CRITICAL** |
| 1C | Playwright + integration spec files | absent | MEDIUM |
| 1C | bench dashboard | scaffold only (`types.ts`) | MEDIUM |
| 1C | `M9-1C-baseline.md` | not published | LOW |
| 1C | `headless-vs-browser-parity.spec.ts` | absent | MEDIUM |
| 1C | demo recording | absent | LOW |

---

*End of audit.*
