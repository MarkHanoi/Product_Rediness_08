# 36 — Phase D Ctrl-Z + Engine Cleanup Wave

> **Stamp**: 2026-05-04 (rev 3 — doc reconciliation: all 5 tasks confirmed DONE against live code) · **Status**: ✅ **DONE (2026-05-04)**
> **Authority**: `docs/00_Contracts/C03-SCHEMAS-COMMANDS-AND-STATE.md` §4 (undo ring buffer contract); `docs/00_Contracts/C10-PERFORMANCE-AND-OBSERVABILITY.md` §2 (OTel span on every public operation); `docs/00_Contracts/C04-RENDERING-AND-SCHEDULING.md` §3 (GPU picking requirement); `docs/03_PRYZM3/02-ARCHITECTURE.md` §2 (layer model) and §8 (convergence booleans).
> **Anchors**: `../00-PROCESS-TRACKER.md §SR.3` (G20 FULLY CLOSED — Wave 36 U-2 ✅ 2026-05-04); `34-HANDLER-PROTOCOL-GAP-ANALYSIS.md §5.1` (remaining `commandManager.execute()` sites); `23-L2-COMMAND-EVENT-BUS-IMPLEMENTATION-PLAN.md §0` (Phase E.5.x — P0–P11 DONE; U-3 closed 2 further sites via dual-write bridge); `35-PROJECT-ISOLATION-WAVE.md` (Wave 35 — DONE + deep audit complete; do NOT duplicate tasks I-1–I-8 here).
> **⚠ TRACKER RULE**: Any task status change in this file → update `../00-PROCESS-TRACKER.md` §7 file-status row in the same commit.
> **Effort estimate**: 1 sprint (≤ 2 engineering days). All tasks touch `src/engine/`, `packages/command-bus/`, and `packages/picking/` — no new packages, no layer-boundary changes.
> **Pre-condition**: Sprint A34 complete ✅ (`PatchPair.affectedStores` + `applyRingBufferSide` live in `@pryzm/command-bus`). Sprint A31 complete ✅ (`RingBufferUndoStack` wired to `CommandBus` via `setRingBuffer()`; `{ maxSize: 200 }` already set in `composeRuntime.ts:642`). P0–P11 complete ✅ (117/120 `commandManager.execute()` sites bridged — 2 sites remain).

---

## §0 — Pre-wave verification record

The following items were verified against the live code before this document was finalised. They are **DONE** — they must NOT be re-implemented.

| Item | Verified state | Evidence |
|---|---|---|
| `(window as any)` cast in `BatchCoordinator.ts` | **0 hits** — all calls already use typed `window.__wallRebuildControl` / `__curtainWallRebuildControl` / `__slabRebuildControl` | `rg "(window as any)" src/engine/subsystems/core/batch/BatchCoordinator.ts` → 0 |
| `RingBufferUndoStack` capacity enforcement | **Already `{ maxSize: 200 }`** in `composeRuntime.ts:642` per C03 §4.2 | `grep "new RingBufferUndoStack" packages/runtime-composer/src/composeRuntime.ts` → `{ maxSize: 200 }` |
| G19 (undo stack memory uncapped) | **CLOSED** — enforced by `maxSize: 200` in A31 | As above |

---

## §1 — Summary

Wave 36 closes five precisely-scoped gaps left open after Waves A14–A20 and the Phase E.5.x command-bus sprint (P0–P11). None are covered by Wave 35 (project isolation). All implementation prerequisites are in place.

| Gap | Root cause | Task |
|---|---|---|
| Ctrl-Z calls `commandManager.undo()` (80 ms blocking snapshot replay) | Sprint A22 deferred: `RingBufferUndoStack` + `applyRingBufferSide` are both live (A31 + A34), but the hot-key handler in `initUI.ts` was never rewired | **U-1** |
| GPU picking not routed through `SelectionManager` | Wave A16-T8 left open; `GpuPickStrategy` + `PickStrategyResolver` exist in `packages/picking/` but `SelectionManager` still calls `BVHQuery` directly | **U-2** |
| 2 remaining `commandManager.execute()` sites | P11 sprint board capped at 117/120; `engineLauncher.ts:1314` (rooms redetect bridge) + `RemoteCommandDispatcher.ts:86` (remote replay) deferred | **U-3** |
| No OTel span on the undo-apply path | C10 §2: every public runtime operation must emit a span; ring-buffer undo path from U-1 is not yet instrumented | **U-4** |
| No GA gate verifying Ctrl-Z is wired to ring buffer | `check-ctrl-z-wired.ts` does not exist; regression to `commandManager.undo()` would be silent | **U-5** |

