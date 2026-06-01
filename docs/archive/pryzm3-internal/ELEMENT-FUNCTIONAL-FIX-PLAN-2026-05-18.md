# ELEMENT FUNCTIONAL FIX PLAN — 2026-05-18

**Status:** COMPLETE — all FT1–FT7 delivered  
**Created:** 2026-05-18  
**Supersedes:** Nothing — this is a NEW plan complementing `ELEMENT-OPERATIONS-IMPL-PLAN-2026-05-17.md`.

> **Scope**: This plan addresses functional correctness and performance bugs in element
> create/delete/move/undo/redo paths that were NOT in scope for the PRYZM3 architectural
> migration (IMPL-PLAN-2026-05-17). That plan achieved its goal (commandManager → bus
> migration, ratchet gates). These are the next-layer issues: the bus dispatches correctly
> but the 3D render chain or runtime behaviour is broken.

> **Legend:** ✅ DONE — ▶️ IN PROGRESS — 🔲 NOT STARTED — ⏸ DEFERRED

---

## 0. Issue Summary Table

| ID | Element | Symptom | Severity | Status |
|----|---------|---------|----------|--------|
| F1 | Slab | Plan view preview ✅, 3D creation ❌, plan view actual creation ❌ | Critical | ✅ |
| F2 | Beam | Plan view preview ✅, 3D creation ❌, plan view actual creation ❌ | Critical | ✅ |
| F3 | Column | Plan view preview ✅, creation missing in plan view ❌ | High | ✅ |
| F4 | Roof | Plan view preview ✅, 3D creation ❌, plan view actual creation ❌ | High | ✅ |
| F5 | Stair | Preview ✅, crashes on confirmation: `stairId undefined` at `StairRailingBuilder.ts:23` | Critical | ✅ |
| F6 | Wall (hosted) | Wall with door/window hosted reverts to original position after move | High | ✅ |
| F7 | Curtain Wall | Batch colour/material update extremely slow vs `CreateCurtainWallsOnAllSlabs` | Medium | ✅ |

---

## 1. Contract & Architecture References

These issues must be fixed within the following constraints:

| Contract / Principle | Relevance |
|----------------------|-----------|
| **C11 §5.2** — typed domain events MUST flow through `runtime.events` | F1, F2, F3, F4: bridge pattern |
| **ADR-002 §2** — handlers are pure; no direct `runtime.events` calls from L4 handlers | F1, F2: `CommandEventBridge` is the correct enrichment point |
| **C14 §3** — legacy stores are transitional; the bus+bridge pattern is the correct migration path | F1, F2, F3, F4 |
| **C15 §8** — hosted-element dual-store rule; doors/windows must follow parent wall baseline | F6 |
| **C15 §13** — dispatch resilience; bus failures must log loudly, not swallow silently | F1–F4 |
| **P6** — commands are the only mutation path | F7: batch handler, not direct store writes |
| **§WALL-DEEP-2026 B2** — `BaselineReversalError` guard prevents endpoint-swap corruptions | F6: must preserve guard, fix drag path |

---

## 2. Root Cause Analysis

### F1 — Slab 3D creation

**Dispatch chain (current — broken)**:
```
SlabPlanToolHandler.ts
  → bus.executeCommand('slab.create', { id, levelId, polygon: [{x,y:worldZ}], position:{0,0,0}, thickness, ... })
  → CreateSlabHandler.execute()           ← writes to Immer slab store ✅
  → CommandBus.patches fires              ✅
  → CommandEventBridge 'slab.create' case:
      events.emit('slab.created', {
        commandId, commandType, levelId, elementCount: 1
        // ← NO geometry fields (id, polygon, boundary, thickness, baseOffset)
      })
  → initTools.ts: NO subscriber for 'slab.created'  ← MISSING
  → SlabStore.add() never called          ← legacy store never updated
  → bim-slab-added never fires            ← 3D builder never triggers
  → SlabFragmentBuilder: no mesh          ← nothing appears in 3D
```

**Root causes (two parts, both required)**:
1. `CommandEventBridge.ts` `'slab.create'` case emits a **minimal payload** (no geometry). It must be enriched to include `id`, `polygon`/`boundary`, `thickness`, `baseOffset`, `materialId` from `record.payload` — same pattern as `'roof.create'` and `'column.create'` cases.
2. `initTools.ts` has **no `runtime.events.on('slab.created')` subscriber**. One must be added to mirror the event into `SlabStore.add()` — same pattern as the `'roof.created'` and `'column.created'` bridges already present in that file.

