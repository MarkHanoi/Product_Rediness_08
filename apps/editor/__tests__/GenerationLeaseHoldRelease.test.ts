/**
 * @vitest-environment happy-dom
 *
 * §GEN-VIEW-COALESCE (audit GENERATIVE-PIPELINE-AUDIT-2026-08-10 §3 / P1-1) —
 * the GUARANTEED-RELEASE proof for the lease-scoped view-invalidation hold.
 *
 * The whole safety story (L-716 class — "can this gate ever be true?"): the
 * ViewDependencyTracker hold freezes plan/elevation invalidation for the width of a
 * building generation, so a hold that is never released would freeze views FOREVER.
 * This suite proves `endGenerationHold()` runs on EVERY way a generation can end:
 *
 *   1. NORMAL completion — the executor's explicit `end()` / `endBuildingGeneration()`.
 *   2. THROWN mid-chain — the caller's `finally` (the house post-gen chain pattern).
 *   3. SETTLE — batch-idle quiet window (no explicit end at all).
 *   4. HARD CAP / watchdog — a stalled generation that never settles (MAX_MS = 6 min).
 *
 * It also pins the ordering contract GISAreaLayout's Forma deferral relies on: the
 * 'pryzm-building-generation-ended' DOM event fires exactly once, AFTER
 * `__pryzmBuildingGenActive` clears and AFTER the hold flushed — so the one catch-up
 * massing re-place is not itself re-deferred and reads settled stores.
 *
 * The tracker's OWN 7-min watchdog (belt-and-braces below the lease) is proven in
 * packages/core-app-model/src/views/__tests__/generationHoldCoalesce.test.ts.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const beginGenerationHold = vi.fn();
const endGenerationHold = vi.fn();
vi.mock('@pryzm/core-app-model', () => ({
    viewDependencyTracker: {
        beginGenerationHold: () => beginGenerationHold(),
        endGenerationHold: () => endGenerationHold(),
    },
}));

const overlayEnd = vi.fn();
vi.mock('@app/ui/overlays/LoadingOverlayController', () => ({
    getLoadingOverlay: () => ({ begin: () => ({ end: overlayEnd }) }),
}));

vi.mock('@app/rendering/autoWebGLHeavyScene', () => ({
    proactivelySwitchToWebGLForBuildingGeneration: () => { /* no-op in tests */ },
}));

type Lifecycle = typeof import('../src/ui/generation/buildingGenerationLifecycle');

/** Fresh module per test — the lease is module-level state (`_current`). */
async function loadLifecycle(): Promise<Lifecycle> {
    vi.resetModules();
    return await import('../src/ui/generation/buildingGenerationLifecycle');
}

const genFlag = (): boolean | undefined =>
    (globalThis as unknown as { __pryzmBuildingGenActive?: boolean }).__pryzmBuildingGenActive;

describe('§GEN-VIEW-COALESCE — the lease GUARANTEES endGenerationHold on every ending', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        beginGenerationHold.mockClear();
        endGenerationHold.mockClear();
        overlayEnd.mockClear();
    });
    afterEach(() => {
        vi.useRealTimers();
        (globalThis as unknown as { __pryzmBuildingGenActive?: boolean }).__pryzmBuildingGenActive = false;
    });

    it('1. NORMAL completion — explicit end() releases the hold exactly once (idempotent)', async () => {
        const { beginBuildingGeneration } = await loadLifecycle();
        const handle = beginBuildingGeneration('resi-building');
        expect(beginGenerationHold).toHaveBeenCalledTimes(1);
        expect(endGenerationHold).not.toHaveBeenCalled();
        expect(genFlag()).toBe(true);

        handle.end();
        expect(endGenerationHold).toHaveBeenCalledTimes(1);
        expect(genFlag()).toBe(false);

        handle.end(); // idempotent — no double flush
        expect(endGenerationHold).toHaveBeenCalledTimes(1);
    });

    it('2. THROWN mid-chain — the caller finally (endBuildingGeneration) still releases', async () => {
        const { beginBuildingGeneration, endBuildingGeneration } = await loadLifecycle();
        const generateThatThrows = (): void => {
            try {
                beginBuildingGeneration('house');
                throw new Error('structural batch exploded mid-chain');
            } finally {
                endBuildingGeneration(); // the runHousePostGenChain finally pattern
            }
        };
        expect(generateThatThrows).toThrow('exploded');
        expect(beginGenerationHold).toHaveBeenCalledTimes(1);
        expect(endGenerationHold).toHaveBeenCalledTimes(1);
        expect(genFlag()).toBe(false);
    });

    it('3. SETTLE — a generation with NO explicit end releases on batch-idle quiet window', async () => {
        const { beginBuildingGeneration, isBuildingGenerationActive } = await loadLifecycle();
        beginBuildingGeneration('office-building');
        // A sub-batch runs and drains…
        window.dispatchEvent(new Event('pryzm-batch-started'));
        window.dispatchEvent(new Event('pryzm-batch-ended'));
        expect(endGenerationHold).not.toHaveBeenCalled();
        // …then the 6 s HOLD_MS quiet window elapses → settle release.
        vi.advanceTimersByTime(6_000 + 1);
        expect(endGenerationHold).toHaveBeenCalledTimes(1);
        expect(isBuildingGenerationActive()).toBe(false);
    });

    it('4. HARD CAP — a STALLED generation (batch never drains) force-releases at MAX_MS', async () => {
        const { beginBuildingGeneration, isBuildingGenerationActive } = await loadLifecycle();
        beginBuildingGeneration('resi-building');
        // A sub-batch starts and NEVER ends — the settle can never arm.
        window.dispatchEvent(new Event('pryzm-batch-started'));
        vi.advanceTimersByTime(5 * 60_000);
        expect(endGenerationHold).not.toHaveBeenCalled(); // still legitimately working
        vi.advanceTimersByTime(60_000 + 1); // …6 min cap lands
        expect(endGenerationHold).toHaveBeenCalledTimes(1);
        expect(isBuildingGenerationActive()).toBe(false);
    });

    it('ordering — generation-ended event fires ONCE, after the flag clears and the hold flushed', async () => {
        const { beginBuildingGeneration, BUILDING_GENERATION_ENDED_EVENT } = await loadLifecycle();
        const seen: Array<{ flag: boolean | undefined; holdEnded: boolean }> = [];
        const listener = (): void => {
            seen.push({ flag: genFlag(), holdEnded: endGenerationHold.mock.calls.length > 0 });
        };
        window.addEventListener(BUILDING_GENERATION_ENDED_EVENT, listener);
        try {
            const handle = beginBuildingGeneration('resi-building');
            handle.end();
            handle.end(); // idempotent — must not re-fire
            expect(seen).toEqual([{ flag: false, holdEnded: true }]);
        } finally {
            window.removeEventListener(BUILDING_GENERATION_ENDED_EVENT, listener);
        }
    });

    it('re-entrant begin reuses the in-flight lease — ONE hold, ONE release', async () => {
        const { beginBuildingGeneration } = await loadLifecycle();
        const a = beginBuildingGeneration('resi-building');
        const b = beginBuildingGeneration('resi-building'); // defensive re-entry
        expect(beginGenerationHold).toHaveBeenCalledTimes(1);
        b.end();
        a.end();
        expect(endGenerationHold).toHaveBeenCalledTimes(1);
    });
});