**What this wave does not do** (explicitly out of scope):

- Wave 35 tasks I-1–I-8 (project isolation / `BatchCoordinator.forceReset()`).
- Plugin runtime wiring for the 26 non-stub plugins not yet wired at runtime (20/46).
- `runtime.events.emit` subscription in the Rooms plugin — Phase F gated.
- `src/engine/` further LOC reduction below the Wave A16 65% milestone — Post-GA PG-9.
- `RingBufferUndoStack` capacity or `(window as any)` in `BatchCoordinator` — pre-wave verified clean (§0).

---

## §2 — Root-cause map

| Gap ID | File | What is stuck | Effect |
|---|---|---|---|
| **Sprint A22** | `src/engine/subsystems/initUI.ts:2678` | `commandManager.undo()` call in Ctrl-Z handler — does full snapshot replay (≥ 80 ms blocking) | Ring buffer is populated by every `bus.dispatch()` call but never consumed on Ctrl-Z |
| **Wave A16-T8** | `src/engine/subsystems/tools/SelectionManager.ts` | `_bvhQuery` called directly; `PickStrategyResolver` (which selects GPU vs BVH) is never consulted | GPU picking O(1) ID-buffer goes unused; all picking reverts to O(n·triangles) BVH mesh scan |
| **P11 remainder** | `src/engine/engineLauncher.ts:1314` | Rooms redetect E.5.x bridge: `commandManager.execute(new ReDetectRoomsCommand(...))` not replaced | `rg "commandManager\.execute" src --type ts -c` → 2, not 0 |
| **P11 remainder** | `src/engine/subsystems/RemoteCommandDispatcher.ts:86` | Remote command replay still routed through `commandManager.execute()` | Remote commands bypass `CommandBus` — no OTel span, no ring-buffer entry, no event-log record |
| **C10 §2** | `src/engine/subsystems/initUI.ts` | No `tracer.startActiveSpan('pryzm.undo.apply', ...)` on the ring-buffer undo path added in U-1 | C10 §2 merge blocker: every public runtime operation must emit a span |
| **Gate gap** | `tools/ga-gate/` | No `check-ctrl-z-wired.ts` script | Regression to `commandManager.undo()` will be silent; no CI tripwire |

---

## §3 — Sprint task board

Execute tasks in order. U-1 must complete before U-4 (OTel span wraps the path U-1 creates). U-5 must follow U-1 + U-4. U-2 and U-3 are fully independent of each other and of U-1.

| Task | Priority | Status | Description | Key files | Done-when |
|---|:---:|:---:|---|---|---|
| **U-1** | 🔴 CRITICAL | `DONE ✅` | Wire Ctrl-Z + Ctrl-Y to `RingBufferUndoStack` via `undoPatch()` / `redoPatch()` + `applyRingBufferSide` | `src/engine/subsystems/initUI.ts` | See §4.1 |
| **U-2** | 🟠 HIGH | `DONE ✅` | Route `SelectionManager` picking through `PickStrategyResolver` (closes G20 wiring) | `src/engine/subsystems/tools/SelectionManager.ts`, `packages/picking/src/PickStrategyResolver.ts` | See §4.2 |
| **U-3** | 🟠 HIGH | `DONE ✅` | Replace last 2 `commandManager.execute()` sites: rooms-redetect bridge + remote replay | `src/engine/engineLauncher.ts`, `src/engine/subsystems/RemoteCommandDispatcher.ts` | See §4.3 |
| **U-4** | 🟡 MEDIUM | `DONE ✅` | Add OTel span `pryzm.undo.apply` wrapping the ring-buffer undo path added in U-1 | `src/engine/subsystems/initUI.ts` | See §4.4 |
| **U-5** | 🟢 LOW | `DONE ✅` | Add GA gate `check-ctrl-z-wired.ts` | `tools/ga-gate/check-ctrl-z-wired.ts`, `tools/ga-gate/run-all.ts` | See §4.5 |

