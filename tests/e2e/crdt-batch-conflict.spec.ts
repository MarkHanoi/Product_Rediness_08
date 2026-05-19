// tests/e2e/crdt-batch-conflict.spec.ts — G3-T5 (E2E test 13)
//
// Scenario: CRDT batch blackout conflict detection — structural wiring check.
//
// CONTRACT (G3 — ADR-049 §4.4):
//   When BatchCoordinator opens a batch window, YjsDocAdapter captures
//   Y.Doc state vectors for each in-scope document.  When the window closes,
//   _detectBatchConflicts() compares state vectors: if remote ops arrived
//   during the blackout (stateVectorAfter > stateVectorBefore), the adapter
//   emits a CRDTConflict event.  The conflict MUST be surfaced to UI via
//   onConflict() handlers — silent LWW overwrite is prohibited (C08 §3.3).
//
// G3 task map (reference for completeness):
//   G3-T1: isBatchBlackoutActive observable (YjsDocAdapter — ✅ code)
//   G3-T2: CRDT applier wired to CommandBus setCrdtApplier (✅ engineLauncher.ts L388)
//   G3-T3: _detectBatchConflicts wired to onBatchWindowClose callback (✅ YjsDocAdapter.ts L681)
//   G3-T4: BatchPatchCompactor snapshot in PatchSnapshot.ts (✅ code)
//   G3-T5: THIS FILE — E2E verification of the live wired path.
//
// Test strategy:
//   Full two-browser simulation (Client A edits, Client B receives during blackout)
//   requires a shared Yjs WebSocket server — not available in Replit CI without
//   additional infra.  These tests verify the G3 structural invariants that can
//   be validated in a single browser context:
//
//   T5a: Engine boots with batchCoordinator accessible on window
//   T5b: YjsDocAdapter is registered on batchCoordinator (has onBatchWindowClose)
//   T5c: isBatchBlackoutActive is false before any batch starts
//   T5d: Simulated batch open → isBatchBlackoutActive becomes true
//   T5e: Simulated batch close → isBatchBlackoutActive returns false + callback fires
//   T5f: onConflict handler registration is side-effect-free
//   T5g: emitConflict propagates to registered handlers
//
// Note: tests T5d/T5e/T5g directly manipulate private internals via page.evaluate()
//   casts — this is intentional and mirrors the pattern in project-isolation.spec.ts
//   and conflict-resolution.spec.ts.  The goal is structural wiring verification,
//   not integration coverage of real Yjs document sync.
//
// Reference:
//   packages/sync-client/src/YjsDocAdapter.ts (CRDTConflict, onConflict, emitConflict,
//     isBatchBlackoutActive, onBatchWindowOpen, onBatchWindowClose, _detectBatchConflicts)
//   packages/core-app-model/src/batch/BatchCoordinator.ts (registerYjsDocAdapter,
//     _yjsDocAdapter.onBatchWindowOpen/Close at lines 929, 1176)
//   apps/editor/src/engine/engineLauncher.ts (YjsDocAdapter created at L376, registered L379)

import { test, expect } from '@playwright/test';