**What `SlabStore.add()` needs**:
The legacy `SlabStore.add()` signature expects a `SlabData`-compatible object:
```typescript
{
  id, type: 'slab', levelId,
  boundary: { polygon: [number,number][], centroid: [number,number] },
  thickness, baseOffset,
  ifcData: { guid, ifcClass: 'IfcSlab' }
}
```
The payload includes `polygon: [{x, y: worldZ}]` with `position: {0,0,0}` — the polygon vertices ARE world-space (the `y` field = `worldZ` from the plan tool). The bridge must reconstruct `boundary.polygon` as `[x, y]` pairs (x=polygon[i].x, y=polygon[i].y) and compute centroid.

---

### F2 — Beam 3D creation

**Dispatch chain (current — broken)**:
```
BeamPlanToolHandler.ts
  → bus.executeCommand('beam.create', { startPoint, endPoint, width, depth, levelId })
  → CreateBeamHandler.execute()           ← writes to Immer beam store ✅
  → CommandBus.patches fires              ✅
  → CommandEventBridge 'beam.create' case:
      events.emit('beam.created', {
        commandId, commandType, levelId, elementCount: 1
        // ← NO geometry fields (id, baseLine, shape, width, depth)
      })
  → initTools.ts: NO subscriber for 'beam.created'  ← MISSING
  → BeamStore.add() never called          ← legacy store never updated
  → bim-beam-added never fires            ← 3D builder never triggers
  → BeamFragmentBuilder: no mesh
```

**Root causes (two parts)**:
1. `CommandEventBridge.ts` `'beam.create'` case emits minimal payload. Must be enriched with `id`, `baseLine` (reconstructed from `startPoint`/`endPoint`), `shape`, `width`, `depth`, `materialId`.
   
   **Important**: `BeamPlanToolHandler` passes `startPoint`/`endPoint` but `BeamStore` expects `baseLine: [{x,y,z},{x,y,z}]`. The bridge must reconstruct `baseLine` from `startPoint` + `endPoint`.

2. `initTools.ts` has **no `runtime.events.on('beam.created')` subscriber**. Must be added.

---

### F3 — Column not creating in plan view

**Dispatch chain (current — architecturally complete but unverified)**:
```
ColumnPlanToolHandler.ts
  → bus.executeCommand('column.create', { id, origin:{x,0,z}, height, rotation,
                                          shape, width, depth, baseOffset, levelId })
  → CreateColumnHandler.execute()         ← Zod Column.parse(seed)
  → CommandBus.patches                    ✅
  → CommandEventBridge 'column.create':
      emits 'column.created' with { id, origin, shape, width, depth, height, ... }  ✅ (enriched)
  → initTools.ts 'column.created' subscriber:
      columnStore.add({ position: ev.origin, profile: ev.shape, ... })              ✅ (bridge exists)
  → bim-column-added fires                ← ColumnFragmentBuilder should trigger
```

The chain is **architecturally complete**. The likely failure modes are:
- `Column.parse(seed)` Zod schema throws (schema validation error silently caught in handler try/catch)
- `columnStore.add()` throws in the `try/catch` in the bridge subscriber

**Action**: Verify by checking browser console for `[column.create failed]` or `[initTools] §P3.3-CO: failed to mirror column`. Add more diagnostic logging at each step. Root-fix any schema/validation failure found.

---

### F4 — Roof not creating in 3D

**Dispatch chain (current — architecturally complete but unverified)**:
```
RoofPlanToolHandler.ts
  → bus.executeCommand('roof.create', { id, levelId, boundary:[{x,0,z}], shape, overhang, thickness })
  → CreateRoofHandler.execute()           ← Roof.parse(seed)
  → CommandBus.patches                    ✅
  → CommandEventBridge 'roof.create':
      emits 'roof.created' with { id, boundary, shape, overhang, thickness }        ✅ (enriched)
  → initTools.ts 'roof.created' subscriber:
      recomputes centroid-local polygon → roofStore.add({ footprint: {polygon, centroid}, ... }) ✅
```

The chain is **architecturally complete**. The likely failure modes are:
- `Roof.parse(seed)` Zod schema: the `CreateRoofPayload` may not map to `RoofData` fields correctly (e.g. `boundary` is a plan-tool-side field, `RoofData` may use `footprint` internally)
- The `boundary` field from the tool is `Array<{x,y,z}>` but the handler's `seed` may not include it (if the handler builds from `footprint.polygon` not `boundary`)
- The `initTools.ts` bridge guard `if (!ev.boundary || ev.boundary.length < 3)` returns early if `CommandEventBridge` emits `boundary: undefined`

**Action**: Read `CreateRoofHandler.execute()` fully to trace the seed fields, verify `CommandEventBridge` `record.payload` includes `boundary`, check initTools.ts guard condition.

---

### F5 — Stair crash: `stairId undefined` at `StairRailingBuilder.ts:23`

