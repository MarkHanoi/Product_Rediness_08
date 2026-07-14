/**
 * §FEAT-VIEW-ACTIVATION-LOADING-OVERLAY (L-270) — the readiness-gated loading overlay.
 *
 * These tests exist to make three claims FALSIFIABLE:
 *
 *   1. ONE OVERLAY, N PRODUCERS. The batch producer and the view-activation producer share a
 *      single surface, ref-counted: a batch that ends mid-activation must NOT dismiss the
 *      overlay, and vice-versa. (The bug this whole ticket is about is a capability wired to
 *      exactly one lifecycle.)
 *   2. DISMISS ON A REAL SIGNAL, NEVER A TIMER. The overlay must still be UP after the tiles
 *      have loaded and the content has been placed, and must come down ONLY once the L-259
 *      ground seat-and-reveal signal arrives. A test that cannot go RED if someone dismisses
 *      early is not a guard — so we assert the intermediate "still visible" states explicitly.
 *   3. NEVER HANG. A readiness signal that never arrives surfaces as an ERROR with escapes —
 *      not an eternal spinner. And the input gate is RELEASED on every exit path.
 */

import { describe, it, expect, vi } from 'vitest';
import {
    LoadingOverlayController,
    type LoadingOverlaySurface,
} from '../src/ui/overlays/LoadingOverlayController';
import type { LoadingOverlayAction } from '../src/ui/overlays/LoadingOverlayView';
import {
    accumulateBatchProgress,
    batchProgressNote,
    createBatchProgressState,
    isStalled,
    tileStreamFraction,
    viewActivationProgress,
} from '../src/ui/overlays/loadingProgress';
import { beginViewActivationLoading } from '../src/ui/geospatial/viewActivationLoading';

// ── a fake surface (no DOM) that records what the user would actually see ──────
function makeFakeSurface() {
    const state = {
        visible: false,
        title: '',
        label: '',
        completed: 0,
        total: 0,
        note: '' as string | undefined,
        error: null as { title: string; message: string; actions: readonly LoadingOverlayAction[] } | null,
        shows: 0,
        hides: 0,
    };
    const surface: LoadingOverlaySurface = {
        show(o) { state.visible = true; state.shows++; state.title = o.title; state.label = o.label ?? ''; state.error = null; },
        setTitle(t) { state.title = t; },
        setLabel(l) { state.label = l; },
        setProgress(p) { state.completed = p.completed; state.total = p.total; state.note = p.note; },
        setIndeterminate(note) { state.note = note; },
        showError(e) { state.error = { title: e.title, message: e.message, actions: e.actions }; },
        hide() { state.visible = false; state.hides++; },
        isVisible() { return state.visible; },
    };
    return { surface, state };
}

/** A deterministic clock + interval pump — no real timers anywhere in these tests. */
function makeClock() {
    let t = 0;
    const ticks: Array<() => void> = [];
    return {
        now: () => t,
        setInterval: (cb: () => void) => { ticks.push(cb); return ticks.length - 1; },
        clearInterval: (h: unknown) => { ticks[h as number] = () => {}; },
        /** Advance `ms` and fire every registered tick once. */
        advance(ms: number) { t += ms; for (const cb of [...ticks]) cb(); },
    };
}

const TILES_DONE = { pending: 0, processing: 0, tilesLoaded: true };

function makeSignals(overrides: Partial<{
    viewerReady: Promise<void>;
    groundSettled: Promise<{ settled: boolean; source: string; baseHeightM: number }>;
    tiles: () => typeof TILES_DONE;
}> = {}) {
    const navCalls: boolean[] = [];
    let emit: ((p: { pending: number; processing: number; tilesLoaded: boolean }) => void) | null = null;
    const signals = {
        whenViewerReady: () => overrides.viewerReady ?? Promise.resolve(),
        onTileLoadProgress: (cb: (p: { pending: number; processing: number; tilesLoaded: boolean }) => void) => {
            emit = cb;
            return () => { emit = null; };
        },
        sampleTileLoadProgress: () => (overrides.tiles ? overrides.tiles() : TILES_DONE),
        whenGroundSettled: () =>
            overrides.groundSettled ??
            Promise.resolve({ settled: true, source: 'photoreal-tile-clamp', baseHeightM: 706.9 }),
        setNavigationEnabled: (on: boolean) => { navCalls.push(on); },
    };
    return { signals, navCalls, emitTiles: (p: typeof TILES_DONE) => emit?.(p) };
}

/** Flush the microtask queue enough times for the readiness chain's awaits to settle. */
const flush = async (n = 12) => { for (let i = 0; i < n; i++) await Promise.resolve(); };