---

## §4 — Task specifications

### §4.1 — Task U-1: Phase D Ctrl-Z + Ctrl-Y via `RingBufferUndoStack`

**Context**: `CommandBus.executeCommand()` already pushes a `PatchPair` (forward + inverse patches + `affectedStores`) onto `ringBuffer` after every `source: 'user'` dispatch (Sprint A31, `composeRuntime.ts:642-643`). `applyRingBufferSide(side, affectedStores, storeMap)` exists in `@pryzm/command-bus` (Sprint A34, `PatchSnapshot.ts:251`). The sole remaining step is replacing `commandManager.undo()` / `commandManager.redo()` in the hot-key handler with the ring-buffer path.

**File**: `src/engine/subsystems/initUI.ts`

**Locate the Ctrl-Z handler** (lines ~2672–2690, inside the `'keydown'` listener):

```ts
// Phase 7 — Ctrl+Z undo
if (!((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key === 'z')) return;
// ↓ BEFORE (commandManager path — 80 ms blocking snapshot replay):
commandManager.undo();
```

**Replace the `commandManager.undo()` call with**:

```ts
// Phase D — ring-buffer undo (O(1); no snapshot replay)
const rb = window.runtime?.bus?.ringBuffer;
if (rb?.canUndo()) {
  const currentPair = rb.current();           // capture affectedStores BEFORE cursor moves
  const inverseSide = rb.undoPatch();         // atomically returns inverse PatchSide + steps cursor back
  if (inverseSide && currentPair) {
    import('@pryzm/command-bus').then(({ applyRingBufferSide }) => {
      const storeMap = _buildRingBufferStoreMap();
      applyRingBufferSide(inverseSide, currentPair.affectedStores ?? [], storeMap);
      console.log('[Undo] ring-buffer undo — stores:', currentPair.affectedStores);
    });
  }
} else {
  console.debug('[Undo] ring buffer empty or unavailable — falling back to commandManager');
  commandManager.undo();  // TODO(Wave36-U1): remove after ring-buffer validation period
}
```

**Replace the `commandManager.redo()` call** (lines ~2683–2690):

```ts
// Phase D — ring-buffer redo
const rb = window.runtime?.bus?.ringBuffer;
if (rb?.canRedo()) {
  const forwardSide = rb.redoPatch();         // atomically returns forward PatchSide + advances cursor
  const currentPair = rb.current();           // cursor now points to the just-redone entry
  if (forwardSide && currentPair) {
    import('@pryzm/command-bus').then(({ applyRingBufferSide }) => {
      const storeMap = _buildRingBufferStoreMap();
      applyRingBufferSide(forwardSide, currentPair.affectedStores ?? [], storeMap);
      console.log('[Undo] ring-buffer redo — stores:', currentPair.affectedStores);
    });
  }
} else {
  commandManager.redo();  // TODO(Wave36-U1): remove after ring-buffer validation period
}
```

**Add `_buildRingBufferStoreMap()` as a module-scope helper** (not exported — L7 internal):

```ts
/**
 * Wave 36 U-1 (Phase D Ctrl-Z): builds the storeMap for `applyRingBufferSide`.
 * Keys match the `affectedStores` strings declared in each CommandHandler.
 * Stores are typed `any` in global-window.d.ts — runtime values implement `applyPatch`.
 * CONTRACT (C03 §4.1): never throws; missing stores silently skipped by applyRingBufferSide.
 */
function _buildRingBufferStoreMap(): Record<string, { applyPatch: (p: unknown[]) => void } | undefined> {
  return {
    wall:           window.wallStore,
    walls:          window.wallStore,
    slab:           window.slabStore,
    slabs:          window.slabStore,
    room:           window.roomStore,
    rooms:          window.roomStore,
    'curtain-wall': window.curtainWallStore,
    curtainWalls:   window.curtainWallStore,
    door:           window.doorStore,
    doors:          window.doorStore,
    window:         window.windowStore,
    windows:        window.windowStore,
    furniture:      window.furnitureStore,
    level:          window.levelStore,
    levels:         window.levelStore,
  };
}
```

