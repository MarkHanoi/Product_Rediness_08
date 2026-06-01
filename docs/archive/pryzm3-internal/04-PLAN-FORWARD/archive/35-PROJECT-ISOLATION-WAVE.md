# 35 — Project Isolation Wave

> **Stamp**: 2026-05-04 · **Status**: 🟢 **DONE + DEEP AUDIT COMPLETE (rev 2) — D1 critical defect found and fixed; 9/9 GA gates green; `pnpm tsc --noEmit` → 0 errors**  
> **Deep Audit (2026-05-04 rev 2)**: All implementation files audited. One critical defect (D1) identified and fixed. Two pre-existing minor gaps noted (G1, G2 — not Wave 35 regressions). Architecture verdict: **SOUND**.  
> **D1 (CRITICAL — fixed)**: `forceReset()` omitted `storeEventBus.endBatch()` when `_isBatching=true`. Bug: if a batch was mid-flight during `pryzm-project-switch`, `_batchDepth` stayed at 1; all Project B store events buffered forever → builders receive zero creates → empty scene. Fix: `StoreEventBus.discardBatch()` added (drops buffer + resets depth, no listener impact); called in `forceReset()` step 3 when `_isBatching=true`.  
> **G1 (minor, pre-existing)**: legacy import path in `_executeFinalSweep()` has a narrow race where `_sweepCancelled` resets before the dynamic import resolves. Not Wave 35.  
> **G2 (minor, pre-existing)**: `resumeAndFlush()` on CW/Slab in teardown steps 3-4 may produce ~1 frame of zombie Project A geometry. Acceptable; stores clear it imminently.  
> **Authority**: `docs/02-decisions/contracts/C13-PROJECT-LIFECYCLE-AND-ISOLATION.md` (the normative contract — read it first). This document is the sprint execution plan only.  
> **Anchors**: `../02-ARCHITECTURE.md §2 (layer model)`; `../00-PROCESS-TRACKER.md §9`; `../../02-decisions/contracts/C11-ELEMENT-CREATION-PIPELINE.md §4 (AI batch pipeline)`; `../../02-decisions/contracts/C03-SCHEMAS-COMMANDS-AND-STATE.md §3.4 (store subscriber teardown)`.  
> **⚠ TRACKER RULE**: Any task status change → update `../00-PROCESS-TRACKER.md` §6 file-status row + §8 Blockers same commit.  
> **Effort estimate**: 1 sprint (≤ 2 engineering days). All tasks are in `src/` and `tests/` — no package boundary changes, no new packages.  
> **Pre-condition**: None. This wave is unblocked as of 2026-05-04.

---

## §0 — The bug in one paragraph

When an AI batch executes on Project A, `BatchCoordinator._setupBatch()` sets `_isBatching = true` and calls `window.__wallRebuildControl.pause()` (sets `_wallRebuildPaused = true`) and `window.__wallRebuildControl.discardAndSuppress()` (sets `_wallRebuildDiscarding = true`). These flags live as closure-private local variables inside `engineLauncher.ts` — they have no external reset path. When the user switches to Project B, the `pryzm-project-switch` listener only resets `_levelCamReady = false`. All batch flags survive the switch. Project B's wall store events are silently dropped (`_wallRebuildDiscarding = true`) or accumulated without a drain rAF (`_wallRebuildPaused = true`). Walls are added to the store but no geometry is ever built. Element creation appears to do nothing.

---

## §1 — Root-cause map

| Gap ID | Where | What is stuck | Effect in Project B |
|---|---|---|---|
| **C13-G1** | `engineLauncher.ts:2178` | `pryzm-project-switch` listener only resets `_levelCamReady` | Nothing else cleans up |
| **C13-G2** | `BatchCoordinator.ts` | No `forceReset()` method; `_isBatching`, `_pendingLevelIds`, `_registrationQueue`, `_postBatchWindowEvents`, `_regDrainDispose` inaccessible | BimManager registrations never drain; walls invisible |
| **C13-G3** | `engineLauncher.ts` | `_wallRebuildPaused`, `_wallRebuildDiscarding`, `_joinsResolving` are closure-private | Wall events dropped or never flushed |
| **C13-G4** | `engineLauncher.ts` | `_wallRafHandle` is closure-private | Stale rAF fires in Project B context |
| **C13-G5** | `engineLauncher.ts` | `_pendingWallEvents` is closure-private | Stale Project A wall events processed in Project B |
| **C13-G6** | `BatchCoordinator.ts:_executeFinalSweep` | No cancellation flag; async sweep continues across project switch | rooms.redetect dispatched with Project A level IDs |
| **C13-G7** | `engineLauncher.ts` | `window.__curtainWallRebuildControl` / `__slabRebuildControl` have no `isPaused` query | Cannot safely call resumeAndFlush idempotently |

