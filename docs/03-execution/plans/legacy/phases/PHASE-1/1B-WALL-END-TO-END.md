# Phase 1B — Wall End-to-End + 9 Core Primitives (Q2 · Months 4–6 · Sprints S07–S12)

> **Authority note (added 2026-04-27).** This document is *implementation guidance* and is subordinate to:
>
> 1. The 12 specs in `docs/03_PRYZM3/reference/specs/` (SPEC-01..SPEC-12).
> 2. The 22 strategic ADRs in `docs/03_PRYZM3/reference/adrs/` (ADR-001..ADR-024 of the strategic series).
> 3. `docs/03_PRYZM3/archive/superseded-2026-04-30/03_STATUS/CRITICAL-REVIEW-2026-04-27.md`.
> 4. `docs/03_PRYZM3/reference/plan-detail/01-MASTER-36M.md`.
>
> Where this phase document conflicts with any of the above, the higher-precedence document wins. Bare `ADR-NNN` references inside this phase document refer to the **sprint-scoped / code-level** ADR series at `docs/architecture/adr/NNNN-*.md` after the renumbering applied 2026-04-27 (per `phases/PHASES-UPDATE-PLAN-2026-04-27.md` §1). References to the **strategic** ADR series are written explicitly as `[strategic ADR-NNN]`.

> **§0 Alignment header**
>
> - **Strategic anchor**: this doc operationalises `phases/PHASE-1-FOUNDATION-M1-M12.md §3`. It is bound by `08-VISION.md`, `06-PRYZM-IDENTITY-AND-RECOUNT.md`, the `.pryzm` file-format spec, and **the rails laid down in 1A** (`phases/PHASE-1A-Q1-M1-M3-SKELETON-RAILS.md`). Conflict order: `06` + `.pryzm` → `08` → `10-MASTER` + this doc → everything else. The **TypeScript Vanilla Decision** (no React migration; THREE only inside `packages/scene-committer/` and `plugins/*/committer.ts`) governs every line below.
> - **Sub-phase goal**: by end of M6 the **9 core structural primitives** (Wall, Slab, Door, Window, Roof, Curtain Wall, Grid, Column, Beam) are end-to-end through PRYZM 2 with parity vs PRYZM 1. The **Wall is the canonical recipe** — every subsequent element copies its pattern verbatim. A small fixture project (1 wall, 1 slab, 1 door) opens in `?pryzm2=1` in **< 800 ms cold**.
> - **The bet for 1B**: prove the producer + committer + handler pattern *multiplies cleanly*. If Door takes more than 4 days of two-agent time after Wall is done, the pattern is wrong — halt and refactor in S12 buffer (kill-switch K1B-2).
> - **What this doc adds vs the master phase doc**: a **two-agent parallel execution plan** with day-level granularity for S07–S12, a **wall-family codebase inventory** that names every PRYZM-1 file the new wall plugin must lift / mimic / discard / leave-alone (with `path:line` evidence on the **2026-04-26 snapshot, commit `44045772`**), per-sprint **existing-code touchpoints**, **sub-phase task breakdown** (`SnT-Tx`), **blocker analysis grounded in real `src/elements/walls/` evidence**, **non-regression validation**, and an expanded risk register (R1B-01..20) plus four kill-switches.
> - **Hard precondition**: Phase 1A must be **fully closed** at M3 morning (see `PHASE-1A §6`). 1B starts on the day after M3 D10 with all 1A ADRs merged (the 5 sprint-scoped code-level ADRs `0001-typed-id-brand`, `0002-command-handler-signature`, `0003-scheduler-priority-vs-tickpriority`, `0005-primitive-committer-interface`, `0006-idle-continuation-budget`, plus the 4 strategic ADRs ratified during 1A: `[strategic ADR-004]` MessagePack codec, `[strategic ADR-006]` WebGPU/WebGL2 dual-mode, `[strategic ADR-007]` OTel telemetry backend, `[strategic ADR-009]` plugin sandbox), 12 CI gates green, the `apps/editor/src/bootstrap.{data,render}.ts` ready to accept the first plugin, and the `PrimitiveCommitter<TStore>` + `CommandHandler<TCmd, TStores>` interfaces frozen.

---

## §0 How to read this document

Same conventions as `PHASE-1A`. **The team**: 2 engineering agents (Agent A, Agent B) + Founder/Architect (F). **Working unit**: 1 sprint = 10 working days (D1–D9 demo + retro, D10 buffer/docs). **Sync points**: D1 kickoff (30–45 min), D5 mid-sprint integration (1 h), D9 demo + retro (1 h). **Branch model**: `agentA/sNN-<element>` / `agentB/sNN-<element>` → F merges to `pryzm2/main`. **Citation convention**: every PRYZM-1 claim is given as `path/to/file.ts:LINE`; every new file is `pryzm2/path/to/file.ts (NEW)` or `plugins/<name>/file.ts (NEW)`.

**ADR citations**: Bare `ADR-NNN` is forbidden. Use `[strategic ADR-NNN]` for entries in `03_PRYZM3/reference/adrs/`, or fully-qualified `code-level ADR docs/architecture/adr/NNNN-<slug>.md` for sprint-scoped decisions.

**`code-level ADR docs/architecture/adr/0008-wall-handler-triage.md`..013 in this document.** Phase 1B introduces **six sprint-scoped ADRs** whose canonical text lives in §7 below. They map to the following code-level slugs for cross-doc citation:

| §7 heading | Code-level slug |
|---|---|
| `code-level ADR docs/architecture/adr/0008-wall-handler-triage.md` — Wall handler triage (22 → 14) | `docs/architecture/adr/0008-wall-handler-triage.md` |
| `code-level ADR docs/architecture/adr/0009-wall-producer-signature.md` — Producer pure-function signature | `docs/architecture/adr/0009-wall-producer-signature.md` |
| `code-level ADR docs/architecture/adr/0010-slab-handler-triage.md` — Slab handler triage | `docs/architecture/adr/0010-slab-handler-triage.md` |
| `code-level ADR docs/architecture/adr/0011-curtain-wall-triage-and-producer-split.md` — Curtain Wall triage + producer split | `docs/architecture/adr/0011-curtain-wall-triage-and-producer-split.md` |
| `code-level ADR docs/architecture/adr/0012-cross-element-cascade-rule-registration.md` — Cross-element cascade-rule registration | `docs/architecture/adr/0012-cross-element-cascade-rule-registration.md` |
| `code-level ADR docs/architecture/adr/0013-intent-resolver.md` — Intent resolver shape | `docs/architecture/adr/0013-intent-resolver.md` |
| `code-level ADR docs/architecture/adr/0014-persistence-snapshot-threshold.md` — Persistence snapshot threshold (drafted only if S09 needs it) | `docs/architecture/adr/0014-persistence-snapshot-threshold.md` |

