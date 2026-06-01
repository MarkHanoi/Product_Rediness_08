# MASTER IMPLEMENTATION PLAN — FUNCTIONAL FIXES
# PRYZM3 — 2026-05-18
**Status:** COMPLETE — all 14 tasks verified implemented; build gates clean as of 2026-05-19  
**Supersedes:** `ELEMENT-FUNCTIONAL-FIX-PLAN-2026-05-18.md` (F1–F7 only; this plan is the full replacement)  
**Contract refs:** C11 §5.2, C14 §3, C15 §8 §8.1, C20 §3, ADR-002 §2, P3, P4, P6  
**Audit source:** `ELEMENT-FUNCTIONAL-AUDIT-FULL-2026-05-18.md`  
**Verified by:** Exhaustive source read — 25 parallel explorer agents, 8 targeted grep/bash sweeps

---

## 0. Executive Baseline

### Confirmed-Working Baseline (DO NOT re-fix)

The following items are VERIFIED FIXED as of 2026-05-18 and must not be touched:

| Item | Status | Evidence |
|------|--------|----------|
| KI-1 Slab bridge | ✅ FIXED | CEB line 152–181 emits full geometry payload; initTools L1119 subscriber confirmed |
| KI-2 Beam bridge | ✅ FIXED | CEB line 276–301 emits full payload; initTools L1174 subscriber confirmed |
| KI-3 Column Zod validation | ✅ FIXED | CEB line 230–259 full payload; initTools L1062 subscriber; Zod schema passes |
| KI-4 Roof subscriber | ✅ FIXED | CEB line 503–525 full payload; initTools L1009 subscriber confirmed |
| KI-6 Wall BaselineReversalError | ✅ FIXED | `UpdateWallBaselineCommand.ts` L153–174 catches, snaps back, shows toast |
| Phase 0–5 commandManager→bus migration | ✅ DONE | `PRYZM3-MASTER-STATUS.md` §7 Waves 1–20 + Task Board TASK-01–18 |
| F.events.1–4 DOM→runtime.events migrations | ✅ DONE | `PRYZM3-MASTER-STATUS.md` OI-050 partial; F-events.16–18 complete |
| global-bridge.ts deleted | ✅ DONE | Wave 8 |
| CommandManager.ts → CommandManagerImpl.ts | ✅ DONE | Wave 20 |
| T1–T6 test spec files | ✅ DONE | TASK-01–18 |
| check:commandmanager CI gate (threshold 56) | ✅ ACTIVE | `scripts/ci-check-no-commandmanager.mjs` |
| 9/9 convergence booleans (architecture) | ✅ DONE | `02-ARCHITECTURE.md` §3 — all TRUE |

### Build / Type Metrics (current state)

| Metric | Value |
|--------|-------|
| `tsc --skipLibCheck --noEmit` | Exit 0 — 0 TS errors |
| `npm run build` | Times out (requires `NODE_OPTIONS=--max-old-space-size=6144`) |
| `grep -r "commandManager.execute\|window.commandManager\|getCommandManagerBridge"` | **329 hits** |
| `grep -r "window\.commandManager"` specifically | **156 hits** |
| `check:commandmanager` ratchet threshold | **56** (packages/ + plugins/ only) |
| Unguarded `window.*` accesses (RISK-2 scope) | **137 hits in 54 files** |

### Out of Scope for This Plan

- BUG-5: `ifc.import.file` bus wiring — explicitly deferred as `IFC-P6` in handler stub (L62: "plugin path not yet wired (IFC-P6 pending)"); separate roadmap task
- B3.3-ST: Stair full bus migration — schema mismatch, separate enrichment task
- B3.4-OP: Structural Openings typed handler — separate task
- Post-GA: IFC streaming LONGTASK fix, WebGPU prewarm, WCAG 2.1 AA
- Yjs CRDT activation — pending P6 migration completion
- OTLP exporter — blocked on infrastructure credential (TASK-19)
- `CreateMultipleLevelsCommand` undo — intentional architectural decision; batch level creation is non-undoable by design
- Spatial node undo gap (CreateHierarchyLevel, CreateBuilding, CreateSite, CreateUnit) — tracked separately; low user-facing impact

---

## 1. Assumed-Finding Verification Results

### ASSUMED-A: Field-level CEB/initTools mismatches for floor, ceiling, structural opening, plumbing, lighting, annotation

**VERDICT: DENIED (no fix required)**

| Element | Verdict | Evidence |
|---------|---------|----------|
| Floor | ✅ No mismatch | CEB L527–565 emits 14 fields incl. polygon, baseOffset, thickness, systemTypeId, layers, finishSpec, hostSlabId, hostRoomId; initTools L1219 subscriber consumes all of them with correct field-name mapping |
| Ceiling | ✅ No mismatch | CEB L379–401 emits id, boundary, ceilingHeight, thickness; initTools L936 maps boundary Vec3[]→CeilingVertex[] (x,z) correctly |
| Structural Opening | ✅ No mismatch | CEB L120–143: both `wall.opening.create` and `wall.createOpening` emit `{wallId, opening}` / `{wallId, openingData}`; initTools L859 subscriber applies defaults via `crypto.randomUUID()` for missing fields — correct |
| Plumbing Fixture | ✅ No initTools subscriber needed | Plumbing uses direct Immer store path (Committer architecture, `bim-plumbing-added` → `PlumbingFragmentBuilder`). initTools subscriber correctly absent. |
| Lighting Fixture | ✅ No initTools subscriber needed | Lighting uses `lightingBuilder.setScene(scene)` activation path, not initTools bridge |
| Annotation | ✅ No initTools subscriber needed | Annotation uses Immer path directly; annotations are 2D canvas overlays, not legacy-store elements |

---

### ASSUMED-B: Delete and undo() for slab/beam/column/roof — orphaned mesh risk

**VERDICT: CONFIRMED WORKING — no orphaned mesh risk for single-element operations**

| Element | `undo()` calls | DOM event fired | Evidence |
|---------|---------------|-----------------|----------|
| Slab | `ctx.stores.slabStore.remove(createdId)` | `slabStore.remove()` emits `bim-slab-removed` → `SlabFragmentBuilder` removes mesh | `packages/command-registry/src/slabs/CreateSlabCommand.ts` |
| Beam | `ctx.stores.beamStore.remove(createdBeamId)` | `beamStore.remove()` emits via storeEventBus → `BeamFragmentBuilder` | `packages/command-registry/src/beam/CreateBeamCommand.ts` |
| Column | `ctx.stores.columnStore.remove(createdId)` | `columnStore.remove()` emits via storeEventBus → `ColumnFragmentBuilder` | `packages/command-registry/src/columns/CreateColumnCommand.ts` |
| Roof | `ctx.stores.roofStore.remove(createdId)` | `roofStore.remove()` emits `bim-roof-removed` → `RoofFragmentBuilder` | `packages/command-registry/src/roofs/CreateRoofCommand.ts` |

Delete commands: All delete commands (`DeleteSlabCommand.ts`, `DeleteColumnCommand.ts`, `DeleteRoofCommand.ts`, polymorphic `DeleteElementCommand.ts` for beam) update their element store AND clean up `bimManager`, `elementRegistry`, `semanticGraphManager`. No dual-store gap for single element deletes.

**Note:** The orphaned mesh risk confirmed in the audit for Immer-only batch-delete paths is a consequence of BUG-1 (batch creates never reached legacy stores). Once BUG-1 is fixed, batches will be properly represented in legacy stores, making delete/undo safe.

---

### ASSUMED-C: Incomplete undo() implementations in packages/command-registry/src/

**VERDICT: PARTIALLY CONFIRMED — annotation commands missing undo(); others are acceptable or out of scope**

| Category | Commands | Verdict |
|----------|---------|---------|
| **Missing undo()** | All 9 annotation commands: `AnnotateViewCommand`, `CreateAnnotationCommand`, `CreateCalloutDetailCommand`, `CreateElevationMarkCommand`, `CreateSectionMarkCommand`, `DeleteAnnotationCommand`, `LockAnnotationCommand`, `UpdateAnnotationCommand`, `UpdateConstraintCommand` | ⚠️ CONFIRMED gap → TASK-11 |
| **Intentional no-ops** | `ReDetectRoomsCommand` (nonUndoable), `ValidateStairCommand` (read-only), `ClearProjectCommand` (non-undoable), `ImportProjectCommand` (non-undoable) | ✅ Acceptable by design |
| **Partial geometry undo** | `GenerateStairGeometryCommand`: no-op when `geometryGenerated === false` | ⚠️ Risk but out of scope (B3.3-ST) |
| **Single-store undo** | `CreateHierarchyLevelCommand`, `CreateBuildingCommand`, `CreateSiteCommand`, `CreateUnitCommand`: restore store but leak `ElementRegistry`/`BimManager` | ⚠️ Out of scope for this plan |
| **No-op undo for batch levels** | `CreateMultipleLevelsCommand`: returns `success: false, info: ["Undo not implemented"]` | ✅ Architectural decision — out of scope |

---

### ASSUMED-D: Curtain wall CREATE minimal payload → broken/empty mesh

**VERDICT: CONFIRMED CRITICAL — escalated to dedicated TASK-02**

- `CEB line 193–215`: `curtainwall.create` case emits only `{ id, levelId, baseLine, height }`.
- `initTools.ts L895` subscriber calls `curtainWallStoreInstance.add()` with only these 4 fields.
- `CurtainWallStore.add()` receives no `gridXSpacing` / `gridYSpacing` / `gridSystem`.
- `CurtainWallBuilder` calls `migrateToGridSystem()` which computes `numU = Math.floor(length / gridXSpacing)` → `NaN` (when `gridXSpacing` is `undefined`).
- `computeCurtainCells()` receives degenerate grid → returns `[]` → logs `"[CurtainCellComputer] Grid has fewer than 2 lines on an axis — no cells produced."`
- Result: **curtain wall 3D mesh is an empty invisible `THREE.Group`** on every single create.
- This is distinct from but related to BUG-1 (batch creates): BOTH single and batch curtain wall creates are broken.

---

### ASSUMED-E: Unhandled command types beyond copy/paste

**VERDICT: PARTIALLY CONFIRMED**

| Command Type | Dispatched From | Handler Exists? | Status |
|---|---|---|---|
| `copy-selection` | `MainToolbar.ts` | ❌ No handler in any `register*Handlers()` or `initBusHandlers.ts` | **CONFIRMED UNHANDLED → BUG-8** |
| `paste-clipboard` | `MainToolbar.ts` | ❌ No handler | **CONFIRMED UNHANDLED → BUG-8** |
| `slab.updateLayers` | `PropertyPanelTypeSelector.ts:72` | ❌ No handler found in `plugins/slab/` | **CONFIRMED UNHANDLED → TASK-12** |
| `ceiling.updateLayers` | `PropertyPanelTypeSelector.ts:88` | ❌ No handler found in `plugins/ceiling/` | **CONFIRMED UNHANDLED → TASK-12** |
| `floor.updateLayers` | `PropertyPanelTypeSelector.ts:104` | ❌ No handler found in `plugins/floor/` | **CONFIRMED UNHANDLED → TASK-12** |
| `wall.updateLayers` | `commands.ts` definition only | ❌ No handler found | **UNHANDLED — low priority (no UI dispatch found)** |
| `element.updateMark` | `PropertyPanel.ts:951` | ✅ `plugins/selection/src/handlers/UpdateElementMark.ts` | **HANDLED** |
| `element.update` | `commands.ts` definition only | ❌ No handler | **UNHANDLED — no UI dispatch found; likely placeholder** |
| `stair.executeApprovedPlan` | `commands.ts` definition only | ❌ No handler | **UNHANDLED — deferred (B3.3-ST scope)** |