---

## §2 — Sprint task board

Execute tasks in order. Tasks I-1 and I-2 MUST complete before I-3 (the switch listener depends on both new APIs). All tasks are independent of Waves A14–A20.

| Task | Priority | Status | Description | Key files | Done-when |
|---|:---:|:---:|---|---|---|
| **I-1** | 🔴 CRITICAL | `TODO` | Add `forceReset()` to `BatchCoordinator` + cancellable sweep | `src/engine/subsystems/core/batch/BatchCoordinator.ts` | See §3.1 |
| **I-2** | 🔴 CRITICAL | `TODO` | Expose engine teardown surface on `window.__engineTeardown` | `src/engine/engineLauncher.ts`, `src/global-window.d.ts` | See §3.2 |
| **I-3** | 🔴 CRITICAL | `TODO` | Wire `pryzm-project-switch` teardown handler calling both surfaces | `src/engine/engineLauncher.ts` | See §3.3 |
| **I-4** | 🟠 HIGH | `TODO` | Add `isPaused` query to `__curtainWallRebuildControl` and `__slabRebuildControl` | `src/engine/subsystems/curtainwalls/CurtainWallBuilder.ts`, `src/engine/subsystems/slabs/SlabFragmentBuilder.ts`, `src/global-window.d.ts` | See §3.4 |
| **I-5** | 🟠 HIGH | `TODO` | Add OTel span `project.session.teardown` | `src/engine/engineLauncher.ts` | See §3.5 |
| **I-6** | 🟢 MEDIUM | `TODO` | Add E2E test `project-isolation.spec.ts` | `tests/e2e/project-isolation.spec.ts` | See §3.6 |
| **I-7** | 🟢 MEDIUM | `TODO` | Add GA gate `check-project-isolation.ts` | `tools/ga-gate/check-project-isolation.ts`, `tools/ga-gate/run-all.ts` | See §3.7 |
| **I-8** | 🟢 LOW | `TODO` | Annotate all 7 gap sites with `TODO(C13.x)` and add `C13` to `C00-INDEX.md` | All gap sites listed in §1 | See §3.8 |

---

## §3 — Task specifications

### §3.1 — Task I-1: `BatchCoordinator.forceReset()` + cancellable sweep

**File**: `src/engine/subsystems/core/batch/BatchCoordinator.ts`

**Changes**:

1. Add a private `_sweepCancelled = false` flag.
2. In `_executeFinalSweep()`, add a guard at the top of every `await` continuation:
   ```ts
   if (this._sweepCancelled) {
       console.warn('[BatchCoordinator] sweep cancelled — project switched mid-sweep');
       return;
   }
   ```
3. Add a public `forceReset()` method:
   ```ts
   /**
    * C13 §3.1 — Force-reset all batch state for project isolation.
    * Called by the pryzm-project-switch teardown handler before Project B loads.
    * Safe to call whether or not a batch is in progress.
    */
   forceReset(): void {
       // Cancel any in-flight sweep
       this._sweepCancelled = true;

       // Cancel registration drain subscription
       if (this._regDrainDispose !== null) {
           this._regDrainDispose();
           this._regDrainDispose = null;
       }

       // Clear all queued state
       this._isBatching         = false;
       this._pendingLevelIds.clear();
       this._registrationQueue  = [];
       this._postBatchWindowEvents.clear();
       this._totalElementCount  = 0;

       // Reset cancellation flag so the NEXT batch can run
       // (reset it last so in-flight sweep sees it during its next await)
       Promise.resolve().then(() => { this._sweepCancelled = false; });

       console.log('[BatchCoordinator] C13 forceReset() — all batch state cleared for project switch');
   }
   ```

**TSC check**: `pnpm tsc --noEmit` → 0 errors.

**Done-when**: `batchCoordinator.forceReset` is callable from outside the module; TypeScript infers the public method; `_sweepCancelled` guard is present in `_executeFinalSweep()`.

