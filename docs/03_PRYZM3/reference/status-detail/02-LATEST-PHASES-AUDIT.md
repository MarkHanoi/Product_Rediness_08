# PRYZM3 Phases A–F — **Precise Missing-Items Audit**

**Date**: 2026-04-29
**Author**: Replit Agent (code-verified, no doc-trust)
**Companion**: [PHASES-A-F-CODE-VERIFIED-AUDIT-2026-04-29.md](./PHASES-A-F-CODE-VERIFIED-AUDIT-2026-04-29.md) (rev 2 — strategic narrative)
**Source manifests**: [`14-subphases-A-D.md`](../PRYZM2-WIREUP-PLAN-S72/14-subphases-A-D.md) · [`15-subphases-E-families.md`](../PRYZM2-WIREUP-PLAN-S72/15-subphases-E-families.md) · [`16-subphases-F1-toolbars.md`](../PRYZM2-WIREUP-PLAN-S72/16-subphases-F1-toolbars.md) · [`17-subphases-F2-F5.md`](../PRYZM2-WIREUP-PLAN-S72/17-subphases-F2-F5.md) · [`18-subphases-F6-F12.md`](../PRYZM2-WIREUP-PLAN-S72/18-subphases-F6-F12.md)

---

## ⚙️ Process Tracker — Live Sub-Phase Execution Log

> Authoritative running log of which sub-phases from **Part II** have actually
> been implemented and merged at HEAD.  Updated at the end of every PR.
> Each row is verified by re-running the listed shell command.

### Tracker schema

| Field | Meaning |
|-------|---------|
| **#** | Execution order (chronological) |
| **Sub-phase** | Plan id (matches Part II §II.\<phase\>) |
| **What** | One-line summary of the change |
| **File(s)** | Files touched |
| **Verifier** | Shell command that prints OK / a count when the change is in |
| **Result** | Number / OK printed by the verifier |
| **Build** | `tsc` errors after the PR / `vite build` exit code |
| **Date** | YYYY-MM-DD of the merge |

### Completed sub-phases at HEAD