---

## 2. Bug Register

| ID | Title | Severity | Root Cause | Files | Status |
|----|-------|----------|------------|-------|--------|
| BUG-1 | Batch create broken for all 6 element types | 🔴 CRITICAL | `CommandEventBridge.ts` batch cases extract `p.walls`, `p.slabs` etc. from `record.payload` but emit only `{ levelId, elementCount }` — discarding the per-element geometry arrays. initTools subscribers receive payloads with no IDs or coordinates. | `CEB.ts` L104–119, L183–192, L217–225, L261–275, L303–313, L379–405 | OPEN |
| BUG-1a | Curtain wall single create — empty mesh | 🔴 CRITICAL | `CEB.ts` L193–215 `curtainwall.create` emits minimal payload (id, baseLine, height only). `curtainWallStore.add()` receives no `gridXSpacing`/`gridYSpacing`. `migrateToGridSystem()` → NaN → 0 cells → empty mesh. | `CEB.ts` L193–215, `initTools.ts` L895–934, `CurtainWallStore.ts`, `CurtainWallBuilder.ts` | OPEN |
| BUG-2 | Stair railing silent no-render when stairId missing | 🟠 HIGH | `CreateStairRailing.ts` `canExecute()` returns `{valid:true}` unconditionally. `StairRailingBuilder.ts:23` calls `resolveStair(railing.stairId)` without guard on `stairId` being undefined. Builder silently skips render via `if (stair)` at L24. | `plugins/stair/src/handlers/CreateStairRailing.ts` L31–36, `packages/geometry-stair/src/StairRailingBuilder.ts` L22–24 | OPEN |
| BUG-3 | SetDoorSwing is a confirmed no-op stub | 🟠 HIGH | `SetDoorSwing.ts` `execute()` returns `{ forward: [], inverse: [] }` (documented stub). `DoorData` schema has no `swing` field. Swing direction silently discarded. | `plugins/door/src/handlers/SetDoorSwing.ts`, `packages/schemas/src/elements/Door.ts`, `plugins/door/src/committer/door-committer.ts` | OPEN |
| BUG-4 | Curtain wall update — per-panel N×rebuild | 🟠 HIGH | No `curtainwall.batch.update` command type. `UpdateCurtainWall.ts` bridges to `window.commandManager.execute(UpdateCurtainWallCommand)` once per panel → N×full mesh rebuild. | `plugins/curtain-wall/src/handlers/UpdateCurtainWall.ts`, `packages/command-bus/src/commands.ts`, `apps/editor/src/engine/engineLauncher.ts` | OPEN |
| BUG-5 | IFC import has no bus command and no undo | 🟠 HIGH | `ifc.import.file` handler is a documented stub (IFC-P6 pending). Actual import in `initUI.ts:processIfcFile()` bypasses bus entirely. Reference-mode imports add THREE.js meshes directly with no undo. | `plugins/ifc-import/src/handlers/pluginHandlers.ts` L51–62, `apps/editor/src/engine/initUI.ts` L1246+ | **DEFERRED — IFC-P6** |
| BUG-6 | Roof baseOffset hardcoded to 2.7 | 🟡 MEDIUM | `initTools.ts` L1035: `baseOffset: 2.7` is hardcoded. `autoBaseOffset: true` is also hardcoded at L1037. `ev.baseOffset` from the CEB payload is silently discarded. | `apps/editor/src/engine/initTools.ts` L1035–1037 | OPEN |
| BUG-7 | Bridge handlers return empty inverse patches — dual undo stack | 🟡 MEDIUM | Bridge handlers for `slab.update`, `slab.updatePolygon`, `UpdateCurtainWall`, `CreateWallsOnAllSlabs`, `CreateSlabsOnAllFloors` and others call `window.commandManager.execute()` and return `{ forward: [], inverse: [] }`. `CommandBus.ts` L298–313 pushes these empty patch pairs to `RingBufferUndoStack`. `SaveUndoRedoHUD` invokes `runtime.undoStack.undo()` → Ring Buffer → `applyPatches(inverse.ops)` → no-op. Legacy `CommandManagerImpl` undo history is never invoked from the UI. | `CommandBus.ts` L287–313, `packages/runtime-undo-stack/src/RingBufferUndoStack.ts`, `apps/editor/src/ui/SaveUndoRedoHUD.ts`, all bridge handlers in `plugins/slab/`, `plugins/curtain-wall/`, `plugins/wall/` | OPEN |
| BUG-8 | Copy/paste — no bus handler registered | 🟡 MEDIUM | `copy-selection` and `paste-clipboard` defined in `packages/command-bus/src/commands.ts` L40–41 and rendered in `MainToolbar.ts` L50–51, but no handler registered in any `registerXxxHandlers()` call or `initBusHandlers.ts`. Silently does nothing. | `packages/command-bus/src/commands.ts` L40–41, `apps/editor/src/ui/toolbar/MainToolbar.ts` L50–51, `apps/editor/src/engine/engineLauncher.ts` | OPEN |
| BUG-9 | 9 annotation commands missing undo() | 🟡 MEDIUM | `packages/command-registry/src/annotations/` — all 9 command files (`AnnotateViewCommand`, `CreateAnnotationCommand`, `CreateCalloutDetailCommand`, `CreateElevationMarkCommand`, `CreateSectionMarkCommand`, `DeleteAnnotationCommand`, `LockAnnotationCommand`, `UpdateAnnotationCommand`, `UpdateConstraintCommand`) have no `undo()` implementation. Ctrl+Z after any annotation operation is silently ignored or throws. | `packages/command-registry/src/annotations/` (all 9 files) | OPEN |
| RISK-1 | SheetEditorCommands.ts — 11 unguarded `window.commandManager` accesses | 🟢 LOW | `SheetEditorCommands.ts` lines 33, 52, 60, 149, 194, 258, 287, 330, 347, 432, 487 read `window.commandManager` without checking `window.__pryzmInitComplete`. Sheet editor component can mount before engine init completes → `commandManager` undefined → runtime TypeError. | `apps/editor/src/ui/SheetEditor/SheetEditorCommands.ts` L33, 52, 60, 149, 194, 258, 287, 330, 347, 432, 487 | OPEN |
| RISK-2 | 137 unguarded `window.*` accesses in 54 files | 🟢 LOW | `grep` sweep finds 137 occurrences of `window.commandManager\|window.wallStore\|window.commandContext` in apps/ without `__pryzmInitComplete` guard. All 54 files listed in audit SWEEP-6. | 54 files (full list in audit §SWEEP-6) | OPEN |
| RISK-3 | Dead CEB emissions for door/window/stair | 🟢 LOW | `CommandEventBridge.ts` L313–370 emits `door.created`, `window.created`, `stair.created` with minimal payloads. No initTools subscriber exists for these types. Emissions are wasted event processing. | `packages/runtime-composer/src/CommandEventBridge.ts` L313–370 | OPEN |
| RISK-4 | Silent no-op bridge fallback in initBusHandlers | 🟢 LOW | `initBusHandlers.ts` line ~502: `if (cm) cm.execute(...)` — silent no-op if `cm` is null instead of a loud error. | `apps/editor/src/engine/initBusHandlers.ts` L502 (approx) | OPEN |
| TASK-12 | slab/ceiling/floor.updateLayers unhandled | 🟡 MEDIUM | `PropertyPanelTypeSelector.ts` dispatches `slab.updateLayers`, `ceiling.updateLayers`, `floor.updateLayers` (L72, 88, 104). No handler registered in any `registerXxxHandlers()`. Layer/type changes in the property panel silently do nothing. | `apps/editor/src/ui/property-panel/PropertyPanelTypeSelector.ts` L72–110, `plugins/slab/src/`, `plugins/ceiling/src/`, `plugins/floor/src/` | OPEN |

---

## 3. Tasks

---

### TASK-01: Fix all batch create CEB payloads — emit per-element events
**Bug:** BUG-1  
**Severity:** 🔴 Critical  
**Contract compliance:** C11 §5.2 (typed domain events after mutation); C14 §3 LP-05 (no new `window.dispatchEvent` — use `runtime.events.emit`); ADR-002 §2 (enrichment point is CEB, not handlers)

**Architectural pattern:** Path B — Bus → CEB enrichment → `runtime.events.emit` per element → initTools subscriber → legacy store → DOM event → FragmentBuilder

---

**Root cause (verified):**

`packages/runtime-composer/src/CommandEventBridge.ts` batch cases (L104–119, L183–192, L217–225, L261–275, L303–313, L379–405) cast `record.payload` to `{ walls?: unknown[]; levelId?: string }` (and equivalents for each element type) but then emit only the array length, discarding the array contents entirely. Example (L104–119):

```
case 'wall.batch.create': {
  const p = record.payload as { walls?: unknown[]; levelId?: string };
  events.emit('wall.created', {
    commandId: record.id,
    commandType: 'wall.batch.create',
    levelId: p.levelId ?? '',
    wallCount: Array.isArray(p.walls) ? p.walls.length : 0,  // ← discards p.walls
  });
  break;
}
```

Each batch handler (`CreateWallBatch`, `CreateSlabBatch`, `CreateBeamBatch`, `CreateColumnBatch`, `CreateCurtainWallBatch`, `CreateCeilingBatch`) places the full element spec array into `record.payload` (e.g., `p.walls` contains the validated `WallSpec[]` passed by the caller). This data is available in the CEB but not used.

The `initTools.ts` subscribers for `wall.created` (L814), `slab.created` (L1119), `beam.created` (L1174), `column.created` (L1062), `curtain-wall.created` (L895), `ceiling.created` (L936) each require per-element geometry fields (`wallId`/`baseLine`/`height` etc.). Receiving only `wallCount` means these subscribers cannot mirror any element to a legacy store. The legacy stores receive nothing, no DOM events fire, no FragmentBuilders are triggered, and the 3D scene is never updated.

---

**Fix strategy:**

**Layer:** L3 (`packages/runtime-composer/src/CommandEventBridge.ts`) — this is the sole correct enrichment point per ADR-002 §2. No changes to handlers (L7) or initTools subscribers (L5).

**Step 1 — Wall batch (`wall.batch.create`, L104–119):**  
Re-type `p` as `{ walls?: Array<WallSpec>; levelId?: string }` where `WallSpec` is the validated record shape already placed into payload by `CreateWallBatch.ts`. For each element in `p.walls ?? []`, emit one `wall.created` event with the same fields as the single-create case (wallId, baseLine, height, thickness, baseOffset, systemTypeId, ifcGuid). The existing initTools L814 subscriber handles each event without modification.

**Step 2 — Slab batch (`slab.batch.create`, L183–192):**  
Same pattern. Re-type and iterate `p.slabs`. Emit one `slab.created` per slab with id, polygon, position, width, depth, thickness, baseOffset, materialId, ifcGuid. initTools L1119 subscriber handles each.