> **Why `rb.current()` BEFORE `rb.undoPatch()`**: `undoPatch()` captures the inverse patch from `_entries[_cursor]` and then decrements cursor. `current()` after the call would return the *previous* entry. We need `affectedStores` from the *entry being undone*, so we read `current()` first. For redo: `redoPatch()` reads `_entries[_cursor + 1]` and *then* increments cursor, so `current()` after the call correctly returns the just-redone entry.

> **Fallback**: the `commandManager.undo()` / `commandManager.redo()` fallbacks remain during the validation period. They are guarded by `TODO(Wave36-U1)` comments and must be removed in the sprint immediately following validation.

> **`window.runtime` is typed `any`**: accessing `.bus?.ringBuffer` is safe — no unsafe cast needed.

**Done-when**:
1. `rg "commandManager\.undo\(\)" src/engine/subsystems/initUI.ts` → 1 hit (the fallback only, with `TODO(Wave36-U1)` comment). The unconditional call at line 2678 is gone.
2. Browser: draw a wall via Wall Tool → `[CommandBus] DISPATCH: wall.create` in console → press Ctrl-Z → `[Undo] ring-buffer undo — stores: [ 'wall' ]` in console → wall geometry disappears, no LONGTASK > 16 ms.
3. Browser: press Ctrl-Shift-Z or Ctrl-Y → wall geometry reappears.
4. `pnpm tsc --noEmit` → 0 errors.

---

### §4.2 — Task U-2: GPU picking → `SelectionManager` wiring (closes G20)

**Context**: Wave A15 delivered `packages/picking/src/gpu-pick.ts` (`GpuPickStrategy`) and `packages/picking/src/PickStrategyResolver.ts`. The resolver selects GPU vs BVH at runtime. Wave A16-T8 deferred the final step: `SelectionManager` still reaches `BVHQuery` directly (lines 115–119, 573–574, 2140–2247). C04 §3.2 requires `PickStrategyResolver` to be the ONLY place where the strategy is selected at runtime.

**File 1**: `src/engine/subsystems/tools/SelectionManager.ts`

1. Import `PickStrategyResolver` from `@pryzm/picking`:
   ```ts
   import { PickStrategyResolver } from '@pryzm/picking';
   ```
2. Add a private field and constructor parameter:
   ```ts
   private readonly _pickResolver: PickStrategyResolver | null;
   ```
3. In the raycasting sections (click path ~line 577 and hover path ~line 2144), before calling `this._bvhQuery`, add a probe:
   ```ts
   // A16-T8 completion: prefer GPU pick if resolver is available and WebGPU is live.
   if (this._pickResolver) {
     const hit = await this._pickResolver.resolvePointer(pointer, this._camera, this._scene, this._renderer);
     if (hit !== null) return hit;  // GPU path succeeded; skip BVH
     // GPU miss (e.g. hit background) — fall through to BVH for contextual picks
   }
   ```
4. Thread `new PickStrategyResolver(renderer)` from `engineLauncher.ts` or `initScene.ts` into `SelectionManager`. If the GPU renderer is not available (headless / no-GPU fallback), pass `null` — the BVH path remains active unchanged.

**Done-when**:
1. Browser (WebGPU capable): left-click an element → `[PickResolver] strategy=GPU` in console → selection highlight appears.
2. Browser (WebGL fallback): left-click → `[PickResolver] strategy=BVH` → selection still works.
3. `rg "PickStrategyResolver" src/engine/subsystems/tools/SelectionManager.ts` → ≥ 1 match.
4. `pnpm tsc --noEmit` → 0 errors.
5. G20 row in `../00-PROCESS-TRACKER.md §SR.3` updated to ✅ FULLY CLOSED.

---

### §4.3 — Task U-3: Remove last 2 `commandManager.execute()` sites

