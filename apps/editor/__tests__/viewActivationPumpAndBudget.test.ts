// §STARTUP-PUMP-EVERY-STAGE + §STARTUP-PUMP-CADENCE + §STARTUP-ACTIVATION-IS-UNMEASURED
// (lane STARTUP-SPEED-AND-SPLASH, founder 2026-09-06: "try to make the loading from the moment I
// add the location until it loads the plan in 2d + 3d site split view MUCH QUICKER").
//
// ⭐ WHAT THIS SUITE EXISTS TO STOP FROM SILENTLY COMING BACK.
//
// The site-activation gate runs FOUR stages in series — viewer → tiles → content → anchor — and
// under `requestRenderMode: true` (CesiumViewport's deliberate §CESIUM-PERF-REQUEST-RENDER-MODE)
// the scene renders ONLY on demand. §TILES-NEED-A-FRAME (L-715) established that a readiness gate
// which reads counters without asking for a frame is "waiting on work it has itself prevented",
// and it fixed that — INSIDE `if (onTileSample)`, i.e. for the TILES STAGE ONLY. `onTileSample` is
// nulled the moment that stage settles, so for the whole of CONTENT and ANCHOR the gate asked the
// scene for exactly ZERO frames while still holding a full-screen overlay over it.
//
// That matters because the ANCHOR stage is the L-259 photoreal-tile ground clamp, and that clamp
// reads its height FROM STREAMED TILES: when nothing has streamed at that LOD its own branch is
// `hold-hidden-retry` — "retrying as tiles stream in" (`CesiumViewport.ts:6886`). Tiles stream and
// retire during a RENDER. So the stage that most needs frames was the stage we stopped pumping in,
// and its retry budget burned against a scene nobody was drawing.
//
// MEASURED A/B (both modules present, identical modelled Córdoba-shaped site — 49 tiles retiring 8
// per rendered frame, content issued at t=1200 ms, the clamp needing 4 further rendered frames):
//   BEFORE  watchdog 1000 ms · tiles drained t+7000 ms · overlay NEVER dismissed within 40 000 ms
//           · stall surfaced: "The 3D view stopped responding while anchoring to the ground…"
//   AFTER   watchdog  250 ms · tiles drained t+1750 ms · overlay dismissed t+2750 ms · no stall
//
// The tests below are the invariants that A/B rests on, asserted against the shipped module.
import { describe, expect, it } from 'vitest';
import {
    VIEW_ACTIVATION_PUMP_MS,
    beginViewActivationLoading,
} from '../src/ui/geospatial/viewActivationLoading';
import { VIEW_ACTIVATION_STALL_MS } from '../src/ui/overlays/loadingProgress';
import { beginStartupBudget, getStartupBudgetMarks } from '../src/engine/startupBudget';

type Snap = { pending: number; processing: number; tilesLoaded: boolean; frameNumber?: number };

/** A clock that records the cadence the subject asked for and fires ticks at THAT cadence. */
function makeClock() {
    let t = 0;
    const timers: Array<{ cb: () => void; ms: number; next: number; alive: boolean }> = [];
    const api = {
        now: () => t,
        askedMs: [] as number[],
        setInterval(cb: () => void, ms: number) {
            api.askedMs.push(ms);
            timers.push({ cb, ms, next: t + ms, alive: true });
            return timers.length - 1;
        },
        clearInterval(h: unknown) { const e = timers[h as number]; if (e) e.alive = false; },
        advance(ms: number) {
            const end = t + ms;
            for (;;) {
                let nextAt = Infinity;
                for (const e of timers) if (e.alive && e.next < nextAt) nextAt = e.next;
                if (nextAt > end) break;
                t = nextAt;
                for (const e of timers) if (e.alive && e.next <= t) { e.next = t + e.ms; e.cb(); }
            }
            t = end;
        },
    };
    return api;
}

const TILES_DONE: Snap = { pending: 0, processing: 0, tilesLoaded: true };

function fakeOverlay(sink: { failed: string | null }) {
    return {
        begin: () => ({
            id: 'x', active: true,
            setTitle() {}, setLabel() {}, setProgress() {}, setIndeterminate() {},
            fail(e: { message: string }) { sink.failed = e.message; }, end() {},
        }),
    } as never;
}