**Step 3 — Curtain wall batch (`curtain-wall.batch.create`, L217–225):**  
Re-type and iterate `p.curtainWalls`. Emit one `curtain-wall.created` per curtain wall with id, levelId, baseLine, height, and — critically — `gridXSpacing`, `gridYSpacing` (pulled from each element spec). Note: this batch fix is related to but separate from TASK-02 which fixes the single-create grid gap.

**Step 4 — Column batch (`column.batch.create`, L261–275):**  
Iterate `p.columns`. Emit one `column.created` per column with id, origin, shape, width, depth, height, baseOffset, rotation, materialId. initTools L1062 subscriber handles each.

**Step 5 — Beam batch (`beam.batch.create`, L303–313):**  
Iterate `p.beams`. Emit one `beam.created` per beam with id, startPoint, endPoint, shape, width, depth, materialId. initTools L1174 subscriber handles each.

**Step 6 — Ceiling batch (`ceiling.batch.create`, L379–405):**  
Iterate `p.ceilings`. Emit one `ceiling.created` per ceiling with id, boundary, ceilingHeight, thickness. initTools L936 subscriber handles each.

**Undo correctness:** The batch handlers use a single `produceCommand` draft write for all elements, producing one atomic Immer patch pair in the Ring Buffer. The per-element CEB events do not affect undo — the Ring Buffer records the batch patch atomically (all elements added → all elements removed on undo). The emit-per-element in the CEB is a side-effect notification only, not part of the undo chain. This is correct per C11 §5.2 and C20 §3.

**P3 compliance:** CEB emit calls are synchronous and lightweight (O(n) event emits). The actual geometry build happens in FragmentBuilders via `FrameScheduler.schedule('pre-render', buildFn)` per C11 §5.2. No synchronous heavy computation introduced.

---

**Files to change:**
- `packages/runtime-composer/src/CommandEventBridge.ts` — 6 batch cases (L104–119, L183–192, L217–225, L261–275, L303–313, L379–405)

**Files NOT to change (and why):**
- `apps/editor/src/engine/initTools.ts` — existing per-element subscribers (`wall.created`, `slab.created` etc.) are correct and unchanged; they naturally handle per-element events from both single and batch creates
- `plugins/wall/src/handlers/CreateWallBatch.ts` (and all other batch handlers) — handlers are architecturally correct; they produce proper Immer patches; the bug is entirely in the CEB enrichment layer
- `packages/command-registry/src/` — no changes; undo commands are correct
- `packages/geometry-wall/src/WallStore.ts` — must not be modified (BaselineReversalError guard must be preserved)

**Verification steps:**
1. `grep -n "wallCount\|slabCount\|elementCount\|beamCount\|columnCount\|ceilingCount" packages/runtime-composer/src/CommandEventBridge.ts` — should return 0 matches in the 6 batch cases after the fix (these are replaced by per-element iterators)
2. After fix, trigger an AI batch wall placement (the scenario confirmed broken in the audit) and confirm `bim-wall-added` fires N times (one per wall) in browser DevTools
3. `tsc --skipLibCheck --noEmit` must exit 0
4. `npm run check:commandmanager` — no new bridge calls introduced; threshold must not increase

**Acceptance criterion:**  
A batch create of N walls/slabs/beams/columns/curtain walls/ceilings produces N visible 3D meshes in the scene. All N elements appear in the plan view canvas after creation. The undo of the batch remove all N elements in a single Ctrl+Z.

**Build gate:**
- [ ] `tsc --skipLibCheck --noEmit` exits 0
- [ ] `npm run check:commandmanager` threshold not increased (stays at 56)
- [ ] No new `window.dispatchEvent` in `packages/`
- [ ] No new `(window as any)` in `packages/`

---

### TASK-02: Fix curtain wall single create — add grid config to CEB payload
**Bug:** BUG-1a (ASSUMED-D confirmed)  
**Severity:** 🔴 Critical  
**Contract compliance:** C11 §5.2; C14 §3 LP-05; ADR-002 §2

**Architectural pattern:** Path B — CEB enrichment of `curtainwall.create` case

---

**Root cause (verified):**

`CEB.ts` L193–215 (`curtainwall.create` case) casts `record.payload` to only `{ id, levelId, baseLine, height }`. `initTools.ts` L895 mirrors these 4 fields to `curtainWallStoreInstance.add()`. `CurtainWallStore.add()` receives no `gridXSpacing`/`gridYSpacing`/`gridSystem`. `CurtainWallBuilder.ts` calls `migrateToGridSystem()` → `numU = Math.floor(length / undefined)` → `NaN` → `computeCurtainCells()` returns `[]` and logs `"[CurtainCellComputer] Grid has fewer than 2 lines on an axis"`. Result: the curtain wall `THREE.Group` is created and added to the scene with no child meshes (no mullions, no panels).

---

**Fix strategy:**

**Layer:** L3 CEB (`curtainwall.create` case, L193–215) and L5 initTools (L895–934 subscriber).

**Step 1 — Expand CEB payload type:**  
In the `curtainwall.create` case, extend the `record.payload` cast to include `gridXSpacing?: number`, `gridYSpacing?: number`, `gridSystem?: unknown`, `mullionProfile?: unknown`, `panelMaterialId?: string`. These fields are present in the `CreateCurtainWallHandler` payload schema (the handler builds them from tool state before dispatching).

**Step 2 — Emit enriched `curtain-wall.created`:**  
Add `gridXSpacing`, `gridYSpacing`, `gridSystem`, `mullionProfile` to the emitted event. Apply sensible defaults inline (e.g., `gridXSpacing: p.gridXSpacing ?? 1.5`, `gridYSpacing: p.gridYSpacing ?? 2.4`) so that elements created without explicit grid config produce a visible default 1.5m × 2.4m grid rather than an empty mesh.

**Step 3 — Extend initTools L895 subscriber:**  
Pass `gridXSpacing`, `gridYSpacing`, `gridSystem`, `mullionProfile` through to `curtainWallStoreInstance.add()`. Map `ev.gridSystem` when present; fall back to `{ xSpacing: ev.gridXSpacing ?? 1.5, ySpacing: ev.gridYSpacing ?? 2.4 }` when absent. This matches how `curtainWallStore.add()` invokes `migrateToGridSystem()`.

**Step 4 — Verify `curtain-wall.batch.create` (already addressed in TASK-01):**  
When TASK-01 iterates batch elements, each element in `p.curtainWalls` must also include its grid spec. Confirm that `CreateCurtainWallBatch.ts` places `gridXSpacing` etc. in each element record (read and verify before implementing TASK-01 step 3).

---

**Files to change:**
- `packages/runtime-composer/src/CommandEventBridge.ts` — `curtainwall.create` case L193–215
- `apps/editor/src/engine/initTools.ts` — `curtain-wall.created` subscriber L895–934

**Files NOT to change (and why):**
- `packages/geometry-curtain-wall/src/CurtainWallStore.ts` — add() interface is correct; the fix is in what we pass to it, not how it processes the data
- `packages/geometry-curtain-wall/src/CurtainWallBuilder.ts` — `migrateToGridSystem()` fallback logic is correct; the bug is upstream in the payload, not the builder
- `plugins/curtain-wall/src/handlers/CreateCurtainWallHandler.ts` — handler is architecturally correct; do not modify handlers per ADR-002 §2

**Verification steps:**
1. `grep -n "gridXSpacing\|gridYSpacing\|gridSystem" apps/editor/src/engine/initTools.ts` — must return hits in the `curtain-wall.created` subscriber block after fix
2. Create a single curtain wall via the plan tool; confirm `THREE.Group` has `> 0` child meshes (mullions and panels visible) in browser DevTools → Three.js inspector
3. Create a curtain wall batch via AI command; confirm all curtain walls render with grid

**Acceptance criterion:**  
A curtain wall created via single or batch command produces a visible mesh with the configured or default grid (at minimum 1.5m × 2.4m modules) rendered as mullions and panels. The `[CurtainCellComputer] Grid has fewer than 2 lines` warning must not appear in the console.

**Build gate:**
- [ ] `tsc --skipLibCheck --noEmit` exits 0
- [ ] `npm run check:commandmanager` threshold not increased
- [ ] No new `window.dispatchEvent` in `packages/`

---

### TASK-03: Fix stair railing — add stairId validation and null guard
**Bug:** BUG-2  
**Severity:** 🟠 High  
**Contract compliance:** C11 §5.2 (validate domain invariants before store mutation); ADR-002 §2 (canExecute is the correct validation point)

**Architectural pattern:** Path C — Legacy CommandManager bridge via `CreateStairRailing.ts`

---

**Root cause (verified):**

`plugins/stair/src/handlers/CreateStairRailing.ts` L31–36: `canExecute()` returns `{ valid: true }` unconditionally — no check that `payload.stairId` is non-null or references an existing stair in `stairStore`.

`packages/geometry-stair/src/StairRailingBuilder.ts` L22–24: The `bim-stair-railing-added` listener destructures `{ railing }` from `detail`, then calls `this.resolveStair(railing.stairId)` at L23 without checking whether `railing.stairId` is `undefined`. `resolveStair(undefined)` returns `undefined` (map lookup by key `undefined`). L24 `if (stair)` silently skips `buildRailing()`. Result: a railing record is created in `stairRailingStore` but the 3D mesh is never built. The railing appears to succeed with no error.

---

**Fix strategy:**

**Layer:** Two files, two layers — L7 handler and L2 geometry builder.

**Step 1 — `CreateStairRailing.ts` `canExecute()` (L7 plugin handler):**  
Read `stairStore` from `ctx.stores.stairStore`. Check `payload.stairId` is a non-empty string AND `stairStore.get(payload.stairId)` returns a defined stair record. If either check fails, return `{ valid: false, reason: 'Stair ID missing or does not exist in stairStore' }`. This follows C11 §5.2's "validate domain invariants before store mutation" rule.

**Step 2 — `StairRailingBuilder.ts` null guard (L2 geometry package):**  
At the `bim-stair-railing-added` listener (L21–26), add an explicit guard: `if (!railing?.stairId) { console.error('[StairRailingBuilder] railing.stairId is undefined — skipping build. This indicates a handler bug (canExecute should have rejected this command).'); return; }`. This converts the silent failure into a loud, traceable error for any cases that bypass the handler's `canExecute` check (e.g., direct legacy commandManager calls).

**Step 3 — DO NOT add a null guard at L24 (`if (stair)`) — it already exists.** The existing guard is correct defensive programming. The fix is upstream (L7 validation + L23 early return), not at L24.

---

**Files to change:**
- `plugins/stair/src/handlers/CreateStairRailing.ts` — `canExecute()` method L31–36
- `packages/geometry-stair/src/StairRailingBuilder.ts` — `bim-stair-railing-added` listener L21–26

**Files NOT to change (and why):**
- `packages/command-registry/src/stair/CreateStairRailingCommand.ts` — legacy command is correctly executed after handler validation; do not add duplicate validation here
- `packages/geometry-stair/src/StairMeshBuilder.ts` — adjacent file; must not be modified; stair mesh builds correctly

**Verification steps:**
1. `grep -n "valid: true\|canExecute" plugins/stair/src/handlers/CreateStairRailing.ts` — must show the stairId check, not unconditional `valid: true`
2. Dispatch `stair.createRailing` with a missing `stairId` via DevTools; confirm `canExecute` returns `{ valid: false }` and no railing is created in `stairRailingStore`
3. Dispatch with a valid `stairId` referencing an existing stair; confirm 3D railing mesh appears