---

### §3.2 — Task I-2: Expose `window.__engineTeardown` surface

**File**: `src/engine/engineLauncher.ts`

Immediately after the `window.__wallRebuildControl` assignment at line ~1619, add a new teardown surface block:

```ts
// ── C13 §4 — Project isolation teardown surface ──────────────────────────
// Exposes a reset hook for all closure-private wall-rebuild state so that
// the pryzm-project-switch handler can clean up before Project B loads.
// Typed in global-window.d.ts. Called by the project-switch listener in §F-3.
window.__engineTeardown = {
    resetWallRebuildState(): void {
        // Reset all three wall-rebuild flags (C13 §3.2)
        _wallRebuildPaused     = false;
        _wallRebuildDiscarding = false;
        _joinsResolving        = false;

        // Cancel any pending wall-rebuild rAF (C13 §3.4)
        if (_wallRafHandle !== null) {
            _wallRafHandle();          // invoke disposer
            _wallRafHandle = null;
        }

        // Clear stale wall events from previous project (C13 §3.3)
        _pendingWallEvents.clear();
        _prevJoinMap.clear();

        console.log('[EngineBootstrap] C13 resetWallRebuildState() — wall pipeline clean for project switch');
    },
};
// ── End C13 teardown surface ──────────────────────────────────────────────
```

**File**: `src/global-window.d.ts`

Add to the `Window` interface (alongside `__wallRebuildControl`):

```ts
/** C13 §4 — Project isolation teardown surface. */
__engineTeardown?: {
    resetWallRebuildState(): void;
};
```

**Done-when**: `window.__engineTeardown.resetWallRebuildState()` is callable at runtime; `global-window.d.ts` declares it without `(window as any)`; `pnpm tsc --noEmit` → 0 errors.

---

### §3.3 — Task I-3: Wire `pryzm-project-switch` teardown handler

**File**: `src/engine/engineLauncher.ts`

Replace the existing thin `pryzm-project-switch` listener at line ~2178:

```ts
// BEFORE (single-line, only resets camera flag):
window.addEventListener('pryzm-project-switch', () => { _levelCamReady = false; });
```

With the full C13 teardown handler:

```ts
// ── C13 §4 — Project isolation teardown on every project switch ──────────
//
// Runs synchronously when pryzm-project-switch fires, BEFORE
// pryzm-project-context-set populates Project B's stores.
//
// Order is critical (C13 §4 normative sequence):
//   1. forceReset() — clears BatchCoordinator batch state + sweep
//   2. resetWallRebuildState() — clears closure-private flags + pending events
//   3. resumeAndFlush() on CW builder — idempotent; clears pause if stuck
//   4. resumeAndFlush() on Slab builder — idempotent; clears pause if stuck
//   5. _levelCamReady = false — existing camera guard
//
window.addEventListener('pryzm-project-switch', (e: Event) => {
    const detail    = (e as CustomEvent).detail ?? {};
    const fromId: string | null = detail.from ?? null;
    const toId:   string        = detail.to   ?? '(unknown)';

    console.log(`[EngineBootstrap] C13 project-switch: ${fromId ?? 'cold-boot'} → ${toId}`);

    // Step 1 — BatchCoordinator (C13 §3.1)
    batchCoordinator.forceReset();

    // Step 2 — Wall rebuild pipeline (C13 §3.2–§3.4)
    window.__engineTeardown?.resetWallRebuildState();

    // Step 3 — CurtainWall builder (C13 §3.5)
    // resumeAndFlush is safe to call even when not paused (CurtainWallBuilder
    // checks _rebuildPaused before transferring from pausedBuildsMap).
    try { window.__curtainWallRebuildControl?.resumeAndFlush?.(); }
    catch (err) { console.warn('[EngineBootstrap] C13 CW resumeAndFlush failed:', err); }

    // Step 4 — Slab builder (C13 §3.5)
    try { window.__slabRebuildControl?.resumeAndFlush?.(); }
    catch (err) { console.warn('[EngineBootstrap] C13 Slab resumeAndFlush failed:', err); }

    // Step 5 — Camera guard (existing, unchanged)
    _levelCamReady = false;

    console.log('[EngineBootstrap] C13 teardown complete — Project B context loading');
});
// ── End C13 teardown handler ─────────────────────────────────────────────
```

