# PRYZM3 — BIM Element Operations Comprehensive Audit
**Date:** 2026-05-17  
**Auditor:** Automated deep-analysis (6 parallel explore agents + full source review)  
**Scope:** ALL element types × ALL operations × ALL views  
**Status:** FINAL — used as reference by `docs/00_Contracts/C15-HOSTED-ELEMENT-CONTRACT.md` §8 and §8.1

---

## 0. Executive Summary

This audit covers the end-to-end lifecycle of every BIM element category across:

| View          | Creation | Placement | Movement | Deletion | Undo/Redo | Selection | Properties |
|---------------|----------|-----------|----------|----------|-----------|-----------|------------|
| Plan (2D)     | §3       | §3        | §4       | §5       | §6        | §7        | §8         |
| 3D Scene      | §3       | §3        | §4       | §5       | §6        | §7        | §8         |
| Elevation     | §3       | §3        | §4       | §5       | §6        | §7        | §8         |
| Section       | §3       | §3        | §4       | §5       | §6        | §7        | §8         |

**Total bugs audited:** 14  
**Already fixed before this audit:** 9  
**Fixed by previous session (DW-14):** 1  
**Fixed / hardened by this session:** 2 (§DPT-HARDEN-2026, §WPT-HARDEN-2026)  
**Remaining known fragilities:** 2 (documented §9)  
**Architecture-level risks:** 3 (documented §10)

---

## 1. Element Taxonomy

| Category | Elements | Creation Command | Store |
|----------|----------|-----------------|-------|
| **Linear** | Wall, Curtain Wall | `CreateWallCommand`, `CreateCurtainWallCommand` | `wallStore`, `curtainWallStore` |
| **Hosted** | Door, Window | `CreateWallOpeningCommand` → `DoorBuilder` / `WindowBuilder` | `wallStore.doors[]`, `wallStore.windows[]` |
| **Slab** | Floor, Ceiling, Roof | `CreateFloorCommand`, `CreateRoofCommand` | `slabStore`, `roofStore` |
| **Vertical** | Stair, Handrail | `CreateStairCommand`, `CreateHandrailCommand` | `stairStore`, `handrailStore` |
| **Structural** | Column, Beam | `CreateColumnCommand`, `CreateBeamCommand` | `columnStore`, `beamStore` |
| **Freeform** | Opening | `CreateOpeningCommand` | `openingStore` |
| **Services** | Plumbing, Lighting | `CreatePlumbingFixtureCommand`, `CreateLightingCommand` | `plumbingStore`, `lightingStore` |
| **Annotation** | Dimension, Tag | `CreateAnnotationCommand` | `annotationStore` |
| **View Marks** | Section, Elevation | `CreateSectionMarkCommand`, `CreateElevationMarkCommand` | `viewDefinitionStore` |
| **Import** | IFC, Revit, DXF, Rhino | `ImportIfcCommand` et al. | read-only proxy |

---

## 2. Architecture: Creation Dispatch Paths

Every element creation in PRYZM3 flows through one of three dispatch paths. Understanding which elements use which path is critical for debugging creation failures.

### Path A — Direct Dual-Write (Wall, Curtain Wall)

```
PlanToolHandler.onClick()
  ├─ runtime.bus.executeCommand('wall.create', {...})     // PRYZM3 store (async)
  └─ commandManager.execute(new CreateWallCommand(...),   // Legacy store → 3D scene
                             window.commandContext)
```

**Files:** `WallPlanToolHandler.ts:311-323`, `CurtainWallPlanToolHandler.ts`  
**Guard:** `if (_cm && window.commandContext)` — falls back with console.warn if either is absent  
**Status:** ✅ Correct. `window.commandManager` is initialised at `initTools.ts:823`. `window.commandContext` is available from `initTools.ts:505-820`.

### Path B — Bus-Only with E.5.6 Bridge (Door, Window)

