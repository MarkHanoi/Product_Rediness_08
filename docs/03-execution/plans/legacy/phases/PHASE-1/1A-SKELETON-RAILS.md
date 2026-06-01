# Phase 1A — Skeleton & Rails (Q1 · Months 1–3 · Sprints S01–S06)

> **Authority note (added 2026-04-27).** This document is *implementation guidance* and is subordinate to:
>
> 1. The 12 specs in `docs/03-execution/specs/` (SPEC-01..SPEC-12).
> 2. The 22 strategic ADRs in `docs/02-decisions/adrs/` (ADR-001..ADR-024 of the strategic series).
> 3. `docs/archive/pryzm3-internal/superseded-2026-04-30/03_STATUS/CRITICAL-REVIEW-2026-04-27.md`.
> 4. `docs/03-execution/plans/legacy/plan-detail/01-MASTER-36M.md`.
>
> Where this phase document conflicts with any of the above, the higher-precedence document wins. Bare `ADR-NNN` references inside this phase document refer to the **sprint-scoped / code-level** ADR series at `docs/02-decisions/adrs/NNNN-*.md` after the renumbering applied 2026-04-27 (per `phases/PHASES-UPDATE-PLAN-2026-04-27.md` §1). References to the **strategic** ADR series are written explicitly as `[strategic ADR-NNN]`.

> **§0 Alignment header**
>
> - **Strategic anchor**: this doc operationalises `phases/PHASE-1-FOUNDATION-M1-M12.md §2`. It is bound by `08-VISION.md`, `06-PRYZM-IDENTITY-AND-RECOUNT.md`, and the `.pryzm` file-format spec. Conflict order: `06` + `.pryzm` → `08` → `10-MASTER` + this doc → everything else. The **TypeScript Vanilla Decision** (no React migration; THREE only inside `packages/scene-committer/` and `plugins/*/committer.ts`) governs every line below.
> - **Sub-phase goal**: by end of M3 a "Hello Cube" demo renders end-to-end through L0 → L7 with patch-based undo, demand-driven render, MessagePack persistence, dual-mode (WebGPU/WebGL2) rendering, and **all four custom CI gates active**. PRYZM 1 (the legacy `src/` tree, 392,432 LOC across 1,300 files) ships unchanged on the default URL; PRYZM 2 lives behind `?pryzm2=1`.
> - **The bet for 1A**: build the architectural rails before any element code is written. Six sprints of pure plumbing means the next 18 sprints become a multiplication exercise rather than archaeology.
> - **What this doc adds vs the master phase doc**: a **two-agent parallel execution plan** with day-level granularity, an **existing-codebase inventory** that names every PRYZM-1 file the new packages must absorb / mimic / replace / leave-alone, **per-sprint blocker analysis** grounded in real `src/` evidence, and **non-regression validation steps** that prove the legacy app still ships at every D9.

---

## §0 How to read this document

**The team**: 2 engineering agents (called **Agent A** and **Agent B**) plus 1 human (the Founder/Architect — referred to as **F**) who reviews, decides ADRs, and merges.

**Working unit**: 1 sprint = 2 weeks = 10 working days (D1–D10). D9 is sprint demo + retro; D10 is buffer/docs.

**Synchronisation rule**: each sprint has **3 sync points** — D1 kickoff (15–45 min), D5 mid-sprint integration (1 h), D9 demo + retro (1 h). Outside those, agents work independently on their own track.

**Branch model**: each agent works on `agentA/sNN-<topic>` and `agentB/sNN-<topic>`. F merges to `pryzm2/main` after D5 and D9 reviews. **No agent ever pushes directly to `pryzm2/main`.** Critically, **`pryzm2/main` is a separate root tree** from the legacy `main` that ships PRYZM 1 — by design they share `package.json` (for shared deps like `three`, `immer`, `zod`) but **`pryzm2/` paths and `src/` paths never import each other** (S01 D2 boundaries lint enforces this).

**Conflict policy**: when two agents need the same file, the agent who owns that file's package per the track allocation wins. Cross-track edits go through F.

**Citation convention**: every claim about PRYZM 1's existing code is given as `path/to/file.ts:LINE` or `path/to/file.ts §N`. Every claim about a new file is given as `pryzm2/path/to/file.ts (NEW)`.

**ADR citations**: Bare `ADR-NNN` is forbidden. Use `[strategic ADR-NNN]` for entries in `02-decisions/adrs/`, or fully-qualified `code-level ADR docs/02-decisions/adrs/NNNN-<slug>.md` for sprint-scoped decisions.

---

## §1 Existing-codebase inventory (the deep ground truth that informs every sprint)

This section is the **single source of truth** for what already exists in PRYZM 1 and how it relates to each PRYZM 2 package landing in 1A. Both agents read this section before writing a single line of new code. The numbers below come from `rg`, `wc -l`, and direct file inspection on the **2026-04-26 snapshot** (commit `44045772`).

### §1.1 What already exists in PRYZM 1 that PRYZM 2 must absorb, mimic, or replace

| PRYZM 2 package landing in 1A | PRYZM 1 file(s) that already do something similar | LOC | What we **absorb** (pattern survives) | What we **replace** (pattern dies in 1A) | What we **leave alone** (PRYZM 1 keeps using it through 1A) |
|---|---|---|---|---|---|
| `packages/schemas/` (S01) | `src/elements/walls/WallTypes.ts`, `WallDataSchema.ts`, and 22 sibling `*Types.ts` / `*Schema.ts` files across `src/elements/*` | ~10 K | The Zod refinement style in `WallDataSchema.ts` (already imports `zod ^4.3.6`) | Mixed THREE imports inside `WallTypes.ts` (line 1 imports `* as THREE from 'three'`) — the new `Wall.ts` must be THREE-free | `WallTypes.ts` continues to drive PRYZM 1; no edit in 1A |
| `packages/protocol/` (S01) | `src/commands/types.ts` (`CommandType` enum, `Command`, `CommandResult`, `SerializedCommand`, `CommandProposal`, `CommandContext`) | 1.4 K | The `SerializedCommand { type, payload, targetIds, timestamp, version }` shape already maps cleanly to a wire DTO | The hard-coded `CommandContext.stores` interface with **18+ `xStore` fields** (`wallStore`, `slabStore`, `columnStore`, …) — the new bus must *not* require an exhaustive store table | `src/commands/types.ts` and `CommandManager.ts` keep operating PRYZM 1 |
| `packages/command-bus/` (S02) | `src/commands/CommandManager.ts` (history+redo, snapshot/restore, `affectedStores` scope, `PROJECT_LOAD` fast path, post-execute callbacks) + `src/commands/PatchSnapshot.ts` (already 293 LOC, defines `PatchSnapshotEntry { storeKey, forwardPatches, inversePatches, capturedAt }`) | 1.8 K | (a) The `affectedStores` declared field already exists on most commands — `CreateWallCommand.ts` line 60 declares `readonly affectedStores = ["wall", "level"] as const`. (b) `enablePatches()` is already called in three places (`CommandManager.ts:10`, `PatchSnapshot.ts:54`, `EngineBootstrap.ts:41`). (c) `PROJECT_LOAD` source already bypasses snapshot+history. | Three forms of structuredClone snapshotting in `CommandManager.execute()` lines 100–110; `(window as any).curtainWallStore` fallbacks in the constructor (lines 38–47) | `CommandManager` continues to dispatch PRYZM-1 commands; we do *not* migrate handlers in 1A |
| `packages/persistence-client/` (S04) | `src/core/persistence/ProjectSerializer.ts` (857 LOC JSON monolith) + `src/core/persistence/MigrationEngine.ts` (versioned snapshot upgrade) | 1.0 K | The `MigrationEngine.needsMigration() / migrate()` versioning pattern. The schema-version constant convention (`SNAPSHOT_SCHEMA_VERSION`). | The JSON-blob single-file persistence model entirely. The 26+ store imports at the top of `ProjectSerializer.ts` (a literal manifest of every store) | `ProjectSerializer` keeps saving PRYZM-1 projects to Supabase / localStorage |
| `packages/stores/` (S05) | 65 `*Store.ts` files (e.g. `WallStore.ts`, `SlabStore.ts`, `DoorStore.ts`, `VisibilityIntentStore.ts`, `HierarchyStore.ts`) | ~25 K | The `Map<id, T>` + `clone-on-read` + `notify(listener)` pattern (`WallStore.ts` lines 78–80, 23–28). Most stores are **already pure DTO maps** — `WallStore.ts` has zero THREE imports. | The ad-hoc per-store listener APIs (`onWallChange`, `subscribeFloor`, …) — replaced by the shared `Store<T>.subscribeDirty(diff => ...)` shape. | All 65 PRYZM-1 stores keep operating |
| `packages/frame-scheduler/` (S03) | `src/core/rendering/UnifiedFrameLoop.ts` (402 LOC) + `src/core/rendering/FrameCoordinator.ts` (Phase-10 foundation) | 0.7 K | **Most of the API surface** — `UnifiedFrameLoop` already exports `TickPriority = 'pre-render' \| 'render' \| 'post-render' \| 'overlay'` and `addTickListener({ id, priority, callback })`. `FrameCoordinator` already exports `markDirty(pass \| 'all', reason)`, `shouldRenderPass(pass)`, per-pass grace counter (default 6), `tickFrame()`. **The PRYZM-2 frame-scheduler is ~70% absorption, ~30% generalisation.** | The hard-coded `'ssgi' \| 'traa' \| 'outline' \| 'bloom'` `RenderPassKind` (PRYZM 2 must accept arbitrary subsystem keys); the OBC/PASCAL dual-callback structure (PRYZM 2 has one render path) | `UnifiedFrameLoop` keeps driving PRYZM 1 |
| `packages/scene-committer/` (S05) | `src/core/StoreEventBus.ts` (depth-counted batch wrapper, "no event drops" contract) + 23 `*FragmentBuilder.ts` files (`WallFragmentBuilder.ts` 2,256 LOC, `SlabFragmentBuilder.ts` 800 LOC) | ~12 K | The pattern of "store change → builder reads store → builder writes meshes" is exactly the committer pattern, just inverted (today: builder polls; tomorrow: committer subscribes). `StoreEventBus.batch(fn)` is the `transactional commit` primitive PRYZM 2 needs. | The 23 individual fragment-builder god-classes (each subscribed to its own store, doing its own THREE work, its own LOD, its own caching) — collapsed into one `SceneCommitter` + per-element `committer.ts` files | `WallFragmentBuilder` etc. keep building PRYZM-1 meshes |
| `packages/renderer/` (S06) | `src/rendering/createRenderer.ts` + `src/rendering/pipeline/RenderPipelineManager.ts` + OBC `PostproductionRenderer` integration | ~3 K | Lessons learned about WebGL2 vs WebGPU on Chromium / Linux. The `MANUAL` mode pattern (PRYZM 1 already moved OBC to `MANUAL` per `UnifiedFrameLoop.ts` line 41). | The dual-renderer architecture (one OBC, one PASCAL post-FX). PRYZM 2 has a single render path. | The PRYZM-1 renderer keeps shipping |
| `tools/eslint-plugin-pryzm/` (S01) | `scripts/check-project-isolation.mjs`, `scripts/check-storage-isolation.mjs`, `scripts/check-no-legacy-vg.sh` (3 ad-hoc Node guards) | ~0.4 K | The pattern of a custom `node scripts/check-*.mjs` gate. | The pattern of running guards as separate npm scripts — replaced by ESLint rules so violations show in the editor + PR diff, not at `pnpm build`. | The 3 existing scripts continue to guard PRYZM 1 |
| `apps/bench/` (S02–S06) | `src/dev/WallPerfBench.ts` (4 `(window as any)` casts, 1 rAF — itself a debt example) | 0.3 K | The pattern that "perf benches live in-tree and run on demand". | Window-rooted bench harness — replaced by Vitest-driven benches with baseline-comparison CI gates. | Existing dev bench keeps working for PRYZM 1 |
| `apps/editor/src/bootstrap.ts` (S06) | `src/engine/EngineBootstrap.ts` (2,086 LOC god class) + 8 `src/engine/subsystems/init*.ts` files (8,216 LOC: `initScene` 2,115, `initUI` 2,724, `initTools` 1,031, `initCollaboration` 828, `initBuilders` 798, `initDataPlatform` 368, `initPersistence` 237, `initStores` 115) | 10.3 K | The deferred-import pattern (`bootstrap()` is dynamically imported from `main.ts` so the landing page is small). The phased-init pattern (`initX → initY → initZ`). | The 2,086-line god class entirely. The "everything in window globals" handoff between `init*` files. | `EngineBootstrap.ts` keeps booting PRYZM 1 on the default URL |
| `.github/workflows/ci.yml` (S01) | **None — no workflow file exists** | 0 | — | — | (greenfield) |

> **Implication**: PRYZM 2 in 1A is **not** a green-field project on top of nothing. It is a green-field tree that **deliberately mirrors and re-implements ~12 patterns proven in PRYZM 1** while **discarding ~8 patterns that are now known to be the source of the structural debt described in `00-AUDIT.md`**. Every sprint's exit criterion includes "the PRYZM-1 file we are mirroring still works unchanged".

### §1.2 The four "looks like the new architecture but isn't" trap files

These four files in `src/` are the most dangerous for the 1A team because they look like prototypes of the very thing PRYZM 2 is building, and an unwary refactor would lose months of accumulated learning. **Do not edit these in 1A. Read them, absorb them, then build a separate package that supersedes them.**

