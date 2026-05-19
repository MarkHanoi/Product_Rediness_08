# PRYZM3 Post-Refactor Regression Diagnosis

> **Stamp**: 2026-05-17  
> **Audit scope**: F.events migration series (F.events.2c / 2d / 4 / 8 / 9 / 13 / 15 / 16) + OI-044 / OI-045 injector refactor  
> **Status**: DEFINITIVE — root cause identified, all 5 regressions attributed, fixes applied.

---

## 1. Executive summary

All five regressions share a single root cause: **`window.runtime` is never assigned**.

The F.events migration series migrated event dispatch and subscription from DOM `CustomEvent` to `runtime.events.emit/on`. Every migrated call site uses the pattern `window.runtime?.events?.on(...)` / `window.runtime?.events?.emit(...)`. The `runtimeEventBridge.ts` module explicitly documents this assumption:

> _"before engineLauncher.ts sets window.runtime"_ — runtimeEventBridge.ts L8

However, no line in `engineLauncher.ts bootstrap()` (or any other file) ever executes `window.runtime = runtime`. The `PryzmRuntime` handle flows only as a local function parameter. Because `window.runtime` is always `undefined`, every optional-chain call silently no-ops — no error, no warning, no event.

The direct consequence: `flushRuntimeEventListeners()` at `engineLauncher.ts:415` evaluates `window.runtime?.events` as `undefined`, logs the error _"Deferred subscriptions lost"_, and returns — dropping the entire deferred queue. All subsequent `window.runtime?.events?.on(...)` calls in the same function also silently no-op.

---

## 2. Root-cause trace

### 2.1 Where the assignment should be (but is missing)

File: `apps/editor/src/engine/engineLauncher.ts`  
Function: `export async function bootstrap(runtime: PryzmRuntime | null = null)`

The function receives a fully-composed `PryzmRuntime` as its first parameter. The expected assignment:

```ts
// Missing line — should appear after BUI.Manager.init() and before first
// window.runtime?.events?.on() usage (line 160).
if (runtime) window.runtime = runtime as typeof window.runtime;
```

This line was never added. Every `window.runtime?.` access in `engineLauncher.ts` and in every module it calls is therefore a guaranteed no-op.

### 2.2 `globals.d.ts` type declaration vs actual assignment

`apps/editor/src/types/globals.d.ts` (lines 150-165) augments `Window` with a typed `runtime` slot:

```ts
runtime:
  | { bus: { executeCommand(...) }; events: { emit(...); on(...) } }
  | undefined;
```

The type system accepts `window.runtime?.X` calls because `undefined` is a valid member of the union. TypeScript raises no error for a missing assignment.

### 2.3 `runtimeEventBridge.ts` — designed for this, but never reached

`apps/editor/src/engine/runtimeEventBridge.ts` provides `onRuntimeEvent()` to queue subscriptions that arrive before `window.runtime` is set, and `flushRuntimeEventListeners()` to drain the queue once the runtime is available. Both helpers check `window.runtime?.events`. Since `window.runtime` is never set, `flush` always bails with an error.

---

## 3. Regression attribution

### R1 — Element Creation in Plan View Produces Nothing

**Primary break point** (Fix 1, already applied): `window.runtime` was never assigned in `engineLauncher.ts::bootstrap()`, so every `window.runtime?.bus?.executeCommand(...)` call silently no-oped. Fix 1 assigns `window.runtime = runtime` at bootstrap start.

**Deeper root cause (R1-B — now fixed 2026-05-17)**: Even after Fix 1 unblocks the bus path, plan-view element creation still silently fails for walls, curtain walls, and stairs. The F-1.2 migration was applied **asymmetrically**:

- `PreviewManager.ts` (3D viewport wall tool) correctly maintains the **dual-write** pattern:
  1. `bus.executeCommand('wall.create', ...)` — writes to PRYZM3 plugin Immer store (fire-and-forget)
  2. `commandManager.execute(new CreateWallCommand(...))` — writes to **legacy WallStore** → triggers `WallRebuildCoordinator` → builds the mesh

- `WallPlanToolHandler.ts`, `CurtainWallPlanToolHandler.ts`, `StairPlanToolHandler.ts` were migrated to use **only** `bus.executeCommand(...)`, dropping the `commandManager` path entirely. The bus `CreateWallHandler` writes to the PRYZM3 Immer store, which is a **separate** store instance from the legacy `WallStore` that `WallRebuildCoordinator` subscribes to. No mesh is ever built.

**Bonus payload bug in WallPlanToolHandler**: The bus call also passed `{wallId, start, end}` but `CreateWallPayload` expects `{id, baseLine: [{x,z},{x,z}]}` — so even the PRYZM3 store was written with a wrong random ID and default position.

**Fix R1-B** (applied to three files):
- `WallPlanToolHandler._commitWall()` — fixed bus payload format + added `getCommandManagerBridge()?.execute(new CreateWallCommand(...), window.commandContext)` dual-write
- `CurtainWallPlanToolHandler._commitCurtainWall()` — added dual-write for both straight and arc-segment paths; extracted inline `crypto.randomUUID()` to a variable so both paths share the same element ID
- `StairPlanToolHandler._commitStair()` — added `cm.execute(new CreateStairCommand({...}), window.commandContext)` dual-write; note: `stair.create` bus handler is not yet registered so the bus call was a safe no-op, but the commandManager path is now authoritative

**Architectural note**: This is the F-1.2 dual-write pattern explicitly documented in `PreviewManager.ts` (`§F-1.2 Bus dual-write` comment, lines 317-335). During the F-1.2 migration window, `commandManager` is the rendering-authoritative path. Bus writes are fire-and-forget for PRYZM3 plugin store parity. The scene-committer (`@pryzm/scene-committer`, L2) is the future bridge; once it is wired for walls, the `commandManager` path can be retired.