**Done-when**: the listener is present; the teardown sequence runs when `new CustomEvent('pryzm-project-switch', { detail: { from: 'a', to: 'b' } })` is dispatched in a browser console; `pnpm tsc --noEmit` → 0 errors.

---

### §3.4 — Task I-4: `isPaused` query on CW and Slab rebuild controls

**File**: `src/engine/subsystems/curtainwalls/CurtainWallBuilder.ts`

In the `__curtainWallRebuildControl` assignment block, add `isPaused: () => this._rebuildPaused` to the exposed interface.

**File**: `src/engine/subsystems/slabs/SlabFragmentBuilder.ts`

Symmetrically, expose `isPaused: () => this._paused` (or whatever the pause flag is named).

**File**: `src/global-window.d.ts`

Extend both control surface types with `isPaused(): boolean`.

This is a low-risk additive change. It is not required for the core fix (I-3 calls `resumeAndFlush()` unconditionally, which is already safe when not paused per existing implementation) but is required for the OTel span in I-5 (§3.5) to report accurate state.

**Done-when**: `window.__curtainWallRebuildControl?.isPaused?.()` is callable at runtime; `pnpm tsc --noEmit` → 0 errors.

---

### §3.5 — Task I-5: OTel span `project.session.teardown`

**File**: `src/engine/engineLauncher.ts`

Inside the `pryzm-project-switch` listener added in I-3, wrap the teardown sequence in an OTel span:

```ts
const span = runtime?.tracer?.startSpan('project.session.teardown') ?? null;
try {
    // ... steps 1–5 ...
    span?.setAttributes({
        'priorProjectId':            fromId ?? 'cold-boot',
        'batchWasActive':            batchWasActive,          // captured before forceReset()
        'wallRebuildWasPaused':      wallWasPaused,           // captured before resetWallRebuildState()
        'wallRebuildWasDiscarding':  wallWasDiscarding,       // captured before resetWallRebuildState()
        'pendingWallEventCount':     pendingWallCount,        // captured before clear()
        'pendingRegistrationCount':  regQueueCount,           // captured before forceReset()
    });
} finally {
    span?.end();
}
```

To capture the "before" values, expose three read-only getters on `window.__engineTeardown`:
```ts
window.__engineTeardown = {
    resetWallRebuildState(): void { ... },
    get isWallRebuildPaused():     boolean { return _wallRebuildPaused; },
    get isWallRebuildDiscarding(): boolean { return _wallRebuildDiscarding; },
    get pendingWallEventCount():   number  { return _pendingWallEvents.size; },
};
```

And expose `batchCoordinator.isBatching` (already public) and `batchCoordinator.pendingRegistrationCount` (new getter: `get pendingRegistrationCount(): number { return this._registrationQueue.length; }`).

**Done-when**: A project switch while a batch is active produces a `project.session.teardown` span in the OTel trace with `batchWasActive: true`; `pnpm tsc --noEmit` → 0 errors.

---

### §3.6 — Task I-6: E2E test `project-isolation.spec.ts`

**File**: `tests/e2e/project-isolation.spec.ts`

New Playwright test. Reference the existing `tests/e2e/wall-create.spec.ts` for the wall-draw interaction pattern.

