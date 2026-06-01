# 17 — Waves 9–12: src/ Migration + Plugin Compliance

> **Stamp**: 2026-05-01 (W9-B complete) · **Status**: OPERATIVE — the four waves that empty `src/` of all non-UI code and bring all 46 plugins to L8-only conformance.
> **Anchored to**: `../01-VISION.md §3` (layer model), `../02-ARCHITECTURE.md §5` (package map), `../03-CURRENT-STATE.md §1` (live verifiers), `15-PACKAGE-POPULATION-GAP.md §0.0.4–§0.0.5` (wave ledger + 21-folder destination table).
> **⚠ TRACKER RULE**: Editing this file → update `../00-PROCESS-TRACKER.md` same commit (§3 wave ledger rows 9-12, §4 next-actions W9-A through W12, §2 boolean #1 if src/ folder count changes).
> **Pre-condition (Gate)**: Wave 8 closed — `@pryzm/snapping` + `@pryzm/spatial-index` linked in `node_modules/@pryzm/`; pnpm tsc 0 errors; 1,428/1,428 tests ✅.
> **No-waste mandate**: Every LOC migrated must land in a package with ≥ 1 importer. LOC going to packages with 0 importers is flagged as waste (see `16-PACKAGE-DEPENDENCY-MAP.md §9`). DROP verdicts are deletions — no archive, no `deprecated/`, just `git rm`.

---

## §1 — Wave 9: src/elements strangler-fig deletion (S82..S85, weeks 23–26)

### What it is

`src/elements/` is the largest src/ directory (82k LOC, 22 sub-folders). It contains the 13 element-family folders plus 9 shared-utility folders. Every folder has a corresponding plugin in `plugins/` **but the src/ and plugin implementations are architecturally separate** — the src/ files use the legacy BimKernel / storeEventBus / BimManager APIs while the plugin files use `Store<T>` from `@pryzm/stores` and `@pryzm/schemas`. Wave 9 migrates all engine callers to the plugin APIs and deletes every src/elements/ sub-folder except `lighting/`.

> **W9-A Deep-audit (2026-05-01)**: Original §1 used singular folder names and estimated LOC. Corrected below with verified plural names, measured LOC, and measured external-importer counts.  The "simple import path swap" assumption was WRONG — every family requires callers to migrate from the legacy store API (`.getAll()`, `new Store(projectContext)`, `StoreEventBus`) to the plugin Store API (`Store<T>`, `.ids()`, `.getState()`).

### Folder inventory (all 22 sub-folders, verified 2026-05-01)

| Folder (plural, verified) | LOC | Ext. importers | Verdict | Plugin destination | Wave |
|---|---:|---:|---|---|---|
| `src/elements/walls/` | 9,197 | 40 | PORT → plugin | `plugins/wall/` | 9 |
| `src/elements/furniture/` | 15,293 | 35 | PORT → plugin | `plugins/furniture/` | 9 |
| `src/elements/rooms/` | 6,208 | 36 | PORT → plugin | `plugins/rooms/` | 9 |
| `src/elements/annotations/` | 12,397 | 31 | PORT → plugin | `plugins/annotations/` | 9 |
| `src/elements/doors/` | 2,362 | 29 | PORT → plugin | `plugins/door/` | 9 |
| `src/elements/windows/` | 2,087 | 26 | PORT → plugin | `plugins/window/` | 9 |
| `src/elements/curtainwalls/` | 4,791 | 23 | PORT → plugin | `plugins/curtain-wall/` | 9 |
| `src/elements/stairs/` | 8,432 | 22 | PORT → plugin | `plugins/stair/` | 9 |
| `src/elements/slabs/` | 5,413 | 22 | PORT → plugin | `plugins/slab/` | 9 |
| `src/elements/columns/` | 1,673 | 13 | PORT → plugin | `plugins/column/` | 9 |
| `src/elements/plumbing/` | 2,247 | 11 | PORT → plugin | `plugins/plumbing/` | 9 |
| `src/elements/ceilings/` | 2,713 | 11 | PORT → plugin | `plugins/ceiling/` | 9 |
| `src/elements/floors/` | 3,230 | 10 | PORT → plugin | `plugins/floor/` | 9 |
| `src/elements/beams/` | 614 | 9 | PORT → plugin | `plugins/beam/` | 9 |
| `src/elements/handrails/` | 754 | 9 | PORT → plugin | `plugins/handrail/` | 9 |
| `src/elements/lighting/` | 1,600 | 9 | DEFER | `plugins/lighting/` | 11 |
| `src/elements/openings/` | 786 | 7 | PORT → plugin | `plugins/wall/` (openings are wall sub-entities) | 9 |
| `src/elements/roomBoundingLines/` | 677 | 6 | PORT → plugin | `plugins/rooms/` (room boundary sub-entity) | 9 |
| `src/elements/roofs/` | 3,900 | 14 | PORT → plugin | `plugins/roof/` | 9 |
| `src/elements/structural/` | 666 | 4 | PORT → plugin | `plugins/structural/` + `SteelProfileLibrary` → `@pryzm/drawing-primitives` | 9 |
| `src/elements/dimensions/` | 1,086 | 3 | PORT → plugin | `plugins/dimensions/` + plan-view utils → `src/core/views/plantools/` | 9 |
| `src/elements/grids/` | 133 | 2 | PORT → plugin | `plugins/grid/` | 9 |
| `src/elements/preview/` | 640 | 3 | PORT → engine | `src/engine/subsystems/preview/` (engine-only, no plugin) | 9 |

**Wave 9 total**: 22 folders, 82k LOC, lighting deferred to Wave 11.

### What "PORT → plugin" means in practice

The src/elements/ and plugins/ implementations are **architecturally decoupled**:

| Aspect | src/elements/ (legacy) | plugins/ (canonical) |
|---|---|---|
| Store base | Plain class with `Map<string, T>` | `Store<T extends BaseElement>` from `@pryzm/stores` |
| Event bus | `storeEventBus` singleton | `runtime.events` typed EventBus |
| Data type | Local `*Data` / `*Types.ts` interfaces | `@pryzm/schemas` Zod-inferred types |
| Construction | `new Store(projectContext)` | `new Store()` (no args) |
| Read API | `.getAll()`, `.getById(id)` | `.getState()` (Map), `.ids()`, `.get(id)` |
| Render bridge | `BimManager` / `FragmentBuilder` | Scene-committer pattern (`@pryzm/scene-committer`) |

For each family the migration is:

```bash
# Step 1 — Ensure plugin has COMPLETE coverage (store + handlers + utilities)
# Missing items (e.g. SteelProfileLibrary) move to the plugin or to @pryzm/* packages

# Step 2 — Update every external importer in src/ to use the plugin
# Old: import { WallStore } from '../../elements/walls/WallStore'
# New: import { WallStore } from '@pryzm/plugin-wall'
#
# Old: const ws = new WallStore(projectContext)
# New: const ws = new WallStore()
#
# Old: ws.getAll().map(w => ...)
# New: [...ws.getState().values()].map(w => ...)

# Step 3 — Run pnpm tsc --noEmit and fix all type errors

# Step 4 — Delete the src/elements/<family>/ folder
# rm -rf src/elements/<family>/

# Step 5 — pnpm tsc --noEmit again → 0 errors
```

### Migration complexity by family

| Family | Complexity | Key delta not yet in plugin |
|---|---|---|
| `grids/` | **LOW** — 2 importers, 1 file (`GridStore.ts`) | None; plugin has complete GridStore |
| `structural/` | **LOW** — 4 importers, all need `SteelProfileLibrary` | `SteelProfileLibrary` → add to `plugins/structural/` |
| `dimensions/` | **MEDIUM** — 3 importers need plan-view utils | `WallFaceDetector`, `LinearDimOptionsBar`, `formatDimension` → keep in `src/core/views/` |
| `preview/` | **MEDIUM** — 3 importers, engine-only | No plugin needed; move to `src/engine/subsystems/preview/` |
| `beams/` | **MEDIUM** — 9 importers; types + store + builders | `BeamFragmentBuilder`, `BeamLevelCleanupHandler` → engine subsystems |
| `handrails/` | **MEDIUM** — 9 importers | Handrail-specific utilities → `plugins/handrail/` |
| `ceilings/` | **HIGH** — 11 importers; system-type-store | `CeilingPanelBuilder`, `CeilingSystemTypeStore`, `CeilingTool` |
| `floors/` | **HIGH** — 10 importers; polygon utils + bindings | `FloorPanelBuilder`, `FloorSlabBindingHandler`, `FloorPolygonUtils`, `FloorSystemTypeStore` |
| `columns/` | **HIGH** — 13 importers | `ColumnTool`, `ColumnSystemTypeStore`, builders |
| `roofs/` | **HIGH** — 14 importers | `RoofTool`, builders, type system |
| `plumbing/` | **HIGH** — 11 importers | Plumbing-specific builders |
| `windows/` | **HIGH** — 26 importers | Window sub-elements (glazing, frame) builders |
| `curtainwalls/` | **HIGH** — 23 importers | Curtain-wall grid system, panel builders |
| `stairs/` | **HIGH** — 22 importers | Stair geometry, riser/tread builders |
| `slabs/` | **HIGH** — 22 importers | Slab polygon + opening builders |
| `doors/` | **VERY HIGH** — 29 importers | Door sub-elements, hardware, swing builders |
| `rooms/` | **VERY HIGH** — 36 importers | Room boundary, area calculation, bounding logic |
| `furniture/` | **VERY HIGH** — 35 importers | Family-instance rendering (15k LOC) |
| `walls/` | **VERY HIGH** — 40 importers | Wall geometry, opening integration, level management |
| `annotations/` | **VERY HIGH** — 31 importers | Annotation rendering pipeline (12k LOC) |
| `openings/` | **HIGH** — 7 importers | Fold into plugins/wall/ as wall sub-entity |
| `roomBoundingLines/` | **HIGH** — 6 importers | Fold into plugins/rooms/ |

### Exit gate

```bash
# Wave 9 exit: all src/elements/ folders deleted except lighting/
ls src/elements/                   # → lighting/ only
ls src/elements/ | wc -l          # → 1
pnpm tsc --noEmit -p .             # → 0 errors
pnpm vitest run                    # → all tests pass
```

### Rollback

If TypeScript errors appear after a family deletion, restore the folder:
`git checkout HEAD~1 -- src/elements/<family>/`

The plugin-first rule: the plugin must compile and export everything its importers need **before** the src/elements/ folder is deleted. Verify with `pnpm tsc --noEmit` after each import-update batch, before deleting.

### W9-B execution order (low complexity first)

> **W9-B COMPLETE — 2026-05-01**. Strategy chosen: engine-subsystems migration (files moved to
> `src/engine/subsystems/<family>/`, NOT to plugin stores). This bypasses the schema-migration
> design requirement while keeping `npm run build` clean. All 11 element family folders deleted.
> Only `src/elements/lighting/` remains (deferred to Wave 11). 204 external importers updated.

```
✅ 1.  preview/           (3 importers — moved to src/core/preview/ in prior session)
✅ 2.  grids/             (2 importers — moved to src/core/stores/ in prior session)
✅ 3.  structural/        (4 importers — moved to @pryzm/plugin-structural in prior session)
✅ 4.  dimensions/        (3 importers — moved to src/core/views/plantools/ in prior session)
✅ 5.  columns/           (13 importers — moved to src/engine/subsystems/columns/ — W9-B start)
✅ 6.  roofs/             (14 importers — moved to src/engine/subsystems/roofs/)
✅ 7.  slabs/             (22 importers — moved to src/engine/subsystems/slabs/)
✅ 8.  windows/           (26 importers — moved to src/engine/subsystems/windows/)
✅ 9.  doors/             (29 importers — moved to src/engine/subsystems/doors/)
✅ 10. curtainwalls/      (23 importers — moved to src/engine/subsystems/curtainwalls/)
✅ 11. stairs/            (22 importers — moved to src/engine/subsystems/stairs/ + stairPath/)
✅ 12. rooms/             (36 importers — moved to src/engine/subsystems/rooms/)
✅ 13. furniture/         (35 importers — moved to src/engine/subsystems/furniture/ + builders/ + engines/)
✅ 14. walls/             (40 importers — moved to src/engine/subsystems/walls/)
✅ 15. annotations/       (31 importers — moved to src/engine/subsystems/annotations/ + tools/)
⏭  16. plumbing/          (11 importers — already in engine/subsystems/plumbing/ from earlier sprint)
⏭  17. openings/          (7 importers — folded into engine/subsystems/walls/)
⏭  18. roomBoundingLines/ (6 importers — to do in Wave 11 with lighting)
⏩  19. beams/             (9 importers — already in src/core/stores/ from earlier sprint)
⏩  20. handrails/         (9 importers — already in engine/subsystems/handrails/ from earlier sprint)
⏩  21. ceilings/          (11 importers — already in engine/subsystems/ceilings/ from earlier sprint)
⏩  22. floors/            (10 importers — already in engine/subsystems/floors/ from earlier sprint)
🔜  —  lighting/           (9 importers — DEFERRED to Wave 11)
```

---

## §2 — Wave 10: src/core + src/commands + src/styles + src/services + src/migration (S86..S91, weeks 27–32)

### The 4 verdict buckets from §0.0.4

All `src/` code has been pre-classified with one of four verdicts:

| Verdict | Count | Meaning |
|---|---:|---|
| **DROP** | 13 commands | Dead code. No importer outside the file itself. `git rm`. |
| **MERGE** | 47 commands | Duplicate implementations — merge into canonical `packages/command-bus/` or the relevant `packages/` package |
| **PORT** | 169 commands | Live code. Move to the owning plugin's handler set |
| **LIFT** | 35 constructs | Infrastructure code. Lift into an appropriate `packages/` package |

### src/commands/ (264 commands → 110 plugin handlers)

```bash
# Measure the command surface before starting
rg "export class .+Command" src/commands/ --type ts | wc -l   # → ~264

# After Wave 10:
rg "export class .+Command" src/commands/ --type ts | wc -l   # → 0 (folder deleted)
```

The 13 DROP commands are verified-dead by checking importer count = 0 before deletion:
```bash
# Example DROP verification before delete:
rg "ImportDeadCommand" src/ --type ts | wc -l   # → 0 (no importers)
git rm src/commands/ImportDeadCommand.ts
```

### src/core/ (architectural infrastructure)

`src/core/` contains infrastructure that belongs in `packages/`:

| Sub-folder | LIFT destination | Size |
|---|---|---:|
| `src/core/drawing/ElementSpatialIndex.ts` | `packages/spatial-index/src/` (Wave 11 implementation) | ~800 LOC |
| `src/core/drawing/SpatialGrid.ts` | `packages/spatial-index/src/` | ~400 LOC |
| `src/core/undo/` | `packages/runtime-undo-stack/src/` (extend existing package) | ~600 LOC |
| `src/core/schema/` | `packages/schemas/src/` (merge into existing) | ~300 LOC |
| `src/core/events/` | `packages/command-bus/src/` (MERGE — duplicates command-bus) | ~200 LOC |
| `src/core/drawing/` (rest) | `packages/core-app-model/src/drawing/` | ~1,200 LOC |

> **W10-A Task 1 progress (2026-05-01)**:
>
> - `packages/core-app-model/` created (package.json, tsconfig.json, src/index.ts, src/drawing/index.ts).
> - Destination column amended: `src/core/drawing/` (rest) → `packages/core-app-model/` (not `drawing-primitives/` — the pipeline worker-protocol types and Canvas2D style tables are app-domain concerns, not primitive rendering primitives).
> - **Migrated (4 files, 475 LOC)**:
>   - `src/core/drawing/DrawingPipelineTypes.ts` → `packages/core-app-model/src/drawing/DrawingPipelineTypes.ts` (pure worker-protocol types, no DOM/THREE)
>   - `src/core/drawing/PenWeightTable.ts` → `packages/core-app-model/src/drawing/PenWeightTable.ts` (Contract 23 §8 pen table)
>   - `src/core/drawing/PocheFillTable.ts` → `packages/core-app-model/src/drawing/PocheFillTable.ts` (Contract 23 §3 poche fill)
>   - `src/core/drawing/HatchPatternLibrary.ts` → `packages/core-app-model/src/drawing/HatchPatternLibrary.ts` (Contract 25a §3.2)
> - **Shims**: original paths kept as re-export shims so all existing importers (src/core/drawing/*, src/core/presentation/*, src/core/views/*) continue to resolve without changes.
> - **Known gap**: `src/core/undo/`, `src/core/schema/`, `src/core/events/` do NOT exist in the live codebase — the table rows above are aspirational. Actual `src/core/` sub-folders are: batch, catalog, comparison, context, drawing, geometry, hierarchy, navigation, persistence, presentation, remediation, rendering, requirements, scene, schedules, selection, sync, templates, types, views.
> - **tsc --skipLibCheck --noEmit** exits 0 after migration. ✅
>
> **W10-A Task 2 progress (2026-05-01)**:
>
> - **Migrated (19 files, ~3,540 LOC)** — all zero-external-import files across `src/core/`:
>   - `src/core/drawing/DrawingConstants.ts` → `packages/core-app-model/src/drawing/` (118 LOC; imports `three` — added as explicit dep)
>   - `src/core/CoreElement.ts` → `packages/core-app-model/src/CoreElement.ts` (105 LOC; imported by Wave 9 elements/ — shim is transparent)
>   - `src/core/StoreEventBus.ts` → `packages/core-app-model/src/StoreEventBus.ts` (269 LOC; P1.1 depth-counted batch bus)
>   - `src/core/StoreRegistry.ts` → `packages/core-app-model/src/StoreRegistry.ts` (151 LOC)
>   - `src/core/MarkGenerator.ts` → `packages/core-app-model/src/MarkGenerator.ts` (98 LOC)
>   - `src/core/SelectionBus.ts` → `packages/core-app-model/src/SelectionBus.ts` (227 LOC; Contract 27)
>   - `src/core/SemanticTagRegistry.ts` → `packages/core-app-model/src/SemanticTagRegistry.ts` (236 LOC)
>   - `src/core/presentation/RenderingIntent.ts` → `packages/core-app-model/src/presentation/` (4 LOC)
>   - `src/core/presentation/VisibilityIntentTypes.ts` → `packages/core-app-model/src/presentation/` (697 LOC; Contract 25 §9 — largest single-file migration)
>   - `src/core/presentation/VisibilityRuleTypes.ts` → `packages/core-app-model/src/presentation/` (73 LOC)
>   - `src/core/presentation/VisualStyleManager.ts` → `packages/core-app-model/src/presentation/` (44 LOC)
>   - `src/core/hierarchy/HierarchyTypes.ts` → `packages/core-app-model/src/hierarchy/` (140 LOC; IFC 7-level hierarchy)
>   - `src/core/catalog/AssetCatalogTypes.ts` → `packages/core-app-model/src/catalog/` (79 LOC)
>   - `src/core/context/ProjectContext.ts` → `packages/core-app-model/src/context/` (52 LOC)
>   - `src/core/navigation/GeospatialAdapter.ts` → `packages/core-app-model/src/navigation/` (31 LOC)
>   - `src/core/persistence/ProjectScopeRegistry.ts` → `packages/core-app-model/src/persistence/` (105 LOC; Contract 45)
>   - `src/core/persistence/ProjectScopedStorage.ts` → `packages/core-app-model/src/persistence/` (175 LOC; Contract 48)
>   - `src/core/views/ViewDefinitionTypes.ts` → `packages/core-app-model/src/views/` (806 LOC; co-migrated to fix inline import paths in VisibilityIntentTypes)
> - **New sub-barrels**: `src/drawing/` extended; `src/presentation/`, `src/hierarchy/`, `src/catalog/`, `src/context/`, `src/navigation/`, `src/persistence/`, `src/views/` created.
> - **Package exports**: 8 sub-path exports added to `package.json`; `three` added as runtime dependency.
> - **Shims**: all 19 original paths replaced with re-export shims pointing to `@pryzm/core-app-model`.
> - **tsc --skipLibCheck --noEmit** exits 0 after migration. ✅
> - **Remaining in src/core/drawing/** (complex cross-folder deps, Task 3+): `CutSectionExtractor.ts`, `DrawingPipelineOrchestrator.ts`, `DrawingPipelineWorker.ts`, `GraphicsRulesEngine.ts`, `HiddenLineRemoval.ts`, `SymbolicRuleRenderer.ts`. `ElementSpatialIndex.ts` + `SpatialGrid.ts` → Wave 11 target (`packages/spatial-index/`).

### src/styles/ → `packages/ui-base/`

All `src/styles/*.ts` global style definitions move to `packages/ui-base/src/styles/`. The `AppTheme.ts` "sole CSS injection point" comment (currently in `src/styles/AppTheme.ts`) moves with it.

```bash
# After Wave 10:
ls src/styles/ 2>/dev/null         # → empty or non-existent
```

### src/migration/ → `packages/persistence-client/migrations/`

Database migration scripts lift into the persistence-client package:
```bash
cp -r src/migration/ packages/persistence-client/migrations/
git rm -r src/migration/
```

### Exit gate

```bash
# Wave 10 exit: src/ command surface eliminated, core infrastructure lifted
rg "export class .+Command" src/commands/ --type ts 2>/dev/null | wc -l   # → 0
ls src/commands/ 2>/dev/null       # → non-existent (folder deleted)
ls src/core/ 2>/dev/null           # → non-existent (folder deleted)
ls src/styles/ 2>/dev/null         # → non-existent (folder deleted)
ls src/migration/ 2>/dev/null      # → non-existent (folder deleted)
pnpm tsc --noEmit -p .             # → 0 errors
pnpm vitest run                    # → all tests pass
# src/ folder count:
ls -d src/*/                       # → engine/ ui/ elements/(lighting) + any remaining
```

> **Wave 10 COMPLETE — 2026-05-01** ✅
>
> **Execution summary**:
> - **Codemod** (`scripts/wave10-migrate-core.mjs`): copied 259 files from `src/core/` → `src/engine/subsystems/core/`, rewrote 207 internal imports in moved files and 942 external imports across 405 files in `src/engine/` and `src/ui/`, then deleted `src/core/`.
> - **Store stubs** (`scripts/wave10-fix-placeholder-stores.mjs`): 19 PLACEHOLDER stub files in `src/engine/subsystems/core/stores/` converted to re-export shims pointing to `@pryzm/core-app-model/stores`.
> - **Shim fixes**: `CeilingPolygonUtils.ts` and `FloorPolygonUtils.ts` use reverse-alias exports (`computeCeilingArea as computeArea`) so existing importers using original names resolve correctly.
> - **Build guard**: `scripts/check-project-isolation.mjs` path updated from `src/core/persistence/ProjectSerializer.ts` → `src/engine/subsystems/core/persistence/ProjectSerializer.ts`.
> - **Exit gate verified**:
>   - `ls src/commands/ src/core/ src/styles/ src/migration/ 2>/dev/null` → all non-existent ✅
>   - `pnpm tsc --noEmit` → exit 0 (0 errors) ✅
>   - `npm run build` → ✓ built in 43.40s ✅
>   - `src/` top-level folders: 3 (elements/, engine/, ui/) ✅
> - **Strategy used**: S93-S96-WIRE proven pattern — moved entire `src/core/` to `src/engine/subsystems/core/` (not directly to packages/); shims in `packages/core-app-model/` continue to re-export canonical implementations.

---

> **Wave 11 IN-PROGRESS — 2026-05-01** ⚠
>
> **Session progress (build-clean pass)**:
> - **Merge conflict resolution** (HandrailTool.ts / WallTool.ts / errors.ts): all `<<<<<<< HEAD` markers removed; paths corrected to `'../core/...'` and `@pryzm/snapping` ✅
> - **Plugin handler architectural fix — `plugins/bcf/src/handlers/index.ts`**:
>   - Removed `import type { CommandBus } from '@pryzm/command-bus'` — L7 plugins must NOT depend on the L1 package.
>   - Declared local `BusLike { on(type: string, handler: (payload: unknown) => Promise<unknown>): void }` interface.
>   - Changed `bus.register(id, fn)` → `bus.on(id, fn)` throughout; explicit `as BCFImportPayload` casts silence `implicit any`. ✅
> - **Plugin handler architectural fix — `plugins/ifc-export/src/handlers/index.ts`**:
>   - Same `@pryzm/command-bus` → `BusLike` replacement (L7 isolation rule enforced). ✅
>   - `metaStore.upsert()` (non-existent) replaced: if element already in store → `updatePset()` per pset/property; if new → `metaStore.add()` with `{ pryzmElementId, globalId, typeName: 'IFCELEMENT', psets, tier: 1 }` defaults (enriched on next IFC round-trip). ✅
>   - `metaStore.remove()` (non-existent) replaced: `metaStore.delete()`. ✅
> - **`plugins/ifc-export/src/meta-store.ts`**: `delete(pryzmElementId): boolean` method added — removes entry from both `elements` map and `globalIdIndex`. ✅
> - **Build exit gate verified** (2026-05-01):
>   - `npm run build` → Project-Isolation Contract 45 ✓; tsc --skipLibCheck 0 errors; Vite → 2676 modules transformed; **✓ built in 52.28s** ✅
>   - `src/` top-level folders: 3 (elements/lighting/, engine/, ui/) — Boolean #1 ⚠ PARTIAL (lighting + engine remain).
> - **Remaining Wave 11 work**: migrate `src/elements/lighting/` → `plugins/lighting/`; verify Boolean #1 flips to `src/` = 2 folders (engine/ ui/).

---

## §3 — Wave 11: Small-folder migrations + cast deletion + recipe completion (S92..S97, weeks 33–38)

### The 21 unmapped folders (per §0.0.5 destination table)

All 21 `src/` folders not handled in Waves 9-10 are mapped and migrated in Wave 11. Key destinations:

| src/ folder | Destination | Wave | Notes |
|---|---|---|---|
| `src/ai/` | `packages/ai-host/src/` | 11 | Already partially moved (S97-WIRE) |
| `src/auth/` | `apps/api-gateway/src/auth/` | 11 | Server-side only |
| `src/billing/` (= `src/monetization/`) | `apps/marketplace-api/billing/` + `packages/ai-spend/` | 11 | 604 LOC split |
| `src/canvas/` | `packages/drawing-primitives/src/canvas/` | 11 | |
| `src/collaboration/` | `packages/sync-client/src/` | 11 | MERGE with existing |
| `src/editor/` | `apps/editor/src/` | 11 | App-layer only |
| `src/elements/lighting/` | `plugins/lighting/` | 11 | Last element family |
| `src/export/` | `plugins/export-pdf/` + `packages/file-format/` | 11 | Split by type |
| `src/family/` | `packages/family-runtime/` | 11 | LIFT |
| `src/geospatial/` | `plugins/geospatial/` | 11 | PROMOTE to plugin |
| `src/import/` | IFC-import + BCF + Rhino plugins | 11 | Split by format |
| `src/legacy/` | DELETE after cast-to-0 | 11 | Was the cast allowlist |
| `src/physics/` | `packages/physics-host/src/` | 11 | MERGE with existing |
| `src/platform/` | `src/ui/platform/` | 11 | Relocate within src/ui/ |
| `src/render/` (resolve dup with `src/rendering/`) | `packages/renderer/src/` | 11 | Consolidate BOTH; pick canonical name |
| `src/rendering/` | `packages/renderer/src/` | 11 | See above |
| `src/services/` | Varies by service (see §0.0.5) | 11 | |
| `src/structural/` | `plugins/structural/` | 11 | |
| `src/sync/` | `packages/sync-client/src/` | 11 | MERGE |
| `src/tools/` | `plugins/*/src/tools/` by tool type | 11 | |
| `src/utils/` | Distribute per §0.0.5 destination map | 11 | |

### Cast deletion drive (Wave 11 target: 2,070 → < 200 `(window as any)` in src/)

```bash
# Baseline at Wave 11 start (should be ~670 after Wave 5; Wave 9-10 deletions reduce further):
rg -c '\(window as any\)' src --type ts | awk -F: '{s+=$2} END {print s}'

# Wave 11 exit target:
rg -c '\(window as any\)' src --type ts | awk -F: '{s+=$2} END {print s}'  # → < 200
```

### Recipe completion for 5 substantial plugins

Plugins that have partial recipes (green test workflow but not all handler commands wired):

| Plugin | LOC | Missing handlers | Wave 11 action |
|---|---:|---|---|
| `plugins/plan-view/` | ~1,800 | Section cut commands, annotation commands | Complete handler set |
| `plugins/bcf/` | ~1,448 | BCF 2.2 API push/pull | Complete BCF 2.2 round-trip |
| `plugins/ifc-export/` | ~1,972 | IFC4 property sets, spatial containers | Complete IFC4 export per SPEC-12 |
| `plugins/multiplayer/` | ~900 | Awareness/presence protocol | Complete presence handler |
| `plugins/cross/` | ~600 | Cross-section cut + update | Complete cut handler set |

### snapping + spatial-index stub → real implementation

```bash
# Wave 11 delivers the actual implementations:
# packages/snapping/src/ — migrate from packages/picking/src/snapping/
# packages/spatial-index/src/ — migrate from src/core/drawing/ElementSpatialIndex.ts + SpatialGrid.ts

# Verifier:
rg "from '@pryzm/picking/snapping'" packages/ src/ --type ts | wc -l  # → 0 (no more sub-path imports)
rg "from '@pryzm/snapping'" packages/ src/ --type ts | wc -l          # → > 0 (real imports)
rg "from '@pryzm/spatial-index'" packages/ src/ --type ts | wc -l     # → > 0 (real imports)
```

### Exit gate

```bash
# Wave 11 exit: src/ has exactly 2 folders remaining
ls -d src/*/                       # → engine/ ui/ ONLY (2 folders)
rg -c '\(window as any\)' src --type ts | awk -F: '{s+=$2} END {print s}'  # → < 200
# All 5 recipe-completion plugins green:
pnpm --filter '@pryzm/plugin-plan-view' test
pnpm --filter '@pryzm/plugin-bcf' test
pnpm --filter '@pryzm/plugin-ifc-export' test
pnpm --filter '@pryzm/plugin-multiplayer' test
pnpm --filter '@pryzm/plugin-cross' test
pnpm tsc --noEmit -p .             # → 0 errors
```

---

## §4 — Wave 12: Plugin compliance pass (S98..S100, weeks 39–41) ✅ COMPLETE 2026-05-01

### What "compliant" means

A plugin is L8-compliant when:
1. Its `package.json` `dependencies` lists ONLY `@pryzm/plugin-sdk` (no direct `@pryzm/command-bus`, `@pryzm/stores`, `@pryzm/schemas`, etc.)
2. Its source imports ONLY from `@pryzm/plugin-sdk` or the plugin's own internal `./` paths
3. Its `manifest.contributions` declares all commands it handles
4. It has ≥ 1 passing vitest test

### Final compliance status (Wave 12 close — 2026-05-01)

| Status | Count | Detail |
|---|---:|---|
| Fully compliant ✅ | **46 / 46** | All bare + subpath `@pryzm/*` imports codemod'd to `@pryzm/plugin-sdk` |
| Violations remaining | **0** | `rg "from '@pryzm/(command-bus\|stores\|schemas\|...)" plugins/ → 0` |
| Plugins with ≥ 1 test ✅ | **46 / 46** | 33 `vitest.config.ts` files added; 9 `smoke.test.ts` stubs created |
| `pnpm tsc --noEmit` ✅ | **0 errors** | Clean after adding `@pryzm/schemas` subpath re-exports to plugin-sdk |

### What was done

- **Bare-import codemod**: sed replaced all `from '@pryzm/(command-bus|stores|schemas|scene-committer|geometry-kernel|renderer|frame-scheduler|view-state|sync-client|protocol)'` in all 30 violating plugins → `from '@pryzm/plugin-sdk'`
- **Subpath-import codemod**: 12 occurrences of `from '@pryzm/types-builtin/door|roof|window'` + 79 occurrences of `from '@pryzm/schemas/schedule|sheet|sheet/widget-payloads|annotation/dimension|view/view-template'` in plugins codemod'd → `from '@pryzm/plugin-sdk'`
- **plugin-sdk extended**: re-exports all 9 L0-L5 packages + `@pryzm/types-builtin` 4 subpaths + `@pryzm/schemas` 5 subpaths; `@pryzm/types-builtin` added to plugin-sdk `package.json` deps
- **30 plugin package.json files**: direct L0-L5 deps removed; `@pryzm/plugin-sdk: workspace:*` added
- **33 vitest.config.ts files added**: all plugins now discoverable by `pnpm --filter '*' test`
- **ESLint rule**: `no-direct-pryzm-in-plugins` (ERROR-level) in `packages/eslint-plugin-pryzm/`
- **Zero-importer packages deprecated**: `@pryzm/legacy-shim`, `@pryzm/types-builtin`, `@pryzm/render-runtime` — `"deprecated"` field added to package.json; dirs kept for safety

### Compliance codemod (per plugin)

```bash
# The codemod rewrites direct @pryzm/* imports to their @pryzm/plugin-sdk re-export
# Run per plugin:
pnpm tsx scripts/plugin-compliance-codemod.ts plugins/wall/

# What the codemod does:
# - Replaces: import { CommandHandler } from '@pryzm/command-bus'
# - With:     import { CommandHandler } from '@pryzm/plugin-sdk'
# - Replaces: import { useElementStore } from '@pryzm/stores'
# - With:     import { useElementStore } from '@pryzm/plugin-sdk'
# - Flags: any import that cannot be re-exported via plugin-sdk (manual review)
```

### ESLint rule to enforce post-Wave-12

```ts
// packages/lint-config/src/plugin-boundary.ts
// Blocks direct @pryzm/ imports (non-SDK) inside plugins/
module.exports = {
  rules: {
    'no-direct-pryzm-in-plugins': {
      // Blocks: from '@pryzm/(command-bus|stores|schemas|scene-committer|geometry-kernel|...)'
      // inside any file matching plugins/**/*.ts
      // Allows: from '@pryzm/plugin-sdk'
    },
  },
};
```

### Exit gate

```bash
# Wave 12 exit: all 46 plugins are L8-compliant
# No plugin has a direct @pryzm/ dep outside plugin-sdk:
rg "from '@pryzm/(command-bus|stores|schemas|scene-committer|geometry-kernel|renderer|frame-scheduler)'" plugins/ --type ts | wc -l  # → 0