**Stack trace**:
```
StairRailingBuilder.ts:23        ← railing.stairId is undefined
StairRailingStore.add:31         ← emits 'bim-stair-railing-added'
CreateStairRailingCommand:110    ← command succeeds but stairId missing
CommandManager.execute:130       ← bridge path
CreateStairRailing.ts:46         ← handler calls cm.execute(new CreateStairRailingCommand(cmd))
```

**Root cause**: `CreateStairRailingPayload.stairId` is typed as `readonly stairId?: string` (optional).
The handler passes `cmd as any` directly to `CreateStairRailingCommand` without validating that `stairId` is present. `StairRailingBuilder` line 23:
```typescript
const stair = this.resolveStair(railing.stairId);  // ← crashes if stairId undefined
```
There is no null guard — `resolveStair(undefined)` returns `undefined`, and the `if (stair)` check on line 24 *should* be safe, but the crash suggests `railing.stairId` is literally `undefined` when passed to `resolveStair`, and `resolveStair` itself may be throwing.

**Fix strategy (two parts)**:
1. `CreateStairRailingHandler.canExecute()`: add validation `if (!cmd.stairId) return { valid: false, reason: 'stairId is required' }`. This prevents the crash by blocking the dispatch if stairId is missing.
2. `StairRailingBuilder.ts:23`: add null guard `if (!railing.stairId) { console.error('[StairRailingBuilder] stairId missing in railing', railing); return; }` — defence in depth.

---

### F6 — Wall reverts to original position when moved (hosted door/window)

**Root cause**: `WallStore.update()` throws `BaselineReversalError` (defined in `packages/geometry-wall/src/errors.ts`) when ALL of:
- The wall has `openings.length > 0` (hosted doors or windows)
- The new `baseLine` has endpoints in **reversed order** compared to the stored baseLine

From `WallStore.ts` §WALL-DEEP-2026 B2 guard:
```typescript
if (safeUpdates.baseLine && (wall.openings?.length ?? 0) > 0
    && /* dot product of old and new direction vectors is negative */ ) {
    throw new BaselineReversalError(
        `direction on wall ${wallId} which hosts ${wall.openings!.length} openings`
    );
}
```
When the drag computes a new `baseLine`, in certain drag directions / snap combinations the endpoint order is computed with `[1]` and `[0]` swapped relative to the original. With no hosted elements, this is harmless (wall is symmetric). With hosted elements, offset positions are measured from endpoint `[0]`, so endpoint-swap corrupts all opening positions — the guard correctly blocks this.

**The bug**: the drag path (`registerTransformDragHandler.ts` / `MovePlanToolHandler.ts`) does not normalise baseLine direction before calling `UpdateWallBaselineCommand`. When the user moves a wall by dragging in a direction that happens to flip the computed start/end ordering, the command is rejected and the visual reverts.

**Fix strategy**: In `UpdateWallBaselineCommand.execute()`, before calling `wallStore.update()`, normalise the incoming `newBaseLine` to preserve the same directional ordering as the stored baseLine. Specifically:
1. Compute the dot product of `newBaseLine` direction vs stored `baseLine` direction.
2. If dot product < 0 (endpoints reversed), swap `newBaseLine[0]` and `newBaseLine[1]` before passing to `wallStore.update()`.
3. This preserves endpoint ordering → `BaselineReversalError` no longer fires → hosted elements keep correct offsets.

The `BaselineReversalError` guard in `WallStore` is **correct and must be preserved** — the fix is in the command, not the store.

---

### F7 — Batch curtain wall colour/material update is slow

**Root cause**: `plugins/curtain-wall/src/handlers/UpdateCurtainWall.ts` is a **bridge handler**:
```typescript
cm.execute(new UpdateCurtainWallCommand({ id: cmd.id, updates: cmd.updates }));
```
Each call:
- Fires one `UpdateCurtainWallCommand`
- Triggers `WallFragmentBuilder` to rebuild the entire curtain wall mesh
- For a batch-update of N panels (e.g. "change all panel materials"), this runs N × full rebuild

`CreateCurtainWallsOnAllSlabs` is fast because it has a real batch handler that:
1. Collects all changes into one operation
2. Fires a single rebuild at the end

**Fix strategy**:
1. Create a `curtainwall.batch.update` bus command type (add to `packages/command-bus/src/commands.ts`).
2. Implement `UpdateCurtainWallBatchHandler` in `plugins/curtain-wall/src/handlers/` that:
   - Accepts `{ updates: Array<{ id: string; updates: Record<string,unknown> }> }`
   - Applies all updates to the Immer curtain wall store in one `produceCommand` call
   - Returns a single `HandlerResult` with all `affectedStores: ['curtainWall']`
3. Wire the handler in `registerCurtainWallHandlers()` in `engineLauncher.ts`.
4. In the UI/AI layer (`PropertyInspector`, `AIService`), replace sequential `curtainwall.update` × N with a single `curtainwall.batch.update`.

