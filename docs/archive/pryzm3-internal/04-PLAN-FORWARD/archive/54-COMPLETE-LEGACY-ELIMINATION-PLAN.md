# 54 — Complete Legacy Elimination Implementation Plan

> **Stamp**: 2026-05-16 · **Status**: 🔴 ACTIVE PLAN — authoritative execution spec for eliminating all PRYZM1/2 patterns  
> **Authority**: Supersedes the per-phase fragments in docs 33 and 51 for the complete arc. C14 governs the pattern catalogue; this document governs the sprint-by-sprint execution.  
> **Zero-legacy definition**: Every verifier in §8 exits 0 simultaneously. That is the single GA exit gate for this workstream.  
> **Audience**: Any engineer picking up a sprint — each phase contains self-contained bash verification commands and a precise Definition of Done row.

---

## §0 — Scorecard (2026-05-16 Baseline)

Re-run this table at every sprint close to track progress. All shell commands are reproducible from the repo root.

| Metric | Baseline | Target | Verifier |
|---|---:|---:|---|
| `cmdMgr.execute()` aliased — `apps/editor/src/` | **154** | **0** | `rg "cmdMgr\.execute\b" apps/editor/src --type ts \| grep -v "// " \| wc -l` |
| `window.commandManager` literal — `apps/editor/src/` | **68** | **0** | `rg "window\.commandManager\b" apps/editor/src --type ts \| grep -v "// " \| wc -l` |
| `commandManager.execute()` — `packages/` | **~50** | **0** | `rg "commandManager\.execute\b\|cmdMgr\.execute\b" packages --type ts \| grep -v "// \|CommandManager\.ts\|global-bridge" \| wc -l` |
| `window.xStore` writes (registration) — `apps/editor/src/` | **91** | **0** | `rg "window\.\w*Store\s*=" apps/editor/src --type ts \| grep -v "// " \| wc -l` |
| `window.xStore` reads — `apps/editor/src/` | **230** | **0** | `rg "window\.\w*Store\b" apps/editor/src --type ts \| grep -v "\s*=" \| grep -v "// " \| wc -l` |
| `window.xStore` reads — `packages/` | **~280** | **0** | `rg "window\.\w*Store\b" packages --type ts \| grep -v "// \|global-bridge\|window-augment" \| wc -l` |
| `window.xStore` reads — `plugins/` | **~50** | **0** | `rg "window\.\w*Store\b" plugins --type ts \| grep -v "// " \| wc -l` |
| `window.xBuilder` / `window.bimManager` writes | **21** | **0** | `rg "window\.\w*(Builder\|Manager)\s*=" apps/editor/src --type ts \| grep -v "// " \| wc -l` |
| `window.xBuilder` / `window.bimManager` reads | **~40** | **0** | `rg "window\.\w*(Builder\|Manager)\b" apps/editor/src --type ts \| grep -v "\s*=\|\s*//" \| wc -l` |
| `window.dispatchEvent` / `CustomEvent` — `apps/editor/src/` | **501** | **0** | `rg "window\.dispatchEvent\|new CustomEvent" apps/editor/src --type ts \| grep -v "// " \| wc -l` |
| `window.dispatchEvent` / `CustomEvent` — `packages/` | **447** | **0** | `rg "window\.dispatchEvent\|new CustomEvent" packages --type ts \| grep -v "// " \| wc -l` |
| `structuredClone` undo snapshots — `packages/command-registry/` | **165** | **0** | `rg "structuredClone" packages/command-registry/src --type ts \| grep -v "// \|CommandManager\.ts" \| wc -l` |
| `commandManager: any` typed params — `packages/` | **14** | **0** | `rg "commandManager:\s*any\b" packages --type ts \| grep -v "// \|CommandManager\.ts" \| wc -l` |
| Aliased `cmdMgr-alias` gate | **MISSING** | **✅ wired** | `node tools/ga-gate/check-cmdmgr-alias.ts` exits 0 |
| `runtime.events.emit()` — production code | **0** | **500+** | `rg "runtime\.events\.emit\b" apps/editor/src packages plugins --type ts \| grep -v "// \|__tests__" \| wc -l` |
| GA gates passing | **15/15** | **20/20** | `npx tsx tools/ga-gate/run-all.ts` exits 0 |

---

## §1 — Scope and Authority

### What this plan covers

1. **All PRYZM1/2 legacy patterns** in `apps/editor/src/`, `packages/`, `plugins/`, and `scripts/` — as catalogued in C14.
2. **Every contract that must be amended** when a pattern is eliminated.
3. **Every GA gate that must be added or fixed** to make regression structurally impossible.
4. **The ordered sequence of sprints** with exact file targets, bash verifiers, and done conditions.

### What this plan does NOT cover

- Feature work (new elements, new marketplace features, AI pipeline improvements).
- The 3 infra-pending human-action items (npm publish, DNS, GitHub Actions CI) — those are in `52-PHASE-F-EXECUTION-CHECKLIST.md`.
- Yjs per-level CRDT expansion beyond the Phase G3-T2 retirement of StoreEventBus (covered in `29-WAVE-A19-YJS-COLLABORATION.md`).

### Conflict resolution

This plan **governs execution**. If a sprint plan in another document conflicts with this one, **this wins**. Update the other document and note the supersession.

---

## §2 — The Three Migration Axes

All legacy patterns cluster around three root causes. Every sprint in this plan addresses one or more of these axes.

### Axis A — The Window Global Bus (highest priority)

`initBuilders.ts`, `initTools.ts`, `initUI.ts`, `initScene.ts`, and `initDataPlatform.ts` publish every store, builder, and service to `window.*` during engine startup. Every package, plugin, and UI file that needs a store or service reads it from `window.*`.

```
WRITE sites (registration — 7 init files):
  initBuilders.ts  ×24 window.xStore = ...
  initTools.ts     ×10 window.xStore + ×5 window.xBuilder
  initScene.ts     ×4  window.xBuilder
  initUI.ts        ×13 window.xStore + ×2 window.xBuilder
  initDataPlatform ×5  window.xStore + ×2 window.xBuilder
  initCollaboration×1  window.syncEngine
  engineLauncher   ×1  window.commandManager (the bridge)

READ sites:
  apps/editor/src/ — 230 window.xStore, ~40 window.xBuilder
  packages/        — ~280 window.xStore
  plugins/         — ~50 window.xStore
```

**Root fix:** `composeRuntime()` already owns all stores and services. The init files must thread the `runtime` handle to every consumer instead of publishing to `window.*`. When the last registration is removed, the window global bus is dead.

### Axis B — The Legacy Command Path (second highest priority)

`window.commandManager` (or its alias `cmdMgr`) is the sole mutation path for ~222 call sites across `apps/editor/src/` and ~50 call sites across `packages/`. Each call bypasses `CommandBus`, bypasses `RingBufferUndoStack`, and bypasses OTel spans.

```
apps/editor/src/ call sites:
  PropertyInspectorApply.ts          ×16 (6 element types, property updates)
  MovePlanToolHandler.ts             ×13 (move, nudge, align, copy in plan view)
  PropertyPanelTypeSelector.ts       ×10 (type-change commands)
  AlignPlanToolHandler.ts            ×8  (align + distribute)
  registerTransformDragHandler.ts    ×8  (3D gizmo translate/rotate/scale)
  CopyPlanToolHandler.ts             ×7  (copy, mirror, array)
  20 more files — 1 to 5 sites each

packages/ call sites:
  @pryzm/ai-host                     ×10 (AI batch executor, voice interface)
  @pryzm/command-registry            ×3  (AnnotateViewCommand, plan executors)
  @pryzm/core-app-model              ×4  (AutoRemediateCommand, PlanElementDrag)
  plugins/annotations                ×4  (OBCAnnotationAdapter, level/section builders)
```

**Root fix:** For each call site, register a typed `CommandBus` handler and replace `cmdMgr.execute(new XxxCommand(...))` with `runtime.commandBus.dispatch({ type: 'xxx.verb', payload: {...} })`. The `CommandManager` class itself can be deleted when the last call site is gone.

### Axis C — The Custom Event Bus (third — runs parallel to Axes A and B)

