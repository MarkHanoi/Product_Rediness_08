/**
 * viewActivationLoading.ts — the VIEW-ACTIVATION producer of the ONE loading overlay.
 *
 * §FEAT-VIEW-ACTIVATION-LOADING-OVERLAY (L-270, 2026-07-13).
 *
 * FOUNDER: "Could you add some LOADING SCREENS during the triggering of '3D globe view' and
 * '3D Site' view? … the same we have during batch element execution … and ONLY WHEN
 * EVERYTHING IS LOADED AND READY can the user jump in and navigate."
 *
 * The overlay already existed — wired to the batch coordinator and to NOTHING ELSE. This file
 * is the SECOND producer of that SAME overlay (see LoadingOverlayController): no new overlay
 * component, no forked spinner.
 *
 * THE READINESS SIGNAL IS NOT A TIMER. It is a chain of REAL signals, each of which already
 * existed inside CesiumViewport:
 *
 *   1. viewer   — `whenReady()`             : the Cesium viewer is constructed.
 *   2. tiles    — `sampleTileLoadProgress()`: Cesium's OWN pending/processing tile counters
 *                 + `onTileLoadProgress()`    reach zero (a real ratio drives the bar).
 *   3. content  — `trackPlacement(p)`       : the massing + GLB real-model placement that
 *                                             GISAreaLayout issued has landed.
 *   4. anchor   — `whenGroundSettled()`     : §FIX-CESIUM-GLOBE-ELEVATION-AND-GEOREF (L-259)
 *                                             seat-and-reveal — the ground datum is MEASURED
 *                                             and the model anchored on real ground. L-259
 *                                             exists precisely because the building was placed
 *                                             BEFORE the terrain had loaded and ended up ~50 m
 *                                             underground. Dismissing the overlay before this
 *                                             signal would re-open that door and lie to the user.
 *
 * WHY WE POLL THE TILE COUNTERS AS WELL AS LISTEN: the viewer runs with `requestRenderMode:
 * true` (CesiumViewport mount) — it renders on demand. Tile-progress EVENTS therefore go quiet
 * whenever the scene is quiescent, and an event-only gate could sit forever waiting for an
 * event that will never come. The counters are synchronous reads, so we sample them on every
 * watchdog tick too. VERIFY AT THE OUTCOME, NOT AT THE SEAM.
 *
 * NEVER HANG (mandate 5, L-250): a readiness signal that never arrives must FAIL VISIBLY. We
 * run a PROGRESS-STALL watchdog (the §LOAD-TIMEOUT-PROGRESS discipline from G2/0.3a — never a
 * fixed deadline race, which fails a slow-but-healthy load and passes a frozen one): if nothing
 * advances for `stallMs`, the overlay switches to its ERROR state with "Try again" and "Continue
 * anyway". The user is never trapped behind a permanent spinner.
 *
 * C01 §2 — this module has NO Cesium import. Every signal arrives through the injected
 * `ViewActivationSignals` port, so the whole state machine is unit-testable in a DOM-free,
 * Cesium-free environment (apps/editor/__tests__/viewActivationLoadingOverlay.test.ts).
 */

import type { LoadingOverlayController, LoadingSession } from '@app/ui/overlays/LoadingOverlayController';
import {
    VIEW_ACTIVATION_STALL_MS,
    isStalled,
    tileStreamFraction,
    tileStreamNote,
    viewActivationProgress,
    viewActivationStageLabel,
    type TileStreamSnapshot,
    type ViewActivationStage,
} from '@app/ui/overlays/loadingProgress';

export type ViewActivationTarget = 'globe' | 'site';