**Acceptance criterion:**  
Dispatching `stair.createRailing` with a missing or invalid `stairId` returns `{ valid: false }` from `canExecute` and no railing is created. Dispatching with a valid `stairId` produces a visible railing mesh. The `[StairRailingBuilder] railing.stairId is undefined` error MUST appear in console for any legacy path that bypasses `canExecute`.

**Build gate:**
- [ ] `tsc --skipLibCheck --noEmit` exits 0
- [ ] `npm run check:commandmanager` threshold not increased
- [ ] No new `window.dispatchEvent` in plugins/ or packages/

---

### TASK-04: Implement SetDoorSwing
**Bug:** BUG-3  
**Severity:** 🟠 High  
**Contract compliance:** C11 §5.2 (mutate stores via Immer draft); C15 §8.1 (dual-store rule — door changes MUST update both Immer store AND legacy wallStore); P6 (commands are the only mutation path); C14 §3 LP-01 (no direct window.xStore access in handlers)

**Architectural pattern:** Path A — Committer architecture (`door` Immer store → `CommitterHost` → `DoorCommitter.onUpdate` → THREE mesh rebuild)

---

**Root cause (verified):**

`plugins/door/src/handlers/SetDoorSwing.ts`: `execute()` at lines 61–69 returns `{ forward: [], inverse: [] }` with comments confirming it is a documented stub pending schema update. The `DoorData` type (from `packages/schemas/src/elements/Door.ts`) has no `swing` field. The `DoorSwing` union type (`'left-in' | 'left-out' | 'right-in' | 'right-out' | 'sliding'`) exists in the handler's payload type but the value is never written to any store or mesh parameter.

---

**Fix strategy:**

**Step 1 — Schema layer (L0 `packages/schemas/src/elements/Door.ts`):**  
Add `swing: z.enum(['left-in', 'left-out', 'right-in', 'right-out', 'sliding']).optional().default('left-in')` to the `DoorSchema` Zod object. Mark as `optional().default('left-in')` to preserve backward compatibility with all existing door records (which will read as `left-in` swing). This is an additive schema change with no breaking impact per L0 purity rules (P5 — no I/O, no THREE, no DOM in schemas).

**Step 2 — Handler (L7 `plugins/door/src/handlers/SetDoorSwing.ts`):**  
Replace the stub `execute()` with a `produceCommand` call: `produceCommand<DoorsState>(ctx.stores.door, draft => { const door = draft[payload.doorId]; if (!door) throw new DomainError('door.notFound', payload.doorId); door.swing = payload.swing; })`. Return the resulting `{ forward, inverse }` patches. `canExecute()` must validate that `payload.doorId` exists in `ctx.stores.door`.

**Step 3 — Dual-store compliance (C15 §8.1):**  
After the Immer patch, also update the legacy `wallStore` via `ctx.stores.wallStore.updateDoor(door.wallId, { swing: payload.swing })`. This is required by C15 §8.1: every door property mutation must update both the Immer door store (for frame geometry via DoorCommitter) and the legacy wallStore (for opening void geometry via WallFragmentBuilder). The wall geometry itself doesn't change on swing direction, but the dual-store invariant must be maintained to prevent future state divergence.

**Step 4 — DoorCommitter (L7 `plugins/door/src/committer/door-committer.ts`):**  
In `onUpdate`, ensure the `produceDoor(dto, placement)` call passes `dto.swing` through to the geometry producer. The door mesh must reflect the swing direction (hinge side and open angle). Read `plugins/door/src/committer/geometry-bridge.ts` and `buildDoorBufferGeometry()` before implementing to understand how swing maps to geometry. If `buildDoorBufferGeometry` doesn't yet accept `swing`, add the parameter.

**Step 5 — OTel span (P8):**  
The handler body must be wrapped in a `withHandlerSpan('door.setSwing.handler', { 'pryzm.command.type': 'door.setSwing' }, ...)` call, consistent with the existing door handler patterns (e.g., `UpdateElementMark.ts` L36).

---

**Files to change:**
- `packages/schemas/src/elements/Door.ts` — add `swing` field to `DoorSchema`
- `plugins/door/src/handlers/SetDoorSwing.ts` — implement `execute()` and update `canExecute()`
- `plugins/door/src/committer/door-committer.ts` — pass `swing` to `produceDoor()`
- `plugins/door/src/committer/geometry-bridge.ts` — add `swing` parameter to `buildDoorBufferGeometry()` (verify first)

**Files NOT to change (and why):**
- `packages/geometry-door/src/DoorStore.ts` — legacy door store; dual-store update goes through `wallStore.updateDoor()` per C15, not directly into legacy door store
- `packages/command-registry/src/doors/MoveDoorCommand.ts` — adjacent; correctly handles offset mutations; must not be modified
- `apps/editor/src/engine/initTools.ts` — door.created has no initTools subscriber; this is correct (Committer path); no change needed
- `packages/runtime-composer/src/CommandEventBridge.ts` — the existing minimal door.created case is dead noise (RISK-3); handled separately in TASK-13; do not modify as part of this task

**Verification steps:**
1. `grep -n "swing" packages/schemas/src/elements/Door.ts` — must return the new schema field after fix
2. `grep -n "forward: \[\]\|inverse: \[\]" plugins/door/src/handlers/SetDoorSwing.ts` — must return 0 matches (stub removed)
3. Open a door in the editor, change swing direction in the property panel; confirm the door 3D mesh orientation changes (hinge side flips)
4. Ctrl+Z after swing change; confirm door returns to previous swing direction
5. `tsc --skipLibCheck --noEmit` exits 0

**Acceptance criterion:**  
Changing door swing direction via the property panel updates the door mesh geometry immediately. Ctrl+Z restores the previous swing. The property panel correctly displays the current swing value. No TypeScript errors introduced.

**Build gate:**
- [ ] `tsc --skipLibCheck --noEmit` exits 0
- [ ] `npm run check:commandmanager` threshold not increased
- [ ] No new `(window as any)` in `packages/schemas/`
- [ ] No new `window.dispatchEvent` in `plugins/`

---

### TASK-05: Add curtainwall.batch.update command and handler
**Bug:** BUG-4  
**Severity:** 🟠 High  
**Contract compliance:** C11 §5.2; C14 §3 LP-02 (use `runtime.commandBus.dispatch`, not `window.commandManager`); P6; P3 (no synchronous heavy compute — mesh rebuilds go through FrameScheduler)

**Architectural pattern:** Path B — New bus command → batch handler → single Immer draft write for all panels → CEB enrichment → `curtain-wall.batch.updated` event → `CurtainWallBuilder` for single rebuild

---

**Root cause (verified):**

`packages/command-bus/src/commands.ts` `WallMutationCommands` has no `curtainwall.batch.update` entry. `plugins/curtain-wall/src/handlers/UpdateCurtainWall.ts` handles `wall.updateCurtainWall` by calling `window.commandManager.execute(new UpdateCurtainWallCommand(...))` once per panel. For a 50-panel curtain wall, this triggers 50 individual legacy command executions, each causing a full mesh rebuild. Performance target from the audit: ≤ 1 second for updating all panels' material.

---

**Fix strategy:**

**Step 1 — Command type (L1 `packages/command-bus/src/commands.ts`):**  
Add `'curtainwall.batch.update': { curtainWallId: string; updates: Array<{ panelId?: string; material?: string; color?: string; visibility?: boolean; mullionProfile?: unknown }> }` to `WallMutationCommands`. This is an additive change; no existing types are modified.

**Step 2 — Handler (L7 `plugins/curtain-wall/src/handlers/UpdateCurtainWallBatch.ts` — new file):**  
Create `UpdateCurtainWallBatchHandler` implementing `ICommandHandler<'curtainwall.batch.update'>`. `canExecute()`: validate `curtainWallId` exists in store. `execute()`: use `produceCommand<CurtainWallsState>(ctx.stores.curtainwall, draft => { const cw = draft[payload.curtainWallId]; if (!cw) throw ...; for (const update of payload.updates) { /* apply update to panel/global props */ } })`. One `produceCommand` call for all updates → single Immer patch → single Ring Buffer entry. Wrap body in `withHandlerSpan('curtainwall.batchUpdate.handler', ...)`.

**Step 3 — CEB enrichment (L3 `packages/runtime-composer/src/CommandEventBridge.ts`):**  
Add `case 'curtainwall.batch.update'` to emit a `curtain-wall.batch.updated` event with `{ curtainWallId, updateCount: payload.updates.length }`. The `CurtainWallBuilder` listens for `bim-curtain-wall-updated` from the store; emitting the typed event also allows any future analytics/AI subscribers.

**Step 4 — Register handler (L5 `apps/editor/src/engine/engineLauncher.ts`):**  
In `registerCurtainWallHandlers(_bus)`, add `_bus.registerHandler(new UpdateCurtainWallBatchHandler())`. This is inside the existing `try/catch` block at L367–368.

**Step 5 — Deprecate per-panel bridge path (optional, non-blocking):**  
`UpdateCurtainWall.ts` (the per-panel bridge) can remain for backward compatibility with existing dispatchers. Add a `console.warn('[UpdateCurtainWall] Consider using curtainwall.batch.update for multi-panel operations')` in its execute() when the update count would exceed 1. Do not remove the single-panel path — it is still needed for user-driven single-panel edits from the property inspector.

---

**Files to change:**
- `packages/command-bus/src/commands.ts` — add `curtainwall.batch.update` to `WallMutationCommands`
- `plugins/curtain-wall/src/handlers/UpdateCurtainWallBatch.ts` — new file
- `plugins/curtain-wall/src/handlers/index.ts` — export new handler
- `plugins/curtain-wall/src/registerHandlers.ts` (or equivalent) — register in `registerCurtainWallHandlers`
- `packages/runtime-composer/src/CommandEventBridge.ts` — add `curtainwall.batch.update` case
- `apps/editor/src/engine/engineLauncher.ts` — confirm `registerCurtainWallHandlers` is called (already at L367; verify new handler is auto-registered)

**Files NOT to change (and why):**
- `plugins/curtain-wall/src/handlers/UpdateCurtainWall.ts` — per-panel bridge preserved for backward compatibility; single-panel edits must remain functional
- `packages/geometry-curtain-wall/src/CurtainWallBuilder.ts` — builder is correct; it rebuilds from store state; the fix is reducing how many times the store triggers a rebuild, not changing the builder

**Verification steps:**
1. `grep -n "curtainwall.batch.update" packages/command-bus/src/commands.ts` — must return the new type definition
2. Time a batch material update on a 50-panel curtain wall before and after fix; target: < 1 second
3. Confirm `bim-curtain-wall-updated` fires exactly once after a batch update (not 50 times)
4. `npm run check:commandmanager` — new handler uses `produceCommand`, not `window.commandManager`

**Acceptance criterion:**  
Updating material/color on all panels of a 50-panel curtain wall via `curtainwall.batch.update` completes in ≤ 1 second and produces a single store update + single mesh rebuild. The undo of a batch update reverts all panel changes in a single Ctrl+Z.

**Build gate:**
- [ ] `tsc --skipLibCheck --noEmit` exits 0
- [ ] `npm run check:commandmanager` threshold not increased
- [ ] New handler uses `produceCommand`, not `window.commandManager`
- [ ] New handler has ≥ 1 OTel span (P8)

---