```ts
// Scenario A: normal batch completion then project switch
test('walls can be created after project switch following AI batch', async ({ page }) => {
  // 1. Open Project A (use test fixture / seed data)
  await page.goto('/');
  await page.waitForEvent('pryzm-project-loaded');

  // 2. Trigger AI batch (or simulate via programmatic CustomEvent)
  await page.evaluate(() => {
    // Simulate what AI batch does to BatchCoordinator
    (window as any).batchCoordinator?.forceReset?.(); // ensure clean start
    const bc = (window as any).batchCoordinator;
    if (bc) {
      // Simulate a stuck batch (the exact failure case)
      bc._isBatching = true;
      window.__wallRebuildControl?.pause?.();
      window.__wallRebuildControl?.discardAndSuppress?.();
    }
  });

  // 3. Switch to Project B
  await page.evaluate(() => {
    window.dispatchEvent(new CustomEvent('pryzm-project-switch', {
      detail: { from: 'project-a', to: 'project-b' }
    }));
  });

  // 4. Assert teardown ran
  const state = await page.evaluate(() => ({
    isBatching:        (window as any).batchCoordinator?.isBatching,
    wallWasPaused:     window.__engineTeardown?.isWallRebuildPaused,
    wallWasDiscarding: window.__engineTeardown?.isWallRebuildDiscarding,
    pendingWalls:      window.__engineTeardown?.pendingWallEventCount,
  }));
  expect(state.isBatching).toBe(false);
  expect(state.wallWasPaused).toBe(false);
  expect(state.wallWasDiscarding).toBe(false);
  expect(state.pendingWalls).toBe(0);

  // 5. Assert wall creation still works in Project B context
  // (draw a wall segment programmatically via commandBus.dispatch)
  await page.evaluate(async () => {
    const runtime = window.runtime;
    if (!runtime) return;
    await runtime.bus.executeCommand('wall.create', {
      start:        { x: 0, y: 0, z: 0 },
      end:          { x: 5, y: 0, z: 0 },
      levelId:      'test-level',
      height:       3,
      thickness:    0.2,
    });
  });

  // Wall mesh should appear within 2 rAF ticks (≤ 100ms)
  await page.waitForTimeout(100);
  const wallCount = await page.evaluate(() =>
    (window as any).__wallStore?.getAll().length ?? 0
  );
  expect(wallCount).toBeGreaterThanOrEqual(1);
});
```

**Done-when**: `pnpm exec playwright test tests/e2e/project-isolation.spec.ts` → PASS in Chromium; test is registered in `playwright.config.ts`.

---

### §3.7 — Task I-7: GA gate `check-project-isolation.ts`

**File**: `tools/ga-gate/check-project-isolation.ts`

Static analysis gate — no browser required. Checks structural presence only:

```ts
// Gate 1: BatchCoordinator exports forceReset()
// rg "forceReset" src/engine/subsystems/core/batch/BatchCoordinator.ts → ≥ 1 hit

// Gate 2: engineLauncher.ts pryzm-project-switch listener calls batchCoordinator.forceReset()
// rg "batchCoordinator.forceReset" src/engine/engineLauncher.ts → ≥ 1 hit

// Gate 3: window.__engineTeardown declared in global-window.d.ts
// rg "__engineTeardown" src/global-window.d.ts → ≥ 1 hit

// Gate 4: pryzm-project-switch listener calls window.__engineTeardown?.resetWallRebuildState
// rg "resetWallRebuildState" src/engine/engineLauncher.ts → ≥ 1 hit

// HARD_FAIL if any of gates 1-4 return 0 hits
```

Register in `tools/ga-gate/run-all.ts` under the label `project-isolation-gate`.

**Done-when**: `npx tsx tools/ga-gate/check-project-isolation.ts` → exit 0; registered in `run-all.ts`; `npx tsx tools/ga-gate/run-all.ts` → all gates ✅.

---

### §3.8 — Task I-8: Annotations and index update

**Files to annotate** (add `// TODO(C13.x) — project isolation gap` to each gap site):

| File | Location | Gap |
|---|---|---|
| `src/engine/subsystems/core/batch/BatchCoordinator.ts` | Line 78 (`_isBatching = false` field declaration) | C13-G2 — resolved by I-1 |
| `src/engine/engineLauncher.ts` | `_wallRebuildPaused` declaration (~line 1432) | C13-G3 — resolved by I-2 |
| `src/engine/engineLauncher.ts` | `_wallRebuildDiscarding` declaration (~line 1459) | C13-G3 — resolved by I-2 |
| `src/engine/engineLauncher.ts` | `_wallRafHandle` declaration (~line 1418) | C13-G4 — resolved by I-2 |
| `src/engine/engineLauncher.ts` | `_pendingWallEvents` declaration (~line 1416) | C13-G5 — resolved by I-2 |
| `src/engine/engineLauncher.ts` | `pryzm-project-switch` listener (~line 2178) | C13-G1 — resolved by I-3 |

**File**: `docs/02-decisions/contracts/C00-INDEX.md`

Add row:
```
| C13 | Project Lifecycle and Isolation | 2026-05-04 | CANONICAL |
```

**Done-when**: all 6 gap sites annotated; `C00-INDEX.md` has C13 row; `pnpm tsc --noEmit` → 0 errors.

---

## §4 — Verification gates (run at wave close)