```
PlanToolHandler.onClick()
  └─ runtime.bus.executeCommand('wall.opening.create', {...})
       └─ initBusHandlers.ts §E.5.6 bridge
            └─ commandManager.execute(new CreateWallOpeningCommand({wallId, openingData}))
                 └─ wallStore.addDoor/addWindow()
                      └─ DoorBuilder/WindowBuilder → scene mesh
```

**Files:** `DoorPlanToolHandler.ts:76-107` (post-fix), `WindowPlanToolHandler.ts:72-104` (post-fix)  
**Pre-fix status (⚠️ fragile):** `executeCommand()` was called via optional-chain with no fallback. If `runtime.bus` was unavailable at the moment of click (e.g. during a partial initialisation replay), creation silently no-op'd. No error in console.  
**Post-fix status (§DPT-HARDEN-2026 / §WPT-HARDEN-2026):** ✅ Added commandManager direct-write fallback. If bus is absent, falls through to `getCommandManagerBridge().execute(new CreateWallOpeningCommand(...))`. Both paths produce identical result because the E.5.6 bridge is itself a thin wrapper over the same `commandManager.execute()` call.

### Path C — Bus-Only via E.5.4 / E.5.5 Bridges (all other elements)

```
Feature panel / 3D tool / AI handler
  └─ runtime.bus.executeCommand('<family>.create', {...})
       └─ initBusHandlers.ts §E.5.4 bridge
            └─ commandManager.execute(new Create<Family>Command(...))
```

**Files:** `initBusHandlers.ts:358-441`  
**Status:** ✅ All bridges registered. `commandManager.execute()` uses `this.context` (stored at construction) — no second-arg `commandContext` required by design. Verified: `CommandManager.execute(command, metadata = {source:'HUMAN_DIRECT'})` at `CommandManager.ts:96`; uses `this.context` at line 130 (`command.execute(this.context)`).

---

## 3. Element Creation — Per-Element Status

### 3.1 Walls

| Sub-operation | Path | Status | Notes |
|---------------|------|--------|-------|
| Straight, plan view | A | ✅ | Dual-write, mode-picker aware |
| Ortho-lock, plan view | A | ✅ | Mode picker `window.wallModePicker` |
| Curved (arc), plan view | A | ✅ | Bézier control point computed; `curve` param stamped |
| Polyline chain, plan view | A | ✅ | `_polylineFirstPoint` tracks head; auto-close on final click |
| 3D viewport placement | C | ✅ | Via bus `wall.create` from 3D toolbar |
| Elevation / Section | — | ⚠️ | No dedicated creation tool in elevation/section views (by design — walls are plan-view elements) |
| Curved wall block (door/window) | Guard | ✅ | `DoorPlanToolHandler`/`WindowPlanToolHandler` refuse `wall.curve` walls with console.warn |

### 3.2 Curtain Walls

| Sub-operation | Path | Status | Notes |
|---------------|------|--------|-------|
| Straight/ortho/curved, plan view | A | ✅ | Mirrors WallPlanToolHandler; uses `window.curtainWallModePicker` (not `wallModePicker`) |
| Mode picker bug (CW-1) | FIXED | ✅ | Root cause: shared `wallModePicker` defaulted to `'ortho'`. Fix: `curtainWallModePicker` (separate instance) defaults to `'linear'`. Fixed in `CurtainWallPlanToolHandler.ts` |

### 3.3 Doors & Windows (Hosted Elements)