### TASK-06: Fix roof baseOffset — use payload value, not hardcoded 2.7
**Bug:** BUG-6  
**Severity:** 🟡 Medium  
**Contract compliance:** C11 §5.2 (handler payload fields must be honoured); C14 §3 (no silent data loss in bridge)

**Architectural pattern:** Path B — CEB `roof.created` → initTools L1009 subscriber — one-line fix

---

**Root cause (verified):**

`apps/editor/src/engine/initTools.ts` line 1035: `baseOffset: 2.7` is a hardcoded literal. Line 1037: `autoBaseOffset: true` is also hardcoded. `CEB.ts` L503–525 emits `roof.created` with the user-specified `boundary`, `shape`, `overhang`, `thickness` but does NOT currently emit `baseOffset` from `record.payload`. Consequently, even if the CEB were fixed to pass `ev.baseOffset`, the initTools subscriber would need to use it. Both files must be checked.

**Pre-fix verification required:**  
Before changing initTools L1035, read `CEB.ts` L503–525 to confirm whether `record.payload` includes a `baseOffset` field in the `roof.create` payload. If `payload.baseOffset` exists: (a) add it to the CEB emission, (b) change initTools L1035 to `ev.baseOffset ?? 2.7`. If `payload.baseOffset` does NOT exist in the roof handler's payload schema, the fix is: (a) add `baseOffset` to `CreateRoofHandler`'s payload schema first, then (b) emit from CEB, then (c) consume in initTools.

---

**Fix strategy:**

**Step 1 — Verify CEB `roof.create` payload (L503–525):**  
Confirm whether `CreateRoofHandler` passes `baseOffset` in its bus payload. If yes, extend the CEB type cast to include it and emit `baseOffset: p.baseOffset` in the `roof.created` event.

**Step 2 — Fix initTools L1035:**  
Change `baseOffset: 2.7` to `baseOffset: ev.baseOffset ?? 2.7`. Change `autoBaseOffset: true` to `autoBaseOffset: ev.baseOffset === undefined` (i.e., auto-offset only when the caller did not specify an explicit value).

**Step 3 — No handler changes required** unless the roof handler does not currently include `baseOffset` in its payload (verify first per Step 1).

---

**Files to change:**
- `apps/editor/src/engine/initTools.ts` — L1035–1037 (baseOffset and autoBaseOffset)
- `packages/runtime-composer/src/CommandEventBridge.ts` — `roof.create` case L503–525 (if baseOffset is in payload but not yet emitted)
- `plugins/roof/src/handlers/CreateRoof.ts` — ONLY IF baseOffset is not yet in the payload schema (verify first)

**Files NOT to change (and why):**
- `packages/geometry-roof/src/RoofStore.ts` — store correctly handles `baseOffset` when provided; the bug is upstream
- `packages/command-registry/src/roofs/CreateRoofCommand.ts` — legacy undo is correct; no change needed

**Verification steps:**
1. `grep -n "baseOffset" packages/runtime-composer/src/CommandEventBridge.ts` — find the `roof.create` case; confirm `baseOffset` is emitted after fix
2. `grep -n "2\.7\|hardcoded\|autoBaseOffset" apps/editor/src/engine/initTools.ts` — the hardcoded `2.7` at L1035 must be replaced with `ev.baseOffset ?? 2.7`
3. Create a roof via the plan tool with explicit `baseOffset: 4.0`; confirm the roof renders at height 4.0m, not 2.7m

**Acceptance criterion:**  
A roof created with an explicit `baseOffset` parameter renders at the correct height. The default of 2.7m is preserved when no `baseOffset` is specified in the payload.

**Build gate:**
- [ ] `tsc --skipLibCheck --noEmit` exits 0
- [ ] `npm run check:commandmanager` threshold not increased

---

### TASK-07: Resolve dual undo stack — bridge handlers must produce real Immer patches
**Bug:** BUG-7  
**Severity:** 🟡 Medium  
**Contract compliance:** C20 §3 (single undo stack — Ring Buffer is authoritative; legacy commandManager undo MUST NOT be the user-facing undo path); C14 §3 LP-04 (use `produceWithPatches`, not manual snapshots)

**Architectural pattern:** Refactor bridge handlers from Path C (window.commandManager bridge) to Path B (Immer store mutation with `produceCommand`)

---

**Root cause (verified):**

The undo button (`SaveUndoRedoHUD.ts`) invokes `runtime.undoStack.undo()` → `RingBufferUndoStack.ts` → `applyPatches(record.inverse.ops)` on live Immer stores. The Ring Buffer only contains patches recorded by the `CommandBus` (L298–313 of `CommandBus.ts`).

Bridge handlers (`UpdateSlab.ts`, `UpdateSlabPolygon.ts`, `CreateSlabsOnAllFloors.ts`, `UpdateCurtainWall.ts`, `CreateWallsOnAllSlabs.ts` and others) call `window.commandManager.execute(new XxxCommand(...))` and return `{ forward: [], inverse: [] }`. `CommandBus.ts` L307–313 pushes `{ forward: { ops: [] }, inverse: { ops: [] } }` to the Ring Buffer. When the user presses Ctrl+Z, `applyPatches([])` is called → no-op. The state is not reverted. The legacy `CommandManagerImpl` history array DOES contain the undo entry, but `runtime.undoStack.undo()` does not invoke it.

This is the "dual undo stack" problem. The correct resolution per C20 §3 is that the Ring Buffer is the single authoritative undo stack. Bridge handlers must therefore produce real Immer patches.

---

**Fix strategy:**

**This is the highest-complexity task. Execute it as a two-phase approach:**

**Phase A (immediate, unblocks user-facing undo):** For the highest-impact bridge handlers, replace the bridge pattern with `produceCommand`:

1. **`plugins/slab/src/handlers/UpdateSlab.ts`:** Replace `window.commandManager.execute(new UpdateSlabCommand(...))` with `produceCommand<SlabsState>(ctx.stores.slab, draft => { const slab = draft[payload.slabId]; if (!slab) throw ...; /* apply payload updates */ })`. Return the resulting `{ forward, inverse }` patches. The Ring Buffer now records a real inverse patch.

2. **`plugins/slab/src/handlers/UpdateSlabPolygon.ts`:** Same pattern — replace bridge with `produceCommand` on `ctx.stores.slab`.

3. **`plugins/curtain-wall/src/handlers/UpdateCurtainWall.ts`:** Replace bridge with `produceCommand<CurtainWallsState>`. For panel-level updates, apply the change to the curtain wall's panel array in the Immer draft.

4. **`plugins/wall/src/handlers/CreateWallsOnAllSlabs.ts`:** This is a BATCH create, not an update. The batch pattern should use `produceCommand` like `CreateWallBatch.ts`. Replace the loop-with-bridge pattern with a single `produceCommand` that writes all walls in one draft.

5. **`plugins/slab/src/handlers/CreateSlabsOnAllFloors.ts`:** Same batch pattern fix.

**Phase B (systematic, completes the migration):** Apply the same refactoring to remaining bridge handlers identified in the audit. Each bridge handler is a P6 violation in addition to a BUG-7 cause. Systematic migration follows the existing Phase 0–5 migration pattern from `PRYZM3-MASTER-STATUS.md`.

**Architectural guard for Phase A:** After refactoring each bridge handler, the legacy `XxxCommand` class in `packages/command-registry/src/` becomes orphaned (no longer called from the handler). Do NOT delete these commands immediately — they may be called from other legacy paths. Mark them with `// TODO(E.5.x): ORPHANED — called by bridge handler now migrated to produceCommand. Remove in Phase E.5.x cleanup.`

**Dual-store compliance for UpdateSlab (C14 §3 LP-01):** `SlabData` is stored only in the Immer slab store; there is no separate legacy slabStore that requires dual-write. `SlabFragmentBuilder` subscribes via `bim-slab-updated` which fires from `slabStore.update()`. After the Immer produceCommand, ensure `slabStore.triggerUpdate(payload.slabId)` is called (or that the Immer dirty diff mechanism fires `bim-slab-updated` automatically via `subscribeDirty`). Verify before implementing.

---

**Files to change (Phase A):**
- `plugins/slab/src/handlers/UpdateSlab.ts`
- `plugins/slab/src/handlers/UpdateSlabPolygon.ts`
- `plugins/curtain-wall/src/handlers/UpdateCurtainWall.ts`
- `plugins/wall/src/handlers/CreateWallsOnAllSlabs.ts`
- `plugins/slab/src/handlers/CreateSlabsOnAllFloors.ts`

**Files NOT to change (and why):**
- `packages/command-registry/src/slabs/UpdateSlabPolygonCommand.ts` — orphaned after Phase A; mark with TODO comment but do not delete
- `packages/command-registry/src/slabs/UpdateSlabCommand.ts` — same
- `packages/runtime-undo-stack/src/RingBufferUndoStack.ts` — correct implementation; the bug is not in the Ring Buffer
- `packages/command-bus/src/CommandBus.ts` L298–313 — Ring Buffer push logic is correct; do not modify

**Verification steps:**
1. After Phase A, `grep -n "window\.commandManager\|window\.cm\|_cmExec" plugins/slab/src/handlers/UpdateSlab.ts plugins/slab/src/handlers/UpdateSlabPolygon.ts plugins/curtain-wall/src/handlers/UpdateCurtainWall.ts` — must return 0 matches
2. Perform a slab polygon edit; press Ctrl+Z; confirm the slab polygon reverts in both the 3D view and plan view
3. `npm run check:commandmanager` — must decrease (bridge calls removed); threshold must not increase
4. `tsc --skipLibCheck --noEmit` exits 0

**Acceptance criterion:**  
Pressing Ctrl+Z after a slab update, slab polygon update, or curtain wall panel update reverts the change visually in all views. The `RingBufferUndoStack` receives non-empty inverse patches for these operations. The `check:commandmanager` count decreases by at least 5 (one per Phase A handler migrated).

**Build gate:**
- [ ] `tsc --skipLibCheck --noEmit` exits 0
- [ ] `npm run check:commandmanager` threshold DECREASES (never increases)
- [ ] No new `window.dispatchEvent` in `plugins/`
- [ ] Refactored handlers have ≥ 1 OTel span (P8)

---

### TASK-08: Implement copy/paste or surface "not available" feedback
**Bug:** BUG-8  
**Severity:** 🟡 Medium  
**Contract compliance:** P6 (copy/paste must be a command); C11 §5.2 (all mutations via command bus)

**Architectural pattern:** New Path B — `copy-selection` reads current selection state (read-only); `paste-clipboard` writes via `produceCommand`

---

**Root cause (verified):**

`packages/command-bus/src/commands.ts` L40–41 defines `copy-selection: EmptyPayload` and `paste-clipboard: EmptyPayload`. `apps/editor/src/ui/toolbar/MainToolbar.ts` L50–51 renders both buttons. No handler is registered in any `registerXxxHandlers()` call, `initBusHandlers.ts`, or any plugin. The bus dispatches the command and finds no handler → the call resolves silently with no result (or with an "unhandled command" warning, depending on CommandBus implementation — verify).

---

**Fix strategy:**

**Option A — Minimal (surface "not available" feedback):**  
Create a `CopySelectionHandler` and `PasteClipboardHandler` in a new plugin (e.g., `plugins/clipboard/src/handlers/`) or in `plugins/selection/src/handlers/`. Both handlers implement `canExecute()` returning `{ valid: false, reason: 'Copy/paste not yet implemented — coming soon' }`. Register them. The command bus will return the rejection to the toolbar, which can display a toast. This unblocks the "silent no-op" user confusion with minimal risk.

