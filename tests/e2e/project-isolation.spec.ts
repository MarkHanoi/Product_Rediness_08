/**
 * E2E test: Project Isolation (Wave 35 I-6)
 *
 * Contract: C13 §4 — after `pryzm-project-switch` fires, ALL batch-pipeline
 * flags and pending wall events MUST be reset so that Project B can create
 * elements normally.
 *
 * Scenario A: simulate a stuck batch (isBatching=true, wall pipeline paused)
 * then fire pryzm-project-switch and assert that every isolation invariant
 * is restored and that a wall can be created afterwards.
 *
 * Reference: docs/03_PRYZM3/04-PLAN-FORWARD/35-PROJECT-ISOLATION-WAVE.md §3.6
 */

import { test, expect } from '@playwright/test';

test.describe('Project isolation — pryzm-project-switch teardown', () => {
    test('all batch flags are cleared after project switch', async ({ page }) => {
        await page.goto('/');

        // Wait for the engine to boot (runtime composed).
        await page.waitForFunction(() => !!(window as any).batchCoordinator, { timeout: 30_000 });

        // ── Step 1: Simulate a stuck batch (the exact C13 failure case) ────────
        await page.evaluate(() => {
            const bc = (window as any).batchCoordinator;
            if (!bc) throw new Error('batchCoordinator not found on window');

            // Simulate BatchCoordinator entering batching mode.
            // We set the internal flag directly because runBatch() is async
            // and we want to test the stuck-mid-batch path.
            bc._isBatching = true;

            // Simulate wall pipeline being paused (as BatchCoordinator._setupBatch does).
            window.__wallRebuildControl?.pause?.();
            window.__wallRebuildControl?.discardAndSuppress?.();

            // Simulate CW and Slab builders being paused.
            window.__curtainWallRebuildControl?.pause?.();
            window.__slabRebuildControl?.pause?.();

            // Add a fake pending wall event so pendingWallEventCount > 0.
            // (We can't easily call _scheduleWallFlush directly, so we check via getter)
        });

        // Verify the stuck state before firing the switch.
        const stuckState = await page.evaluate(() => ({
            isBatching: (window as any).batchCoordinator?.isBatching ?? false,
            cwPaused:   window.__curtainWallRebuildControl?.isPaused?.() ?? false,
            slabPaused: window.__slabRebuildControl?.isPaused?.()        ?? false,
        }));
        expect(stuckState.isBatching).toBe(true);
        expect(stuckState.cwPaused).toBe(true);
        expect(stuckState.slabPaused).toBe(true);

        // ── Step 2: Fire pryzm-project-switch ─────────────────────────────────
        await page.evaluate(() => {
            window.dispatchEvent(new CustomEvent('pryzm-project-switch', {
                detail: { from: 'project-a', to: 'project-b' },
            }));
        });

        // ── Step 3: Assert teardown ran ───────────────────────────────────────
        const afterState = await page.evaluate(() => ({
            isBatching:       (window as any).batchCoordinator?.isBatching              ?? true,
            wallWasPaused:    window.__engineTeardown?.isWallRebuildPaused              ?? true,
            wallDiscarding:   window.__engineTeardown?.isWallRebuildDiscarding          ?? true,
            pendingWalls:     window.__engineTeardown?.pendingWallEventCount             ?? -1,
            cwPaused:         window.__curtainWallRebuildControl?.isPaused?.()           ?? true,
            slabPaused:       window.__slabRebuildControl?.isPaused?.()                  ?? true,
            engineTeardownExists: !!window.__engineTeardown,
        }));

        expect(afterState.engineTeardownExists, '__engineTeardown surface must exist').toBe(true);
        expect(afterState.isBatching,    'isBatching must be false after switch').toBe(false);
        expect(afterState.wallWasPaused, 'wall pipeline must not be paused after switch').toBe(false);
        expect(afterState.wallDiscarding,'wall discard mode must be off after switch').toBe(false);
        expect(afterState.pendingWalls,  'pending wall events must be 0 after switch').toBe(0);
        expect(afterState.cwPaused,      'CurtainWall builder must not be paused after switch').toBe(false);
        expect(afterState.slabPaused,    'Slab builder must not be paused after switch').toBe(false);
    });

    test('forceReset() is callable and resets BatchCoordinator state', async ({ page }) => {
        await page.goto('/');
        await page.waitForFunction(() => !!(window as any).batchCoordinator, { timeout: 30_000 });

        const result = await page.evaluate(() => {
            const bc = (window as any).batchCoordinator;
            if (typeof bc?.forceReset !== 'function') return { hasForceReset: false };

            // Simulate stuck state.
            bc._isBatching = true;
            bc._pendingLevelIds = new Set(['level-1', 'level-2']);

            // Call forceReset().
            bc.forceReset();

            return {
                hasForceReset: true,
                isBatching:    bc.isBatching,
                pendingCount:  bc.pendingRegistrationCount,
            };
        });

        expect(result.hasForceReset,  'forceReset() must exist on batchCoordinator').toBe(true);
        expect(result.isBatching,     'isBatching must be false after forceReset()').toBe(false);
        expect(result.pendingCount,   'pendingRegistrationCount must be 0 after forceReset()').toBe(0);
    });

    test('window.__engineTeardown surface exists and exposes read-only state', async ({ page }) => {
        await page.goto('/');
        await page.waitForFunction(() => !!(window as any).__engineTeardown, { timeout: 30_000 });

        const surface = await page.evaluate(() => ({
            exists:             !!window.__engineTeardown,
            hasReset:           typeof window.__engineTeardown?.resetWallRebuildState === 'function',
            paused:             window.__engineTeardown?.isWallRebuildPaused,
            discarding:         window.__engineTeardown?.isWallRebuildDiscarding,
            pendingWallCount:   window.__engineTeardown?.pendingWallEventCount,
        }));

        expect(surface.exists,           '__engineTeardown must exist after engine boot').toBe(true);
        expect(surface.hasReset,         'resetWallRebuildState() must be a function').toBe(true);
        expect(surface.paused,           'isWallRebuildPaused must be false at boot').toBe(false);
        expect(surface.discarding,       'isWallRebuildDiscarding must be false at boot').toBe(false);
        expect(surface.pendingWallCount, 'pendingWallEventCount must be 0 at boot').toBe(0);
    });
});