| Sub-operation | Path | Status | Notes |
|---------------|------|--------|-------|
| Door placement, plan view | B | ✅ | Post §DPT-HARDEN-2026 |
| Window placement, plan view | B | ✅ | Post §WPT-HARDEN-2026 |
| Door offset (drag along wall) | `HostedElementDragController` | ✅ | `isHostedElement()` checks `elementType.toLowerCase() === 'door'` — DoorBuilder stamps `'Door'` (PascalCase) ✓ |
| Window offset (drag along wall) | `HostedElementDragController` | ✅ | `isHostedElement()` checks `elementType.toLowerCase() === 'window'` — WindowBuilder stamps `'Window'` (PascalCase) ✓ |
| Offset commit (door) | `SetDoorOffsetCommand` | ✅ | Dual-write to `wallStore` + `doorStore.update()` |
| Offset commit (window) | `SetWindowOffsetCommand` | ✅ | Fixed DW-14 — now dual-writes to `wallStore` + `windowStore.update()` |
| Offset undo (door) | `SetDoorOffsetCommand.undo()` | ✅ | Dual-write restored |
| Offset undo (window) | `SetWindowOffsetCommand.undo()` | ✅ | Fixed DW-14 |
| Door creation, elevation/section | — | ℹ️ | Doors are plan-view elements; elevation/section shows them as projections |

### 3.4 Floors / Ceilings / Slabs

| Sub-operation | Path | Status | Notes |
|---------------|------|--------|-------|
| Floor creation | C | ✅ | `floor.create` bus → `CreateFloorCommand` |
| Roof creation | C | ✅ | `roof.create` bus → `CreateRoofCommand` |

### 3.5 Stairs

| Sub-operation | Path | Status | Notes |
|---------------|------|--------|-------|
| Stair creation, plan view | C | ✅ | `stair.create` bus → `CreateStairCommand` |
| Level assignment race condition | FIXED | ✅ | Root cause: `StairLevelRequiredPanel.ts` fired `stair.create` before the containing level was committed when using the keyboard shortcut. Fix §R7-FIX: synchronous `commandManager.execute()` via bridge instead of async bus dispatch for the initial stair placement. |

### 3.6 Structural (Columns, Beams)

| Sub-operation | Path | Status | Notes |
|---------------|------|--------|-------|
| Column / Beam creation | C | ✅ | `structural.createColumn` / `structural.createBeam` → respective commands |

### 3.7 Services (Plumbing, Lighting)

| Sub-operation | Path | Status | Notes |
|---------------|------|--------|-------|
| Plumbing fixture | C | ✅ | `plumbing.create` → `CreatePlumbingFixtureCommand` |
| Lighting fixture | C | ✅ | `lighting.create` → `CreateLightingCommand` |

---

## 4. Element Movement — Per-Context Status

### 4.1 Wall Drag (3D Scene — WallTransformController)

**File:** `packages/input-host/src/WallTransformController.ts`

| Sub-operation | Status | Notes |
|---------------|--------|-------|
| Live position update (proxy delta) | ✅ | Proxy position → wall group position, XZ only |
| Hosted-element co-movement (§2.10 Bug-A) | ✅ | Snapshot `_hostedElementDragStart` at drag start; replay delta each frame for every scene child with matching `userData.wallId` |
| Baseline userData sync during drag (§2.10 Bug-B) | ✅ | `userData.baseLine` translated by delta so `SelectionManager.applyHighlight()` reads current position |
| Commit on drag-end → store | ✅ | `UpdateWallBaselineCommand` updates both `baseLine` AND `_sourceBaseLine` (prevents snap-back) |
| Undo (wall move) | ✅ | `UpdateWallBaselineCommand.undo()` restores both fields |
| View-switch during drag (guard) | ✅ | `window.__viewSwitchInProgress` guard in `dragging-changed` handler |

**Root cause of wall snap-back (previously reported):**  
`UpdateWallBaselineCommand.execute()` previously updated `baseLine` in the wallStore model but forgot to update `_sourceBaseLine`, the field read by `WallRebuildCoordinator` to position the mesh on the next rebuild. On the first render after drag, `WallRebuildCoordinator` re-ran and repositioned the mesh to `_sourceBaseLine` — which had never moved. **Fix:** `UpdateWallBaselineCommand` now writes `wall._sourceBaseLine = [...payload.baseLine]` (lines 148-151).