**Option B — Full implementation (if resourcing permits):**  
`CopySelectionHandler.execute()`: reads current selection IDs from `SelectionManager`, serializes selected element data from their respective stores into a clipboard JSON structure stored in a module-level `clipboardStore`. Returns `{ forward: [], inverse: [] }` (copy is read-only, not undoable per C20 §3). `PasteClipboardHandler.execute()`: reads clipboard data, generates new element IDs, dispatches individual `wall.create`/`slab.create`/etc. commands via `ctx.bus.execute()` for each copied element at offset position. The individual creation commands populate the Ring Buffer. Paste undo = undo each individual creation.

**Recommendation:** Implement Option A first (1 day effort). Track Option B as a separate roadmap task post Phase F Gate.

---

**Files to change:**
- `plugins/selection/src/handlers/CopySelectionHandler.ts` — new file
- `plugins/selection/src/handlers/PasteClipboardHandler.ts` — new file
- `plugins/selection/src/handlers/index.ts` — export new handlers
- `plugins/selection/src/registerHandlers.ts` — register in `registerSelectionHandlers` (or create this function)
- `apps/editor/src/engine/engineLauncher.ts` — ensure `registerSelectionHandlers(_bus)` is called

**Files NOT to change (and why):**
- `packages/command-bus/src/commands.ts` — command type definitions are correct; payload types may need updating to add clipboard data, but EmptyPayload is acceptable for Option A
- `apps/editor/src/ui/toolbar/MainToolbar.ts` — toolbar is correct; the UI dispatches the command; the fix is the missing handler

**Verification steps:**
1. Click Copy button in toolbar; confirm a user-visible toast appears with "Copy/paste not yet available" (Option A) OR the selected elements are highlighted as copied (Option B)
2. `grep -n "copy-selection\|paste-clipboard" apps/editor/src/engine/engineLauncher.ts` — must show handler registration call

**Acceptance criterion:**  
Clicking Copy or Paste in the toolbar produces a visible user response (either a toast or actual copy behaviour). The action no longer silently fails.

**Build gate:**
- [ ] `tsc --skipLibCheck --noEmit` exits 0
- [ ] `npm run check:commandmanager` threshold not increased
- [ ] New handlers have OTel spans (P8)

---

### TASK-09: Guard SheetEditorCommands.ts with __pryzmInitComplete sentinel
**Bug:** RISK-1  
**Severity:** 🟢 Low  
**Contract compliance:** C14 §3 (no unguarded `window.*` access in post-init code); P4 (minimize `(window as any)`)

**Architectural pattern:** Sentinel guard at method entry point — not a structural change

---

**Root cause (verified):**

`apps/editor/src/ui/SheetEditor/SheetEditorCommands.ts` lines 33, 52, 60, 149, 194, 258, 287, 330, 347, 432, 487 — 11 occurrences of `const mgr = window.commandManager;` with `// TODO(E.5.x): replace with runtime.bus.executeCommand` comments. All are in public methods of `SheetEditorCommands`. If the sheet editor component mounts (or user activates it) before `__pryzmInitComplete` is set (which happens at the end of `initTools.ts` L~1580), `window.commandManager` is `undefined` and any `mgr.execute(...)` call throws `TypeError: Cannot read properties of undefined`.

---

**Fix strategy:**

At the top of each public method in `SheetEditorCommands.ts` that accesses `window.commandManager`, add a guard:

```
if (!(window as any).__pryzmInitComplete) {
  console.error('[SheetEditorCommands] Engine not yet initialised — command ignored:', methodName);
  return;
}
```

This follows the exact same guard pattern used in `PlanViewToolOverlay.ts` L402–410 and `SvpPlanToolOverlay.ts` L402–410. The methods are already void-returning, so early return is clean.

**Do NOT migrate these methods to `runtime.bus.executeCommand` in this task** — that is the E.5.x phase task already tracked. This task adds only the init guard as a safety net.

---

**Files to change:**
- `apps/editor/src/ui/SheetEditor/SheetEditorCommands.ts` — add sentinel guard at entry of each of the 11 methods that access `window.commandManager`

**Files NOT to change (and why):**
- `apps/editor/src/engine/initTools.ts` — `__pryzmInitComplete` sentinel is already set correctly at L~1580; do not modify
- `apps/editor/src/engine/views/PlanViewToolOverlay.ts` — reference implementation for the guard pattern; do not modify

**Verification steps:**
1. `grep -n "__pryzmInitComplete" apps/editor/src/ui/SheetEditor/SheetEditorCommands.ts` — must return ≥ 11 matches after fix
2. In DevTools, call a `SheetEditorCommands` method before engine init; confirm the guard fires `console.error` instead of TypeError

**Acceptance criterion:**  
All 11 `window.commandManager` accesses in `SheetEditorCommands.ts` are guarded by `__pryzmInitComplete`. No TypeError occurs when sheet editor activates before engine init.

**Build gate:**
- [ ] `tsc --skipLibCheck --noEmit` exits 0
- [ ] `npm run check:commandmanager` threshold not increased

---

### TASK-10: Sentinel-guard triage for 137 unguarded window.* accesses
**Bug:** RISK-2  
**Severity:** 🟢 Low  
**Contract compliance:** C14 §3 LP-01 (no `window.xStore` access); P4 (reduce `(window as any)`)

**Architectural pattern:** Guard-at-entry-point pattern (same as TASK-09); systematic triage, not wholesale refactoring

---

**Root cause (verified):**

137 occurrences of unguarded `window.commandManager`, `window.wallStore`, `window.commandContext` in 54 files in `apps/`. Listed in audit SWEEP-6 and in the RISK-2 grep output (54 files confirmed).

---

**Fix strategy:**

This task is intentionally scoped as **triage + guard**, not full migration (full migration is E.5.x phase):

**Priority tier (execute in order):**

**Tier 1 — High crash risk (no optional chaining, called synchronously at component mount):**
Files: `apps/editor/src/ui/layout/ToolsAreaLayout.ts` (L138, 178), `plugins/rooms/src/handlers/RenameRoom.ts` (L37). Add `__pryzmInitComplete` sentinel guard or optional chaining + console.error.

**Tier 2 — Medium risk (called from user gesture handlers where engine may not be ready):**
Files: `apps/editor/src/engine/views/plantools/MovePlanToolHandler.ts` (L346, 363), all other plan tool handlers. These are already partially protected by PlanViewToolOverlay/SvpPlanToolOverlay sentinel guards (which prevent tool activation before init). Add `if (!window.__pryzmInitComplete) return;` at the method level as defense-in-depth.

**Tier 3 — Low risk (optional chaining already present, or read-only access):**
Files: `apps/editor/src/ui/PropertyInspector.ts`, `apps/editor/src/ui/ViewBrowser/panels/unified-browser/BrowserDataHelpers.ts`. These use optional chaining (`window.wallStore?.get(...)`) which safely returns `undefined`. No crash risk. Add `console.warn` in the undefined branch for observability.

**Do NOT add guards in `initTools.ts`, `initBuilders.ts`, `initBusHandlers.ts`, `initScene.ts`** — these files run during engine init; `window.*` assignments happen within these files before the sentinel is set; adding a sentinel guard here would break init itself.

---

**Files to change:**
- `apps/editor/src/ui/layout/ToolsAreaLayout.ts` — L138, 178
- `plugins/rooms/src/handlers/RenameRoom.ts` — L37
- `apps/editor/src/engine/views/plantools/MovePlanToolHandler.ts` — L346, 363
- (Tier 3 files — optional chaining already safe — add console.warn only)

**Files NOT to change (and why):**
- `apps/editor/src/engine/initTools.ts`, `initBuilders.ts`, `initBusHandlers.ts`, `initScene.ts` — init files; `window.*` assignments happen here; sentinel guards would cause circular dependency

**Verification steps:**
1. After fix: `grep -rn "window\.commandManager" apps/editor/src/ui/layout/ToolsAreaLayout.ts plugins/rooms/src/handlers/RenameRoom.ts` — all occurrences must have `__pryzmInitComplete` guard above them
2. `npm run check:commandmanager` — not expected to change (these are not commandManager.execute calls, but window.commandManager assignments)

**Acceptance criterion:**  
All Tier-1 and Tier-2 files have sentinel guards. No TypeError occurs when a user interaction triggers a window.* access before engine init.

**Build gate:**
- [ ] `tsc --skipLibCheck --noEmit` exits 0

---

### TASK-11: Add missing undo() implementations to 9 annotation commands
**Bug:** BUG-9 (ASSUMED-C confirmed)  
**Severity:** 🟡 Medium  
**Contract compliance:** C20 §3 (every mutating command must produce correct inverse patches); C14 §3 LP-04 (use `produceWithPatches` for undo, not manual snapshots)

**Architectural pattern:** Pattern: snapshot-before → mutate → restore-snapshot-in-undo (same as `UpdateAnnotationCommand` if it has an undo — verify first; otherwise use `CreateAnnotationCommand.undo()` pattern from the nearest working example)

---

**Root cause (verified):**

`packages/command-registry/src/annotations/` contains 9 command files with no `undo()` method. The `CommandManagerImpl.ts` `undo()` at L339 calls `entry.command.undo(this.context)`. If `undo()` is missing from a class, TypeScript would catch it only if the base `Command` interface declares `undo()` as required. Verify the base interface before implementing — if it's optional, missing `undo()` silently returns undefined at call time.

---

**Fix strategy:**

For each of the 9 annotation commands:

1. **Read-only commands** (`AnnotateViewCommand`, if it only reads state): `undo()` returns `{ success: true, info: ['Annotation view is read-only; no state to undo'] }`.

2. **Create commands** (`CreateAnnotationCommand`, `CreateCalloutDetailCommand`, `CreateElevationMarkCommand`, `CreateSectionMarkCommand`): Capture created element ID in `execute()`; `undo()` calls `annotationStore.remove(this.createdId)`.

3. **Delete commands** (`DeleteAnnotationCommand`): Capture snapshot in `execute()` via `structuredClone(annotation)`; `undo()` calls `annotationStore.add(this.snapshot)`.

4. **Update commands** (`UpdateAnnotationCommand`, `UpdateConstraintCommand`): Capture `prevSnapshot = structuredClone(annotationStore.get(id))` before mutation in `execute()`; `undo()` calls `annotationStore.update(id, this.prevSnapshot)`.

5. **Lock commands** (`LockAnnotationCommand`): Capture previous `locked` state; `undo()` restores it.

Each implementation must use `structuredClone` for snapshot capture (C14 §3 LP-04 says prefer `produceWithPatches`, but for legacy commandRegistry commands `structuredClone` is the established pattern — see `UpdateSlabPolygonCommand` as reference). Add `const snapshot` field to each command class.

---

**Files to change:**
- `packages/command-registry/src/annotations/AnnotateViewCommand.ts`
- `packages/command-registry/src/annotations/CreateAnnotationCommand.ts`
- `packages/command-registry/src/annotations/CreateCalloutDetailCommand.ts`
- `packages/command-registry/src/annotations/CreateElevationMarkCommand.ts`
- `packages/command-registry/src/annotations/CreateSectionMarkCommand.ts`
- `packages/command-registry/src/annotations/DeleteAnnotationCommand.ts`
- `packages/command-registry/src/annotations/LockAnnotationCommand.ts`
- `packages/command-registry/src/annotations/UpdateAnnotationCommand.ts`
- `packages/command-registry/src/annotations/UpdateConstraintCommand.ts`