/** Everything the state machine needs from the (untestable) Cesium world. */
export interface ViewActivationSignals {
    /** CesiumViewport.whenReady() — resolves when the viewer is mounted. */
    whenViewerReady(): Promise<void>;
    /**
     * §SS-FIX-FORMA-TILES-READINESS-KEYLESS-GATE (L-327) — is a REAL tile/terrain provider
     * attached that will ACTUALLY stream tiles? On a keyless-ellipsoid flat-ground Forma study
     * the globe surface is hidden and no photoreal 3D tileset is attached, so tiles NEVER stream
     * and gating readiness on the tile counters would sit until the 25 s stall watchdog fires a
     * bogus "map tiles stopped streaming" error on a view that is already ready. This is the ONE
     * new signal the (Cesium-free, C01 §2) state machine needs to distinguish "tiles still
     * loading" from "there will never be tiles" — it stays Cesium-free because the fact arrives
     * through this injected port, wired from `CesiumViewport.hasRealTileProvider()`.
     *
     * OPTIONAL + default-safe: when a producer does not implement it (older wiring) OR the probe
     * throws, the state machine assumes a provider IS present and preserves the tiles gate +
     * stall watchdog exactly as before. Only a definitive `false` skips the gate (P1: the skip is
     * driven by a real injected signal, never a hardcoded "Forma is always keyless" assumption).
     */
    hasRealTileProvider?(): boolean;
    /** CesiumViewport.onTileLoadProgress() — real tile counters; returns an unsubscribe. */
    onTileLoadProgress(cb: (p: TileStreamSnapshot) => void): () => void;
    /** CesiumViewport.sampleTileLoadProgress() — a synchronous poll of the same counters. */
    sampleTileLoadProgress(): TileStreamSnapshot;
    /** CesiumViewport.whenGroundSettled() — the L-259 seat-and-reveal terminal. */
    whenGroundSettled(): Promise<{ settled: boolean; source: string; baseHeightM: number }>;
    /** CesiumViewport.setNavigationEnabled() — THE INPUT GATE. */
    setNavigationEnabled(on: boolean): void;
}

export interface ViewActivationHandle {
    /**
     * The orchestrator (GISAreaLayout) calls this the moment it has ISSUED the content
     * placement — i.e. after renderFormaMassing / renderBuildingOnGlobe has run and armed the
     * ground clamp. Only then is it safe to await `whenGroundSettled()`, which resolves
     * immediately when no clamp is in flight.
     */
    contentIssued(): void;
    /** Register an in-flight content placement promise (the GLB export + primitive load). */
    trackPlacement(p: Promise<unknown>): void;
    /** Abort the activation (user switched view) — dismisses the overlay, restores input. */
    cancel(reason: string): void;
    /**
     * The orchestrator hit a hard error (the mount rejected). Surface it in the overlay's ERROR
     * state with the same escape actions — a broken activation must be VISIBLE, never a spinner
     * that spins forever or a dismissal that pretends the view is ready.
     */
    fail(message: string): void;
    /** Resolves when the overlay is dismissed (ready, failed-and-dismissed, or cancelled). */
    readonly done: Promise<void>;
}

const TITLES: Record<ViewActivationTarget, string> = {
    globe: 'Opening the 3D globe',
    site: 'Opening the 3D Site',
};

/**
 * §SS-FIX-FORMA-TILES-READINESS-KEYLESS-GATE (L-327) — resolve whether the tiles stage should
 * be gated on real streaming. DEFAULT-SAFE: an unimplemented port method or a throwing probe
 * both return `true` (preserve the tiles gate + stall watchdog). Only a live viewport's explicit
 * `false` (keyless flat-ground study, no provider) skips the gate.
 */
function tileProviderAttached(signals: ViewActivationSignals): boolean {
    if (typeof signals.hasRealTileProvider !== 'function') return true;
    try {
        return signals.hasRealTileProvider();
    } catch {
        return true;
    }
}

export interface ViewActivationLoadingOptions {
    readonly target: ViewActivationTarget;
    readonly signals: ViewActivationSignals;
    readonly overlay: LoadingOverlayController;
    /** Re-run the whole activation (wired to the ERROR state's "Try again"). */
    readonly onRetry: () => void;
    /** Test seams. */
    readonly now?: () => number;
    readonly setInterval?: (cb: () => void, ms: number) => unknown;
    readonly clearInterval?: (handle: unknown) => void;
    readonly stallMs?: number;
}

/**
 * Begin a view-activation loading session. Returns synchronously — the overlay is UP and the
 * scene input is GATED from this instant, BEFORE any await, so there is no window in which the
 * user can grab a half-assembled scene.
 */