**Context**: Phase E.5.x (P0–P11) bridged 117/120 real `commandManager.execute()` sites. Two remain:

**Site 1 — `src/engine/engineLauncher.ts:1314`**: the E.5.x rooms-redetect bridge listener. When `runtime.commandBus.dispatch('rooms.redetect', ...)` fires, `BatchCoordinator` emits a `pryzm-bus-rooms-redetect` CustomEvent; this listener dynamically imports `ReDetectRoomsCommand` and runs `commandManager.execute(new ReDetectRoomsCommand(...))`. Bridge to use `runtime.commandBus.dispatch` directly:

```ts
// BEFORE:
commandManager.execute(new ReDetectRoomsCommand(levelId, elevation ?? 0, height ?? 3.0));

// AFTER (dispatch directly — handler already exists in plugins/rooms/):
window.runtime?.bus?.dispatch('rooms.redetect', {
  levelId,
  elevation: elevation ?? 0,
  height:    height ?? 3.0,
}).catch((err: unknown) => {
  console.error('[E.5.x Bridge] rooms.redetect bus dispatch failed:', err);
});
```

The `RedetectRoomsHandler` (registered in the rooms plugin) already handles this command type (wired in P2f). Verify `registry.has('rooms.redetect')` → true before removing the fallback.

**Site 2 — `src/engine/subsystems/RemoteCommandDispatcher.ts:86`**: remote command replay. The dispatcher receives serialized commands from the collaboration layer and replays them locally. Replace the `commandManager.execute()` call with a bus dispatch:

```ts
// BEFORE:
const result = this.commandManager.execute(command, { source: 'REMOTE' });

// AFTER:
const ok = await window.runtime?.bus?.dispatch(
  (command as { type: string }).type,
  (command as { payload: unknown }).payload,
  { source: 'REMOTE' },
).then(() => true).catch(() => false);
if (!ok) {
  console.warn('[RemoteCommandDispatcher] Bus dispatch failed — command type not registered:', serialized.type);
  return 'validation-failed';
}
```

> **Caution**: `RemoteCommandDispatcher` replays commands for element families that may not yet have bus handlers registered (families outside the P2a–P2f coverage). Add a `registry.has(type)` guard before dispatching; if the type is not registered, fall back to `commandManager.execute()` with a `TODO(Wave36-U3)` comment for the specific unregistered family.

**Done-when**:
1. `rg "commandManager\.execute" src --type ts -c | awk -F: '{s+=$2} END {print s}'` → ≤ 1 (only deliberate WallTool P2b dual-write scaffold if not yet cleaned; otherwise 0).
2. `pnpm tsc --noEmit` → 0 errors.
3. Browser: open a project, draw a wall, switch levels — rooms redetect fires via bus (`[CommandBus] DISPATCH: rooms.redetect` in console).
4. Collaboration: a remote command dispatched by a peer appears locally.

---

### §4.4 — Task U-4: OTel span `pryzm.undo.apply`

**Context**: C10 §2 (merge blocker): "Every new exported function MUST add ≥ 1 OpenTelemetry span." The ring-buffer undo path added in U-1 is a new user-triggered runtime operation. Span name follows the `pryzm.<package>.<operation>` convention (C10 §2.1).

**File**: `src/engine/subsystems/initUI.ts` — wrap the U-1 undo handler body inside a span:

```ts
import { trace, SpanStatusCode } from '@opentelemetry/api';

// In Ctrl-Z handler, after the ring-buffer path is confirmed available:
const tracer = trace.getTracer('pryzm-engine');
tracer.startActiveSpan('pryzm.undo.apply', (span) => {
  try {
    span.setAttribute('pryzm.undo.affectedStores', (currentPair.affectedStores ?? []).join(','));
    span.setAttribute('pryzm.undo.side', 'inverse');
    applyRingBufferSide(inverseSide, currentPair.affectedStores ?? [], storeMap);
    span.end();
  } catch (err) {
    span.recordException(err as Error);
    span.setStatus({ code: SpanStatusCode.ERROR });
    span.end();
  }
});
```

Similarly wrap the redo path with `span.setAttribute('pryzm.undo.side', 'forward')`.