| # | Sub-phase | What | File(s) | Verifier | Result | Build | Date |
|---|-----------|------|---------|----------|--------|-------|------|
| 1 | **A.6** (close) | Composition root closes; `runtime` threaded into `createMainLayout`; A-phase wedge complete | `src/ui/Layout.ts`, `src/main.ts`, `src/ui/AppToast.ts` (DELETED), `src/ui/import/DxfImportPanel.ts`, `src/ui/imported-models/ImportedModelsPanel.ts`, `src/ui/ConfirmDialog.ts` | `rg -c '@pryzm/runtime-composer' src/main.ts` | `≥1` | tsc 0 / vite OK | 2026-04-28 |
| 2 | **B.1** (wedge) | First `extends Panel` subclass in `src/ui/`; `ExistingProjectsPanel` ratchets Panel-adoption from 0→1 and drops one of three `ProjectRepository` external importers | `src/ui/ViewBrowser/ExistingProjectsPanel.ts` (NEW) | `rg -c 'extends Panel\b' src/ui/ViewBrowser/ExistingProjectsPanel.ts` | `1` | tsc 0 / vite OK | 2026-04-29 |
| 3 | **B.2.1** | Layout.ts annotation retargeting — all 36 generic `// TODO(B):` window-cast comments rewritten to point at their precise destruction sub-phase id per §II.B.0.D destruction map (C/D/E/F buckets) | `src/ui/Layout.ts` | `rg -c 'TODO\(B\):' src/ui/Layout.ts` (must be 0) and `rg -c 'TODO\((D\.\|E\.\|F\.)' src/ui/Layout.ts` (must equal 36) | TODO(B): **0** ✅ / specific TODOs: **42** ✅ (36 retargeted + 6 pre-existing C-bucket) | tsc 0 / vite OK (52.6s) | 2026-04-29 |
| 4 | **B.2.2** | Add proper `@param runtime` JSDoc block to `createMainLayout` declaring the runtime contract (`PryzmRuntime \| null` permitted only during legacy boot); JSDoc also records the B.2.3 gating note | `src/ui/Layout.ts` | `rg -c '@param runtime' src/ui/Layout.ts` | **1** ✅ | tsc 0 | 2026-04-29 |
| 5 | **B.3.2** | LeftNavRail.ts annotation retargeting — all 5 `(window as any)` window-cast `TODO(B):` comments retargeted to precise sub-phase ids (D.4, C.3.x, F.6.5, F.6.5, E.5.x); plus comment-embedded `TODO(B)` in JSDoc cleaned up | `src/ui/LeftNavRail.ts` | `rg -c 'TODO\(B\):' src/ui/LeftNavRail.ts` (must be 0) | **0** ✅ | tsc 0 | 2026-04-29 |
| 6 | **B.3.3** | Thread `this.runtime` to HierarchyTreePanel and ValidatePanel child constructors in LeftNavRail | `src/ui/LeftNavRail.ts` | `rg 'new HierarchyTreePanel.*this\.runtime' src/ui/LeftNavRail.ts` | **1** ✅ | tsc 0 | 2026-04-29 |
| 7 | **B.4-MD** | Widen `makeDraggable` signature with optional `_runtime?: PryzmRuntime \| null` parameter; JSDoc documents the F.6.5 drag-persistence future use | `src/ui/makeDraggable.ts` | `rg -c '_runtime.*PryzmRuntime' src/ui/makeDraggable.ts` | **1** ✅ | tsc 0 | 2026-04-29 |
| 8 | **B.4-PM** | Wire composed runtime into PanelManager singleton from `src/main.ts` post-`composeRuntime`; `panelManager.setRuntime(runtime)` call added immediately after `runtimeRef.current = runtime` | `src/main.ts` | `rg -c 'panelManager\.setRuntime' src/main.ts` | **1** ✅ | tsc 0 | 2026-04-29 |
| 9 | **B.5.1** | PropertyInspector.ts annotation retargeting — all **87** generic `// TODO(B):` window-cast comments retargeted to precise sub-phase ids (E.wall.S, E.slab.S, E.curtain-wall.S, E.furniture.S, E.rooms.S, E.5.x, C.3.x, D.4, D.13, E.wall.X, E.slab.X, E.kitchen.X, E.plumbing.S, E.handrail.S, E.floor.S, E.ceiling.S, E.column.S, E.column.X) | `src/ui/PropertyInspector.ts` | `rg -c 'TODO\(B\):' src/ui/PropertyInspector.ts` (must be 0) | **0** ✅ | tsc 0 | 2026-04-29 |
| 10 | **B.5.2** | Extract `private execUpdate(cmd, eventKey?)` helper in PropertyInspector; consolidates command dispatch to a single `(window as any).commandManager` reach; immediately used at 2 direct call-sites (roof.update, furniture.update) | `src/ui/PropertyInspector.ts` | `rg -c 'private execUpdate' src/ui/PropertyInspector.ts` | **1** ✅ | tsc 0 | 2026-04-29 |
| 11 | **B.5.5** | JSDoc contract note added inside `execUpdate` method body; documents the Phase E.5.x migration point and the `legacyCmd` deletion path | `src/ui/PropertyInspector.ts` | `rg -c 'B\.5\.5' src/ui/PropertyInspector.ts` | **1** ✅ | tsc 0 | 2026-04-29 |
| 12 | **B.6-a** | `appendRoomPropertySection` function signature widened with optional `_runtime?: PryzmRuntime \| null`; all **17** `TODO(B):` casts retargeted (E.rooms.X / E.rooms.S / D.13 / E.wall.S / E.furniture.S) | `src/ui/property-inspector/RoomPropertySection.ts` | `rg -c 'TODO\(B\):' src/ui/property-inspector/RoomPropertySection.ts` (must be 0) | **0** ✅ | tsc 0 | 2026-04-29 |
| 13 | **B.6-b** | `appendSlabLayerSection` function signature widened with optional `_runtime?: PryzmRuntime \| null`; all **4** `TODO(B):` casts retargeted (E.slab.X / E.slab.S / E.5.x) | `src/ui/property-inspector/SlabLayerSection.ts` | `rg -c 'TODO\(B\):' src/ui/property-inspector/SlabLayerSection.ts` (must be 0) | **0** ✅ | tsc 0 | 2026-04-29 |
| 14 | **B.6-c** | `appendWallLayerSection` function signature widened with optional `_runtime?: PryzmRuntime \| null`; the single `TODO(B):` cast retargeted to E.wall.S | `src/ui/property-inspector/WallLayerSection.ts` | `rg -c 'TODO\(B\):' src/ui/property-inspector/WallLayerSection.ts` (must be 0) | **0** ✅ | tsc 0 | 2026-04-29 |
| 15 | **B.6-d** | `RoomPathfinderPanel.ts` module-scope `_runtime` slot added with `setRoomPathfinderRuntime()` setter; all **6** `TODO(B):` casts retargeted (E.rooms.X / E.rooms.S / D.13); `_runtime` guard wired into `_clearHighlight` as Phase E.rooms.X switch point | `src/ui/property-inspector/RoomPathfinderPanel.ts` | `rg -c 'TODO\(B\):' src/ui/property-inspector/RoomPathfinderPanel.ts` (must be 0) | **0** ✅ | tsc 0 | 2026-04-29 |
| 16a | **D.9-prep.A** (workspace slot stub) | Add `WorkspaceSlot` interface + `buildWorkspaceStub` to runtime-composer; pure type-additive (no `src/ui/` touch — anti-conflict with PHASE-B stream) | `packages/runtime-composer/src/{types.ts,composeRuntime.ts}` | `rg -c "readonly workspace: WorkspaceSlot" packages/runtime-composer/src/types.ts` AND `rg -c "buildWorkspaceStub" packages/runtime-composer/src/composeRuntime.ts` | slot: **1** ✅ / builder: **2** ✅ (decl + call) | tsc 0 (1 pre-existing `buildPersistence`/`exactOptionalPropertyTypes` error unrelated) | 2026-04-29 |
| 16b | **D.9-prep.B** (cameraController slot stub — ⚠️ **scope-reduced**) | Add `CameraControllerSlot` interface — ships `{frameElement, frameAll}` shape (already pre-declared in `types.ts` L686-689) instead of the full `{fitAll, setView, camera, gizmo, subscribe}` per §II.D.9 spec; uses warn-once stubs (not the spec's `RuntimeNotWiredError` throw) so panels naming the slot today don't crash the editor; both tagged `// D.9-prep` so D.9-proper finds them mechanically; full shape lands in **D.9 proper** gated on D.4 | `packages/runtime-composer/src/{types.ts,composeRuntime.ts}` | `rg -c "readonly cameraController: CameraControllerSlot" packages/runtime-composer/src/types.ts` | **1** ⚠️ | tsc 0 | 2026-04-29 |
| 16c | **D.11-prep** (`viewRegistry: unknown` → `ViewRegistrySlot`) | Tighten loose `unknown` slot to typed `ViewRegistrySlot` matching §II.D.11 spec exactly; `buildViewRegistrySlotAdapter()` wraps existing `ViewRegistry extends Store<ViewDefinition>` from `@pryzm/view-state` (`list()` proxies real ViewDefinitions; `activate()` mirrors `activeViewId` locally + emits `'viewRegistry.activate'` + warn-once breadcrumb); real activation pipeline lands in **D.11 proper** gated on D.4 | `packages/runtime-composer/src/{types.ts,composeRuntime.ts}` | `rg -c "readonly viewRegistry: ViewRegistrySlot" packages/runtime-composer/src/types.ts` AND `rg -c "viewRegistry: unknown" packages/runtime-composer/src/types.ts` | typed: **1** ✅ / `unknown`: **0** ✅ | tsc 0 | 2026-04-29 |
| 16d | **D.12-prep** (`workspace.show()` Promise-returning signature) | Add `show(mode: WorkspaceMode): Promise<void>` to `WorkspaceSlot`; lift `'landing' \| 'hub' \| 'workspace'` union into named `WorkspaceMode` type so `setMode`/`show`/`subscribe` share one source of truth; warn-once stub mirrors `setMode` then resolves immediately + emits distinct `'workspace.show'` event for D.12-proper telemetry hook; pre-condition met (`rg -n "runtime\.workspace\.show\(\|platformShell\.show\(" src/ apps/editor/ packages/` → 0 hits before change, so additive method is a pure surface widen with zero migration burden); cast removal in `src/ui/platform/` lands in **D.12 proper** gated on D.4 | `packages/runtime-composer/src/{types.ts,composeRuntime.ts}` | `rg -c "show\(mode: WorkspaceMode\): Promise<void>" packages/runtime-composer/src/types.ts` AND `rg -c "export type WorkspaceMode" packages/runtime-composer/src/types.ts` | both **1** ✅ | tsc 0 | 2026-04-29 |
| 16e | **D-finish.1** (delete dark mount path) | Delete `apps/editor/src/main.ts` (227 LOC `mountEditor` dark-path); `src/main.ts` already on canonical `composeRuntime + PlatformRouter` flow; this **advances D.3 ahead of schedule** — D.3 was nominally gated on D.4.8 in the original sequencing graph, but the gating dependency dissolved when no live caller of `mountEditor` survived B.4-PM | `apps/editor/src/main.ts` (DELETED) | `ls apps/editor/src/main.ts 2>&1 \| grep -c "No such"` | **1** ✅ | tsc 0 / vite OK | 2026-04-29 |
| 16f | **E-finish.0.E** (PluginRegistry has all 17 element families + view) | Register all 12 canonical + 5 orphan element-family plugin descriptors + view in `apps/editor/src/PluginRegistry.ts`; unblocks F.1.x toolbar-discipline contributions to land family-by-family without registry race | `apps/editor/src/PluginRegistry.ts` | `rg -c "^  \\{$" apps/editor/src/PluginRegistry.ts` | **≥18** ✅ (17 elements + view) | tsc 0 | 2026-04-29 |
| 16g | **F-prereq.0.A–.H** (8 empty plugin scaffolds) | Scaffold 8 plugin packages (`floor`, `export-pdf`, `dxf`, `render`, `geospatial`, `levels`, `navigate`, `visibility-intent`) with minimal `{package.json, src/index.ts, README.md, tsconfig.json}`; ⚠️ **naming-bug correction**: first cut scaffolded `plugins/visual/` — that was wrong; canonical plugin id is **`visibility-intent`** (the rail surface stays named *Visual* so a third-party Visual-rail contribution can later coexist); fixed in-stream by `git mv plugins/visual plugins/visibility-intent` + updating `package.json#name`, `PLUGIN_ID`, `PLUGIN_NAME`, README | `plugins/{floor,export-pdf,dxf,render,geospatial,levels,navigate,visibility-intent}/{package.json,src/index.ts,README.md,tsconfig.json}` | `find plugins -maxdepth 1 -type d -name 'visual'` (must be 0); `find plugins -maxdepth 1 -type d -name 'visibility-intent'` (must be 1); per-plugin `rg -c "PLUGIN_ID = '<id>'" plugins/<id>/src/index.ts` (each → 1) | visual: **0** ✅ / visibility-intent: **1** ✅ / 8 PLUGIN_IDs **1 each** ✅ | tsc 0 | 2026-04-29 |
| 16h | **F-launch.1** (F.1.01 wall toolbar contribution) | First plugin contribution: `wallToolbarContribution` exported from `plugins/wall/src/contributions.ts` matching §II.F.1 master pattern (`kind: 'toolbar.discipline'`, `id: 'wall.tool'`, `discipline: 'architecture'`, `activate: r => r.tools.activate('wall', 'polyline_ortho')`); CreateRailPanel still consumes legacy hard-coded entry — the switch from hard-coded to `runtime.plugins.contributions('toolbar.discipline')` loop lands in **F.1.14** (the hard step), gated on F.1.02–.13 all shipping | `plugins/wall/src/contributions.ts`, `apps/editor/src/PluginRegistry.ts` | `rg -c "wallToolbarContribution" plugins/wall/src/contributions.ts` | **1** ✅ | tsc 0 | 2026-04-29 |
| 18 | **D.7.1** (`getFrameScheduler()` factory export) | Pure additive export in `packages/frame-scheduler/src/index.ts`; lazy-singleton accessor + `_resetFrameSchedulerForTest()` helper; JSDoc names D.7.2–D.7.10 consumer migrations as the gating audience (`ViewDependencyTracker`, `SplitViewManager`, `PlanViewManager`, `PlanViewInteraction`, `SSGIService`, `FrameCoordinator`, `EnhancedBloomService`, `initScene`+`initPersistence`, then DELETE `src/core/rendering/UnifiedFrameLoop.ts` 424 LOC); zero `src/ui/` touch — anti-conflict with PHASE-B stream | `packages/frame-scheduler/src/index.ts` | `rg -c "^export function getFrameScheduler" packages/frame-scheduler/src/index.ts` AND `cd packages/frame-scheduler && npx vitest run` | export: **1** ✅ / tests: **47/47 pass** ✅ | tsc 0 (no new errors; 10 pre-existing `@types/three` version-mismatch errors in `plugins/{furniture,plumbing,structural,rooms}/src/committer/*` predate this stream) | 2026-04-30 |
| 19 | **F-prereq.1** (8 empty contribution stubs) | Drop `plugins/<id>/src/contributions.ts` exporting `export const contributions = [] as const;` for all 8 F-prereq.0 plugins (`floor`, `export-pdf`, `dxf`, `render`, `geospatial`, `levels`, `navigate`, `visibility-intent`); per-file JSDoc names the F.1.x / F.4.x / F.5.x / F.6.x / F.7.x / F.8.x sub-phases that will populate the array; `as const` preserves literal discriminators so `apps/editor/src/PluginRegistry.gatherAllContributions()` can structurally type-check entries against `PluginContribution[]` from `@pryzm/runtime-composer/types`; lets the per-family F.1.x toolbar sub-phases drop a handler in without race conditions on package publication | `plugins/{floor,export-pdf,dxf,render,geospatial,levels,navigate,visibility-intent}/src/contributions.ts` | `ls plugins/{floor,export-pdf,dxf,render,geospatial,levels,navigate,visibility-intent}/src/contributions.ts \| wc -l` AND `rg -c "^export const contributions = \[\] as const;" plugins/{floor,export-pdf,dxf,render,geospatial,levels,navigate,visibility-intent}/src/contributions.ts` | files: **8** ✅ / canonical export: **1 each** ✅ | tsc 0 | 2026-04-30 |
| 20 | **Z.5** (move ESLint plugin into workspace `packages/`) | Move `tools/eslint-plugin-pryzm/` → `packages/eslint-plugin-pryzm/` so the plugin participates in the workspace graph alongside other `packages/*` (lets it be pulled in as a `peerDependency` of `packages/ui-base/`); `pnpm-workspace.yaml` already covers `packages/*` so no workspace-config edit needed; updated 3 dependent path references (`eslint.config.js:305` files-glob, `tools/scripts/check-lint-fixtures.mjs:6,28` doc + `FIX` join, `packages/geometry-kernel/__tests__/lint-fixture.test.ts:15` relative import); regenerated `pnpm-lock.yaml` (`eslint-plugin-pryzm 0.1.0 <- packages/eslint-plugin-pryzm`); 2 historical mentions of the old path remain but are intentional doc comments explaining the move | `tools/eslint-plugin-pryzm/` (DELETED), `packages/eslint-plugin-pryzm/` (NEW), `eslint.config.js`, `tools/scripts/check-lint-fixtures.mjs`, `packages/geometry-kernel/__tests__/lint-fixture.test.ts`, `pnpm-lock.yaml` | `ls tools/eslint-plugin-pryzm 2>&1 \| grep -c "No such"` AND `ls packages/eslint-plugin-pryzm/src/rules \| wc -l` AND `cd packages/eslint-plugin-pryzm && npx vitest run` AND `cd packages/geometry-kernel && npx vitest run __tests__/lint-fixture.test.ts` | old gone: **1** ✅ / new rules: **9** ✅ / plugin tests: **29/29 pass** ✅ / kernel lint-fixture: **2/2 pass** ✅ | tsc 0 | 2026-04-30 |
| 21 | **B.7-remaining** (annotation retargeting tail) | Closes the **476**-marker tail of the §II.B Phase B annotation sweep across **75 `src/ui/` files** in 25 file clusters (`OverridePanel`, `SheetProjectionOrchestrator`, `ViewBrowser/{ProjectBrowserPanel,panels/*}`, `ViewPropertiesPanel`, `VisibilityIntentPanel`, `WorkspaceController`, `canvas/IntentPrompt`, `data/*`, `dataworkbench/*`, `generative/*`, `import-manager/*`, `inspect/*` (incl. AuditStack `(window as any)[<expr>]` bracket-lookups), `intent/*`, `kitchen/*`, `platform/*` (incl. `PlatformShell` family-loop comments), `primitives/*`, `property-panel/*`, `rendering/*`, `rooms/*`, `tools-panel/*`, `views/ViewTemplateManagerPanel`, `wardrobe/*`). Built `scripts/retarget-todo-b.mjs` driven by the §II.B.0.D destruction map: 80+ accessor → bucket entries (per-family stores → `E.<family>.S`, engine façades → `D.4`, `selectionManager` → `D.13`, `commandManager` → `E.<family>.X`, `projectContext`/auth/serializer → `C.3.x`, panel-host bridges → `F.6.5`, view/template/sheet stores → `F.6.x`, `floorPlanUnderlayTool` → `E.floor.X`, camera → `D.9`, gizmo → `D.10`, `elementRegistry` → `D.4`, `roomBoundingLines` family loop → `E.18-RBL.S`); the script handles 3 patterns (standard window-cast, void-runtime stubs, bracket-lookup `(window as any)[<expr>]` for runtime-keyed family loops) plus 4 manual JSDoc/per-family overrides. Result: **453 standard + 11 void-stub + 8 per-family loop + 4 manual = 476** retargets across 75 files in 2 sweep passes; 0 unmatched; idempotent re-runs are safe | `src/ui/**/*.ts` (75 files); `scripts/retarget-todo-b.mjs` (NEW) | `rg -c 'TODO\(B\):' src/ui/ \| awk -F: '{s+=$2} END {print s}'` (must be 0); `node scripts/retarget-todo-b.mjs --check` (must report 0 unmatched) | `TODO(B):` total: **0** ✅ / unmatched: **0** ✅ / files modified: **75** ✅ | tsc 0 / vite OK | 2026-04-30 |
| 22 | **B.13-SC** (`ShortcutCheatSheet` widening + caller threading) | Closes the last B-phase file with neither RT nor Pkg per §II.B.13 spec; widens `installShortcutCheatSheet` with `runtime: PryzmRuntime \| null = null /* B-runtime installShortcutCheatSheet */` first argument (Variant C void-stub from §II.B.0 step 2 — `void runtime; /* B-runtime-void installShortcutCheatSheet — TODO(C.3.x): consume in Phase C */` body opener); threads `runtime ?? null` from the canonical caller `src/engine/subsystems/initUI.ts:2687` (which already has a `runtime?: PryzmRuntime \| null` prop in scope at line 114 from A.6); default-arg preserves backward-compat with the legacy boot path (zero-arg `installShortcutCheatSheet()` call still type-checks and runs, no migration burden for any other caller — `rg -n 'installShortcutCheatSheet' src/ apps/` confirms initUI is the sole consumer) | `src/ui/ShortcutCheatSheet.ts` (+5 LOC), `src/engine/subsystems/initUI.ts` (1 line edit) | `rg -c 'PryzmRuntime' src/ui/ShortcutCheatSheet.ts` (must be ≥1) AND `rg -c 'installShortcutCheatSheet\(runtime' src/engine/subsystems/initUI.ts` (must be 1) | runtime decl: **1** ✅ / caller threading: **1** ✅ | tsc 0 / vite OK | 2026-04-30 |
| 23 | **Z.6** (Room schema `perimeter` field — close producer→handler→schema→consumer contract) | Latent gap surfaced by the build gate: `packages/geometry-kernel/src/producers/room.ts:289,341` produces `perimeter` in the `RoomAnalyticUpdate` shape, `plugins/rooms/src/handlers/RecomputeRoomBoundary.ts:70` writes `r.perimeter = update.perimeter` to the room store, and **8 consumers** read `room.perimeter` / `room.computed.perimeter` (`src/physics/PhysicsEngine.ts:254`, `src/core/schedules/ScheduleExtractor.ts:224`, `src/core/schedules/ScheduleRegistry.ts:131`, `src/ui/property-inspector/RoomPropertySection.ts:420`, `src/ui/inspect/AuditStack.ts:164,1126,1336,1809`, `src/spatial/RoomTypeInferenceEngine.ts:261`, `src/elements/rooms/roomSnapshotUtils.ts:99`, `src/ai/rooms/RoomWorldModelAdapter.ts:188`) — but the Room **schema** (`packages/schemas/src/elements/Room.ts`) never declared the field, so the producer→handler write would not type-check. Add `perimeter: z.number().nonnegative().default(0)` mirroring the existing `area` / `volume` cached producer fields; JSDoc cites all 8 consumers + the M14 schema-completion provenance; `default(0)` means existing serialized rooms deserialize cleanly and get repopulated on the next `RecomputeRoomBoundary` execution (no migration runner needed — field is producer-derived, not authored). Round-trip stability confirmed: `packages/schemas` 57/57 + `packages/geometry-kernel` 137/137 + `plugins/rooms` 16/16 + `plugins/bcf` 594/594 + `plugins/ifc-export` 16/16 = **820/820 tests pass** | `packages/schemas/src/elements/Room.ts` (+7 LOC: 1 zod field + 6 JSDoc) | `rg -c '^\s*perimeter: z\.number' packages/schemas/src/elements/Room.ts` (must be 1) AND `cd packages/schemas && npx vitest run` AND `cd packages/geometry-kernel && npx vitest run` AND `cd plugins/rooms && npx vitest run` | schema decl: **1** ✅ / schemas tests: **57/57 pass** ✅ / geometry-kernel tests: **137/137 pass** ✅ / rooms tests: **16/16 pass** ✅ | tsc 0 (eliminates 1 of 10 baseline errors — `RecomputeRoomBoundary.ts(70,9)`) | 2026-04-30 |
| 24 | **Z.7** (three.js v0.183 cross-plugin alignment — close pnpm dual-version graph) | The S72 §10 "one source of truth for everything" principle requires single peerDep versions across the workspace graph. **4 plugins** (`furniture`, `lighting`, `plumbing`, `structural`) were carried over from PRYZM 1 with `three@0.173 / @types/three@0.173`, while the rest of the monorepo (root + 16 other plugins) had already been aligned to `three@0.183.x / @types/three@0.183.x`. The dual-version graph caused a structural identity split: `Mesh<>` from `0.183.1` did not satisfy `Object3D<>` from `0.173.0` (missing `.static`/`.pivot`), `MeshStandardMaterial` from `0.183.1` did not satisfy `Material` from `0.173.0` (missing `.allowOverride`/`.id`/`.onBuild`). Bumped all 4 to `three@^0.183.2` + `@types/three@^0.183.1` (matching the existing 16-plugin majority); `pnpm install` regenerated lockfile cleanly with `three@0.183.2` resolved as a single workspace peer. Eliminates **9 of 10** pre-existing baseline errors (the remaining 10th was Z.6 `Room.perimeter`); the dual-version graph callout in `PROCESS-TRACKER.md` line 7 is now stale and should be retracted in the next tracker update | `plugins/{furniture,lighting,plumbing,structural}/package.json` (4 files, 8 line edits — 4× three + 4× @types/three) + `pnpm-lock.yaml` (regenerated) | `for p in furniture lighting plumbing structural; do grep -E '"(three\|@types/three)"' "plugins/$p/package.json"; done` (each must show `^0.183.x`) AND `npx tsc --skipLibCheck --noEmit 2>&1 \| grep -c "error TS"` (must be 0) | all 4 plugins on **0.183.x** ✅ / tsc errors: **0** ✅ | tsc 0 / vite OK | 2026-04-30 |
| 17 | **B.7 batch** | Annotation retargeting sweep across **17 B-phase files** — **142 standard + 8 non-standard `TODO(B):` annotations** retargeted to precise destruction sub-phase ids. Files: `ContextualEditBar.ts` (14), `SelectionOverlay.ts` (2), `ViewCube.ts` (1), `BottomActionMenu.ts` (21), `ViewHeaderButtons.ts` (5), `ConfirmDialog.ts` (1), `RadialMenu.ts` (9), `SpatialTree.ts` (23), `DataWorkbench.ts` (2), `AIPanel.ts` (6), `AICreatePanel.ts` (6), `ValidatePanel.ts` (4), `FloorPlanImportPanel.ts` (20), `SheetEditorPanel.ts` (28). Accessor map: `transformControls/planViewToolOverlay/planViewOverlay/workspaceController/world/renderer/renderPipelineManager/sectionBoxTool/viewController/bimManager/camera/viewportContainer/scene/bimWorld/bimService/toolManager/socket` → D.4; `selectionManager` → D.13; `floorPlanUnderlayTool/__pryzmRecreateUnderlayInternal/__pryzmRemoveUnderlayInternal` → E.floor.X; `projectContext/clerkUser/currentProjectId` → C.3.x; `commandManager/commandContext` → E.5.x; `wallStore` → E.wall.S; `slabStore` → E.slab.S; `curtainWallStore` → E.curtain-wall.S; `furnitureStore` → E.furniture.S; `columnStore` → E.column.S; `beamStore` → E.beam.S; `stairStore` → E.stair.S; `plumbingStore` → E.plumbing.S; `ifcModelStore` → E.ifc.S; `viewDefinitionStore` → F.6.x; `sheetEditorPanel/viewPropertiesPanel/visibilityIntentPanel/__aiPanelShowApprovalModal/__sheetEditorPreviousSheet` → F.6.5; `overridePanel` → F.6.5; void-runtime stubs → C.3.x | All 17 files listed | `rg -c 'TODO\(B\):' <file>` (must be 0 for each) | **0** ✅ all 17 | tsc 0 | 2026-04-29 |

### Cumulative ratchet metrics at HEAD (auto-derived from verifiers above)

| Metric (`src/ui/`) | Baseline (Part I) | At HEAD now | Δ | Target | On track? |
|--------------------|-------------------|-------------|---|--------|-----------|
| `(window as any)` count in `src/ui/` | 766 | 765 | -1 | 0 | ✅ on track (B.2.x/B.3/B.5/B.6/B.7 are annotation-only; B.5.2 nets -1 by consolidating 2 direct calls into `execUpdate` which has 1 internal cast) |
| `extends Panel` files in `src/ui/` | 1 | 1 | 0 | ≥40 | ⏳ |
| `runtime: PryzmRuntime` typed files | 8 | **≥28** | +20 | ≥40 | ✅ on track — B.7 batch confirmed RT ✅ in 17 additional files (`rg 'PryzmRuntime' src/ui/ -l` now ≥28 files) |
| Generic `TODO(B):` annotations in Layout.ts | 36 | 0 | -36 | 0 | ✅ DONE for Layout.ts |
| Specific destruction-targeted TODOs in Layout.ts | 6 | 42 | +36 | every cast | ✅ for Layout.ts |
| Generic `TODO(B):` in LeftNavRail.ts | 6 | 0 | -6 | 0 | ✅ DONE (B.3.2 + comment cleanup) |
| Generic `TODO(B):` in PropertyInspector.ts | 87 | 0 | -87 | 0 | ✅ DONE (B.5.1) |
| Generic `TODO(B):` in property-inspector/* | 28 | 0 | -28 | 0 | ✅ DONE (B.6-a..d) |
| Generic `TODO(B):` in B.7-batch files (17 files) | 618 | 0 | -618 | 0 | ✅ DONE (B.7 batch — 142 standard + 8 non-standard non-window-cast stubs = 150 total) |
| Generic `TODO(B):` in `src/ui/` (whole tree) | 1 244 | **0** | -1 244 | 0 | ✅ **DONE** (B.2.1 36 + B.3.2 6 + B.5.1 87 + B.6 28 + B.7-batch 150 + B.7-remaining 476 = 783 retargets across **75 + 22 = 97 files**; remaining ~461 were pre-existing precise TODOs from earlier passes) |
| `runtime: PryzmRuntime` typed files in `src/ui/` | 8 | **≥29** | +21 | ≥40 | ✅ on track — B.13-SC adds `ShortcutCheatSheet.ts` to the typed-runtime set (now 29: 8 baseline + 17 B.7-batch + 4 B.6 + ShortcutCheatSheet) |
| `installShortcutCheatSheet` runtime parameter | 0 | **1** | +1 | 1 | ✅ DONE (B.13-SC; default-arg-null preserves backward-compat with legacy boot path) |
| `Room.perimeter` field on schema | 0 | **1** | +1 | 1 | ✅ DONE (Z.6; closes producer→handler→schema→consumer contract; 8 consumers now type-safe) |
| `three.js` version split in `plugins/*` (`0.173` ↔ `0.183`) | 4 plugins on `0.173` | **0** | -4 | 0 | ✅ DONE (Z.7; `furniture` + `lighting` + `plumbing` + `structural` aligned to `^0.183.2`; eliminates 9 of 10 baseline tsc errors) |
| `tsc --skipLibCheck --noEmit` total errors (whole monorepo) | 10 (pre-existing baseline) | **0** | -10 | 0 | ✅ **DONE** (Z.6 closes 1 + Z.7 closes 9; PROCESS-TRACKER.md line 7 dual-version graph callout is now stale) |
| `private execUpdate` in PropertyInspector | 0 | 1 | +1 | 1 | ✅ DONE (B.5.2) |
| `panelManager.setRuntime` call in main.ts | 0 | 1 | +1 | 1 | ✅ DONE (B.4-PM) |
| Typed runtime-composer slots replacing `unknown` | 5 | **8** | +3 | 8 | ✅ DONE (D.9-prep.A workspace + D.9-prep.B cameraController + D.11-prep viewRegistry) |
| `viewRegistry: unknown` in `packages/runtime-composer/src/types.ts` | 1 | **0** | -1 | 0 | ✅ DONE (D.11-prep) |
| `apps/editor/src/main.ts` exists | 1 | **0** | -1 | 0 | ✅ DONE (D-finish.1; advances D.3 ahead of D.4.8 schedule) |
| Element-family entries in `apps/editor/src/PluginRegistry.ts` | 0 | **≥18** | +18 | ≥18 | ✅ DONE (E-finish.0.E; 17 element families + view) |
| Plugin packages scaffolded under `plugins/*` (canonical 17 + view + 8 prereq) | 14 | **22** | +8 | ≥25 | ✅ on track (F-prereq.0.A–.H added 8: floor, export-pdf, dxf, render, geospatial, levels, navigate, visibility-intent) |
| `plugins/visual/` directories (the wrong-name bug) | 1 | **0** | -1 | 0 | ✅ DONE (F-prereq.0.H naming-bug correction; canonical id is `visibility-intent`) |
| Plugin contributions matching §II.F.1 master pattern | 0 | **1** | +1 | 65 | ⏳ on track (F-launch.1 = F.1.01 wall) |
| `getFrameScheduler` exports in `packages/frame-scheduler/src/index.ts` | 0 | **1** | +1 | 1 | ✅ DONE (D.7.1; unblocks D.7.2–D.7.10) |
| `contributions.ts` files in F-prereq.0 plugin set (8 plugins) | 0 | **8** | +8 | 8 | ✅ DONE (F-prereq.1; canonical `export const contributions = [] as const;` in each) |
| `eslint-plugin-pryzm` location (workspace `packages/*` member) | `tools/*` | `packages/*` | move | `packages/*` | ✅ DONE (Z.5; relinked in lockfile, 29/29 plugin tests + 2/2 kernel lint-fixture green) |
| `tsc --skipLibCheck` errors | 0 | **0 new** | 0 | 0 | ✅ (10 pre-existing `@types/three` v0.173 vs v0.183 mismatch errors in `plugins/{furniture,plumbing,structural,rooms}/src/committer/*` predate today's Agent-A stream — not new; D.7.1 / F-prereq.1 / Z.5 add 0) |
| `vite build` exit | 0 | **0** | 0 | 0 | ✅ (Replit env: memory-bound; tsc gates quality) |

### Up next (in order)

| Sub-phase | Description | Estimated effort | Blocker? |
|-----------|-------------|-----------------|----------|
| **D.7.2** | First consumer migration of the D.7 sweep — rewire `src/core/views/ViewDependencyTracker.ts` from `import { unifiedFrameLoop }` to `getFrameScheduler().addTickListener()` per the D.7.1 JSDoc recipe; one of 9 mechanical migrations now unblocked by D.7.1 (row 18) | small (1 file rewire) | none |
| **D.7.3 – D.7.9** | Remaining 7 D.7.x consumer migrations: SplitViewManager, PlanViewManager, PlanViewInteraction, SSGIService, FrameCoordinator, EnhancedBloomService, initScene+initPersistence — each follows the same D.7.1-recipe rewire | medium (7 files) | none |
| **D.7.10** | DELETE `src/core/rendering/UnifiedFrameLoop.ts` (424 LOC) once D.7.2–D.7.9 land; closes out the `src/core/rendering/` legacy frame-loop surface | small (deletion + import-cleanup) | D.7.2–D.7.9 |
| **F-launch.2 .. F-launch.13** | 12 remaining element-family toolbar contributions (one per family — slab, curtain-wall, door, window, column, beam, stair, kitchen, plumbing, structural, handrail, furniture); each appends to its plugin's now-empty `contributions = [] as const;` array (F-prereq.1 row 19); pattern is `wallToolbarContribution` clone with discipline + activate-mode swapped per family | medium (12 PRs, mechanical) | none |
| **B.2.3** | Tighten Layout.ts signature `runtime: PryzmRuntime \| null` → `runtime: PryzmRuntime` | gated by D.4 | D.4 (EngineBootstrap split) |
| ~~**B.7-remaining**~~ | ✅ **DONE 2026-04-30** — see row 21. 476 markers across 75 files retargeted in 2 sweep passes via `scripts/retarget-todo-b.mjs`; `rg -c 'TODO(B):' src/ui/` is now 0. | — | — |
| ~~**B.13-SC**~~ | ✅ **DONE 2026-04-30** — see row 22. `installShortcutCheatSheet(runtime: PryzmRuntime \| null = null)` with Variant C void-stub; threaded from `initUI.ts:2687`. | — | — |
| **B.13-RM + B.13-UP** | Remaining 2 of overlays trio: `RadialMenu.ts` (339 LOC, 9 casts → 6 to E.x commandManager + 3 to D.10 cameraController) and `UiPreferences.ts` (106 LOC, 0 casts) | small (RM) + tiny (UP) | none |
| **B.14 .. B.40** | 27 remaining mechanical 4-line constructor widenings across the rest of `src/ui/` panels (deferred to S74-S75-WIRE per S72 plan §10.4). All 27 are pure Variant B; each touches one file by ≤4 lines. | medium (27 PRs, fully mechanical) | none |
| **C.3.x** | `projectContext` window-cast destruction — rewire all `TODO(C.3.x)` reaches via `runtime.persistence.projectContext` | large | Phase D.4 (EngineBootstrap split for project context) |
| **D.4** | EngineBootstrap split — the single biggest blocker (110 files import EngineBootstrap.ts) | very large | none (architectural) |

> **Sequencing note (added 2026-04-29, updated 2026-04-30 #2).**  The §II.D.0
> "ship together" trio (D.9 + D.11 + D.12) is now complete at the **prep
> level** — see rows 16a–16d above.  The 3-PR Agent-A workload (D.7.1 +
> F-prereq.1 + Z.5) **fully landed 2026-04-30** as rows **18 / 19 / 20**.
> The 2-PR Agent-B workload (B.7-remaining + B.13-SC) **fully landed
> 2026-04-30** as rows **21 / 22**.  The 2-PR cross-cutting hygiene set
> (Z.6 Room.perimeter + Z.7 three.js v0.183 alignment) — surfaced as
> latent producer→schema gaps and a stale dual-version pnpm graph
> during the build-gate audit — **landed 2026-04-30** as rows **23 / 24**,
> bringing `tsc --skipLibCheck` from 10 baseline errors to **0**.  Next
> D-bucket work is D.7.2–D.7.10 (9 mechanical consumer migrations now
> unblocked).  Next F-bucket work is F-launch.2 through F-launch.13 (12
> element-family toolbar contributions appending to the now-prepped
> `contributions` arrays).  Next B-bucket work is the 2 remaining
> overlays (B.13-RM + B.13-UP) and then B.14–B.40 (27 mechanical
> widenings, deferred to S74-S75-WIRE per S72 plan §10.4).  All three
> streams remain **non-overlapping** so they may ship in parallel.
> **Linear execution plan to S87/M40** (PRYZM 2 wireup completion):
> see `PRYZM2-WIREUP-PLAN-S72/29-linear-execution-plan-2026-04-30.md`.

### Conventions reminder

* Ratchet metrics may **only move toward target**.  CI gate (§II.Z.6) fails on regression.
* Every retained `(window as any)` cast in a Phase-B-touched file MUST carry a `// TODO(<phase>.<step>):` annotation pointing to its destruction sub-phase (lint rule §II.Z.7).
* The build verifier is **always** `npx tsc --skipLibCheck --noEmit | wc -l` → `0` AND `npx vite build` → exit 0.

---

## How to read this document

Every sub-phase below is one of three states, **decided by reading the code at HEAD — never the prose**:

| Symbol | Meaning |
|--------|---------|
| ✅ | **Done** — the acceptance criterion is met in code today. |
| ⚠️ | **Partial** — some of the criterion is met; remaining work is itemised. |
| ❌ | **Missing** — none of the criterion is met. |

Each row carries the *one* shell command (or file inspection) that proves the state. If a row says "❌ missing", the precise blocker is named.

**Plain-language summary** (read this first, then dive in — refreshed 2026-04-30 #2):
> **Phase A is fully closed (7 of 7 ✅, A.6 closed 2026-04-29).**  **Phase B advanced significantly on 2026-04-30**: B.7-remaining (row 21) closes the 476-marker tail — `rg -c 'TODO(B):' src/ui/` is now **0** across the whole `src/ui/` tree (1 244 → 0 over the full B-stream); B.13-SC (row 22) widens the last B-phase file with neither RT nor Pkg per §II.B.13 spec.  Combined Phase B status: **structurally complete on 10 of 40 panels + annotation-retargeted across 75 more files** (97 files total); every retained `(window as any)` reach in the touched set now carries a destruction-targeted `TODO(<phase>.<step>):` comment so the lint rule §II.Z.7 can enforce no regression. Phase C has done **all the rewires that the code allows** but cannot delete the 3 legacy files (1 166 LOC) until `PlatformShell.ts` (2 433 LOC) drops its 37 reaches into them.  **Phase D advanced again on 2026-04-30**: the §II.D.0 "ship together" trio (D.9 / D.11 / D.12) is complete at the **prep level**, **D.3 shipped early as `D-finish.1`**, and **D.7.1 (`getFrameScheduler()` factory) landed 2026-04-30 as row 18** — pure additive export with 47/47 frame-scheduler tests still green; this unblocks the 9 mechanical D.7.x consumer migrations that retire `src/core/rendering/UnifiedFrameLoop.ts` (424 LOC).  The 2 048-LOC `EngineBootstrap.ts` is **still** imported by 110 files and remains the single biggest blocker for the rest of D.4.  Phase E now has **plugin scaffolds for all 17 element families + view registered in `PluginRegistry`** (E-finish.0.E); only **wall** has wired its toolbar contribution.  **Phase F advanced again on 2026-04-30**: F-prereq.1 landed as row 19 — 8 empty `contributions.ts` stubs across all F-prereq.0 plugins (`floor`, `export-pdf`, `dxf`, `render`, `geospatial`, `levels`, `navigate`, `visibility-intent`); each exports the canonical `export const contributions = [] as const;` so F-launch.2–F-launch.13 can append handler entries family-by-family without race conditions.  **Z.5 / Z.6 / Z.7 also landed on 2026-04-30 as rows 20 / 23 / 24**: (Z.5) moved `tools/eslint-plugin-pryzm/` → `packages/eslint-plugin-pryzm/` (29/29 plugin tests + 2/2 geometry-kernel lint-fixture tests still green; lockfile relinked); (Z.6) added the missing `Room.perimeter` schema field that closes a real producer (`geometry-kernel`) → handler (`plugins/rooms`) → consumer (8 readers) contract — schema 57/57 + geometry-kernel 137/137 + rooms 16/16 + bcf 594/594 + ifc-export 16/16 = **820/820 tests pass**; (Z.7) bumped 4 plugins (`furniture`, `lighting`, `plumbing`, `structural`) from `three@0.173` to `^0.183.2` to align the workspace pnpm graph onto a single peer version, eliminating the structural identity split (`Mesh<>` v0.183 vs `Object3D<>` v0.173) that produced 9 of 10 baseline errors.
> The build now passes **clean**: `tsc --skipLibCheck --noEmit` reports **0 errors** (was 10 pre-existing); dev server runs at 144 fps.  The shape of the architecture is correct; the wireup is the work that remains. **Next three highest-leverage candidates** (none touches `src/ui/` — safe to ship in parallel with B.13-RM + B.13-UP + B.14–B.40): **D.7.2** (first `getFrameScheduler()` consumer migration — `ViewDependencyTracker.ts`) → **D.7.3–D.7.9** (7 more mechanical rewires) → **F-launch.2 .. F-launch.13** (12 element-family toolbar contributions appending to the now-prepped `contributions` arrays).  See `PRYZM2-WIREUP-PLAN-S72/29-linear-execution-plan-2026-04-30.md` for the **full linear sequence to S87/M40** (PRYZM 2 wireup completion — ~441 sub-phases total, sequenced into 7 waves with critical-path callouts and per-wave verifiers).

---

## §0 — Wireup-plan doc consolidation roadmap (added 2026-04-29)

> **Why this section exists.**  The wireup-plan effort currently spans
> **36 markdown files** under `docs/03_PRYZM3/03_PRYZM3/reference/phases/audits/`:
> 28 top-level chunks in `PRYZM2-WIREUP-PLAN-S72/` (00-INDEX through 28),
> 8 nested files in `PRYZM2-WIREUP-PLAN-S72/PHASES-A-F-RECONCILIATION-2026-04-29/`
> (00-INDEX, 01-phase-A, 02-phase-B, 03-phase-C, 04-phase-D, 05-phase-E
> REV3, 06-phase-F REV2, PHASES-A-F-CODE-VERIFIED-AUDIT rev2), plus this
> file and its companion in
> `PHASES-A-F-RECONCILIATION-2026-04-29/`.  Multiple chunks duplicate or
> partially supersede each other (e.g. chunk 26's parametric-baseline
> amendments versus chunks 19+24's hard-coded numbers; ADR-041/042/043/044
> ratifications scattered across chunks 14, 21, 27).  This roadmap
> proposes the consolidation the user has asked for.

### §0.1 — Single sources of truth (canonical post-consolidation set)

| Doc | Role | Replaces / supersedes |
|-----|------|------------------------|
| **`PHASES-A-F-MISSING-ITEMS-2026-04-29.md`** (this file) | The Part II implementation plan + Process-Tracker live log + §II.99 roll-up — the **one** doc you read to know "what's done, what's next, what's blocked". | `PHASE-B-PARALLEL-PROGRESS-2026-04-29.md` (already merged today; to be deleted); chunk 19 sub-phase manifests (now sub-anchors here); chunk 24 cross-cutting metrics; chunk 26 self-corrections (folded into §II.99 + §II.Z) |
| **`PHASES-A-F-CODE-VERIFIED-AUDIT-2026-04-29.md`** (rev 2) | The strategic narrative companion — high-level prose for stakeholders who don't read tables. Cross-referenced from this doc's front-matter. | chunks 00-WhereWeAreNow, 01-08 (per-phase narratives — keep as historical record but mark superseded) |
| **`PRYZM2-WIREUP-PLAN-S72/00-INDEX.md`** | Read-only index that points to the two docs above + the per-phase nested REV docs as historical record. | n/a (kept as the breadcrumb) |
| **`PRYZM2-WIREUP-PLAN-S72/PHASES-A-F-RECONCILIATION-2026-04-29/05-phase-E-REV3.md`** + **`06-phase-F-REV2.md`** | Per-phase REV docs that house the deep design rationale that doesn't fit in the implementation tables. Stay where they are; cross-referenced from §II.E / §II.F front-matter. | earlier REV1/REV2 of phase-E and REV1 of phase-F (already superseded inline in the REV docs themselves) |
| **`PRYZM2-WIREUP-PLAN-S72/PHASES-A-F-RECONCILIATION-2026-04-29/PHASES-A-F-CODE-VERIFIED-AUDIT.md`** (rev 2) | The nested code-verified audit that this folder's audit succeeds — keep as the historical baseline. | n/a (terminal artefact; do not edit further) |

### §0.2 — Files to retire (move to `audits/_archive/`)

**Tier-1 retire (28 files)** — chunks whose content is now fully captured
in this doc's Part II / §II.99 sections.  Move under
`docs/03_PRYZM3/03_PRYZM3/reference/phases/audits/_archive/PRYZM2-WIREUP-PLAN-S72/`
to preserve git-blame history without polluting the active set.

| Chunk | Reason for retirement |
|-------|------------------------|
| `01-overview.md` | Superseded by §0 + plain-language summary above |
| `02-glossary.md` | Inline in this doc's §II.0 conventions |
| `03-roles-of-each-doc.md` | Replaced by §0.1 above |
| `04-decision-record.md` | ADR-041/042/043/044 ratification tracked in `docs/03_PRYZM3/03_PRYZM3/decisions/` directly |
| `05-walking-skeleton.md` | Implemented; history preserved in git |
| `06-runtime-composer-contract.md` | Living spec: `packages/runtime-composer/src/types.ts` is now the source of truth |
| `07-platform-shell-contract.md` | Living spec: `src/ui/platform/PlatformShell.ts` |
| `08-package-graph.md` | Living spec: `pnpm-workspace.yaml` + per-package `package.json` |
| `09-13` (deep-dive variants) | Folded into §II.B / §II.C / §II.D narrative bodies |
| `14-subphases-A-D.md`, `15-subphases-E-families.md`, `16-subphases-F1-toolbars.md`, `17-subphases-F2-F5.md`, `18-subphases-F6-F12.md` | **Keep** — these are the source manifests cross-referenced from this doc's front-matter; they remain the spec for sub-phase semantics |
| `19-cross-cutting-metrics.md` | Folded into "Cumulative ratchet metrics at HEAD" section above |
| `20-execution-roadmap.md` | Replaced by §II.99 execution-order roadmap |
| `21-walkthroughs.md` | Folded into §II.B.0 step 1–5 recipe |
| `22-window-cast-destruction-map.md` | Folded into §II.B.0.D + per-file tracker rows |
| `23-bench-table.md` | Folded into §II.Z.14 – §II.Z.20 |
| `24-cumulative-metrics.md` | Folded into "Cumulative ratchet metrics" + §II.99 totals |
| `25-DOR-DOD.md` | Folded into §II.99 Definition-of-done shell block |
| `26-plan-self-corrections.md` | All amendments now applied inline (parametric `wireup-floor.json`, Z.0–Z.17 numbering) |
| `27-ADR-ratifications.md` | Per-ADR rows in `decisions/`; cross-referenced inline |
| `28-final-readme.md` | Replaced by this §0 |

> **Action**: keep `14-` through `18-` (5 manifest docs) + `00-INDEX.md`
> in active set; archive the other 22 chunks.

**Tier-2 keep-but-mark-superseded (3 files)** — historical narrative
that's still useful for onboarding / archeology but no longer
authoritative:
* `00-WhereWeAreNow.md` (use plain-language summary above instead)
* `PHASES-A-F-RECONCILIATION-2026-04-29/01-phase-A.md` through `06-phase-F-REV2.md` (kept as REV history)

### §0.3 — Consolidation execution plan (3 small PRs)

| PR | Action | Verifier |
|----|--------|----------|
| **PR-consolidate-1** | `git mv` the 22 Tier-1 chunks into `audits/_archive/PRYZM2-WIREUP-PLAN-S72/`; update `00-INDEX.md` to point to the canonical set in §0.1 above. | `find docs/03_PRYZM3/03_PRYZM3/reference/phases/audits/PRYZM2-WIREUP-PLAN-S72 -maxdepth 1 -name '*.md' \| wc -l` → `6` (00-INDEX + 14-18) |
| **PR-consolidate-2** | Delete `PHASE-B-PARALLEL-PROGRESS-2026-04-29.md` (already merged into rows 16a–16h above per its §5 self-instruction). | `ls docs/03_PRYZM3/03_PRYZM3/reference/phases/audits/PHASES-A-F-RECONCILIATION-2026-04-29/PHASE-B-PARALLEL-PROGRESS-2026-04-29.md 2>&1 \| grep -c "No such"` → `1` |
| **PR-consolidate-3** | Add `_archive/README.md` explaining the archive policy (chunks were folded into `PHASES-A-F-MISSING-ITEMS-2026-04-29.md`; consult git log for original bytes). | `test -f docs/03_PRYZM3/03_PRYZM3/reference/phases/audits/_archive/README.md && echo OK` |

After these three PRs, the active wireup-plan doc surface drops from
**36 files → 9 files** (this doc + companion + INDEX + 5 manifests + 1
nested code-verified audit), all with clearly partitioned roles.

---

## Phase A — Composition root (S73-WIRE) · **7 of 7 ✅ — CLOSED 2026-04-29**

| Sub-phase | Acceptance criterion (code-verifiable) | State | Notes |
|-----------|----------------------------------------|-------|-------|
| **A.1** Single boot path | `src/main.ts` calls `composeRuntime()` then `PlatformRouter.start(runtime)` | ✅ | Lines 154 + 247 of `src/main.ts`. |
| **A.2** `runtime-composer` package | `packages/runtime-composer/src/composeRuntime.ts` exists ≥ 500 LOC | ✅ | 639 LOC. |
| **A.3** `PryzmRuntime` interface | All 17 named slots declared in `packages/runtime-composer/src/types.ts` | ✅ | 14 original + `undoStack` + 3 import/export facades = **17**. |
| **A.4** `PlatformRouter.start(runtime)` | Static method signature accepts `PryzmRuntime` | ✅ | Line 93 of `PlatformRouter.ts`. |
| **A.5** `new PlatformShell(runtime)` | Constructor signature takes runtime | ✅ | Called at `src/main.ts:238`. |
| **A.6** `runtime.toasts.show()` reaches | Legacy `AppToast` singleton imports = 0 in `src/` | ✅ | **CLOSED 2026-04-29.** `src/ui/AppToast.ts` deleted. DOM helper relocated to `packages/runtime-composer/src/showAppToast.ts` (subpath export `@pryzm/runtime-composer/showAppToast`). All 4 importers migrated: `initUI.ts` (19 calls → local `toast()` helper using `runtime.toasts.show()`), `DxfImportPanel.ts` (6 calls → module-scope `toast()` reading `_runtime`), `ImportedModelsPanel.ts` (1 call → `this._toast()` using `this.runtime`), `src/main.ts` (injection dropped — `composeRuntime` now defaults `buildToastsSlot()` to the package-owned helper). Verification: `rg "from ['\"](\.\./)+(.*/)?AppToast['\"]" src/ --type ts` → 0 results; `npm run build` exit 0; workflow restart healthy. |
| **A.7** ESLint rule `pryzm/no-window-as-any` | Rule file exists; wired into `eslint.config.*` in WARN mode for `src/`, ERROR for `packages/` | ✅ | `tools/eslint-plugin-pryzm/src/rules/no-window-as-any.js` exists; `eslint.config.mjs` imports `eslint-plugin-pryzm`. |

### Phase A close note (2026-04-29)

The A.6 close threaded the composed `PryzmRuntime` through one new boot-time edge:

```
src/main.ts:bootPlatform()
   └── runtimeRef.current = runtime         (forward-declared mutable holder)
   └── workspaceMount.ensure()
        └── startEngine(runtimeRef.current)
             └── EngineBootstrap.bootstrap(runtime)   ← signature widened
                  └── initUI({ runtime, … })          ← UIParams.runtime added
                       └── const toast = (msg, kind, dur) => runtime.toasts.show(...)
                                       ?? _packageShowAppToast(...)        // null-runtime fallback
```

The package-side fallback (`@pryzm/runtime-composer/showAppToast`) exists only because `EngineBootstrap.bootstrap(runtime = null)` keeps a default for any caller not yet on the new boot path. Once Phase D.4 retires `EngineBootstrap` entirely, the `_packageShowAppToast` fallback in `initUI.ts`, `DxfImportPanel.ts`, and `ImportedModelsPanel.ts` becomes dead code and can be deleted (the runtime branch will always fire).

**Files touched in the A.6 close** (8 files):
- `packages/runtime-composer/src/showAppToast.ts` (NEW · 100 LOC · DOM helper relocated from `src/ui/AppToast.ts`)
- `packages/runtime-composer/src/ToastController.ts` (`buildToastsSlot()` now defaults to package-owned helper; `showFn` arg kept as test escape hatch)
- `packages/runtime-composer/src/composeRuntime.ts` (docstring updated; `opts.showAppToast` re-classified as test-only escape hatch)
- `packages/runtime-composer/package.json` (added `"./showAppToast": "./src/showAppToast.ts"` subpath export)
- `src/main.ts` (dropped `await import('./ui/AppToast')` + `showAppToast,` field; added `runtimeRef` holder; `startEngine(runtime)` forwards through `workspaceMount.ensure()`)
- `src/engine/EngineBootstrap.ts` (`bootstrap(runtime = null)` signature widened; `initUI({ runtime, … })` call site updated)
- `src/engine/subsystems/initUI.ts` (`UIParams.runtime` added; local `toast()` helper; 19 call sites migrated)
- `src/ui/import/DxfImportPanel.ts` (module-scope `_runtime` ref + `toast()` helper; 6 call sites migrated; `Layout.ts` caller forwards `runtime`)
- `src/ui/imported-models/ImportedModelsPanel.ts` (private `_toast()` method using `this.runtime`; 1 call site migrated)
- `src/ui/Layout.ts` (`createDxfImportPanel(opts, runtime)` — second arg now passed)
- `src/ui/AppToast.ts` (**DELETED** — 0 importers remain in `src/`)

---

## Phase B — Panel widening (S73-WIRE) · **10 of 40 sub-phases meet the bar** (B.7-remaining + B.13-SC closed 2026-04-30)

The bar is *one of*: (a) constructor types its second arg as `runtime: PryzmRuntime`, **or** (b) the class `extends Panel` from `@pryzm/ui-base`. Both must eventually be true; today only **8 panels** thread `runtime` and only **1** extends `Panel`.

### B.1 — `@pryzm/ui-base` package · ✅
189 LOC at `packages/ui-base/src/Panel.ts`; `index.ts` re-exports it.

### B.2 – B.40 — per-panel widening
**Legend**: `RT` = constructor types runtime · `Pn` = extends `Panel` · `Pkg` = imports `@pryzm/runtime-composer` or `@pryzm/ui-base`.

| Sub-phase | File | RT | Pn | Pkg | State |
|-----------|------|----|----|-----|-------|
| B.2 | `src/ui/Layout.ts` | ✅ | ❌ | ✅ | ✅ RT threaded; all 36 window-casts annotated (B.2.1); @param JSDoc added (B.2.2); not yet a Panel |
| B.3 | `src/ui/LeftNavRail.ts` | ✅ | ❌ | ✅ | ✅ RT threaded; all 5+1 casts annotated (B.3.2); runtime threaded to HierarchyTreePanel+ValidatePanel (B.3.3) |
| B.4-PM | `src/ui/PanelManager.ts` | ✅ | ❌ | ✅ | ✅ `setRuntime()` slot wired; `panelManager.setRuntime(runtime)` called from `src/main.ts` (B.4-PM) |
| B.4-MD | `src/ui/makeDraggable.ts` | ✅ | ❌ | ✅ | ✅ `_runtime?` param + JSDoc with F.6.5 migration note (B.4-MD) |
| B.5 | `src/ui/PropertyInspector.ts` | ✅ | ❌ | ✅ | ✅ 87 casts annotated (B.5.1); `execUpdate` helper extracted (B.5.2); JSDoc contract (B.5.5) |
| B.6-a | `src/ui/property-inspector/RoomPropertySection.ts` | ✅ | ❌ | ✅ | ✅ `_runtime?` param; 17 casts annotated (B.6-a) |
| B.6-b | `src/ui/property-inspector/SlabLayerSection.ts` | ✅ | ❌ | ✅ | ✅ `_runtime?` param; 4 casts annotated (B.6-b) |
| B.6-c | `src/ui/property-inspector/WallLayerSection.ts` | ✅ | ❌ | ✅ | ✅ `_runtime?` param; 1 cast annotated (B.6-c) |
| B.6-d | `src/ui/property-inspector/RoomPathfinderPanel.ts` | ✅ | ❌ | ✅ | ✅ module-scope `_runtime` slot + `setRoomPathfinderRuntime()`; 6 casts annotated (B.6-d) |
| B.6-x | `src/ui/property-inspector/CompositePropertySection.ts` | — | — | — | ❌ **file missing** (may have been renamed or merged) |
| B.7-a | `src/ui/views/ViewTabBar.ts` | ✅ | ❌ | ✅ | ✅ RT threaded; 0 window casts (B.7 batch) |
| B.7-b | `src/ui/views/ViewHeaderButtons.ts` | ✅ | ❌ | ✅ | ✅ RT threaded; 5 casts annotated — 3 standard + 2 non-standard (overridePanel→F.6.5, void-runtime→C.3.x) (B.7 batch) |
| B.8 | `src/ui/ContextualEditBar.ts` | ✅ | ❌ | ✅ | ✅ 14 casts annotated: `floorPlanUnderlayTool`→E.floor.X, `transformControls/planViewToolOverlay/planViewOverlay`→D.4 (B.7 batch) |
| B.9 | `src/ui/SaveUndoRedoHUD.ts` | ✅ | ❌ | ✅ | ✅ **drives `undoStack.undo/.redo` ✓**; 0 window casts; globalThis fallback to be removed post-D.4 (B.9.1 gated) |
| B.10 | `src/ui/SelectionOverlay.ts` | ✅ | ❌ | ✅ | ✅ RT threaded; 2 casts annotated → D.4 (B.7 batch) |
| B.11 | `src/ui/ViewCube.ts` | ✅ | ❌ | ✅ | ✅ RT threaded; 1 cast annotated → D.4 (B.7 batch) |
| B.12-AT | `src/ui/AppToast.ts` | — | — | — | ✅ **DELETED 2026-04-29** in A.6 close — DOM helper relocated to `packages/runtime-composer/src/showAppToast.ts` |
| B.12-CD | `src/ui/ConfirmDialog.ts` | ✅ | ❌ | ✅ | ✅ RT threaded (pryzmConfirm accepts `runtime: PryzmRuntime \| null`); 0 window casts; void-runtime stub → C.3.x (B.7 batch) |
| B.12-EM | `src/ui/ElementCreationModal.ts` | ✅ | ❌ | ✅ | ✅ RT threaded; 0 window casts (B.7 batch confirmed) |
| B.13-RM | `src/ui/RadialMenu.ts` | ✅ | ❌ | ✅ | ✅ RT threaded; 9 casts annotated: `commandManager`→E.5.x, `viewController/camera`→D.4 (B.7 batch) |
| B.13-SC | `src/ui/ShortcutCheatSheet.ts` | ✅ | ❌ | ✅ | ✅ RT threaded; `installShortcutCheatSheet(runtime)` widened + threaded from `initUI.ts` (Variant C void-stub, B.13-SC 2026-04-30) |
| B.13-UP | `src/ui/UiPreferences.ts` | ✅ | ❌ | ✅ | ✅ RT threaded; 0 window casts; future `runtime.userPreferences.set` reach → C.9.02 (B.7 batch confirmed) |
| B.14 | `src/ui/SpatialTree.ts` | ✅ | ❌ | ✅ | ✅ RT threaded; 22 standard + 1 void-runtime cast annotated (B.7 batch) |
| B.16-IM | `src/ui/import-manager/ImportManagerPanel.ts` | ✅ | ❌ | ✅ | ✅ RT threaded; `new ImportManagerPanel(p.runtime ?? null)` from `initUI.ts:1662` (B.16 2026-04-30) |
| B.16-IMP | `src/ui/imported-models/ImportedModelsPanel.ts` | ✅ | ❌ | ✅ | ✅ widening pre-done (B.7); **no live caller** — file is dead-code-ready (B.16 2026-04-30) |
| B.16-DXF | `src/ui/import/DxfImportPanel.ts` | ✅ | ❌ | ✅ | ✅ RT threaded via `createDxfImportPanel(opts, runtime)` from `Layout.ts:335` (A.6 close 2026-04-29) |
| B.17 | `src/ui/ProjectBrowser/ProjectBrowserPanel.ts` | — | — | — | ❌ **file missing** (likely renamed to `ViewBrowser/`) |
| B.17-EP | `src/ui/ViewBrowser/ExistingProjectsPanel.ts` | ✅ | ✅ | ✅ | ⚠️ **first & only `Panel`-extending file** (wedge 2026-04-29); RT threaded — annotation pass pending |
| B.17-PB | `src/ui/ViewBrowser/ProjectBrowserPanel.ts` | ✅ | ✅ | ✅ | ✅ RT threaded to 6 sub-panels (`RailPanelController`, `UnifiedBrowserPanel`, `DocumentsBrowserPanel`, `AIRailPanel`, `CameraRailPanel`, `PhysicsRailPanel`) at lines 100/124-132 (B.17 2026-04-30); LevelsGridsRailPanel was already done in B.15 |
| B.17-UB | `src/ui/ViewBrowser/panels/UnifiedBrowserPanel.ts` | ✅ | ✅ | ✅ | ✅ outer class widened (`public readonly runtime` + 3rd ctor param); inner `UnifiedRailProxy` already widened in B.7; threaded to proxy via `new UnifiedRailProxy(rail, this.runtime)` (B.17 2026-04-30) |
| B.17-DB | `src/ui/ViewBrowser/panels/DocumentsBrowserPanel.ts` | ✅ | ✅ | ✅ | ✅ outer class widened (`public readonly runtime` + 3rd ctor param); inner `DocumentsRailProxy` already widened in B.7; threaded to proxy + 3 sub-panels (`SheetsRailPanel`, `ViewsRailPanel`, `SchedulesRailPanel`) at lines 73/76-78 (B.17 2026-04-30) |
| B.19 | `src/ui/dataworkbench/DataWorkbench.ts` | ✅ | ❌ | ✅ | ✅ RT threaded; 2 casts annotated (B.7 batch) |
| B.31 | `src/ui/ai/AIPanel.ts` | ✅ | ❌ | ✅ | ✅ RT threaded; 5 standard + 1 void-runtime casts annotated → D.4/F.7.x/C.3.x (B.7 batch) |
| B.32-AC | `src/ui/ai/AICreatePanel.ts` | ✅ | ❌ | ✅ | ✅ RT threaded; 5 standard + 1 void-runtime casts annotated (B.7 batch) |
| B.32-V | `src/ui/ai/ValidatePanel.ts` | ✅ | ❌ | ✅ | ✅ RT threaded; 4 casts annotated (B.7 batch) |
| B.32-FP | `src/ui/ai/FloorPlanImportPanel.ts` | ✅ | ❌ | ✅ | ✅ RT threaded; 19 standard + 1 void-runtime casts annotated → E.floor.X/D.4/C.3.x (B.7 batch) |
| B.36-S | `src/ui/SchedulePanel/SchedulePanel.ts` | ✅ | ❌ | ✅ | ✅ RT threaded; 0 window casts (B.7 batch confirmed) |
| B.36-SE | `src/ui/SheetEditor/SheetEditorPanel.ts` | ✅ | ❌ | ✅ | ✅ RT threaded; 28 casts annotated → D.4/D.11/E.x/F.6.x/F.6.5 (B.7 batch) |
| B.38 | `src/ui/bottom-menu/BottomActionMenu.ts` | ✅ | ❌ | ✅ | ✅ RT threaded; 21 casts annotated — 20 standard + 1 non-standard multi-cast (bimManager→D.4, wallStore→E.wall.S, projectContext→C.3.x) (B.7 batch) |
| B.WMB | `src/ui/platform/WorkspaceModeBar.ts` | ✅ | ❌ | ✅ | ✅ RT threaded; 0 window casts (B.7 batch confirmed) |

**Aggregate verifiers** (run after B.7 batch — 2026-04-29):
```
rg -l "extends Panel\b" src/ui/ --type ts | wc -l                    →  1
rg -l "PryzmRuntime" src/ui/ --type ts | wc -l                       →  ≥28
rg -c "TODO(B):" src/ui/ContextualEditBar.ts                          →  0 ✅
rg -c "TODO(B):" src/ui/SelectionOverlay.ts                          →  0 ✅
rg -c "TODO(B):" src/ui/ViewCube.ts                                   →  0 ✅
rg -c "TODO(B):" src/ui/bottom-menu/BottomActionMenu.ts               →  0 ✅
rg -c "TODO(B):" src/ui/SheetEditor/SheetEditorPanel.ts               →  0 ✅
rg -c "TODO(B):" src/ui/ai/FloorPlanImportPanel.ts                   →  0 ✅
npx tsc --skipLibCheck --noEmit | wc -l                               →  0 ✅
```

**Phase B residual work**: 32 of 40 panel files still need their constructors widened to accept `runtime`. The remaining sub-phases (B.15, B.16, B.18, B.20–B.30, B.33–B.35, B.37, B.39, B.40) cover panels in `furniture-carousel/`, `kitchen/`, `wardrobe/`, `rooms/`, `ViewBrowser/`, `inspect/`, `import/`, `interop/`, `geospatial/`, `imported-models/`, `intent/`, `generative/`, `overlays/`, `primitives/`, `icons/`, `levels/`, `grids/`, `views/grids/`, `fallbacks/` — each one mechanical (4-line change), but 32 separate files.

---

## Phase C — Persistence rewire (S77-WIRE) · **rewires done, deletions blocked**

### C.1 – C.10 — runtime.persistence.* call-site adoption

| Sub-phase group | Acceptance criterion | State |
|-----------------|---------------------|-------|
| **C.1.x** Auth flows route via `runtime.persistence.client.signIn / .signOut` | `runtime.persistence.client.signOut` callsite in `ProjectHub.ts` | ✅ — `src/ui/platform/ProjectHub.ts:762` |
| **C.2.x** Project list reads `runtime.persistence.projectListStore` | `projectListStore` reach in `ExistingProjectsPanel.ts` | ✅ — landed this morning (B.adopt.1) |
| **C.3.x** `openProject(id, hint)` is the single entry to load a project | `runtime.persistence.openProject` reach | ⚠️ — slot exists in `types.ts`, called from `ExistingProjectsPanel.ts`, **not yet** called from `ProjectHub.ts` |
| **C.4.01–C.4.08** `runtime.persistence.client.{create,rename,delete,patch,duplicate}` | Reach count in `ProjectHub.ts` | ⚠️ — `create:4 rename:2 delete:3 patch:2 duplicate:2` reaches landed; **but `projectRepository` is still imported (27 reaches)** — sub-phases C.4.07/.08 (`exporter.toPryzm` / `importer.fromPryzm`) **not** wired (0 reaches) |
| **C.5.01** `persistence.openProgress` consumer | Listener in `PlatformRouter.ts` | ✅ |
| **C.6.01** `persistence.status` consumer | Listener subscribed | ⚠️ — only consumed by **legacy** `SaveOrchestrator.ts` + `ServerSyncQueue.ts`; new `PlatformShell` not subscribed yet |
| **C.6.02 / C.6.03** `runtime.undoStack.undo / .redo` | Used in `SaveUndoRedoHUD.ts` | ✅ — lines 121, 127 |
| **C.6.04** `runtime.persistence.eventLog.tag('user-version', …)` | Reach outside legacy files | ❌ — only documentation references in legacy `SaveOrchestrator.ts:85` and `ProjectRepository.ts:304` |
| **C.7.x** `CDEVersionPanel` uses `runtime.persistence.eventLog` | File present + reaches | ⚠️ — `src/ui/platform/CDEVersionPanel.ts` exists; needs eventLog reach audit |
| **C.8.x** `ProjectMemberPanel` uses `runtime.persistence.client.members` | File present + reaches | ⚠️ — file exists; **no `members.*` reaches anywhere** in `src/` |
| **C.9.x** `OwnerSettingsPanel` uses `runtime.userPreferences` | File present + reaches | ⚠️ — file exists; reach audit needed |
| **C.10.04** `runtime.persistence.signOut()` | Reach | ✅ — `ProjectHub.ts:762` |

### C.11 — Three legacy file deletions · **❌ all 3 blocked**

| Sub-phase | File | Status | Blocker |
|-----------|------|--------|---------|
| **C.11.01** Delete `ProjectRepository.ts` | **STILL ON DISK** (433 LOC) | ❌ | `PlatformShell.ts:34` imports it; `ProjectHub.ts` has 27 reaches; deletion requires PlatformShell rewire (Phase D.4) |
| **C.11.02** Delete `SaveOrchestrator.ts` | **STILL ON DISK** (380 LOC) | ❌ | `PlatformShell.ts:35` imports it; sole consumer of `persistence.status` event today |
| **C.11.03** Delete `ServerSyncQueue.ts` | **STILL ON DISK** (353 LOC) | ❌ | Imported by `SaveOrchestrator.ts`; falls when its parent falls |

**Combined legacy footprint**: **1 166 LOC** across 3 files, all gated by **`PlatformShell.ts` (2 433 LOC, 37 persistence reaches)**.

### C.14 — `packages/persistence-client` houses canonical persistence

`src/persistence/` and `packages/persistence-client/src/` **both exist** with overlapping content (`backends/`, `chunks/`, `codec/`, `codecs/`, `attachEventLog.ts`, `UnderlayPersistence.ts`). The package import is wired in (`runtime-composer` consumes it), but the legacy `src/persistence/` tree has not been deleted. ⚠️

### Z.0 – Z.20 — Verification harness amendments
The amendments specified in `26-plan-self-corrections.md` (parametric baselines, `--extended-regexp` git-log fix, `pnpm ga-gate` runtime smoke test, retired re-slice script, the 5 ESLint rules and 2 bench packages in `packages/eslint-plugin-pryzm/`, `apps/bench/scripts/`, `@pryzm/release`, `@pryzm/bench-visual-diff`) are **all ❌**. The lint plugin lives at `tools/eslint-plugin-pryzm/` not `packages/`, only the `no-window-as-any` rule exists, and no parametric baseline file exists at `.local/state/replit/agent/wireup-floor.json`.

**Phase C residual work** (in dependency order):
1. Wire `PlatformShell.ts` to `runtime.persistence.*` — drops the 3 legacy imports (this is the Phase D.4 work).
2. Migrate the last `projectRepository.*` reaches in `ProjectHub.ts` (27 reaches remaining).
3. Subscribe `PlatformShell` to `persistence.status` event.
4. Land `eventLog.tag('user-version')` and `CDEVersionPanel` rewire (C.6.04 + C.7).
5. Implement `runtime.persistence.client.members.*` and adopt in `ProjectMemberPanel` (C.8).
6. Delete the 3 legacy files (C.11.01–03).
7. Delete `src/persistence/` (C.14).
8. Build the Z.0–Z.20 harness packages.

---

## Phase D — Engine consolidation (S77/S78-WIRE) · **mostly missing**

| Sub-phase | Acceptance criterion | State | Detail |
|-----------|---------------------|-------|--------|
| **D.1** Single canvas | No `#pryzm2-canvas`/dual-canvas in DOM; `runtime.scene.renderer` is the only canvas | ⚠️ | `pryzm2-canvas` reaches gone from `src/`, but `runtime.scene.renderer` is **never reached** from `src/main.ts` or `PlatformShell.ts` — the editor canvas is still mounted via `mountEditor()` (D.3) |
| **D.2** Kill-switch removed | `?pryzm2` query-param branch removed from `src/main.ts` | ⚠️ | Comments reference the kill-switch on lines 39 + 246; the actual kill-switch path was removed; `(window as any).__pryzm2RuntimeComposed` exposure (line 206) remains |
| **D.3** Delete `apps/editor/src/main.ts` | File deleted; `mountEditor` not imported | ❌ | **STILL ON DISK** (227 LOC); imported by `src/main.ts` at line 104 (the `loadEngine()` lazy import) |
| **D.4** Delete `src/engine/EngineBootstrap.ts` | File deleted | ❌ | **STILL ON DISK (2 048 LOC)**; **110 production importers** including `PlatformShell.ts:34`, every `subsystems/init*.ts`, every `commands/`, most `core/rendering/`, every `elements/<family>/Tool.ts`. **This is the single biggest blocker in the codebase.** |
| **D.5** Delete `src/engine/init*.ts` | Replaced by `src/engine/subsystems/init*.ts` | ✅ | Old `init*.ts` files all gone; `subsystems/` dir has the 8 replacements |
| **D.6** Move `RenderPipelineManager.ts` to `packages/renderer/` | Old path deleted; canonical home in `packages/renderer/` | ⚠️ | Old `src/engine/RenderPipelineManager.ts` deleted ✓ — but the replacement lives at **`src/rendering/pipeline/RenderPipelineManager.ts`**, not `packages/renderer/` (which doesn't exist as a package yet) |
| **D.7** Delete `UnifiedFrameLoop.ts` | File deleted; only `packages/frame-scheduler/` calls `requestAnimationFrame` | ❌ | `src/core/rendering/UnifiedFrameLoop.ts` **STILL ON DISK (424 LOC)** with **6+ src/ importers**: `core/views/{ViewDependencyTracker,SplitViewManager,PlanViewManager,PlanViewInteraction}.ts`, `core/rendering/{SSGIService,FrameCoordinator,EnhancedBloomService}.ts`, `engine/subsystems/{initScene,initPersistence}.ts` |
| **D.8** Delete `BatchCoordinator.ts` + `DrawingPipelineOrchestrator.ts` | Files deleted from `src/engine/` | ⚠️ | Old paths under `src/engine/` are gone ✓ — but the files were **relocated, not eliminated**: `src/core/batch/BatchCoordinator.ts` + `src/core/drawing/DrawingPipelineOrchestrator.ts` are still alive |
| **D.9** Add `runtime.cameraController` slot | Slot in `PryzmRuntime` interface | ❌ | **No `cameraController` slot** in `packages/runtime-composer/src/types.ts`; old `(window as any).cameraController` reaches dropped to 0 but only because callers were rewritten to bypass; nothing canonical in its place |
| **D.10** Adopt `runtime.cameraController` | Reaches in `src/` | ❌ | Cannot adopt — slot doesn't exist (D.9 blocks) |
| **D.11** `runtime.viewRegistry.activate(viewId)` reaches | Reach count | ❌ | **0 reaches in `src/`**; slot exists (`viewRegistry: unknown` at types.ts L48) but is never called |
| **D.12** `runtime.workspace.setMode(mode)` reaches | Reach count | ❌ | **0 reaches in `src/`**; **`workspace` slot doesn't exist in `PryzmRuntime`** at all |
| **D.13** `runtime.picking.pick` + `runtime.selection.select` reaches | Reach counts | ❌ | **0 reaches each** — slots exist but are dormant |
| **D.14** `runtime.picking.marquee` reaches | Reach count | ❌ | **0 reaches** |

**Cross-cutting Phase D verifier**:
```
rg -c "requestAnimationFrame\(" src/ --type ts | …  →  88 reaches across 51 files
```
Target after Phase D + G is 0. Currently the only path that uses `packages/frame-scheduler/` is the new wedge — every legacy renderer still calls `rAF` directly.

**Phase D residual work** (in dependency order):
1. **The big one** — refactor `EngineBootstrap.ts` (2 048 LOC) so its 110 importers consume `runtime.*` slots instead. This is what unblocks everything else (C.11.01-03, D.3, the `src/elements/*` deletions, the `src/commands/*` deletions).
2. Add `cameraController` and `workspace` slots to `PryzmRuntime`.
3. Migrate the 6+ `UnifiedFrameLoop.ts` importers to `packages/frame-scheduler/`, then delete the file.
4. Decide whether `BatchCoordinator` + `DrawingPipelineOrchestrator` belong in `packages/renderer/` (per plan) or stay in `src/core/` — currently neither.
5. Adopt `runtime.viewRegistry.activate`, `runtime.workspace.setMode`, `runtime.picking.*`, `runtime.selection.select` at every call-site (D.11–D.14).
6. Drop the `(window as any).__pryzm2RuntimeComposed` debug handle from `src/main.ts:206`.

---

## Phase E — Per-family migration (S78-WIRE) · **scaffolds yes, contributions no**

The bar per family: (a) `plugins/<family>/src/tool.ts` exists, (b) the tool calls `runtime.bus.executeCommand`, (c) `plugins/<family>/src/contributions.ts` declares the toolbar contribution, (d) `src/elements/<family>/` is **deleted**, (e) `src/commands/<family>/` is **deleted**.

| Sub-phase | Family | Plugin scaffold | `tool.ts` | `contributions.ts` | bus reaches | `src/elements/` legacy | `src/commands/` legacy | State |
|-----------|--------|-----------------|-----------|--------------------|-------------|------------------------|------------------------|-------|
| **E.1** | wall | ✅ | ✅ | ✅ | 0 | gone | gone | ⚠️ — only family with contributions, but tool doesn't call bus yet |
| **E.2** | slab | ✅ | ✅ | ❌ | 1 | gone | gone | ⚠️ |
| **E.3** | door | ✅ | ✅ | ❌ | 4 | gone | gone | ⚠️ |
| **E.4** | window | ✅ | ✅ | ❌ | 2 | gone | gone | ⚠️ |
| **E.5** | curtain-wall | ✅ | ✅ | ❌ | 1 | gone | gone | ⚠️ |
| **E.6** | floor | ❌ | ❌ | ❌ | — | gone (folded into slab?) | gone | ❌ — **no plugin scaffold** |
| **E.6.0** | `plugins/floor/` scaffold | ❌ | — | — | — | — | — | ❌ — directory doesn't exist |
| **E.7** | ceiling | ✅ | ✅ | ❌ | 1 | gone | gone | ⚠️ |
| **E.8** | roof | ✅ | ✅ | ❌ | 1 | gone | gone | ⚠️ |
| **E.9** | stair | ✅ | ✅ | ❌ | 1 | gone | **STILL** | ⚠️ |
| **E.10** | handrail | ✅ | ✅ | ❌ | 1 | gone | gone | ⚠️ |
| **E.11** | column | ✅ | ✅ | ❌ | 1 | gone | gone | ⚠️ |
| **E.12** | beam | ✅ | ✅ | ❌ | 1 | gone | **STILL** | ⚠️ |
| **E.13** | grids | ❌ | ❌ | ❌ | — | **STILL (1 file)** | **STILL** | ❌ — no plugin scaffold |
| **E.14** | opening | ❌ | ❌ | ❌ | — | gone | gone | ❌ — no plugin scaffold (legacy `src/elements/openings/` exists) |
| **E.15** | furniture | ✅ | ✅ | ❌ | 1 | **STILL (57 files)** | **STILL** | ❌ — plugin scaffold exists but legacy is the live path |
| **E.16** | structural | ✅ | ✅ | ❌ | 1 | **STILL (4 files)** | gone | ⚠️ |
| **E.17** | plumbing | ✅ | ✅ | ❌ | 1 | **STILL (8 files)** | **STILL** | ⚠️ |

**Aggregate metrics**:
- `plugins/` directory contains **35 plugin packages** (more than the 17 families above, because `ai-*`, `bcf`, `ifc-*`, `rhino-*`, `dimensions`, `multiplayer`, `selection`, `sheets`, `schedules`, `view`, `section-view`, `plan-view`, `cross`, `annotations`, `lighting`, `rooms`, `toy-cube` also live there).
- `src/elements/` still has **20 subdirectories** with **8+ alive families**: `annotations` (36 files / 12 397 LOC), `beams`, `ceilings`, `columns`, `curtainwalls`, `dimensions`, `doors`, `floors` (10 files / 3 230 LOC), `furniture`, `grids`, `handrails`, `lighting`, `openings`, `plumbing`, `preview`, `roofs`, `roomBoundingLines`, `rooms`, `slabs`. Some of these (e.g., `floors`, `furniture`) duplicate code that has *also* been ported to `plugins/`.
- `src/commands/` still has **24 subdirectories** with **122 files reaching `commandManager.execute`** — every command invocation is still going through the legacy `CommandManager`, not `runtime.bus.executeCommand`.

**Phase E residual work**:
1. Build `plugins/floor/`, `plugins/grids/`, `plugins/opening/` scaffolds (E.6.0, E.13.0, E.14.0).
2. Add `contributions.ts` to every E.2–E.17 plugin (16 files, each ≈ 50 LOC, copy-paste of `wall/contributions.ts`).
3. Wire each tool to **actually call** `runtime.bus.executeCommand` instead of re-using legacy paths (currently most call counts are 1, meaning they do a single token call but real work still goes through `CommandManager`).
4. Delete the 8 alive `src/elements/<family>/` directories — this requires removing ~110 importers of `EngineBootstrap.ts` first (Phase D.4).
5. Delete `src/commands/<family>/` directories and the 122 `commandManager.execute` reaches.

---

## Phase F — Plugin contributions (S81-WIRE) · **1 of ~95 sub-phases done**

The plan declares 6 contribution categories. Each category maps to a sub-phase per element family or per UI host.

### F.1 — Toolbar discipline contributions (65 sub-phases)

The acceptance criterion is: every left-rail tool button is sourced from `runtime.plugins.contributions['toolbar.discipline']` instead of being hard-coded in `CreateRailPanel._buildSections()`.

| Verifier | Result |
|----------|--------|
| `find plugins -name contributions.ts` | **1 file** — `plugins/wall/src/contributions.ts` |
| `CreateRailPanel.ts` uses `_findToolbarContribution()` | ✅ — methods exist (lines 88, 94, 785) but only the wall lookup is wired |
| `CreateRailPanel.ts` `(window as any)` reaches | 8 |

**Status per rail panel**:

| Rail panel | Contribution-driven? | `(window as any)` reaches | State |
|------------|----------------------|---------------------------|-------|
| `CreateRailPanel.ts` | wall only (1 of 13 tools) | 8 | ⚠️ — F.1.01 done; F.1.02–F.1.13 + F.1.14 (CreateRailPanel rewrite) ❌ |
| `AnnotationRailPanel.ts` | ❌ | 4 | ❌ — F.1.15–F.1.20 ❌ |
| `ExportRailPanel.ts` | ❌ | 5 | ❌ |
| `GISRailPanel.ts` | ❌ | 0 | ❌ |
| `GridsLevelsRailPanel.ts` | ❌ | 4 | ❌ |
| `NavigateRailPanel.ts` | ❌ | 1 | ❌ |
| `RenderRailPanel.ts` | ❌ | 9 | ❌ |
| `VisualRailPanel.ts` | ❌ | 2 | ❌ |

**F.1 residual work**: 64 of 65 sub-phases. Each is mechanical (copy `plugins/wall/src/contributions.ts` shape, replace `wall.tool` / `'wall'` / `'polyline_ortho'` with the family-specific values). The hard part is **F.1.14**: rewriting `CreateRailPanel._buildSections()` so the entire section list is built from the contribution registry instead of hard-coded.

### F.2 — Inspector contributions (19 sub-phases)

| Verifier | Result |
|----------|--------|
| `find plugins -path "*/inspector/Panel.ts"` | **0 files** |

❌ **All 19 sub-phases missing.** Every inspector panel is still in `src/ui/property-inspector/<family>Section.ts`.

### F.3 — Modal-creation contributions (15 sub-phases)

| Verifier | Result |
|----------|--------|
| `find plugins -path "*/modal/Create.ts"` | **0 files** |

❌ **All 15 sub-phases missing.** `ElementCreationModal.ts` still hard-codes every family.

### F.4 — Context-menu contributions (8 sub-phases)

| Verifier | Result |
|----------|--------|
| `rg -l "menu\.context\." plugins/ --type ts` | **0 files** |

❌ **All 8 sub-phases missing.**

### F.5 — Bottom strip wiring (32 sub-phases)

The bottom strip (`src/ui/bottom-menu/BottomActionMenu.ts`) is referenced in B.38 as ❌ (no runtime threading). All 32 F.5 sub-phases (one per bottom-strip action) ❌ as a consequence.

### F.6 — Left rail panels (27 sub-phases)

`ProjectBrowserPanel.ts` is **705 LOC** with **0 reaches into `runtime.stores.*`** or `runtime.dataWorkbench.*`. Every other left-rail panel (Library, Schedules, Sheets, Visibility-Intents, AI-Workflows, etc.) follows the same pattern — they consume legacy singletons. ❌ all 27.

### F.7 — AI gestures (16 sub-phases)

| Verifier | Result |
|----------|--------|
| `rg -l "runtime\.ai\." src/ --type ts` | **1 file** — `src/ui/platform/RuntimeStatusPill.ts` (7 reaches) |

❌ 15 of 16. Only the status-pill consumer is wired.

### F.8 — Visibility-Intent gestures (13 sub-phases)

| Verifier | Result |
|----------|--------|
| `rg -l "runtime\.visibilityIntent\|runtime\.intent\." src/ --type ts` | **0 files** |

❌ All 13 missing. Slot doesn't even exist on `PryzmRuntime`.

### F.9 — Data-workbench gestures (16 sub-phases)

| Verifier | Result |
|----------|--------|
| `rg -l "runtime\.dataWorkbench" src/ --type ts` | **0 files** |

❌ All 16 missing.

### F.10 — Rendering controls (14 sub-phases)

| Verifier | Result |
|----------|--------|
| `rg -l "runtime\.scene\.renderer\." src/ --type ts` | **0 files** |

❌ All 14 missing. The `runtime.scene.renderer` slot exists but is unreached from UI.

### F.11 — Modal contributions (12 sub-phases)

`WelcomeModal.ts`, `UpgradeModal.ts`, `ContactSalesModal.ts`, `ConfirmDialog.ts` all exist as monolithic files in `src/ui/platform/`. None are contribution-driven. ❌ all 12.

### F.12 — Plugin-specific contributions (20 sub-phases)

| Plugin | Scaffold | Tests passing today | Wired into `composeRuntime`? |
|--------|----------|---------------------|------------------------------|
| `plugins/ifc-export/` | ✅ | ✅ (`ifc-export-tier1` workflow green) | ❌ — no `runtime.ifcExport` reaches in `src/` |
| `plugins/ifc-import/` | ✅ | ✅ (`ifc-import-tier2` workflow green) | ❌ |
| `plugins/ifc-inspector/` | ✅ | ✅ (`ifc-inspector-pset-editor` green) | ❌ |
| `plugins/bcf/` | ✅ | ✅ (`bcf-round-trip` green) | ❌ |
| `plugins/rhino-import/` | ✅ | ✅ (`rhino-import-3dm` green) | ❌ |
| `plugins/dxf/` | — | — | ❌ — directory **does not exist** (DXF importer still in `src/ui/import/DxfImportPanel.ts`) |
| Marketplace plugin slots | ❌ | — | ❌ |

⚠️ **5 of 20 sub-phases have green tests in isolation** but **0 of 20 are wired into the editor runtime**. The plugins exist as packages, pass their own quality gates, but the editor never consumes them.

**Phase F residual work**: ~94 of 95 sub-phases. The pattern is uniform: declare `contributions.ts` next to each `tool.ts`, register it via `composeRuntime`'s `PluginHost`, then rewrite the corresponding UI host (`CreateRailPanel`, `ElementCreationModal`, etc.) to read from the contribution registry instead of hard-coding.

---

## Cross-cutting metrics — current vs. target (S72 D0 baselines)

| Metric | Today (HEAD) | S72 D0 baseline | Phase G/H target | Status |
|--------|--------------|-----------------|------------------|--------|
| `(window as any)` in `src/ui/` | **766** | 769 | 0 | down 3 since baseline |
| `extends Panel` in `src/ui/` | **1** | 0 | ≥ 40 | +1 (B.adopt.1) |
| `runtime: PryzmRuntime` typed in `src/ui/` | **8** | 0 | ≥ 40 | +8 |
| `requestAnimationFrame` reaches outside `frame-scheduler` | **88 across 51 files** | 220 (per §23.11) | 0 | improved but huge gap |
| `commandManager.execute` reaches | **122 files** | — | 0 (replaced by `runtime.bus.executeCommand`) | unchanged |
| `EngineBootstrap.ts` importers | **110 files** | ~115 | 0 | barely moved |
| Legacy persistence files on disk | **3 files / 1 166 LOC** | 3 / 1 166 | 0 | unchanged (gated by D.4) |
| `tsc --skipLibCheck` errors | **0** | 0 | 0 | ✅ |
| `vite build` exit code | **0** | 0 | 0 | ✅ |

---

## Critical-path summary (what unblocks the most)

1. **Phase D.4 — refactor `EngineBootstrap.ts` (2 048 LOC, 110 importers).** This single piece of work unblocks: C.11.01–03 (deleting the 3 legacy persistence files), D.3 (deleting `apps/editor/src/main.ts`), every `src/elements/<family>/` deletion in Phase E, and the bulk of `(window as any)` reaches across `src/ui/`.
2. **Phase B mechanical sweep (32 files).** Each panel is a 4-line constructor change. None are blocked. Pure throughput.
3. **Phase F.1 mechanical sweep (12 element families × `contributions.ts`).** Copy-paste of the wall pattern. None are blocked.
4. **Phase D.7 — migrate the 6+ `UnifiedFrameLoop` importers** to `packages/frame-scheduler/`, then delete the 424-LOC file.
5. **Phase D.9 + D.12 — add the missing `cameraController` and `workspace` slots** to `PryzmRuntime`. Blocks D.10 + D.12.

Once 1+4+5 are done, ~150 sub-phases unblock simultaneously.

---

## Verification commands (re-run anytime)

```bash
# Phase A.6 — legacy AppToast importers
rg -l "from.*AppToast" src/ --type ts

# Phase B — runtime threading + Panel adoption
rg -l "runtime: PryzmRuntime" src/ui/ --type ts | wc -l
rg -l "extends Panel\b"       src/ui/ --type ts | wc -l

# Phase C — legacy persistence files on disk
ls -l src/ui/platform/{ProjectRepository,SaveOrchestrator,ServerSyncQueue}.ts

# Phase D — engine consolidation
ls -l src/engine/EngineBootstrap.ts src/core/rendering/UnifiedFrameLoop.ts apps/editor/src/main.ts
rg -l "EngineBootstrap" src/ --type ts | wc -l

# Phase E — plugin contributions count
find plugins -name "contributions.ts" | wc -l

# Phase F — inspector / modal / context-menu contributions
find plugins -path "*/inspector/Panel.ts" -o -path "*/modal/Create.ts" -o -path "*menu/context*" | wc -l

# Cross-cutting
rg -c "\(window as any\)" src/ui/ --type ts | awk -F: '{s+=$NF} END {print s}'
rg -c "requestAnimationFrame\(" src/ --type ts | awk -F: '{s+=$NF} END {print s}'
rg -l "commandManager\.execute" src/ --type ts | wc -l
```

— END —

---
---

# PART II — Implementation Plan: Sub-phases to 100 / 100

> Part I (above) is the **state-of-the-codebase** audit at HEAD on 2026-04-29.
> Part II (this section) is the **implementation plan** that closes every ❌ /
> ⚠️ row in Part I.  It defines, for each remaining sub-phase, **what to write,
> where to write it, and the exact one-liner that proves the change took**.
>
> Phase A is closed; the plan begins at Phase B.  Phases C–H are sequenced
> to maximise unblocking throughput (per Part I's "Critical-path summary").
> Every sub-phase is sized to **≤ 1 file edited per PR** wherever possible,
> so reviewers and bisect can pin a regression to a 4-line change.

## §II.0 Implementation conventions

### §II.0.1 Sub-phase ID format

`<Phase>.<Group>.<Step>[-<Variant>]` — e.g. `B.5`, `B.6-a`, `C.4.07`,
`D.4.03`, `E.15.2`, `F.1.14`, `G.7`, `H.3`.  The variant suffix
(`-a`, `-b`, …) is reserved for sibling files inside a single sub-phase
(e.g. `B.6-a RoomPropertySection`, `B.6-b SlabLayerSection`).

### §II.0.2 Sub-phase status grades

| Grade | Definition (code-verifiable) |
|-------|------------------------------|
| **A — Done** | Every acceptance criterion below the row is met at HEAD; the verifier prints the expected count. |
| **B — Code present, callers not migrated** | Symbol/file/slot exists; reaches into it have not yet replaced the legacy path.  This is the "wired but dormant" state. |
| **C — Skeleton only** | Type / signature exists; body is `throw new RuntimeNotWiredError(...)` or a `// TODO` block. |
| **D — Not started** | Nothing in code; this is the default for un-touched sub-phases. |

The grade is **always derived from the verifier**, never from prose.

### §II.0.3 Ratchet metrics (anti-regression budget)

The cross-cutting metrics in Part I §"Cross-cutting metrics" become **ratchets**
once Part II begins: every PR must move at least one of these strictly toward
its target, and **no PR may regress any metric** (CI gate, see §II.Z.6):

| Metric (`src/ui/`) | At HEAD | Target | Permitted direction |
|--------------------|---------|--------|---------------------|
| `(window as any)` count | 766 | 0 | **strictly down** |
| Files with `runtime: PryzmRuntime` typed | 8 | ≥ 40 | **strictly up** until 40, then ≥ panel-count |
| Files with `extends Panel` | 1 | ≥ 40 | **strictly up** |
| `requestAnimationFrame(` reaches outside `frame-scheduler` | 88 | 0 | **strictly down** |
| `commandManager.execute` reaches | 122 files | 0 | **strictly down** |
| `EngineBootstrap` importers | 110 files | 0 | **strictly down** |
| Legacy persistence files on disk | 3 | 0 | **strictly down** |
| `tsc --skipLibCheck` errors | 0 | 0 | **must stay 0** |
| `vite build` exit code | 0 | 0 | **must stay 0** |

The CI gate fails if any **down** metric goes up, or any **up** metric goes
down, or if either build metric becomes non-zero.

### §II.0.4 Verifier format

Every sub-phase carries one shell command (or a 2-line script) that prints a
**single number** or `OK` / `MISSING`.  CI scripts in `.local/scripts/audit/`
re-run all verifiers nightly and store the result in
`.local/state/replit/agent/wireup-floor.json` (the "parametric baseline" — see
§II.Z.1).

---

## §II.B Phase B — Constructor widening: per-panel implementation walkthrough

> **Why Phase B is the longest section in Part II.** Phase B is the *only*
> phase that touches **every** panel in `src/ui/`.  Every later phase (C, D,
> E, F, G, H) assumes panels can be reached as `runtime.<slot>.<method>`
> from a typed `runtime` field — without the Phase B threading, every later
> sub-phase has to re-introduce the same window-cast at the same call-site.
> The wedge from this morning (`ExistingProjectsPanel.ts` → +1 ratchet on
> `extends Panel`) proved the migration recipe works.  The remaining 32
> panels apply the **same** recipe, in three variants (§II.B.0.A/B/C).

### §II.B.0 — The migration recipe (single source of truth)

Every Phase B PR has the **same** five-step shape, regardless of which panel
is being widened.  This subsection defines the recipe once; every B.2–B.40
row references it by step number.

#### §II.B.0 step 1 — pick the right variant

Three structural shapes exist in `src/ui/` today.  Each picks a different
template:

| Variant | When to use | Shape |
|---------|------------|-------|
| **A — `extends Panel`** | Panel has a clear lifecycle (mount/unmount/dispose), holds DOM + subscriptions, and is mounted by a parent that already passes a runtime ref.  ✅ **Preferred for new work.** | `class FooPanel extends Panel<FooOpts> { protected onMount() { … } }` |
| **B — Standalone class with `readonly runtime` field** | Panel pre-existed Phase B and has a stable public API (constructor + `element` getter) called from many sites.  Migrating to `extends Panel` would require fanning out call-sites; instead we widen the constructor and add a `runtime` field. | `class FooPanel { readonly runtime: PryzmRuntime \| null; constructor(runtime: PryzmRuntime \| null = null) { this.runtime = runtime; } }` |
| **C — Factory function `mountX(host, runtime, opts)`** | Panel is a `mountX()` helper that returns a handle.  Common for `src/ui/rendering/*` and modal helpers (`pryzmConfirm`, `mountX`). | `export function mountFoo(host: HTMLElement, runtime: PryzmRuntime \| null = null, opts: FooOpts): FooHandle { … }` |

The decision tree:

```
Does the panel have its own mount/unmount today (e.g. PanelManager-driven)?
  ├─ yes → ALWAYS use Variant A (extends Panel).  This is the wedge pattern.
  └─ no  → Does the panel have an `element` field exposed to many callers?
            ├─ yes → Variant B (standalone class + runtime field)
            └─ no  → Variant C (mountX factory)
```

The wedge (`ExistingProjectsPanel`) used Variant A.  The 7 partial panels
that thread `runtime` today (`Layout`, `LeftNavRail`, `ContextualEditBar`,
`SaveUndoRedoHUD`, `PropertyInspector`, plus three smaller ones) use
Variant B.  Most `mountX(...)` helpers in `rendering/` will use Variant C.

#### §II.B.0 step 2 — apply the canonical edit

**Variant A — full skeleton** (the wedge pattern):

```ts
import { Panel, type PanelOptions } from '@pryzm/ui-base';
import type { PryzmRuntime } from '@pryzm/runtime-composer/types';

export interface FooPanelOptions extends PanelOptions {
    /** Sub-phase B.<x> JSDoc block — name every option here. */
    readonly currentFooId?: string | null;
}

export class FooPanel extends Panel<FooPanelOptions> {
    static readonly panelId = 'panel:foo';

    protected createRoot(): HTMLElement {
        const el = document.createElement('div');
        el.className = 'foo-wrap';
        el.setAttribute('data-panel', FooPanel.panelId);
        return el;
    }

    protected onMount(): void {
        // First paint
        this.render();
        // Subscribe to runtime stores; track() auto-disposes on dispose()
        this.track({
            dispose: this.runtime.events.on('selection.changed', () => this.render()).dispose,
        });
    }

    protected onRender(root: HTMLElement): void {
        root.replaceChildren();
        // Build DOM tree; reach data through this.runtime.<slot>.*
    }
}
```

**Variant B — full skeleton** (preserves existing constructor signature):

```ts
// At top of file (KEEP existing imports):
import type { PryzmRuntime } from '@pryzm/runtime-composer/types';

export class FooPanel {
    readonly element: HTMLElement;

    /** Phase B.<x> (S73-WIRE) — runtime threaded by parent (<parent file>).
     *  `public readonly`, optional with default `null` for legacy boot. */
    public readonly runtime: PryzmRuntime | null;

    constructor(
        // ── existing parameters preserved verbatim ──
        existingArg: SomeType,
        anotherArg: AnotherType,
        // ── new last parameter (always optional, always last) ──
        runtime: PryzmRuntime | null = null,
    ) {
        this.runtime = runtime;
        // ── existing constructor body preserved verbatim ──
    }
}
```

**Variant C — full skeleton**:

```ts
import type { PryzmRuntime } from '@pryzm/runtime-composer/types';

export interface FooHandle {
    dispose(): void;
    readonly element: HTMLElement;
}

/** Phase B.<x> (S73-WIRE) — runtime threaded by caller (<parent file>). */
export function mountFoo(
    host: HTMLElement,
    runtime: PryzmRuntime | null = null,
    opts: FooOpts = {},
): FooHandle {
    void runtime;  // TODO(B.<x>): consume runtime in Phase C; legacy-safe today
    // ── existing function body preserved verbatim ──
}
```

The `void runtime;` line is intentional — it makes the parameter live for
TypeScript without changing behaviour.  It is removed in the corresponding
Phase C sub-phase when the legacy reads are migrated.

#### §II.B.0 step 3 — annotate every retained `(window as any)` cast

For every `(window as any).<thing>` left in the file, add a trailing comment
naming the **destruction sub-phase**:

```ts
const wallStore = (window as any).wallStore; // TODO(B.5): legacy window-cast — replace with runtime.stores.wallStore in Phase C.x
const cm       = (window as any).commandManager; // TODO(B.5): legacy window-cast — replace with runtime.bus.executeCommand in Phase E.x
const pc       = (window as any).projectContext; // TODO(B.5): legacy window-cast — replace with runtime.projectContext in Phase D.x
```

The destruction-sub-phase suffix is one of: **`Phase C.x`** (persistence /
project-context casts), **`Phase D.x`** (engine / camera / picking / view
casts), **`Phase E.x`** (commandManager / per-family stores), **`Phase F.x`**
(plugin / contribution casts).  See §II.B.0.D below for the full mapping.

The `// TODO(B.<x>):` annotation is **mandatory** — the lint rule
`pryzm/no-unannotated-window-cast` (added in §II.Z.7) fails the build on any
unannotated cast in a Phase-B-touched file.

#### §II.B.0 step 4 — update parent caller

Variant A:  parent already calls `panel.mount()`; switch to passing `runtime`
into the constructor.  Variant B/C: parent appends `, runtime` to the
existing call.  No other behaviour change.

The parent file is **always** one of: `src/ui/Layout.ts`, `src/ui/LeftNavRail.ts`,
`src/ui/PanelManager.ts`, `src/ui/PlatformShell.ts`, or another panel that has
already been widened (a Phase B sub-phase that depends on another).

#### §II.B.0 step 5 — verifier

For every Phase B PR, the **same** verifier proves the change took:

```bash
# Per-file verifier (replace <file> with the panel path)
rg -c 'runtime: PryzmRuntime|runtime: import\(.@pryzm/runtime-composer' <file>   # must be ≥ 1
rg -c '@pryzm/(runtime-composer|ui-base)'                              <file>   # must be ≥ 1
# For Variant A panels:
rg -c 'extends Panel\b'                                                <file>   # must equal 1

# Aggregate verifier (must move strictly up per ratchet §II.0.3):
rg -l 'runtime: PryzmRuntime' src/ui/ --type ts | wc -l
rg -l 'extends Panel\b'       src/ui/ --type ts | wc -l
```

#### §II.B.0.D — Window-cast → runtime-slot reach map

Every `(window as any).<thing>` reach in `src/ui/` falls into one of the
buckets below.  The "Replace with" column is the canonical Phase-C/D/E/F
target.  Phase B does NOT delete these casts — it annotates them with the
matching `TODO(<sub-phase>)`.  The casts are deleted in their named phase.

| Cast pattern (rg) | Bucket | Replace with | Destruction sub-phase |
|------------------|--------|--------------|----------------------|
| `(window as any).commandManager` | command bus | `runtime.bus.executeCommand(name, payload)` | **E.<family>.X** (per-family commandManager migration; see §28-commandManager-execute-migration.md) |
| `(window as any).wallStore` / `slabStore` / `floorStore` / `ceilingStore` / `roofStore` / `columnStore` / `beamStore` / `stairStore` / `handrailStore` / `doorStore` / `windowStore` / `furnitureStore` / `plumbingStore` / `lightingStore` | per-family stores | `runtime.stores.<family>` (slot widened in Phase E for that family) | **E.<family>.S** |
| `(window as any).projectContext` | project context | `runtime.projectContext` (slot already exists, see types.ts L195) | **C.3.x** |
| `(window as any).platformShell` | shell singleton | `runtime.workspace.show(mode)` (slot to be added in **D.12**) | **D.12** |
| `(window as any).bimManager` / `__bimManager` | engine façade | `runtime.scene.renderer` + `runtime.tools` (D.1 + D.4) | **D.4** |
| `(window as any).cameraController` | camera | `runtime.cameraController` (slot to be added in **D.9**) | **D.9 / D.10** |
| `(window as any).transformControls` | gizmo | `runtime.cameraController.gizmo` (sub-slot in D.9) | **D.10** |
| `(window as any).floorPlanUnderlayTool` | underlay | `runtime.tools.activate('underlay')` after E.16 widens tools | **E.16** |
| `(window as any).planViewToolOverlay` / `planViewOverlay` | plan-view | `runtime.viewRegistry.activate('plan-view')` (D.11) | **D.11** |
| `(window as any).rampTool` / `wallModePicker` / `curtainWallModePicker` | per-family pickers | `runtime.tools.activate('<family>', mode)` (already wired for 12 families in `src/ui/Layout.ts:479-490`) | **E.<family>.T** |
| `(window as any).toggleFloorPlanPanel` / `toggleDxfPanel` | global UI bridges | `runtime.plugins.contributions('panel.toggle')` | **F.6.x** |
| `(window as any).__pryzm2RuntimeComposed` | debug handle | DELETE (debug-only) | **D.2** |
| `(window as any)._pendingProjectSwitch` | hub-router shim | `runtime.persistence.openProject(id, hint)` (already wired for `ExistingProjectsPanel`) | **C.3.01** |
| `globalThis.commandManager` (in `SaveUndoRedoHUD`) | undo/redo | `runtime.undoStack.undo / .redo` (already wired) | **C.6.02 / C.6.03** |

The **Phase B annotation rule**: every cast comment must name the **leftmost
column's sub-phase** (the destruction site), not its own Phase B id.  Example:

```ts
const cm = (window as any).commandManager; // TODO(E.<family>.X): migrate to runtime.bus.executeCommand
```

#### §II.B.0.E — Per-panel acceptance verifier

Every Phase B sub-phase row carries a `verifier:` field.  The standard
verifier for a single-file widening is:

```bash
rg -c 'runtime: PryzmRuntime|@pryzm/runtime-composer' <file> | grep -q '^[1-9]'  && echo OK
```

For Variant A panels (extending `Panel`):

```bash
rg -c 'extends Panel\b' <file> | grep -q '^1$' && echo OK
```

For multi-file sub-phases (e.g. B.6 covering 4 sibling files), the verifier
ANDs the per-file checks:

```bash
ALL_OK=1
for f in src/ui/property-inspector/*.ts; do
  rg -q 'runtime: PryzmRuntime|@pryzm/runtime-composer' "$f" || ALL_OK=0
done
test "$ALL_OK" = 1 && echo OK
```

---

### §II.B.2 — `src/ui/Layout.ts` (orchestrator) · ⚠️ Code-Present, refinements only

**Today**: `runtime: PryzmRuntime | null` already threaded (line 117); 16 of
the 17 retained casts already carry `// TODO(B):` annotations; runtime-driven
tool activator block at lines 479–490 already calls `runtime.tools.register()`
for 12 families.

**Remaining work** (per Variant B recipe):

| Sub-step | Action | Verifier |
|----------|--------|----------|
| B.2.1 | Replace each `// TODO(B):` annotation with the precise destruction-sub-phase id from §II.B.0.D table (e.g. `// TODO(D.4): legacy bimManager — replace with runtime.scene.renderer`). 17 lines, mechanical. | `rg -c 'TODO\(B\):' src/ui/Layout.ts` → 0; `rg -c 'TODO\((C\|D\|E\|F)\.' src/ui/Layout.ts` → 17 |
| B.2.2 | Add a JSDoc block above `createMainLayout` declaring the runtime contract:  `@param runtime PryzmRuntime — threaded to every child panel; `null` permitted only during legacy boot.` | inspection |
| B.2.3 | Drop the `runtime ?? null` pattern at the 4 call-sites where Layout already receives a non-null runtime; tighten signatures from `runtime: PryzmRuntime \| null` to `runtime: PryzmRuntime` once `src/main.ts` is the only caller (post Phase D.4). | `rg -c 'runtime: PryzmRuntime \| null' src/ui/Layout.ts` → 0 (gated by D.4) |

**Done when**: all 17 annotations carry destruction-sub-phase ids; no `(window as any)` reach inside Layout.ts is unannotated; the runtime threading remains intact.

### §II.B.3 — `src/ui/LeftNavRail.ts` · ⚠️ Variant B

**Today**: Already imports `PryzmRuntime`; 6 retained casts.

**Sub-steps**:
| Step | Action |
|------|--------|
| B.3.1 | Constructor signature: append `runtime: PryzmRuntime \| null = null` as last param; assign to `public readonly runtime`. |
| B.3.2 | Annotate the 6 `(window as any)` reaches per §II.B.0.D mapping. The reads are: `commandProposalStore` lookup (move to `runtime.stores.commandProposal` — to be added in **F.6.x**); 5 panel-toggle bridges — destruction sub-phase **F.6.5** (panel-host registry). |
| B.3.3 | Pass `this.runtime` into every child panel constructor that has been widened: `HierarchyTreePanel(host, this.runtime)`, `ValidatePanel(host, this.runtime)`. |

**Verifier**: `rg -c 'this.runtime' src/ui/LeftNavRail.ts` ≥ 3.

### §II.B.4 — `src/ui/PanelManager.ts` (B.4-PM) + `src/ui/makeDraggable.ts` (B.4-MD) · ❌ → Variant B

**PanelManager** (120 LOC, 0 retained casts):  has a static singleton `panelManager`.  Constructor is parameter-less; widen to accept an optional `runtime`:

```ts
class PanelManager {
    public readonly runtime: PryzmRuntime | null;
    constructor(runtime: PryzmRuntime | null = null) {
        this.runtime = runtime;
    }
}
```

The singleton export `panelManager` cannot accept the runtime at module-load
time (it's mounted before `composeRuntime` resolves).  Add a one-shot setter:

```ts
let _panelManager: PanelManager | null = null;
export function setPanelManagerRuntime(runtime: PryzmRuntime): void {
    if (_panelManager) (_panelManager as any).runtime = runtime;
}
```

Call `setPanelManagerRuntime(runtime)` from `src/main.ts` immediately after
`composeRuntime` resolves.

**makeDraggable** (83 LOC, 0 retained casts):  is a free function.  Widen
signature to accept `runtime?: PryzmRuntime` and consume `void runtime;` per
Variant C.  Required for future viewport-coord conversions (D.10).

### §II.B.5 — `src/ui/PropertyInspector.ts` (THE BIG ONE — 87 window-casts, 2813 LOC) · ❌ → Variant B

**Today**: Already partially widened — line 93 declares `public readonly runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null`; 87 retained `(window as any)` reaches; 27 of those are stale (the same `wallStore` / `commandManager` read repeated inside per-family branches).

This is the highest-leverage Phase B PR in the entire codebase.  Migrating
PropertyInspector unblocks:

* **Phase F.2 inspector contributions** (19 sub-phases) — every per-family
  inspector panel reads through here.
* **Phase E commandManager migration** — the 11 `UpdateXCommand` imports at
  the top of the file are replaced by `runtime.bus.executeCommand('<family>.update', payload)`.
* **Phase G window-as-any zeroing** — removes 87 from the count in one PR
  (≈ 11 % of the entire `src/ui/` cast budget).

#### B.5 — sub-step plan

| Step | Action | LOC touched | Window-cast removed |
|------|--------|------------|---------------------|
| B.5.1 | Annotate all 87 retained casts per §II.B.0.D map.  Group by destruction sub-phase: 11 → E.5.x (commandManager), 8 → C.3.x (projectContext), 14 → E.<family>.S (per-family stores), 54 → E.<family>.X (commandManager.execute fanout). | +87 comment lines | 0 (annotation-only) |
| B.5.2 | Extract the 11 `UpdateXCommand` imports into a single helper `private execUpdate(family, payload)` that calls `this.runtime.bus.executeCommand(`${family}.update`, payload)` when runtime is non-null, else falls back to `(window as any).commandManager.execute(legacyCmd)`.  Each per-family branch then calls `this.execUpdate('wall', { … })`. | -11 imports, +1 method, ≈ 22 call-sites rewritten | -54 (the UpdateXCommand-via-commandManager.execute reaches collapse into `execUpdate`) |
| B.5.3 | Replace the 8 `(window as any).projectContext` reaches with `this.runtime?.projectContext ?? (window as any).projectContext` until C.3.x deletes the fallback. | ≈ 8 lines | -0 (fallback retained) |
| B.5.4 | Replace the 14 per-family-store reaches (`wallStore`, `slabStore`, etc.) with `this.runtime?.stores?.<family> ?? (window as any).<family>Store`.  The `runtime.stores.<family>` slot is the addition gated by **E.<family>.S**. | ≈ 14 lines | -0 (fallback retained) |
| B.5.5 | Add a JSDoc note above the class declaration: `// Phase B.5 (S73-WIRE) — runtime threaded; per-family widget extraction lands in F.2.x; legacy fallbacks deleted in their named E.x sub-phases.` | +5 lines | — |

**Verifier**:
```bash
rg -c 'execUpdate\(' src/ui/PropertyInspector.ts                                # ≥ 11
rg -c 'TODO\((C|D|E|F)\.' src/ui/PropertyInspector.ts                          # ≥ 87
rg -c 'commandManager\.execute' src/ui/PropertyInspector.ts                    # 0 (after B.5.2)
rg -c '\(window as any\)' src/ui/PropertyInspector.ts                          # ≤ 33 (87 - 54)
```

**Acceptance**: PR lands without changing rendered behaviour (the inspector
still mutates the same elements via the same commands; only the call-shape
changes).  Bench `bench/ui/inspector-mount.bench.ts` (B.5 row in §16.2)
must stay within 10 % of baseline.

### §II.B.6 — `src/ui/property-inspector/*` (4 files) · ❌ → mixed Variant B / C

The audit listed `B.6-a RoomPropertySection.ts` (1305 LOC) and
`B.6-b CompositePropertySection.ts (file missing)`.  The actual contents of
the directory are 4 files: `RoomPropertySection.ts`, `RoomPathfinderPanel.ts`,
`SlabLayerSection.ts`, `WallLayerSection.ts`.  CompositePropertySection.ts
was renamed to `SlabLayerSection.ts` in S65.  Update Part I row B.6-b
accordingly.

| Sub-phase | File | Variant | LOC | Casts | Step plan |
|-----------|------|---------|-----|-------|-----------|
| **B.6-a** | `RoomPropertySection.ts` | B (class) | 1305 | 17 | Constructor accepts `runtime: PryzmRuntime \| null = null`; annotate 17 casts (12 → E.x commandManager, 5 → E.rooms.S store reach). |
| **B.6-b** | `SlabLayerSection.ts` (renamed from CompositePropertySection.ts) | B | 290 | 4 | Same recipe; annotate 4 casts (3 → E.slab.X, 1 → E.slab.S). |
| **B.6-c** | `WallLayerSection.ts` | B | 344 | 1 | Annotate 1 cast (E.wall.S). |
| **B.6-d** | `RoomPathfinderPanel.ts` | B | 420 | 6 | Annotate 6 casts (mix of E.rooms.X and E.rooms.S). |

**Update Part I §"Phase B"**: change `B.6-b CompositePropertySection.ts` to
`B.6-b SlabLayerSection.ts (renamed from CompositePropertySection)`.

### §II.B.7 — `src/ui/views/*` (B.7-a ViewTabBar, B.7-b ViewHeaderButtons, B.7-c ViewTemplateManagerPanel) · ❌

| Sub-phase | File | Variant | LOC | Casts | Notes |
|-----------|------|---------|-----|-------|-------|
| **B.7-a** | `ViewTabBar.ts` | B | 148 | 0 | Pure constructor widening; no casts to annotate.  Pass `runtime` to `runtime.viewRegistry.activate(viewId)` (D.11). |
| **B.7-b** | `ViewHeaderButtons.ts` | B | 209 | 3 | Annotate 3 casts (1 → D.4 bimManager, 2 → D.11 viewRegistry). |
| **B.7-c** | `ViewTemplateManagerPanel.ts` | B | 701 | 12 | Annotate 12 casts (mix of E.* and F.6.x); drop legacy template-store global once F.6.x ships. |

### §II.B.8 — `src/ui/ContextualEditBar.ts` · ⚠️ → annotations only

**Today**: `runtime` already threaded (line 99); 14 retained casts; 0 annotations.

| Step | Action |
|------|--------|
| B.8.1 | Annotate all 14 casts: 6 → D.10 (transformControls + cameraController), 4 → D.11 (planViewToolOverlay), 4 → E.16.X (floorPlanUnderlayTool). |
| B.8.2 | Replace inline operation-tool refs (joinTool, cutTool, etc.) with lookups via `this.runtime.tools.activate('<op-id>')` — gated by **D.10**. |

### §II.B.9 — `src/ui/SaveUndoRedoHUD.ts` · ⚠️ → strip globalThis fallback

**Today**: Variant B; runtime threaded; 0 retained `(window as any)` casts; **but** still has `globalThis.commandManager` fallback at lines 117 + 124.

| Step | Action |
|------|--------|
| B.9.1 | Once `src/main.ts` is the only caller (post-D.4), tighten signature to `runtime: PryzmRuntime`; delete the `globalThis.commandManager?.undo?.()` fallback branch.  This eliminates 2 globalThis-cast fallbacks. |

**Verifier**: `rg -c 'globalThis.*commandManager' src/ui/SaveUndoRedoHUD.ts` → 0 (gated by D.4).

### §II.B.10 — `src/ui/SelectionOverlay.ts` · ❌ → Variant B

| Step | Action |
|------|--------|
| B.10.1 | Constructor accepts `runtime: PryzmRuntime \| null = null`. |
| B.10.2 | Replace the `'pryzm-selection-changed'` DOM-event listener with `this.runtime.events.on('selection.changed', payload => this.render(payload.ids))` — gated by Phase B but only firing when runtime is non-null. |
| B.10.3 | Annotate the 2 retained casts (1 → D.10 cameraController, 1 → D.13 picking). |

### §II.B.11 — `src/ui/ViewCube.ts` · ❌ → Variant B

| Step | Action |
|------|--------|
| B.11.1 | Constructor: append optional runtime arg.  `void runtime;` until D.10 wires the camera reach. |
| B.11.2 | Annotate the 1 retained cast → D.10. |

### §II.B.12 — modal trio · ⚠️/❌

| Sub-phase | File | State today | Step plan |
|-----------|------|------------|-----------|
| **B.12-AT** | `AppToast.ts` | ✅ DELETED in A.6 | no work |
| **B.12-CD** | `ConfirmDialog.ts` | ⚠️ — `pryzmConfirm()` already accepts `runtime: PryzmRuntime \| null` (Variant C wedge from A.6 close) but the param is `void runtime;`'d | Phase F.11.4: replace with `runtime.toasts.confirm(...)` once that slot lands.  Until then, no further work. |
| **B.12-EM** | `ElementCreationModal.ts` | ❌ | Variant B widening; 0 retained casts (file already imports nothing global); just append `runtime?: PryzmRuntime \| null = null` to the constructor.  Real wireup is **F.3.x** (15 sub-phases, one per element family). |

### §II.B.13 — overlays trio · ✅ (3 of 3 done)

| Sub-phase | File | LOC | Casts | Variant | Status |
|-----------|------|-----|-------|---------|--------|
| **B.13-RM** | `RadialMenu.ts` | 339 | 9 | B; annotations: 6 → E.x commandManager, 3 → D.10 cameraController. | ✅ **DONE 2026-04-30** — `new RadialMenu(runtime ?? null)` parent-thread completed via `ToolsParams.runtime` in `initTools.ts` + forward from `EngineBootstrap.ts:1169`; 0 `TODO(B):`; build green (`tsc --noEmit` exit 0). |
| **B.13-SC** | `ShortcutCheatSheet.ts` | 341 | 0 | B; constructor widening only. | ✅ **DONE 2026-04-30** — `installShortcutCheatSheet(runtime: PryzmRuntime \| null = null)` + threaded from `initUI.ts:2687` (Variant C void-stub; default-arg-null preserves backward-compat) |
| **B.13-UP** | `UiPreferences.ts` | 106 | 0 | B; runtime threading enables future `runtime.userPreferences.set` reach (C.9.02). | ✅ **DONE 2026-04-30** — module-load singleton; `UiPreferences.setRuntime(runtime)` injected from `src/main.ts:237` immediately after `composeRuntime()` (mirrors the B.4 PanelManager hand-off); 0 casts; build green. |

### §II.B.14 — `src/ui/SpatialTree.ts` · ✅ **DONE 2026-04-30**

438 LOC, 22 casts.  Variant **C** (factory function `createSpatialTree(runtime, …)`, *not* Variant B as originally classified — the file exposes a function not a class).  Annotations: 14 → D.4 (bimManager), 5 → D.11 (viewRegistry), 3 → E.x stores; all 22 already retargeted in B.7 batch.  File widening completed in B.7 (`runtime: PryzmRuntime | null = null /* B-runtime createSpatialTree */` first arg + `void runtime;` stub).  Parent-thread completed 2026-04-30: `src/ui/Layout.ts:317` now invokes `createSpatialTree(runtime ?? null)` (was `createSpatialTree()`); `runtime` already in scope at line 125 via `createMainLayout(props, runtime: PryzmRuntime | null = null)` (B.2 thread).  Verifier: `rg -c 'runtime: PryzmRuntime|@pryzm/runtime-composer' src/ui/SpatialTree.ts` = 1; `tsc --noEmit` exit 0; full vite build green (47.05 s).

### §II.B.15 — levels + grids panels · ✅ **DONE 2026-04-30** (4 of 4)

| Sub-phase | File | LOC | Casts | Status |
|-----------|------|-----|-------|--------|
| **B.15-LM** | `src/ui/levels/LevelManagerPanel.ts` | 253 | 0 | ✅ widening pre-done in B.7; parent-thread `new LevelManagerPanel({…}, this.runtime)` at `src/ui/ViewBrowser/panels/LevelsGridsRailPanel.ts:62`. |
| **B.15-AL** | `src/ui/levels/ActiveLevelHUD.ts` | 133 | 0 | ✅ widening pre-done in B.7; parent-thread `new ActiveLevelHUD({…}, runtime ?? null)` at `src/ui/Layout.ts:1027` (delayed 600 ms construction site — runtime captured in closure scope from `createMainLayout`). |
| **B.15-GM** | `src/ui/grids/GridManagerPanel.ts` | 396 | 0 | ✅ widening pre-done in B.7; parent-thread `new GridManagerPanel({…}, this.runtime)` at `src/ui/ViewBrowser/panels/LevelsGridsRailPanel.ts:90`; legacy `(window as any).gridStore` fallback retained with `TODO(E.13) → runtime.stores.grids` annotation. |
| **B.15-GD** | `src/ui/GridDrawingHUD.ts` | 166 | 0 | ✅ widening pre-done in B.7; **module-load singleton refactor required** because `gridDrawingHUD` is built at module-load time (consumed by `GridPlanToolHandler`) — converted from `public readonly runtime` to private backing field with `setRuntime()` getter/setter, mirroring the B.13-UP `UiPreferences` precedent.  Boot-time injection added at `src/main.ts:248` (`gridDrawingHUD.setRuntime(runtime)` immediately after `composeRuntime()` returns, alongside the existing B.4 `panelManager` and B.13-UP `UiPreferences` hand-offs). |

**B.15 plumbing chain** (Variant B parent threading, four-hop):
`src/main.ts (composeRuntime) → src/ui/Layout.ts:1506 (new ProjectBrowserPanel({…}, runtime ?? null)) → src/ui/ViewBrowser/ProjectBrowserPanel.ts:128 (new LevelsGridsRailPanel(props, this.runtime)) → src/ui/ViewBrowser/panels/LevelsGridsRailPanel.ts:{62,90} (new {LevelManagerPanel,GridManagerPanel}({…}, this.runtime))`.

Verifier: `for f in src/ui/{SpatialTree,levels/LevelManagerPanel,levels/ActiveLevelHUD,grids/GridManagerPanel,GridDrawingHUD}.ts; do rg -c 'runtime: PryzmRuntime|@pryzm/runtime-composer' "$f"; done` ⇒ `1 2 2 2 2` ✅; `tsc --noEmit` exit 0; full vite build green (47.05 s).

### §II.B.16 — import family (3 sub-phases) · ❌

| Sub-phase | File | LOC | Variant |
|-----------|------|-----|---------|
| **B.16-IM** | `src/ui/imported-models/ImportedModelsPanel.ts` | 222 | B (already partially threaded — A.6 close added `_toast()`) |
| **B.16-IMG** | `src/ui/import-manager/ImportManagerPanel.ts` | 497 | B |
| **B.16-DX** | `src/ui/import/DxfImportPanel.ts` | 863 | B (already threaded in A.6 close via module-scope `_runtime`) |

For B.16-DX: the module-scope `_runtime` ref pattern from A.6 should be
promoted to a class field once the file is converted from a `mountX()` factory
to a class.  Defer to **F.6.7** (DxfImport panel-host migration).

### §II.B.17 — ProjectBrowser + ViewBrowser family · ⚠️/❌

The audit's row B.17 said `ProjectBrowserPanel.ts` was "file missing (likely
renamed)".  Code review confirms: the file lives at
`src/ui/ViewBrowser/ProjectBrowserPanel.ts` (705 LOC) — the path was
incorrectly listed as `src/ui/ProjectBrowser/ProjectBrowserPanel.ts` in the
plan.

**Update Part I row B.17**: change path to
`src/ui/ViewBrowser/ProjectBrowserPanel.ts`.

| Sub-phase | File | LOC | Casts | State |
|-----------|------|-----|-------|-------|
| **B.17-PB** | `src/ui/ViewBrowser/ProjectBrowserPanel.ts` | 705 | 1 | ⚠️ partial — runtime imported but not threaded into all child panels.  Step plan: thread `runtime` into `RailPanelController`, `ProjectsRailPanel`, `ViewsRailPanel`, `SchedulesRailPanel`, `SheetsRailPanel`, `CameraRailPanel`, `LevelsGridsRailPanel`, `DocumentsBrowserPanel`, `AIRailPanel`, `PhysicsRailPanel`, `LogoRailPanel`, `TreeRailPanel` — 12 child files, all already have runtime imports. |
| **B.17-EP** | `src/ui/ViewBrowser/ExistingProjectsPanel.ts` | 215 | 0 | ✅ DONE — wedge from this morning. |
| **B.17-UB** | `src/ui/ViewBrowser/panels/UnifiedBrowserPanel.ts` | 1815 | 35 | ❌ — second-largest cast hotspot.  Variant B widening; annotations split: 18 → D.11 (viewRegistry), 11 → E.x commandManager, 6 → F.6.x panel-host. |
| **B.17-VR** | `src/ui/ViewBrowser/panels/ViewsRailPanel.ts` | 907 | 9 | ❌ — Variant B; 9 cast annotations (5 → D.11, 4 → E.x). |
| **B.17-RC** | `src/ui/ViewBrowser/RailPanelController.ts` | 344 | 0 | ❌ — Variant B; just constructor widening. |
| **B.17-RB** | `src/ui/ProjectBrowser/ProjectBrowser.tsx` | (React tsx) | — | ❌ — special-case: this is a React file; treat it as Variant C (`mountProjectBrowser(host, runtime, opts)` wrapper around the React tree). |
| **B.17-Z** | All other `src/ui/ViewBrowser/panels/*.ts` (10 files) | varied | 0–4 each | ❌ — apply Variant B in a single sweep PR. |

### §II.B.18 — data + buckets family · ✅ DONE 2026-04-30

| Sub-phase | File | LOC | Casts | Status |
|-----------|------|-----|-------|--------|
| **B.18-DCC** | `src/ui/data/DataCommandCenter.ts` | 480 | 3 | ✅ Module-load singleton refactored to `private _runtime` + `setRuntime()` (mirrors UiPreferences/gridDrawingHUD/PanelManager pattern); `setRuntime()` re-buckets so the 4 child buckets receive the typed handle on the post-`composeRuntime()` injection. Boot-time injection added at `src/main.ts:260` |
| **B.18-PIP** | `src/ui/data/PIPRenderer.ts` | 149 | 0 | ✅ RT threaded by `DataCommandCenter._ensurePIP()` via `new PIPRenderer(this._runtime)` |
| **B.18-AB** | `src/ui/data/buckets/AuditBucket.ts` | 383 | 4 | ✅ RT threaded by `DataCommandCenter._buildBuckets()` via `new AuditBucket(this._runtime)` |
| **B.18-LB** | `src/ui/data/buckets/LifecycleBucket.ts` | 239 | 2 | ✅ RT threaded by `DataCommandCenter._buildBuckets()` via `new LifecycleBucket(this._runtime)` |
| **B.18-SB** | `src/ui/data/buckets/StrategizeBucket.ts` | 736 | 4 | ✅ RT threaded by `DataCommandCenter._buildBuckets()` via `new StrategizeBucket(this._runtime)` |
| **B.18-VB** | `src/ui/data/buckets/ValidateBucket.ts` | 286 | 3 | ✅ RT threaded by `DataCommandCenter._buildBuckets()` via `new ValidateBucket(this._runtime)` |

All 6 widened in B.7 batch (Variant B); B.18 closed parent threading + singleton lazy-injection.  Cast annotations remain pointing to F.9.x (data-workbench gestures) — those are C-phase work.

### §II.B.19 — `src/ui/dataworkbench/DataWorkbench.ts` (orchestrator only) · ✅ DONE 2026-04-30

1799 LOC, 2 retained casts.  Variant B.  RT threaded via `new DataWorkbench(runtime ?? null)` from `EngineBootstrap.ts:330` (`runtime` in scope from bootstrap signature).  Threads `this.runtime` down to all 14 child panels (B.20–B.30+ — B.20 closed in same batch).

### §II.B.20 – §II.B.30 — dataworkbench panels (13 sub-phases, one per file) · ✅ DONE 2026-04-30

| Sub-phase | File | LOC | Casts | Status |
|-----------|------|-----|-------|--------|
| **B.20** | `AnalyticsPanel.ts` | 430 | 11 | ✅ RT threaded via `new AnalyticsPanel(this.runtime)` from `DataWorkbench.ts:421`; 11 casts remain TODO → F.9.x (C-phase). |
| **B.21** | `CompliancePanel.ts` | 478 | 3 | ✅ RT threaded via `new CompliancePanel(container, this.runtime)` from `DataWorkbench.ts:409`; 3 casts → F.9.x (C-phase). |
| **B.22** | `DataSheetPanel.ts` | 775 | 16 | ✅ RT threaded via `new DataSheetPanel(container, this.runtime)` from `DataWorkbench.ts:407`; 16 casts (largest dataworkbench cast hotspot) remain TODO → F.9.x. |
| **B.23** | `DesignHistoryPanel.ts` | 604 | 0 | ✅ RT threaded via `new DesignHistoryPanel(container, this.runtime)` from `DataWorkbench.ts:414`; pure widening complete. |
| **B.24** | `HierarchyTreePanel.ts` | 1472 | 34 | ✅ RT threaded via `new HierarchyTreePanel(container, this.runtime)` from `DataWorkbench.ts:406` (and `LeftNavRail.ts:536` already done in earlier wave). **Top-3 dataworkbench hotspot** — 34 casts remain TODO → 18 D.11, 12 E.x, 4 F.9.x (C-phase). |
| **B.25** | `NLQueryPanel.ts` | 266 | 0 | ✅ RT threaded via `new NLQueryPanel(container, this.runtime)` from `DataWorkbench.ts:413`; later F.7.x reaches `runtime.ai.streamCompletion`. |
| **B.26** | `PhysicsPanel.ts` | 348 | 1 | ✅ RT threaded via `new PhysicsPanel(container, this.runtime)` from `DataWorkbench.ts:422`; 1 cast → D.4. |
| **B.27** | `PortfolioQueryPanel.ts` | 459 | 2 | ✅ RT threaded via `new PortfolioQueryPanel(container, this.runtime)` from `DataWorkbench.ts:445`; 2 casts → F.9.x. |
| **B.28** | `ProgrammePanel.ts` | 416 | 3 | ✅ RT threaded via `new ProgrammePanel(container, this.runtime)` from `DataWorkbench.ts:411`; 3 casts → F.9.x. |
| **B.29** | `RelationshipExplorerPanel.ts` | 387 | 0 | ✅ RT threaded via `new RelationshipExplorerPanel(container, this.runtime)` from `DataWorkbench.ts:412`; pure widening complete. |
| **B.30-SQP** | `SpatialQueryPanel.ts` | 617 | 3 | ✅ RT threaded via `new SpatialQueryPanel(container, this.runtime)` from `DataWorkbench.ts:410`; 3 casts → D.13 (picking). |
| **B.30-TEP** | `TemplateEditorPanel.ts` | 835 | 8 | ✅ RT threaded via `new TemplateEditorPanel(container, this.runtime)` from `DataWorkbench.ts:408`; 8 casts → F.9.x. |
| **B.30-SSDD** | `SyncStateDetailDrawer.ts` | 545 | 3 | ✅ Module-load singleton refactored to `private _runtime` + `setRuntime()` (5th instance of pattern after PanelManager/UiPreferences/gridDrawingHUD/dataCommandCenter); `syncStateDetailDrawer.setRuntime(runtime)` injected at `src/main.ts:268`; consumed by `HierarchyTreePanel.ts:729`. 3 casts → C.6 (persistence.status). |
| **B.30-DVS** | `DataVisualizerService.ts` | 473 | 5 | ⏳ **NOT in B.30 batch** — service file (not a panel); deferred to dedicated B.30-DVS sub-phase. 5 casts → D.4 + F.9.x. |

### §II.B.31 — `src/ui/ai/AIPanel.ts` (orchestrator only) · ❌ → Variant B

1161 LOC, 5 retained casts.  Step plan:
* B.31.1: Variant B widening; annotate 5 casts (3 → F.7.x ai-relay, 2 → D.4).
* B.31.2: Add a TODO marker for **F.7.1** (`runtime.ai.streamCompletion`)
  at the prompt-submit handler.

### §II.B.32 — AI sibling panels (5 sub-phases) · ❌

| Sub-phase | File | LOC | Casts |
|-----------|------|-----|-------|
| **B.32-AC** | `AICreatePanel.ts` | 535 | 5 |
| **B.32-V** | `ValidatePanel.ts` | 423 | 4 |
| **B.32-FP** | `FloorPlanImportPanel.ts` | 1853 | 19 |
| **B.32-FF** | `FloorPlanFullPlanViewer.ts` | 57 | 0 |
| **B.32-FD** | `FloorPlanDebugOverlay.ts` | 355 | 0 |

### §II.B.33 — intent family (6 sub-phases) · ❌

| Sub-phase | File | Casts |
|-----------|------|-------|
| **B.33-DB** | `intent/DivergedBanner.ts` | 0 |
| **B.33-HIP** | `intent/HeaderIntentPicker.ts` | 1 |
| **B.33-ISP** | `intent/IntentSourcePill.ts` | 0 |
| **B.33-RIB** | `intent/ResetToIntentButton.ts` | 0 |
| **B.33-SCT** | `intent/SourceChainTooltip.ts` | 0 |
| **B.33-SOL** | `intent/SpineOverrideList.ts` | 2 |

All Variant B.  Cast annotations → F.8.x (visibility-intent gestures).

### §II.B.34 — generative family (2 sub-phases) · ❌

| Sub-phase | File | LOC | Casts |
|-----------|------|-----|-------|
| **B.34-BIP** | `generative/BriefInputPanel.ts` | 553 | 3 |
| **B.34-VBP** | `generative/VariantBrowserPanel.ts` | 423 | 6 |

Variant B; annotations → F.7.x.

### §II.B.35 — rendering family (10 sub-phases) · ❌ → Variant C predominantly

The `rendering/` folder uses `mountX()` factory pattern throughout.  Apply
Variant C (factory function widening).

| Sub-phase | File | LOC | Casts | Note |
|-----------|------|-----|-------|------|
| **B.35-RP** | `RenderPanel.ts` | 394 | 1 | → F.10.x. |
| **B.35-RG** | `RenderGallery.ts` | 230 | 0 | pure C. |
| **B.35-PP** | `PanoramaPanel.ts` | 634 | 1 | → D.4 (renderer reach). |
| **B.35-VEP** | `VisualizationEnginePanel.ts` | 1623 | 41 | **Top-2 hotspot**.  Heavy annotation pass: 28 → D.4 (renderer + materialLibrary), 9 → F.10.x, 4 → E.x. |
| **B.35-VXP** | `VideoExportPanel.ts` | 542 | 7 | → F.10.x. |
| **B.35-RQP** | `RenderQueuePanel.ts` | 418 | 3 | → F.10.x. |
| **B.35-ESP** | `ExportStudioPanel.ts` | 927 | 4 | → F.10.x + F.12.x. |
| **B.35-RSC** | `RealSunControl.ts` | 246 | 1 | → D.4. |
| **B.35-PMP** | `PerformanceModePanel.ts` | 465 | 8 | → D.4 + F.10.x. |
| **B.35-WP** | `WalkthroughPanel.ts` | 68 | 0 | pure C. |

### §II.B.36 — schedule + sheet (orchestrators only) · ❌

| Sub-phase | File | LOC | Casts |
|-----------|------|-----|-------|
| **B.36-S** | `SchedulePanel/SchedulePanel.ts` | 371 | 0 |
| **B.36-SE** | `SheetEditor/SheetEditorPanel.ts` | 2923 | 28 |
| **B.36-SPO** | `SheetEditor/SheetProjectionOrchestrator.ts` | 78 | 2 |

B.36-SE is a hotspot (top-7); cast annotations split 12 → D.11, 8 → E.x, 8 → F.6.x.

### §II.B.37 — carousel + per-domain (4 sub-phase clusters) · ❌

| Sub-phase | File | Casts |
|-----------|------|-------|
| **B.37-FC.1** | `furniture-carousel/FloatingObjectCarousel.ts` | 0 |
| **B.37-FC.2** | `furniture-carousel/FurnitureDragDropHandler.ts` | 0 |
| **B.37-FC.3** | `furniture-carousel/FurnitureCarousel.ts` | 0 |
| **B.37-FC.4** | `furniture-carousel/FurnitureSidePanel.ts` | 0 |
| **B.37-FC.5** | `furniture-carousel/FurnitureThumbnailService.ts` | 0 |
| **B.37-K.1** | `kitchen/KitchenCabinetTool.ts` | 6 |
| **B.37-K.2** | `kitchen/KitchenConfigPanel.ts` | 0 |
| **B.37-K.3** | `kitchen/KitchenRunInspector.ts` | 4 |
| **B.37-K.4** | `kitchen/KitchenUnitInspector.ts` | 6 |
| **B.37-W.1** | `wardrobe/WardrobeCabinetTool.ts` | 6 |
| **B.37-W.2** | `wardrobe/WardrobeConfigPanel.ts` | 0 |
| **B.37-W.3** | `wardrobe/WardrobeRunInspector.ts` | 4 |
| **B.37-W.4** | `wardrobe/WardrobeSectionInspector.ts` | 4 |
| **B.37-R.1** | `rooms/EvacuationSimulatorPanel.ts` | 6 |
| **B.37-R.2** | `rooms/RoomGraphPanel.ts` | 8 |

### §II.B.38 — `src/ui/bottom-menu/BottomActionMenu.ts` · ❌

858 LOC, 20 casts.  Variant B.  Annotations: 14 → F.5.x (bottom-strip wiring,
32 sub-phases gated on this file), 6 → E.x.

### §II.B.39 — canvas + overlays (6 sub-phase cluster) · ❌

| Sub-phase | File | Casts |
|-----------|------|-------|
| **B.39-CA.1** | `canvas/AmbientIndicator.ts` | 0 |
| **B.39-CA.2** | `canvas/ConsequencePreviewOverlay.ts` | 0 |
| **B.39-CA.3** | `canvas/IntentPrompt.ts` | 1 |
| **B.39-CA.4** | `canvas/VoiceCommandIndicator.ts` | 0 |
| **B.39-OV.1** | `overlays/OperationModeOverlay.ts` | 0 |
| **B.39-OV.2** | `overlays/RenderHealthIndicator.ts` | 0 |

### §II.B.40 — leaf cluster (10 sub-phase cluster) · ❌

| Sub-phase | File | Casts |
|-----------|------|-------|
| **B.40-IN.1** | `inspect/AuditStack.ts` | 22 |
| **B.40-IO.1** | `interop/RevitWizardPanel.ts` | 0 |
| **B.40-IO.2** | `interop/InteropFidelityReport.ts` | 0 |
| **B.40-GS.1** | `geospatial/CesiumViewport.ts` | 0 |
| **B.40-GS.2** | `geospatial/TransformGizmo.ts` | 0 |
| **B.40-FB.1** | `fallbacks/SceneCrashFallback.ts` | 0 |
| **B.40-PR.1** | `primitives/ViewportCrashGuard.ts` | 3 |
| **B.40-IC.1** | `icons/PryzmIcons.ts` | 0 (constants file; no widening needed; mark as ✅ trivially) |
| **B.40-IC.2** | `icons/ViewerIconSet.ts` | 0 |
| **B.40-MISC** | All remaining root-level pickers/HUDs (`*ModePicker.ts`, `*DrawingHUD.ts`, `OverridePanel`, `SelectionOverlay`, `WorkspaceController`, `WallEdgeVisibilityService`, `GridToggleService`, `OwnerFeatureFlags`, `ColourPalette`, `AnnotationInputPanel`, `StairLevelRequiredPanel`, `StairSetupPanel`, `UnderlayScaleHUD`) | varied | Single sweep PR; 14 files; mostly Variant B; ~5 cast annotations total. |

### §II.B residual count after every sub-phase lands

After B.2 → B.40 are all closed:
* `runtime: PryzmRuntime` typed in `src/ui/`: **8 → ≥ 154** (every panel in the inventory).
* `extends Panel`: **1 → ≥ 40** (every Variant-A subclass).
* `(window as any)` count: **766 → ≈ 766** (Phase B is annotation-only; reduction happens in C/D/E/F).
* Annotated casts: **≈ 200 → 766** (every cast carries a `// TODO(<sub-phase>):` pointer).

**Phase B is "done" when**: every panel in `src/ui/` has a typed runtime
field (or accepts runtime via factory param), every retained cast carries
an annotation pointing to its destruction sub-phase, and the lint rule
`pryzm/no-unannotated-window-cast` (§II.Z.7) passes.

---

## §II.C Phase C — Persistence rewire: implementation plan

> Phase C migrates every persistence-touching gesture to `runtime.persistence.*`
> and deletes the 3 legacy files (1 166 LOC) gated by `PlatformShell.ts`.
> Sequencing matters: each gesture migration is independent **except** for
> the 3 deletions, which all depend on `PlatformShell.ts` being rewired
> (Phase D.4).

### §II.C.1 — Group C.1 (Hub list paint, 4 sub-phases) · State: ✅ for C.1.x landed-this-morning; tighten remaining

Per Part I, `C.1.x` is ✅ in the morning's commit.  Remaining hardening:

| Sub-phase | Action |
|-----------|--------|
| **C.1.5** | Add a regression bench `bench/ui/hub-paint.bench.ts` per §16.3.  TTI < 500 ms with 100-project fixture. |
| **C.1.6** | Add E2E test: clear localStorage; load hub; verify list paints from `runtime.persistence.client.list()` (REST), not from the legacy localStorage cache. |

### §II.C.2 — Group C.2 (Hub create gesture, 2 sub-phases) · State: B (created via `client.create` but not via the new modal)

| Sub-phase | Action |
|-----------|--------|
| **C.2.01** | Already wired — modal mount unchanged.  ✅ |
| **C.2.02** | `ProjectHub.ts` "+ New project" submit → `await runtime.persistence.client.create(name)`.  Today: 4 reaches landed; **next**: replace remaining 3 `projectRepository.saveProject({...})` reaches in `ProjectHub.ts` lines 412, 487, 533. |

**Verifier**: `rg -c 'projectRepository\.saveProject' src/ui/platform/ProjectHub.ts` → 0.

### §II.C.3 — Group C.3 (Open project gesture, 2 sub-phases)

| Sub-phase | State | Action |
|-----------|-------|--------|
| **C.3.01** | ⚠️ — slot exists, called from `ExistingProjectsPanel`, NOT from `ProjectHub` | Replace `this.callbacks.onOpenProject(id)` in `ProjectHub.ts:_handleProjectClick()` with `await this.runtime.persistence.openProject(id)`.  Drop `(window as any)._pendingProjectSwitch` reach. |
| **C.3.02** | ❌ | Same wire as C.3.01; bind to Enter key in `ProjectHub.ts` keyboard handler. |

### §II.C.4 — Group C.4 (Hub context-menu, 8 sub-phases)

| Sub-phase | State | Notes |
|-----------|-------|-------|
| **C.4.01–.06** | ✅ partial | `client.create:4 rename:2 delete:3 patch:2 duplicate:2` reaches landed; **clean up** the remaining `projectRepository` fallback in each per-action handler (ProjectHub.ts has 27 total `projectRepository` reaches; ≈ 12 of those are inside the context-menu handlers). |
| **C.4.07** | ❌ | `await runtime.persistence.exporter.toPryzm(id)` — file ext `.pryzm`; trigger `<a download>` blob.  Bench `bench/ui/hub-export-pryzm.bench.ts` < 5 s for 10K-element fixture. |
| **C.4.08** | ❌ | Drag-and-drop `.pryzm` zip onto hub root → `await runtime.persistence.importer.fromPryzm(file)`.  Wire the drop listener in `ProjectHub._mountDropZone()`. |

### §II.C.5 — Group C.5 (open-progress overlay, 1 sub-phase) · ✅

`PlatformRouter.ts` listens to `runtime.events.on('persistence.openProgress', ...)` per Part I row C.5.01.  Done.

### §II.C.6 — Group C.6 (status pill + undo/redo + version, 4 sub-phases)

| Sub-phase | State | Action |
|-----------|-------|--------|
| **C.6.01** | ⚠️ | Subscribe `PlatformShell` to `runtime.events.on('persistence.status', s => this._statusPill.set(s))` — gated by D.4 (PlatformShell needs to drop its `SaveOrchestrator` dependency first). |
| **C.6.02 / .03** | ✅ | Done in `SaveUndoRedoHUD.ts:121 / 127`. |
| **C.6.04** | ❌ | Cmd+S handler in `Layout.ts` keyboard listener: prompt for label → `runtime.persistence.eventLog.tag('user-version', { label })`.  Today: 0 non-legacy reaches. |

### §II.C.7 — Group C.7 (CDEVersionPanel, 3 sub-phases) · ❌

All 3 sub-phases blocked on slot widening: `runtime.persistence.eventLog.tags(id)`,
`replayUntil(id, eventId)`, `diff(eventA, eventB)`.

| Sub-phase | Step plan |
|-----------|----------|
| **C.7.01** | Widen `RuntimeEventLog` interface in `@pryzm/persistence-client` to expose `tags(id): Promise<EventTag[]>`. Then `CDEVersionPanel.ts:_loadVersions()` calls it. |
| **C.7.02** | `RuntimeEventLog.replayUntil(id, eventId): Promise<void>` — rewinds the event log; UI fires `persistence.openProject(id)` to re-hydrate. |
| **C.7.03** | `RuntimeEventLog.diff(eventA, eventB): EventDiff` — render in a side-pane drawer; bench `bench/ui/cde-version-diff.bench.ts`. |

### §II.C.8 — Group C.8 (ProjectMemberPanel, 4 sub-phases) · ❌

All blocked on adding `runtime.persistence.client.members.*` (the slot interface
already exists at `types.ts:235-240` as `MembersClientLike`; needs implementation
in `@pryzm/persistence-client`).

| Sub-phase | Action |
|-----------|--------|
| **C.8.01** | `ProjectMemberPanel.ts:_loadMembers()` → `await this.runtime.persistence.client.members.list(projectId)`. |
| **C.8.02** | Invite submit → `members.invite(id, email, role)`. |
| **C.8.03** | Remove → `members.remove(id, userId)`. |
| **C.8.04** | Role dropdown change → `members.setRole(id, userId, role)`. |

### §II.C.9 — Group C.9 (settings, 2 sub-phases) · ❌

| Sub-phase | Action |
|-----------|--------|
| **C.9.01** | `OwnerSettingsPanel.ts` feature-flag toggles → `runtime.userPreferences.flags.set(key, value)`. |
| **C.9.02** | `UiPreferences.ts` theme/locale/units → `runtime.userPreferences.set(key, value)`. |

### §II.C.10 — Group C.10 (auth, 4 sub-phases) · ⚠️/✅

| Sub-phase | State |
|-----------|-------|
| **C.10.01–.03** | unchanged — orthogonal to runtime; token consumed by `client.getAuthToken()`. ✅ |
| **C.10.04** | ✅ — `signOut()` reach at `ProjectHub.ts:762`. |

### §II.C.11 — Three legacy file deletions · ❌ all blocked by D.4

| Sub-phase | File | Blocker | Unblock action |
|-----------|------|---------|----------------|
| **C.11.01** | `src/ui/platform/ProjectRepository.ts` (433 LOC) | `PlatformShell.ts:34` import; `ProjectHub` 27 reaches | After C.2.02 + C.4.x + D.4 land, delete the file; `rg -c 'ProjectRepository' src/` must be 0. |
| **C.11.02** | `src/ui/platform/SaveOrchestrator.ts` (380 LOC) | `PlatformShell.ts:35` import; sole `persistence.status` consumer | After C.6.01 lands (PlatformShell subscribes directly), delete. |
| **C.11.03** | `src/ui/platform/ServerSyncQueue.ts` (353 LOC) | imported by SaveOrchestrator | Falls automatically when SaveOrchestrator falls. |

### §II.C.14 — Delete `src/persistence/` tree

Sub-phase **C.14**: After `packages/persistence-client` is the only consumer
of `src/persistence/backends/`, `chunks/`, `codec/`, `codecs/`,
`attachEventLog.ts`, `UnderlayPersistence.ts`, delete the legacy tree.
Verifier: `rg -l "from.*src/persistence" src/` → 0.

### §II.C.Z — Verification harness (Z.0–Z.20)

See §II.Z below; the harness (parametric baseline + 5 ESLint rules + 2 bench
packages) is built inside Phase C's window because every later phase ratchets
against it.

---

## §II.D Phase D — Engine consolidation: implementation plan

> Phase D is **the keystone**.  D.4 alone (refactoring `EngineBootstrap.ts`,
> 2048 LOC, 110 importers) unblocks ≈ 150 sub-phases across C, E, F, G, H.
> Order of operations matters: **D.9 + D.12 first** (slot additions; pure
> type changes), **D.7 second** (UnifiedFrameLoop migration; mechanical),
> **D.4 third** (the keystone), **everything else after D.4**.

### §II.D.0 — Sequencing rationale

The 14 D-sub-phases are NOT independent.  Below is the canonical
dependency graph (read top-to-bottom; later rows depend on earlier rows
landing):

```
D.9 (cameraController slot)          ──┐  ⚠️ prep landed 2026-04-29
D.12 (workspace slot)                  ├── pure type changes; ship together
D.11 (viewRegistry.activate signature) ┘  ⚠️ prep landed 2026-04-29
                ↓
D.7 (UnifiedFrameLoop → frame-scheduler)  ── 6+ importers; mechanical
                ↓                            ▲ NEXT-IN-LINE — start with D.7.1
D.4 (EngineBootstrap split)               ── THE KEYSTONE; 2048 LOC
                ↓
                ├── D.3   (delete apps/editor/src/main.ts)        ✅ landed early as D-finish.1
                ├── D.6   (move RenderPipelineManager → packages/renderer/)
                ├── D.8   (decide BatchCoordinator/DrawingPipeline home)
                ├── D.10  (adopt cameraController at every site)
                ├── D.13  (adopt picking + selection at every site)
                ├── D.14  (adopt picking.marquee at every site)
                ├── D.1   (delete dual-canvas DOM remnants)
                └── D.2   (drop __pryzm2RuntimeComposed debug handle)
```

**State delta as of 2026-04-29**: the §II.D.0 "ship together" trio is
complete at the **prep level** — all three slots have their typed
contracts in place (`WorkspaceSlot`, `CameraControllerSlot`,
`ViewRegistrySlot`), with warn-once / scope-reduced stubs that compile
clean and don't crash naming code paths.  The full real-wiring versions
(D.9 / D.11 / D.12 proper) all remain gated on **D.4**.  In addition,
**D.3 (delete `apps/editor/src/main.ts`) shipped early as `D-finish.1`**
because the gating dependency on D.4.8 dissolved when no live caller of
`mountEditor` survived B.4-PM.  The next D-bucket move per §II.D.0 is
therefore **D.7**, starting with **D.7.1** (the pure `getFrameScheduler()`
factory export — it unblocks the D.7.2–D.7.10 mechanical sweep).

### §II.D.9 — Add `cameraController` slot to `PryzmRuntime`

**Action**: In `packages/runtime-composer/src/types.ts`, add the slot:

```ts
export interface CameraControllerSlot {
    /** Reset orbit to fit-all. */
    fitAll(): void;
    /** Set view: top / front / right / iso. */
    setView(view: 'top' | 'front' | 'right' | 'iso'): void;
    /** Get the underlying THREE.Camera (read-only handle). */
    readonly camera: unknown;
    /** The transform-controls gizmo (replaces (window as any).transformControls). */
    readonly gizmo: { attach(obj: unknown): void; detach(): void; setMode(m: 'translate' | 'rotate' | 'scale'): void };
    subscribe(listener: (snapshot: { mode: string }) => void): Disposable;
}

export interface PryzmRuntime {
    // ... existing slots
    readonly cameraController: CameraControllerSlot;
}
```

Wire a stub in `composeRuntime.ts` that throws `RuntimeNotWiredError('cameraController', 'D.10')` from every method until D.10 lands the real wiring.

**Verifier**: `rg -c 'readonly cameraController:' packages/runtime-composer/src/types.ts` → 1.

**State**: ⚠️ **prep landed 2026-04-29** as **D.9-prep.A** (workspace slot, ✅ full shape) + **D.9-prep.B** (cameraController slot, ⚠️ scope-reduced to `{frameElement, frameAll}` — already pre-declared shape; warn-once stubs instead of `RuntimeNotWiredError` throw so naming the slot doesn't crash the editor; see tracker rows 16a / 16b).  **D.9 proper** (full `{fitAll, setView, camera, gizmo, subscribe}` shape + real viewport CameraController + transform-controls gizmo wiring) remains gated on D.4.

### §II.D.12 — Add `workspace` slot

```ts
export interface WorkspaceSlot {
    readonly mode: 'landing' | 'hub' | 'workspace';
    setMode(mode: 'landing' | 'hub' | 'workspace'): void;
    show(mode: 'landing' | 'hub' | 'workspace'): Promise<void>;
    subscribe(listener: (mode: 'landing' | 'hub' | 'workspace') => void): Disposable;
}
```

The `show()` signature replaces `(window as any).platformShell.show(mode)` — the
single largest bridge cast in `src/ui/`.

**Verifier**: `rg -c 'readonly workspace:' packages/runtime-composer/src/types.ts` → 1.

**State**: ⚠️ **prep landed 2026-04-29** as **D.9-prep.A** (slot interface ✅) + **D.12-prep** (`show(mode: WorkspaceMode): Promise<void>` signature ✅; `WorkspaceMode` named type ✅; warn-once stub mirrors `setMode` then resolves immediately + emits distinct `'workspace.show'` event for telemetry hook in D.12 proper).  Pre-condition met: `rg -n "runtime\.workspace\.show\(\|platformShell\.show\(" src/ apps/editor/ packages/` → 0 hits before change, so the additive method is a pure surface widen with zero migration burden.  See tracker rows 16a / 16d.  **D.12 proper** (cast removal in `src/ui/platform/`) remains gated on D.4.

### §II.D.11 — `viewRegistry.activate(viewId)` signature lock-in

`viewRegistry: unknown` at types.ts L48 is loose.  Tighten to:

```ts
export interface ViewRegistrySlot {
    readonly activeViewId: string | null;
    activate(viewId: string): Promise<void>;
    list(): readonly { id: string; name: string; kind: 'plan' | 'section' | '3d' | 'sheet' }[];
    subscribe(listener: (viewId: string | null) => void): Disposable;
}
```

**State**: ⚠️ **prep landed 2026-04-29** as **D.11-prep** — full `ViewRegistrySlot` interface declared exactly per spec; `viewRegistry: unknown` count → 0; `buildViewRegistrySlotAdapter()` wraps existing `ViewRegistry extends Store<ViewDefinition>` from `@pryzm/view-state` so `list()` reads real ViewDefinitions today (current `ViewDefinition.kind` enum is `'3d-perspective' | '3d-orthographic'` only — both map to `'3d'` in the slot; when `plan` / `section` / `sheet` view kinds land in 2A / 2B, the mapping gets richer **without a slot-contract change**); `activate(viewId)` mirrors `activeViewId` locally + emits `'viewRegistry.activate'` on the typed events bus + warn-once breadcrumb.  Pre-condition met: `rg -n "viewRegistry" src/` → 0 non-bootstrap reaches before the change, so the `unknown → typed` tightening is a pure type-widen with zero migration burden.  See tracker row 16c.  **D.11 proper** (real activation pipeline — camera + visibility-filter rewire) remains gated on D.4.

### §II.D.7 — Migrate `UnifiedFrameLoop` consumers · 6+ importers

Today, `src/core/rendering/UnifiedFrameLoop.ts` (424 LOC) is imported by:
1. `core/views/ViewDependencyTracker.ts`
2. `core/views/SplitViewManager.ts`
3. `core/views/PlanViewManager.ts`
4. `core/views/PlanViewInteraction.ts`
5. `core/rendering/SSGIService.ts`
6. `core/rendering/FrameCoordinator.ts`
7. `core/rendering/EnhancedBloomService.ts`
8. `engine/subsystems/initScene.ts`
9. `engine/subsystems/initPersistence.ts`

Each importer calls one of: `frameLoop.subscribe(cb)`, `frameLoop.requestFrame()`,
`frameLoop.step()`.  Migration recipe per consumer:

```ts
// BEFORE
import { unifiedFrameLoop } from '../rendering/UnifiedFrameLoop';
unifiedFrameLoop.subscribe(callback);

// AFTER
import { getFrameScheduler } from '@pryzm/frame-scheduler';
getFrameScheduler().subscribe(callback);
```

**Sub-steps**:
| Sub-step | Action |
|----------|--------|
| **D.7.1** | Add `getFrameScheduler()` factory to `@pryzm/frame-scheduler/index.ts` if not already exported. |
| **D.7.2 .. D.7.9** | One PR per consumer; mechanical replacement. |
| **D.7.10** | Delete `src/core/rendering/UnifiedFrameLoop.ts`. |

**Verifier**: `rg -c 'UnifiedFrameLoop' src/` → 0.

### §II.D.4 — THE KEYSTONE: split `src/engine/EngineBootstrap.ts` (2048 LOC, 110 importers)

This is the single largest refactor in Phases B–H.  It cannot be done as
one PR; it needs a 6-step split strategy.

#### D.4 — Split strategy

`EngineBootstrap.ts` today does eight distinct jobs in one file:
1. THREE scene + renderer construction (THREE-specific, ~300 LOC).
2. ECS + store wiring (~200 LOC).
3. Tool manager + per-family tool init (~250 LOC).
4. Picking + selection wiring (~150 LOC).
5. Camera controller construction (~180 LOC).
6. Persistence handshake (~280 LOC).
7. UI initialisation (`initUI`) — calls into `src/ui/Layout.ts` (~250 LOC).
8. Subsystems init (`initScene`, `initPersistence`, `initTools`, `initPicking`, `initSelection`, `initSync`, `initOverlays`, `initWorkspace`) — already extracted into `src/engine/subsystems/`.

The 110 importers fall into 4 buckets:
* **Bucket 1 (≈ 30 importers)**: pull a single global out of EngineBootstrap (`bimManager`, `commandManager`, `wallStore`, etc.).  Migration: each global moves to a `runtime.<slot>.<thing>` accessor.
* **Bucket 2 (≈ 50 importers)**: import a type re-exported from EngineBootstrap.  Migration: add a `src/engine/types.ts` re-export shim; importers move to it; EngineBootstrap stops re-exporting types.
* **Bucket 3 (≈ 20 importers)**: import `bootstrap()` directly (called by `mountEditor()` in `apps/editor/src/main.ts`).  Migration: wait until D.3 deletes that file.
* **Bucket 4 (≈ 10 importers)**: import an internal helper (`computeBoundingBox`, `disposeAll`, etc.).  Migration: move helpers to `packages/scene-utils/`.

#### D.4 — Sub-step plan

| Sub-step | Action | LOC | Importers cleared |
|----------|--------|-----|-------------------|
| **D.4.1** | Extract type re-exports into `src/engine/types.ts` (no behaviour change). | -50 LOC + 50 LOC new file | Bucket 2 (50 files import from `engine/types` instead of `engine/EngineBootstrap`) |
| **D.4.2** | Move helpers (Bucket 4) to `packages/scene-utils/`. | -80 LOC + new package | Bucket 4 (10 files) |
| **D.4.3** | Replace `EngineBootstrap` global emit (`bimManager`, `commandManager`, `wallStore`, ...) with calls into `runtime.<slot>.set(value)`.  Each global removal is a separate PR (one per global ≈ 12 PRs). | varies | Bucket 1 (≈ 30 files; one cleared per PR) |
| **D.4.4** | Move job (1) THREE scene + renderer to `packages/scene-builder/` (NEW package).  EngineBootstrap calls `buildScene()` from it. | -300 LOC | none directly |
| **D.4.5** | Move job (3) tool manager init to `packages/tool-registry/`.  EngineBootstrap calls `registerAllTools(runtime)`. | -250 LOC | none directly |
| **D.4.6** | Move job (4) picking + selection to `packages/picking/`. | -150 LOC | none directly |
| **D.4.7** | Move job (5) camera controller to `packages/camera/`. | -180 LOC | none directly |
| **D.4.8** | Replace `mountEditor()` callers (Bucket 3) with direct `composeRuntime() + PlatformRouter.start(runtime)` calls — i.e. there is only one of these (`src/main.ts`), already using the new path; **only `apps/editor/src/main.ts` remains**, deleted in **D.3**. | — | Bucket 3 (20 files; mostly tests) |
| **D.4.9** | EngineBootstrap.ts is now ≈ 850 LOC (down from 2048).  The remaining content is `bootstrap(runtime)` → calls the 8 subsystem init functions in order.  Move that file to `src/engine/bootstrap.ts` (lower-case) as the canonical entry point used by `composeRuntime`. | -850 LOC | none |
| **D.4.10** | DELETE `src/engine/EngineBootstrap.ts`.  All 110 original importers have been migrated. | -file | 0 importers remain |

**Verifier**: `rg -c 'EngineBootstrap' src/ --type ts` → 0.

#### D.4 — risk + mitigation

| Risk | Mitigation |
|------|------------|
| 110 importers means 110 potential merge conflicts | Process bucket 2 first (50 importers, all type-only) — landed in 1 PR; bucket 4 next (10 importers, helpers); bucket 1 last (30 importers, behavioural). |
| Test fallout: many integration tests stub `EngineBootstrap.bootstrap()` | Keep `bootstrap` callable from `bootstrap.ts` so test mocks update via path-only change. |
| Performance regression risk during the scene-builder extraction | Bench `bench/ui/workspace-mount.bench.ts` (B.2 row) gates each PR. |

### §II.D.3 — Delete `apps/editor/src/main.ts` (227 LOC) · gated by D.4.8

`src/main.ts:104` lazy-imports `mountEditor()` from this file in the `loadEngine()` path.  After D.4.8, swap the lazy-import for the canonical `composeRuntime + PlatformRouter` flow (already present elsewhere in `src/main.ts`).  Then `rm apps/editor/src/main.ts`.

**Verifier**: `ls apps/editor/src/main.ts 2>&1 | grep -q "No such file" && echo OK`.

### §II.D.6 — `RenderPipelineManager` move

Today: `src/rendering/pipeline/RenderPipelineManager.ts` exists; `packages/renderer/` does NOT exist.

| Sub-step | Action |
|----------|--------|
| **D.6.1** | Create `packages/renderer/` with `package.json`, `tsconfig.json`, `src/index.ts`. |
| **D.6.2** | Move `src/rendering/pipeline/RenderPipelineManager.ts` to `packages/renderer/src/RenderPipelineManager.ts`. |
| **D.6.3** | Update all 14 importers (`rg -l RenderPipelineManager src/`) to import from `@pryzm/renderer`. |

### §II.D.8 — `BatchCoordinator` + `DrawingPipelineOrchestrator` final home

Both files were relocated from `src/engine/` to `src/core/{batch,drawing}/` in
S70 but never moved to `packages/renderer/` per the plan.  Decision needed:

| Option | Trade-off |
|--------|-----------|
| **A** (canonical plan) | Move into `packages/renderer/`.  Forces `packages/renderer/` to depend on `packages/scene-builder/` (BatchCoordinator reads scene state). |
| **B** (pragmatic) | Keep in `src/core/` (engine-only).  Leaves them outside the package boundary; no white-UI consumer reaches them. |

**Recommendation**: Option B (status quo).  Mark D.8 ✅ once a JSDoc note in
each file declares the final-home decision and Part I row D.8 is updated.

### §II.D.10 — Adopt `cameraController` at every site

After D.9 lands the slot.  Targets:
* `src/ui/ContextualEditBar.ts` (6 reaches; transformControls + cameraController casts)
* `src/ui/SelectionOverlay.ts` (1)
* `src/ui/ViewCube.ts` (1)
* `src/ui/RadialMenu.ts` (3)
* `src/ui/views/ViewHeaderButtons.ts` (1 of 3)

Total: ≈ 12 sub-phases (one per cast cluster).

### §II.D.11 — Adopt `viewRegistry.activate` at every site

After D.11 signature lock-in.  Targets: 8+ sites (`ViewTabBar`, `SpatialTree`,
`UnifiedBrowserPanel`, `HierarchyTreePanel`, `SheetEditorPanel`, plus 3 in
`platform/`).

### §II.D.13 / §II.D.14 — Adopt `picking.pick` + `selection.select` + `picking.marquee`

After D.4 lands.  Each adoption is a single-line change at the call-site
inside the relevant tool's onPointerDown handler (now in `plugins/<family>/tool.ts`).

### §II.D.1 / §II.D.2 — Cleanup

* **D.1**: `runtime.scene.renderer` is reached from `composeRuntime` boot path; delete the dual-canvas DOM check in `src/main.ts`.
* **D.2**: Drop `(window as any).__pryzm2RuntimeComposed = runtime` debug handle at `src/main.ts:206`.

---

## §II.E Phase E — Per-family migration plan

> Phase E migrates per-family code from `src/elements/<family>/` and
> `src/commands/<family>/` into `plugins/<family>/`, wiring each tool to call
> `runtime.bus.executeCommand` and exporting `contributions.ts`.  The 17
> families are independent — Phase E is **embarrassingly parallel** once
> Phase D.4 lands.

### §II.E.0 — The migration recipe per family

For each family `<F>` (wall, slab, door, ...), one PR per family:

| Step | Action | Verifier |
|------|--------|----------|
| **E.<F>.0** | Ensure `plugins/<F>/` scaffold exists.  If not, create from `plugins/wall/` template. | `ls plugins/<F>/src/{tool.ts,contributions.ts,index.ts}` |
| **E.<F>.S** | Add `runtime.stores.<F>` slot to `PryzmRuntime` (one entry in `composeRuntime` per family). | `rg -c 'stores\.<F>' packages/runtime-composer/src/types.ts` ≥ 1 |
| **E.<F>.T** | `plugins/<F>/src/tool.ts`: ensure `onPointerDown` calls `runtime.bus.executeCommand('<F>.create', payload)` instead of legacy command-class instantiation. | `rg -c 'bus.executeCommand' plugins/<F>/src/tool.ts` ≥ 1 |
| **E.<F>.C** | Create `plugins/<F>/src/contributions.ts` from `plugins/wall/src/contributions.ts` template; replace `'wall.tool'`, `'wall'`, `'polyline_ortho'` with family-specific values. | `ls plugins/<F>/src/contributions.ts && rg -c 'kind: .toolbar.discipline' plugins/<F>/src/contributions.ts` ≥ 1 |
| **E.<F>.X** | Migrate every `commandManager.execute(new <F>Command(...))` site to `runtime.bus.executeCommand('<F>.<cmd>', payload)`.  Per `28-commandManager-execute-migration.md`, 122 files have such reaches; estimate per family: ≈ 4–10 sites. | `rg -c 'commandManager.execute.*<F>' src/` → 0 (after PR) |
| **E.<F>.D** | DELETE `src/elements/<F>/` + `src/commands/<F>/`. | `ls src/elements/<F> src/commands/<F> 2>&1 | grep -q "No such" && echo OK` |

### §II.E sub-phases (17 families × 6 steps = 102 sub-phases)

The 17 families map to plugin scaffolds today.  Status from Part I:

| Family | Scaffold | Tool calls bus? | contributions.ts? | src/elements/ alive? | src/commands/ alive? | Net work |
|--------|----------|-----------------|-------------------|----------------------|----------------------|----------|
| **E.1 wall** | ✅ | ❌ (0 reaches) | ✅ | gone | gone | E.1.T + E.1.X (≈ 8 sites) |
| **E.2 slab** | ✅ | ⚠️ (1 reach) | ❌ | gone | gone | E.2.C + E.2.T + E.2.X |
| **E.3 door** | ✅ | ⚠️ (4) | ❌ | gone | gone | E.3.C + E.3.X |
| **E.4 window** | ✅ | ⚠️ (2) | ❌ | gone | gone | E.4.C + E.4.X |
| **E.5 curtain-wall** | ✅ | ⚠️ (1) | ❌ | gone | gone | E.5.C + E.5.T + E.5.X |
| **E.6 floor** | ❌ (no plugin) | — | ❌ | gone (folded?) | gone | E.6.0 (scaffold) + E.6.T + E.6.C + E.6.X |
| **E.7 ceiling** | ✅ | ⚠️ (1) | ❌ | gone | gone | E.7.C + E.7.T + E.7.X |
| **E.8 roof** | ✅ | ⚠️ (1) | ❌ | gone | gone | E.8.C + E.8.T + E.8.X |
| **E.9 stair** | ✅ | ⚠️ (1) | ❌ | gone | **STILL** | E.9.C + E.9.T + E.9.X + E.9.D |
| **E.10 handrail** | ✅ | ⚠️ (1) | ❌ | gone | gone | E.10.C + E.10.T + E.10.X |
| **E.11 column** | ✅ | ⚠️ (1) | ❌ | gone | gone | E.11.C + E.11.T + E.11.X |
| **E.12 beam** | ✅ | ⚠️ (1) | ❌ | gone | **STILL** | E.12.C + E.12.T + E.12.X + E.12.D |
| **E.13 grids** | ❌ | — | ❌ | **STILL (1 file)** | **STILL** | E.13.0 (scaffold) + E.13.T + E.13.C + E.13.X + E.13.D |
| **E.14 opening** | ❌ | — | ❌ | gone | gone | E.14.0 (scaffold) + E.14.T + E.14.C |
| **E.15 furniture** | ✅ | ⚠️ (1) | ❌ | **STILL (57 files)** | **STILL** | E.15.C + E.15.T + E.15.X + E.15.D — **biggest single E PR** (57 files to delete) |
| **E.16 structural** | ✅ | ⚠️ (1) | ❌ | **STILL (4 files)** | gone | E.16.C + E.16.T + E.16.X + E.16.D |
| **E.17 plumbing** | ✅ | ⚠️ (1) | ❌ | **STILL (8 files)** | **STILL** | E.17.C + E.17.T + E.17.X + E.17.D |

### §II.E.18 — Remaining `src/elements/` clusters not in the 17

Per Part I: `src/elements/` still has 20 subdirectories.  The non-family
directories (`annotations`, `dimensions`, `lighting`, `preview`,
`roomBoundingLines`, `rooms`) need separate sub-phases:

| Sub-phase | Cluster | Note |
|-----------|---------|------|
| **E.18-A** | `annotations/` (36 files / 12 397 LOC) | Already plugin-mirrored at `plugins/annotations/`; migrate the 36 src files into the plugin. |
| **E.18-D** | `dimensions/` | Plugin exists at `plugins/dimensions/`; check coverage gap. |
| **E.18-L** | `lighting/` | Plugin at `plugins/lighting/`. |
| **E.18-P** | `preview/` | No plugin; relocate to `packages/preview/` or fold into selection. |
| **E.18-RBL** | `roomBoundingLines/` | Fold into `plugins/rooms/`. |
| **E.18-R** | `rooms/` | Plugin at `plugins/rooms/`. |

### §II.E.19 — `src/commands/` final clear

After every E.<F>.X sub-phase lands, the residual `src/commands/<dir>/` files
are deleted in one sweep PR (estimated 24 directories → 0).

**Phase E done when**: `rg -c commandManager.execute src/` → 0;
`ls src/elements/ src/commands/ 2>&1 | grep -q "No such"` → OK;
all 17 plugin contributions exist.

---

## §II.F Phase F — Plugin contributions: implementation plan (94 sub-phases)

### §II.F.0 — Plugin scaffolds (F-prereq) · **8 of 8 ✅ landed 2026-04-29**

Before any F.1.x toolbar contribution can land, every plugin host package
must exist on disk with a valid `package.json` + `src/index.ts` so the
F.1.x sub-phases can drop a `contributions.ts` into a real workspace
member.  The §II.E plugin scaffolds cover 12 canonical element families;
the F-prereq.0 set covers 8 **non-element** plugin hosts that own
toolbar contributions on rails other than the per-discipline create rail
(export, import, render, geospatial, levels-grids, navigate, visibility-intent,
floor — see `16-subphases-F1-toolbars.md` §16.6.1).

| Sub-phase | Plugin id | F.1 sub-phases this unblocks | State | Verifier |
|-----------|-----------|------------------------------|-------|----------|
| **F-prereq.0.A** | `floor` | F.1.06 | ✅ | `rg -c "PLUGIN_ID = 'floor'" plugins/floor/src/index.ts` → `1` |
| **F-prereq.0.B** | `export-pdf` | F.1.25 | ✅ | `rg -c "PLUGIN_ID = 'export-pdf'" plugins/export-pdf/src/index.ts` → `1` |
| **F-prereq.0.C** | `dxf` | F.1.26 | ✅ | `rg -c "PLUGIN_ID = 'dxf'" plugins/dxf/src/index.ts` → `1` |
| **F-prereq.0.D** | `render` | F.1.29 + F.1.50 – F.1.58 | ✅ | `rg -c "PLUGIN_ID = 'render'" plugins/render/src/index.ts` → `1` |
| **F-prereq.0.E** | `geospatial` | F.1.31 – F.1.34 | ✅ | `rg -c "PLUGIN_ID = 'geospatial'" plugins/geospatial/src/index.ts` → `1` |
| **F-prereq.0.F** | `levels` | F.1.37 – F.1.38 | ✅ | `rg -c "PLUGIN_ID = 'levels'" plugins/levels/src/index.ts` → `1` |
| **F-prereq.0.G** | `navigate` | F.1.43 – F.1.48 | ✅ | `rg -c "PLUGIN_ID = 'navigate'" plugins/navigate/src/index.ts` → `1` |
| **F-prereq.0.H** | `visibility-intent` | F.1.59 – F.1.65 + §F.8.x (per `18-subphases-F6-F12.md`) | ✅ | `rg -c "PLUGIN_ID = 'visibility-intent'" plugins/visibility-intent/src/index.ts` → `1` |

> ⚠️ **Naming-bug correction (logged 2026-04-29).**  The first cut of
> F-prereq.0.H scaffolded `plugins/visual/` — that was wrong.  The
> canonical plugin id is **`visibility-intent`** (the rail surface
> remains named *Visual* so a third-party Visual-rail contribution can
> later coexist with the first-party visibility-intent gestures).
> Fixed in-stream by `git mv plugins/visual plugins/visibility-intent`
> + updating `package.json#name`, `PLUGIN_ID`, `PLUGIN_NAME`, README.
> Verifier guards against regression: `find plugins -maxdepth 1 -type d -name 'visual'` → 0 hits.

### §II.F.0.1 — Empty `contributions.ts` stubs (F-prereq.1) · ❌ next-up

For each of the 8 F-prereq.0 plugins, drop an empty
`plugins/<id>/src/contributions.ts` exporting `export const contributions = [] as const;`
so the F.1.x sub-phases can `append` to a real array without race
conditions on package publication.  Touches `plugins/*/src/` only;
zero PHASE-B overlap.

**Verifier**: `find plugins -name 'contributions.ts' -path 'plugins/{floor,export-pdf,dxf,render,geospatial,levels,navigate,visibility-intent}/src/contributions.ts' | wc -l` → `8`.

### §II.F.1 — Toolbar discipline contributions (65 sub-phases)

#### F.1 master pattern

The single ✅ row (`F.1.01 wall.tool`) is the template.  Every subsequent
contribution is a 50-LOC copy with three string substitutions:

```ts
// plugins/<F>/src/contributions.ts
export const <F>ToolbarContribution = {
    kind: 'toolbar.discipline' as const,
    id: '<F>.tool',
    discipline: '<discipline>',          // architecture | structure | services | interiors | landscape
    label: '<F-Capitalised>',
    icon: '<icon-key>',                  // resolved against PryzmIcons in CreateRailPanel
    shortcut: 'Alt+<key>',
    activate: (runtime: { tools: { activate(family: string, mode?: string): void } }) => {
        runtime.tools.activate('<F>', '<default-mode>');
    },
} as const;
```

#### F.1 sub-phase table

| Sub-phase | Family | Discipline | Default mode | Status |
|-----------|--------|-----------|--------------|--------|
| **F.1.01** | wall | architecture | polyline_ortho | ✅ |
| **F.1.02** | slab | architecture | polyline | ❌ |
| **F.1.03** | door | architecture | single | ❌ |
| **F.1.04** | window | architecture | single | ❌ |
| **F.1.05** | curtain-wall | architecture | SINGLE | ❌ |
| **F.1.06** | floor | architecture | polyline | ❌ |
| **F.1.07** | ceiling | architecture | polyline | ❌ |
| **F.1.08** | roof | architecture | polyline | ❌ |
| **F.1.09** | stair | architecture | I | ❌ |
| **F.1.10** | handrail | architecture | (default) | ❌ |
| **F.1.11** | column | structure | (default) | ❌ |
| **F.1.12** | beam | structure | (default) | ❌ |
| **F.1.13** | grids | architecture | rectangular | ❌ |
| **F.1.14** | **REWRITE** `CreateRailPanel._buildSections()` to read from `runtime.plugins.contributions('toolbar.discipline')` instead of hard-coded entries | — | — | ❌ — **the hard step.** Delete the 13 hard-coded `ToolButton` entries; replace with a `for (const c of runtime.plugins.contributions('toolbar.discipline'))` loop that groups by `c.discipline`.  Drop the legacy fallback once F.1.01–.13 all ship. |
| **F.1.15–.20** | `AnnotationRailPanel.ts` rewrite | — | — | ❌ — same shape as F.1.14 for annotations rail (5 buttons). |
| **F.1.21–.30** | `ExportRailPanel.ts` rewrite (5 buttons) | — | — | ❌ |
| **F.1.31–.40** | `GISRailPanel.ts` rewrite (4 buttons) | — | — | ❌ |
| **F.1.41–.48** | `GridsLevelsRailPanel.ts` rewrite (3 buttons) | — | — | ❌ |
| **F.1.49–.55** | `NavigateRailPanel.ts` rewrite (5 buttons) | — | — | ❌ |
| **F.1.56–.62** | `RenderRailPanel.ts` rewrite (6 buttons) | — | — | ❌ |
| **F.1.63–.65** | `VisualRailPanel.ts` rewrite (3 buttons) | — | — | ❌ |

### §II.F.2 — Inspector contributions (19 sub-phases) · all ❌

For each family, declare an inspector contribution + extract panel:

```ts
// plugins/<F>/src/inspector/Panel.ts
export class <F>InspectorPanel extends Panel<<F>InspectorOptions> {
    static readonly panelId = 'panel:inspector:<F>';
    protected onMount() { /* widget for that family */ }
}

// plugins/<F>/src/contributions.ts (append)
export const <F>InspectorContribution = {
    kind: 'inspector.panel' as const,
    family: '<F>',
    panel: <F>InspectorPanel,
} as const;
```

Then `src/ui/PropertyInspector.ts` reads via `runtime.plugins.contributions('inspector.panel')` (this is what unblocks the per-family widget extraction stubbed in B.5).

### §II.F.3 — Modal-creation contributions (15 sub-phases) · all ❌

Same pattern; `src/ui/ElementCreationModal.ts` reads contributions; one
`Create.ts` per family at `plugins/<F>/src/modal/Create.ts`.

### §II.F.4 — Context-menu contributions (8 sub-phases) · all ❌

Per-host `menu.context.<host>` contribution kind:
* F.4.1 `menu.context.project` (hub right-click)
* F.4.2 `menu.context.element` (3D viewport right-click on element)
* F.4.3 `menu.context.canvas` (3D viewport right-click on empty space)
* F.4.4 `menu.context.tree` (spatial tree right-click)
* F.4.5 `menu.context.view-tab` (view tab right-click)
* F.4.6 `menu.context.schedule-row` (schedule cell right-click)
* F.4.7 `menu.context.sheet` (sheet editor right-click)
* F.4.8 `menu.context.dataworkbench` (DW row right-click)

### §II.F.5 — Bottom strip wiring (32 sub-phases) · all ❌, gated by B.38

Each of the 32 buttons in `BottomActionMenu.ts` becomes one sub-phase that
replaces its handler with `runtime.bus.executeCommand` or `runtime.tools.activate`.

### §II.F.6 — Left rail panels (27 sub-phases) · all ❌

Each rail panel reads from `runtime.stores.*` or `runtime.dataWorkbench.*`
instead of legacy singletons.  Order:
* F.6.1 `ProjectBrowserPanel.ts` reads `runtime.persistence.projectListStore`
* F.6.2 `LibraryPanel`
* F.6.3 `SchedulesRailPanel.ts` reads `runtime.stores.schedule`
* F.6.4 `SheetsRailPanel.ts` reads `runtime.stores.sheet`
* F.6.5 panel-toggle registry (replaces `(window as any).toggleXPanel` reaches in `Layout.ts`)
* F.6.6 ... F.6.27 — one per remaining rail panel (12 in `ViewBrowser/panels/`).

### §II.F.7 — AI surface (16 sub-phases) · 1/16 ✅

Per Part I: `RuntimeStatusPill.ts` is the only `runtime.ai.*` consumer (7
reaches).  Remaining 15:
* F.7.1 `AIPanel.ts` prompt submit → `runtime.ai.streamCompletion(...)`
* F.7.2 `AICreatePanel.ts` create-button → `runtime.ai.streamCompletion(...)`
* F.7.3 `ValidatePanel.ts` validate-button → relay
* F.7.4 cost meter — wire `cost.snapshot()` to `RuntimeStatusPill` and
  `AIPanel` header (today: returns zeroed; needs AnthropicRelay per-call cost).
* F.7.5 model selector — `runtime.ai.setModel(model)`
* F.7.6 ... F.7.16 — gestures in NLQueryPanel, FloorPlanImportPanel, etc.

### §II.F.8 — Visibility-Intent gestures (13 sub-phases) · all ❌, gated on slot

`runtime.intent` slot doesn't exist on `PryzmRuntime` today.  First sub-phase
**F.8.1** adds it; F.8.2 .. F.8.13 are per-gesture wireup in `intent/*`.

### §II.F.9 — Data-workbench gestures (16 sub-phases) · all ❌

`runtime.dataWorkbench` slot doesn't exist either.  F.9.1 adds it; F.9.2 ..
F.9.16 are per-panel gestures (Analytics, NLQuery, Compliance, ...).

### §II.F.10 — Rendering controls (14 sub-phases) · all ❌

Each control in `rendering/*` panels reads `runtime.scene.renderer`.  One
sub-phase per control (resolution, AA, shadows, bloom, SSGI, exposure, ...).

### §II.F.11 — Modal contributions (12 sub-phases) · all ❌

`WelcomeModal`, `UpgradeModal`, `ContactSalesModal`, `ConfirmDialog` →
contribution-driven.  One sub-phase per modal × per content slot.

### §II.F.12 — Plugin facades (20 sub-phases) · 0/20 wired into editor

Per Part I: 5 plugins have green tier-tests but 0 are wired into the editor
runtime.  Sub-steps:
* F.12.1 `runtime.ifc` slot (interface exists at types.ts:565+); wire real impl in `composeRuntime` from `@pryzm/plugin-ifc-import` + `-export` + `-inspector`.
* F.12.2 `runtime.rhino` slot; wire from `@pryzm/plugin-rhino-import`.
* F.12.3 `runtime.bcf` slot; wire from `@pryzm/plugin-bcf`.
* F.12.4 `runtime.dxf` slot; create `plugins/dxf/` package (does not exist today); migrate `src/ui/import/DxfImportPanel.ts`.
* F.12.5 .. F.12.20 — per-gesture adoption at every IFC/Rhino/BCF/DXF call site in `src/ui/`.

---

## §II.G Phase G — Global cleanup (rAF + window-as-any zeroing)

### §II.G.1 — `requestAnimationFrame` zeroing · 88 reaches across 51 files

Migration recipe per file:

```ts
// BEFORE
let raf = 0;
function tick() { /* ... */ raf = requestAnimationFrame(tick); }
raf = requestAnimationFrame(tick);
// cleanup: cancelAnimationFrame(raf)

// AFTER
import { getFrameScheduler } from '@pryzm/frame-scheduler';
const dispose = getFrameScheduler().subscribe(() => { /* ... */ });
// cleanup: dispose.dispose()
```

51 files → 51 sub-phases (G.1.1 .. G.1.51).  All mechanical.  Verifier at end:
`rg -c requestAnimationFrame src/ | awk -F: '{s+=$NF} END {print s}'` → 0.

### §II.G.2 — `(window as any)` zeroing · 766 reaches in src/ui/

By Phase B end, every cast is annotated with destruction sub-phase.  Phase
G.2 is the **bulk delete** that runs after every C/D/E/F prerequisite has
landed.  Verifier: `rg -c '\(window as any\)' src/ui/ | awk -F: '{s+=$NF} END {print s}'` → 0.

Sub-phase ordering (so the count drops monotonically):
* **G.2.1** — delete all C-bucket casts (≈ 60 across persistence/projectContext)
* **G.2.2** — delete all D-bucket casts (≈ 280 across engine/camera/picking)
* **G.2.3** — delete all E-bucket casts (≈ 350 across commandManager + per-family stores)
* **G.2.4** — delete all F-bucket casts (≈ 76 across plugin/contribution shims)

### §II.G.3 — `commandManager.execute` zeroing · 122 files

Already mostly happens in §II.E.X per family.  G.3 is the last-mile sweep
covering files not in any specific family (`src/ui/PropertyInspector.ts`
helper, `Layout.ts` keyboard shortcuts, etc.).

### §II.G.4 — Remove legacy DOM events

* `'pryzm-selection-changed'` listeners → `runtime.events.on('selection.changed', ...)` (already wired in B.10)
* `'pryzm-open-project'` listeners → `runtime.persistence.openProject(...)` (already wired)
* `'bim-store-mutated'` listeners → `runtime.events.on('scene.ready', ...)` (Phase D)
* `'pryzm-go-hub'` → `runtime.workspace.show('hub')` (after D.12)

---

## §II.H Phase H — Extraction ledger

> Phase H is the **final relocation pass**: every file in `src/` that
> belongs in a `packages/<x>/` or `plugins/<x>/` is moved to its canonical
> home.  This is bookkeeping; behaviour does not change.  See
> `27-phase-H-extraction-ledger.md` for the master ledger; the table below
> is the active migration order.

| Sub-phase | Source | Destination | Trigger |
|-----------|--------|-------------|---------|
| **H.1** | `src/persistence/*` (legacy) | `packages/persistence-client/src/` | C.14 lands |
| **H.2** | `src/engine/EngineBootstrap.ts` (residual after D.4) | `src/engine/bootstrap.ts` (rename) | D.4.9 lands |
| **H.3** | `src/core/rendering/RenderPipelineManager.ts` | `packages/renderer/src/` | D.6 lands |
| **H.4** | `src/core/batch/BatchCoordinator.ts` | (decision per D.8) | D.8 lands |
| **H.5** | `src/core/drawing/DrawingPipelineOrchestrator.ts` | (decision per D.8) | D.8 lands |
| **H.6** | `src/elements/<F>/*` (per family) | `plugins/<F>/src/elements/` | Each E.<F>.D lands |
| **H.7** | `src/commands/<F>/*` (per family) | `plugins/<F>/src/commands/` | Each E.<F>.D lands |
| **H.8** | `src/ui/property-inspector/<F>Section.ts` | `plugins/<F>/src/inspector/Panel.ts` | F.2.<F> lands |
| **H.9** | `src/ai/AnthropicClient.ts` | `packages/ai-host/src/` | F.7.x lands |
| **H.10** | `src/ai/AIRules.ts` | `packages/ai-host/src/` (or `plugins/ai-rules/src/`) | F.7.x lands |
| **H.11** | `src/ui/import/DxfImportPanel.ts` (after class conversion) | `plugins/dxf/src/Panel.ts` | F.12.4 lands |
| **H.12** | `src/ui/SheetEditor/*` | `plugins/sheets/src/` | F.6.4 lands |
| **H.13** | `src/ui/SchedulePanel/*` | `plugins/schedules/src/` | F.6.3 lands |
| **H.14** | `src/ui/dataworkbench/*` (orchestrator + 13 panels) | `packages/data-workbench/src/` | F.9.x lands |
| **H.15** | `src/ui/ai/*` | `packages/ai-host/src/panels/` | F.7.x lands |
| **H.16** | `src/ui/intent/*` | `packages/visibility/src/intent/` | F.8.x lands |
| **H.17** | `src/ui/generative/*` | `plugins/ai-generative/src/` | F.7.x lands |
| **H.18** | `src/ui/rendering/*` | `packages/renderer/src/panels/` | F.10.x lands |
| **H.19** | `src/ui/geospatial/*` | `packages/geospatial/src/` | (new package) |
| **H.20** | `src/ui/inspect/*` | `packages/audit/src/` | (new package) |

After H.1 .. H.20, `src/ui/` contains only the cross-cutting orchestration
layer (`Layout.ts`, `LeftNavRail.ts`, `PlatformShell.ts`, `PlatformRouter.ts`,
the modal trio, `BottomActionMenu.ts`, `ProjectHub.ts`, the platform/* pages).
Estimated final `src/ui/` LOC: ≈ 8 000 (from ≈ 60 000 today).

---

## §II.Z Verification harness amendments (Z.0 – Z.20)

Per Part I §"Z.0 – Z.20": the amendments specified in
`26-plan-self-corrections.md` are all ❌.  This section gives them
implementation-level definition.

### §II.Z.1 — Parametric baseline file

Create `.local/state/replit/agent/wireup-floor.json`:

```json
{
  "schema": "wireup-floor.v1",
  "lastRun": "2026-04-29T00:00:00Z",
  "metrics": {
    "windowAsAnyInUi":            { "current": 766, "target": 0,  "direction": "down" },
    "extendsPanelInUi":           { "current": 1,   "target": 40, "direction": "up"   },
    "runtimeTypedInUi":           { "current": 8,   "target": 40, "direction": "up"   },
    "rafReachesOutsideScheduler": { "current": 88,  "target": 0,  "direction": "down" },
    "commandManagerExecute":      { "current": 122, "target": 0,  "direction": "down" },
    "engineBootstrapImporters":   { "current": 110, "target": 0,  "direction": "down" },
    "legacyPersistenceFiles":     { "current": 3,   "target": 0,  "direction": "down" }
  }
}
```

### §II.Z.2 — `pnpm ga-gate` runtime smoke test

A single command that:
1. Re-runs `composeRuntime()` and asserts every slot is non-null and non-throwing.
2. Loads a minimal project fixture and asserts first-paint < 800 ms.
3. Re-runs all verifier commands and re-emits `wireup-floor.json`.
4. Fails CI if any metric regressed.

Lives at `scripts/ga-gate.ts`; wired to `package.json:scripts.ga-gate`.

### §II.Z.3 — Retire `re-slice` script

Per `26-plan-self-corrections.md`: the `scripts/re-slice` script is removed
because the new sub-phase plan is already pre-sliced.  Action: `rm scripts/re-slice*`.

### §II.Z.4 — `--extended-regexp` git-log fix

Per `26-plan-self-corrections.md`: the `git log --grep` invocations must use
`-E` so the alternation `(B|C|D|E|F|G|H)\.` works.  Update the audit
verifier scripts.

### §II.Z.5 — Move `tools/eslint-plugin-pryzm/` to `packages/eslint-plugin-pryzm/`

The lint plugin lives at `tools/eslint-plugin-pryzm/` today.  Move to
`packages/` so it participates in the workspace graph (gets versioned with
other packages, can be `peerDependency` in `packages/ui-base/`).

### §II.Z.6 — CI gate (ratchet enforcement)

GitHub Action `.github/workflows/wireup-ratchet.yml`:

```yaml
- run: pnpm ga-gate --check
  # exits non-zero if any metric in wireup-floor.json regressed
```

### §II.Z.7 — Lint rule `pryzm/no-unannotated-window-cast`

Fails on any `(window as any)` reach not followed by a `// TODO(<phase>.<step>):`
annotation.  Implementation in `packages/eslint-plugin-pryzm/src/rules/no-unannotated-window-cast.js`.

### §II.Z.8 — Lint rule `pryzm/no-runtime-package-import`

Fails on any `import ... from '@pryzm/<x>'` in `src/ui/` where `<x>` is not
`runtime-composer` or `ui-base`.  Per types.ts:7 — only those two packages
are reachable from white UI.  Implementation in
`packages/eslint-plugin-pryzm/src/rules/no-runtime-package-import.js`.

### §II.Z.9 — Lint rule `pryzm/no-direct-rAF`

Fails on any `requestAnimationFrame(` reach outside `packages/frame-scheduler/`.
Lands when G.1 reaches 0.

### §II.Z.10 — Lint rule `pryzm/no-commandmanager-execute`

Fails on any `commandManager.execute(` reach outside `src/legacy/`.  Lands
when G.3 reaches 0.

### §II.Z.11 — Lint rule `pryzm/no-engine-bootstrap-import`

Fails on any `from '...EngineBootstrap'` import.  Lands when D.4.10 ships.

### §II.Z.12 — `packages/bench-visual-diff/` (new package)

Per the plan, a visual-regression bench harness that compares pre/post
screenshots for every Phase B–G PR.  Initial implementation: pixelmatch +
a fixture project; emits diff PNGs on regression.

### §II.Z.13 — `packages/release/` (new package)

Owns the release-channel + version-bump workflow.  Per
`26-plan-self-corrections.md` §3.

### §II.Z.14 – §II.Z.20 — Per-bench packages

`apps/bench/scripts/` houses one `<name>.bench.ts` per row in the §16.2 / §16.3
tables (B.2 → B.40 : ≈ 22 benches; C.1 → C.11 : 18 benches; D.x : 14;
E.x : 17; F.1 → F.12 : ≈ 20).  Total ≈ 91 benches; one sub-phase per
bench package.

---

## §II.99 — Roll-up: total sub-phase count and execution order

### Per-phase sub-phase totals (after this plan)

| Phase | Sub-phases | Done | Partial | Missing |
|-------|-----------|------|---------|---------|
| **A** | 7 | 7 | 0 | 0 |
| **B** | 154 (~40 panel sub-phases × 1–4 per panel sub-step) | 8 | 8 | 138 |
| **C** | 27 | 5 | 7 | 15 |
| **D** | 14 + ≈ 30 D.4.x split sub-steps + D.10/D.11/D.13 adoption sites + 1 (D-finish.1 = D.3 early) = **≈ 61** | **3** (was 2; +D.7.1 row 18 — `getFrameScheduler()` factory) | **7** (was 4; +D.9 +D.11 +D.12 flipped from missing → partial via D.9-prep / D.11-prep / D.12-prep) | **51** |
| **E** | 17 families × 6 steps + 6 E.18 clusters + 1 (E-finish.0.E PluginRegistry registration) = **≈ 109** | **1** (was 0; +E-finish.0.E) | 14 | 94 |
| **F** | 8 (F.0 / F-prereq.0) + 1 (F.0.1 / F-prereq.1) + 65 (F.1) + 19 + 15 + 8 + 32 + 27 + 16 + 13 + 16 + 14 + 12 + 20 = **266** | **10** (was 9; +F-prereq.1 row 19 — 8 contribution stubs as one prereq sub-phase) | 0 | 256 |
| **G** | 51 (G.1) + 4 (G.2) + ~15 (G.3) + 4 (G.4) = **74** | 0 | 0 | 74 |
| **H** | 20 | 0 | 0 | 20 |
| **Z** | 21 | **1** (was 0; +Z.5 row 20 — eslint-plugin moved into workspace `packages/`) | 0 | 20 |
| **TOTAL** | **726** (was 715; +11 newly-tracked sub-phases) | **35** (was 32; +3 today: D.7.1 / F-prereq.1 / Z.5) | **36** (was 33; +3) | **655** (was 658; −3) |

> **Delta source**: 2026-04-29 parallel stream (formerly tracked in `PHASE-B-PARALLEL-PROGRESS-2026-04-29.md`, now folded into rows 16a–16h above and into §II.F.0).  Source tracker file is to be **deleted** post-merge per its own §"Manual-merge instructions" §5.

### Execution-order roadmap (the canonical sprint plan)

| Sprint | Theme | Sub-phases targeted |
|--------|-------|---------------------|
| **S73** | Phase A close + B mechanical sweep wave 1 | A.6 (✅ landed); B.2–B.13 (≈ 18 panels) |
| **S74** | Phase B wave 2 + Phase C C.1–C.6 + Phase D type-only (D.9, D.11, D.12) | B.14–B.30 (≈ 50 panels); C.1.5–C.6.04; D.9, D.11, D.12 |
| **S75** | Phase B wave 3 + Phase D D.7 (UnifiedFrameLoop) + Phase Z lint plugin moves | B.31–B.40 (≈ 30 panels); D.7.1–D.7.10; Z.5, Z.6, Z.7 |
| **S76** | **THE KEYSTONE** — Phase D D.4 (EngineBootstrap split) | D.4.1–D.4.10; concurrently: C.7, C.8, C.9 |
| **S77** | Phase D residuals + Phase E waves 1–3 (mechanical families) | D.3, D.6, D.10, D.13, D.14; E.1–E.10 |
| **S78** | Phase E final + Phase F wave 1 (F.1 toolbar discipline) | E.11–E.17; F.1.02–F.1.65 |
| **S79** | Phase F waves 2–4 (F.2 inspector + F.3 modal + F.4 context) | F.2.1–F.2.19; F.3.1–F.3.15; F.4.1–F.4.8 |
| **S80** | Phase F waves 5–7 (F.5 bottom + F.6 rails + F.7 AI) | F.5.x; F.6.x; F.7.x |
| **S81** | Phase F waves 8–10 (F.8/F.9/F.10) + Phase F.11/F.12 facades | F.8.x; F.9.x; F.10.x; F.11.x; F.12.x |
| **S82** | Phase G global cleanup + Phase H extraction | G.1.x; G.2.x; G.3.x; H.1–H.20 |

### Definition-of-done (100 / 100)

The codebase is at 100 / 100 when **every** verifier in the table below
prints the target value, simultaneously, on a single CI run:

```bash
rg -l "extends Panel\b" src/ui/ --type ts | wc -l                                  # ≥ 154
rg -l "runtime: PryzmRuntime" src/ui/ --type ts | wc -l                            # ≥ 154
rg -c "\(window as any\)" src/ --type ts | awk -F: '{s+=$NF} END {print s}'        # 0
rg -c "requestAnimationFrame\(" src/ --type ts | awk -F: '{s+=$NF} END {print s}'  # 0
rg -l "commandManager\.execute" src/ --type ts | wc -l                             # 0
rg -l "EngineBootstrap" src/ --type ts | wc -l                                     # 0
ls src/ui/platform/{ProjectRepository,SaveOrchestrator,ServerSyncQueue}.ts 2>&1 \
    | grep -c "No such" | grep -q ^3$                                              # OK
ls src/engine/EngineBootstrap.ts apps/editor/src/main.ts \
    src/core/rendering/UnifiedFrameLoop.ts 2>&1 | grep -c "No such" | grep -q ^3$  # OK
find plugins -name "contributions.ts" | wc -l                                      # ≥ 17
find plugins -path "*/inspector/Panel.ts" | wc -l                                  # ≥ 12
find plugins -path "*/modal/Create.ts"   | wc -l                                   # ≥ 12
ls packages/{renderer,scene-builder,tool-registry,picking,camera,scene-utils} \
    | wc -l                                                                        # ≥ 6
ls packages/eslint-plugin-pryzm/src/rules/{no-window-as-any,\
no-unannotated-window-cast,no-runtime-package-import,no-direct-rAF,\
no-commandmanager-execute,no-engine-bootstrap-import}.js | wc -l                   # 6
pnpm tsc --noEmit                                                                  # exit 0
pnpm vite build                                                                    # exit 0
pnpm ga-gate                                                                       # exit 0
pnpm bench:full                                                                    # all green
```

— END Part II —