export function beginViewActivationLoading(
    opts: ViewActivationLoadingOptions,
): ViewActivationHandle {
    const {
        target,
        signals,
        overlay,
        onRetry,
        now = () => Date.now(),
        setInterval: setTimer = (cb: () => void, ms: number) => globalThis.setInterval(cb, ms),
        clearInterval: clearTimer = (h: unknown) => globalThis.clearInterval(h as never),
        stallMs = VIEW_ACTIVATION_STALL_MS,
    } = opts;

    const session: LoadingSession = overlay.begin(`view-activation:${target}`, {
        title: TITLES[target],
        label: viewActivationStageLabel('viewer'),
    });

    // ── THE INPUT GATE (founder mandate 3) ──────────────────────────────────────
    // The overlay backdrop already blocks pointer events by z-order (z 88880 over the Cesium
    // container's z 15); disabling Cesium's own camera controller too means the gate does not
    // depend on a stacking accident. Re-applied once the viewer exists (it may not yet).
    try { signals.setNavigationEnabled(false); } catch { /* viewer not up yet */ }

    let stage: ViewActivationStage = 'viewer';
    let stageFraction = 0;
    let lastAdvanceAt = now();
    let peakOutstanding = 0;
    let currentNote = '';
    let finished = false;
    let failed = false;
    let contentIssuedFlag = false;
    let unsubscribeTiles: (() => void) | null = null;
    let watchdog: unknown = null;
    let onTileSample: ((snap: TileStreamSnapshot) => void) | null = null;

    const placements = new Set<Promise<unknown>>();
    const contentIssuedResolvers: Array<() => void> = [];
    let resolveDone: () => void = () => {};
    const done = new Promise<void>((r) => { resolveDone = r; });

    const advance = (next: ViewActivationStage, fraction = 0): void => {
        if (finished) return;
        const stageChanged = next !== stage;
        const fractionAdvanced = !stageChanged && fraction > stageFraction;
        if (stageChanged || fractionAdvanced) lastAdvanceAt = now();
        stage = next;
        stageFraction = fraction;
        if (stageChanged) session.setLabel(viewActivationStageLabel(next));
        const p = viewActivationProgress(next, fraction);
        session.setProgress(p.completed, p.total, currentNote);
    };

    const finish = (reason: string, ready: boolean): void => {
        if (finished) return;
        // §FIX-GLOBE-ACTIVATE-STALE-VIEWER (L-313) — once a failure is SURFACED (the ERROR state
        // owns the overlay via "Try again"/"Continue anyway"), a late readiness signal must NOT
        // silently ready-dismiss it and pretend the view is live. The user's own action drives
        // dismissal from here (those actions call finish with ready=false, still allowed).
        if (failed && ready) return;
        finished = true;
        try { unsubscribeTiles?.(); } catch { /* best-effort */ }
        unsubscribeTiles = null;
        if (watchdog !== null) {
            try { clearTimer(watchdog); } catch { /* best-effort */ }
            watchdog = null;
        }
        // Release the input gate. On the READY path this is the moment the founder asked for:
        // "ONLY when everything is loaded and ready can the user jump in and navigate."
        try { signals.setNavigationEnabled(true); } catch { /* viewer gone */ }
        session.end();
        console.log(
            `[viewActivationLoading] §FEAT-VIEW-ACTIVATION-LOADING-OVERLAY ${target} — overlay ` +
            `dismissed (${reason}); navigation ${ready ? 'ENABLED — the view is ready' : 'restored'}.`,
        );
        resolveDone();
    };

    const failActivation = (message: string): void => {
        if (finished || failed) return;
        failed = true;
        console.error(
            `[viewActivationLoading] §FEAT-VIEW-ACTIVATION-LOADING-OVERLAY ${target} — readiness ` +
            `NEVER ARRIVED at stage "${stage}" (no progress for ${stallMs} ms): ${message}`,
        );
        session.fail({
            title: `${TITLES[target]} — taking too long`,
            message,
            actions: [
                {
                    label: 'Try again',
                    primary: true,
                    onClick: () => {
                        finish('user retry', false);
                        try { onRetry(); } catch (e) { console.error('[viewActivationLoading] retry threw:', e); }
                    },
                },
                {
                    // The escape hatch — the user is NEVER trapped behind the overlay.
                    label: 'Continue anyway',
                    onClick: () => finish('user dismissed the stall warning', false),
                },
            ],
        });
    };

    const waitForContentIssued = (): Promise<void> => {
        if (contentIssuedFlag) return Promise.resolve();
        return new Promise<void>((resolve) => { contentIssuedResolvers.push(resolve); });
    };

    const drainPlacements = async (): Promise<void> => {
        // Placements can be registered late (the GLB export starts after the massing render),
        // so drain until the set is empty rather than snapshotting once.
        let guard = 0;
        while (placements.size > 0 && guard++ < 32 && !finished) {
            const inflight = [...placements];
            await Promise.allSettled(inflight);
            for (const p of inflight) placements.delete(p);
        }
    };

    /** Fold one tile-counter reading into the bar. Returns true when streaming is COMPLETE. */
    const consumeTileSnapshot = (snap: TileStreamSnapshot): boolean => {
        const outstanding = Math.max(0, snap.pending) + Math.max(0, snap.processing);
        if (outstanding > peakOutstanding) peakOutstanding = outstanding;
        currentNote = tileStreamNote(snap, peakOutstanding);
        const f = tileStreamFraction(snap, peakOutstanding);
        if (f === null) session.setIndeterminate(currentNote);
        else if (stage === 'tiles') advance('tiles', f);
        return snap.tilesLoaded && outstanding === 0;
    };

    const waitForTiles = (): Promise<void> =>
        new Promise<void>((resolve) => {
            let settled = false;
            const settle = (): void => {
                if (settled) return;
                settled = true;
                onTileSample = null;
                try { unsubscribeTiles?.(); } catch { /* best-effort */ }
                unsubscribeTiles = null;
                resolve();
            };
            const feed = (snap: TileStreamSnapshot): void => {
                if (finished) return settle();
                if (consumeTileSnapshot(snap)) settle();
            };
            // Events give responsiveness; the watchdog's poll (onTileSample) gives CORRECTNESS
            // under `requestRenderMode: true`, where events go quiet on a quiescent scene.
            onTileSample = feed;
            unsubscribeTiles = signals.onTileLoadProgress(feed);
            try { feed(signals.sampleTileLoadProgress()); } catch { /* poll unavailable */ }
        });

    // ── the readiness chain ─────────────────────────────────────────────────────
    void (async () => {
        try {
            // 1. VIEWER
            await signals.whenViewerReady();
            if (finished) return;
            // The camera controller did not exist when we first gated — gate it now.
            try { signals.setNavigationEnabled(false); } catch { /* best-effort */ }
            advance('tiles', 0);

            // 2. TILES — a REAL streaming ratio from Cesium's own counters.
            //    §SS-FIX-FORMA-TILES-READINESS-KEYLESS-GATE (L-327): a keyless-ellipsoid
            //    flat-ground Forma study has NO tile/terrain provider (globe hidden, no photoreal
            //    tileset), so `tilesLoaded && outstanding===0` never becomes true and the stall
            //    watchdog would trip at 25 s with "the map tiles have stopped streaming" on a view
            //    that is actually ready. Skip the gate when the injected port reports no real
            //    provider is attached — but ONLY on that definitive signal, so when a provider IS
            //    attached and streaming genuinely stalls, the watchdog still surfaces the retry (P4).
            if (tileProviderAttached(signals)) {
                await waitForTiles();
                if (finished) return;
                currentNote = '';
            } else {
                console.log(
                    `[viewActivationLoading] §SS-FIX-FORMA-TILES-READINESS-KEYLESS-GATE ${target} — ` +
                    'no real tile provider attached (keyless flat-ground study); skipping the tiles ' +
                    'gate (tiles will never stream) and advancing straight to content.',
                );
            }
            advance('tiles', 1);

            // 3. CONTENT — the massing + real-model placement issued by the orchestrator.
            advance('content', 0);
            await waitForContentIssued();
            if (finished) return;
            await drainPlacements();
            if (finished) return;
            advance('content', 1);

            // 4. ANCHOR — L-259 seat-and-reveal: the building is standing on ground that was
            //    actually MEASURED, not on a fabricated ellipsoid 0.
            advance('anchor', 0);
            const ground = await signals.whenGroundSettled();
            if (finished) return;
            if (!ground.settled) {
                // The viewport was torn down mid-clamp — the signal will NEVER arrive.
                failActivation('The 3D view was closed before the ground could be measured.');
                return;
            }
            console.log(
                `[viewActivationLoading] §FEAT-VIEW-ACTIVATION-LOADING-OVERLAY ${target} — ground ` +
                `settled (source=${ground.source}, base=${ground.baseHeightM.toFixed(2)} m) → READY.`,
            );
            advance('ready', 1);
            finish('readiness chain complete', true);
        } catch (err) {
            if (finished) return;
            failActivation(`The 3D view failed to load: ${String((err as Error)?.message ?? err)}`);
        }
    })();

    // ── the STALL watchdog — never a fixed deadline, only a progress-freeze detector ──
    watchdog = setTimer(() => {
        if (finished || failed) return;
        // Poll the tile counters (see the requestRenderMode note in the header).
        if (onTileSample) {
            try { onTileSample(signals.sampleTileLoadProgress()); } catch { /* poll unavailable */ }
        }
        if (finished || failed) return;
        if (isStalled(now(), lastAdvanceAt, stallMs)) {
            failActivation(
                stage === 'tiles'
                    ? 'The map tiles have stopped streaming. Check your connection and try again.'
                    : `The 3D view stopped responding while ${viewActivationStageLabel(stage).toLowerCase()}`,
            );
        }
    }, 1000);

    return {
        contentIssued(): void {
            contentIssuedFlag = true;
            const resolvers = contentIssuedResolvers.splice(0, contentIssuedResolvers.length);
            for (const resolve of resolvers) resolve();
        },
        trackPlacement(p: Promise<unknown>): void {
            if (finished) return;
            placements.add(p);
            // A rejected placement must never take the activation down — the massing fallback
            // is still a valid, navigable result. It only stops COUNTING as in-flight.
            void p.catch(() => { /* the placement path logs + degrades on its own */ });
        },
        cancel(reason: string): void {
            finish(`cancelled — ${reason}`, false);
        },
        fail(message: string): void {
            failActivation(message);
        },
        done,
    };
}