**Files NOT to change (and why):**
- `packages/command-registry/src/CommandManagerImpl.ts` — undo dispatch logic is correct
- `plugins/annotations/src/` — plugin handlers correctly delegate to registry commands; do not add undo logic there

**Verification steps:**
1. `grep -rn "undo()" packages/command-registry/src/annotations/` — must return ≥ 9 matches (one per file) after fix
2. Place an annotation, press Ctrl+Z; confirm annotation is removed from plan view canvas
3. `tsc --skipLibCheck --noEmit` exits 0

**Acceptance criterion:**  
All 9 annotation commands have a working `undo()` implementation. Ctrl+Z after placing/editing/deleting any annotation reverts the change. No TypeScript errors introduced.

**Build gate:**
- [ ] `tsc --skipLibCheck --noEmit` exits 0
- [ ] `npm run check:commandmanager` threshold not increased

---

### TASK-12: Implement slab/ceiling/floor.updateLayers handlers
**Bug:** ASSUMED-E confirmed (unhandled command types with active UI dispatch)  
**Severity:** 🟡 Medium  
**Contract compliance:** C11 §5.2; C14 §3 LP-02 (use commandBus, not window.commandManager); P6

**Architectural pattern:** Path B — New handler → `produceCommand` on element Immer store → CEB enrichment → `bim-slab-updated` / `bim-ceiling-updated` / `bim-floor-updated` DOM event → FragmentBuilder rebuild

---

**Root cause (verified):**

`apps/editor/src/ui/property-panel/PropertyPanelTypeSelector.ts` dispatches `slab.updateLayers` (L72), `ceiling.updateLayers` (L88), `floor.updateLayers` (L104). These command types are defined in `packages/command-bus/src/commands.ts` L650, L678, but no handler is registered in any `registerSlabHandlers()`, `registerCeilingHandlers()`, or `registerFloorHandlers()` call. The commands are dispatched, find no handler, and resolve silently. Layer/system-type changes in the property panel have no effect.

---

**Fix strategy:**

**For each element type (slab, ceiling, floor) — same pattern:**

1. Create `UpdateXxxLayersHandler` in `plugins/xxx/src/handlers/UpdateXxxLayers.ts`.
2. `canExecute()`: validate element exists in store.
3. `execute()`: `produceCommand<XxxsState>(ctx.stores.xxx, draft => { const element = draft[payload.xxxId]; if (!element) throw ...; if (payload.systemTypeId) element.systemTypeId = payload.systemTypeId; if (payload.layers) element.layers = payload.layers; if (payload.thickness) element.thickness = payload.thickness; })`. Return resulting patches.
4. Add `case 'slab.updateLayers'` to CEB (emit `slab.layer-updated` event with xxxId + layerCount).
5. Register in `registerXxxHandlers(_bus)`.
6. Wrap in OTel span (P8).

---

**Files to change (one set per element type × 3):**
- `plugins/slab/src/handlers/UpdateSlabLayers.ts` — new file
- `plugins/slab/src/handlers/index.ts` — export
- `plugins/slab/src/registerHandlers.ts` — register
- `plugins/ceiling/src/handlers/UpdateCeilingLayers.ts` — new file
- `plugins/ceiling/src/handlers/index.ts` — export
- `plugins/ceiling/src/registerHandlers.ts` — register
- `plugins/floor/src/handlers/UpdateFloorLayers.ts` — new file
- `plugins/floor/src/handlers/index.ts` — export
- `plugins/floor/src/registerHandlers.ts` — register
- `packages/runtime-composer/src/CommandEventBridge.ts` — add 3 new CEB cases for `slab.updateLayers`, `ceiling.updateLayers`, `floor.updateLayers`

**Files NOT to change (and why):**
- `apps/editor/src/ui/property-panel/PropertyPanelTypeSelector.ts` — dispatcher is correct
- `packages/command-bus/src/commands.ts` — command type definitions are already correct (L650, L678)

**Verification steps:**
1. Open a slab's property panel; change the system type; confirm the slab rebuilds with the new layer configuration
2. `npm run check:commandmanager` — new handlers use `produceCommand`, not `window.commandManager`; threshold must not increase

**Acceptance criterion:**  
Changing slab/ceiling/floor system type in the property panel triggers a visible mesh rebuild reflecting the new layer configuration. Ctrl+Z reverts the change.

**Build gate:**
- [ ] `tsc --skipLibCheck --noEmit` exits 0
- [ ] `npm run check:commandmanager` threshold not increased
- [ ] New handlers have OTel spans

---

### TASK-13: Remove dead CEB emissions for door/window/stair
**Bug:** RISK-3  
**Severity:** 🟢 Low  
**Contract compliance:** C11 §5.2 (events should carry semantic meaning — dead events are noise)

---

**Root cause (verified):**

`CommandEventBridge.ts` L313–370 emits `door.created` (L314), `window.created` (L336), `stair.created` (L358) with minimal payloads (`{ commandId, commandType, levelId }`). No initTools subscriber exists for any of these. Door and window use the Committer architecture (Path A, bypassing initTools entirely). Stair uses Path C (legacy commandManager bridge). These CEB cases process on every door/window/stair create but produce no downstream effect.

**Pre-removal check:** Before removing, confirm that NO other file (outside initTools) subscribes to `door.created`, `window.created`, or `stair.created` on `runtime.events`. Run:
```
grep -rn "door.created\|window.created\|stair.created" --include="*.ts" apps/ packages/ plugins/
```
If any subscriber exists (e.g., AI context tracking, analytics, collaboration sync), do NOT remove the cases — instead document them. If no subscribers, remove.

---

**Fix strategy:**

If no non-initTools subscribers found: Remove `case 'door.created'` (L313–324), `case 'window.created'` (L336–346), and `case 'stair.created'` (L358–368) from the CEB switch. Add a comment: `// door/window use Committer path (Path A) — no CEB bridge needed. stair uses Path C (legacy bridge) — no CEB bridge needed.`

If subscribers found: add a code comment explaining why the minimal payload is intentional.

---

**Files to change:**
- `packages/runtime-composer/src/CommandEventBridge.ts` — remove or annotate L313–370

**Verification steps:**
1. `grep -rn "door\.created\|window\.created\|stair\.created" --include="*.ts" apps/ packages/ plugins/` — must return 0 hits outside CEB after removal (or document any surviving subscribers)
2. Create a door; confirm 3D mesh still renders (Committer path unaffected by CEB removal)

**Acceptance criterion:**  
Dead CEB cases are removed. Door, window, and stair creation 3D rendering is unaffected. No new subscribers lost.

**Build gate:**
- [ ] `tsc --skipLibCheck --noEmit` exits 0

---

### TASK-14: Replace silent bridge fallback with loud error in initBusHandlers
**Bug:** RISK-4  
**Severity:** 🟢 Low  
**Contract compliance:** C14 §3 (no silent failure modes in migration patterns)

---

**Root cause (verified):**

`apps/editor/src/engine/initBusHandlers.ts` line ~502: `if (cm) cm.execute(...)` — the `else` branch is absent, making a falsy `cm` a silent no-op. If `window.commandManager` is somehow null/undefined at bridge call time (e.g., a race condition or a hot-reload scenario), the command is silently dropped.

---

**Fix strategy:**

Change `if (cm) cm.execute(...)` to:
```
if (cm) {
  cm.execute(...);
} else {
  console.error('[initBusHandlers] Bridge fallback: commandManager is null — command dropped:', commandType, payload);
}
```

Apply this pattern to ALL occurrences of the pattern in `initBusHandlers.ts`. This converts a silent failure into a loud, observable one.

---

**Files to change:**
- `apps/editor/src/engine/initBusHandlers.ts` — all `if (cm) cm.execute(...)` patterns

**Verification steps:**
1. `grep -n "if (cm)" apps/editor/src/engine/initBusHandlers.ts` — each must have an `else { console.error(...) }` branch after fix

**Acceptance criterion:**  
Any bridge fallback failure produces a `console.error` with the dropped command type and payload. Silent drop eliminated.

**Build gate:**
- [ ] `tsc --skipLibCheck --noEmit` exits 0

---

## 4. Execution Order & Dependency Graph

```
PHASE 1 — CRITICAL (must be done first; unblocks all batch usage and curtain wall)
┌─────────────────────────────────────────────────────────────────┐
│  TASK-01 (BUG-1: batch CEB payloads)                            │
│  TASK-02 (BUG-1a: curtain wall grid config)                     │
│                                                                 │
│  TASK-01 and TASK-02 CAN run in parallel — different sections   │
│  of CEB. TASK-02 initTools change is independent of TASK-01.   │
└─────────────────────────────────────────────────────────────────┘
           │
           ▼
PHASE 2 — HIGH SEVERITY (unblocks critical user-facing features)
┌─────────────────────────────────────────────────────────────────┐
│  TASK-03 (BUG-2: stair railing validation)     ← independent   │
│  TASK-04 (BUG-3: SetDoorSwing)                 ← independent   │
│  TASK-05 (BUG-4: CW batch update)              ← independent   │
│                                                                 │
│  TASK-03, TASK-04, TASK-05 CAN run in parallel — disjoint       │
│  files (stair handler vs. door schema vs. curtain wall cmd)    │
└─────────────────────────────────────────────────────────────────┘
           │
           ▼
PHASE 3 — MEDIUM SEVERITY (correctness fixes)
┌─────────────────────────────────────────────────────────────────┐
│  TASK-06 (BUG-6: roof baseOffset)              ← independent   │
│  TASK-07 (BUG-7: dual undo stack)              ← complex;      │
│    TASK-07 Phase A CAN start in parallel with TASK-06,          │
│    but TASK-07 Phase B must wait for Phase A validation.        │
│  TASK-08 (BUG-8: copy/paste)                   ← independent   │
│  TASK-11 (BUG-9: annotation undo)              ← independent   │
│  TASK-12 (updateLayers handlers)               ← independent   │
└─────────────────────────────────────────────────────────────────┘
           │
           ▼
PHASE 4 — LOW SEVERITY / RISK (safety net, cleanup)
┌─────────────────────────────────────────────────────────────────┐
│  TASK-09 (RISK-1: SheetEditorCommands guard)   ← independent   │
│  TASK-10 (RISK-2: 137 unguarded window.*)      ← independent   │
│  TASK-13 (RISK-3: dead CEB emissions)          ← verify first  │
│    TASK-13 must grep for subscribers before removing CEB cases │
│  TASK-14 (RISK-4: bridge fallback console.error) ← independent │
│                                                                 │
│  All TASK-09–14 CAN run in parallel within Phase 4.             │
└─────────────────────────────────────────────────────────────────┘
```

**Critical path:** TASK-01 → TASK-05 → TASK-07 (Phase B)  
**Parallelizable within phase:** All tasks within each phase are independent unless noted above.  
**Blocking dependency:** TASK-07 Phase B (systematic undo bridge migration) blocks until TASK-07 Phase A is validated. TASK-13 requires the pre-removal grep to confirm no live subscribers.

---

## 5. Risk Register