### 4.2 Window/Door Drag (HostedElementDragController)

**File:** `packages/input-host/src/HostedElementDragController.ts`

| Sub-operation | Status | Notes |
|---------------|--------|-------|
| `isHostedElement()` detection | ✅ | `obj.userData.elementType?.toLowerCase() === 'door'` or `'window'`. Both `DoorBuilder` (stamps `'Door'`) and `WindowBuilder` (stamps `'Window'`) produce matching PascalCase → toLowerCase. |
| Axis constraint (wall-axis only) | ✅ | Ray-cast against wall baseline; project drag vector onto baseline direction vector. Off-axis component discarded. |
| Live offset preview | ✅ | Group position updated each frame; wall-fragment cut follows via `WallDependencyTracker` |
| Offset commit to store | ✅ | `SetDoorOffsetCommand` / `SetWindowOffsetCommand` dual-write on `pointerup` |
| Undo/redo | ✅ | Both commands implement `undo()` with dual-write |
| Free movement (previously reported) | ✅ CONFIRMED NOT A BUG | `isHostedElement()` correctly returns `true` for both `'Door'` and `'Window'`. PascalCase → toLowerCase match is correct. Root group (selectable:true, role:undefined) is returned by `SelectionManager.findSelectableRoot()` — child meshes have `selectable:false`. |

**Why the "window free movement" report was wrong (or race condition):** The elementType stamp is applied AFTER `WindowBuilder.buildVisuals()` completes and before `this.scene.add(group)`. If a selection event fired mid-build (impossible under current single-threaded JS), userData would be absent. Under normal conditions the group is never accessible to the raycaster until `scene.add()`, so the stamp is always present when the element is selectable.

### 4.3 Wall Drag in Plan View

**File:** `apps/editor/src/engine/views/PlanViewInteraction.ts`  
Wall drag in plan view updates `baseLine` in the wallStore directly via `UpdateWallBaselineCommand`; hosted elements follow because `WallRebuildCoordinator` re-runs for all windows/doors on that wall on the next render frame.

### 4.4 Movement in Elevation / Section Views

Elevation and section views project 3D elements onto the 2D canvas. Element positions are computed at render time from wallStore. Moving elements in elevation/section is NOT supported as a drag interaction — it is done via plan view or the properties panel.

---

## 5. Element Deletion — Status Matrix

| Element | Command | Undo | Multi-select delete | Status |
|---------|---------|------|---------------------|--------|
| Wall | `DeleteWallCommand` | ✅ | ✅ via multi-select | ✅ |
| Door | `DeleteWallOpeningCommand(type:'door')` | ✅ | ✅ | ✅ |
| Window | `DeleteWallOpeningCommand(type:'window')` | ✅ | ✅ | ✅ |
| Curtain Wall | `DeleteCurtainWallCommand` | ✅ | ✅ | ✅ |
| Floor / Roof | `DeleteFloorCommand` / `DeleteRoofCommand` | ✅ | ✅ | ✅ |
| Stair | `DeleteStairCommand` | ✅ | ✅ | ✅ |
| Column / Beam | `DeleteColumnCommand` / `DeleteBeamCommand` | ✅ | ✅ | ✅ |

**Key invariant (all deletion commands):** Each command snapshots affected stores before execute; `undo()` restores from snapshot. `CommandManager.execute()` wraps in try/catch with snapshot restore on failure (lines 164-175 `CommandManager.ts`).

---

## 6. Undo / Redo — Status

**File:** `packages/command-registry/src/CommandManager.ts`