Import `trace` and `SpanStatusCode` from `'@opentelemetry/api'` — already a direct dependency of `src/`.

**Done-when**:
1. `rg "pryzm\.undo\.apply" src/engine/subsystems/initUI.ts` → ≥ 1 match.
2. `pnpm tsc --noEmit` → 0 errors.
3. OTel span count updated in `../00-PROCESS-TRACKER.md §SR.1`: 183 → 184.

---

### §4.5 — Task U-5: GA gate `check-ctrl-z-wired.ts`

**Purpose**: prevent silent regression to `commandManager.undo()` in the Ctrl-Z handler after the `TODO(Wave36-U1)` fallback is removed.

**New file**: `tools/ga-gate/check-ctrl-z-wired.ts`

```ts
#!/usr/bin/env npx tsx
/**
 * GA gate: check-ctrl-z-wired
 * Verifies that the Ctrl-Z keyboard handler in initUI.ts uses the
 * ring-buffer path (undoPatch) rather than commandManager.undo() unconditionally.
 * Authority: C03 §4 (undo ring buffer), Wave 36 U-5.
 */
import { execSync } from 'child_process';

const TARGET = 'src/engine/subsystems/initUI.ts';
let exitCode = 0;

// Check 1 — ring-buffer undoPatch call must be present
const undoPatchCount = Number(
  execSync(`rg -c "undoPatch\\(\\)" "${TARGET}" || echo 0`, { encoding: 'utf8' }).trim(),
);
if (undoPatchCount === 0) {
  console.error(`[FAIL] check-ctrl-z-wired: no undoPatch() call found in ${TARGET}. Ring-buffer Ctrl-Z path missing — see Wave 36 U-1.`);
  exitCode = 1;
} else {
  console.log(`[PASS] check-ctrl-z-wired: undoPatch() present in ${TARGET} (${undoPatchCount} calls)`);
}

// Check 2 — unconditional commandManager.undo() must be absent (fallback is guarded by if/else)
const rawHits = execSync(`rg -n "commandManager\\.undo\\(\\)" "${TARGET}" || true`, { encoding: 'utf8' }).trim();
const unconditionalHit = rawHits.split('\n').find(line => !line.includes('TODO(Wave36') && line.trim() !== '');
if (unconditionalHit) {
  console.error(`[FAIL] check-ctrl-z-wired: unconditional commandManager.undo() found in ${TARGET}:\n  ${unconditionalHit}\n  Replace with ring-buffer path per Wave 36 U-1.`);
  exitCode = 1;
} else {
  console.log(`[PASS] check-ctrl-z-wired: no unconditional commandManager.undo() in ${TARGET}`);
}

process.exit(exitCode);
```

**Update**: `tools/ga-gate/run-all.ts` — add `'check-ctrl-z-wired'` to the scripts array.

**Update**: `docs/03_PRYZM3/04-PLAN-FORWARD/14-VERIFIERS-CATALOG.md` — add row for `check-ctrl-z-wired` with threshold description.

**Done-when**:
1. `npx tsx tools/ga-gate/check-ctrl-z-wired.ts` exits 0.
2. `npx tsx tools/ga-gate/run-all.ts` exits 0 (all gates green).

---

## §5 — Verification gates

Run in order after all 5 tasks complete.

```bash
# Gate 1 — commandManager.undo() is only in the guarded fallback (not unconditional)
npx tsx tools/ga-gate/check-ctrl-z-wired.ts
# → exits 0

# Gate 2 — commandManager.execute() count at or below 1
rg "commandManager\.execute" src --type ts -c \
  | awk -F: '{s+=$2} END {print s}'
# → ≤ 1

# Gate 3 — PickStrategyResolver wired in SelectionManager
rg "PickStrategyResolver" src/engine/subsystems/tools/SelectionManager.ts
# → ≥ 1 match

# Gate 4 — OTel span present
rg "pryzm\.undo\.apply" src/engine/subsystems/initUI.ts
# → ≥ 1 match

# Gate 5 — GA gate suite green
npx tsx tools/ga-gate/run-all.ts
# → exits 0

# Gate 6 — TypeScript clean
pnpm tsc --noEmit
# → exits 0

# Gate 7 — build clean
pnpm run build
# → exits 0
```