501 `window.dispatchEvent(new CustomEvent(...))` calls in `apps/editor/src/` and 447 in `packages/`. These are DOM events used as a cross-subsystem notification bus. They are untyped, untraceable, and invisible to the OTel span system.

```
Top emitter files (apps/editor/src/):
  engine/initUI.ts            ×27 (toolbar rebuild, view-change, level-switch events)
  import-manager/Panel.ts     ×18 (import progress/completion events)
  engine/initCollaboration.ts ×15 (presence, join, leave events)
  platform/PlatformBrowser.ts ×13 (project open/close events)
  engine/SplitViewManager.ts  ×13 (split-view events)

Top emitter files (packages/):
  input-host: FloorPlanUnderlayTool.ts ×11, SelectionManager.ts ×9
  ai-host: QueryEngine.ts ×16, FloorPlanBatchExecutor.ts ×3
  file-format: deleteIfcElement.ts ×3, IfcModelStore.ts ×2
```

**Root fix:** Replace `window.dispatchEvent(new CustomEvent('pryzm-*', { detail }))` with `runtime.events.emit('noun.verb', payload)`. Requires `runtime.events` to be injectable at every tier that needs to emit — currently only wired at the app tier.

---

## §3 — Contract Update Manifest

When a migration phase eliminates a pattern, the following contracts MUST be updated in the same commit or sprint:

| Contract | Trigger | Amendment required |
|---|---|---|
| **C03 §4.3** (dual-path state) | Phase E.5.x close — last `cmdMgr.execute()` gone | Remove the "Transitional Dual-Path State" warning; update the convergence boolean to `commandManager_sites == 0`. |
| **C03 §4.2** (undo contract) | Phase E.undo close — last `structuredClone` undo gone | Add hard-fail note: "No `structuredClone` undo permitted. All commands MUST use `produceWithPatches` path." |
| **C06 §4.3** (gizmo drag-end) | Phase E.5.x close — `registerTransformDragHandler.ts` migrated | Update dispatch table to show pure `commandBus.dispatch()` path (remove Path A fallback column). |
| **C09 §3** (AI host contract) | Phase F.ai close — `@pryzm/ai-host` LP-01/LP-02 eliminated | Replace window-store section with `AIReadModel` constructor injection spec. |
| **C11 §8.1** (element creation pipeline) | Phase E.5.x close — gate: 0 `commandManager.execute()` in `src/` | Move gate from "Phase A21+ backlog" to ✅ CLOSED. |
| **C14 §3** (per-pattern entries) | Each pattern eliminated from its last file | Add ✅ ELIMINATED stamp with sprint reference to that LP-NN entry. |
| **C14 §4** (per-package classification) | Each LEGACY-ZONE → TRANSITIONAL, TRANSITIONAL → COMPLIANT | Update classification row. |
| **C14 §6A** (gate inventory) | Each G-NEW gate implemented | Move from proposed → ✅ Passing in the gate table. |
| **C01 §1** (P4 — No window as any) | Already hard-fail; verify it remains so after init file changes | If init changes use `(window as any)` for any reason, that is a regression. |
| **07-OPEN-ITEMS.md** | Each OI closed | Add ✅ CLOSED stamp with sprint ref. |

---

## §4 — Gate Implementation Work (Phase 0 — Pre-Requisite)

These gates MUST be implemented before migration sprints begin. Without them, regressions are invisible.

### Gate P0-G1: Fix `check-no-commandmanager.ts` aliasing loophole (OI-046)

**File:** `tools/ga-gate/check-no-commandmanager.ts`  
**Current problem:** Only greps for the literal string `window.commandManager`. Misses 154 aliased `cmdMgr.execute()` calls.

**Implementation:**

```typescript
// tools/ga-gate/check-no-commandmanager.ts  (replace the grep pattern)

// OLD — misses aliases
const PATTERN = 'window\\.commandManager';

// NEW — catches both literal and aliased patterns
const PATTERNS = [
  'window\\.commandManager',
  'cmdMgr\\.execute\\b',
  'commandManager\\.execute\\b',
];
// Exclusions: CommandManager.ts (the class), global-bridge.ts (the one permitted bridge)
const EXCLUSIONS = ['CommandManager.ts', 'global-bridge.ts'];

// Ratchet ceiling: 222 today → decreases per sprint
// Sprint E.5.1 target: ≤ 160; E.5.2: ≤ 100; E.5.3: ≤ 50; E.5.4: 0
const CEILING = parseInt(process.env.CMDMGR_CEILING ?? '222');
```

**Add to `run-all.ts`:** Already listed as gate 10 — update the grep pattern only; no new entry needed.  
**Owner sprint:** Phase 0 (this sprint, before any E.5.x migration starts).

---

### Gate P0-G2: `check-window-store-in-packages.ts` (OI-047)

**File:** `tools/ga-gate/check-window-store-in-packages.ts` (NEW)

```typescript
#!/usr/bin/env tsx
/**
 * Gate G-NEW-02: No window.xStore access from packages/ (LP-01)
 *
 * Baseline 2026-05-16: ~280 sites
 * Ratchet direction: downward; hard-fail on any increase above CEILING.
 * Exclusions: global-bridge.ts, window-augment.d.ts, CommandManager.ts
 */
import { execSync } from 'child_process';

const CEILING = parseInt(process.env.WSTORE_PKG_CEILING ?? '280');
const EXCLUSIONS = ['global-bridge.ts', 'window-augment.d.ts', 'CommandManager.ts'];

const count = parseInt(
  execSync(
    `rg -c "window\\.\\w*Store\\b" packages --type ts --glob "!**/{${EXCLUSIONS.join(',')}}" | awk -F: '{s+=$2} END {print s+0}'`
  ).toString().trim()
);

if (count > CEILING) {
  console.error(`[G-NEW-02] FAIL: ${count} window.xStore accesses in packages/ (ceiling: ${CEILING})`);
  process.exit(1);
}
console.log(`[G-NEW-02] PASS: ${count} / ${CEILING} window.xStore accesses in packages/`);
```

**Owner sprint:** Phase 0.

---

### Gate P0-G3: `check-custom-event-packages.ts` (OI-048)

**File:** `tools/ga-gate/check-custom-event-packages.ts` (NEW)

```typescript
/**
 * Gate G-NEW-03: No window.dispatchEvent(new CustomEvent(...)) from packages/ or plugins/
 *
 * Baseline 2026-05-16: 447
 * Ratchet direction: downward.
 */
const CEILING = parseInt(process.env.CUSTOMEVENT_CEILING ?? '447');
// Scoped to packages/ only for Phase F; add plugins/ once annotations migrated
const count = parseInt(
  execSync(`rg -c "window\\.dispatchEvent|new CustomEvent" packages --type ts | awk -F: '{s+=$2} END {print s+0}'`)
  .toString().trim()
);
if (count > CEILING) { process.exit(1); }
```

**Owner sprint:** Phase 0.

---

### Gate P0-G4: `check-commandmanager-any.ts` (OI-049)

**File:** `tools/ga-gate/check-commandmanager-any.ts` (NEW)

```typescript
/**
 * Gate G-NEW-04: No commandManager: any typed parameters in packages/
 *
 * Baseline 2026-05-16: 14
 * Hard-fail on any increase.
 */
const CEILING = parseInt(process.env.CMDMGR_ANY_CEILING ?? '14');
const count = parseInt(
  execSync(`rg -c "commandManager:\\s*any\\b" packages --type ts --glob "!**/CommandManager.ts" | awk -F: '{s+=$2} END {print s+0}'`)
  .toString().trim()
);
if (count > CEILING) { process.exit(1); }
```

**Owner sprint:** Phase 0.

---

### Gate P0-G5: `check-structuredclone-new-commands.ts` (OI-050)

**File:** `tools/ga-gate/check-structuredclone-new-commands.ts` (NEW)