/** Let the gate's own promise chain run to its next await. */
async function settle(): Promise<void> {
    for (let i = 0; i < 6; i++) { await Promise.resolve(); }
    await new Promise((r) => setTimeout(r, 0));
}

describe('§STARTUP-PUMP-EVERY-STAGE — the gate must drive the scene in EVERY stage', () => {
    it('pumps a frame while parked in the CONTENT stage (it used to pump zero there)', async () => {
        const clock = makeClock();
        const sink = { failed: null as string | null };
        let pumps = 0;
        const handle = beginViewActivationLoading({
            target: 'site',
            overlay: fakeOverlay(sink),
            onRetry: () => {},
            now: clock.now,
            setInterval: clock.setInterval,
            clearInterval: clock.clearInterval,
            isPageHidden: () => false,
            signals: {
                whenViewerReady: () => Promise.resolve(),
                hasRealTileProvider: () => true,
                onTileLoadProgress: () => () => {},
                sampleTileLoadProgress: () => TILES_DONE,
                // Never resolves — the chain parks in ANCHOR if content is issued, CONTENT if not.
                whenGroundSettled: () => new Promise(() => {}),
                setNavigationEnabled: () => {},
                requestRender: () => { pumps++; },
            } as never,
        });
        await settle();                 // viewer → tiles (settles at once) → parked awaiting content
        const afterTiles = pumps;
        clock.advance(4 * VIEW_ACTIVATION_PUMP_MS);
        expect(pumps - afterTiles).toBeGreaterThanOrEqual(4);
        handle.cancel('test done');
    });

    it('pumps a frame while parked in the ANCHOR stage — the L-259 clamp needs streamed tiles', async () => {
        const clock = makeClock();
        const sink = { failed: null as string | null };
        let pumps = 0;
        const handle = beginViewActivationLoading({
            target: 'site',
            overlay: fakeOverlay(sink),
            onRetry: () => {},
            now: clock.now,
            setInterval: clock.setInterval,
            clearInterval: clock.clearInterval,
            isPageHidden: () => false,
            signals: {
                whenViewerReady: () => Promise.resolve(),
                hasRealTileProvider: () => true,
                onTileLoadProgress: () => () => {},
                sampleTileLoadProgress: () => TILES_DONE,
                whenGroundSettled: () => new Promise(() => {}),
                setNavigationEnabled: () => {},
                requestRender: () => { pumps++; },
            } as never,
        });
        handle.contentIssued();
        await settle();
        const inAnchor = pumps;
        clock.advance(8 * VIEW_ACTIVATION_PUMP_MS);
        expect(pumps - inAnchor).toBeGreaterThanOrEqual(8);
        handle.cancel('test done');
    });

    it('is still OPTIONAL — a producer with no pump keeps working rather than throwing', async () => {
        const clock = makeClock();
        const sink = { failed: null as string | null };
        const handle = beginViewActivationLoading({
            target: 'site',
            overlay: fakeOverlay(sink),
            onRetry: () => {},
            now: clock.now,
            setInterval: clock.setInterval,
            clearInterval: clock.clearInterval,
            isPageHidden: () => false,
            signals: {
                whenViewerReady: () => Promise.resolve(),
                hasRealTileProvider: () => true,
                onTileLoadProgress: () => () => {},
                sampleTileLoadProgress: () => TILES_DONE,
                whenGroundSettled: () => new Promise(() => {}),
                setNavigationEnabled: () => {},
            } as never,
        });
        await settle();
        expect(() => clock.advance(3 * VIEW_ACTIVATION_PUMP_MS)).not.toThrow();
        handle.cancel('test done');
    });
});