**Browser verification** (human in the loop — Chromium with DevTools open):

1. Draw a wall (Wall Tool). Confirm `[CommandBus] DISPATCH: wall.create` in console.
2. Press Ctrl-Z. Confirm `[Undo] ring-buffer undo — stores: [ 'wall' ]`, wall disappears, no LONGTASK > 16 ms in Performance panel.
3. Press Ctrl-Shift-Z. Confirm wall reappears (`[Undo] ring-buffer redo`).
4. Left-click an element. Confirm selection highlight + `[PickResolver] strategy=GPU` (WebGPU) or `strategy=BVH` (fallback).
5. Open DevTools → Network → confirm OTel export contains span `pryzm.undo.apply` with `pryzm.undo.affectedStores` attribute.

---

## §6 — Risk register

| Risk | Probability | Impact | Mitigation |
|---|:---:|:---:|---|
| `affectedStores` key mismatch — handler declares `'wall'` but global is `wallStore` (not `wall`) | 🟠 High | 🟡 Medium | `_buildRingBufferStoreMap()` maps both singular and plural forms (e.g. `wall` + `walls`) to the same store reference. Audit each handler's `affectedStores` declarations at implementation time. |
| `RingBufferUndoStack` not yet populated for commands dispatched before U-1 lands | 🟡 Medium | 🟢 Low | Ring buffer fallback: `if (!rb?.canUndo()) commandManager.undo()` — the legacy path remains active during the validation period. |
| `RemoteCommandDispatcher` dispatches a command type not yet in the bus registry | 🟠 High | 🟡 Medium | `registry.has(type)` guard in U-3 site 2; unregistered families fall back to `commandManager.execute()` with a `TODO` comment. |
| `PickStrategyResolver` throws on non-WebGPU browser | 🟠 High | 🟡 Medium | Resolver already has BVH fallback; wrap resolver call in try/catch in `SelectionManager`; `null` resolver → BVH-only path (unchanged). |
| OTel `trace.getTracer` not initialized when Ctrl-Z fires before engine boot | 🟢 Low | 🟢 Low | `@opentelemetry/api` returns a no-op tracer when not configured — never throws. |

---

## §7 — Files changed

| File | Change type | Task |
|---|---|---|
| `src/engine/subsystems/initUI.ts` | Edit — replace unconditional `commandManager.undo/redo()` with ring-buffer path + guarded fallback + OTel span | U-1, U-4 |
| `src/engine/engineLauncher.ts` | Edit — bridge `commandManager.execute(new ReDetectRoomsCommand(...))` at line 1314 → `runtime.bus.dispatch('rooms.redetect', ...)` | U-3 |
| `src/engine/subsystems/RemoteCommandDispatcher.ts` | Edit — bridge `commandManager.execute(command, { source: 'REMOTE' })` at line 86 → `runtime.bus.dispatch(type, payload, { source: 'REMOTE' })` with `registry.has()` guard | U-3 |
| `src/engine/subsystems/tools/SelectionManager.ts` | Edit — add `PickStrategyResolver` import + probe before BVH call on click + hover paths | U-2 |
| `tools/ga-gate/check-ctrl-z-wired.ts` | New — GA gate script | U-5 |
| `tools/ga-gate/run-all.ts` | Edit — register `check-ctrl-z-wired` | U-5 |
| `docs/03_PRYZM3/04-PLAN-FORWARD/14-VERIFIERS-CATALOG.md` | Edit — add `check-ctrl-z-wired` row | U-5 |
| `docs/03_PRYZM3/00-PROCESS-TRACKER.md` | Edit — §7 file-status row rev to 5 tasks; §SR.3 G19 → ✅ CLOSED; G20 → ✅ FULLY CLOSED after U-2; OTel count 183 → 184 | U-2, U-4 |

**New packages created**: none.
**Layer-boundary changes**: none.
**Contracts amended**: none (C03 §4.2, C04 §3, C10 §2 clauses already committed in prior waves).
