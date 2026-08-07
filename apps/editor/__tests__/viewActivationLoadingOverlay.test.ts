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
    /** §SS-FIX-FORMA-TILES-READINESS-KEYLESS-GATE (L-327) — omit → provider IS attached (default
     *  true: the tiles gate is preserved, matching the pre-L-327 behaviour every other test relies
     *  on). Pass `() => false` to model a keyless flat-ground Forma study with no tile provider. */
    hasRealTileProvider: () => boolean;
}> = {}) {
    const navCalls: boolean[] = [];
    let emit: ((p: { pending: number; processing: number; tilesLoaded: boolean }) => void) | null = null;
    const signals = {
        whenViewerReady: () => overrides.viewerReady ?? Promise.resolve(),
        hasRealTileProvider: () => (overrides.hasRealTileProvider ? overrides.hasRealTileProvider() : true),
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

    it('L-327: a keyless flat-ground study (no tile provider) reaches READY without a tiles stall', async () => {
        // §SS-FIX-FORMA-TILES-READINESS-KEYLESS-GATE — the Forma keyless ellipsoid never streams
        // tiles (`tilesLoaded` stays false forever). Pre-fix, the tiles gate sat until the 25 s
        // stall watchdog and showed "the map tiles have stopped streaming". With the provider
        // signal reporting FALSE, the tiles stage is skipped and readiness completes on the ground
        // settle — no error, ever, no matter how long we wait.
        const { surface, state } = makeFakeSurface();
        const overlay = new LoadingOverlayController(() => surface);
        const clock = makeClock();
        const NEVER_LOADS = { pending: 0, processing: 0, tilesLoaded: false };
        const { signals, navCalls } = makeSignals({
            tiles: () => NEVER_LOADS,
            hasRealTileProvider: () => false,
        });

        const handle = beginViewActivationLoading({
            target: 'site', signals, overlay, onRetry: () => {},
            now: clock.now, setInterval: clock.setInterval, clearInterval: clock.clearInterval,
            stallMs: 25_000,
        });
        handle.contentIssued();
        await flush();

        // Readiness completed (ground settled) even though tiles never loaded.
        expect(state.error).toBeNull();
        expect(state.visible).toBe(false);
        expect(navCalls.at(-1)).toBe(true); // input released — the view is ready

        // And no late tiles-stall error appears however long we sit past the stall window.
        clock.advance(60_000);
        expect(state.error).toBeNull();
        await handle.done;
    });

    it('L-327 P4: with a real provider, a genuine tiles stall STILL surfaces the retry', async () => {
        // The safety net must stay honest for the case it was built for: a real provider attached,
        // streaming genuinely frozen (outstanding never drains) → the 25 s progress-freeze detector
        // still fails visibly with the tiles-specific message + escapes.
        const { surface, state } = makeFakeSurface();
        const overlay = new LoadingOverlayController(() => surface);
        const clock = makeClock();
        const FROZEN = { pending: 5, processing: 0, tilesLoaded: false };
        const { signals } = makeSignals({
            tiles: () => FROZEN,
            hasRealTileProvider: () => true,
            groundSettled: new Promise(() => { /* never — the chain never gets past tiles */ }),
        });

        const handle = beginViewActivationLoading({
            target: 'globe', signals, overlay, onRetry: () => {},
            now: clock.now, setInterval: clock.setInterval, clearInterval: clock.clearInterval,
            stallMs: 25_000,
        });
        handle.contentIssued();
        await flush();

        clock.advance(30_000); // 30 s frozen at the tiles stage
        expect(state.error).not.toBeNull();
        // §STALL-COPY-DOES-NOT-BLAME-THE-USER — assert the PROPERTY, not the wording: the message
        // must name what we observed (tiles stopped arriving) and must NOT send the user off to
        // debug a working network. The stall this fires on was our own doing (landuse/water
        // falling back to same-origin Overpass, measured at 47 s and 6.9 s / 17 MB against the very
        // origin Cesium streams terrain from), and the founder's connection was demonstrably fine —
        // the same session pulled thousands of footprints from R2 in milliseconds. Same class as
        // ADR-0292's crash modal blaming the user's GPU driver; the rule is ADR-0299.
        expect(state.error?.message).toMatch(/tiles stopped arriving/i);
        expect(state.error?.message).not.toMatch(/check your connection/i);
        expect(state.error?.actions.map((a) => a.label)).toEqual(['Try again', 'Continue anyway']);
        state.error?.actions[1].onClick();
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

// ─────────────────────────────────────────────────────────────────────────────
// §TILES-SETTLED-IS-NOT-STALLED (L-713, founder 2026-08-07) — the startup blocker.
//
// The founder's log: `tilesLoaded=true renderedTerrainTiles=7 camH=663m` WHILE the gate reported
// `readiness NEVER ARRIVED at stage "tiles" (no progress for 25000 ms)` and the card blamed their
// connection. Terrain had loaded and was rendering; the gate could not see it.
//
// TWO causes, both of the failure-and-success-are-the-same-value shape:
//   1. the completion test ANDed Cesium's authoritative `tilesLoaded` with a residual counter, so
//      a counter that never drains VETOES a definitive completion signal;
//   2. `lastAdvanceAt` only refreshes on a strictly-INCREASING fraction, so a bar that stopped
//      rising because streaming FINISHED is indistinguishable from one that stopped because it
//      STUCK — a "no progress for 25 s" test fails identically for both.
import { tileStreamSettled, tileStreamNote, TILE_SETTLE_GRACE_MS } from '../src/ui/overlays/loadingProgress';

describe('§TILES-PROVIDER-READY (L-714) — one stuck tile must not hold the view hostage', () => {
    // `snap` models the REAL producer: CesiumViewport derives `tilesLoaded` as
    // `pending===0 && processing===0 && globeLoaded && tilesetLoaded`, so it is a CONJUNCTION and
    // cannot be true while a counter is stuck. `providerLoaded` is Cesium's own verdict alone.
    const snap = (pending: number, processing: number, providerLoaded: boolean) => ({
        pending,
        processing,
        providerLoaded,
        tilesLoaded: pending === 0 && processing === 0 && providerLoaded,
    });

    it('settles AT ONCE when the provider agrees and nothing is outstanding', () => {
        expect(tileStreamSettled(snap(0, 0, true), 0)).toBe(true);
    });

    it('⚠ REGRESSION: the L-713 grace period was DEAD CODE, because tilesLoaded is a conjunction', () => {
        // `tilesLoaded: true` with a stuck counter is UNREACHABLE at the producer — which is why
        // gating the grace period on it could never fire, and why the founder still saw 19/20 after
        // L-713 shipped. This test pins the shape so it cannot be reintroduced.
        const stuck = snap(1, 0, true);
        expect(stuck.tilesLoaded).toBe(false);          // the state L-713 waited for cannot occur
        expect(stuck.providerLoaded).toBe(true);        // while the provider says the view IS loaded
        expect(tileStreamSettled(stuck, TILE_SETTLE_GRACE_MS)).toBe(true);
    });

    it('reveals on the founder EXACT reading — 19 of 20, one tile that never arrives', () => {
        const nineteenOfTwenty = snap(1, 0, true);
        expect(tileStreamSettled(nineteenOfTwenty, TILE_SETTLE_GRACE_MS)).toBe(true);
        expect(tileStreamSettled(nineteenOfTwenty, TILE_SETTLE_GRACE_MS - 1)).toBe(false);
    });

    it('does NOT settle on the transient provider-true before streaming begins (L-259)', () => {
        // Believing it instantly re-opens the building-placed-on-unmeasured-ground bug.
        expect(tileStreamSettled(snap(12, 3, true), 0)).toBe(false);
    });

    it('never settles while the PROVIDER says the view is not loaded, however long we wait', () => {
        // A genuine stall must still reach the watchdog — this must not silence it.
        expect(tileStreamSettled(snap(40, 5, false), 60_000)).toBe(false);
        expect(tileStreamSettled(snap(0, 0, false), 60_000)).toBe(false);
    });

    it('degrades to the STRICT counter behaviour when providerLoaded is absent', () => {
        // An older/foreign port that cannot supply the field must not silently settle early.
        expect(tileStreamSettled({ pending: 1, processing: 0, tilesLoaded: false }, 60_000)).toBe(false);
        expect(tileStreamSettled({ pending: 0, processing: 0, tilesLoaded: true }, 0)).toBe(true);
    });

    it('DISCLOSES that context is still filling in when it reveals early', () => {
        // §ENVELOPE-SOLID-OVERSTATES / L-513b — the honesty requirement moves, it does not vanish.
        // Presenting partial context as complete is an overstatement about real land.
        expect(tileStreamNote(snap(1, 0, true), 20)).toMatch(/still filling in/i);
        expect(tileStreamNote(snap(0, 0, true), 20)).not.toMatch(/still filling in/i);
    });
});