Performance target: ≤ 1 second for batch-updating all curtain wall panels' material, matching `CreateCurtainWallsOnAllSlabs` performance.

---

## 3. Fix Tasks (Ordered by Severity)

| ID | Task | Files | Acceptance Criterion | Status |
|----|------|-------|---------------------|--------|
| **FT1** | Enrich `CommandEventBridge` `slab.create` case + add `initTools.ts` bridge | `packages/runtime-composer/src/CommandEventBridge.ts`, `apps/editor/src/engine/initTools.ts` | Slab appears in plan view and 3D after creation; `slabStore.add()` called with correct boundary | ✅ |
| **FT2** | Enrich `CommandEventBridge` `beam.create` case + add `initTools.ts` bridge | `packages/runtime-composer/src/CommandEventBridge.ts`, `apps/editor/src/engine/initTools.ts` | Beam appears in plan view and 3D; `beamStore.add()` called with correct baseLine | ✅ |
| **FT3** | Diagnose and fix stair railing crash | `plugins/stair/src/handlers/CreateStairRailing.ts`, `packages/geometry-stair/src/StairRailingBuilder.ts` | Stair preview + creation completes without crash; `stairId` validation blocks dispatch if missing | ✅ |
| **FT4** | Fix wall baseline normalisation for hosted elements | `packages/command-registry/src/walls/UpdateWallBaselineCommand.ts` | Wall with hosted door/window can be moved; `BaselineReversalError` guard preserved | ✅ |
| **FT5** | Diagnose column creation failure (verify chain + fix root cause) | `plugins/column/src/handlers/CreateColumn.ts`, `apps/editor/src/engine/initTools.ts` | Column appears in plan view and 3D after creation | ✅ |
| **FT6** | Diagnose roof creation failure (verify chain + fix root cause) | `plugins/roof/src/handlers/CreateRoof.ts`, `apps/editor/src/engine/initTools.ts` | Roof appears in plan view and 3D after creation | ✅ |
| **FT7** | Implement `curtainwall.batch.update` command + handler | `packages/command-bus/src/commands.ts`, `plugins/curtain-wall/src/handlers/UpdateCurtainWallBatch.ts`, `plugins/curtain-wall/src/handlers/index.ts` | Batch colour/material update of all curtain walls completes in ≤ 1 second | ✅ |

---

## 4. Execution Order & Dependencies

```
FT3 (stair crash)       — independent, no deps, safe to start first
FT1 (slab bridge)       — independent, no deps
FT2 (beam bridge)       — independent, no deps
  │
  └── after FT1+FT2: validate end-to-end in browser
FT4 (wall baseline)     — independent, no deps
FT5 (column diagnose)   — may share bridge fix with FT1/FT2 if root cause is same
FT6 (roof diagnose)     — may share fix with FT5
FT7 (batch perf)        — independent, no deps
```

All tasks are independent. FT1 and FT2 share the same file pair (`CommandEventBridge.ts` + `initTools.ts`) and should be done in a single atomic task to avoid double-editing those files.

---

## 5. Acceptance Criteria (Plan Level)

This plan is **COMPLETE** when:
- [x] FT1: Slab appears in plan view and 3D immediately after creation via `SlabPlanToolHandler`
- [x] FT2: Beam appears in plan view and 3D immediately after creation via `BeamPlanToolHandler`
- [x] FT3: Stair preview→creation completes without `stairId undefined` crash
- [x] FT4: Wall with hosted door/window can be moved; no reversion
- [x] FT5: Column appears in plan view after creation via `ColumnPlanToolHandler`
- [x] FT6: Roof appears in plan view and 3D after creation via `RoofPlanToolHandler`
- [x] FT7: Batch curtain wall material update ≤ 1 second
- [x] `pnpm run build` exits 0 after each task (verified: ✓ 3009 modules transformed)
- [x] No new `(window as any)` violations introduced
- [x] `pnpm run check:commandmanager` threshold not increased (held at 56)

---

## 6. What Is NOT in This Plan

- B3.3-ST (Stairs full bus migration) — deferred, schema mismatch, dedicated enrichment task
- B3.4-OP (Structural Openings) — deferred, no typed handler, dedicated task
- TASK-08 (store injection into plan-tool draw contexts) — separate scope
- Undo/redo correctness for F1–F4 elements after the bridge is added — post-bridge follow-up
- Delete / modification paths for F1–F4 (create is the blocker; delete/update follow the same bridge pattern once create is confirmed working)

---

*Last updated: 2026-05-18 | Author: PRYZM Agent | Contract refs: C11, C14, C15, ADR-002, P6, §WALL-DEEP-2026*