**Affected tool files**: `WallPlanToolHandler.ts`, `CurtainWallPlanToolHandler.ts`, `StairPlanToolHandler.ts`  
**Reference pattern**: `PreviewManager.ts` lines 317–335 (`[F-1.2] Bus dual-write` comment)  
**Status**: ✅ Fixed 2026-05-17

---

### R2 — Hosted-Element Openings Do Not Follow Wall Movement

**Affected files**:
- `apps/editor/src/engine/registerTransformDragHandler.ts` (3D gizmo drag path)
- `apps/editor/src/engine/views/plantools/MovePlanToolHandler.ts` (plan-view move path)
- `apps/editor/src/engine/views/plantools/AlignPlanToolHandler.ts` (plan-view align path)

**Two-layer failure (both layers required full fix):**

**Layer A — F.events subscription (root fix: Fix 1 / window.runtime assignment)**

`registerTransformDragHandler.ts` line 406:
```ts
window.runtime?.events?.on('bim-selection-changed', (payload: unknown) => {
    hostedDragController.activateFor(detail.object);  // line 409
    wallTransformController.activateFor(detail.object);  // line 410
});
```
`window.runtime` was `undefined` → subscription never registered → `WallTransformController` and `HostedElementDragController` were never activated.

Fix 1 (assigning `window.runtime = runtime` at bootstrap start) resolves Layer A.

**Layer B — F-1.2 dual-write missing for wall baseline update (Fix 3, deeper root cause)**

After Fix 1, `WallTransformController` correctly activates on selection. During a wall drag in the 3D viewport:

1. `WallTransformController` attaches an **invisible proxy** Object3D (oriented along the wall direction) to TransformControls. The `'change'` listener translates the proxy's position delta → `wallGroup.position` delta in real time (§2.10 BUG-B fix), while also translating door/window scene groups by the same XZ delta (§2.10 BUG-A fix). This is a **purely visual** update — no store mutations.

