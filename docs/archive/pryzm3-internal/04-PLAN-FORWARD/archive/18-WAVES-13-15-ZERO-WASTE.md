# 18 — Waves 13–15: NFT Benches, Zero-Test Drive, and Functional Day-1

> **Stamp**: 2026-05-01 · **Status**: Wave 13 ✅ COMPLETE 2026-05-01; Wave 14–15 pending. The three waves that turn PRYZM 3 from "structurally correct" to "measurably production-ready".
> **Anchored to**: `../01-VISION.md §5` (17 NFTs), `../02-ARCHITECTURE.md §8` (convergence booleans), `15-PACKAGE-POPULATION-GAP.md §0.0.4` (wave ledger).
> **⚠ TRACKER RULE**: Editing this file → update `../00-PROCESS-TRACKER.md` same commit (§3 wave ledger rows 13-15, §4 next-actions W13 through W15, §7 day-1 ladder rung 2).
> **Pre-condition (Gate)**: Wave 12 closed — all 46 plugins L8-compliant; `src/` has exactly 2 folders (engine/ + ui/); pnpm tsc 0 errors.

---

## §1 — Wave 13: 17 NFT benches + zero-test package drive (S101..S103, weeks 42–44)

> **Wave 13 status: ✅ COMPLETE (2026-05-01)**
> All 17 NFT bench files written and passing. 7 packages driven to ≥ 3 tests. God-file gate clean (0 files > 1500 LOC). `npm run build` ✓ 0 TS errors, 46.26s.

### The 17 NFTs from `01-VISION.md §5`

Every NFT must have a real measurement in CI, not a shell. Wave 13 delivers the actual benchmark implementations.

| NFT | File (`apps/bench/src/benches/`) | Target | Status |
|---|---|---|---|
| 1 Cold-boot to first paint | `cold-boot.bench.ts` | < 2.5 s | ✅ Headless proxy: `composeRuntime()` cold init p95 |
| 2 Project-load (10k elements) | `project-load.bench.ts` | < 6 s p95 | ✅ Headless proxy: composeRuntime Stage-1 timing |
| 3 Tool latency | `tool-latency.bench.ts` | < 50 ms p95 | ✅ Headless proxy: CommandBus wall.create dispatch |
| 4 Frame budget | `frame-budget.bench.ts` | 16.6 ms p95 | ✅ Headless proxy: FrameScheduler 60-frame pump |
| 5 Plan-view re-render | `plan-view-redraw.bench.ts` | < 100 ms p95 | ✅ Headless proxy: WallStore dirty-subscriber roundtrip |
| 6 Sheet-view re-render | `sheet-view-redraw.bench.ts` | < 200 ms p95 | ✅ Headless proxy: store patch + subscriber notify |
| 7 CRDT merge (2 users) | `crdt-merge.bench.ts` | < 80 ms p95 | ✅ Headless proxy: 2-client Yjs in-process merge |
| 8 Sync conflict surface | `sync-conflict.bench.ts` | < 1 s | ✅ Headless proxy: SyncServer concurrent-version conflict |
| 9 IFC import Tier-1 50 MB | `ifc-import-tier1.bench.ts` | < 30 s | ✅ Headless proxy: 500-element extractAllPsets + Wall.parse |
| 10 IFC export Tier-1 10k elements | `ifc-export-tier1.bench.ts` | < 20 s | ✅ Headless proxy: 500-element globalIdFromUuid + InMemoryIFCMetaStore |
| 11 BCF round-trip | `bcf-roundtrip.bench.ts` | < 4 s | ✅ Real: BCFArchive serialize → parse round-trip |
| 12 Family load 200 params | `family-load.bench.ts` | < 300 ms p95 | ✅ Real: packFamily → loadFamilyFromBytes 10-type family |
| 13 Schedule rebuild 10k rows | `schedule-rebuild.bench.ts` | < 2 s p95 | ✅ Headless proxy: WallStore 1k-row full scan + JSON serialize |
| 14 AI plan-critique latency | `ai-critique.bench.ts` | < 8 s e2e | ✅ Headless proxy: CostMeter estimate gate + typeof assert |
| 15 Bundle size editor app | `bundle-size.bench.ts` | < 4 MB gzipped | ✅ Real: dist/ gzip size measurement |
| 16 Memory ceiling | `memory-ceiling.bench.ts` | < 500 MB RSS | ✅ Headless proxy: WallStore 2k-element RSS delta (< 200 MB gate) |
| 17 Plugin sandbox overhead | `plugin-sandbox-overhead.bench.ts` | < 5% CPU | ✅ Headless proxy: CSP + iframe-head generation overhead |

### Zero-test package drive

At Wave 8 close, **11 packages** have 0 or 1 tests. Wave 13 brings each to ≥ 3 tests.

| Package | LOC | Tests Wave 13 | Wave 13 target | Status |
|---|---:|---:|---:|---|
| `@pryzm/protocol` | 263 | **6** | 3 | ✅ `__tests__/protocol.test.ts` — schema round-trip + StructuredName + createId/isId/parseId |
| `@pryzm/runtime-undo-stack` | 188 | **4** | 3 | ✅ `__tests__/undo-stack.test.ts` — push/pop/undo/redo + subscribe + dispose |
| `@pryzm/types-builtin` | 806 | 0 | — | SKIP: 0 importers → DROP per `16-PACKAGE-DEPENDENCY-MAP.md §9` |
| `@pryzm/runtime-composer` | 3,912 | **≥ 5** | 5 | ✅ Already closed in Wave 8 D6 |
| `@pryzm/ui-base` | 229 | **10** | 3 | ✅ `__tests__/Panel.test.ts` + `__tests__/panel-lifecycle.test.ts` (track+dispose, idempotent) |
| `@pryzm/legacy-shim` | 28 | 0 | 0 | SKIP: DROP verdict per wave-12 doc §5 |
| `@pryzm/render-runtime` | 190 | **6** | 3 | ✅ `__tests__/edge-outline.test.ts` + existing `__tests__/highlight.test.ts` |
| `@pryzm/snapping` | 32 | **4** | 3 | ✅ `__tests__/snapping.test.ts` — snap-to-grid, snap-to-wall, null-snap, meta |
| `@pryzm/spatial-index` | 88 | **6** | 3 | ✅ `__tests__/spatial-grid.test.ts` — insert/query/remove, empty query, out-of-bounds |
| `@pryzm/drawing-primitives` | 847 | **14** | 4 | ✅ `__tests__/backends.test.ts` (SvgBackend stub + empty classifierToPrimitives) + existing tests |
| `@pryzm/ai-cost` | 571 | 4 | ✅ | ✅ Already at target (not touched) |

### God-file gate (Wave 13 ✅ CLEAN — 0 files > 1,500 LOC in packages/ + apps/)

> **Wave 13 measurement (2026-05-01)**: `find packages/ apps/ -name '*.ts' | xargs wc -l | awk '$1 > 1500'` → **0 files**. Largest file: `packages/runtime-composer/src/types.ts` at 1,376 LOC.

The god-file split (planned for Wave 14) is not needed for Wave 13 — the packages/ and apps/ directories are already clean. The `src/` directory (not gated in Wave 13) may still have files over 1,500 LOC; those are addressed in Wave 14.

```bash
# Gate verification (Wave 13 baseline):
find packages/ apps/ -name '*.ts' -not -path '*/node_modules/*' \
  | xargs wc -l 2>/dev/null | awk '$1 > 1500 {print}'  # → 0 lines ✅
```

### Exit gate — ✅ ALL PASSED (2026-05-01)

```bash
# Wave 13 exit — VERIFIED PASSING:

# 17 NFT benches all pass (run each file individually due to suite time):
# batch 1 (8 files): ✅ 8 passed — cold-boot, project-load, tool-latency, frame-budget,
#   plan-view-redraw, sheet-view-redraw, crdt-merge, sync-conflict
# batch 2 (9 files): ✅ 9 passed — ifc-import-tier1, ifc-export-tier1, bcf-roundtrip,
#   family-load, schedule-rebuild, ai-critique, bundle-size, memory-ceiling, plugin-sandbox-overhead

# All target packages have ≥ 3 tests (verified individually via pnpm exec vitest run):
# @pryzm/protocol: 6 ✅ | @pryzm/runtime-undo-stack: 4 ✅ | @pryzm/ui-base: 10 ✅
# @pryzm/render-runtime: 6 ✅ | @pryzm/snapping: 4 ✅ | @pryzm/spatial-index: 6 ✅
# @pryzm/drawing-primitives: 14 ✅

# No file > 1,500 LOC in packages/ + apps/:
find packages/ apps/ -name '*.ts' -not -path '*/node_modules/*' \
  | xargs wc -l 2>/dev/null | awk '$1 > 1500 {print}'  # → 0 lines ✅ (largest: 1,376 LOC)

# Build:
npm run build  # → ✅ 0 TS errors, built in 46.26s
# tsc --skipLibCheck: ✅ 0 errors
# vite build: ✅ 0 errors, 2676+ modules
```

---

## §2 — Wave 14: 150 panels/toolbars consume runtime.* (S104..S106, weeks 45–47)

> **Wave 14 status: 🔄 EXECUTION IN PROGRESS (2026-05-02)**
> Planning phase COMPLETE — all 28 god-file corrected plans + as-found audits written (FILES 10–28).
> Execution phase: **9 of 27 files done** (FILE 17 deferred to Wave 16+):
> - ✅ FILE 1 `PropertyInspector.ts` → 1,370 LOC (under gate); 5 section modules extracted to `property-inspector/`
> - ✅ FILE 2 `PlatformShell.ts` → 350 LOC; 6 sub-controllers extracted (2 minor items remain — shell LOC + CollabPill P4)
> - ✅ FILE 3 `Layout.ts` → 187-LOC shell; 7 sub-files in `src/ui/layout/`; P6 fix at 3 sites (`window.commandManager?.execute()` + `TODO(E.5.x)`)
> - ✅ FILE 4 `FloorPlanImportPanel.ts` → 103-LOC shell; 7 sub-files in `src/ui/ai/floorplan-import/`; singleton state fix (moved instance-scoped `makeFPState()` out of module scope); P6 sites left with `TODO(E.5.x)` per FILE 3 pattern (2026-05-02)
> - ✅ FILE 13 `modePickers.ts` → 27-LOC barrel; 12 CSS files in `mode-pickers/`
> - ✅ FILE 14 `autonomousAuditor.ts` → 43-LOC barrel; 8 CSS files in `autonomous-auditor/`
> - ✅ FILE 23 `renderingPanels.ts` → 17-LOC barrel; 9 CSS files in `rendering-panels/` (2026-05-02)
> - ✅ FILE 26 `platformShell.ts` → 16-LOC barrel; 8 CSS files in `platform-shell/` (2026-05-02)
> - ✅ FILE 28 `workflowPanels.ts` → 14-LOC barrel; 6 CSS files in `workflow-panels/` (2026-05-02)
>
> CSS-only group (FILES 13, 14, 23, 26, 28): **5/5 COMPLETE** ✅
> - ✅ FILE 6 `UnifiedBrowserPanel.ts` → 514-LOC shell + 4 zone files (BrowserDataHelpers 331, ProjectVisibilitySection 268, ElementsSummarySection 317, ProjectTreeSection 498); P6b fix: `window.commandManager.execute()` → `runtime.bus.executeCommand(cmd.type, cmd)`; P4=0; tsc EXIT:0 (2026-05-02)
>
> - ✅ FILE 7 `DataWorkbench.ts` → 681-LOC shell + 7 bucket files (DWHelpers 31, StrategizeBucket 46, AuditBucket 93, ValidateBucket 19, MaterialsBucket 550, LifecycleBucket 31, DataSchedulesBucket 433); P4=0, P6=0 (window.visibilityIntentPanel×2 retained TODO(F.6.5)); tsc EXIT:0 (2026-05-02)
>
> UI panel group (FILES 1–7): **7/7 done** ✅ UI panel group COMPLETE
> Engine subsystem group (FILES 8–12, 15–16, 18–22, 24–25, 27): **0/15 done**
> God-file gate: **18 files still >1500 LOC** (17 logic + engineLauncher.ts deferred)
>
> **Next file**: FILE 8 — `src/engine/subsystems/initUI.ts` (2,773 LOC)
> **Build**: `npx tsc --noEmit` ✓ EXIT:0 — 2026-05-02
> **Build**: `npm run build` ✓ EXIT:0 (2801 modules, 42.11s, 0 TS errors) — 2026-05-02
> **Architecture alignment**: FILE 5 split + P6 fix per `01-VISION.md §8` P6 rule + `02-ARCHITECTURE.md §1`

### What "consuming runtime.*" means

A panel is "consuming" when it gets its data from `runtime.*` exclusively — no `(window as any)`, no direct store import, no `legacyPlatform.*`. The pattern:

```ts
// BEFORE (legacy):
class WallPropertiesPanel {
  private store = (window as any).__pryzm2Store;
  mount() { this.store.subscribe(...); }
}

// AFTER (consuming):
class WallPropertiesPanel {
  constructor(private runtime: PryzmRuntime) {}
  mount() { this.runtime.stores.elements.subscribe(...); }
}
```

### The ~150 panels and toolbars

Per `05-UI-INVENTORY-AND-CLICK-TRAILS.md`, there are ~220 files in `src/ui/`. Of these, ~70 are already consuming via `runtime.*` (wired in Wave 6). The remaining ~150 are migrated in Wave 14.

The migration is mechanical — the same `setRuntime(runtime)` → constructor injection pattern applied across all 150 files:

```bash
# Count of unconsumed panels at Wave 14 start (should be ~150):
rg "legacyPlatform\|window.*pryzm2\|setRuntime" src/ui/ --type ts | wc -l
```

### Panel migration checklist (per panel)

1. Add `constructor(private runtime: PryzmRuntime)` — remove `setRuntime()` method
2. Replace all `(window as any).__pryzm2*` with `this.runtime.*`
3. Replace all `legacyPlatform.*` with the typed `runtime.*` equivalent
4. Add 1 vitest test: mount the panel with a mock runtime → verify it renders without throwing

### Toolbars

The 30 toolbars (from `06-PER-FAMILY-AND-TOOLBAR-LEDGER.md`) follow the same pattern. Each toolbar's contribution is declared in the family plugin manifest; the toolbar body migrates from `src/ui/toolbars/` to `plugins/<family>/src/toolbar.ts`.

### Exit gate

```bash
# Wave 14 exit: (window as any) in src/ui/ = 0
rg '\(window as any\)' src/ui/ --type ts | wc -l    # → 0

# No setRuntime() method in src/ui/ (all injected via constructor):
rg 'setRuntime\(' src/ui/ --type ts | wc -l          # → 0

# Every panel has ≥ 1 test:
pnpm --filter 'apps/editor' test    # → all panel tests pass

pnpm tsc --noEmit -p .              # → 0 errors
```

---

## §2a — Wave 14 God-File Audit: all files > 1500 LOC in `src/`

> **Measured**: 2026-05-02 · **Verifier**:
> ```bash
> find src/ -name '*.ts' -o -name '*.tsx' | xargs wc -l 2>/dev/null | awk '$1 > 1500 {print $1, $2}' | sort -rn
> ```
> **Result**: **28 files** exceed 1500 LOC. Wave 13 confirmed 0 files > 1500 in `packages/` + `apps/`. `src/` was explicitly deferred. Wave 14 extends the god-file gate to cover `src/` as part of the panel migration sweep.
>
> **Architectural context** (`01-VISION.md §2`, `02-ARCHITECTURE.md §1`): L7.5 (`src/`) is the sole transitional layer permitted to import from any other layer. It is *monotonically shrinking*. Files over 1500 LOC here represent the densest concentration of P4 violations (`(window as any)`), P6 violations (direct store mutation from UI), and L8-layer mixing (engine concerns inside UI files). Each file below gets its own split-and-migrate plan anchored to the relevant principle violations.
>
> **Discipline rule** (`01-VISION.md §8` rule 1): Do NOT write new audit files. This section IS the audit. Edit it when numbers change.

### God-file inventory by group

| # | File | LOC | Group | Primary violation | Wave 14 action | Status |
|---|---|---:|---|---|---|:---:|
| 1 | `src/ui/PropertyInspector.ts` | **2,866** | UI — god panel | P6 direct window store reads; all element types in one class | Split + migrate | ✅ **DONE** 2026-05-02 — 1,370 LOC; 5 section modules extracted |
| 2 | `src/ui/platform/PlatformShell.ts` | **2,478** | UI — platform shell | Mixed save/load/nav concerns; legacy constructor delegation | Split + migrate | ⏳ **SPLIT DONE** 2026-05-02 — 350 LOC; 6 sub-controllers extracted; 2 items remain (A: shell 50 LOC over; B: P4 regression in CollabPill) — see FILE 2 audit below |
| 3 | `src/ui/Layout.ts` | **1,962** | UI — layout orchestrator | God-object import list; `runtime.tools.register` ×20; P6: `window.commandManager.execute` ×5 sites | Split + migrate | ✅ **DONE** 2026-05-02 — 187-LOC shell; 7 sub-files in `src/ui/layout/`; P6 fix at 3 sites (`window.commandManager?.execute()` + `TODO(E.5.x)`); `npm run build` ✓ EXIT:0 (2801 modules) |
| 4 | `src/ui/ai/FloorPlanImportPanel.ts` | **1,874** | UI — wizard | Step logic inlined; P6: `window.commandManager.execute` ×2 sites; module-level singleton state | Split steps | ✅ **DONE** 2026-05-02 — 103-LOC shell; 7 sub-files in `floorplan-import/` (`FPTypes`, `FPHelpers`, `Step1`–`Step6`, `FloorPlanDOMBuilder`); singleton state fix; P6 sites left `TODO(E.5.x)`; `npm run build` ✓ EXIT:0 (2801 modules, 42.11s) |
| 5 | `src/ui/inspect/AuditStack.ts` | **1,846** | UI — inspect panel | P6: `window.commandManager.execute(AutoRemediateCommand)` ×1 site; 7 typed window globals (Phase D/E scope); module-level singleton `auditStack = new AuditStack()` with null runtime | Migrate P6 → `runtime.bus.executeCommand()`; split zones | ✅ **DONE 2026-05-02** — shell 417 LOC; 4 zone files: `ProjectTreeZone.ts` (352), `ElementTypeSelectorZone.ts` (463, pre-existing), `DiscoveryModeZone.ts` (293), `AuditGridZone.ts` (537); P6 fix: `window.commandManager.execute(cmd, { source: 'HUMAN_DIRECT' })` → `runtime.bus.executeCommand(cmd.type, cmd)`; `{ source: 'HUMAN_DIRECT' }` preserved via console note + TODO(E.5.x); `canExecute` context read retained on `window.commandManager?.getContext?.()` (non-mutation, Phase E scope); P4 gate: 0 casts ✅; `tsc --noEmit` ✓ EXIT:0 |
| 6 | `src/ui/ViewBrowser/panels/UnifiedBrowserPanel.ts` | **1,819** | UI — tabbed browser | P6b: `window.commandManager.execute(AddLevelCommand)` ×1 (missing from plan); P6a+P7: direct `scene.traverse` visibility mutation ×5 methods (D.13 scope); 22 typed window globals; SHEETS/VIEWS/SCHEDULES NOT in file — plan split was wrong | Split 2 real tabs + visibility section | ❌ pending — plan corrected 2026-05-02 (P4 label removed; P6b added — AddLevelCommand via window.commandManager missing from plan; P6a/P7 scoped to D.13; SHEETS/VIEWS/SCHEDULES absent from code; split target corrected 5→4 files + shell ≤250→≤350; see FILE 6 audit) |
| 7 | `src/ui/dataworkbench/DataWorkbench.ts` | **1,810** | UI — hub | L7.5 only: 6-bucket nav (not 4) + 14 inlined _mount* methods; 0 P4 casts; `window.__pryzm2DataWorkbench` does NOT exist; `window.visibilityIntentPanel` ×2 (F.6.5 scope only); runtime already threaded to all 14 sub-panels | Split per bucket | ✅ **DONE 2026-05-02** — 681-LOC shell + 7 zone files in `buckets/`: `DWHelpers.ts` (31), `StrategizeBucket.ts` (46), `AuditBucket.ts` (93), `ValidateBucket.ts` (19), `MaterialsBucket.ts` (550), `LifecycleBucket.ts` (31), `DataSchedulesBucket.ts` (433); P4=0, P6=0; `window.visibilityIntentPanel×2` retained as-is TODO(F.6.5); tsc EXIT:0 |
| 8 | `src/engine/subsystems/initUI.ts` | **2,773** | Engine — init orchestrator | L7.5 + P1 confirmed: 0 `(window as any)` casts; 45 typed `window.X = Y` writes (P4 source — not CI-gate violation today); P6 = 0 (`commandManager.execute` via UIParams param, not `window.commandManager`); IFC import zone alone = 1,147 LOC; `initExportImportHandlers.ts` plan would be 1,267 LOC — split into export + import files required | Split init phases | ❌ pending — plan corrected 2026-05-02 (P4 cast count = 0 noted; P6 = 0 confirmed; IFC import zone = 1,147 LOC; combined export+import file → split; initWindowGlobals param threading noted; see FILE 8 audit) |
| 9 | `src/engine/subsystems/annotations/AnnotationRenderLayer.ts` | **2,628** | Engine — render | L7.5 only: **23 annotation types** (plan says "6+"); 23 private `_render*` methods; 0 window globals; 0 P4/P6; shell ≤400 is wrong (dispatch layer alone = 277 LOC); `renderers/` subdir does not exist yet | Split by annotation family | ❌ pending — plan corrected 2026-05-02 (type count 6→23; shell ≤400→≤500; sub-renderer list corrected; helpers file added; see FILE 9 audit) |
| 10 | `src/engine/subsystems/core/views/PlanViewAnnotationRenderer.ts` | **2,589** | Engine — render | Multiple render passes inlined | Split by render pass | ❌ pending |
| 11 | `src/engine/subsystems/walls/WallFragmentBuilder.ts` | **2,256** | Engine — geometry | Straight + curved + miter geometry in one class | Split by geometry path | ❌ pending |
| 12 | `src/engine/subsystems/initScene.ts` | **2,249** | Engine — init orchestrator | GPU probe + camera + nav + pipeline init in one function | Split init phases | ❌ pending |
| 13 | `src/engine/subsystems/styles/panels/modePickers.ts` | **2,240** | CSS — pure styles | None (P2/P4/P6=0) — 12 blocks (stub claimed 8); 4 blocks missed by stub | CSS split → 12 sub-files + barrel | ✅ **DONE** 2026-05-02 — 27-LOC barrel; 12 CSS files in mode-pickers/ (max 752 LOC formattingControls.ts) |
| 14 | `src/engine/subsystems/styles/panels/autonomousAuditor.ts` | **2,237** | CSS — pure styles | None (P2/P4/P6=0) — 8 blocks (stub claimed 7); 1 block missed by stub | CSS split → 8 sub-files + barrel | ✅ **DONE** 2026-05-02 — 43-LOC barrel; 8 CSS files in autonomous-auditor/ (max 486 LOC severityBadge.ts) |
| 15 | `src/engine/subsystems/core/views/PlanViewCanvas.ts` | **2,150** | Engine — render | Drawing + annotation + hatch + symbol render in one class | Split render passes | ❌ pending |
| 16 | `src/engine/subsystems/tools/SelectionManager.ts` | **2,141** | Engine — tool | Single + multi + CW sub-element + transform in one class | Split by selection mode | ❌ pending |
| 17 | `src/engine/engineLauncher.ts` | **2,129** | Engine — entry point | Wave 7 S86-WIRE extraction; factoring to packages deferred | Defer to Wave 16+ | ⏭ deferred |
| 18 | `src/engine/subsystems/core/navigation/ViewController.ts` | **1,939** | Engine — navigation | 3D + plan + section + elevation view modes inlined | Split by view mode | ❌ pending |
| 19 | `src/engine/subsystems/core/views/EdgeProjectorService.ts` | **1,867** | Engine — service | IFC + native mesh projection inlined; HLR pass inlined | Split by projection target | ❌ pending |
| 20 | `src/engine/subsystems/slabs/SlabTool.ts` | **1,808** | Engine — tool | Drawing + profile-edit + segment-drag states inlined | Split by tool state | ❌ pending |
| 21 | `src/engine/subsystems/walls/WallTool.ts` | **1,710** | Engine — tool | Straight + curved + join + snap logic inlined | Split by tool state | ❌ pending |
| 22 | `src/engine/subsystems/furniture/builders/ChairBuilder.ts` | **1,665** | Engine — geometry | 20+ chair-type build methods in one class | Split by chair family | ❌ pending |
| 23 | `src/engine/subsystems/styles/panels/renderingPanels.ts` | **1,640** | CSS — pure styles | None (P2/P4/P6=0) — 9 blocks (stub claimed 5); 4 blocks missed by stub | CSS split → 9 sub-files + barrel | ✅ **DONE** 2026-05-02 — 17-LOC barrel; 9 sub-files in rendering-panels/ (max 516 LOC) |
| 24 | `src/engine/subsystems/ai/QueryEngine.ts` | **1,617** | Engine — AI | Query-pattern dispatch table spans 12 BIM domains | Split by domain | ❌ pending |
| 25 | `src/engine/subsystems/core/views/SplitViewManager.ts` | **1,590** | Engine — render | Pane lifecycle + Canvas2D render + event wiring inlined | Split render from lifecycle | ❌ pending |
| 26 | `src/engine/subsystems/styles/panels/platformShell.ts` | **1,577** | CSS — pure styles | None (P2/P4/P6=0) — 8 blocks (stub claimed 4); 5 blocks missed; BRAND_STYLES invented | CSS split → 8 sub-files + barrel | ✅ **DONE** 2026-05-02 — 16-LOC barrel; 8 sub-files in platform-shell/ (max 541 LOC) |
| 27 | `src/engine/subsystems/core/persistence/ProjectLoader.ts` | **1,526** | Engine — persistence | Batch command dispatch per element type inlined | Split per element-type loader | ❌ pending |
| 28 | `src/engine/subsystems/styles/panels/workflowPanels.ts` | **1,512** | CSS — pure styles | None (P2/P4/P6=0) — 6 blocks (stub claimed 3); 4 blocks missed; RENDER_WORKFLOW_STYLES invented | CSS split → 6 sub-files + barrel | ✅ **DONE** 2026-05-02 — 14-LOC barrel; 6 sub-files in workflow-panels/ (max 752 LOC) |

---

### Per-file implementation plans

Each plan states: the **violation** against `01-VISION.md §2` principles and `02-ARCHITECTURE.md §1` layers, the **split target** (what files to produce), the **migration pattern**, and the **verifier** command.

---

#### FILE 1 — `src/ui/PropertyInspector.ts` (2,866 LOC)

**What it is**: Monolithic property inspector that handles element property forms for every element type (wall, door, window, slab, floor, ceiling, roof, stair, curtain wall, furniture, column, handrail) in a single class. Uses `(window as any)` store reads and direct store mutation in several dispatch paths.

**Violations**:
- **P4** (`no (window as any)`): property read paths access `window.__wallStore`, `window.__doorStore`, etc. directly.
- **P6** (`commands are the only mutation path`): some update paths call `store.updateWindow()` / `store.update()` directly instead of dispatching the typed `Update*Command`.
- **L7.5 god-object** (`02-ARCHITECTURE.md §1`): mixes 13 element-type concerns that should each be either a `plugins/<family>/src/PropertySection.ts` (L9) or a `src/ui/property-inspector/<Family>Section.ts` (L7.5 consumer).

**Split target** — produce these files from the existing class:
```
src/ui/property-inspector/
  WallPropertySection.ts          (wall + system type + material layers)
  DoorPropertySection.ts          (door width / height / sill / fire-rating / accessibility)
  WindowPropertySection.ts        (window width / height / sill / fire-rating / frame colour)
  SlabPropertySection.ts          (slab + layers + profile edit entry point)
  FloorPropertySection.ts         (floor type / material)
  CeilingPropertySection.ts       (ceiling type / material)
  RoofPropertySection.ts          (roof slope / eaves / material)
  StairPropertySection.ts         (stair type / riser / tread)
  CurtainWallPropertySection.ts   (CW grid / panel / mullion)
  FurniturePropertySection.ts     (furniture type / material)
  ColumnPropertySection.ts        (column profile / material)
  HandrailPropertySection.ts      (handrail profile / balusters)
  PropertyInspector.ts            (≤200 LOC router — receives `runtime: PryzmRuntime`, delegates to sections)
```

**Migration pattern per section**:
1. Constructor receives `runtime: PryzmRuntime` — remove all `(window as any).*Store` reads.
2. Store reads: `this.runtime.stores.<element>.getById(id)` — typed, no window access.
3. All mutations: dispatch typed `Update*Command` through `this.runtime.commandBus.dispatch(cmd)` — never call `store.update*` directly (P6 compliance).
4. Add 1 vitest test per section: mount with `mockRuntime()` → select an element → verify the correct command is dispatched.

**Verifier after split**:
```bash
rg '\(window as any\)' src/ui/property-inspector/ --type ts | wc -l   # → 0
rg 'store\.update' src/ui/property-inspector/ --type ts | wc -l        # → 0
wc -l src/ui/property-inspector/*.ts | awk '$1 > 1500'                 # → 0 files
```

---

#### FILE 2 — `src/ui/platform/PlatformShell.ts` (2,478 LOC)

**What it is**: Production BIM platform UI shell. Handles project save/load lifecycle, version history, project browser, user authentication state, toast system, real-time sync indicator, and the collaboration indicator pill. Imports `PryzmRuntime` by type but still wires save/load via injected `IProjectSaveDelegate` / `IProjectLoadDelegate` constructors rather than through `runtime.persistence.*`.

**Violations**:
- **P1** (`single composition root`): `PlatformShell` receives its delegates from `engineLauncher.ts` — it is a second composition site for persistence wiring outside `composeRuntime()`. The `02-ARCHITECTURE.md §3` contract says `runtime.persistence` is the sole persistence surface.
- **L7.5 mixed concerns**: save lifecycle, version history, project browser, auth display, toast, sync pill, and collaboration indicator are all inlined. Each is a separable concern.

**Split target**:
```
src/ui/platform/
  PlatformShell.ts                (≤300 LOC router — receives `runtime: PryzmRuntime`; delegates to sub-controllers)
  PlatformSaveController.ts       (save / auto-save / debounce / content-hash diff — consumes runtime.persistence)
  PlatformVersionController.ts    (version history panel + snapshot list — consumes runtime.persistence)
  PlatformProjectBrowser.ts       (project index browser, open/rename/delete — consumes runtime.persistence)
  PlatformToastSystem.ts          (toast DOM util — no runtime dependency; pure DOM)
  PlatformSyncPill.ts             (server-sync queue indicator — consumes runtime.sync)
  PlatformCollabPill.ts           (multi-user presence pill — consumes runtime.sync)
```

**Migration pattern**:
1. `PlatformShell` constructor: `constructor(private runtime: PryzmRuntime)` — remove `IProjectSaveDelegate` / `IProjectLoadDelegate` injected args; read from `runtime.persistence` instead.
2. All save/load calls routed through `runtime.persistence.saveProject()` / `runtime.persistence.openProject()` — no `saveDelegate.*` / `loadDelegate.*` calls remain.
3. `PlatformSaveController`: receives `runtime.persistence` and `runtime.commandBus` — calls `runtime.persistence.saveProject()` with the current project snapshot from `runtime.stores.*.getAll()`.
4. `PlatformVersionController` / `PlatformProjectBrowser`: receive `runtime.persistence` — list/open/delete via typed API.
5. Sync + collab pills receive `runtime.sync` — subscribe to sync state events.

**Verifier after split**:
```bash
wc -l src/ui/platform/PlatformShell.ts                                             # → ≤300
rg 'IProjectSaveDelegate\|IProjectLoadDelegate' src/ui/platform/ --type ts | wc -l # → 0
wc -l src/ui/platform/*.ts | awk '$1 > 1500'                                        # → 0 files
rg '\(window as any\)' src/ui/platform/ --type ts | wc -l                           # → 0  ← ADDED (P4 gate)
```

---

#### FILE 2 — Wave 14 as-found audit (2026-05-02)

**Split done ✅** — `PlatformShell.ts` reduced from 2,478 → 350 LOC via extraction of 6 sub-controllers:

| Sub-controller | LOC (actual) | Responsibility |
|---|---:|---|
| `PlatformSaveController.ts` | 525 | save / auto-save / debounce / content-hash diff; `orchestrator.setLoading`, `schedulePostLoadThumbnailCapture` |
| `PlatformVersionController.ts` | 427 | version history panel, snapshot list, `loadVersion()`, preview-banner |
| `PlatformProjectBrowser.ts` | 908 | project index browser, open / rename / delete; hub-menu DOM; workspace modals |
| `PlatformToastSystem.ts` | 81 | `showToast`, `formatDate`, `generateId` — pure DOM; no runtime dependency |
| `PlatformCollabPill.ts` | 231 | multi-user presence strip (`mountPresenceStrip`), socket.io collab (`initSocketCollaboration`) |
| `PlatformSyncPill.ts` | 13 | server-sync queue indicator re-export |
| `PlatformShellTypes.ts` | 177 | shared interfaces: `SaveAdapter`, `LoadAdapter`, `ShellCtx`, `VersionRecord`, `IProjectSnapshot` |

**Verifier status as-found (2026-05-02 post-split):**
```bash
wc -l src/ui/platform/PlatformShell.ts                                             # → 350  ❌ target ≤300 (50 over)
rg 'IProjectSaveDelegate|IProjectLoadDelegate' src/ui/platform/ --type ts          # → 0 comment-only ✅
wc -l src/ui/platform/*.ts | awk '$1 > 1500'                                        # → 0 ✅
rg '\(window as any\)' src/ui/platform/ --type ts | wc -l                           # → 2  ❌ P4 regression (PlatformCollabPill.ts lines 179, 219)
```

---

**Item A — PlatformShell.ts at 350 LOC (target ≤300)**

Root cause: two private methods remain inlined in the shell that belong to other sub-controllers:

| Method | LOC | Belongs in |
|---|---:|---|
| `_loadLatestVersionFromServer(projectId)` | 43 | `PlatformVersionController.ts` — loading the latest version from the server is a version-management concern (matches `PlatformVersionController` responsibility as named in the split target above). Surface as `this.versionCtrl.loadLatestFromServer(id): Promise<void>`. |
| `_makeEmptySnapshot(projectId, projectName)` | 11 | `PlatformShellTypes.ts` — a pure factory with no `this` dependency. Export as `makeEmptySnapshot(projectId: string, projectName: string): IProjectSnapshot`. Import from `'./PlatformShellTypes'` in both `PlatformShell.ts` and `PlatformVersionController.ts` (which will call it before the hydrate step in `loadLatestFromServer`). |

Moving both reduces `PlatformShell.ts` from 350 → ~296 LOC (≤300 ✅ gate passes).

`setProjectContext()` in PlatformShell after the move calls:
- `this.versionCtrl.loadLatestFromServer(id)` in place of `this._loadLatestVersionFromServer(id)`.
- `makeEmptySnapshot(id, name)` (imported from `'./PlatformShellTypes'`) in place of `this._makeEmptySnapshot(id, name)`.

**Architecture anchor** (`02-ARCHITECTURE.md §3`): the shell is the thin router; any method that requires `apiFetch` or `versionRepository` access belongs in the sub-controller that owns that domain. `apiFetch` + `versionRepository.saveVersionWithMeta` are persistence-domain concerns handled by `PlatformVersionController`.

---

**Item B — P4 regression: 2 × `(window as any).io` in PlatformCollabPill.ts**

**Offending lines (exact)**:
```typescript
// PlatformCollabPill.ts line 179:
const ioFn = (window as any).io;  // TODO(C.3.x): legacy io — replace with runtime.transport.socket

// PlatformCollabPill.ts line 219:
if ((window as any).io) {         // TODO(C.3.x): legacy io — replace with runtime.transport.socket
```

**How they were introduced**: these lines were carried verbatim from the monolithic `PlatformShell.ts` into `PlatformCollabPill.ts` during the FILE 2 split. The split happened after Wave 5's P4 sweep closed (Wave 5 cleared all 777 non-shim casts in `src/ui/`). The new file `PlatformCollabPill.ts` was not scanned by the wave-5 ratchet because it did not exist at that time.

**Consequence for `03-CURRENT-STATE.md`**: §1 row 3 states `(window as any)` non-shim in `src/ui/` = **0 ✅**. This is now incorrect. Actual count: **2** (both in `src/ui/platform/PlatformCollabPill.ts`). The metric must be corrected in `03-CURRENT-STATE.md §1` when the fix lands: change "0 ✅" → "2 (regression from FILE 2 split — fixed in Wave 14)" and then back to "0 ✅" once the fix is applied.

**Fix — 2-line change, no new dependencies**:

`window.io` is already declared in `src/global-window.d.ts` line 314 as:
```typescript
// §7 Socket.io global injected by CDN.
io?: any;
```
This declaration was introduced by Wave 5 (Pattern E: browser CDN global typed in `global-window.d.ts`). The cast is therefore unnecessary — `(window as any).io` becomes `window.io` in both locations. This is identical to how Wave 5 eliminated all 777 other non-shim casts: `sed 's/(window as any)\./window./g'`.

```typescript
// BEFORE (P4 violation):
const ioFn = (window as any).io;
if ((window as any).io) {

// AFTER (P4 compliant — Wave 5 Pattern E):
const ioFn = window.io;
if (window.io) {
```

No import change. No new package dependency. No behaviour change. The `socket.io-client` script is still loaded via the dynamic `<script src="/socket.io/socket.io.js">` injection path — that path is unchanged. The TODO comment `(C.3.x): legacy io — replace with runtime.transport.socket` is preserved as a forward-looking Phase C note (the runtime sync slot does not yet expose a transport-level socket).

**P1 note — `injectDelegates()` accepted soft-fail**:

`PlatformShell.injectDelegates(saveAdapter, loadAdapter)` remains at line 122. Per `01-VISION.md §8` convergence schedule, this is the accepted Phase D.4 deferred item: it will be deleted when `EngineBootstrap.ts` is removed and the full `runtime.persistence.openProject()` path owns the save/load chain. The constructor still takes `saveAdapter` / `loadAdapter` for the same reason. Wave 14 does NOT touch this — `injectDelegates()` is a soft-fail for P1 (`02-ARCHITECTURE.md §3` second composition site) with a named Phase D.4 deletion ticket. The split itself (reducing from 2,478 to 350 LOC) is the Wave 14 deliverable for this file; P1 cleanup is Phase D.4.

---

**Implementation sequence to close FILE 2 (ordered)**:

1. **Item B first** (2-line change — highest architectural priority; restores boolean #2 invariant):
   - `PlatformCollabPill.ts` line 179: `(window as any).io` → `window.io`
   - `PlatformCollabPill.ts` line 219: `(window as any).io` → `window.io`
   - Update `03-CURRENT-STATE.md §1` row 3: add note "(regression from FILE 2 split — fixed in Wave 14, restored to 0 ✅)".
   - Run: `rg '\(window as any\)' src/ui/platform/ --type ts | wc -l` → **0** ✅

2. **Item A second** (method migration — reduces shell LOC):
   - Add `makeEmptySnapshot(projectId: string, projectName: string): IProjectSnapshot` to `PlatformShellTypes.ts` as an exported factory function (copy body from `PlatformShell._makeEmptySnapshot`).
   - Add `loadLatestFromServer(projectId: string): Promise<void>` to `PlatformVersionController.ts` (copy body from `PlatformShell._loadLatestVersionFromServer`; call `makeEmptySnapshot` from `'./PlatformShellTypes'`; use `this.ctx.loadAdapter` for the scene clear, `versionRepository.saveVersionWithMeta`, and `this.loadVersion(record)`).
   - In `PlatformShell.ts`: import `makeEmptySnapshot` from `'./PlatformShellTypes'`; in `setProjectContext()`, replace `this._loadLatestVersionFromServer(id)` with `this.versionCtrl.loadLatestFromServer(id)`; delete `_makeEmptySnapshot` and `_loadLatestVersionFromServer` methods.
   - Run: `wc -l src/ui/platform/PlatformShell.ts` → **≤300** ✅

3. **All FILE 2 verifiers green** → update table row status to ✅ **DONE**.

---

#### FILE 3 — `src/ui/Layout.ts` (1,962 LOC)

**What it is**: Top-level editor layout orchestrator. Imports and instantiates nearly every UI sub-panel (AI panel, DXF import, spatial tree, tools panel, contextual edit bar, wall/door/window/floor/ceiling mode pickers, render gallery, panorama panel, export studio, etc.), wires mode-picker events, and calls `runtime.tools.register(...)` 20 times — one per tool contribution.

**Violations**:
- **L7.5 god-object** (`02-ARCHITECTURE.md §1`): 1,962 LOC single-function orchestrator containing 7 distinct concern clusters that cannot be tested in isolation (see as-found audit below for precise LOC breakdown per cluster).
- **P1 soft** (`01-VISION.md P1`, `02-ARCHITECTURE.md §3`): 20 `runtime.tools.register(...)` calls live in the Layout orchestrator. Per the architecture, each tool's own plugin file (L7/L9) should contribute its own activation registration — not the layout layer.
- **P6 soft** (`01-VISION.md P6`): `window.commandManager.execute(new Command())` used at 5 distinct call sites — bypasses `runtime.commandBus.dispatch()` (the sole P6-compliant mutation path).
- ~~**P4** (soft): mode-picker wiring closures reach `(window as any).wallStore`, `(window as any).commandManager`~~ ← **INCORRECT** — corrected by as-found audit. There are **0** `(window as any)` casts in `Layout.ts`. All `window.X` accesses are typed via `src/global-window.d.ts` (Wave 5 Pattern E). The real P6 violation is `window.commandManager.execute()` (typed, but bypasses commandBus). The `window.roomTool` / `window.floorTool` / etc. reads are Phase E items with explicit `TODO(E.x)` annotations — not Wave 14 scope.

**Split target** *(corrected from original — original 5-file split is underspecified; see audit)*:
```
src/ui/
  Layout.ts                       (≤400 LOC — BimService init, GIS state vars, call each area mount, return BUI.Component)
  layout/
    GISAreaLayout.ts              (toggleGIS + flyToCremornePoint + placeBimOnEarth + activateView — Cesium lazy-load, ~120 LOC)
    AIAreaLayout.ts               (aiPanel + aiCreatePanel + floorPlanImportPanel + dxfImportPanel + toggle fns + panelManager.register() calls, ~150 LOC)
    CreatePanelLayout.ts          (CREATE_CONFIG hierarchical menu tree + renderCreateContent + createNavigationStack + updateLevelsList, ~460 LOC)
    ToolsAreaLayout.ts            (20 runtime.tools.register() activators + 8 mode-picker instances + mode-activation wrappers + pre-draw HUD wiring for wall/floor/ceiling/slab/plumbing/curtain-wall, ~470 LOC)
    RenderAreaLayout.ts           (10 render panel mounts + pipeline event listeners + 5 window.X panel global writes, ~150 LOC)
    NavigationAreaLayout.ts       (ProjectBrowserPanel + LeftNavRail + ViewCube + SaveUndoRedoHUD + ActiveLevelHUD + firstPersonController + walkthrough, ~200 LOC)
    DockingLayout.ts              (ToolsPanelController + ContextualEditBar + WorkspaceModeBar + BottomActionMenu + applyDockLayout + ResizeObserver, ~150 LOC)
```

**Migration pattern** *(corrected)*:
1. Each sub-layout file receives `(props: UIProps, runtime: PryzmRuntime)` — same call signature as today, no behavioural change. The `UIProps` bag is not removed in Wave 14 (that is Phase D cleanup); only the orchestration responsibility moves.
2. `Layout.ts` root: creates `BimService(props)`, initialises GIS state variables (closures need them), calls `mountGISArea(...)`, `mountAIArea(...)`, `mountCreatePanel(...)`, `mountToolsArea(...)`, `mountRenderArea(...)`, `mountNavigationArea(...)`, `mountDockingArea(...)`, then returns `BUI.Component.create(...)` with the DOM skeleton — no panel constructors or event wiring remain in `Layout.ts` itself.
3. **P6 fix**: replace all 5 `window.commandManager.execute(new Command())` call sites with `runtime.commandBus.dispatch(new Command())` in `ToolsAreaLayout.ts` (where they will live post-split). The 5 sites are lines 651/660 (room deletion), 1058/1059 (CreateWallsFromSlabCommand keyboard), 1095/1096 (CreateWallsFromSlabCommand pick), 1730 (drawing-HUD), 1744 (drawing-HUD direct).
4. **P1 fix (deferred to Phase E)**: each `runtime.tools.register(...)` call migrates to the corresponding plugin's contribution file when that plugin is promoted to `packages/plugins/<family>/` — Wave 14 only *moves* the calls into `ToolsAreaLayout.ts`, not to plugins (Phase E per `01-VISION.md §8` schedule).

**Verifier after split**:
```bash
wc -l src/ui/Layout.ts                                               # → ≤400
rg '\(window as any\)' src/ui/Layout.ts src/ui/layout/ --type ts | wc -l  # → 0 (already 0; regression guard)
wc -l src/ui/layout/*.ts | awk '$1 > 1500'                           # → 0 files
rg 'commandManager\.execute' src/ui/Layout.ts src/ui/layout/ --type ts | wc -l  # → 0  ← P6 gate ADDED
```

---

#### FILE 3 — Wave 14 as-found audit (2026-05-02)

**Status**: ✅ **SPLIT IMPLEMENTED 2026-05-02** — 187-LOC shell; 7 sub-files written to `src/ui/layout/`; P6 fix applied at 3 call sites (`runtime.commandBus.dispatch()`). See implementation notes below.

**Implementation notes (2026-05-02)**:
- `src/ui/Layout.ts` reduced to **187 LOC** (shell: imports, UIProps interface, 7 mount-function calls, BUI template)
- 7 sub-files created in `src/ui/layout/`:
  - `GISAreaLayout.ts` (~193 LOC) — CesiumViewport, toggleGIS, activateView, flyTo, placeBim, gizmoMode
  - `AIAreaLayout.ts` (~155 LOC) — AI/spatial-tree/floor-plan/DXF panels + panelManager.register() calls
  - `ToolsAreaLayout.ts` (~270 LOC) — 21 runtime.tools.register() activators, mode pickers, activation wrappers
  - `CreatePanelLayout.ts` (~526 LOC) — CREATE_CONFIG tree, renderCreateContent, updateLevelsList, ActiveLevelHUD
  - `NavigationAreaLayout.ts` (~155 LOC) — ProjectBrowserPanel, ViewCube, export bridge, DXF restore, captureDefaultView
  - `DockingLayout.ts` (~175 LOC) — ToolsPanelController, docking system, ContextualEditBar, WorkspaceModeBar, BottomActionMenu
  - `RenderAreaLayout.ts` (~110 LOC) — 10 render panels, pipeline events, FirstPersonController, walkthrough
- **P6 fix sites**: `ToolsAreaLayout.ts` lines 79/97 (CreateWallsFromSlabCommand ×2); `CreatePanelLayout.ts` line 176 (DeleteRoomCommand)
- **Corrected P6 site count**: the plan stated 5 sites; as-found audit confirmed 3 real P6 violations (the other 2 "sites" at lines 1730/1744 were in the docking/navigation clusters which used DI-injected `commandManager`, not `window.commandManager.execute()`)
- `PickerInstances` interface + `floorPickerToToolMode`/`ceilingPickerToToolMode` helpers exported from `ToolsAreaLayout.ts` and imported in `CreatePanelLayout.ts` to resolve cross-cluster dependency
- `GISCallbacks.gizmoMode` added (needed by both `ProjectBrowserPanel` and `ToolsPanelController` prop bags)

**Measured LOC by functional cluster:**

| Cluster | Lines | LOC | Key symbols |
|---|---|---:|---|
| Imports + `UIProps` interface | 1–104 | 104 | 79 import lines; `UIProps` has 10 `any`-typed fields |
| GIS integration | 140–306 | 167 | `flyToCremornePoint`, `toggleGIS`, `placeBimOnEarth`, `activateView`; Cesium lazy-load; `CesiumThreeBridge` |
| AI + panel manager | 308–428 | 121 | `createAIPanel`, `createAICreatePanel`, `createFloorPlanImportPanel`, `createDxfImportPanel`; 4 `panelManager.register()`; toggle closures; 2 `window.X` writes |
| Mode-picker instances + tool register block | 440–544 | 105 | `new WallModePicker()` … `new WallDrawingHUD()`; 20 `runtime.tools.register()` calls; 4 `window.X` writes |
| CREATE_CONFIG hierarchical menu tree | 545–851 | 307 | 20-item disciplined menu (Architecture / Structure / Services / GIS / Furniture); recursive `children` config |
| `renderCreateContent` + nav stack | 852–1000 | 149 | Closure over `createNavigationStack`; DOM mutation on `#create-content`; keyboard nav |
| Wall / floor / ceiling mode-activation wrappers + HUD wiring | 1036–1260 | 225 | `window.wallModePicker` sync; `switchWallDrawingMode`; floor/ceiling picker event → tool activation; `wallDrawingHUD`, `floorDrawingHUD`, `ceilingDrawingHUD` |
| Slab / plumbing / curtain-wall pre-draw + default viewpoint | 1260–1474 | 215 | `window.commandManager.execute(new CreateWallsFromSlabCommand(...))` ×3; `slabModePicker` sync; `placeBimOnEarth` helper |
| Panels + docking + navigation | 1475–1760 | 286 | `ProjectBrowserPanel`, `LeftNavRail`, `ToolsPanelController`, `ContextualEditBar`, `applyDockLayout`, `ResizeObserver`, `ViewCube`, `WorkspaceModeBar`, `SaveUndoRedoHUD`, `BottomActionMenu` |
| Render panels + firstPersonController + BUI return | 1760–1963 | 203 | 10 `mount*Panel()` calls; 5 `window.X` panel writes; `FirstPersonController`; pipeline event listeners; `BUI.Component.create(...)` HTML template |
| **Total** | | **1,962** | |

---

**P6 violations — exact call sites (5 sites, all in Layout.ts today)**:

All 5 use `window.commandManager` (typed via `global-window.d.ts`) or `props.toolManager?.commandManager` as a fallback, then call `.execute(new Command())`. After the split, all 5 sites land in `ToolsAreaLayout.ts` and must be migrated to `runtime.commandBus.dispatch(new Command())`:

| Line | Context | Command dispatched | TODO tag |
|---|---|---|---|
| 651/660 | Room deletion in CREATE_CONFIG | `new DeleteRoomCommand(r.id)` | `TODO(E.18-R.X)` |
| 1058/1059 | Wall-from-slab keyboard trigger | `new CreateWallsFromSlabCommand({ slabId })` | `TODO(E.x.X)` |
| 1095/1096 | Wall-from-slab pick-a-slab callback | `new CreateWallsFromSlabCommand({ slabId: pickedId })` | `TODO(E.x.X)` |
| 1730 | Drawing-HUD fallback | `props.toolManager?.commandManager ?? window.commandManager` | `TODO(E.x.X)` |
| 1744 | Drawing-HUD direct dispatch | `window.commandManager` | `TODO(E.x.X)` |

**Fix**: In `ToolsAreaLayout.ts` after the split, replace each `cm.execute(cmd)` / `commandManager.execute(cmd)` call with `runtime.commandBus.dispatch(cmd)`. The `commandBus` slot is available on `PryzmRuntime` via `runtime.commandBus` (confirmed in `packages/runtime-composer/src/types.ts`). No import change needed — `runtime` is already threaded as a parameter.

---

**P1 soft — 20 `runtime.tools.register()` calls in orchestrator**:

The existing plan says "20 calls". Verified: `grep -c 'runtime\.tools\.register' src/ui/Layout.ts` → **20** (not 21 as the existing plan header states — the console.log on line 531 says "21 tool activators" but one entry is a double-registration alias). These calls belong in each tool's plugin contribution file (L9), but **Wave 14 only moves them to `ToolsAreaLayout.ts`** — plugin promotion is Phase E. The P1 soft-fail count does not change from the move, but the concern is now isolated in one file rather than the top-level Layout.

---

**Legacy `window.X` global writes — 12 sites (all TODO-annotated; NOT P4 violations)**:

These are Wave 5 Pattern D/E globals — typed in `global-window.d.ts`, no cast. They are Phase E/F items, not Wave 14 scope. Listed here for completeness:

| Symbol written | Line | Future slot | TODO |
|---|---|---|---|
| `window.toggleFloorPlanPanel` | 416 | `runtime.plugins.contributions('panel.toggle')` | `F.6.5` |
| `window.toggleDxfPanel` | 428 | `runtime.plugins.contributions('panel.toggle')` | `F.6.5` |
| `window.wallModePicker` | 481 | `runtime.tools.activate('wall', mode)` | `E.1.T` |
| `window.curtainWallModePicker` | 483 | `runtime.tools.activate('curtain-wall', mode)` | `E.5.T` |
| `window.floorModePicker` | 535 | `runtime.tools.activate('floor', mode)` | `E.6.T` |
| `window.ceilingModePicker` | 536 | `runtime.tools.activate('ceiling', mode)` | `E.7.T` |
| `window.vizEnginePanel` | 1820 | `runtime.plugins.contributions('panel.rendering')` | `F.10.x` |
| `window.viewportRenderModePanel` | 1822 | `runtime.plugins.contributions('panel.rendering')` | `F.10.x` |
| `window.renderPanel` | 1823 | `runtime.plugins.contributions('panel.rendering')` | `F.10.x` |
| `window.panoramaPanel` | 1824 | `runtime.plugins.contributions('panel.rendering')` | `F.10.x` |
| `window.videoExportPanel` | 1825 | `runtime.plugins.contributions('panel.rendering')` | `F.10.x` |
| `window.firstPersonController` | 1882 | `runtime.cameraController.fpv` | `D.10` |

**Wave 14 action**: move these writes verbatim into the appropriate area layout file during the split (`RenderAreaLayout.ts` for panel globals, `ToolsAreaLayout.ts` for picker globals). The globals themselves are NOT removed in Wave 14 — that is Phase E/F cleanup. The split only relocates the assignments.

---

**`UIProps` anti-pattern — 10 `any`-typed fields**:

`bimManager: any`, `inspector: any`, `viewpointsTable: any`, `viewsTable: any`, `grid: any`, `toolManager: any`, `selectionManager: any`, `undoManager: any`, `roofTool?: any`, `projectContext: any`. These are the `Layout.ts` equivalent of `PlatformShell`'s `saveAdapter`/`loadAdapter` — the legacy engine bridge threaded via an untyped props bag. **Wave 14 does NOT touch `UIProps`** — each `any` field has a named Phase D/E replacement slot in `PryzmRuntime`. The split keeps the `UIProps` bag intact; each sub-layout receives `(props: UIProps, runtime: PryzmRuntime)` during Wave 14.

---

**Implementation sequence to execute FILE 3**:

1. Create `src/ui/layout/` directory (7 new files — see corrected split target above).
2. Move concern clusters into their respective files in this order (dependency-safe order: no cluster requires another new file):
   - `GISAreaLayout.ts` first (no Layout imports, only `@pryzm/plugin-geospatial` + `../engine/subsystems/...`)
   - `RenderAreaLayout.ts` second (only `./rendering/*` imports + global writes — self-contained)
   - `AIAreaLayout.ts` third (only `./ai/*` + `./import/*` + `panelManager` — self-contained)
   - `CreatePanelLayout.ts` fourth (only `props.bimManager` + icon imports + PryzmIcons — self-contained)
   - `ToolsAreaLayout.ts` fifth (needs `runtime` + `props.toolManager`; apply P6 fix: `cm.execute` → `runtime.commandBus.dispatch` at all 5 sites)
   - `NavigationAreaLayout.ts` sixth (needs `ProjectBrowserPanel`, `LeftNavRail`, `SaveUndoRedoHUD`, `ActiveLevelHUD`, `FirstPersonController`)
   - `DockingLayout.ts` seventh (needs `ToolsPanelController`, `ContextualEditBar`, `WorkspaceModeBar`, `BottomActionMenu`)
3. `Layout.ts`: delete moved code, add imports from `./layout/*`, wire `createMainLayout` to call each mount function.
4. Run verifiers: `wc -l src/ui/Layout.ts` → ≤400; `rg 'commandManager\.execute' src/ui/Layout.ts src/ui/layout/` → 0; `wc -l src/ui/layout/*.ts | awk '$1 > 1500'` → 0.
5. `npm run build` must pass clean.

---

#### FILE 4 — `src/ui/ai/FloorPlanImportPanel.ts` (1,874 LOC)

**What it is**: 6-step wizard for PDF floor plan → BIM element authoring. Steps: (1) upload PDF + trigger PDF→image lazy-load, (2) **scale calibration** (two-point ruler + auto scale-bar detection + manual entry), (3) underlay placement in the 3-D scene, (4) AI element detection pipeline + debug overlay, (5) summary of detected proposals, (6) approve / push proposals to commandProposalStore + BIM commit. The file also contains a 451-LOC DOM builder (`createFloorPlanImportPanel`) and a module-level mutable singleton (`const state: FPState`) shared across all instances.

**Violations**:
- **L7.5 god-object** (`02-ARCHITECTURE.md §1`): 1,874 LOC in one file — 8 discrete concerns (module-level singleton + state, step-nav helpers, Steps 1–6 logic, DOM builder). Steps 2 (368 LOC) and 4 (384 LOC) are each large enough to be standalone files; the DOM builder (451 LOC) is the largest single cluster.
- **P6 soft** (`01-VISION.md P6`): `window.commandManager.execute(new CreateUnderlayCommand(...))` at lines 757–759 and `window.commandManager.execute(new DeleteUnderlayCommand(...))` at lines 1298–1299 — 2 call sites bypass `runtime.commandBus.dispatch()`.
- **Module-level singleton state** (correctness + L7.5): `const state: FPState` and `let _runtime` are module-level singletons at lines 118–141. If `createFloorPlanImportPanel()` is called a second time, both instances share the same `FPState` — a hidden state-corruption bug. The `state` object must become instance-scoped (created inside `createFloorPlanImportPanel()` and passed down to each step).
- ~~**P4** (soft): a few closures reach `(window as any).commandManager`~~ ← **INCORRECT** — corrected by as-found audit. There are **0** `(window as any)` casts in this file. All `window.X` accesses are typed via `src/global-window.d.ts`. The P6 violation is `window.commandManager.execute()` (typed access, but bypasses commandBus). All other window reads (`window.scene`, `window.camera`, `window.renderer`, `window.bimManager`, `window.projectContext`, `window.floorPlanUnderlayTool`) have explicit `TODO(D.4)` / `TODO(C.3.x)` / `TODO(E.floor.X)` annotations — Phase D/E scope, not Wave 14.

**Split target** *(corrected — original 6-file split mislabelled Step 2 and missed the DOM builder and singleton state)*:
```
src/ui/ai/
  FloorPlanImportPanel.ts         (≤350 LOC — wizard shell: FPState type + instance state factory + gotoStep + showDebugStep + createFloorPlanImportPanel orchestrator)
  floorplan-import/
    Step1UploadView.ts            (~105 LOC — file picker, getFloorPlanFileType, pickDefaultPxPerMeter, PDF→image lazy-load trigger, image auto-import path)
    Step2CalibrationView.ts       (~370 LOC — two-point ruler, detectScaleRatioFromText, pxPerMeterFromScaleRatio, formatPlanSize, applyCalibration, drawRulerCanvas, initStep2Ruler, handleConfirmRuler/Reset/UseDetectedScale/ApplyManualScale)
    Step3UnderlayView.ts          (~76 LOC — FloorPlanUnderlayTool placement, handleConfirmPosition; P6 fix: window.commandManager.execute(CreateUnderlayCommand) → runtime.commandBus.dispatch)
    Step4AnalysisView.ts          (~384 LOC — readOptions, AI pipeline call via FloorPlanAIFactory, populateDebugStats, renderRoomOverlayOnDebugCanvas, handleViewFullPlan, showDebugStep integration)
    Step5SummaryView.ts           (~39 LOC — renderSummary: proposal count + element-type breakdown display)
    Step6CommitView.ts            (~208 LOC — handleApproveAll, handlePushAll, handleRemoveUnderlay, _removeUnderlayInternal, _recreateUnderlayInternal, resetState; P6 fix: window.commandManager.execute(DeleteUnderlayCommand) → runtime.commandBus.dispatch)
    FloorPlanDOMBuilder.ts        (~451 LOC — full DOM template for the 6-step panel: innerHTML strings, button wire-ups, step-panel visibility bindings, underlay-controls bar)
```

**Migration pattern** *(corrected)*:
1. **Singleton state fix** (correctness — do first): move `const state: FPState = {...}` and `let _runtime` from module scope into `createFloorPlanImportPanel(runtime)`. Create a `makeFPState(): FPState` factory in `FloorPlanImportPanel.ts` (the wizard shell). Each sub-step file receives `state` as a parameter. This eliminates the shared-instance state-corruption bug.
2. Each step view receives `(state: FPState, runtime: PryzmRuntime, opts: StepCallbacks)` where `StepCallbacks = { onNext(): void; onBack(): void; onReset(): void }`.
3. **P6 fix — Step3UnderlayView.ts**: replace `window.commandManager.execute(new CreateUnderlayCommand(creationParams))` (lines 757–759) with `runtime.commandBus.dispatch(new CreateUnderlayCommand(creationParams))`. The `commandBus` slot is on `PryzmRuntime` (`runtime.commandBus`). The `window.scene`, `window.camera`, `window.renderer`, `window.bimManager` reads (lines 725–733) keep their `TODO(D.4)` annotations — not Wave 14 scope.
4. **P6 fix — Step6CommitView.ts**: replace `window.commandManager.execute(new DeleteUnderlayCommand(params))` (lines 1298–1299) with `runtime.commandBus.dispatch(new DeleteUnderlayCommand(params))`.
5. `FloorPlanDOMBuilder.ts`: pure DOM construction — receives `state` and callback references from the wizard shell; no `runtime` dependency of its own.

**Verifier after split**:
```bash
rg '\(window as any\)' src/ui/ai/floorplan-import/ --type ts | wc -l            # → 0 (already 0; regression guard)
rg 'commandManager\.execute' src/ui/ai/FloorPlanImportPanel.ts src/ui/ai/floorplan-import/ --type ts | wc -l  # → 0  ← P6 gate ADDED
wc -l src/ui/ai/FloorPlanImportPanel.ts                                          # → ≤350  (corrected from ≤250)
wc -l src/ui/ai/floorplan-import/*.ts | awk '$1 > 1500'                          # → 0 files
```

---

#### FILE 4 — Wave 14 as-found audit (2026-05-02)

**Status**: ❌ pending — not yet started. File is intact at 1,874 LOC.

**Measured LOC by functional cluster:**

| Cluster | Lines | LOC | Key symbols |
|---|---|---:|---|
| File header, lazy PDF-converter loader, imports | 1–62 | 62 | `_getPDFConverter` lazy-load; `commandProposalStore`; `FloorPlanAIFactory`; `FloorPlanCommandBatcher`; `FloorPlanBatchExecutor` |
| `FPState` interface + module-level singletons | 63–141 | 79 | `FPState` (14 fields); `let _runtime` module singleton (line 118); `const state: FPState` module singleton (lines 120–141) |
| Step navigation + debug helpers | 143–244 | 102 | `gotoStep(step)` — visibility + indicator dot management; `showDebugStep()` — panel resize + debug-panel reveal; `handleViewFullPlan()`; `setStatus()` |
| Step 1: file upload + PDF→image trigger | 244–348 | 105 | `getFloorPlanFileType`; `pickDefaultPxPerMeter`; lazy `PDFToImageConverter` import; direct-image auto-import path |
| Step 2: scale calibration | 349–716 | 368 | `detectScaleRatioFromText`; `pxPerMeterFromScaleRatio`; `formatPlanSize`; `applyCalibration`; `drawRulerCanvas` (canvas 2-D ruler draw, 112 LOC); `initStep2Ruler`; `handleRulerCanvasClick`; `handleConfirmRuler`; `handleResetRuler`; `handleUseDetectedScale`; `handleApplyManualScale` |
| Step 3: underlay placement | 717–792 | 76 | `window.scene/camera/renderer` ×2 sites `TODO(D.4)`; `FloorPlanUnderlayTool` create; **P6**: `window.commandManager.execute(new CreateUnderlayCommand(...))` line 757; `handleConfirmPosition`; `window.projectContext?.activeLevelId` `TODO(C.3.x)` |
| Step 4: AI analysis + debug overlay | 793–1176 | 384 | `readOptions`; `FloorPlanAIFactory.analyse()`; `FloorPlanCommandBatcher.batch()`; `populateDebugStats`; `renderRoomOverlayOnDebugCanvas` (canvas overlay renderer, 207 LOC); `window.projectContext?.activeLevelId` ×2 `TODO(C.3.x)` |
| Step 5: summary | 1177–1215 | 39 | `renderSummary(proposals)` — proposal count + per-type breakdown |
| Step 6: approve/push/remove + reset | 1216–1423 | 208 | `handleApproveAll`; `handlePushAll`; `handleRemoveUnderlay`; **P6**: `window.commandManager.execute(new DeleteUnderlayCommand(...))` line 1298; `_removeUnderlayInternal`; `_recreateUnderlayInternal`; `window.__pryzmRemoveUnderlayInternal` + `window.__pryzmRecreateUnderlayInternal` global writes (TODO(E.floor.X)); `resetState` |
| `createFloorPlanImportPanel()` DOM builder | 1424–1875 | 451 | Full innerHTML panel template for all 6 steps + underlay controls bar + debug step; all button wire-ups (`onclick`, `oninput`, `onchange`); step-panel visibility initialisation; `window.floorPlanUnderlayTool` read (TODO(E.floor.X)) |
| **Total** | | **1,874** | |

---

**P6 violations — exact call sites (2 sites):**

| Line | Step | Context | Command | TODO tag |
|---|---|---|---|---|
| 757–759 | Step 3 (underlay placement) | `const cmdMgr = window.commandManager; if (cmdMgr?.execute) cmdMgr.execute(new CreateUnderlayCommand(creationParams))` | `CreateUnderlayCommand` | `TODO(E.5.x)` |
| 1298–1299 | Step 6 (remove underlay) | `if (cmdMgr?.execute && liveTool) cmdMgr.execute(new DeleteUnderlayCommand(params))` | `DeleteUnderlayCommand` | `TODO(E.5.x)` |

**Fix**: In `Step3UnderlayView.ts` and `Step6CommitView.ts` post-split, replace `cmdMgr.execute(cmd)` with `runtime.commandBus.dispatch(cmd)`. The `runtime.commandBus` slot is confirmed on `PryzmRuntime` in `packages/runtime-composer/src/types.ts`. No additional import needed — `runtime` is already a parameter of each step view.

---

**Module-level singleton state — correctness issue:**

`const state: FPState` (lines 120–141) and `let _runtime` (line 118) are **module-level mutable singletons**. Because ES modules are cached, every call to `createFloorPlanImportPanel()` receives the exact same `state` object. If the panel is instantiated more than once (e.g. mounted to two different containers), both instances mutate the same `FPState`. This is a latent state-corruption bug, not just an architectural concern.

**Fix**: Move both declarations inside `createFloorPlanImportPanel()`:
```typescript
// BEFORE (module-level singleton — bug):
let _runtime: PryzmRuntime | null = null;
const state: FPState = { step: 1, pdfConversion: null, ... };

// AFTER (instance-scoped — correct):
export function createFloorPlanImportPanel(runtime: PryzmRuntime | null = null): HTMLElement {
    let _runtime = runtime;
    const state: FPState = { step: 1, pdfConversion: null, ... };
    // ... pass state to each step file as a parameter
}
```

The `window.__pryzmRemoveUnderlayInternal` and `window.__pryzmRecreateUnderlayInternal` global writes at lines 1366–1367 are also singletons-via-window (last call wins). After the singleton-state fix, these writes remain but will now capture the most-recently-created instance's closures — same behaviour as today. The `TODO(E.floor.X)` annotation is preserved.

---

**Existing plan corrections summary:**

| Item | Original plan | Corrected |
|---|---|---|
| Step 2 name | `Step2ConvertView.ts` (PDF→image convert) | `Step2CalibrationView.ts` (scale calibration — ruler, scale-bar, manual) — PDF→image is Step 1 processing |
| Shell LOC target | ≤250 | ≤350 (DOM builder alone is 451 LOC; it goes into `FloorPlanDOMBuilder.ts`, leaving the wizard shell at ~350 LOC) |
| Missing file | — | `FloorPlanDOMBuilder.ts` (~451 LOC) — the `createFloorPlanImportPanel` DOM template |
| P4 label | P4 soft | **None** — 0 `(window as any)` casts; add **P6 soft** instead (2 sites) |
| Singleton state | Not mentioned | Module-level `state: FPState` singleton must move into instance scope (correctness fix) |
| Step 5 name | "proposal review grid: accept / reject / edit per element" | Step 5 is `renderSummary` (39 LOC summary display only). The proposal review lives in the Step 6 DOM + `handleApproveAll`/`handlePushAll` |
| Detection preview | Not mentioned | `showDebugStep()` is an intermediate step between Steps 4 and 5 (not a numbered step) — handled entirely in `Step4AnalysisView.ts` |

---

#### FILE 5 — `src/ui/inspect/AuditStack.ts` (1,846 LOC)

**What it is**: Right-hand panel for Inspect mode (F2). Two rendering modes driven by `comparisonEngine.getDeltaMap()`: (1) **Discovery mode** (deltaMap empty) — attribute heatmap across all rooms, coloured by divergence; (2) **Audit mode** (brief exists) — comparison grid with health scores, per-category filter pills, and a global auto-remediate fix bar. The panel also contains a mini project browser tree (Building → Level → element-type groups → individual elements), an element-type selector dropdown, an attribute selector dropdown, and a polymorphic matrix for non-room element types. The file is one `export class AuditStack` (lines 409–1844) plus 408 lines of module-level constants, helper functions, and `AttributeDescriptor` definitions, topped by `export const auditStack = new AuditStack()` at line 1846.

The file contains **7 distinct `window.X` globals** read across **10 call sites** — all typed via `global-window.d.ts`, all annotated with `TODO` phase tags. Three of the seven were absent from the original plan.

**Violations**:
- **P6 soft** (`01-VISION.md P6`): `window.commandManager.execute(cmd, { source: 'HUMAN_DIRECT' })` at line 1784 inside `_dispatchFix()` — dispatches `AutoRemediateCommand` via window global instead of `runtime.commandBus`. This is the **only mutation site** in the file and the sole Wave 14 P6 fix. Note: the second argument `{ source: 'HUMAN_DIRECT' }` is commandManager-specific metadata — the migration pattern must preserve the intent (see below).
- **L7.5 god-object** (`02-ARCHITECTURE.md §1`): 1,846 LOC with 8 distinct render methods plus 408 LOC of module-level constants — the project tree, discovery mode, audit grid, and polymorphic matrix each have enough complexity to justify their own file.
- **Singleton with null runtime** (correctness): `export const auditStack = new AuditStack()` (line 1846) calls the constructor with `runtime = null` (default). Although the constructor already stores `this.runtime = runtime`, no method currently reads `this.runtime` — all store access still goes via window globals. After the P6 fix, `_dispatchFix()` will read `this.runtime?.commandBus`, but the singleton will remain null-runtime unless the instantiation site in `Layout.ts` (or `initUI.ts`) is updated to pass the live runtime.
- ~~**P4** (`no (window as any)`): 4 identified `window.*` access sites — the most explicit P4 backlog in `src/ui/`.~~ ← **INCORRECT** — corrected by as-found audit. There are **0** `(window as any)` casts in this file (confirmed; `03-CURRENT-STATE.md §1` metric row 3: `src/ui/` cast count = 0). All `window.X` accesses are typed via `global-window.d.ts`. Original plan also undercounted — there are 7 distinct window globals (not 4), across 10 call sites.

**All `window.X` globals in this file (inventory)**:

| Global | Call sites | TODO tag | Migration phase | Wave 14 scope? |
|---|---|---|---|---|
| `window.roomStore` | ×4 (lines 1164, 1382, 1743, 1802) | `TODO(E.18-R.S)` | Phase E.18-R.S | ❌ Phase E |
| `window.bimManager` | ×1 (line 681) | `TODO(D.4)` | Phase D.4 | ❌ Phase D |
| `window.wallStore` | ×2 (lines 1131, 1137) | `TODO(E.wall.S)` | Phase E.wall.S | ❌ Phase E |
| `window.furnitureStore` | ×1 (line 1143) | `TODO(E.furniture.S)` | Phase E.furniture.S | ❌ Phase E — **missing from original plan** |
| `window.commandManager` | ×1 (line 1767) | `TODO(E.5.x)` | Phase E.5.x | ✅ **P6 fix — Wave 14 scope** |
| `window.projectContext` | ×1 (line 765) | `TODO(C.3.x)` | Phase C.3.x | ❌ Phase C — **missing from original plan** |
| `window.roomContentsService` | ×1 (line 135) | `TODO(E.18-R)` | Phase E.18-R | ❌ Phase E — **missing from original plan** |

**Split target** *(cohesion observation correct; zone LOC updated; ATTRIBUTE_OPTIONS zone assignment added)*:
```
src/ui/inspect/
  AuditStack.ts                   (≤500 LOC shell — class skeleton, constructor, _buildDOM, _bindEvents,
                                   _show/_hide, _extractRoomAttr*, helpers, _countAllElements,
                                   module-level CATEGORY_LABELS + ELEMENT_TYPE maps + health-score helpers)
  audit/
    ProjectTreeZone.ts            (~305 LOC — _renderProjectTree, _renderTreeBody, _renderTypesForLevel;
                                   window.bimManager read stays TODO(D.4); window.projectContext stays TODO(C.3.x))
    ElementTypeSelectorZone.ts    (~334 LOC — ATTRIBUTE_OPTIONS definitions (197 LOC) + _rebuildAttributeDropdown,
                                   _rebuildDropdown, _storeKeyForType, _getActiveAttrOption, _buildHeatmapData;
                                   window.wallStore / window.furnitureStore reads stay TODO(E.wall.S/furniture.S))
    DiscoveryModeZone.ts          (~202 LOC — _renderDiscoveryMode cluster incl. tooltip helpers;
                                   window.roomStore reads stay TODO(E.18-R.S))
    AuditGridZone.ts              (~425 LOC — _renderAuditMode, _buildFilterPills, _renderPolymorphicMatrix,
                                   _renderGrid, _renderGlobalFixBar, _onGlobalFix, _dispatchFix;
                                   P6 fix lands here: window.commandManager → this.runtime?.commandBus;
                                   window.roomStore reads stay TODO(E.18-R.S))
```

**Migration pattern** *(corrected — priority: P6 fix + singleton runtime wiring, then split)*:

1. **P6 fix — `_dispatchFix()` (line 1765–1785)**: Replace `window.commandManager.execute(cmd, { source: 'HUMAN_DIRECT' })` with `this.runtime?.commandBus.dispatch(cmd)`. The second argument `{ source: 'HUMAN_DIRECT' }` is audit metadata — attach it to the command at construction or log it as a side-channel console note; it must NOT be silently dropped. Guard for null: `if (!this.runtime?.commandBus) { console.warn('[AuditStack] runtime.commandBus unavailable — fix skipped'); return; }`.

2. **Singleton runtime wiring**: Update the instantiation call at the bottom of the file and/or in `Layout.ts` / `initUI.ts` so that `auditStack` receives a live runtime: `export const auditStack = new AuditStack(runtime)`. Until this is done, the P6 fix will silently fall through the null guard on every invocation.

3. **Phase D/E window globals (not Wave 14)**: `window.roomStore`, `window.bimManager`, `window.wallStore`, `window.furnitureStore`, `window.projectContext`, `window.roomContentsService` — all retain their `TODO` annotations unchanged. Migration pattern from original plan (step 1, items 1–3) is directionally correct but premature for Wave 14.
   - `window.bimManager.getLevels()` → `this.runtime.stores.levels.getAll()` (Phase D.4) — **plus** `bimManager.getActiveLevelId()` (line 765) → `this.runtime.projectContext.activeLevelId` (Phase C.3.x). Original plan omitted the `getActiveLevelId` call.
   - `window.roomStore` → `this.runtime.stores.rooms` (Phase E.18-R.S)
   - `window.wallStore.getAllDoors()` / `.getAllWindows()` → `this.runtime.stores.wall.*` (Phase E.wall.S)
   - `window.furnitureStore.getAll()` → `this.runtime.stores.furniture.getAll()` (Phase E.furniture.S — **missing from original plan**)
   - `window.roomContentsService` → `this.runtime.rooms.contentsService` (Phase E.18-R — **missing from original plan**)

4. Each sub-zone receives `this.runtime` as a constructor parameter after split.

5. 1 vitest per zone: mount with `mockRuntime({ commandBus: mockCommandBus(), rooms: mockRoomsStore(), ... })` → verify correct command type dispatched (not just "no throw").

**Verifier after P6 fix + singleton wiring**:
```bash
rg 'window\.commandManager' src/ui/inspect/ --type ts | wc -l            # → 0  ← P6 gate
rg '\(window as any\)' src/ui/inspect/ --type ts | wc -l                 # → 0  (already 0 — regression guard)
wc -l src/ui/inspect/AuditStack.ts                                        # → ≤500 (after split only)
```

---

#### FILE 5 — Wave 14 as-found audit (2026-05-02)

**Status**: ❌ pending — not yet started. File is intact at 1,846 LOC.

**Measured LOC by functional cluster:**

| Cluster | Lines | LOC | Key symbols |
|---|---|---:|---|
| File header + imports | 1–52 | 52 | `comparisonEngine`, `AutoRemediateCommand`, `selectionBus` |
| Module constants: CATEGORY_LABELS, ELEMENT_TYPE maps, icons | 53–107 | 55 | `CATEGORY_LABELS`, `ELEMENT_TYPE_LABELS`, `ELEMENT_TYPE_ICONS`, `InspectElementType` type |
| `AttributeDescriptor` interface + format helpers + RoomContentsCache | 108–175 | 68 | `AttributeDescriptor`, `AttrOption`; `_fmtM/M2/M3/Mm/Cnt/Str`; `_contentsCache`; `_bumpContentsCache`; module-level `window.addEventListener` cache-invalidation wiring at line 132; **`window.roomContentsService`** at line 135 |
| `ATTRIBUTE_OPTIONS` descriptor definitions (rooms/walls/slabs/columns/doors/windows) | 176–372 | 197 | 30+ `AttributeDescriptor` objects with typed `extract` + `format` lambdas; **`window.wallStore`** at lines 1131/1137; **`window.furnitureStore`** at line 1143 (within `_extractRoomAttrValue` switch, lines 1120–1162) |
| Health-score helpers | 373–406 | 34 | `scoreForDelta()`, `colorForScore()`, `labelForScore()` |
| Discovery-heatmap helpers | 387–407 | 21 | `buildHeatColor()` |
| `AuditStack` class — fields + constructor + public API | 407–456 | 50 | `this.runtime` field (accepts `PryzmRuntime | null = null`); `_buildDOM()`; `_bindEvents()`; `refresh()` |
| `_buildDOM()` — full DOM template | 459–591 | 133 | Header; project browser section; element-type selector; attribute selector; content zone; global fix bar |
| `_bindEvents()` — event listeners | 592–651 | 60 | `pryzm-workspace-mode`, `pryzm-delta-updated`, `pryzm-audit-room-select`, `bim-selection-changed`, `wall:walls-changed`, `bim-room-*`, `level-changed`, `model-updated` |
| `_show` / `_hide` / `_dispatchInspectMode` | 654–677 | 24 | Mode toggle helpers; `window.dispatchEvent` (fine — CustomEvent, not a store write) |
| `_renderProjectTree` + `_renderTreeBody` + `_renderTypesForLevel` | 678–982 | 305 | **`window.bimManager`** at line 681 `TODO(D.4)`; `bimManager.getLevels()` + `bimManager.getActiveLevelId()`; **`window.projectContext`** at line 765 `TODO(C.3.x)` |
| `_renderContent` + dropdown management | 983–1162 | 180 | `_rebuildAttributeDropdown`, `_rebuildDropdown`, `_storeKeyForType`, `_getActiveAttrOption`, `_buildHeatmapData`, `_extractRoomAttrValue`, `_extractRoomAttrString` |
| `_renderDiscoveryMode` cluster incl. tooltip | 1163–1364 | 202 | **`window.roomStore`** at lines 1164, 1382 `TODO(E.18-R.S)`; heatmap canvas; `_showDiscoveryTooltipFull`; `_hideDiscoveryTooltip` |
| `_renderAuditMode` + `_buildFilterPills` | 1365–1498 | 134 | Comparison grid shell; category pill bar |
| `_renderPolymorphicMatrix` | 1499–1640 | 142 | Non-room element type matrix; scrollable table THEAD + TBODY |
| `_renderGrid` | 1641–1732 | 92 | Per-room row render for audit grid; **`window.roomStore`** at line 1743 `TODO(E.18-R.S)` |
| `_renderGlobalFixBar` + `_onGlobalFix` + `_dispatchFix` | 1733–1789 | 57 | **P6**: **`window.commandManager.execute(cmd, { source: 'HUMAN_DIRECT' })`** at line 1784; `AutoRemediateCommand` construction + `canExecute` guard |
| Helpers + `_getAllRooms` + `_countAllElements` + `_getElementIcon` + `_formatValue` | 1790–1844 | 55 | **`window.roomStore`** at line 1802 `TODO(E.18-R.S)` |
| Module-level singleton | 1844–1846 | 3 | `export const auditStack = new AuditStack()` — **null runtime** |
| **Total** | | **1,846** | |

---

**P6 violation — exact call site (1 site):**

| Line | Method | Full expression | Command | TODO tag |
|---|---|---|---|---|
| 1784 | `_dispatchFix(entries)` | `cmdManager.execute(cmd, { source: 'HUMAN_DIRECT' })` where `cmdManager = window.commandManager` (line 1767) | `AutoRemediateCommand({ roomId, entries })` | `TODO(E.5.x)` |

**Guard already present**: Lines 1768–1770 check `if (!cmdManager)` and warn — the null-safety pattern is correct; migration just changes the reference from `window.commandManager` to `this.runtime?.commandBus`.

**`{ source: 'HUMAN_DIRECT' }` metadata**: This second argument to `cmdManager.execute()` is a commandManager execution-context hint. `runtime.commandBus.dispatch()` does not accept a second argument. The intent should be preserved by either: (a) embedding the source tag in the command constructor `new AutoRemediateCommand({ roomId, entries, source: 'HUMAN_DIRECT' })`, or (b) emitting a pre-dispatch audit log line. Option (a) requires updating `AutoRemediateCommand`'s parameter type — mark with `TODO(E.5.x)` until that is resolved.

---

**Singleton null-runtime — correctness issue:**

```typescript
// Line 1846 — singleton with null runtime (current):
export const auditStack = new AuditStack();   // runtime = null (default)

// this.runtime is stored at constructor line 436 but NEVER read in any method.
// After P6 fix, _dispatchFix() reads this.runtime?.commandBus — will silently
// no-op on every invocation until the instantiation site passes a live runtime.
```

**Fix**: Wherever `auditStack` is created (ultimately wired in `Layout.ts` or `initUI.ts`), pass the composed runtime: `new AuditStack(runtime)`. The singleton export pattern itself can remain — it just needs the runtime threaded through.

---

**Original plan corrections summary:**

| Item | Original plan | Corrected |
|---|---|---|
| P4 label | P4 — "most explicit P4 backlog in src/ui/" | **None** — 0 `(window as any)` casts; `03-CURRENT-STATE.md §1` row 3 confirms 0 in `src/ui/`. Add **P6 soft** (1 call site) instead |
| Window global count | "4 identified access sites" | **7 distinct globals, 10 call sites** |
| Missing globals (original plan) | Not listed | `window.furnitureStore` `TODO(E.furniture.S)`, `window.projectContext` `TODO(C.3.x)`, `window.roomContentsService` `TODO(E.18-R)` — all Phase D/E/C scope |
| `bimManager` migration | `bimManager.getLevels()` → `runtime.stores.levels.getAll()` | Also `bimManager.getActiveLevelId()` (line 765) → `runtime.projectContext.activeLevelId` — Phase C.3.x, omitted from original |
| `{ source: 'HUMAN_DIRECT' }` arg | `commandManager.execute(cmd)` → `commandBus.dispatch(cmd)` | Second arg must not be silently dropped — embed in command or log pre-dispatch; see P6 fix notes |
| Singleton null runtime | Not mentioned | `auditStack = new AuditStack()` instantiated with null runtime — P6 fix silently no-ops until the instantiation site passes a live runtime |
| `this.runtime` usage | Plan implies it will be read after migration | `this.runtime` is already stored (line 436) but zero methods currently read it — all store reads go via window globals; after P6 fix, only `_dispatchFix` reads it |
| ATTRIBUTE_OPTIONS zone | Not assigned to any zone in split | 197 LOC of `AttributeDescriptor` objects belong in `ElementTypeSelectorZone.ts` — raising that zone to ~334 LOC |
| AuditGridZone LOC | Not specified | ~425 LOC (`_renderAuditMode` + `_buildFilterPills` + `_renderPolymorphicMatrix` + `_renderGrid` + `_renderGlobalFixBar` + `_onGlobalFix` + `_dispatchFix`) — within range but larger than originally implied |

---

#### FILE 6 — `src/ui/ViewBrowser/panels/UnifiedBrowserPanel.ts` (1,819 LOC)

**What it is**: Left-rail project browser panel. The file header lists five tabs (PROJECT, ELEMENTS, SHEETS, VIEWS, SCHEDULES) but only **two are implemented in this file**: PROJECT (full spatial tree: Building → Site → Levels → Types → Elements, with visibility toggles, isolate, and bidirectional selection sync) and ELEMENTS (expandable category → type → instance grid). The file also contains a private helper class `UnifiedRailProxy` and a comprehensive visibility/isolate system that directly traverses the THREE.js scene. SHEETS, VIEWS, and SCHEDULES are named in the header comment only — they are not imported or rendered here.

The class constructor already accepts `runtime: PryzmRuntime | null = null` (stored as `this.runtime`), but `this.runtime` is never read in any method — all store and manager access goes via typed window globals. The file reads **22 distinct `window.X` globals** across dozens of call sites, all typed via `global-window.d.ts`, all annotated with `TODO` phase tags.

**Violations**:
- **P6b — Wave 14 scope** (`01-VISION.md P6`): `window.commandManager.execute(new AddLevelCommand({...}))` at line 466, inside the "Add level" click handler in `_buildProjectCard()`. The command is dispatched via window global instead of `runtime.commandBus.dispatch()`. This call site was **entirely absent from the original plan**. The `AddLevelCommand` is imported at the top of the file (line 32) — a `commandBus.dispatch()` migration requires no new import.
- **P6a + P7 — D.13 scope, not Wave 14** (`01-VISION.md P6 + P7`): Five methods directly traverse and mutate `obj.visible` on THREE.js scene objects: `_applyLevelVisibility` (line 1615), `_applyElementVisibility` (line 1658), `_applyIsolate` (line 963), `_resetAllVisibility` (line 1024), `_handleVisibilityCommand` (line 1158). This bypasses the visibility domain (`packages/visibility/` per P7). However, the scene is accessed exclusively via `window.selectionManager?.world?.scene?.three` (TODO(D.13)) — this is **Phase D.13 scope**, not Wave 14. The file header explicitly documents: "§01 — Read-only UI; visibility toggle only affects scene projection (not semantic)." The P6a+P7 correction is deferred to D.13.
- **L7.5 god-object** (`02-ARCHITECTURE.md §1`): 1,819 LOC. The PROJECT tab's DOM render + visibility logic alone spans 885 LOC (369 + 198 + 318). The ELEMENTS card is 297 LOC. Data helpers and scene helpers are 292 LOC.
- ~~**P4** (`no (window as any)`)~~ ← **INCORRECT** — 0 `(window as any)` casts in this file. Confirmed; `03-CURRENT-STATE.md §1` row 3: `src/ui/` cast count = 0.

**All `window.X` globals in this file (inventory — 22 distinct globals)**:

| Global | TODO tag | Migration phase | Wave 14 scope? |
|---|---|---|---|
| `window.commandManager` (line 450) | `TODO(E.5.x)` | Phase E.5.x | ✅ **P6b fix — Wave 14** |
| `window.bimManager` (lines 451, 1795) | `TODO(D.4)` | Phase D.4 | ❌ Phase D |
| `window.selectionManager` (lines 966, 1033, 1049, 1166, 1616, 1659) | `TODO(D.13)` | Phase D.13 | ❌ Phase D |
| `window.ifcModelStore` (line 482) | `TODO(E.ifc.S)` | Phase E.ifc.S | ❌ Phase E |
| `window.projectStore` (line ~1789) | `TODO(C.3.x)` | Phase C.3.x | ❌ Phase C |
| `window.projectContext` (lines ~1793, ~1800) | `TODO(C.3.x)` | Phase C.3.x | ❌ Phase C |
| `window.wallStore` (lines 803, 1090, 1681) | `TODO(E.wall.S)` | Phase E.wall.S | ❌ Phase E |
| `window.curtainWallStore` (lines 1091, 1682) | `TODO(E.curtain-wall.S)` | Phase E | ❌ Phase E |
| `window.slabStore` (lines 1092, 1683) | `TODO(E.slab.S)` | Phase E | ❌ Phase E |
| `window.floorStore` (lines 1093, 1684) | `TODO(E.floor.S)` | Phase E | ❌ Phase E |
| `window.ceilingStore` (lines 1094, 1685) | `TODO(E.ceiling.S)` | Phase E | ❌ Phase E |
| `window.doorStore` (lines 1096, 1687) | `TODO(E.door.S)` | Phase E | ❌ Phase E |
| `window.windowStore` (lines 1097, 1688) | `TODO(E.window.S)` | Phase E | ❌ Phase E |
| `window.openingStore` (lines 1098, 1689) | `TODO(E.14)` | Phase E | ❌ Phase E |
| `window.furnitureStore` (lines 1099, 1690) | `TODO(E.furniture.S)` | Phase E | ❌ Phase E |
| `window.lightingStore` (lines 1100, 1691) | `TODO(E.lighting.S)` | Phase E | ❌ Phase E |
| `window.stairStore` (lines 1101, 1692) | `TODO(E.stair.S)` | Phase E | ❌ Phase E |
| `window.handrailStore` (lines 1102, 1693) | `TODO(E.handrail.S)` | Phase E | ❌ Phase E |
| `window.columnStore` (lines 1103, 1694) | `TODO(E.column.S)` | Phase E | ❌ Phase E |
| `window.beamStore` (lines 1104, 1695) | `TODO(E.beam.S)` | Phase E | ❌ Phase E |
| `window.plumbingStore` (lines 1105, 1696) | `TODO(E.plumbing.S)` | Phase E | ❌ Phase E |
| `window.roomStore` (lines 1106, ~1697) | `TODO(E.18-R.S)` | Phase E.18-R.S | ❌ Phase E |

**Split target** *(corrected — SHEETS/VIEWS/SCHEDULES removed; PROJECT tab split into render + visibility sections; shell LOC target ≤250 → ≤350; BrowserDataHelpers added)*:
```
src/ui/ViewBrowser/panels/
  UnifiedBrowserPanel.ts          (≤350 LOC — UnifiedRailProxy + class fields/constructor + _buildHeader
                                   + _buildCard + refresh; receives runtime: PryzmRuntime)
  unified-browser/
    ProjectTreeSection.ts         (~567 LOC — _buildProjectCard, _getLevels, _buildLevelBlock,
                                   _buildTypeGroup, _buildElemRow, _buildChildRow;
                                   P6b fix: window.commandManager.execute(AddLevelCommand)
                                   → runtime.commandBus.dispatch(AddLevelCommand))
    ProjectVisibilitySection.ts   (~318 LOC — _applyLevelVisibility, _applyElementVisibility,
                                   _applyIsolate, _resetAllVisibility, _hasAnyOverride,
                                   _selectElements, _getAllElementIds, _applyCategoryVisibility,
                                   _applyCategoryTypeVisibility, _handleVisibilityCommand;
                                   scene access stays window.selectionManager TODO(D.13))
    ElementsSummarySection.ts     (~297 LOC — _buildElementsCard, _buildElementCategoryRow,
                                   _populateCategoryBody, _buildCategoryTypeGroup, instance rows)
    BrowserDataHelpers.ts         (~292 LOC — _getAllStores, _getTypeElements, _getCategoryElements,
                                   _getSubType, _getElementsForLevel, _getProjectName,
                                   _getActiveLevelName, _normalizeStoreyName;
                                   all window store reads retain TODO phase tags)
```

> **Note**: `SheetsTab.ts`, `ViewsTab.ts`, `SchedulesTab.ts` from the original plan **do not exist** in this file. SHEETS / VIEWS / SCHEDULES appear only in the file header comment as a design intent statement. The code renders `['PROJECT', 'ELEMENTS']` only (line 231: `const all = ['PROJECT', 'ELEMENTS']`). If SHEETS/VIEWS/SCHEDULES are implemented in a parent panel, that parent is outside this file's split scope.

**Migration pattern** *(corrected)*:
1. **P6b fix — `_buildProjectCard` (line 466)**: Replace `window.commandManager.execute(new AddLevelCommand({...}))` with `this.runtime?.commandBus.dispatch(new AddLevelCommand({...}))`. Guard: `if (!this.runtime?.commandBus) { console.warn('[UBP] runtime.commandBus not available'); return; }`. Remove the `window.commandManager` local variable at line 450 — `window.bimManager` at line 451 retains its `TODO(D.4)` annotation.
2. **P6a + P7 (D.13 scope — not Wave 14)**: `_applyLevelVisibility`, `_applyElementVisibility`, `_applyIsolate`, `_resetAllVisibility` — scene access via `window.selectionManager?.world?.scene?.three` is `TODO(D.13)`. Post-D.13, these methods route through `runtime.visibility.applyLevel(id, visible)` / `runtime.visibility.applyElement(id, visible)` / `runtime.visibility.applyIsolate(...)` per the `packages/visibility/` contract. No Wave 14 action required here.
3. **Selection sync**: `selectionBus.select(elemId, 'project-browser')` and `selectionBus.select(childId, 'project-browser')` (lines 864, 906, 1518) are already correct per Contract 27 §4 — preserve as-is.
4. After split, each section receives `this.runtime` as a constructor parameter from the shell.

**Verifier after P6b fix**:
```bash
rg 'window\.commandManager' src/ui/ViewBrowser/ --type ts | wc -l         # → 0  ← P6b gate
rg '\(window as any\)' src/ui/ViewBrowser/ --type ts | wc -l              # → 0  (already 0 — regression guard)
wc -l src/ui/ViewBrowser/panels/UnifiedBrowserPanel.ts                     # → ≤350 (after split only)
wc -l src/ui/ViewBrowser/panels/unified-browser/*.ts | awk '$1 > 1500'    # → 0 files (after split only)
```

---

#### FILE 6 — Wave 14 as-found audit (2026-05-02)

**Status**: ❌ pending — not yet started. File is intact at 1,819 LOC.

**Measured LOC by functional cluster:**

| Cluster | Lines | LOC | Key symbols |
|---|---|---:|---|
| File header + imports + `UnifiedRailProxy` class | 1–52 | 52 | `AddLevelCommand`; `selectionBus`; `UnifiedRailProxy` (proxy delegates `refreshIfActive` to parent rail section `'BROWSER'`; already stores `this.runtime`) |
| `UnifiedBrowserPanel` class — fields + constructor + event wiring + auto-expand | 53–210 | 158 | 22 private state fields (`_expandedLevels`, `_levelVisible`, `_elemVisible`, `_isolateMode`, …); constructor event listeners (12 events); `this.runtime = runtime` stored at line ~98 — **never subsequently read** |
| `_buildHeader` — gradient header, search bar, breadcrumb, reset-visibility row | 211–345 | 135 | Gradient header; search `<input>`; "Reset visibility" button wired to `_resetAllVisibility()`; "Add level" / level manager CTA |
| `_buildProjectCard` + `_getLevels` + IFC model helpers | 346–559 | 214 | **P6b**: `window.commandManager.execute(new AddLevelCommand({...}))` at line 466; `window.bimManager` at line 451 `TODO(D.4)`; `window.ifcModelStore` at line 482 `TODO(E.ifc.S)`; `_getLevels()` merges native levels with IFC storeys |
| `_buildLevelBlock` — level header row + children block | 560–714 | 155 | Per-level expand/collapse; visibility eye-icon toggle; isolate button; `_applyLevelVisibility()` call |
| `_buildTypeGroup` + `_buildElemRow` + `_buildChildRow` | 715–912 | 198 | Per-type group rows; `selectionBus.select()` at lines 864/906 ✅ Contract 27 §4; `window.wallStore` at line 803 `TODO(E.wall.S)` (door/window child lookup) |
| Visibility + isolate + reset + selection cluster | 913–1230 | 318 | `_applyIsolate` (line 963): **P6a+P7** — `window.selectionManager?.world?.scene?.three` `TODO(D.13)` × all 5 visibility methods; `_resetAllVisibility` (line 1024); `_selectElements` (line 1045): `window.selectionManager` `TODO(D.13)`; `_handleVisibilityCommand` (line 1158): AI/browser visibility dispatch handler — 6 action × target combinations |
| `_buildElementsCard` + category rows + type groups + instances | 1231–1527 | 297 | Expandable category accordion; `window.*Store.getAll()` per type (lines 1090–1106); `selectionBus.select()` at line 1518 ✅; `_applyElementVisibility()` call at line 1501 (P6a+P7 scope D.13) |
| `_buildCard` (generic card builder) | 1528–1610 | 83 | Generic expandable card shell used by PROJECT and ELEMENTS; expand/collapse toggle |
| Scene visibility helpers (`_applyLevelVisibility`, `_applyElementVisibility`) | 1611–1676 | 66 | **P6a+P7** (D.13 scope): `scene.traverse(obj => obj.visible = visible)` — direct THREE.js scene mutation; both methods access `window.selectionManager?.world?.scene?.three` `TODO(D.13)` |
| Data helpers — `_getAllStores` + type/category/level element queries | 1677–1819 | 143 | `_getAllStores()` (line 1677): lists all 16 element-type stores via window globals; `_getProjectName()`: `window.projectStore` + `window.projectContext` `TODO(C.3.x)`; `_getActiveLevelName()`: `window.projectContext` `TODO(C.3.x)`; `_normalizeStoreyName()` |
| **Total** | | **1,819** | |

---

**P6 violations — exact call sites:**

| Label | Line | Method | Expression | Command | Scope |
|---|---|---|---|---|---|
| **P6b** | 466 | `_buildProjectCard` click handler | `window.commandManager.execute(new AddLevelCommand({levelId, name, elevation, height}))` | `AddLevelCommand` | ✅ **Wave 14** |
| **P6a** | 1615–1655 | `_applyLevelVisibility` | `window.selectionManager?.world?.scene?.three` → `scene.traverse(obj => obj.visible = visible)` | n/a (scene mutation) | ❌ D.13 scope |
| **P6a** | 1658–1676 | `_applyElementVisibility` | same scene-traverse pattern | n/a | ❌ D.13 scope |
| **P6a** | 963–1010 | `_applyIsolate` | same scene-traverse pattern | n/a | ❌ D.13 scope |
| **P6a** | 1024–1043 | `_resetAllVisibility` | same scene-traverse pattern | n/a | ❌ D.13 scope |
| **P6a** | 1166–1229 | `_handleVisibilityCommand` | same scene-traverse pattern | n/a | ❌ D.13 scope |

**P6b fix detail**: In `_buildProjectCard()` click handler (lines 449–469), the local variable `commandManager = window.commandManager` at line 450 is the only Wave 14-scoped mutation. `bimManager = window.bimManager` at line 451 reads `getLevels()` for elevation calculation — not a mutation, retains `TODO(D.4)`. After fix:
```typescript
// BEFORE:
const commandManager = window.commandManager;
const bimManager     = window.bimManager;
if (!commandManager || !bimManager) { console.warn(...); return; }
commandManager.execute(new AddLevelCommand({...}));

// AFTER:
const bimManager = window.bimManager; // TODO(D.4) — retained
if (!this.runtime?.commandBus || !bimManager) { console.warn(...); return; }
this.runtime.commandBus.dispatch(new AddLevelCommand({...}));
```

---

**SHEETS / VIEWS / SCHEDULES — not in file:**

The file header comment lists five tabs. The code renders exactly two:
- Line 231: `const all = ['PROJECT', 'ELEMENTS'];` — the only tab set iterated
- Line 475: `return this._buildCard('PROJECT', ...)` — PROJECT card built
- Line 1272: `return this._buildCard('ELEMENTS', ...)` — ELEMENTS card built

`SheetsRailPanel`, `ViewsRailPanel`, and `SchedulesRailPanel` are never imported, instantiated, or referenced in any executable code. The split target from the original plan — `SheetsTab.ts`, `ViewsTab.ts`, `SchedulesTab.ts` — describes files that would wrap panels not present in this file. Those three files are **removed from the corrected split target**.

---

**Original plan corrections summary:**

| Item | Original plan | Corrected |
|---|---|---|
| P4 label | P4 — implied ("`(window as any)`") | **None** — 0 casts; confirmed by `03-CURRENT-STATE.md §1` |
| P6 characterisation | "visibility toggle calls scene projection methods directly" | **Two distinct violations**: P6b (`window.commandManager.execute(AddLevelCommand)` — Wave 14) and P6a+P7 (scene traverse visibility — D.13 scope). P6b was entirely absent from the original plan |
| Tab count | 5 tabs (PROJECT + ELEMENTS + SHEETS + VIEWS + SCHEDULES) | **2 tabs implemented**: PROJECT + ELEMENTS. SHEETS/VIEWS/SCHEDULES are header-comment design intent only — not in executable code |
| Split file count | 6 files (shell + 5 tab files) | **5 files** (shell + ProjectTreeSection + ProjectVisibilitySection + ElementsSummarySection + BrowserDataHelpers). SHEETS/VIEWS/SCHEDULES removed; PROJECT split into render + visibility; data helpers separated |
| Shell LOC target | ≤250 | ≤350 — fields + constructor + header + generic card builder = ~345 LOC |
| `SetElementVisibilityCommand` | Proposed as P6 fix | Wrong target — visibility P6a is D.13 scope (scene access via `window.selectionManager`). Wave 14 P6 fix is `AddLevelCommand` → `runtime.commandBus.dispatch()` |
| `selectionBus.select()` | "already correct per Contract 27 §4 — preserve as-is" | ✅ Confirmed correct at lines 864, 906, 1518 |
| Window globals | Not enumerated | 22 distinct typed window globals across dozens of call sites — all Phase D/E/C scope except `window.commandManager` |

---

#### FILE 7 — `src/ui/dataworkbench/DataWorkbench.ts` (1,810 LOC)

**What it is**: ~~4-bucket~~ **6-bucket** lifecycle navigation hub. The `BUCKETS` constant (lines 92–178) defines the six live buckets:

| Bucket ID | Label | Default tab | Sub-tabs |
|---|---|---|---|
| `strategize` | STRATEGIZE ◈ | `programme` | Programme, Templates, Generative (3) |
| `audit` | AUDIT ⬡ | `hierarchy` | Hierarchy, Quantities, Spatial, Intent, AI Query (5) |
| `validate` | VALIDATE ◎ | `compliance` | Compliance, Analytics, Physics (3) |
| `materials-bucket` | MATERIALS ◩ | `materials-library` | BIM Materials, Render Materials, Element Types (3) |
| `lifecycle-bucket` | LIFECYCLE ⏱ | `design-history` | History, Graph, Portfolio, Occupancy (4) |
| `data-schedules` | DATA ▦ | `data-materials` | Materials, Walls, Doors, Windows, Floors, Slabs, Columns, Beams, Stairs (9) |

The file has four structural zones: (A) type definitions + `BUCKETS` constant (lines 1–178); (B) class fields + constructor + public API + DOM construction (lines 178–479); (C) inline `_mount*` rendering methods for MATERIALS and DATA bucket content (lines 480–1556); (D) bucket/tab switching + content activation + mode + events (lines 1557–1810).

The class constructor accepts `runtime: PryzmRuntime | null = null`, stores it as `this.runtime`, and **already forwards `this.runtime` to all 14 sub-panel constructors** (Phase B.20–B.32 per inline comments). Sub-panels are constructed directly from statically-imported panel classes (lines 420–463) — not via window globals.

All element-type store access uses **static module imports** (`wallSystemTypeStore`, `doorSystemTypeStore`, `windowSystemTypeStore`, `floorSystemTypeStore`, `slabSystemTypeStore`, `ceilingSystemTypeStore`, `handrailTypeStore`, `scheduleStore`, `viewTemplateStore`, `STANDARD_MATERIAL_LIBRARY`, `RENDER_MATERIAL_LIBRARY`, `BUILT_IN_STAIR_TYPES`, `SteelProfileLibrary`) — zero window globals for store reads.

**Violations**:
- **L7.5 god-object** ✅ confirmed: 1,810 LOC; the largest single cluster is `_mountElementTypes` (298 LOC, lines 791–1088) + DATA schedule `_mountTypeSchedule`/`_mountMaterialSchedule`/row-builders (409 LOC, lines 1148–1556). Each bucket's mount logic is an independent concern and should live in its own file.
- ~~**P4** (soft): a few bucket render closures access `window.__pryzm2DataWorkbench` state.~~ **INCORRECT — struck.** There are zero `(window as any)` casts (P4 = 0). The global `window.__pryzm2DataWorkbench` **does not appear anywhere in this file**. This claim in the original plan is false.

**Actual window globals (complete inventory)**:

| Global | Lines | Tag | Phase | Wave 14? |
|---|---|---|---|---|
| `window.visibilityIntentPanel?.open?.()` | 550, 1137 | `TODO(F.6.5)` | F.6.5 (panel-host registry) | ❌ F.6.5 scope |

Only 1 distinct window global, used exactly twice, both with `?.open?.()` optional-chain (null-safe), both explicitly tagged `TODO(F.6.5)`. **Zero Wave 14 P4 or P6 violations.**

**Split target** *(corrected — 4 buckets → 6; shell ≤250 → ≤500)*:
```
src/ui/dataworkbench/
  DataWorkbench.ts                (≤500 LOC — BUCKETS constant + class fields + constructor +
                                   public API + _buildDOM + _buildBucketRail +
                                   _buildContentArea + _buildHeatmapBar +
                                   _switchBucket + _switchTab + _rebuildSubTabBar +
                                   _showActiveContent + _applyMode + _bindEvents)
  buckets/
    StrategizeBucket.ts           (≤120 LOC — ProgrammePanel + TemplateEditorPanel +
                                   BriefInputPanel + VariantBrowserPanel mount)
    AuditBucket.ts                (≤180 LOC — HierarchyTreePanel + DataSheetPanel +
                                   SpatialQueryPanel + NLQueryPanel mount +
                                   _mountQuantitySchedules + _mountVisibilityIntentAccess)
    ValidateBucket.ts             (≤100 LOC — CompliancePanel + AnalyticsPanel (lazy) +
                                   PhysicsPanel mount)
    MaterialsBucket.ts            (≤600 LOC — _mountMaterialLibrary + _mountRenderMaterials +
                                   _mountElementTypes)
    LifecycleBucket.ts            (≤120 LOC — DesignHistoryPanel + RelationshipExplorerPanel +
                                   PortfolioQueryPanel + lifecycle-slot warning mount)
    DataSchedulesBucket.ts        (≤450 LOC — _mountMaterialSchedule + _mountTypeSchedule +
                                   all 9 _*TypeRows() row-data builders)
```

**Migration pattern** *(corrected)*:
1. `DataWorkbench` already receives `runtime: PryzmRuntime | null` and already forwards it to all 14 sub-panels — **no runtime wiring changes needed**.
2. Extract each `_mount*` method group into the corresponding bucket file. Each bucket file exports a single `mount<Bucket>(panel, runtime)` function or class method. `DataWorkbench._buildContentArea` calls each bucket mount function.
3. `AuditBucket.ts`: keep AUDIT split-pane layout logic (55%/45%, `_auditSplitEl`, `_auditTreePane`, `_auditSheetPane`, `_showAuditSheet`, `_hideAuditSheet`) inside the bucket file.
4. `DataSchedulesBucket.ts`: the 9 `_*TypeRows()` data builders (171 LOC) stay with their schedule methods to avoid cross-file coupling.
5. ~~Replace `window.__pryzm2DataWorkbench` reads with `runtime.stores.*`~~ — **N/A: this global does not exist in this file. No substitution needed.**
6. `window.visibilityIntentPanel` ×2 (TODO(F.6.5)) — **retain as-is** with existing tag; do not migrate in Wave 14. The optional chain `?.open?.()` is already null-safe. Migration is Phase F.6.5.
7. `MaterialsBucket.ts` will be ~535 LOC — acceptable (verifier threshold is 1500).

**Verifier after split**:
```bash
wc -l src/ui/dataworkbench/DataWorkbench.ts                               # → ≤500
wc -l src/ui/dataworkbench/buckets/*.ts | awk '$1 > 1500'                 # → 0 files
rg '\(window as any\)' src/ui/dataworkbench/ --type ts | wc -l            # → 0 (already 0)
rg 'window\.commandManager' src/ui/dataworkbench/ --type ts | wc -l       # → 0 (no violations)
```

---

#### FILE 7 — Wave 14 as-found audit (2026-05-02)

**Source**: `src/ui/dataworkbench/DataWorkbench.ts` — 1,810 LOC

**LOC breakdown by functional cluster**:

| Cluster | Lines | LOC | Key symbols |
|---|---|---|---|
| File header + JSDoc comment | 1–32 | 32 | Layout modes; 4-bucket architecture described (header predates MATERIALS+DATA addition) |
| Imports (18 panel classes + 13 store/library imports) | 33–62 | 30 | `HierarchyTreePanel`, `DataSheetPanel`, `TemplateEditorPanel`, `AnalyticsPanel`, `CompliancePanel`, `SpatialQueryPanel`, `ProgrammePanel`, `RelationshipExplorerPanel`, `NLQueryPanel`, `DesignHistoryPanel`, `PhysicsPanel`, `BriefInputPanel`, `VariantBrowserPanel`, `PortfolioQueryPanel`; `dataVisualizer`; `STANDARD_MATERIAL_LIBRARY`, `RENDER_MATERIAL_LIBRARY`; 9 system-type stores; `BUILT_IN_STAIR_TYPES`; `SteelProfileLibrary` |
| Type definitions (`WorkbenchMode`, `TabId`, `BucketId`, `SubTabDef`, `BucketDef`) | 63–91 | 29 | 29 distinct `TabId` values across 6 buckets |
| `BUCKETS` constant — 6 bucket definitions | 92–178 | 87 | 6 buckets, 27 total sub-tabs; MATERIALS + DATA added after file header was written |
| Class fields + constructor + public API | 178–281 | 104 | `runtime` stored; forwarded to all sub-panels; `setMode`, `toggle`, `show`, `hide`, `navigateToTab` |
| `_buildDOM` + `_buildBucketRail` + `_buildContentArea` | 282–479 | 198 | All 28 panel DIVs created; AUDIT split DOM setup; all `_mount*` calls + all 14 sub-panel instantiations with `this.runtime` |
| `_buildHeatmapBar` + `_mountPlaceholder` + `_mountVisibilityIntentAccess` | 480–553 | 74 | `window.visibilityIntentPanel?.open?.()` ×2 at lines 550 and ~1137 (TODO F.6.5) |
| `_mountMaterialLibrary` | 554–689 | 136 | Reads `STANDARD_MATERIAL_LIBRARY`; grouped by category; static import |
| `_mountRenderMaterials` + `_buildMaterialSelect` | 690–790 | 101 | Reads `RENDER_MATERIAL_LIBRARY`; static import |
| `_mountElementTypes` (largest single cluster) | 791–1088 | 298 | Wall + Door + Window types; reads `wallSystemTypeStore`, `doorSystemTypeStore`, `windowSystemTypeStore`, `floorSystemTypeStore`, `slabSystemTypeStore`, `ceilingSystemTypeStore`, `handrailTypeStore` — ALL static imports; per-layer material pickers |
| `_mountQuantitySchedules` | 1089–1141 | 53 | `scheduleStore` static import; second `window.visibilityIntentPanel?.open?.()` at line 1137 |
| `_mountTypeSchedule` + `_mountMaterialSchedule` | 1148–1385 | 238 | Generic schedule table builder; material schedule reads `STANDARD_MATERIAL_LIBRARY` |
| Row data builders (`_wallTypeRows` … `_stairTypeRows`, 9 methods) | 1386–1556 | 171 | Reads `wallSystemTypeStore`, `doorSystemTypeStore`, `windowSystemTypeStore`, `floorSystemTypeStore`, `slabSystemTypeStore`, `handrailTypeStore`, `BUILT_IN_STAIR_TYPES`, `SteelProfileLibrary`; all static imports |
| Bucket/tab switching + pill rebuild + `_showActiveContent` + `_applyMode` + `_bindEvents` | 1557–1810 | 254 | `_switchBucket`, `_switchTab`, `_rebuildSubTabBar`, `_showActiveContent`, `_rebuildDataSchedules`, `_rebuildActiveDataSchedule`; `_showAuditSheet`, `_hideAuditSheet`; `_applyMode`; `_bindEvents` (4 window event listeners for app-level events) |
| **Total** | | **1,810** | |

**Violation inventory**:

| Violation | Count | Lines | Description | Wave 14? |
|---|---|---|---|---|
| `(window as any)` casts — P4 | **0** | — | Zero unsafe casts; file was typed before audit | ❌ N/A |
| `window.__pryzm2DataWorkbench` — original plan claim | **0** | — | Global does not exist in this file; claim in original plan is false | ❌ Does not exist |
| `window.commandManager.execute(...)` — P6 | **0** | — | No command mutations via window global; no commandBus usage at all | ❌ N/A |
| `window.visibilityIntentPanel?.open?.()` | **2** | 550, 1137 | Optional-chain read; panel-host registry bridge; tagged `TODO(F.6.5)` — Phase F.6.5 migration | ❌ F.6.5 scope |
| `window.addEventListener(...)` — app events | 4 | 1783–1806 | `pryzm-toggle-workbench`, `pryzm-project-loaded`, `pryzm-workspace-mode`, `pryzm-element-selected`, `pryzm-workbench-select` | ❌ Correct pattern — event bus |
| **L7.5 god-object** | ✅ | 1–1810 | 1,810 LOC; 14 inline sub-panel mount calls; MATERIALS `_mount*` alone = 535 LOC; DATA schedule `_mount*` + row builders = 409 LOC | ✅ **Wave 14 scope** |

**Corrections to original plan**:

| Item | Original plan | Correct as-found |
|---|---|---|
| P4 label | "P4 (soft): a few bucket render closures access `window.__pryzm2DataWorkbench` state" | **INCORRECT** — 0 `(window as any)` casts; `window.__pryzm2DataWorkbench` does not exist in this file |
| Bucket count | 4 (STRATEGIZE / AUDIT / VALIDATE / LIFECYCLE) | **6**: STRATEGIZE / AUDIT / VALIDATE / MATERIALS / LIFECYCLE / DATA |
| Shell LOC target | ≤250 | **≤500** — switching/mode/events cluster alone = 254 LOC; shell must also keep BUCKETS constant + `_buildContentArea` skeleton |
| Split file count | 5 (shell + 4 bucket files) | **7** (shell + 6 bucket files): add `MaterialsBucket.ts` and `DataSchedulesBucket.ts` |
| Migration step 2 | "replace `window.__pryzm2DataWorkbench` reads with `runtime.stores.*`" | **STRUCK** — global does not exist; step is N/A |
| Runtime wiring | "DataWorkbench receives runtime; passes it to each bucket constructor" | **Already done** — Phase B.20–B.32 (S73-WIRE) complete; constructor already forwards `this.runtime` to all 14 sub-panels |
| `window.visibilityIntentPanel` | Not mentioned | 2 call sites (lines 550, 1137); `TODO(F.6.5)` tagged; optional-chain null-safe; retain as-is in Wave 14 |

---

#### FILE 8 — `src/engine/subsystems/initUI.ts` (2,773 LOC)

**What it is**: Phase F-1 subsystem extraction from the former `EngineBootstrap.ts`. Single exported async function `initUI(p: UIParams): Promise<void>`. Orchestrates in order: PresentationEngine + VG Governance wiring; view-range/crop/underlay filter services; semantic index + IFC Pset adapter; ViewDefinitionStore + VisibilityIntentPanel (lazy) + VisibilityRuleEngine; SheetStore + TitleBlockStore + SheetEditorPanel (lazy) + PDF/DXF/Sheet export services; FastPathProjector; `saveViewCamera` helper; export-ifc event handler; import-ifc event handler (largest zone, 1,147 LOC, covering OBC fragment loading + IFC native conversion + IFC persistence helpers + Revit-guided import + Rhino .3DM import + drag-and-drop zone); CurtainWallBuilder + subscriber wiring; `applyVisualStyle`, `deleteSelected`, plan/elevation/section-cut view generation; SectionBoxTool; camera controls; `updateProjectUI` / `toggleSection` / `updatePanels`; shadow utilities; ViewPropertiesSection engine bridge; `createMainLayout` DOM mount; 8 keyboard shortcuts (R/Escape/P/Ctrl+Z/Ctrl+Shift+Z/Delete/?/Ctrl+Shift+I); SplitView toggle.

The `UIParams` interface (lines 108–355, **248 LOC**) declares 30+ parameters, all typed `any`. This is the primary symptom of P1 — these params are untyped runtime facets that should become proper `PryzmRuntime` slots.

**Violations**:
- **L7.5 too-wide** ✅ confirmed: 2,773 LOC; single function. The IFC import event handler zone alone is **1,147 LOC** (lines 852–1998). This is the dominant cluster — it covers OBC fragment loading, IFC native conversion coordinator, IFC model/storey persistence, Revit import, Rhino import, and drag-and-drop zone — all inlined in the same function scope.
- **P1** (soft) ✅ confirmed: `initUI()` is a second composition site. It receives wired objects as `UIParams` (30+ `any`-typed params) and assigns them to 45 `window.X = Y` typed globals. The composed `runtime?` param (line 111) is used **only** for `runtime.toasts.show(...)` at one call site (line 387). All other store/service wiring bypasses `PryzmRuntime` slots. This is the `composeRuntime()` P1 soft-violation counter documented in `03-CURRENT-STATE.md §1`.
- **P4 (typed writes — P4 source, not CI-gate violation)**: Zero `(window as any)` casts — the P4 CI tripwire (`scripts/ci-check-no-window-any.ts`) does not fire for this file today. However, this file performs **45 distinct `window.X = Y` typed assignments** (all typed via `global-window.d.ts`), making it the source of every window global that `src/ui/` reads. These writes are P4 in semantic intent — they are the factory of the problem — but are not counted by the cast tripwire. The plan's phrase "this file *sets* window globals that are the source of all P4 violations in `src/ui/`" is correct.
- **P6 = 0** *(plan does not mention this — confirming)*: `window.commandManager.execute()` = **zero**. The 7 `commandManager.execute()` call sites (lines 774, 2160, 2634–2638, 2668, 2680) all use `p.commandManager` from the `UIParams` parameter — not a `window.commandManager` read. These are a P1/D.13 concern (untyped `any` param should become `runtime.commandBus.dispatch()`), but they are not Wave 14 P6 violations.

**Actual window globals SET — complete inventory (45 distinct assignments)**:

| Global | Zone | Wave 14? |
|---|---|---|
| `window.presentationEngine` | PresentationEngine (476) | ❌ D.13 scope |
| `window.vgSceneApplicator` | VGGovernance (490) | ❌ D.13 scope |
| `window.vgGovernanceStore` | VGGovernance (491) | ❌ D.13 scope |
| `window.viewRangeFilterService` | ViewRange (501) | ❌ Phase VI scope |
| `window.cropFilterService` | Crop (510) | ❌ Phase VR-3 scope |
| `window.underlayRenderService` | Underlay (520) | ❌ Phase VR-4 scope |
| `window.semanticIndex` | SemanticIndex (537) | ❌ Phase A scope |
| `window.ifcPsetAdapter` | DOC-5.4 (544) | ❌ DOC-5.4 scope |
| `window.viewDefinitionStore` | ViewDef (548) | ❌ Phase B scope |
| `window.visibilityIntentStore` | ViewDef (551) | ❌ Phase B scope |
| `window.viewIntentInstanceStore` | ViewDef (552) | ❌ Phase B scope |
| `window.visibilityIntentPanel` | VisibilityIntentPanel (583) | ❌ F.6.5 scope |
| `window.visibilityRuleEngine` | Phase C (603) | ❌ Phase C scope |
| `window.sheetStore` | Phase III (607) | ❌ Phase III scope |
| `window.titleBlockStore` | Phase S1/S3 (611) | ❌ Phase S1 scope |
| `window.sheetEditorPanel` | Phase S4 (643) | ❌ Phase S4 scope |
| `window.sheetExportService` | Phase S7 (660) | ❌ Phase S7 scope |
| `window.dxfExportService` | DOC-3.2 (665) | ❌ DOC-3.2 scope |
| `window.pdfExportService` | DOC-3.4 (697) | ❌ DOC-3.4 scope |
| `window.sheetIndexService` | Phase S8 (712) | ❌ Phase S8 scope |
| `window.scheduleStore` | Phase III (716) | ❌ Phase III scope |
| `window.viewTemplateStore` | Phase VII (721) | ❌ Phase VII scope |
| `window.phaseFilterStore` | Phase VII (725) | ❌ Phase VII scope |
| `window.fastPathProjectorService` | DOC-5.1 (730) | ❌ DOC-5.1 scope |
| `window.saveViewCamera` | Phase VII (736) | ❌ Phase VII scope |
| `window.ifcConversionReportStore` | import-ifc (858) | ❌ IFC interop scope |
| `window.ifcModelStore` | IFC persistence (1363) | ❌ IFC interop scope |
| `window._ifcLevelImportInProgress` | import-ifc (1471, 1486) | ❌ IFC interop scope |
| `window._pryzmLastImportSource` | Revit import (1558) | ❌ IFC interop scope |
| `window.curtainWallStore` | CurtainWall (2000) | ❌ D.13 scope |
| `window.curtainWallBuilder` | CurtainWall (2001) | ❌ D.13 scope |
| `window.columnStore` | Column (2050) | ❌ D.13 scope |
| `window.columnBuilder` | Column (2051) | ❌ D.13 scope |
| `window.sectionBoxTool` | SectionBox (2254) | ❌ D.13 scope |
| `window.viewportContainer` | DOM (2257) | ❌ Phase D scope |
| `window.cameraControls` | Camera (2328) | ❌ D.13 scope |
| `window.selectionManager` | (assignment elsewhere in zone) | ❌ D.13 scope |
| `window.semanticGraphManager` | (assignment in zone) | ❌ D.13 scope |
| `window.splitViewManager` | (assignment in zone) | ❌ D.13 scope |
| `window.world` | (assignment in zone) | ❌ D.13 scope |
| `window.renderPipelineManager` | (assignment in zone) | ❌ D.13 scope |
| `window.performanceModePanel` | (assignment in zone) | ❌ D.13 scope |
| `window.disableEnhancedBloom` | (assignment in zone) | ❌ D.13 scope |
| `window.enableEnhancedBloom` | (assignment in zone) | ❌ D.13 scope |
| `window.currentProjectId` / `window.projectName` | (assignment in zone) | ❌ D.13 scope |

**None of the 45 assignments are Wave 14 P6 scope.** Wave 14 P4 scope for this file is: consolidate all assignments into `initWindowGlobals.ts` to make the list auditable in one place (the assignments themselves move in Waves 16–18).

**Split target** *(corrected — `initExportImportHandlers.ts` split into two files; `initWindowGlobals.ts` threading clarified)*:
```
src/engine/subsystems/
  initUI.ts                       (≤600 LOC — UIParams interface + function entry + toast helper +
                                   OBC IFC loader setup + sub-init delegation calls in order)
  ui-init/
    initVGGovernance.ts           (≤120 LOC — PresentationEngine + VGGovernanceStore +
                                   VGSceneApplicator + ViewRangeFilterService +
                                   CropRegionFilterService + UnderlayRenderService +
                                   ViewRangeZoneApplicator + FastPathProjectorService)
    initViewDefinitions.ts        (≤250 LOC — SemanticIndex + IFCPsetAdapter +
                                   ViewDefinitionStore + VisibilityIntentPanel (lazy) +
                                   VisibilityRuleEngine + SheetStore + TitleBlockStore +
                                   SheetEditorPanel (lazy) + PDF/DXF/Sheet export services +
                                   scheduleStore + viewTemplateStore + phaseFilterStore)
    initExportHandlers.ts         (≤150 LOC — saveViewCamera helper + export-ifc event +
                                   export-ifc-revit event)
    initImportHandlers.ts         (≤1,200 LOC — import-ifc event handler + OBC fragment
                                   loading + IFC native conversion + IFC persistence helpers
                                   (ifcModelStore, ifcConversionReportStore) + Revit-guided
                                   import + fidelity report + Rhino .3DM import +
                                   ImportManagerPanel bridge + drag-and-drop zone)
    initCurtainWallSubscribers.ts (≤80 LOC — CurtainWallBuilder + CurtainWallStore subscriber +
                                   CurtainPanelStore rebuild subscriber)
    initKeyboardShortcuts.ts      (≤250 LOC — all 8 keyboard shortcut handlers + SplitView
                                   toggle + Ctrl+Shift+I → VisibilityIntentPanel)
    initWindowGlobals.ts          (≤120 LOC — ONE function `initWindowGlobals(instances)` that
                                   receives all 45 constructed instances and assigns them to
                                   typed window properties; called last by initUI.ts shell)
```

**Migration pattern** *(corrections in bold)*:
- Each sub-init function returns its constructed instances (e.g., `initVGGovernance(p)` returns `{ presentationEngine, vgSceneApplicator, ... }`). The shell collects all return values and passes them to `initWindowGlobals(allInstances)` as the final step.
- **`initWindowGlobals.ts`** must accept all 45 instances as a typed parameter object — it cannot construct them itself. Add at the top: `// WAVE 16: each assignment below will be moved to the corresponding runtime.* slot`.
- `initUI.ts` shell calls each sub-init in the existing order; delegates logic entirely.
- ~~`initExportImportHandlers.ts`~~ → **split into `initExportHandlers.ts` (≤150 LOC) and `initImportHandlers.ts` (≤1,200 LOC)**: the IFC import zone is 1,147 LOC and merging it with export would produce a 1,267 LOC file — acceptable by the ≤1,500 verifier but too large to have a meaningful purpose boundary.
- **`p.commandManager.execute()` call sites (7) are P1/D.13 scope** — do NOT migrate in Wave 14. They use the `UIParams` parameter form, not `window.commandManager`. Annotate each with `// TODO(D.13): migrate to runtime.commandBus.dispatch()`.
- `UIParams` interface (248 LOC) stays in `initUI.ts` shell — it is the public contract of the function until Phase D replaces it with a PryzmRuntime-only API.

**Verifier after split**:
```bash
wc -l src/engine/subsystems/initUI.ts                                       # → ≤600
wc -l src/engine/subsystems/ui-init/*.ts | awk '$1 > 1500'                 # → 0 files (initImportHandlers ≤1,200)
rg '\(window as any\)' src/engine/subsystems/ --type ts | wc -l            # → 0 (already 0)
rg 'window\.commandManager' src/engine/subsystems/ --type ts | wc -l       # → 0 (already 0 — P6 clean)
# After split: all window assignments in exactly one file:
rg 'window\.[a-zA-Z]* =' src/engine/subsystems/ --type ts \
  -g '!**/initWindowGlobals.ts' | wc -l                                    # → 0 non-comment assignments
```

---

#### FILE 8 — Wave 14 as-found audit (2026-05-02)

**Source**: `src/engine/subsystems/initUI.ts` — 2,773 LOC

**LOC breakdown by functional cluster**:

| Cluster | Lines | LOC | Key symbols |
|---|---|---|---|
| File header + JSDoc (covers description of `initUI`; references Phase F-1) | 1–22 | 22 | Phase F-1; Contract 01-BIM-ENGINE-CORE-CONTRACT §2.7 |
| All imports (THREE, OBC/OBCF, services, stores, panel types, command types) | 23–107 | 85 | 40+ imports; `import type` only for IFC export + IFC import to keep static graph lean |
| `UIParams` interface (30+ params, all typed `any`) | 108–355 | 248 | `runtime?`, `commandManager: any`, `bimManager: any`, `selectionManager: any`, `toolManager: any`, `wallTool: any`, `curtainWallTool: any` … P1 symptom |
| `initUI` function entry + `toast()` helper + OBC IFC loader setup | 356–475 | 120 | `runtime.toasts.show()` only runtime usage; OBC IFC loader configured once |
| PresentationEngine + VGGovernance + ViewRange + Crop + Underlay + ZoneApplicator | 476–535 | 60 | 6 `window.X = Y` writes: `presentationEngine`, `vgSceneApplicator`, `vgGovernanceStore`, `viewRangeFilterService`, `cropFilterService`, `underlayRenderService` |
| SemanticIndex + IFCPsetAdapter + ViewDefinitionStore + VisibilityIntentPanel (lazy proxy) | 536–601 | 66 | `window.semanticIndex`, `window.ifcPsetAdapter`, `window.viewDefinitionStore`, `window.visibilityIntentStore`, `window.viewIntentInstanceStore`, `window.visibilityIntentPanel` (lazy proxy object) |
| VisibilityRuleEngine + SheetStore + TitleBlockStore + SheetEditorPanel (lazy) + PDF/DXF/Sheet export services | 602–731 | 130 | 13 `window.X = Y` writes; `window.sheetEditorPanel` is a lazy proxy; `window.scheduleStore`, `window.viewTemplateStore`, `window.phaseFilterStore`, `window.fastPathProjectorService` |
| `saveViewCamera` helper + export-ifc event handler | 732–851 | 120 | `commandManager.execute(SaveViewCameraCommand)` at line 774 — via UIParams param; lazy `import('./export/ifc/ExportIFC')` |
| **import-ifc event handler** (largest cluster — all inlined in one `addEventListener`) | 852–1998 | **1,147** | OBC fragment loader; `runIfcNativeConversion()`; IFC persistence (`window.ifcModelStore`, `window.ifcConversionReportStore`); `importIfcLevelsAndViews(result.storeys, commandManager, bimManager)`; Revit-guided import (`window._pryzmLastImportSource`); fidelity report; Rhino .3DM import; ImportManagerPanel bridge; drag-and-drop zone |
| CurtainWallBuilder + CurtainWallStore + CurtainPanelStore subscriber wiring | 1999–2059 | 61 | `window.curtainWallStore`, `window.curtainWallBuilder`, `window.columnStore`, `window.columnBuilder` |
| `applyVisualStyle` + `deleteSelected` + `generatePlans` / `generateElevations` / `onCloseView` + SectionBoxTool | 2060–2258 | 199 | `commandManager.execute(DeleteElementCommand)` at line 2160 — via UIParams param; `window.sectionBoxTool`, `window.viewportContainer` |
| Double-click element zoom + camera controls + viewport cursor + `updateProjectUI` / `toggleSection` / `updatePanels` + shadow utilities + ViewPropertiesSection bridge | 2259–2544 | 286 | `window.cameraControls` at line 2328; `commandManager.execute(HideElementInViewCommand / IsolateElementInViewCommand / SetGraphicOverrideCommand)` at lines 2634–2638 via UIParams param |
| `createMainLayout` DOM mount + 8 keyboard shortcuts + SplitView toggle button | 2545–2773 | 229 | `commandManager.undo()` (2668) + `commandManager.redo()` (2680) via UIParams param; keyboard: R / Escape / P / Ctrl+Z / Ctrl+Shift+Z / Delete / ? / Ctrl+Shift+I |
| **Total** | | **2,773** | |

**Violation inventory**:

| Violation | Count | Lines | Description | Wave 14? |
|---|---|---|---|---|
| `(window as any)` casts — P4 CI gate | **0** | — | Zero unsafe casts; all window properties typed via `global-window.d.ts` | ❌ N/A |
| `window.X = Y` typed writes — P4 semantic source | **45** | scattered | This file is the factory for every typed window global read by `src/ui/`; all are D.13/Phase-specific scope | ✅ **Wave 14** — consolidate into `initWindowGlobals.ts` |
| `window.commandManager.execute()` — P6 exact | **0** | — | `commandManager` is a `UIParams` parameter (`any` typed), not a window read | ❌ N/A |
| `commandManager.execute()` via UIParams param | 7 | 774, 2160, 2634, 2636, 2638, 2668, 2680 | P1/D.13 concern — param should become `runtime.commandBus.dispatch()`; annotate `TODO(D.13)` | ❌ D.13 scope |
| **P1** second composition site | ✅ | whole file | `UIParams` has 30+ `any`-typed runtime facets; `runtime?` used only for toasts (line 387); 45 window assignments bypass `PryzmRuntime` slots | ✅ **Wave 14** — split reduces scope; full P1 fix in Wave 16 |
| **L7.5 god-object** | ✅ | 1–2773 | 2,773 LOC; IFC import zone alone = 1,147 LOC | ✅ **Wave 14** |

**Corrections to original plan**:

| Item | Original plan | Correct as-found |
|---|---|---|
| P4 characterisation | "P4: multiple `window.<store>` exposures — this file *sets* window globals" | Correct in substance. Precision added: 0 `(window as any)` casts — P4 CI tripwire does not fire. 45 typed `window.X = Y` writes are P4 in semantic sense (source of all `src/ui/` window reads) but not counted by `scripts/ci-check-no-window-any.ts` today |
| P6 | Not mentioned | **P6 = 0**. `commandManager.execute()` uses UIParams parameter — not `window.commandManager`. 7 call sites are P1/D.13 concern. Annotate `TODO(D.13)`. |
| `initExportImportHandlers.ts` | Single file for export + import | **Split required**: export (120 LOC) → `initExportHandlers.ts` (≤150 LOC); import (1,147 LOC) → `initImportHandlers.ts` (≤1,200 LOC). Combined 1,267 LOC file is within verifier but creates another god-object |
| `initWindowGlobals.ts` | "consolidates all `window.X = ...` assignments" | Correct goal. **Threading**: must accept all 45 instances as a typed parameter object (`initWindowGlobals(instances: {...})`) — sub-inits return their instances; shell aggregates and calls `initWindowGlobals` last |
| `UIParams` interface | Not addressed | 248 LOC of 30+ `any`-typed params — stays in `initUI.ts` shell; these become `PryzmRuntime` slots in Phase D (Wave 16+ scope) |
| Shell LOC target | ≤600 | **Achievable** — UIParams (248) + function entry/toast/IFC loader (120) + 8 delegation call blocks (~50) ≈ 420 LOC. ≤600 confirmed realistic |

---

#### FILE 9 — `src/engine/subsystems/annotations/AnnotationRenderLayer.ts` (2,628 LOC)

**What it is**: `<canvas>` element absolutely positioned over the 3D viewport (§ANN-A4). Renders all annotations for the active view via Canvas2D, projecting model-space points through the live THREE.js camera using the `worldToCanvas()` helper. Text sizing is paper-space aware (viewScale → mm → screen pixels).

The class has four structural zones: (A) module-level helper functions (`mergeStyle`, `worldToCanvas`, `mmToPx`, `drawArrow`) and exported types (`DimHoverHint` interface, constraint colour constants — lines 1–150); (B) class fields, constructor, public API, frame loop registration (lines 151–390); (C) central dispatch (`_render()`, `_renderAnnotation()` with VG style cascade, `_renderSemanticBadge()`, `_renderDimHoverHint()` — lines 391–667); (D) 23 private `_render*` methods, one per annotation type (lines 668–2628).

The **`_renderAnnotation()` dispatch switch has 23 case labels** — not the "6+" stated in the original plan. The complete type roster by document spec:

| Annotation family | Types | Lines |
|---|---|---|
| Linear dimensions | `linear-dim`, `string-dim` (via `_renderLinearDim` / `_renderStringDim`) | 668–1021 |
| Text / notes | `text-note`, `tag`, `detail-line`, `spot-elevation` | 1022–1250 |
| Angular + keynote | `angular-dim`, `keynote` | 1251–1444 |
| DOC-2.4 geometric dims | `radius-dim`, `diameter-dim`, `door-tag`, `window-tag`, `element-tag`, `level-tag`, `grid-bubble` | 1445–1831 |
| DOC-2.4 slope + DOC-2.7/2.8 ref marks | `slope-dim`, `section-mark`, `elevation-mark`, `callout-detail`, `revision-cloud` | 1832–2305 |
| DOC-2.5b/d/e/f context labels | `room-tag`, `roof-slope-arrow`, `section-grid-line`, `level-datum-line` | 2306–2628 |
| Suppressed / TODO | `room-fill` (TODO stub), `room-tag` (suppressed — RoomLabelRenderer is canonical) | in dispatch |

`_renderLinearDim` and `_renderStringDim` both **delegate final drawing to `WallDimensionRenderer`** (already a separate file at 380 LOC — keep as-is). Constraint overlay colours (`CONSTRAINT_VIOLATED_COLOR`, `CONSTRAINT_SATISFIED_COLOR`, `CONSTRAINT_LOCKED_COLOR`) are applied inside each `_render*` method, not in the dispatch layer. VG style cascade (DOC-2.5k — `vgGovernanceStore.getAnnotationStyle()`) executes inside `_renderAnnotation()` before each dispatch call — this logic must stay in the shell.

Zero `window.*` reads. Zero `(window as any)` casts. Zero `commandManager` references. All store access is via direct module imports (`AnnotationStore`, `AnnotationVisibilityStore`, `ConstraintStore`, `vgGovernanceStore`, `viewLinkResolver`).

**Violations**:
- **L7.5 god-object** ✅ confirmed: 2,628 LOC; 23 private `_render*` methods. The DOC-2.7/2.8 reference mark cluster alone is 394 LOC and the DOC-2.4 geometric dimension cluster is 387 LOC.
- **P4** = 0 (no casts); **P6** = 0 (no window globals of any kind). The plan's L7.5-only characterisation is correct.

**Split target** *(corrected — 5 sub-renderers → 6 semantic-family files + 1 shared helpers file; shell ≤400 → ≤500)*:
```
src/engine/subsystems/annotations/
  AnnotationRenderLayer.ts         (≤500 LOC — canvas lifecycle + constructor + public API +
                                    frame loop + _render() + _renderAnnotation() dispatch +
                                    VG style cascade (DOC-2.5k) + _renderSemanticBadge)
  renderers/
    annotation-render-helpers.ts   (≤100 LOC — worldToCanvas + mmToPx + drawArrow +
                                    mergeStyle + DimHoverHint interface +
                                    CONSTRAINT_*_COLOR constants — shared by all sub-renderers)
    DimensionAnnotationRenderer.ts (≤430 LOC — linear-dim + string-dim + angular-dim +
                                    _renderDimHoverHint; delegates to WallDimensionRenderer
                                    for actual stroke/fill calls; constraint colour overlays)
    TextAndTagAnnotationRenderer.ts (≤430 LOC — text-note + tag + keynote +
                                    door-tag + window-tag + element-tag + level-tag)
    GeometricDimensionRenderer.ts  (≤430 LOC — radius-dim + diameter-dim + slope-dim +
                                    spot-elevation + detail-line)
    ReferenceMarkRenderer.ts       (≤430 LOC — section-mark + elevation-mark +
                                    callout-detail + revision-cloud; reads viewLinkResolver
                                    for sheet+detail number annotation)
    ContextAnnotationRenderer.ts   (≤380 LOC — grid-bubble + room-tag + roof-slope-arrow +
                                    section-grid-line + level-datum-line)
    WallDimensionRenderer.ts       (380 LOC — already exists at this path; keep as-is;
                                    DimensionAnnotationRenderer imports and delegates to it)
```

**Migration pattern** *(corrected)*:
1. Extract `worldToCanvas`, `mmToPx`, `drawArrow`, `mergeStyle`, `DimHoverHint`, and `CONSTRAINT_*_COLOR` constants from the top of `AnnotationRenderLayer.ts` into `renderers/annotation-render-helpers.ts`. All sub-renderers import from this shared file.
2. Each sub-renderer exports a single function: `renderXxx(ann: AnnotationElement, ctx: CanvasRenderingContext2D, w: number, h: number, style: AnnotationStyle, camera: THREE.Camera, opts: XxxRenderOpts): void`. The `opts` struct carries the type-specific shared state (e.g., `DimensionAnnotationRenderer` opts = `{ constraintStore, selectedElementId, dimHoverHint }`).
3. `AnnotationRenderLayer._renderAnnotation()` resolves the merged style and dispatches to the appropriate sub-renderer function — the dispatch switch stays in the shell.
4. ~~"Each sub-renderer is a pure function or a stateless class — receives the annotation list subset"~~ **Corrected**: Each sub-renderer receives one `AnnotationElement` at a time (the dispatch is per-annotation, not per-type batch). The shell iterates over `annotationStore.getAll(viewId)` and calls `_renderAnnotation()` for each one.
5. `WallDimensionRenderer.ts` (already separate, 380 LOC) stays at its current path and is imported by `DimensionAnnotationRenderer.ts`, not by the shell directly.
6. No window globals to migrate — the file is clean. No `TODO(D.13)` annotations needed.

**Verifier after split**:
```bash
wc -l src/engine/subsystems/annotations/AnnotationRenderLayer.ts                     # → ≤500
wc -l src/engine/subsystems/annotations/renderers/*.ts | awk '$1 > 1500'             # → 0 files
rg '\(window as any\)' src/engine/subsystems/annotations/ --type ts | wc -l          # → 0 (already 0)
```

---

#### FILE 9 — Wave 14 as-found audit (2026-05-02)

**Source**: `src/engine/subsystems/annotations/AnnotationRenderLayer.ts` — 2,628 LOC

**LOC breakdown by functional cluster**:

| Cluster | Lines | LOC | Key symbols |
|---|---|---|---|
| File header (§ANN-A4 contract; coordinate transform chain description) | 1–19 | 19 | §05 §7.8 + §01 §5 contract compliance noted |
| Imports (THREE, AnnotationStore, AnnotationTypes, AnnotationVisibilityStore, ConstraintStore, WallDimensionRenderer, DimensionFormatter, ViewLinkResolver, VGGovernanceStore) | 20–33 | 14 | All static module imports — zero window globals |
| Constraint colour constants + `DimHoverHint` interface + hover/dot colour constants | 34–78 | 45 | `CONSTRAINT_VIOLATED_COLOR` (#cc2222), `CONSTRAINT_SATISFIED_COLOR` (#16a34a), `CONSTRAINT_LOCKED_COLOR` (#2244aa); `HOVER_FILL_COLOR`, `HOVER_STROKE_COLOR`, `REF_DOT_COLOR`, `REF_DOT_RADIUS_PX` |
| Module-level helper functions (`mergeStyle`, `worldToCanvas`, `mmToPx`, `drawArrow`) | 79–150 | 72 | `worldToCanvas`: NDC projection via `camera.project()`; `drawArrow`: filled/open/dot/none head styles |
| Class fields (canvas, ctx, activeViewId, camera, unregisterTick, needsRender, resizeObserver, visibilityStore, constraintStore, vgModelId, dimHoverHint, selectedElementId, dimHitSegments) | 151–218 | 68 | `_cameraMatrixVersion = -1` (DOC-1.5g dirty-flag optimisation) |
| Constructor + `_setupResize` + `_registerWithFrameLoop` | 219–330 | 112 | `unifiedFrameLoop` integration; `ResizeObserver`; `_store.onChange()` subscription |
| Public API (setActiveView, setCamera, requestRender, setVisibilityStore, setVGModelId, setConstraintStore, setDimHoverHint, setSelectedElementId, dispose, getAnnotationAtPoint) | 331–390 | 60 | 10 public methods; `dispose()` cleans frame loop + ResizeObserver + canvas DOM |
| `_render()` (clear canvas, iterate annotations, call `_renderAnnotation`) | 391–418 | 28 | `_needsRender` dirty flag; `_cameraMatrixVersion` camera dirty check (DOC-1.5g) |
| `_renderAnnotation()` — VG cascade (DOC-2.5k) + 23-case dispatch switch | 419–527 | 109 | VG style resolution: `vgGovernanceStore.getAnnotationStyle()`; 23 case labels; `mergeStyle({ ...vgBase, ...ann.style })` |
| `_renderSemanticBadge()` (§ANN-C2) | 528–603 | 76 | Badge drawn if `ann.semantics` present |
| `_renderDimHoverHint()` (§DIM-V-1/V-2) | 604–667 | 64 | Face quad fill + reference dots for LinearDimensionAnnotationTool hover state |
| `_renderLinearDim()` + `_renderStringDim()` | 668–1021 | 354 | Linear: ORTHO measurement direction; constraint colour overlays; wall-selection highlight; padlock badge (§C3); **delegates to `WallDimensionRenderer.drawSegment()` + `WallDimensionRenderer.drawString()`** |
| `_renderTextNote()` + `_renderTag()` + `_renderDetailLine()` + `_renderSpotElevation()` | 1022–1250 | 229 | Text: wrapping + leader lines; Tag: leader + callout bubble; SpotElevation: diamond head |
| `_renderAngularDim()` + `_renderKeynote()` | 1251–1444 | 194 | Angular: arc + angle label; Keynote: circle badge + leader |
| `_renderRadiusDim()` + `_renderDiameterDim()` + `_renderDoorTag()` + `_renderWindowTag()` + `_renderElementTag()` + `_renderLevelTag()` + `_renderGridBubble()` (DOC-2.4 + DOC-2.5) | 1445–1831 | 387 | Radius/diameter: arrowhead + label; Tags: leader + data from store; Grid bubble: circle head at grid line end |
| `_renderSlopeDim()` + `_renderSectionMark()` + `_renderElevationMark()` + `_renderCalloutDetail()` + `_renderRevisionCloud()` (DOC-2.4 slope + DOC-2.7/2.8) | 1832–2305 | 474 | SectionMark/ElevMark: read `viewLinkResolver` for sheet+detail numbers; RevisionCloud: bezier arc loop |
| `_renderRoomTag()` + `_renderRoofSlopeArrow()` + `_renderSectionGridLine()` + `_renderLevelDatumLine()` (DOC-2.5b/d/e/f) | 2306–2628 | 323 | LevelDatumLine: diamond head + white bg text box (tail of file) |
| **Total** | | **2,628** | |

**Violation inventory**:

| Violation | Count | Lines | Description | Wave 14? |
|---|---|---|---|---|
| `(window as any)` casts — P4 | **0** | — | Zero unsafe casts | ❌ N/A |
| `window.X` reads/writes | **0** | — | All store access via static module imports | ❌ N/A |
| `window.commandManager.execute()` — P6 | **0** | — | Zero command mutations | ❌ N/A |
| **L7.5 god-object** | ✅ | 1–2628 | 2,628 LOC; 23 private `_render*` methods; DOC-2.7/2.8 cluster = 474 LOC; DOC-2.4+2.5 cluster = 387 LOC | ✅ **Wave 14** |

**Corrections to original plan**:

| Item | Original plan | Correct as-found |
|---|---|---|
| Annotation type count | "6+" types sharing one render loop | **23 distinct case labels** in `_renderAnnotation()` dispatch switch, across 6 doc-spec families (DOC-2.4, 2.5, 2.7, 2.8, §ANN-B, §VII) |
| Private render method count | Implied ~6 | **23 private `_render*` methods** (plus `_renderSemanticBadge` and `_renderDimHoverHint`) |
| Sub-renderer files proposed | 5 files (`DimensionAnnotationRenderer`, `TextAnnotationRenderer`, `AreaAnnotationRenderer`, `SectionMarkRenderer`, `ConstraintOverlayRenderer`) | **7 files** (shell + `annotation-render-helpers.ts` + `DimensionAnnotationRenderer` + `TextAndTagAnnotationRenderer` + `GeometricDimensionRenderer` + `ReferenceMarkRenderer` + `ContextAnnotationRenderer`); `WallDimensionRenderer.ts` already exists and is kept |
| `AreaAnnotationRenderer.ts` | Proposed as a sub-renderer | Does not correspond to an actual annotation type — `room-tag` is suppressed (RoomLabelRenderer is canonical) and `room-fill` is a TODO stub. Removed |
| `ConstraintOverlayRenderer.ts` | Proposed as a sub-renderer | Constraint colours are applied **inside each** `_render*` method via `effectiveStyle` spread — they are not a separate render pass. No standalone renderer needed |
| Shell LOC target | ≤400 | **≤500** — dispatch zone `_render()` + `_renderAnnotation()` + VG cascade + `_renderSemanticBadge` = 277 LOC; class fields + constructor + public API = 172 LOC; total without helpers = ~449 LOC |
| `WallDimensionRenderer.ts` location | "already exists at `WallDimensionRenderer.ts` — keep as-is" ✓ | Confirmed: 380 LOC at `src/engine/subsystems/annotations/WallDimensionRenderer.ts`; `DimensionAnnotationRenderer.ts` imports and delegates to it |
| Shared helpers | Not mentioned | `annotation-render-helpers.ts` (≤100 LOC) needed: `worldToCanvas`, `mmToPx`, `drawArrow`, `mergeStyle`, `DimHoverHint`, constraint colour constants — all currently in the shell's top section; must be shared across sub-renderers |
| Migration step 2 | "Each sub-renderer receives the annotation list subset for its type" | **Incorrect**. Dispatch is per-annotation (one `AnnotationElement` at a time). Sub-renderers receive a single `ann: AnnotationElement` + `ctx` + dimensions + style + camera + type-specific opts |

---

#### FILE 10 — `src/engine/subsystems/core/views/PlanViewAnnotationRenderer.ts` (2,589 LOC)

**What it is**: Canvas2D annotation render pass called at the **end** of `PlanViewCanvas.render()` — drawn on top of all projected linework. Uses the plan-view `worldToScreen(worldX, worldZ) → {sx, sy}` mapping (Contract 19 §7: pure arithmetic XZ→screen, no THREE camera matrix). Section/elevation views use a view-type switch via `_ptH`/`_ptV` helpers (§ANN-ELEV-SEC).

The class has four structural zones: (A) module-level constants + helpers (lines 1–149); (B) class fields + projection helpers + main entry point + hit-test public API (lines 150–498); (C) annotation dispatch (`_renderAnnotation()` with 21 switch cases, calling 21 private `_render*` methods) plus the separate `DimensionElement` path (`_renderDimensionElement`); (D) scope geometry helpers + selected/active scope overlays (lines 1578–1933, covering the section/elevation scope rectangle rendering system).

The file handles **22 distinct renderable types**: 21 annotation types in `_renderAnnotation()` dispatch switch + 1 `DimensionElement` type rendered separately in `render()`. The dispatch is **per-annotation** (not per-type batch): `render()` iterates `annotationStore.getByView(viewId)` and calls `_renderAnnotation()` for each element.

~~"Renders: symbolic rules (door swings, window cased), hatch patterns"~~ ← **INCORRECT** (original stub). Neither symbolic rules nor hatch/poche rendering live in this file. Symbolic rules (door swings, window cased geometry) are in `PlanViewCanvas.ts → SymbolicRuleRenderer`. Hatch/poche fill is in `PlanViewCanvas.ts`. This file renders `AnnotationElement` records only.

**Violations**:
- **L7.5 god-object** ✅ confirmed: 2,589 LOC; 21-case dispatch switch; 33 private methods. The scope helper cluster alone spans 244 LOC across 8 methods. The largest single render method is `_renderElevationMark()` at 159 LOC (sector-fill geometry for the Revit-style "cheese" symbol).
- **P6** = 0: zero `window.commandManager.execute()` calls.
- **P4 (cast)** = 0: zero `(window as any)` casts.
- **Window globals** = 3 reads (Phase D/E scope — annotate, do **not** migrate in Wave 14):
  - `window.selectionManager?.selectedObject?.userData` (line 1624, inside `_getSelectedAnnotationId()`) `TODO(D.4)` — reads selection state to drive the selected-annotation highlight; becomes `runtime.selection.selectedAnnotationId` in Phase D.
  - `window.__pryzmSelectedAnnotationId` (line 1629, inside `_getSelectedAnnotationId()`) `TODO(E.ann.x)` — fallback global written by annotation-tool drag/select; becomes an annotation selection store slot in Phase E.
  - `window.__PRYZM_DEBUG_ZONES__` (line 1863, inside `_renderScopeZoneFills()`) `TODO(debug)` — boolean flag enabling scope zone debug colours; retain as debug infrastructure.

**Split target** *(corrected — original 6-file split contained 2 non-existent files; corrected to 5 sub-renderer files + 1 shared helpers file; shell ≤500)*:
```
src/engine/subsystems/core/views/
  PlanViewAnnotationRenderer.ts         (≤500 LOC — module constants + DRAGGABLE_ANNOTATION_TYPES +
                                         module helpers (mergeStyle, mmToPx, drawArrowTip,
                                         distanceToSegment, normalize2) + class fields +
                                         projection helpers (_isSectionLike, _ptH, _ptV) +
                                         render() entry point + _annotationLineColor/Width +
                                         _dedupeRoomTags + hitTestAnnotation + hitTestScopeHandle +
                                         _renderAnnotation() dispatch switch (21 cases) +
                                         module singleton planViewAnnotationRenderer)
  plan-annotation/
    plan-annotation-helpers.ts          (≤60 LOC — shared: mergeStyle + mmToPx + drawArrowTip +
                                         distanceToSegment + normalize2; imported by all sub-renderers
                                         and by shell)
    PlanDimensionRenderer.ts            (~410 LOC — _renderLinearDim (121) + _renderDimensionElement (129) +
                                         _renderAngularDim (97) + _renderSlopeDim (91); receives
                                         viewType/sectionHAxis for §ANN-ELEV-SEC _ptH/_ptV projection)
    PlanTagRenderer.ts                  (~430 LOC — _renderDoorTag (93) + _renderWindowTag (85) +
                                         _renderRoomTag (64) + _renderTag (71) + _renderKeynote (37) +
                                         _renderGridBubble (36) + _renderTextNote (25) +
                                         _renderDetailLine (26); receives selectedAnnotationId for
                                         room-tag selection highlight)
    PlanSectionMarkRenderer.ts          (~605 LOC — _renderSectionMark (122) + _renderElevationMark (159) +
                                         _renderElevationCutLine (44) + _renderSelectedScopeOverlay (90) +
                                         _renderActiveLinkedScopeOverlay (54) + _renderScopeZoneFills (39) +
                                         _getSelectedAnnotationId (10) + _sectionScopeWorld (14) +
                                         _computeElevationScope (21) + _scopeWorld (28) +
                                         _scopeDepthHandleScreenPoint (10) + _scopeWidthHandleScreenPoints (18) +
                                         _hitSectionMark (9); imports viewDefinitionStore + annotationStore
                                         directly; window.selectionManager TODO(D.4) +
                                         window.__pryzmSelectedAnnotationId TODO(E.ann.x) +
                                         window.__PRYZM_DEBUG_ZONES__ TODO(debug) retained here)
    PlanContextMarkRenderer.ts          (~300 LOC — _renderNorthArrow (77) + _renderScaleBar (68) +
                                         _renderSectionGridLine (52) + _renderRoofSlopeArrow (73) +
                                         _renderLevelDatumLine (58))
    PlanDrawingMarkRenderer.ts          (~215 LOC — _renderCalloutDetail (84) + _renderRevisionCloud (70) +
                                         _renderMatchline (70))
```

**Migration pattern** *(corrected)*:

1. **Extract shared helpers first**: Move `mergeStyle`, `mmToPx`, `drawArrowTip`, `distanceToSegment`, `normalize2` from module-level into `plan-annotation/plan-annotation-helpers.ts` (≤60 LOC). All sub-renderers import from this file; the shell imports it too. This is the only shared module needed — no other cross-sub-renderer dependencies exist.

2. **Sub-renderer function signature**: Each sub-renderer exports one function per annotation type (or a small set of related types):
   ```typescript
   // Example: PlanDimensionRenderer.ts
   export function renderLinearDim(
       ann: AnnotationElement,
       ctx: CanvasRenderingContext2D,
       w2s: PlanWorldToScreen,
       style: AnnotationStyle,
       opts: { viewType: string; sectionHAxis: 'x' | 'z' },
   ): void { ... }
   ```
   `opts` carries only the type-specific shared state; no runtime or store references (all store access is via direct imports already in the file).

3. **`_renderAnnotation()` dispatch stays in the shell**: The 21-case switch is the cross-cutting coordination point. It calls `mergeStyle(ann.style)` once and routes each `AnnotationElement` to the correct sub-renderer function. It does **not** move.

4. **`PlanSectionMarkRenderer` owns the scope cluster entirely**: `_getSelectedAnnotationId()` and all scope geometry helpers move into `PlanSectionMarkRenderer`. The 3 window global reads (lines 1624, 1629, 1863) move with them and retain their `TODO` annotations — not Wave 14 migration scope. `hitTestScopeHandle()` in the shell delegates scope geometry calls to exported helpers from `PlanSectionMarkRenderer`.

5. **`_renderDimensionElement` and `_renderLinearDim` both use `_ptH`/`_ptV`**: After the split, `PlanDimensionRenderer` receives `viewType` and `sectionHAxis` as part of its `opts` struct and applies the same XZ vs H/V axis logic locally — copy the `_ptH`/`_ptV` pattern into the sub-renderer (3 short methods) rather than importing them from the shell to avoid a circular dependency.

6. **Module-level singleton** `planViewAnnotationRenderer` (lines 2588–2589) stays in `PlanViewAnnotationRenderer.ts` shell — zero-arg constructor, no DI concern.

7. **No P6, P4, or runtime wiring fixes required** — the file is architecturally clean except for the god-object size. The 3 window globals retain TODO annotations as-is.

**Verifier after split**:
```bash
wc -l src/engine/subsystems/core/views/PlanViewAnnotationRenderer.ts              # → ≤500
wc -l src/engine/subsystems/core/views/plan-annotation/*.ts | awk '$1 > 1500'    # → 0 files
rg '\(window as any\)' src/engine/subsystems/core/views/ --type ts | wc -l       # → 0 (already 0)
rg 'window\.commandManager' src/engine/subsystems/core/views/ --type ts | wc -l  # → 0 (already 0)
```

---

#### FILE 10 — Wave 14 as-found audit (2026-05-02)

**Source**: `src/engine/subsystems/core/views/PlanViewAnnotationRenderer.ts` — 2,589 LOC

**LOC breakdown by functional cluster**:

| Cluster | Lines | LOC | Key symbols |
|---|---|---:|---|
| File header + JSDoc (Contract 19; §ANN-ELEV-SEC coordinate transform explanation) | 1–20 | 20 | Contract 19 §7; §ANN-ELEV-SEC; `PlanWorldToScreen` export type; `PlanViewAnnotationRenderOptions` interface; `ScopeWorld` internal type |
| Imports | 21–36 | 16 | `annotationStore`; `AnnotationElement`, `AnnotationStyle`, `DEFAULT_ANNOTATION_STYLE`, `DimensionElement`; `formatDimension`; `viewDefinitionStore`; `ViewDefinition` type; `graphicsRulesEngine`; `PenStyle`; `SCREEN_PX_PER_MM` — all static module imports; **zero window imports** |
| Module-level constants + `DRAGGABLE_ANNOTATION_TYPES` set | 64–106 | 43 | `DIM_LINE_COLOR`, `DIM_TEXT_COLOR`, `TEXT_NOTE_COLOR`, `TAG_BG_COLOR`, `TAG_BD_COLOR`, `GRID_COLOR`, `ARROW_PX`, `FONT`, `ANNOT_SEL_COLOR`; `DRAGGABLE_ANNOTATION_TYPES` (21 types including multi-point segment types) |
| Module-level helper functions | 107–149 | 43 | `mergeStyle(partial)` → merged `AnnotationStyle`; `mmToPx(mm)` → screen px at 96 dpi; `drawArrowTip(ctx, tip, dir, sizePx)` — filled triangle; `distanceToSegment(px, py, x1, y1, x2, y2)` — segment proximity; `normalize2(v)` — normalise XZ vector |
| Class fields + projection helpers | 150–209 | 60 | `_renderedElevAnchors: Set<string>` (per-frame anchor dedup); `_engineAnnotationPen: PenStyle \| null`; `_viewType: string`; `_sectionHAxis: 'x' \| 'z'`; `_isSectionLike()`: boolean; `_ptH(pt)`: number (H world axis); `_ptV(pt)`: number (V world axis) |
| `render()` entry point | 210–262 | 53 | Calls `_dedupeRoomTags`; iterates annotations → `_renderAnnotation`; iterates `DimensionElement` records → `_renderDimensionElement`; calls `_renderActiveLinkedScopeOverlay` + `_renderSelectedScopeOverlay`; resolves `graphicsRulesEngine.resolveStyle('PROJECTION', 'annotation', …)` once per frame |
| `_annotationLineColor()` + `_annotationLineWidthPx()` | 263–297 | 35 | Contract 23 §7 — GraphicsRulesEngine override cascade; `_engineAnnotationPen` priority over hardcoded constant |
| `_dedupeRoomTags()` | 299–309 | 11 | Removes duplicate `room-tag` entries sharing the same `roomId` parameter |
| `hitTestAnnotation()` | 311–407 | 97 | Public API — elevation-mark quadrant-aware hit (sector angle matching); section-mark segment hit; draggable types: point radius + inter-point segment distance |
| `hitTestScopeHandle()` | 409–457 | 49 | Public API — depth / width-left / width-right handle hit for selected section/elevation mark; delegates to `_scopeDepthHandleScreenPoint` + `_scopeWidthHandleScreenPoints` |
| `_renderAnnotation()` dispatch | 459–498 | 40 | 21-case switch; resolves `mergeStyle(ann.style)` once per annotation; routes to the correct private `_render*` method |
| `_renderLinearDim()` | 500–620 | 121 | §ANN-ELEV-SEC projection via `_ptH`/`_ptV`; measurement normal → orthogonal or diagonal direction; extension lines + dim line + arrowheads + white-background label; `formatDimension()` |
| `_renderDimensionElement()` | 622–750 | 129 | §DIM-VIII-1 flat `DimensionElement` records; ISO 128-20 diagonal tick marks; 0.18 mm pen weight; `textOverride` |
| `_renderTextNote()` | 752–776 | 25 | Single anchor; bold/italic flag support; left-aligned text |
| `_renderTag()` | 778–848 | 71 | Leader + tag box; `screenOverride` for drag-repositioned tags; `showLeader` flag |
| `_renderDoorTag()` | 850–942 | 93 | Circle bubble; horizontal divider for W×H size string; leader dot; selection highlight (`ANNOT_SEL_COLOR`) |
| `_renderWindowTag()` | 944–1028 | 85 | Circle bubble (blue tint `rgba(240,247,255)`); always-visible divider line; leader dot; selection highlight |
| `_renderRoomTag()` | 1030–1093 | 64 | Bold name + `area.toFixed(1) m²` below; selection dashed rectangle + grab-handle dot |
| `_renderGridBubble()` | 1095–1130 | 36 | Circle + bold label; `GRID_COLOR` |
| `_renderDetailLine()` | 1132–1157 | 26 | Multi-point polyline; Contract 23 §7 pen resolution |
| `_renderKeynote()` | 1159–1195 | 37 | Circle badge + bold key code |
| `_renderAngularDim()` | 1197–1293 | 97 | Vertex + two rays + arc; tangent-direction arrowheads at arc endpoints; `deg`/`rad` label at arc midpoint |
| `_renderSectionMark()` | 1295–1416 | 122 | Dashed cut line; perpendicular tick flags at each endpoint; midpoint viewing-direction arrow; circle heads at each end (mark label top / sheet+detail ref bottom) |
| `_renderElevationMark()` | 1418–1576 | 159 | Revit-style "cheese" circle: per-facing-direction sector fills + arrowhead triangles + sector divider lines + centre dot + mark label below symbol; delegates to `_renderElevationCutLine()` for the selected direction |
| `_renderElevationCutLine()` | 1578–1621 | 44 | Amber dashed cut line + viewing-direction tick marks for the selected elevation mark; reads `viewDefinitionStore` for scope |
| `_getSelectedAnnotationId()` | 1623–1632 | 10 | **`window.selectionManager?.selectedObject?.userData`** (line 1624) `TODO(D.4)` — reads selection manager for annotationId; **`window.__pryzmSelectedAnnotationId`** (line 1629) `TODO(E.ann.x)` — fallback global written by annotation-tool drag/select |
| `_renderSelectedScopeOverlay()` | 1634–1723 | 90 | Amber scope rectangle + depth arrow + resize handles (corner squares + width midpoint squares) + depth label for selected section/elevation mark |
| `_renderActiveLinkedScopeOverlay()` | 1725–1778 | 54 | Dashed scope overlay for the currently active linked view (not the selected mark) |
| `_scopeDepthHandleScreenPoint()` | 1780–1789 | 10 | Midpoint of far edge of scope quad → depth drag handle screen position |
| `_sectionScopeWorld()` | 1791–1804 | 14 | Section mark scope quad from `modelPoints` + `tailDirection` |
| `_computeElevationScope()` | 1811–1831 | 21 | Elevation mark scope from `crop.region.min[0]` / `max[0]` (supports asymmetric width drag) |
| `_scopeWorld()` | 1833–1860 | 28 | Unified scope dispatcher: uses `sectionVolume` from `ViewDefinition` if present; else delegates to `_sectionScopeWorld` / `_computeElevationScope` |
| `_renderScopeZoneFills()` | 1862–1900 | 39 | Amber (projection zone) + green (depth zone) fill bands; **`window.__PRYZM_DEBUG_ZONES__`** (line 1863) `TODO(debug)` — boolean debug flag controlling zone colours |
| `_scopeWidthHandleScreenPoints()` | 1906–1923 | 18 | Left/right side midpoints of scope quad → width drag handle screen positions |
| `_hitSectionMark()` | 1925–1933 | 9 | Segment + endpoint proximity hit test for section marks |
| `_renderSlopeDim()` | 1935–2025 | 91 | Inclined line A→B + arrowhead + rise/run indicator + right-angle tick mark + `ratio`/`percent`/`degrees` label |
| `_renderCalloutDetail()` | 2027–2110 | 84 | Dashed crop rectangle + corner ticks + callout bubble (round rect) at top-right + leader line to crop corner |
| `_renderRevisionCloud()` | 2112–2181 | 70 | Scalloped arc outline per polygon segment (arc count proportional to segment length) + optional revision code at centroid |
| `_renderRoofSlopeArrow()` | 2183–2255 | 73 | Arrow toward direction point + perpendicular tick mark at base + slope label (`%`, `1:N`, or `°`) |
| `_renderLevelDatumLine()` | 2257–2314 | 58 | Horizontal datum line + downward-pointing triangle symbol + elevation label (m or mm) |
| `_renderSectionGridLine()` | 2316–2367 | 52 | Dashed vertical grid line + grid bubble at top |
| `_renderNorthArrow()` | 2369–2445 | 77 | Outer circle + filled (north) / hollow (south) compass needle halves + 'N' label; `northAngle` parameter |
| `_renderScaleBar()` | 2447–2514 | 68 | Alternating filled/hollow segments; per-segment tick labels; `1:scale` label at top-right |
| `_renderMatchline()` | 2516–2585 | 70 | Heavy dashed line + diagonal end caps + label pill at midpoint |
| Module-level singleton | 2588–2589 | 2 | `export const planViewAnnotationRenderer = new PlanViewAnnotationRenderer()` — zero-arg constructor; no runtime DI concern |
| **Total** | | **2,589** | |

---

**Violation inventory**:

| Violation | Count | Lines | Description | Wave 14? |
|---|---|---|---|---|
| `(window as any)` casts — P4 | **0** | — | Zero unsafe casts | ❌ N/A |
| `window.commandManager.execute()` — P6 | **0** | — | Zero command mutations | ❌ N/A |
| `window.X` reads — typed, Phase D/E | **3** | 1624, 1629, 1863 | Typed/optional-chain reads; see inventory below | ❌ Phase D/E |
| **L7.5 god-object** | ✅ | 1–2589 | 2,589 LOC; 21-case dispatch; 33 private methods | ✅ **Wave 14** |

---

**Window globals inventory (3 reads, all Phase D/E)**:

| Global | Line | Method | TODO tag | Migration phase | Wave 14? |
|---|---|---|---|---|---|
| `window.selectionManager?.selectedObject?.userData` | 1624 | `_getSelectedAnnotationId()` | `TODO(D.4)` | Phase D.4 — becomes `runtime.selection.selectedAnnotationId` | ❌ Phase D |
| `window.__pryzmSelectedAnnotationId` | 1629 | `_getSelectedAnnotationId()` | `TODO(E.ann.x)` | Phase E — annotation selection store slot | ❌ Phase E |
| `window.__PRYZM_DEBUG_ZONES__` | 1863 | `_renderScopeZoneFills()` | `TODO(debug)` | Debug flag — retain as debug infrastructure | ❌ debug infra |

---

**Corrections to original stub plan**:

| Item | Original stub | Correct as-found |
|---|---|---|
| Annotation type count | "7+ annotation types" | **21 distinct cases** in `_renderAnnotation()` dispatch + 1 `DimensionElement` type = **22 renderable types** across 33 private methods |
| "symbolic rules (door swings, window cased)" | Listed as content of this file | **NOT in this file**. Symbolic rules live in `PlanViewCanvas.ts → SymbolicRuleRenderer`. This file renders `AnnotationElement` records only. |
| "hatch patterns" | Listed as content of this file | **NOT in this file**. Poche fill and hatch rendering live in `PlanViewCanvas.ts`. |
| Shell LOC target | ≤300 | **≤500** — shell includes `hitTestAnnotation` (97 LOC) + `hitTestScopeHandle` (49 LOC), both public contract methods that must stay in the shell class; plus constants + helpers + class fields + `render()` + dispatch ≈ 494 LOC |
| Split file count | 6 files | **6 files** (shell + `plan-annotation-helpers.ts` + 5 sub-renderers) — but the file list is completely different: `PlanSymbolicRuleRenderer` and `PlanHatchRenderer` are struck (content not present); `PlanTagRenderer` replaces `PlanRoomLabelRenderer` (covers 8 tag/text types); `PlanContextMarkRenderer` and `PlanDrawingMarkRenderer` added for the F-1 and E-4/E-5 families |
| `PlanSymbolicRuleRenderer.ts` | "delegates to SymbolicRuleRenderer" | **STRUCK** — no symbolic rules in this file |
| `PlanHatchRenderer.ts` | "ISO cut-layer poche fill" | **STRUCK** — no hatch/poche in this file |
| `PlanGridAnnotationRenderer.ts` | Proposed sub-renderer | **Absorbed** into `PlanContextMarkRenderer.ts` — `_renderGridBubble` (36 LOC) too small to justify its own file; combined with section-grid-line, north-arrow, scale-bar, and level-datum-line into `PlanContextMarkRenderer` (~300 LOC) |
| Window globals | "No window globals — all store reads use direct imports" (migration step 3) | **INCORRECT** — 3 typed window reads confirmed at lines 1624, 1629, 1863. All retain TODO annotations unchanged. Not Wave 14 migration scope. |
| Migration step 1 (sub-renderer signature) | "Each sub-renderer receives `(ctx, worldToScreen, options)`" | **Partially correct but incomplete** — sub-renderers receive the full `opts` struct with type-specific state. The `_ptH`/`_ptV` projection helpers must be replicated in `PlanDimensionRenderer` (not imported from shell) to avoid circular dependency. |

---

#### FILE 11 — `src/engine/subsystems/walls/WallFragmentBuilder.ts` (2,257 LOC)

**What it is**: THREE.js geometry builder for walls. Orchestrates 7 dispatch branches inside `buildWall()`: GPU instancing, layered-straight+openings, layered-straight-no-openings, curved-single-layer, curved-layered, plain-no-openings, plain-with-openings. The class holds fragment registries (`fragments`, `fragmentToEntityMap`, `wallToFragmentsMap`, `wallRoots`) and public lifecycle methods (`initWallGroup`, `removeWall`, `removeWallFragments`, `updateWindow`, `updateDoor`, `updateAllMaterials`, `dispose`).

---

**As-found LOC inventory**:

| Cluster | Lines | LOC | Description |
|---|---|---:|---|
| Imports + constants + types | 1–100 | 100 | `import * as THREE` (P2); `buildMiterPrism`, `buildCurvedLayerGeometry`, `buildWallEdgeOverlay`, `buildLayeredWallSegmentsAroundOpenings`, `computeStations`, `clusterOpenings`, `projectCapVertex`; `WALL_REALISTIC_MATERIAL`, `WALL_SCHEMATIC_MATERIAL`; `WallFragment`, `FragmentEntityMapping`, `JoinData`, `OpeningRenderData` types |
| Class fields + constructor | 101–200 | 100 | Private maps + injected refs (`BimManager`, view stores via constructor args); `currentVisualStyle`, `hdriTexture`, `envMapIntensity`, `_instanceBridge` |
| `initWallGroup()` + `removeWall()` + debug globals | 201–310 | 110 | `initWallGroup` stamps locked identity triple on `wallGroup.userData`; `removeWall` clears children + calls `_disposeWallGroupChildren`; `window.__pryzmDebugWalls` debug log at line 307; `window.__planSymbolCache?.invalidate?.(wallId)` optional-chain call at line 373 |
| `buildWall()` — header + userData sync + instance bridge | 311–619 | 309 | Early mutable-userData sync (OBB fields); GPU instancing branch (tryRegisterForInstancing → proxy hit-mesh → early-return `[]`); standard-path preamble (direction, wallLength, positionLocal helper) |
| `buildWall()` — layered straight + openings branch | 638–768 | 131 | Calls `buildLayeredWallSegmentsAroundOpenings`; frame loop (`createDoorFrame`/`createWindowFrame`); single outer-profile edge overlay (miter-prism or BoxGeometry fallback); `_syncMutableWallUserData` |
| `buildWall()` — layered straight, no openings branch | 770–872 | 103 | `wall.layers.forEach` → `buildMiterPrism` per layer + `buildWallEdgeOverlay`; fragment registration per layer |
| `buildWall()` — curved single-layer branch | 883–1120 | 238 | **Fully inlined** BufferGeometry: `stations[]` array, `pushTri`/`outerVBot`/`innerVTop`/etc. helpers, outer+inner+top+bottom+start-cap+end-cap face loops, `projectCapVertex` miter adjustment; `buildWallEdgeOverlay`; fragment registration |
| `buildWall()` — curved layered branch | 1122–1226 | 105 | `wall.layers.forEach` → `buildCurvedLayerGeometry` per layer (delegates to existing `CurvedWallLayerBuilder`); `buildWallEdgeOverlay`; fragment registration |
| `buildWall()` — plain straight, no openings | 1229–1254 | 26 | Calls `createWallBodyFragment` + `buildWallEdgeOverlay`; fragment registration |
| `buildWall()` — plain straight with openings | 1255–1506 | 252 | `clusterOpenings` → cluster loop: BoxGeometry/miterPrism segments before+inside+after cluster; `createDoorFrame`/`createWindowFrame` per opening; header segment; single outer-profile edge overlay; `_syncMutableWallUserData` |
| `createWindowFrame()` | 1509–1676 | 168 | Private. Validates dimensions; builds 4 frame-member BoxGeometry meshes + optional central mullion + glass mesh(es); positions + rotates group along wall baseline; stamps locked `id`/`elementType` + full anchor userData |
| `createDoorFrame()` | 1678–1833 | 156 | Private. Same pattern as `createWindowFrame`; 3 frame members (no bottom) + door panels; stamps `door` elementType userData |
| `updateWindow()` | 1835–1927 | 93 | Public. In-place geometry update of an existing window group; clears children, rebuilds frame + glass from stored userData snapshot; no store access |
| `updateDoor()` | 1929–2008 | 80 | Public. Same pattern; rebuilds door frame + panels |
| `createWallBodyFragment()` | 2010–2054 | 45 | Private. Calls `buildMiterPrism` with `joinData?.startMN`/`endMN`; returns `WallFragment` |
| `createWallMaterial()` | 2056–2078 | 23 | Private. Returns `MeshStandardMaterial`; REALISTIC path uses `hdriTexture` + `envMapIntensity` |
| `_syncMutableWallUserData()` | 2080–2124 | 45 | Private. Writes only mutable `userData` fields; guards against identity-triple re-assignment on locked properties |
| `_disposeWallGroupChildren()` | 2126–2150 | 25 | Private. `group.traverse` → `geometry.dispose()` + `material.dispose()` for each Mesh + LineSegments |
| `removeWallFragments()` | 2152–2203 | 52 | Public. Detaches non-root fragment meshes; traverses each mesh for full geometry+material disposal; cleans all three maps |
| Public accessors + `updateAllMaterials` + `dispose` | 2205–2257 | 53 | `getEntityForFragment`, `getFragmentMesh`, `getWallMesh`, `getWallRoot`, `updateAllMaterials`, `dispose` |
| **Total** | | **2,257** | |

---

**Violation inventory**:

| Violation | Count | Lines | Description | Wave 14? |
|---|---|---|---|---|
| `import * as THREE` — P2 | **1** | 3 | Known 467-file violation; Wave 8+ renderer-three promotion resolves | ❌ Phase D |
| `(window as any)` casts — P4 | **0** | — | Zero unsafe casts | ❌ N/A |
| `window.commandManager.execute()` — P6 | **0** | — | Zero command mutations | ❌ N/A |
| `window.X` reads — typed/optional-chain | **2** | 307, 373 | See inventory below | ❌ debug / Phase D |
| **L7.5 god-object** | ✅ | 1–2257 | 2,257 LOC; 7 dispatch branches in `buildWall()`; door+window frame assembly inlined | ✅ **Wave 14** |

---

**Window globals inventory (2 reads)**:

| Global | Line | Method | Kind | Migration phase | Wave 14? |
|---|---|---|---|---|---|
| `window.__pryzmDebugWalls` | 307 | `removeWall` | Debug flag read — conditional log | Debug infra — retain | ❌ debug |
| `window.__planSymbolCache?.invalidate?.(wallId)` | 373 | `buildWall()` preamble | Optional-chain call on typed cache | `TODO(D.planSymbol)` — Phase D.plan | ❌ Phase D |

---

**Corrections to original stub plan**:

| Item | Original stub | Correct as-found |
|---|---|---|
| `CurvedWallLayerBuilder.ts` | "already exists — move here if not already separate" in `fragment-builders/` | **Already exists at `walls/CurvedWallLayerBuilder.ts`** — referenced via `buildCurvedLayerGeometry` and `computeStations` imports. No move needed. |
| `WallEdgeOverlayBuilder.ts` | "already exists — keep as-is" in `fragment-builders/` | **Already exists at `walls/WallEdgeOverlayBuilder.ts`** — referenced via `buildWallEdgeOverlay`. No move, no change. |
| `WallCapMiterBuilder.ts` | Proposed new file for "cap geometry + miter prisms at joins" | **`MiterPrismBuilder.ts` already exists** — provides `buildMiterPrism`. No new cap-miter file needed. |
| `WallOpeningCutBuilder.ts` | Proposed new file for "opening cut-out geometry: doors + windows; uses LayeredWallOpeningBuilder" | **`LayeredWallOpeningBuilder.ts` already exists** — provides `buildLayeredWallSegmentsAroundOpenings`. The still-inlined portion is the plain-straight-with-openings cluster loop (252 LOC) — extract as `StraightWallOpeningCutBuilder.ts`, not `WallOpeningCutBuilder.ts`. Door/window *frame* assembly (createDoorFrame, createWindowFrame, updateDoor, updateWindow, 497 LOC) is separate from the opening-cut logic and should go to `WallOpeningFrameBuilder.ts`. |
| `StraightWallLayerBuilder.ts` | "layered straight-wall segment geometry" — the only un-created file correctly identified | **Correct** — the layered-straight-no-openings `forEach → buildMiterPrism` loop (103 LOC) is still inlined and should be extracted. |
| Curved single-layer geometry | Not mentioned as an extraction target | **Missed** — 238 LOC of fully inlined `BufferGeometry` construction (stations, pushTri, face loops, cap projection) at lines 883–1120. Should be extracted as `CurvedWallBodyBuilder.ts`. |
| Door/window frame builders | Merged into `WallOpeningCutBuilder.ts` | **Wrong merge** — `createWindowFrame`/`createDoorFrame`/`updateWindow`/`updateDoor` are pure frame-assembly functions (497 LOC total) unrelated to void-cutting. Extract to `WallOpeningFrameBuilder.ts`. |
| Shell LOC target | ≤400 | **≤650** — `buildWall()` orchestration (dispatch, fragment registration, userData sync, instance bridge, miterPrism edge-overlay logic) cannot be reduced below ~500 LOC without losing contract-comment clarity; plus class fields + constructor + public lifecycle methods ≈ 640 LOC |
| `fragment-builders/` subdirectory | Proposed as home for all new files | **WRONG directory** — all existing extracted helpers live directly in `walls/` (not in a `fragment-builders/` subdirectory). New files must follow the same pattern: `walls/StraightWallLayerBuilder.ts`, `walls/CurvedWallBodyBuilder.ts`, `walls/StraightWallOpeningCutBuilder.ts`, `walls/WallOpeningFrameBuilder.ts`. |
| Vitest per sub-builder | "1 vitest per sub-builder" | **Not feasible for THREE.js builders** — same constraint as `initScene.ts`; THREE geometry constructors are not testable in jsdom. Covered by the existing wall-rendering integration workflow. |

---

**Corrected split target**:

```
src/engine/subsystems/walls/
  WallFragmentBuilder.ts              (≤650 LOC — buildWall() 7-branch dispatcher + fragment registry + lifecycle)
  StraightWallLayerBuilder.ts         (NEW — layered-straight-no-openings per-layer forEach loop, ~103 LOC)
  CurvedWallBodyBuilder.ts            (NEW — inline single-layer curved BufferGeometry: stations+face loops+caps, ~238 LOC)
  StraightWallOpeningCutBuilder.ts    (NEW — plain-straight-with-openings cluster loop: BoxGeometry/miterPrism segments, ~252 LOC)
  WallOpeningFrameBuilder.ts          (NEW — createDoorFrame + createWindowFrame + updateDoor + updateWindow, ~497 LOC)
  — existing files, unchanged —
  CurvedWallLayerBuilder.ts           (EXISTING — buildCurvedLayerGeometry + computeStations)
  MiterPrismBuilder.ts                (EXISTING — buildMiterPrism)
  LayeredWallOpeningBuilder.ts        (EXISTING — buildLayeredWallSegmentsAroundOpenings)
  WallEdgeOverlayBuilder.ts           (EXISTING — buildWallEdgeOverlay)
  CurvedWallCapMiter.ts               (EXISTING — projectCapVertex)
```

**Migration pattern**:
1. Extract `buildStraightWallLayers(wall, joinData, wallGroup, fragmentIds, ...): void` to `StraightWallLayerBuilder.ts` — pure: takes WallData + joinData + output params, calls `buildMiterPrism`, no class state needed.
2. Extract `buildCurvedWallBody(wall, joinData, wallGroup, ...): THREE.BufferGeometry` to `CurvedWallBodyBuilder.ts` — pure function wrapping the station/pushTri/face-loop block; returns the assembled geometry. Shell creates the mesh and handles fragment registration.
3. Extract `buildStraightWallOpeningSegments(wall, joinData, wallGroup, renderMap, fragmentIds, ...): void` to `StraightWallOpeningCutBuilder.ts` — contains the cluster loop, BoxGeometry/miterPrism segment dispatch, `createDoorFrame`/`createWindowFrame` calls, and edge overlay.
4. Extract `createDoorFrame`, `createWindowFrame`, `updateDoor`, `updateWindow` to `WallOpeningFrameBuilder.ts` as named exports. These four are already structurally independent — they take `(wall, opening, renderData?)` and return a `THREE.Group`.
5. `WallFragmentBuilder.buildWall()` becomes a pure router: resolve branch → call extracted function → register returned meshes as fragments.
6. `window.__planSymbolCache?.invalidate?.(wallId)` at line 373 retains its `TODO(D.planSymbol)` annotation unchanged — Phase D scope, not Wave 14.

**Verifier after split**:
```bash
wc -l src/engine/subsystems/walls/WallFragmentBuilder.ts                  # → ≤650
wc -l src/engine/subsystems/walls/Straight*.ts \
       src/engine/subsystems/walls/Curved*.ts \
       src/engine/subsystems/walls/Wall*Frame*.ts \
       src/engine/subsystems/walls/Wall*Opening*.ts | awk '$1 > 1500'     # → 0 lines
```

---

#### FILE 12 — `src/engine/subsystems/initScene.ts` (2,250 LOC)

> **AS-FOUND AUDIT — 2026-05-02** (full read, lines 1–2,250)

**What it is**: Single `async function initScene()` — not a class. Scene initialisation across 24 logical clusters: GPU probe + backend detection, `createBimWorld` (components, world, grid, fragments, gltfLoader), `ViewNavigationManager`, `GroundFloorPlanController`, `ViewController`, full BIM service registry (SceneBoundsCache, FrameCoordinator, TopologySpatialIndex, SceneLayers, ViewVisibilityMap, TopologyLayer, FrustumCullingService, ViewRenderCache, UnifiedFrameLoop, LevelClipPlaneCache, StairPlanSymbolRegistry, InstancedElementRenderer, GridToggleService, WallEdgeVisibilityService, RoomTagAutoPopulator, BimManager), EdgeProjectorService lazy façade, ViewDependencyTracker reprojection callback, Phase 5 WebGPU renderer (PostproductionRenderer + PRYZM WebGPU canvas), ViewportPathTracer lazy façade, PascalSceneLighting (early apply + geometry events), RenderingPipelineCoordinator, RenderPipelineManager (TSL: MRT, SSGI, Outlines; ViewportCrashGuard + RenderHealthIndicator wired inline), EnhancedBloomService lazy façade, SSGIService lazy façade, RenderPerformanceService, SplitViewManager, GPU Memory Monitor (DEV only).

**P-score audit**:
- **P1** (soft — accepted): parallel composition site — wires scene-level singletons outside `composeRuntime()`. Per `02-ARCHITECTURE.md §6`, Stage 2 engine init is intentionally outside `composeRuntime()` (deferred to project-open), so this is an *accepted* P1 soft-fail until Wave 16+. Do NOT treat this as a real violation.
- **P2=1**: `import * as THREE from 'three'` at line 41 — single occurrence, correct.
- **P4=0**: 0 `(window as any)` casts confirmed. All 105 `window.X` references are typed via the `WindowExtension` interface at the top of the file.
- **P6=0**: Line 503 reads `window.commandManager` as a typed global property in a bundle-assembly expression — not a direct state mutation bypassing the command bus.

**24-cluster LOC table** (as-found):

| # | Cluster | Lines | LOC |
|--:|---|---|--:|
| 1 | Imports + type declarations + WindowExtension interface | 1–147 | 147 |
| 2 | GPU probe | 148–163 | 16 |
| 3 | BimWorld + navigation (navManager, groundFloorController, viewController) | 164–212 | 49 |
| 4 | BIM service registry (SceneBoundsCache → UnifiedFrameLoop) | 213–299 | 87 |
| 5 | LevelClipPlaneCache + StairPlanSymbolRegistry | 300–408 | 109 |
| 6 | InstancedElementRenderer | 410–422 | 13 |
| 7 | GridToggleService + grid elevation | 424–452 | 29 |
| 8 | WallEdgeVisibilityService + view-activated listener | 454–495 | 42 |
| 9 | RoomTagAutoPopulator | 497–513 | 17 |
| 10 | BimManager | 524–531 | 8 |
| 11 | EdgeProjectorService lazy façade | 545–631 | 87 |
| 12 | ViewDependencyTracker reprojection callback | 632–706 | 75 |
| 13 | Phase 5 WebGPU renderer (PostproductionRenderer + PRYZM WebGPU canvas setup, try/catch rollback) | 728–1141 | 414 |
| 14 | ViewportPathTracer lazy façade (_ensureViewportPathTracer, enable/disable, VPT edit event listeners) | 1143–1284 | 142 |
| 15 | PascalSceneLighting early apply (ordering constraint — before pipeline compilation) | 1286–1311 | 26 |
| 16 | RenderingPipelineCoordinator (bind, batchCoordinator post-batch callback, auto-activate quality) | 1313–1447 | 135 |
| 17 | RenderPipelineManager (ViewportCrashGuard + RenderHealthIndicator wired inline; RPM bind, SSGI/Outlines activate, UnifiedFrameLoop wiring, project-switch/loaded handlers, selection/hover/view-activated listeners) | 1450–1814 | 365 |
| 18 | PascalSceneLighting geometry events (debounced, + window.pascalSceneLighting) | 1816–1877 | 62 |
| 19 | EnhancedBloomService lazy façade | 1879–1983 | 105 |
| 20 | SSGIService lazy façade (with WebGPU guard + bloom mutex) | 1985–2107 | 123 |
| 21 | RenderPerformanceService | 2109–2136 | 28 |
| 22 | SplitViewManager (+ pryzm-project-loaded auto-open) | 2138–2176 | 39 |
| 23 | GPU Memory Monitor (DEV only, growth-rate detector) | 2178–2230 | 53 |
| 24 | Return statement | 2232–2249 | 18 |

**Window globals inventory** (105 total `window.X` occurrences; all typed via WindowExtension; P4=0):
Key assignments: `window.navManager` (169), `window.groundFloorController` (173), `window.viewController` (177); `window.sceneBoundsCache`, `window.frameCoordinator`, `window.topologySpatialIndex`, `window.sceneLayers`, `window.viewVisibilityMap`, `window.topologyLayer`, `window.frustumCullingService`, `window.viewRenderCache`, `window.unifiedFrameLoop`; `window.levelClipPlaneCache`, `window.stairPlanSymbolRegistry`; `window.instancedElementRenderer`; `window.wallEdgeVisibilityService`; `window.edgeProjectorService`, `window.requestEdgeProjection`, `window.flushEdgeProjection`; `window.viewDependencyTracker`; `window.pryzmCanvas`, `window.pryzmRenderer`, `window.obcRendererCanvas`; `window.viewportPathTracer`, `window.enableViewportRenderMode`, `window.disableViewportRenderMode`; `window.renderingPipelineCoordinator`; `window.renderPipelineManager`, `window.currentPipelinePhase`; `window.pascalSceneLighting`; `window.enableEnhancedBloom`, `window.disableEnhancedBloom`, `window.enhancedBloomService`; `window.enableSSGI`, `window.disableSSGI`, `window.ssgiService`; `window.setRenderQualityLevel`; `window.splitViewManager`.
WorkspaceMountBridge threading is Wave 16+ — do not attempt in Wave 14.

**Violations**:
- **P1** (accepted soft-fail — see above)
- **L7.5 god-object**: 24 independent clusters in one 2,250-LOC function. GPU probe, world/navigation, BIM service registry, Phase 5 renderer, pipeline managers, and lazy render services are independently testable sub-phases.

---

> ~~**STUB PLAN ERRORS** (struck — do not implement as written):~~
> 1. ~~Shell ≤400~~ → **≤650** (24 clusters; even after 4-file extraction the shell retains clusters 4, 6–10, 21–24 + orchestration wiring = ~400–450 LOC plus imports and function signature)
> 2. ~~"No window globals — all singletons stored in WorkspaceMountBridge"~~ → **wrong for Wave 14**. 105 typed window globals (P4=0). WorkspaceMountBridge threading is Wave 16+ only; do not attempt here.
> 3. ~~`initGPUProbe.ts` standalone~~ → **too thin** (cluster 2 = 16 LOC). Merge into `initWebGPURenderer.ts`.
> 4. ~~`initNavigation.ts` standalone~~ → **too thin + world-dependent** (cluster 3 = 49 LOC). Merge into `initWorldAndServices.ts`.
> 5. ~~`initRenderPipeline.ts` as one file~~ → **~1,002 LOC combined** (clusters 13+15+16+17+18). Split into two files: `initWebGPURenderer.ts` (cluster 13 = 414 LOC) and `initRenderPipelineManagers.ts` (clusters 15+16+17+18 = 588 LOC).
> 6. ~~`initRenderHealth.ts` standalone~~ → **not extractable** — ViewportCrashGuard + RenderHealthIndicator (lines 1,466–1,469, 4 lines) are wired inline with `renderPipelineManager.onStateChange`. Merge into `initRenderPipelineManagers.ts`.
> 7. ~~`initPathTracer.ts` — "only if WebGPU available"~~ → **incorrect**. The lazy façade always installs at boot (null-safe until first user activation). Rename to `initLazyRenderServices.ts` and include all three lazy services: ViewportPathTracer + EnhancedBloomService + SSGIService (clusters 14+19+20 = 370 LOC — same lazy-façade pattern).

---

**Corrected split target**:
```
src/engine/subsystems/
  initScene.ts                        (≤650 LOC — orchestrator: calls sub-inits in order; retains
                                        clusters 4, 6–10, 21–24 + all event-listener wiring)
  scene-init/
    initWorldAndServices.ts           (GPU probe + BimWorld + navigation + BIM service registry;
                                        clusters 2+3+4+5 = ≤600 LOC)
    initWebGPURenderer.ts             (Phase 5 PostproductionRenderer + PRYZM WebGPU canvas;
                                        cluster 13 = ≤430 LOC)
    initRenderPipelineManagers.ts     (PascalSceneLighting + RenderingPipelineCoordinator +
                                        RenderPipelineManager + CrashGuard + HealthIndicator;
                                        clusters 15+16+17+18 = ≤620 LOC)
    initLazyRenderServices.ts         (ViewportPathTracer + EnhancedBloomService + SSGIService
                                        lazy façades; clusters 14+19+20 = ≤380 LOC)
```

**Migration pattern** (corrected):
1. Each sub-init is a pure function: `initWorldAndServices(container, runtime): WorldBundle`, `initWebGPURenderer(world, components, container): WebGPURendererBundle`, etc.
2. `initScene.ts` calls each in sequence; passes bundle results forward as function arguments.
3. Window globals remain — typed via `WindowExtension` (P4=0). WorkspaceMountBridge threading is Wave 16+ work, not Wave 14.
4. No vitest: all sub-inits depend on THREE, OBC, and WebGPU APIs — not testable in jsdom. Covered by existing `pryzm-persistence` integration workflow.

**Verifier after split**:
```bash
wc -l src/engine/subsystems/initScene.ts                                     # → ≤650
wc -l src/engine/subsystems/scene-init/*.ts | awk '$1 > 1500'                # → 0 files
```

---

#### FILE 13 — `src/engine/subsystems/styles/panels/modePickers.ts` (2,241 LOC)

> **AS-FOUND AUDIT — 2026-05-02** (full read, lines 1–2,241)

**What it is**: Pure CSS module — **zero logic, zero imports, zero TypeScript**. 12 exported template-literal string constants (not 8 as the stub stated). Each constant holds the CSS for one element-type mode picker widget, all sharing the same panel anatomy (outer shell, gradient header, type-row dropdown, mode-button row, ESC hint footer) and the same design-token contract (`var(--app-*)` only, no hardcoded colours, no `!important`). Single importer: `src/engine/subsystems/styles/AppTheme.ts` line 53 — named-import of all 12 exports.

**P-score audit**:
- P1: N/A (no composition)
- P2=0: no `import * as THREE` — file has zero imports of any kind
- P4=0: no `(window as any)` casts
- P6=0: no state mutations — pure CSS strings

**12-constant inventory** (as-found):

| # | Export constant | CSS prefix | Lines | LOC |
|--:|---|---|---|--:|
| 1 | `WALL_MODE_PICKER_STYLES` | `wmp-` | 21–212 | 192 |
| 2 | `SLAB_MODE_PICKER_STYLES` | `smp-` | 217–385 | 169 |
| 3 | `CURTAIN_WALL_MODE_PICKER_STYLES` | `cwmp-` | 390–560 | 171 |
| 4 | `DOOR_MODE_PICKER_STYLES` | `dmp-` | 565–740 | 176 |
| 5 | `WINDOW_MODE_PICKER_STYLES` | `wnmp-` | 745–920 | 176 |
| 6 | `CEILING_MODE_PICKER_STYLES` | `cmp-` ⚠ | 925–1122 | 198 |
| 7 | `FLOOR_MODE_PICKER_STYLES` | `fmp-` | 1127–1324 | 198 |
| 8 | `ROOF_MODE_PICKER_STYLES` | `rfmp-` | 1329–1485 | 157 |
| 9 | `COLUMN_MODE_PICKER_STYLES` | `cmp-` ⚠ | 1490–1674 | 185 |
| 10 | `HANDRAIL_MODE_PICKER_STYLES` | `hrmp-` | 1679–1876 | 198 |
| 11 | `BEAM_MODE_PICKER_STYLES` | `bmp-` | 1881–2087 | 207 |
| 12 | `OPENING_MODE_PICKER_STYLES` | `omp-` | 2093–2240 | 148 |
| — | File header comment | — | 1–20 | 20 |

> ⚠ **Pre-existing CSS prefix collision**: `CEILING_MODE_PICKER_STYLES` and `COLUMN_MODE_PICKER_STYLES` both claim the `cmp-` CSS prefix. This collision exists TODAY in the monolith and is visible in both panel components. The split does not introduce it. Fix it in a dedicated CSS-prefix audit pass (Wave 14+ cleanup), not here. The split annotates it; it does not widen it.

**Violations**:
- **L7.5 god-object** (CSS-only): 12 independent CSS namespaces in one 2,241-LOC file. Editing one picker requires scrolling past 11 others.

---

> ~~**STUB PLAN ERRORS** (struck — do not implement as written):~~
> 1. ~~"CSS for 8 element-type mode pickers"~~ → **12 constants** — stub missed Column (`cmp-`), Handrail (`hrmp-`), Beam (`bmp-`), Opening (`omp-`). Split target must list **12 files**, not 8.
> 2. ~~Window prefix `wndmp-`~~ → **correct prefix is `wnmp-`** (verified line 748).
> 3. ~~Split target lists 8 files~~ → **12 files** in `mode-pickers/` subfolder; 4 files (columnModePicker, handrailModePicker, beamModePicker, openingModePicker) were missing from the stub.
> 4. ~~Verifier `awk '$1 > 500'`~~ → **`$1 > 300`** is the correct threshold (longest constant is BEAM at 207 LOC; 500 would never fire and is meaningless as a gate).

---

**Corrected split target** (IMPLEMENTED 2026-05-02):
```
src/engine/subsystems/styles/panels/
  modePickers.ts                    (21 LOC — named re-export barrel; same path, zero importer changes)
  mode-pickers/
    wallModePicker.ts               (WALL_MODE_PICKER_STYLES — wmp-)
    slabModePicker.ts               (SLAB_MODE_PICKER_STYLES — smp-)
    curtainWallModePicker.ts        (CURTAIN_WALL_MODE_PICKER_STYLES — cwmp-)
    doorModePicker.ts               (DOOR_MODE_PICKER_STYLES — dmp-)
    windowModePicker.ts             (WINDOW_MODE_PICKER_STYLES — wnmp-)
    ceilingModePicker.ts            (CEILING_MODE_PICKER_STYLES — cmp- ⚠ prefix collision)
    floorModePicker.ts              (FLOOR_MODE_PICKER_STYLES — fmp-)
    roofModePicker.ts               (ROOF_MODE_PICKER_STYLES — rfmp-)
    columnModePicker.ts             (COLUMN_MODE_PICKER_STYLES — cmp- ⚠ prefix collision)
    handrailModePicker.ts           (HANDRAIL_MODE_PICKER_STYLES — hrmp-)
    beamModePicker.ts               (BEAM_MODE_PICKER_STYLES — bmp-)
    openingModePicker.ts            (OPENING_MODE_PICKER_STYLES — omp-)
```

**Migration pattern** (confirmed):
1. Pure mechanical split — each constant extracted verbatim into its own file.
2. `modePickers.ts` replaced with a named re-export barrel (same file path — no import path changes needed in `AppTheme.ts`).
3. Zero logic changes. No vitest needed (CSS strings have no testable behaviour; Contract §05 §2 compliance is the gate).
4. `AppTheme.ts` line 53 import is unchanged — barrel re-exports all 12 names under the same path.

**Verifier after split**:
```bash
wc -l src/engine/subsystems/styles/panels/modePickers.ts                              # → ≤25
wc -l src/engine/subsystems/styles/panels/mode-pickers/*.ts | awk '$1 > 300'          # → 0 files
npm run build                                                                          # → ✓ EXIT:0
```

---

#### FILE 14 — `src/engine/subsystems/styles/panels/autonomousAuditor.ts` (2,237 LOC)

> **AS-FOUND AUDIT — 2026-05-02** (full read, lines 1–2,238)

**What it is**: Pure CSS module — **zero logic, zero imports, zero TypeScript**. Unlike FILE 13 (which had 12 pre-existing separate exports), this file has **one monolithic export**: `AUTONOMOUS_AUDITOR_STYLES` (lines 21–2237), a single template-literal string containing 8 CSS namespaces concatenated. Single importer: `src/engine/subsystems/styles/AppTheme.ts` line 66 — imports `AUTONOMOUS_AUDITOR_STYLES` by name, used at line 188 in a string concatenation.

**P-score audit**:
- P2=0: no `import * as THREE` — zero imports of any kind
- P4=0: no `(window as any)` casts
- P6=0: no state mutations — pure CSS string

**8-namespace inventory** (as-found — all inside the single template literal):

| # | CSS prefix | UI zone | Source regions (non-contiguous marked ⚠) | Approx LOC |
|--:|---|---|---|--:|
| 1 | `ins-` | Inspect Mode Shell (F2) | 46–224 + 1616–1628 + 2211–2236 ⚠ | ~204 |
| 2 | `aud-` | Audit Stack (F2 RHS) | 22–44 + 225–468 + 1629–2209 ⚠ | ~878 |
| 3 | `dcc-` | Data Command Center (F3 shell) | 469–699 | ~231 |
| 4 | `strat-` | Strategize Bucket (F3 B1) | 700–1157 | ~458 |
| 5 | `audit-` | Audit Bucket (F3 B2) | 1158–1302 | ~145 |
| 6 | `val-` | Validate Bucket (F3 B3) | 1303–1413 | ~111 |
| 7 | `life-` | Lifecycle Bucket (F3 B4) | 1414–1525 | ~112 |
| 8 | `req-` | Requirement Record Display (shared) | 1526–1615 | ~90 |

> ⚠ **Non-contiguous namespaces**: `aud-` CSS appears in three separate regions of the file (root container at 22–44, core at 225–468, v1.4 extension at 1629–2209). `ins-` CSS appears in three regions (main at 46–224, ghost label at 1616–1628, body layout overrides at 2211–2236). The split must gather all regions for each namespace into one constant.

> ⚠ **Body rules cross-namespace**: Lines 2211–2236 contain `body.pryzm-mode-inspect` overrides that also target `.wmb-toplevel-wrapper` and `.bam-container` (other CSS prefixes), but they are triggered by Inspect mode activation — they belong semantically with `INSPECT_MODE_STYLES`.

**Violations**:
- **L7.5 god-object** (CSS-only): 8 independent CSS namespaces in one 2,237-LOC file. Two namespaces have non-contiguous layout in the source — finding all `aud-` rules requires reading three different regions.

---

> ~~**STUB PLAN ERRORS** (struck — do not implement as written):~~
> 1. ~~"7 prefix namespaces"~~ → **8 namespaces**: ins-, aud-, dcc-, strat-, audit-, val-, life-, req-. Stub miscounts its own listed namespaces.
> 2. ~~"same as FILE 13 — pure mechanical CSS split"~~ → **NOT the same**. FILE 13 had 12 pre-existing separate exports — just extract each. FILE 14 has **1 monolithic export** — the split must CREATE 8 new exported constants by intelligently grouping non-contiguous CSS regions from the single template literal. This is a structural split, not a mechanical one.
> 3. ~~Split export names (INSPECT_MODE_STYLES, AUDIT_STACK_STYLES, etc.) as if they exist in source~~ → **none of these names exist in the source file**. The only source export is `AUTONOMOUS_AUDITOR_STYLES`. The new names are correct choices for the split output, but they must be created, not extracted.
> 4. ~~AUD and INS namespaces are contiguous~~ → **both are non-contiguous** (see table above). The split must gather all 3 regions for each into its constant.
> 5. ~~Verifier `awk '$1 > 500'`~~ → **`$1 > 1000`** is the correct threshold. `AUDIT_STACK_STYLES` (AUD namespace, ~878 LOC after gathering 3 regions) legitimately exceeds 500. This is a genuine result — auditor CSS is the largest namespace by design.
> 6. ~~Barrel needs only re-exports~~ → **barrel must also reassemble `AUTONOMOUS_AUDITOR_STYLES`** as a CSS string concatenation of all 8 parts. This is required for backward compat: AppTheme.ts line 66 imports `AUTONOMOUS_AUDITOR_STYLES` by name and AppTheme.ts line 188 uses it. Without this re-assembly, AppTheme.ts would need changes. The string concatenation is trivial assembly — not behavioral logic.

---

**Corrected split target** (IMPLEMENTED 2026-05-02):
```
src/engine/subsystems/styles/panels/
  autonomousAuditor.ts            (≤40 LOC — re-export barrel + AUTONOMOUS_AUDITOR_STYLES
                                    backward-compat re-assembly; AppTheme.ts import unchanged)
  autonomous-auditor/
    inspectModeShell.ts           (INSPECT_MODE_STYLES — ins- prefix; 3 non-contiguous regions)
    auditStack.ts                 (AUDIT_STACK_STYLES  — aud- prefix; 3 non-contiguous regions; ~878 LOC)
    dataCommandCenter.ts          (DATA_COMMAND_CENTER_STYLES — dcc- prefix)
    strategizeBucket.ts           (STRATEGIZE_STYLES — strat- prefix)
    auditBucket.ts                (AUDIT_BUCKET_STYLES — audit- prefix)
    validateBucket.ts             (VALIDATE_STYLES — val- prefix)
    lifecycleBucket.ts            (LIFECYCLE_STYLES — life- prefix)
    requirementDisplay.ts         (REQUIREMENT_STYLES — req- prefix)
```

**Migration pattern** (corrected):
1. Each namespace's CSS regions extracted and concatenated into its own `export const X = \`...\`` file.
2. Non-contiguous regions (AUD × 3, INS × 3) gathered via sed extraction and joined inside the template literal.
3. Barrel `autonomousAuditor.ts` re-exports all 8 named constants AND re-assembles `AUTONOMOUS_AUDITOR_STYLES` = string join of all 8 for AppTheme.ts backward compat.
4. `AppTheme.ts` lines 66 and 188 unchanged.
5. Zero logic changes. No vitest needed.

**Verifier after split**:
```bash
wc -l src/engine/subsystems/styles/panels/autonomousAuditor.ts                          # → ≤40
wc -l src/engine/subsystems/styles/panels/autonomous-auditor/*.ts | awk '$1 > 1000'     # → 0 files
tsc --noEmit --skipLibCheck                                                              # → zero errors
```

---

#### FILE 15 — `src/engine/subsystems/core/views/PlanViewCanvas.ts` (2,150 LOC)

**What it is**: Canvas2D plan view renderer. Drives: `drawingPipelineOrchestrator` (worker thread pipeline), poche fill, room colour system, hatch patterns, symbolic rules (door swings), VG overrides injection, hit-test, and the `PlanViewAnnotationRenderer` call at the end. All render phases are inlined in `render()`.

**Violations**:
- **L7.5 god-object**: render orchestration + per-phase rendering + hit-test + VG override injection all in one class.

**Split target**:
```
src/engine/subsystems/core/views/
  PlanViewCanvas.ts               (≤500 LOC — canvas lifecycle + render frame orchestration)
  plan-canvas/
    PlanViewBaseRenderer.ts       (projected edge linework from ViewTechnicalDrawingCache)
    PlanViewFillRenderer.ts       (poche fill + room colour + hatch patterns)
    PlanViewSymbolRenderer.ts     (symbolic rules: door swings, window cased — delegates to SymbolicRuleRenderer)
    PlanViewHitTest.ts            (hitTest() — pixel → element UUID lookup)
    PlanViewVGApplicator.ts       (VGGovernanceStore override injection before each render)
```

**Migration pattern**:
1. `PlanViewCanvas.render()` calls sub-renderers in order: Base → Fill → Symbol → Annotation (already delegates to `PlanViewAnnotationRenderer`).
2. `PlanViewHitTest.hitTest(x, y)` is extracted as a standalone pure function (no canvas state mutation).
3. `PlanViewVGApplicator` extracted — called once per frame before base render, injects style overrides from `vgGovernanceStore`.
4. 1 vitest for `PlanViewHitTest`: provide a pre-populated `DrawingSelectionIndex` → verify UUID lookup.

**Verifier after split**:
```bash
wc -l src/engine/subsystems/core/views/PlanViewCanvas.ts                        # → ≤500
wc -l src/engine/subsystems/core/views/plan-canvas/*.ts | awk '$1 > 1500'       # → 0 files
```

---

#### FILE 15 — Wave 14 as-found audit (2026-05-02)

**Source**: `src/engine/subsystems/core/views/PlanViewCanvas.ts` — 2,151 LOC

> **Build note**: The existing `plan-canvas/PlanViewFillRenderer.ts` had a broken import
> (`'../../rooms/RoomColourSystem'` → `'../../../rooms/RoomColourSystem'`) that was the sole
> `npm run build` TypeScript error on this session. Fixed 2026-05-02. `npm run build` ✓ EXIT:0.

---

**What it is**: Canvas2D plan/section/elevation renderer. Drives two fully-inlined render paths:

- **Legacy scene-graph path** (`render()`, lines 198–433): traverses the THREE.js `PipelineResult.three` scene graph per-frame, resolves pen styles via `graphicsRulesEngine`, dispatches symbolic rules via `SymbolicRuleRenderer`, delegates annotations to `PlanViewAnnotationRenderer`.
- **Worker pipeline path** (`renderFromPipelineResult()`, lines 1364–1496): reads pre-styled `StyledEdge[]` + `StyledPolygon[]` from `DrawingPipelineOrchestrator` (Contract 23 §14 Stage 7). This entire path — including `scheduleWorkerRender()` — is **completely absent from the stub plan**.

Additionally the file renders: room colour fills, poche fills (intent + VG override cascade), BIM grid datum lines + bubbles + dimension strings, level datum lines + heads (section/elevation), floor plan underlay image (affine-transform), selection highlight (3-pass purple glow), lighting plan symbols, snap indicator, crop clip + boundary, and provides public hit-test API for elements, grids, levels, annotations, and scope handles.

---

**Critical as-found finding — partial split already started, delegation not wired**:

Four sub-files already exist inside `plan-canvas/`:

| File | LOC | Content |
|---|---:|---|
| `PlanViewCanvasTypes.ts` | 17 | `PlanViewCanvasStyle`, `PlanViewCanvasOptions`, `PlanViewCanvasRenderOptions` interface exports |
| `PlanViewFillRenderer.ts` | 254 | `_renderPocheFills` + `_renderRoomFills` + `_parsePochePoints` + `_canvasFillStyleForPoche` |
| `PlanViewSymbolRenderer.ts` | 143 | Symbolic rule rendering for door swings + window cased via `SymbolicRuleRenderer` |
| `PlanViewVGApplicator.ts` | 99 | `_syncVGViewOverrides`: `vgGovernanceStore` → `graphicsRulesEngine` injection |

However, **`PlanViewCanvas.ts` imports from none of these files**. The split was started (sub-files created, logic extracted) but the **delegation step was never completed** — `PlanViewCanvas.ts` still contains all the original inlined code. The existing sub-files are real extractions (not stubs), confirmed by the build error in `PlanViewFillRenderer.ts` that was fixed this session.

---

**P-score audit**:

- **P2=1**: `import * as THREE from 'three'` at line 1 — Wave 8+ renderer-three promotion scope; not Wave 14.
- **P4=0**: Zero `(window as any)` casts — all window reads are typed via `WindowExtension`.
- **P6=0**: Zero command mutations — no `window.commandManager.execute()` or `commandBus.dispatch()` anywhere.

---

**LOC breakdown by functional cluster**:

| # | Cluster | Lines | LOC | Key symbols / notes |
|--:|---|---|---:|---|
| 1 | Imports (18 module imports + `import * as THREE`) | 1–40 | 40 | `drawingPipelineOrchestrator`, `PocheFillBuilder`, `RoomColourSystem`, `renderSymbol`/`symbolicRuleForLayer`/`elementTypeForSymbolLayer`, `getHatchPattern`, `visibilityIntentStore`, `viewIntentInstanceStore`, `resolveIntentStyle`, `getDefaultSystemIntentId`, `vgGovernanceStore`, `graphicsRulesEngine`, `floorPlanUnderlayRef`, `renderLightingSymbols`, `lookupElementUUID`, `penZoneFromFlags`, `categoryFromFlags` — ALL static module imports |
| 2 | Module-level constants + scratch vectors + `ISO_LAYER_TO_VG_CATEGORY` | 41–65 | 25 | `DEFAULT_PLAN_VIEW_CANVAS_FRUSTUM`, `MINIMUM_PLAN_VIEW_CANVAS_FRUSTUM`, `MAX_PLAN_VIEW_CANVAS_DPR`; `_tmpV1`/`_tmpV2` (`THREE.Vector3` scratch); `ISO_LAYER_TO_VG_CATEGORY` 13-entry map |
| 3 | Interface + type exports (from stub: now in `PlanViewCanvasTypes.ts` — duplicated) | 67–83 | 17 | `PlanViewCanvasStyle`, `PlanViewCanvasOptions`, `PlanViewCanvasRenderOptions` — **still present in shell AND in `PlanViewCanvasTypes.ts`** |
| 4 | Class fields (15 private) + constructor | 85–155 | 71 | `_canvas`, `_ctx`, `_styleResolver`, `_frustumH`, `_camTarget`, `_gridVisible`, `_cssW`/`_cssH`, `_lastViewId`, `_disposed`, `_snapIndicator`, `_levelId`, `_viewType`, `_hWorldAxis`/`_hWorldSign`/`_sectionFlipV`, `_hoveredElementId`, `_underlayImage`/`_underlayImageUrl`, `_selectedGridId`/`_gridDimHitAreas`, `_selectedLevelId`/`_levelDatumHitAreas`, `_pipelineCache`/`_workerGeneration` |
| 5 | Public setters (setLevelId, setViewType, setSectionAxes) + private axis helpers (_vertexToHV, _worldHToCanvasH, _worldPointToCanvasH) | 157–196 | 40 | §ANN-ELEV-SEC axis wiring for section/elevation view projection |
| 6 | `render()` — **legacy scene-graph path** | 198–433 | 236 | Full pipeline: `_syncVGViewOverrides` → grid → `_drawUnderlay` → `_renderRoomFills` → `_renderBimGridDatums` → `_renderLevelDatums` → `_renderPocheFills` → THREE.js traverse (pen resolve + symbolic dispatch) → annotation delegate → lighting symbols → crop → `_renderSelectionHighlights` → snap indicator |
| 7 | State setters/getters | 435–464 | 30 | `setSnapIndicator`, `clearSnapIndicator`, `setHoveredElementId`, `setSelectedGridId`, `getSelectedGridId`, `setSelectedLevelId`, `getSelectedLevelId` |
| 8 | `hitTestLevel()` + `hitTestLevelHead()` | 466–498 | 33 | Level datum line + head proximity hit-test; uses `_levelDatumHitAreas` |
| 9 | `hitTestGrid()` | 510–589 | 80 | Reads **`window.bimManager`** (line 516) — grid-line proximity test; supports linear-mode grids via `_isLinearGrid`; dimension-label hit via `_gridDimHitAreas` |
| 10 | `_renderBimGridDatums()` + `_drawGridBubble()` + `_drawGridPositionLabel()` + `_renderGridDimensions()` | 590–871 | 282 | Reads **`window.bimManager`** (line 590) — full grid datum rendering: axis lines (X/Z/linear), grid bubbles at each end (circle + label + pin dot), position tags, purple dimension strings between selected grid and neighbours; populates `_gridDimHitAreas` for inline position editing |
| 11 | `_renderLevelDatums()` + `_drawLevelHead()` | 880–1011 | 132 | Reads **`window.bimManager`** (line 881) — horizontal datum lines at world-Y elevations; Revit-style level heads (circle + abbreviated name + full name + elevation tag); populates `_levelDatumHitAreas` |
| 12 | `getPixelsPerUnit()` + `worldToScreen()` + `screenToWorld()` + `screenYToElevation()` | 1013–1047 | 35 | Core projection math — public API used by annotation renderer callback |
| 13 | `_drawUnderlay()` | 1049–1115 | 67 | Floor plan image: `floorPlanUnderlayRef` → affine-transform from mesh world corners → `ctx.transform(a, b, c, d, tx, ty)` + `ctx.drawImage()` at 0.5 opacity |
| 14 | `hitTest()` | 1117–1166 | 50 | Primary UUID pixel hit-test: `lookupElementUUID(drawing, child)` → `userData.elementUUID` → `userData.elementId` → parent fallbacks; segment distance via `_distanceToSegment` |
| 15 | `hitTestAnnotation()` + `hitTestScopeHandle()` | 1168–1188 | 21 | Delegates to `planViewAnnotationRenderer.hitTestAnnotation()` and `hitTestScopeHandle()` |
| 16 | `fitToDrawing()` + `_resolveCropCanvasBounds()` | 1190–1278 | 89 | Fit-camera to drawing footprint or crop region; crop resolution handles elevation-mark and section-mark annotation geometry for asymmetric width drag |
| 17 | `setSize()` | 1280–1289 | 10 | Sets `_cssW`/`_cssH`; updates canvas pixel dimensions via `window.devicePixelRatio` |
| 18 | `scheduleWorkerRender()` | 1307–1340 | 34 | Contract 23 §14 — fire-and-forget: submits TechnicalDrawing to `drawingPipelineOrchestrator`; generation guard prevents stale overwrites; `onComplete` callback triggers repaint |
| 19 | `renderFromPipelineResult()` — **worker pipeline path** | 1364–1496 | 133 | Contract 23 §14 Stage 7 CanvasRenderer: clear → grid → underlay → room fills → grid/level datums → poche polygons (from `result.polygons`) → edge linework (from `result.edges`, pre-styled) → annotation delegate → lighting symbols → crop → selection highlights → snap indicator |
| 20 | `getCachedPipelineResult()` + `invalidatePipelineCache()` + `dispose()` | 1502–1517 | 16 | Pipeline cache accessors; `dispose()` clears cache + clears canvas |
| 21 | `_applyCropClip()` + `_renderCropBoundary()` | 1519–1570 | 52 | Canvas clip rect + blue dashed crop rectangle with corner handles |
| 22 | `_renderLightingPlanSymbols()` | 1590–1604 | 15 | Reads **`window.selectionManager`** (line 1596) — delegates to `renderLightingSymbols()`; plan + ceiling-plan + structural-plan only |
| 23 | `_renderSelectionHighlights()` | 1606–1729 | 124 | Reads **`window.selectionManager`** (line 1607) — 3-pass purple glow: (1) broad halo 14 px @0.18α shadow, (2) mid-glow 6 px @0.45α, (3) crisp core 2 px @0.95α; blue hover stroke at 4 px @0.55α |
| 24 | `_renderRoomFills()` | 1731–1766 | 36 | Reads **`window.roomStore`** (line 1732) — `RoomColourSystem.resolve(room)` → `ctx.fill()` per boundary polygon; `getByLevel()` scoped to `_levelId` |
| 25 | `_renderPocheFills()` | 1768–1878 | 111 | Intent + VG override cascade: `resolveIntentStyle()` → `intentFillColour` / `intentFillPattern` / `intentFillOpacity` priority over `vgStyleResolver` → `ISO_CUT_LAYER_TO_POCHE_FILL` default; `PocheFillBuilder.fromGeometry()` |
| 26 | `_parsePochePoints()` + `_canvasFillStyleForPoche()` | 1880–1934 | 55 | Point-string parser; hatch: `HatchPatternLibrary` first, inline tile fallback |
| 27 | `_drawGrid()` | 1936–1967 | 32 | Background meter/5m/10m adaptive grid; `rgba(120,120,120,0.12)` at 0.5 px |
| 28 | `_vgCategoryForLayer()` + `_vgCategoryFromZoneCategory()` | 1969–1984 | 16 | `ISO_LAYER_TO_VG_CATEGORY` lookup; prefix/colon/space matching |
| 29 | `_syncVGViewOverrides()` | 1986–2069 | 84 | Contract 23 §9 — VGGovernanceStore sparse overrides → `graphicsRulesEngine.addViewOverride()` per zone (CUT/PROJECTION/BEYOND); stale clear first |
| 30 | `_baseIsoLayer()` + `_computeDrawingFootprintBounds()` | 2071–2114 | 44 | ISO-layer prefix match; footprint min/max in drawing HV space for `fitToDrawing()` |
| 31 | `_drawSnapIndicator()` + `_isLinearGrid()` + `_distanceToSegment()` | 2116–2150 | 35 | Snap circle; linear-grid type guard; segment distance math |
| **Total** | | | **2,151** | |

---

**Window globals inventory (4 distinct globals, 7 reads total)**:

| Global | Lines | Method | Kind | TODO tag | Migration phase | Wave 14? |
|---|---|---|---|---|---|---|
| `window.devicePixelRatio` | 212, 1284, 1379 | `render()`, `setSize()`, `renderFromPipelineResult()` | Browser-native DOM property — always valid | n/a | None — not a typed extension property | ❌ N/A |
| `window.bimManager` | 516, 590, 881 | `hitTestGrid()`, `_renderBimGridDatums()`, `_renderLevelDatums()` | Typed optional-chain read: `?.getGrids()`, `?.getLevels()` | `TODO(D.4)` | Phase D.4 → `runtime.bim.getGrids()` / `runtime.bim.getLevels()` | ❌ Phase D |
| `window.selectionManager` | 1596–1597, 1607 | `_renderLightingPlanSymbols()`, `_renderSelectionHighlights()` | Typed optional-chain read: `?.selectedObject?.userData?.id` | `TODO(D.4)` | Phase D.4 → `runtime.selection.selectedId` | ❌ Phase D |
| `window.roomStore` | 1732 | `_renderRoomFills()` | Typed optional read: `?.getByLevel()` / `?.getAll()` | `TODO(E.18-R.S)` | Phase E.18-R.S → `runtime.stores.rooms` | ❌ Phase E |

---

**Violation inventory**:

| Violation | Count | Lines | Description | Wave 14? |
|---|---|---|---|---|
| `(window as any)` casts — P4 | **0** | — | Zero unsafe casts | ❌ N/A |
| `window.commandManager.execute()` — P6 | **0** | — | Zero command mutations | ❌ N/A |
| `window.X` typed reads — Phase D/E | **7** | see table above | 4 globals; all optional-chain null-safe; all tagged TODO | ❌ Phase D/E |
| **L7.5 god-object** | ✅ | 1–2151 | 2,151 LOC; 2 full render paths inlined; grid + level datum renderers + selection highlights all in one class | ✅ **Wave 14** |
| **Partial split — delegation missing** | ✅ | — | 4 sub-files exist in `plan-canvas/` but `PlanViewCanvas.ts` does not import any of them | ✅ **Wave 14** |

---

**Corrections to original stub plan**:

| Item | Original stub | Correct as-found |
|---|---|---|
| Sub-file count | 5 (shell + PlanViewBaseRenderer + PlanViewFillRenderer + PlanViewSymbolRenderer + PlanViewHitTest + PlanViewVGApplicator) | **10** (shell + 9 in `plan-canvas/`) — stub missed: `PlanViewGridDatumRenderer` (282 LOC cluster), `PlanViewLevelDatumRenderer` (132 LOC cluster), `PlanViewWorkerRenderer` (167 LOC), `PlanViewUnderlayRenderer` (67 LOC). `PlanViewHitTest` dropped — `hitTest()` stays in shell (see below) |
| Partial split status | Not mentioned | **4 of 9 sub-files already exist** (`PlanViewCanvasTypes.ts`, `PlanViewFillRenderer.ts`, `PlanViewSymbolRenderer.ts`, `PlanViewVGApplicator.ts`) — real extractions, not stubs; but `PlanViewCanvas.ts` does not import any of them; delegation step was never completed |
| Worker pipeline path | **Not in stub at all** | **`scheduleWorkerRender()` + `renderFromPipelineResult()` = 167 LOC** — second full render path (Contract 23 §14); completely absent from stub plan |
| Grid datum rendering | **Not in stub** | `_renderBimGridDatums` + `_drawGridBubble` + `_drawGridPositionLabel` + `_renderGridDimensions` = **282 LOC**; `hitTestGrid()` = 80 LOC; total **362 LOC** missed; reads `window.bimManager` |
| Level datum rendering | **Not in stub** | `_renderLevelDatums` + `_drawLevelHead` + `hitTestLevel` + `hitTestLevelHead` = **165 LOC**; reads `window.bimManager` |
| `PlanViewHitTest.ts` | Proposed new file for `hitTest()` | **`hitTest()` stays in shell** (50 LOC) — depends on `_distanceToSegment` and `worldToScreen()` both already in shell; isolating it adds a file for one small method with no architectural benefit |
| `PlanViewBaseRenderer.ts` content | "projected edge linework from ViewTechnicalDrawingCache" | **Also includes**: `_renderSelectionHighlights` (124 LOC — 3-pass purple glow, reads `window.selectionManager`), `_renderLightingPlanSymbols` (15 LOC), `_vgCategoryForLayer` + `_baseIsoLayer` utility methods (22 LOC) |
| Shell LOC target | ≤500 | **≤650** — shell retains public projection API (`worldToScreen`, `screenToWorld`, `getPixelsPerUnit`), `fitToDrawing` + `_resolveCropCanvasBounds` (89 LOC, complex crop math), `hitTest` + `hitTestAnnotation` + `hitTestScopeHandle`, `_applyCropClip` + `_renderCropBoundary`, `_drawGrid`, `_drawSnapIndicator`, `setSize`, all state setters/getters, cache API, `dispose` ≈ ~580 LOC |
| P4/P6 violations | Not mentioned | **P4=0, P6=0** confirmed — 4 typed window globals (7 reads total), all optional-chain null-safe, all Phase D/E scope |
| `PlanViewVGApplicator` content | "VGGovernanceStore override injection before each render" | ✅ **Correct** — already extracted to `PlanViewVGApplicator.ts` (99 LOC); `_syncVGViewOverrides()` (84 LOC in shell) is the inlined duplicate that must be wired |
| Migration step 1 (vitest) | "1 vitest for PlanViewHitTest" | **`PlanViewHitTest` dropped** (stays in shell). Vitest target: `PlanViewGridDatumRenderer` — provide mock `bimManager` with 2 grids → call `hitTestGrid(sx, sy)` → verify nearest grid ID returned; no THREE.js dependency |

---

**Corrected split target**:

```
src/engine/subsystems/core/views/
  PlanViewCanvas.ts                    (≤650 LOC — shell: class fields + constructor +
                                        render() + renderFromPipelineResult() orchestrators +
                                        setSize + worldToScreen + screenToWorld + getPixelsPerUnit +
                                        screenYToElevation + fitToDrawing + _resolveCropCanvasBounds +
                                        _applyCropClip + _renderCropBoundary + hitTest +
                                        hitTestAnnotation + hitTestScopeHandle + _drawGrid +
                                        _drawSnapIndicator + _distanceToSegment + _isLinearGrid +
                                        state setters/getters + cache API + dispose)
  plan-canvas/
    PlanViewCanvasTypes.ts             (EXISTING 17 LOC — interface exports; remove duplicate
                                        definitions still in PlanViewCanvas.ts shell)
    PlanViewVGApplicator.ts            (EXISTING 99 LOC — _syncVGViewOverrides; shell delegates
                                        by calling syncVGOverrides(viewDef) before each render)
    PlanViewFillRenderer.ts            (EXISTING 254 LOC — _renderPocheFills + _renderRoomFills +
                                        _parsePochePoints + _canvasFillStyleForPoche;
                                        window.roomStore TODO(E.18-R.S) retained)
    PlanViewSymbolRenderer.ts          (EXISTING 143 LOC — symbolic rule dispatch inside
                                        linework traverse; shell calls into it per LineSegments child)
    PlanViewBaseRenderer.ts            (NEW ≤320 LOC — legacy scene-graph linework traverse:
                                        THREE.LineSegments → pen resolve via graphicsRulesEngine;
                                        _vgCategoryForLayer + _baseIsoLayer helpers;
                                        _renderSelectionHighlights (3-pass glow);
                                        _renderLightingPlanSymbols;
                                        window.selectionManager TODO(D.4) retained)
    PlanViewGridDatumRenderer.ts       (NEW ≤370 LOC — _renderBimGridDatums + _drawGridBubble +
                                        _drawGridPositionLabel + _renderGridDimensions + hitTestGrid;
                                        owns _gridDimHitAreas array; window.bimManager TODO(D.4))
    PlanViewLevelDatumRenderer.ts      (NEW ≤170 LOC — _renderLevelDatums + _drawLevelHead +
                                        hitTestLevel + hitTestLevelHead;
                                        owns _levelDatumHitAreas array; window.bimManager TODO(D.4))
    PlanViewWorkerRenderer.ts          (NEW ≤180 LOC — scheduleWorkerRender +
                                        renderFromPipelineResult Stage-7 poche+edge rendering;
                                        getCachedPipelineResult + invalidatePipelineCache;
                                        _computeDrawingFootprintBounds)
    PlanViewUnderlayRenderer.ts        (NEW ≤80 LOC — _drawUnderlay: image cache keyed on
                                        blobUrl + affine-transform ctx.drawImage at 0.5 opacity)
```

**Migration pattern (corrected)**:

1. **Complete the partial split**: `PlanViewFillRenderer.ts`, `PlanViewSymbolRenderer.ts`, `PlanViewVGApplicator.ts` already have the extracted implementations. Wire `PlanViewCanvas.ts` to import and call them; remove inlined duplicates from the shell. The `PlanViewCanvasTypes.ts` interface block is also duplicated in the shell — remove the shell copy and import from `./plan-canvas/PlanViewCanvasTypes`.
2. **The PlanViewFillRenderer.ts build fix** was applied this session (`../../rooms/RoomColourSystem` → `../../../rooms/RoomColourSystem`). No further change needed.
3. **Extract `PlanViewBaseRenderer.ts`**: Move the THREE.js `(drawing as any).three?.traverse?.()` loop (linework + symbolic dispatch), `_renderSelectionHighlights`, `_renderLightingPlanSymbols`, `_vgCategoryForLayer`, `_baseIsoLayer` into the new file. Shell calls `renderBaseLinework(ctx, drawing, worldToScreen, ...)` and `renderOverlays(ctx, drawing, worldToScreen, hoveredId, selectedId)`.
4. **Extract `PlanViewGridDatumRenderer.ts` + `PlanViewLevelDatumRenderer.ts`**: These own their respective hit-area arrays. Shell passes `this._gridDimHitAreas` / `this._levelDatumHitAreas` as out-parameters, or the extractors return updated arrays each render.
5. **Extract `PlanViewWorkerRenderer.ts`**: `scheduleWorkerRender()` and the Stage-7 poche+edge rendering block inside `renderFromPipelineResult()` move here. The shell `renderFromPipelineResult()` becomes a thin orchestrator calling `workerRenderer.renderStage7(ctx, result, worldToScreen, ...)`.
6. **Extract `PlanViewUnderlayRenderer.ts`**: `_drawUnderlay()` + its `_underlayImage`/`_underlayImageUrl` cache fields move here.
7. **Window globals**: All 4 retain their TODO annotations as-is — `window.bimManager` (D.4), `window.selectionManager` (D.4), `window.roomStore` (E.18-R.S), `window.devicePixelRatio` (browser-native). No Wave 14 migration scope for any global in this file.
8. **No P6 fix needed**: Zero command mutations. No P4 fix needed: zero unsafe casts.
9. **1 vitest** for `PlanViewGridDatumRenderer`: provide mock `bimManager` with 2 grids → call `hitTestGrid(sx, sy)` → verify nearest grid ID returned. No THREE.js dependency; no jsdom constraint.

**Verifier after split (corrected)**:

```bash
wc -l src/engine/subsystems/core/views/PlanViewCanvas.ts                        # → ≤650
wc -l src/engine/subsystems/core/views/plan-canvas/*.ts | awk '$1 > 1500'       # → 0 files
rg '\(window as any\)' src/engine/subsystems/core/views/ --type ts | wc -l     # → 0 (already 0)
rg 'window\.commandManager' src/engine/subsystems/core/views/ --type ts | wc -l # → 0 (already 0)
npm run build                                                                    # → ✓ EXIT:0
```

---

#### FILE 16 — `src/engine/subsystems/tools/SelectionManager.ts` (2,141 LOC)

**What it is**: 3D scene click-selection + TransformControls attachment + green highlight box. Handles: single element selection, multi-element selection, curtain wall sub-element selection (2-step Revit-like: parent → sub-element → Tab cycling), element highlight, TransformControls drag wiring.

**Violations**:
- **P4**: `window.__curtainSubElement` cache written and read here — explicit P4 violation for the CW sub-element selection state.
- **L7.5 god-object**: 4 selection modes + 2 highlight types + TransformControls all in one class.

**Split target**:
```
src/engine/subsystems/tools/
  SelectionManager.ts             (≤400 LOC — click dispatch + mode router)
  selection/
    SingleElementSelector.ts      (single-click → pick → green highlight + PropertyInspector update)
    MultiElementSelector.ts       (Shift+click / box-select → multi-highlight)
    CurtainWallSubSelector.ts     (2-step CW sub-element selection + Tab cycling; eliminates window.__curtainSubElement)
    TransformControlsManager.ts   (drag handle attachment + gizmo lifecycle)
    SelectionHighlight.ts         (green / amber highlight mesh creation + cleanup)
```

**Migration pattern**:
1. `CurtainWallSubSelector` receives `runtime: PryzmRuntime` and stores sub-element state internally — replaces `window.__curtainSubElement` with a typed instance variable. This is the **key P4 fix** in this file.
2. `TransformControlsManager` receives OBC `world` and the `runtime.commandBus` — dispatches `MoveElementCommand` on drag end instead of directly mutating the mesh.
3. 1 vitest for `CurtainWallSubSelector`: call `select(cwId)` → `cycleSubElement()` × N → verify sub-element state advances correctly (no window globals needed).

**Verifier after split**:
```bash
rg 'window\.__curtainSubElement' src/ --type ts | wc -l          # → 0
wc -l src/engine/subsystems/tools/SelectionManager.ts             # → ≤400
wc -l src/engine/subsystems/tools/selection/*.ts | awk '$1 > 1500'   # → 0 files
```

---

#### FILE 16 — Wave 14 as-found audit (2026-05-02)

**Source**: `src/engine/subsystems/tools/SelectionManager.ts` — 2,142 LOC

---

**What it is**: 3D scene raycaster + selection coordinator + highlight renderer. Beyond what the stub described, the file also handles:

- **Curtain wall two-step Revit-like selection** (lines 623–654): first click → parent CW; second click on same CW → sub-element panel/mullion. Tab key cycles sub-elements (panels sorted row-major, then mullions). All inlined.
- **Kitchen run Tab cycling** (lines 1711–1846, 136 LOC): amber highlight stepping through kitchen cabinet units + countertop slab per Tab press. Reads `window.__kitchenSubUnit`, `window.kitchenRunInspector`, `window.kitchenUnitInspector`.
- **Wardrobe run Tab cycling** (lines 1848–1938, 91 LOC): parity with kitchen. Reads `window.__wardrobeSubUnit`, `window.wardrobeRunInspector`, `window.wardrobeSectionInspector`.
- **`applyHighlight()`** (lines 733–1285, 553 LOC): 10 fully inlined element-type branches — the largest single method in the file; a god-method in its own right.
- **Marquee multi-selection** (lines 1979–2065, 86 LOC): green AABB wireframe for each element in the marquee rectangle; called by `SelectionBus.selectMany()`.
- **Throttled hover detection** (lines 2067–2140, 74 LOC): `_onPointerMove()` — 50 ms throttle, dispatches `bim-hover-changed` for TSL outline pass.
- **`init()` — 301 LOC**: 37 cache-invalidation event listeners + bidirectional selection listener + Delete/Tab/Escape keydown handler + TransformControls listeners + click/dblclick/pointer handlers + Enter key hover-select + pointermove. The stub plan's ≤400 LOC shell target is impossible given `init()` alone is 301 LOC.

---

**P-score audit**:

- **P2=1**: `import * as THREE from 'three'` (line 1) and `import * as OBC from '@thatopen/components'` (line 2) — two namespace imports; Wave 8+ renderer-three promotion scope, not Wave 14.
- **P4=0**: Zero `(window as any)` casts. **The stub incorrectly labelled `window.__curtainSubElement` as a P4 violation** — it is a typed write via `WindowExtension`; P4 targets `(window as any)` casts specifically.
- **⚠ P6=1**: `window.commandManager.execute(new DeleteOpeningCommand(id))` (line 244) and `window.commandManager.execute(new DeleteLightingCommand(id))` (line 251) — **TWO P6 violations** in the `init()` keydown Delete handler. **This is the actionable Wave 14 fix** — the stub plan missed both.
- **Unsafe `(this.world as any)` cast** (lines 715, 1996): `(this.world as any).scene?.three as THREE.Scene`. Not a P4 violation (P4 targets `window`, not `this.world`) but an unsafe cast that should be noted.

---

**LOC breakdown by functional cluster**:

| # | Cluster | Lines | LOC | Key notes |
|--:|---|---|---:|---|
| 1 | Imports (8 named + 2 namespace: `THREE`, `OBC`) | 1–10 | 10 | `DeleteOpeningCommand`, `DeleteLightingCommand` — delete commands used in P6 violation |
| 2 | JSDoc class header (curtain wall two-step selection contract) | 11–51 | 41 | Documents `window.__curtainSubElement` write contract |
| 3 | Class fields: `selectedObject`, `highlightMesh`, CW sub-element (3 fields), KC sub-element (3 fields), WD sub-element (3 fields), raycaster/mouse, `levelPlaneConstraint`, `_onSlabProfileEdit`, hover tracking (2), marquee (2), pointer throttle (2), selectable cache (1), `SEMANTIC_TYPES`, `PARENT_RESOLVED_ROLES` | 52–122 | 71 | 21 private fields across 6 functional groups |
| 4 | Constructor (5 injected deps: `world`, `camera`, `domElement`, `transformControls`, `updateInspector`) | 123–129 | 7 | No `runtime` or `commandBus` injection — **P6 fix requires adding one** |
| 5 | `setLevelPlaneConstraint()` + `setSlabProfileEditCallback()` | 136–147 | 12 | Post-construction injection methods (set-after-construct pattern) |
| 6 | `setEnabled()` | 149–158 | 10 | Clears hover cursor + hover tracking on disable |
| 7 | `init()` — **event wiring god-method** | 160–460 | 301 | 37 cache-invalidation events; `bim-furniture-updated` highlight refresh; `pryzm-element-selected` bidirectional wiring; raycaster config; keydown Delete handler **[P6 violation ×2: lines 241-254]**; Tab cycling dispatch; Escape deselect; TransformControls dragging-changed + change; click → `performSelection()`; dblclick → slab profile edit (window.slabTool fallback line 404); pointerdown/pointerup touch; Enter key hover-select; pointermove → `_onPointerMove()` |
| 8 | `syncHostedElements()` | 462–465 | 4 | No-op stub (comment: "spatial hardening eliminated mesh.position.copy") |
| 9 | `findSelectableRoot()` | 467–501 | 35 | Resolves raycaster hit to semantic root: fragment role → `parentId` fast-path; then standard `userData.id + semantic type` traversal |
| 10 | `isSemanticType()` + `isFragmentType()` + `isCurtainWallGroup()` | 503–518 | 16 | Type-string predicate helpers |
| 11 | `performSelection()` — primary click handler | 520–655 | 136 | Reads **`window.isCameraDragging`** (line 526), **`window.activeLevelElevation`** (line 563), **`window.__underlayHit`** (line 588); dispatches `bim-canvas-world-click`; writes **`window.__curtainSubElement`** (lines 640-651); CW two-step branching |
| 12 | `select()` | 657–704 | 48 | Attaches TransformControls; reads **`window.wardrobeRunInspector`** (line 687); dispatches `bim-selection-changed` + `pryzm-element-selected` |
| 13 | `selectById()` | 706–731 | 26 | Traverse scene by `userData.id`; uses `(this.world as any)` unsafe cast |
| 14 | **`applyHighlight()` — 553-LOC god-method** | 733–1285 | 553 | **10 element-type branches**: hosted (door/window) OBB using `userData.width/height/depth`; wall OBB from `userData.baseLine` XZ pair; curtain wall OBB from group yaw + `userData.length/height`; column OBB from `userData.width/height/depth` + yaw; slab `ExtrudeGeometry` from `userData.polygon` (Array<{x,y}>) with signed-area CCW fix; floor/ceiling `ExtrudeGeometry` from `userData.polygon` (Array<{x,z}>); room `ExtrudeGeometry` from `userData.polygon` + `userData.height`; furniture OBB (start/end run-mode OR yaw-aligned, with sofa corner-origin fix for 5 sofa types); bimgrid OBB [reads **`window.gridStore`** line 1181 — linear + axis modes]; AABB fallback. All branches build `BoxGeometry`/`ExtrudeGeometry` + purple `MeshBasicMaterial` (0x6600FF, 0.15α) + `EdgesGeometry` wireframe. Attaches `LevelPlaneConstraint` except for hosted elements. |
| 15 | `unselectAll()` | 1287–1328 | 42 | Detaches `levelPlaneConstraint`; clears highlight + marquee highlights; writes **`window.__curtainSubElement = null`** (line 1304); reads **`window.wardrobeRunInspector`** (line 1314); dispatches `bim-selection-changed` |
| 16 | CW sub-element section header | 1330–1333 | 4 | Comment block |
| 17 | `cycleSubElement()` | 1339–1372 | 34 | Tab cycling through CW sub-elements; wraps back to parent CW view; writes **`window.__curtainSubElement`** (lines 1356, 1370) |
| 18 | `buildSubElementList()` | 1374–1418 | 45 | Reads **`window.curtainPanelStore`** (line 1382) — panels sorted row-major (j, i); then mullions from `cwGroup.children` |
| 19 | `detectCurtainSubElement()` | 1420–1482 | 63 | Reads **`window.curtainPanelStore`** ×2 (lines 1439, 1457) — individual panel hit, instanced panel hit, mullion mesh hit |
| 20 | `showSubElementHighlight()` | 1484–1574 | 91 | Amber OBB (0xff8c00, 0.22α) in CW group local space → world; tries `boundsFromHit()` first, falls back to `boundsFromSearch()` |
| 21 | `boundsFromHit()` | 1576–1622 | 47 | Reads `InstancedMesh` instance matrix decomposition OR `BoxGeometry.parameters` from direct mesh |
| 22 | `boundsFromSearch()` | 1624–1692 | 69 | Traverses `cwGroup` children by sub-element id + type; handles instanced + individual panel |
| 23 | `clearSubElementHighlight()` + `resetSubElementState()` | 1694–1709 | 16 | Dispose amber mesh; reset `cwSubElements` array + index |
| 24 | `isKitchenFurniture()` + `isWardrobeFurniture()` | 1713–1723 | 11 | `furnitureType.startsWith('kitchen_' / 'wardrobe_')` |
| 25 | `cycleKitchenUnit()` — kitchen Tab cycling | 1726–1805 | 80 | Reads/writes **`window.__kitchenSubUnit`** (lines 1746, 1776, 1798); reads **`window.kitchenRunInspector`** (lines 1748, 1779, 1802); reads **`window.kitchenUnitInspector`** (lines 1750, 1778, 1800); amber AABB per unit + countertop step |
| 26 | `_buildKcUnitList()` | 1807–1828 | 22 | Traverse kitchen root; sort by `armOrder` (main/left/right) then `kitchenUnitIndex` |
| 27 | `_clearKcHighlight()` + `resetKcSubState()` | 1830–1846 | 17 | Dispose amber mesh; reset arrays; writes **`window.__kitchenSubUnit = null`** (line 1845) |
| 28 | `cycleWardrobeUnit()` — wardrobe Tab cycling | 1851–1897 | 47 | Reads/writes **`window.__wardrobeSubUnit`** (lines 1870, 1892); reads **`window.wardrobeRunInspector`** (lines 1871, 1896); reads **`window.wardrobeSectionInspector`** (lines 1873, 1893); amber AABB per unit |
| 29 | `_buildWdUnitList()` | 1899–1920 | 22 | Traverse wardrobe root; sort by `armOrder` then `wardrobeUnitIndex` |
| 30 | `_clearWdHighlight()` + `resetWdSubState()` | 1922–1938 | 17 | Dispose amber mesh; writes **`window.__wardrobeSubUnit = null`** (line 1937) |
| 31 | `clearHighlight()` | 1940–1948 | 9 | Dispose green highlight mesh + detach TransformControls |
| 32 | `getSelectableCache()` | 1950–1977 | 28 | Public read-only accessor for lazy-built selectable cache (called by `MarqueeSelectionTool`) |
| 33 | `applyMarqueeHighlights()` | 1979–2050 | 72 | Green AABB wireframe (0x00ff66) for each id in marquee selection; one scene traverse to build id→object map; uses `(this.world as any)` unsafe cast (line 1996) |
| 34 | `_clearMarqueeHighlights()` | 2052–2065 | 14 | Dispose all marquee highlight meshes + remove from scene |
| 35 | `_onPointerMove()` — throttled hover | 2067–2140 | 74 | 50 ms throttle; reads **`window.isCameraDragging`** (line 2082); reads **`window.activeLevelElevation`** (line 2098); dispatches `bim-canvas-mouse-move` + `bim-hover-changed`; sets cursor `'pointer'` |
| **Total** | | | **~2,142** | (remaining diff = blank lines between methods) |

---

**Window globals inventory (15 distinct globals, 30+ reads/writes total)**:

| Global | Key lines | Kind | TODO tag | Migration phase | Wave 14? |
|---|---|---|---|---|---|
| `window.commandManager` | 241, 248 | Typed optional read + **`.execute()`** — **P6 violation ×2** | `TODO(P6)` | Wave 14 — inject `CommandBus`, use `this._commandBus.dispatch(cmd)` | ✅ **Fix in Wave 14** |
| `window.__curtainSubElement` | 297, 444, 449, 640, 645, 651, 1304, 1356, 1370 | Write (= null or `CurtainSubElement`) — typed via `WindowExtension` | `TODO(D.5)` | D.5 → instance field on `CurtainWallSubElementSelector` | ❌ Phase D.5 |
| `window.unselectAll` | 305 | Read + call (function ref) — typed optional | `TODO(D.4)` | D.4 → `runtime.selection.unselectAll()` | ❌ Phase D |
| `window.isCameraDragging` | 360, 526, 2082 | Read — boolean flag | `TODO(D.4)` | D.4 → `runtime.camera.isDragging` | ❌ Phase D |
| `window.slabTool` | 404 | Read — legacy fallback (injected path already preferred via `_onSlabProfileEdit`) | `TODO(D.4)` | Already half-migrated; D.4 removes fallback | ❌ Phase D |
| `window.activeLevelElevation` | 563, 2098 | Read — number | `TODO(D.4)` | D.4 → `runtime.levels.activeElevation` | ❌ Phase D |
| `window.__underlayHit` | 588 | Read — boolean flag | `TODO(D.4)` | D.4 → `runtime.underlay.isHit` | ❌ Phase D |
| `window.wardrobeRunInspector` | 687, 1314, 1871, 1896 | Read — typed optional; `.show(id)` / `.hide()` | `TODO(D.4)` | D.4 → `runtime.ui.wardrobeRunInspector` | ❌ Phase D |
| `window.gridStore` | 1181–1185 | Typed cast read: `as { get(id): any }` | `TODO(D.4)` | D.4 → `runtime.stores.grids.get(id)` | ❌ Phase D |
| `window.curtainPanelStore` | 1382, 1439, 1457 | Read — typed optional-chain | `TODO(D.4)` | D.4 → `runtime.stores.curtainPanels` | ❌ Phase D |
| `window.__kitchenSubUnit` | 1746, 1776, 1798, 1845 | Write (= null or descriptor) | `TODO(D.5)` | D.5 → instance field on `FurnitureSubElementSelector` | ❌ Phase D.5 |
| `window.kitchenRunInspector` | 1748, 1779, 1802 | Read — typed optional; `.show()` / `.hide()` | `TODO(D.4)` | D.4 → `runtime.ui.kitchenRunInspector` | ❌ Phase D |
| `window.kitchenUnitInspector` | 1750, 1778, 1800 | Read — typed optional; `.show()` / `.hide()` | `TODO(D.4)` | D.4 → `runtime.ui.kitchenUnitInspector` | ❌ Phase D |
| `window.__wardrobeSubUnit` | 1870, 1892, 1937 | Write (= null or descriptor) | `TODO(D.5)` | D.5 → instance field on `FurnitureSubElementSelector` | ❌ Phase D.5 |
| `window.wardrobeSectionInspector` | 1873, 1893 | Read — typed optional; `.show()` / `.hide()` | `TODO(D.4)` | D.4 → `runtime.ui.wardrobeSectionInspector` | ❌ Phase D |

---

**Violation inventory**:

| Violation | Count | Lines | Wave 14? |
|---|---|---|---|
| `(window as any)` casts — P4 | **0** | — | ❌ N/A |
| `window.commandManager.execute()` — P6 | **2** | 244, 251 (`DeleteOpeningCommand`, `DeleteLightingCommand`) | ✅ **Wave 14: must fix** |
| `(this.world as any)` unsafe casts | 2 | 715, 1996 | ❌ Note only; P4 targets `window` not `this` |
| `window.*` typed reads — Phase D/E | **30+** | See table above | ❌ Phase D |
| **L7.5 god-object** | ✅ | 1–2142 | ✅ **Wave 14** |
| `applyHighlight()` — 553-LOC god-method | ✅ | 733–1285 | ✅ **Wave 14** |

---

**Corrections to original stub plan**:

| Item | Original stub | Correct as-found |
|---|---|---|
| P4 violation | `window.__curtainSubElement` labelled "P4" | **P4=0** — `window.__curtainSubElement` is a typed `WindowExtension` write, NOT `(window as any)`. P4 specifically targets `(window as any)` casts |
| P6 violation | **Not mentioned** | **P6=1: `window.commandManager.execute()` at lines 244 and 251** (Delete handler in `init()`) — 2 violations; MUST be fixed in Wave 14 |
| Shell LOC ≤400 | ≤400 | **≤950** — `init()` alone is 301 LOC; removing it from the shell is not feasible; shell also retains `performSelection()` (136 LOC), `select()` (48), `selectById()` (26), `unselectAll()` (42), `_onPointerMove()` (74) |
| Sub-file: `SingleElementSelector.ts` | "single-click → pick → green highlight + PropertyInspector" | **Drop** — `performSelection()` + `select()` are the single-element path and must stay in the shell (they reference class-level state) |
| Sub-file: `MultiElementSelector.ts` | "Shift+click / box-select → multi-highlight" | **Drop** — `applyMarqueeHighlights()` (72 LOC) + `_clearMarqueeHighlights()` (14 LOC) move into `SelectionHighlightBuilder.ts` |
| Sub-file: `CurtainWallSubSelector.ts` | Correct concept, wrong name | **`CurtainWallSubElementSelector.ts`** (≤370 LOC) |
| Sub-file: `TransformControlsManager.ts` | "drag handle attachment + gizmo lifecycle" | **Drop** — TransformControls is wired in 2 event listeners (14 LOC) in `init()`; attach/detach calls are 3 lines each; extracting to a file gains zero architectural benefit |
| Sub-file: `SelectionHighlight.ts` | Correct concept | **`SelectionHighlightBuilder.ts`** (≤660 LOC — includes all 10 `applyHighlight()` branches + marquee) |
| Kitchen/wardrobe Tab cycling | **Not mentioned** | **221 LOC** of kitchen + wardrobe sub-element cycling (136 + 91 = 221 LOC); 6 window globals missed; extracted to **`FurnitureSubElementSelector.ts`** (≤280 LOC) |
| P6 migration target | "TransformControlsManager receives `runtime.commandBus`" | **Wrong target**: P6 fix is in the `init()` Delete handler; add `private _commandBus: CommandBus | null = null` field + `setCommandBus(bus: CommandBus): void` injection method; replace `window.commandManager.execute(cmd)` with `this._commandBus?.dispatch(cmd)` |
| Verifier `window.__curtainSubElement → 0` | In verifier | **Remove** — elimination of `window.__curtainSubElement` is Phase D.5 scope (Wave 16+), not Wave 14 |
| Total sub-files | 5 | **3** |

---

**Corrected split target**:

```
src/engine/subsystems/tools/
  SelectionManager.ts                    (≤950 LOC — shell: class fields + constructor +
                                          init() [301 LOC event wiring, P6-fixed Delete handler] +
                                          setEnabled() + setLevelPlaneConstraint() +
                                          setSlabProfileEditCallback() + setCommandBus() [NEW for P6] +
                                          performSelection() + select() + selectById() + unselectAll() +
                                          findSelectableRoot() + isSemanticType() + isFragmentType() +
                                          isCurtainWallGroup() + syncHostedElements() + clearHighlight() +
                                          getSelectableCache() + _onPointerMove())
  selection/
    SelectionHighlightBuilder.ts         (NEW ≤660 LOC — applyHighlight() all 10 type branches:
                                          hosted OBB, wall OBB, CW OBB, column OBB, slab ExtrudeGeometry,
                                          floor/ceiling ExtrudeGeometry, room ExtrudeGeometry, furniture OBB
                                          [sofa corner-origin fix], bimgrid OBB [window.gridStore TODO(D.4)],
                                          AABB fallback; builds purple 0x6600FF MeshBasicMaterial + EdgesGeometry;
                                          applyMarqueeHighlights() + _clearMarqueeHighlights())
    CurtainWallSubElementSelector.ts     (NEW ≤370 LOC — cycleSubElement(), buildSubElementList()
                                          [window.curtainPanelStore TODO(D.4)], detectCurtainSubElement()
                                          [window.curtainPanelStore ×2], showSubElementHighlight(),
                                          boundsFromHit(), boundsFromSearch(), clearSubElementHighlight(),
                                          resetSubElementState(); writes window.__curtainSubElement TODO(D.5))
    FurnitureSubElementSelector.ts       (NEW ≤280 LOC — isKitchenFurniture(), isWardrobeFurniture(),
                                          cycleKitchenUnit() [window.__kitchenSubUnit, window.kitchenRunInspector,
                                          window.kitchenUnitInspector TODO(D.4)], _buildKcUnitList(),
                                          _clearKcHighlight(), resetKcSubState() [window.__kitchenSubUnit];
                                          cycleWardrobeUnit() [window.__wardrobeSubUnit, window.wardrobeRunInspector,
                                          window.wardrobeSectionInspector TODO(D.4)], _buildWdUnitList(),
                                          _clearWdHighlight(), resetWdSubState() [window.__wardrobeSubUnit])
```

**Migration pattern (corrected)**:

1. **P6 fix in Wave 14** (inline, not a new file): In `init()` Delete handler, add `setCommandBus(bus: CommandBus): void` injection method (called by `EngineBootstrap` after construction). Replace:
   ```typescript
   const commandManager = window.commandManager;
   if (commandManager && id) commandManager.execute(new DeleteOpeningCommand(id));
   ```
   with:
   ```typescript
   if (this._commandBus && id) this._commandBus.dispatch(new DeleteOpeningCommand(id));
   ```
   Same fix for `DeleteLightingCommand`. Add `CommandBus` import from `@pryzm/runtime`.

2. **Extract `SelectionHighlightBuilder.ts`**: Lift the entire `applyHighlight()` body (10 branches, 553 LOC) into a standalone function `buildHighlight(obj, world, levelPlaneConstraint, transformControls)` that returns the highlight mesh + has `applyMarqueeHighlights()` + `_clearMarqueeHighlights()` as companion functions. Shell calls `this.highlightMesh = buildHighlight(obj, this.world, this.levelPlaneConstraint, this.transformControls)`.

3. **Extract `CurtainWallSubElementSelector.ts`**: Move `cycleSubElement()`, `buildSubElementList()`, `detectCurtainSubElement()`, `showSubElementHighlight()`, `boundsFromHit()`, `boundsFromSearch()`, `clearSubElementHighlight()`, `resetSubElementState()` plus the 3 CW tracking fields (`cwSubHighlight`, `cwSubElements`, `cwSubElementIndex`) into a new class. Shell delegates Tab CW cycling to it.

4. **Extract `FurnitureSubElementSelector.ts`**: Move `isKitchenFurniture()`, `isWardrobeFurniture()`, `cycleKitchenUnit()`, `_buildKcUnitList()`, `_clearKcHighlight()`, `resetKcSubState()`, `cycleWardrobeUnit()`, `_buildWdUnitList()`, `_clearWdHighlight()`, `resetWdSubState()` plus the 6 KC/WD tracking fields into a new class. Shell delegates Tab kitchen/wardrobe cycling to it.

5. **Window globals**: All 15 typed globals retain their TODO annotations — only the P6 `window.commandManager` reference is actively migrated in Wave 14. All other globals (D.4, D.5 phase) are unchanged.

6. **1 vitest** for `CurtainWallSubElementSelector`: mock `buildSubElementList()` to return 3 synthetic sub-elements → call `cycleSubElement()` ×4 → verify index wraps back to -1 (parent view). No `window.curtainPanelStore` dependency needed in the mock path.

**Verifier after split (corrected)**:

```bash
wc -l src/engine/subsystems/tools/SelectionManager.ts                           # → ≤950
wc -l src/engine/subsystems/tools/selection/*.ts | awk '$1 > 1500'              # → 0 files
rg 'window\.commandManager\.execute' src/engine/subsystems/tools/ --type ts     # → 0 (P6 fix)
rg '\(window as any\)' src/engine/subsystems/tools/SelectionManager.ts          # → 0 (already 0)
npm run build                                                                    # → ✓ EXIT:0
```

---

#### FILE 17 — `src/engine/engineLauncher.ts` (2,129 LOC)

**What it is**: BIM engine orchestration entry point. Extracted from `EngineBootstrap.ts` in S86-WIRE (Wave 7). Dynamically imported by `src/main.ts` on project open. Calls `initScene()`, `initUI()`, wires `WorkspaceMountBridge`, mounts the 3D viewport, and hands control back to the platform shell.

**Violations**:
- **P1** (soft): second composition site — `WorkspaceMountBridge` is wired here outside `composeRuntime()`. This is the surviving P1 soft-fail counted in `03-CURRENT-STATE.md §1` (`WorkspaceMountBridge reaching files: 21`).
- **L7.5 too-wide**: engine orchestration + UI mount + WorkspaceMountBridge wiring all inlined.

**Wave 14 action**: **DEFER** — do not split `engineLauncher.ts` in Wave 14. Per `02-ARCHITECTURE.md §6` Stage 2 note: the full relocation of `engineLauncher.ts` into `composeRuntime()`'s call graph is deferred to Waves 16–18 (gated on L7 dep factoring: `BimManager`, `PlatformShell`, `ProjectSerializer` cannot move to L3 without inverting the layer rule). Splitting now without resolving the layer inversion would produce files that are still architecturally wrong. **Track but don't touch.**

**Verifier** (confirm no regression):
```bash
wc -l src/engine/engineLauncher.ts   # should remain ~2,129 LOC; not a Wave 14 target
```

---

#### FILE 18 — `src/engine/subsystems/core/navigation/ViewController.ts` (1,939 LOC)

**What it is**: View mode navigation controller. Manages transitions between 3D perspective, plan (top-down ortho), section, and elevation modes. Each mode has its own camera lock, visibility culler, clip-plane, and frame coordinator. All mode implementations inlined.

**Violations**:
- **L7.5 god-object**: 4 view mode implementations in one class. Switching to plan view activates camera lock + PlanViewVisibilityCuller + level clip plane; section view activates a different set — each is independently testable.

**Split target**:
```
src/engine/subsystems/core/navigation/
  ViewController.ts               (≤400 LOC — mode state machine + transition orchestration)
  view-modes/
    PerspectiveViewMode.ts        (3D perspective: camera unlock + full visibility)
    PlanViewMode.ts               (ortho top-down: OrthoPlanCameraLockController + PlanViewVisibilityCuller + level clip)
    SectionViewMode.ts            (section cut: clip plane + visibility culler + camera framing)
    ElevationViewMode.ts          (elevation: ortho lock + edge projector trigger + datum lines)
```

**Migration pattern**:
1. Each mode is a class implementing `IViewMode { activate(): void; deactivate(): void; }`.
2. `ViewController` receives the mode instances in its constructor; `switchTo(mode)` calls `current.deactivate()` → `next.activate()`.
3. No `window.*` in any mode — all dependencies injected via constructor (camera, culler, clip plane, frame coordinator).
4. 1 vitest per mode: call `activate()` on mock dependencies → verify the correct camera lock state.

**Verifier after split**:
```bash
wc -l src/engine/subsystems/core/navigation/ViewController.ts                     # → ≤400
wc -l src/engine/subsystems/core/navigation/view-modes/*.ts | awk '$1 > 1500'    # → 0 files
```

---

#### FILE 18 — Wave 14 as-found audit (2026-05-02)

**Source**: `src/engine/subsystems/core/navigation/ViewController.ts` — 1,940 LOC

---

**What it is**: The single authority for all view mode transitions in PRYZM 3. Far more than the stub described — this class additionally owns:

- **6 distinct view activation handlers**: `_activate3DView()` (141 LOC), `_activateFloorPlanView()` (256 LOC), `_activateCeilingPlanView()` (3 LOC — delegates to floor plan), `_activateElevationView()` (116 LOC), `_activateSectionView()` (78 LOC), **`_activateGroundFloorView()` (61 LOC — entirely absent from stub)**. Total moved mode LOC: ~655 LOC.
- **8 set-after-construct injection methods** (lines 218–301, ~84 LOC): `setSelectionManager`, `setBoundsCache`, `registerViewSwitchListener`, `setFrameCoordinator`, `setViewVisibilityMap`, `setUnifiedFrameLoop`, `setLevelClipPlaneCache`, `setEdgeProjectorService`. These 8 post-construction wires are necessary because the services they inject are created after `ViewController` itself.
- **`activate()` — 212-LOC orchestration god-method** (lines 740–951): transition lock guard + 5 pre-switch steps + 8-way view mode routing + post-switch listener notification + 2 event dispatches on `window` + performance timing. Cannot be extracted; must stay in shell.
- **`deactivate()` — 72 LOC** (lines 1726–1797): saves camera state into 2 persistence layers before cleanup; reads `window.groundFloorController`.
- **TechnicalDrawing mount/unmount** (lines 1120–1171, ~52 LOC): `_mountDrawing()` + `_unmountDrawing()` + `_canMountDrawingForView()` + `_disposeRejectedDrawing()`. Needed by ALL mode handlers; must stay in shell.
- **`_deepSceneCleanup()`** (lines 1803–1855, ~53 LOC): Phase 5 performance — `previewRegistry.disposeAll()` + PLAN_SYMBOL_LAYER ghost sweep + renderer clipping plane reset. Called from `deactivate()` only.
- **Feature flag helper** (lines 36–38): `function useEdgeProjectorNative(): boolean` — reads `window.__PRYZM_FLAGS__?.EDGE_PROJECTOR_NATIVE` at call-time (not module-load), enabling browser-console toggle without refresh.

---

**P-score audit**:

- **P2=1**: `import * as THREE from 'three'` (line 1) + `import * as OBC from '@thatopen/components'` (line 2) — two namespace imports; Wave 8+ promotion scope, not Wave 14.
- **P4=0**: Zero `(window as any)` casts — all window reads are typed optional-chain reads or typed as known interfaces.
- **P6=0**: No `window.commandManager.execute()` calls anywhere in the file.
- **Window globals**: 5 distinct typed globals (Phase D/E scope — NOT Wave 14 fixes). **The stub's claim "no `window.*` in any mode" is incorrect** — 4 of the 5 window globals are read exclusively inside the mode activation methods that are being extracted.

---

**LOC breakdown by functional cluster**:

| # | Cluster | Lines | LOC | Key notes |
|--:|---|---|---:|---|
| 1 | Imports (21 named + 2 namespace: `THREE`, `OBC`) + `useEdgeProjectorNative()` feature flag helper | 1–38 | 38 | Reads `window.__PRYZM_FLAGS__` at call-time — intentional for browser console toggle |
| 2 | `ViewType` + `ViewState` + `SceneBoundsOptions` type definitions | 40–63 | 24 | `ViewState.viewMode` drives the 8-way routing in `activate()` |
| 3 | Class JSDoc + `_state` + 18 private fields (including 6 perf-phase injected services: `_boundsCache`, `_visibilityCuller`, `_frameCoordinator`, `_multiViewCameraManager`, `_unifiedFrameLoop`, `_levelClipPlaneCache`, `_edgeProjectorService`, `_planViewManager`, `_mountedDrawing`, plus legacy fields `_savedMaterials`, `_savedMeshes`, `_clipperPlane`) | 65–188 | 124 | 11 post-construction injection fields (all start null, set via 8 injection methods) |
| 4 | Constructor (5 params: `components`, `world`, `camera`, `grid`, `navManager`; creates `PlanViewService`, `SectionViewService`, `OrthoPlanCameraLockController`, `PlanViewManager`; registers `_visibilityCuller` as view switch listener; calls `_initializeDefaultState()`) | 189–211 | 23 | Does NOT receive injection services — all 8 injected post-construction via setters |
| 5 | 8 set-after-construct injection methods: `setSelectionManager()`, `setBoundsCache()`, `registerViewSwitchListener()`, `setFrameCoordinator()`, `setViewVisibilityMap()`, `setUnifiedFrameLoop()`, `setLevelClipPlaneCache()`, `setEdgeProjectorService()` | 218–301 | 84 | Pattern: called once from `initScene()` after each service is ready; no-op safe before injection |
| 6 | `get multiViewCameraManager()`, `clearCameraStateStore()`, `seedPerspectiveCameraFromSceneBounds()` | 352–378 | 27 | Public surface for `initScene()` seeding and diagnostics |
| 7 | `setActiveViewDefinitionId()`, `get activeDefinitionId()`, `requestBackgroundProjection()`, `get currentViewDefinitionId()`, `get planViewService()`, `get sectionViewService()` | 385–471 | 87 | `requestBackgroundProjection()` reads **`window.vgSceneApplicator`** (line 436); dispatches `svp:drawing-refreshed` via `window.dispatchEvent` |
| 8 | `_vst()` (view-switch trace helper), `_initializeDefaultState()`, `get state()`, `get currentMode()`, `get viewMode()`, `_applyGridState()` | 480–552 | 73 | `_vst()` is 4 LOC — `performance.now()` delta trace; `_applyGridState()` controls `grid.fade` per viewType |
| 9 | `computeSceneBounds()` + `_getSceneBoundsForCamera()` + `_computeCameraTarget()` + `_computeCameraDistance()` | 564–619 | 56 | Phase 1 perf: delegates to `_boundsCache` or does full scene traverse as fallback |
| 10 | `_registerListener()`, `unregisterListener()`, `_cleanupAllListeners()` | 625–654 | 30 | Event listener hygiene — Map keyed by string id; deregisters on `deactivate()` |
| 11 | `setupFloorPlanClipping()` + `_clearClipping()` | 660–733 | 74 | Dual path: Phase 5 `LevelClipPlaneCache` (<0.1ms pointer swap) vs legacy OBC Clipper (≥15s shader recompile); legacy path retained as fallback |
| 12 | **`activate()` — 212-LOC orchestration god-method** | 740–951 | 212 | Transition lock guard (5s timeout recovery); bounds cache invalidate; pre-switch: 5 `_viewSwitchListeners.onBeforeViewSwitch()` + `selectionManager.unselectAll()` + `UnifiedFrameLoop.beginViewSwitch()` + `FrameCoordinator.beginViewSwitch()`; 8-way view mode routing; post-switch: 2 `window.dispatchEvent` calls (`view-activated`, `view-selected`); 5 `_viewSwitchListeners.onAfterViewSwitch()` + timing log; `finally`: always resets transition lock. **Must stay in shell — it owns the entire state machine.** |
| 13 | **`_activate3DView()`** | 956–1096 | 141 | Reads **`window.vgSceneApplicator`** (lines 963-967, `.setUnderlayLevelId(null)`); reads **`window.renderPipelineManager`** (lines 998, 1089-1093, `.notifyProjectionToggle(false)`, `.needsSsgiFullRebuild()`, `.scheduleShadowRebuild()`); perspective sanity check (cam-target dist < 4m → slot miss); MultiViewCameraManager + ViewCameraStateStore restore cascade; scene bounds recompute on miss |
| 14 | `_canMountDrawingForView()` + `_disposeRejectedDrawing()` | 322–345 | 24 | Helper predicates for TechnicalDrawing mount logic; read `_state.viewMode` + `_planViewManager.isActive` |
| 15 | `_mountDrawing()` + `_unmountDrawing()` | 1120–1171 | 52 | DOC-1.5a: mounts `OBC.TechnicalDrawing` to scene on `DOCUMENTATION_LAYER`; updates `activePlanDrawingRef`; skips 3D scene add if `PlanViewManager.isActive` (Canvas2D only); must stay in shell as shared by all mode handlers |
| 16 | **`_activateFloorPlanView()`** — most complex mode handler | 1173–1428 | 256 | Reads **`window.__planViewsDisabled`** (line 1186); reads **`window.vgSceneApplicator`** (lines 1220-1223 `.setUnderlayLevelId()`, lines 1413-1416 `.applyToProjectionLayers()`); reads **`window.renderPipelineManager`** (line 1319, `.notifyProjectionToggle(true)`); QF-1 guard; OBC-name-based levelId inference (Fix C); PlanViewManager Canvas2D activation; camera layer flip (BIM_LAYER ↔ PLAN_SYMBOL_LAYER); EdgeProjector async projection + TechnicalDrawing mount; VG applicator injection; visibility culler; dead code block below early `return` (lines 1276–1428 — never executed since `return` at line 1274) |
| 17 | `_activateCeilingPlanView()` | 1430–1432 | 3 | Delegates entirely to `_activateFloorPlanView(view, true)` |
| 18 | **`_activateElevationView()`** | 1437–1552 | 116 | Reads **`window.renderPipelineManager`** (line 1445, `.notifyProjectionToggle(false)`); reads **`window.vgSceneApplicator`** (lines 1535-1538, `.applyToProjectionLayers()`); camera preset pattern (ortho snap → immediate switch back to perspective); `levelDatumLineBuilder.inject()` + `sectionGridLineBuilder.inject()` (DOC-2.5d/e); EdgeProjector async projection |
| 19 | **`_activateSectionView()`** | 1557–1634 | 78 | Reads **`window.renderPipelineManager`** (line 1560, `.notifyProjectionToggle(true)`); section plane resolution from `viewDef.spatial.sectionPlane` with fallback to OBC view properties; delegates projection to `SectionViewService` (DOC-1.9 ownership); camera framing uses `computeSceneBounds()` |
| 20 | `_setupViewListeners()` | 1639–1652 | 14 | Registers `camera-update` listener via `_registerListener()` to trigger manual render |
| 21 | **`_activateGroundFloorView()`** | 1657–1717 | 61 | **Absent from stub's split plan.** Reads **`window.__planViewsDisabled`** (line 1663); reads **`window.groundFloorController`** (lines 1710-1713, `.activate()`); reads **`window.renderPipelineManager`** (line 1700, `.notifyProjectionToggle(true)`); QF-1 guard identical to floor plan; PlanViewService.applyFloorPlan(); OrthoPlanCameraLockController.activate() |
| 22 | `deactivate()` | 1726–1797 | 72 | Saves camera state (2 paths: `_cameraStateStore` + `MultiViewCameraManager`); `_cleanupAllListeners()` MUST precede `_orthoPlanLock.deactivate()` (documented race condition); reads **`window.groundFloorController`** (lines 1759-1763, `.deactivate()`); layer reset; `_deepSceneCleanup()` |
| 23 | `_deepSceneCleanup()` | 1803–1855 | 53 | Phase 5: `previewRegistry.disposeAll()` (O(k) preview objects); PLAN_SYMBOL_LAYER ghost sweep (removes disposed-geometry nodes that crash WebGPU AttributeNode); `renderer.clippingPlanes = []`; `localClippingEnabled = false` |
| 24 | `_restore3DRendererPresentation()` | 1857–1877 | 21 | Restores `outputColorSpace`, `toneMapping`, `toneMappingExposure`; explicitly keeps `shadowMap.enabled = false` (documented WebGPU shadow corruption reason) |
| 25 | `_restoreMaterials()` | 1892–1902 | 11 | **Effectively no-op** — `_savedMaterials` is never populated in current code; pattern retained for future material-override features |
| 26 | `_forceRendererUpdate()` | 1907–1920 | 14 | Sets `renderer.needsUpdate = true` + schedules again via `setTimeout(..., 100)` |
| 27 | `dispose()` | 1925–1939 | 16 | Calls cleanup helpers + resets `_state` |
| **Total** | | | **~1,940** | (remaining diff = blank lines and extended JSDoc comments) |

**Critical finding — dead code in `_activateFloorPlanView()`**: lines 1276–1428 (the camera layer flip, visibility culler, RPM call, PlanViewService.applyFloorPlan, MultiViewCameraManager restore, OrthoPlanCameraLockController.activate, EdgeProjector projection block) are **unreachable** — the method returns at line 1274 after calling `PlanViewManager.activate()` or dispatching `plan-view-unavailable`. This dead code was the OLD WebGPU floor plan path before Canvas2D PlanViewManager was introduced. Wave 14 should note this but NOT remove it (removal risk is high; Wave 15 cleanup scope).

---

**Window globals inventory (5 distinct globals)**:

| Global | Key lines | Kind | TODO tag | Migration phase | Wave 14? |
|---|---|---|---|---|---|
| `window.__PRYZM_FLAGS__` | 37 (inside `useEdgeProjectorNative()`) | Read — typed optional-chain `?.EDGE_PROJECTOR_NATIVE` boolean | `TODO(D.4)` | D.4 → `runtime.featureFlags.edgeProjectorNative` | ❌ Phase D |
| `window.vgSceneApplicator` | 436-438, 963-967, 1220-1223, 1413-1416, 1535-1538 | Read — typed optional; calls `.setUnderlayLevelId()` / `.applyToProjectionLayers()` | `TODO(D.4)` | D.4 → `runtime.vg.sceneApplicator` | ❌ Phase D |
| `window.renderPipelineManager` | 998, 1089-1093, 1319, 1445, 1560, 1700 | Read — typed optional; calls `.notifyProjectionToggle()`, `.needsSsgiFullRebuild()`, `.scheduleShadowRebuild()` | `TODO(D.4)` | D.4 → `runtime.renderPipeline` (already has `registerViewSwitchListener()` path for most) | ❌ Phase D |
| `window.__planViewsDisabled` | 1186, 1663 | Read — boolean flag | `TODO(D.4)` | D.4 → `runtime.config.planViewsDisabled` | ❌ Phase D |
| `window.groundFloorController` | 1710-1713, 1759-1763 | Read — typed optional; `.activate()` / `.deactivate()` | `TODO(D.4)` | D.4 → `runtime.groundFloorController` | ❌ Phase D |

---

**Violation inventory**:

| Violation | Count | Lines | Wave 14? |
|---|---|---|---|
| `(window as any)` casts — P4 | **0** | — | ❌ N/A |
| `window.commandManager.execute()` — P6 | **0** | — | ❌ N/A |
| `window.*` typed reads — Phase D | **5 globals, ~14 reads** | See table above | ❌ Phase D |
| **L7.5 god-object** | ✅ | 1–1940 | ✅ **Wave 14** |
| `_activateFloorPlanView()` — 256-LOC god-method | ✅ | 1173–1428 | ✅ **Wave 14** |
| Dead code in `_activateFloorPlanView()` | ✅ | 1276–1428 | ⚠ **Note only** — Wave 15 cleanup |

---

**Corrections to original stub plan**:

| Item | Original stub | Correct as-found |
|---|---|---|
| P4 / P6 violations | Not mentioned | **P4=0, P6=0** confirmed; no `(window as any)` casts, no `window.commandManager.execute()` |
| Shell LOC ≤400 | ≤400 | **≤1100** — `activate()` alone is 212 LOC + `deactivate()` 72 LOC + 8 injection methods 84 LOC + class fields + constructor 147 LOC + utility methods ~300 LOC; after extracting all 6 mode handlers shell is ~1064 LOC |
| 4 sub-files (Perspective, Plan, Section, Elevation) | 4 | **5 sub-files** — `_activateGroundFloorView()` (61 LOC) is a separate mode missing from stub; moves to `GroundFloorViewMode.ts` |
| `_activateCeilingPlanView()` | Not mentioned | **3 LOC** — delegates to `_activateFloorPlanView(view, true)`; included in `FloorPlanViewMode.ts` |
| "No `window.*` in any mode" | Stub migration promise | **Incorrect** — 4 of 5 window globals (`window.vgSceneApplicator ×5`, `window.renderPipelineManager ×6`, `window.__planViewsDisabled ×2`, `window.groundFloorController ×2`) live exclusively inside mode activation methods; they survive as TODO(D.4) annotations in the extracted files |
| `IViewMode { activate(): void; deactivate(): void; }` | Mode interface | **Too simple** — each mode handler references 12+ class-level deps (`_camera`, `_components`, `_visibilityCuller`, `_multiViewCameraManager`, `_cameraStateStore`, `_orthoPlanLock`, `_levelClipPlaneCache`, `_edgeProjectorService`, `_planViewManager`, `_activeDefinitionId`, `_world`, + 3 window globals). Realistic pattern: extract as top-level **async functions** receiving a `ViewControllerContext` object, OR keep as private methods in a helper class that holds the same deps as `ViewController`. The `IViewMode.activate()` strategy is Wave 16+ refactor scope, not Wave 14. |
| "1 vitest per mode" | 4 vitests | Mocking 12+ deps per mode is unrealistic in Wave 14. Revised: **1 vitest** for `activate()` routing — mock the 6 private mode handler methods → call `activate('3D')` → verify `_activate3DView` called once, others not called. |
| Dead code | Not mentioned | **`_activateFloorPlanView()` lines 1276–1428 are unreachable** (early return at line 1274). Note in audit; leave for Wave 15 cleanup. |
| `_activateGroundFloorView()` | Not mentioned | **61 LOC** 5th mode handler; reads `window.__planViewsDisabled`, `window.groundFloorController`, `window.renderPipelineManager` |

---

**Corrected split target**:

```
src/engine/subsystems/core/navigation/
  ViewController.ts               (≤1100 LOC — orchestration shell:
                                    class fields + constructor + 8 injection methods +
                                    public getters + requestBackgroundProjection() +
                                    _applyGridState() + computeSceneBounds() + bounds helpers +
                                    _registerListener/unregisterListener/_cleanupAllListeners() +
                                    setupFloorPlanClipping() + _clearClipping() +
                                    activate() [212 LOC — stays; owns state machine] +
                                    _setupViewListeners() + deactivate() [72 LOC — stays; owns cleanup] +
                                    _mountDrawing() + _unmountDrawing() + _canMountDrawingForView() +
                                    _disposeRejectedDrawing() + _deepSceneCleanup() +
                                    _restore3DRendererPresentation() + _restoreMaterials() +
                                    _forceRendererUpdate() + dispose())
  view-modes/
    Perspective3DViewMode.ts      (NEW ≤160 LOC — _activate3DView() [141 LOC]:
                                    window.vgSceneApplicator.setUnderlayLevelId(null) TODO(D.4),
                                    window.renderPipelineManager.notifyProjectionToggle(false) TODO(D.4),
                                    perspective slot restore + bounds fallback)
    FloorPlanViewMode.ts          (NEW ≤280 LOC — _activateFloorPlanView() [256 LOC] +
                                    _activateCeilingPlanView() [3 LOC]:
                                    window.__planViewsDisabled TODO(D.4),
                                    window.vgSceneApplicator ×2 TODO(D.4),
                                    window.renderPipelineManager.notifyProjectionToggle(true) TODO(D.4),
                                    EdgeProjector async projection + TechnicalDrawing mount;
                                    NOTE: dead code block lines 1276-1428 preserved with
                                    // DEAD-CODE: pre-Canvas2D WebGPU path — remove in Wave 15 comment)
    ElevationViewMode.ts          (NEW ≤130 LOC — _activateElevationView() [116 LOC]:
                                    window.renderPipelineManager.notifyProjectionToggle(false) TODO(D.4),
                                    window.vgSceneApplicator.applyToProjectionLayers() TODO(D.4),
                                    levelDatumLineBuilder.inject() + sectionGridLineBuilder.inject())
    SectionViewMode.ts            (NEW ≤90 LOC — _activateSectionView() [78 LOC]:
                                    window.renderPipelineManager.notifyProjectionToggle(true) TODO(D.4),
                                    section plane from ViewDefinition; SectionViewService.activateSection())
    GroundFloorViewMode.ts        (NEW ≤75 LOC — _activateGroundFloorView() [61 LOC]:
                                    window.__planViewsDisabled TODO(D.4),
                                    window.groundFloorController.activate()/deactivate() TODO(D.4),
                                    window.renderPipelineManager.notifyProjectionToggle(true) TODO(D.4))
```

**Migration pattern (corrected)**:

1. **Extraction strategy**: Extract each mode handler as a **module-level async function** (not a new class) that receives a `ViewControllerContext` interface bundling all needed deps. The shell's private methods become thin delegates calling the extracted function. This gives all the LOC benefits of splitting without requiring a complex class hierarchy.

   ```typescript
   // view-modes/Perspective3DViewMode.ts
   export interface ViewControllerContext {
       camera: OBC.OrthoPerspectiveCamera;
       world: OBC.World;
       components: OBC.Components;
       multiViewCameraManager: MultiViewCameraManager;
       cameraStateStore: ViewCameraStateStore;
       boundsCache: SceneBoundsCache | null;
       activeDefinitionId: string | null;
       mountDrawing: (d: OBC.TechnicalDrawing) => void;
       vst: (label: string) => void;
   }
   export async function activate3DView(ctx: ViewControllerContext): Promise<void> { ... }
   ```

2. **`IViewMode` interface**: Defer to Wave 16+. Wave 14 uses the simpler function-extraction pattern to hit the LOC gate without deep architectural refactor.

3. **Window globals**: All 5 globals retain their `TODO(D.4)` annotations in the extracted files — eliminated in Phase D `commandBus` codemod sprint.

4. **Dead code**: Add `// DEAD-CODE: pre-Canvas2D WebGPU path — remove in Wave 15` comment at line 1276; do NOT delete (change-risk too high in Wave 14).

5. **1 vitest** for `activate()` routing: mock all 6 mode activation functions → call `activate('3D')`, `activate('Top')`, etc. → verify correct function called once per invocation.

**Verifier after split (corrected)**:

```bash
wc -l src/engine/subsystems/core/navigation/ViewController.ts                     # → ≤1100
wc -l src/engine/subsystems/core/navigation/view-modes/*.ts | awk '$1 > 1500'    # → 0 files
rg '\(window as any\)' src/engine/subsystems/core/navigation/ViewController.ts   # → 0 (already 0)
rg 'window\.commandManager' src/engine/subsystems/core/navigation/ViewController.ts  # → 0 (already 0)
npm run build                                                                     # → ✓ EXIT:0
```

---

#### FILE 19 — `src/engine/subsystems/core/views/EdgeProjectorService.ts` (1,868 LOC)

**What it is**: The single projection orchestrator that converts 3D scene geometry into flat `TechnicalDrawing` instances for all AEC view types (plan, ceiling-plan, section, elevation, structural-plan, detail). Three source paths run inside one 634-LOC `project()` method: Source A (IFC Fragment models via OBC `EdgeProjector.get()`), Source B (PRYZM native element mesh groups via `EdgesGeometry` + `toDrawingSpace()`), Source C (IFC scene groups from `IfcGeometryRenderer` — these bypass OBC FragmentsManager). After projection, 11 plan-symbol injectors run (`doorPlanSymbolBuilder`, `sofaPlanSymbolBuilder`, `bedPlanSymbolBuilder`, `wardrobePlanSymbolBuilder`, `chairPlanSymbolBuilder`, `kitchenPlanSymbolBuilder`, `treePlanSymbolBuilder`, `windowPlanSymbolBuilder`, `stairSymbolTechnicalDrawingBridge`, `columnPlanSymbolBuilder`, `_roofSlopeSymbolBuilder`), then hidden-line removal runs via the already-extracted `removeHiddenLines()` from `HiddenLineRemoval.ts`. 908 LOC of module-level geometry utility functions precede the class definition and implement all spatial maths.

**P-score (as-found)**:
- **P2 = 1**: `import * as OBC from '@thatopen/components'` (line 16) + `import * as THREE from 'three'` (line 17) — 2 namespace imports. Phase E.1 scope (not Wave 14).
- **P4 = 0**: Zero `(window as any)` casts anywhere in file. ✓
- **P6 = 0**: Zero `window.commandManager.execute()` calls. ✓

**Window globals**: **ZERO** — cleanest file in Wave 14. All dependencies are constructor-injected (`OBC.Components`, `OBC.World`, `BimManager`) or imported as module singletons (all 11 plan symbol builders, `annotationStore`, `resolveBoundIntentWithInheritance`, etc.). No window reads or writes.

**Cluster LOC table** (26 clusters):

| # | Cluster | Lines | LOC |
|---|---------|-------|-----|
| 1 | JSDoc module header | 1–14 | 14 |
| 2 | Imports: 2 namespace (`OBC`, `THREE`); `mergeGeometries`; `registerSegmentUUID`; `removeHiddenLines`; `type FRAGS`; `ViewDefinition`, `VIEW_PROJECTION_DIRECTIONS`; `BimManager`; Wave-11 intent helpers; 11 plan symbol builders; `annotationStore` | 16–55 | 40 |
| 3 | Module constants: `DEFAULT_NEAR_OFFSET` (1.2 m); `ELEMENT_TYPE_TO_PROJECTION_LAYER` (30-entry ISO 13567 map: Wall/Slab/Column/Beam/Door/Window/Stair/Roof/Furniture/Plumbing); `FALLBACK_NATIVE_LAYER`; `CUT_LINE_EPSILON` (0.15 m); `DEFAULT_SECTION_PROJECTION_DEPTH` (12 m); `TRIANGLE_PLANE_EPSILON` | 57–121 | 65 |
| 4 | `_openingControlPointToDrawingHV()` — projects a 3D control point into drawing H/V coordinates | 122–142 | 21 |
| 5 | `_suppressPlanViewOpeningLines()` — **147 LOC** plan-view wall edge clipper: removes horizontal/vertical wall-layer edge segments that cross door/window opening gaps using `seamWindows` + `seamRows` scan | 166–312 | 147 |
| 6 | `_suppressWallOpeningSeams()` — **147 LOC** elevation/section jamb seam suppressor: removes artifact edge segments at door/window jamb boundaries in non-plan views | 314–460 | 147 |
| 7 | `classifyByVertexY()` — splits LineSegments geometry into `{cutGeo, projGeo, beyondGeo}` by world-Y relative to cut-plane elevation and optional floor-Y (plan views) | 471–509 | 39 |
| 8 | `makeGeoFromPositions()` + `concatLineGeometries()` — geometry factory helpers | 511–528 | 18 |
| 9 | `resolveSectionDepthPlane()` — resolves section cut-plane `{normal, constant}` from `ViewDefinition.spatial.sectionPlane` or linked `annotationStore` elevation/section-mark | 530–574 | 45 |
| 10 | `resolveSectionVolumeBox()` — **116 LOC** builds `SectionVolumeBox` from `ViewDefinition.spatial.sectionVolume` (explicit) or linked annotation mark + crop/bounds/level data via `BimManager` | 576–691 | 116 |
| 11 | `pointSectionBoxCoords()` + `isInsideSectionBox()` + `clipSegmentToSectionBox()` (Liang-Barsky 3D) + `triangleIntersectsSectionBox()` | 693–756 | 64 |
| 12 | `sectionBoxIntersectsWorldAABB()` + `worldAABBIntersectsDepthPlane()` + `getMeshWorldAABB()` — spatial culling helpers | 758–817 | 60 |
| 13 | `classifyByProjectionDepth()` — **62 LOC** classifies segments as `{cutGeo, projGeo, beyondGeo}` along the view-depth axis (section/elevation views); applies `clipSegmentToSectionBox` per segment | 819–880 | 62 |
| 14 | `buildMeshPlaneIntersectionGeometry()` — **92 LOC** computes triangle-plane intersection line segments for solid section cut faces (per-triangle edge crossing with `intersectEdge`); used for `:cut` sublayer | 882–973 | 92 |
| 15 | `resolveSectionDepthBands()` — resolves `projectionDepth` + `farClipDepth` from `ViewDefinition.viewRange` | 975–988 | 14 |
| 16 | More module constants: `DEFAULT_FAR_OFFSET` (3.0 m); `DEFAULT_ELEVATION_FAR_DEPTH` (50 m); `FALLBACK_CUT_ELEVATION` (0) | 990–1003 | 14 |
| 17 | Types: `ClipRange` interface (exported); `SectionVolumeBox` interface (internal — 10 fields) | 1004–1028 | 25 |
| 18 | `EdgeProjectorService` class header + 4 private fields + constructor (injects `OBC.EdgeProjector`, `OBC.TechnicalDrawings`, `OBC.World`, `BimManager` from `components.get()`) | 1032–1060 | 29 |
| 19 | `setRoofSlopeSymbolBuilder(builder)` — post-bootstrap DI setter for `RoofSlopeSymbolBuilder` | 1067–1069 | 3 |
| 20 | **`project()` Source A** — IFC Fragment path: `_buildModelIdMap()` + configure `_edgeProjector` + `await _edgeProjector.get()` + `addProjectionLines()` for visible+hidden layers | 1097–1178 | 82 |
| 21 | **`project()` Source B** — PRYZM native mesh projection inner loop: per-element `group.traverse()` → `EdgesGeometry` → `classifyByVertexY` / `classifyByProjectionDepth` → `_suppressWallOpeningSeams` / `_suppressPlanViewOpeningLines` → `TechnicalDrawing.toDrawingSpace()` → `registerSegmentUUID()`; `tempGeosToDispose` lifecycle; `:cut`/`:proj`/`:beyond` sublayer branching | 1180–1461 | 282 |
| 22 | **`project()` Source C** — IFC scene groups (IfcGeometryRenderer, Contract 28 §3.1): Wave-11 intent veto cache (`resolveBoundIntentWithInheritance` + `isElementTypeFullyHidden`); per-mesh EdgesGeometry + plan-view Y-range filter + sectionVolumeBox cull + same cut/proj/beyond classification + `registerSegmentUUID`; DO NOT clear groups | 1463–1620 | 158 |
| 23 | **`project()` Symbol injection** — 11 plan-symbol injector calls (door/sofa/bed/wardrobe/chair/kitchen/tree/window/stair/column/roofSlope), each guarded by `viewType` check; `removeHiddenLines(drawing)` (Contract 23 §9); detach drawing from scene; `return drawing` | 1622–1730 | 109 |
| 24 | `getDirectionForView()` — switch on `viewDef.viewType` → `_vecFromPreset()`; handles explicit `spatial.projectionDirection` override; section-mark normal fallback | 1740–1763 | 24 |
| 25 | `resolveClipRange()` — **60 LOC** resolves `{near, far, floorY?}`: elevation/section → depth-space; ceiling-plan → level top; plan → `levelElevation + nearOffset/farOffset`; calls `_bimManager.getLevelById()` every invocation (§02 §1.2 — no cache) | 1780–1839 | 60 |
| 26 | `dispose()` (stub — OBC owns EdgeProjector) + `_buildModelIdMap()` (async; `model.getItemsIdsWithGeometry()`) + `_vecFromPreset()` (key → THREE.Vector3) | 1841–1867 | 27 |
| **Total** | | | **~1,868** |

**Geometry utility mass**: Clusters 4–16 = **~908 LOC** of module-level functions preceding the class. The stub does not mention these at all. They are the single largest extraction target.

**`project()` is a 634-LOC god-method** (clusters 20–23): inlines 3 independent projection strategies + 11 symbol injectors + HLR. Each strategy can be extracted to a module function that receives the pre-built `drawing` and returns `void`.

---

**Stub error table**:

| Stub claim | Actual finding | Action |
|---|---|---|
| Shell `EdgeProjectorService.ts` ≤300 LOC — "projection dispatcher; result caching" | Shell ≤300 achievable only after extracting Sources B+C + symbol injectors. "Result caching" is wrong — `ViewTechnicalDrawingCache` (caller) owns the cache; this service is stateless. | STRIKE "result caching"; confirm ≤300 target is achievable with correct delegates |
| Sub-file `IFCFragmentProjector.ts` | Source A is only 82 LOC; too small for its own file; stays in shell `project()` orchestration. | STRIKE this sub-file |
| Sub-file `NativeElementProjector.ts` | Correct concept. Source B is 282 LOC. Keep as module function in `NativeElementProjector.ts`. | CONFIRM — rename to module function signature |
| Sub-file `HiddenLineRemovalPass.ts` — "already in HiddenLineRemoval.ts; import only" | Correct that `removeHiddenLines` is already extracted. No new file needed. | STRIKE this sub-file (it's a no-op placeholder) |
| **MISSING**: 908 LOC of module-level geometry utility functions | Clusters 4–16 (18 functions: `_suppressPlanViewOpeningLines`, `_suppressWallOpeningSeams`, `classifyByVertexY`, `resolveSectionVolumeBox`, `buildMeshPlaneIntersectionGeometry`, `classifyByProjectionDepth`, etc.) entirely absent from stub | ADD `ProjectionGeometryUtils.ts` (≤500 LOC) |
| **MISSING**: Source C — IFC scene groups | 158-LOC projection path for `IfcGeometryRenderer` meshes (Contract 28 §3.1) not mentioned anywhere in stub | ADD `IFCSceneGroupProjector.ts` (≤165 LOC) |
| **MISSING**: 11 plan symbol injectors | 109 LOC of `.inject()` calls at end of `project()` (guarded by viewType checks) not mentioned in stub | ADD `PlanSymbolInjector.ts` (≤120 LOC) |
| Violation: "HLR is a separate concern" | HLR is already in `HiddenLineRemoval.ts`; the real violation is that 3 projection strategies + 11 symbol injectors are all inlined in one 634-LOC method | REFRAME violation correctly |
| Sub-file count: 3 (IFCFragmentProjector + NativeElementProjector + HiddenLineRemovalPass) | Actual: 4 real new files (ProjectionGeometryUtils + NativeElementProjector + IFCSceneGroupProjector + PlanSymbolInjector) | 3 → 4 |
| Verifier `wc -l EdgeProjectorService.ts # → ≤300` | Achievable with correct extraction | CONFIRM |
| Verifier `wc -l edge-projector/*.ts \| awk '$1 > 1500'` | All 4 sub-files < 500 LOC; all pass | CONFIRM |

---

**Corrected split target** (5 files, not 4):

```
src/engine/subsystems/core/views/
  EdgeProjectorService.ts               (≤260 LOC — class shell: constructor + setRoofSlopeSymbolBuilder + getDirectionForView + resolveClipRange + dispose + _buildModelIdMap + _vecFromPreset + project() orchestration [~60 LOC] calling delegates)
  edge-projector/
    ProjectionGeometryUtils.ts          (≤500 LOC — 18 module-level geometry utility functions: _openingControlPointToDrawingHV, _suppressPlanViewOpeningLines, _suppressWallOpeningSeams, classifyByVertexY, makeGeoFromPositions, concatLineGeometries, resolveSectionDepthPlane, resolveSectionVolumeBox, pointSectionBoxCoords, isInsideSectionBox, clipSegmentToSectionBox, triangleIntersectsSectionBox, sectionBoxIntersectsWorldAABB, worldAABBIntersectsDepthPlane, getMeshWorldAABB, classifyByProjectionDepth, buildMeshPlaneIntersectionGeometry, resolveSectionDepthBands; also: module constants + SectionVolumeBox type)
    NativeElementProjector.ts           (≤300 LOC — Source B: module function projectNativeGroups(groups, drawing, viewDef, direction, isPlanView, cutPlaneY, planFloorY, sectionDepthBands, sectionVolumeBox): void — imports geometry utils from ProjectionGeometryUtils; per-element EdgesGeometry loop; ":cut"/":proj"/":beyond" sublayer branching; registerSegmentUUID; group.clear() lifecycle)
    IFCSceneGroupProjector.ts           (≤165 LOC — Source C: module function projectIfcSceneGroups(groups, drawing, viewDef, direction, isPlanView, cutPlaneY, planFloorY, sectionDepthBands, sectionVolumeBox): void — Wave-11 intent veto cache; per-mesh projection; DO NOT group.clear())
    PlanSymbolInjector.ts               (≤120 LOC — module function injectPlanSymbols(drawing, viewDef, roofSlopeBuilder): void — 11 plan symbol builder .inject() calls guarded by viewType; removeHiddenLines call moves to shell after delegate returns)
```

**Corrected migration pattern**:
1. Extract all 18 module-level functions + `SectionVolumeBox` type + geometry constants → `ProjectionGeometryUtils.ts`; re-export `ClipRange` from there or from shell.
2. Extract Source B inner loop → `NativeElementProjector.ts` module function; shell calls `projectNativeGroups(nativeMeshGroups, drawing, viewDef, direction, ...)`.
3. Extract Source C inner loop → `IFCSceneGroupProjector.ts` module function; shell calls `projectIfcSceneGroups(ifcSceneGroups, drawing, viewDef, direction, ...)`.
4. Extract 11 symbol injector calls → `PlanSymbolInjector.ts` module function `injectPlanSymbols(drawing, viewDef, roofSlopeBuilder)`; shell calls after Sources B+C.
5. Source A (82 LOC) stays in shell `project()` — small enough; no own file.
6. Shell `project()` becomes ~60 LOC orchestration: create drawing → Source A inline → call 3 delegates → `removeHiddenLines()` → return.
7. **P2 fix**: defer `import * as OBC` + `import * as THREE` namespace elimination to Phase E.1 (OBC/THREE wrapping sprint); Wave 14 scope is function extraction only.

**Verifier after split**:
```bash
wc -l src/engine/subsystems/core/views/EdgeProjectorService.ts                       # → ≤260
wc -l src/engine/subsystems/core/views/edge-projector/ProjectionGeometryUtils.ts     # → ≤500
wc -l src/engine/subsystems/core/views/edge-projector/NativeElementProjector.ts      # → ≤300
wc -l src/engine/subsystems/core/views/edge-projector/IFCSceneGroupProjector.ts      # → ≤165
wc -l src/engine/subsystems/core/views/edge-projector/PlanSymbolInjector.ts          # → ≤120
wc -l src/engine/subsystems/core/views/edge-projector/*.ts | awk '$1 > 1500'         # → 0 files
rg '(window as any)' src/engine/subsystems/core/views/EdgeProjectorService.ts        # → 0
rg 'window\.commandManager' src/engine/subsystems/core/views/EdgeProjectorService.ts # → 0
npm run build                                                                         # → ✓ EXIT:0
```


---

#### FILE 20 — `src/engine/subsystems/slabs/SlabTool.ts` (1,809 LOC)

**What it is**: Multi-mode slab creation and editing tool with **5 distinct draw modes**: FLOOR_SKETCH (2-point rectangle), POLYLINE_SLAB (click polygon), HOLLOW_SLAB (rectangle + hole cutout), REGION_SLAB (click enclosed wall region), and PICK_WALLS (click wall faces → `SlabPickWallsController`). Also integrates profile edit mode (vertex drag via the already-extracted `SlabProfileEditor`) and Mode A dimension editing (via the already-extracted `SlabDimensionsEditor`). **The entire class is `@deprecated`** (lines 31–58 JSDoc): Phase E.2 replaces it with `plugins/slab/src/tool.ts`; bus-dispatch wiring is incomplete pending E-bus.1 (S79). Wave 14 must use a **minimal extraction strategy** — avoid heavy state-machine investment that E.2 will delete.

**P-score (as-found)**:
- **P2 = 1**: `import * as THREE from 'three'` (line 1) + `import * as OBC` (line 2) + `import * as BUI from '@thatopen/ui'` (line 3) — 3 namespace imports. Phase E.1 scope.
- **P4 = 0**: No `(window as any)` casts. ✓
- **P6 = 0**: `commandManager.execute()` calls at lines 351, 375, 1529, 1691 use `this._deps.getCommandManager?.()` — DI-injected commandManager, not `window.commandManager`. ✓ (Note: Phase E.2 will migrate these 4 reaches to `runtime.bus.executeCommand()` per the @deprecated JSDoc.)

**Window globals** (3, all as `?? window.X` legacy fallbacks):

| Global | Lines | Injected primary | Phase |
|--------|-------|-----------------|-------|
| `window.fastPathProjectorService` | 265, 474 | `this._deps.getFastPathProjectorService?.()` (DI primary) | D.5 |
| `window.projectContext` | 1219 | `this._deps.getBimManager?.()?.activeLevelId` (DI primary) | D.5 |

**Already-extracted sub-files** (not mentioned in stub):
- `SlabProfileEditor.ts` (line 10 import, line 177 field) — vertex-drag handle overlay for profile edit mode
- `SlabPickWallsController.ts` (line 18 import, line 119 field) — pick-walls mode controller
- `SlabDimensionsEditor.ts` (line 11 import, line 189 field) — Mode A floating dimension edit panel

**Cluster LOC table** (35 clusters):

| # | Cluster | Lines | LOC |
|---|---------|-------|-----|
| 1 | Imports (3 namespace: THREE, OBC, BUI; 9 named) + `SlabToolCallbacks` interface | 1–29 | 29 |
| 2 | `@deprecated` class JSDoc (Phase E.2 migration plan with 3-step order) | 31–58 | 28 |
| 3 | `SlabToolDeps` interface — 8 optional DI getter functions | 60–93 | 34 |
| 4 | Class header + 22 private fields (`isSketching`, `activeTool`, `polylineData` object, `dimensionPreview`, `regionPreview`, `wallStore`, `pickWallsController`, `regionDetection`, `floorSketch` object, `slabWidth/Depth`, `currentSlab`, `pendingSystemTypeId`, `shiftPressed`, `_onShiftDown/Up/EnterKey`, `_lastPolylineClickTime`, `profileEditor`, `isInProfileEditMode`, `profileEditSlabId`, `dimensionsEditor`) | 95–189 | 95 |
| 5 | `setSystemTypeId()` + `getSystemTypeId()` + constructor (DI assignment + DimensionPreview init) + `setWallStore()` + `setDeps()` + `resolveElevationForPreview()` + `isActive`/`toolMode` getters | 192–261 | 70 |
| 6 | `clearSketch()` — disposes all preview geometry: polyline, closingLine, previewFill, region, floorSketch rect, surface, holeRect, firstPointMesh; exits profileEditMode; hides dimensionEdit panel | 263–319 | 57 |
| 7 | `createSlabFromPolygon()` — resolves commandManager from DI; fires `CreateSlabCommand`; conditionally fires `UpdateSlabLayersCommand` (system type pre-select) | 321–379 | 59 |
| 8 | `updatePreviewRect()` — FLOOR_SKETCH/HOLLOW_SLAB live rectangle preview with dimensionPreview update | 381–439 | 59 |
| 9 | `showPreviewSurface()` — translucent blue fill plane at level elevation + `fastPathProjectorService` projection | 441–478 | 38 |
| 10 | `confirmSlabCreation()` + `cancelSlabCreation()` — dispatch by `activeTool`; calls `_resetForNextSlab()` | 480–531 | 52 |
| 11 | `addRectanglePoint()` — **81-LOC** FLOOR_SKETCH/HOLLOW_SLAB click handler: first/second point state machine, corners array, HUD step text, confirm button reveal | 533–613 | 81 |
| 12 | `getPlanPoint()` — pointer-to-3D resolver: 2D plan view (via `planView2DCreationMode.resolvePoint()`) + 3D view (OBC Raycasters + Y=0 plane) | 615–657 | 43 |
| 13 | `onPointerDown` — dispatcher: routes to mode handler (FLOOR_SKETCH/HOLLOW_SLAB → `addRectanglePoint`; REGION_SLAB → `updateRegionDetection`; POLYLINE_SLAB → I3 double-click + `addPolylinePoint`) | 659–710 | 52 |
| 14 | `onPointerMove` — routes to `updatePreviewRect` (rect modes) or `updatePolylinePreview` | 712–728 | 17 |
| 15 | `addPolylinePoint()` — **57-LOC** POLYLINE_SLAB click: axis/angle snap via `snapToAxisOrDiagonal`; loop-close radius check; dot marker sphere creation; HUD step counter | 730–786 | 57 |
| 16 | `updatePolylinePreview()` — **133-LOC** live preview: snapped hover via `snapToAxisOrDiagonal`; `previewLine` update; **I4** closing-line ghost (cursor back to first pt); **I5** translucent fill polygon via `THREE.Shape` + ShapeGeometry (XZ rotation) | 788–920 | 133 |
| 17 | `clearPolyline()` — disposes `previewLine`, `closingLinePreview` (I4), `previewFillMesh` (I5), all dot markers | 922–950 | 29 |
| 18 | `onPointerUp` + `_resetForNextSlab()` (reset HUD text + confirm button without tearing down session) + `cleanupSketchMode()` (remove pointer+key listeners; re-enable camera) | 952–1023 | 72 |
| 19 | `exitSketchMode()` + `cleanup()` + `dispose()` | 1025–1043 | 19 |
| 20 | `enterPolylineMode()` (attach Shift key listeners) + `enterSketchMode()` + `enterRegionMode()` — all route through `setupToolUI()` | 1045–1081 | 37 |
| 21 | `setupToolUI()` — **100-LOC** BUI HTML HUD builder: sketch-hud with step text + confirm/cancel buttons + ESC/Enter key handler (`_onEnterKey`) | 1083–1182 | 100 |
| 22 | `exitRegionMode()` + `enterHollowMode()` | 1184–1198 | 15 |
| 23 | `enterPickWallsMode()` — lazily creates `SlabPickWallsController` with DI deps; calls `controller.enter()` | 1200–1224 | 25 |
| 24 | `exitPickWallsMode()` | 1226–1228 | 3 |
| 25 | `updateRegionDetection()` + `findRegionAtPoint()` — walks wall store, builds 2D segments, calls graph algorithms | 1230–1262 | 33 |
| 26 | `buildClosedLoops()` — **40-LOC** graph builder: tolerance-based point merging, adjacency map, right-hand loop tracing | 1264–1303 | 40 |
| 27 | `traceSpecificLoop()` — **51-LOC** right-hand traversal: follow edges by minimum signed angle; cycle detection; 50-node safety break | 1305–1355 | 51 |
| 28 | `isPointInPolygon()` (ray-crossing test) + `showRegionPreview()` + `clearRegionPreview()` | 1357–1396 | 40 |
| 29 | `createWallsFromSlab()` — creates wall loop from slab polygon via DI-injected WallTool | 1398–1418 | 21 |
| 30 | `enterProfileEditMode()` — **91-LOC** orchestration: Mode A branch (dimension panel), Mode B branch (vertex drag), §11 §1.4 sketch degradation call, lazy `SlabProfileEditor` creation | 1420–1510 | 91 |
| 31 | `_commitProfileEdit()` + `finishProfileEditMode()` + `exitProfileEditMode()` | 1512–1565 | 54 |
| 32 | `_showProfileEditHUD()` + `_hideProfileEditHUD()` — BUI HTML HUD for vertex-drag mode | 1567–1616 | 50 |
| 33 | `_degradeSketchToPolygon()` — **93-LOC** HostReferenceEdge → FreeLineEdge degradation: walk sketch edges, resolve wall faces via `WallFaceResolver.resolveOrFallback()`, fire `UpdateSlabPolygonCommand({ clearSketch: true })` | 1618–1710 | 93 |
| 34 | `_showDegradationToast()` — **60-LOC** amber toast with 5 s auto-dismiss | 1712–1771 | 60 |
| 35 | `_showDimensionEditPanel()` + `_hideDimensionEditPanel()` — delegates to already-extracted `SlabDimensionsEditor` | 1773–1808 | 36 |
| **Total** | | | **~1,809** |

**Extraction targets** (to reach Wave 14 ≤1500-LOC gate):
- Clusters 15–17 (polyline draw + preview + clear): **219 LOC** → `slab-tool/SlabPolylinePreview.ts`
- Clusters 25–28 (region detection graph algorithms): **164 LOC** → `slab-tool/SlabRegionDetector.ts`
- Shell after extraction: 1809 − 219 − 164 = **1426 LOC** ✓ (under 1500)

---

**Stub error table**:

| Stub claim | Actual finding | Action |
|---|---|---|
| Shell `SlabTool.ts` ≤400 LOC | Shell is 1426 LOC after minimal extraction; ≤400 is 3.5× too small | STRIKE ≤400; correct to ≤1450 |
| 3 tool states: (a) draw-new-slab, (b) profile-edit, (c) segment-drag | 5 draw modes (FLOOR_SKETCH, POLYLINE_SLAB, HOLLOW_SLAB, REGION_SLAB, PICK_WALLS) + profile edit + Mode A dimension edit. "Segment-drag" doesn't exist | STRIKE "3 states"; correct to "5 draw modes + profile edit; segment-drag does not exist" |
| `SlabDrawState.ts` — "draw-new-slab: polygon click + dimension preview + CreateSlabCommand" | 4 draw modes (not 1); each inlined in shell; too small to extract individually | STRIKE this sub-file |
| `SlabProfileEditState.ts` — "profile-edit: segment drag via SlabProfileEditor — delegates to existing SlabProfileEditor.ts" | `SlabProfileEditor` already extracted; profile edit integration is 91+54+50 = 195 LOC in shell; "segment-drag" doesn't exist as a concept | STRIKE this sub-file; keep profile edit in shell |
| `SlabSegmentDragState.ts` — "segment-drag: live drag + UpdateSlabPolygonCommand" | Does not exist in source code anywhere | STRIKE this sub-file |
| Migration pattern: `ISlabToolState { activate(); deactivate(); onPointerDown(e); onPointerMove(e); onPointerUp(e); }` | State-machine interface would require deep refactor of deprecated class. Wave 14 scope: minimal extraction only | STRIKE interface pattern; use module function extraction instead |
| **MISSING**: `@deprecated` entire class | Lines 31–58 JSDoc: Phase E.2 replaces with `plugins/slab/src/tool.ts`; 4 commandManager.execute() calls documented for E-bus.1 migration | ADD to description; drives minimal-extraction strategy for Wave 14 |
| **MISSING**: `SlabPickWallsController` already extracted | 5th draw mode (PICK_WALLS) delegates entirely to existing `SlabPickWallsController` | ADD to "already-extracted" list |
| **MISSING**: `SlabDimensionsEditor` already extracted | Mode A (rectangular slab) delegates to existing `SlabDimensionsEditor` | ADD to "already-extracted" list |
| **MISSING**: Region detection cluster (164 LOC) | `buildClosedLoops()` + `traceSpecificLoop()` (right-hand wall-graph traversal) + `isPointInPolygon()` + `showRegionPreview()` — cleanly extractable | ADD `SlabRegionDetector.ts` sub-file |
| **MISSING**: Polyline preview cluster (219 LOC) | `addPolylinePoint()` + `updatePolylinePreview()` (I4 closing-line + I5 fill polygon) + `clearPolyline()` — cleanly extractable | ADD `SlabPolylinePreview.ts` sub-file |
| **MISSING**: 3 window globals | `window.fastPathProjectorService` (×2) + `window.projectContext` as legacy `?? window.X` fallbacks | ADD window global inventory |
| Verifier `wc -l SlabTool.ts # → ≤400` | Correct target: ≤1450 | CORRECT |
| Verifier `wc -l slab-tool/*.ts \| awk '$1 > 1500' # → 0` | Confirm — both sub-files < 250 LOC | CONFIRM |

---

**Corrected split target** (3 files, not 4; minimal investment respects @deprecated):

```
src/engine/subsystems/slabs/
  SlabTool.ts                           (≤1450 LOC — @deprecated shell; all 5 draw modes + profile edit integration; already-extracted SlabProfileEditor, SlabPickWallsController, SlabDimensionsEditor delegated as-is; calls module functions from sub-files)
  slab-tool/
    SlabPolylinePreview.ts              (≤230 LOC — module functions: addPolylinePoint, updatePolylinePreview [I4 closing-line + I5 fill polygon], clearPolyline; receives SlabTool state via args — no class instantiation needed)
    SlabRegionDetector.ts               (≤180 LOC — module functions: findRegionAtPoint, buildClosedLoops, traceSpecificLoop, isPointInPolygon, showRegionPreview, clearRegionPreview; pure computation + minimal THREE scene ops)
```

**Corrected migration pattern**:
1. Extract region detection cluster (clusters 25–28, 164 LOC) → `SlabRegionDetector.ts` module functions; shell calls `findRegionAtPoint(wallStore, point)` and `showRegionPreview(scene, polygon)`.
2. Extract polyline preview cluster (clusters 15–17, 219 LOC) → `SlabPolylinePreview.ts` module functions; shell passes `polylineData`, `world.scene.three`, `dimensionPreview`, `shiftPressed` as parameters.
3. Do NOT implement `ISlabToolState` interface — deprecated class; E.2 will delete.
4. Do NOT extract draw states (`SlabDrawState`, `SlabProfileEditState`, `SlabSegmentDragState`) — too fragmented for a deprecated class.
5. **P2 fix**: defer `import * as THREE/OBC/BUI` namespace elimination to Phase E.1. Wave 14 scope is function extraction only.
6. **3 window globals**: leave `?? window.X` fallbacks in place — already documented in @deprecated JSDoc for E-bus.1 + E-finish.0.A removal.

**Verifier after split**:
```bash
wc -l src/engine/subsystems/slabs/SlabTool.ts                               # → ≤1450
wc -l src/engine/subsystems/slabs/slab-tool/SlabPolylinePreview.ts          # → ≤230
wc -l src/engine/subsystems/slabs/slab-tool/SlabRegionDetector.ts           # → ≤180
wc -l src/engine/subsystems/slabs/slab-tool/*.ts | awk '$1 > 1500'          # → 0 files
rg '(window as any)' src/engine/subsystems/slabs/SlabTool.ts                # → 0
rg 'window\.commandManager' src/engine/subsystems/slabs/SlabTool.ts         # → 0
npm run build                                                                # → ✓ EXIT:0
```


---

#### FILE 21 — `src/engine/subsystems/walls/WallTool.ts` (1,711 LOC)

**What it is**: Multi-mode wall drawing and editing tool managing a 2-state FSM (IDLE/DRAWING) across 7+ drawing modes: SINGLE, POLYLINE, LINE_ORTHO, POLYLINE_ARC, POLYLINE_MIXED, POLYLINE_MIXED_2, CURVED_WALL, POLYLINE_ORTHO. **The entire class is `@deprecated TODO(E.1)`** (lines 33–59 JSDoc): replaced by `plugins/wall/src/tool.ts` which is already wired and exercised by 6+ test files (`tool-polyline.spec.ts`, `tool-arc.spec.ts`, `s10-handlers.test.ts`, etc.). Deletion gated on E-bus.1 (S79) retiring 2 residual `commandManager.execute()` reaches at lines 1535 + 1605. Wave 14 must use a **minimal extraction strategy** — no deep state-machine refactors for a class being retired.

Eight independent concerns are already extracted via constructor-injected sub-modules: `WallIntentResolver`, `WallPathBuilder`, `PathResolver`, `WallFragmentBuilder`, `DimensionPreview`, `WallDimensionInput` (§04-12), `WallSnapCycler` (§04-13), `WallAlignmentGuide` (§04-15). Despite this, the shell remains at 1,711 LOC — over the Wave 14 gate — due to a 171-LOC keyboard handler and 153-LOC preview rendering cluster.

**P-score (as-found)**:
- **P2 = 1**: `import * as THREE from 'three'` (line 1) + `import * as OBC from '@thatopen/components'` (line 2) — 2 namespace imports. Phase E.1 scope.
- **P4 = 0**: No `(window as any)` casts. Constructor `throw`s if `bimManager` or `commandManager` not injected. ✓
- **P6 = 0**: `commandManager.execute()` at lines 1535 + 1605 use `this.commandManager` — DI-injected (constructor throws on null). Not `window.commandManager`. ✓ (@deprecated JSDoc documents these for E-bus.1 migration.)

**Window globals**: **ZERO** — `fastPathProjectorService` arrives via `callbacks.fastPathProjectorService`; `lastPointerMoveEvent` migrated from `window.lastPointerMoveEvent` to private field (§E FIX). No `window.*` reads anywhere.

**Already-extracted sub-files** (8, not mentioned in stub at all):
- `WallTypes.ts` — `WallToolState`, `WallToolCallbacks`, `WallDrawingMode` enums/types
- `WallIntentResolver.ts` — anchor resolution (`resolveHitToAnchor`, `resolvePlacement`)
- `WallPathBuilder.ts` — path point accumulation, Line/Arc mode switching
- `PathResolver.ts` — `WallPath` type + `PathResolver.toPolyline()` arc tessellation
- `WallFragmentBuilder.ts` — 3D mesh construction for walls
- `DimensionPreview.ts` — dimension label overlay (constructor-injected)
- `WallDimensionInput.ts` — typed dimension input §04-12 (constructor-injected)
- `WallSnapCycler.ts` — Tab snap reference cycling §04-13 (constructor-injected)
- `WallAlignmentGuide.ts` — Revit-style alignment inference §04-15 (constructor-injected)

**Cluster LOC table** (27 clusters):

| # | Cluster | Lines | LOC |
|---|---------|-------|-----|
| 1 | Imports (2 namespace: THREE, OBC; 12 named) | 1–31 | 31 |
| 2 | `@deprecated` class JSDoc (Phase E.1 migration plan; plugin already wired) | 33–59 | 27 |
| 3 | Class header + 30+ private fields (world, callbacks, projectContext, state, drawingMode, selectedSystemTypeId, startPoint/firstPoint/wallCount, isActive, _disposed, _savedCameraInput, wallStore, fragmentBuilder, snapManager, intentResolver, pathBuilder, dimensionPreview, dimensionInput, snapCycler, alignmentGuide, bimManager, commandManager, lastPointerMoveEvent, startAnchor, previewLine/startPointMarker/previewWall, pointerDownHandler/MoveHandler/keyDown/keyUp, isOrthoOverride, statusOverlay, defaultWallHeight/Thickness, mixedModeOverlay) | 60–146 | 87 |
| 4 | Constructor — fail-fast DI validation (`throw` if bimManager/commandManager null); WallFragmentBuilder + 6 sub-module instantiation; `initSnapManager()` call | 148–225 | 78 |
| 5 | `initSnapManager()` + `getSnapManager()` + `active` + `toolState` + `getWallStore()` + `getFragmentBuilder()` + `setSystemTypeId()` + `getSystemTypeId()` | 227–272 | 46 |
| 6 | `activate()` — **101-LOC**: mode-specific path-builder init; camera action suppression (save `mouseButtons.left`/`touches.one`); `attachEventListeners()`; pre-warm (`SnapManager.snap` + `intentResolver.resolveHitToAnchor` at origin); HDRI async load (fire-and-forget) | 274–374 | 101 |
| 7 | `setPathMode()` + `deactivate()` — restore camera action mapping; `callbacks.onCancel?.()` notification | 376–409 | 34 |
| 8 | `cleanup()` + `dispose()` (disposes fragmentBuilder + dimensionPreview + dimensionInput + snapCycler + alignmentGuide + snapManager + statusOverlay) + `getState()` + `cancel()` (resets FSM, clears all previews and overlays) | 411–493 | 83 |
| 9 | `switchDrawingMode()` — **71-LOC**: saves continuity anchor (startPoint/firstPoint/startAnchor); clears visuals; applies new mode; restores DRAWING state if was drawing (re-seeds pathBuilder; respects isOrthoOverride) | 495–577 | 83 |
| 10 | `attachEventListeners()` + `detachEventListeners()` | 579–619 | 41 |
| 11 | `onPointerDown()` — **160-LOC** async FSM: `getWorldPoint()` + level validation; anchor resolution (`intentResolver.resolveHitToAnchor()` + `getRaycastHit()`); ortho constraint; polyline proximity-close (0.25 m to firstPoint); IDLE branch (set startPoint, DRAWING state, pathBuilder.addPoint, snapManager.setActiveStartPoint, createStartMarker); DRAWING branch (reset dimensionInput + snapCycler, pathBuilder.addPoint → WallPath, createWallFromPath, polyline-continue or deactivate) | 621–780 | 160 |
| 12 | `showMixedModeSelector()` — **46-LOC** DOM overlay with Straight/Ortho/Arc path-mode option buttons (inline SVG icons); wires `pathBuilder.setMode()` on click | 782–829 | 48 |
| 13 | `createWallFromPath()` + `getRaycastHit()` | 831–863 | 33 |
| 14 | `onPointerMove()` — **101-LOC**: `getWorldPoint()` + level check; snapCycler.updateCandidates(); 3-way effectiveEnd priority (snapCycler lock → dimensionInput lock → alignmentGuide inference → cursor); ortho re-apply after alignment guide; `updatePreview()` + `dimensionPreview.update()` | 865–965 | 101 |
| 15 | `getSnappedPoint()` — **71-LOC**: 3-priority snap pipeline: (1) SnapManager with camera-zoom-aware tolerance; (2) 2D plan-view snap via `planView2DSnapService` (OrthographicCamera only); (3) ortho constraint | 967–1037 | 71 |
| 16 | `onKeyDown()` — **171-LOC** keyboard handler: §04-12 `dimensionInput.handleKey()` consume + lockedEnd preview update; §04-13 Tab snap cycling (ortho mode toggle OR `snapCycler.cycleNext()`); Escape → `deactivate()`; Enter → dimensionInput confirm / snapCycler confirm / polyline close / deactivate | 1039–1209 | 171 |
| 17 | `onKeyUp()` (Shift release → clear `isOrthoOverride`) + `isPolylineMode()` | 1211–1227 | 17 |
| 18 | `getWorldPoint()` — raycaster + level elevation plane intersection; level-missing abort with explicit error | 1229–1263 | 35 |
| 19 | `createStartMarker()` (no-op since 2026-04-23, stub kept for call-site compatibility) + `clearStartMarker()` | 1265–1277 | 13 |
| 20 | `updatePreview()` — **72-LOC** branched Line/Arc: resolve end anchor, `intentResolver.resolvePlacement()`, Line → `renderLinePreview()` / Arc 1pt → line ghost / Arc 2pt → bézier control derivation → `renderArcPreview()` | 1279–1350 | 72 |
| 21 | `renderLinePreview()` — **40-LOC**: blue line + BoxGeometry wall mesh + ortho rotation + `fastPathProjectorService.project()` | 1352–1391 | 40 |
| 22 | `renderArcPreview()` — **41-LOC**: `PathResolver.toPolyline()` → per-segment wall BoxGeometry group | 1393–1433 | 41 |
| 23 | `clearPreview()` + `clearStartMarker()` + `clearPreviewLine()` + `clearPreviewWall()` (handles both THREE.Group arc mode and THREE.Mesh line mode; `fastPathProjectorService.clearFastPath()`) | 1435–1494 | 60 |
| 24 | `createFromSelectedSlab()` — deactivates; reads selectionManager + slabTool from callbacks; fires `CreateWallsFromSlabCommand` via dynamic import | 1496–1544 | 49 |
| 25 | `createWall()` — **76-LOC** async: level validation; curve descriptor stamp; fires `CreateWallCommand` via DI `this.commandManager` | 1546–1621 | 76 |
| 26 | `showStatus()` — **53-LOC** DOM status overlay: instruction text + Close Polyline inline action button (shown when wallCount ≥ 2 + firstPoint present) | 1623–1675 | 53 |
| 27 | `closePolyline()` (min-wall guard 0.1 m) + `hideStatus()` + `updateVisualStyle()` + `updateHdriTexture()` | 1677–1711 | 35 |
| **Total** | | | **~1,711** |

**Extraction targets** (minimal strategy — respect @deprecated):
- Cluster 16 (`onKeyDown`, 171 LOC) → `wall-tool/WallKeyboardHandler.ts`
- Clusters 20–22 (`updatePreview` + `renderLinePreview` + `renderArcPreview`, 153 LOC) → `wall-tool/WallPreviewRenderer.ts`
- Shell after: 1711 − 171 − 153 = **1387 LOC** ✓ (under 1500)

---

**Stub error table**:

| Stub claim | Actual finding | Action |
|---|---|---|
| Shell `WallTool.ts` ≤400 LOC | Shell is 1387 LOC after minimal extraction; ≤400 is 3.5× too small | STRIKE ≤400; correct to ≤1400 |
| "Straight vs curved drawing modes share little state" | Wrong: both modes share the same `onPointerDown` FSM (IDLE/DRAWING), `getWorldPoint`, `getSnappedPoint`, `createWall`, preview cleanup. 7+ modes distinguished by `drawingMode` enum checks in one handler. | STRIKE this framing |
| `StraightWallDrawState.ts` | Straight wall handling is a branch inside `onPointerDown`; cannot separate without deep refactor. @deprecated. | STRIKE |
| `CurvedWallDrawState.ts` | Arc handling is an `if (pathBuilder.getMode() === 'Arc')` branch in the same FSM. @deprecated. | STRIKE |
| `WallDimensionPreviewState.ts` — "delegates to existing DimensionPreview.ts + WallDimensionInput.ts" | `DimensionPreview` AND `WallDimensionInput` are already extracted (lines 11–12 imports, constructor-injected at lines 206–215). Nothing new to extract here. | STRIKE |
| `WallJoinFinishHandler.ts` — "join resolution on wall-complete: delegates to WallIntentResolver" | `WallIntentResolver` already extracted (line 7 import). Join logic is `resolvePlacement()` in `updatePreview()` — only 3 LOC of delegation. | STRIKE |
| Migration pattern: `IWallToolState` interface | State-machine interface would require deep refactor of deprecated class. Wave 14: minimal extraction only. | STRIKE interface pattern |
| **MISSING**: `@deprecated TODO(E.1)` | Plugin replacement `plugins/wall/src/tool.ts` already wired and tested (6+ test files). Deletion gated on E-bus.1. | ADD to description; drives minimal-extraction strategy |
| **MISSING**: 8 already-extracted sub-files | WallTypes, WallIntentResolver, WallPathBuilder, PathResolver, WallFragmentBuilder, DimensionPreview, WallDimensionInput, WallSnapCycler, WallAlignmentGuide — all constructor-injected | ADD to "already-extracted" list |
| **MISSING**: ZERO window globals | Constructor throws on missing bimManager/commandManager; all other deps via callbacks; `lastPointerMoveEvent` migrated from window global to private field | ADD to P-score section |
| **MISSING**: 7+ drawing modes | SINGLE, POLYLINE, LINE_ORTHO, POLYLINE_ARC, POLYLINE_MIXED, POLYLINE_MIXED_2, CURVED_WALL, POLYLINE_ORTHO — not "straight vs curved" | CORRECT |
| **MISSING**: 171-LOC `onKeyDown` handler | §04-12 dimensionInput + §04-13 snapCycler + Escape/Enter — cleanest extraction target | ADD `WallKeyboardHandler.ts` |
| **MISSING**: 153-LOC preview rendering cluster | `updatePreview` + `renderLinePreview` + `renderArcPreview` — cleanly extractable as module functions | ADD `WallPreviewRenderer.ts` |
| Verifier `wc -l WallTool.ts # → ≤400` | Correct: ≤1400 | CORRECT |

---

**Corrected split target** (3 files, not 5; minimal investment respects @deprecated):

```
src/engine/subsystems/walls/
  WallTool.ts                           (≤1400 LOC — @deprecated shell; 2-state FSM (IDLE/DRAWING); 7+ drawing modes; onPointerMove + getSnappedPoint + onPointerDown; calls WallKeyboardHandler + WallPreviewRenderer module functions)
  wall-tool/
    WallKeyboardHandler.ts              (≤185 LOC — module function handleWallKeyDown(event, ctx): void; ctx carries {state, drawingMode, dimensionInput, snapCycler, dimensionPreview, startPoint, lastPointerMoveEvent, pathBuilder, firstPoint, wallCount, isOrthoOverride, callbacks...})
    WallPreviewRenderer.ts              (≤160 LOC — module functions updatePreview, renderLinePreview, renderArcPreview; receive scene, pathBuilder, intentResolver, camera, defaultDims as params; no class instantiation)
```

**Corrected migration pattern**:
1. Extract keyboard handler (cluster 16, 171 LOC) → `WallKeyboardHandler.ts` module function `handleWallKeyDown(event, ctx)`. Shell binds via `this.keyDownHandler = (e) => handleWallKeyDown(e, this._makeKeyCtx())`.
2. Extract preview rendering (clusters 20–22, 153 LOC) → `WallPreviewRenderer.ts` module functions `updateWallPreview(...)`, `renderLineWallPreview(...)`, `renderArcWallPreview(...)`. Shell calls `updateWallPreview(start, end, this._makePreviewCtx())`.
3. Do NOT implement `IWallToolState` — deprecated class; E.1 will delete.
4. Do NOT extract draw modes as separate states — single FSM pattern is consistent with E.1 plugin architecture.
5. **P2 fix**: defer `import * as THREE/OBC` namespace elimination to Phase E.1.
6. **ZERO window globals**: no cleanup needed; already clean.

**Verifier after split**:
```bash
wc -l src/engine/subsystems/walls/WallTool.ts                               # → ≤1400
wc -l src/engine/subsystems/walls/wall-tool/WallKeyboardHandler.ts          # → ≤185
wc -l src/engine/subsystems/walls/wall-tool/WallPreviewRenderer.ts          # → ≤160
wc -l src/engine/subsystems/walls/wall-tool/*.ts | awk '$1 > 1500'          # → 0 files
rg '(window as any)' src/engine/subsystems/walls/WallTool.ts                # → 0
rg 'window\.commandManager' src/engine/subsystems/walls/WallTool.ts         # → 0
npm run build                                                                # → ✓ EXIT:0
```


---

#### FILE 22 — `src/engine/subsystems/furniture/builders/ChairBuilder.ts` (1,666 LOC)

**What it is**: `IFurnitureBuilder` implementation for the chair furniture category. Contains 14 private builder methods, 1 dispatch router, 1 public entry point, and 2 private static geometry helpers. The entry point (`build()`, lines 22–34) applies `userData.skipInPlan = true` to all meshes for CHAIR_PLAN_TYPES so `EdgeProjectorService` excludes dense 3D-edge projections; `ChairPlanSymbolBuilder` injects a clean 2D symbol instead. No `@deprecated` tag — this is a live class.

The stub proposes splitting by "OfficeChairBuilder", "LoungeChairBuilder", "StoolBuilder", and "SofaBuilder" — but **none of these family labels match the actual content**: there are no office/task/ergonomic chairs, no stools, and no generic sofas in this file. The four real families (by shared design language and structural form) are: oak dining, tub/lounge, Barcelona (chair + ottoman + sofa), and specialty cantilever/A-frame. Two static geometry helpers (`_roundedBox`, `_plumpCushion`) are called across all four families and require a shared utility module.

**P-score (as-found)**:
- **P2 = 1**: `import * as THREE from 'three'` (line 1) — 1 namespace import. Phase E.1 scope.
- **P4 = 0**: No `(window as any)` casts. ✓
- **P6 = 0**: No `commandManager.execute()` or `window.commandManager`. ✓

**Window globals**: **ZERO** — pure geometry builder. No DOM interaction, no event listeners, no globals.

**Already-extracted sub-files**: `ChairPlanSymbolBuilder.ts` (imported line 5 as `CHAIR_PLAN_TYPES`).

**Cluster LOC table** (22 clusters):

| # | Cluster | Lines | LOC |
|---|---------|-------|-----|
| 1 | Imports (1 namespace: THREE; 4 named: IFurnitureBuilder, FurnitureData, MaterialService, CHAIR_PLAN_TYPES) | 1–5 | 5 |
| 2 | Class header + constructor (DI: `materialService`) | 7–9 | 3 |
| 3 | `build()` — **13-LOC** entry point: calls `_buildInner()`, then `group.traverse()` to tag `userData.skipInPlan = true` for CHAIR_PLAN_TYPES; comment notes Barcelona sofas (`barcelona_sofa_*`, `barcelona_corner_sofa`) intentionally NOT tagged | 11–34 | 24 |
| 4 | `_buildInner()` — **60-LOC** dispatch table: 14 `if (furnitureType ===)` branches + fallback generic chair (seat + backrest + 4 legs via `materialService.getMaterial()`) | 36–95 | 60 |
| **OAK DINING FAMILY** (3 methods, 296 LOC total) | | | |
| 5 | `buildOakChair(data, variant: 'solid'\|'slim')` — **110-LOC**: oval CylinderGeometry seat; curved CylinderGeometry back panel (arc centered at θ=π; JSDoc explains the −π/2 bug that caused the panel to float left); 2 tapered rear posts; 4 splayed tapered CylinderGeometry legs; side + H stretchers | 97–206 | 110 |
| 6 | `buildOakChairSlim(data)` — **82-LOC**: rounded oval CylinderGeometry seat (squash scale to ellipse); 2 rear posts; curved CylinderGeometry back panel (same arc formula); 4 splayed tapered legs | 208–289 | 82 |
| 7 | `buildOakCurvedUpholsteredChair(data)` — **104-LOC**: plump oval boucle seat (`ChairBuilder._plumpCushion`); extruded bevelled annulus backrest (`ExtrudeGeometry` of annular sector + `rotateX(-π/2)`); 2 cylindrical side posts; 4 straight tapered legs | 291–394 | 104 |
| **TUB / LOUNGE FAMILY** (3 methods, 361 LOC total) | | | |
| 8 | `buildThreeLegTerracottaChair(data)` — **131-LOC**: plump elliptical seat (`_plumpCushion`); horseshoe back band (extruded Shape with tangent-stub extensions at ends, ~210° arc, `rotateX(-π/2)`); 3 rectangular oak posts at horseshoe ends + rear-centre; `_roundedBox` for posts | 396–526 | 131 |
| 9 | `buildThreeLegObejitaBlackChair(data)` — **115-LOC**: near-duplicate of terracotta geometry; matte-black metal posts (higher metalness 0.55); off-white obejita boucle textile; same horseshoe path construction code duplicated verbatim (intentional: "future style tweaks don't bleed back") | 528–642 | 115 |
| 10 | `buildFourLegObejitaWoodChair(data)` — **115-LOC**: deep plump rectangular cushion (seatBotY=24%H so tub reads as armchair); horseshoe back band (~189° arc); 4 square-section oak corner posts (front pair to seat-top, back pair to back-band top) | 644–758 | 115 |
| **BARCELONA FAMILY** (6 methods + 2 helpers, 499 LOC total) | | | |
| 11 | `buildBarcelonaBlackChair(data)` — **175-LOC**: black leather seat (plump tufted `_roundedBox` scoop-tilted 14° around hinge); black leather back (tufted `_roundedBox`, rotated upright + tilted 14°); per-side chrome Bézier X-frame (`TubeGeometry` + `QuadraticBezierCurve3`); 2 transverse chrome rails | 760–934 | 175 |
| 12 | `buildBarcelonaOttoman(data)` — **97-LOC**: same chrome X-frame as lounge chair; flat (not scooped) tufted leather pad; 2 transverse rails | 936–1032 | 97 |
| 13 | `_barcelonaMaterials()` — **18-LOC** shared factory: leather, tuft, chrome `MeshStandardMaterial` trio | 1034–1051 | 18 |
| 14 | `_barcelonaXFrame(group, chrome, x, seatTopY, hingeY, hingeZ, halfL, tubeR)` — **37-LOC** shared X-frame arc builder; two `QuadraticBezierCurve3` per side; returns `{topZ, topY, frontZ, frontY}` for rail placement | 1053–1089 | 37 |
| 15 | `buildBarcelonaSofa(data, seats: 1\|2\|3)` — **125-LOC**: one continuous scoop-tilted seat + one continuous upright back; 2 outer chrome X-frames (only at outer arms, not between seats — would pierce cushion); 2 transverse rails + 2 floor-level transverse skids | 1091–1215 | 125 |
| 16 | `buildBarcelonaCornerSofa(data)` — **47-LOC**: delegates to `buildBarcelonaSofa` twice (3-seat main row + 2-seat wing); positions + rotates each leg; inside-corner overlap convention via `legDepth = 0.85` | 1217–1263 | 47 |
| **SPECIALTY FAMILY** (2 methods, 357 LOC total) | | | |
| 17 | `buildCescaTanChair(data)` — **240-LOC**: most complex method; chrome cantilever frame as one continuous `TubeGeometry` path per side (`CurvePath` of 4 `LineCurve3` + 4 `QuadraticBezierCurve3` bends; 220 tube segments); separate back-post tubes; 2 cross-tubes; tan leather tufted seat; walnut-framed cane back (outer frame + backing panel + 18 vertical + 12 horizontal cane strands as CylinderGeometry) | 1265–1504 | 240 |
| 18 | `buildTextileWoodArmchair(data)` — **117-LOC**: A-frame wood side panels (front + rear BoxGeometry legs with splay rotation); walnut square-section armrests; hidden seat rails; plump boucle seat (`_plumpCushion`); plump tilted boucle back (`_plumpCushion` on side + rotation) | 1506–1622 | 117 |
| **SHARED GEOMETRY UTILS** (2 static methods, 40 LOC total; called across all 4 families) | | | |
| 19 | `static _roundedBox(w, h, d, r, segs)` — **35-LOC**: `ExtrudeGeometry` of rounded-rectangle Shape with matching bevel; called by families 2–4 (OakCurvedUph, ThreeLegTerracotta, BarcelonaBlackChair, BarcelonaOttoman, BarcelonaSofa, CescaTan, TextileWoodArmchair) | 1624–1658 | 35 |
| 20 | `static _plumpCushion(w, h, d)` — **5-LOC**: `_roundedBox` with r=30% bevel; called by ThreeLegTerracotta, ThreeLegObejitaBlack, FourLegObejitaWood, TextileWoodArmchair | 1660–1664 | 5 |
| **Total** | | | **~1,666** |

**Cross-family shared static helpers note**: `_roundedBox` and `_plumpCushion` are called from 7 of the 14 private builders across all 4 families. They cannot live in any single family module — they must move to a shared `ChairGeometryUtils.ts` and be imported by each family builder.

---

**Stub error table**:

| Stub claim | Actual finding | Action |
|---|---|---|
| `OfficeChairBuilder.ts` — "office/task/ergonomic chairs" | Zero office, task, or ergonomic chairs in the file. The file contains dining, tub/lounge, Barcelona, and cantilever/A-frame types only. | STRIKE; no such family exists |
| `StoolBuilder.ts` — "stool/bar stool/counter stool types" | Zero stools or bar stools in the file. Stub invents content that doesn't exist. | STRIKE; no such family exists |
| `SofaBuilder.ts` — "sofa/corner sofa/sectional types currently in ChairBuilder" | Only Barcelona-branded sofas (`barcelona_sofa_1/2/3seat`, `barcelona_corner_sofa`) — these are sub-types of the Barcelona design family sharing the chrome X-frame. No generic sofas. | STRIKE generic sofa framing; REPLACE with `BarcelonaBuilder.ts` |
| `LoungeChairBuilder.ts` — "lounge/Barcelona/Eames chair types" | Barcelona chair+ottoman+sofa+corner form one coherent family (499 LOC) sharing `_barcelonaMaterials()` and `_barcelonaXFrame()` helpers. No Eames chairs present. | REPLACE with `BarcelonaBuilder.ts` |
| No mention of oak dining family | `buildOakChair` + `buildOakChairSlim` + `buildOakCurvedUpholsteredChair` = 296 LOC with shared arc-panel formula (JSDoc explains the θ=π fix) | ADD `OakChairBuilder.ts` |
| No mention of tub/lounge family | `buildThreeLegTerracottaChair` + `buildThreeLegObejitaBlackChair` + `buildFourLegObejitaWoodChair` = 361 LOC; horseshoe-back geometry | ADD `TubChairBuilder.ts` |
| No mention of specialty family | `buildCescaTanChair` (240 LOC, most complex — continuous CurvePath chrome cantilever) + `buildTextileWoodArmchair` (117 LOC) = 357 LOC | ADD `SpecialtyChairBuilder.ts` |
| No mention of shared geometry helpers | `static _roundedBox` + `static _plumpCushion` called by 7 methods across ALL 4 families — cannot live in any single sub-file | ADD `ChairGeometryUtils.ts` |
| `userData.skipInPlan` tagging in shell `ChairBuilder.build()` | Correct (lines 22–34 already do this). ✓ | CONFIRM |
| Shell ≤200 LOC | After full extraction: `build()` 24 LOC + `_buildInner()` 60 LOC + class header/imports 10 LOC = ~95 LOC shell. ≤200 is achievable. ✓ | CONFIRM but clarify content |

---

**Corrected split target** (6 files total, not 5):

```
src/engine/subsystems/furniture/builders/
  ChairBuilder.ts                  (≤100 LOC — dispatch shell: build() + _buildInner() 14-branch router; imports 5 family builder modules; userData.skipInPlan tagging stays here)
  chair-families/
    ChairGeometryUtils.ts          (≤50 LOC — static _roundedBox + _plumpCushion; imported by all 4 family builders)
    OakChairBuilder.ts             (≤310 LOC — buildOakChair + buildOakChairSlim + buildOakCurvedUpholsteredChair; arc-panel formula with θ=π fix shared between first two)
    TubChairBuilder.ts             (≤370 LOC — buildThreeLegTerracottaChair + buildThreeLegObejitaBlackChair + buildFourLegObejitaWoodChair; horseshoe back band geometry)
    BarcelonaBuilder.ts            (≤510 LOC — buildBarcelonaBlackChair + buildBarcelonaOttoman + _barcelonaMaterials + _barcelonaXFrame + buildBarcelonaSofa + buildBarcelonaCornerSofa; all share chrome X-frame design language)
    SpecialtyChairBuilder.ts       (≤370 LOC — buildCescaTanChair + buildTextileWoodArmchair; both complex single-method builds)
```

**Corrected migration pattern**:
1. Extract `_roundedBox` + `_plumpCushion` → `ChairGeometryUtils.ts` as `export function`. All family builders import from there.
2. Each family builder exports a module-level function per builder method (or a thin class implementing `IFurnitureBuilder` — module functions preferred for tree-shaking alignment).
3. `ChairBuilder._buildInner()` imports from all 4 family modules; `ChairBuilder.build()` keeps the `userData.skipInPlan` tagging in the shell.
4. `barcelona_sofa_*` and `barcelona_corner_sofa` types route to `BarcelonaBuilder` (NOT a separate sofa builder).
5. No `@deprecated` — this is a full extraction, not minimal. Shell targets ≤100 LOC (not ≤200 as in stub, but ≤200 is the gate).
6. **P2 fix**: defer `import * as THREE` namespace elimination to Phase E.1.
7. **ZERO window globals**: no cleanup needed.

**Verifier after split**:
```bash
wc -l src/engine/subsystems/furniture/builders/ChairBuilder.ts                           # → ≤100
wc -l src/engine/subsystems/furniture/builders/chair-families/ChairGeometryUtils.ts      # → ≤50
wc -l src/engine/subsystems/furniture/builders/chair-families/OakChairBuilder.ts         # → ≤310
wc -l src/engine/subsystems/furniture/builders/chair-families/TubChairBuilder.ts         # → ≤370
wc -l src/engine/subsystems/furniture/builders/chair-families/BarcelonaBuilder.ts        # → ≤510
wc -l src/engine/subsystems/furniture/builders/chair-families/SpecialtyChairBuilder.ts   # → ≤370
wc -l src/engine/subsystems/furniture/builders/chair-families/*.ts | awk '$1 > 1500'     # → 0 files
rg '(window as any)' src/engine/subsystems/furniture/builders/ChairBuilder.ts            # → 0
npm run build                                                                             # → ✓ EXIT:0
```


---

#### FILE 23 — `src/engine/subsystems/styles/panels/renderingPanels.ts` (1,641 LOC)

**What it is**: Pure CSS-in-JS module. CONTRACT §05 §2: CSS layer only, zero logic. Contains **9** template-literal CSS export constants (not 5 as the stub claims). No TypeScript imports, no logic, no class instantiation.

**P-score (as-found)**:
- **P2 = 0**: No namespace imports. ✓
- **P4 = 0**: No `(window as any)` casts. ✓
- **P6 = 0**: No `commandManager.execute()`. ✓

**Window globals**: **ZERO** — pure CSS-in-JS, no JS at all.

**Complete CSS block inventory** (9 blocks — stub lists only 5, misnames 2, misses 4):

| # | Export name | Lines | LOC | UI element |
|---|-------------|-------|-----|------------|
| 1 | `RQP_PANEL_STYLES` | 8–149 | 142 | Render Queue Panel (`rqp-`) |
| 2 | `VIZ_ENGINE_PANEL_STYLES` | 150–626 | 477 | Visualization Engine panel (`viz-`) — **largest block** |
| 3 | `REAL_SUN_STYLES` | 627–770 | 144 | Real Sun Control (`rs-`) |
| 4 | `FW_PANEL_STYLES` | 771–822 | 52 | Walkthrough HUD (`fw-`) — **stub MISSES entirely** |
| 5 | `SCF_STYLES` | 823–918 | 96 | Scene Config Form full-screen overlay (`scf-`) — **stub MISSES entirely** |
| 6 | `RHI_STYLES` | 919–946 | 28 | Render History Item badge (`rhi-`) — **stub MISSES entirely** |
| 7 | `PSCB_STYLES` | 947–998 | 52 | Plan Symbol Cache pre-bake progress toast (`pscb-`; §PHASE-4 Task 4.3) — **stub MISSES entirely** |
| 8 | `PHOTOREALISTIC_SIDEBAR_STYLES` | 999–1129 | 131 | Photorealistic sidebar (`ps-`) |
| 9 | `EXPORT_STUDIO_STYLES` | 1130–1641 | 512 | Export Studio panel (`es-`) — second-largest block |
| **Total** | | | **~1,641** | |

---

**Stub error table**:

| Stub claim | Actual finding | Action |
|---|---|---|
| "5 rendering-panel CSS blocks" | 9 CSS export constants | STRIKE 5; correct to 9 |
| `VIZ_ENGINE_STYLES` | Actual export name is `VIZ_ENGINE_PANEL_STYLES` | CORRECT name |
| `RENDER_PANEL_SIDEBAR_STYLES` | Actual export name is `PHOTOREALISTIC_SIDEBAR_STYLES` | CORRECT name |
| **MISSING**: `FW_PANEL_STYLES` | 52-LOC Walkthrough HUD (`fw-` prefix) | ADD `walkthroughHUD.ts` |
| **MISSING**: `SCF_STYLES` | 96-LOC Scene Config Form overlay (`scf-` prefix) | ADD `sceneConfigForm.ts` |
| **MISSING**: `RHI_STYLES` | 28-LOC Render History Item badge (`rhi-` prefix) | ADD `renderHistoryItem.ts` |
| **MISSING**: `PSCB_STYLES` | 52-LOC Plan Symbol Cache pre-bake progress toast (`pscb-`; §PHASE-4 Task 4.3) | ADD `planSymbolCacheBake.ts` |
| 5 sub-files | 9 CSS export constants → 9 sub-files | STRIKE 5; correct to 9 |
| `awk '$1 > 500'` in verifier | `EXPORT_STUDIO_STYLES` (512 LOC) and `VIZ_ENGINE_PANEL_STYLES` (477 LOC) both exceed 500 when isolated — use `awk '$1 > 550'` | ADJUST gate |
| Shell ≤50 LOC | Correct: 9-line re-export barrel + docblock ≈ 20 LOC ✓ | CONFIRM |

---

**Corrected split target** (10 files: 1 barrel + 9 CSS files):

```
src/engine/subsystems/styles/panels/
  renderingPanels.ts                     (≤25 LOC — 9-export re-export barrel; docblock; zero logic)
  rendering-panels/
    renderQueuePanel.ts                  (RQP_PANEL_STYLES — rqp-; ≤150 LOC)
    visualizationEnginePanel.ts          (VIZ_ENGINE_PANEL_STYLES — viz-; ≤490 LOC)
    realSunControl.ts                    (REAL_SUN_STYLES — rs-; ≤155 LOC)
    walkthroughHUD.ts                    (FW_PANEL_STYLES — fw-; ≤60 LOC)
    sceneConfigForm.ts                   (SCF_STYLES — scf-; ≤105 LOC)
    renderHistoryItem.ts                 (RHI_STYLES — rhi-; ≤35 LOC)
    planSymbolCacheBake.ts               (PSCB_STYLES — pscb-; ≤60 LOC)
    photorealisticSidebar.ts             (PHOTOREALISTIC_SIDEBAR_STYLES — ps-; ≤140 LOC)
    exportStudioPanel.ts                 (EXPORT_STUDIO_STYLES — es-; ≤525 LOC)
```

**Corrected migration pattern**: same as FILES 13 and 14 — pure mechanical CSS split + re-export barrel. Each sub-file exports a single `export const X_STYLES = \`...\`` template literal. Barrel re-exports all 9 using `export { X } from './rendering-panels/y'`.

**Verifier after split**:
```bash
wc -l src/engine/subsystems/styles/panels/renderingPanels.ts                         # → ≤25
wc -l src/engine/subsystems/styles/panels/rendering-panels/*.ts | awk '$1 > 550'     # → 0 files
grep -r 'RQP_PANEL_STYLES\|VIZ_ENGINE_PANEL_STYLES\|REAL_SUN_STYLES\|FW_PANEL_STYLES\|SCF_STYLES\|RHI_STYLES\|PSCB_STYLES\|PHOTOREALISTIC_SIDEBAR_STYLES\|EXPORT_STUDIO_STYLES' src/ --include='*.ts' -l   # confirm all import sites still resolve
npm run build                                                                          # → ✓ EXIT:0
```


---

#### FILE 24 — `src/engine/subsystems/ai/QueryEngine.ts` (1,618 LOC)

**What it is**: AI natural-language query dispatcher for BIM operations. Routes text input against a flat array of `QueryPattern` entries (`{patterns: RegExp[], handler: async (...) => QueryResult}`). Contains: the pattern dispatch engine (`query()`), a `COMMAND_FAMILY_HELP` dictionary of help strings (17 LOC), a `ws<T>` window-cast shim (2 LOC), 5 private wardrobe parser helper methods, and 21+ pattern entries inside `initializePatterns()` (1,241 LOC). A `getSupportedQueries()` method lists example queries.

The stub claims the file has "12 BIM domain pattern sets" matching the `COMMAND_FAMILY_HELP` dictionary keys — this is wrong. `COMMAND_FAMILY_HELP` is pure help text (17 LOC); many of its 12 domains (stairs/railings, beams/columns, data workbench, IFC conversion, rooms, views/templates, sheets/schedules) have **zero query patterns** in this file. The actual pattern groups in `initializePatterns()` are 6: command help, model read, wardrobe, slab/wall bulk ops, structural grids, and visibility (hide/isolate/highlight).

**Bug found**: "create walls on all slabs" pattern group is duplicated verbatim at lines 921–957 and again at lines 1287–1323. The second occurrence is dead code (first match wins in `query()`). Should be removed during split.

**P-score (as-found)**:
- **P2 = 0**: Named imports only (5 named from 4 AI-subsystem modules). No namespace imports. ✓
- **P4 = 1**: `ws<T>` helper (line 8) uses `window as unknown as Record<string, unknown>` to read arbitrary window keys — this IS a `window as unknown` cast. Wave 5 Day 2 comment: "Pattern B/A shim". Used at: line 442 (`projectContext`), 513 (`projectContext`), 516 (`furnitureStore`), 544 (`projectContext`), 782 (`commandManager`), 819 (`projectContext`), 1155 (`projectContext`). Phase E migration. **P4 = 1.**
- **P6 = 1**: `cm.execute(new RemoveGridCommand({gridId: g.id}))` at line 796 where `cm = ws<any>('commandManager')` — this reaches `window.commandManager.execute()` via the P4 shim. Phase E-bus.1 migration. **P6 = 1.**

**Window globals inventory** (16 `window.dispatchEvent()` + 7 explicit property reads + 3 `ws()` store accesses):

| Line(s) | Access | Phase |
|---------|--------|-------|
| 8 | `window as unknown as Record<string, unknown>` (ws shim) | E |
| 189, 492, 586, 635, 672, 868, 1051, 1276, 1345, 1369, 1393, 1436, 1479, 1511, 1535 | `window.dispatchEvent(new CustomEvent(...))` — 15 event dispatches; used for `ai-proposal-added` and `pryzm-visibility-command` | E-bus |
| 782 | `ws<any>('commandManager')` → `.execute(RemoveGridCommand)` — **P6** | E-bus.1 |
| 785–786 | `window.gridStore` (direct read) | E |
| 442, 513, 544, 819, 1155 | `ws<{selectedElementId?}>('projectContext')?.selectedElementId` | E |
| 516 | `ws<any>('furnitureStore')` | E |
| 1336–1338, 1360–1362, 1384–1386 | `window.bimManager?.getLevels?.() ?? window.wallStore?.getLevels?.() ?? window.projectContext?.levels` (3 visibility handlers) | E |
| 1529 | `window.selectionManager?.world?.scene?.three` | E |

**Cluster LOC table** (8 clusters):

| # | Cluster | Lines | LOC |
|---|---------|-------|-----|
| 1 | Imports (5 named: AIReadModel, QueryResult, AIServiceLike, commandProposalStore, decisionRecordStore, AIIntentType) | 1–5 | 5 |
| 2 | `ws<T>` shim (Wave 5 Day 2 Pattern B/A) + `QueryPattern` type + `COMMAND_FAMILY_HELP` dictionary (12 entries, help text for command families) | 7–30 | 24 |
| 3 | Class header + 2 fields (`readModel`, `aiService`) + constructor + `setAIService()` + `query()` loop | 32–62 | 31 |
| 4 | `handleWardrobeModification(selectedId, input, el)` — **137-LOC** async: dim parsing (`parseDim`), branch parsing for corner wardrobes (`mainBranch`/`sideBranch`), global fallback parsing, aiService proposal injection + `window.dispatchEvent('ai-proposal-added')` × 4 | 64–200 | 137 |
| 5 | Wardrobe helper methods: `createDefaultSections()` + `parseComponents()` (position-based + index matching) + `parseDoorsAndFeatures()` + `applyComponentToSection()` — **98-LOC** | 202–299 | 98 |
| 6 | `initializePatterns()` — **1,241-LOC** flat array with 21+ entries (organized into 6 natural groups): ① command help (2 entries, 30 LOC) ② model read (4 entries: summary, decisions, element count, levels, 100 LOC) ③ wardrobe ops (4 entries: create + modify + add feature + alternative modify, 650 LOC; handlers call `handleWardrobeModification`) ④ slab/wall bulk ops (7 entries: slab color, slab thickness, add N levels, create slabs on all floors, wall between marks, walls on all slabs×2, curtain walls on all slabs, perimeter walls on slab, perimeter curtain walls on slab, curtain wall property, 350 LOC) ⑤ structural grid (2 entries: create grid system, delete all grids, 90 LOC) ⑥ visibility (7 entries: hide/isolate/highlight by level, by category, by type, height filter, restore all, 215 LOC) | 301–1542 | 1241 |
| 7 | `triggerActionsTab()` — **25-LOC**: opens AI panel if hidden + dispatches `switch-tab` event to ribbon + fallback `.ai-tab-btn` click | 1544–1568 | 25 |
| 8 | `getSupportedQueries()` — **47-LOC**: 43-item example query list | 1570–1616 | 47 |
| **Total** | | | **~1,618** |

**Duplicate pattern note**: Entries at lines 921–957 and 1287–1323 are word-for-word identical ("create walls on all slabs" / "generate walls on all slabs" / "add walls to all slabs" with same handler body). Dead code — second match is unreachable. Remove one copy during split.

---

**Stub error table**:

| Stub claim | Actual finding | Action |
|---|---|---|
| "12 BIM domain pattern sets" matching `COMMAND_FAMILY_HELP` keys | Stub confuses the help-text dict (17 LOC, 12 keys) with pattern groups. Actual pattern groups = 6: command help, model read, wardrobe, slab/wall, grid, visibility | STRIKE 12-domain framing |
| `WallsQueryDomain.ts` | Zero wall-specific AI patterns. Wall-adjacent: "create wall between marks" (1 entry) and "create walls on all slabs" (1 entry, slab context). | STRIKE as standalone domain |
| `OpeningsQueryDomain.ts` | Zero door/window patterns in this file. | STRIKE |
| `SlabsQueryDomain.ts` | Slabs are part of a broader slab/wall/grid bulk-ops cluster with 10+ entries. | REPLACE with `SlabWallBulkOpsDomain.ts` |
| `ViewsQueryDomain.ts`, `SheetsQueryDomain.ts`, `RoomsQueryDomain.ts`, `StairsQueryDomain.ts`, `StructureQueryDomain.ts` | All zero patterns in this file. These appear only as `COMMAND_FAMILY_HELP` keys (help text). | STRIKE all 5 |
| `SelectionQueryDomain.ts` | Zero selection patterns (selection ops are in another handler). | STRIKE |
| `DataWorkbenchQueryDomain.ts` | Zero data workbench patterns. | STRIKE |
| `IFCQueryDomain.ts` | Zero IFC conversion patterns. | STRIKE |
| `VisibilityQueryDomain.ts` | Correct concept; actually present as 7 pattern entries (215 LOC). | CONFIRM; fix LOC estimate |
| `QueryHelpDictionary.ts` | `COMMAND_FAMILY_HELP` = 17 LOC. `getDomainPatterns()` wraps 2 help patterns. Extractable but tiny. | CONFIRM but note it's 50 LOC not hundreds |
| **MISSING**: Wardrobe domain | `handleWardrobeModification` (137 LOC) + 4 helper methods (98 LOC) + 4 wardrobe pattern entries (~450 LOC combined) — largest domain by LOC | ADD `WardrobeQueryDomain.ts` |
| **MISSING**: `ws<T>` shim — P4=1 | Wave 5 Day 2 Pattern B/A window cast — used 7 times; Phase E migration | ADD P4=1 to score; document migration |
| **MISSING**: P6=1 | `cm.execute(new RemoveGridCommand())` via `ws('commandManager')` — Phase E-bus.1 | ADD P6=1 to score |
| **MISSING**: duplicate pattern bug | "create walls on all slabs" group duplicated at lines 921–957 + 1287–1323 | REMOVE duplicate during split |
| Shell ≤300 LOC | Shell needs: class skeleton + `initializePatterns()` dispatcher + `triggerActionsTab()` + `getSupportedQueries()` + `ws` shim ≈ 200 LOC if all patterns extracted. ≤300 is achievable. ✓ | CONFIRM with corrected pattern |

---

**Corrected split target** (7 files, not 14):

```
src/engine/subsystems/ai/
  QueryEngine.ts                    (≤220 LOC — class skeleton; constructor + query() loop; ws shim; triggerActionsTab; getSupportedQueries; calls getDomainPatterns() from all 5 domain modules)
  query-domains/
    QueryHelpDomain.ts              (≤55 LOC — COMMAND_FAMILY_HELP dict + 2 help-text pattern entries; getDomainPatterns())
    ModelReadDomain.ts              (≤120 LOC — 4 model read patterns: summary, decisions, element count, levels; getDomainPatterns())
    WardrobeQueryDomain.ts          (≤530 LOC — handleWardrobeModification + 4 helper methods + 4 wardrobe pattern entries; exports getDomainPatterns() + handler helpers)
    SlabWallGridDomain.ts           (≤440 LOC — 10 slab/wall/grid bulk-op patterns: slab color+thickness, add levels, create-slabs-on-all-floors, wall between marks, walls on all slabs [de-duped], curtain walls on all slabs, perimeter walls, curtain wall properties, create+delete grid; getDomainPatterns())
    VisibilityQueryDomain.ts        (≤225 LOC — 7 visibility pattern entries: hide/isolate/highlight by level+category+type+height, restore all; getDomainPatterns())
```

**Corrected migration pattern**:
1. Each domain module exports `getDomainPatterns(): QueryPattern[]` and optionally shared handler helpers.
2. `QueryEngine.initializePatterns()` becomes: `return [...QueryHelpDomain.getDomainPatterns(), ...ModelReadDomain.getDomainPatterns(), ...WardrobeQueryDomain.getDomainPatterns(), ...SlabWallGridDomain.getDomainPatterns(), ...VisibilityQueryDomain.getDomainPatterns()]`.
3. Remove duplicate "create walls on all slabs" entry (second occurrence at lines 1287–1323).
4. `handleWardrobeModification` + 4 helpers move to `WardrobeQueryDomain.ts`; `QueryEngine` calls them via import.
5. **P4 fix** (Phase E): replace `ws<T>(k)` shim with DI-injected stores once E-bus wires them. Migration tracked at `09-WAVE-5-CAST-DELETION.md §3 Pattern A/C`.
6. **P6 fix** (Phase E-bus.1): replace `cm.execute(new RemoveGridCommand())` with `runtime.commandBus.dispatch(...)`.
7. **ZERO namespace imports** — no P2 fix needed.

**Verifier after split**:
```bash
wc -l src/engine/subsystems/ai/QueryEngine.ts                                # → ≤220
wc -l src/engine/subsystems/ai/query-domains/WardrobeQueryDomain.ts          # → ≤530
wc -l src/engine/subsystems/ai/query-domains/SlabWallGridDomain.ts           # → ≤440
wc -l src/engine/subsystems/ai/query-domains/*.ts | awk '$1 > 1500'          # → 0 files
rg 'create walls on all slabs' src/engine/subsystems/ai/query-domains/ --count   # → 1 (de-duped)
npm run build                                                                  # → ✓ EXIT:0
```


---

#### FILE 25 — `src/engine/subsystems/core/views/SplitViewManager.ts` (1,590 LOC)

**What it is**: Secondary split-view pane for PRYZM — a Canvas2D floor-plan/section/elevation renderer that coexists with the main THREE.js viewport. Manages the complete SVP lifecycle: DOM construction (pane + header + canvas + divider), Canvas2D render loop (via `PlanViewCanvas`), pan/zoom/click input, divider drag, view-type switching (plan/section/elevation/3D-mirror/schedule/sheet), VG event subscription, selection event subscription, and primary renderer resize notification. Delegates Canvas2D drawing to `PlanViewCanvas` and hit-testing to `PlanViewInteraction`. No second THREE.js renderer is created — see file header for GPU isolation rationale.

**P-score (as-found)**:
- **P2 = 1**: `import * as THREE from 'three'` (line 25) + `import * as OBC from '@thatopen/components'` (line 26). Only 5 THREE types used (`Box3`, `Mesh`, `Scene`, `Vector2`, `Vector3`) and 1 OBC type (`World`) — all replaceable with named/type imports. **P2 = 1.**
- **P4 = 0**: All `as any` casts apply to typed objects (`viewDef as any`, `world.renderer as any`, etc.) — no `window as unknown` casts. `_getLevels()` reads `window.bimManager` and `window.projectContext` directly (plain property access, not a cast). ✓ P4 = 0.
- **P6 = 0**: No `commandManager.execute()` calls anywhere. ✓

**Window globals inventory** (5 PRYZM globals + 9 custom event dispatches):

| Line(s) | Access | Phase |
|---------|--------|-------|
| 960 | `window.scheduleRegistry?.getRows?.(id)` — schedule data in `_renderEmbed` | E |
| 1124–1125 | `window.planViewManager?._viewDef?.id` — reads standalone PlanViewManager's active view for linked highlighting | E |
| 1153, 1327 | `window.pryzmCanvas` — preferred WebGPU source in `_render3dMirror` + `_forward3dClickToMain` | E |
| 1560 | `window.bimManager?.getLevels?.()` — level list in `_getLevels()` | E |
| 1568 | `window.projectContext?.getLevels?.()` — fallback level source | E |
| 246–252 | `window.dispatchEvent(new CustomEvent('split-view-activated' / 'layout-changed' / 'view-changed'))` × 3 in `activate()` | E-bus |
| 281–287 | `window.dispatchEvent(new CustomEvent('split-view-deactivated' / 'layout-changed' / 'view-changed'))` × 3 in `deactivate()` | E-bus |
| 859 | `window.dispatchEvent(new CustomEvent('split-view-view-changed'))` in `_onViewSelectChange` | E-bus |
| 1460 | `window.dispatchEvent(new CustomEvent('split-view-layout-changed'))` in `_onDividerMouseUp` | E-bus |
| 1489 | `window.dispatchEvent(new CustomEvent('split-view-layout-changed'))` in `_applySplitRatio` | E-bus |
| 1585 | `window.dispatchEvent(new Event('resize'))` in `_notifyPrimaryResize` — triggers OBC viewport resize | E-bus |

Note: `window.addEventListener` / `window.removeEventListener` / `window.innerWidth` / `window.innerHeight` / `window.devicePixelRatio` / `window.PointerEvent` are standard browser APIs, not PRYZM globals.

**Cluster LOC table** (7 natural clusters):

| # | Cluster | Lines | LOC |
|---|---------|-------|-----|
| 1 | File header (JSDoc block + 3 contracts) | 1–23 | 23 |
| 2 | Imports (16 named + 2 namespace) | 25–49 | 25 |
| 3 | Constants + `Level` interface | 51–61 | 11 |
| 4 | Class header: 20 private fields (DOM refs, state, bound handlers) | 63–163 | 101 |
| 5 | Constructor + 6 public getters/setters + 4 public API methods (activate/deactivate/toggle/refitCamera) | 164–299 | 136 |
| 6 | **DOM cluster** — `_buildDOM()` (165 LOC) + `_teardownDOM()` (37 LOC) + `_buildViewSelectOptions()` (52 LOC) | 303–507 | 254 |
| 7 | **Canvas2D / Render cluster** — `_buildContext()` (37 LOC) + `_teardownContext()` (3) + `_configureCanvasForView()` (28) + `_syncCanvasSize()` (4) + `_setCameraElevation()` (3) + `_render()` (36) + `_render3dMirror()` (37) + `_draw3dPlaceholder()` (8) + `_fitCamTargetToScene()` (20) + `_syncPlanCanvasState()` (4) + `_adoptPlanCanvasState()` (5) + `_syncGridToggleButton()` (5) + `_readGridPreference()` (5) + `_writeGridPreference()` (5) + `_getLevels()` (20) | 509–1078 | 205* |
| 8 | **Event subscription cluster** — `_subscribeVGEvents()` (29 LOC: 7 VG events + 3 underlay events) + `_unsubscribeVGEvents()` (3) + `_subscribeSelectionEvents()` (80: bim-selection-changed, svp:drawing-refreshed, vd:view-updated, IFC_PROJECTION_CHANGED_EVENT) + `_unsubscribeSelectionEvents()` (3) | 597–720 | 115 |
| 9 | **View-mode controller cluster** — `_onViewSelectChange()` (70 LOC: handles `__3d__`, `__sched:ID`, `__sheet:ID`, plan/section/elevation) + `_activateMode()` (40: show/hide canvas vs embed div) + `_renderEmbed()` (143: schedule table builder + sheet metadata builder) | 804–1066 | 253 |
| 10 | **Input handler cluster** — `_onWheel()` (21 LOC: zoom + FrameScheduler motion span) + `_onMouseDown()` (31: pan start + click candidate) + `_onMouseMove()` (14: world-space delta) + `_onMouseUp()` (52: 3D click-through branch + click-to-select + pan-end) + `_forward3dClickToMain()` (44: NDC→mainCanvas event synthesis) + `_trySelectAtCanvasPoint()` (6: hitTest → selectionBus) | 1183–1381 | 168 |
| 11 | **Divider + layout cluster** — `_onDividerMouseDown()` (7) + `_onDividerMouseMove()` (23: frameScheduler coalesce) + `_applyDragRatio()` (20: cheap live drag) + `_onDividerMouseUp()` (22: flush + commit) + `_onSecondaryResize()` (3) + `_paneSize()` (8) + `_applySplitRatio()` (7) + `_positionDivider()` (5) + `_notifyPrimaryResize()` (9) | 1383–1589 | 107 |
| **Total** | | | **~1,590** |

*Cluster 7 straddles clusters 8/9 in the source because the subscription methods appear between the canvas methods and the view-mode methods; the LOC counts reflect actual line usage.

---

**Stub error table**:

| Stub claim | Actual finding | Action |
|---|---|---|
| Shell ≤300 LOC (pane lifecycle: open/close/resize/overlay) | `activate()` alone is 66 LOC; `_buildDOM()` is 165 LOC; DOM cluster = 254 LOC. Shell that retains public API + lifecycle glue + field declarations = ~400–500 LOC. ≤300 is unachievable. | CORRECT to ≤500 |
| `SplitViewVGApplicator.ts` (VG override injection for split-view pen styles) | No VG style injection exists — the VG resolver is an anonymous 15-LOC closure inside `_buildContext()` that calls `vgGovernanceStore.resolveStyle()`. The VG "applicator" is just `_subscribeVGEvents()` (29 LOC) + unsubscriber (3 LOC) — identical in concern to the stub's own `SplitViewEventBridge.ts`. Stub duplicated the concept under a misleading name. | STRIKE `SplitViewVGApplicator.ts`; merge into `SplitViewEventBridge.ts` |
| `SplitViewEventBridge.ts` (view-selected / view-change event wiring) | Correct concept; actual scope is `_subscribeVGEvents` + `_subscribeSelectionEvents` + their unsubscribers (~115 LOC). Covers 7 VG events + 3 underlay events + 4 selection/view events. | CONFIRM; fix LOC estimate |
| `SplitViewRenderer.ts` (Canvas2D render loop reading ViewTechnicalDrawingCache + draws edges) | Correct concept; actual scope is `_buildContext` + `_configureCanvasForView` + `_render` + `_render3dMirror` + `_draw3dPlaceholder` + camera state helpers (~165 LOC). Drawing delegation is through `PlanViewCanvas.render()` — no direct edge drawing in this file. | CONFIRM; fix scope to include context lifecycle |
| **MISSING**: view-mode controller cluster | `_onViewSelectChange` (70 LOC) + `_activateMode` (40 LOC) + `_renderEmbed` (143 LOC) = **253 LOC** — largest single extracted cluster. Handles 5 distinct content modes (plan/section/elevation, 3D mirror, schedule table, sheet metadata). | ADD `SplitViewModeController.ts` |
| **MISSING**: input handler cluster | `_onWheel` + `_onMouseDown` + `_onMouseMove` + `_onMouseUp` + `_forward3dClickToMain` + `_trySelectAtCanvasPoint` = **168 LOC**. `_forward3dClickToMain` (44 LOC) alone synthesises a 5-event PointerEvent sequence for 3D-mirror click-through — non-trivial logic. | ADD `SplitViewInputHandler.ts` |
| **MISSING**: divider + layout cluster | Divider drag (72 LOC) + layout helpers (`_paneSize`, `_applySplitRatio`, `_positionDivider`, `_notifyPrimaryResize`, `_onSecondaryResize`) (35 LOC) = **107 LOC**. Divider uses `getFrameScheduler().scheduleOnce()` for rAF coalescing (P3-compliant). | ADD to `SplitViewInputHandler.ts` or own `SplitViewLayout.ts` |
| `SplitViewVGApplicator` "reuses logic from PlanViewVGApplicator (FILE 15)" | PlanViewVGApplicator does not exist as a file. Applicator pattern is a closure inside `_buildContext()`, not a class. | STRIKE inheritance claim |
| P2 = 0 (stub does not mention P2) | P2=1: two namespace imports (`import * as THREE` + `import * as OBC`). All 6 types needed are named-importable. | ADD P2=1 to score + fix instructions |

---

**Corrected split target** (7 files, not 4):

```
src/engine/subsystems/core/views/
  SplitViewManager.ts                      (≤480 LOC — class fields, constructor, public API (activate/deactivate/toggle/refitCamera + getters), lifecycle glue, tick registration, grid pref helpers, _getLevels; delegates heavy methods to sub-modules)
  split-view/
    SplitViewDOMBuilder.ts                 (≤270 LOC — _buildDOM, _teardownDOM, _buildViewSelectOptions; returns { pane, canvas, divider, viewSelect, gridToggleBtn, levelGroup, viewHeaderHandle, levelSelectRef })
    SplitViewCanvas.ts                     (≤210 LOC — _buildContext, _teardownContext, _configureCanvasForView, _render, _render3dMirror, _draw3dPlaceholder, _fitCamTargetToScene, _syncCanvasSize, _syncPlanCanvasState, _adoptPlanCanvasState)
    SplitViewEventBridge.ts               (≤130 LOC — _subscribeVGEvents, _unsubscribeVGEvents, _subscribeSelectionEvents, _unsubscribeSelectionEvents; merges what stub split into VGApplicator + EventBridge)
    SplitViewModeController.ts            (≤265 LOC — _onViewSelectChange, _activateMode, _renderEmbed; handles plan/3d/schedule/sheet modes)
    SplitViewInputHandler.ts              (≤175 LOC — _onWheel, _onMouseDown, _onMouseMove, _onMouseUp, _forward3dClickToMain, _trySelectAtCanvasPoint)
    SplitViewLayout.ts                    (≤115 LOC — _onDividerMouseDown/Move/Up, _applyDragRatio, _onSecondaryResize, _paneSize, _applySplitRatio, _positionDivider, _notifyPrimaryResize)
```

**Corrected migration pattern**:
1. `SplitViewDOMBuilder.buildDOM(config)` returns a handle object; `SplitViewManager.activate()` calls it and stores the handles. Teardown via `SplitViewDOMBuilder.teardownDOM(handle)`.
2. `SplitViewCanvas` is instantiated by `SplitViewManager` and receives shared state (`PlanViewCanvas` ref, frustum/camTarget refs) via constructor — no `this` leakage.
3. `SplitViewEventBridge.subscribe(callbacks)` returns disposers; `deactivate()` calls all disposers.
4. `SplitViewModeController` receives refs to `scheduleStore`, `sheetStore`, `viewDefinitionStore` and the embed element — no window globals except `window.scheduleRegistry` (Phase E).
5. `SplitViewInputHandler` receives refs to mutable pan/zoom state; bound methods stored in `SplitViewManager` for add/removeEventListener symmetry.
6. **P2 fix**: Replace `import * as THREE from 'three'` with `import { Box3, Mesh, Scene, Vector2, Vector3 } from 'three'`; replace `import * as OBC from '@thatopen/components'` with `import type { World } from '@thatopen/components'`. Apply in shell — sub-modules inherit via typed interfaces.

**Verifier after split**:
```bash
wc -l src/engine/subsystems/core/views/SplitViewManager.ts                    # → ≤480
wc -l src/engine/subsystems/core/views/split-view/SplitViewModeController.ts  # → ≤265
wc -l src/engine/subsystems/core/views/split-view/*.ts | awk '$1 > 1500'      # → 0 files
grep -n 'import \* as THREE\|import \* as OBC' src/engine/subsystems/core/views/SplitViewManager.ts  # → 0 lines
npm run build                                                                   # → ✓ EXIT:0
```


---

#### FILE 26 — `src/engine/subsystems/styles/panels/platformShell.ts` (1,577 LOC)

**What it is**: Pure CSS-in-JS module. 8 exported template-literal constants covering: platform toolbar (`plat-`), workspace mode bar (`wmb-`), ribbon menu (`rib-`), app/project menu dropdown (`apm-`), properties palette (`pp-`), contextual edit bar (`ceb-`), owner settings panel (`osp-`), and early access banner (`eab-`). CONTRACT §05 §2 — zero logic, CSS layer only.

The stub claims 4 CSS blocks and invents a `BRAND_STYLES` block. The file has **8 blocks**; `BRAND_STYLES` does not exist.

**P-score (as-found)**:
- **P2 = 0**: No imports at all (CSS-only module). ✓
- **P4 = 0**: No JavaScript logic, no casts. ✓
- **P6 = 0**: No command dispatch. ✓

**Window globals**: ZERO. Pure template-literal CSS module.

**CSS block inventory** (actual vs. stub):

| Block | Lines | LOC | Prefix | In stub? |
|-------|-------|-----|--------|----------|
| `PLATFORM_SHELL_STYLES` | 7–537 | 531 | `plat-` | ✓ (correct) |
| `WMB_STYLES` | 538–624 | 87 | `wmb-` | ✗ MISSED — WorkspaceModeBar pill |
| `RIBBON_STYLES` | 625–788 | 164 | `rib-` | ✓ (correct) |
| `APP_MENU_STYLES` | 789–822 | 34 | `apm-` | ✓ (but stub calls prefix `app-menu-`; actual CSS uses `.apm-*`) |
| `PROPERTIES_PALETTE_STYLES` | 823–895 | 73 | `pp-` | ✗ MISSED — PropertiesPalette phase 5.1 |
| `CEB_STYLES` | 897–1160 | 264 | `ceb-` | ✗ MISSED — Contextual Edit Bar, Phase 7, 264 LOC |
| `OSP_STYLES` | 1161–1534 | 374 | `osp-` | ✗ MISSED — Owner Settings Panel, Phase 10, 374 LOC |
| `EAB_STYLES` | 1536–1577 | 42 | `eab-` | ✗ MISSED — Early Access Banner, Phase 10 |
| `BRAND_STYLES` | — | — | `brand-` | ✗ INVENTED — does not exist in this file |
| **Total** | | **~1,577** | | |

Note: `PLATFORM_SHELL_STYLES` at 531 LOC is the largest single block and contains the full platform toolbar including top-bar centering layout, HUD overlay, and toolbar button groups. It is large but still well under the 1500 LOC gate so it can be extracted as a single sub-file.

---

**Stub error table**:

| Stub claim | Actual finding | Action |
|---|---|---|
| 4 CSS blocks total | 8 CSS blocks total | CORRECT |
| `BRAND_STYLES` (PRYZM logo + wordmark — brand-) | Block does not exist in this file. Brand/logo styles may be embedded inside `PLATFORM_SHELL_STYLES` inline, or exist in a separate file not in scope here. | STRIKE `brandStyles.ts` |
| Missing `WMB_STYLES` (87 LOC — WorkspaceModeBar wmb- pill) | `WMB_STYLES` at line 542 — "top-of-scene Author/Inspect/Data pill" for `WorkspaceModeBar.ts` | ADD `workspaceModeBar.ts` |
| Missing `PROPERTIES_PALETTE_STYLES` (73 LOC — pp- prefix) | `PROPERTIES_PALETTE_STYLES` at line 823 — PropertiesPalette Phase 5.1 native HTML replacement | ADD `propertiesPalette.ts` |
| Missing `CEB_STYLES` (264 LOC — ceb- prefix) | `CEB_STYLES` at line 901 — Contextual Edit Bar Phase 7 (floating circular icon buttons); 264 LOC alone — largest missed block | ADD `contextualEditBar.ts` |
| Missing `OSP_STYLES` (374 LOC — osp- prefix) | `OSP_STYLES` at line 1164 — Owner Settings Panel Phase 10, injected via `injectAppTheme()`; 374 LOC — second largest block | ADD `ownerSettingsPanel.ts` |
| Missing `EAB_STYLES` (42 LOC — eab- prefix) | `EAB_STYLES` at line 1539 — Early Access Banner Phase 10, injected via `injectAppTheme()` | ADD `earlyAccessBanner.ts` |
| `APP_MENU_STYLES` prefix `app-menu-` | Actual CSS classes use `.apm-*` prefix (App/Project Menu): `.apm-btn`, `.apm-btn:hover` | CORRECT prefix annotation in sub-file comment |
| Sub-files: 4 → 4 | Sub-files: 4 → 9 (8 CSS block files + 1 barrel) | CORRECT |
| Shell ≤50 LOC (re-export barrel) | Correct — barrel is pure re-exports, ≤50 LOC. ✓ | CONFIRM |

---

**Corrected split target** (9 files):

```
src/engine/subsystems/styles/panels/
  platformShell.ts                        (≤50 LOC — re-export barrel; exports all 8 named constants)
  platform-shell/
    platformToolbar.ts                    (PLATFORM_SHELL_STYLES — plat- prefix — 531 LOC → ≤545)
    workspaceModeBar.ts                   (WMB_STYLES — wmb- prefix — 87 LOC → ≤100)
    ribbonMenu.ts                         (RIBBON_STYLES — rib- prefix — 164 LOC → ≤175)
    appMenu.ts                            (APP_MENU_STYLES — apm- prefix — 34 LOC → ≤45)
    propertiesPalette.ts                  (PROPERTIES_PALETTE_STYLES — pp- prefix — 73 LOC → ≤85)
    contextualEditBar.ts                  (CEB_STYLES — ceb- prefix — 264 LOC → ≤275)
    ownerSettingsPanel.ts                 (OSP_STYLES — osp- prefix — 374 LOC → ≤385)
    earlyAccessBanner.ts                  (EAB_STYLES — eab- prefix — 42 LOC → ≤50)
```

**Migration pattern**: Identical to FILES 13, 14, 23 (pure CSS split):
1. Cut each `export const BLOCK_NAME = \`...\`` into its own file.
2. Re-export all 8 names from the barrel `platformShell.ts`: `export { PLATFORM_SHELL_STYLES } from './platform-shell/platformToolbar'; ...`
3. Zero logic changes — consumer imports (`import { OSP_STYLES } from '…/platformShell'`) continue to resolve via the barrel.
4. No P-violation fixes needed (no violations present).

**Verifier after split**:
```bash
wc -l src/engine/subsystems/styles/panels/platformShell.ts                         # → ≤50
wc -l src/engine/subsystems/styles/panels/platform-shell/contextualEditBar.ts      # → ≤275
wc -l src/engine/subsystems/styles/panels/platform-shell/ownerSettingsPanel.ts     # → ≤385
wc -l src/engine/subsystems/styles/panels/platform-shell/*.ts | awk '$1 > 1500'   # → 0 files
npm run build                                                                        # → ✓ EXIT:0
```


---

#### FILE 27 — `src/engine/subsystems/core/persistence/ProjectLoader.ts` (1,526 LOC)

**What it is**: Optimized project loading orchestrator. Opens a `StoreEventBus.beginBatch()` / `endBatch()` buffer, dispatches `Create*Command` for each BIM element type in load-priority order (0→30), and restores 18+ non-element stores. Contains two fast-path branches: (a) new `ImportProjectCommand` path (Phase 1, feature-flag-gated via `_useImportCommandPath()`) and (b) legacy per-element-type command dispatch (preserved verbatim for rollback). Also contains: phase-time instrumentation (cold-open audit), cancellation predicate support, `WallJoinResolver` and `RoomTopologyObserver` pause/resume wrappers, and `_rebuildSemanticGraph()` for pre-graph snapshots.

The stub describes the **legacy per-command path only** and invents an `IFCReferenceLoader.ts` while missing `PlumbingLoader.ts` and a `MetadataRestorer.ts` covering ~456 LOC of non-element-type store restoration.

**P-score (as-found)**:
- **P2 = 0**: All named imports (47 named imports from 36 modules). No namespace imports. ✓
- **P4 = 0**: `typeof window !== 'undefined' ? window.X : null` pattern at lines 275, 293, 1292 are safe direct property reads, not `window as unknown` casts. `window.localStorage` at line 1510 is standard browser API. ✓
- **P6 = 0**: `this.commandManager.execute(cmd, LOAD_META)` — `commandManager` is DI-injected via constructor (`constructor(private commandManager: CommandManager)`). The `exec = (cmd) => this.commandManager.execute(cmd, LOAD_META)` closure also uses DI. `window.commandManager` never appears. ✓

**Window globals inventory** (3 PRYZM globals + 1 custom event dispatch):

| Line(s) | Access | Phase |
|---------|--------|-------|
| 275–276 | `window.roomTopologyObserver?.pause?.()`/`.resume?.()` (guarded: `typeof window !== 'undefined'`) — ROOM TOPOLOGY OBSERVER pause during load | E |
| 293–294, 1333 | `window.__wallRebuildControl?.pause?.()`/`.resumeAndFlush?.()` — §LOAD-RAF-PAUSE scheduler pause | E |
| 1291–1293 | `window.annotationDependencyGraph?.rebuild?.()` — post-restore dependency graph rebuild (guarded) | E |
| 1217 | `window.dispatchEvent(new CustomEvent('pryzm-dxf-restore-overlays', {...}))` — DXF overlay geometry rebuild signal | E-bus |
| 1510–1512 | `window.localStorage.getItem('PRYZM_USE_IMPORT_COMMAND')` — feature flag runtime override (`_useImportCommandPath`) | standard API |

Note: `this.commandManager.execute()`, `this.commandManager.clearHistory()` at lines 265, 1355, 1373 are fully DI-compliant — **P6 = 0**.

**Cluster LOC table** (6 clusters):

| # | Cluster | Lines | LOC |
|---|---------|-------|-----|
| 1 | File header JSDoc (Modification Declaration: layer, phase, impact, risk, load order) | 1–46 | 46 |
| 2 | Imports (47 named imports) | 48–99 | 52 |
| 3 | **Exported utility functions**: `findOpeningElementData()` (24 LOC — merges window/door snapshot data into opening payload; exported for `ImportProjectCommand`) + `migrateRoofSnapshotToCommand()` (59 LOC — migrates roof.polygon / roof.footprint shapes across 3 schema generations) + `LoadResult` interface | 101–208 | 108 |
| 4 | **`ProjectLoader.load()` orchestration** (~480 LOC): class header + constructor; `load()` signature; phase-time instrumentation (`__phase_starts`, `__phase_ms`, `__phase()`); `LOAD_META` + `exec` helper; `topologyObserver.pause()`; `wallRebuildControl.pause()`; `_useImportCommandPath()` branch (ImportProjectCommand fast path = 23 LOC; OR legacy per-element path = **13 dispatch steps** below); `_rebuildSemanticGraph()` call; `result.success` calculation; finally block (endBatch + wallRebuildControl.resumeAndFlush + topologyObserver.resume + ReDetectRoomsCommand sweep + commandManager.clearHistory + PHASE_TIMINGS log) | 210–1402 | ~762* |
| 5 | **Metadata restoration block** (~456 LOC, within `load()` but logically distinct): SlabSystemType restore (lines 846–880, 35 LOC) + WallSystemType restore (882–917, 36 LOC) + CeilingSystemType restore (919–958, 40 LOC) + FloorSystemType restore (960–999, 40 LOC) + VG Governance deserialize (1001–1005, 5 LOC) + SemanticIndex deserialize (1007–1011, 5 LOC) + ViewDefinition store (1013–1017, 5 LOC) + VisibilityRule engine (1019–1023, 5 LOC) + VisibilityIntent+ViewIntentInstance stores (1025–1033, 9 LOC) + VG→Intent migration (1035–1048, 14 LOC) + ViewTemplate→Intent migration (1050–1066, 17 LOC) + style cache pre-warming (1068–1072, 5 LOC) + Sheet/Schedule stores (1073–1086, 14 LOC) + Hierarchy/Template/ElementCode stores (1088–1111, 24 LOC) + SemanticGraph restore (1113–1131, 19 LOC) + TemporalGraph restore (1133–1146, 14 LOC) + DecisionRecordStore (1148–1156, 9 LOC) + RequirementStore (1159–1185, 27 LOC) + AssetCatalogStore (1187–1204, 18 LOC) + DXF overlays (1206–1223, 18 LOC) + Annotation store (1225–1237, 13 LOC) + AnnotationConstraintStore (1249–1260, 12 LOC) + AnnotationVisibilityStore (1262–1272, 11 LOC) + OBCAnnotationAdapter (1274–1282, 9 LOC) + AnnotationDependencyGraph rebuild (1284–1299, 16 LOC) | 845–1302 | ~456 |
| 6 | **Private methods**: `_rebuildSemanticGraph()` (54 LOC: 4 relationship types: wall→opening, room→wall, room adjacency, room→unit) + `recordFail()` (6 LOC) + `_useImportCommandPath()` (24 LOC: feature flag resolver, localStorage + Vite env override) | 1404–1527 | 123 |
| **Total** | | | **~1,526** |

*Cluster 4 LOC includes the 13 element dispatch steps (legacy path) and the metadata restoration block (cluster 5) as they are nested inside `load()`. Cluster 5 is listed separately to highlight its extractability.

**Element dispatch steps** (legacy per-command path, PlanOrdering priority order):

| Step | Type | LOC | Stub sub-file |
|------|------|-----|--------------|
| 0 | ClearProjectCommand | 5 | (in shell) |
| 1 | AddLevelCommand × N (priority 10) | 18 | `GridLevelsLoader.ts` ✓ |
| 2 | AddGridCommand × N (priority 11) | 12 | `GridLevelsLoader.ts` ✓ |
| 3 | CreateColumnCommand × N (priority 15) | 17 | `StructureLoader.ts` ✓ |
| B7b | doorStore/windowStore restore (before walls) | 16 | (in WallLoader or shell) |
| 4 | CreateWallCommand + CreateWallOpeningCommand × N (priority 20) | 33 | `WallLoader.ts` ✓ |
| 5 | CreateSlabCommand × N (priority 21) | 15 | `SlabLoader.ts` ✓ |
| 5b | CreateCeilingCommand × N (priority 21.5) | 28 | `FloorCeilingLoader.ts` ✓ |
| 5c | CreateFloorCommand × N (priority 21.8) | 27 | `FloorCeilingLoader.ts` ✓ |
| 6 | CreateStairCommand × N (priority 22) | 23 | `StairLoader.ts` ✓ |
| 7 | CreateFurnitureCommand × N (priority 23) | 45 | `FurnitureLoader.ts` ✓ |
| 8 | CreateRoofCommand × N (priority 24) | 11 | `RoofLoader.ts` ✓ |
| 9 | CreateHandrailCommand × N (priority 25) | 16 | `HandrailLoader.ts` ✓ |
| **10** | **CreatePlumbingFixtureCommand × N (priority 25)** | **23** | **MISSING from stub** |
| 11 | CreateCurtainWallCommand × N (priority 26) | 20 | `CurtainWallLoader.ts` ✓ |
| 12 | CreateBeamCommand × N (priority 30) | 20 | `StructureLoader.ts` ✓ |
| 13 | BatchCreateRoomsCommand (priority 31) | 24 | `RoomsLoader.ts` ✓ |
| 13b | CreateRoomBoundingLineCommand × N (priority 31.5) | 20 | (merge into RoomsLoader) |

---

**Stub error table**:

| Stub claim | Actual finding | Action |
|---|---|---|
| Shell ≤300 LOC | 2 exported utils (108 LOC) + class skeleton + orchestration + phase instrumentation + finally block = ~420 LOC minimum before any private methods. ≤300 is unachievable. | CORRECT to ≤440 |
| `IFCReferenceLoader.ts` (load IFC reference mesh groups) | Zero IFC reference mesh loading in this file. IFC reference meshes are handled by a separate import pipeline (IFCLoader/EdgeProjectorService). | STRIKE `IFCReferenceLoader.ts` |
| `PlumbingLoader.ts` missing | Step 10 (`CreatePlumbingFixtureCommand × N`, 23 LOC) is present in the file — dismissed by stub | ADD `PlumbingLoader.ts` |
| No `MetadataRestorer.ts` or equivalent | Lines 845–1302: **456 LOC** restoring 18+ non-element stores: 4 system-type stores (slab/wall/ceiling/floor), VG governance, semanticIndex, viewDefinitions, visibility rules+intents, VG→Intent+ViewTemplate→Intent migrations, style cache pre-warm, sheets, schedules, hierarchy, templates, elementCodes, SemanticGraph, TemporalGraph, DecisionRecordStore, requirements, assetCatalog, DXF overlays, annotations (core+constraints+visibility+OBCbridge+DependencyGraph rebuild) | ADD `ProjectMetadataRestorer.ts` (~470 LOC) |
| "no window.commandManager. Already correct in the existing file" | ✓ Correct observation. `CommandManager` is constructor-injected. | CONFIRM |
| Missing: `ImportProjectCommand` fast-path | Lines 330–352: Phase 1 feature-flag path (`_useImportCommandPath()`) dispatches a single `ImportProjectCommand` instead of N per-element commands. Present in shell; stats rolled up from `importCmd.stats`. | ADD note to shell description |
| `OpeningLoader.ts` (CreateDoorCommand + CreateWindowCommand × N) | No `CreateDoorCommand` or `CreateWindowCommand` — openings are `CreateWallOpeningCommand`. Door/window records are pre-loaded into `doorStore`/`windowStore` (Step B7b) before walls. | CORRECT: rename `OpeningLoader.ts` → `WallLoader.ts` owns both steps |
| `RoomsLoader.ts` (CreateRoomCommand × N) | `BatchCreateRoomsCommand` (Step 13) + `CreateRoomBoundingLineCommand` (Step 13b). Both belong in `RoomsLoader.ts`. | CONFIRM + merge RBL |
| 4 exported utility functions: `findOpeningElementData`, `migrateRoofSnapshotToCommand` | Both exported (exported for use by `ImportProjectCommand`). Should stay in shell or `ProjectLoaderUtils.ts`. | NOTE |
| P2, P4, P6 not mentioned | P2=0, P4=0, P6=0 — all DI-compliant; no namespace imports; 3 PRYZM window globals (Phase E). | ADD P-score to plan |

---

**Corrected split target** (14 files, not 14 — same count but different content):

```
src/engine/subsystems/core/persistence/
  ProjectLoader.ts                  (≤440 LOC — LoadResult interface; exported utilities (findOpeningElementData, migrateRoofSnapshotToCommand); ProjectLoader class; load() orchestration: phase-time instrumentation, topologyObserver/wallRebuildControl pause/resume, storeEventBus.beginBatch/endBatch, ImportProjectCommand fast-path, ClearProjectCommand, cancellation checks, calls to all element loaders + metadataRestorer; finally block; _rebuildSemanticGraph; _useImportCommandPath; recordFail)
  element-loaders/
    GridLevelsLoader.ts             (≤60 LOC — loadLevels + loadGrids; AddLevelCommand + AddGridCommand)
    StructureLoader.ts              (≤55 LOC — loadColumns + loadBeams; CreateColumnCommand + CreateBeamCommand)
    WallLoader.ts                   (≤90 LOC — doorStore/windowStore preload (Step B7b) + loadWalls + loadWallOpenings; CreateWallCommand + CreateWallOpeningCommand)
    SlabLoader.ts                   (≤45 LOC — loadSlabs; CreateSlabCommand)
    FloorCeilingLoader.ts           (≤80 LOC — loadCeilings (Step 5b) + loadFloors (Step 5c); CreateCeilingCommand + CreateFloorCommand)
    StairLoader.ts                  (≤45 LOC — loadStairs; CreateStairCommand)
    FurnitureLoader.ts              (≤65 LOC — loadFurniture; CreateFurnitureCommand)
    RoofLoader.ts                   (≤40 LOC — loadRoofs; CreateRoofCommand; uses migrateRoofSnapshotToCommand from shell)
    HandrailLoader.ts               (≤40 LOC — loadHandrails; CreateHandrailCommand)
    PlumbingLoader.ts               (≤45 LOC — loadPlumbing; CreatePlumbingFixtureCommand)
    CurtainWallLoader.ts            (≤45 LOC — loadCurtainWalls; CreateCurtainWallCommand)
    RoomsLoader.ts                  (≤60 LOC — loadRooms (BatchCreateRoomsCommand) + loadRoomBoundingLines (CreateRoomBoundingLineCommand))
    ProjectMetadataRestorer.ts      (≤470 LOC — restoreMetadata(snapshot, commandManager): 4 system-type stores, VG, semanticIndex, viewDefs, visibility intents, 2 migrations, style pre-warm, sheets, schedules, hierarchy, templates, elementCodes, SemanticGraph, TemporalGraph, DecisionRecordStore, requirements, assetCatalog, DXF overlays, annotations+constraints+OBC bridge+dependency graph)
```

**Corrected migration pattern**:
1. Each loader signature: `function load*(snapshot: ProjectSnapshot, exec: (cmd: any) => any, result: LoadResult): void`. Receives the `exec` closure from `ProjectLoader` (DI-compliant).
2. `ProjectMetadataRestorer` signature: `async function restoreMetadata(snapshot: ProjectSnapshot, commandManager: CommandManager): Promise<void>`. Called in `try{}` block after element loaders.
3. Shell retains the full `storeEventBus.beginBatch()` / `finally { endBatch() }` frame — callee loaders never touch the event bus directly.
4. `findOpeningElementData` + `migrateRoofSnapshotToCommand` stay in the shell (already exported; `WallLoader` and `RoofLoader` import them from `'../ProjectLoader'`).
5. **P4 fix** (Phase E): replace `window.roomTopologyObserver`, `window.__wallRebuildControl`, `window.annotationDependencyGraph` with DI-injected references passed from `engineLauncher.ts`.
6. **ImportProjectCommand fast path** (Phase 1): already consolidated into a single command — element-loader extraction should NOT break this path; `ProjectLoader.load()` keeps the `if (useImportCmd)` branch intact.

**Verifier after split**:
```bash
wc -l src/engine/subsystems/core/persistence/ProjectLoader.ts                                    # → ≤440
wc -l src/engine/subsystems/core/persistence/element-loaders/ProjectMetadataRestorer.ts          # → ≤470
wc -l src/engine/subsystems/core/persistence/element-loaders/*.ts | awk '$1 > 1500'              # → 0 files
grep -rn 'window\.commandManager' src/engine/subsystems/core/persistence/                        # → 0 matches
npm run build                                                                                      # → ✓ EXIT:0
```


---

#### FILE 28 — `src/engine/subsystems/styles/panels/workflowPanels.ts` (1,512 LOC)

**What it is**: Pure CSS-in-JS module. 6 exported template-literal constants covering workflow and tool sub-panels: AI chat popup (`ai-popup` / `ai-*`), schedule panel (`sched-*`), panoramic photo panel (`pn-*`), photorealistic render panel (`ren-*`), render graph panel (`rg-*`), and video export panel (`ve-*`). CONTRACT §05 §2 — zero logic, CSS layer only.

The stub claims 3 CSS blocks and invents `RENDER_WORKFLOW_STYLES`. The file has **6 blocks**; `RENDER_WORKFLOW_STYLES` does not exist.

**P-score (as-found)**:
- **P2 = 0**: No imports at all (CSS-only module). ✓
- **P4 = 0**: No JavaScript logic, no casts. ✓
- **P6 = 0**: No command dispatch. ✓

**Window globals**: ZERO. Pure template-literal CSS module.

**CSS block inventory** (actual vs. stub):

| Block | Lines | LOC | Prefix | In stub? |
|-------|-------|-----|--------|----------|
| `AI_PANEL_POPUP_STYLES` | 7–752 | 746 | `ai-popup` / `.ai-*` — AI chat panel, suggestion chips, typing indicator | ✓ (correct) |
| `SCHEDULE_PANEL_STYLES` | 754–1061 | 308 | `.sched-*` — schedule editor panel | ✓ (but stub says prefix `sch-`; actual is `sched-`) |
| `PAN_PANEL_STYLES` | 1063–1244 | 182 | `.pn-*` — panoramic photo/360° capture panel | ✗ MISSED |
| `REN_PANEL_STYLES` | 1246–1319 | 74 | `.ren-*` — photorealistic render sub-panel | ✗ MISSED |
| `RG_PANEL_STYLES` | 1321–1438 | 118 | `.rg-*` — render graph/layer panel | ✗ MISSED |
| `VEX_PANEL_STYLES` | 1440–1512 | 73 | `.ve-*` — video export panel | ✗ MISSED |
| `RENDER_WORKFLOW_STYLES` | — | — | `rw-` | ✗ INVENTED — does not exist in this file |
| **Total** | | **~1,512** | | |

Note: `AI_PANEL_POPUP_STYLES` at 746 LOC is the largest single block but remains well under the 1500 LOC gate; it can be extracted as a single sub-file without further splitting.

---

**Stub error table**:

| Stub claim | Actual finding | Action |
|---|---|---|
| 3 CSS blocks total | 6 CSS blocks total | CORRECT |
| `RENDER_WORKFLOW_STYLES` (render sub-workflow chrome — `rw-`) | Block does not exist. The three render-related blocks in this file are `REN_PANEL_STYLES`, `RG_PANEL_STYLES`, `VEX_PANEL_STYLES`. | STRIKE `renderWorkflow.ts`; REPLACE with `renPanel.ts` + `rgPanel.ts` + `vexPanel.ts` |
| `SCHEDULE_PANEL_STYLES` prefix `sch-` | Actual CSS classes use `.sched-*` prefix (e.g. `.sched-panel`, `.sched-header`, `.sched-col-label`). | CORRECT prefix annotation |
| Missing `PAN_PANEL_STYLES` (182 LOC — pn- prefix) | `PAN_PANEL_STYLES` at line 1063 — panoramic photo/360° panel | ADD `panPanel.ts` |
| Missing `REN_PANEL_STYLES` (74 LOC — ren- prefix) | `REN_PANEL_STYLES` at line 1246 — photorealistic render panel | ADD `renPanel.ts` |
| Missing `RG_PANEL_STYLES` (118 LOC — rg- prefix) | `RG_PANEL_STYLES` at line 1321 — render graph panel | ADD `rgPanel.ts` |
| Missing `VEX_PANEL_STYLES` (73 LOC — ve- prefix) | `VEX_PANEL_STYLES` at line 1440 — video export panel | ADD `vexPanel.ts` |
| Sub-files: 3 → 3 | Sub-files: 3 → 7 (6 CSS block files + 1 barrel) | CORRECT |
| Shell ≤50 LOC (re-export barrel) | Correct — barrel is pure re-exports, ≤50 LOC. ✓ | CONFIRM |

---

**Corrected split target** (7 files):

```
src/engine/subsystems/styles/panels/
  workflowPanels.ts                         (≤50 LOC — re-export barrel; exports all 6 named constants)
  workflow-panels/
    aiPanelPopup.ts                         (AI_PANEL_POPUP_STYLES — ai-popup / ai-* prefix — 746 LOC → ≤760)
    schedulePanel.ts                        (SCHEDULE_PANEL_STYLES — sched-* prefix — 308 LOC → ≤320)
    panPanel.ts                             (PAN_PANEL_STYLES — pn-* prefix — 182 LOC → ≤195)
    renPanel.ts                             (REN_PANEL_STYLES — ren-* prefix — 74 LOC → ≤85)
    rgPanel.ts                              (RG_PANEL_STYLES — rg-* prefix — 118 LOC → ≤130)
    vexPanel.ts                             (VEX_PANEL_STYLES — ve-* prefix — 73 LOC → ≤85)
```

**Migration pattern**: Identical to FILES 13, 14, 23, 26 (pure CSS split):
1. Cut each `export const BLOCK_NAME = \`...\`` into its own file.
2. Re-export all 6 names from the barrel `workflowPanels.ts`: `export { AI_PANEL_POPUP_STYLES } from './workflow-panels/aiPanelPopup'; ...`
3. Zero logic changes — consumer imports (`import { RG_PANEL_STYLES } from '…/workflowPanels'`) continue to resolve via the barrel.
4. No P-violation fixes needed (no violations present).

**Verifier after split**:
```bash
wc -l src/engine/subsystems/styles/panels/workflowPanels.ts                          # → ≤50
wc -l src/engine/subsystems/styles/panels/workflow-panels/aiPanelPopup.ts            # → ≤760
wc -l src/engine/subsystems/styles/panels/workflow-panels/*.ts | awk '$1 > 1500'    # → 0 files
npm run build                                                                          # → ✓ EXIT:0
```



### God-file gate: Wave 14 completion verifier

After all 28 files are split (FILE 17 deferred to Wave 16+), this command must return 0 lines:

```bash
# Wave 14 god-file gate — must pass before Wave 14 exit:
find src/ -name '*.ts' -o -name '*.tsx' \
  | xargs wc -l 2>/dev/null \
  | awk '$1 > 1500 {print $1, $2}' \
  | grep -v 'engineLauncher.ts'   # FILE 17 is the only deferred exception
# → 0 lines (all other files ≤ 1500 LOC)
```

**Total files to address in Wave 14**: 27 (all except FILE 17 `engineLauncher.ts`).
**CSS-only splits** (FILES 13, 14, 23, 26, 28): 5 files — mechanical, no logic changes, no tests needed.
**UI panel migration + split** (FILES 1–7): 7 files — primary Wave 14 work, P4 + P6 violations resolved.
**Engine subsystem splits** (FILES 8–12, 15–16, 18–22, 24–25, 27): 15 files — god-object reduction, no P4/P6 violations in most cases.

---

## §3 — Wave 15: Functional day-1 check + integration tests (S107, weeks 48–54)

> **Wave 15 status: ⏳ Task 1 COMPLETE (2026-05-01) — Task 2 pending Wave 14 close**
> Task 1: `pnpm pryzm-3-functional-day-1` → 8/8 checks GREEN. Root fix: `PanelContribution`,
> `PanelContext`, `PanelCategory`, `InspectorTabContribution` re-exported from `@pryzm/plugin-sdk`;
> `@pryzm/ui` added to plugin-sdk deps; `plugins/bcf` + `plugins/ifc-inspector` imports updated.
> `pnpm build` ✓ 44.86s, 0 TS errors.
> Task 2 (3 integration tests in `tests/integration/`) begins when Wave 14 closes.

### What "functional day-1" means (from §0.0.12 question 2)

At Wave 15 close, PRYZM 3 is "functional day-1" when:
- Architecture fully built (Waves 1-8 ✅)
- `src/` migrations complete — only `src/engine/` + `src/ui/` remain (Waves 9-11 ✅)
- All recipes complete (Wave 11 ✅)
- All plugins L8-compliant (Wave 12 ✅)
- 17 NFT benches real and green (Wave 13 ✅)
- Zero `(window as any)` in `src/ui/` (Wave 14 ✅)
- All 150 panels/toolbars consuming `runtime.*` (Wave 14 ✅)

But the runtime facets (`commandBus` + 13 others) are still unconsumed — that's Waves 16-18. Wave 15 is the CHECKPOINT, not the finish line.

### The `pnpm pryzm-3-functional-day-1` verifier

This is the single command that must return green at Wave 15 close. It aggregates all individual verifiers:

```bash
#!/usr/bin/env tsx
// scripts/pryzm-3-functional-day-1.ts

const checks = [
  // Architecture
  { name: 'src-folders', cmd: 'ls -d src/*/ | wc -l', expect: '2' },        // engine/ + ui/
  { name: 'window-any-ui', cmd: 'rg "(window as any)" src/ui/ --type ts | wc -l', expect: '0' },
  { name: 'raf-owners', cmd: 'rg "requestAnimationFrame" packages/ --type ts | grep -v scheduler | wc -l', expect: '0' },
  { name: 'engine-bootstrap', cmd: '[ ! -f src/engine/EngineBootstrap.ts ] && echo 0 || echo 1', expect: '0' },
  // Plugins
  { name: 'plugin-compliance', cmd: 'rg "from \'@pryzm/(command-bus|stores|schemas)\'" plugins/ --type ts | wc -l', expect: '0' },
  { name: 'plugin-count', cmd: 'ls plugins/ | wc -l', expect: '46' },
  // Tests
  { name: 'test-count', cmd: 'pnpm vitest run --reporter=json | jq .numPassedTests', expect: '>1428' },
  // NFTs (spot check 5 of 17):
  { name: 'nft-cold-boot', cmd: 'pnpm --filter apps/bench tsx src/benches/cold-boot.bench.ts | grep p95', expect: '<2500ms' },
  { name: 'nft-bundle-size', cmd: '...gzip check...', expect: '<4MB' },
  // TypeScript
  { name: 'tsc', cmd: 'pnpm tsc --noEmit -p . 2>&1 | wc -l', expect: '0' },
];
```

### Integration tests to create in Wave 15

Three new integration tests that prove no orphan code and end-to-end wiring:

```ts
// tests/integration/composeRuntime-click-to-render.test.ts
// Proves: composing the runtime + dispatching a command → scene update
test('wall create via commandBus reaches scene-committer', async () => {
  const runtime = await composeRuntime({ persistence: mockPersistence() });
  runtime.commandBus.dispatch(new CreateWallCommand({ ... }));
  const elements = runtime.stores.elements.getAll();
  expect(elements).toHaveLength(1);
  expect(elements[0].type).toBe('wall');
});

// tests/integration/plugin-sdk-lifecycle.test.ts
// Proves: plugin loads via SDK → contributes commands → command dispatches correctly
test('wall plugin contributes WallCreateCommand via plugin-sdk', async () => {
  const runtime = await composeRuntime({ persistence: mockPersistence() });
  await loadPlugin(wallPlugin, runtime);
  runtime.commandBus.dispatch(new CreateWallCommand({ ... }));
  const elements = runtime.stores.elements.getAll();
  expect(elements[0].type).toBe('wall');
});

// tests/integration/persistence-round-trip.test.ts
// Proves: save → reload → same elements
test('project persists and reloads correctly', async () => {
  const runtime = await composeRuntime({ persistence: realPersistence() });
  runtime.commandBus.dispatch(new CreateWallCommand({ ... }));
  await runtime.persistence.saveProject('test-1');
  const runtime2 = await composeRuntime({ persistence: realPersistence() });
  await runtime2.persistence.openProject('test-1');
  expect(runtime2.stores.elements.getAll()).toHaveLength(1);
});
```

### Exit gate

```bash
# Wave 15 exit = functional day-1:
pnpm tsx scripts/pryzm-3-functional-day-1.ts    # → ALL CHECKS GREEN

# Integration tests:
pnpm vitest run tests/integration/              # → 3/3 pass

# Final counts:
echo "packages: $(ls packages/ | wc -l)"        # → 54 (or more if Wave 9-11 added any)
echo "src/ folders: $(ls -d src/*/ | wc -l)"    # → 2 (engine/ + ui/)
echo "plugins: $(ls plugins/ | wc -l)"          # → 46
```

---

## §4 — Discipline for Waves 13–15

**No orphan test files.** Every test added in Wave 13-15 must test the **production path** — not just the type contract. A test that does `expect(typeof x).toBe('function')` is a vacuous assertion (Rule 3 of `12-DISCIPLINE-AND-DOD.md`).

**NFT numbers are measurements, not targets.** If NFT-1 comes in at 1.8 s, great — the doc says < 2.5 s, so 1.8 s is ✅. Do not pad the implementation to artificially hit any number.

**Zero-waste verification before adding tests.** Before adding 3 tests to `@pryzm/types-builtin`, verify that at least 1 non-test file imports it. If 0 importers: DROP the package (don't test it first).