describe('L-270 · loadingProgress (pure)', () => {
    it('accumulates the REAL batch drain frames into a monotonic cumulative/peak ratio', () => {
        let s = createBatchProgressState(1); // the bogus per-sub-batch seed
        s = accumulateBatchProgress(s, 100, 900);
        expect(s).toMatchObject({ cumBuilt: 100, total: 1000 });
        s = accumulateBatchProgress(s, 400, 500);
        expect(s).toMatchObject({ cumBuilt: 500, total: 1000 });
        // A new sub-batch enqueues MORE work → the peak total grows, never shrinks.
        s = accumulateBatchProgress(s, 0, 1355);
        expect(s.total).toBe(1855);
        expect(batchProgressNote(s)).toBe('500 / 1,855 elements');
    });

    it('view-activation progress is stage-weighted and monotonic across the chain', () => {
        const seq = [
            viewActivationProgress('viewer', 0).completed,
            viewActivationProgress('tiles', 0).completed,
            viewActivationProgress('tiles', 1).completed,
            viewActivationProgress('content', 0.5).completed,
            viewActivationProgress('anchor', 0).completed,
            viewActivationProgress('ready').completed,
        ];
        for (let i = 1; i < seq.length; i++) expect(seq[i]).toBeGreaterThanOrEqual(seq[i - 1]);
        expect(seq.at(-1)).toBe(1000);
    });

    it('tileStreamFraction never reports 1 from the ratio alone — only tilesLoaded proves it', () => {
        expect(tileStreamFraction({ pending: 0, processing: 0, tilesLoaded: false }, 100)).toBeLessThan(1);
        expect(tileStreamFraction({ pending: 0, processing: 0, tilesLoaded: true }, 100)).toBe(1);
        // Nothing outstanding yet and nothing loaded → no honest ratio (→ indeterminate).
        expect(tileStreamFraction({ pending: 0, processing: 0, tilesLoaded: false }, 0)).toBeNull();
    });

    it('the watchdog is a progress-FREEZE detector, not a deadline (§LOAD-TIMEOUT-PROGRESS)', () => {
        expect(isStalled(24_000, 0, 25_000)).toBe(false); // slow but advancing recently
        expect(isStalled(26_000, 0, 25_000)).toBe(true);  // frozen
        expect(isStalled(100_000, 99_000, 25_000)).toBe(false); // 100 s in, but it just advanced
    });
});

describe('L-270 · LoadingOverlayController — one overlay, N producers', () => {
    it('is ref-counted: a batch ending mid-activation does NOT dismiss the overlay', () => {
        const { surface, state } = makeFakeSurface();
        const overlay = new LoadingOverlayController(() => surface);

        const view = overlay.begin('view-activation:globe', { title: 'Opening the 3D globe' });
        const batch = overlay.begin('batch', { title: 'Generating your model' });
        expect(state.visible).toBe(true);
        expect(state.shows).toBe(1); // ONE surface, not two

        batch.end();
        expect(state.visible).toBe(true); // the globe activation still owns the screen
        expect(state.title).toBe('Opening the 3D globe'); // and repaints its own state

        view.end();
        expect(state.visible).toBe(false);
        expect(state.hides).toBe(1);
    });

    it('surfaces a failure with escape actions and keeps the gate until the user acts', () => {
        const { surface, state } = makeFakeSurface();
        const overlay = new LoadingOverlayController(() => surface);
        const s = overlay.begin('view-activation:site', { title: 'Opening the 3D Site' });
        const onClick = vi.fn();
        s.fail({ message: 'stalled', actions: [{ label: 'Try again', onClick, primary: true }] });
        expect(state.error?.message).toBe('stalled');
        expect(overlay.isBlocking()).toBe(true); // still gated — the user must decide
        state.error?.actions[0].onClick();
        expect(onClick).toHaveBeenCalled();
        s.end();
        expect(overlay.isBlocking()).toBe(false);
    });
});