```typescript
/**
 * Gate G-NEW-05: structuredClone undo snapshots in packages/command-registry/ must not increase.
 *
 * Baseline 2026-05-16: 165 (all in CommandManager.ts legacy path)
 * New commands MUST NOT add structuredClone undo. Hard-fail on any increase above baseline.
 */
const CEILING = parseInt(process.env.STRUCTUREDCLONE_CEILING ?? '165');
const count = parseInt(
  execSync(`rg -c "structuredClone" packages/command-registry/src --type ts --glob "!**/CommandManager.ts" | awk -F: '{s+=$2} END {print s+0}'`)
  .toString().trim()
);
if (count > CEILING) { process.exit(1); }
```

**Owner sprint:** Phase 0.

---

### Update `run-all.ts` to include all 5 new gates

```typescript
// Add to GATES array in tools/ga-gate/run-all.ts:
{ name: 'cmdmgr-alias (G-NEW-01)',              script: 'check-no-commandmanager.ts' }, // update existing
{ name: 'window-store-in-packages (G-NEW-02)',  script: 'check-window-store-in-packages.ts' },
{ name: 'custom-event-packages (G-NEW-03)',     script: 'check-custom-event-packages.ts' },
{ name: 'commandmanager-any (G-NEW-04)',        script: 'check-commandmanager-any.ts' },
{ name: 'structuredclone-commands (G-NEW-05)',  script: 'check-structuredclone-new-commands.ts' },
```

**Phase 0 exit gate:** All 20 gates exit 0. `npx tsx tools/ga-gate/run-all.ts` → 0.

---

## §5 — Migration Phases

Phases are ordered by dependency. A later phase MUST NOT start until the earlier phase's exit gate is green.

---

### Phase E.5.x — Command Path Full Migration (apps/editor/src/)