describe('§STARTUP-PUMP-CADENCE — a latency dial, NOT a timeout', () => {
    it('asks its watchdog for the 250 ms cadence', async () => {
        const clock = makeClock();
        const sink = { failed: null as string | null };
        const handle = beginViewActivationLoading({
            target: 'site',
            overlay: fakeOverlay(sink),
            onRetry: () => {},
            now: clock.now,
            setInterval: clock.setInterval,
            clearInterval: clock.clearInterval,
            isPageHidden: () => false,
            signals: {
                whenViewerReady: () => Promise.resolve(),
                hasRealTileProvider: () => true,
                onTileLoadProgress: () => () => {},
                sampleTileLoadProgress: () => TILES_DONE,
                whenGroundSettled: () => new Promise(() => {}),
                setNavigationEnabled: () => {},
                requestRender: () => {},
            } as never,
        });
        expect(VIEW_ACTIVATION_PUMP_MS).toBe(250);
        expect(clock.askedMs).toEqual([250]);
        handle.cancel('test done');
    });

    it('does NOT make the gate less patient — the stall is still WALL CLOCK, not N ticks', async () => {
        const clock = makeClock();
        const sink = { failed: null as string | null };
        const handle = beginViewActivationLoading({
            target: 'site',
            overlay: fakeOverlay(sink),
            onRetry: () => {},
            now: clock.now,
            setInterval: clock.setInterval,
            clearInterval: clock.clearInterval,
            isPageHidden: () => false,
            signals: {
                whenViewerReady: () => Promise.resolve(),
                hasRealTileProvider: () => true,
                onTileLoadProgress: () => () => {},
                sampleTileLoadProgress: () => TILES_DONE,
                whenGroundSettled: () => new Promise(() => {}),
                setNavigationEnabled: () => {},
                requestRender: () => {},
            } as never,
        });
        handle.contentIssued();
        await settle();
        // 4× as many TICKS as the old cadence produced — and still no stall, because the
        // threshold is measured in milliseconds and only 1 ms short of it has elapsed.
        clock.advance(VIEW_ACTIVATION_STALL_MS - 1);
        expect(sink.failed).toBeNull();
        clock.advance(2 * VIEW_ACTIVATION_PUMP_MS);
        expect(sink.failed).not.toBeNull();
        handle.cancel('test done');
    });
});

describe('§STARTUP-ACTIVATION-IS-UNMEASURED — the window now names its own cost', () => {
    it('decomposes the activation into §STARTUP-BUDGET marks, in stage order', async () => {
        beginStartupBudget();
        const clock = makeClock();
        const sink = { failed: null as string | null };
        const handle = beginViewActivationLoading({
            target: 'site',
            overlay: fakeOverlay(sink),
            onRetry: () => {},
            now: clock.now,
            setInterval: clock.setInterval,
            clearInterval: clock.clearInterval,
            isPageHidden: () => false,
            signals: {
                whenViewerReady: () => Promise.resolve(),
                hasRealTileProvider: () => true,
                onTileLoadProgress: () => () => {},
                sampleTileLoadProgress: () => TILES_DONE,
                whenGroundSettled: () =>
                    Promise.resolve({ settled: true, source: 'photoreal-tile-clamp', baseHeightM: 106.4 }),
                setNavigationEnabled: () => {},
                requestRender: () => {},
            } as never,
        });
        handle.contentIssued();
        await handle.done;

        const phases = getStartupBudgetMarks().map((m) => m.phase);
        expect(phases).toEqual([
            'activation:site:start',
            'activation:site:viewer-ready',
            'activation:site:tiles-done',
            'activation:site:content-placed',
            'activation:site:ground-settled',
            'activation:site:dismissed(ready)',
        ]);
    });

    it('marks the terminal even when the user gives up — a run that ended is a reading', async () => {
        beginStartupBudget();
        const clock = makeClock();
        const sink = { failed: null as string | null };
        const handle = beginViewActivationLoading({
            target: 'globe',
            overlay: fakeOverlay(sink),
            onRetry: () => {},
            now: clock.now,
            setInterval: clock.setInterval,
            clearInterval: clock.clearInterval,
            isPageHidden: () => false,
            signals: {
                whenViewerReady: () => new Promise(() => {}),
                hasRealTileProvider: () => true,
                onTileLoadProgress: () => () => {},
                sampleTileLoadProgress: () => TILES_DONE,
                whenGroundSettled: () => new Promise(() => {}),
                setNavigationEnabled: () => {},
                requestRender: () => {},
            } as never,
        });
        handle.cancel('user switched view');
        await handle.done;
        expect(getStartupBudgetMarks().map((m) => m.phase)).toEqual([
            'activation:globe:start',
            'activation:globe:dismissed(not-ready)',
        ]);
    });
});