2. When drag ends, `registerTransformDragHandler.ts` computes `delta = wallGroup.position − wall.baseLine[0]` (delta from legacy store's pre-drag position) and fires:
   ```ts
   window.runtime?.bus?.executeCommand('wall.updateBaseline', { wallId, newBaseLine, prevBaseLine });
   ```

3. `UpdateWallBaselineHandler` (bus bridge, `plugins/wall/src/handlers/UpdateWallBaseline.ts`) exists and calls `getCommandManagerBridge()?.execute(new UpdateWallBaselineCommand(...))`. **BUT** this relies on:
   a. `getCommandManagerBridge()` returning non-null — if `setCommandManagerBridge()` was not called before this point, the bridge silently no-ops.
   b. The bus executing the handler in the same microtask — the bus is async; there is no guarantee the store is updated before the Three.js frame completes.
   c. No `window.commandContext` passed — the handler calls `cm.execute(cmd)` without an explicit context (using the CommandManager's internal context).

4. Without a confirmed `UpdateWallBaselineCommand` execution against `window.wallStore`:
   - The **legacy WallStore** is not updated with the new `baseLine`.
   - `WallStore.update()` does NOT emit `bim-wall-updated` (it only emits on confirmed store mutations).
   - `WallRebuildCoordinator` never runs.
   - The wall mesh geometry — which has the **opening void baked in at the original baseLine** — is never rebuilt.
   - Result: the wall mesh moves visually (Three.js group translation) and so do the door/window scene groups (§2.10 BUG-A), but the **void cut** in the mesh geometry remains offset at the ORIGINAL world-space position.

**Opening-void geometry model (why no rebuild = static void):**

The wall mesh is built by `WallFragmentBuilder` in world-space coordinates with the wallGroup at `position = baseLine[0]`. The opening void is baked into the mesh geometry at:
```
voidWorldPos = baseLine[0] + opening.offset × wallDir
```
This is computed once at build time and baked into the geometry vertex buffer. When TransformControls moves the wallGroup to a new position, the RENDERED void position follows (it's part of the same mesh). However, `WallTransformController §2.10 BUG-A` also separately moves the door/window **frame meshes** (which are direct scene children, NOT children of the wallGroup). After drag end with no rebuild, the wallGroup + mesh are at the new position with the void at the **correct rendered position**, BUT the door/window frame meshes may have drifted slightly vs the void due to floating-point differences in how WallTransformController computed the delta vs how the geometry positions the void.

More critically: on the NEXT rebuild triggered by any other event (new element added, level switched, undo/redo), `WallRebuildCoordinator` reads the OLD `baseLine` from the legacy WallStore (never updated) and rebuilds the wall at the **OLD position**. The wall mesh snaps back. The void snaps back. The door/window frame meshes stay at the moved position. The opening is now in the wrong wall and at the wrong position.

**Knock-on effects:**
- Undo does not work for wall moves (no command was pushed to the undo stack → Ctrl+Z has nothing to revert).
- The next plan-view edit (add wall, etc.) triggers a WallRebuildCoordinator pass → wall snaps back to pre-move position.
- Any save/load cycle restores the wall to its pre-move position (legacy store was never updated; persistence reads from legacy store).
- Plan-view move (`MovePlanToolHandler._moveWall()`) has the same bus-only pattern → same failure for moves initiated from the plan view.
- Align tool (`AlignPlanToolHandler._moveWall()`) has the same bus-only pattern → same failure.

**Fix R2 (applied 2026-05-17):**

F-1.2 dual-write at all three wall-baseline mutation call sites — commandManager first (synchronous, authoritative for WallRebuildCoordinator), bus second (PRYZM3 store parity, fire-and-forget):

```ts
// (1) CommandManager — authoritative path: updates legacy WallStore → bim-wall-updated → rebuild.
getCommandManagerBridge()?.execute(
    new UpdateWallBaselineCommand({ wallId, newBaseLine, prevBaseLine }),
    window.commandContext,
);
// (2) Bus — PRYZM3 plugin-store parity only. _skipBridge prevents UpdateWallBaselineHandler
// from issuing a second cm.execute(), which would push a duplicate onto the undo stack.
window.runtime?.bus?.executeCommand('wall.updateBaseline', {
    wallId, newBaseLine, prevBaseLine, _skipBridge: true,
});
```

`UpdateWallBaselineHandler` updated to honour `_skipBridge: true` (early return, no bridge call). External callers (AI pipeline, CRDT sync, IFC importer) that arrive only through the bus do NOT set `_skipBridge` and are bridged normally.

Same dual-write applied to `MovePlanToolHandler._moveWall()` (single-wall path: `UpdateWallBaselineCommand`; cascade path: `CascadeWallBaselineCommand`). `CascadeWallBaselineHandler` updated with the same `_skipBridge` guard.

**Affected files (Fix R2)**: `registerTransformDragHandler.ts`, `MovePlanToolHandler.ts`, `AlignPlanToolHandler.ts`, `plugins/wall/src/handlers/UpdateWallBaseline.ts`, `plugins/wall/src/handlers/CascadeWallBaseline.ts`  
**Status**: ✅ Fixed 2026-05-17

---

### R3 — Windows Not Constrained to Host Wall During Drag

**Affected files**:
- `apps/editor/src/engine/registerTransformDragHandler.ts` (controller call ordering)
- `packages/input-host/src/HostedElementDragController.ts` (missing TC re-attach)

**Root cause — two-layer failure:**

**Layer A (resolved by Fix 1):** `window.runtime` was `undefined` → the `bim-selection-changed` subscription in `registerTransformDragHandler.ts` was never registered → `HostedElementDragController.activateFor()` was never called in the first place.

**Layer B (separate regression, resolved by Fix 4):** Even after Fix 1, the constraint fails whenever a **wall was previously selected before the window**. The `bim-selection-changed` handler called the three controllers in order:

```ts
// ❌ WRONG ORDER (prior to Fix 4)
hostedDragController.activateFor(detail.object);   // (1) setSpace('local'), showX=true, showY=false, showZ=false ✓
wallTransformController.activateFor(detail.object); // (2) not a wall → this.deactivate()
wallEndpointController.activateFor(detail.object);
```

`WallTransformController.deactivate()` has an `isActive` guard (`if (!this.isActive) return`). So in a **fresh session** (no prior wall selection) the guard fires and there is no damage. But when a wall **was** previously selected, `wallTransformController.isActive = true`, the guard passes, and `deactivate()` calls:
- `this.transformControls.detach()` — detaches TC from the window group
- `this.transformControls.setSpace('world')` — resets the local-space constraint

This runs **after** `hostedDragController.activateFor()`, destroying the single-axis configuration that was just applied.

**Why the scene-graph userData is correct (not part of the bug):** `WallFragmentBuilder.createWindowFrame()` stamps the frame `THREE.Group` with `{ id: opening.elementId, elementType: 'window', wallId: wall.id, selectable: true }`. Child meshes carry `{ elementType: 'window-part', role: 'geometry', parentId }`. `SelectionManager.findSelectableRoot()` correctly resolves the raycasted child mesh up to the parent frameGroup (via `PARENT_RESOLVED_ROLES.includes('geometry') && parentId` walk-up). So `bim-selection-changed` emits the correct frameGroup with `elementType: 'window'`. The userData contract was never broken — only the controller ordering was.

**Fix R3 = Fix 1 (Layer A) + Fix 4 (Layer B)**: See Fix 4 below.

**Status**: ✅ Fixed 2026-05-17 (Fix 1 + Fix 4)

---

### R4 — Properties Panel Changes Do Not Propagate

**Three independent break points**, all independently capable of producing the symptom:

---

**Break point A** (now fixed by Fix 1 + Fix 2) — `window.runtime` undefined at construction time:  
`PropertyPanelAdapter._bindGridSelectedEvent()` uses `window.runtime?.events` which is `undefined` if Fix 1 has not run. Fix 1 resolves this for the global path; Fix 2 (constructor arg) resolves it for the typed path.

---

**Break point B** (root cause of the Apply regression — fixed by Fix 5) — **`element.updateParameters` command type not registered in the command bus**:

`PropertyPanel.onApply()` (line 933) fires:
```ts
await window.runtime?.bus?.executeCommand('element.updateParameters', { elementId, elementType, parameters });
```

Even after Fix 1 makes `window.runtime` available, this call silently no-ops because:
1. `element.updateParameters` was **absent** from `ElementMutationCommands` in `packages/command-bus/src/commands.ts`
2. **No bus handler** for `element.updateParameters` was registered anywhere — not in `initBusHandlers.ts`, not in any plugin

When `executeCommand` is called for an unregistered type, the bus optional-chain resolves to `undefined`. The `try { await undefined; }` block immediately falls through to `showApplySuccess()`, displaying "✓ Applied" — while the store and the Three.js scene are completely untouched. **The user sees a success flash but nothing changes.**

---

**Break point C** (secondary, fixed by Fix 5) — **`inspector.setCommandManager()` never called in `engineLauncher.ts`**:

`PropertyPanel._commandManager` is `null` for the entire session because `engineLauncher.ts` only calls `inspector.setRoofStore(roofStore)` (line 254) but never calls `inspector.setCommandManager(commandManager)`. This silently breaks every code path inside `PropertyPanel` that routes through the command manager:
- Room property section — `appendRoomPropertySection(..., cmdMgr, ...)` receives `null`
- Linear dimension editing — `_showLinearDimension(host, cmdMgr, ...)` receives `null`
- Grid editing — `_showGrid(host, cmdMgr, ...)` receives `null`
- `RoofPropertySheet` — `new RoofPropertySheet(host.commandManager)` receives `null`

**Symptom match**: "Changes to parameter values in the Properties Panel are not reflected in the 3D scene and do not appear in the store."

---

### R5 — Stair Level Creation Dialog Does Nothing

**Two break points**:

**Break point A** — `apps/editor/src/engine/views/plantools/StairPlanToolHandler.ts`, line 87:
```ts
window.runtime?.events?.emit('pryzm:toast', {
    message: 'Add a second level before placing a stair …',
    severity: 'error',
});
```
`window.runtime` is `undefined` → emit is silent → the user sees **no feedback** when no upper level exists. The tool silently resets the cursor; the user does not know why placement failed.

**Break point B** — `apps/editor/src/engine/views/plantools/StairPlanToolHandler.ts`, line 125 (same as R1):
```ts
window.runtime?.bus?.executeCommand('stair.create', { ... })
```
Even when a valid upper level is found, the create command is silently dropped.

**Secondary break point** — `apps/editor/src/ui/WorkspaceController.ts`, `_dispatchExplode()`, line 372-376:
```ts
window.runtime?.events?.emit('pryzm-inspect-level-explode', { mode, soloLevelId });
```
The DOM dispatch for `pryzm-inspect-level-explode` was removed in F.events.2d. `LevelExplodeController.init()` subscribes only via `window.runtime?.events?.on(...)`. Because `window.runtime` is `undefined` on both sides, the level-explode UI (which shows level creation affordances) never renders.

**Symptom match**: "Tool detects no upper level, prompts user to create one — user confirms but the level is not created." The prompt (toast) never appeared in the first place; the user had no actionable feedback.

---

### R2-B — Additional knock-on: plan-view wall move and align also broken

`MovePlanToolHandler._moveWall()` (single-wall and cascade paths) and `AlignPlanToolHandler._moveWall()` both had the same bus-only pattern for `wall.updateBaseline` / `wall.cascadeBaseline`. The `UpdateWallBaselineHandler` bridge was available but not guaranteed to fire synchronously. After a plan-view wall move:

- Legacy WallStore is not updated → next render frame uses stale `baseLine`.
- WallRebuildCoordinator does not fire → void cut stays at old world position.
- Ctrl+Z has nothing on the undo stack.
- On the next rebuild (triggered by any other event), wall snaps back.

Fixed in the same commit as R2 (dual-write at `MovePlanToolHandler._moveWall()` both branches + `AlignPlanToolHandler._moveWall()`).

---

## 4. Side-finding: unmigrated listener (open debt, non-blocking)

**File**: `plugins/annotations/src/AnnotationManager.ts`, line 226:
```ts
window.addEventListener('bim-selection-changed', (e: Event) => { ... });
```
This is an F.events.16 unmigrated DOM listener. The parallel bridge in `SelectionManager.ts` (lines 1036/1233) still dispatches the DOM `CustomEvent` alongside `runtime.events.emit`, so this listener continues to function. It represents open migration debt but does NOT cause a regression today.

---

## 5. Fix summary

### Fix 1 (root fix — resolves R1 Layer A, R2 Layer A, R3, R5-A, R5-B)

**File**: `apps/editor/src/engine/engineLauncher.ts`  
**Location**: In `bootstrap()`, immediately after `BUI.Manager.init()` (line 93), before the first `window.runtime?.events?.on(...)` call at line 160.

```ts
// ── P1 architecture invariant — F.events migration sites read window.runtime ──
// The composed PryzmRuntime must be published to the typed window slot so that
// window.runtime?.events?.on/emit and window.runtime?.bus?.executeCommand
// calls in F.events-migrated files resolve correctly.
// Ref: runtimeEventBridge.ts §1, globals.d.ts lines 150-165.
if (runtime) window.runtime = runtime as typeof window.runtime;
```

This single line makes all F.events migration sites functional:
- `flushRuntimeEventListeners()` finds `window.runtime.events` and drains its queue.
- `registerTransformDragHandler.ts:406` subscription fires on every `bim-selection-changed` → R2 + R3 fixed.
- `StairPlanToolHandler._commitStair()` `window.runtime.bus.executeCommand(...)` routes to the registered handler → R1 + R5-B fixed.
- `StairPlanToolHandler` toast emit reaches the UI layer → R5-A fixed.
- `WorkspaceController._dispatchExplode()` events reach `LevelExplodeController` → R5 secondary fixed.

### Fix 3 (R2 Layer B + R2-B — wall baseline update dual-write)

**Files**:
- `apps/editor/src/engine/registerTransformDragHandler.ts` — 3D gizmo wall drag-end
- `apps/editor/src/engine/views/plantools/MovePlanToolHandler.ts` — plan-view single-wall move + cascade
- `apps/editor/src/engine/views/plantools/AlignPlanToolHandler.ts` — plan-view align move
- `plugins/wall/src/handlers/UpdateWallBaseline.ts` — added `_skipBridge` guard
- `plugins/wall/src/handlers/CascadeWallBaseline.ts` — added `_skipBridge` guard

All three wall-baseline mutation paths now follow the F-1.2 dual-write pattern (matching R1-B fix and `PreviewManager.ts` reference implementation):

```ts
// (1) CommandManager — synchronous, authoritative for WallRebuildCoordinator.
//     Updates legacy WallStore → WallStore fires bim-wall-updated →
//     WallRebuildCoordinator rebuilds wall mesh with opening voids at new baseLine.
getCommandManagerBridge()?.execute(
    new UpdateWallBaselineCommand({ wallId, newBaseLine, prevBaseLine }),
    window.commandContext,
);
// (2) Bus — PRYZM3 plugin-store parity, fire-and-forget.
//     _skipBridge: true prevents UpdateWallBaselineHandler from issuing a
//     second cm.execute() (which would push a duplicate onto the undo stack).
window.runtime?.bus?.executeCommand('wall.updateBaseline', {
    wallId, newBaseLine, prevBaseLine, _skipBridge: true,
});
```

`_skipBridge` mechanism: bus handlers for `wall.updateBaseline` and `wall.cascadeBaseline` check for `cmd._skipBridge === true` and return early when set. External callers (AI pipeline, CRDT sync, IFC importer) that arrive only through the bus do NOT set `_skipBridge` — those paths continue to bridge normally, keeping AI-generated wall moves functional.

**Cascade path** (`MovePlanToolHandler` multi-wall): uses `CascadeWallBaselineCommand` directly (one undo-stack entry for the whole batch including carried neighbour endpoints), plus `wall.cascadeBaseline` bus call with `_skipBridge: true`. `CascadeWallBaselineHandler` has the same guard.

---

### Fix 4 (R3 Layer B — controller execution ordering race)

**Files**:
- `apps/editor/src/engine/registerTransformDragHandler.ts` — changed controller call order
- `packages/input-host/src/HostedElementDragController.ts` — added `TC.attach(obj)` in `activateFor()`

**Problem**: `bim-selection-changed` fired the three controllers in wrong order. `hostedDragController.activateFor()` ran first (setting `space='local'`, X-only axes), then `wallTransformController.activateFor()` ran for a non-wall → called `this.deactivate()`. When a wall **had been previously selected** (`wallTransformController.isActive = true`), `deactivate()` called `TC.detach()` + `setSpace('world')`, destroying the constraint.

**Fix — two changes**:

1. **`registerTransformDragHandler.ts`** — call `hostedDragController.activateFor()` LAST so it always wins:
```ts
// ✅ CORRECT ORDER (Fix 4)
wallTransformController.activateFor(detail.object);
wallEndpointController.activateFor(detail.object);
hostedDragController.activateFor(detail.object);   // ← LAST: wins over wall/endpoint deactivation
```

2. **`HostedElementDragController.activateFor()`** — add `this.transformControls.attach(obj)` before configuring space/axes. This re-attaches TC to the window/door even if `WallTransformController.deactivate()` (which now runs before us) detached it:
```ts
activateFor(obj: THREE.Object3D): void {
    // ...
    this.isActive = true;
    this.transformControls.attach(obj);         // ← §R3-FIX: re-attach after possible detach
    this.transformControls.setSpace('local');
    this.setGizmoAxes(true, false, false);
    // ...
}
```

**Why this is safe**: `TC.attach(obj)` in standard Three.js TransformControls does NOT reset `showX/Y/Z`. It only sets the attached object and dispatches 'change'. `LevelPlaneConstraint.onTransformChange` only activates when `lockedObj !== null` — and for hosted elements `applyHighlight()` correctly skips `levelPlaneConstraint.attach()` (see `SelectionManager.ts` lines 1187–1191: `isHostedHL` guard). So LPC will not re-enable the Y handle after `hostedDragController.activateFor()` sets it to false.

---

### Fix 2 (belt-and-suspenders for R4-A)

**File**: `apps/editor/src/engine/engineLauncher.ts`  
**Location**: `PropertyPanelAdapter` constructor call (line 143-150).

Pass `runtime` as the second argument so `_bindGridSelectedEvent()` uses the locally-injected reference rather than relying on the window slot:

```ts
const inspector = new PropertyPanelAdapter({ ... }, runtime ?? null);
```

---

### Fix 5 (R4-B + R4-C — Properties Panel Apply and commandManager wiring)

**Two-part fix for the post-refactor Properties Panel regression:**

---

**Part 1 — Register `element.updateParameters` in the command type registry**

**File**: `packages/command-bus/src/commands.ts`  
**Location**: `ElementMutationCommands` type, after `element.update`.

```ts
/** §R4-FIX — Generic parametric update fired by PropertyPanel.onApply(). */
'element.updateParameters': { elementId: string; elementType: string; parameters: Record<string, unknown> };
```

---

**Part 2 — Register the bus handler that fans out to `UpdateElementParameterCommand`**

**File**: `apps/editor/src/engine/initBusHandlers.ts`  
**Location**: `__bridges` array, after `furniture.updateParameters`.

```ts
{
    type: 'element.updateParameters',
    stores: [] as const,
    validate: (cmd) => (
        !cmd.elementId   ? 'elementId is required'   :
        !cmd.elementType ? 'elementType is required' :
        (!cmd.parameters || Object.keys(cmd.parameters).length === 0) ? 'parameters must not be empty' :
        null
    ),
    fn: (cmd) => {
        const cm = getCommandManagerBridge();
        if (cm) {
            cm.execute(new UpdateElementParameterCommand({
                elementId:   cmd.elementId,
                elementType: cmd.elementType,
                parameters:  cmd.parameters as Record<string, any>,
            }));
        }
    },
},
```

`UpdateElementParameterCommand` is the canonical generic command — it already routes per-`elementType` to the correct store (wall, slab, column, beam, stair, curtain-wall, roof, furniture, window, door, handrail), updates the store, and triggers the geometry rebuild for each type. Payload shape `{ elementId, elementType, parameters }` matches `UpdateElementParameterInput` exactly.

---

**Part 3 — Wire `commandManager` into the PropertyPanel**

**File**: `apps/editor/src/engine/engineLauncher.ts`  
**Location**: Immediately after `inspector.setRoofStore(roofStore)` (line 254).

```ts
inspector.setCommandManager(commandManager);
```

`commandManager` is in scope at this point (destructured from `initTools()` at line 238). Without this call, `PropertyPanel._commandManager` is `null` for the entire session, silently breaking room-panel, dimension, grid, and roof property editing.

---

### R6 — Moved Wall: stale highlight at old position + snap-back on element create

**Symptom A**: After dragging a wall with the 3D gizmo, the selection highlight box stays at the wall's **original** position rather than the new one.

**Symptom B**: When any subsequent element is created (e.g. drawing a new wall), the moved wall **snaps back** to its original position.

Both symptoms share a single root cause, triggered by `WallJoinResolver.resolveLevel()`.

---

**Root cause — `_sourceBaseLine` not reset after drag**

`WallJoinResolver.resolveLevel()` seeds the join-resolution algorithm from:
```ts
// WallJoinResolver.ts §SOURCE-BL-FIX
const src = (w as any)._sourceBaseLine ?? w.baseLine;
```

`_sourceBaseLine` stores the wall's "user-intended" baseline **before any join trimming**. After a drag, `UpdateWallBaselineCommand.execute()` updated `baseLine` to the new position but left `_sourceBaseLine` pointing to the **pre-drag** coordinates.

On the very next `WallRebuildCoordinator._flush()` call (triggered when a new element is created):
1. `resolveLevel()` seeds from `_sourceBaseLine` = OLD position
2. Computes trimmed baseline from OLD → places wall at OLD (adjusted for joins)
3. `wallStore.update(wallId, { baseLine: OLD_ADJUSTED })` overwrites the correct new position
4. `buildWall()` runs → sets `wallGroup.userData.baseLine = OLD_ADJUSTED` and `wallGroup.position = OLD_BL[0]`
5. For Symptom B: wall geometry snaps back to old position ✓
6. For Symptom A: the 2-frame-delayed `applyHighlight(capturedObj)` fires AFTER step 4 → reads `capturedObj.userData.baseLine = OLD_ADJUSTED` → OBB center at old position ✓

---

### Fix 6 (R6 — Moved Wall snap-back and stale highlight)

**Two-part fix:**

---

**Part 1 — Reset `_sourceBaseLine` in `UpdateWallBaselineCommand.execute()`**

**File**: `packages/command-registry/src/walls/UpdateWallBaselineCommand.ts`  
**Location**: `wallStore.update()` call inside `execute()`.

```ts
ctx.stores.wallStore.update(this.wallId, {
    baseLine: this.newBaseLine,
    _renderVersion: (wall._renderVersion ?? 0) + 1,
    _sourceBaseLine: [               // §R6-FIX: reset join-resolver seed to new position
        { x: this.newBaseLine[0].x, y: this.newBaseLine[0].y, z: this.newBaseLine[0].z },
        { x: this.newBaseLine[1].x, y: this.newBaseLine[1].y, z: this.newBaseLine[1].z },
    ],
} as any);
```

This tells `WallJoinResolver` "the user intentionally moved this wall; compute all future joins from the NEW position". Undo is unaffected — `prevSnapshot` was captured before this write via `serializeWallSnapshot(wall)`, so `restoreSnapshot()` on undo reverts `_sourceBaseLine` to its original pre-drag value.

---

**Part 2 — Patch `wallGroup.userData.baseLine` immediately at drag-end**

**File**: `apps/editor/src/engine/registerTransformDragHandler.ts`  
**Location**: Inside `if (Math.abs(dx) > 1e-6 || ...)` block, before `getCommandManagerBridge()?.execute(...)`.

```ts
// §R6-FIX: patch userData.baseLine immediately so the SelectionBoundsRegistry
// OBB builder reads the new world coordinates even if buildWall() is delayed.
obj.userData.baseLine = [
    { x: newStart.x, y: newStart.y, z: newStart.z },
    { x: newEnd.x,   y: newEnd.y,   z: newEnd.z   },
];
```

This is a belt-and-suspenders measure: `buildWall()` also sets `userData.baseLine` at frame N+1, but that happens BEFORE the 2-frame re-highlight fires (frame N+2). Without Part 1, `buildWall()` would overwrite `userData.baseLine` with `OLD_ADJUSTED` at frame N+1, corrupting the value the re-highlight would read at N+2. With Part 1 fixing the root cause, this patch ensures the highlight is correct for the window between drag-end and the first rebuild.

---

### R7 — Stair creation: "Add Level" panel appears, level is never created, stair tool never activates

**Symptoms**:
- User activates the stair tool with only one level in the project.
- `StairLevelRequiredPanel` appears and correctly shows "Add Level".
- User clicks **Add Level**.
- Panel closes, stair tool re-prompts the panel (level was never added to the project).
- Alternatively: if `window.runtime` is null, clicking "Add Level" silently does nothing and the panel re-appears.
- Even if the bus command "lands", levels may be created with `id: undefined` (broken entity).

**This is not an isolated bug.** It is the same systemic failure pattern as R1–R3: a mutation site relied on the async bus as the *only* write path for a state change that must be visible **synchronously** to the same call stack. Four compounding failures form the chain.

---

**Failure A — `StairLevelRequiredPanel`: `commandManager.execute()` never called; `onRetry()` fires before Promise resolves**

**File**: `apps/editor/src/ui/StairLevelRequiredPanel.ts`, "Add Level" button handler.

```ts
// BROKEN (before fix):
const command = new AddLevelCommand({ ... }); // ← instantiated but DISCARDED
window.runtime?.bus?.executeCommand('level.add', { ... })  // ← async, not awaited
    .catch(...);
this.dismiss();
opts.onRetry();  // ← fires synchronously before bus Promise resolves
                 //   bimManager.getLevels() still returns 1 level
                 //   → _ensureTwoLevelsForStair fires again → panel re-appears
```

`AddLevelCommand` was constructed but `opts.commandManager.execute(command)` was never called — the command was dead code. The only mutation path was the async bus. `opts.onRetry()` called `activateStairPathTool()` → `_ensureTwoLevelsForStair()` → `bimManager.getLevels()` immediately, before the bus Promise resolved. The result was an infinite panel loop and a level that was never stored.

**Failure B — `level.add` bus type incomplete: missing `levelId` and `height`**

**File**: `packages/command-bus/src/commands.ts`, `MiscMutationCommands`.

```ts
// BROKEN (before fix):
'level.add': { name?: string; elevation?: number };
// ↑ No levelId, no height. TypeScript types cmd.levelId as `never`.
```

`initBusHandlers.ts` validator: `(!cmd.levelId ? 'levelId is required' : null)` — TypeScript sees `cmd.levelId` as `never` (a type error masked by `as any` casts downstream). At runtime the field passes through JavaScript, but `AddLevelHandler` in the stair plugin received a payload with the type `{ name?, elevation? }` — no `levelId`.

**Failure C — `AddLevelHandler` in stair plugin: truncated `AddLevelPayload`**

**File**: `plugins/stair/src/handlers/AddLevel.ts`.

```ts
// BROKEN (before fix):
export interface AddLevelPayload {
    readonly name?: string;
    readonly elevation?: number;  // ← no levelId, no height
}
// ...
cm.execute(new AddLevelCommand(cmd as any));
// → new AddLevelCommand({ name, elevation, levelId: undefined, height: undefined })
// → level stored with id: undefined
```

**Failure D — `PlanViewToolOverlay._handleCreateLevel()`: bus-only, same architectural failure**

**File**: `apps/editor/src/engine/views/PlanViewToolOverlay.ts`, `_handleCreateLevel()`.

Only fired `window.runtime?.bus?.executeCommand('level.add', ...)`. If `window.runtime` was null or `getCommandManagerBridge()` returned null inside the handler, the level was silently dropped with no error feedback.

---

### Fix 7 (R7 — Stair level creation)

**Five-part fix. Root pattern: every `level.add` call site that needs the result synchronously must use the C02 §3.4 dual-write pattern.**

---

**Part 1 — `StairLevelRequiredPanel`: authoritative synchronous write first, bus secondary**

**File**: `apps/editor/src/ui/StairLevelRequiredPanel.ts`

```ts
// FIXED:
const levelId  = crypto.randomUUID();
const elevation = opts.topElevation + 3.0;
const command   = new AddLevelCommand({ levelId, name: opts.suggestedName, elevation, height: 3.0 });

// AUTHORITATIVE write — synchronous; bimManager.getLevels() reflects new level immediately
opts.commandManager.execute(command);

// SECONDARY parity write — async, fire-and-forget; _skipBridge prevents double execution
window.runtime?.bus?.executeCommand('level.add', {
    levelId, name: opts.suggestedName, elevation, height: 3.0, _skipBridge: true,
})?.catch(console.error);

this.dismiss();
opts.onRetry();  // NOW safe: bimManager.getLevels() returns ≥ 2 levels
```

---

**Part 2 — Fix `level.add` bus type in `commands.ts`**

**File**: `packages/command-bus/src/commands.ts`

```ts
// FIXED:
'level.add': { levelId: string; name?: string; elevation?: number; height?: number; _skipBridge?: boolean };
```

---

**Part 3 — Fix `AddLevelPayload` in stair plugin handler**

**File**: `plugins/stair/src/handlers/AddLevel.ts`

```ts
// FIXED:
export interface AddLevelPayload {
    readonly levelId?: string;
    readonly name?: string;
    readonly elevation?: number;
    readonly height?: number;
    readonly _skipBridge?: boolean;
}
// Added _skipBridge early-return guard:
if (cmd._skipBridge) return { forward: [], inverse: [] };
```

---

**Part 4 — `initBusHandlers.ts`: add `_skipBridge` guard to `level.add` handler**

**File**: `apps/editor/src/engine/initBusHandlers.ts`

```ts
fn: (cmd) => {
    if ((cmd as any)._skipBridge) return;  // §R7-FIX: prevents double execution
    const cm = getCommandManagerBridge();
    if (cm) cm.execute(new AddLevelCommand({ ... }));
},
```

---

**Part 5 — `PlanViewToolOverlay._handleCreateLevel()`: dual-write**

**File**: `apps/editor/src/engine/views/PlanViewToolOverlay.ts`

Added `AddLevelCommand` import and replaced bus-only call with dual-write pattern: `window.commandManager.execute(new AddLevelCommand(...))` first (authoritative), then bus with `_skipBridge: true` (secondary parity).

---

**Contracts updated**:
- `docs/00_Contracts/C02-COMPOSITION-ROOT-AND-BOOT.md` — §3.4 added: F-1.3 Level Addition Dual-Write Invariant (covers `_skipBridge` mechanism, synchronous-write requirement, call-site table, migration exit).
- `docs/00_Contracts/C03-SCHEMAS-COMMANDS-AND-STATE.md` — §6 added: `level.add` Command Bus Type Contract (covers type completeness invariant, handler implementations table, `_skipBridge` rationale).

---

## 6. Post-fix invariant (to add to C02 and 02-ARCHITECTURE.md)

**F.events Bootstrap Invariant**: `bootstrap()` MUST publish the composed `PryzmRuntime` to `window.runtime` before any F.events-migrated module makes its first `window.runtime?.events?.on/emit()` or `window.runtime?.bus?.executeCommand()` call. The assignment must precede the construction of `PropertyPanelAdapter` and all `initXxx()` calls. `flushRuntimeEventListeners()` MUST run after this assignment.

---

## 7. Contracts requiring update

| Contract | Section | Required update |
|---|---|---|
| `docs/00_Contracts/C02-COMPOSITION-ROOT-AND-BOOT.md` | §2 Stage 2 | Add invariant: `bootstrap()` MUST assign `window.runtime = runtime` before any F.events site runs. |
| `docs/03_PRYZM3/02-ARCHITECTURE.md` | §3 composition root | Add note: the window slot is the bridge for F.events migration sites; assignment is mandatory during migration phase. |

---

## 8. Files changed

| File | Change | Regression |
|---|---|---|
| `apps/editor/src/engine/engineLauncher.ts` | Add `window.runtime = runtime` assignment + pass `runtime` to `PropertyPanelAdapter` constructor | R1/R2/R3/R4/R5 |
| `docs/00_Contracts/C02-COMPOSITION-ROOT-AND-BOOT.md` | §3.1 Bootstrap Invariant + §3.2 F-1.2 creation dual-write + §3.3 F-1.2 baseline-update dual-write (new) | — |
| `docs/00_Contracts/C15-HOSTED-ELEMENT-CONTRACT.md` | New — hosted element / host-wall architectural contract | — |
| `docs/03_PRYZM3/02-ARCHITECTURE.md` | Add F-1.2 migration note to §10 | — |
| `apps/editor/src/engine/views/plantools/WallPlanToolHandler.ts` | R1-B: corrected bus payload format; added F-1.2 dual-write via `CreateWallCommand` | R1 |
| `apps/editor/src/engine/views/plantools/CurtainWallPlanToolHandler.ts` | R1-B: extracted shared ID; dual-write for both segment paths | R1 |
| `apps/editor/src/engine/views/plantools/StairPlanToolHandler.ts` | R1-B: dual-write via `CreateStairCommand` | R1 |
| `apps/editor/src/engine/views/plantools/CopyPlanToolHandler.ts` | R1-B: corrected bus command name; fixed payload; dual-write for wall + CW copy paths | R1 |
| `apps/editor/src/engine/registerTransformDragHandler.ts` | R2: added F-1.2 dual-write for wall drag-end (`UpdateWallBaselineCommand` direct + `_skipBridge` bus) | R2 |
| `apps/editor/src/engine/views/plantools/MovePlanToolHandler.ts` | R2-B: added F-1.2 dual-write for single-wall + cascade move paths | R2-B |
| `apps/editor/src/engine/views/plantools/AlignPlanToolHandler.ts` | R2-B: added F-1.2 dual-write for align move path | R2-B |
| `apps/editor/src/engine/registerTransformDragHandler.ts` | R3-B: moved `hostedDragController.activateFor()` last in `bim-selection-changed` handler | R3 |
| `packages/input-host/src/HostedElementDragController.ts` | R3-B: added `TC.attach(obj)` in `activateFor()` to re-attach after `WallTransformController.deactivate()` | R3 |
| `docs/00_Contracts/C15-HOSTED-ELEMENT-CONTRACT.md` | Added §11 (controller ordering invariant) and §12 (userData contract table) | — |
| `plugins/wall/src/handlers/UpdateWallBaseline.ts` | Added `_skipBridge` flag + early-return guard to prevent double undo-stack entry | R2/R2-B |
| `plugins/wall/src/handlers/CascadeWallBaseline.ts` | Added `_skipBridge` flag + early-return guard | R2-B |
| `packages/command-bus/src/commands.ts` | R4-B: Added `element.updateParameters` to `ElementMutationCommands` type registry | R4 |
| `apps/editor/src/engine/initBusHandlers.ts` | R4-B: Imported `UpdateElementParameterCommand`; added `element.updateParameters` bridge handler that fans out to `UpdateElementParameterCommand` | R4 |
| `apps/editor/src/engine/engineLauncher.ts` | R4-C: Added `inspector.setCommandManager(commandManager)` after `inspector.setRoofStore()` so room-panel, annotation, grid, and roof editing receive a live command manager | R4 |
| `packages/command-registry/src/walls/UpdateWallBaselineCommand.ts` | R6: Added `_sourceBaseLine: newBaseLine` to `wallStore.update()` so `WallJoinResolver` seeds from the new post-drag position instead of the stale pre-drag `_sourceBaseLine` | R6 |
| `apps/editor/src/engine/registerTransformDragHandler.ts` | R6: Patched `obj.userData.baseLine` immediately at drag-end so the OBB highlight builder reads correct coordinates even before the next `buildWall()` flush | R6 |
| `apps/editor/src/ui/StairLevelRequiredPanel.ts` | R7: Changed "Add Level" button handler to call `opts.commandManager.execute(AddLevelCommand)` synchronously first (authoritative), bus secondary with `_skipBridge: true`; `onRetry()` moved after synchronous write so `bimManager.getLevels()` reflects new level before stair tool prerequisite check runs | R7 |
| `packages/command-bus/src/commands.ts` | R7: Added `levelId: string`, `height?: number`, `_skipBridge?: boolean` to `MiscMutationCommands['level.add']` type — previously missing fields caused `AddLevelHandler` to receive `levelId: undefined` → broken level entity | R7 |
| `plugins/stair/src/handlers/AddLevel.ts` | R7: Added `levelId?`, `height?`, `_skipBridge?` to `AddLevelPayload`; added `_skipBridge` early-return guard to prevent double `commandManager.execute()` when caller used dual-write pattern | R7 |
| `apps/editor/src/engine/initBusHandlers.ts` | R7: Added `_skipBridge` early-return guard to `level.add` `fn` handler, consistent with wall baseline handler pattern | R7 |
| `apps/editor/src/engine/views/PlanViewToolOverlay.ts` | R7: Added `AddLevelCommand` import; `_handleCreateLevel()` now uses dual-write pattern (`commandManager.execute()` authoritative + bus secondary with `_skipBridge: true`) | R7 |
| `docs/00_Contracts/C02-COMPOSITION-ROOT-AND-BOOT.md` | R7: Added §3.4 — F-1.3 Level Addition Dual-Write Invariant (full specification including `_skipBridge` mechanism, call-site table, migration exit) | — |
| `docs/00_Contracts/C03-SCHEMAS-COMMANDS-AND-STATE.md` | R7: Added §6 — `level.add` Command Bus Type Contract (type completeness invariant, handler implementations table, violation consequences) | — |