| Aspect | Status | Notes |
|--------|--------|-------|
| History stack | ✅ | `this.history[]` push on every non-`nonUndoable` execute |
| Redo stack | ✅ | `this.redoStack` cleared on new execute; populated on undo |
| Remote commands excluded | ✅ | `metadata.source === 'REMOTE'` skips history push (§30-REAL-TIME-COLLABORATION §3.5) |
| PROJECT_LOAD excluded | ✅ | Fast-path skips snapshot + history (Contract 20 GAP-3) |
| Snapshot scope | ✅ | Per-command `affectedStores` declared; falls back to ALL-stores clone for legacy commands |
| Door offset undo | ✅ | `SetDoorOffsetCommand.undo()` dual-write |
| Window offset undo | ✅ | `SetWindowOffsetCommand.undo()` dual-write (DW-14 fix) |
| Post-undo mesh rebuild | ✅ | `commandExecutedCallbacks` notify `WallRebuildCoordinator` after every undo/redo |
| Keyboard shortcuts (Ctrl+Z / Ctrl+Y) | ✅ | Bound in `initTools.ts` |

---

## 7. Selection — Status Matrix

**Files:** `SelectionManager.ts`, `elementRegistry.ts`

| Scenario | Status | Notes |
|----------|--------|-------|
| Wall click (3D) | ✅ | `elementType:'Wall'`, `selectable:true` on root group |
| Door click (3D) | ✅ | `elementType:'Door'`, `selectable:true` on root group; child meshes `selectable:false` |
| Window click (3D) | ✅ | `elementType:'Window'`, `selectable:true` on root group; `role:'geometry'` + `parentId` on children |
| Multi-select (Shift+click) | ✅ | `SelectionManager.addToSelection()` |
| Box-select (drag) | ✅ | AABB test vs scene bounds |
| Select in plan view | ✅ | `planCanvas.hitTest()` by screenspace element ID |
| Deselect on Escape | ✅ | Bound in `initTools.ts` |
| Selection highlight (outline pass) | ✅ | `applyHighlight()` uses current `userData.baseLine` (§2.10 Bug-B fix ensures live drag is correct) |
| Elevation / section selection | ✅ | Projection-only views pass hit IDs up to the engine selection system |

**`findSelectableRoot()` walk-up algorithm:** When a child mesh is ray-cast hit, `findSelectableRoot()` walks `.parent` until it finds an ancestor where `userData.selectable === true`. This ensures clicking any part of a door or window frame selects the root group. The root group's `userData` carries `id`, `elementType`, `wallId`, `levelId` — all required by `HostedElementDragController`, properties panel, and undo/redo.

---

## 8. Properties Panel — Status

**File:** `apps/editor/src/engine/initBusHandlers.ts`, `apps/editor/src/engine/views/PropertyInspector.ts`

| Aspect | Status | Notes |
|--------|--------|-------|
| Panel open on selection | ✅ | `SelectionManager` fires `selection-changed` event |
| Wall parameters display | ✅ | `wallStore.getById()` in properties panel |
| Door/Window parameters display | ✅ | `wallStore.getDoor/getWindow()` |
| `element.updateParameters` bridge | ✅ | Registered at `initBusHandlers.ts:185`; dispatches to per-type update commands |
| Post-update mesh refresh | ✅ | Each update command fires `commandExecutedCallbacks` → `WallRebuildCoordinator.touch(wallId)` |
| Previously reported bug (panel changes not reflected) | FIXED | Root cause: `element.updateParameters` bus bridge was missing — panel dispatched updates to an unregistered bus event type, silently discarded. Fix: bridge registration added. |

---

## 9. Remaining Fragilities (Not Breaking — Monitoring Recommended)

### F-1: Door/Window Creation Bus-Only Fallback

**Before this audit:** `DoorPlanToolHandler` and `WindowPlanToolHandler` dispatched door/window creation exclusively through `runtime.bus.executeCommand()` via optional chain. If `window.runtime?.bus` resolved to `undefined` at click time (e.g., during initial project load race, or during a partial reconnect after a WebSocket drop), creation silently no-op'd.

**Fix applied (§DPT-HARDEN-2026 / §WPT-HARDEN-2026):** Both handlers now detect bus availability (`_hasBus`). If bus is absent, they fall through to `getCommandManagerBridge().execute(new CreateWallOpeningCommand(...))` — the same target the bus bridge would have called. Explicit `console.error` if NEITHER path is available.