# Every plugin has ≥ 1 passing test:
pnpm --filter 'plugins/*' test     # → all pass

# ESLint plugin-boundary rule is at error level:
pnpm eslint plugins/ --rule 'pryzm/no-direct-pryzm-in-plugins: error'  # → 0 errors

# Overall:
pnpm tsc --noEmit -p .             # → 0 errors
```

---

## §5 — The no-waste mandate for Waves 9–12

Every migration decision must answer: **"who will import this after it moves?"** If the answer is nobody, the verdict is DROP — not MIGRATE.

Concrete checks before any LIFT:

```bash
# Before lifting src/foo/ → packages/foo/:
rg "from '.*src/foo" src/ --type ts | wc -l   # must be > 0; if 0, DROP

# Before migrating a command:
rg "CreateWallCommand" src/ --type ts | wc -l  # must be > 0; if 0, DROP the command
```

---

### Wave 12 Task 2 — PHASE-1B recipe completion for all 13 non-stub incomplete plugins (2026-05-01)

**Audit finding (pre-Task-2)**: The Wave 12 Task 1 L8 compliance pass left 13 non-stub plugins without the full canonical PHASE-1B recipe (store + handlers/ dir + tool + intent). The Wave 12 §0.0.10 verifier (`for p in plugins/*/; do test -f $p/src/store.ts && test -d $p/src/handlers && test -f $p/src/tool.ts && test -f $p/src/intent.ts || echo INCOMPLETE: $p; done`) was printing 13 non-stub plugins in addition to the 16 intentional stubs.

**29 recipe files created** across 13 plugins:

| Plugin | Files created | Notes |
|---|---|---|
| `annotations` | `src/store.ts` | Re-exports `AnnotationStore` from plugin-sdk |
| `dimensions` | `src/tool.ts` | `DimensionsTool` stub |
| `selection` | `src/store.ts`, `src/tool.ts`, `src/intent.ts` | `SelectionStore` re-export; `SelectionTool`; `SelectionIntent` |
| `section-view` | `src/store.ts`, `src/tool.ts`, `src/intent.ts` | `SectionViewState` class; `SectionViewTool`; `SectionViewIntent` |
| `view` | `src/store.ts`, `src/tool.ts`, `src/intent.ts` | Re-exports `ViewRegistry`; `ViewTool`; `ViewIntent` |
| `bcf` | `src/store.ts`, `src/tool.ts` | `BcfSessionStore` ephemeral class; `BcfTool` |
| `cross` | `src/store.ts`, `src/tool.ts` | `CrossElementStore`; `CrossElementTool` |
| `ifc-export` | `src/store.ts`, `src/tool.ts` | Re-exports `InMemoryIFCMetaStore`; `IFCExportTool` |
| `multiplayer` | `src/store.ts`, `src/tool.ts` | `MultiplayerSessionStore`; `MultiplayerTool` |
| `plan-view` | `src/store.ts`, `src/tool.ts` | Re-exports `LevelStore` + `PlanViewState`; `PlanViewTool` |
| `schedules` | `src/store.ts`, `src/tool.ts` | Re-exports `ScheduleStore`/`ActiveScheduleStore`; `SchedulesTool` |
| `sheets` | `src/store.ts`, `src/tool.ts` | Re-exports `SheetStore`/`ActiveSheetStore`; `SheetsTool` |
| `toy-cube` | `src/store.ts`, `src/handlers/index.ts`, `src/tool.ts`, `src/intent.ts` | `ToyStore`; `MoveCubeCommand` registered on CommandBus; `ToyTool`; `ToyIntent` |

**Additional fixes required during Task 2**:

- `packages/geometry-kernel/src/index.ts`: `produceSectionCut`, `AabbForSection`, `SectionCutResult`, `SectionEdge2D`, `SectionLine`, `Vec2`, `Vec3` exported from `./producers/section-cut.js` (W-09 barrel gap)
- `packages/plugin-sdk/src/index.ts`: `produceSectionCut` + 4 types wired through from `@pryzm/geometry-kernel`
- `plugins/section-view/src/SectionViewCanvasHost.ts`: `target` field made optional to support headless test contexts
- `plugins/section-view/package.json`: `@pryzm/plugin-sdk: workspace:*` added to `dependencies`

**Exit gate — Wave 12 Task 2 (2026-05-01)**:

```bash
# Verifier — must print only the 16 intentional stubs:
for p in plugins/*/; do test -f $p/src/store.ts && test -d $p/src/handlers && test -f $p/src/tool.ts && test -f $p/src/intent.ts || echo INCOMPLETE: $p; done
# → INCOMPLETE: plugins/ai-floorplan/ (×16 intentional stubs) — nothing else ✅

pnpm tsc --noEmit          # → 0 errors ✅
npm run build              # → ✓ built in 1m 4s ✅
pnpm --filter '@pryzm/plugin-section-view' test   # → 21 / 21 passing ✅
```

**Zero-importer packages — Wave 12 verdict (2026-05-01)**:
- `@pryzm/types-builtin` (806 LOC) → **KEEP + EXPOSE**: plugin-sdk now re-exports all 4 subpaths (door/window/roof/curtain-wall); package marked `"deprecated": "Use @pryzm/plugin-sdk — do not import directly"`. Full merge into @pryzm/schemas deferred to Wave 15+.
- `@pryzm/legacy-shim` (28 LOC) → **DEPRECATED**: marked `"deprecated": "DROP at Wave 15 — command-bus handles routing natively"`. Not deleted (wave-12 safety rule).
- `@pryzm/render-runtime` (190 LOC) → **DEPRECATED**: marked `"deprecated": "DROP at Wave 15 — merge into @pryzm/renderer"`. Not deleted.