/**
 * §FIX-GLOBE-CLICK-NAVIGATES-OUT (L-318) — run a view-activation ENTRY step (open the globe /
 * open the 3D Site) so that any error it throws OR rejects with is CONTAINED to the GIS surface:
 * logged, surfaced on the in-editor "Try again" overlay via `onFail`, and NEVER re-propagated.
 *
 * WHY THIS EXISTS: the globe/site activation is triggered from `void applyResultView(...)` /
 * sync click handlers. An error that escapes there becomes an unhandled window `error` /
 * `unhandledrejection`. The editor's ViewportCrashGuard treats GPU/render-keyword unhandled
 * errors as a viewport crash and shows the SceneCrashFallback, whose "Back to projects" link
 * (`<a href="/">`) FULL-RELOADS the app to the project hub (/projects) — ejecting the founder
 * from the editor mid-session (recurrent L-318). A stale/gpu-adjacent Cesium activation error
 * must instead stay put and offer retry. This helper is the single containment boundary.
 *
 * Always resolves (never rejects), so callers can `void containViewActivation(...)` safely with
 * no risk of an unhandled rejection leaking to the global crash guard.
 *
 * @param step   The activation to run (sync or async). Its throw/rejection is caught here.
 * @param onFail Surface the failure in-editor (typically `activeViewActivation?.fail(msg)`).
 * @param label  Human-readable prefix for the surfaced message.
 */
export async function containViewActivation(
    step: () => void | Promise<void>,
    onFail: (message: string) => void,
    label = 'The 3D view failed to open',
): Promise<void> {
    try {
        await step();
    } catch (err) {
        const message = `${label}: ${String((err as Error)?.message ?? err)}`;
        console.error(
            '[viewActivationLoading] §FIX-GLOBE-CLICK-NAVIGATES-OUT contained a view-activation error ' +
            '(kept IN-editor — no navigate-out, no reload):',
            err,
        );
        try {
            onFail(message);
        } catch (e) {
            console.error('[viewActivationLoading] §FIX-GLOBE-CLICK-NAVIGATES-OUT onFail handler threw (ignored):', e);
        }
    }
}