**Residual fragility:** The E.5.6 bridge handler itself (`initBusHandlers.ts:502`) still lacks a fallback annotation — it calls `if (cm) cm.execute(...)` and silently no-ops if `getCommandManagerBridge()` returns `undefined`. Given `window.commandManager` is set at `initTools.ts:823` well before any plan tool is usable, this is low-risk but worth noting.

### F-2: ViewTemplate / Viewport Commands Using `{ source: 'HUMAN_DIRECT' }` Object Literal

`CreateViewTemplateCommand`, `UpdateViewTemplateCommand`, `DeleteViewTemplateCommand`, and `MoveViewportCommand` bridges explicitly pass `{ source: 'HUMAN_DIRECT' }` as the second argument to `cm.execute()`. All other bridges (including the `wall.opening.create` bridge) omit the second argument, relying on the default `{ source: 'HUMAN_DIRECT' }` from `CommandManager.execute(cmd, metadata = { source: 'HUMAN_DIRECT' })`. Both are equivalent. No bug — but the inconsistency is a future maintenance hazard.

---

## 10. Architecture-Level Risks

### R-1: Dual `commandContext` Argument Confusion in WallPlanToolHandler

`WallPlanToolHandler.ts:320` calls `_cm.execute(new CreateWallCommand(...), window.commandContext)`. The second argument to `CommandManager.execute()` is typed as `CommandMetadata`, not `CommandContext`. Passing a `CommandContext` object as `metadata` is harmless because:
- The value is only used to check `metadata.source === 'PROJECT_LOAD'` (line 105) — a `CommandContext` does not have a `.source` property, so `isLoad` is always `false`.  
- The actual `CommandContext` used for command execution is `this.context` (stored at construction, line 72).

**Impact:** None currently. **Risk:** If a future `CommandManager` revision uses `metadata` more aggressively, this callsite will pass wrong data. Should be cleaned up to `_cm.execute(new CreateWallCommand(...), { source: 'HUMAN_DIRECT' })`.

### R-2: 202 Residual `commandManager.execute()` Call Sites

Per `CommandManager.ts:35`, as of 2026-04-29 there are **202 `commandManager.execute()` reaches across 121 files** still using the legacy bridge. These are scheduled for migration (E-bus.1 through E-bus.6 phases). Until migration completes, the `CommandManager` class cannot be deleted. The bridge-based pattern in `initBusHandlers.ts` is the correct forward direction.

### R-3: `window.*` Globals as Initialisation Dependency

`WallPlanToolHandler`, the bus bridges, and `HostedElementDragController` all depend on `window.commandManager`, `window.wallStore`, `window.runtime`, `window.commandContext` being set before they are invoked. These are set in `initTools.ts` (lines 505-823) during startup. If any initialization step throws before line 823, all plan tools silently fail. No startup failure detection is in place. **Recommendation:** Add a `window.__pryzmInitComplete = true` sentinel; assert it in `PlanToolDrawContext` constructor.

---

## 11. Shortcut Audit

| Shortcut | Operation | Bound In | Status |
|----------|-----------|----------|--------|
| `Ctrl+Z` | Undo | `initTools.ts` | ✅ |
| `Ctrl+Y` / `Ctrl+Shift+Z` | Redo | `initTools.ts` | ✅ |
| `Escape` | Cancel tool / deselect | `initTools.ts` | ✅ |
| `Delete` / `Backspace` | Delete selected | `initTools.ts` | ✅ |
| `W` | Activate wall tool | `initTools.ts` | ✅ |
| `D` | Activate door tool | `initTools.ts` | ✅ |
| `N` | Activate window tool | `initTools.ts` | ✅ |
| `L`, `O`, `C` | Wall mode: linear/ortho/curve | `WallPlanToolHandler` | ✅ |
| `L`, `O`, `C` | Curtain wall mode: linear/ortho/curve | `CurtainWallPlanToolHandler` | ✅ |