test.describe('G3-T5 — CRDT batch blackout conflict detection (structural wiring)', () => {

  // ── T5a: batchCoordinator accessible ──────────────────────────────────────
  test('T5a: batchCoordinator is accessible on window after engine boot', async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(
      () => !!(window as { batchCoordinator?: unknown }).batchCoordinator,
      { timeout: 30_000 },
    );

    const accessible = await page.evaluate(
      () => typeof (window as { batchCoordinator?: unknown }).batchCoordinator === 'object',
    );
    expect(accessible).toBe(true);
  });

  // ── T5b: YjsDocAdapter registered ─────────────────────────────────────────
  test('T5b: YjsDocAdapter is registered on batchCoordinator (onBatchWindowClose wired)', async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(
      () => !!(window as { batchCoordinator?: unknown }).batchCoordinator,
      { timeout: 30_000 },
    );

    // G3-T3: the adapter's onBatchWindowClose hook is registered during engineLauncher
    // init (L379) so batchCoordinator._yjsDocAdapter is non-null and has the callback.
    const adapterWired = await page.evaluate(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const bc = (window as any).batchCoordinator;
      if (!bc) return { ok: false, reason: 'batchCoordinator absent' };
      const adapter = bc._yjsDocAdapter;
      if (!adapter) return { ok: false, reason: '_yjsDocAdapter not registered' };
      const hasClose = typeof adapter.onBatchWindowClose === 'function';
      const hasOpen  = typeof adapter.onBatchWindowOpen  === 'function';
      return { ok: hasClose && hasOpen, hasClose, hasOpen };
    });

    expect(adapterWired.ok, `adapter wiring: ${JSON.stringify(adapterWired)}`).toBe(true);
    expect(adapterWired.hasClose, 'onBatchWindowClose must be a function').toBe(true);
    expect(adapterWired.hasOpen,  'onBatchWindowOpen must be a function').toBe(true);
  });

  // ── T5c: isBatchBlackoutActive is false at rest ────────────────────────────
  test('T5c: isBatchBlackoutActive is false before any batch starts', async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(
      () => !!(window as { batchCoordinator?: unknown }).batchCoordinator,
      { timeout: 30_000 },
    );

    const blackoutAtRest = await page.evaluate(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const bc = (window as any).batchCoordinator;
      const adapter = bc?._yjsDocAdapter;
      if (!adapter) return null;
      return adapter.isBatchBlackoutActive;
    });

    expect(blackoutAtRest, 'isBatchBlackoutActive must be false at rest').toBe(false);
  });

  // ── T5d: batch open → isBatchBlackoutActive becomes true ──────────────────
  test('T5d: simulated batch open sets isBatchBlackoutActive to true', async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(
      () => !!(window as { batchCoordinator?: unknown }).batchCoordinator,
      { timeout: 30_000 },
    );

    const result = await page.evaluate(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const bc = (window as any).batchCoordinator;
      const adapter = bc?._yjsDocAdapter;
      if (!adapter) return { ok: false, reason: 'adapter absent' };

      const before = adapter.isBatchBlackoutActive;

      // Fire the onBatchWindowOpen callback directly (same as BatchCoordinator line 929).
      adapter.onBatchWindowOpen?.({ batchId: 'test-g3-t5', startMs: performance.now() });

      const after = adapter.isBatchBlackoutActive;
      const batchId = adapter.currentBlackoutBatchId;

      // Clean up: close the window so we don't leave open state
      adapter.onBatchWindowClose?.({ batchId: 'test-g3-t5', blackoutMs: 0, elementCount: 0 });

      return { ok: !before && after, before, after, batchId };
    });

    expect(result.ok, `blackout lifecycle: ${JSON.stringify(result)}`).toBe(true);
    expect(result.before, 'must be false before open').toBe(false);
    expect(result.after,  'must be true after open').toBe(true);
    expect(result.batchId, 'currentBlackoutBatchId must match').toBe('test-g3-t5');
  });

  // ── T5e: batch close → isBatchBlackoutActive returns to false ─────────────
  test('T5e: simulated batch close restores isBatchBlackoutActive to false', async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(
      () => !!(window as { batchCoordinator?: unknown }).batchCoordinator,
      { timeout: 30_000 },
    );

    const result = await page.evaluate(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const bc = (window as any).batchCoordinator;
      const adapter = bc?._yjsDocAdapter;
      if (!adapter) return { ok: false, reason: 'adapter absent' };

      adapter.onBatchWindowOpen?.({ batchId: 'test-g3-t5-close', startMs: performance.now() });
      const duringBlackout = adapter.isBatchBlackoutActive;

      adapter.onBatchWindowClose?.({ batchId: 'test-g3-t5-close', blackoutMs: 1, elementCount: 5 });
      const afterClose = adapter.isBatchBlackoutActive;
      const batchIdAfter = adapter.currentBlackoutBatchId;

      return { ok: duringBlackout && !afterClose, duringBlackout, afterClose, batchIdAfter };
    });

    expect(result.ok, `close lifecycle: ${JSON.stringify(result)}`).toBe(true);
    expect(result.duringBlackout, 'must be true during blackout').toBe(true);
    expect(result.afterClose,     'must be false after close').toBe(false);
    expect(result.batchIdAfter,   'currentBlackoutBatchId must be undefined after close').toBeUndefined();
  });

  // ── T5f: onConflict registration is side-effect-free ──────────────────────
  test('T5f: onConflict handler registration does not throw and returns a disposer', async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(
      () => !!(window as { batchCoordinator?: unknown }).batchCoordinator,
      { timeout: 30_000 },
    );

    const result = await page.evaluate(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const bc = (window as any).batchCoordinator;
      const adapter = bc?._yjsDocAdapter;
      if (!adapter) return { ok: false, reason: 'adapter absent' };
      if (typeof adapter.onConflict !== 'function') return { ok: false, reason: 'onConflict not a function' };

      let disposerType = 'none';
      try {
        const disposer = adapter.onConflict((_c: unknown) => { /* no-op */ });
        disposerType = typeof disposer;
        if (typeof disposer === 'function') disposer();
      } catch (e) {
        return { ok: false, reason: String(e) };
      }

      return { ok: disposerType === 'function', disposerType };
    });

    expect(result.ok, `onConflict disposer: ${JSON.stringify(result)}`).toBe(true);
    expect(result.disposerType, 'onConflict must return a function disposer').toBe('function');
  });

  // ── T5g: emitConflict propagates to registered handlers ───────────────────
  test('T5g: emitConflict fires registered onConflict handlers with correct CRDTConflict shape', async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(
      () => !!(window as { batchCoordinator?: unknown }).batchCoordinator,
      { timeout: 30_000 },
    );

    const result = await page.evaluate(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const bc = (window as any).batchCoordinator;
      const adapter = bc?._yjsDocAdapter;
      if (!adapter) return { ok: false, reason: 'adapter absent' };

      const received: unknown[] = [];
      const disposer = adapter.onConflict((c: unknown) => { received.push(c); });

      const testConflict = {
        elementId:    'elem-g3-t5-test',
        property:     'height',
        localValue:   3000,
        remoteValue:  2800,
        remoteAuthor: 'test-client',
        timestamp:    Date.now(),
      };

      adapter.emitConflict(testConflict);
      disposer();

      const first = received[0] as Record<string, unknown> | undefined;

      return {
        ok: received.length === 1,
        count: received.length,
        elementId:    first?.elementId,
        property:     first?.property,
        localValue:   first?.localValue,
        remoteValue:  first?.remoteValue,
        remoteAuthor: first?.remoteAuthor,
        status:       adapter.getStatus(),
      };
    });

    expect(result.ok,           `handler call count: ${result.count}`).toBe(true);
    expect(result.count,        'exactly 1 conflict event expected').toBe(1);
    expect(result.elementId,    'elementId must pass through').toBe('elem-g3-t5-test');
    expect(result.property,     'property must pass through').toBe('height');
    expect(result.localValue,   'localValue must pass through').toBe(3000);
    expect(result.remoteValue,  'remoteValue must pass through').toBe(2800);
    expect(result.remoteAuthor, 'remoteAuthor must pass through').toBe('test-client');
    expect(result.status,       'adapter status must be CONFLICTED after emitConflict').toBe('CONFLICTED');
  });
});