| File | LOC | Why it looks like the answer | Why it isn't (and what 1A must do differently) |
|---|---|---|---|
| `src/core/rendering/UnifiedFrameLoop.ts` | 402 | Already exports `TickPriority`, `TickListener`, `addTickListener()` with idempotent registration. Already drives a single `requestAnimationFrame` for OBC + PASCAL. Already exposes `start() / stop() / beginViewSwitch() / endViewSwitch()`. **This is essentially the frame-scheduler API.** | Two callbacks (`setObcRenderCallback`, `setPascalRenderCallback`) are baked in — the PRYZM 1 dual-renderer assumption. PRYZM 2 has a single render path. The **right move**: copy the `TickPriority` + `TickListener` shapes verbatim into `packages/frame-scheduler/`, drop the OBC/PASCAL specifics, add `markDirty(reason) / requestFrame(reason, priority)`. Document as "absorbed from `UnifiedFrameLoop.ts`" so the lineage is explicit. **`code-level ADR docs/02-decisions/adrs/0003-scheduler-priority-vs-tickpriority.md` must cite this file.** |
| `src/core/rendering/FrameCoordinator.ts` | ~250 | Already implements `markDirty(pass \| 'all', reason)`, `shouldRenderPass(pass)`, per-pass grace-frame counter (default 6, wired to `tickFrame()`), debug stats. **This is the dirty-flag mechanism PRYZM 2 needs.** | The per-pass enum is closed (`'ssgi' \| 'traa' \| 'outline' \| 'bloom'`). PRYZM 2's scheduler must accept arbitrary `string` keys (one per registered subsystem). The 6-frame grace constant is good — keep it; `code-level ADR docs/02-decisions/adrs/0006-idle-continuation-budget.md` ratifies 30 frames for idle continuation, not the per-pass grace which stays at 6. |
| `src/commands/PatchSnapshot.ts` | 293 | Already imports `produceWithPatches, applyPatches, enablePatches, type Patch` from immer. Already defines `PatchSnapshotEntry { storeKey, forwardPatches, inversePatches, capturedAt }`. Already defines `SnapshotCompletenessSpec` with the `_renderVersion` / `_sourceBaseLine` field allow-list. **This is the data model PRYZM 2's UndoStack uses.** | Per its own header: "exercises zero runtime code paths until a follow-up commit (Phase 9-extension after the Contract 01 §3 amendment) wires CommandManager to the patch path". **Phase 9-extension never landed.** PRYZM 2 in S02 *is* the missing wiring. Copy the `PatchSnapshotEntry` shape into `packages/command-bus/types.ts` verbatim. |
| `src/core/StoreEventBus.ts` | ~600 | Already provides nesting-safe `batch<T>(fn): T` with try/finally. Documents "No Event Drops" as a non-negotiable. Already uses depth-counter (`_batchDepth: number`) not a boolean flag. **This is the transactional-commit primitive PRYZM 2 needs.** | The event shape `StoreChangeEvent { elementId, elementType, operation, timestamp }` is too narrow for patches (no `forwardPatches` / `inversePatches`). PRYZM 2's command-bus emits a richer envelope. Borrow the depth-counter idea + the "no drops" contract verbatim. |

### §1.3 The 53 `requestAnimationFrame(` call sites — categorised

`rg -l 'requestAnimationFrame\(' src/ --type ts | wc -l` returns **53 files**, distributed:

| Category | Count | Sample files | What 1A does about them |
|---|---|---|---|
| **UI loops** (panel re-renders, transitions, debounced repaints) | 24 | `src/ui/LeftNavRail.ts`, `src/ui/Layout.ts`, `src/ui/ConfirmDialog.ts`, `src/ui/AnnotationInputPanel.ts`, `src/ui/property-panel/PropertyPanel.ts`, `src/ui/views/ViewTemplateManagerPanel.ts`, `src/ui/ViewCube.ts`, `src/ui/ViewBrowser/panels/*`, `src/ui/SheetEditor/SheetEditorPanel.ts`, `src/ui/ai/AIPanel.ts`, `src/ui/dataworkbench/*`, `src/ui/furniture-carousel/*`, `src/ui/platform/*` (4) | **NONE migrated in 1A.** UI lives in `apps/editor/` (vanilla TS). The new `pryzm-no-raf` lint rule allowlists `src/ui/**` until Phase 1C. The lint is **error in `pryzm2/`, warn in `src/`**. |
| **Render pipeline** (legacy single-rAF for the canvas) | 10 | `src/core/rendering/UnifiedFrameLoop.ts` (legitimate owner), `src/core/rendering/ViewportPathTracer.ts`, `src/core/presentation/ViewportPreviewRenderer.ts`, `src/core/sync/SyncStateEngine.ts`, `src/core/views/SplitViewManager.ts`, `src/core/persistence/ProjectIsolationAudit.ts`, `src/core/drawing/ElementSpatialIndex.ts`, `src/core/batch/BatchCoordinator.ts`, `src/core/DependencyResolver.ts` | **NONE migrated in 1A.** PRYZM 1 keeps its own loop. PRYZM 2 boots its own `FrameScheduler` only when `?pryzm2=1` is set; the two never run in the same tab. |
| **Engine bootstrap & inspect** | 6 | `src/engine/EngineBootstrap.ts`, `src/engine/subsystems/initScene.ts`, `src/engine/subsystems/initUI.ts`, `src/engine/inspect/{InspectModeCoordinator,LevelExplodeController,DiagnosticMaterialManager}.ts` | **NONE migrated in 1A.** |
| **Element-specific rAFs** (animations, drag preview) | 3 | `src/elements/slabs/SlabFragmentBuilder.ts`, `src/elements/curtainwalls/CurtainWallBuilder.ts`, `src/elements/stairs/stairPath/StairPathToolController.ts` | **NONE migrated in 1A.** |
| **Tools** (drag, scale, rotate underlay) | 3 | `src/tools/{UnderlayReferenceScaleTool,UnderlayReferenceRotateTool,FloorPlanUnderlayTool}.ts` | **NONE migrated in 1A.** |
| **Other** (export, services, physics, dev, main, component-editor) | 7 | `src/main.ts`, `src/services/SheetIndexService.ts`, `src/physics/PhysicsEngine.ts`, `src/export/sheets/SheetExportService.ts`, `src/export/ifc/ExportIFC.ts`, `src/dev/WallPerfBench.ts`, `src/component-editor/workspace/EditorWorkspace.ts` | **NONE migrated in 1A.** |

> **Implication for the lint rule**: `pryzm-no-raf` cannot blanket-ban `requestAnimationFrame(` across the repo on day one — that would block 53 existing files. The rule has two modes:
>
> 1. **`pryzm2/` mode (error)**: any `requestAnimationFrame(` outside `packages/frame-scheduler/src/**` is an error.
> 2. **`src/` mode (warn-only, allowlist)**: existing rAF sites are warned but not blocked. **No new rAF site may be added in `src/`**, enforced via a snapshot-diff check in CI ("did the count of rAF call sites in `src/` increase compared to `main`?").

### §1.4 The 2,066 `(window as any)` sites — concentration map

`rg -c '\(window as any\)' src/ --type ts | awk -F: '{s+=$2} END {print s}'` returns **2,066** (the headline figure in `00-AUDIT.md` was 2,078; the small drift is due to recent refactors removing some). The top concentrations:

| Category | Files | Casts | Why this exists | 1A treatment |
|---|---|---|---|---|
| **Plan-tool handlers** (`src/core/views/plantools/*`) | 16 | 78 | `MovePlanToolHandler.ts:23` documents the convention as "**Architecture rules (Contract 21 §4): All commands fired via `(window as any).commandManager`**". The plan-tool layer is *deliberately* wired through window globals as a contracted bridge to the CAD-style 2D layer. | **Untouched in 1A.** Plan tools live entirely in `src/`. PRYZM 2 in 1A renders only a 3D cube; no 2D plan editing surface exists yet. |
| **Plantool + Bench debt** (worst single file) | `MovePlanToolHandler.ts` | 20 | Single file holds the most casts. | Targeted in Phase 1C / 1D, not 1A. |
| **CommandManager bootstrap fallbacks** | `src/commands/CommandManager.ts` | 3 | `CommandManager` constructor (lines 38–47) contains: `if (!context.stores.curtainWallStore && (window as any).curtainWallStore) { context.stores.curtainWallStore = (window as any).curtainWallStore; }` — three identical fallbacks for `curtainWallStore`, `plumbingStore`, `furnitureStore`. **These exist precisely because the DI through `CommandContext.stores` did not land cleanly for those three stores.** | **Lesson encoded in `code-level ADR docs/02-decisions/adrs/0002-command-handler-signature.md`**: PRYZM 2's `CommandHandler<T>` signature must take `HandlerContext` *by parameter*, never look at globals. The bus throws synchronously if any required store is missing — no silent window fallback. |
| **Render pipeline** | `src/rendering/createRenderer.ts`, `src/rendering/pipeline/RenderPipelineManager.ts` | 5 | THREE renderer + camera handed back through window for tools to grab. | Untouched. |
| **Everything else** | ~300 files | ~1,975 | Cross-cutting handoffs — services, lifecycle panels, IFC import, dev overlays, debug. | Untouched in 1A; tracked in `07-EXECUTION-PLAYBOOK.md §8` for systematic deletion across Years 2–3. |

> **Implication**: 1A does **not** delete a single `(window as any)` cast in `src/`. The new `pryzm-no-window-as-any` lint rule (added in Phase 1C, not 1A) will be `pryzm2/` mode only.

### §1.5 Schema source of truth in PRYZM 1 (and why `Wall.ts` in `packages/schemas/` cannot just import it)

PRYZM 1's schema for a wall lives in **two places**:

- `src/elements/walls/WallTypes.ts` — the TypeScript interfaces (`WallData`, `Opening`, `WindowData`, `DoorData`, `Level`). **Imports `* as THREE from 'three'` on line 1.** Co-locates enums (`WallToolState`, `WallDrawingMode`) that are render-state, not data.
- `src/elements/walls/WallDataSchema.ts` — the Zod schemas (`WallDataAddSchema`, `WallDataUpdateSchema`, `OpeningSchema`) used at the `WallStore.add()` boundary. Uses `zod ^4.3.6`.

PRYZM 2's `packages/schemas/Wall.ts` cannot just `import { WallData } from 'src/elements/walls/WallTypes'` because:

1. **Boundary violation**: `packages/*` cannot import from `src/`. The boundaries-lint rule in `eslint.config.js` (S01 D2) hard-blocks this.
2. **THREE pollution**: `WallTypes.ts` line 1 brings THREE.js into anything that touches it. The kernel must be THREE-free per the TypeScript Vanilla Decision.
3. **Render-state mixed with data**: `WallToolState` and `WallDrawingMode` are tool/render concerns and must not appear in the wire DTO.

> **Implication for S01**: Agent A writes `packages/schemas/Wall.ts` from scratch, **using `WallDataSchema.ts` as a structural reference** (same fields, same refinements, same defaults — but transcribed and re-validated). S01 D7 round-trip test takes a fixture extracted from a real PRYZM-1 project (`tests/fixtures/pryzm-1-snapshots/wall-sample.json`) and asserts both schemas accept it.

### §1.6 Greenfield gaps (what literally does not exist yet)

| Capability | PRYZM 1 status | 1A delivery |
|---|---|---|
| `pnpm-workspace.yaml` / `turbo.json` | absent (single root `package.json`, no monorepo) | S01 D1 |
| `tsconfig.base.json` (path aliases between packages) | absent (one `tsconfig.json` at repo root, `include: ["src"]`) | S01 D1 |
| `.github/workflows/` (CI) | **directory does not exist** | S01 D2 |
| ESLint (any config) | **absent — no `.eslintrc*` or `eslint.config.*` in repo** | S01 D1 |
| MessagePack codec | absent (zero `msgpack` imports) | S04 D2 |
| ULID generator | absent (uses `crypto.randomUUID()` everywhere — see `CreateWallCommand.ts:32`) | S01 D2 |
| IndexedDB persistence | absent (zero `indexedDB` / `idb` / `IDBDatabase` references in `src/`) | S04 D3 |
| OTel / structured tracing | absent (only `console.log` instrumentation today) | S02 D2 (set up); spans wired across S02–S06 |
| Vitest (unit-test runner) | partial — 7 `.test.ts` files in `tests/` but no `vitest.config.ts` | S01 D1 (config), S01 D7 (first new tests) |
| WebGPU support code | dependency present (`@webgpu/types`) but unused (zero `navigator.gpu` references) | S06 D2 |
| Visual-diff harness | absent (zero `pixelmatch` / `playwright` references) | S06 D6 |
| Bundle-size CI gate | absent | S06 D7 |

> **Implication**: S01 ships *nothing visible to a user* and *no new TypeScript runtime code outside `packages/schemas/`*. It is 100% scaffolding + tooling + boundaries + 20 schemas. This is by design.

---

## §2 Track allocation (the two parallel lanes)

The Phase 1A architecture has two natural cleavage planes. They are nearly orthogonal — the cleavage exists precisely so two agents can build in parallel without stepping on each other.

### §2.1 Track A — Data Layer (Agent A owns)

L0 + L1 + L2 + the persistence half of L7-bootstrap.

| Package | Sprint introduced | Mirrors PRYZM-1 file | Agent A primary |
|---|---|---|---|
| `packages/schemas/` | S01 | `src/elements/*/. *Types.ts` + `*DataSchema.ts` (~22 files, ~10 K LOC) | ✅ |
| `packages/protocol/` | S01 | `src/commands/types.ts` (1.4 K LOC) | ✅ |
| `packages/command-bus/` | S02 | `src/commands/CommandManager.ts` + `src/commands/PatchSnapshot.ts` (1.8 K LOC) | ✅ |
| `packages/persistence-client/` | S04 | `src/core/persistence/{ProjectSerializer,MigrationEngine}.ts` (1.0 K LOC) | ✅ |
| `packages/stores/` (skeleton + CubeStore) | S05 | `src/elements/walls/WallStore.ts` reference impl (clone-on-read pattern) | ✅ |
| `apps/editor/src/bootstrap.ts` (data half) | S06 | `src/engine/EngineBootstrap.ts` lines 100–600 (data wiring) | ✅ (with B for render half) |
| Custom ESLint rule `pryzm-affected-stores-required` | S02 | (no precedent) | ✅ |
| Custom ESLint rule `pryzm-no-three-in-kernel` | S03 | (no precedent — `00-AUDIT.md §1` found 380 THREE imports across 200+ files) | ✅ |
| Bench `apps/bench/save-edit.ts` | S04 | (no precedent) | ✅ |
| Bench `apps/bench/cmd-execute-latency.ts` | S02 | (no precedent — `WallPerfBench.ts` is the closest) | ✅ |