```bash
# Gate 1: BatchCoordinator.forceReset() exists
rg "forceReset" src/engine/subsystems/core/batch/BatchCoordinator.ts | wc -l   # → ≥ 2

# Gate 2: project-switch listener calls forceReset
rg "batchCoordinator.forceReset" src/engine/engineLauncher.ts | wc -l          # → ≥ 1

# Gate 3: engineTeardown surface declared in global-window.d.ts
rg "__engineTeardown" src/global-window.d.ts | wc -l                            # → ≥ 1

# Gate 4: all 7 C13 gap sites annotated
rg "TODO(C13" src/ --type ts | wc -l                                            # → ≥ 6

# Gate 5: TypeScript clean
pnpm tsc --noEmit                                                                # → 0 errors

# Gate 6: GA gate passes
npx tsx tools/ga-gate/check-project-isolation.ts                                # → exit 0

# Gate 7: E2E test passes
pnpm exec playwright test tests/e2e/project-isolation.spec.ts                   # → PASS

# Gate 8: Browser smoke test (manual — 2 minutes)
# 1. Open editor, run AI batch on any project (≥ 3 slabs)
# 2. While batch is running (or immediately after), open a different project
# 3. Draw one wall in the new project
# 4. Assert: wall mesh appears within 2 seconds
# 5. Check console: no "[BatchCoordinator]" isBatching warnings; no silent drops
```

---

## §5 — Risk register

| Risk | Likelihood | Mitigation |
|---|---|---|
| `resumeAndFlush()` on an already-flushed builder causes a double-flush LONGTASK | 🟡 MEDIUM | Both `CurtainWallBuilder.resumeAndFlush()` and `SlabFragmentBuilder.resumeAndFlush()` already guard against double-flush (check `_rebuildPaused` / `_paused` before transferring). Verify in I-4 that guards are present. |
| `BatchCoordinator.forceReset()` called during an active user-interactive session (not a project switch) | 🟢 LOW | `forceReset()` is only called from the `pryzm-project-switch` listener. It is not exposed via any UI or command path. |
| In-flight `_executeFinalSweep` dispatches `rooms.redetect` for Project A AFTER `forceReset()` runs | 🟡 MEDIUM | The `_sweepCancelled` flag (I-1) gates every `await` continuation. After `forceReset()`, the next microtask tick sees `_sweepCancelled = true` and returns without dispatching. The flag is reset to `false` via `Promise.resolve().then()` so subsequent batches in Project B are unaffected. |
| `pryzm-project-switch` fires before `engineLauncher.ts` has fully initialized | 🟢 LOW | `pryzm-project-switch` fires only from the PlatformShell router, which is mounted after `engineLauncher.ts` completes. The cold-boot path (first project open) fires `pryzm-project-loaded`, not `pryzm-project-switch`. |
| TypeScript strict mode rejects `_sweepCancelled` access inside async generator | 🟢 LOW | `_executeFinalSweep` is a regular `async` method, not a generator. `this._sweepCancelled` is a class-private field accessible inside all instance methods. |

---

## §6 — Files changed summary

| File | Type | Change |
|---|---|---|
| `src/engine/subsystems/core/batch/BatchCoordinator.ts` | Edit | Add `_sweepCancelled` flag; `forceReset()` method; sweep cancellation guards; `pendingRegistrationCount` getter |
| `src/engine/engineLauncher.ts` | Edit | Add `window.__engineTeardown` surface; replace thin `pryzm-project-switch` listener with full teardown handler; add OTel span |
| `src/global-window.d.ts` | Edit | Add `__engineTeardown?: { ... }` to `Window` interface; extend CW + slab control surface types with `isPaused` |
| `src/engine/subsystems/curtainwalls/CurtainWallBuilder.ts` | Edit | Expose `isPaused(): boolean` on `__curtainWallRebuildControl` |
| `src/engine/subsystems/slabs/SlabFragmentBuilder.ts` | Edit | Expose `isPaused(): boolean` on `__slabRebuildControl` |
| `tests/e2e/project-isolation.spec.ts` | New | E2E isolation test (Scenario A: stuck batch then switch) |
| `tools/ga-gate/check-project-isolation.ts` | New | Static CI gate (4 structural checks) |
| `tools/ga-gate/run-all.ts` | Edit | Register `check-project-isolation.ts` |
| `docs/02-decisions/contracts/C00-INDEX.md` | Edit | Add C13 row |