**Objective:** Eliminate all 222 `commandManager.execute()` / `cmdMgr.execute()` call sites in `apps/editor/src/`. Delete `global-bridge.ts`.  
**Blocked by:** Phase 0 gates (need the aliasing gate to track progress).  
**Unblocks:** Phase E.stores (can't remove window.xStore reads until commandBus is the sole write path).

#### How each migration works (standard recipe)

For each legacy call site:

1. **Identify the command type** from the `new XxxCommand(...)` constructor call.
2. **Check if a `CommandBus` handler already exists** for that type:
   - `grep -rn "'xxx.update'\|'xxx.create'\|'xxx.delete'" packages/command-bus/src/commands.ts`
   - If found: skip to step 5.
   - If not: add the payload type to `packages/command-bus/src/commands.ts` and register a handler.
3. **Register the Immer handler** in the appropriate package (e.g., `packages/geometry-wall/src/handlers/updateWall.handler.ts`):
   ```typescript
   export const updateWallHandler: CommandHandler<'wall.update'> = async (cmd, ctx) => {
     const [, patches, inverse] = produceWithPatches(
       ctx.stores.wallStore.getAll(),
       draft => { Object.assign(draft[cmd.payload.id], cmd.payload.updates); }
     );
     ctx.stores.wallStore.applyPatch(patches);
     ctx.undoStack.push({ forward: patches, inverse, affectedStores: ['wallStore'] });
   };
   ```
4. **Wire the handler** in `composeRuntime.ts` (or in the package's own `register()` call).
5. **Replace the call site:**
   ```typescript
   // BEFORE
   const cmdMgr = window.commandManager;
   if (!cmdMgr) return;
   cmdMgr.execute(new UpdateWallBaselineCommand({ wallId, newBaseLine, prevBaseLine }));

   // AFTER
   runtime.commandBus.dispatch({
     type: 'wall.updateBaseline',
     payload: { wallId, newBaseLine, prevBaseLine },
     source: 'user',
   });
   ```
6. **Verify:** `pnpm tsc --noEmit` → 0; `npx tsx tools/ga-gate/run-all.ts` → 0.

---

#### Sprint E.5.1 — Property Inspector (16 sites)

**Target file:** `apps/editor/src/ui/property-inspector/PropertyInspectorApply.ts`  
**Baseline before:** cmdMgr ceiling = 222  
**Exit ceiling:** 206

| # | Element type | Current command | Bus handler to register |
|---|---|---|---|
| 1 | Wall | `UpdateWallBaselineCommand` | `wall.updateBaseline` |
| 2 | Slab | `UpdateSlabCommand` | `slab.update` |
| 3 | Door | `UpdateDoorParameterCommand` | `door.updateParameter` |
| 4 | Window | `UpdateWindowParameterCommand` | `window.updateParameter` |
| 5 | Column | `UpdateColumnCommand` | `column.update` |
| 6 | Beam | `UpdateBeamCommand` | `beam.update` |

**Contract amendments on close:** None until full E.5.x close.  
**Gate check:** `CMDMGR_CEILING=206 npx tsx tools/ga-gate/check-no-commandmanager.ts` → 0.

---

#### Sprint E.5.2 — Plan View Move/Copy/Align Tools (28 sites)

**Target files:**
- `engine/views/plantools/MovePlanToolHandler.ts` — 13 sites
- `engine/views/plantools/AlignPlanToolHandler.ts` — 8 sites
- `engine/views/plantools/CopyPlanToolHandler.ts` — 7 sites

**Element types touched:** wall, slab, column, beam, door, window, curtain-wall, furniture (move/copy/align variants)  
**Bus handlers to register:** `wall.move`, `wall.align`, `wall.copy`, + equivalents for each type  
**Exit ceiling:** 178  
**Gate check:** `CMDMGR_CEILING=178 npx tsx tools/ga-gate/check-no-commandmanager.ts` → 0.

---

#### Sprint E.5.3 — Property Panel (15 sites)

**Target files:**
- `ui/property-panel/PropertyPanelTypeSelector.ts` — 10 sites
- `ui/property-panel/PropertyPanel.ts` — 3 sites
- `ui/property-panel/PropertyPanelAnnotations.ts` — 3 sites

**Bus handlers to register:** type-change command for each element family  
**Exit ceiling:** 163  
**Gate check:** `CMDMGR_CEILING=163 npx tsx tools/ga-gate/check-no-commandmanager.ts` → 0.

---

#### Sprint E.5.4 — 3D Gizmo Drag-End (8 sites)

**Target file:** `apps/editor/src/engine/registerTransformDragHandler.ts` (8 sites)  
**Reference contract:** C06 §4.3 (gizmo drag-end dispatch table)  
**Bus handlers to register:** `wall.setTransform`, `slab.setTransform`, `column.setTransform`, `beam.setTransform`, `door.setTransform`, `window.setTransform`, `furniture.setTransform`, `curtainWall.setTransform`  
**Exit ceiling:** 155  
**Special note:** This file also has 8 literal `window.commandManager` alias-creates. Both sets go in this sprint.

---

#### Sprint E.5.5 — PlanView Interaction + Overlay + Misc (60 sites across 25 files)

**Target files:** The remaining 25 plan-tool handler files, PlanViewInteraction.ts, PlanViewToolOverlay.ts, SvpPlanToolOverlay.ts, PlanViewManager.ts, BimService.ts, initTools.ts, PreviewManager.ts, Step6CommitView.ts, TemplateEditorPanel.ts, AuditGridZone.ts, SpineOverrideList.ts, WallPerfBench.ts.

**Exit ceiling:** 95  
**Batch approach:** Group by element family; one handler file per family, shared `runtime.commandBus.dispatch()` wire.

---

#### Sprint E.5.6 — packages/ commandManager sites (50 sites)

**Target packages:**
- `@pryzm/ai-host` (FloorPlanBatchExecutor.ts ×4, VoiceSpatialInterface.ts ×3, AmbientIntelligence.ts ×2, RoomAIAssistant.ts ×3, QueryEngine.ts ×1)
- `@pryzm/core-app-model` (AutoRemediateCommand.ts ×2, PlanElementDragController.ts ×2)
- `@pryzm/command-registry` (AnnotateViewCommand.ts ×1, plans ×2)
- `plugins/annotations` (OBCAnnotationAdapter.ts ×2, LevelDatumLineBuilder.ts ×1, SectionGridLineBuilder.ts ×1)

**Approach for ai-host:** Replace `window.commandManager.execute()` calls in batch executor with `aiRuntime.commandBus.dispatch(...)`. The `aiRuntime` handle is passed into `FloorPlanBatchExecutor` constructor (Phase D.4 dependency injection already wires this).

**Exit ceiling:** 0 ✅  
**Gate becomes hard-fail:** Remove `CMDMGR_CEILING` env-var fallback; gate hard-fails on any count > 0.

---

#### Phase E.5.x Exit Gate

```bash
# All must return 0:
rg "cmdMgr\.execute\b|commandManager\.execute\b" apps/editor/src packages plugins --type ts | grep -v "// |CommandManager\.ts|global-bridge" | wc -l   # → 0
rg "window\.commandManager\b" apps/editor/src packages plugins --type ts | grep -v "// |global-bridge" | wc -l   # → 0
npx tsx tools/ga-gate/run-all.ts   # → 0 (all 20 gates)
pnpm tsc --noEmit   # → 0
```

**Contract amendments on close:**
- C03 §4.3: Remove "Transitional Dual-Path State" note; add ✅ ELIMINATED stamp.
- C06 §4.3: Remove "Path A fallback" column from gizmo dispatch table.
- C11 §8.1: Mark `commandManager.execute() in src/ == 0` as ✅ CLOSED.
- C14 LP-02: Add ✅ ELIMINATED stamp.
- OI-042, OI-043: Close.
- **Delete `packages/command-registry/src/global-bridge.ts`.**
- **Update `packages/command-registry/src/index.ts`** to remove the `getCommandManagerBridge` export.

---

### Phase E.stores — Window Store Registration Elimination

**Objective:** Remove all `window.xStore = ...` registration writes from `init*.ts` files. Thread `runtime.stores.*` to every consumer. Zero `window.xStore` reads across the entire codebase.  
**Blocked by:** Phase E.5.x (commandBus must be the write path before we can remove the store reads from old command handlers).  
**Unblocks:** Phase E.undo (command handlers can now use `ctx.stores.*` from HandlerContext).

#### The architectural change

The five init files currently act as a "store registry" by publishing to `window`. The fix is to stop publishing and instead pass stores through existing injection mechanisms:

```typescript
// BEFORE (initBuilders.ts pattern):
function initBuilders(runtime: PryzmRuntime) {
  window.wallStore = runtime.stores.wallStore;        // ← remove
  window.slabStore = runtime.stores.slabStore;        // ← remove
  // ... 22 more
}

// AFTER: stores are already in runtime.stores.*
// Consumers that had `window.wallStore` now use:
//   - In a handler:     ctx.stores.wallStore
//   - In a plan tool:   runtime.stores.wallStore  (runtime is passed in)
//   - In a package:     constructor(private stores: RuntimeStores) {...}
//   - In a plugin:      context.runtime.stores.wallStore
```

**Why this is safe:** `composeRuntime()` already owns all stores (since Sprint A27). `window.xStore` reads in tool code are only needed because the tool code doesn't have the `runtime` handle. Passing `runtime` down to plan tools via the existing `PlanViewManager.setRuntime()` mechanism (already implemented for some tools) is the injection path.

---

#### Sprint E.stores.1 — Stop registering window globals in init files

**Target files:** `initBuilders.ts`, `initTools.ts`, `initScene.ts`, `initUI.ts`, `initDataPlatform.ts`  
**Work:**
1. Remove all `window.xStore = ...` assignments (91 lines removed).
2. Remove all `window.xBuilder = ...` assignments (21 lines removed).
3. Remove all `window.bimManager = ...`, `window.commandManager = ...` assignments.
4. Run `pnpm tsc --noEmit` — this will produce errors at every consumer that still reads from `window.*`.
5. Do NOT fix the errors yet — this sprint creates the "error map" for subsequent sprints.
6. Re-add the assignments behind a feature flag `window.__PRYZM_LEGACY_BUS = true` check, so the app still runs while sprints E.stores.2+ fix consumers.

```typescript
// initBuilders.ts — feature-flagged bridge (temporary)
if ((window as any).__PRYZM_LEGACY_BUS) {
  window.wallStore = runtime.stores.wallStore;
  // ...etc — will be deleted sprint by sprint as consumers migrate
}
```

**Exit:** `pnpm tsc --noEmit` → 0 with flag enabled; type errors documented for each consumer file.

---

#### Sprint E.stores.2 — BrowserDataHelpers + SpatialTree (34 + 8 sites)

**Target files:**
- `ui/ViewBrowser/panels/unified-browser/BrowserDataHelpers.ts` — 34 `window.xStore` reads
- `ui/ViewBrowser/panels/unified-browser/SpatialTree.ts` — 8 `window.xStore` reads

**Migration:** Thread `runtime.stores` into the `BrowserDataHelpers` constructor. Both files already receive props from `UnifiedBrowserPanel` — pass `stores: runtime.stores` as a prop.

```typescript
// BEFORE
const walls = window.wallStore.getAll();
// AFTER
const walls = this.stores.wallStore.getAll();
```

**Remove from init files:** The 15 store lines in `initBuilders.ts` for the store types read by BrowserDataHelpers.

---

#### Sprint E.stores.3 — initUI.ts window.xStore reads (31 sites)

**Target file:** `apps/editor/src/engine/initUI.ts`  
`initUI.ts` reads 31 `window.xStore` values to initialise the UI. After Phase E.5.x, these are only for reading (not commanding). Thread `runtime.stores` into `initUI()` parameter directly (it already takes `runtime: PryzmRuntime`).

---

#### Sprint E.stores.4 — Plan Tool Handlers (24+15+13 sites)

**Target files:**
- `engine/views/plantools/AlignPlanToolHandler.ts` — 24 window.xStore reads
- `engine/views/plantools/MovePlanToolHandler.ts` — 15 window.xStore reads
- `engine/views/plantools/CopyPlanToolHandler.ts` — 13 window.xStore reads

These handlers already have access to `runtime` via `PlanViewInteraction`. Thread `runtime.stores` into each handler's constructor.

---

#### Sprint E.stores.5 — packages/ window.xStore reads (280 sites across 13 packages)

This is the largest sprint. Each package gets its stores via constructor injection rather than window globals.

**Package-by-package approach:**

| Package | Sites | Injection mechanism | Sprint sub-task |
|---|---|---|---|
| `@pryzm/ai-host/AIReadModel.ts` | 16 | Add `stores: RuntimeStores` to `AIReadModel` constructor (Phase D.4) | E.stores.5a |
| `@pryzm/ai-host` (other files) | 28 | Same — consume from `AIReadModel` | E.stores.5a |
| `@pryzm/core-app-model` | 92 | `BatchCoordinator` already accepts stores; thread to remaining files | E.stores.5b |
| `@pryzm/room-topology` | 23 | Add `stores: RuntimeStores` to `RoomContentsService` constructor | E.stores.5c |
| `@pryzm/input-host` | 20 | Plan tools already receive `runtime`; thread to `BeamTool`, `WallEndpointController` | E.stores.5d |
| `@pryzm/constraint-solver` | 11 | Add `stores` constructor parameter to `ConstraintEngine` | E.stores.5e |
| `@pryzm/geometry-curtain-wall` | 5 | Wire `runtime.stores` into `CurtainWallTool.activate(context)` | E.stores.5f |
| Others (geometry-wall, slab, roof, spatial-index, etc.) | ~85 | Per-package constructor injection | E.stores.5g |

---

#### Sprint E.stores.6 — plugins/annotations window.xStore (50 sites)

All 12 annotation commands use `window.annotationStore ?? null`. Migrate to `HandlerContext.stores.annotationStore`.

**Pattern for annotation commands:**

```typescript
// BEFORE
class UpdateAnnotationCommand {
  private get store() {
    return typeof window !== 'undefined' ? window.annotationStore ?? null : null;
  }
  execute() {
    const store = this.store;
    if (!store) return;
    // ...
  }
}

// AFTER — register as a CommandBus handler
export const updateAnnotationHandler: CommandHandler<'annotation.update'> = async (cmd, ctx) => {
  const store = ctx.stores.annotationStore;
  const [, patches, inverse] = produceWithPatches(store.getAll(), draft => {
    Object.assign(draft[cmd.payload.id], cmd.payload.updates);
  });
  store.applyPatch(patches);
  ctx.undoStack.push({ forward: patches, inverse, affectedStores: ['annotationStore'] });
};
```

Migrate all 12 annotation commands + all annotation tool window.xStore reads.

---

#### Phase E.stores Exit Gate

```bash
rg "window\.\w*Store\b" apps/editor/src packages plugins --type ts | grep -v "// |global-bridge|window-augment|CommandManager\.ts" | wc -l   # → 0
rg "window\.\w*(Store|Builder|Manager)\s*=" apps/editor/src --type ts | grep -v "// |__PRYZM_LEGACY_BUS" | wc -l   # → 0
npx tsx tools/ga-gate/run-all.ts   # → 0
pnpm tsc --noEmit   # → 0
# Remove __PRYZM_LEGACY_BUS feature flag entirely
```

**Contract amendments on close:**
- C14 LP-01: ✅ ELIMINATED.
- C14 LP-08: ✅ ELIMINATED.
- C14 §4: Update all TRANSITIONAL packages that depended only on LP-01 → COMPLIANT.
- OI-044, OI-045: Close.
- Remove all `window.xStore`, `window.xBuilder`, `window.bimManager` lines from `global-window-augment.d.ts`.

---

### Phase E.undo — structuredClone Undo Elimination (command-registry)

**Objective:** Replace all 165 `structuredClone` undo snapshots in `@pryzm/command-registry` with `produceWithPatches` + `RingBufferUndoStack`.  
**Blocked by:** Phase E.stores (handlers need `ctx.stores.*` to be injectable, which requires E.stores to complete).  
**Unblocks:** Eventual deletion of `CommandManager.ts`.

#### Sprint E.undo.1 — Wall + Slab family (estimated 40 structuredClone sites)

For each command in `packages/command-registry/src/walls/` and `packages/command-registry/src/slabs/`:

```typescript
// BEFORE (UpdateWallBaselineCommand.ts)
execute(ctx: CommandContext) {
  const existing = ctx.stores.wallStore.getById(this.wallId);
  this.snapshot = structuredClone(existing);  // ← remove
  ctx.stores.wallStore.update(this.wallId, this.updates);
}
undo(ctx: CommandContext) {
  ctx.stores.wallStore.update(this.wallId, this.snapshot);  // ← remove
}

// AFTER — command class removed entirely; replaced by handler:
// (handler registered via commandBus, uses produceWithPatches, see Sprint E.5.1)
```

Each `structuredClone` undo command is eliminated by the corresponding `commandBus.dispatch()` migration in E.5.x. They are coupled: when a command is replaced by a bus handler, the `structuredClone` snapshot disappears with it.

**Exit gate:** `rg "structuredClone" packages/command-registry/src --type ts | grep -v "// |CommandManager\.ts" | wc -l` → 0.

---

#### Sprint E.undo.2 — annotations/annotations structuredClone (2 sites)

`plugins/annotations/src/commands/DeleteAnnotationCommand.ts` and `UpdateAnnotationCommand.ts` — 2 `structuredClone` sites. Eliminated as part of Phase E.stores.6 (annotations migration).

---

#### Phase E.undo Exit Gate

```bash
rg "structuredClone" packages/command-registry/src --type ts | grep -v "// |CommandManager\.ts" | wc -l   # → 0
rg "structuredClone" plugins --type ts | grep -v "// " | wc -l   # → 0
STRUCTUREDCLONE_CEILING=0 npx tsx tools/ga-gate/check-structuredclone-new-commands.ts   # → 0
```

**Contract amendments on close:**
- C03 §4.2: Add hard-fail note: "structuredClone undo PROHIBITED. All commands MUST use `produceWithPatches`."
- C14 LP-04: ✅ ELIMINATED.
- **Delete `CommandManager.ts`** (the class only survives as long as it has consumers).

---

### Phase E.types — Type Erosion Elimination (commandManager: any)

**Objective:** Replace all 14 `commandManager: any` typed parameters in packages/.  
**Blocked by:** Phase E.5.x (the replacement type is `CommandBus`, which must be the active path before typing can change).

#### Sprint E.types.1 — IFC Converters (10 sites in @pryzm/file-format)

All 8 IFC converter classes accept `commandManager: any`:

```typescript
// BEFORE
class IfcWallConverter {
  constructor(private commandManager: any, private issues: IfcConversionIssue[]) {}
  convert(elem: IfcWallElement) {
    executeHumanDirect(this.commandManager, new CreateWallCommand({ ... }));
  }
}

// AFTER
class IfcWallConverter {
  constructor(private bus: CommandBus, private issues: IfcConversionIssue[]) {}
  convert(elem: IfcWallElement) {
    this.bus.dispatch({ type: 'wall.create', payload: { ... } });
  }
}

// IfcConversionContext.ts — remove commandManager: any
export interface IfcConversionContext {
  bus: CommandBus;   // ← replaces commandManager: any
  issues: IfcConversionIssue[];
  level: LevelId;
}
```

Also delete `executeHumanDirect()` utility function (it was a `commandManager: any` wrapper).

---

#### Sprint E.types.2 — Plans + BatchCoordinator (4 sites)

- `packages/command-registry/src/plans/BeamCommandPlan.ts` → `bus: CommandBus`
- `packages/command-registry/src/plans/StairCommandPlan.ts` → `bus: CommandBus`
- `packages/core-app-model/src/batch/BatchCoordinator.ts` → `bus: CommandBus` (already has `commandBus` slot — just type it correctly)
- `packages/core-app-model/src/stores/FloorTypes.ts` → remove `commandManager?: any` from the type

---

#### Sprint E.types.3 — AI host (1 site + aiRuntime handle)

- `packages/ai-host/src/rooms/RoomAIAssistant.ts` → `bus: CommandBus`

---

#### Phase E.types Exit Gate

```bash
CMDMGR_ANY_CEILING=0 npx tsx tools/ga-gate/check-commandmanager-any.ts   # → 0
rg "commandManager:\s*any\b" packages --type ts | grep -v "// |CommandManager\.ts" | wc -l   # → 0
```

**Contract amendments on close:**
- C14 LP-03, LP-10: ✅ ELIMINATED.
- OI-049: Close.

---

### Phase F.events — CustomEvent → runtime.events Migration

**Objective:** Eliminate all 501 `window.dispatchEvent(new CustomEvent(...))` calls in `apps/editor/src/` and 447 in `packages/`.  
**Blocked by:** Phase E.stores (needs `runtime.events` injectable at the geometry and package tier).  
**Prerequisite architectural work:** Extend the `PryzmRuntime.events` interface to be injectable at L2 (`@pryzm/geometry-*`) and L3 (`@pryzm/file-format`, `@pryzm/core-app-model`).

#### The runtime.events injection gap

Currently `runtime.events` is only accessible at the app tier (`apps/editor/src/engine/`). Packages at L2 and L3 have no `runtime` handle and can't call `runtime.events.emit()`.

**Architectural fix:** Extract `EventBusSlot` from `PryzmRuntime` as an injectable singleton:

```typescript
// packages/event-bus/src/index.ts (NEW package, L1)
export interface EventBus {
  emit<K extends keyof RuntimeEvents>(kind: K, payload: RuntimeEvents[K]): void;
  on<K extends keyof RuntimeEvents>(kind: K, handler: (payload: RuntimeEvents[K]) => void): () => void;
}

// composeRuntime.ts — wire the event bus into all package constructors that need it
const eventBus = buildEventBus();
const doorBuilder = new DoorBuilder({ eventBus });  // ← injection
```

This replaces the `window.dispatchEvent` pattern at every tier.

---

#### Sprint F.events.1 — Define EventBus package and injection points

1. Create `packages/event-bus/src/` (L1 package) with `EventBus` interface and `buildEventBus()` factory.
2. Add `eventBus` parameter to the constructors of: `DoorBuilder`, `CurtainWallBuilder`, `ColumnStore`, `ConstraintEngine`, `SelectionManager`, `FloorPlanUnderlayTool`, `IfcLevelImporter`, `DxfToBimTracer`, `deleteIfcElement`.
3. Wire in `composeRuntime.ts`.
4. Add `@pryzm/event-bus` to the workspace.

---

#### Sprint F.events.2 — apps/editor/src/ event migration (501 sites)

Grouped by event topic:

| Event name (current) | New event name | Handler in |
|---|---|---|
| `bim-selection-changed` | `selection.changed` | `plugins/selection` |
| `update-view-browser` | `viewBrowser.refresh` | `apps/editor/src/ui/ViewBrowser` |
| `pryzm-level-created` | `level.created` | `plugins/levels` |
| `pryzm-project-switch` | `project.switched` | `runtime-composer` |
| `bim-ifc-model-removed` | `ifc.modelRemoved` | `plugins/ifc-import` |
| `ai-proposal-added` | `ai.proposalAdded` | `@pryzm/ai-host` |
| (all 27 event types in initUI.ts) | typed names | per-subsystem |
| (all 13 event types in initCollaboration.ts) | typed names | sync subsystem |
| (all 13 in PlatformProjectBrowser.ts) | typed names | platform layer |

The migration is mechanical: `window.dispatchEvent(new CustomEvent('X', { detail }))` → `eventBus.emit('X', detail)`. The `eventBus` is the injected `@pryzm/event-bus` instance.

---

#### Sprint F.events.3 — packages/ CustomEvent migration (447 sites)

Same mechanical replacement, using the injected `eventBus` instance:

```typescript
// BEFORE (geometry-door/DoorBuilder.ts)
document.dispatchEvent(new CustomEvent('bim-door-updated', { detail: { doorId } }));

// AFTER
this.eventBus.emit('door.updated', { doorId });
```

---

#### Sprint F.events.4 — Remove CustomEvent listeners from UI

For each `window.addEventListener('X', ...)` in the UI layer, replace with `runtime.events.on('noun.verb', ...)`.

---

#### Phase F.events Exit Gate

```bash
rg "window\.dispatchEvent|document\.dispatchEvent|new CustomEvent" apps/editor/src packages plugins --type ts | grep -v "// " | wc -l   # → 0
CUSTOMEVENT_CEILING=0 npx tsx tools/ga-gate/check-custom-event-packages.ts   # → 0
npx tsx tools/ga-gate/run-all.ts   # → 0
```

**Contract amendments on close:**
- C14 LP-05: ✅ ELIMINATED.
- OI-048: Close.
- Remove `window.dispatchEvent` types from `global-window-augment.d.ts`.

---

### Phase F.storebus — StoreEventBus Retirement

**Objective:** Replace `StoreEventBus` batch coordination in `@pryzm/core-app-model` with Yjs per-level `Y.Doc` boundaries.  
**Blocked by:** Phase G3-T2 (Yjs per-level CRDT — ADR-049, already implemented at the doc level; needs the batch coordination layer removed).  
**Covered in detail by:** `docs/archive/pryzm3-internal/04-PLAN-FORWARD/29-WAVE-A19-YJS-COLLABORATION.md §G3-T2`.

**Key files to change:**
- `packages/core-app-model/src/StoreEventBus.ts` → delete when last subscriber removed
- `packages/core-app-model/src/batch/BatchCoordinator.ts` → replace `storeEventBus.beginBatch()/endBatch()` with `Y.Doc.transact()` boundaries
- `packages/core-app-model/src/DependencyResolver.ts` → replace `storeEventBus.subscribe()` with `yDoc.on('update', ...)`
- `packages/core-app-model/src/BimKernel.ts`, `IFCPsetAdapter.ts`, `SemanticIndex.ts`, `TemporalGraph.ts`, `ElementCodeStore.ts` → same pattern

**Exit gate:**
```bash
rg "storeEventBus" packages --type ts | grep -v "// |StoreEventBus\.ts" | wc -l   # → 0
rg "StoreEventBus" packages --type ts | grep -v "// " | wc -l   # → 0  (file deleted)
```

---

### Phase F.crossimport — Cross-Package Relative Import Elimination

**Objective:** Fix the `@pryzm/room-topology` → `../../geometry-curtain-wall/src/CurtainWallBuilder` relative import.

**Sprint:** One-liner fix in the next sprint that touches either package.

```typescript
// packages/room-topology/src/RoomTopologyObserver.ts
// BEFORE
import { CurtainWallBuilder } from '../../geometry-curtain-wall/src/CurtainWallBuilder';
// AFTER
import { CurtainWallBuilder } from '@pryzm/geometry-curtain-wall';
```

**Also:** Add `CurtainWallBuilder` to `packages/geometry-curtain-wall/src/index.ts` barrel if missing.

**Exit gate:**
```bash
rg "from '\.\./\.\./geometry-curtain-wall" packages --type ts | wc -l   # → 0
```

**Contract amendments on close:** C14 LP-07: ✅ ELIMINATED.

---

### Phase F.cleanup — Legacy Package Deletion + Final Sweep

**Objective:** Delete `@pryzm/legacy-shim`, update `global-window-augment.d.ts` to remove all retired slots, and do a final sweep for any remaining legacy patterns.

#### Sprint F.cleanup.1 — Delete @pryzm/legacy-shim

```bash
rm -rf packages/legacy-shim/
# Remove from pnpm-workspace.yaml
# Run pnpm install
pnpm tsc --noEmit   # → 0
```

#### Sprint F.cleanup.2 — Trim global-window-augment.d.ts

After all `window.xStore` reads are eliminated, `global-window-augment.d.ts` (or `global-window.d.ts`) should have zero store slot declarations. Remove all 15+ store slot types, all builder slot types, all manager slot types, and `window.commandManager`. Only the `window.__PRYZM_VERSION` and `window.__PRYZM_BUILD_DATE` informational slots should remain (if any).

#### Sprint F.cleanup.3 — Delete CommandManager.ts

After Phase E.5.x + E.undo: `packages/command-registry/src/CommandManager.ts` has no consumers. Delete it.

```bash
rm packages/command-registry/src/CommandManager.ts
# Remove from packages/command-registry/src/index.ts barrel
pnpm tsc --noEmit   # → 0 (no importers remain)
```

---

## §6 — Sprint Schedule

The following is the complete ordered sprint sequence. Each sprint is a self-contained unit of work that leaves the codebase in a green state (`pnpm tsc --noEmit` → 0, all gates pass).

```
Phase 0 (2 sprints):
  P0.1  Implement 5 new GA gates; update check-no-commandmanager.ts aliasing fix
  P0.2  Verify all 20 gates green with baselines set

Phase E.5.x (6 sprints — commandManager elimination, apps/editor/src/):
  E.5.1  Property Inspector (16 sites) — PropertyInspectorApply.ts
  E.5.2  Plan tool Move/Copy/Align (28 sites) — 3 handler files
  E.5.3  Property Panel (15 sites) — PropertyPanel, TypeSelector, Annotations
  E.5.4  3D Gizmo drag-end (8 sites) — registerTransformDragHandler.ts
  E.5.5  PlanView Interaction + Overlay + misc (60 sites — 25 files)
  E.5.6  packages/ commandManager sites (50 sites) — ai-host, core-app-model, annotations

Phase E.stores (6 sprints — window.xStore elimination):
  E.stores.1  Feature-flag bridge; remove registration writes from init files
  E.stores.2  BrowserDataHelpers + SpatialTree (42 sites)
  E.stores.3  initUI.ts window.xStore reads (31 sites)
  E.stores.4  Plan tool handlers window.xStore reads (52 sites)
  E.stores.5  packages/ window.xStore reads (280 sites — 7 sub-sprints by package)
  E.stores.6  plugins/annotations window.xStore (50 sites)

Phase E.undo (2 sprints — structuredClone elimination):
  E.undo.1  command-registry wall+slab+column+beam commands (linked to E.5.1–E.5.3)
  E.undo.2  annotations structuredClone (2 sites — linked to E.stores.6)

Phase E.types (3 sprints — commandManager: any elimination):
  E.types.1  IFC converters (10 sites)
  E.types.2  Plans + BatchCoordinator (4 sites)
  E.types.3  AI host RoomAIAssistant (1 site)

Phase F.events (4 sprints — CustomEvent → runtime.events):
  F.events.1  EventBus package + injection point wiring
  F.events.2  apps/editor/src/ CustomEvent migration (501 sites)
  F.events.3  packages/ CustomEvent migration (447 sites)
  F.events.4  Remove CustomEvent listeners from UI

Phase F.storebus (3 sprints — StoreEventBus retirement via Yjs):
  F.storebus.1  BatchCoordinator → Y.Doc.transact() boundaries
  F.storebus.2  DependencyResolver + BimKernel → yDoc.on('update', ...)
  F.storebus.3  Delete StoreEventBus.ts

Phase F.crossimport (1 sprint):
  F.crossimport  room-topology relative import fix; geometry-curtain-wall barrel update

Phase F.cleanup (3 sprints):
  F.cleanup.1  Delete @pryzm/legacy-shim
  F.cleanup.2  Trim global-window-augment.d.ts (remove all store/builder/manager slots)
  F.cleanup.3  Delete CommandManager.ts; delete global-bridge.ts

TOTAL: ~30 sprints
```

---

## §7 — Per-File Migration Ledger

The following table is the authoritative record of every file requiring migration, the legacy patterns in it, and the target sprint. Update the Status column at each sprint close.

### apps/editor/src/ — command path files

| File | Legacy pattern | Sites | Target sprint | Status |
|---|---|---|---|---|
| `ui/property-inspector/PropertyInspectorApply.ts` | cmdMgr.execute() | 16 | E.5.1 | ✅ DONE |
| `engine/views/plantools/MovePlanToolHandler.ts` | cmdMgr.execute(), window.xStore | 13+15 | E.5.2, E.stores.4 | ✅ DONE (cmdMgr); xStore → E.stores.4 |
| `ui/property-panel/PropertyPanelTypeSelector.ts` | cmdMgr.execute() | 10 | E.5.3 | ✅ DONE |
| `engine/views/plantools/AlignPlanToolHandler.ts` | cmdMgr.execute(), window.xStore | 8+24 | E.5.2, E.stores.4 | ✅ DONE (cmdMgr); xStore → E.stores.4 |
| `engine/registerTransformDragHandler.ts` | cmdMgr.execute(), window.commandManager | 8+8 | E.5.4 | ✅ DONE |
| `engine/views/plantools/CopyPlanToolHandler.ts` | cmdMgr.execute(), window.xStore | 7+13 | E.5.2, E.stores.4 | ✅ DONE (cmdMgr); xStore → E.stores.4 |
| `ui/property-panel/PropertyPanel.ts` | cmdMgr.execute() | 3 | E.5.3 | ✅ DONE |
| `ui/property-panel/PropertyPanelAnnotations.ts` | cmdMgr.execute() | 3 | E.5.3 | ✅ DONE |
| `ui/ViewBrowser/panels/unified-browser/BrowserDataHelpers.ts` | window.xStore | 34 | E.stores.2 | 🔴 OPEN |
| `engine/initBuilders.ts` | window.xStore = (registration) | 24 | E.stores.1 | 🔴 OPEN |
| `engine/initUI.ts` | window.xStore = + reads, CustomEvent | 31+27 | E.stores.1/3, F.events.2 | 🔴 OPEN |
| `engine/initTools.ts` | window.xStore = + xBuilder = | 10+5 | E.stores.1 | 🔴 OPEN |
| `engine/views/plantools/AnnotationPlanToolHandlers.ts` | window.xStore, window.commandManager | 9+3 | E.5.5, E.stores.4 | 🔴 OPEN |
| `engine/views/PlanViewInteraction.ts` | window.commandManager (alias) | 7 | E.5.5 | 🔴 OPEN |
| `engine/views/plantools/GridPlanToolHandler.ts` | window.commandManager | 6 | E.5.5 | 🔴 OPEN |
| `engine/views/SplitViewManager.ts` | CustomEvent | 13 | F.events.2 | 🔴 OPEN |
| `ui/import-manager/ImportManagerPanel.ts` | CustomEvent | 18 | F.events.2 | 🔴 OPEN |
| `engine/initCollaboration.ts` | CustomEvent | 15 | F.events.2 | 🔴 OPEN |
| `ui/platform/PlatformProjectBrowser.ts` | CustomEvent | 13 | F.events.2 | 🔴 OPEN |
| All 20 remaining plan-tool handler files | cmdMgr.execute(), window.xStore | 1–5 each | E.5.5, E.stores.4 | 🔴 OPEN |

### packages/ — key files

| Package/File | LP tags | Sites | Target sprint | Status |
|---|---|---|---|---|
| `ai-host/AIReadModel.ts` | LP-01 | 16 | E.stores.5a | 🔴 OPEN |
| `ai-host/FloorPlanBatchExecutor.ts` | LP-02, LP-05 | 4+3 | E.5.6, F.events.3 | 🔴 OPEN |
| `ai-host/QueryEngine.ts` | LP-01, LP-02, LP-05 | 8+1+16 | E.stores.5a, E.5.6, F.events.3 | 🔴 OPEN |
| `ai-host/VoiceSpatialInterface.ts` | LP-02, LP-05 | 3+2 | E.5.6, F.events.3 | 🔴 OPEN |
| `ai-host/AmbientIntelligence.ts` | LP-02 | 2 | E.5.6 | 🔴 OPEN |
| `ai-host/rooms/RoomAIAssistant.ts` | LP-02, LP-03 | 3+1 | E.5.6, E.types.3 | 🔴 OPEN |
| `command-registry/CommandManager.ts` | LP-04 | 165 | E.undo → F.cleanup.3 | 🔴 OPEN |
| `command-registry/global-bridge.ts` | LP-02 | — | E.5.x close → F.cleanup.3 | 🔴 OPEN |
| `command-registry/AnnotateViewCommand.ts` | LP-02 | 1 | E.5.6 | 🔴 OPEN |
| `command-registry/plans/BeamCommandPlan.ts` | LP-03 | 1 | E.types.2 | 🔴 OPEN |
| `command-registry/plans/StairCommandPlan.ts` | LP-03 | 1 | E.types.2 | 🔴 OPEN |
| `command-registry/curtainwall/CurtainWallsOnAllSlabs.ts` | LP-06 | 1 | E.stores.5b | 🔴 OPEN |
| `core-app-model/batch/BatchCoordinator.ts` | LP-01, LP-03, LP-05 | 92+1+6 | E.stores.5b, E.types.2, F.storebus.1 | 🔴 OPEN |
| `core-app-model/StoreEventBus.ts` | LP (bus) | — | F.storebus.3 → DELETE | 🔴 OPEN |
| `core-app-model/AutoRemediateCommand.ts` | LP-02 | 2 | E.5.6 | 🔴 OPEN |
| `file-format/conversion/IfcConversionContext.ts` | LP-03, LP-10 | 3 | E.types.1 | 🔴 OPEN |
| 8× `file-format/conversion/IfcXxxToNativeConverter.ts` | LP-03, LP-10 | 1 each | E.types.1 | 🔴 OPEN |
| `file-format/import/ifc/*.ts` (4 files) | LP-05 | 8 | F.events.3 | 🔴 OPEN |
| `room-topology/RoomTopologyObserver.ts` | LP-07 | 1 | F.crossimport | 🔴 OPEN |
| `input-host/SelectionManager.ts` | LP-05 | 9 | F.events.3 | 🔴 OPEN |
| `input-host/FloorPlanUnderlayTool.ts` | LP-05 | 11 | F.events.3 | 🔴 OPEN |
| `geometry-door/DoorBuilder.ts` | LP-05 | 3 | F.events.3 | 🔴 OPEN |
| `geometry-curtain-wall/CurtainWallBuilder.ts` | LP-05 | 2 | F.events.3 | 🔴 OPEN |
| `constraint-solver/ConstraintEngine.ts` | LP-01, LP-05 | 11+1 | E.stores.5e, F.events.3 | 🔴 OPEN |
| `legacy-shim/` | LP-09 | — | F.cleanup.1 → DELETE | 🔴 OPEN |

### plugins/ — key files

| Plugin/File | LP tags | Sites | Target sprint | Status |
|---|---|---|---|---|
| `annotations/src/commands/CreateAnnotationCommand.ts` | LP-01 | 2 | E.stores.6 | 🔴 OPEN |
| `annotations/src/commands/UpdateAnnotationCommand.ts` | LP-01, LP-04 | 2+1 | E.stores.6, E.undo.2 | 🔴 OPEN |
| `annotations/src/commands/DeleteAnnotationCommand.ts` | LP-01, LP-04 | 2+1 | E.stores.6, E.undo.2 | 🔴 OPEN |
| `annotations/src/commands/*.ts` (9 more) | LP-01 | 2 each | E.stores.6 | 🔴 OPEN |
| `annotations/src/OBCAnnotationAdapter.ts` | LP-02 | 2 | E.5.6 | 🔴 OPEN |
| `annotations/src/tools/LevelDatumLineBuilder.ts` | LP-02, LP-08 | 2 | E.5.6 | 🔴 OPEN |
| `annotations/src/tools/SectionGridLineBuilder.ts` | LP-02, LP-08 | 2 | E.5.6 | 🔴 OPEN |
| `annotations/src/tools/*.ts` (15 tools) | LP-01 | 1–3 each | E.stores.6 | 🔴 OPEN |
| `annotations/src/subsystem/ViewLinkResolver.ts` | LP-01 | 1 | E.stores.6 | 🔴 OPEN |

---

## §8 — Definition of Done ("Zero Legacy" State)

The migration is complete when ALL of the following verifiers return 0 or exit 0 simultaneously:

```bash
#!/usr/bin/env bash
# Run from repo root. Every line must print 0 or succeed (exit code 0).

echo "=== COMMAND PATH ===" 
rg "cmdMgr\.execute\b|commandManager\.execute\b" apps/editor/src packages plugins --type ts | grep -v "// |CommandManager\.ts|global-bridge" | wc -l
# Expected: 0

echo "=== WINDOW STORE READS ==="
rg "window\.\w*Store\b" apps/editor/src packages plugins --type ts | grep -v "// |global-bridge|window-augment" | wc -l
# Expected: 0

echo "=== WINDOW STORE/BUILDER WRITES ==="
rg "window\.\w*(Store|Builder|Manager)\s*=" apps/editor/src --type ts | grep -v "// |__PRYZM_LEGACY_BUS" | wc -l
# Expected: 0

echo "=== CUSTOM EVENTS ==="
rg "window\.dispatchEvent|document\.dispatchEvent|new CustomEvent" apps/editor/src packages plugins --type ts | grep -v "// " | wc -l
# Expected: 0

echo "=== STRUCTUREDCLONE UNDO ==="
rg "structuredClone" packages/command-registry/src plugins --type ts | grep -v "// |CommandManager\.ts" | wc -l
# Expected: 0

echo "=== COMMANDMANAGER ANY ==="
rg "commandManager:\s*any\b" packages --type ts | grep -v "// |CommandManager\.ts" | wc -l
# Expected: 0

echo "=== STOREEVENTBUS OUTSIDE CORE ==="
rg "storeEventBus" packages --type ts | grep -v "// |StoreEventBus\.ts|core-app-model" | wc -l
# Expected: 0

echo "=== CROSS-PACKAGE RELATIVE IMPORTS ==="
rg "from '\.\.\/\.\.\/[a-z]" packages --type ts | grep -v "// " | wc -l
# Expected: 0

echo "=== LEGACY-SHIM EXISTS ==="
test ! -d packages/legacy-shim && echo "0 (deleted)" || echo "1 (STILL EXISTS)"
# Expected: 0 (deleted)

echo "=== COMMANDMANAGER.TS EXISTS ==="
test ! -f packages/command-registry/src/CommandManager.ts && echo "0 (deleted)" || echo "1 (STILL EXISTS)"
# Expected: 0 (deleted)

echo "=== GLOBAL-BRIDGE.TS EXISTS ==="
test ! -f packages/command-registry/src/global-bridge.ts && echo "0 (deleted)" || echo "1 (STILL EXISTS)"
# Expected: 0 (deleted)

echo "=== ALL GA GATES ==="
npx tsx tools/ga-gate/run-all.ts
# Expected: exit 0 (all 20 gates pass)

echo "=== TYPESCRIPT CLEAN ==="
pnpm tsc --noEmit
# Expected: exit 0

echo "=== DONE. All 0s and green gates = legacy-free. ==="
```

Save this as `scripts/verify-zero-legacy.sh`. It is the single acceptance test for this entire migration.

---

## §9 — Risk Register

| Risk | Probability | Impact | Mitigation |
|---|---|---|---|
| **CommandBus handler missing for an element type** — replacing `cmdMgr.execute()` reveals a type that has no bus handler yet | HIGH | Med | Audit `packages/command-bus/src/commands.ts` before each E.5.x sprint; register handler stubs for all types that will be migrated in that sprint. |
| **`runtime` handle not threaded to a tool** — tool reads `window.xStore` because it doesn't have `runtime` | HIGH | Med | The feature-flag bridge (E.stores.1) keeps the app running while each tool is threaded in subsequent sprints. The bridge is only removed after ALL consumers are migrated. |
| **Annotation store schema mismatch** — `annotationStore` in `HandlerContext` has a different type signature than `window.annotationStore` | Med | High | Run `pnpm tsc --noEmit` after E.stores.6 Sprint 1 file (CreateAnnotationCommand.ts); fix type mismatches before proceeding. |
| **StoreEventBus retirement breaks BatchCoordinator batching** — removing it before Yjs replaces it causes commands to lose batch coalescing | Med | High | Phase F.storebus is blocked until Phase G3-T2 (Yjs per-level) is confirmed complete. The `storeEventBus.beginBatch()` pattern remains until then. |
| **ai-host window.xStore reads touch 10+ store types** — AIReadModel.ts reads from 16 stores | Med | High | Phase E.stores.5a injects all 16 stores via constructor at once. Risk: AI store types may differ from `RuntimeStores` type — run tsc after each store is threaded. |
| **CustomEvent listeners in UI still hard-coded to event name strings** — migrating emitters without migrating listeners causes silent no-ops | Med | High | For each CustomEvent name replaced, grep for `addEventListener('X'` before removing the dispatch; migrate the listener in the same commit. |
| **EngineBootstrap ghost consumers** — some file still `import` something from `CommandManager.ts` that blocks deletion | Low | Low | `grep -rn "CommandManager" packages apps plugins --type ts \| grep "import"` before F.cleanup.3. |
| **window-augment.d.ts leaves phantom type slots** — deleting a store from window.xStore but leaving its type declaration causes type-safe but semantically wrong reads | Low | Med | After each store migration batch, remove the corresponding window property from `global-window-augment.d.ts`. Gate `check-cast-count.ts` ensures (window as any) doesn't regress. |

---

## §10 — Quick-Reference: Sprint Owners and Links

| Sprint | Owner doc | Key files | Gate |
|---|---|---|---|
| Phase 0 gates | `tools/ga-gate/` (5 new files) | check-*.ts files | 20 gates green |
| E.5.x | `apps/editor/src/engine/`, `apps/editor/src/ui/` | plantools/, property-inspector/, registerTransformDragHandler.ts | CMDMGR_CEILING → 0 |
| E.stores | `apps/editor/src/engine/init*.ts`, all consumers | 7 init files → 30+ consumer files | WSTORE → 0 |
| E.undo | `packages/command-registry/src/` | per-element command files | STRUCTUREDCLONE → 0 |
| E.types | `packages/file-format/`, `@pryzm/ai-host` | IfcConversionContext + 8 converters | CMDMGR_ANY → 0 |
| F.events | `packages/event-bus/` (NEW), all consumers | 501+447 dispatch sites | CUSTOMEVENT → 0 |
| F.storebus | `packages/core-app-model/` | BatchCoordinator, DependencyResolver | storeEventBus → 0 |
| F.crossimport | `packages/room-topology/` | RoomTopologyObserver.ts | relative-import → 0 |
| F.cleanup | `packages/command-registry/`, `packages/legacy-shim/` | CommandManager.ts, global-bridge.ts | deletions done |

---

*Written 2026-05-16. Update §0 scorecard and §7 ledger at each sprint close. When §8 verification script prints all 0s, this plan is complete.*