describe('L-270 · view activation — dismiss on the REAL readiness signal', () => {
    it('gates input immediately and holds the overlay until the L-259 ground settle', async () => {
        const { surface, state } = makeFakeSurface();
        const overlay = new LoadingOverlayController(() => surface);
        const clock = makeClock();

        let settleGround: (v: { settled: boolean; source: string; baseHeightM: number }) => void = () => {};
        const groundSettled = new Promise<{ settled: boolean; source: string; baseHeightM: number }>(
            (r) => { settleGround = r; },
        );
        const { signals, navCalls } = makeSignals({ groundSettled });

        const handle = beginViewActivationLoading({
            target: 'globe',
            signals,
            overlay,
            onRetry: () => {},
            now: clock.now,
            setInterval: clock.setInterval,
            clearInterval: clock.clearInterval,
        });

        // The gate is closed SYNCHRONOUSLY — before any await could let the user grab the scene.
        expect(state.visible).toBe(true);
        expect(navCalls[0]).toBe(false);

        // Tiles are already loaded, and the orchestrator has issued + landed the content…
        handle.contentIssued();
        handle.trackPlacement(Promise.resolve('glb placed'));
        await flush();

        // …and the overlay is STILL UP, because the ground datum has not settled. THIS is the
        // assertion that goes RED if anyone dismisses on tiles/placement alone (the L-259 bug:
        // acting before the terrain was known put the building 50 m underground).
        expect(state.visible).toBe(true);
        expect(navCalls.includes(true)).toBe(false); // navigation still blocked

        settleGround({ settled: true, source: 'photoreal-tile-clamp', baseHeightM: 706.9 });
        await flush();

        expect(state.visible).toBe(false);            // dismissed on the REAL signal
        expect(navCalls.at(-1)).toBe(true);           // "…only then can the user jump in"
        await handle.done;
    });

    it('NEVER HANGS: a ground signal that never arrives fails visibly with escapes', async () => {
        const { surface, state } = makeFakeSurface();
        const overlay = new LoadingOverlayController(() => surface);
        const clock = makeClock();
        const { signals, navCalls } = makeSignals({ groundSettled: new Promise(() => { /* never */ }) });

        const handle = beginViewActivationLoading({
            target: 'globe',
            signals,
            overlay,
            onRetry: () => {},
            now: clock.now,
            setInterval: clock.setInterval,
            clearInterval: clock.clearInterval,
            stallMs: 25_000,
        });
        handle.contentIssued();
        await flush();

        clock.advance(10_000);
        expect(state.error).toBeNull();  // slow is not broken

        clock.advance(20_000);           // 30 s with zero advance → frozen
        expect(state.error).not.toBeNull();
        expect(state.error?.actions.map((a) => a.label)).toEqual(['Try again', 'Continue anyway']);
        expect(state.visible).toBe(true); // still gated — the user has not decided yet

        // The escape hatch always works: the user is never trapped.
        state.error?.actions[1].onClick();
        expect(state.visible).toBe(false);
        expect(navCalls.at(-1)).toBe(true); // input restored on the failure path too
        await handle.done;
    });

    it('a viewport torn down mid-clamp (settled:false) is a FAILURE, not an eternal wait', async () => {
        const { surface, state } = makeFakeSurface();
        const overlay = new LoadingOverlayController(() => surface);
        const clock = makeClock();
        const { signals } = makeSignals({
            groundSettled: Promise.resolve({ settled: false, source: 'unresolved', baseHeightM: 0 }),
        });

        const handle = beginViewActivationLoading({
            target: 'site',
            signals,
            overlay,
            onRetry: () => {},
            now: clock.now,
            setInterval: clock.setInterval,
            clearInterval: clock.clearInterval,
        });
        handle.contentIssued();
        await flush();

        expect(state.error?.message).toMatch(/closed before the ground could be measured/i);
        state.error?.actions[1].onClick();
        expect(state.visible).toBe(false);
        await handle.done;
    });

    it('"Try again" re-runs the activation and releases the gate first', async () => {
        const { surface, state } = makeFakeSurface();
        const overlay = new LoadingOverlayController(() => surface);
        const clock = makeClock();
        const onRetry = vi.fn();
        const { signals } = makeSignals({ groundSettled: new Promise(() => { /* never */ }) });

        const handle = beginViewActivationLoading({
            target: 'globe', signals, overlay, onRetry,
            now: clock.now, setInterval: clock.setInterval, clearInterval: clock.clearInterval,
            stallMs: 5_000,
        });
        handle.contentIssued();
        await flush();
        clock.advance(6_000);

        expect(state.error).not.toBeNull();
        state.error?.actions[0].onClick();
        expect(onRetry).toHaveBeenCalledTimes(1);
        expect(overlay.isBlocking()).toBe(false); // the failed session is gone before the retry
        await handle.done;
    });

    it('cancel (user left the view mid-load) dismisses the overlay and restores input', async () => {
        const { surface, state } = makeFakeSurface();
        const overlay = new LoadingOverlayController(() => surface);
        const clock = makeClock();
        const { signals, navCalls } = makeSignals({ groundSettled: new Promise(() => { /* never */ }) });

        const handle = beginViewActivationLoading({
            target: 'site', signals, overlay, onRetry: () => {},
            now: clock.now, setInterval: clock.setInterval, clearInterval: clock.clearInterval,
        });
        expect(state.visible).toBe(true);
        handle.cancel('GIS deactivated');
        expect(state.visible).toBe(false);
        expect(navCalls.at(-1)).toBe(true);
        await handle.done;
    });
});