### §2.2 Track B — Render Layer (Agent B owns)

L5 + L7 render half + tooling/CI.

| Package | Sprint introduced | Mirrors PRYZM-1 file | Agent B primary |
|---|---|---|---|
| `tools/eslint-plugin-pryzm/` (host package) | S01 | `scripts/check-*.{mjs,sh}` (3 ad-hoc Node guards) | ✅ |
| `packages/frame-scheduler/` | S03 | `src/core/rendering/UnifiedFrameLoop.ts` (402 LOC) — **absorbed, generalised** | ✅ |
| Custom ESLint rule `pryzm-no-raf` | S03 | (no precedent — 53 sites in `src/`) | ✅ |
| Custom ESLint rule `pryzm-no-three-outside-committer` | S05 | (no precedent — 380 THREE imports today) | ✅ |
| `packages/scene-committer/` | S05 | `src/core/StoreEventBus.ts` (depth-counted batch wrapper) + 23 `*FragmentBuilder.ts` files | ✅ |
| `packages/renderer/` | S06 | `src/rendering/{createRenderer,pipeline/RenderPipelineManager}.ts` (~3 K LOC) | ✅ |
| `apps/editor/src/bootstrap.ts` (render half) | S06 | `src/engine/EngineBootstrap.ts` lines 600–2086 (render wiring) | ✅ (with A for data half) |
| Bench `apps/bench/idle-cpu.ts` | S03 | (no precedent — DevTools-only today) | ✅ |
| Bench `apps/bench/orbit-fps.ts` | S06 | (no precedent) | ✅ |
| `apps/editor/index.html` `?pryzm2=1` flag | S06 | `src/main.ts` (single entry point today) | ✅ |
| CI workflows in `.github/workflows/` | S01 | **absent** | ✅ |
| Bundle-size CI gate | S06 | **absent** | ✅ |
| OTel collector dev wiring (Honeycomb/Tempo) | S03 | **absent** | ✅ |

### §2.3 Joint deliverables (both agents touch, F arbitrates)