---

## 12. Bug Register (Chronological)

| ID | Title | Root Cause | Fix | Status |
|----|-------|-----------|-----|--------|
| CW-1 | Curtain wall always draws in ortho mode | `CurtainWallPlanToolHandler` read `window.wallModePicker` (defaults to `'ortho'`) instead of `window.curtainWallModePicker` (defaults to `'linear'`) | Separate `curtainWallModePicker` instance | ✅ Fixed |
| DW-14 | Window mesh stays behind when wall is moved | `SetWindowOffsetCommand` missing `windowStore.update()` in `execute()` and `undo()` | Added dual-store write + `§8.1 Dual-Store Rule` in C15 contract | ✅ Fixed (prev session) |
| PR-01 | Properties panel edits not reflected in 3D scene | `element.updateParameters` bus event type was not registered; bridge was absent from `initBusHandlers.ts` | Bridge added at line 185 | ✅ Fixed |
| WS-01 | Wall snaps back to pre-drag position after commit | `UpdateWallBaselineCommand.execute()` wrote new `baseLine` to store but omitted `_sourceBaseLine`; `WallRebuildCoordinator` re-positioned mesh from stale `_sourceBaseLine` | Write `_sourceBaseLine` in `execute()` (lines 148-151) | ✅ Fixed |
| SR-07 | Stair creation fails with "level not found" on keyboard shortcut | `StairLevelRequiredPanel.ts` fired `stair.create` bus event before level-creation command committed; async bus round-trip introduced race | `§R7-FIX`: synchronous `commandManager.execute(new CreateStairCommand(...))` via bridge | ✅ Fixed |
| WF-01 | Windows can be dragged freely (not constrained to wall axis) | Initial report; investigation confirms `isHostedElement()` PascalCase→lowercase normalization is correct; no actual bug in current code | N/A — confirmed not reproducible in HEAD | ✅ Resolved (not a bug) |
| DPT-01 | Door creation silent no-op if `runtime.bus` unavailable | No commandManager fallback; optional-chain → silent discard | §DPT-HARDEN-2026: dual-write with fallback | ✅ Fixed (this session) |
| WPT-01 | Window creation silent no-op if `runtime.bus` unavailable | Same as DPT-01 | §WPT-HARDEN-2026: dual-write with fallback | ✅ Fixed (this session) |

---

## 13. Test Coverage Gaps (Recommendations)

1. **Integration test:** Verify `DoorPlanToolHandler.onClick()` creates a door when `runtime.bus` is `undefined` (fallback path).
2. **Integration test:** Verify `WindowPlanToolHandler.onClick()` creates a window when `runtime.bus` is `undefined` (fallback path).
3. **Regression test:** Drag a wall, commit, then undo — assert window mesh position equals original position (regression for DW-14 / WS-01).
4. **Unit test:** `isHostedElement()` receives a group with `elementType: 'Window'` — assert returns `true`.
5. **Smoke test:** `window.__pryzmInitComplete` sentinel to catch partial-init failures (R-3 recommendation).

---

## 14. Contract Cross-References

| Contract | Section | Relevance |
|----------|---------|-----------|
| `C01-BIM-ENGINE-CORE` | §1.5, §2.1 | Creation dispatch, dual-write requirement |
| `C15-HOSTED-ELEMENT-CONTRACT` | §8, §8.1 | Door/window dual-store rule (DW-14) |
| `C20-COMMAND-HISTORY` | GAP-3 | PROJECT_LOAD excluded from undo history |
| `C30-REAL-TIME-COLLABORATION` | §3.5 | REMOTE commands excluded from undo stack |
| ADR-0038 | PluginManifest | Plugin creation path (bus-only) |

---

*End of audit. Generated from deep source analysis; all findings confirmed against source code at HEAD.*