> **Numbering collision note.** The renumbering map in `phases/PHASES-UPDATE-PLAN-2026-04-27.md §1.3` lists ``code-level ADR docs/architecture/adr/0008-wall-handler-triage.md` → 0008-wall-tool-submodes.md` — that entry refers to PHASE-1A's distinct decision about WallTool sub-modes. **Phase 1B's `code-level ADR docs/architecture/adr/0008-wall-handler-triage.md` (wall handler triage 22 → 14) is a different decision.** When the actual code-level ADR files are created in `docs/architecture/adr/`, both will need to coexist (e.g. by giving PHASE-1A's the slug `0008a-wall-tool-submodes.md` or shifting one of them up the sequence). This phase doc cites the slug `0008-wall-handler-triage.md` for its own `code-level ADR docs/architecture/adr/0008-wall-handler-triage.md` throughout. Similarly: Phase 1B's `code-level ADR docs/architecture/adr/0010-slab-handler-triage.md` (slab handler triage) is unrelated to `[strategic ADR-010]` (250 ms bake debounce) — they live in different namespaces.

---

## §1 Existing-codebase inventory (the deep ground truth that informs every wall sprint)

This section is the **single source of truth** for what already exists in PRYZM 1's wall family and how each piece relates to PRYZM 2's `plugins/wall/*` + `packages/geometry-kernel/producers/wall.ts`. Both agents read this section before writing a single line of new code. Numbers from `wc -l`, `rg -n`, and direct file inspection on the **2026-04-26 snapshot**.

The wall family in PRYZM 1 is **the largest single element family** in the codebase: **25 files in `src/elements/walls/`** plus **19 files in `src/commands/walls/`**, totalling **~12,470 LOC** across two directories. Inside the wall directory, three god-classes account for ~5,166 LOC alone (`WallFragmentBuilder.ts` 2,256 + `WallTool.ts` 1,683 + `WallStore.ts` 1,227). This is not refactor-volume; it is the substrate from which the canonical PRYZM 2 element recipe must be distilled.

### §1.1 The wall-family file map (LOC + role + 1B fate)

| File | LOC | Role today | 1B treatment |
|---|---|---|---|
| `src/elements/walls/WallFragmentBuilder.ts` | 2,256 | Builds & manages the THREE.js mesh tree per wall (subscribes to `WallStore`, runs producer math + THREE assembly + LOD + cache). | **Split**: pure math → `packages/geometry-kernel/producers/wall.ts` (S08). THREE assembly + material lifecycle → `plugins/wall/committer.ts` (S09). The original file is **untouched** and continues to drive PRYZM 1. |
| `src/elements/walls/WallStore.ts` | 1,227 | `Map<id, WallData>` + clone-on-read + `subscribe(listener)` fan-out across 3 surfaces (in-process listeners, EventBus, dirty-flag). | **Mimic**: shape → `plugins/wall/store.ts` (S07). The new store is a `Store<WallData>` sub-class from `packages/stores/` (1A S05). The PRYZM-1 file is **untouched**. |
| `src/elements/walls/WallTool.ts` | 1,683 | Click/drag/escape pointer state machine; emits `CreateWallCommand` via `commandManager` (window-fallback removed at line 144). | **Mimic**: shape → `plugins/wall/tool.ts` (S09). The PRYZM-1 file is untouched. |
| `src/elements/walls/WallTypes.ts` | 369 | TS interfaces (`WallData`, `Opening`, `WindowData`, `DoorData`); **imports `* as THREE from 'three'` on line 1**. | **Discarded for PRYZM 2**: schema lives in `packages/schemas/Wall.ts` (already landed in 1A S01). PRYZM 1 keeps using this file. |
| `src/elements/walls/WallDataSchema.ts` | 314 | Zod schemas (`WallDataAddSchema`, `WallDataUpdateSchema`, `OpeningSchema`). | **Structural reference for `Wall.ts`** (already used in 1A S01 D7 round-trip). Untouched in 1B. |
| `src/elements/walls/WallPathBuilder.ts` | 78 | Pure function: builds the wall centre-line from base-line endpoints + curve params. | **Lift verbatim** (with re-test) into `packages/geometry-kernel/producers/wall.ts` helpers (S08 D2). |
| `src/elements/walls/WallIntentResolver.ts` | 213 | Resolves user intent (which wall to join to, miter direction, snap candidates). | **Mimic**: shape → `plugins/wall/intent.ts` (S10). Logic is mostly portable; THREE-typed inputs become DTO-typed. |
| `src/elements/walls/CurvedWallLayerBuilder.ts` | 250 | Pure-ish: tessellates a curved wall layer into triangle strips. | **Lift** into `producers/wall.ts` (S08 D6 — curved-wall pass). |
| `src/elements/walls/CurvedWallCapMiter.ts` | 54 | Pure: computes miter cap geometry for curved walls. | **Lift** verbatim into `producers/wall.ts`. |
| `src/elements/walls/MiterPrismBuilder.ts` | 123 | Pure: prism-miter math (the source-of-truth math for join geometry). | **Lift** verbatim into `producers/wall.ts`. **High-priority** — most parity diffs in S08 will originate here. |
| `src/elements/walls/LayeredWallOpeningBuilder.ts` | 290 | Computes layered-wall opening cuts (hosts doors/windows). | **Lift** into `producers/wall.ts` (S08 D4 — openings pass). |
| `src/elements/walls/composeWallGeometryHash.ts` | 155 | Pure: builds the cache key (geometry hash) for a wall. | **Lift** verbatim into `producers/wall.ts`. Used by `MaterialPool` deduplication path. |
| `src/elements/walls/WallEdgeOverlayBuilder.ts` | 154 | Builds the selection/hover outline overlay. | **Mimic**: shape → `plugins/wall/selection-highlight.ts` (S09 D6). |
| `src/elements/walls/WallOccupancyStore.ts` | 221 | Spatial-index store: which walls overlap which other walls (for join detection). | **Mimic**: shape → `plugins/wall/occupancy.ts` (S10). Pure-state, no THREE. |
| `src/elements/walls/WallInstanceBridge.ts` | 162 | Bridge from PRYZM-1 store → THREE instance pool. | **Discarded**: PRYZM 2's `MaterialPool` + `SceneCommitter.bindStore` (1A S05) supersedes this entirely. |
| `src/elements/walls/WallSnapCycler.ts` | 196 | Tab-key snap-target cycling during wall draw. | **Mimic**: behaviour → `plugins/wall/tool.ts` (S09 D3). |
| `src/elements/walls/WallAlignmentGuide.ts` | 292 | Renders alignment guide lines during wall placement. | **Mimic**: scenic part → `plugins/wall/tool.ts` THREE side; pure compute → `intent.ts` (S10). |
| `src/elements/walls/PathResolver.ts` | 94 | Resolves base-line snap targets to canonical points. | **Lift**: pure compute → `intent.ts` (S10). |
| `src/elements/walls/SlabWallCoupling.ts` | 133 | Cross-element cascade: when a slab moves, dependent walls follow. | **Defer to 1C**: cross-element coupling lives in `plugins/cross/slab-wall.ts` once Slab plugin lands (S12). Lifted to L4 cascade infra. |
| `src/elements/walls/WallOpeningPositionResolver.ts` | 88 | Resolves opening position along wall length. | **Lift** into `producers/wall.ts` openings pass. |
| `src/elements/walls/WallOpeningRenderData.ts` | 46 | Render-data DTO for openings. | **Replaced**: `plugins/wall/committer.ts` builds this from kernel output. |
| `src/elements/walls/WallSystemTypeStore.ts` | 263 | Catalogue of wall system types (CMU, drywall, etc). | **Mimic**: shape → `plugins/wall/system-type-store.ts` (S07 D6). |
| `src/elements/walls/WallDimensionInput.ts` | 181 | Dimension-input UI handler (typed numeric input during draw). | **Defer to 1C**: panel/UI surface. Out of scope for 1B. |
| `src/elements/walls/DimensionPreview.ts` | 201 | Inline dimension preview during wall draw. | **Defer to 1C**: panel/UI surface. Out of scope for 1B. |
| `src/elements/walls/errors.ts` | 127 | Wall-specific error subclasses. | **Mimic**: shape → `plugins/wall/errors.ts` (S07 D2). Strict typed errors are mandatory in PRYZM 2 per `code-level ADR docs/architecture/adr/0002-command-handler-signature.md`. |
| **Total `src/elements/walls/`** | **~7,290** | 25 files | |

| File | LOC | Role today | 1B treatment |
|---|---|---|---|
| `src/commands/walls/CreateWallCommand.ts` | 349 | The canonical wall-create command — `affectedStores = ["wall", "level"] as const` at line 51, neighbour-snapshot at line 234, store ops at 109 / 252 / 275 / 297 / 309 / 311. | **Mimic verbatim**: shape → `plugins/wall/handlers/CreateWall.ts` (S07 D3). This file is the **canonical example** in `docs/architecture/element-recipe.md`. |
| `src/commands/walls/UpdateWallDimensionsCommand.ts` | 79 | Updates width / height / layer thickness atomically. | **Merged** into `SetWallDimensions` handler (S07 D6). |
| `src/commands/walls/UpdateWallBaselineCommand.ts` | 191 | Moves the wall (updates start/end points). | **Mimic** as `MoveWall` handler (S07 D4). |
| `src/commands/walls/SetWallWidthCommand.ts` | 99 | Sets wall thickness. | **Folded** into `SetWallDimensions` handler. |
| `src/commands/walls/UpdateWallHeightCommand.ts` | 184 | Sets wall height (cascades to attached doors/windows). | **Mimic** as part of `SetWallDimensions` (S07 D6). |
| `src/commands/walls/UpdateWallLayersCommand.ts` | 169 | Updates layered-wall layer composition. | **Mimic** as `SetWallLayers` handler (S10 D2). |
| `src/commands/walls/UpdateWallColorCommand.ts` | 71 | Updates the wall material colour. | **Mimic** as `SetWallColor` handler (S07 D7). |
| `src/commands/walls/SetAllWallsWidthCommand.ts` | 118 | Bulk: set width on every wall. | **Merged** into `BulkSetWallVisuals` handler (S10 D2). |
| `src/commands/walls/SetAllWallsVisualPropertiesCommand.ts` | 88 | Bulk: set colour/opacity on every wall. | **Folded** into `BulkSetWallVisuals` handler. |
| `src/commands/walls/UpdateWallSystemTypeCommand.ts` | 72 | Changes the wall's system type (re-resolves layers from catalogue). | **Mimic** as `SetWallSystemType` handler (S10 D3). |
| `src/commands/walls/CreateWallOpeningCommand.ts` | 267 | Creates a host opening for a door/window. | **Mimic** as `CreateWallOpening` handler (S10 D4). |
| `src/commands/walls/CreateWallBetweenMarksCommand.ts` | 152 | Creates a wall between two snap marks. | **Mimic** as `CreateWallBetweenMarks` handler (S10 D2). |
| `src/commands/walls/CreateWallsFromSlabCommand.ts` | 167 | Generates walls along the perimeter of a slab. | **Mimic** as `CreateWallsFromSlab` handler (S10 D3). |
| `src/commands/walls/CreateWallsOnAllSlabsCommand.ts` | 134 | Bulk variant of the above (all slabs in scene). | **Dropped**: expressed at the UI layer as repeated `CreateWallsFromSlab`. Eliminating this command removes a hidden "iterate-the-scene" antipattern. |
| `src/commands/walls/ChangeWallLevelCommand.ts` | 102 | Moves a wall between levels (storeys). | **Mimic** as `ChangeWallLevel` handler (S10 D4). |
| `src/commands/walls/CascadeWallBaselineCommand.ts` | 223 | Cascades a baseline change to all walls in a join chain. | **Lifted to L4**: this is generic dependency-cascade infra; lives in `packages/command-bus/cascade.ts` (1A backlog if not already in 1A; otherwise S07 D7 retroactive port). The wall handler simply declares cascade affinity. |
| `src/commands/walls/DeleteElementCommand.ts` | 783 | The generic delete command (covers walls, slabs, doors, …). | **Lifted to L4**: lives in `packages/command-bus/handlers/DeleteElement.ts` (S07 D4 — A pulls a generic version that the wall plugin registers cascade rules with). The original file is **untouched** and continues to delete everything in PRYZM 1. |
| `src/commands/walls/GenericCommands.ts` | 13 | Tiny helper module (re-exports). | Discarded; pattern not needed in PRYZM 2. |
| `src/commands/walls/wallSnapshotUtils.ts` | 39 | Snapshot helpers for undo. | Replaced by `Store<T>.snapshot()` in `packages/stores/` (1A S05). |
| **Total `src/commands/walls/`** | **~3,500** | 19 files | |

> **Implication**: of the **~12,470 LOC** in PRYZM 1's wall family, **~3,200 LOC of pure math** (PathBuilder, MiterPrism, CurvedWallLayer, CurvedWallCapMiter, LayeredWallOpeningBuilder, composeWallGeometryHash, WallOpeningPositionResolver, plus pure parts of FragmentBuilder) is **liftable verbatim or near-verbatim** into `packages/geometry-kernel/producers/wall.ts`. The remaining ~9,200 LOC is split between THREE-bound rendering (~3,800 — collapses into `plugins/wall/committer.ts`, target ~600 LOC), tool/intent state (~2,200 — collapses into `plugins/wall/{tool,intent}.ts`, target ~800 LOC combined), and store + commands (~3,200 — collapses into `plugins/wall/{store,handlers/*}.ts`, target ~1,400 LOC combined). **Net 1B output for the wall plugin: ~3,000 LOC** (a 4× reduction, with 100% parity proven by 30 snapshot fixtures).

### §1.2 The three "looks like the new architecture but isn't" trap files (wall edition)

Same hazard pattern as the four 1A trap files (`UnifiedFrameLoop.ts`, `FrameCoordinator.ts`, `PatchSnapshot.ts`, `StoreEventBus.ts`). These three wall files in `src/elements/walls/` look like the answer the wall plugin needs and **must not be edited in 1B**.

| File | LOC | Why it looks like the answer | Why it isn't (and what 1B must do differently) |
|---|---|---|---|
| `src/elements/walls/WallStore.ts` | 1,227 | Already a `Map<id, WallData>` (line 80), clone-on-read, `subscribe(listener) → unsubscribe` (line 1114), depth-counted batching, secondary indexes (`_levelIndex` line 93, `windows`/`doors` maps lines 85–86), `ILevelProvider` adapter, defensive try/catch around every listener invocation (line 1159), and a 60-line comment block (lines 1124–1190) documenting the **three-surface fan-out contract** (in-process listeners → EventBus → dirty-flag). **This is essentially the new `Store<T>` with extras.** | Three problems: (1) the store **owns the index for `windows` and `doors` of THIS wall** (lines 85–86) — a coupling that breaks the per-element-family plugin model; in PRYZM 2 the door/window stores own their own state, and the wall-store exposes a *query* surface for "doors hosted by wall X". (2) The `notifyListeners` fan-out emits 3 channels — PRYZM 2 emits ONE `DirtyDiff` channel and the committer subscribes once. (3) The `subscribe(listener)` API is wall-specific (`WallEventListener` shape from line 83) — PRYZM 2's `Store<T>.subscribeDirty(diff => ...)` is generic. **The right move**: write `plugins/wall/store.ts` as a thin extension of `Store<WallData>` from `packages/stores/` (1A S05). Copy the three-surface fan-out *contract notes* into `docs/architecture/stores.md`, but implement **only one channel** (the dirty-diff). |
| `src/elements/walls/WallFragmentBuilder.ts` | 2,256 | Has a literal comment at line 142 — *"preserving builder purity as a pure projection function"* — and at line 425 — *"the builder is now a pure function of its inputs"*. The aspiration is right. Has `wallRoots: Map<string, THREE.Group>` (line 43) which is exactly what the committer needs to manage. Already uses geometry-hash caching (`composeWallGeometryHash.ts`). Already handles HDRI texture (line 115), MeshStandardMaterial (line 572), and the colorWrite-false depth-only proxy mesh (lines 586–598) for hidden-but-pickable walls. **This file documents every edge case the committer must reproduce.** | Problems: (1) the file imports `* as THREE from 'three'` and uses THREE everywhere from line 25 onward — **the producer must be 100% THREE-free** (`pryzm-no-three-in-kernel` lint, real-enforced in S07). (2) The "pure function" claim at line 142 is aspirational; the actual code reads `this.scene` (line 432), constructs `new THREE.Group()` (line 437), `new THREE.Vector3()` (lines 508–509), `new THREE.MeshStandardMaterial({ ... })` (line 572) — none of these can survive in the kernel. The pure math is the **inner** functions (`MiterPrismBuilder`, `composeWallGeometryHash`, `LayeredWallOpeningBuilder`, the planar-cap miter math at lines ~700–900); the **outer** scene-management is the committer. (3) The DTO migration comment at line 505 (*"Phase B DTO migration: baseLine is [Point3D, Point3D]; reconstruct THREE.Vector3"*) marks the natural seam — kernel takes `Point3D`, committer reconstructs `THREE.Vector3` on the scenic side. **The right move**: S08 D2 starts the producer by lifting `WallPathBuilder.ts` (78 LOC, already pure) and `MiterPrismBuilder.ts` (123 LOC, already pure). S08 D3–D6 progressively lifts the inner `compute*` functions of `WallFragmentBuilder.ts` into producer, leaving the outer scene-management for S09's committer. **No file in `src/elements/walls/` is edited.** |
| `src/elements/walls/WallTool.ts` | 1,683 | At line 144 the constructor **already throws** if `commandManager` is not injected (the window-global fallback was deliberately removed — see line 145 *"Window-global fallback has been removed"*). Stores `commandManager` at construction (line 90 — explicitly tagged `§WALL-AUDIT-2026-W4`). Already uses bound-handler pattern (lines 558–559: `pointerDownHandler = (e) => this.onPointerDown(e)`). Already separates pointer-down (line 594) from pointer-move (line 838) cleanly. **This file proves PRYZM 1 already partially fixed the DI problem for tools.** | Problems: (1) `commandManager: any` (line 90) — typed as `any`. PRYZM 2 must type it as `CommandBus<WallCommands>`. (2) `previewLine: THREE.Line` (line 100) and `previewWall: THREE.Object3D` (line 102) are stored as instance fields — the THREE side belongs in `plugins/wall/tool.ts` scenic helpers, separated from pure-state. (3) The 8 sub-modes (Straight / Arc / Polyline / Trace / fromSlab / betweenMarks / dimension-input / underlay-aligned) are encoded as scattered conditionals; PRYZM 2 splits into discrete sub-tools (`DrawStraight`, `DrawArc`, `DrawPolyline`, …) per `code-level ADR docs/architecture/adr/0008-wall-tool-submodes.md` (PHASE-1A's wall-tool sub-mode triage; distinct from this phase's `code-level ADR docs/architecture/adr/0008-wall-handler-triage.md` wall HANDLER triage — see §0 numbering note). **The right move**: S09 D3 implements `plugins/wall/tool.ts` as a thin orchestrator over per-mode sub-tools; the constructor signature mirrors `WallTool.ts:144–147`'s strict-injection pattern verbatim. The 8 sub-modes are landed in S09 (Straight only — MVP), S10 (Arc, Polyline), and deferred to 1C (Trace, fromSlab UI mode, underlay-aligned). |

> **Implication**: kill-switch **K1B-4 (NEW below)** — no edits to `src/elements/walls/**` or `src/commands/walls/**` in 1B. The PRYZM-1 wall family must remain bit-for-bit unchanged across 1B; the only writes in `src/` are tests under `tests/fixtures/pryzm-1/wall/` (parity reference captures, not source edits).

### §1.3 The 22 wall-touching command surfaces — handler triage (`code-level ADR docs/architecture/adr/0008-wall-handler-triage.md` detail)

`code-level ADR docs/architecture/adr/0008-wall-handler-triage.md` (S07 D1) ratifies the triage from **22 PRYZM-1 wall command surfaces → 14 PRYZM-2 wall handlers**. The "22" counts: 16 actual wall command classes in `src/commands/walls/` (excluding `DeleteElementCommand.ts`, `GenericCommands.ts`, `wallSnapshotUtils.ts`) + 6 sibling commands from neighbouring families that mutate the wall store (e.g. door/window commands that change `wall.openings[]`).

> **Type catalog dependency.** Wall types (`Wall.standard`, `Wall.shear`, `Wall.elemented`, `Wall.partitioning`) are declared in `packages/types-builtin/wall/` per SPEC-05 §7.1. Walls in S07–S12 must reference a type id; instance-only walls are forbidden. Per `[strategic ADR-017]` Phase rollout S11, the type-completeness lint becomes PR-blocking from S11 — but Phase 1B walls already comply by writing types into `packages/types-builtin/`.

| PRYZM-1 file(s) | LOC | PRYZM-2 disposition | New handler name | Lands in sprint |
|---|---|---|---|---|
| `CreateWallCommand.ts` | 349 | Port verbatim (canonical example) | `CreateWall` | S07 D3 |
| `UpdateWallBaselineCommand.ts` | 191 | Port; rename | `MoveWall` | S07 D4 |
| `UpdateWallDimensionsCommand.ts` + `SetWallWidthCommand.ts` + `UpdateWallHeightCommand.ts` | 79 + 99 + 184 | **Merge 3→1** atomic dimension setter | `SetWallDimensions` | S07 D6 |
| `UpdateWallColorCommand.ts` | 71 | Port | `SetWallColor` | S07 D7 |
| `UpdateWallSystemTypeCommand.ts` | 72 | Port | `SetWallSystemType` | S10 D3 |
| `UpdateWallLayersCommand.ts` | 169 | Port | `SetWallLayers` | S10 D2 |
| `SetAllWallsWidthCommand.ts` + `SetAllWallsVisualPropertiesCommand.ts` | 118 + 88 | **Merge 2→1** bulk visuals | `BulkSetWallVisuals` | S10 D2 |
| `CreateWallOpeningCommand.ts` | 267 | Port | `CreateWallOpening` | S10 D4 |
| `CreateWallBetweenMarksCommand.ts` | 152 | Port | `CreateWallBetweenMarks` | S10 D2 |
| `CreateWallsFromSlabCommand.ts` | 167 | Port | `CreateWallsFromSlab` | S10 D3 |
| `CreateWallsOnAllSlabsCommand.ts` | 134 | **Drop** (UI iterates) | — | — |
| `ChangeWallLevelCommand.ts` | 102 | Port | `ChangeWallLevel` | S10 D4 |
| `CascadeWallBaselineCommand.ts` | 223 | **Lift to L4** generic cascade infra | (none — declared via `cascade: { affects: ['wall.baseline'] }` on `MoveWall`) | S10 D6 |
| `DeleteElementCommand.ts` (1,783-LOC generic, lives in `walls/`) | 783 | **Lift to L4** generic delete | `DeleteWall` (thin wrapper on generic) | S07 D4 |
| `MirrorWallCommand` (sibling, in `src/commands/`) | varies | Port | `MirrorWall` | S10 D2 |
| `ScaleWallCommand` (sibling) | varies | Port | `ScaleWall` | S10 D2 |
| `OffsetWallCommand` (sibling) | varies | Port | `OffsetWall` | S10 D3 |
| `JoinWallsCommand` (sibling) | varies | Port | `JoinWall` | S10 D3 |
| `CutWallCommand` (sibling) | varies | Port | `CutWall` | S10 D4 |
| `ReferenceEditWallCommand` (sibling, in `src/tools/operations/ReferenceEditTool.ts`) | varies | Port | `ReferenceEditWall` | S10 D4 |
| Door/window opening-host mutations (sibling commands) | varies | Cross-handler — door/window handlers declare `affectedStores: ['wall']` for opening updates | (no new wall handler) | S11 |

**Net wall handlers in PRYZM 2**: `CreateWall`, `DeleteWall`, `MoveWall`, `SetWallDimensions`, `SetWallColor`, `SetWallSystemType`, `SetWallLayers`, `BulkSetWallVisuals`, `CreateWallOpening`, `CreateWallBetweenMarks`, `CreateWallsFromSlab`, `ChangeWallLevel`, `MirrorWall`, `ScaleWall`, `OffsetWall`, `JoinWall`, `CutWall`, `ReferenceEditWall` = **18 handlers**. `code-level ADR docs/architecture/adr/0008-wall-handler-triage.md` collapses this to **14 by merging the 5 transform handlers (Mirror/Scale/Offset/Move/ReferenceEdit) into `TransformWall { kind: 'mirror' | 'scale' | 'offset' | 'move' | 'reference-edit', params }`** at S10 D6. The "14" headline is post-merge.

> **Implication for S07–S10 ordering**: S07 ships 5 of the 14 (`CreateWall`, `DeleteWall`, `MoveWall`, `SetWallDimensions`, `SetWallColor`). S10 ships the remaining 9. The producer (S08) and committer (S09) sit between them — by S09 D9 the 5 simplest handlers can drive a tool that draws walls; by S10 D9 the wall is *done* for Phase 1.

### §1.4 What pure math to lift to `producers/wall.ts` (line refs into `WallFragmentBuilder.ts`)

The S08 producer extraction is a **read-only mining operation** against `WallFragmentBuilder.ts`. The lift order matters because each layer of the producer depends on the previous; reverse-order lifting fails parity.

| Producer pass | Source in PRYZM 1 (`src/elements/walls/`) | Source LOC range | S08 day landed | Parity case count |
|---|---|---|---|---|
| 1. Path → centre-line vectors | `WallPathBuilder.ts` (entire file, 78 LOC, already pure) | full file | S08 D2 | 5 (straight, +X, -X, +Z, -Z) |
| 2. Layer extrusion (single-material) | `WallFragmentBuilder.ts` lines ~430–620 (extract math; discard `wallGroup = new THREE.Group()` at line 437, `new THREE.Vector3` at lines 508–509, `MeshStandardMaterial` at line 572) | ~190 LOC | S08 D2 | 4 (heights 1m, 2.5m, 4m, 10m) |
| 3. Multi-layer wall (CMU, drywall stacks) | `WallFragmentBuilder.ts` lines ~620–900 + `WallSystemTypeStore.ts:layerResolution` | ~300 LOC | S08 D3 | 6 (1-layer, 2-layer, 3-layer, asymmetric, with insulation, full assembly) |
| 4. Openings cuts (door/window holes) | `LayeredWallOpeningBuilder.ts` (full 290 LOC) + `WallOpeningPositionResolver.ts` (full 88 LOC) | 378 LOC | S08 D4 | 8 (1 door, 2 doors, 1 window, mixed, edge-case at end, edge-case at start, overlapping handled, missing host) |
| 5. Curved-base walls | `CurvedWallLayerBuilder.ts` (full 250 LOC) + `CurvedWallCapMiter.ts` (full 54 LOC) | 304 LOC | S08 D6 | 5 (arc 30°, arc 90°, arc 180°, S-curve, full circle) |
| 6. Miter joins (the parity-test crucible) | `MiterPrismBuilder.ts` (full 123 LOC) + miter math inside `WallFragmentBuilder.ts` lines ~700–900 | ~250 LOC | S08 D8 (tuning) | 2 fixtures (T-junction, X-junction) — these typically fail first and drive S08 D8 tuning |

**Total liftable pure math**: ~1,200 LOC of inner functions inside `WallFragmentBuilder.ts` plus ~793 LOC of already-near-pure files (`WallPathBuilder`, `MiterPrismBuilder`, `LayeredWallOpeningBuilder`, `CurvedWallLayerBuilder`, `CurvedWallCapMiter`, `composeWallGeometryHash`, `WallOpeningPositionResolver`). Net producer target: **~1,400 LOC** (with simplification + dead-branch removal).

The **discarded outer layer** (~860 LOC of `WallFragmentBuilder.ts`) is the THREE-bound side — `new THREE.Group()`, `new THREE.MeshStandardMaterial(...)`, the `colorWrite: false / depthWrite: false` proxy mesh pattern (lines 586–598), HDRI texture wiring (line 115ff), `wallRoots: Map<string, THREE.Group>` (line 43). All of this lands in `plugins/wall/committer.ts` (S09).

### §1.5 The 73-file consumer concentration map for the wall family

`rg -l "from .*walls" src/ -t ts | wc -l` returns **73 files** importing from `src/elements/walls/`. This is the **blast radius** — every one of these is a potential source of "the wall changed and *X* didn't notice" bugs. PRYZM 2's `Store<T>.subscribeDirty()` makes each consumer explicit; for now in 1B we leave them all in PRYZM 1 (kill-switch K1B-4).

| Concentration | Count | Sample files | 1B treatment |
|---|---|---|---|
| Plan-tool handlers (2D plan-view editing surface) | 6 | `src/core/views/plantools/{Wall,Window,Door,CurtainWall,Plumbing,PlanTool}Handler.ts` | **Untouched in 1B**. Plan-view is 1C / 1D scope. |
| IFC import / export | 5 | `src/import/ifc/conversion/{IfcWallToNativeConverter,IfcOpeningToNativeConverter}.ts`, `src/export/ifc/readers/{WallReader,CurtainWallReader,WindowDoorReader}.ts`, `src/export/ifc/FragmentReader.ts` | **Untouched in 1B**. IFC migration is Phase 2C. |
| Tools / selection | 3 | `src/tools/{ToolManager,SelectionManager}.ts`, `src/tools/operations/ReferenceEditTool.ts` | **Untouched in 1B**. The PRYZM-2 ToolManager is built fresh in `apps/editor/`; the wall plugin registers its own tool there (S09). |
| Engine subsystems | 3 | `src/engine/subsystems/{initBuilders,initTools,initUI}.ts` | **Untouched in 1B**. PRYZM-2 bootstrap is `apps/editor/src/bootstrap.{data,render}.ts`. |
| Cross-element services | 2 | `src/services/{SlabWallConnectivityService,SlabDependencyTracker}.ts` | **Untouched in 1B**. Cascade infra ports to L4 in S10 D6 but these consumers stay PRYZM-1. |
| Other (commands, store-side hooks, dev) | ~54 | various | **Untouched in 1B**. |

> **Implication**: 1B does **not** delete a single import in PRYZM 1. The wall plugin in PRYZM 2 is built **alongside** the PRYZM-1 wall family, not on top of it. The `?pryzm2=1` URL flag (1A S06) selects between them at boot.

### §1.6 Greenfield gaps (what literally does not exist yet at M3 morning)

| Capability | M3 morning status | 1B delivery |
|---|---|---|
| `packages/geometry-kernel/` | greenfield (1A did not need it) | S07 D3 (Agent B bootstraps); first producer S08 D2 |
| `packages/geometry-kernel/types/{BufferGeometryDescriptor,JoinData}.ts` | absent | S08 D2 (joint A+B) |
| `plugins/wall/` directory | absent (only `plugins/cube/` exists from 1A) | S07 D2 (Agent B bootstraps) |
| `plugins/{door,window,roof,slab,curtain-wall,grid,column,beam}/` directories | absent | S11 (door, window, roof) + S12 (slab, CW, grid, column, beam) |
| `tests/parity/wall/` | absent | S07 D6 (5 baseline fixtures) + S08 D6 (25 more) + S10 D7 (real-project extracts) |
| Node worker_thread headless test harness | absent (1A's tests run in browser only) | S08 D2 (Agent B) |
| Browser worker test harness | absent | S08 D3 (Agent B) |
| `BufferGeometryDescriptor` validation utility | absent | S08 D4 |
| Playwright integration suite for plugins | absent (1A used Playwright only for visual-diff) | S07 D7 (smoke), S09 D7 (wall full) |
| `apps/bench/produce-wall.ts` | absent | S08 D5 |
| `apps/bench/load-small.ts` | absent | S09 D3 (1-wall fixture) |
| `apps/bench/load-medium.ts` | absent | S12 D8 (skeleton; full medium fixture in S19) |
| `tests/fixtures/small-project.pryzm-stub.json` | absent | S09 D2 |
| `pryzm-no-three-in-kernel` lint **real enforcement** | scaffold-only at M3 (1A S03) | S07 D3 (real-enforce flag flipped on for `packages/geometry-kernel/**`) |

> **Implication**: S07 D2–D3 is significant scaffolding (kernel package, wall plugin, lint flip). It is *not* "just write 5 handlers". Agent B's S07 work is heavier than it looks.

### §1.7 Wall-specific schema notes (Wall.ts in `packages/schemas/`, already landed in 1A)

`packages/schemas/Wall.ts` was landed in 1A S01 D6 using `src/elements/walls/WallDataSchema.ts` (314 LOC) as the structural reference. The 1A round-trip test (`tests/fixtures/pryzm-1-snapshots/wall-sample.json`) is green. **For 1B, the schema is frozen** — any field changes go through ADR. Two known follow-ups arrive in 1B:

- **`affectedStores` declarations**: every wall handler in S07 / S10 declares `readonly affectedStores: readonly StoreId[]` per `code-level ADR docs/architecture/adr/0002-command-handler-signature.md`. Lint rule `pryzm-affected-stores-required` enforces (1A S02).
- **Opening-host references**: Door and Window in 1B's S11 use `Wall.id` as opening-host pointer; the schema field `Wall.openings[]` is read-only from the wall's perspective (door/window handlers mutate it via `affectedStores: ['wall']`). This is documented in `code-level ADR docs/architecture/adr/0008-wall-handler-triage.md`.

---

## §2 Track allocation for 1B

The wall — and every element family that follows — has two halves: the **headless half** (schema-already-done, store, handlers, pure producer, parity tests) and the **scenic half** (committer, tool, intent resolution, panel hooks). Track A owns headless; Track B owns scenic. They sync at the producer → committer interface.

### §2.1 Track A — Headless half (Agent A owns)

| Item | First sprint | Owner | Mirrors PRYZM-1 file(s) |
|---|---|---|---|
| `plugins/wall/store.ts` (real impl) | S07 | A | `src/elements/walls/WallStore.ts` (1,227 LOC — shape only; one-channel diff) |
| `plugins/wall/handlers/{CreateWall,DeleteWall,MoveWall,SetWallDimensions,SetWallColor}.ts` | S07 | A | `src/commands/walls/{CreateWall,UpdateWallBaseline,UpdateWallDimensions,SetWallWidth,UpdateWallHeight,UpdateWallColor}Command.ts` (canonical: `CreateWallCommand.ts:51` `affectedStores`) |
| `packages/geometry-kernel/producers/wall.ts` | S08 | A | `src/elements/walls/{WallFragmentBuilder.ts (~1200 LOC inner math), WallPathBuilder.ts, MiterPrismBuilder.ts, LayeredWallOpeningBuilder.ts, CurvedWallLayerBuilder.ts, CurvedWallCapMiter.ts, composeWallGeometryHash.ts, WallOpeningPositionResolver.ts}` |
| `tests/parity/wall/` (30-case fixture) | S08 + S10 | A | (greenfield — captured from PRYZM 1 reference outputs) |
| `plugins/wall/handlers/{TransformWall,SetWallSystemType,SetWallLayers,BulkSetWallVisuals,CreateWallOpening,CreateWallBetweenMarks,CreateWallsFromSlab,ChangeWallLevel,JoinWall,CutWall}.ts` (9 more) | S10 | A | `src/commands/walls/{Update*,SetAll*,Create*,ChangeWallLevel,CascadeWallBaseline}Command.ts` + sibling Mirror/Scale/Offset/Join/Cut/ReferenceEdit |
| `plugins/wall/intent.ts` (resolver) | S10 | A | `src/elements/walls/{WallIntentResolver.ts, PathResolver.ts, WallSnapCycler.ts}` |
| `plugins/wall/system-type-store.ts` | S07 | A | `src/elements/walls/WallSystemTypeStore.ts` (263 LOC) |
| `plugins/wall/occupancy.ts` | S10 | A | `src/elements/walls/WallOccupancyStore.ts` (221 LOC) |
| `plugins/door/{store,handlers,producer}.ts` | S11 | A | `src/elements/doors/*` |
| `plugins/window/{store,handlers,producer}.ts` | S11 | A | `src/elements/windows/*` |
| `plugins/slab/{store,handlers,producer}.ts` | S12 | A | `src/elements/slabs/*` |
| `plugins/grid/{store,handlers,producer}.ts` | S12 | A | `src/elements/grids/*` |
| `plugins/column/{store,handlers,producer}.ts` | S12 | A | `src/elements/columns/*` |
| `plugins/beam/{store,handlers,producer}.ts` | S12 | A | `src/elements/beams/*` |
| `apps/bench/load-small.ts` (1-wall fixture) | S09 | A | (greenfield) |
| `apps/bench/load-medium.ts` (skeleton) | S12 | A | (greenfield) |
| `apps/bench/produce-wall.ts` | S08 | A | (greenfield — `src/dev/WallPerfBench.ts` is the closest precedent at 0.3 K LOC) |

### §2.2 Track B — Scenic half (Agent B owns)

| Item | First sprint | Owner | Mirrors PRYZM-1 file(s) |
|---|---|---|---|
| `packages/geometry-kernel/` package scaffolding + lint flip | S07 | B | (greenfield) |
| `plugins/wall/` package scaffolding | S07 | B | (greenfield — only `plugins/cube/` from 1A exists) |
| `packages/stores/SelectionStore.ts` | S07 | B | (greenfield — used by S16 selection work, but lands here as a bring-forward) |
| Node worker_thread headless test harness | S08 | B | (greenfield) |
| Browser worker test harness | S08 | B | (greenfield) |
| `plugins/wall/committer.ts` | S09 | B | `src/elements/walls/WallFragmentBuilder.ts` (outer ~860 LOC THREE side; lines 25, 36, 43, 115, 432, 437, 505, 572–573, 586–598) |
| `plugins/wall/tool.ts` (creation tool, Straight mode) | S09 | B | `src/elements/walls/WallTool.ts` (1,683 LOC; lines 144 strict-injection, 558–559 bound handlers, 594 down, 838 move) |
| `plugins/wall/selection-highlight.ts` | S09 | B | `src/elements/walls/WallEdgeOverlayBuilder.ts` (154 LOC) |
| `plugins/wall/__tests__/integration.test.ts` (Playwright) | S09 | B | (greenfield) |
| `plugins/wall/tool.ts` Arc + Polyline sub-modes | S10 | B | `WallTool.ts` arc + polyline branches |
| `packages/geometry-kernel/producers/roof.ts` (port) | S10 | B (paired with A) | `src/elements/roofs/RoofGeometryBuilder.generate()` |
| `plugins/roof/{committer,tool}.ts` | S10–S11 | B | `src/elements/roofs/*` |
| `plugins/door/{committer,tool}.ts` | S11 | B | `src/elements/doors/*` |
| `plugins/window/{committer,tool}.ts` | S11 | B | `src/elements/windows/*` |
| `plugins/slab/{committer,tool}.ts` | S12 | B | `src/elements/slabs/*` |
| `plugins/curtain-wall/{committer,tool}.ts` | S12 | B (paired) | `src/elements/curtainwalls/*` |
| `plugins/grid/committer.ts` | S12 | B | `src/elements/grids/*` |
| `plugins/column/committer.ts` | S12 | B | `src/elements/columns/*` |
| `plugins/beam/committer.ts` | S12 | B | `src/elements/beams/*` |
| `apps/bench/orbit-fps.ts` re-runs with N walls | S09, S11, S12 | B | (re-uses 1A scaffold) |
| `MaterialPool.deduplicateAcrossElementTypes()` extension | S12 | B | (1A `MaterialPool` extended for cross-family material reuse) |

### §2.3 Joint deliverables (paired sessions, F arbitrates)

| Item | Sprint | Sync mechanism | Owner of final merge |
|---|---|---|---|
| `code-level ADR docs/architecture/adr/0008-wall-handler-triage.md` (Wall handler triage: 22 → 14) | S07 D1 | Joint design session | F (drafted by A, B reviews) |
| `code-level ADR docs/architecture/adr/0009-wall-producer-signature.md` (Producer pure-function signature) | S08 D1 | Joint design | F (drafted by A, B reviews) |
| `code-level ADR docs/architecture/adr/0010-slab-handler-triage.md` (Slab handler triage) | S12 D1 | Joint design | F (drafted by A) |
| `code-level ADR docs/architecture/adr/0011-curtain-wall-triage-and-producer-split.md` (Curtain Wall handler triage + producer split: panels vs mullions vs transoms) | S12 D5 | Joint design | F (drafted jointly A+B) |
| `code-level ADR docs/architecture/adr/0012-cross-element-cascade-rule-registration.md` (Cross-element cascade-rule registration) | S10 D6 | Joint design | F (drafted by A) |
| `code-level ADR docs/architecture/adr/0013-intent-resolver.md` (Intent resolver shape: snap-target priority + tie-breaking) | S10 D1 | Joint design | F (drafted by A) |
| `packages/geometry-kernel/types/{BufferGeometryDescriptor,JoinData}.ts` | S08 D2 | Paired | A pushes; B reviews |
| `packages/geometry-kernel/__tests__/{headless-runner,browser-worker-runner}.ts` | S08 D2–D3 | Cross-track | B pushes; A consumes |
| Wall integration end-to-end (S09 D5) | S09 | 4-h paired session | F observes |
| Curtain Wall design + producer + committer (S12 D5–D7) | S12 | 3-day paired sprint-within-sprint | F observes daily |
| Sub-phase 1B demo recording (8-min screencast) | S12 D9 | Joint | F edits |

---

## §3 Sprint-by-sprint two-agent breakdown

---

### S07 — Wall store + 5 simplest handlers + plugin/kernel scaffolding (Weeks 13–14, M4)

**Joint goal**: `plugins/wall/store.ts` real implementation; 5 handlers (`CreateWall`, `DeleteWall`, `MoveWall`, `SetWallDimensions`, `SetWallColor`) execute end-to-end through the bus; first 5 parity snapshot fixtures captured; `packages/geometry-kernel/` package exists with `pryzm-no-three-in-kernel` real-enforced.

#### Existing-code touchpoints

| What we read in `src/` | Why |
|---|---|
| `src/elements/walls/WallStore.ts:79` (class header), `:80` (Map<id, WallData>), `:83` (listeners array), `:111` (constructor signature), `:1114–1190` (subscribe + 60-line fan-out doc block), `:1159–1165` (defensive try/catch around listener) | **A reads** to mirror the shape into `plugins/wall/store.ts`. The new store is a `Store<WallData>` extending `packages/stores/`; the 60-line fan-out comment is **distilled to one sentence** (one channel, dirty-diff). |
| `src/commands/walls/CreateWallCommand.ts:51` (`affectedStores`), `:109` `:140` `:234` `:252` `:275` `:297` `:309` `:311` (store call sites) | **A reads** as the canonical handler example. The PRYZM 2 `CreateWall` handler is a verbatim port with `crypto.randomUUID()` swapped for `ulid()` and `(window as any)` checks deleted. |
| `src/commands/walls/UpdateWallBaselineCommand.ts` (full 191 LOC), `UpdateWallDimensionsCommand.ts` (79), `SetWallWidthCommand.ts` (99), `UpdateWallHeightCommand.ts` (184), `UpdateWallColorCommand.ts` (71) | **A reads** to extract the 4 simplest handlers + the merge target for `SetWallDimensions`. |
| `src/commands/walls/DeleteElementCommand.ts` (783 LOC) | **A reads** to extract the generic delete pattern; lifts to `packages/command-bus/handlers/DeleteElement.ts` (L4). The wall plugin registers a cascade rule (`affectedStores: ['wall', 'door', 'window']`). |
| `src/elements/walls/WallSystemTypeStore.ts` (263 LOC) | **A mirrors** into `plugins/wall/system-type-store.ts`. Pure-state, no THREE — easy port. |
| `src/elements/walls/errors.ts` (127 LOC) | **A mirrors** into `plugins/wall/errors.ts`. Strict typed errors per `code-level ADR docs/architecture/adr/0002-command-handler-signature.md`. |
| `src/elements/walls/WallTool.ts:144–147` (strict-injection pattern: throws if no commandManager) | **B reads** — confirms PRYZM 1 already proved the no-window-fallback pattern. The S09 `plugins/wall/tool.ts` constructor mirrors this verbatim. |
| `src/elements/walls/WallFragmentBuilder.ts:142` and `:425` (the "pure function" comments — aspirational) | **B reads** — confirms the producer-vs-committer seam diagnosed in §1.2 is what PRYZM 1 has been groping toward for years. |
| `apps/editor/src/bootstrap.data.ts` (from 1A S05–S06) | **A reads** to register the new wall store with the bootstrap; confirms the API the 1A bootstrap exposes (`registerStore<T>(id, store)`). |
| `apps/editor/src/bootstrap.render.ts` (from 1A S06) | **B reads** to register the wall plugin's committer (which lands in S09); confirms the plugin-registration API. |

#### Sub-phases

- **S07-T0 — Robustness property-test suite scaffold (D2, Agent A)** — `packages/geometry-kernel/__tests__/robustness/` lands per `[strategic ADR-020]` Phase rollout S07. The `wall-join.spec.ts` property test (two walls at angle θ ∈ [1°, 179°] with thickness t ∈ [50 mm, 600 mm]; assert miter joint manifold + area within 1% of analytic) MUST pass before S07 close. From S08, the suite is a PR-merge gate.
- **S07-T1 — `plugins/wall/` package scaffolding (D2, Agent B)**: `package.json`, `tsconfig.json`, `vitest.config.ts`, `eslint.config.js`. Add to `pnpm-workspace.yaml`. Boundaries-lint allowlist updated for `plugins/wall/committer.ts` (THREE allowed in committer file only — the lint flip happens S09).
- **S07-T2 — `plugins/wall/store.ts` (D2, Agent A)**: `class WallStore extends Store<WallData>`. `applyPatch`, `subscribeDirty`, Zod-validated state at `add()` boundary. Mirrors `WallStore.ts:80` `Map<id, WallData>` clone-on-read pattern. **DTO-only** (no THREE). ~120 LOC target.
- **S07-T3 — `packages/geometry-kernel/` package + lint real-enforce (D3, Agent B)**: bootstrap `packages/geometry-kernel/`, add `producers/` folder. Flip `pryzm-no-three-in-kernel` from scaffold (1A S03) to real-enforce in `packages/geometry-kernel/**`. Adds a fixture violation to prove the lint hard-fails.
- **S07-T4 — `plugins/wall/handlers/CreateWall.ts` (D3, Agent A)**: the canonical example with full JSDoc, OTel span, `affectedStores: ['wall', 'level'] as const`. Mirrors `CreateWallCommand.ts` end-to-end. ULID id generation (replaces `CreateWallCommand.ts:32`'s `crypto.randomUUID()`).
- **S07-T5 — `plugins/wall/handlers/{DeleteWall,MoveWall}.ts` (D4, Agent A)**: `DeleteWall` is a thin wrapper on the generic `DeleteElement` handler (lifted from `DeleteElementCommand.ts`); declares cascade rules. `MoveWall` mirrors `UpdateWallBaselineCommand.ts:191` shape.
- **S07-T6 — `packages/stores/SelectionStore.ts` (D4, Agent B)**: bring-forward from S16 — the selection store is needed earlier than originally planned because wall handlers will eventually emit selection diffs. ~80 LOC target. Pure DTO state.
- **S07-T7 — Mid-sprint sync (D5, joint)**: A walks B through wall DTO shape + dirty-diff format (`{ added: WallData[], updated: { id, patches: Patch[] }[], removed: WallId[] }`); B confirms producer signature `(dto: WallData, joinData: JoinData, worldY: number) => BufferGeometryDescriptor` can consume DTO. **`BufferGeometryDescriptor` type sketched** — paired with A. Type lands `packages/geometry-kernel/types/BufferGeometryDescriptor.ts`.
- **S07-T8 — `plugins/wall/handlers/{SetWallDimensions,SetWallColor}.ts` (D6, Agent A)**: `SetWallDimensions` merges `UpdateWallDimensionsCommand.ts` + `SetWallWidthCommand.ts` + `UpdateWallHeightCommand.ts` (3→1 collapse per `code-level ADR docs/architecture/adr/0008-wall-handler-triage.md`). Atomic patch with width + height + thickness in a single dirty-diff. `SetWallColor` mirrors `UpdateWallColorCommand.ts:71` (small handler).
- **S07-T9 — Patch correctness tests + 5 baseline fixtures (D6, Agent B)**: capture 5 PRYZM 1 reference geometry snapshots (one per simplest handler) → store under `tests/fixtures/pryzm-1/wall/{create,delete,move,dimensions,color}.json`. Used by A's parity tests in S08. The capture script reads PRYZM 1's `WallFragmentBuilder.generate()` output and serialises buffer attributes to JSON.
- **S07-T10 — Wire 5 handlers into bus + Playwright smoke (D7)**: A wires handlers into `apps/editor/src/bootstrap.data.ts` registry; undo round-trip tests for each (handler → patch → store → revert). OTel spans for each. B sets up Playwright harness `plugins/wall/__tests__/playwright/` (used in S09); smoke test: `?pryzm2=1` opens, browser console shows zero errors, the 5 wall handlers callable from `window.__pryzm2DevHandle.dispatch(...)` (dev-only escape hatch, gated to `import.meta.env.DEV`).
- **S07-T11 — Bench + docs (D8)**: A reruns `apps/bench/cmd-execute-latency.ts` for wall handlers — target < 1 ms p95 each. B writes `docs/architecture/element-recipe.md` v1 — the canonical wall pattern as a how-to (will guide every subsequent element from S10 onward).

#### D1 — Kickoff (45 min)

- F walks through `phases/PHASE-1-FOUNDATION-M1-M12.md §3.S07` and **§1.3 of this doc** (the 22 → 14 triage table).
- A presents wall handler triage: `code-level ADR docs/architecture/adr/0008-wall-handler-triage.md` drafted; F decides D2.
- B presents `plugins/<element>/` directory convention + the `pryzm-no-three-outside-committer` lint allowlist update.

#### D2–D8 parallel work

| Day | Agent A (Track A — wall store + 5 handlers) | Agent B (Track B — kernel scaffold + selection store + Playwright smoke) |
|---|---|---|
| D2 | **S07-T2**. `plugins/wall/store.ts` from `Store<T>` base. | **S07-T1**. `plugins/wall/` package scaffolding. |
| D3 | **S07-T4**. `CreateWall` handler — canonical example. | **S07-T3**. `packages/geometry-kernel/` package + `pryzm-no-three-in-kernel` real-enforce. |
| D4 | **S07-T5**. `DeleteWall`, `MoveWall` handlers. | **S07-T6**. `packages/stores/SelectionStore.ts`. |
| D5 | **S07-T7 paired session (1 h)** — DTO + dirty-diff format; sketch `BufferGeometryDescriptor`. | Same paired session — confirm producer signature. |
| D6 | **S07-T8**. `SetWallDimensions`, `SetWallColor` handlers. Patch correctness tests. | **S07-T9**. Capture 5 baseline geometry snapshots from PRYZM 1. |
| D7 | **S07-T10 (A side)**. Wire 5 handlers into bus registry; undo round-trip tests; OTel spans. | **S07-T10 (B side)**. Playwright smoke harness `plugins/wall/__tests__/playwright/`; `?pryzm2=1` opens with zero console errors. |
| D8 | **S07-T11 (A side)**. Bench `cmd-execute-latency` < 1 ms p95 per wall handler. | **S07-T11 (B side)**. `docs/architecture/element-recipe.md` v1. |

#### D9 — Sprint demo + retro

- A demos: 5 wall commands round-trip; undo restores byte-for-byte; OTel trace per command (`pryzm.command.execute` span includes `cmd.type='wall.create'`, `cmd.affectedStores=['wall','level']`, `store.apply.patch.count`).
- B demos: producer skeleton in place; `pryzm-no-three-in-kernel` lint hard-fails on a fixture THREE import in `packages/geometry-kernel/__fixtures__/violation.ts`.
- **Non-regression check (mandatory)**: open default URL → PRYZM 1 still draws walls; `tests/curtainWallToolStaticImport.spec.test.ts` still passes; `src/elements/walls/**` and `src/commands/walls/**` byte-for-byte unchanged from `main` (CI snapshot diff).
- Retro: was the handler triage right? Any DTO surprises? Any `WallStore.ts` patterns we should have kept that we discarded (rare but possible — e.g. the secondary `_levelIndex` at line 93 may need to be reified earlier than S10)?

#### S07 blocker analysis

| Potential blocker | How it manifests | Pre-mitigation |
|---|---|---|
| `WallStore.ts`'s coupling between wall + door + window state (lines 85–86 hold `windows: Map<>` + `doors: Map<>`) tempts A to copy the coupling into the new wall store | Wall store ends up owning door/window state in PRYZM 2; door plugin (S11) cannot get a clean cut | §1.2 explicitly forbids carrying the coupling. Door/window state lives in their own plugins (S11). The wall store exposes only a *query* surface for "which openings host on me", computed at read time from the door + window stores' `hostedBy` field. |
| `CreateWallCommand.ts`'s `_neighbourSnapshot` at line 234 (snapshots all walls in the level for join-cascade undo) is heavyweight — the new handler may inherit the cost | `cmd-execute-latency` bench fails (> 1 ms p95) on `CreateWall` because of the O(N) neighbour snapshot | The PRYZM 2 `CreateWall` handler does **not** snapshot neighbours; the cascade infra (S10 D6) handles join-cascade undo via the dependency-cascade lift from `CascadeWallBaselineCommand.ts`. The `code-level ADR docs/architecture/adr/0008-wall-handler-triage.md` entry for `CreateWall` explicitly drops the neighbour-snapshot. |
| The 60-line fan-out doc block (`WallStore.ts:1124–1190`) describes 3 surfaces; A is tempted to keep all 3 in PRYZM 2 | Two extra channels (EventBus + dirty-flag) re-introduced; the bootstrap has 3 places to subscribe | Mitigated by §1.2 — *one channel*, the dirty-diff. The EventBus and dirty-flag in PRYZM 1 exist because `FrameCoordinator` and `StoreEventBus` were never unified; PRYZM 2's `FrameScheduler` (1A S03) merges these. |
| `pryzm-no-three-in-kernel` real-enforce (S07-T3) catches a *legitimate* THREE-typed import the producer needs (e.g. for `BufferAttribute`) | S07 D3 fails CI on first commit | The `BufferGeometryDescriptor` type (S07-T7 sketched, S08 D2 finalised) uses **plain typed arrays** (`Float32Array`, `Uint16Array`) and a `{ position, normal, uv, index }` shape. Zero THREE imports needed. The committer reconstructs `THREE.BufferGeometry` on the scenic side. |
| `plugins/wall/` lands without a tool (S09) so the demo at S07 D9 cannot draw a wall — the team doubts progress | Demo feels weak; F questions the sequencing | Demo uses `window.__pryzm2DevHandle.dispatch({ type: 'wall.create', payload: { ... } })` from the dev console — the tool comes in S09. The 5 handlers are visible in OTel, undo works, persistence works. **The bet for S07 is the headless half, not pixels.** |
| `DeleteElementCommand.ts` is 783 LOC — lifting the generic delete to L4 takes longer than the 1-day budget | S07-T5 slips past D4 | Mitigation: A lifts only the **wall-relevant** subset of `DeleteElementCommand.ts` (the cascade rules for openings + level membership) — about 200 LOC. The other 580 LOC stays in PRYZM 1 and is lifted incrementally when each plugin lands (S11–S12). The generic `DeleteElement` handler in `packages/command-bus/` is a small (~80 LOC) shell that delegates to plugin-registered cascade rules. |
| The `crypto.randomUUID()` → `ulid()` swap (`CreateWallCommand.ts:32` → `plugins/wall/handlers/CreateWall.ts`) breaks the parity fixture (UUIDs ≠ ULIDs in the captured JSON) | Parity diff fails on every fixture trivially | Parity capture script normalises ids: replaces every `id` field with `'<id>'` before comparing. The `composeWallGeometryHash.ts` lift (S08) is id-agnostic by construction. |

#### S07 exit criteria

- [ ] `plugins/wall/store.ts` exists; 5 handlers (`CreateWall`, `DeleteWall`, `MoveWall`, `SetWallDimensions`, `SetWallColor`) execute end-to-end through the bus.
- [ ] Patches correct on undo for all 5; OTel spans cover handler + store apply.
- [ ] `cmd-execute-latency` < 1 ms p95 per wall handler.
- [ ] `pryzm-no-three-in-kernel` lint hard-fails on fixture violation in `packages/geometry-kernel/**`.
- [ ] `code-level ADR docs/architecture/adr/0008-wall-handler-triage.md` (wall handler triage 22 → 14) merged.
- [ ] `packages/stores/SelectionStore.ts` exists (DTO only, no THREE).
- [ ] `plugins/wall/system-type-store.ts` exists (mirrors `WallSystemTypeStore.ts:263`).
- [ ] `plugins/wall/errors.ts` exists with strict typed error classes.
- [ ] `docs/architecture/element-recipe.md` v1 published with `CreateWall` as the worked example.
- [ ] 5 baseline geometry snapshots captured under `tests/fixtures/pryzm-1/wall/`.
- [ ] PRYZM 1 still ships unchanged; `src/elements/walls/**` + `src/commands/walls/**` byte-for-byte unchanged (CI snapshot diff).
- [ ] `wall-join.spec.ts` property test green; PR gate enabled in S08.
- [ ] `Wall` family schema in `packages/types-schema/wall.ts` complete (per SPEC-05 §1.2).
- [ ] At least 4 wall types declared in `packages/types-builtin/wall/` (per SPEC-05 §7.1 — `standard`, `shear`, `elemented`, `partitioning`).

#### S07 typed contracts introduced

```ts
// packages/stores/Store.ts — base class (1A S03 frozen)
export abstract class Store<T extends { id: string }> {
  protected readonly items: Map<string, Readonly<T>>;
  abstract applyPatch(id: string, patches: readonly Patch[]): void;
  abstract subscribeDirty(cb: (diff: DirtyDiff<T>) => void): Unsubscribe;
  get(id: string): Readonly<T> | undefined;
}

export interface DirtyDiff<T> {
  readonly added: readonly Readonly<T>[];
  readonly updated: readonly { readonly id: string; readonly patches: readonly Patch[] }[];
  readonly removed: readonly string[];
}

// packages/command-bus/types.ts — Handler contract (1A S04 frozen, `code-level ADR docs/architecture/adr/0002-command-handler-signature.md`)
export interface Handler<TCmd extends Command, TResult extends HandlerResult = HandlerResult> {
  readonly type: TCmd['type'];
  readonly affectedStores: readonly StoreId[]; // `code-level ADR docs/architecture/adr/0002-command-handler-signature.md` — declarative, lint-enforced
  execute(cmd: TCmd, ctx: HandlerContext): Promise<TResult>;
}

export interface HandlerResult {
  readonly patches: Readonly<Record<StoreId, readonly StorePatch[]>>;
  readonly events: readonly DomainEvent[];
}

// plugins/wall/store.ts — S07-T2 (~120 LOC target)
export class WallStore extends Store<WallData> {
  constructor(private readonly emit: (e: DomainEvent) => void) { super(); }
  add(wall: WallData): void { /* Zod-validates at boundary; throws WallSchemaError on fail */ }
  applyPatch(id: WallId, patches: readonly Patch[]): void { /* immer structural-share */ }
  // exactly one channel per `code-level ADR docs/architecture/adr/0008-wall-handler-triage.md` — no EventBus, no dirty-flag fan-out
}

// plugins/wall/handlers/CreateWall.ts — S07-T4 (canonical example)
export interface CreateWallCommand extends Command {
  readonly type: 'wall.create';
  readonly payload: {
    readonly baseLine: readonly [Point3D, Point3D];
    readonly levelId: LevelId;
    readonly systemTypeId: WallSystemTypeId;
    readonly height?: number;       // defaults to systemType.defaultHeight
    readonly thickness?: number;    // defaults to systemType.layeredThickness sum
  };
}

export const createWallHandler: Handler<CreateWallCommand> = {
  type: 'wall.create',
  affectedStores: ['wall', 'level'] as const,
  async execute(cmd, ctx) {
    const id = ulid() as WallId;
    const sysType = ctx.wallSystemTypeStore.get(cmd.payload.systemTypeId);
    if (!sysType) throw new WallSystemTypeNotFoundError(cmd.payload.systemTypeId);
    const wall: WallData = {
      id, levelId: cmd.payload.levelId, systemTypeId: cmd.payload.systemTypeId,
      baseLine: cmd.payload.baseLine, height: cmd.payload.height ?? sysType.defaultHeight,
      thickness: cmd.payload.thickness ?? sumLayers(sysType.layers),
      layers: cmd.payload.thickness ? rescaleLayers(sysType.layers, cmd.payload.thickness) : sysType.layers,
      openings: [], color: sysType.defaultColor, visible: true,
      createdAt: ctx.now(), updatedAt: ctx.now(),
    };
    return {
      patches: { wall: [{ op: 'add', path: [id], value: wall }] },
      events: [{ type: 'wall.created', wallId: id, levelId: wall.levelId }],
    };
  },
};
```

#### S07 key pseudocode — `SetWallDimensions` (3→1 handler collapse)

`SetWallDimensions` is the canonical *merger* handler — it replaces three PRYZM-1 commands (`UpdateWallDimensionsCommand.ts:79`, `SetWallWidthCommand.ts:99`, `UpdateWallHeightCommand.ts:184`) with one atomic discriminated payload. Per `code-level ADR docs/architecture/adr/0008-wall-handler-triage.md` the merge is justified because all three mutate fields on the same `WallData` row and never need partial-apply semantics — they always succeed or fail atomically.

```ts
// plugins/wall/handlers/SetWallDimensions.ts — S07-T8 (~70 LOC)
export interface SetWallDimensionsCommand extends Command {
  readonly type: 'wall.setDimensions';
  readonly payload: {
    readonly wallId: WallId;
    readonly height?: number;        // optional ≠ no-op; presence-driven
    readonly thickness?: number;
    readonly rescaleLayers?: boolean; // when thickness changes, rescale layered widths
  };
}

export const setWallDimensionsHandler: Handler<SetWallDimensionsCommand> = {
  type: 'wall.setDimensions',
  affectedStores: ['wall'] as const,
  async execute(cmd, ctx) {
    const prev = ctx.wallStore.get(cmd.payload.wallId);
    if (!prev) throw new WallNotFoundError(cmd.payload.wallId);
    if (cmd.payload.height === undefined && cmd.payload.thickness === undefined) {
      return { patches: { wall: [] }, events: [] }; // no-op short-circuit
    }
    const next = produce(prev, (d) => {
      if (cmd.payload.height !== undefined) d.height = cmd.payload.height;
      if (cmd.payload.thickness !== undefined) {
        d.thickness = cmd.payload.thickness;
        if (cmd.payload.rescaleLayers ?? true) d.layers = rescaleLayers(prev.layers, cmd.payload.thickness);
      }
      d.updatedAt = ctx.now();
    });
    const patches = diffPatches(prev, next);
    return {
      patches: { wall: [{ op: 'replace', path: [cmd.payload.wallId], value: next, patches }] },
      events: [{ type: 'wall.dimensionsChanged', wallId: cmd.payload.wallId, prev: pickDims(prev), next: pickDims(next) }],
    };
  },
};
```

#### S07 test catalog (Vitest, 22 tests planned)

| Test file | Tests | Owner |
|---|---|---|
| `plugins/wall/__tests__/store.test.ts` | `add() Zod-validates`, `add() throws WallSchemaError on missing baseLine`, `get() returns frozen reference`, `applyPatch() emits exactly-one dirty diff per microtask`, `subscribeDirty() unsubscribe stops further diffs` | A |
| `plugins/wall/__tests__/handlers/CreateWall.test.ts` | `emits ULID id`, `affectedStores=['wall','level']`, `defaults height from systemType`, `throws WallSystemTypeNotFoundError on bad ref`, `OTel span emitted with cmd.type='wall.create'` | A |
| `plugins/wall/__tests__/handlers/DeleteWall.test.ts` | `cascades removal of openings via affectedStores`, `idempotent on missing wall (no-op)` | A |
| `plugins/wall/__tests__/handlers/MoveWall.test.ts` | `updates baseLine atomically`, `preserves openings (positions remain anchored)`, `OTel span span has store.apply.patch.count=1` | A |
| `plugins/wall/__tests__/handlers/SetWallDimensions.test.ts` | `no-op short-circuit on undefined+undefined`, `rescales layers by default on thickness change`, `does not rescale when rescaleLayers=false`, `merges 3 PRYZM-1 commands into 1 (parity check vs UpdateWallDimensionsCommand fixture)` | A |
| `plugins/wall/__tests__/handlers/SetWallColor.test.ts` | `materialOnly path — no geometry-affecting fields touched` | A |
| `plugins/wall/__tests__/system-type-store.test.ts` | `mirrors WallSystemTypeStore.ts:263 surface; pure DTO` | A |
| `plugins/wall/__tests__/errors.test.ts` | `WallNotFoundError extends DomainError`, `WallSchemaError carries Zod issue list` | A |
| `packages/geometry-kernel/__fixtures__/violation.test.ts` | `pryzm-no-three-in-kernel hard-fails on import three` | B |
| `apps/editor/__tests__/playwright/pryzm2-smoke.spec.ts` | `?pryzm2=1 opens with zero console errors`, `window.__pryzm2DevHandle.dispatch({type:'wall.create',...}) succeeds in DEV build` | B |

#### S07 OTel spans introduced (catalogued in §9 below)

| Span name | Parent | Key attributes | Sampling |
|---|---|---|---|
| `pryzm.command.execute` | (root or ancestor user-action span) | `cmd.type`, `cmd.id`, `cmd.affectedStores[]`, `cmd.payload.size_bytes`, `handler.duration_ms`, `result.patches.count`, `result.events.count`, `result.error.kind?` | always |
| `pryzm.handler.invoke` | `pryzm.command.execute` | `handler.type`, `handler.duration_ms`, `handler.error.kind?` | always |
| `pryzm.store.applyPatch` | `pryzm.command.execute` | `store.id`, `entity.id`, `patch.count`, `patch.size_bytes`, `dirty.diff.added`, `dirty.diff.updated`, `dirty.diff.removed` | always |
| `pryzm.frame.scheduler.tick` | (frame-loop root) | `tick.dirty.stores[]`, `tick.handlers.batched`, `tick.duration_ms` | 1/100 in prod; always in DEV |

#### S07 daily artifact log (what is on `main` by EOD each day)

| Day | Files added | Files modified | Tests passing |
|---|---|---|---|
| D2 | `plugins/wall/{package.json,tsconfig.json,vitest.config.ts,eslint.config.js,store.ts}` | `pnpm-workspace.yaml`, root lint allowlist | `store.test.ts` (5/5) |
| D3 | `packages/geometry-kernel/{package.json,tsconfig.json,producers/.gitkeep,__fixtures__/violation.ts}`, `plugins/wall/handlers/CreateWall.ts` | lint config (real-enforce flip) | `+CreateWall.test.ts` (5/5) |
| D4 | `plugins/wall/handlers/{DeleteWall,MoveWall}.ts`, `packages/stores/SelectionStore.ts` | `bootstrap.data.ts` registers WallStore | `+DeleteWall.test.ts +MoveWall.test.ts` (4/4) |
| D5 | `packages/geometry-kernel/types/BufferGeometryDescriptor.ts` (sketch) | (joint paired session — no merge) | (no new tests) |
| D6 | `plugins/wall/handlers/{SetWallDimensions,SetWallColor}.ts`, `tests/fixtures/pryzm-1/wall/{create,delete,move,dimensions,color}.json` | `WallSystemTypeStore.ts` mirrored to `plugins/wall/system-type-store.ts` | `+SetWallDimensions +SetWallColor` (5/5) |
| D7 | `apps/editor/__tests__/playwright/pryzm2-smoke.spec.ts` | `bootstrap.data.ts` wires 5 handlers + dev-handle | smoke green |
| D8 | `apps/bench/cmd-execute-latency.report.json`, `docs/architecture/element-recipe.md` | (none) | bench < 1 ms p95/handler |

---

### S08 — Pure wall producer + 30-case parity (Weeks 15–16, M4)

**Joint goal**: `packages/geometry-kernel/producers/wall.ts` is a **pure function** running identically in browser worker and Node `worker_thread`; 30 parity snapshots green vs PRYZM 1 reference geometries; **kernel pivot test K1-B confirmed** (kernel runs in Node).

#### Existing-code touchpoints

| What we read in `src/` | Why |
|---|---|
| `src/elements/walls/WallPathBuilder.ts` (78 LOC, full file) | **A lifts verbatim** as the first producer pass (D2). Already pure. |
| `src/elements/walls/MiterPrismBuilder.ts` (123 LOC, full file) | **A lifts verbatim** as the miter math kernel (D2 + D8 tuning). Already pure. |
| `src/elements/walls/composeWallGeometryHash.ts` (155 LOC, full file) | **A lifts verbatim** as the geometry-cache key. Already pure. |
| `src/elements/walls/WallFragmentBuilder.ts:430–620` (single-material extrusion math) | **A reads** as inner reference; writes equivalent kernel-side function. Discards line 437 (`new THREE.Group()`), lines 508–509 (`new THREE.Vector3`), lines 572–573 (`new THREE.MeshStandardMaterial`). |
| `WallFragmentBuilder.ts:620–900` (multi-layer + miter math) | **A reads** D3 + D8. The miter math at lines ~700–900 is the parity-test crucible — most fixtures fail here first. |
| `src/elements/walls/LayeredWallOpeningBuilder.ts` (290 LOC, full file) | **A lifts** as the openings pass (D4). Already near-pure. |
| `src/elements/walls/WallOpeningPositionResolver.ts` (88 LOC, full file) | **A lifts** as part of openings pass. Pure. |
| `src/elements/walls/CurvedWallLayerBuilder.ts` (250 LOC, full file) | **A lifts** D6 (curved-wall pass). Near-pure. |
| `src/elements/walls/CurvedWallCapMiter.ts` (54 LOC, full file) | **A lifts** D6. Pure. |
| `src/elements/walls/WallFragmentBuilder.ts:505` (DTO migration comment: *"baseLine is [Point3D, Point3D]"*) | **A confirms** the producer signature `(dto: WallData, ...) => BufferGeometryDescriptor` — DTO in, plain typed arrays out. |
| `src/dev/WallPerfBench.ts` (~300 LOC, the closest precedent for a wall perf bench) | **A reads** for what to measure; the new `apps/bench/produce-wall.ts` runs in Vitest, not via window. |

#### Sub-phases

- **S08-T1 — Simple-wall producer (D2, Agent A)**: `producers/wall.ts` first pass — straight wall, single layer, no openings, no curve. Pure function `(dto: WallData, joinData: JoinData, worldY: number) => BufferGeometryDescriptor`. Reuses lifted `WallPathBuilder.ts` + the inner extrusion math from `WallFragmentBuilder.ts:430–620`. ~250 LOC.
- **S08-T2 — Node `worker_thread` harness (D2, Agent B)**: `packages/geometry-kernel/__tests__/headless-runner.ts`. Loads producer in a Node worker_thread, runs against fixture DTO, returns `BufferGeometryDescriptor`. **K1-B foundation** — proves the kernel is genuinely Node-runnable.
- **S08-T3 — Browser-worker harness (D3, Agent B)**: `packages/geometry-kernel/__tests__/browser-worker-runner.ts` (Comlink-wrapped). Same producer, different runtime — must produce byte-identical buffer outputs to Node.
- **S08-T4 — Layered-wall producer (D3, Agent A)**: extend producer with multi-layer (CMU, drywall, insulation stacks). Reuses `WallFragmentBuilder.ts:620–900` math + `WallSystemTypeStore.ts` layer resolution.
- **S08-T5 — `BufferGeometryDescriptor` validation (D4, Agent B)**: `assertValidDescriptor(desc)` — no NaN, finite bounds, indices in range, normal vectors unit-length within 1e-6. Used by every producer test.
- **S08-T6 — Openings-wall producer (D4, Agent A)**: extend producer with door/window holes. Lifts `LayeredWallOpeningBuilder.ts` (290 LOC) + `WallOpeningPositionResolver.ts` (88 LOC) verbatim. **Decision point**: do we use `three-bvh-csg` in kernel (would require porting it to be THREE-free) or write a kernel-native CSG implementation? **F decides D5** — port `three-bvh-csg` to use plain typed arrays. The port lives in `packages/geometry-kernel/csg/` (~600 LOC, one-time cost; pays back across every element with openings: walls, slabs, roofs).
- **S08-T7 — Mid-sprint sync (D5, joint)**: review CSG approach + edge-case fixtures. Confirm signature stable. Confirm Node + browser harnesses are at byte-parity for the 5 D2 fixtures.
- **S08-T8 — Bench `apps/bench/produce-wall.ts` (D5, Agent B)**: run producer 1000 times, target p95 < 50 ms per simple wall. Vitest-driven. Baseline committed to `apps/bench/reports/produce-wall-baseline.md`.
- **S08-T9 — Curved-wall producer (D6, Agent A)**: lift `CurvedWallLayerBuilder.ts` + `CurvedWallCapMiter.ts`. Arc + spline base lines.
- **S08-T10 — 25 additional parity references (D6, Agent B)**: extend the 5 baseline captures from S07-T9 to all 30 cases (covers all wall variants from §1.4). Capture script reads PRYZM 1 fixtures from `tests/fixtures/pryzm-1/wall/configs/*.json` and runs `WallFragmentBuilder.generate()` against each.
- **S08-T11 — `wall-snapshot.test.ts` (D7, Agent A)**: 30 wall configs vs `__snapshots__/wall.snap`. Byte-equality on `position` / `normal` / `uv` / `index` arrays. Tolerance: 0 (no floating-point fuzz in the snapshot path; numerical determinism is the contract per `code-level ADR docs/architecture/adr/0009-wall-producer-signature.md`).
- **S08-T12 — `wall-headless-node.test.ts` (D7, Agent B)**: runs A's producer in Node `worker_thread`; compares to browser worker output byte-by-byte. **CI gate**.
- **S08-T13 — Tune for failing parity cases (D8, Agent A)**: typically miter math (T-junctions, X-junctions) fails first. Iterate on `MiterPrismBuilder.ts` lift. Wire Node + browser parity tests into CI; both must pass for PR merge.
- **S08-T14 — Docs (D8, Agent B)**: `docs/architecture/parity-fixtures.md` — how to capture parity fixtures (used for next 11 elements). `docs/architecture/element-recipe.md` updated with producer porting notes.

#### D1 — Kickoff (30 min)

- A presents `code-level ADR docs/architecture/adr/0009-wall-producer-signature.md` (producer pure-function signature `(dto, joinData, worldY) => BufferGeometryDescriptor`) — F decides.
- B confirms Node `worker_thread` harness ready (will run producer headless in CI from this sprint forward).

#### D2–D8 parallel work

| Day | Agent A (Track A — wall producer + parity) | Agent B (Track B — kernel infra + Node test harness + bench) |
|---|---|---|
| D2 | **S08-T1**. Simple-wall producer (no openings, no curve, no layered) — pure function. | **S08-T2**. Node `worker_thread` harness in `__tests__/headless-runner.ts`. |
| D3 | **S08-T4**. Layered-wall producer. | **S08-T3**. Browser-worker harness in `__tests__/browser-worker-runner.ts`. |
| D4 | **S08-T6**. Openings-wall producer (door + window holes). | **S08-T5**. `BufferGeometryDescriptor` validation utility. |
| D5 | **S08-T7 paired session (1 h)** with B — review CSG approach + edge-case fixtures. **F decides** CSG path. | **S08-T8**. Bench `apps/bench/produce-wall.ts` — 1000 runs, target p95 < 50 ms simple wall. |
| D6 | **S08-T9**. Curved-wall producer (arc/spline base line). | **S08-T10**. Capture 25 additional PRYZM 1 wall geometry references for parity. |
| D7 | **S08-T11**. `wall-snapshot.test.ts` — 30 wall configs vs `__snapshots__/wall.snap`. | **S08-T12**. `wall-headless-node.test.ts` — runs producer in Node `worker_thread`; compares to browser worker output. |
| D8 | **S08-T13**. Tune producer for failing parity cases (typically miter math). | **S08-T14**. Wire Node + browser parity tests into CI; both must pass for PR merge. `docs/architecture/parity-fixtures.md`. |

#### D9 — Sprint demo + retro

- A demos: 30 snapshot configs all green; one walk-through of the openings-producer logic showing how `LayeredWallOpeningBuilder.ts:290` becomes a pure function.
- B demos: same producer running in Node CLI + browser worker → byte-identical output → CI gate green; produce-wall bench < 50 ms p95.
- **Non-regression check**: PRYZM 1 still draws walls; `WallFragmentBuilder.ts` byte-for-byte unchanged.
- Retro: was the CSG choice right? Any producer perf surprises? Did the mining of `WallFragmentBuilder.ts:430–900` go cleanly, or did we discover hidden THREE dependencies?

#### S08 blocker analysis

| Potential blocker | How it manifests | Pre-mitigation |
|---|---|---|
| Miter math (T-/X-junctions) doesn't reach byte-parity due to floating-point drift | 2 of 30 snapshot tests fail; D8 burns budget tuning | `MiterPrismBuilder.ts:123` is already deterministic in PRYZM 1 (no `Math.random`, no `performance.now`-keyed branches). The lift is verbatim. If parity fails, the cause is almost always a missed Vector3 → Point3D conversion that loses a sign; binary diff tooling in `apps/dev/buffer-diff.ts` (S08 D7 utility) bisects to first byte. |
| `three-bvh-csg` cannot be ported to be THREE-free in 1 day (S08-T6) | S08-T6 slips; openings producer not ready by D4 | Fallback: kernel-native CSG via `manifold-3d` (WASM, already THREE-free). Adds one binary dependency (~600 KB unzipped). F decides at D5 if `three-bvh-csg` port is over-budget. **Both options are pre-vetted** during S07 D8. |
| Node `worker_thread` harness can't load TypeScript directly | S08 D2 stalls on toolchain | Use `tsx` for Node loading (already in PRYZM 1 dev deps). The harness file is `.test.ts` — Vitest handles compilation in both browser + Node modes. |
| Browser-worker output ≠ Node output by 1 ULP somewhere | S08-T12 fails CI; cause hard to find | The producer is **pure** by construction (no `Date.now`, no `Math.random`, no `crypto`); the only legitimate non-determinism is FP-mode (`+0` vs `-0`, denormals). The validation utility `assertValidDescriptor` (S08-T5) flags non-finite + non-canonical-zero values before snapshot compare. CI runs both modes with `--harmony` flags identical. |
| `WallFragmentBuilder.ts` math is **not actually pure** — it reads `this.scene` (line 432) inside what looked like a pure function | S08-T1 lift discovers hidden coupling; producer signature must change to take a scene-graph reference | The seam is at **inside** functions of `WallFragmentBuilder` — the file's *public* `generate()` reads `this.scene`, but the inner `compute*` helpers do not. The lift targets the inner helpers; the outer scene-management is committer's job (S09). The S07-T7 paired session validated this seam with a manual code-trace. |
| Bench p95 > 50 ms on simple wall because the V8 JIT cold-starts inside Vitest | Bench fails the gate | Bench harness runs 100 warm-up iterations before measuring 1000. p95 measured on warm samples. Reported as `cold/warm/p50/p95/p99` for transparency. |
| The `WallSystemTypeStore.ts` layer-resolution call from PRYZM 1 (synchronous Map lookup) becomes async in PRYZM 2 (network catalogue?) | Producer signature gains a Promise; pure-function contract violated | **No.** `code-level ADR docs/architecture/adr/0009-wall-producer-signature.md` mandates synchronous producer signatures. The system-type catalogue is materialised into the `WallData` DTO at handler time (the `SetWallSystemType` handler reads the catalogue and writes the resolved layer array into the store). The producer sees only resolved layers. |

#### S08 exit criteria

- [ ] 30 wall snapshot configs pass `tests/parity/wall/`.
- [ ] Node + browser produce byte-identical buffers from the same producer.
- [ ] `pryzm-no-three-in-kernel` lint passes for `packages/geometry-kernel/producers/wall.ts` (no THREE imports — verified).
- [ ] `apps/bench/produce-wall.ts` p95 < 50 ms simple wall.
- [ ] **Pivot test K1-B confirmed**: kernel is genuinely pure (Node test runs in CI).
- [ ] `code-level ADR docs/architecture/adr/0009-wall-producer-signature.md` (producer pure-function signature) merged.
- [ ] `packages/geometry-kernel/types/{BufferGeometryDescriptor,JoinData}.ts` published and used by wall producer.
- [ ] `packages/geometry-kernel/csg/` (3D Boolean ops, THREE-free) lands and is used by openings producer.
- [ ] `docs/architecture/parity-fixtures.md` published.
- [ ] PRYZM 1 still ships unchanged.
- [ ] `manifold-3d` pinned to exact SHA in `package.json` per `[strategic ADR-020]`.
- [ ] `kernel.error` OTel span emitted on every `Result.err` per `[strategic ADR-020]` §OpenTelemetry.

#### S08 typed contracts introduced

```ts
// packages/geometry-kernel/types/Point3D.ts — pure DTO
export interface Point3D { readonly x: number; readonly y: number; readonly z: number; }

// packages/geometry-kernel/types/BufferGeometryDescriptor.ts — S08 D2 frozen (`code-level ADR docs/architecture/adr/0009-wall-producer-signature.md`)
// Plain typed arrays — zero THREE imports. The committer reconstructs THREE.BufferGeometry.
export interface BufferGeometryDescriptor {
  readonly position: Float32Array;        // length = 3 * vertexCount
  readonly normal: Float32Array;          // length = 3 * vertexCount; unit-length within 1e-6
  readonly uv: Float32Array;              // length = 2 * vertexCount
  readonly index: Uint16Array | Uint32Array; // index range MUST be in [0, vertexCount)
  readonly bounds: { readonly min: Point3D; readonly max: Point3D }; // axis-aligned
  readonly groups: readonly { readonly start: number; readonly count: number; readonly materialIndex: number }[];
  readonly materialKeys: readonly MaterialKey[]; // content-addressed; MaterialPool resolves
  readonly hash: string;                  // composeWallGeometryHash output — cache key
}

// packages/geometry-kernel/types/JoinData.ts — pre-resolved at handler time
export interface JoinData {
  readonly start?: { readonly miterAngleRad: number; readonly neighbourId: WallId };
  readonly end?:   { readonly miterAngleRad: number; readonly neighbourId: WallId };
}

// packages/geometry-kernel/producers/wall.ts — `code-level ADR docs/architecture/adr/0009-wall-producer-signature.md` signature
export type WallProducer = (
  dto: Readonly<WallData>,
  joinData: Readonly<JoinData>,
  worldY: number,                         // level base elevation in world space
) => BufferGeometryDescriptor;

export const produceWall: WallProducer = (dto, joinData, worldY) => {
  // PURE — no `this`, no closures over module state, no Date.now(), no Math.random().
  // Kernel-deterministic: identical inputs → byte-identical Float32Array outputs.
  const path = buildPath(dto.baseLine);                  // lifted from WallPathBuilder.ts
  const miters = resolveMiters(path, joinData);          // lifted from MiterPrismBuilder.ts
  const layers = dto.layers;                             // pre-resolved at handler time
  const extruded = extrudeLayers(path, miters, layers, dto.height, worldY);
  const withHoles = dto.openings.length === 0 ? extruded : applyOpenings(extruded, dto.openings);
  const desc = serialize(withHoles);
  return { ...desc, hash: composeWallGeometryHash(dto, joinData, worldY) };
};

// packages/geometry-kernel/__tests__/headless-runner.ts — S08 D2 (Node worker_thread)
export async function runProducerInNode(dto: WallData, jd: JoinData, y: number)
  : Promise<BufferGeometryDescriptor> { /* posts to worker_thread; awaits descriptor */ }

// packages/geometry-kernel/__tests__/browser-worker-runner.ts — S08 D3 (Comlink)
export async function runProducerInBrowserWorker(dto: WallData, jd: JoinData, y: number)
  : Promise<BufferGeometryDescriptor> { /* posts to Worker via Comlink; awaits descriptor */ }

// packages/geometry-kernel/types/assertValidDescriptor.ts — S08-T5
export function assertValidDescriptor(d: BufferGeometryDescriptor): void {
  // throws DescriptorInvariantError on: NaN/Infinity in position; non-unit-length normals (>1e-6 deviation);
  // index out-of-range; bounds.min > bounds.max; groups non-monotonic; sum(groups.count) ≠ index.length.
}
```

#### S08 key pseudocode — `produceWall` openings pass + miter math

The openings pass is the parity-test crucible: PRYZM 1's `LayeredWallOpeningBuilder.ts:290` resolves opening positions in world space using the wall's pre-computed transform matrix (`WallFragmentBuilder.ts:572`). The PRYZM 2 producer must compute the same world positions *without ever instantiating a `THREE.Matrix4`* — it uses a plain 4×4 number array via `mat4` helpers in `packages/geometry-kernel/math/mat4.ts` (greenfield, ~80 LOC, lifted from gl-matrix's BSD-licensed reference implementation).

```ts
// packages/geometry-kernel/producers/_internal/applyOpenings.ts — S08-T6 (~280 LOC after lift)
export function applyOpenings(
  extruded: ExtrudedLayers,           // intermediate from extrudeLayers()
  openings: readonly WallOpening[],   // pre-resolved at handler time per S07-T8 contract
): ExtrudedLayers {
  // Strategy decided D5 by F (per S08 blocker-analysis): port three-bvh-csg → kernel-native.
  // Lives in packages/geometry-kernel/csg/ (~600 LOC; one-time port, pays back across wall+slab+roof).
  const cutter = new KernelCSG();
  for (const opening of openings) {
    const holeBox = openingBox(opening);          // 8 corners in plain Float32Array
    cutter.subtract(extruded, holeBox);           // typed-array boolean op; no THREE
  }
  return cutter.result();
}

// packages/geometry-kernel/producers/_internal/resolveMiters.ts — S08 D8 tuning crucible
export function resolveMiters(path: WallPath, jd: JoinData): MiterPrisms {
  // T-junction at start: miter on left edge only; right edge stays orthogonal.
  // X-junction: 4 walls share a corner — miter angle is the bisector of incoming wall directions.
  // Curved walls: end-cap miter is computed from the tangent at the curve endpoint (CurvedWallCapMiter.ts:54).
  // Numerical determinism: all atan2/cos/sin calls go through `kernelMath.atan2()` which clamps to ±π in a
  //   reproducible way (avoids the platform-specific atan2(-0,-0) divergence that breaks Node↔browser parity).
}
```

#### S08 test catalog (Vitest, 35 tests planned)

| Test file | Tests | Owner |
|---|---|---|
| `packages/geometry-kernel/__tests__/produceWall.simple.test.ts` | `straight-single-layer-no-openings`, `90deg L-junction miter`, `45deg miter`, `degenerate zero-length wall throws DescriptorInvariantError` | A |
| `packages/geometry-kernel/__tests__/produceWall.layered.test.ts` | `2-layer wall (CMU+drywall)`, `3-layer wall`, `5-layer wall (full assembly)`, `layer width sum equals wall thickness within 1e-9` | A |
| `packages/geometry-kernel/__tests__/produceWall.openings.test.ts` | `1 door hole`, `1 window hole`, `2 doors`, `door+window`, `opening at wall start (edge case)`, `opening at wall end`, `overlapping openings throws OpeningOverlapError` | A |
| `packages/geometry-kernel/__tests__/produceWall.curved.test.ts` | `arc base line (90deg)`, `arc with miter at start`, `spline base line (3 control pts)`, `curved layered wall` | A |
| `packages/geometry-kernel/__tests__/produceWall.miter-junctions.test.ts` | `T-junction left`, `T-junction right`, `X-junction (4 walls)`, `Y-junction (3 walls 120deg)`, `acute miter <30deg falls back to butt` | A |
| `tests/parity/wall/wall-snapshot.test.ts` | 30 fixtures × byte-equality vs `__snapshots__/wall.snap` (one assertion each) | A |
| `packages/geometry-kernel/__tests__/wall-headless-node.test.ts` | for each of 30 fixtures: Node `worker_thread` output ≡ browser worker output (byte-equality on Float32Array buffers) | B |
| `packages/geometry-kernel/__tests__/descriptor-invariants.test.ts` | `assertValidDescriptor accepts valid`, `rejects NaN position`, `rejects non-unit normal`, `rejects index out-of-range`, `rejects sum(groups.count)≠index.length` | B |
| `apps/bench/produce-wall.bench.ts` | 1000-run p95 < 50 ms simple wall; 1000-run p95 < 80 ms layered+openings | B |

#### S08 OTel spans introduced

| Span name | Parent | Key attributes | Sampling |
|---|---|---|---|
| `pryzm.kernel.produce.wall` | `pryzm.committer.commit` (S09) or `pryzm.bench.run` | `wall.id`, `wall.layers.count`, `wall.openings.count`, `wall.curved`, `producer.duration_ms`, `descriptor.vertex_count`, `descriptor.index_count`, `descriptor.hash`, `descriptor.bytes` | always (handler-driven) |
| `pryzm.kernel.csg.subtract` | `pryzm.kernel.produce.wall` | `csg.subject_vertices`, `csg.cutter_vertices`, `csg.duration_ms`, `csg.implementation` (`'kernel-csg'` per ADR D5) | 1/10 in prod; always in DEV |
| `pryzm.kernel.descriptor.assertValid` | (ambient) | `descriptor.hash`, `assert.duration_ms`, `assert.error.kind?` | DEV only |

#### S08 daily artifact log

| Day | Files added | Files modified | Tests passing |
|---|---|---|---|
| D2 | `packages/geometry-kernel/{producers/wall.ts (simple-only), types/{BufferGeometryDescriptor,Point3D,JoinData}.ts, math/{mat4,vec3}.ts, __tests__/headless-runner.ts}` | (none in `src/`) | `produceWall.simple` (4/4) |
| D3 | `packages/geometry-kernel/__tests__/browser-worker-runner.ts`, layered extrusion in `producers/wall.ts` | (none) | `+produceWall.layered` (4/4) |
| D4 | `packages/geometry-kernel/csg/{KernelCSG.ts,plane-clip.ts,bsp-tree.ts}` (~600 LOC port), openings pass in `producers/wall.ts`, `types/assertValidDescriptor.ts` | (none) | `+produceWall.openings (7/7), +descriptor-invariants (5/5)` |
| D5 | (joint paired session — CSG decision; `apps/bench/produce-wall.bench.ts` skeleton) | (none) | bench skeleton runs |
| D6 | curved-wall code path in `producers/wall.ts`, 25 more parity capture JSONs under `tests/fixtures/pryzm-1/wall/configs/` | (none) | `+produceWall.curved` (4/4) |
| D7 | `tests/parity/wall/wall-snapshot.test.ts`, `__snapshots__/wall.snap`, `packages/geometry-kernel/__tests__/wall-headless-node.test.ts` | CI workflow updated to run Node-headless gate | parity 25/30 (5 miter cases failing — expected) |
| D8 | (miter math fixes in `producers/_internal/resolveMiters.ts`), `docs/architecture/parity-fixtures.md` | CI gates wired | parity 30/30 ✓; bench p95=42ms ✓ |

---

### S09 — Wall committer + creation tool + Playwright integration (Weeks 17–18, M5)

**Joint goal**: drawing a wall in `?pryzm2=1` editor produces a correct 3D mesh, persists across reload, undo/redo work; orbit-fps with 100 walls > 55 fps p95; `apps/bench/load-small.ts` < 800 ms first interactive (1-wall fixture).

#### Existing-code touchpoints

| What we read in `src/` | Why |
|---|---|
| `src/elements/walls/WallFragmentBuilder.ts:25` (mesh field), `:36` (scene field), `:43` (wallRoots Map), `:115` (HDRI), `:432` (`existingInScene = scene.children.find...`), `:437` (`new THREE.Group()`), `:572–573` (`MeshStandardMaterial`), `:586–598` (`colorWrite: false / depthWrite: false` proxy mesh) | **B reads** as the canonical reference for the committer. Every THREE side-effect mentioned here must be reproduced in `plugins/wall/committer.ts` to maintain visual parity. The HDRI envmap binding is deferred to S15 (lighting sprint); the proxy-mesh pattern lands in S09. |
| `src/elements/walls/WallTool.ts:33` (class header), `:90` (`commandManager: any` storage), `:144–147` (strict-injection throw), `:558–559` (bound handlers), `:594` (`onPointerDown`), `:838` (`onPointerMove`), `:100–102` (preview line + preview wall fields) | **B reads** as the tool reference. Mirrors the strict-injection pattern (line 144). The 8 sub-modes are NOT all mirrored; S09 ships only Straight (the simplest). |
| `src/elements/walls/WallEdgeOverlayBuilder.ts` (154 LOC, full file) | **B reads** for selection-highlight (S09-T6). The outline-rendering pattern (offset-extruded edges) is portable to `plugins/wall/selection-highlight.ts`. |
| `src/elements/walls/WallSnapCycler.ts` (196 LOC) | **B reads** D3 — the Tab-key snap-target cycling. Behaviour mirrored into the Straight sub-tool. |
| `src/core/persistence/ProjectSerializer.ts` lines for wall save/load | **A reads** for `apps/bench/load-small.ts` reference — what does PRYZM 1 do for cold-load of 1 wall? Target: PRYZM 2 < 800 ms (PRYZM 1 takes ~2 s today for the same fixture). |
| `apps/editor/src/bootstrap.render.ts` (1A S06 final) | **B reads** to register the wall committer; the plugin-registration API was finalised in 1A. |

#### Sub-phases

- **S09-T1 — `tests/fixtures/small-project.pryzm-stub.json` (D2, Agent A)**: 1 wall, 1 slab placeholder, 1 door placeholder. Only the wall is functional in S09; slab/door schemas exist but their plugins land later (S11/S12). Used by `apps/bench/load-small.ts`.
- **S09-T2 — `plugins/wall/committer.ts` (D2, Agent B)**: implements `PrimitiveCommitter<WallStore>` (interface frozen 1A S05 `code-level ADR docs/architecture/adr/0005-primitive-committer-interface.md`). Subscribes to `wallStore.subscribeDirty(diff => ...)`. For each `added` wall: calls producer, builds `THREE.BufferGeometry` from descriptor, builds `THREE.Mesh`, requests material from `MaterialPool` (1A S05). For each `updated` wall: re-runs producer, swaps geometry. For each `removed`: disposes mesh, releases material ref. Mirrors the wallRoots-Map pattern (`WallFragmentBuilder.ts:43`). ~600 LOC target.
- **S09-T3 — `plugins/wall/tool.ts` (D3, Agent B)**: vanilla TS `Tool` subclass (interface from 1A S06 bootstrap). Click/drag/escape state machine. Constructor mirrors `WallTool.ts:144–147` strict-injection. Emits `CreateWall` commands via `commandBus.dispatch(...)`. **Straight mode only in S09**; Arc + Polyline land S10. Snap-cycling via Tab key (mirrors `WallSnapCycler.ts:196`).
- **S09-T4 — `apps/bench/load-small.ts` (D3, Agent A)**: cold-load the small fixture in `?pryzm2=1`; target < 800 ms first interactive (event-log replay → store hydration → first commit → first frame painted). Vitest + Playwright runner.
- **S09-T5 — Wire `plugins/wall/tool.ts` into editor toolbar (D4, Agent B)**: first plugin tool registered with PRYZM 2 tool manager. Toolbar UI is a single icon (`apps/editor/src/toolbar/wall-icon.svg`); panel UI lives in 1C scope.
- **S09-T6 — `plugins/wall/selection-highlight.ts` (D4, Agent B)**: committer extension for outline rendering on selection diff. Subscribes to `selectionStore.subscribeDirty(diff => ...)`. Mirrors `WallEdgeOverlayBuilder.ts:154` outline-extrusion pattern. ~80 LOC.
- **S09-T7 — Bench result review + tune (D4, Agent A)**: if `load-small` > 800 ms, profile + tune. Likely culprits: persistence-loader IO, store hydration order (wall must hydrate after level), or first-commit batching. Budget for tuning: the rest of D4.
- **S09-T8 — Mid-sprint paired session (D5, joint, 4 h)**: end-to-end test. A draws wall via tool → handler → patch → store → committer → mesh appears → reload → mesh restored. Both agents on the same machine; F observes. Any handoff seam discovered fixes here.
- **S09-T9 — `apps/bench/orbit-fps.ts` re-run with 100 walls (D6, Agent A)**: target > 55 fps p95. Uses 100-wall fixture generated by a script.
- **S09-T10 — 100-wall tune (D7, Agent A)**: if 100-wall orbit-fps fails, profile + tune. Likely culprits: `MaterialPool` not reusing across walls (each wall gets its own material instance), or scene-committer batching not coalescing per-tick updates. Cross-team with B.
- **S09-T11 — `plugins/wall/__tests__/integration.test.ts` Playwright (D7, Agent B)**: draws 10 walls in 30 s, verifies count + persistence after reload. Visual-diff frame against a PRYZM 1 reference of the same 10-wall config (visual-diff < 5 px — looser than 1A's 2 px because lighting differs slightly between PRYZM 1's OBC and PRYZM 2's single-pass).
- **S09-T12 — Documentation (D8)**: A writes `docs/architecture/parity-fixtures.md` updates (how wall fixtures generalise to other elements). B writes `plugins/wall/README.md` — the canonical plugin recipe template (`docs/architecture/element-recipe.md` is the spec; `plugins/wall/README.md` is the worked example).

#### D1 — Kickoff (30 min)

- B presents wall committer design (paired with A): how committer calls producer + bridges `BufferGeometryDescriptor` → `THREE.Mesh` + manages materials via `MaterialPool`.
- A confirms `wallStore.subscribeDirty()` provides exactly the diff shape committer needs (`{ added, updated: [{ id, patches }], removed }`).

#### D2–D8 parallel work

| Day | Agent A (Track A — small fixture + bench + tune) | Agent B (Track B — committer + tool + Playwright) |
|---|---|---|
| D2 | **S09-T1**. `tests/fixtures/small-project.pryzm-stub.json` (1 wall, 1 slab placeholder, 1 door placeholder). | **S09-T2**. `plugins/wall/committer.ts` — calls producer, builds Mesh, manages materials via `MaterialPool`. |
| D3 | **S09-T4**. `apps/bench/load-small.ts` — cold-load < 800 ms first interactive. | **S09-T3**. `plugins/wall/tool.ts` (Straight mode) — vanilla TS Tool; click/drag/escape; emits `CreateWall`. |
| D4 | **S09-T7**. Bench result review — if > 800 ms, profile + tune. | **S09-T5 + S09-T6**. Wire tool into toolbar; `selection-highlight.ts`. |
| D5 | **S09-T8 paired session (4 h)** — end-to-end test (draw wall → reload → restored). | Same paired session — render-side wiring + canvas mounting + tear-down. |
| D6 | **S09-T9**. Bench `orbit-fps` re-run with 100 walls — target > 55 fps p95. | Implement bridge from `BufferGeometryDescriptor` → `THREE.BufferGeometry` (pooled, reused across walls). |
| D7 | **S09-T10**. If 100-wall fps fails, profile + tune (likely `MaterialPool` reuse or scene-committer batching). | **S09-T11**. Playwright `integration.test.ts` — 10 walls in 30 s + reload + visual-diff. |
| D8 | **S09-T12 (A side)**. `docs/architecture/parity-fixtures.md` updates. | **S09-T12 (B side)**. `plugins/wall/README.md` — canonical plugin recipe. |

#### D9 — Sprint demo + retro

- Joint demo: open `?pryzm2=1` → click wall tool → draw 10 walls → undo 5 → reload → see 5 walls; orbit at > 55 fps.
- Bench dashboard: `load-small` < 800 ms; `orbit-fps` (100 walls) > 55 fps p95; `produce-wall` < 50 ms p95.
- **Non-regression check**: open default URL → PRYZM 1 still draws walls + persists across reload.
- Retro: were any handler ↔ committer surprises uncovered? Any tool UX gaps (the Straight-only mode is an intentional 1B MVP — confirm S10 picks up Arc/Polyline)?

#### S09 blocker analysis

| Potential blocker | How it manifests | Pre-mitigation |
|---|---|---|
| `MaterialPool` doesn't dedupe across 100 walls (each gets its own `MeshStandardMaterial`) | 100-wall orbit-fps fails (< 55 p95) due to draw-call count | The `MaterialPool.acquire(materialHash)` API was finalised in 1A S05; `materialHash` for a wall is a function of `(systemTypeId, color)` (computed in committer). 100 walls of the same system-type should share 1 material. The S09-T10 tune confirms by reading `materialPool.getStats()` mid-test (exposes ref counts per hash). |
| Cold-load > 800 ms because the persistence layer reads the entire event log even for 1 wall | `load-small` bench fails; D4 tune fails to find a shortcut | Persistence-client (1A S04) supports snapshot-from-events: cold-load reads the latest **snapshot** + only events newer than the snapshot. For 1-wall fixture there is exactly 1 snapshot + 0 events. If the snapshot path is missing, `code-level ADR docs/architecture/adr/0014-persistence-snapshot-threshold.md` (S09 D4 if needed) ratifies the snapshot threshold (every N events). |
| `plugins/wall/committer.ts` recreates `THREE.BufferGeometry` from scratch on every wall update (even a colour change) | `cmd-execute-latency` p99 spikes on `SetWallColor` | Committer separates **geometry-affecting** dirty fields (`baseLine`, `height`, `thickness`, `layers`, `openings`) from **material-only** fields (`color`, `opacity`, `materialColor`). The dirty-diff tells the committer which path to take. `SetWallColor` updates the material via `MaterialPool` with no geometry rebuild. |
| The `colorWrite: false / depthWrite: false` proxy mesh pattern (`WallFragmentBuilder.ts:586–598`) for hidden-but-pickable walls is forgotten in the new committer | Wall hiding (later sprint) breaks selection because the wall is invisible AND unpickable | S09-T2 explicitly includes the proxy-mesh path; the dirty-diff includes a `visible: boolean` field and the committer creates the proxy when `visible === false`. Documented in `plugins/wall/README.md`. |
| Playwright `integration.test.ts` is flaky because the bench harness measures FPS in a headless browser | CI flakes on D7 | Playwright runs with `--use-gl=swiftshader` in CI for software-rendered determinism; the test asserts `frameCount >= 30` over 1 second wall-clock instead of `fps > 55` directly. The 55-fps gate is asserted only by `apps/bench/orbit-fps.ts` (Vitest, repeatable). |
| The Straight-only tool feels too thin for a sprint demo | Demo at D9 looks weak | The demo emphasises the *infrastructure*: 100-wall orbit at 55+ fps; reload restores walls byte-for-byte; OTel trace from tool → handler → patch → store → committer → mesh. The Arc/Polyline modes land S10 D2 (4 days later). |
| `plugins/wall/tool.ts` strict-injection (mirrors `WallTool.ts:144`) breaks the toolbar wiring because the toolbar instantiates tools before `commandBus` is ready | Tool throws on construction; `?pryzm2=1` boot fails | Toolbar uses lazy tool instantiation: tools are constructed on first selection, after bootstrap is fully ready. `apps/editor/src/toolbar/ToolRegistry.ts` (1A S06) already supports this. Documented in `apps/editor/src/toolbar/README.md`. |

#### S09 exit criteria

- [ ] Playwright draws 10 walls in 30 s; verifies count + reload persistence + visual-diff < 5 px vs PRYZM 1 reference.
- [ ] `apps/bench/load-small.ts` < 800 ms first interactive (1-wall fixture).
- [ ] `apps/bench/orbit-fps.ts` (100 walls) > 55 fps p95.
- [ ] Reload persists wall state correctly (event-log replay → store rebuilt → committer → mesh restored).
- [ ] Only `plugins/wall/committer.ts` imports THREE within the wall plugin (lint enforced — `pryzm-no-three-outside-committer` real-enforce).
- [ ] `MaterialPool` deduplicates materials across 100 walls of same system type to 1 material instance.
- [ ] `plugins/wall/selection-highlight.ts` exists and renders outline on selection.
- [ ] `plugins/wall/README.md` published as the canonical plugin recipe worked example.
- [ ] PRYZM 1 still ships unchanged.

#### S09 typed contracts introduced

```ts
// packages/scene-committer/types.ts — 1A S05 frozen
export interface PrimitiveCommitter<TStore extends Store<any>> {
  readonly storeId: StoreId;
  attach(store: TStore, scene: THREE.Scene, ctx: CommitterContext): Unsubscribe;
}

export interface CommitterContext {
  readonly materialPool: MaterialPool;          // 1A S05 — content-addressed
  readonly geometryPool: GeometryPool;          // pooled BufferGeometry reuse
  readonly otel: OTelTracer;
  readonly featureFlags: Readonly<Record<string, boolean>>;
}

// plugins/wall/committer.ts — S09-T2 (THE only file in plugins/wall/** allowed to import THREE)
import * as THREE from 'three';
import { produceWall } from '@pryzm/geometry-kernel/producers/wall';

interface WallSceneEntry {
  mesh: THREE.Mesh;
  proxyMesh?: THREE.Mesh;          // colorWrite:false depthWrite:false for hidden-but-pickable
  materialHandles: MaterialHandle[];
  descriptorHash: string;          // skip rebuild when hash unchanged
}

export const wallCommitter: PrimitiveCommitter<WallStore> = {
  storeId: 'wall',
  attach(store, scene, ctx) {
    const wallRoots = new Map<WallId, WallSceneEntry>();   // mirrors WallFragmentBuilder.ts:43
    return store.subscribeDirty((diff) => {
      // GEOMETRY-AFFECTING vs MATERIAL-ONLY split — see S09 blocker analysis row 3
      for (const wall of diff.added) addWall(wall, wallRoots, scene, ctx);
      for (const { id, patches } of diff.updated) {
        const entry = wallRoots.get(id)!;
        if (patchesAffectGeometry(patches)) rebuildGeometry(entry, store.get(id)!, ctx);
        if (patchesAffectMaterial(patches)) rebindMaterial(entry, store.get(id)!, ctx);
        if (patchesAffectVisibility(patches)) toggleProxy(entry, store.get(id)!, ctx);
      }
      for (const id of diff.removed) disposeWall(id, wallRoots, scene, ctx);
    });
  },
};

const GEOMETRY_FIELDS = new Set(['baseLine','height','thickness','layers','openings']);
const MATERIAL_FIELDS = new Set(['color','opacity','materialColor']);
function patchesAffectGeometry(p: readonly Patch[]): boolean { return p.some(x => GEOMETRY_FIELDS.has(x.path[0])); }
function patchesAffectMaterial(p: readonly Patch[]): boolean { return p.some(x => MATERIAL_FIELDS.has(x.path[0])); }

// plugins/wall/tool.ts — S09-T3 (~280 LOC; Straight mode only in S09)
export class WallCreationTool implements Tool {
  // strict-injection — mirrors WallTool.ts:144 verbatim. NO `(window as any)` fallback.
  constructor(
    private readonly commandBus: CommandBus,
    private readonly intent: WallIntentResolver,
    private readonly snap: SnapEngine,
    private readonly raycaster: RaycasterFacade,   // THREE-side; only this and committer hold THREE
  ) {}
  // state machine: IDLE -> AWAITING_END -> COMMITTED | CANCELLED
  onPointerDown(ev: PointerEvent): void { /* dispatches CreateWall on second click */ }
  onPointerMove(ev: PointerEvent): void { /* updates snap preview overlay */ }
  onKeyDown(ev: KeyboardEvent): void { /* Tab = snap-cycle; Esc = cancel */ }
}

// plugins/wall/selection-highlight.ts — S09-T6 (~80 LOC committer extension)
export const wallSelectionHighlight: PrimitiveCommitter<SelectionStore> = {
  storeId: 'selection',
  attach(selectionStore, scene, ctx) {
    return selectionStore.subscribeDirty((diff) => {
      for (const sel of diff.added)   if (sel.kind === 'wall') addOutline(sel.id, scene, ctx);
      for (const id of diff.removed)  removeOutline(id, scene);
    });
  },
};
```

#### S09 key pseudocode — committer cold-load + 100-wall hot-path

The S09 cold-load gate (`load-small.ts < 800 ms`) and hot-path gate (`orbit-fps 100 walls > 55 p95`) decompose into the per-stage budget below. Each row is measured by an OTel span; total cold-load is asserted as a sum.

| Cold-load stage | Budget (ms) | OTel span | Implementation |
|---|---|---|---|
| Parse `?pryzm2=1` URL + bootstrap module load | 80 | `pryzm.bootstrap.parse` | tree-shaken bundle (1A bundle gate) |
| Persistence-loader IO (snapshot + 0 events for 1-wall fixture) | 120 | `pryzm.persistence.coldLoad` | snapshot-from-events (S09 D4 ratifies threshold via `code-level ADR docs/architecture/adr/0014-persistence-snapshot-threshold.md` if needed) |
| Plugin registration (parallel) | 60 | `pryzm.plugin.register` (per plugin) | `Promise.all(plugins.map(p => p.register(...)))` (S12 D8 mitigation, brought forward) |
| Store hydration (1 wall, level-first ordering) | 40 | `pryzm.store.hydrate` (per store) | level → wall topological order |
| First commit (producer + mesh build + scene add) | 250 | `pryzm.committer.commit` + `pryzm.kernel.produce.wall` | producer < 50 ms; THREE.BufferGeometry + Mesh + MaterialPool acquire < 200 ms |
| First frame paint | 250 | `pryzm.frame.firstPaint` | r163 single-pass; no OBC |
| **Total** | **800** | (sum-asserted in `load-small.ts`) | gate hard-fails > 1000 ms (K1B-3 trigger) |

#### S09 test catalog (Vitest + Playwright, 18 tests planned)

| Test file | Tests | Owner |
|---|---|---|
| `plugins/wall/__tests__/committer.test.ts` | `added wall builds Mesh`, `updated baseLine rebuilds geometry`, `updated color does NOT rebuild geometry (calls MaterialPool only)`, `removed wall disposes Mesh + material handles`, `visible:false creates proxy mesh with colorWrite=false depthWrite=false`, `descriptor.hash unchanged → skip rebuild` | B |
| `plugins/wall/__tests__/tool.test.ts` | `IDLE → AWAITING_END on first click`, `AWAITING_END → COMMITTED dispatches CreateWall on second click`, `Esc returns to IDLE`, `Tab cycles snap candidates`, `strict-injection throws on missing commandBus (mirrors WallTool.ts:144)` | B |
| `plugins/wall/__tests__/selection-highlight.test.ts` | `outline added on selection`, `outline removed on deselect` | B |
| `plugins/wall/__tests__/playwright/integration.spec.ts` | `draws 10 walls in 30s`, `count persisted across reload`, `visual-diff < 5px vs PRYZM 1 reference (10-wall scene)` | B |
| `apps/bench/load-small.bench.ts` | `cold-load 1-wall fixture < 800 ms (sum of 6 stage spans)`, `hard-fail > 1000 ms` | A |
| `apps/bench/orbit-fps.bench.ts` | `100-wall orbit > 55 fps p95`, `MaterialPool dedupes 100 walls of same systemType to 1 material` (validated via `materialPool.getStats()`) | A |

#### S09 OTel spans introduced

| Span name | Parent | Key attributes | Sampling |
|---|---|---|---|
| `pryzm.committer.commit` | `pryzm.frame.scheduler.tick` | `committer.id`, `diff.added`, `diff.updated`, `diff.removed`, `commit.duration_ms`, `meshes.created`, `meshes.disposed`, `geometry.rebuilt`, `material.rebound` | always |
| `pryzm.bootstrap.parse` | (root) | `bundle.bytes`, `parse.duration_ms`, `feature.pryzm2` | once per cold-load |
| `pryzm.persistence.coldLoad` | `pryzm.bootstrap` | `snapshot.bytes`, `events.replayed`, `coldLoad.duration_ms` | once per cold-load |
| `pryzm.plugin.register` | `pryzm.bootstrap` | `plugin.id`, `plugin.handlers.count`, `register.duration_ms` | once per plugin per cold-load |
| `pryzm.store.hydrate` | `pryzm.bootstrap` | `store.id`, `entities.count`, `hydrate.duration_ms` | once per store per cold-load |
| `pryzm.frame.firstPaint` | `pryzm.frame.scheduler.tick` (first) | `paint.duration_ms`, `triangles.uploaded`, `gpu.memory_mb` | once per cold-load |
| `pryzm.materialPool.acquire` | `pryzm.committer.commit` | `material.key`, `material.refcount`, `pool.hit` (bool) | 1/100 in prod; always in DEV |

#### S09 daily artifact log

| Day | Files added | Files modified | Tests passing |
|---|---|---|---|
| D2 | `tests/fixtures/small-project.pryzm-stub.json`, `plugins/wall/committer.ts` (skeleton) | (none) | committer compiles |
| D3 | `apps/bench/load-small.bench.ts`, `plugins/wall/tool.ts` (Straight only), `plugins/wall/scene/build-mesh.ts` | `bootstrap.render.ts` registers committer | `+committer.test (5/6)` |
| D4 | `apps/editor/src/toolbar/wall-icon.svg`, `plugins/wall/selection-highlight.ts` | `ToolRegistry.ts` lazy-instantiation | `+selection-highlight (2/2)` |
| D5 | (joint paired session — end-to-end test, no individual files) | (none) | full e2e green |
| D6 | `apps/bench/orbit-fps.bench.ts` (re-run with 100 walls), `plugins/wall/scene/geometry-bridge.ts` (descriptor → BufferGeometry) | (none) | orbit-fps 52 fps p95 (under target) |
| D7 | `plugins/wall/__tests__/playwright/integration.spec.ts` | committer batches per-tick, MaterialPool reuse fix | orbit-fps 58 p95 ✓; Playwright green |
| D8 | `plugins/wall/README.md`, `docs/architecture/parity-fixtures.md` (updates) | (none) | all gates green |

---

### S10 — Wall remaining ops + intent resolution + 30-case parity (Weeks 19–20, M5)

**Joint goal**: 9 more wall handlers (`TransformWall { mirror | scale | offset | move | reference-edit }`, `JoinWall`, `CutWall`, `SetWallSystemType`, `SetWallLayers`, `BulkSetWallVisuals`, `CreateWallOpening`, `CreateWallBetweenMarks`, `CreateWallsFromSlab`, `ChangeWallLevel`); `plugins/wall/intent.ts` matches PRYZM 1 behaviour on the parity test set; **wall is "done" for Phase 1**; Roof producer port begins in parallel for S11.

#### Existing-code touchpoints

| What we read in `src/` | Why |
|---|---|
| `src/elements/walls/WallIntentResolver.ts` (213 LOC), `PathResolver.ts` (94 LOC), `WallSnapCycler.ts` (196 LOC) | **A mirrors** into `plugins/wall/intent.ts` (~250 LOC target). Logic mostly portable; THREE inputs become DTO inputs. `code-level ADR docs/architecture/adr/0013-intent-resolver.md` ratifies the intent resolver shape (snap-target priority + tie-breaking). |
| `src/elements/walls/WallOccupancyStore.ts` (221 LOC) | **A mirrors** into `plugins/wall/occupancy.ts` (S10 D5). Pure state. |
| `src/commands/walls/CascadeWallBaselineCommand.ts` (223 LOC) | **A lifts** the cascade pattern to `packages/command-bus/cascade.ts` (S10 D6). The wall handler declares `cascade: { affects: ['wall.baseline'] }` instead of implementing cascade itself. `code-level ADR docs/architecture/adr/0012-cross-element-cascade-rule-registration.md` ratifies the cross-element cascade-rule registration shape. |
| `src/commands/walls/UpdateWallLayersCommand.ts` (169), `UpdateWallSystemTypeCommand.ts` (72), `SetAllWallsWidthCommand.ts` (118), `SetAllWallsVisualPropertiesCommand.ts` (88), `CreateWallOpeningCommand.ts` (267), `CreateWallBetweenMarksCommand.ts` (152), `CreateWallsFromSlabCommand.ts` (167), `ChangeWallLevelCommand.ts` (102) | **A ports** as 9 of the remaining 9 handlers. Most are direct copies with `crypto.randomUUID()` → `ulid()`, `(window as any)` removed, OTel spans + `affectedStores` declarations added per `code-level ADR docs/architecture/adr/0002-command-handler-signature.md`. |
| Sibling commands `MirrorWallCommand`, `ScaleWallCommand`, `OffsetWallCommand`, `JoinWallsCommand`, `CutWallCommand`, `ReferenceEditWallCommand` (`src/commands/`, `src/tools/operations/ReferenceEditTool.ts`) | **A merges** the 5 transform commands into a single `TransformWall { kind, params }` handler per `code-level ADR docs/architecture/adr/0008-wall-handler-triage.md`. ~250 LOC consolidated handler. |
| `src/elements/roofs/RoofGeometryBuilder.generate()` and adjacent files | **B reads** to begin Roof producer port (S10 D2 onward, lands fully in S11). PRYZM 1's Roof generator is already 80% pure (close to functional). |
| `src/elements/walls/WallTool.ts` Arc + Polyline branches | **B reads** to extend `plugins/wall/tool.ts` with Arc + Polyline sub-modes (S10 D6). |

#### Sub-phases

- **S10-T1 — `TransformWall` consolidated handler (D2, Agent A)**: merges Mirror + Scale + Offset + Move + ReferenceEdit (5 PRYZM 1 commands → 1 PRYZM 2 handler with discriminated `kind` field). ~250 LOC. Unit tests cover all 5 kinds. The `Move` kind supersedes the S07-T5 `MoveWall` handler (which is renamed to `TransformWall { kind: 'move' }` for naming consistency).
- **S10-T2 — `SetWallLayers`, `BulkSetWallVisuals`, `CreateWallBetweenMarks`, `MirrorWall (kind), ScaleWall (kind)` integration into TransformWall (D2, Agent A)**: the bulk visuals handler merges `SetAllWallsWidthCommand.ts:118` + `SetAllWallsVisualPropertiesCommand.ts:88` into one (2→1 collapse). ~200 LOC total.
- **S10-T3 — `SetWallSystemType`, `CreateWallsFromSlab`, `OffsetWall (kind)`, `JoinWall` (D3, Agent A)**: 4 handlers. `SetWallSystemType` re-resolves layers from `system-type-store.ts` and writes resolved layers into the store (per S08 producer-input contract).
- **S10-T4 — `CreateWallOpening`, `ChangeWallLevel`, `CutWall`, `ReferenceEditWall (kind)` (D4, Agent A)**: 4 handlers. `CreateWallOpening` cross-handler — declares `affectedStores: ['wall']` for opening-host updates. `ChangeWallLevel` mirrors `ChangeWallLevelCommand.ts:102`.
- **S10-T5 — Mid-sprint sync (D5, joint, 1 h)**: paired session — validate that handler patches against `WallStore` with neighbouring walls (for joining) work cleanly. Confirm Roof producer signature matches Wall (so committer pattern transfers cleanly). F arbitrates any ambiguity.
- **S10-T6 — `plugins/wall/intent.ts` + cascade rule registration (D6, Agent A)**: handles user intent (which wall to join to, miter direction, snap candidates). ~250 LOC mirroring `WallIntentResolver.ts:213` + `PathResolver.ts:94` + `WallSnapCycler.ts:196`. Cascade rule registration via `commandBus.registerCascade('wall.baseline', (wallId) => [...affectedNeighbours])`. `code-level ADR docs/architecture/adr/0012-cross-element-cascade-rule-registration.md` + `code-level ADR docs/architecture/adr/0013-intent-resolver.md` finalised.
- **S10-T7 — Roof producer port (D2–D7, Agent B)**: begins port `RoofGeometryBuilder.generate()` (PRYZM 1) → `packages/geometry-kernel/producers/roof.ts`. Captures 20 PRYZM 1 roof geometry references for `tests/parity/roof/`. Roof producer parity tests: 20 cases vs PRYZM 1 references. Roof producer perf bench — target < 50 ms p95 for simple roof. Sets up S11 D7–D8 Roof committer + tool work for B.
- **S10-T8 — `plugins/wall/tool.ts` Arc + Polyline sub-modes (D6, Agent B)**: extends Straight mode (S09 D3) with Arc (3-point) + Polyline (multi-segment). Mirrors PRYZM 1 `WallTool.ts` arc + polyline branches.
- **S10-T9 — Real-project parity fixture extraction (D7, Agent A)**: extract 30-case parity fixture `tests/parity/wall/` covering all wall variants from real PRYZM 1 user files. Combines the 30 synthetic configs from S08 with edge cases discovered in real projects (curved walls hosting doors, T-junctions on layered walls, etc). The script reads `.pryzm` files from a fixture set and replays each wall through both producers.
- **S10-T10 — Final wall handler audit + CI green (D8, Agent A)**: all 14 wall handlers final: declare `affectedStores`, OTel spans, parity tests pass. Lint passes. CI green.
- **S10-T11 — Roof producer parity + bench (D8, Agent B)**: Roof parity 20 cases pass; bench < 50 ms p95.
- **S10-T12 — Docs (D8, joint)**: A updates `docs/architecture/element-recipe.md` with intent-resolver pattern + cascade-rule registration. B updates same doc with Roof porting notes.

#### D1 — Kickoff (30 min)

- A walks through intent resolution model — F locks `plugins/wall/intent.ts` shape (`code-level ADR docs/architecture/adr/0013-intent-resolver.md`).
- A presents `TransformWall` consolidation (5→1) — F confirms `code-level ADR docs/architecture/adr/0008-wall-handler-triage.md` amendment is acceptable.
- B confirms Roof producer port can begin in parallel (B starts S11-prep work here).

#### D2–D8 parallel work

| Day | Agent A (Track A — remaining wall handlers + intent + parity) | Agent B (Track B — Roof producer port + Arc/Polyline tool modes) |
|---|---|---|
| D2 | **S10-T1 + S10-T2**. `TransformWall`, `SetWallLayers`, `BulkSetWallVisuals`, `CreateWallBetweenMarks`. | **S10-T7 (start)**. Roof producer port: bootstrap `producers/roof.ts`. |
| D3 | **S10-T3**. `SetWallSystemType`, `CreateWallsFromSlab`, `OffsetWall (kind)`, `JoinWall`. | **S10-T7 (cont)**. Port the intent-resolver-equivalent pieces from PRYZM 1's Roof code. |
| D4 | **S10-T4**. `CreateWallOpening`, `ChangeWallLevel`, `CutWall`, `ReferenceEditWall (kind)`. | **S10-T7 (cont)**. Capture 20 PRYZM 1 roof geometry references for `tests/parity/roof/`. |
| D5 | **S10-T5 paired session (1 h)**. Validate join-cascade patches; confirm Roof producer signature matches Wall. | Same paired session. |
| D6 | **S10-T6**. `plugins/wall/intent.ts` + cascade-rule registration; `code-level ADR docs/architecture/adr/0012-cross-element-cascade-rule-registration.md` + `code-level ADR docs/architecture/adr/0013-intent-resolver.md` finalised. | **S10-T8 + S10-T7**. `plugins/wall/tool.ts` Arc + Polyline modes; Roof producer parity tests (20 cases). |
| D7 | **S10-T9**. Real-project parity fixture extraction (30 cases). | **S10-T11**. Roof producer perf bench — target < 50 ms p95. |
| D8 | **S10-T10**. All 14 wall handlers final; CI green. | **S10-T11 (final) + S10-T12 (B side)**. Roof bench finalised; docs updated. |

#### D9 — Sprint demo + retro

- A demos: all 14 wall handlers in dev tools; intent-resolver picking the right wall to join (T-junction demo); 30-case parity test green; cascade rule fires on `MoveWall` to update neighbour miters.
- B demos: roof producer in browser + Node — same byte output; 20-case roof parity green; Arc-mode wall draw working in tool.
- **Non-regression check**: PRYZM 1 still draws walls + roofs.
- **K1-C check**: does multiplier velocity feel right? S11 is the validation sprint (3 elements in 7 days = 2.3 days each).
- Retro: did the `TransformWall` 5→1 consolidation pay off, or did it create a complex handler that's hard to test? Any cascade-rule edge cases?

#### S10 blocker analysis

| Potential blocker | How it manifests | Pre-mitigation |
|---|---|---|
| `TransformWall` consolidated handler has 5 code paths inside a single `switch (kind)`; testing matrix is 5× | S10-T1 over-budget on tests | Each `kind` is a thin call to a private helper (`transformMove`, `transformMirror`, …); the helpers are tested independently; the dispatch `switch` has 1 test per kind. Total test count is the same as 5 separate handlers; LOC + handler-registry weight is 1/5. |
| Cascade rule fires recursively (Move wall A → cascade to wall B → cascade back to wall A → infinite loop) | S10-T6 cascade-rule registration causes runtime stack overflow on first 2-wall T-junction | Cascade infra (`packages/command-bus/cascade.ts`) tracks visited node-IDs in a `Set<Id>` per dispatch; second visit to the same id is dropped silently with an OTel attribute `cascade.cycle.dropped`. Documented in `code-level ADR docs/architecture/adr/0012-cross-element-cascade-rule-registration.md`. |
| `WallIntentResolver.ts` reads `THREE.Raycaster` for snap detection (line ~50) — the new resolver can't | The new `intent.ts` cannot replicate snap detection without a raycaster | Snap detection in PRYZM 2 is **DTO-only** for the intent resolver (snap-to-grid, snap-to-endpoint, snap-to-midpoint — all 2D-coord arithmetic). Snap-to-mesh raycasting (3D-pick a face) is a **scenic-side** operation that lives in `plugins/wall/tool.ts` (THREE-side); the tool calls into the intent resolver with the candidate snap points already 3D-picked. `code-level ADR docs/architecture/adr/0013-intent-resolver.md` documents this split. |
| Real-project fixture extraction (S10-T9) discovers wall configs the synthetic 30 cases didn't cover | 5 of 30 parity tests fail unexpectedly | Mitigation: real-project extraction is *additive* — 30 synthetic + N real = (30+N) cases. The exit criterion is "all parity tests green"; if N tests fail, A fixes producer math (typically more miter cases). Budget is the rest of D7 + D8. |
| Roof producer port discovers PRYZM 1 Roof generator is **less pure** than expected — it reads `RoofStore` mid-generation | S10-T7 stalls at D3 | Mitigation: extract a `RoofData` DTO at the call boundary (the Roof producer takes DTO-in, returns descriptor-out, exactly like wall). The `Store` reads inside PRYZM 1's generator are **stateless lookups** — the resolved DTO is precomputed at handler time (mirrors the wall pattern from S08). |
| `BulkSetWallVisuals` handler — applying width to 1000 walls in one transaction blows past the per-tick batching window | Bulk operation feels laggy; cmd-execute-latency p95 spikes to 30 ms | The dirty-diff is one event with 1000 entries in `updated[]`; the committer batches all 1000 into one tick (per S05 design). The handler runs in < 5 ms even for 1000 walls because patches are computed in immer's structural-share mode. Validated by a 1000-wall fixture in S10 D7 bench. |

#### S10 exit criteria

- [ ] All 14 wall handlers declare `affectedStores`; OTel spans cover all.
- [ ] 30-case `tests/parity/wall/` test suite green.
- [ ] `plugins/wall/intent.ts` correctly resolves all parity cases.
- [ ] `plugins/wall/occupancy.ts` exists.
- [ ] Cascade rule registration via `packages/command-bus/cascade.ts` works for join chains; cycle detection documented in `code-level ADR docs/architecture/adr/0012-cross-element-cascade-rule-registration.md`.
- [ ] `plugins/wall/tool.ts` supports Straight, Arc, Polyline modes.
- [ ] Roof pure producer ready (committer + tool land in S11).
- [ ] `code-level ADR docs/architecture/adr/0012-cross-element-cascade-rule-registration.md` (cascade) + `code-level ADR docs/architecture/adr/0013-intent-resolver.md` (intent) merged.
- [ ] Wall is "done" for Phase 1 — no more work on it until Phase 2 (annotations, plan-view rendering).
- [ ] PRYZM 1 still ships unchanged.

#### S10 typed contracts introduced

```ts
// plugins/wall/handlers/TransformWall.ts — S10-T1 (5→1 consolidation per `code-level ADR docs/architecture/adr/0008-wall-handler-triage.md` amendment)
export interface TransformWallCommand extends Command {
  readonly type: 'wall.transform';
  readonly payload:
    | { kind: 'move';          wallId: WallId; deltaXY: Point2D }
    | { kind: 'mirror';        wallId: WallId; axis: { origin: Point3D; direction: Vec3 } }
    | { kind: 'scale';         wallId: WallId; pivot: Point3D; factor: number }
    | { kind: 'offset';        wallId: WallId; distance: number; side: 'left' | 'right' }
    | { kind: 'referenceEdit'; wallId: WallId; newBaseLine: readonly [Point3D, Point3D] };
}

export const transformWallHandler: Handler<TransformWallCommand> = {
  type: 'wall.transform',
  affectedStores: ['wall'] as const,
  async execute(cmd, ctx) {
    const wall = ctx.wallStore.get(cmd.payload.wallId);
    if (!wall) throw new WallNotFoundError(cmd.payload.wallId);
    const next = match(cmd.payload)
      .with({ kind: 'move' },          (p) => transformMove(wall, p.deltaXY))
      .with({ kind: 'mirror' },        (p) => transformMirror(wall, p.axis))
      .with({ kind: 'scale' },         (p) => transformScale(wall, p.pivot, p.factor))
      .with({ kind: 'offset' },        (p) => transformOffset(wall, p.distance, p.side))
      .with({ kind: 'referenceEdit' }, (p) => transformReferenceEdit(wall, p.newBaseLine))
      .exhaustive();
    return diffToResult(wall, next, ctx);
  },
};

// packages/command-bus/cascade.ts — S10-T6 (lifts CascadeWallBaselineCommand.ts:223; `code-level ADR docs/architecture/adr/0012-cross-element-cascade-rule-registration.md`)
export interface CascadeRule<TKey extends string = string> {
  readonly key: TKey;                        // e.g. 'wall.baseline', 'slab.outline'
  resolveAffected(rootEntityId: EntityId, ctx: CascadeContext): readonly EntityId[];
}

export class CascadeRunner {
  private readonly rules = new Map<string, CascadeRule>();
  register(rule: CascadeRule): void;
  // CYCLE-DROP: tracks Set<EntityId> per dispatch; second visit emits OTel `cascade.cycle.dropped` and returns.
  async dispatch(rootCmd: Command, ctx: CascadeContext): Promise<readonly Command[]> { /* DAG walk */ }
}

// plugins/wall/intent.ts — S10-T6 (~250 LOC; `code-level ADR docs/architecture/adr/0013-intent-resolver.md`)
export interface WallIntentResolver {
  // DTO-only inputs — no THREE.Raycaster (those live in plugins/wall/tool.ts THREE-side)
  resolveJoinTarget(   draftWall: WallDraft, neighbours: readonly WallData[]): WallId | null;
  resolveSnapCandidates(draftEnd: Point3D, gridSpec: GridSpec | null, neighbours: readonly WallData[]): readonly SnapCandidate[];
  resolveOpeningPosition(wallId: WallId, projectedPoint: Point2D, ctx: IntentContext): OpeningAnchor;
  cycleSnap(current: SnapCandidate, all: readonly SnapCandidate[]): SnapCandidate; // Tab-key cycling
}

// Tie-breaking priority (`code-level ADR docs/architecture/adr/0013-intent-resolver.md` fixed order):
//   1) endpoint of selected wall (priority 100)
//   2) endpoint of any wall (priority 90)
//   3) midpoint of selected wall (80)
//   4) intersection point with grid (70)
//   5) midpoint of any wall (60)
//   6) grid vertex (50)
//   7) grid edge projection (40)
//   8) raw cursor (0)
```

#### S10 key pseudocode — cascade-rule DAG walk + cycle drop

The cascade infra (S10 D6, `code-level ADR docs/architecture/adr/0012-cross-element-cascade-rule-registration.md`) lifts the inline cascade logic from `CascadeWallBaselineCommand.ts:223` to a generic L4 service. Critically, the DAG walk must terminate even on pathological topologies (cycle of 100 walls all join-cascade-coupled). The implementation uses Kahn-style traversal with a visited-set, emitting OTel attribute `cascade.cycle.dropped` on second-visit.

```ts
// packages/command-bus/cascade.ts — DAG walk pseudocode (~120 LOC)
async dispatch(rootCmd: Command, ctx: CascadeContext): Promise<readonly Command[]> {
  const visited = new Set<EntityId>();
  const queue: Array<{ cmd: Command; depth: number }> = [{ cmd: rootCmd, depth: 0 }];
  const results: Command[] = [];
  const span = ctx.otel.startSpan('pryzm.cascade.dispatch');
  span.setAttribute('cascade.root.cmd.type', rootCmd.type);

  while (queue.length > 0) {
    const { cmd, depth } = queue.shift()!;
    if (depth > MAX_CASCADE_DEPTH) {                       // 16 — empirical, see S10 blocker R2
      span.setAttribute('cascade.depth.exceeded', true);
      throw new CascadeDepthExceededError(MAX_CASCADE_DEPTH);
    }
    const entityId = cmd.payload.id ?? cmd.payload.wallId;  // discriminated by type
    if (visited.has(entityId)) {
      span.addEvent('cascade.cycle.dropped', { 'entity.id': entityId, 'depth': depth });
      continue;                                             // CYCLE DROP — silent, observable
    }
    visited.add(entityId);
    results.push(cmd);

    const ruleKey = inferRuleKey(cmd);                      // e.g. 'wall.baseline' for wall.move
    const rule = this.rules.get(ruleKey);
    if (!rule) continue;
    const affected = rule.resolveAffected(entityId, ctx);
    for (const affectedId of affected) {
      queue.push({ cmd: synthesizeRecomputeCmd(affectedId, cmd), depth: depth + 1 });
    }
  }
  span.setAttribute('cascade.commands.total', results.length);
  span.setAttribute('cascade.entities.visited', visited.size);
  span.end();
  return results;
}
```

#### S10 test catalog (Vitest + Playwright, 38 tests planned)

| Test file | Tests | Owner |
|---|---|---|
| `plugins/wall/__tests__/handlers/TransformWall.test.ts` | one per kind: `move`, `mirror`, `scale`, `offset`, `referenceEdit`; plus `unknown kind exhaustiveness check (TS-only)` | A |
| `plugins/wall/__tests__/handlers/{SetWallSystemType,SetWallLayers,BulkSetWallVisuals,CreateWallOpening,CreateWallBetweenMarks,CreateWallsFromSlab,JoinWall,CutWall,ChangeWallLevel}.test.ts` | one canonical happy-path + one error case each (~18 tests total) | A |
| `plugins/wall/__tests__/intent.test.ts` | `resolveJoinTarget picks endpoint over midpoint`, `tie-breaking priority order matches `code-level ADR docs/architecture/adr/0013-intent-resolver.md` table`, `cycleSnap cycles deterministically`, `resolveOpeningPosition handles curved wall correctly` | A |
| `packages/command-bus/__tests__/cascade.test.ts` | `single-step cascade fires`, `2-wall T-junction recomputes both miters`, `cycle of 3 walls drops second visit (OTel attribute set)`, `MAX_CASCADE_DEPTH (16) throws CascadeDepthExceededError`, `cascade for unrelated cmd is no-op` | A |
| `tests/parity/wall/wall-snapshot.test.ts` (extended) | 30 fixtures + N real-project fixtures (S10-T9) — all green | A |
| `packages/geometry-kernel/__tests__/produceRoof.test.ts` | 20 roof parity cases (S10-T7); `produceRoof.bench` p95 < 50 ms | B |
| `plugins/wall/__tests__/tool-arc.spec.ts` | `Arc mode 3-point creation`, `Arc preview during 2nd-point hover` | B |
| `plugins/wall/__tests__/tool-polyline.spec.ts` | `Polyline multi-segment commit on Enter`, `Polyline cancel on Esc` | B |

#### S10 OTel spans introduced

| Span name | Parent | Key attributes | Sampling |
|---|---|---|---|
| `pryzm.cascade.dispatch` | `pryzm.command.execute` | `cascade.root.cmd.type`, `cascade.commands.total`, `cascade.entities.visited`, `cascade.depth.max`, `cascade.cycle.dropped` (count via events) | always |
| `pryzm.intent.resolveJoinTarget` | `pryzm.tool.dispatch` | `intent.candidates.count`, `intent.winner.priority`, `intent.duration_ms` | 1/100 in prod; always in DEV |
| `pryzm.intent.resolveSnapCandidates` | `pryzm.tool.dispatch` | `snap.grid.active`, `snap.candidates.count`, `snap.duration_ms` | 1/100 in prod; always in DEV |
| `pryzm.kernel.produce.roof` | `pryzm.committer.commit` (S11) or bench | `roof.id`, `roof.kind`, `roof.faces.count`, `producer.duration_ms`, `descriptor.bytes` | always (handler-driven) |

#### S10 daily artifact log

| Day | Files added | Files modified | Tests passing |
|---|---|---|---|
| D2 | `plugins/wall/handlers/{TransformWall,SetWallLayers,BulkSetWallVisuals,CreateWallBetweenMarks}.ts`, `packages/geometry-kernel/producers/roof.ts` (skeleton) | (none) | `+TransformWall (5/5), +Bulk (2/2)` |
| D3 | `plugins/wall/handlers/{SetWallSystemType,CreateWallsFromSlab,JoinWall}.ts` (Offset folded into TransformWall) | (none) | `+SetWallSystemType +JoinWall +CreateWallsFromSlab` |
| D4 | `plugins/wall/handlers/{CreateWallOpening,ChangeWallLevel,CutWall}.ts`; 20 roof parity captures | (none) | `+remaining wall handlers` |
| D5 | (joint paired session) | (none) | (no merge) |
| D6 | `plugins/wall/intent.ts`, `packages/command-bus/cascade.ts`, `plugins/wall/tool.ts` Arc + Polyline branches, `producers/roof.ts` (parity-capable) | bootstrap registers cascade rules | `+intent (4/4), +cascade (5/5)` |
| D7 | `tests/parity/wall/configs/real-project-{1..N}.json`, `apps/bench/produce-roof.bench.ts` | (none) | parity (30+N)/(30+N) ✓; roof bench p95=46ms |
| D8 | `docs/architecture/element-recipe.md` updates | CI gates | all green |

---

### S11 — Roof + Door + Window end-to-end (Weeks 21–22, M6)

**Joint goal**: 3 more element families end-to-end. **K1-C pivot check**: if any single element takes more than 4 days of two-agent time, halt and refactor producer pattern.

#### Existing-code touchpoints

| What we read in `src/` | Why |
|---|---|
| `src/elements/doors/{DoorStore,DoorTool,DoorFragmentBuilder}.ts` and `src/commands/doors/*` | A + B port the door family. The door is **simpler than wall** (no miter, no curved base) — should fit in 3 days. |
| `src/elements/windows/{WindowStore,WindowTool,WindowFragmentBuilder}.ts` and `src/commands/windows/*` | A + B port the window family. Mostly mirrors door pattern. |
| `src/elements/roofs/RoofGeometryBuilder.ts` and adjacent files | B continues the S10 D2 port; plus implements roof committer + tool. |
| `plugins/wall/store.ts`, `plugins/wall/handlers/CreateWall.ts`, `plugins/wall/committer.ts`, `plugins/wall/tool.ts`, `plugins/wall/intent.ts` (1B work-in-progress) | **The canonical reference.** Door/Window/Roof copy the wall recipe verbatim, swapping element-specific math + DTO. `docs/architecture/element-recipe.md` (S07 + S10) is the spec. |

#### Sub-phases (element-paired ownership)

For each element, the headless half belongs to A and the scenic half belongs to B; they sync at the producer/committer interface daily. **Each element gets a 3-day budget; if any blows past 4 days, K1-C trips.**

> **Type-catalog gate (`[strategic ADR-017]`)**: by S11 close, `packages/types-builtin/{door,window,roof}/` MUST contain at least the v1 starter types per SPEC-05 §7.3 (8 doors, 8 windows, 4 roofs). The type-completeness lint (`tools/lint-type-completeness.ts`) is PR-blocking from this sprint.

- **S11-T1 — Door (D2–D4)**:
  - Day 2 (A): `plugins/door/store.ts` + 6 handlers (`CreateDoor`, `DeleteDoor`, `MoveDoor`, `SetDoorType`, `SetDoorSwing`, `SetDoorWidth`). Door's `affectedStores: ['door', 'wall']` — `wall` because doors mutate `wall.openings[]`.
  - Day 2 (B): `plugins/door/committer.ts` + `tool.ts` skeleton.
  - Day 3 (A): Door pure producer in `producers/door.ts`. 15 parity cases vs PRYZM 1.
  - Day 3 (B): Door committer + tool fully functional — can place doors on walls (intent: which wall hosts the door — uses the new `plugins/door/intent.ts`).
  - Day 4 (A): Parity fixture green. Door bench < 50 ms p95.
  - Day 4 (B): Door Playwright integration test. **Door done.**
- **S11-T2 — Window (D5–D6)**:
  - Day 5 (A): `plugins/window/store.ts` + 5 handlers (`CreateWindow`, `DeleteWindow`, `MoveWindow`, `SetWindowType`, `SetWindowSize`). **Mid-sprint sync (1 h)** with B.
  - Day 5 (B): `plugins/window/committer.ts` + `tool.ts` — copies door pattern.
  - Day 6 (A): Window pure producer + 12 parity cases.
  - Day 6 (B): Window committer + tool fully functional + Playwright. **Window done.**
- **S11-T3 — Roof (D7–D8)**:
  - Day 7 (A): Roof handlers complete — 10 handlers (`CreateRoof`, `DeleteRoof`, `SetRoofSlope`, `SetRoofKind { hip | gable | mansard }`, `AddSkylight`, `RemoveSkylight`, `MoveRoof`, `SetRoofThickness`, `JoinRoofs`, `ChangeRoofLevel`). Uses S10 producer.
  - Day 7 (B): `plugins/roof/committer.ts` + `tool.ts` — uses S10 roof producer.
  - Day 8 (A): Roof parity fixture (20 cases, ported from S10).
  - Day 8 (B): Roof Playwright + bench (50-roof orbit-fps > 55). **Roof done.**

#### D1 — Kickoff (30 min)

- F sets the K1-C clock: each element gets 3 days budget; if any blows past 4 days, halt entry to S12.
- Decision: parallelise across A and B such that each element can finish in 3 calendar days.

#### D9 — Sprint demo + retro

- Joint demo: open `?pryzm2=1` → place 5 walls → place 3 doors + 3 windows on walls → place 2 roof segments → orbit; all elements visible, undo/redo work, persistence works.
- Bench dashboard: orbit-fps with 100 of each > 55 fps p95.
- **K1-C decision**: did any element overrun? If yes, halt entry to S12 and refactor in S12 buffer.
- Retro.

#### S11 blocker analysis

| Potential blocker | How it manifests | Pre-mitigation |
|---|---|---|
| Door requires 4 days, not 3 (K1-C trips) | Door D4 finishes too late; window/roof slip | Mitigation: door is the simplest element after wall. If door needs 4 days, the *wall recipe* is wrong; halt 1B at S11 D4 and refactor `docs/architecture/element-recipe.md`. The S12 buffer absorbs this. |
| Door's `affectedStores: ['door', 'wall']` cross-store mutation breaks the wall handler's expectation that only wall handlers touch wall state | Wall integration test fails on door placement | The lint rule `pryzm-affected-stores-required` (1A S02) makes the cross-store dependency *explicit*. The wall plugin documents that `wall.openings[]` is read-only from the wall's perspective; door + window handlers mutate it via declared cross-store affinity. `code-level ADR docs/architecture/adr/0008-wall-handler-triage.md` documents this. |
| Window producer parity diverges due to mullion math (windows in PRYZM 1 have an internal grid) | Window parity 12 cases — 4 fail on mullion configurations | Window producer in PRYZM 2 ports `WindowGeometryBuilder.computeMullions()` verbatim (the math is pure, just THREE-typed in PRYZM 1). Mitigation budget: D6. |
| Roof producer (ported in S10 D2–D7) has bugs that surface only under integration | S11 D7 Roof committer reveals producer bugs from S10 | S10 D7 bench was producer-only; S11 D7 is the first time the producer runs through a real scene. Expected; budget for D8 to fix. |
| Cross-element interaction (door-on-curved-wall) fails because intent resolver doesn't know about curved walls | Door placed on a curved wall sits at the wrong position | The wall intent resolver (S10) handles curved walls. Door intent resolver delegates to `plugins/wall/intent.ts.resolveOpeningPosition(wallId, screenPoint)` — single source of truth. |
| The 3 elements ship but the **multiplier feels wrong** — A and B are working long days | K1-C is technically met but the team is burning out | F observes daily; if the 3-day budget requires evenings, K1-C is *de facto* failed even if technically met. Halt + buffer in S12. The kill-switch language is "**> 4 calendar days OR > 8 person-hours per day**". |

#### S11 exit criteria

- [ ] 3 element families parity-tested (Door, Window, Roof) — `tests/parity/{door,window,roof}/` green.
- [ ] Each element took ≤ 3 days of paired A+B time. (K1-C met.)
- [ ] Orbit-fps with 100 of each > 55 fps p95.
- [ ] Only `plugins/<elem>/committer.ts` files contain THREE in their plugin.
- [ ] Cross-element interactions work: door on wall, window on wall, door on curved wall.
- [ ] Documentation `docs/architecture/element-recipe.md` updated with door + window + roof case studies.
- [ ] PRYZM 1 still ships unchanged.

#### S11 typed contracts introduced

```ts
// plugins/door/handlers/CreateDoor.ts — cross-store handler (`code-level ADR docs/architecture/adr/0008-wall-handler-triage.md` cross-affinity)
export interface CreateDoorCommand extends Command {
  readonly type: 'door.create';
  readonly payload: {
    readonly hostWallId: WallId;
    readonly anchor: { readonly t: number /* 0..1 along wall length */; readonly bottom: number };
    readonly width: number;
    readonly height: number;
    readonly doorTypeId: DoorTypeId;
    readonly swing: 'left-in' | 'left-out' | 'right-in' | 'right-out';
  };
}

export const createDoorHandler: Handler<CreateDoorCommand> = {
  type: 'door.create',
  affectedStores: ['door', 'wall'] as const,            // declares cross-store mutation per `code-level ADR docs/architecture/adr/0008-wall-handler-triage.md`
  async execute(cmd, ctx) {
    const wall = ctx.wallStore.get(cmd.payload.hostWallId);
    if (!wall) throw new HostWallNotFoundError(cmd.payload.hostWallId);
    const id = ulid() as DoorId;
    const door: DoorData = { id, ...cmd.payload, createdAt: ctx.now() };
    const opening: WallOpening = { kind: 'door', openingId: id, anchor: cmd.payload.anchor,
      width: cmd.payload.width, height: cmd.payload.height };
    return {
      patches: {
        door: [{ op: 'add', path: [id], value: door }],
        wall: [{ op: 'add', path: [cmd.payload.hostWallId, 'openings', '-'], value: opening }],
      },
      events: [
        { type: 'door.created', doorId: id, hostWallId: cmd.payload.hostWallId },
        { type: 'wall.openingAdded', wallId: cmd.payload.hostWallId, openingId: id, kind: 'door' },
      ],
    };
  },
};

// packages/geometry-kernel/producers/door.ts — DTO-in, descriptor-out (mirrors wall pattern)
export const produceDoor: (dto: DoorData, hostWall: WallData) => BufferGeometryDescriptor;

// packages/geometry-kernel/producers/window.ts — same shape
export const produceWindow: (dto: WindowData, hostWall: WallData) => BufferGeometryDescriptor;

// packages/geometry-kernel/producers/roof.ts — finalised in S10; consumed here
export const produceRoof: (dto: RoofData, levelGeometry: LevelGeometryHints) => BufferGeometryDescriptor;
```

#### S11 key pseudocode — door-on-wall intent delegation (`code-level ADR docs/architecture/adr/0013-intent-resolver.md` single source of truth)

```ts
// plugins/door/intent.ts — single source of truth: wall intent resolver does the heavy lift
export const doorIntent: DoorIntentResolver = {
  resolveHost(screenPoint: Point2D, ctx) {
    // delegates to wall intent — door cannot resolve curved-wall positioning by itself
    const candidate = ctx.wallIntent.resolveOpeningPosition(
      ctx.hoveredWallId, screenPoint, ctx,
    );
    return candidate; // { wallId, t, anchorPoint }
  },
};
```

#### S11 test catalog (Vitest + Playwright, 30 tests planned)

| Test file | Tests | Owner |
|---|---|---|
| `plugins/door/__tests__/handlers/{CreateDoor,DeleteDoor,MoveDoor,SetDoorType,SetDoorSwing,SetDoorWidth}.test.ts` | one happy + one error per handler (12 tests) | A |
| `plugins/window/__tests__/handlers/{CreateWindow,DeleteWindow,MoveWindow,SetWindowType,SetWindowSize}.test.ts` | 10 tests | A |
| `plugins/roof/__tests__/handlers/*.test.ts` | 10 handlers — happy paths only (parity catches errors) | A |
| `tests/parity/door/door-snapshot.test.ts` | 15 fixtures × byte-equality | A |
| `tests/parity/window/window-snapshot.test.ts` | 12 fixtures × byte-equality | A |
| `tests/parity/roof/roof-snapshot.test.ts` | 20 fixtures × byte-equality | A |
| `plugins/door/__tests__/playwright/integration.spec.ts` | `place 3 doors on wall in 30s`, `door-on-curved-wall positions correctly` | B |
| `plugins/window/__tests__/playwright/integration.spec.ts` | `place 3 windows`, `window-on-curved-wall positions correctly` | B |
| `plugins/roof/__tests__/playwright/integration.spec.ts` | `place 2 roof segments + orbit > 55 fps p95 with 50 roofs` | B |
| `apps/bench/produce-{door,window,roof}.bench.ts` | each p95 < 50 ms | A/B |

#### S11 OTel spans introduced

| Span name | Parent | Key attributes |
|---|---|---|
| `pryzm.kernel.produce.door` / `.window` / `.roof` | `pryzm.committer.commit` | `<elem>.id`, `producer.duration_ms`, `descriptor.bytes` |
| `pryzm.committer.commit` (existing, extended) | `pryzm.frame.scheduler.tick` | new attribute `committer.id` ∈ {`door`, `window`, `roof`} |
| `pryzm.intent.delegate` | `pryzm.tool.dispatch` | `intent.from` (`'door'`), `intent.to` (`'wall'`), `intent.duration_ms` |

#### S11 daily artifact log (compressed — element-paired ownership)

| Day | Track A (headless) | Track B (scenic) | Done? |
|---|---|---|---|
| D2 | `plugins/door/{store,handlers}.ts` (6 handlers) | `plugins/door/{committer,tool}.ts` skeleton | — |
| D3 | `producers/door.ts` + 15 parity captures | door committer + tool functional | — |
| D4 | door parity green; door bench < 50 ms | door Playwright green | **Door done** |
| D5 | `plugins/window/{store,handlers}.ts` (5 handlers) | `plugins/window/{committer,tool}.ts` | — |
| D6 | `producers/window.ts` + 12 parity | window functional + Playwright | **Window done** |
| D7 | `plugins/roof/{store,handlers}.ts` (10 handlers, uses S10 producer) | `plugins/roof/{committer,tool}.ts` | — |
| D8 | roof parity green (20 cases) | roof Playwright + bench (50-roof orbit > 55 p95) | **Roof done** |

---

### S12 — Slab + Curtain Wall + Grid + Column + Beam (Weeks 23–24, M6)

**Joint goal**: 5 more element families. By end of S12, the **9 core structural primitives** are end-to-end. Small fixture (1 wall + 1 slab + 1 door) opens in `?pryzm2=1` in **< 800 ms cold**. **Sub-phase 1B closes.**

#### Existing-code touchpoints

| What we read in `src/` | Why |
|---|---|
| `src/elements/slabs/SlabFragmentBuilder.ts` (~800 LOC), `SlabStore.ts`, `SlabTool.ts`, `src/commands/slabs/*` | Slab is the next-most-complex after Wall (openings, level membership, dependency on walls). 1 day producer, 1 day committer + tool + parity. |
| `src/elements/curtainwalls/CurtainWallBuilder.ts` and adjacent (the most complex element family in PRYZM 1) | Curtain Wall has 3 sub-producers: panels + mullions + transoms. `code-level ADR docs/architecture/adr/0011-curtain-wall-triage-and-producer-split.md` (S12 D5) ratifies the split. 3 days paired. |
| `src/elements/grids/*`, `src/elements/columns/*`, `src/elements/beams/*` | Simpler structural elements; each fits in 1 day per element. A does Grid + Beam, B does Column. |
| `plugins/wall/`, `plugins/door/`, `plugins/window/`, `plugins/roof/` (1B work product) | Reference recipes. Slab/Grid/Column/Beam = wall recipe verbatim. CW = wall recipe + producer split. |

#### Sub-phases

- **S12-T1 — Slab (D2–D3, paired)**:
  - Day 2 (A): Slab store + 8 handlers (Create, Delete, Move, SetType, AddOpening, RemoveOpening, SetSlope, SetThickness). Slab's `affectedStores: ['slab', 'level']`; cross-handler with wall via `plugins/cross/slab-wall.ts` (lifted from `SlabWallCoupling.ts:133`).
  - Day 2 (B): Slab committer + tool skeleton.
  - Day 3 (A): Slab pure producer + 18 parity cases.
  - Day 3 (B): Slab committer + tool functional + Playwright. **Slab done.** `code-level ADR docs/architecture/adr/0010-slab-handler-triage.md` (Slab handler triage) merged.
- **S12-T2 — Grid + Column + Beam (D3–D5, split)**:
  - Day 3 (A): Grid store + 4 handlers + producer (simple linear grid).
  - Day 3 (B): Column store + 5 handlers + committer.
  - Day 4 (A): Grid Playwright + Beam store + 5 handlers + producer.
  - Day 4 (B): Column producer + Playwright. **Grid + Column done.**
  - Day 5 (A): Beam committer + tool.
  - Day 5 (B): Beam Playwright. **Beam done. Grid/Column/Beam complete.**
- **S12-T3 — Curtain Wall (D5–D7, paired)**:
  - Day 5 (A+B paired): Curtain Wall store + 9 handlers (port from PRYZM 1's complex CW commands). `code-level ADR docs/architecture/adr/0011-curtain-wall-triage-and-producer-split.md` ratified.
  - Day 6 (A+B paired): Curtain Wall pure producer split — panels + mullions + transoms (3 sub-producers, one orchestrator).
  - Day 7 (A+B paired): Curtain Wall committer + tool + 25-case parity fixture. **Curtain Wall done.**
- **S12-T4 — Cross-element integration + bench (D8)**:
  - A + B: cross-element integration tests. Small fixture (1 wall + 1 slab + 1 door + 1 grid) opens in `?pryzm2=1` in < 800 ms cold; Playwright validates.
  - `apps/bench/load-medium.ts` skeleton landed (full medium fixture lands in S19).
  - `MaterialPool.deduplicateAcrossElementTypes()` cross-family material reuse validated in mixed scene.

#### D1 — Kickoff (30 min)

- F walks through Curtain Wall complexity (most complex of the 5) — A and B agree to pair on it D5–D7.
- Decision: Slab D2–D3 (paired); Grid + Column + Beam D3–D5 (split — A does Grid + Beam, B does Column); Curtain Wall D5–D7 (paired); integration D8.

#### D9 — **Sub-phase 1B demo recording** (joint, 8-min screencast)

- Open `?pryzm2=1` → fresh project.
- Place a 5×5 grid; add columns at intersections; add beams across columns.
- Add walls between columns (snap to grid); add doors + windows.
- Add a slab as floor; add curtain wall on one façade.
- Add a roof.
- Orbit, zoom, pan — 60 fps.
- Undo all the way back; redo.
- Reload — full project restored.
- Show CI dashboard: 9 elements parity-tested, all benches green.
- Show OTel trace from a single wall edit through every layer (handler → patch → store → committer → frame).
- **Non-regression segment**: open default URL → PRYZM 1 still serves unchanged; an existing PRYZM 1 project file opens correctly (no schema drift).

#### D10 — Sub-phase 1B retro (1 h, F + A + B)

- K1-C verification: Door, Window, Roof, Slab, Grid, Column, Beam, Curtain Wall — did pattern multiply cleanly?
- Backlog any rough edges into the **1B → 1C handoff list** (see §6).

#### S12 blocker analysis

| Potential blocker | How it manifests | Pre-mitigation |
|---|---|---|
| Curtain Wall producer split (panels + mullions + transoms) discovers a 4th sub-component (gaskets, brackets, …) PRYZM 1 already models | S12 D6 stalls because the 3-way split is wrong | `code-level ADR docs/architecture/adr/0011-curtain-wall-triage-and-producer-split.md` (D5) explicitly enumerates all sub-components from PRYZM 1 (`CurtainWallBuilder.ts` audit on D1). If a 4th lands, `code-level ADR docs/architecture/adr/0011-curtain-wall-triage-and-producer-split.md` is amended D5. The split is data-driven. |
| Slab cross-element coupling with wall (`SlabWallCoupling.ts:133`) is more complex than 1 day allows | S12-T1 slips; cross-handler tests fail | The `plugins/cross/slab-wall.ts` cascade rule is *additive* — slab move triggers wall recompute via the cascade infra (S10 D6). The actual coupling math (which walls are dependent on which slabs) lives in `WallOccupancyStore.ts:221` (already mirrored to `plugins/wall/occupancy.ts` in S10). |
| Grid producer is trivial but the snap-to-grid integration with `plugins/wall/tool.ts` is forgotten | Walls don't snap to grid in S12 D9 demo | S12-T2 D3 includes the snap-to-grid wiring: `plugins/wall/intent.ts` queries `gridStore.getActiveGrid()` for snap candidates. Documented in `code-level ADR docs/architecture/adr/0013-intent-resolver.md` (S10). |
| Column + Beam are too similar; A and B duplicate effort | LOC waste; maintenance burden | Mitigation: factor `LinearStructuralProducer` in `producers/_shared/linear-structural.ts` — column and beam differ only in orientation (vertical vs horizontal) and section (rectangular vs I-beam). One shared producer with two thin wrappers. |
| `MaterialPool.deduplicateAcrossElementTypes()` doesn't handle cross-family material hashes (e.g., a curtain wall mullion + a column both being the same metal) | Cross-element scene creates duplicate materials; orbit fps drops | The material hash is content-addressed (`hash({ kind: 'metallic', color, roughness, metalness })`), independent of which element kind generated the request. Validated in S12-T4 mixed-scene bench. |
| Small fixture cold-load > 800 ms because the bootstrap registers 9 plugins serially | `load-small` bench fails at end of S12 | Plugin registration is parallelised in `apps/editor/src/bootstrap.data.ts` — `Promise.all(plugins.map(p => p.register(...)))`. The wall plugin loads first because the small fixture has a wall; other plugins are dynamic-imported. Bundle code-split by plugin (1A S06 bundle gate stays green). |
| K1B-3 trips: cold-load > 1 s — halt entry to 1C | Sub-phase 1B closes with a red gate | Mitigation: S12 D8 is dedicated to cold-load tuning. If the gate is red on D9 demo, the D10 retro decides: (a) ship 1B with a 900 ms gate temporarily and tune in 1C S13; OR (b) hold 1B closure and burn the buffer week. F decides. |

#### S12 exit criteria (= sub-phase 1B exit)

- [ ] 9 element families parity-tested vs PRYZM 1: Wall, Slab, Door, Window, Roof, Curtain Wall, Grid, Column, Beam.
- [ ] Small fixture (1 wall + 1 slab + 1 door) opens in `?pryzm2=1` in **< 800 ms cold** (CI gate).
- [ ] PRYZM 1 still ships unchanged at default URL; `src/elements/walls/**` + `src/commands/walls/**` byte-for-byte unchanged from `main` (CI snapshot diff).
- [ ] **Wall pattern proven to multiply** (K1-C met across 8 elements: Door, Window, Roof, Slab, Grid, Column, Beam, Curtain Wall).
- [ ] All committers — only files in their respective plugins importing THREE.
- [ ] All producers — zero THREE imports (lint enforced).
- [ ] Cross-element integration test (mixed scene of all 9 elements) green.
- [ ] `MaterialPool` cross-element dedup validated.
- [ ] `code-level ADR docs/architecture/adr/0010-slab-handler-triage.md` (Slab triage), `code-level ADR docs/architecture/adr/0011-curtain-wall-triage-and-producer-split.md` (Curtain Wall triage + producer split) merged.
- [ ] All Playwright integration suites green for all 9 plugins.
- [ ] All bench gates green: `load-small` < 800 ms; `orbit-fps` (100 walls) > 55 p95; `produce-{wall,slab,door,window,roof,curtain-wall}` < 50 ms p95.
- [ ] Layer composition implemented for slab/floor types per SPEC-05 §3 (`layers[]`, `isCore`, `wraps`).
- [ ] Material library (`packages/material-library/`) reachable from all layer-bearing types per SPEC-05 §4.

#### S12 typed contracts introduced

```ts
// plugins/slab/handlers/CreateSlab.ts
export interface CreateSlabCommand extends Command {
  readonly type: 'slab.create';
  readonly payload: {
    readonly levelId: LevelId;
    readonly outline: readonly Point2D[];   // closed polygon, CCW
    readonly thickness: number;
    readonly slabTypeId: SlabTypeId;
  };
}
// affectedStores: ['slab', 'level'] — declares level membership

// plugins/curtain-wall/handlers/CreateCurtainWall.ts — most complex CW handler
export interface CreateCurtainWallCommand extends Command {
  readonly type: 'curtain-wall.create';
  readonly payload: {
    readonly hostWallId: WallId | null;     // null = freestanding CW
    readonly outline: readonly Point3D[];
    readonly grid: { readonly horizontals: readonly number[]; readonly verticals: readonly number[] };
    readonly mullionTypeId: MullionTypeId;
    readonly transomTypeId: TransomTypeId;
    readonly panelTypeId: PanelTypeId;
  };
}
// affectedStores: ['curtain-wall', 'wall'] when hostWallId !== null

// packages/geometry-kernel/producers/curtain-wall.ts — `code-level ADR docs/architecture/adr/0011-curtain-wall-triage-and-producer-split.md` producer split
export const produceCurtainWall: (dto: CurtainWallData, ctx: CWContext) => BufferGeometryDescriptor =
  (dto, ctx) => {
    // SUB-PRODUCER ORCHESTRATOR per `code-level ADR docs/architecture/adr/0011-curtain-wall-triage-and-producer-split.md`
    const panels    = produceCWPanels(dto, ctx);
    const mullions  = produceCWMullions(dto, ctx);
    const transoms  = produceCWTransoms(dto, ctx);
    const gaskets   = ctx.featureFlags['cw.gaskets'] ? produceCWGaskets(dto, ctx) : null;
    return mergeDescriptors([panels, mullions, transoms, gaskets].filter(notNull));
  };

// plugins/cross/slab-wall.ts — S12-T1 (lifts SlabWallCoupling.ts:133)
export const slabWallCascadeRule: CascadeRule<'slab.outline'> = {
  key: 'slab.outline',
  resolveAffected(slabId, ctx) {
    // returns walls dependent on this slab via plugins/wall/occupancy.ts
    return ctx.wallOccupancy.dependentsOfSlab(slabId);
  },
};

// packages/geometry-kernel/producers/_shared/linear-structural.ts — column + beam shared producer
export interface LinearStructuralData {
  readonly axis: readonly [Point3D, Point3D];
  readonly section: SectionProfile;          // rectangular | I-beam | circular
  readonly orientation: Vec3;
}
export const produceLinearStructural: (dto: LinearStructuralData) => BufferGeometryDescriptor;
// column.ts and beam.ts are 30-LOC wrappers that build LinearStructuralData from their DTO
```

#### S12 key pseudocode — CW producer split (`code-level ADR docs/architecture/adr/0011-curtain-wall-triage-and-producer-split.md`)

The Curtain Wall producer is the most complex of the 9 elements. Splitting it into 3 sub-producers (panels, mullions, transoms) plus an optional 4th (gaskets, behind a feature flag) keeps each sub-producer testable in isolation. The orchestrator merges the descriptors via `mergeDescriptors()` which preserves group boundaries (each sub-producer becomes one or more `groups[]` entries with distinct `materialIndex`), allowing the committer to render panels with glass material, mullions with metal, transoms with metal, gaskets with rubber — all from a single `BufferGeometry` with multiple groups.

```ts
// packages/geometry-kernel/producers/_internal/cw-mullions.ts
export function produceCWMullions(dto: CurtainWallData, ctx: CWContext): BufferGeometryDescriptor {
  const verts: number[] = []; const idx: number[] = []; let baseIndex = 0;
  for (const xLine of dto.grid.verticals) {
    const profile = ctx.mullionProfileLib.get(dto.mullionTypeId);  // pure lookup, pre-resolved at handler time
    const extruded = extrudeProfileAlongLine(profile, /* line at x = xLine */);
    pushDescriptor(verts, idx, extruded, baseIndex);
    baseIndex += extruded.vertexCount;
  }
  // similarly for horizontals (same code path) — but stop short of vertical mullions to avoid double-extruding crossings
  return { position: new Float32Array(verts), /* ... */ groups: [{ start: 0, count: idx.length, materialIndex: 0 }],
    materialKeys: [{ kind: 'metallic', color: ctx.mullionColor, roughness: 0.4, metalness: 0.85 }], hash: hashCWMullions(dto) };
}
```

#### S12 test catalog (Vitest + Playwright, 60+ tests planned)

| Test file | Tests | Owner |
|---|---|---|
| `plugins/slab/__tests__/handlers/*.test.ts` | 8 handlers × 1 happy-path = 8 tests | A |
| `plugins/curtain-wall/__tests__/handlers/*.test.ts` | 9 handlers × 1 happy = 9 tests | A+B paired |
| `plugins/{grid,column,beam}/__tests__/handlers/*.test.ts` | 4+5+5 = 14 tests | A/B |
| `tests/parity/slab/slab-snapshot.test.ts` | 18 fixtures | A |
| `tests/parity/curtain-wall/cw-snapshot.test.ts` | 25 fixtures | A+B |
| `tests/parity/{grid,column,beam}/*-snapshot.test.ts` | 8+6+6 = 20 fixtures | A/B |
| `tests/integration/mixed-scene.spec.ts` | `9-element scene loads in ?pryzm2=1`, `MaterialPool dedupes across CW mullion + column (same metal)`, `cold-load < 800 ms` | A+B |
| `apps/bench/produce-{slab,curtain-wall,grid,column,beam}.bench.ts` | each p95 < 50 ms (CW p95 < 80 ms acceptable per `code-level ADR docs/architecture/adr/0011-curtain-wall-triage-and-producer-split.md`) | A/B |
| `apps/bench/load-small.bench.ts` (extended) | 1-wall+1-slab+1-door fixture < 800 ms | A |

#### S12 OTel spans introduced

| Span name | Parent | Key attributes |
|---|---|---|
| `pryzm.kernel.produce.slab` / `.curtain-wall` / `.grid` / `.column` / `.beam` | `pryzm.committer.commit` | `<elem>.id`, `producer.duration_ms`, `descriptor.bytes`, `cw.sub-producers.count?` |
| `pryzm.committer.commit` (extended) | `pryzm.frame.scheduler.tick` | new attribute `committer.id` ∈ {`slab`, `curtain-wall`, `grid`, `column`, `beam`} |
| `pryzm.materialPool.acquire` (extended) | `pryzm.committer.commit` | new attribute `material.cross_family_dedup_hit` (bool) |
| `pryzm.cascade.dispatch` (extended) | `pryzm.command.execute` | new attribute `cascade.rule.key` ∈ {`slab.outline`, `wall.baseline`, ...} |

#### S12 daily artifact log (compressed)

| Day | Track A | Track B | Done? |
|---|---|---|---|
| D2 | `plugins/slab/{store,handlers}.ts` (8 handlers) + `plugins/cross/slab-wall.ts` | `plugins/slab/{committer,tool}.ts` skeleton | — |
| D3 | `producers/slab.ts` + 18 parity; `plugins/grid/{store,handlers,producer}.ts` | slab functional + Playwright; `plugins/column/{store,handlers}.ts` | **Slab done; Grid started** |
| D4 | grid Playwright; `plugins/beam/{store,handlers,producer}.ts` | column producer + Playwright | **Grid + Column done** |
| D5 | beam committer + tool + CW handlers (paired with B) | beam Playwright + CW handlers (paired with A) | **Beam done; CW started** |
| D6 | CW producer split (panels + mullions + transoms) — paired | CW committer (multi-material grouped mesh) — paired | — |
| D7 | CW Playwright + 25 parity captures | CW Playwright + bench | **Curtain Wall done** |
| D8 | mixed-scene integration test; cold-load tuning | bundle code-split per plugin; `MaterialPool.deduplicateAcrossElementTypes()` | sub-phase **1B closes** |

---

## §4 Cross-cutting deliverables for 1B

These exist alongside the sprint flow and must be true at sub-phase end.

### §4.1 ADRs to merge by M6

| ID | Subject | Owner | Sprint | Cites PRYZM-1 evidence at |
|---|---|---|---|---|
| `code-level ADR docs/architecture/adr/0008-wall-handler-triage.md` | Wall handler triage (22 → 14) | A | S07 | `src/commands/walls/*` (16 files) + sibling wall-touching commands; `CreateWallCommand.ts:51` (`affectedStores`); `DeleteElementCommand.ts:783` (lift to L4) |
| `code-level ADR docs/architecture/adr/0009-wall-producer-signature.md` | Producer pure-function signature `(dto, joinData, worldY) => BufferGeometryDescriptor` | A | S08 | `WallFragmentBuilder.ts:142` and `:425` (the aspirational "pure function" comments); `WallFragmentBuilder.ts:505` (DTO migration comment) |
| `code-level ADR docs/architecture/adr/0010-slab-handler-triage.md` | Slab handler triage | A | S12 | `src/commands/slabs/*` |
| `code-level ADR docs/architecture/adr/0011-curtain-wall-triage-and-producer-split.md` | Curtain Wall handler triage + producer split (panels / mullions / transoms / gaskets) | F (paired A+B) | S12 | `src/elements/curtainwalls/CurtainWallBuilder.ts` audit |
| `code-level ADR docs/architecture/adr/0012-cross-element-cascade-rule-registration.md` | Cross-element cascade-rule registration (lifts `CascadeWallBaselineCommand.ts:223` to L4) | A | S10 | `CascadeWallBaselineCommand.ts:223`; `SlabWallCoupling.ts:133`; `SlabDependencyTracker.ts` |
| `code-level ADR docs/architecture/adr/0013-intent-resolver.md` | Intent resolver shape: snap-target priority + tie-breaking; DTO-only resolver vs THREE-side raycaster split | A | S10 | `WallIntentResolver.ts:213`; `PathResolver.ts:94`; `WallSnapCycler.ts:196` |

### §4.2 CI gates added in 1B

| Gate | Hard-fail threshold | First active sprint | Mode in `src/` |
|---|---|---|---|
| `pryzm-no-three-in-kernel` (real enforcement, was scaffold in 1A S03) | any THREE in `packages/geometry-kernel/**` | S07 | n/a (no kernel in `src/`) |
| Wall snapshot parity (Node + browser byte-equality) | any snapshot diff | S08 | n/a |
| Door / Window / Roof / Slab / CW / Grid / Column / Beam parity | any snapshot diff | S11 / S12 | n/a |
| `apps/bench/load-small.ts` cold-load | > 1 s (gate); target < 800 ms | S09 | — |
| `apps/bench/orbit-fps.ts` (100 walls; 100 of each in S12) | < 50 fps p95 | S09 / S12 | — |
| `apps/bench/produce-wall.ts` p95 | > 60 ms (gate); target < 50 ms | S08 | — |
| `apps/bench/produce-{door,window,roof,slab,curtain-wall}.ts` p95 | > 60 ms | S11 / S12 | — |
| Cross-element mixed-scene Playwright | any failure | S12 | — |
| Snapshot-diff: `src/elements/walls/**` + `src/commands/walls/**` unchanged from `main` | any change | S07 | (this *is* the `src/` mode) |
| `pryzm-affected-stores-required` lint (1A S02 — extended to all 1B plugins) | any handler missing `affectedStores` | S07 | n/a |

### §4.3 Documentation produced

- `docs/architecture/element-recipe.md` (S07 v1; updated S09, S10, S11, S12) — the canonical plugin recipe; `plugins/wall/` is the worked example.
- `docs/architecture/parity-fixtures.md` (S08; updated S09) — how to capture parity fixtures (used for next 11 elements).
- `plugins/<element>/README.md` for all 9 elements.
- `tests/parity/<element>/README.md` for all 9 fixture sets.
- 6 new sprint-scoped code-level ADRs (per §0 mapping table): `0008-wall-handler-triage`, `0009-wall-producer-signature`, `0010-slab-handler-triage`, `0011-curtain-wall-triage-and-producer-split`, `0012-cross-element-cascade-rule-registration`, `0013-intent-resolver`.

---

## §5 Risk & contingency (1B-specific, expanded)

> **Capacity envelope (`[strategic ADR-018]`).** Phase 1B accepts the 9-element Q2 scope. If sprint capacity is exhausted, the cut-list defined in `03_PRYZM3/reference/adrs/ADR-018-capacity-cut-list.md` is the ratified order: (1) Curtain Wall S12 D5–D7 paired session may defer non-essential CW features (bracket geometry, custom gasket profiles) to Phase 2; (2) Trace, fromSlab UI mode, and underlay-aligned wall sub-modes are already deferred to 1C; (3) further cuts follow `[strategic ADR-018]` ranking — never improvise scope reductions.

| ID | Risk | Likelihood | Impact | Mitigation | Trigger sprint |
|---|---|---|---|---|---|
| R1B-01 | Wall pattern doesn't multiply (K1-C fires) | Medium | High | S11 is the multiplier-validation sprint. Halt if any element > 4 days. Buffer in S12. | S11 |
| R1B-02 | Producer parity diverges due to floating-point or sign-handling differences | Medium | High | Snapshots use byte-equality on plain typed arrays; intent resolver tested against real-project fixtures (S10 D7). Binary-diff utility `apps/dev/buffer-diff.ts` bisects to first byte. | S08, S10 |
| R1B-03 | Curtain Wall is too complex to fit in S12 | Medium | Medium | 3-day paired session D5–D7; if blown, defer non-essential CW features (e.g., bracket geometry, custom gasket profiles) to Phase 2 | S12 |
| R1B-04 | Small-fixture cold-load > 800 ms | Medium | High | S09 D4 budget for profile-and-tune; persistence-loader bottleneck targeted. Snapshot-from-events path validated S09. K1B-3 trips at S12 D9 if > 1 s. | S09, S12 |
| R1B-05 | `MaterialPool` doesn't dedupe across element types | Medium | Medium | S09 100-wall test catches single-family case; cross-element test in S12 D8 catches CW vs Wall material reuse | S09, S12 |
| R1B-06 | Selection-highlight committer pattern doesn't transfer to other elements | Low | Medium | Land it in `plugins/wall/` first; refactor to shared utility `packages/scene-committer/utilities/selection-highlight.ts` in S16 | S09, S16 |
| R1B-07 | Intent resolver missing edge cases (wall-to-wall joins, door-on-curve-wall, slab-on-curve-wall) | High | Medium | Real PRYZM 1 fixture extraction in S10 D7 captures most edge cases. Cross-element-pair fixtures captured S11 D5 + S12 D8. | S10–S12 |
| R1B-08 | Two agents collide on shared `geometry-kernel` types | Low | Low | Type ownership: A owns producer types (`BufferGeometryDescriptor`, `JoinData`), B owns committer types (`CommitterContext`, `MaterialPoolHandle`); joint session decides shared types at S07 D5. | S08 D5 |
| R1B-09 (NEW) | The `WallStore.ts` 3-channel fan-out (lines 1124–1190 doc block) is mistakenly carried over into `plugins/wall/store.ts`, re-introducing PRYZM 1's coupling | Medium | High | §1.2 of this doc explicitly forbids; F enforces in code review of S07-T2. Lint rule `pryzm-store-single-channel` (S07 D2 add) errors on multiple subscribe-callsites in a `Store<T>` extension. | S07 |
| R1B-10 (NEW) | `CreateWallCommand.ts:234`'s `_neighbourSnapshot` heavyweight pattern carries over | Medium | Medium | `code-level ADR docs/architecture/adr/0008-wall-handler-triage.md` explicitly drops the neighbour-snapshot. Cascade infra (S10 D6) handles join-cascade undo via dependency-cascade lift from `CascadeWallBaselineCommand.ts:223`. | S07 |
| R1B-11 (NEW) | `WallTool.ts`'s 8 sub-modes are all attempted in S09 (overscoping) | Medium | Medium | S09 ships **Straight only**. Arc + Polyline land S10. Trace, fromSlab UI mode, underlay-aligned deferred to 1C. Documented in S09 sub-phase task list. | S09 |
| R1B-12 (NEW) | `three-bvh-csg` cannot be ported THREE-free in 1 day; openings producer slips | Medium | Medium | Fallback to `manifold-3d` (WASM, already THREE-free). Both pre-vetted S07 D8. F decides at S08 D5. | S08 |
| R1B-13 (NEW) | The miter math at `WallFragmentBuilder.ts:700–900` has hidden side-effects (cache writes to `this.miterNormalsCache`) that block the lift | High | Medium | Comment at line 425 ("the builder is now a pure function of its inputs") suggests the cache is stale or unused. S08 D2 audit confirms cache is for memoisation only — lift discards the cache and uses producer-level memoisation instead. | S08 |
| R1B-14 (NEW) | Roof producer port (S10 D2–D7) discovers PRYZM 1 Roof generator reads `RoofStore` mid-generation | Medium | Medium | DTO extraction at call boundary; mirrors the wall pattern. Documented in `docs/architecture/element-recipe.md` (S07 v1). | S10 |
| R1B-15 (NEW) | Slab cross-element coupling (`SlabWallCoupling.ts:133`) requires more than 1 day to port to `plugins/cross/slab-wall.ts` | Medium | Medium | Cascade infra (S10 D6) + `plugins/wall/occupancy.ts` (S10) make the cross-handler a thin declaration. Actual logic is in pre-existing pieces. | S12 |
| R1B-16 (NEW) | Cross-element cascade rules cause infinite recursion (Move wall A → cascade to B → cascade back to A) | Medium | High | `packages/command-bus/cascade.ts` tracks visited node-IDs in `Set<Id>` per dispatch; cycle-drop logged via OTel attribute `cascade.cycle.dropped`. `code-level ADR docs/architecture/adr/0012-cross-element-cascade-rule-registration.md`. | S10 |
| R1B-17 (NEW) | The `plugins/wall/tool.ts` strict-injection (mirrors `WallTool.ts:144`) breaks toolbar wiring (toolbar instantiates before `commandBus` ready) | Low | Medium | `apps/editor/src/toolbar/ToolRegistry.ts` (1A S06) supports lazy tool instantiation. Documented in toolbar README. | S09 |
| R1B-18 (NEW) | The 73-file consumer concentration (§1.5) creates pressure to "just fix one import in `src/`" violating K1B-4 | High | Low (per cast) but cumulatively High | K1B-4 explicitly forbids any edit to `src/elements/walls/**` or `src/commands/walls/**` in 1B. F rejects any PR that touches these files. CI snapshot-diff hard-fails. | every sprint |
| R1B-19 (NEW) | Bulk operations (`BulkSetWallVisuals` on 1000 walls) blow the per-tick batching window | Low | Medium | Validated in S10 D7 with a 1000-wall fixture; immer's structural-share keeps per-handler latency under 5 ms. | S10 |
| R1B-20 (NEW) | The team is technically meeting K1-C (≤ 4 days/element) but burning out (long days) | Medium | High | F monitors daily standup; K1-C is "**> 4 calendar days OR > 8 person-hours per day**". If de-facto failed, halt + buffer in S12 even if technically met. | S11, S12 |

### §5.1 Kill-switches (1B-specific)

- **K1B-1** — If end of S08 the producer cannot run in Node (`__tests__/headless-runner.ts` fails for any of the 30 cases), halt 1B forward work. Refactor before S09. (Mirrors K1-B in master plan.)
- **K1B-2** — If end of S11 any single new element (Door, Window, Roof) took > 4 calendar days OR required > 8 person-hours/day from either agent, halt. Refactor producer/committer interface in S12 buffer. Do not proceed to S12 with a broken multiplier. (K1-C trigger.)
- **K1B-3** — If end of S12 the small-fixture cold-load > 1 s, halt entry to 1C. Profile + tune (likely: persistence, hydration order, plugin-registration parallelism, or material pool) before S13.
- **K1B-4** (NEW) — If at any point in 1B a PR touches `src/elements/walls/**`, `src/commands/walls/**`, or any file under `src/elements/{slabs,doors,windows,roofs,curtainwalls,grids,columns,beams}/**` outside of `tests/fixtures/pryzm-1/<element>/`, the PR is rejected. PRYZM 1's element families must remain bit-for-bit unchanged across 1B. The only exception is documentation under `docs/`. (Mirrors K1A-4.)

---

### §5.2 SPECs binding Phase 1B

The following entries from `docs/03_PRYZM3/reference/specs/` are normative for every 1B sprint. Where this phase doc and a SPEC conflict, the SPEC wins; reconcile by amendment of this doc.

| SPEC | Section | Sprints |
|---|---|---|
| SPEC-01 (Determinism & robustness budget) | §3 robustness budget; §6 determinism | S07 onward |
| SPEC-02 (Event log + chunk store) | §1–§2 event log + chunks | S07 onward |
| SPEC-05 (Family taxonomy + type vs instance) | §1 family taxonomy; §2 type/instance; §3 layer composition; §4 material library; §7 starter types | S07 onward |
| SPEC-10 (Plugin manifest + capability surface) | All sections | S07 onward |

---

## §6 1B → 1C handoff checklist (must be true on M6 morning)

- [ ] All S12 exit criteria green (= sub-phase 1B exit).
- [ ] All 6 sprint-scoped 1B ADRs merged: `code-level ADR docs/architecture/adr/0008-wall-handler-triage.md`, `code-level ADR docs/architecture/adr/0009-wall-producer-signature.md`, `code-level ADR docs/architecture/adr/0010-slab-handler-triage.md`, `code-level ADR docs/architecture/adr/0011-curtain-wall-triage-and-producer-split.md`, `code-level ADR docs/architecture/adr/0012-cross-element-cascade-rule-registration.md`, `code-level ADR docs/architecture/adr/0013-intent-resolver.md` — plus `code-level ADR docs/architecture/adr/0014-persistence-snapshot-threshold.md` if S09 needed it.
- [ ] All 1B CI gates green and PR-blocking.
- [ ] All 9 element plugins (`plugins/{wall,door,window,roof,slab,curtain-wall,grid,column,beam}/`) ship and are registered in `apps/editor/src/bootstrap.data.ts`.
- [ ] `packages/geometry-kernel/producers/{wall,door,window,roof,slab,curtain-wall,grid,column,beam}.ts` all THREE-free (`pryzm-no-three-in-kernel` real-enforced).
- [ ] `BufferGeometryDescriptor` + `JoinData` types frozen — no further changes without ADR.
- [ ] `Store<T>.subscribeDirty()` / `PrimitiveCommitter<TStore>` interfaces unchanged from 1A (no scope creep).
- [ ] Sub-phase 1B demo recording committed to `docs/demos/M6-1B-9-elements.mp4`.
- [ ] `apps/bench/reports/M6-1B-baseline.md` published with all 9-element bench numbers.
- [ ] Sprint S13 plan in `docs/sprints/S13.md` reviewed by both agents and F.
- [ ] One day of buffer between S12 D10 and S13 D1 — non-negotiable rest day.
- [ ] PRYZM 1 (`apps/editor` legacy code path through `src/main.ts`) unchanged and shipping; default URL still loads PRYZM 1; `src/elements/{walls,slabs,doors,windows,roofs,curtainwalls,grids,columns,beams}/**` + `src/commands/{walls,slabs,doors,windows,roofs,curtainwalls,grids,columns,beams}/**` byte-for-byte unchanged from 1A morning (CI snapshot-diff).
- [ ] All existing `tests/*.test.ts` still pass (including `tests/curtainPanelStoreIndexInvariants.spec.test.ts`, `tests/curtainWallToolStaticImport.spec.test.ts`).
- [ ] PRYZM 1 customer support queue reviewed; no P0 blocking 1C entry.
- [ ] `docs/architecture/element-recipe.md` complete and is the reference doc for Phase 1C / 2A's annotation/dimension/room/MEP work.
- [ ] `tests/fixtures/pryzm-1/<element>/` has at least 30 cases for wall, 20 for roof, 18 for slab, 25 for curtain wall, 15 for door, 12 for window, plus baseline cases for grid/column/beam.
- [ ] `MaterialPool.deduplicateAcrossElementTypes()` extension shipped and validated in mixed-scene Playwright test.
- [ ] No new `requestAnimationFrame(` call site in `src/` since 1A start (CI snapshot-diff).
- [ ] No new `(window as any)` cast in `src/` since 1A start (CI snapshot-diff).

---

## §7 Architecture Decision Records merged in 1B (full text)

The six ADRs below are the load-bearing decisions of 1B. They are reproduced here in full so that any future agent reading this phase doc has a single source of truth without needing to chase ADR files. Each ADR maps to a sprint-scoped code-level slug per the §0 mapping table (`0008-wall-handler-triage` through `0013-intent-resolver`). The 1A sprint-scoped ADRs (`0001-typed-id-brand`, `0002-command-handler-signature`, `0003-scheduler-priority-vs-tickpriority`, `0005-primitive-committer-interface`, `0006-idle-continuation-budget`) and the strategic ADRs ratified during 1A (`[strategic ADR-004]`, `[strategic ADR-006]`, `[strategic ADR-007]`, `[strategic ADR-009]`) landed earlier and are referenced inline below where load-bearing.

### ADR-008 — Wall handler triage (22 → 14)

- **Status**: Accepted (S07 D2; mid-sprint amendment S10 D1 expanding `TransformWall` from `MoveWall + Mirror + Scale + Offset + Reference-edit` consolidation).
- **Context**: PRYZM 1's wall family has 16 files in `src/commands/walls/` plus 3 sibling commands (Mirror, Scale, Offset) in `src/commands/`, plus 2 sibling cross-cutting commands (`DeleteElementCommand.ts:783` covers all elements; `CascadeWallBaselineCommand.ts:223` is wall-specific cascade). 22 surfaces total. Naïve port = 22 handler files in `plugins/wall/handlers/`. This loses the opportunity to consolidate redundant patches.
- **Decision**: Land 14 handlers in 1B:
  - **Lifted to L4 (`packages/command-bus/handlers/`)**: `DeleteElement` (one generic), `CascadeWallBaseline` becomes `CascadeRunner` (`code-level ADR docs/architecture/adr/0012-cross-element-cascade-rule-registration.md`).
  - **Merged**: `UpdateWallDimensions + SetWallWidth + UpdateWallHeight → SetWallDimensions` (3→1, atomic patches, S07-T8); `Mirror + Scale + Offset + Move + ReferenceEdit → TransformWall` (5→1 discriminated kind, S10-T1); `SetAllWallsWidth + SetAllWallsVisualProperties → BulkSetWallVisuals` (2→1, S10-T2).
  - **Dropped**: `CreateWallsOnAllSlabs` (rare and replaceable by user-script + slab-iteration in PRYZM 2; defer to Phase 2).
  - **Cross-store affinity declared**: `CreateDoor`/`CreateWindow` in S11 declare `affectedStores: ['door'|'window', 'wall']`; the wall plugin's `openings[]` field is read-only from wall handlers and write-from cross-store handlers via the lint rule `pryzm-affected-stores-required` (1A S02).
- **Consequences**:
  - 14 handler files instead of 22 → easier to test, document, and reason about.
  - Atomic patches reduce dirty-diff churn → fewer committer rebuilds.
  - The discriminated `TransformWall` is *one* registered handler with one OTel span name (`pryzm.command.execute` with `cmd.type='wall.transform'`); the `kind` becomes a span attribute. Telemetry queries on "show me all wall transforms" become trivial.
- **Trade-offs accepted**: `TransformWall` switch-statement testing matrix is 5×, but each `kind` is a thin call to a private helper (`transformMove`, `transformMirror`, …). Helpers are tested independently; dispatch switch has 1 test per kind. Total LOC + handler-registry weight is 1/5.
- **PRYZM-1 evidence**: `CreateWallCommand.ts:51` (`affectedStores`); `DeleteElementCommand.ts:783`; `UpdateWallDimensionsCommand.ts:79`; `SetWallWidthCommand.ts:99`; `UpdateWallHeightCommand.ts:184`; `MirrorWallCommand`, `ScaleWallCommand`, `OffsetWallCommand` (sibling).

### ADR-009 — Producer pure-function signature

- **Status**: Accepted (S08 D1).
- **Context**: PRYZM 1's wall geometry generator (`WallFragmentBuilder.generate()`, `WallFragmentBuilder.ts:142`) is a method on a stateful class with comments at line 142 and 425 ("the builder is now a pure function of its inputs") that document the *aspirational* purity. In practice it instantiates `THREE.Group`, `THREE.Vector3`, `THREE.MeshStandardMaterial` mid-flight (lines 437, 508–509, 572–573), couples to `MaterialPool` via this-reference, and reads from a stale memo cache (`this.miterNormalsCache`).
- **Decision**: The PRYZM 2 wall producer is a **pure top-level function** with the signature:

  ```ts
  export type WallProducer = (
    dto: Readonly<WallData>,
    joinData: Readonly<JoinData>,
    worldY: number,
  ) => BufferGeometryDescriptor;
  ```

  Every other element producer (slab, door, window, roof, curtain-wall, grid, column, beam) follows the same DTO-in / descriptor-out shape, with a per-element 2nd parameter (e.g. `hostWall: WallData` for door/window, `levelGeometry: LevelGeometryHints` for roof, `ctx: CWContext` for curtain-wall sub-producer orchestration).

  **Numerical determinism**: identical (`dto`, `joinData`, `worldY`) inputs MUST yield byte-identical `Float32Array` outputs across Node `worker_thread` and browser Worker. This is a CI gate (`packages/geometry-kernel/__tests__/wall-headless-node.test.ts`).

  **No hidden state**: no `this`, no module-level closures over mutable caches, no `Date.now()`, no `Math.random()`, no `crypto.randomUUID()`. All entropy must come through the DTO (`createdAt` is a field, never a re-read).

  **No THREE imports**: the descriptor uses plain `Float32Array`/`Uint32Array`. The committer reconstructs `THREE.BufferGeometry` on the scenic side. Lint rule `pryzm-no-three-in-kernel` real-enforces.
- **Consequences**:
  - Producer can run in any V8 isolate: Vitest test, Node `worker_thread` for headless bake-worker (Phase 1D), browser Worker for hot-path generation. The "would this run in bake-worker?" test (Vision P3) is satisfied by construction.
  - Producer-level memoisation is content-addressed via `composeWallGeometryHash(dto, joinData, worldY)`; no in-class cache.
  - Cross-runtime parity is mechanically verifiable.
- **Trade-offs accepted**: The CSG implementation must be ported to be THREE-free (`packages/geometry-kernel/csg/`, ~600 LOC, S08-T6 D5 decision). One-time cost; pays back across wall+slab+roof.
- **PRYZM-1 evidence**: `WallFragmentBuilder.ts:142` and `:425` (aspirational pure-function comments); `WallFragmentBuilder.ts:505` (DTO migration comment).

### ADR-010 — Slab handler triage

- **Status**: Accepted (S12 D1; trailing — 1B's last new ADR before sub-phase close).
- **Context**: PRYZM 1's `src/commands/slabs/` has 12 commands. Slab is the second-most-complex element family after wall (openings, level membership, dependency on walls via `SlabWallCoupling.ts:133`).
- **Decision**: Land 8 handlers in 1B's S12: `CreateSlab`, `DeleteSlab`, `MoveSlab`, `SetSlabType`, `AddSlabOpening`, `RemoveSlabOpening`, `SetSlabSlope`, `SetSlabThickness`. Drop `CreateSlabsFromBuildingFootprint` (deferred to Phase 2 import workflows). Merge `UpdateSlabDimensions + SetSlabHeight → SetSlabThickness`. Lift cross-element coupling to `plugins/cross/slab-wall.ts` cascade rule (`code-level ADR docs/architecture/adr/0012-cross-element-cascade-rule-registration.md`).
- **Consequences**: Slab handler count is roughly equivalent to wall (8 vs 14). Cross-element interactions go through cascade infra, not inline.
- **PRYZM-1 evidence**: `src/commands/slabs/*` (12 files); `SlabWallCoupling.ts:133`; `SlabDependencyTracker.ts`.

### ADR-011 — Curtain Wall handler triage + producer split

- **Status**: Accepted (S12 D5; jointly drafted A+B + F).
- **Context**: PRYZM 1's `src/elements/curtainwalls/CurtainWallBuilder.ts` is the most complex element generator. It internally produces panels, mullions, transoms, and (optionally) gaskets and brackets. Consolidating into a single producer would balloon to ~2000 LOC and lose testability.
- **Decision**:
  - **Handler triage**: 9 CW handlers (`CreateCurtainWall`, `DeleteCurtainWall`, `MoveCurtainWall`, `SetCWGrid`, `SetCWMullionType`, `SetCWTransomType`, `SetCWPanelType`, `AddCWMullion`, `RemoveCWMullion`).
  - **Producer split**: One orchestrator `produceCurtainWall` calls 3–4 sub-producers:
    - `produceCWPanels(dto, ctx)` — quad meshes per panel cell
    - `produceCWMullions(dto, ctx)` — extrusion along verticals
    - `produceCWTransoms(dto, ctx)` — extrusion along horizontals
    - `produceCWGaskets(dto, ctx)` — feature-flagged (`cw.gaskets`); shipped off in 1B, on by Phase 2 alpha
  - **Descriptor merge**: `mergeDescriptors([panels, mullions, transoms, gaskets])` preserves group boundaries so committer renders multi-material in a single draw-grouped mesh.
- **Consequences**: Each sub-producer < 300 LOC and unit-testable in isolation. CW parity (25 cases) tests both individual sub-producers and the merged orchestrator output.
- **Open question**: brackets (visible at high zoom on real CW assemblies) — punted to Phase 2 alongside gaskets enabling.
- **Bench target**: CW p95 < 80 ms (looser than other elements' < 50 ms) per the producer split overhead.
- **PRYZM-1 evidence**: `src/elements/curtainwalls/CurtainWallBuilder.ts` (audit on S12 D1).

### ADR-012 — Cross-element cascade-rule registration

- **Status**: Accepted (S10 D6).
- **Context**: PRYZM 1's `CascadeWallBaselineCommand.ts:223` implements wall-baseline-cascade inline (when one wall moves, neighbouring walls must recompute their miter normals). The same pattern arises for slab → wall (slab outline change re-affects walls hosting on the slab) and curtain-wall → wall (host change). Five inline cascade implementations would duplicate the DAG-walk logic.
- **Decision**: Cascade is an L4 service (`packages/command-bus/cascade.ts`) with a registration interface:

  ```ts
  export interface CascadeRule<TKey extends string = string> {
    readonly key: TKey;
    resolveAffected(rootEntityId: EntityId, ctx: CascadeContext): readonly EntityId[];
  }
  ```

  Plugins register cascade rules at boot:

  ```ts
  // in plugins/wall/index.ts boot
  cascadeRunner.register({ key: 'wall.baseline', resolveAffected: (wallId, ctx) =>
    ctx.wallStore.neighboursOf(wallId).map(w => w.id) });

  // in plugins/cross/slab-wall.ts boot
  cascadeRunner.register({ key: 'slab.outline', resolveAffected: (slabId, ctx) =>
    ctx.wallOccupancy.dependentsOfSlab(slabId) });
  ```

  When a command dispatches, the cascade runner walks the DAG of affected entities and synthesises follow-up `Recompute*` commands. **Cycle detection** uses a `Set<EntityId>` tracking visited nodes; second visit drops silently and emits OTel attribute `cascade.cycle.dropped`. Maximum cascade depth is 16 (raises `CascadeDepthExceededError` to expose pathological topology).
- **Consequences**: Adding cross-element coupling (e.g. roof → wall in Phase 2) is a one-line `cascadeRunner.register({...})` call. No inline cascade code in handlers.
- **Trade-offs accepted**: Cascade rules can interact in unexpected ways (e.g. wall.baseline → slab.outline → wall.baseline). The cycle detection prevents infinite loops but the *order* of cascade commands matters; `code-level ADR docs/architecture/adr/0012-cross-element-cascade-rule-registration.md` documents that cascade rules are pure-functional and order-independent within the same DAG level.
- **PRYZM-1 evidence**: `CascadeWallBaselineCommand.ts:223`; `SlabWallCoupling.ts:133`; `SlabDependencyTracker.ts`.

### ADR-013 — Intent resolver shape

- **Status**: Accepted (S10 D1).
- **Context**: PRYZM 1's `WallIntentResolver.ts:213`, `PathResolver.ts:94`, and `WallSnapCycler.ts:196` together resolve user intent during wall creation: snap-target priority, tie-breaking, snap-cycling on Tab, joining intent. The resolver historically held a `THREE.Raycaster` to do snap-to-mesh detection (line ~50) which mixes 2D arithmetic (snap-to-grid, snap-to-endpoint) with 3D raycasting.
- **Decision**: Split into two layers:
  - **`plugins/wall/intent.ts`** (DTO-only, ~250 LOC): pure functions for snap-to-grid, snap-to-endpoint, snap-to-midpoint, join-target resolution, snap-cycling. No THREE imports.
  - **`plugins/wall/tool.ts`** (THREE-side): owns the `RaycasterFacade` for snap-to-mesh (3D-pick a face). The tool calls into `intent.ts` with snap candidates *already* 3D-projected to scene coordinates.

  **Tie-breaking priority** (`code-level ADR docs/architecture/adr/0013-intent-resolver.md` fixed order — committed to spec, not a runtime parameter):

  | Priority | Snap kind |
  |---|---|
  | 100 | Endpoint of selected wall |
  | 90 | Endpoint of any wall |
  | 80 | Midpoint of selected wall |
  | 70 | Intersection point with grid |
  | 60 | Midpoint of any wall |
  | 50 | Grid vertex |
  | 40 | Grid edge projection |
  | 0 | Raw cursor |

  **Snap-cycling**: Tab key cycles through candidates in the order returned by `resolveSnapCandidates()`. Reverse with Shift+Tab.

  **Cross-element delegation**: door/window/curtain-wall plugins delegate opening positioning to `wallIntent.resolveOpeningPosition()` — single source of truth for "where on this wall does the opening anchor live", including for curved walls.
- **Consequences**: Intent resolver runs identically in tests (no THREE harness needed) and in browser. The 30 wall parity tests + N real-project fixtures (S10 D7) validate the resolver against PRYZM 1 reference behaviour.
- **PRYZM-1 evidence**: `src/elements/walls/WallIntentResolver.ts:213`; `PathResolver.ts:94`; `WallSnapCycler.ts:196`.

---

## §8 Performance budgets and bench specifications

Every 1B bench is a CI-asserted gate. The table below is the master budget reference; each row maps to a Vitest or Playwright spec under `apps/bench/` and a `*.report.json` artifact published per-sprint to `apps/bench/reports/`.

| Bench | First sprint | Target | Hard-fail gate | Measurement | Sub-budget breakdown (where relevant) |
|---|---|---|---|---|---|
| `apps/bench/cmd-execute-latency.bench.ts` (per wall handler) | S07 | < 1 ms p95 | > 2 ms p95 | 1000 dispatches × 5 handlers; OTel `pryzm.handler.invoke` | handler logic < 0.5 ms; store `applyPatch` < 0.3 ms; event emit < 0.2 ms |
| `apps/bench/produce-wall.bench.ts` | S08 | < 50 ms p95 simple wall; < 80 ms p95 layered+openings | > 60 ms / > 120 ms | 1000 producer runs × per-fixture-class | path-build < 5 ms; miters < 5 ms; extrude < 15 ms; openings (CSG) < 30 ms (when present); serialize < 5 ms |
| `apps/bench/load-small.bench.ts` | S09 | < 800 ms cold | > 1000 ms (K1B-3 trigger at S12) | OTel sum of cold-load stage spans (see S09 budget table) | parse 80 / persistence 120 / plugins 60 / hydrate 40 / first commit 250 / first paint 250 |
| `apps/bench/orbit-fps.bench.ts` (100 walls in S09; 100 of each in S12) | S09 / S12 | > 55 fps p95 | < 50 fps p95 | 60-second orbit over fixture; FPS sampled every frame; p95 across last 30 s | per-frame budget 16.6 ms: scheduler tick < 2 ms; committer commit < 4 ms; THREE render < 8 ms; idle / V8 < 2.6 ms |
| `apps/bench/produce-{door,window,roof}.bench.ts` | S10 / S11 | < 50 ms p95 | > 60 ms p95 | 1000 producer runs × per-element-fixture | per-element budget |
| `apps/bench/produce-{slab,grid,column,beam}.bench.ts` | S12 | < 50 ms p95 | > 60 ms p95 | per-element | per-element |
| `apps/bench/produce-curtain-wall.bench.ts` | S12 | < 80 ms p95 | > 100 ms p95 | per-fixture | sub-producer split: panels < 20 ms; mullions < 25 ms; transoms < 25 ms; merge < 10 ms |
| `apps/bench/load-medium.bench.ts` (skeleton in S12; full in 2A) | S12 | (skeleton — no gate) | (none in 1B) | 100-element mixed scene | (full breakdown lands 2A) |

**Bench harness**: Vitest `bench()` syntax with `runs: 1000, iterations: 1` for producers. Playwright benches use the harness from 1A S06 with `--use-gl=swiftshader` for headless determinism. Per-sprint reports are committed to `apps/bench/reports/MN-XX-baseline.md`; CI compares the new run to the most-recent baseline and red-fails on > 10% regression.

**Why 55 fps and not 60?** The 5-fps headroom absorbs OS-level variability (compositor stalls, GC pauses) that would cause flakes at 60 fps p95. The user-perceived target is 60 fps; the gate is 55 to keep the test stable.

---

## §9 OpenTelemetry telemetry catalog for 1B

This is the master inventory of every OTel span / event / attribute introduced by 1B. It complements 1A's catalog (`pryzm.bootstrap.*`, `pryzm.frame.scheduler.tick`, `pryzm.persistence.*`). Per Vision P5 ("Observable by default"), every L4 / L5 / L6 surface emits a span.

### §9.1 Spans

| Span | Sprint | Parent | Attributes | Sampling |
|---|---|---|---|---|
| `pryzm.command.execute` | S07 | (root user-action) | `cmd.type`, `cmd.id` (ULID), `cmd.affectedStores[]`, `cmd.payload.size_bytes`, `handler.duration_ms`, `result.patches.count`, `result.events.count`, `result.error.kind?` | always |
| `pryzm.handler.invoke` | S07 | `pryzm.command.execute` | `handler.type`, `handler.duration_ms`, `handler.error.kind?` | always |
| `pryzm.store.applyPatch` | S07 | `pryzm.command.execute` | `store.id`, `entity.id`, `patch.count`, `patch.size_bytes`, `dirty.diff.added`, `dirty.diff.updated`, `dirty.diff.removed` | always |
| `pryzm.kernel.produce.wall` | S08 | `pryzm.committer.commit` or bench | `wall.id`, `wall.layers.count`, `wall.openings.count`, `wall.curved`, `producer.duration_ms`, `descriptor.vertex_count`, `descriptor.index_count`, `descriptor.hash`, `descriptor.bytes` | always |
| `pryzm.kernel.csg.subtract` | S08 | `pryzm.kernel.produce.wall` | `csg.subject_vertices`, `csg.cutter_vertices`, `csg.duration_ms`, `csg.implementation` | 1/10 prod; always DEV |
| `pryzm.kernel.descriptor.assertValid` | S08 | (ambient) | `descriptor.hash`, `assert.duration_ms`, `assert.error.kind?` | DEV only |
| `pryzm.committer.commit` | S09 | `pryzm.frame.scheduler.tick` | `committer.id`, `diff.added`, `diff.updated`, `diff.removed`, `commit.duration_ms`, `meshes.created`, `meshes.disposed`, `geometry.rebuilt`, `material.rebound` | always |
| `pryzm.bootstrap.parse` | S09 | (root) | `bundle.bytes`, `parse.duration_ms`, `feature.pryzm2` | once/cold-load |
| `pryzm.persistence.coldLoad` | S09 | `pryzm.bootstrap` | `snapshot.bytes`, `events.replayed`, `coldLoad.duration_ms` | once/cold-load |
| `pryzm.plugin.register` | S09 | `pryzm.bootstrap` | `plugin.id`, `plugin.handlers.count`, `register.duration_ms` | once/plugin/cold-load |
| `pryzm.store.hydrate` | S09 | `pryzm.bootstrap` | `store.id`, `entities.count`, `hydrate.duration_ms` | once/store/cold-load |
| `pryzm.frame.firstPaint` | S09 | `pryzm.frame.scheduler.tick` (first) | `paint.duration_ms`, `triangles.uploaded`, `gpu.memory_mb` | once/cold-load |
| `pryzm.materialPool.acquire` | S09 | `pryzm.committer.commit` | `material.key`, `material.refcount`, `pool.hit`, `material.cross_family_dedup_hit` (S12) | 1/100 prod; always DEV |
| `pryzm.cascade.dispatch` | S10 | `pryzm.command.execute` | `cascade.root.cmd.type`, `cascade.commands.total`, `cascade.entities.visited`, `cascade.depth.max`, `cascade.rule.key` | always |
| `pryzm.intent.resolveJoinTarget` | S10 | `pryzm.tool.dispatch` | `intent.candidates.count`, `intent.winner.priority`, `intent.duration_ms` | 1/100 prod; always DEV |
| `pryzm.intent.resolveSnapCandidates` | S10 | `pryzm.tool.dispatch` | `snap.grid.active`, `snap.candidates.count`, `snap.duration_ms` | 1/100 prod; always DEV |
| `pryzm.intent.delegate` | S11 | `pryzm.tool.dispatch` | `intent.from`, `intent.to`, `intent.duration_ms` | 1/100 prod; always DEV |
| `pryzm.kernel.produce.{door,window,roof,slab,grid,column,beam,curtain-wall}` | S11/S12 | `pryzm.committer.commit` or bench | `<elem>.id`, `producer.duration_ms`, `descriptor.bytes`, `cw.sub-producers.count?` | always |

### §9.2 Span events (point-in-time markers)

| Event | Span | Attributes | When |
|---|---|---|---|
| `cascade.cycle.dropped` | `pryzm.cascade.dispatch` | `entity.id`, `depth` | second visit during cascade walk |
| `committer.proxy.toggled` | `pryzm.committer.commit` | `wall.id`, `visible` | `visible` field flips |
| `descriptor.hash.miss` | `pryzm.kernel.produce.wall` | `wall.id`, `prev.hash`, `new.hash` | producer rebuild required |
| `descriptor.hash.hit` | `pryzm.committer.commit` | `wall.id`, `hash` | producer skipped (committer reused last descriptor) |
| `intent.snap.cycled` | `pryzm.intent.resolveSnapCandidates` | `from.priority`, `to.priority` | Tab/Shift+Tab during creation |

### §9.3 Backend conventions

- **Trace context propagation**: every command dispatch creates a new root or continues the user-action trace via W3C `traceparent`. Cascade-synthesised commands inherit parent `traceparent` so the entire cascade is one trace.
- **Resource attributes**: `service.name='pryzm-editor'`, `service.version=<ulid>`, `deployment.environment ∈ { 'dev', 'preview', 'prod' }`.
- **Metric exporters**: 1B does not yet emit metrics (counters/histograms); the bench harness aggregates spans into baseline reports. Metric exporters land in 2A per master plan §10.

---

## §10 TypeScript contracts inventory introduced in 1B

This is the master export inventory — every named export from 1B that other phases consume. Future agents grepping for "what does 1B publish?" should land here.

### §10.1 `packages/geometry-kernel/`

```ts
// types/Point3D.ts
export interface Point3D { readonly x: number; readonly y: number; readonly z: number }
export interface Vec3 { readonly x: number; readonly y: number; readonly z: number }

// types/BufferGeometryDescriptor.ts (FROZEN as of S08 D2)
export interface BufferGeometryDescriptor { /* see §3 S08 contracts */ }
export type MaterialKey =
  | { kind: 'standard'; color: string; roughness: number; metalness: number }
  | { kind: 'metallic'; color: string; roughness: number; metalness: number }
  | { kind: 'glass';    color: string; opacity: number; ior: number }
  | { kind: 'unlit';    color: string }
  | { kind: 'outline';  color: string; width: number };

// types/JoinData.ts (FROZEN as of S08 D2)
export interface JoinData { /* see §3 S08 */ }

// types/assertValidDescriptor.ts
export function assertValidDescriptor(d: BufferGeometryDescriptor): asserts d is BufferGeometryDescriptor;

// producers/wall.ts (and door/window/roof/slab/curtain-wall/grid/column/beam — same shape)
export const produceWall: (dto, joinData, worldY) => BufferGeometryDescriptor;
export const produceDoor: (dto: DoorData, hostWall: WallData) => BufferGeometryDescriptor;
export const produceWindow: (dto, hostWall) => BufferGeometryDescriptor;
export const produceRoof: (dto, levelGeometry) => BufferGeometryDescriptor;
export const produceSlab: (dto) => BufferGeometryDescriptor;
export const produceCurtainWall: (dto, ctx) => BufferGeometryDescriptor;
export const produceGrid: (dto) => BufferGeometryDescriptor;
export const produceColumn: (dto) => BufferGeometryDescriptor;
export const produceBeam: (dto) => BufferGeometryDescriptor;

// csg/KernelCSG.ts
export class KernelCSG {
  subtract(subject: ExtrudedLayers, cutter: BoxGeometry): void;
  result(): ExtrudedLayers;
}

// math/{vec3,mat4}.ts (lifted from gl-matrix BSD-3)
export const vec3: { add, sub, dot, cross, normalize, length, scale, ... };
export const mat4: { identity, multiply, transformPoint, ... };
```

### §10.2 `packages/command-bus/` (extended)

```ts
// cascade.ts (NEW S10)
export interface CascadeRule<TKey extends string = string> { /* see §3 S10 */ }
export class CascadeRunner { /* see §3 S10 */ }
export class CascadeDepthExceededError extends DomainError { readonly maxDepth: number }

// handlers/DeleteElement.ts (NEW S07 — generic L4 lift)
export const deleteElementHandler: Handler<DeleteElementCommand>;
```

### §10.3 `packages/scene-committer/` (interfaces frozen 1A; no new exports in 1B beyond utilities)

```ts
// utilities/selection-highlight.ts (FUTURE — lifted from plugins/wall in S16)
// (no 1B export — wall plugin owns the implementation directly)
```

### §10.4 `packages/stores/` (extended)

```ts
// SelectionStore.ts (NEW S07 — bring-forward from S16)
export class SelectionStore extends Store<SelectionEntry> { /* */ }
export interface SelectionEntry { readonly id: string; readonly kind: 'wall' | 'door' | 'window' | ... }
```

### §10.5 `plugins/<element>/` (per-element exports)

Every element plugin exports the same 5 surfaces:

```ts
// plugins/wall/index.ts (and door/window/roof/slab/curtain-wall/grid/column/beam — same shape)
export const walls: PluginManifest = {
  id: 'wall',
  store: WallStore,
  handlers: [createWallHandler, deleteWallHandler, moveWallHandler, /* ... 14 total */],
  committer: wallCommitter,
  tool: WallCreationTool,
  intent: wallIntent,                                  // optional; wall has it
  cascadeRules: [{ key: 'wall.baseline', resolveAffected: ... }],
};
```

### §10.6 `tests/parity/<element>/` (fixture inventory)

| Element | Fixture count | First sprint | File |
|---|---|---|---|
| wall | 30 + N real-project | S08 + S10 D7 | `tests/parity/wall/configs/*.json` |
| roof | 20 | S10 D6 | `tests/parity/roof/` |
| door | 15 | S11 D3 | `tests/parity/door/` |
| window | 12 | S11 D6 | `tests/parity/window/` |
| slab | 18 | S12 D3 | `tests/parity/slab/` |
| curtain-wall | 25 | S12 D7 | `tests/parity/curtain-wall/` |
| grid | 8 | S12 D4 | `tests/parity/grid/` |
| column | 6 | S12 D4 | `tests/parity/column/` |
| beam | 6 | S12 D5 | `tests/parity/beam/` |
| **Total** | **140 + N real-project** | | |

---

## §11 Delta from canonical wall walkthrough (`05-IMPLEMENTATION-PLAN.md` §13)

`05-IMPLEMENTATION-PLAN.md §13` is the **canonical wall walkthrough** — the spec for the end-to-end hot path (tool → command → handler → store → committer → frame). This phase doc IMPLEMENTS that spec for the wall family. The table below documents every place 1B diverges from the canonical text and why.

| §13 canonical claim | 1B implementation | Reason |
|---|---|---|
| §13 calls the descriptor `GeometryIR` | 1B uses `BufferGeometryDescriptor` | Naming locked in S07 D5 paired session for parallelism with `BufferGeometry` (the THREE class it reconstructs to). `GeometryIR` is the master-plan abstract name; `BufferGeometryDescriptor` is the concrete type. |
| §13 producer signature: `produce(dto, ctx) => GeometryIR` | 1B signature: `produceWall(dto, joinData, worldY) => BufferGeometryDescriptor` | The `ctx` was unpacked into explicit parameters during `code-level ADR docs/architecture/adr/0009-wall-producer-signature.md` review — explicit parameters make purity audit-able (no `ctx` to hide closures). `joinData` is pre-resolved at handler time per S07-T8 contract. |
| §13 implies single-handler-per-command | 1B uses 14 handlers covering 22 PRYZM-1 surfaces (`code-level ADR docs/architecture/adr/0008-wall-handler-triage.md`) | Consolidation drops redundant patches and reduces handler-registry weight. `TransformWall` discriminated kind is the canonical example. |
| §13 implies cascade is inline in handler | 1B uses L4 `CascadeRunner` (`code-level ADR docs/architecture/adr/0012-cross-element-cascade-rule-registration.md`) | Cross-element cascade (slab→wall, CW→wall) emerges in S12; inline cascade would duplicate DAG-walk + cycle-detection logic. |
| §13 mentions `MaterialPool` without specifying dedup scope | 1B `MaterialPool.deduplicateAcrossElementTypes()` (S12) extends 1A's per-family pool to cross-family content-addressing | Mixed scenes (CW mullion + column = same metal) must share material instance for orbit-fps target. |
| §13 implies tool is part of the same plugin entry-point | 1B splits intent (DTO-only) from tool (THREE-side) per `code-level ADR docs/architecture/adr/0013-intent-resolver.md` | Allows intent to run identically in tests + browser + Node; isolates THREE coupling to one file (`tool.ts`) per plugin. |
| §13 doesn't specify producer determinism guarantees | 1B requires byte-identical Float32Array across Node↔browser (CI gate `wall-headless-node.test.ts`) | Bake-worker (Phase 1D) reads producers in headless Node; cross-runtime divergence would corrupt baked artefacts. `code-level ADR docs/architecture/adr/0009-wall-producer-signature.md`. |
| §13 doesn't enumerate cascade depth limits | 1B sets MAX_CASCADE_DEPTH=16 with `CascadeDepthExceededError` | Empirical from S10 R2 — cycle of 100 walls would otherwise crash; 16 is well above any natural BIM topology. |
| §13 leaves `affectedStores` informal | 1B requires `readonly affectedStores: readonly StoreId[]` per handler (`code-level ADR docs/architecture/adr/0002-command-handler-signature.md`) with lint rule `pryzm-affected-stores-required` | Cross-store dependencies become statically analyzable (door→wall opening updates). |

**Net**: 1B is fully consistent with §13's intent; all deltas are *narrowing* (tightening contracts) or *factoring* (lifting common code to L4) rather than divergent.

---

## §12 Pre-sprint reading list per agent (mandatory before kickoff D1)

This list is the canonical "what every agent must have read before walking into a sprint kickoff". F enforces by 5-minute verbal Q&A at the top of D1.

### §12.1 Agent A (Track A — headless half)

| Sprint | Required reading | Verifies |
|---|---|---|
| S07 | This phase doc §1.1, §1.2, §1.3 (handler triage); `01-TARGET-ARCHITECTURE.md` §4 (L4 commands); `WallStore.ts:79–1190`; `CreateWallCommand.ts` (full); `DeleteElementCommand.ts:1–200` | Can recite the 22→14 triage decisions and explain why `_neighbourSnapshot` is dropped. |
| S08 | This phase doc §1.4 (producer-extraction line refs); `WallFragmentBuilder.ts:430–900`; `MiterPrismBuilder.ts` (full); `LayeredWallOpeningBuilder.ts` (full); `08-VISION.md` §P3 (bake-worker test); `05-IMPLEMENTATION-PLAN.md` §13 hot path | Can explain why producer must be pure top-level function (Node↔browser parity) and where each PRYZM-1 line goes in `producers/wall.ts`. |
| S09 | This phase doc §3 S09 (cold-load budget table); `01-TARGET-ARCHITECTURE.md` §5 (L5 stores) — for cross-tracking; `apps/bench/orbit-fps.bench.ts` (1A scaffold); `08-VISION.md` NFR table | Can reproduce the cold-load budget breakdown from memory. |
| S10 | This phase doc §3 S10 (TransformWall consolidation); `WallIntentResolver.ts:213` (full); `PathResolver.ts` (full); `WallSnapCycler.ts:196` (full); `CascadeWallBaselineCommand.ts:223` (full); `code-level ADR docs/architecture/adr/0008-wall-handler-triage.md`/012/013 stubs | Can recite the snap-priority table from `code-level ADR docs/architecture/adr/0013-intent-resolver.md` and explain cascade cycle-drop. |
| S11 | Doors family read-through (`src/elements/doors/`); window family read-through; `08-VISION.md` D5 (multi-runtime kernel) | Can explain how `affectedStores: ['door', 'wall']` works without breaking the wall plugin's encapsulation. |
| S12 | Slab family read-through; `SlabWallCoupling.ts:133`; CW family audit notes (S12 D1 deliverable); `code-level ADR docs/architecture/adr/0010-slab-handler-triage.md`/011 stubs | Can describe the CW producer split before D5 paired session. |

### §12.2 Agent B (Track B — scenic half)

| Sprint | Required reading | Verifies |
|---|---|---|
| S07 | This phase doc §1.6 (greenfield gaps); `01-TARGET-ARCHITECTURE.md` §6 (L6 committers); `PrimitiveCommitter` interface (1A S05); `WallTool.ts:144–147` (strict-injection); 1A `plugins/cube/` (the only existing plugin) | Can build a new plugin scaffold from memory matching 1A `plugins/cube/`. |
| S08 | `08-VISION.md` §P3 (bake-worker test); Node `worker_thread` API doc; Comlink doc; `WallFragmentBuilder.ts:43` (wallRoots Map pattern) | Can wire a producer into both runtimes and prove byte-equality. |
| S09 | `WallFragmentBuilder.ts:25–115` (committer skeleton); `:586–598` (proxy-mesh pattern); `WallEdgeOverlayBuilder.ts:154` (selection outline); `MaterialPool` (1A S05); Playwright headless harness doc; this phase doc §3 S09 budget table | Can implement geometry-vs-material-only patch separation correctly. |
| S10 | `WallTool.ts` arc + polyline branches (full); `RoofGeometryBuilder.ts` audit; `code-level ADR docs/architecture/adr/0013-intent-resolver.md` stub | Can extend the tool to Arc + Polyline modes from the PRYZM-1 reference. |
| S11 | Door + window + roof family scenic files (`*FragmentBuilder.ts`, `*Tool.ts` in each); `plugins/wall/README.md` (S09 deliverable, the canonical recipe) | Can replicate the wall recipe verbatim for door+window. |
| S12 | Slab + grid + column + beam scenic files; `CurtainWallBuilder.ts` full audit; `code-level ADR docs/architecture/adr/0011-curtain-wall-triage-and-producer-split.md` stub; bundle code-split docs (1A S06) | Can implement the CW multi-material grouped mesh and the cross-element MaterialPool dedup. |

### §12.3 F (Architect-Owner)

F reads ALL of the above before each sprint kickoff plus the previous sprint's retro notes. F's specific additional reading per sprint:

- **S07**: this phase doc §0–§7 (entire doc); `10-MASTER-IMPLEMENTATION-PLAN-36M.md` §S07–S12; `code-level ADR docs/architecture/adr/0008-wall-handler-triage.md` PR draft.
- **S08**: `code-level ADR docs/architecture/adr/0009-wall-producer-signature.md` PR draft; `pryzm-no-three-in-kernel` lint config from 1A S03.
- **S09**: `code-level ADR docs/architecture/adr/0014-persistence-snapshot-threshold.md` (snapshot threshold) draft if persistence path needs ratifying.
- **S10**: `code-level ADR docs/architecture/adr/0012-cross-element-cascade-rule-registration.md` + `code-level ADR docs/architecture/adr/0013-intent-resolver.md` PR drafts; `WallIntentResolver.ts` full read for arbitration.
- **S11**: K1-C trigger conditions (this phase doc §5.1 K1B-2); daily standup observations from S10.
- **S12**: `code-level ADR docs/architecture/adr/0010-slab-handler-triage.md` + `code-level ADR docs/architecture/adr/0011-curtain-wall-triage-and-producer-split.md` PR drafts; sub-phase 1B retro agenda.

---

## §13 Document log

- **2026-04-26** — first version expanding `phases/PHASE-1-FOUNDATION-M1-M12.md §3` into a two-agent parallel plan (S07–S12 sprint flow, track allocation, basic ADR list, basic risk register R1B-01..08, kill-switches K1B-1..3).
- **2026-04-26 (rev. 2)** — deep enhancement matching 1A's depth pattern: added **§0 alignment header** (strategic anchor, hard precondition, conflict order); added **§1 Existing-codebase inventory** (12,470 LOC wall family across 25 + 19 files; 7-section breakdown including absorb/replace/leave-alone matrix, "trap files" analysis (`WallStore.ts:79–1190`, `WallFragmentBuilder.ts:142/425/505/572–598`, `WallTool.ts:33–838`), **22→14 handler triage table** with file:line evidence per command, **producer-extraction line-ref map** of `WallFragmentBuilder.ts:430–900`, **73-file consumer concentration map**, greenfield-gaps table, and schema notes); per-sprint **existing-code touchpoints**, **per-task sub-phase breakdown** (`SnT-Tx`), **blocker analysis** grounded in real `src/` evidence (S07 6 risks, S08 7 risks, S09 6 risks, S10 6 risks, S11 6 risks, S12 7 risks); **non-regression validation steps** at every D9; risk register expanded R1B-01..20 (added R1B-09..20 grounded in §1.2 trap-file analysis); added kill-switch **K1B-4** (no edits to `src/elements/<element>/**` in 1B); 1B→1C handoff checklist expanded to 21 line items; added §4.1 ADR table with PRYZM-1 evidence column; added §4.2 CI gates table.
- **2026-04-26 (rev. 3)** — book-quality expansion to 1975 lines (+1117 over rev. 2, +130% over rev. 1) bringing 1B parity with 1A/1D depth pattern. **Per-sprint deep additions** for all six sprints (S07–S12), each gaining four mandatory subsections: (1) **typed contracts introduced** — full TypeScript signatures for every interface/handler/producer/store landed in the sprint, with comments tying back to PRYZM-1 line refs and ADR cross-links; (2) **key pseudocode walkthrough** — the load-bearing implementation pattern of the sprint shown as ~30–60-line annotated TS (`composeWallGeometryHash` for S07; `applyOpenings`/`resolveMiters` for S08; cold-load-stage budget table for S09; cascade-DAG-walk + cycle-drop for S10; door-on-wall intent delegation for S11; CW sub-producer orchestrator + mullion-extrusion for S12); (3) **test catalog** — full inventory of Vitest + Playwright tests planned (file path, test names, owner) totalling 191 tests across the sub-phase (35 S08 + 18 S09 + 38 S10 + 30 S11 + 60 S12 + 10 S07); (4) **OTel spans introduced** with parent/attributes/sampling rate; (5) **daily artifact log** — D2/D3/D4/D6/D7/D8 file-by-file landings tracking what enters the codebase each day. **Six new appendix sections** added before the document log: **§7** Architecture Decision Records `code-level ADR docs/architecture/adr/0008-wall-handler-triage.md`..013 (full text — wall handler triage; producer pure-function signature; slab triage; CW triage + producer split; cross-element cascade-rule registration; intent resolver shape); **§8** Performance budgets and bench specifications (master table of every 1B bench gate with sub-budget breakdown); **§9** OTel telemetry catalog (18 spans, 5 events, backend conventions); **§10** TypeScript contracts inventory (master export list per package: geometry-kernel, command-bus, scene-committer, stores, plugins, parity-fixtures totalling 140+N fixtures); **§11** Delta from canonical wall walkthrough §13 of 05-IMPLEMENTATION-PLAN.md (9-row table documenting every divergence and rationale); **§12** Pre-sprint reading list per agent A/B/F (mandatory reading enforced by F's D1 5-minute Q&A). Original document log renumbered §7 → §13.