| Item | Sprint | Owner of final merge |
|---|---|---|
| `pnpm-workspace.yaml`, `turbo.json`, `tsconfig.base.json` | S01 D1 | F (after both agents propose) |
| `eslint.config.js` boundaries matrix | S01 D2 | F |
| `code-level ADR docs/02-decisions/adrs/0001-typed-id-brand.md` (typed-ID brand strategy) | S01 D3 | F (drafted by A) |
| `code-level ADR docs/02-decisions/adrs/0002-command-handler-signature.md` (command handler signature) | S02 D1 | F (drafted by A) |
| `code-level ADR docs/02-decisions/adrs/0003-scheduler-priority-vs-tickpriority.md` (scheduler API: `priority` queue-class vs `TickPriority` render-phase + absorption from `UnifiedFrameLoop.ts`) | S03 D1 | F (drafted by B, A reviews) |
| `[strategic ADR-004]` ratifies (MessagePack codec choice — the prior phase-doc `ADR-004` stub is deleted; bench numbers from S03-T8 spike attach to the strategic ADR's "Phase rollout S04") | S04 D2 | F (drafted by A) |
| `code-level ADR docs/02-decisions/adrs/0005-primitive-committer-interface.md` (`PrimitiveCommitter` interface) | S05 D2 | F (drafted by B, A reviews) |
| `code-level ADR docs/02-decisions/adrs/0006-idle-continuation-budget.md` (idle-continuation N-frame budget; relation to FrameCoordinator's 6-frame per-pass grace) | S03 D3 | F (drafted by B) |
| `[strategic ADR-006]` ratifies (WebGPU/WebGL2 dual-mode — the prior phase-doc `ADR-007` stub is deleted; CI matrix wiring documented in the strategic ADR's "Phase rollout S04/S08") | S06 D1 | F (drafted by B) |
| `[strategic ADR-009]` ratifies (Web Worker plugin sandbox model — 5-day pre-S01 spike output linked from `02-decisions/adrs/ADR-009-plugin-sandbox.md`) | S01 D1–D5 spike | F (drafted by A+B paired) |
| `apps/editor/src/bootstrap.ts` final | S06 D5 | F (paired session A+B) |

---

## §3 Sprint-by-sprint two-agent breakdown

Each sprint has the same structure: **goal**, **existing-code touchpoints** (what we read in `src/` to inform the work), **D1 kickoff**, **per-day tasks for A and B in parallel** with each task tagged with sub-phase IDs (`S0N-Tx.y`), **D5 integration sync**, **D9 demo + retro**, **per-sprint blocker analysis**, **non-regression validation steps**, **exit criteria**, **handoff to next sprint**.

---

### S01 — Workspace foundation, schemas, protocol (Weeks 1–2, M1)

**Joint goal (sprint contract)**: monorepo bootstrapped, 20 Zod schemas live, custom ESLint plugin scaffolded, CI green on a clean clone. **PRYZM 1 must still build and ship at end of D9** (no edits to `src/` in S01).

#### Existing-code touchpoints

| What we read in `src/` | Why |
|---|---|
| `package.json` (top-level) | Confirm `three ^0.183.2`, `immer ^11.1.4`, `zod ^4.3.6`, `@msgpack/msgpack` *missing*, `ulid` *missing*, `idb` *missing* — informs `pnpm-workspace.yaml` and which deps to add to which package. |
| `tsconfig.json` (top-level) | `include: ["src"]` — we need a `tsconfig.base.json` with `extends` chain so `pryzm2/` can have its own. Strict mode, `target: ESNext`, `module: ESNext`, `moduleResolution: bundler`, `lib: [ESNext, DOM, DOM.Iterable]`, `types: ["@webgpu/types", "node"]` — copy these into base. |
| `vite.config.ts` (top-level — also has `itemCatalogPlugin` virtual-module plugin) | Confirm Vite 7 plugin API; Phase 2 plugin host will follow this pattern. **Do not edit in S01.** |
| `src/elements/walls/WallTypes.ts:1`, `WallDataSchema.ts` | Reference for the `Wall.ts` schema; do not import. |
| `src/commands/types.ts:1–250` | Reference for the `Command`, `CommandResult`, `SerializedCommand` shapes; the new `packages/protocol/` mirrors these as wire types. |
| `scripts/check-*.{mjs,sh}` | Pattern reference for ESLint rule "shape" — what kinds of things we currently guard at script level. |

#### Sub-phases

- **S01-T1 — Monorepo bootstrap (D1)**: `pnpm-workspace.yaml`, `turbo.json`, `tsconfig.base.json`, `.changeset/`, `apps/`, `packages/`, `tools/`, `plugins/` directory scaffolding. Top-level `package.json` gains `"workspaces"` field. **Validation**: `pnpm install` works on a clean clone; `pnpm -r tsc --noEmit` returns zero errors (no packages exist yet; this just proves the workspace resolves).
- **S01-T2 — ESLint plugin scaffold (D2)**: `tools/eslint-plugin-pryzm/` with `package.json`, `index.ts` exporting an empty rule registry. `eslint.config.js` (flat config) at repo root with `@typescript-eslint/parser`, `eslint-plugin-boundaries`. Boundaries matrix encodes the L0→L7 dependency rules (`schemas` → none; `protocol` → schemas; `command-bus` → protocol+schemas; `persistence-client` → protocol+schemas; `stores` → schemas; `frame-scheduler` → none; `scene-committer` → stores+protocol+THREE; `renderer` → THREE; `apps/editor` → all packages). **Boundaries mode for `src/`**: `warn-only`. **Boundaries mode for `pryzm2/` paths**: `error`.
- **S01-T3 — CI scaffolding (D2)**: `.github/workflows/ci.yml` with steps `pnpm install`, `pnpm -r build`, `pnpm -r lint`, `pnpm -r typecheck`, `pnpm -r test`, `pnpm -r bench:baseline`. Honeycomb/Tempo env vars wired as repo secrets (placeholders OK in S01; real keys S03). Wall-clock budget: < 5 min on a clean clone.
- **S01-T4 — `packages/schemas/` + 5 schemas (D2–D5, Agent A)**: bootstrap `packages/schemas/` with Zod ^4.3.6. Author the **typed-ID brand factory** `createId<TBrand extends string>(prefix, ulid): Id<TBrand>` and the brand types `WallId, SlabId, DoorId, WindowId, ColumnId, …` (one per element family). Author the **canonical `Wall.ts` schema** with all defaults + refinements + JSDoc + first parse test (mirrors `WallDataSchema.ts`'s field set; **explicitly does not import THREE** — uses `Vec3` from `packages/schemas/Vec3.ts`). Multiply pattern across Slab, Door, Window, Roof.
- **S01-T5 — 15 more schemas (D5–D7, Agent A)**: Curtain Wall, Grid, Column, Beam, Stair, Handrail, Ceiling, Room, Furniture, Annotation, Dimension, Sheet, Schedule, View, Project. Each follows `Wall.ts` template exactly. **Validation rule**: every schema has at least one `.refine()` call (PRYZM-1 evidence: `WallDataSchema.ts` uses 4 — start ≠ end, height > 0, thickness > 0, openings inside wall length). Stand up `packages/protocol/index.ts` barrel exporting all DTOs + ID types.
- **S01-T6 — Lint rule scaffolds (D3–D4, Agent B)**: `pryzm-affected-stores-required` (S02 wires the AST walker — S01 ships a no-op fixture so the rule registry is proven). `pryzm-no-three-in-kernel` (S03 wires the AST walker). Both rules have a deliberate failing fixture file under `tools/eslint-plugin-pryzm/tests/fixtures/` and a passing one. Wire into CI.
- **S01-T7 — Bench harness (D6, Agent B)**: `apps/bench/` skeleton + `baseline.json` empty file. Vitest + custom timing wrapper + `pnpm -r bench:baseline` script. `docs/04-reference/architecture-detail/bench-harness.md` (S02 fills it in).
- **S01-T8 — Round-trip + typed-ID tests (D7, Agent A + B)**: `packages/schemas/__tests__/round-trip.test.ts` — every schema parses → serialises (JSON for now; MessagePack lands S04) → re-parses with byte equality. `packages/schemas/__tests__/typed-id.test.ts` — compile-time test that `WallId` cannot be passed where `SlabId` is expected (uses `// @ts-expect-error` directive). **Validation against PRYZM 1**: extract one wall snapshot from a saved PRYZM-1 project (`tests/fixtures/pryzm-1-snapshots/wall-sample.json`) and assert the new `Wall.parse()` accepts it.
- **S01-T9 — Bundle-size baseline + CI green (D8, both)**: `packages/protocol` size measured (target `< 50 KB raw, < 15 KB gzip`). Bundle-size CI gate set as **warn-only** in S01 (becomes hard-fail S06). First PR-level CI green on a clean clone.
- **S01-T0 (NEW, added 2026-04-27) — Plugin sandbox spike (D1–D5, F + A + B paired)**: 5-day measurement of postMessage RPC cost on the target plugin shapes (per `[strategic ADR-009]` Phase rollout S01). Output: 1-page report linked from `docs/02-decisions/adrs/ADR-009-plugin-sandbox.md`. Runs **in parallel** with S01-T1..T9; the spike does not block the monorepo bootstrap.
- **S01-T1' (NEW, added 2026-04-27) — OTel SDK wrapper lands (D2–D8, Agent A)**: `packages/otel/` per `[strategic ADR-007]`. First spans emitted from `packages/wire/`. Honeycomb dev account wired in S02. Labelled `T1'` (T-one-prime) to disambiguate from the existing S01-T1 monorepo bootstrap, which retains its number; both run in parallel D2–D8.

#### D1 — Kickoff (45 min, F + A + B)

- F walks through `08-VISION.md`, `phases/PHASE-1-FOUNDATION-M1-M12.md §2.S01`, **and §1 of this doc**.
- F locks final monorepo layout (no later than end of D1).
- A + B agree on commit-message convention (`<package>: <verb> <object>` — same convention used by PRYZM 1).
- B sets up the shared dev container / Replit setup; both agents confirm `pnpm install && pnpm test` works.

#### D2–D8 parallel work

| Day | Agent A (Track A — Schemas + Protocol) | Agent B (Track B — Tooling + CI) |
|---|---|---|
| D2 | **S01-T4 starts**. Bootstrap `packages/schemas/`, `packages/protocol/`. Implement `createId(prefix, ulid)` factory, typed `Id` brands. Author `Wall.ts` schema + first parse test. | **S01-T2 + S01-T3**. Bootstrap `tools/eslint-plugin-pryzm/`. Configure `eslint-plugin-boundaries`. Write `.github/workflows/ci.yml`. Set Honeycomb/Tempo env-var placeholders. |
| D3 | Multiply pattern across Slab, Door, Window, Roof (4 of 19 remaining). | **S01-T6 starts**. `pryzm-affected-stores-required` scaffold (no-op fixture). Failing + passing fixture files. Wire into CI. |
| D4 | Multiply pattern across Curtain Wall, Grid, Column, Beam, Stair (5 more). | `pryzm-no-three-in-kernel` scaffold. Wire boundaries plugin into `eslint.config.js` with the L0→L7 dependency matrix. Test every boundary edge with one fixture each. |
| D5 | Multiply pattern across Handrail, Ceiling, Room, Furniture, Annotation (5 more). | **D5 sync (1 h)** with A. Validate boundaries cover Track A's package shapes. Audit that A's `packages/schemas/package.json` has no forbidden dependencies. Add `forbiddenDependencies` ESLint config. |
| D6 | Multiply pattern across Dimension, Sheet, Schedule, View, Project (final 5). All 20 schemas exist. Stand up `packages/protocol/index.ts` barrel. | **S01-T7**. `apps/bench/` skeleton + `baseline.json` empty + Vitest harness + `pnpm -r bench:baseline`. |
| D7 | **S01-T8 (A side)**. `__tests__/round-trip.test.ts` — every schema parses → serialises → re-parses. Extract real PRYZM-1 fixture from `tests/fixtures/pryzm-1-snapshots/wall-sample.json` and assert `Wall.parse()` accepts it. | **S01-T8 (B side)**. `__tests__/typed-id.test.ts` (compile-time `@ts-expect-error` test that `WallId ≠ SlabId`) — coordinated with A. |
| D8 | Refinement edge cases (nested objects, optional vs default, discriminated unions). **S01-T9 (A side)**. Bundle size measurement: target `packages/protocol < 50 KB raw, < 15 KB gzip`. | **S01-T9 (B side)**. First PR-level CI green on a clean clone. Bundle-size gate warn-only. Write `docs/04-reference/architecture-detail/ci.md`. |

#### D9 — Sprint demo + retro (1 h, F + A + B)

- A demos: 20 schemas round-trip live; typed-ID compile error; protocol bundle size report; PRYZM-1 wall fixture parses.
- B demos: CI dashboard green; lint fixtures (passing + failing); boundaries matrix visualised.
- **Non-regression check (mandatory)**: `pnpm dev` (PRYZM 1, the legacy `node server.js`) still boots; `tests/projectIsolation.smoke.test.ts` still passes.
- Retro (30 min): what slowed each agent? Any track-overlap surprises?

#### D10 — Buffer / docs

- A: `docs/04-reference/architecture-detail/schemas.md` stub.
- B: `docs/04-reference/architecture-detail/ci.md` complete.
- Both: review `phases/PHASE-1-FOUNDATION-M1-M12.md §2.S02` together for D1-of-S02 alignment.

#### S01 blocker analysis

| Potential blocker | How it manifests | Pre-mitigation |
|---|---|---|
| Vite 7 + ESLint flat config + monorepo path aliases interact badly | `vite dev` cannot resolve `@pryzm/schemas` import from `apps/editor/`; or ESLint cannot resolve TS paths | F validates a 1-package "hello world" round trip on D1 evening before A + B start D2. |
| Boundaries lint catches PRYZM 1 imports as violations | CI hard-fails on `src/**` files | D2 boundaries config ships with `mode: 'warn'` for `src/**`, `mode: 'error'` for `pryzm2/**` and `packages/**`. Documented in `docs/04-reference/architecture-detail/ci.md`. |
| `tsconfig.base.json` `paths` shadow `src/` paths | PRYZM 1 build breaks (e.g. `src/elements/walls/WallStore` now resolves to `packages/stores/WallStore`) | The `paths` field ONLY maps `@pryzm/*` to `pryzm2/packages/*`; no PRYZM-1 paths are aliased. |
| Real PRYZM-1 wall fixture is unrepresentative | S10 will discover wall edge cases the schema didn't model | S01 D7 extracts THREE distinct walls (straight, curved, arc) from the same fixture project to broaden coverage. |
| New ULID dep clashes with `crypto.randomUUID()` already in commands | `CreateWallCommand.ts:32` uses `crypto.randomUUID()` for `id`. ULID is *additive* — old IDs remain valid string brands. | `code-level ADR docs/02-decisions/adrs/0001-typed-id-brand.md` explicitly: ULID is the **default** for new IDs; existing UUIDv4 strings remain valid `Id<T>` values; the brand checks shape, not encoding. |

#### S01 exit criteria (must all be true)

- [ ] All 20 Zod schemas validate fixtures extracted from `tests/fixtures/pryzm-1-snapshots/`.
- [ ] `packages/protocol` < 50 KB raw / < 15 KB gzip.
- [ ] Boundaries lint active (warn-only on `src/`, hard-fail on `packages/*` and `apps/{editor,bake-worker,sync-server,headless}`).
- [ ] `eslint.config.js` is the only ESLint config in the repo (no leftover `.eslintrc*`).
- [ ] CI green on a clean clone in < 5 min wall-clock.
- [ ] `code-level ADR docs/02-decisions/adrs/0001-typed-id-brand.md` (typed-ID strategy) merged.
- [ ] `pnpm dev` (legacy PRYZM 1) still boots and passes `tests/projectIsolation.smoke.test.ts`.
- [ ] No edit to any `src/**.ts` file in this sprint.

---

### S02 — Command bus + Immer patches + scheduler design (Weeks 3–4, M1–M2)

**Joint goal**: Track A delivers L2 (command bus, Immer patches, MessagePack PatchEmitter design + UndoStack). Track B starts the L5 frame-scheduler design and finishes a working scheduler skeleton ready for S03 hardening. **PRYZM 1 unchanged.**

#### Existing-code touchpoints

| What we read in `src/` | Why |
|---|---|
| `src/commands/CommandManager.ts:1–110` | The `execute()` method: snapshot → execute → restore-on-fail → push-to-history. Note specifically the `affectedStores` already-present field, the `PROJECT_LOAD` fast path, the 3 window-fallback constructor lines. |
| `src/commands/PatchSnapshot.ts:1–293` | The `PatchSnapshotEntry` shape and `SnapshotCompletenessSpec` registry. **Copy verbatim** into `packages/command-bus/types.ts`. |
| `src/commands/types.ts:1–250` | The 250+ `CommandType` enum values and the `Command` interface (`canExecute(ctx) → CommandValidationResult`, `execute(ctx) → CommandResult`, `serialize(): SerializedCommand`, `affectedStores`, `targetIds`, `id`, `type`, `timestamp`). |
| `src/commands/walls/CreateWallCommand.ts` | Reference impl. Note: `affectedStores = ["wall", "level"] as const`; ID minted via `crypto.randomUUID()`; `_neighbourSnapshot` private field used for cascade-undo of join-trim (a real-world undo edge case the new bus must support). |
| `src/core/StoreEventBus.ts:1–60` | The depth-counted `batch<T>(fn): T` wrapper. Borrow the depth-counter idea + the "no event drops" contract. |
| `src/core/rendering/UnifiedFrameLoop.ts` (lines 130–230) | The `addTickListener({ id, priority, callback })` API + `TickPriority` enum. **B copies this verbatim** for `packages/frame-scheduler/`. |

#### Sub-phases

- **S02-T1 — `CommandHandler<T>` + `HandlerContext` (D2, Agent A)**: implement in `packages/command-bus/`. Signature (`code-level ADR docs/02-decisions/adrs/0002-command-handler-signature.md`): `interface CommandHandler<TCmd, TStores> { canExecute(ctx: HandlerContext<TStores>, cmd: TCmd): ValidationResult; execute(ctx: HandlerContext<TStores>, cmd: TCmd): Promise<CommandResult>; readonly affectedStores: readonly (keyof TStores)[]; }`. **Critical**: `HandlerContext` is passed *only* by parameter — no `(window as any)` fallback. The bus throws synchronously if a required store key is missing from the context.
- **S02-T2 — `CommandBus.executeCommand` + handler registry (D2, Agent A)**: registry keyed by `cmd.type: CommandType`. OTel span `pryzm.command.execute` wraps every dispatch.
- **S02-T3 — Immer patches + `produceWithPatches` wrapper (D3, Agent A)**: `enablePatches()` is already idempotent (called in 3 PRYZM-1 places); call once in `command-bus/index.ts`. Implement `produceWithPatchesPerStore(stores, recipe)` that produces forward+inverse patches per affected store. Fixture handler: `MoveCubeCommand`.
- **S02-T4 — `PatchEmitter` design + ULID + audit metadata (D4, Agent A)**: emitter shape `{ commandId: ULID, actorId, projectId, clientId, timestamp, patches: PatchSnapshotEntry[] }`. ULID via `ulid` package (S01 added the dep). MessagePack codec choice → `[strategic ADR-004]` in S04 (**S02 ships JSON-only; codec swap is a single-file change later**).
- **S02-T5 — `UndoStack` (D5, Agent A)**: bounded size 100 (matches PRYZM 1's `CommandManager.history` cap). Apply inverse patches in reverse order on undo. **Cleared on `LOAD_PROJECT`** (matches PRYZM 1 contract — `clearHistory()` after load).
- **S02-T6 — `pryzm-affected-stores-required` real rule (D3, Agent B)**: AST walker — looks for missing `affectedStores` field on classes implementing `CommandHandler` (or extending the legacy `Command` interface, in `pryzm2/` mode only). Test against the S01 fixtures.
- **S02-T7 — `FrameScheduler.requestFrame(reason, priority)` API (D2, Agent B)**: pure data structure spike (no rAF integration). Priority enum: `'interaction' | 'idle' | 'background'` (`code-level ADR docs/02-decisions/adrs/0003-scheduler-priority-vs-tickpriority.md` ratifies). **Borrow**: copy `TickPriority = 'pre-render' | 'render' | 'post-render' | 'overlay'` from `UnifiedFrameLoop.ts` lines 95–98 into `packages/frame-scheduler/types.ts` — this is the *render-phase ordering*; `priority` (interaction/idle/background) is the *queue-class*.
- **S02-T8 — `FrameScheduler.markDirty(reason) / isDirty()` + dirty-flag set (D5, Agent B)**: dirty set keyed by `reason: string` (so we can attribute frames in OTel). OTel `pryzm.frame.tick` span. Bench `apps/bench/idle-cpu.ts` skeleton (full impl S03).
- **S02-T9 — `pryzm-no-raf` real rule (D4, Agent B)**: AST walker — blocks any `requestAnimationFrame(` outside `packages/frame-scheduler/src/**`. **Two modes** (per §1.3): error in `pryzm2/`, warn in `src/`. Snapshot-diff check: "did the count of rAF call sites in `src/` increase compared to `main`?" (CI script).
- **S02-T10 — Bench `apps/bench/cmd-execute-latency.ts` (D6, Agent B writes A's bench)**: measure `MoveCubeCommand` end-to-end (registry → execute → patches → emitter → JSON bytes). Target `< 1 ms p95`. Wire to CI; warn-only initially.

#### D1 — Kickoff (30 min)

- A presents `code-level ADR docs/02-decisions/adrs/0002-command-handler-signature.md` draft (command handler signature, citing `CommandManager.ts:30–60` for the legacy `Command` shape and lines 38–47 for the window-fallback antipattern that this ADR explicitly outlaws). F decides.
- B presents `code-level ADR docs/02-decisions/adrs/0003-scheduler-priority-vs-tickpriority.md` draft (scheduler `priority` vs `deadline` API, citing `UnifiedFrameLoop.ts:95–98` `TickPriority` for render-phase ordering vs `priority` for queue-class). F decides.
- Both agree on the OTel span naming convention (`pryzm.<layer>.<verb>`) — F locks it.

#### D2–D8 parallel work

| Day | Agent A (Track A — Command bus) | Agent B (Track B — Scheduler design + tooling) |
|---|---|---|
| D2 | **S02-T1 + S02-T2**. `CommandHandler<T>` + `HandlerContext` types. `CommandBus.executeCommand` + registry. OTel `pryzm.command.execute` wrap. | **S02-T7**. `FrameScheduler.requestFrame(reason, priority)` API spike (pure data structure, no rAF). |
| D3 | **S02-T3**. Immer + `enablePatches()` + `produceWithPatchesPerStore` wrapper. Fixture `MoveCubeCommand`. | **S02-T6**. `pryzm-affected-stores-required` real rule (AST walker). Test against fixtures. |
| D4 | **S02-T4**. `PatchEmitter` design (JSON; MessagePack S04). ULID. Audit metadata. | **S02-T9**. `pryzm-no-raf` real rule (AST walker; warn-mode for `src/**`). `code-level ADR docs/02-decisions/adrs/0006-idle-continuation-budget.md` draft (30 frames). |
| D5 | **S02-T5**. `UndoStack` (bounded 100, `LOAD_PROJECT` clears). **D5 sync (1 h)** with B: confirm scheduler API and command bus play well together (handlers don't call scheduler directly; they emit events that `markDirty` downstream). | **S02-T8**. `FrameScheduler.markDirty(reason) / isDirty()` + dirty-flag set. OTel `pryzm.frame.tick` span. Bench `apps/bench/idle-cpu.ts` skeleton. |
| D6 | End-to-end test: `MoveCubeCommand` registry → execute → patches → emitter → JSON bytes → undo round-trip. | **S02-T10**. Bench `apps/bench/cmd-execute-latency.ts` < 1 ms target. Wire to CI; warn-only. |
| D7 | `affected-stores-required` lint integration test (a fixture with missing `affectedStores` fails CI). | `pryzm-no-raf` lint integration test against fixture. |
| D8 | `packages/command-bus/__tests__/` complete: sample handler, undo, patch correctness, JSON round-trip. Bundle: `command-bus < 80 KB raw / < 25 KB gzip`. | Documentation `docs/04-reference/architecture-detail/frame-scheduler.md` (API only — implementation in S03). |

#### D9 — Sprint demo + retro (1 h)

- A demos: live execute + undo + redo of `MoveCubeCommand`; OTel trace in Honeycomb dev env; lint blocks malformed PR fixture.
- B demos: scheduler API surface; `pryzm-no-raf` blocks new `requestAnimationFrame(` in `pryzm2/` fixture but only warns in `src/` fixture.
- **Non-regression check**: `pnpm dev` (PRYZM 1) still boots; `tests/curtainWallBuilderFastPath.spec.test.ts` still passes; rAF count in `src/` did not change (snapshot diff).

#### S02 blocker analysis

| Potential blocker | How it manifests | Pre-mitigation |
|---|---|---|
| Immer patch generation slow on large state trees | `produceWithPatches` allocates patch arrays; PRYZM-1 measured `structuredClone(wallStore.getAll())` at 8–30 ms for projects with 5K walls | The PRYZM-2 store-per-element model means `produceWithPatchesPerStore` operates on one store's `Map<id, T>` at a time, not on a god-blob. Bench S02-T10 enforces < 1 ms; the 5K-wall case is tested in S08 (1B). |
| ULID and `crypto.randomUUID()` coexistence is confusing | Some IDs are `01H...` shape, others are UUID-v4 | `code-level ADR docs/02-decisions/adrs/0001-typed-id-brand.md` documents both as valid `Id<T>` values; helper `isUlid(id) / isUuid(id)` exposed for forensics; new code mints ULIDs. |
| The `affectedStores` lint rule false-positives on PRYZM 1's 264 existing commands | CI fails on `src/commands/walls/CreateWallCommand.ts` even though it does declare `affectedStores` | The rule is `pryzm2/` mode only. PRYZM 1's commands are exempt. |
| Honeycomb env vars not set in F's repo secrets | OTel calls fail silently; no traces in dev | The OTel SDK is wrapped in a `noopExporter` in dev when `HONEYCOMB_API_KEY` is unset. F sets the real key in S03 D2. |
| The `priority` vs render-phase `TickPriority` distinction confuses both agents | Code reviews flag PRs that mix the two enums | `code-level ADR docs/02-decisions/adrs/0003-scheduler-priority-vs-tickpriority.md` has a 1-paragraph table: *"`priority` answers WHEN the frame happens (this rAF, idle rAF, background); `TickPriority` answers WHERE inside one rAF a callback runs (pre-render, render, post-render, overlay). They are orthogonal."* |

#### S02 exit criteria

- [ ] `MoveCubeCommand` executes in < 1 ms p95 (bench gate); patches correct on undo; round-trip via JSON OK.
- [ ] `affected-stores-required` lint blocks PRs with missing declarations in `pryzm2/`.
- [ ] `pryzm-no-raf` lint blocks `requestAnimationFrame(` outside scheduler in `pryzm2/`; warns in `src/` and snapshot-diffs the count.
- [ ] OTel spans `pryzm.command.execute` visible in Honeycomb dev (or noop-exporter logs in dev if the secret is unset).
- [ ] `code-level ADR docs/02-decisions/adrs/0002-command-handler-signature.md`, `code-level ADR docs/02-decisions/adrs/0003-scheduler-priority-vs-tickpriority.md`, and `code-level ADR docs/02-decisions/adrs/0006-idle-continuation-budget.md` merged.
- [ ] PRYZM 1 still boots; rAF count in `src/` unchanged.

---

### S03 — Frame scheduler hardening + idle-zero proof (Weeks 5–6, M2)

**Joint goal**: scheduler genuinely owns rAF; idle CPU < 2% proven on a "bouncing cube" demo; CI bench gate active. Agent A continues with persistence-client design (stays one sprint ahead so S04 starts cleanly). **PRYZM 1 unchanged.**

#### Existing-code touchpoints

| What we read in `src/` | Why |
|---|---|
| `src/core/rendering/UnifiedFrameLoop.ts:230–402` | The `start()`, `_tick()`, `beginViewSwitch() / endViewSwitch()` impl. Lessons: a single hot rAF loop is fine; the priority queue inside the tick (pre-render → render → post-render → overlay) keeps order deterministic; `addTickListener` returns a disposer. **B reproduces these patterns**. |
| `src/core/rendering/FrameCoordinator.ts` (whole file) | The dirty-flag mechanism + 6-frame per-pass grace counter. **B's `markDirty/isDirty` impl borrows the per-pass grace pattern but generalises the pass key from `'ssgi'\|'traa'\|'outline'\|'bloom'` to arbitrary `string`.** |
| `src/core/persistence/ProjectSerializer.ts` (whole file, 857 LOC) | The full PRYZM-1 save pipeline. A reads to design `EventLog`. Note specifically the 26+ store imports at the top — that import manifest IS the schema of "what we persist". |
| `src/core/persistence/MigrationEngine.ts` | The schema-version migration pattern. The new event log will need versioning too (`PatchEmitter` envelope carries `version: number`). |
| `package.json` deps | Confirm `idb` and `@msgpack/msgpack` are *not* present. A adds them in `packages/persistence-client/package.json` only — no top-level dep change. |

#### Sub-phases

- **S03-T1 — Real rAF wiring (D2, Agent B)**: `FrameScheduler` owns the actual `requestAnimationFrame` loop. Priority queue (interaction > idle > background). `cancelFrame(token)`. The implementation pattern follows `UnifiedFrameLoop._tick` (lines 280–360 in PRYZM 1) but for a single render path, no OBC/PASCAL split.
- **S03-T2 — `IdleContinuation` (D3, Agent B)**: bounded N-frame budget after motion stops. **N = 30 frames** (`code-level ADR docs/02-decisions/adrs/0006-idle-continuation-budget.md`). Wire OTel `pryzm.frame.idle-continuation` event. Distinct from `FrameCoordinator`'s 6-frame per-pass grace — that lives in the future committer; this lives in the scheduler.
- **S03-T2a (NEW, added 2026-04-27) — Browser worker pool cap (D3, Agent B)**: the frame scheduler must enforce a **hard cap of 4** browser Web Workers per `[strategic ADR-005]` (worker pool policy). The scheduler refuses to spawn a 5th and surfaces a structured error (`worker.pool.exhausted`). Document the cap in `packages/frame-scheduler/README.md` and test with a fixture that requests 5 workers and asserts the 5th is rejected.
- **S03-T3 — Bouncing-cube demo (D4, Agent B)**: scene driven only by scheduler — interaction triggers `markDirty('user-input')`, idle goes to 0 fps after the 30-frame continuation. DevTools profile captured. **The cube is rendered with raw THREE inside `apps/bench/`** (not yet via the committer — that lands S05).
- **S03-T4 — `apps/bench/idle-cpu.ts` real impl (D5, Agent B)**: drives the bouncing cube for 30 s; samples CPU via `performance.measure`; reports p50/p95/p99. Baseline captured in `baseline.json`. Target < 2% CPU when scene idle. **CI gate hard-fails > 2.5%.**
- **S03-T5 — Scheduler audit (D7, Agent B)**: confirm zero `requestAnimationFrame(` in `pryzm2/packages/**` outside `packages/frame-scheduler/src/**`. The lint rule from S02 enforces it; this sub-phase is the manual sanity check.
- **S03-T6 — `EventLog` interface design (D2, Agent A)**: pluggable `Backend` interface (`InMemoryBackend`, `IndexedDbBackend`). `EventLog.append(event) → Promise<void>`, `EventLog.replay(fromSeq) → AsyncIterable<Event>`, `EventLog.checkpoint(seq) → Promise<void>`. Document in `docs/04-reference/architecture-detail/persistence-design.md`.
- **S03-T7 — `InMemoryBackend` (D3, Agent A)**: used by tests + Node headless. Round-trip 1K events sanity check.
- **S03-T8 — MessagePack codec spike (D4, Agent A)**: encode 1K sample events with `@msgpack/msgpack`, `msgpack-lite`, `notepack.io`. Measure: bytes-per-event avg, encoding speed, decoding speed, bundle size of the codec. Output to `[strategic ADR-004]` (the existing strategic ADR's "Phase rollout S04" section receives the bench numbers; no new sprint-scoped ADR is created). **Target: avg < 200 bytes per command event.**
- **S03-T9 — `IndexedDbBackend` sketch (D6, Agent A)**: `idb` wrapper. Single-writer queue design (mitigates R1A-06: "concurrent writes corrupt the IndexedDB transaction"). Full impl S04.

#### D1 — Kickoff (30 min)

- B presents idle-continuation budget bench results — F confirms 30 frames.
- A presents `EventLog` API design (for S04) — B reviews for scheduler-priority alignment (load tasks should be `'background'` priority).

#### D2–D8 parallel work

| Day | Agent A (Track A — Persistence design + S02 polish) | Agent B (Track B — Scheduler real impl) |
|---|---|---|
| D2 | **S03-T6**. Design `EventLog` interface + `Backend` interface. Decide pluggable backends. Doc `docs/04-reference/architecture-detail/persistence-design.md`. | **S03-T1**. Wire scheduler to actual `requestAnimationFrame`. Implement priority queue. `cancelFrame(token)`. |
| D3 | **S03-T7**. Implement `InMemoryBackend`. Round-trip 1K events. | **S03-T2**. Implement `IdleContinuation` (30 frames). OTel `pryzm.frame.idle-continuation` event. |
| D4 | **S03-T8**. MessagePack codec spike (3 alternatives benched). | **S03-T3**. Bouncing-cube demo — interaction triggers dirty, idle goes to 0 fps. DevTools profile captured. |
| D5 | **D5 sync (1 h)** with B: verify A's `loader.ts` (S04 stub) can use `scheduler.requestFrame(reason, 'background')` without inverting the dependency. | **S03-T4**. Wire `apps/bench/idle-cpu.ts` to scheduler; baseline captured. Target < 2% CPU; CI gate hard-fails > 2.5%. |
| D6 | **S03-T9**. Sketch `IndexedDbBackend` using `idb`. Single-writer queue design. | Wire bench `apps/bench/orbit-fps.ts` skeleton (full target test S06 with renderer). |
| D7 | Author S04 sprint plan in `docs/03-execution/status/sprints/S04.md` (joint review with B). | **S03-T5**. Replace any pre-flight rAF usages in scaffolding with scheduler calls. Audit `packages/**` — zero rAF outside scheduler. |
| D8 | Documentation `docs/04-reference/architecture-detail/persistence.md` (design only). | Documentation `docs/04-reference/architecture-detail/frame-scheduler.md` (full impl section). |

#### D9 — Sprint demo + retro

- B demos: bouncing cube; DevTools shows flat-line CPU when idle; 60 fps when interacting; lint blocks fixture rAF.
- A presents persistence design walk-through + MessagePack codec bench results.
- **Non-regression check**: PRYZM 1's `UnifiedFrameLoop` still drives the legacy app on the default URL.

#### S03 blocker analysis

| Potential blocker | How it manifests | Pre-mitigation |
|---|---|---|
| `requestAnimationFrame` is throttled to 1 Hz when the tab is hidden | `idle-cpu.ts` bench misreports because the bench window is backgrounded | Bench harness sets `document.visibilityState === 'visible'` precondition; CI runs in a foregrounded headless Chromium. |
| The 30-frame idle budget hides genuine idle-CPU regressions | Subsystem mistakenly calls `markDirty` every tick; CPU stays at 100% but it "looks intentional" | OTel `pryzm.frame.tick` span includes `dirtyReasons: string[]`. CI bench reports unique `dirtyReasons` per second; > 1 unique reason on an "idle" scene is a warn. |
| Two scheduler instances coexist (PRYZM 1's `UnifiedFrameLoop` + PRYZM 2's `FrameScheduler`) double-tax CPU when both load | Hello-cube demo CPU is 4% (2% PRYZM 1 + 2% PRYZM 2) | The `?pryzm2=1` flag is **mutually exclusive** with PRYZM-1 boot. `apps/editor/index.html` either dynamic-imports `EngineBootstrap.ts` (legacy) OR `pryzm2/bootstrap.ts` (new), never both. |
| MessagePack codec choice has unforeseen size regression | One codec is fast but encodes 30% larger | `[strategic ADR-004]` (its Phase rollout S04 section) ratifies based on actual bench numbers from S03-T8; if all three fail < 200 B/event, target is relaxed to < 250 B and tracked. |
| `IndexedDB` writes are non-blocking but order-sensitive | Two `append()` calls land out of order; replay diverges | Single-writer queue design (S03-T9): `append()` returns a promise that resolves only when the prior append's transaction commits. Tested S04. |

#### S03 exit criteria

- [ ] `apps/bench/idle-cpu.ts` reports < 2% CPU on idle scene (CI gate hard-fails > 2.5%).
- [ ] Bouncing-cube demo: 60 fps interaction, 0 fps idle (DevTools profile attached to PR).
- [ ] `pryzm-no-raf` lint hard-fails on any fixture rAF in `pryzm2/` outside scheduler.
- [ ] OTel spans `pryzm.frame.tick`, `pryzm.frame.idle-continuation` visible in Honeycomb (or noop logs).
- [ ] `[strategic ADR-004]` codec choice ratified (Phase rollout S04 section updated); bench numbers attached to the strategic ADR.
- [ ] PRYZM 1 still ships unchanged.

---

### S04 — Persistence client v0 (event log) + Track B prepares for committer (Weeks 7–8, M2–M3)

**Joint goal**: Track A delivers durable event log (in-memory + IndexedDB), append < 10 ms; Track B drafts the `PrimitiveCommitter` interface and `MaterialPool` skeleton. **PRYZM 1 unchanged.**

#### Existing-code touchpoints

| What we read in `src/` | Why |
|---|---|
| `src/core/persistence/ProjectSerializer.ts` (whole file) | The full save manifest (26+ stores). A confirms the new event-log replay can rebuild the same state. |
| `src/core/persistence/MigrationEngine.ts` | Versioned migrate pattern. PatchEmitter envelope reuses the version field. |
| `src/elements/walls/WallFragmentBuilder.ts` (2,256 LOC, head only) | The per-element builder pattern: subscribe to store events, materialise THREE meshes, manage an `Object3D` lifecycle. **B reads to inform `PrimitiveCommitter<TStore>`** — the new pattern inverts (committer is dispatched-to rather than polling) but the lifecycle (`add → update → remove → dispose`) is identical. |
| `src/elements/walls/WallStore.ts:78` | `Map<string, WallData>` + `Object.freeze` clones. The committer must not mutate the store; it reads and dispatches. |
| `src/core/StoreEventBus.ts` `emit()` site | The event shape PRYZM 1 emits per store change — informs the committer's `applyPatches(patches: PatchSnapshotEntry[])` signature. |

#### Sub-phases

- **S04-T1 — `EventLog` core (D2, Agent A)**: implement in `packages/persistence-client/`. Wire `InMemoryBackend` round-trip.
- **S04-T2 — `IndexedDbBackend` (D3, Agent A)**: `idb` wrapper + single-writer queue (mitigates R1A-06). Transaction-safety tests (interleaved appends, page-reload mid-transaction).
- **S04-T3 — Wire `EventLog` into `command-bus.PatchEmitter` (D4, Agent A)**: end-to-end: command → patches → event → log. Each event is `{ commandId: ULID, seq: number, version: number, patches: PatchSnapshotEntry[], audit: { actorId, projectId, clientId, timestamp } }`.
- **S04-T4 — `apps/bench/save-edit.ts` (D6, Agent A)**: measure single-event append p95. Target `< 10 ms`. **CI hard-fails > 12 ms.**
- **S04-T5 — Causal-order tests (D7, Agent A)**: events with same wall-clock timestamp are ordered by `seq`. Large-volume tests (10K events). Per-event size: < 200 bytes typical (CI report).
- **S04-T6 — `PrimitiveCommitter<TStore>` interface (D2, Agent B)**: signature (`code-level ADR docs/02-decisions/adrs/0005-primitive-committer-interface.md`): `interface PrimitiveCommitter<TStore, TElement extends Object3D = Object3D> { onAdd(id: Id, dto: TStore[Id]): TElement; onUpdate(id: Id, dto: TStore[Id], obj: TElement): void; onRemove(id: Id, obj: TElement): void; onDispose(): void; }`. Lock the API — every plugin's `committer.ts` will implement this.
- **S04-T7 — `SceneRegistry` (D3, Agent B)**: `Map<ElementId, THREE.Object3D>` — O(1) `add/remove/get/updateTransform`.
- **S04-T8 — `MaterialPool` skeleton (D4, Agent B)**: shared materials by hash, ref-counting (`acquire(hash) / releaseRef(hash)`).
- **S04-T9 — `CubeStore` + `CubeCommitter` end-to-end test (D5, Agent B)**: uses A's event log → store apply → committer → THREE mesh.
- **S04-T10 — `pryzm-no-three-outside-committer` lint scaffold (D6, Agent B)**: AST walker — full enforcement S05 once first plugin/committer exists. **Allowlist**: `pryzm2/packages/scene-committer/**`, `pryzm2/packages/renderer/**`, `pryzm2/plugins/*/committer.ts`. **Two modes** (per §1.4): error in `pryzm2/`, warn-only diff-check in `src/`.

#### D1 — Kickoff (30 min)

- A presents the `[strategic ADR-004]` Phase-rollout-S04 update (MessagePack codec choice — final, with S03-T8 bench numbers attached). F decides.
- B presents `code-level ADR docs/02-decisions/adrs/0005-primitive-committer-interface.md` draft (`PrimitiveCommitter<TStore>` interface signature). A reviews for store-pattern alignment.

#### D2–D8 parallel work

| Day | Agent A (Track A — Persistence v0) | Agent B (Track B — Committer interface + materials) |
|---|---|---|
| D2 | **S04-T1**. `EventLog` core. `InMemoryBackend` round-trip. | **S04-T6**. `PrimitiveCommitter<TStore>` interface. Lock the API. |
| D3 | **S04-T2**. `IndexedDbBackend` + single-writer queue. Transaction-safety tests. | **S04-T7**. `SceneRegistry` (`Map<ElementId, THREE.Object3D>`) — O(1) ops. |
| D4 | **S04-T3**. Wire `EventLog` into `command-bus.PatchEmitter`. End-to-end: command → event → log. | **S04-T8**. `MaterialPool` skeleton — shared by hash, ref-counted. |
| D5 | **D5 sync (1 h)** with B: confirm event log can supply replay events to a future scene committer at startup. | **S04-T9**. Sample `CubeStore` + `CubeCommitter` end-to-end test. |
| D6 | **S04-T4**. `apps/bench/save-edit.ts`; baseline captured. Target < 10 ms p95 (CI hard-fail > 12 ms). | **S04-T10**. `pryzm-no-three-outside-committer` lint scaffold (full enforce S05). |
| D7 | **S04-T5**. Causal-order tests; 10K-event volume tests; per-event-size CI report. | OTel `pryzm.scene.commit` span. Material-pool dedup test (100 cubes → 1 material). |
| D8 | OTel `pryzm.persistence.append` span. Documentation `docs/04-reference/architecture-detail/persistence.md` (impl section). | Documentation `docs/04-reference/architecture-detail/scene-committer.md` (interface + design). |

#### D9 — Sprint demo + retro

- A demos: 5 commands → IndexedDB; reload page → events replay correctly; bench < 10 ms.
- B demos: cube store update → patch → committer → THREE mesh; remove → mesh gone; material dedup proof.
- **Non-regression check**: PRYZM 1's `ProjectSerializer.serialize()` still produces a valid snapshot of `tests/fixtures/pryzm-1-snapshots/wall-sample.json`.

#### S04 blocker analysis

| Potential blocker | How it manifests | Pre-mitigation |
|---|---|---|
| Concurrent writes corrupt IndexedDB transaction | Reload mid-write loses last 5 events | Single-writer queue (S03-T9 design); transaction-safety tests in S04-T2 deliberately interleave appends and reloads. |
| Replay diverges due to non-determinism | Event log says "create wall A", but on replay `WallStore.add` runs in a different order than originally | Each event carries `seq: number`; replay is strict sequential; PRYZM 2 stores' `applyPatch` is pure (no side effects to other stores). |
| `idb` wrapper bundle adds 20 KB to initial load | Bundle-size gate triggers in S06 | `packages/persistence-client/` is dynamic-imported by `bootstrap.ts` only when a project is opened (mirrors PRYZM 1's deferred `EngineBootstrap` pattern). |
| `PrimitiveCommitter` interface locks too early; the wall plugin in S07 needs a different shape | S08 has to ADR an interface change | S04 D5 paired session walks through CubeCommitter and one wall-shaped pseudo-committer; if `code-level ADR docs/02-decisions/adrs/0005-primitive-committer-interface.md` cannot satisfy a wall-shape, that ADR is delayed to S05. |
| Material-pool ref-counting has a leak under churn | 1K material acquire/release leaves N residuals | `acquire()` returns a `Disposable` (per-call ref-count token), not raw access; the test in S05-T4 cycles 1K times and asserts `pool.size() === 1`. |

#### S04 exit criteria

- [ ] 100 events round-trip in < 1 s; sequence preserved.
- [ ] `save-edit.ts` bench: < 10 ms p95 single-event append.
- [ ] IndexedDB backend survives page reload + replays correctly.
- [ ] Per-event size: < 200 bytes typical, < 2 KB worst-case.
- [ ] `PrimitiveCommitter` interface locked; `code-level ADR docs/02-decisions/adrs/0005-primitive-committer-interface.md` merged.
- [ ] PRYZM 1 still ships unchanged.

---

### S05 — Scene committer hardening + Track A starts stores (Weeks 9–10, M3)

**Joint goal**: Track B finishes the production `SceneCommitter` (now ready to accept the wall plugin in S07); Track A scaffolds the `packages/stores/` package and starts the `apps/editor/src/bootstrap.ts` data-side wiring. **PRYZM 1 unchanged.**

#### Existing-code touchpoints

| What we read in `src/` | Why |
|---|---|
| `src/elements/walls/WallStore.ts` (whole file, ~600 LOC) | The reference impl for the `Store<T>` base class. Note: `Map<id, T>`, `Object.freeze` clones, listener API. **A copies the structural pattern** for `Store<T>`. |
| `src/elements/walls/WallFragmentBuilder.ts` (2,256 LOC) | The `add → update → remove → dispose` lifecycle. **B copies the pattern** into `SceneCommitter.applyPatches()`. |
| `src/core/StoreEventBus.ts` `batch()` impl | The depth-counted wrapper. **B copies** into `SceneCommitter.batch()` so patches dispatch in one tick. |
| `src/engine/EngineBootstrap.ts` lines 100–600 | The data-wiring half. **A reads** to inform `apps/editor/src/bootstrap.ts` data half (S06 paired session). |
| `src/engine/subsystems/initStores.ts` (115 LOC) | The store-registration manifest. **A reads** to confirm the committer-bind site shape. |

#### Sub-phases

- **S05-T1 — `Store<T>` base class (D2, Agent A)**: `applyPatch(patches: Patch[]) → DirtyDiff` + `subscribeDirty(diff => ...) → Disposer` + `getState()`. Mirrors `WallStore.ts:75–80` clone-on-read pattern. **DTO-only** (no THREE).
- **S05-T2 — `CubeStore` (D3, Agent A)**: the Hello Cube state. Used by S06 demo. ~50 LOC.
- **S05-T3 — Stores ↔ command-bus integration (D4, Agent A)**: integration tests — handler patches a store; subscriber observes diff; second handler patches a different store; both diffs are visible.
- **S05-T4 — `SceneCommitter.bindStore<T>(store, committer)` (D2, Agent B)**: wires patch application to committer dispatch. The committer receives `{ added: T[], updated: T[], removed: Id[] }` per tick.
- **S05-T5 — Patch dispatcher with batching (D3, Agent B)**: groups adds/removes/updates per tick. Calls `MaterialPool.releaseRef()` on `onRemove`. Coalesces multiple updates to the same id within one batch.
- **S05-T6 — `MaterialPool` dispose paths + GPU-leak assertion (D4, Agent B)**: end-of-test memory delta < 5 MB after 1K acquire/release cycles. Tested with `(performance as any).memory` (Chromium-only, gated).
- **S05-T7 — Visual smoke test (D5, Agent B)**: 100 cubes added, transformed, removed — no leak, no flicker. **Validation against `code-level ADR docs/02-decisions/adrs/0005-primitive-committer-interface.md`**: confirms `CubeCommitter` works against the locked `SceneCommitter`.
- **S05-T8 — Bootstrap data half (D6, Agent A)**: start `apps/editor/src/bootstrap.ts` data half — wires `protocol`, `command-bus`, `persistence-client`, `stores`. Render half S06.
- **S05-T9 — Bench full pipeline (D7, Agent A)**: `apps/bench/cmd-execute-latency.ts` re-run with full pipeline (handler → patch → store → committer → scene). Target < 5 ms p95 (excludes render).
- **S05-T10 — Make `pryzm-no-three-outside-committer` an error (D7, Agent B)**: switch from warn to error in `pryzm2/`. Allowlist: `packages/scene-committer/**`, `packages/renderer/**`, `plugins/*/committer.ts`. **`src/` mode stays warn-only with snapshot diff.**

#### D1 — Kickoff (30 min)

- B reports `MaterialPool` GPU-memory test results from S04 D7.
- A presents `packages/stores/` shape — discriminated-union `applyPatch(Patch[]) → DirtyDiff` contract.

#### D2–D8 parallel work

| Day | Agent A (Track A — Stores skeleton + bootstrap data half) | Agent B (Track B — Committer hardening) |
|---|---|---|
| D2 | **S05-T1**. Bootstrap `packages/stores/` with `Store<T>` base. `applyPatch` + `subscribeDirty` + `getState`. | **S05-T4**. `SceneCommitter.bindStore<T>(store, committer)`. |
| D3 | **S05-T2**. `CubeStore` (Hello Cube state). | **S05-T5**. `SceneCommitter` patch dispatcher with batching. |
| D4 | **S05-T3**. Stores ↔ command-bus integration tests. | **S05-T6**. Material-pool dispose paths + GPU-leak assertion. |
| D5 | **D5 sync (1 h)** with B: confirm CubeCommitter works against final SceneCommitter; agree on Hello Cube fixture for S06. | **S05-T7**. Visual smoke test: 100 cubes added/transformed/removed — no leak, no flicker. |
| D6 | **S05-T8**. Start `apps/editor/src/bootstrap.ts` data half. | OTel `pryzm.scene.commit` span includes `add/remove/update` counts. |
| D7 | **S05-T9**. Bench full pipeline < 5 ms p95 (excludes render). | **S05-T10**. Make `pryzm-no-three-outside-committer` an error in `pryzm2/`. |
| D8 | Documentation `docs/04-reference/architecture-detail/stores.md`. | Documentation `docs/04-reference/architecture-detail/scene-committer.md` (full impl section). |

#### D9 — Sprint demo + retro

- A demos: CubeStore + bootstrap data half wired; commands persist + replay across reload.
- B demos: 100 cubes — orbit + colour-update; DevTools shows zero garbage from material churn.
- **Non-regression check**: PRYZM 1's `WallStore` + `WallFragmentBuilder` still operate; `tests/curtainPanelStoreIndexInvariants.spec.test.ts` still passes.

#### S05 blocker analysis

| Potential blocker | How it manifests | Pre-mitigation |
|---|---|---|
| `Store<T>.applyPatch` semantics conflict with PRYZM 1's `Object.freeze` cloning | Patches mutate frozen objects; throws in strict mode | The PRYZM-2 `Store<T>` uses immer `produce`; immer handles frozen targets natively. The PRYZM-1 freezing is not in the PRYZM-2 path. |
| Material-pool ref-counting fails when a single material is acquired by multiple cubes that update simultaneously | Race: cube A's `onRemove` releases the material before cube B's `onAdd` acquires it | Per-tick batching in S05-T5 ensures `onAdd` runs before `onRemove` for the same material hash within one batch. Test S05-T7 enforces this. |
| `bindStore` + dispatcher creates a memory leak when a store is unbound | Disposer not called; subscriber retains the committer | `bindStore` returns a `Disposable`; bootstrap must call it on tear-down. ESLint rule `no-floating-disposables` (added S05) catches missed unbinds. |
| The 5 ms p95 target is too tight — Chromium GC pauses spike to 30 ms | Bench fails on the 95th percentile | Bench harness uses `performance.now()` *between* GC events; CI runs N=200 samples and uses median for p95. The bench reports also `gcPaused: number` for visibility. |
| Bootstrap data half conflicts with Bootstrap render half | A's wiring assumes scheduler is already started; B's wiring assumes stores are already bound | The S06 D5 paired session resolves this. S05's data half is wired but `bootstrap.start()` is a no-op stub until S06 D5. |

#### S05 exit criteria

- [ ] `CubeStore` + `CubeCommitter` end-to-end: store update → patch → committer → THREE mesh in scene.
- [ ] `MaterialPool` deduplicates a 100-cube scene to 1 material.
- [ ] Lint rule `pryzm-no-three-outside-committer` errors on any THREE import outside allowed locations in `pryzm2/`.
- [ ] `apps/editor/src/bootstrap.ts` data half wired (render half pending S06).
- [ ] OTel `pryzm.scene.commit` span fires per commit with counts.
- [ ] Full pipeline bench: < 5 ms p95 (handler → patch → store → committer; excludes render).
- [ ] PRYZM 1 still ships unchanged.

---

### S06 — Renderer + bootstrap integration + Hello Cube demo (Weeks 11–12, M3)

**Joint goal**: the `?pryzm2=1` URL flag swaps in PRYZM 2 stack; cube demo passes idle-zero, orbit-60, undo-redo, save-reload; WebGPU + WebGL2 dual-mode parity; bundle < 1.8 MB gzip; **all four custom ESLint rules active and PR-blocking**. **Sub-phase 1A close.** PRYZM 1 still default URL.

#### Existing-code touchpoints

| What we read in `src/` | Why |
|---|---|
| `src/main.ts` (entry point) | The PRYZM 1 entry pattern. **B mirrors** for `apps/editor/index.html`; the new `?pryzm2=1` branch chooses the PRYZM-2 dynamic import. |
| `src/rendering/createRenderer.ts` (~150 LOC, 4 `(window as any)` casts) | The PRYZM 1 renderer factory. **B reads for lessons**, does not import. |
| `src/rendering/pipeline/RenderPipelineManager.ts` (~2,500 LOC) | The PRYZM 1 post-FX pipeline. **B reads for "what we are NOT building in 1A"** — the new renderer is single-pass forward only, no post-FX. |
| `src/engine/EngineBootstrap.ts` lines 600–2086 (render-side init) | The PRYZM 1 render-wiring half. **A + B paired session D5** mirrors this for `apps/editor/src/bootstrap.ts`. |
| `vite.config.ts` (top-level) | The build config; B confirms `?pryzm2=1` does not trigger a bundle-split that breaks the existing `itemCatalogPlugin` virtual module. |

#### Sub-phases

- **S06-T1 — `Renderer.init(canvas, mode)` (D2, Agent B)**: auto-detect WebGPU vs WebGL2. `[strategic ADR-006]` fallback path. `mode: 'auto' | 'webgpu' | 'webgl2'`.
- **S06-T1a (NEW, added 2026-04-27) — Visual-diff CI gate at warning level (D7, Agent B)**: per `[strategic ADR-006]` Phase rollout S08. The 24-scene corpus is **not** required at S06; warning-level on a 4-scene smoke set is the S06 deliverable. The corpus expands to 24 scenes in Phase 1B / S08 when the wall plugin lands. Labelled `S06-T1a` to disambiguate from the existing S06-T2 (`CameraController`).
- **S06-T2 — `CameraController` (D3, Agent B)**: vanilla orbit camera; pointer + wheel; calls `scheduler.markDirty('camera')` on input.
- **S06-T3 — `ClearPass` + `MeshPass` (D4, Agent B)**: minimal forward pipeline. One mesh renders.
- **S06-T4 — Bench `apps/bench/save-reload.ts` (D2, Agent A)**: full reload round-trip (events replay → store rebuilt → committer fires → scene rendered). Target reload of 100-event project < 500 ms.
- **S06-T5 — Persistence stress (D3, Agent A)**: 10K events replay < 2 s. Hardening: race-condition fix for IndexedDB single-writer queue (any leftover from S04).
- **S06-T6 — Cross-layer trace test (D4, Agent A)**: a single user action produces ONE trace from `command.execute` through `scene.commit` through `frame.render`.
- **S06-T7 — Bootstrap final paired session (D5, A + B)**: 4 h paired session — finalise `apps/editor/src/bootstrap.ts`. A wires data half; B wires render half; together they make the cube demo work in `?pryzm2=1`.
- **S06-T8 — Visual-diff harness (D6, Agent A)**: `pixelmatch` (or `playwright-test --visual`) wired into CI. Per-mode screenshots stored in `apps/editor/__tests__/visual-fixtures/`.
- **S06-T9 — Dual-mode visual-diff parity (D6, Agent B)**: same scene, both modes (WebGPU + WebGL2), diff < 2 px. **CI gate hard-fails > 2 px.**
- **S06-T10 — Final benches + bundle gate (D7, both)**: idle CPU, orbit fps, save-edit, save-reload, full-pipeline cmd-latency — all baselines committed. Bundle-size gate `dist/index.js < 1.8 MB gzip`. **Hard-fails the PR above.** Treeshaking audit.

#### D1 — Kickoff (30 min)

- B presents `[strategic ADR-006]` (WebGPU/WebGL2 dual-mode strategy — there is no sprint-scoped ADR; the strategic ADR-006 is the authority) — F decides default = `'auto'`.
- A + B agree on the `apps/editor/src/bootstrap.ts` final integration shape — paired session at D5.

#### D2–D8 parallel work

| Day | Agent A (Track A — Bench, persistence polish, integration support) | Agent B (Track B — Renderer + bootstrap render half) |
|---|---|---|
| D2 | **S06-T4**. Bench `apps/bench/save-reload.ts`. | **S06-T1**. `Renderer.init(canvas, mode)` — auto-detect WebGPU vs WebGL2. |
| D3 | **S06-T5**. Persistence stress: 10K events replay < 2 s. | **S06-T2**. `CameraController` (vanilla orbit; pointer + wheel; markDirty on input). |
| D4 | **S06-T6**. OTel cross-layer trace test. | **S06-T3**. `ClearPass` + `MeshPass`. One mesh renders. |
| D5 | **S06-T7 paired session (4 h)** — finalise `apps/editor/src/bootstrap.ts`. | Same paired session — focus on render-side wiring + canvas mounting + tear-down. |
| D6 | **S06-T8**. Visual-diff test harness wired to CI. | **S06-T9**. Dual-mode visual-diff parity test. |
| D7 | **S06-T10 (A side)**. Final bench run on Hello Cube; baselines committed. | **S06-T10 (B side)**. Bundle-size CI gate hard-fail above 1.8 MB gzip. Treeshaking audit. |
| D8 | Update `docs/04-reference/architecture-detail/bench-harness.md` with all baselines. Final retro prep. | Update `docs/04-reference/architecture-detail/renderer.md` complete; finalise `apps/editor/index.html` flag wiring. |

#### D9 — **Sub-phase 1A demo recording** (joint, 5-min screencast)

- Open default URL → PRYZM 1 boots (legacy unchanged).
- Open `?pryzm2=1` in a fresh browser → cube renders.
- Drag cube → command → patch → store → committer → render — all visible in OTel trace shown side-by-side.
- Undo / redo via patches.
- Reload `?pryzm2=1` → cube persists.
- Switch from WebGPU to WebGL2 via flag (`?pryzm2=1&mode=webgl2`) — identical visual.
- CI dashboard: all 4 custom lint rules green (`pryzm-affected-stores-required`, `pryzm-no-raf`, `pryzm-no-three-outside-committer`, `pryzm-no-three-in-kernel`); idle-CPU bench green; orbit-fps bench green; bundle-size gate green; visual-diff gate green.
- **Non-regression check (mandatory)**: open default URL → PRYZM 1 still loads a saved project; `tests/curtainWallToolStaticImport.spec.test.ts` still passes.

#### D10 — Sub-phase 1A retro (1 h, F + A + B)

- What worked in two-agent parallelisation? What slowed it down?
- Are sync points well-placed? Adjust for 1B if not.
- Backlog any rough edges into the **1A → 1B handoff list** (see §6 below).

#### S06 blocker analysis

| Potential blocker | How it manifests | Pre-mitigation |
|---|---|---|
| WebGPU is unavailable on the dev box (Chromium / Linux) | S06 D2 `Renderer.init({ mode: 'auto' })` falls back to WebGL2 every time; the `webgpu` mode is never exercised | `[strategic ADR-006]` mandates **two CI matrices** (per SPEC-04 visual-diff parity gate): `mode=webgpu` (Chrome stable headless) and `mode=webgl2` (Chrome stable headless). The visual-diff parity gate runs both. If WebGPU still fails post-S06, K1A-3 trips. |
| The bundle-size gate exceeds 1.8 MB | Initial bundle is 2.1 MB because OBC is dynamic-imported but `three` is static | Bundle audit at D7: confirm `three` is the only static dep > 200 KB; everything else (`@msgpack/msgpack`, `idb`, `ulid`, `immer`, `zod`) is dynamic-imported behind `?pryzm2=1`. **PRYZM 1 default URL** still ships its own bundle from `src/main.ts`; the gate measures only the `?pryzm2=1` entry chunk. |
| Two URL flags coexist messily (`?pryzm1=1` for legacy debug + `?pryzm2=1` for new) | `apps/editor/index.html` has 4 boot paths, prone to drift | The flag is **single-valued**: `?pryzm2=1` selects PRYZM 2; everything else is PRYZM 1 (default). No `?pryzm1=` flag. |
| Visual-diff parity > 2 px due to font-rendering differences between WebGPU and WebGL2 | The Hello Cube has no text but the canvas has a 1-line OTel overlay | The visual-diff test masks the OTel overlay region (top 24 px of the canvas); fonts only re-enter the diff in 1B when text labels appear. |
| Bootstrap data half (S05) and render half (S06) collide on the canvas-mount lifecycle | A wired `bootstrap.start()` to mount the canvas; B does it inside `Renderer.init` | D5 paired session resolves: canvas mount lives in `Renderer.init`; data half awaits a `bootstrap.onCanvasReady(canvas => ...)` hook. |
| Custom lint rules false-positive on the new `bootstrap.ts` (it touches THREE in the renderer wiring) | CI fails on `apps/editor/src/bootstrap.ts` | The render half of bootstrap is in `apps/editor/src/bootstrap.render.ts` — explicitly allowlisted in `pryzm-no-three-outside-committer` (`apps/editor/src/bootstrap.render.ts` is the boot entry point and may import the renderer module that re-exports THREE). |
| The Hello Cube demo demos OTel traces but Honeycomb is rate-limited in dev | Demo silently shows empty traces | Dev uses the noop exporter (S03 mitigation); the demo records traces from a local Tempo container (B sets up at S03 D2). |

#### S06 exit criteria (= sub-phase 1A exit criteria)

- [ ] `?pryzm2=1` URL flag swaps in PRYZM 2 stack; cube demo works.
- [ ] Cube demo: orbit at 60 fps, idle at 0 fps (verified DevTools profile attached to PR).
- [ ] Undo / redo via patches; save persists across reload.
- [ ] WebGPU + WebGL2 both pass visual-diff parity (< 2 px diff).
- [ ] Initial bundle: `< 1.8 MB gzip` for the `?pryzm2=1` entry chunk (hard-fails CI above).
- [ ] All 4 custom ESLint rules active and PR-blocking in `pryzm2/`: `pryzm-affected-stores-required`, `pryzm-no-raf`, `pryzm-no-three-outside-committer`, `pryzm-no-three-in-kernel` (scaffold; real-enforce S08).
- [ ] OTel coverage: `pryzm.command.execute`, `pryzm.persistence.append`, `pryzm.scene.commit`, `pryzm.frame.tick`, `pryzm.frame.render` all visible in dev Honeycomb / Tempo.
- [ ] Documentation: per-package `README.md` + `docs/04-reference/architecture-detail/{schemas,command-bus,frame-scheduler,scene-committer,renderer,persistence,bench-harness,ci}.md` complete.
- [ ] **PRYZM 1 still ships unchanged on the default URL**; all 7 `tests/*.test.ts` still pass.
- [ ] rAF count in `src/` unchanged (snapshot diff).
- [ ] `(window as any)` count in `src/` unchanged (snapshot diff).

---

## §4 Cross-cutting deliverables (both tracks contribute)

These exist alongside the sprint flow and must be true at sub-phase end.

### §4.1 ADRs to merge by M3

| ID | Subject | Owner | Sprint | Cites PRYZM-1 evidence at |
|---|---|---|---|---|
| `code-level ADR docs/02-decisions/adrs/0001-typed-id-brand.md` | Typed-ID brand strategy | A | S01 | `CreateWallCommand.ts:32` (`crypto.randomUUID()`), `WallStore.ts:78` (`Map<string, WallData>`) |
| `code-level ADR docs/02-decisions/adrs/0002-command-handler-signature.md` | Command handler signature | A | S02 | `CommandManager.ts:30–60` (legacy `Command` shape), `CommandManager.ts:38–47` (window-fallback antipattern), `CreateWallCommand.ts:60` (`affectedStores` precedent) |
| `code-level ADR docs/02-decisions/adrs/0003-scheduler-priority-vs-tickpriority.md` | Scheduler API (`priority` queue-class vs `TickPriority` render-phase) | B | S02 | `UnifiedFrameLoop.ts:95–98` (`TickPriority` enum), `UnifiedFrameLoop.ts:130–230` (addTickListener API) |
| `[strategic ADR-004]` (ratifies; prior phase-doc `ADR-004` stub deleted) | MessagePack codec choice | A | S04 | (greenfield — bench numbers from S03-T8 spike attach to the strategic ADR's "Phase rollout S04") |
| `code-level ADR docs/02-decisions/adrs/0005-primitive-committer-interface.md` | `PrimitiveCommitter<TStore>` interface | B | S04 | `WallFragmentBuilder.ts` lifecycle (add/update/remove/dispose), `StoreEventBus.batch()` for transactional commits |
| `code-level ADR docs/02-decisions/adrs/0006-idle-continuation-budget.md` | Idle-continuation N-frame budget (30) vs per-pass grace (6) | B | S03 | `FrameCoordinator.ts` (existing 6-frame per-pass grace) |
| `[strategic ADR-006]` (ratifies; prior phase-doc `ADR-007` stub deleted) | WebGPU/WebGL2 dual-mode | B | S06 | (greenfield — `@webgpu/types` already in deps but unused; CI matrix per SPEC-04 visual-diff parity gate) |
| `[strategic ADR-007]` (ratifies; new in this revision) | OTel SDK wrapper / telemetry backend | A | S01 | (greenfield — `packages/otel/` lands S01-T1 NEW; first spans from `packages/wire/`) |
| `[strategic ADR-009]` (ratifies; new in this revision) | Web Worker plugin sandbox | A+B | S01 spike | (greenfield — 5-day pre-S01 postMessage RPC measurement, output linked from `[strategic ADR-009]`) |

### §4.2 CI gates active by M3

| Gate | Hard-fail threshold | First active sprint | Mode in `src/` |
|---|---|---|---|
| `pryzm-affected-stores-required` lint | any violation in `pryzm2/` | S02 | n/a |
| `pryzm-no-raf` lint | any new violation outside scheduler in `pryzm2/`; **count-snapshot-diff** in `src/` | S03 | warn + count-diff |
| `pryzm-no-three-outside-committer` lint | any new violation in `pryzm2/`; **count-snapshot-diff** in `src/` | S05 | warn + count-diff |
| `pryzm-no-three-in-kernel` lint | scaffold (real-enforce S08) | S03 | n/a |
| Boundaries lint matrix | any boundary violation in `pryzm2/`; warn in `src/` | S01 | warn |
| Idle CPU bench | > 2.5% on Hello Cube | S03 | — |
| Orbit fps bench | < 50 fps p95 | S06 | — |
| Save-edit bench | > 12 ms p95 | S04 | — |
| Save-reload bench | 100 events > 500 ms; 10K events > 2 s | S06 | — |
| Bundle size gate | > 1.8 MB gzip initial (`?pryzm2=1` chunk only) | S06 | — |
| Visual-diff parity (WebGPU vs WebGL2) | > 2 px diff | S06 | — |
| Test coverage (per-package, `pryzm2/packages/*` only) | < 85% lines | S06 | — |

### §4.3 Documentation produced

- `docs/04-reference/architecture-detail/schemas.md` (S01)
- `docs/04-reference/architecture-detail/ci.md` (S01)
- `docs/04-reference/architecture-detail/command-bus.md` (S02)
- `docs/04-reference/architecture-detail/bench-harness.md` (S02)
- `docs/04-reference/architecture-detail/frame-scheduler.md` (S03)
- `docs/04-reference/architecture-detail/persistence-design.md` (S03 design) → `docs/04-reference/architecture-detail/persistence.md` (S04 impl)
- `docs/04-reference/architecture-detail/scene-committer.md` (S04 design + S05 impl)
- `docs/04-reference/architecture-detail/stores.md` (S05)
- `docs/04-reference/architecture-detail/renderer.md` (S06)
- Per-package `README.md` for: schemas, protocol, command-bus, persistence-client, frame-scheduler, scene-committer, renderer, stores, eslint-plugin-pryzm

---

## §5 Risk & contingency (1A-specific, expanded)

> **Velocity-slip cut list.** Every M-gate in this phase is governed by `[strategic ADR-018]` — the standing capacity cut list. The phase-specific risks below are *additional* to the cuts already enumerated in `[strategic ADR-018]` §Tier-1, §Tier-2, §Tier-3. If actual velocity at the M3 gate is amber/red, cuts are applied in order from `[strategic ADR-018]` before phase-specific mitigations.

| ID | Risk | Likelihood | Impact | Mitigation | Trigger sprint |
|---|---|---|---|---|---|
| R1A-01 | Two agents collide on `bootstrap.ts` integration | Medium | Medium | D5 paired session in S06; data half in `bootstrap.data.ts`, render half in `bootstrap.render.ts` | S06 |
| R1A-02 | ESLint custom rule false-positives slow PRs | Medium | Low | Each rule ships with test fixtures + suppression escape hatch only via ADR | S02–S05 |
| R1A-03 | WebGPU instability on Linux dev box | Medium | Medium | WebGL2 fallback present from S06 D2; CI matrix forces both | S06 |
| R1A-04 | Idle CPU > 2% under post-FX | High in S15, low in S03 | Medium | S03 baseline excludes post-FX (no post-FX exists in PRYZM 2 yet); S15 hardens | S03 / S15 |
| R1A-05 | MessagePack codec choice has unforeseen size regression | Low | Low | `[strategic ADR-004]` has size benchmarks against 3 alternatives | S04 |
| R1A-06 | Schema fixture extraction misses edge cases | Medium | High in S10 | S01 D6 round-trip tests + S10 parity fixtures | S01 / S10 |
| R1A-07 | Agent A or Agent B blocked > 4 h on D2–D4 unable to escalate | Low | Medium | F is on-call M–F 9–6; standing 09:00 daily check-in | every sprint |
| R1A-08 | A & B drift on OTel span naming convention | Low | Low | F locks naming on S02 D1; rename script in `tools/scripts/` | S02 |
| R1A-09 | `UnifiedFrameLoop` already has 7 PRYZM-1 subsystem tick listeners; the team is tempted to "just use it" | Medium | High | §1.2 explicitly forbids editing `UnifiedFrameLoop.ts` in 1A. The new `FrameScheduler` is a separate package, separate file, separate tree. F enforces in code review. | S03 |
| R1A-10 | `crypto.randomUUID()` is used as wall-id today; switching to ULID requires a migration adapter | Low (in 1A) | Medium (in 1B) | `code-level ADR docs/02-decisions/adrs/0001-typed-id-brand.md` makes the brand check shape-only; UUIDv4 strings remain valid `Id<T>` values; the migration adapter lives in 1B (S07–S08) | S07 |
| R1A-11 | `MovePlanToolHandler` and 15 sibling plan-tool handlers explicitly contract on `(window as any).commandManager` | Low (in 1A — they don't run in `?pryzm2=1`) | Medium (in 1C) | 1A does not touch plan tools. PRYZM 2 has no 2D plan editing surface in 1A. The contract migration is owned by Phase 1C / 1D. | S07–S18 |
| R1A-12 | No `.github/workflows/` exists in PRYZM 1; the CI infrastructure is greenfield | Medium | Medium | S01 T3 stands up the entire CI from scratch (lint, typecheck, test, bench, bundle-size, boundaries). F validates first PR-level run on S01 D8. | S01 |
| R1A-13 | `WallTypes.ts` imports THREE.js; the canonical `Wall.ts` schema cannot reuse it | High (already known) | Low (mitigation is clear) | `Wall.ts` is written from scratch using `WallDataSchema.ts` as a structural reference. The S01 D7 round-trip test against a real PRYZM-1 fixture catches structural drift. | S01 |
| R1A-14 | `ProjectSerializer` already has `MigrationEngine` for snapshot-version bumps; the new event log needs its own migration story | Low | Medium | Each event carries `version: number`. S04 D7 includes a forward-compat replay test (replay v1 events on a v2 reader). | S04 |
| R1A-15 | 24/53 rAF call sites are in UI code (panels, transitions, debounced repaints); the lint rule can't blanket-ban | High | Low | `pryzm-no-raf` is `pryzm2/` mode error, `src/` mode warn-only with **count-snapshot-diff** ("did the count of rAF call sites in `src/` increase?"). New `src/` rAF sites are blocked at PR time. | S03 |
| R1A-16 | The `CommandContext.stores` interface in `src/commands/types.ts` has 18+ hard-coded store fields; PRYZM 2's `HandlerContext<TStores>` must NOT mirror this | Low (in 1A) | High (in 1B if mirrored) | `code-level ADR docs/02-decisions/adrs/0002-command-handler-signature.md` makes `HandlerContext<TStores>` generic over the actual stores the handler declares (per the `affectedStores` field), not a fixed interface. | S02 |
| R1A-17 | The 250+ `CommandType` enum is a hard-coded global; PRYZM 2's command bus dispatches by `cmd.type` and is tempted to copy the enum | Medium | Medium | The PRYZM-2 `CommandBus` keys the registry by *string* (`'wall.create' \| 'cube.move' \| ...` — namespaced). No global enum. Each plugin owns its own command-type strings. | S02 |
| R1A-18 | The existing `enablePatches()` is called in 3 places in PRYZM 1; calling it a 4th time in `command-bus/index.ts` could cause double-registration warnings | Low | Low | `enablePatches()` is idempotent per immer's contract; the PRYZM-1 places already prove this. `PatchSnapshot.ts:54` documents it: "calling it again is idempotent". | S02 |

### §5.1 Kill-switches (1A-specific)

- **K1A-1** — If end of S03 idle CPU > 4%, halt. Spend up to 2 weeks tuning scheduler. Do not begin S04.
- **K1A-2** — If end of S05 the cube committer cannot dispose materials cleanly (memory delta > 50 MB after 1K cycles), halt. Refactor `MaterialPool` before S06.
- **K1A-3** — If end of S06 the dual-mode visual-diff > 5 px, halt. Investigate; do not enter 1B. `[strategic ADR-006]` is *not* amended — the dual-path is canonical and stays through GA per `[strategic ADR-006]` §Phase-rollout. Instead, the WebGPU CI matrix is moved to **allowed-flake** while the underlying issue is investigated; the WebGL2 matrix remains a hard-fail gate. The dual-mode visual-diff parity gate stays in place but at the next-tier threshold (warning above 2 px, hard-fail above 8 px) until the root cause is identified and fixed.
- **K1A-4** (NEW) — If at any point in 1A a PR touches a `src/**` file outside `tests/fixtures/pryzm-1-snapshots/`, the PR is rejected. PRYZM 1 must remain bit-for-bit unchanged across 1A. The only exception is documentation under `docs/`.

---

## §5.2 SPECs in force during Phase 1A

| SPEC | Section relevant here | Sprints that exercise it |
|---|---|---|
| SPEC-01 (kernel determinism / patch model) | §6 (determinism contract) | S04 onward (event log + replay) — S01–S03 are pre-spec scaffolding |
| SPEC-02 (event log v1) | §1–§2 (envelope + ordering) | S04 (PatchEmitter, IndexedDb backend) |
| SPEC-04 (visual-diff parity) | (whole spec) | S06 (warning-level smoke set; full 24-scene corpus deferred to Phase 1B / S08) |
| SPEC-09 (plugin sandbox) | §3 (postMessage RPC budget) | **S01 D1–D5 spike** (S01-T0 NEW); full plugin host lands in Phase 2 |
| SPEC-10 (CI gates + lint plugin) | All | S01 onward — all 4 custom rules + bench gates active by M3 per §4.2 |

This table is the canonical answer to "what spec covers this sprint?" If a sprint's exit criterion conflicts with the cited spec section, the spec wins.

> **Reference-only specs in 1A**: SPEC-01 and SPEC-04 are referenced for the contracts they will impose later, but do not gate any S01–S03 deliverable. SPEC-09 and SPEC-10 are *active* from S01. SPEC-02 §1–§2 are *active* from S04.

---

## §6 1A → 1B handoff checklist (must be true on M3 morning)

- [ ] All S06 exit criteria green (= sub-phase 1A exit).
- [ ] All 1A ADRs merged (per §4.1 final summary table): the 5 sprint-scoped code-level ADRs (`0001-typed-id-brand`, `0002-command-handler-signature`, `0003-scheduler-priority-vs-tickpriority`, `0005-primitive-committer-interface`, `0006-idle-continuation-budget`) **and** the 4 strategic ADRs ratified during 1A (`[strategic ADR-004]` MessagePack codec, `[strategic ADR-006]` WebGPU/WebGL2 dual-mode, `[strategic ADR-007]` OTel telemetry backend, `[strategic ADR-009]` plugin sandbox).
- [ ] All 12 CI gates green and PR-blocking (or warn-only per §4.2).
- [ ] `apps/editor/src/bootstrap.{data,render}.ts` ready to accept first plugin (`plugins/wall/` lands in S07).
- [ ] `PrimitiveCommitter<TStore>` interface frozen — no further changes without an ADR.
- [ ] `CommandHandler<TCmd, TStores>` interface frozen — no further changes without an ADR.
- [ ] Hello Cube demo screencast committed to `docs/05-guides/developer/demos/M3-hello-cube.mp4`.
- [ ] `apps/bench/reports/M3-1A-baseline.md` published with all bench numbers.
- [ ] Sprint S07 plan in `docs/03-execution/status/sprints/S07.md` reviewed by both agents and F.
- [ ] One day of buffer between S06 D10 and S07 D1 — non-negotiable rest day.
- [ ] PRYZM 1 (`apps/editor` legacy code path through `src/main.ts`) unchanged and shipping; default URL still loads PRYZM 1.
- [ ] rAF call-site count in `src/` unchanged from `main` (snapshot-diff CI).
- [ ] `(window as any)` count in `src/` unchanged from `main` (snapshot-diff CI).
- [ ] All 7 existing `tests/*.test.ts` still pass.
- [ ] `tests/fixtures/pryzm-1-snapshots/wall-sample.json` parses against `packages/schemas/Wall.ts`.

---

## §7 Document log

- **2026-04-26** — first version expanding `phases/PHASE-1-FOUNDATION-M1-M12.md §2` into two-agent parallel detail.
- **2026-04-26 (rev. 2)** — deep enhancement: added §1 (existing-codebase inventory with file:line evidence — 392 KLOC / 53 rAFs / 2,066 window-as-any / 65 stores / 250 CommandTypes / `UnifiedFrameLoop` already exports `TickPriority` / `PatchSnapshot.ts` already defines the patch entry shape / `FrameCoordinator` already does dirty-flag grace-frames). Each sprint now carries its own **existing-code touchpoints**, **per-task sub-phase breakdown** (`SnT-Tx`), **blocker analysis**, and **non-regression validation**. Risk register expanded from R1A-01..08 to R1A-01..18; added kill-switch K1A-4 (no edits to `src/` in 1A).

*Last updated: 2026-04-26. Owner: Founder + Architecture lead. Conflicts? `06-PRYZM-IDENTITY-AND-RECOUNT.md` + `.pryzm` spec → `08-VISION.md` → this doc → everything else. This document expands `phases/PHASE-1-FOUNDATION-M1-M12.md §2` with two-agent parallel detail; if the master phase doc changes, this doc is updated within 1 day.*