| ID | Risk | Probability | Impact | Mitigation | Owner |
|----|------|-------------|--------|------------|-------|
| R-1 | TASK-01 per-element CEB emit volume — emitting N events for a 100-wall batch may trigger N initTools subscriber calls synchronously, causing a 16ms frame budget breach (NFT-4) | Medium | Medium | Each initTools subscriber calls `legacyStore.add()` which schedules geometry via `FrameScheduler.schedule('pre-render', ...)` (C11 §5.2). The add calls are O(1) store writes. Frame budget should not be breached. Verify with a 100-wall batch create perf trace before merging. | Agent |
| R-2 | TASK-04 schema change to Door.ts — adding `swing` field is a Zod schema change that affects all serialized door data. Existing `.pryzm` project files have no `swing` field. | High | Low | Use `z.optional().default('left-in')` — Zod's default ensures backward compatibility. Existing door records deserialize with `swing: 'left-in'`. Verify by loading an existing project file after schema change. | Agent |
| R-3 | TASK-07 bridge handler refactoring may break existing legacy undo — after converting bridge handlers to `produceCommand`, the legacy `CommandManagerImpl` history no longer contains entries for these operations. If any legacy undo path still invokes `commandManager.undo()` for these operations, it will find no entry. | Low | Medium | The confirmed undo path is Ring Buffer (SaveUndoRedoHUD → runtime.undoStack). Legacy commandManager.undo() is not invoked by UI. Verify by reading SaveUndoRedoHUD.ts before Phase A merge. Mark orphaned commands with TODO(E.5.x) rather than deleting. | Agent |
| R-4 | TASK-02 curtain wall default grid values (1.5m × 2.4m) may not match existing project file expectations | Low | Low | Default values are applied only when `gridXSpacing`/`gridYSpacing` are absent from payload. Existing projects loaded from store already have these values persisted. The default only applies to NEW curtain wall creates with no grid spec. | Agent |
| R-5 | `check:commandmanager` ratchet may fail if TASK-07 Phase A reduces the count below the current threshold (56) and the script is written as exact-match rather than ≤ | Low | Low | Read `scripts/ci-check-no-commandmanager.mjs` before TASK-07 — if the script fails when count < threshold, update the threshold downward (ratchet direction is correct). | Agent |
| R-6 | TASK-13 removal of dead CEB cases for door/window/stair — if any AI pipeline, analytics, or collab sync subscribes to `door.created` / `window.created` / `stair.created` on runtime.events, removal will silently break that subscriber | Medium | Medium | Mandatory pre-removal grep (documented in TASK-13 strategy). If any subscriber found, annotate cases rather than remove. Do not skip the grep. | Agent |
| R-7 | TASK-12 `slab.updateLayers` handler — slab layer changes may require both `slabStore` (Immer) and legacy `SlabFragmentBuilder` (`bim-slab-updated`) to be updated. Verify that `produceCommand` on the Immer store auto-triggers `bim-slab-updated` via `subscribeDirty` before implementing. | Medium | Medium | Read `SlabStore.ts` `subscribeDirty` wiring before implementing TASK-12. If `bim-slab-updated` is NOT auto-fired by Immer dirty diff, add explicit `slabStore.triggerUpdate(slabId)` after `produceCommand`. | Agent |

---

## 6. What Is NOT In This Plan

The following items are explicitly deferred from this plan. Do not create tasks for them here:

| Item | Reason for Deferral |
|------|---------------------|
| **BUG-5: IFC import bus wiring** | Explicitly deferred as `IFC-P6` in `plugins/ifc-import/src/handlers/pluginHandlers.ts` L51–62. Formal roadmap task. |
| **B3.3-ST: Stair full bus migration** | Schema mismatch between stair bus payload and legacy `CreateStairCommand`. Separate enrichment task requiring schema update + stair tool refactor. |
| **B3.4-OP: Structural Openings typed handler** | No typed handler exists for IFC opening elements. Separate task. |
| **TASK-07 Phase B (systematic bridge migration)** | Depends on Phase A validation. High-risk change. Tracked as a separate sprint. |
| **Post-GA: IFC streaming LONGTASK fix** | Open item OI-007 — post-GA. |
| **Post-GA: WebGPU prewarm** | Open item OI-008 — Phase F gate blocked on TASK-19. |
| **Spatial node undo (CreateHierarchyLevel, CreateBuilding, CreateSite, CreateUnit)** | Single-store undo; `ElementRegistry`/`BimManager` leaks on undo. Low user-facing impact for these editor-structural operations. Separate technical debt task. |
| **`CreateMultipleLevelsCommand` undo** | Intentional architectural decision: batch level creation is non-undoable. |
| **`wall.updateLayers` unhandled command type** | No UI dispatch found in `apps/` — likely a placeholder type definition. Not actively broken from a user perspective. |
| **`element.update` unhandled command type** | No UI dispatch found — likely a placeholder. |
| **`stair.executeApprovedPlan` unhandled** | B3.3-ST scope — stair AI pipeline. |
| **Yjs CRDT activation** | Pending P6 migration completion (P6 still not met per MASTER-STATUS). |
| **OTLP exporter configuration** | Blocked on TASK-19 infrastructure credentials. |
| **WCAG 2.1 AA** | Post-GA, TASK-20. |

---

## 7. Success Criteria (Plan Level)

This plan is **COMPLETE** when ALL of the following are true:

- [ ] **BUG-1:** A batch create of N walls/slabs/beams/columns/curtain walls/ceilings produces N visible 3D meshes. The undo of a batch create removes all N elements in a single Ctrl+Z.
- [ ] **BUG-1a:** A curtain wall created via single or batch command produces a visible mesh with ≥ 1 grid cell (no `[CurtainCellComputer] Grid has fewer than 2 lines` warning).
- [ ] **BUG-2:** `stair.createRailing` with a missing/invalid `stairId` returns `{ valid: false }` from `canExecute`. A valid stairId produces a visible railing mesh.
- [ ] **BUG-3:** Door swing change via property panel updates the door mesh geometry and is undoable via Ctrl+Z.
- [ ] **BUG-4:** Updating all panels of a 50-panel curtain wall via `curtainwall.batch.update` completes in ≤ 1 second and fires `bim-curtain-wall-updated` exactly once.
- [ ] **BUG-6:** A roof created with explicit `baseOffset: 4.0` renders at 4.0m, not 2.7m. Default of 2.7m preserved when unspecified.
- [ ] **BUG-7 Phase A:** Ctrl+Z after a slab update, slab polygon update, or curtain wall panel update reverts the change visually. `RingBufferUndoStack` receives non-empty inverse patches for these operations.
- [ ] **BUG-8:** Clicking Copy or Paste produces a visible user response (toast or actual operation). Silent failure eliminated.
- [ ] **BUG-9:** All 9 annotation commands have working `undo()`. Ctrl+Z after annotation place/edit/delete reverts the change.
- [ ] **RISK-1:** `SheetEditorCommands.ts` — all 11 `window.commandManager` accesses guarded by `__pryzmInitComplete`. No TypeError on premature activation.
- [ ] **TASK-12:** Changing slab/ceiling/floor system type in the property panel triggers a mesh rebuild.
- [ ] **tsc --skipLibCheck --noEmit exits 0** after every task.
- [ ] **`npm run check:commandmanager` threshold does not increase** (must be ≤ 56 or decrease).
- [ ] **No new `window.dispatchEvent` calls** introduced in `apps/` or `packages/`.
- [ ] **No new `(window as any)` escape hatches** introduced in `packages/`.
- [ ] **No new architectural boundary violations** (packages/ must not import from apps/; plugins/ must not import from packages/command-registry/).

---

## Appendix A: ASSUMED-E Full Unhandled Command Type Inventory

*Generated from manual cross-reference of `packages/command-bus/src/commands.ts` against `engineLauncher.ts` handler registrations and `initBusHandlers.ts` as of 2026-05-18.*

| Command Type | Defined In | Dispatched From UI? | Handler | Action |
|---|---|---|---|---|
| `copy-selection` | MainToolbarCommands | ✅ MainToolbar.ts:50 | ❌ None | TASK-08 |
| `paste-clipboard` | MainToolbarCommands | ✅ MainToolbar.ts:51 | ❌ None | TASK-08 |
| `slab.updateLayers` | SlabMutationCommands | ✅ PropertyPanelTypeSelector.ts:72 | ❌ None | TASK-12 |
| `ceiling.updateLayers` | (inferred) | ✅ PropertyPanelTypeSelector.ts:88 | ❌ None | TASK-12 |
| `floor.updateLayers` | (inferred) | ✅ PropertyPanelTypeSelector.ts:104 | ❌ None | TASK-12 |
| `wall.updateLayers` | WallMutationCommands | ❌ No UI dispatch found | ❌ None | Deferred — placeholder |
| `element.update` | ElementMutationCommands | ❌ No UI dispatch found | ❌ None | Deferred — placeholder |
| `stair.executeApprovedPlan` | PlanMutationCommands | ❌ No UI dispatch | ❌ None | Deferred (B3.3-ST) |
| `beam.executeApprovedPlan` | PlanMutationCommands | ❌ No UI dispatch | ❌ None | Deferred (B3.3-ST) |
| `detail-view.create` | PlanMutationCommands | ❌ No UI dispatch | ❌ None | Deferred |
| `ifc.import.file` | IfcInspectorToolbarCommands | ✅ initUI.ts (bypass) | ⚠️ Stub | Deferred (IFC-P6) |

---

## Appendix B: Architectural Contract Quick-Reference for Implementers

| Contract | Rule | Applies To |
|----------|------|-----------|
| C11 §5.2 | Handlers validate → mutate via Immer draft → emit typed event via `runtime.events.emit` AFTER mutation → geometry build via `FrameScheduler.schedule('pre-render', ...)` | TASK-01 through TASK-08, TASK-12 |
| C14 §3 LP-02 | Use `runtime.commandBus.dispatch()` — no new `window.commandManager.execute()` | TASK-05, TASK-07, TASK-12 |
| C14 §3 LP-05 | Use `runtime.events.emit()` — no new `window.dispatchEvent(new CustomEvent(...))` in `apps/` or `packages/` | All tasks |
| C15 §8.1 | Door and window changes MUST update BOTH Immer store AND legacy `wallStore.updateDoor()`/`updateWindow()` | TASK-04 |
| C20 §3 | Ring Buffer is the single undo stack. Bridge handlers must produce real Immer patches, not empty `{ forward: [], inverse: [] }`. | TASK-07 |
| ADR-002 §2 | Handlers (L7) are pure. Event enrichment happens ONLY in CEB (L3). Do not add `runtime.events.emit()` to handlers. | TASK-01, TASK-02, TASK-05, TASK-12 |
| P3 | Only `packages/runtime-composer/src/scheduler.ts` calls `requestAnimationFrame`. Geometry builds MUST be scheduled, not synchronous inline. | TASK-01 (per-element emit volume), TASK-04 (door mesh rebuild) |
| P4 | No new `(window as any)` in `packages/`. Existing sites in `apps/` tracked under RISK-2. | All tasks |
| P6 | Commands are the only mutation path. No direct store writes from UI handlers. | TASK-04, TASK-07, TASK-12 |
| P8 | Every new public function adds ≥ 1 OTel span. | TASK-04, TASK-05, TASK-07, TASK-08, TASK-12 |
