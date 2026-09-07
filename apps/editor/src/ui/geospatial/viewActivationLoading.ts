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
 * C01 §2 — this module has NO Cesium import and no DOM access. Every signal arrives through the
 * injected `ViewActivationSignals` port, so the whole state machine is unit-testable in a DOM-free,
 * Cesium-free environment (apps/editor/__tests__/viewActivationLoadingOverlay.test.ts). The one
 * engine import is `markStartupPhase` — the EXISTING §STARTUP-BUDGET probe, which is pure (one
 * `performance.now()`, one array push, one log line; its only import is `@opentelemetry/api`) and
 * is deliberately NOT a rival timer. See §STARTUP-ACTIVATION-IS-UNMEASURED below.
 */

import { markStartupPhase } from '@app/engine/startupBudget';
import type { LoadingOverlayController, LoadingSession } from '@app/ui/overlays/LoadingOverlayController';
import {
    VIEW_ACTIVATION_STALL_MS,
    isStalled,
    tileReadinessVerdict,
    tileStreamFraction,
    tileStreamNote,
    viewActivationProgress,
    viewActivationStageLabel,
    viewActivationStageText,
    VIEW_ACTIVATION_TOTAL,
    type TileStreamSnapshot,
    type ViewActivationStage,
} from '@app/ui/overlays/loadingProgress';

/**
 * §READINESS-TERMS-ARE-SEPARABLE (L-716) — a stable signature of the decomposed terms, so a term
 * flipping counts as an observation CHANGE even when the aggregate `providerLoaded` does not move.
 * Treating the aggregate as the only observable is what made the founder's snapshot look frozen
 * for 92 s when its parts may well have been moving underneath.
 */
function termsSignature(snap: TileStreamSnapshot | null): string {
    if (!snap?.terms) return '';
    return snap.terms.map((t) => `${t.name}:${t.applicable ? 'A' : '-'}${t.value ? '1' : '0'}`).join(',');
}

/**
 * §STARTUP-PUMP-CADENCE (founder 2026-09-06: "make the loading from the moment I add the location
 * until it loads the plan in 2d + 3d site split view MUCH QUICKER").
 *
 * ⚠ THIS IS A LATENCY DIAL, NOT A TIMEOUT. The stall threshold is and stays `VIEW_ACTIVATION_STALL_MS`
 * of WALL CLOCK (`isStalled(now, lastAdvanceAt, stallMs)`), so changing this cadence cannot make the
 * gate more or less patient about failure — it only changes how often the gate DRIVES the scene and
 * how soon it NOTICES readiness. It was 1000 ms, which under `requestRenderMode: true` meant two
 * separate costs on every site activation: outstanding tile work was offered a frame at most once a
 * second, and a view that became ready right after a tick stayed behind a full-screen overlay for up
 * to a further second doing nothing. At 250 ms both bounds fall 4×, for the price of three extra
 * `scene.requestRender()` flag writes per second — which cannot themselves draw a frame; Cesium's own
 * loop still decides that, at most once per display refresh.
 *
 * ⛔ It buys nothing by rendering LESS: every tile, every placement and every ground sample is still
 * awaited in full. The only thing that shrinks is dead waiting.
 */
export const VIEW_ACTIVATION_PUMP_MS = 250;

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
    /**
     * §TILES-NEED-A-FRAME (L-715) — `scene.requestRender()`. ⚠ THE READINESS GATE MUST DRIVE THE
     * SCENE IT IS WAITING ON, AND THIS IS WHY THREE PREVIOUS FIXES DID NOTHING.
     *
     * `CesiumViewport` runs `requestRenderMode: true` (§CESIUM-PERF-REQUEST-RENDER-MODE, deliberate
     * — it stops ~60 wasted idle redraws a second). In that mode Cesium renders ONLY on demand, and
     * **tile work is retired DURING A RENDER**: a tile that has downloaded still needs a frame to be
     * processed and for the counters to fall. Cesium auto-requests a render on camera move, tileset
     * load and imagery change — so while the entry flight is descending, frames happen and tiles
     * retire. The moment the camera PARKS the scene goes quiescent, rendering stops, and any
     * remaining tile work freezes exactly where it is.
     *
     * That is the founder's `19 / 20`: the descent retired nineteen, the camera parked, and the
     * twentieth had no frame in which to finish. The readiness poll reads the counters but never
     * asked for a frame, so polling could NEVER unstick it — the watchdog was the only reachable
     * outcome, on every new project.
     *
     * ⚠ SO THE PREDICATE WAS NEVER THE DEFECT. The counter, the L-713 grace period and the L-714
     * provider verdict all reported truthfully that nothing was progressing, because nothing was:
     * we were reading a thermometer in a room with the heating off. A gate that waits on tile
     * progress under `requestRenderMode` MUST pump the scene, or it is waiting on work it has
     * itself prevented.
     *
     * P3 is not at risk: `requestRender()` sets a flag consumed by Cesium's EXISTING loop — it
     * schedules no `requestAnimationFrame`, and this is called from the watchdog's existing 1 s
     * timer, not a new one. Optional + default-safe: an older producer simply keeps the previous
     * (broken-but-unchanged) behaviour rather than throwing.
     */
    requestRender?(): void;
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
    /**
     * §STALL-CLOCK-PAUSES-WHILE-HIDDEN (L-715 follow-up) — is the page currently hidden?
     *
     * When the tab is hidden the browser suspends `requestAnimationFrame`, so Cesium's loop never
     * consumes the pump's `requestRender()` flag and NOTHING can retire tile work — "no progress"
     * is then a fact about the BROWSER'S THROTTLING, not about the tiles. A stall watchdog that
     * keeps counting through that window fires a "map tiles stopped arriving" error over a load
     * that was never allowed to run (§CONTEXT-DATA-HONESTY: starved and stuck must not share a
     * message). The watchdog therefore PAUSES its stall clock while this returns true, and the
     * total paused time is named in the stall report.
     *
     * Default reads `document.visibilityState` (guarded — DOM-free test environments fall back to
     * "visible"). Injectable as a test seam like the clock.
     */
    readonly isPageHidden?: () => boolean;
    /**
     * §STARTUP-PUMP-CADENCE (founder 2026-09-06) — how often the gate pumps a frame and re-reads
     * the counters. Defaults to `VIEW_ACTIVATION_PUMP_MS`. Test seam only; production never sets it.
     */
    readonly pumpMs?: number;
    /**
     * §STARTUP-QUIET-ACTIVATION (founder 2026-09-07) — see `ViewActivationQuietWindow`. Absent on
     * every path but the start-up descent, and when absent NOTHING here changes: the full-screen
     * overlay goes up synchronously exactly as it always has.
     */
    readonly quietWindow?: ViewActivationQuietWindow;
}

/**
 * §STARTUP-QUIET-ACTIVATION (founder 2026-09-07: *"do the zoom in to the location way slower — to
 * ideally not have the loading page at all"*).
 *
 * ⭐ WHAT THIS CHANGES IS **WHERE** THE LOAD IS REPORTED, NEVER **WHETHER** IT IS. Every readiness
 * term, the stall watchdog, the input gate, the READY dismissal and the failure copy are untouched.
 * While a quiet window is open the SAME strings this producer would have painted on the full-screen
 * splash are painted on an unobtrusive in-view line instead, over the live descending scene.
 *
 * ⛔ A HIDDEN OVERLAY MUST NEVER BECOME A HIDDEN ERROR. `fail()` — the stall watchdog, a rejected
 * mount, a torn-down viewport — RAISES the full overlay first and then shows the error on it, with
 * its "Try again" / "Continue anyway" escapes. There is no path on which a failure stays quiet.
 *
 * ⛔ AND THERE IS DELIBERATELY NO TIME CEILING. An "escalate after N seconds" rule would be a fixed
 * deadline race, which this file's own header forbids for exactly the reason it forbids it for the
 * stall watchdog: it fails a slow-but-healthy load and passes a frozen one. A stream that merely
 * OUTLASTS the flight keeps the quiet line, which is still showing its live ratio ("21 / 22 tiles ·
 * 58 %"); a stream that STOPS is caught by the unchanged `VIEW_ACTIVATION_STALL_MS` progress-freeze
 * watchdog, which raises the overlay. Slow and stuck stay different answers (§CONTEXT-DATA-HONESTY).
 */
export interface ViewActivationQuietWindow {
    /**
     * Settles when the animation that is COVERING this load is over — in production the start-up
     * camera descent (`CesiumViewport.whenStartupDescentSettled()`). It is used ONLY to log the
     * hand-over point and to stop claiming the flight is still running; it does NOT escalate.
     * A rejection is treated as "the flight is over", never as a failure of the load.
     */
    readonly until: Promise<unknown>;
    /**
     * Paint the unobtrusive in-view line. `null` clears it. Called with the SAME phase label, note
     * and percentage the overlay would have shown. Must never throw a load down — a throw here is
     * caught and ignored, because a cosmetic line failing is not a reason to fail an activation.
     */
    readonly show: (line: string | null) => void;
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
        pumpMs = VIEW_ACTIVATION_PUMP_MS,
        isPageHidden = () => {
            try {
                return typeof document !== 'undefined' && document.visibilityState === 'hidden';
            } catch {
                return false;
            }
        },
    } = opts;

    // ── §STARTUP-QUIET-ACTIVATION — the ONE session, opened NOW or opened LATE ──────────
    //
    // `session` below is the same five calls the rest of this file has always made
    // (`setLabel` / `setProgress` / `setIndeterminate` / `fail` / `end`). With no quiet window it
    // is a straight pass-through to a session begun synchronously — byte-for-byte today's
    // behaviour, and every existing test exercises exactly that. With one, the session is NOT
    // begun: the identical paint is routed to `quiet.show(...)` and the real session is opened
    // only when something needs the full screen (a failure). Holding the LAST paint is what makes
    // that late open honest — the overlay comes up showing the CURRENT reading, never a blank one.
    const quiet = opts.quietWindow ?? null;
    let realSession: LoadingSession | null = null;
    let overlayRaised = false;
    let paintLabel = viewActivationStageLabel('viewer');
    let lastPaint:
        | { kind: 'progress'; completed: number; total: number; note?: string }
        | { kind: 'indeterminate'; note?: string } = { kind: 'indeterminate' };

    const quietLine = (): string => {
        const pct =
            lastPaint.kind === 'progress' && lastPaint.total > 0
                ? `${Math.round((lastPaint.completed / lastPaint.total) * 100)}%`
                : '';
        return [TITLES[target], paintLabel, lastPaint.note ?? '', pct]
            .filter((p) => typeof p === 'string' && p.length > 0)
            .join(' · ');
    };

    const paintQuiet = (): void => {
        if (!quiet || overlayRaised) return;
        try { quiet.show(quietLine()); } catch { /* a cosmetic line never fails a load */ }
    };

    const clearQuiet = (): void => {
        if (!quiet) return;
        try { quiet.show(null); } catch { /* ditto */ }
    };

    /** Open the full-screen overlay, replaying the current reading onto it. Idempotent. */
    const raiseOverlay = (why: string): LoadingSession => {
        if (realSession) return realSession;
        overlayRaised = true;
        clearQuiet();
        const s = overlay.begin(`view-activation:${target}`, {
            title: TITLES[target],
            label: paintLabel,
        });
        if (lastPaint.kind === 'progress') s.setProgress(lastPaint.completed, lastPaint.total, lastPaint.note);
        else s.setIndeterminate(lastPaint.note);
        realSession = s;
        if (quiet) {
            console.log(
                `[viewActivationLoading] §STARTUP-QUIET-ACTIVATION ${target} — raising the ` +
                `full-screen overlay (${why}). Quiet line was: "${quietLine()}".`,
            );
        }
        return s;
    };

    const session = {
        setLabel(label: string): void {
            paintLabel = label;
            if (realSession) realSession.setLabel(label);
            else paintQuiet();
        },
        setProgress(completed: number, total: number, note?: string): void {
            lastPaint = { kind: 'progress', completed, total, note };
            if (realSession) realSession.setProgress(completed, total, note);
            else paintQuiet();
        },
        setIndeterminate(note?: string): void {
            lastPaint = { kind: 'indeterminate', note };
            if (realSession) realSession.setIndeterminate(note);
            else paintQuiet();
        },
        /** ⛔ A failure ALWAYS takes the full screen — the quiet window is not an error channel. */
        fail(e: Parameters<LoadingSession['fail']>[0]): void {
            raiseOverlay('the activation FAILED — a quiet window is not an error channel').fail(e);
        },
        end(): void {
            clearQuiet();
            realSession?.end();
        },
    };

    // No quiet window ⇒ the overlay is UP synchronously, before any await, exactly as before.
    if (!quiet) raiseOverlay('no quiet window — the default full-screen activation');
    else {
        console.log(
            `[viewActivationLoading] §STARTUP-QUIET-ACTIVATION ${target} — the start-up descent is ` +
            'flying, so this load reports on an in-view line instead of the full-screen splash. ' +
            'Readiness, the stall watchdog and the input gate are UNCHANGED; a failure still takes ' +
            'the full screen.',
        );
        paintQuiet();
        void Promise.resolve(quiet.until).then(
            () => {
                if (finished) return;
                markStartupPhase(`activation:${target}:descent-settled`); // §STARTUP-BUDGET
                console.log(
                    `[viewActivationLoading] §STARTUP-QUIET-ACTIVATION ${target} — the descent has ` +
                    'landed and the load is still running. Staying QUIET on purpose: the in-view ' +
                    'line keeps showing the live ratio, and the unchanged progress-freeze watchdog ' +
                    '(not a clock) is what raises the overlay if it actually stops.',
                );
            },
            () => { /* a refused/superseded flight is a settled flight, never a load failure */ },
        );
    }

    // §STARTUP-ACTIVATION-IS-UNMEASURED (founder 2026-09-06: "make the loading … MUCH QUICKER")
    //
    // ⭐ THIS IS THE WINDOW THE FOUNDER CALLS "THE LOADING", AND UNTIL NOW IT EMITTED NOT ONE MARK.
    // §STARTUP-BUDGET's vocabulary ends at `reveal:split-mounted`. On the founder's OWN recorded run
    // (L-753) every mark from `geocode:end` to `reveal:split-mounted` totals ~315 ms of machine time
    // (261+1+0+15+1+21+16), and on the Cordoba run ~1.9 s — so the seconds he is waiting are ALL on
    // the far side of that mark, inside THIS gate: viewer → tiles → content → anchor. Measuring it is
    // the same prescription L-772 wrote for the layer above ("the fix is 3 marks, not an
    // optimisation"), applied one layer down, and it is why the stage marks below exist BEFORE any
    // tuning. Passive and behaviour-free: `markStartupPhase` is one `performance.now()`, one push
    // and one log line, and a mark arriving outside a run auto-begins one rather than being dropped.
    markStartupPhase(`activation:${target}:start`); // §STARTUP-BUDGET
    // §STARTUP-QUIET-ACTIVATION — a SECOND mark on the quiet route, emitted after `:start` so the
    // budget reads in the order it happened. It names the window in which the founder is looking
    // at the descending scene rather than at the splash.
    if (quiet) markStartupPhase(`activation:${target}:quiet-start`); // §STARTUP-BUDGET

    // ── THE INPUT GATE (founder mandate 3) ──────────────────────────────────────
    // The overlay backdrop already blocks pointer events by z-order (z 88880 over the Cesium
    // container's z 15); disabling Cesium's own camera controller too means the gate does not
    // depend on a stacking accident. Re-applied once the viewer exists (it may not yet).
    try { signals.setNavigationEnabled(false); } catch { /* viewer not up yet */ }

    let stage: ViewActivationStage = 'viewer';
    let stageFraction = 0;
    let lastAdvanceAt = now();
    let peakOutstanding = 0;
    /** §TILES-PROVIDER-READY (L-714) — when the PROVIDER most recently reported the current view
     *  loaded, or null while it does not. Drives the grace period in `tileStreamSettled`. */
    let tilesLoadedSince: number | null = null;
    /** §STALL-REPORT-NAMES-ITS-CAUSE (L-715) — how many frames the gate pumped, and what the
     *  counters last read, so a stall report can distinguish STUCK from STARVED. */
    let framesPumped = 0;
    /** The last tile snapshot seen, so the stall watchdog can tell SETTLED from STUCK. */
    let lastTileSnapshot: TileStreamSnapshot | null = null;
    /** §GATE-OBSERVED-TILES-LOADED — when the gate FIRST saw the provider report loaded, or null
     *  if it never has. This is the evidence field: "the tiles were loaded" and "the gate saw
     *  the tiles loaded" are different claims, and five rounds were spent proving the first while
     *  the second stayed unmeasured. A stall report with `everSawProviderLoaded=never` says the
     *  gate's window into the scene is broken; one with a timestamp says the chain after it is. */
    let firstProviderLoadedAt: number | null = null;
    /** When any field of the tile snapshot last CHANGED (identity of the gate's own observations). */
    let lastSnapshotChangeAt: number | null = null;
    /** §STALL-CLOCK-PAUSES-WHILE-HIDDEN — stall-clock time forgiven while the page was hidden. */
    let stallPausedHiddenMs = 0;
    let lastWatchdogTickAt = now();
    /** §FRAMES-REQUESTED-ARE-NOT-FRAMES-RENDERED (L-716) — frames the scene actually DREW, counted
     *  from `frameNumber` advances. `framesPumped` counts only what the gate ASKED FOR; under
     *  `requestRenderMode` Cesium may decline to draw (hidden/zero-sized canvas), and then every
     *  term freezes with no tile ever at fault. Undefined while the producer cannot report it. */
    let framesRendered: number | undefined;
    let lastFrameNumber: number | null = null;
    /** §READINESS-MUST-BE-SATISFIABLE (L-716) — the terms the gate concluded cannot ever go true. */
    let unsatisfiableTerms: readonly string[] = [];
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
        // §STARTUP-BUDGET — the terminal of the window, on EVERY exit (ready, cancelled, dismissed),
        // because a run that ended by the user giving up is a reading too, not a missing one.
        markStartupPhase(`activation:${target}:dismissed(${ready ? 'ready' : 'not-ready'})`);
        console.log(
            `[viewActivationLoading] §FEAT-VIEW-ACTIVATION-LOADING-OVERLAY ${target} — overlay ` +
            `dismissed (${reason}); navigation ${ready ? 'ENABLED — the view is ready' : 'restored'}.`,
        );
        resolveDone();
    };

    const failActivation = (message: string): void => {
        if (finished || failed) return;
        failed = true;
        // §STALL-REPORT-NAMES-ITS-CAUSE (L-715, ADR-0299 / §CONTEXT-DATA-HONESTY) — ⚠ A DIAGNOSTIC
        // THAT CANNOT TELL "STUCK" FROM "STARVED" IS WHY THIS TOOK FOUR ROUNDS. The old line said
        // only "no progress for 25000 ms", which is true of a frozen network, a stuck queue entry,
        // AND a scene nobody is rendering — three different bugs, one indistinguishable message. So
        // the report now states WHICH signal was waiting, its LAST OBSERVED VALUE, WHEN it last
        // changed, and whether we were driving the scene at all. A fifth occurrence must arrive
        // already carrying its own cause.
        const snap = lastTileSnapshot;
        const diag = [
            `stage="${stage}"`,
            `stageFraction=${stageFraction.toFixed(3)}`,
            `msSinceLastAdvance=${Math.round(now() - lastAdvanceAt)}`,
            `framesPumped=${framesPumped}`,
            `renderPumpWired=${typeof signals.requestRender === 'function'}`,
            // §GATE-OBSERVED-TILES-LOADED — did the GATE ever see the provider report loaded?
            // "The tiles loaded" (someone else's log) and "the gate observed the tiles loaded"
            // are different claims; only the second one this field measures can dismiss the overlay.
            `everSawProviderLoaded=${firstProviderLoadedAt === null ? 'never' : `${Math.round(now() - firstProviderLoadedAt)}ms-ago`}`,
            // §FRAMES-REQUESTED-ARE-NOT-FRAMES-RENDERED (L-716) — requested vs actually drawn.
            `framesRendered=${framesRendered ?? 'not-observable'}`,
            // §READINESS-TERMS-ARE-SEPARABLE (L-716) — NEVER report only the AND of the terms.
            `terms=[${(snap?.terms ?? []).map((t) =>
                `${t.name}{applicable=${t.applicable} value=${t.value} why="${t.why}"}`).join(' ') || 'none reported'}]`,
            `msSinceSnapshotChange=${lastSnapshotChangeAt === null ? 'n/a' : Math.round(now() - lastSnapshotChangeAt)}`,
            `stallPausedHiddenMs=${Math.round(stallPausedHiddenMs)}`,
            `pageHiddenNow=${(() => { try { return isPageHidden(); } catch { return false; } })()}`,
            snap
                ? `tiles{pending=${snap.pending} processing=${snap.processing} ` +
                  `tilesLoaded=${snap.tilesLoaded} providerLoaded=${snap.providerLoaded ?? 'n/a'} ` +
                  `peakOutstanding=${peakOutstanding}}`
                : 'tiles{no snapshot ever observed}',
        ].join(' ');
        console.error(
            `[viewActivationLoading] §FEAT-VIEW-ACTIVATION-LOADING-OVERLAY ${target} — readiness ` +
            `NEVER ARRIVED (no progress for ${stallMs} ms): ${message}
` +
            `  §STALL-REPORT-NAMES-ITS-CAUSE ${diag}
` +
            '  Read it as: outstanding>0 with framesPumped>0 means the tiles are genuinely not ' +
            'arriving (STUCK); outstanding>0 with renderPumpWired=false means nothing was driving ' +
            'the scene, so the tiles could not retire (STARVED — §TILES-NEED-A-FRAME, L-715); ' +
            'everSawProviderLoaded=never with tiles visibly rendered means the gate is not ' +
            'observing the scene it gates (report THAT, it is a different bug than slow tiles).',
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
        // §GATE-OBSERVED-TILES-LOADED — record when the gate's OWN observations change, so a
        // stall report can show whether its window into the scene was live or frozen.
        const prev = lastTileSnapshot;
        if (
            prev === null ||
            prev.pending !== snap.pending ||
            prev.processing !== snap.processing ||
            prev.tilesLoaded !== snap.tilesLoaded ||
            (prev.providerLoaded ?? null) !== (snap.providerLoaded ?? null) ||
            // §READINESS-TERMS-ARE-SEPARABLE (L-716) — a term flipping IS a change, even when the
            // aggregate does not move. Aggregating is what made this snapshot look frozen before.
            termsSignature(prev) !== termsSignature(snap)
        ) {
            lastSnapshotChangeAt = now();
        }
        // §FRAMES-REQUESTED-ARE-NOT-FRAMES-RENDERED (L-716) — count frames actually DRAWN.
        if (typeof snap.frameNumber === 'number') {
            if (lastFrameNumber === null) framesRendered = framesRendered ?? 0;
            else if (snap.frameNumber > lastFrameNumber) framesRendered = (framesRendered ?? 0) + 1;
            lastFrameNumber = snap.frameNumber;
        }
        lastTileSnapshot = snap;
        currentNote = tileStreamNote(snap, peakOutstanding);
        const f = tileStreamFraction(snap, peakOutstanding);
        if (f === null) session.setIndeterminate(currentNote);
        else if (stage === 'tiles') advance('tiles', f);
        // §TILES-SETTLED-IS-NOT-STALLED (L-713) — track how long Cesium's own `tilesLoaded` has
        // held, so a residual counter that never drains cannot veto a definitive completion.
        // See `tileStreamSettled` for why the flag is trusted only once it has HELD (L-259).
        // §TILES-PROVIDER-READY (L-714) — hold on the PROVIDER's verdict. Holding on `tilesLoaded`
        // made this dead code: that field is `pending===0 && processing===0 && …`, so it can never
        // be true while a counter is stuck, and the grace branch was unreachable.
        const providerSaysLoaded = snap.providerLoaded ?? snap.tilesLoaded;
        if (providerSaysLoaded && firstProviderLoadedAt === null) {
            firstProviderLoadedAt = now();
            // §GATE-OBSERVED-TILES-LOADED — the one-shot PROOF that the gate saw success with its
            // own eyes. Five rounds established that the tiles complete; none established that
            // THIS observer ever read them complete. If a future stall report arrives WITHOUT
            // this line preceding it, the gate's predicate/object is the defect, not the tiles.
            console.log(
                `[viewActivationLoading] §GATE-OBSERVED-TILES-LOADED ${target} — the readiness ` +
                `gate itself observed providerLoaded=true (pending=${snap.pending} ` +
                `processing=${snap.processing} tilesLoaded=${snap.tilesLoaded}); grace timer starts.`,
            );
        }
        if (!providerSaysLoaded) tilesLoadedSince = null;
        else if (tilesLoadedSince === null) tilesLoadedSince = now();
        const heldMs = tilesLoadedSince === null ? 0 : now() - tilesLoadedSince;
        // §READINESS-MUST-BE-SATISFIABLE (L-716) — the FOUR-WAY verdict. `tileStreamSettled` alone
        // could only say yes/no, so "finished", "stuck", "starved" and "can never be true" all
        // arrived here as the same `false` and left as the same 25 s timeout.
        const verdict = tileReadinessVerdict(snap, {
            msSinceSnapshotChange: lastSnapshotChangeAt === null ? 0 : now() - lastSnapshotChangeAt,
            framesPumped,
            framesRendered,
            providerLoadedForMs: heldMs,
        });
        if (verdict.kind === 'unsatisfiable' && unsatisfiableTerms.length === 0) {
            unsatisfiableTerms = verdict.terms;
            // ⚠ SAY IT OUT LOUD. The gate is releasing the tiles stage WITHOUT its terms going
            // true, because they cannot go true — every tile the scene asked for has arrived and
            // frames are being drawn. That is a defensible release, but only if it is DISCLOSED:
            // silently settling here would be indistinguishable from the success path, and the
            // next person would have no way to find this.
            console.warn(
                `[viewActivationLoading] §READINESS-MUST-BE-SATISFIABLE ${target} — releasing the ` +
                'tiles gate on an UNSATISFIABLE term. Nothing is outstanding (pending=' +
                `${snap.pending} processing=${snap.processing}) and the scene IS being drawn ` +
                `(framesRendered=${framesRendered ?? 'n/a'} of ${framesPumped} requested), yet ` +
                `these applicable terms are frozen false: ${verdict.terms.join('; ')}. A term that ` +
                'cannot become true does not make the gate patient — it makes the gate ' +
                'unsatisfiable, and an unsatisfiable gate can only ever time out. Releasing with ' +
                'disclosure instead of holding the user behind a spinner over completed work.',
            );
            // The user-visible note must not claim completeness we do not have (§CONTEXT-DATA-HONESTY).
            currentNote = 'map layer reported incomplete — opening anyway';
            session.setProgress(
                viewActivationProgress('tiles', 1).completed,
                VIEW_ACTIVATION_TOTAL,
                currentNote,
            );
        }
        return verdict.kind === 'settled' || verdict.kind === 'unsatisfiable';
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
            markStartupPhase(`activation:${target}:viewer-ready`); // §STARTUP-BUDGET
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
            markStartupPhase(`activation:${target}:tiles-done`); // §STARTUP-BUDGET

            // 3. CONTENT — the massing + real-model placement issued by the orchestrator.
            advance('content', 0);
            await waitForContentIssued();
            if (finished) return;
            await drainPlacements();
            if (finished) return;
            advance('content', 1);
            markStartupPhase(`activation:${target}:content-placed`); // §STARTUP-BUDGET

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
            markStartupPhase(`activation:${target}:ground-settled`); // §STARTUP-BUDGET
            finish('readiness chain complete', true);
        } catch (err) {
            if (finished) return;
            failActivation(`The 3D view failed to load: ${String((err as Error)?.message ?? err)}`);
        }
    })();

    // ── the STALL watchdog — never a fixed deadline, only a progress-freeze detector ──
    watchdog = setTimer(() => {
        if (finished || failed) return;
        // §STALL-CLOCK-PAUSES-WHILE-HIDDEN — a hidden tab suspends rAF, so Cesium's loop never
        // runs and NO tile work can retire: "no progress" there is the browser's throttling, not
        // a tile failure, and counting it toward the stall would fire an untrue "tiles stopped
        // arriving" report the moment the founder tabs back in. Forgive hidden time by sliding
        // `lastAdvanceAt` forward by exactly the interval that was hidden (never past `now`), and
        // NAME the forgiven total in the stall report. Sampling + pumping continue as normal —
        // only the failure clock pauses, so a genuine stall still fires once the page is visible
        // for a full `stallMs` with no progress.
        {
            const tick = now();
            const dt = Math.max(0, tick - lastWatchdogTickAt);
            lastWatchdogTickAt = tick;
            let hidden = false;
            try { hidden = isPageHidden(); } catch { /* treat as visible */ }
            if (hidden && dt > 0) {
                stallPausedHiddenMs += dt;
                lastAdvanceAt = Math.min(tick, lastAdvanceAt + dt);
            }
        }
        // §TILES-NEED-A-FRAME (L-715) — ⚠ PUMP BEFORE YOU SAMPLE. Under `requestRenderMode`
        // tile work is retired during a RENDER, so a gate that only reads counters is waiting on
        // progress it is itself preventing once the camera parks. Request the frame first, then
        // read what it produced.
        //
        // ⭐ §STARTUP-PUMP-EVERY-STAGE (founder 2026-09-06: "make the loading … MUCH QUICKER") —
        // THE PUMP USED TO LIVE INSIDE `if (onTileSample)`, i.e. IT ONLY RAN DURING THE TILES
        // STAGE. `onTileSample` is set by `waitForTiles()` and NULLED the instant that stage
        // settles, so for the whole of CONTENT (the massing + GLB placement landing) and ANCHOR
        // (the L-259 ground clamp) this gate asked the scene for exactly ZERO frames — while
        // still holding a full-screen overlay over it. That is the L-715 defect with a narrower
        // blast radius, and it was never named: under `requestRenderMode: true` a parked camera
        // renders only on demand, so a primitive that has downloaded still needs a frame to be
        // processed, and the two stages that wait on exactly that were the two we stopped
        // driving. The pump is a flag set on Cesium's EXISTING loop (`scene.requestRender()`) —
        // it schedules no `requestAnimationFrame` (P3 intact) and cannot draw more often than
        // the display refresh, so pumping in every stage costs a flag write and buys the frames
        // the later stages were starved of.
        try { signals.requestRender?.(); } catch { /* viewer gone */ }
        framesPumped++;
        // Poll the tile counters (see the requestRenderMode note in the header). Only the tiles
        // stage has a sampler registered; the pump above is unconditional.
        if (onTileSample) {
            try { onTileSample(signals.sampleTileLoadProgress()); } catch { /* poll unavailable */ }
        }
        if (finished || failed) return;
        // §TILES-SETTLED-IS-NOT-STALLED (L-713) — ⚠ NEVER call a SETTLED view stalled. During the
        // tiles stage the bar stops rising for two opposite reasons — streaming FINISHED, or
        // streaming STUCK — and `lastAdvanceAt` cannot tell them apart, because it only refreshes
        // on a strictly-increasing fraction. Cesium's own `tilesLoaded` flag is the discriminator,
        // and the founder's log is exactly this case: `tilesLoaded=true renderedTerrainTiles=7`
        // while this watchdog reported no progress and blamed the network.
        if (stage === 'tiles' && (lastTileSnapshot?.providerLoaded ?? lastTileSnapshot?.tilesLoaded) === true) return;
        if (isStalled(now(), lastAdvanceAt, stallMs)) {
            // §STALL-COPY-DOES-NOT-BLAME-THE-USER (ADR-0299 honest copy; same class as ADR-0292,
            // where a crash modal blamed the user's GPU driver for our own resource bug).
            //
            // ⚠ THE OLD COPY SAID "Check your connection", AND IT WAS MEASURABLY WRONG. The stall
            // this fires on was OUR OWN doing: `landuse` and `water` blew the 64-tile cap, fell
            // back to live Overpass through our SAME-ORIGIN `/api/overpass`, and those two requests
            // measured 47,266 ms and 6,894 ms / 17.38 MB against the very origin Cesium streams its
            // terrain from (`/api/context-tiles/terrain/…`). They saturated the browser's
            // per-origin connection pool, so the tile requests never started and the counters sat
            // flat until this watchdog tripped. The founder's connection was fine throughout — the
            // same session pulled thousands of footprints from R2 in milliseconds.
            //
            // Telling that user to check their connection sends them to debug a network that is
            // working, for a problem we caused. We do not know the cause at this point in the code,
            // so the honest copy states WHAT WE OBSERVED and offers the choice, and claims nothing
            // about why. (§CTX-ZOOM-FITS-EXTENT removed the mechanism above; this copy is what the
            // user should see if a stall ever happens again for some other reason.)
            //
            // §MESSAGE-MUST-MATCH-THE-EVIDENCE (L-716) — ⚠ "The map tiles stopped arriving" is a
            // CLAIM ABOUT THE TILES, and it has now been made to the founder six times over tiles
            // that had demonstrably arrived. It may only be said when the evidence supports it:
            // something was actually outstanding. When nothing is outstanding and the scene is not
            // being drawn, the true statement is about the DRAWING, not the tiles — and saying the
            // wrong one sends the user to debug their network for a problem in our render loop.
            const snapNow = lastTileSnapshot;
            const outstandingNow = snapNow
                ? Math.max(0, snapNow.pending) + Math.max(0, snapNow.processing)
                : 0;
            const notBeingDrawn = framesPumped > 0 && framesRendered === 0;
            failActivation(
                stage !== 'tiles'
                    ? `The 3D view stopped responding while ${viewActivationStageText(stage).toLowerCase()}`
                    : notBeingDrawn
                        ? 'The 3D view is not being drawn — the map data is not the problem. You can retry, or continue and use the view as it is.'
                        : outstandingNow > 0
                            ? 'The map tiles stopped arriving, so the 3D view may be incomplete. You can retry, or continue and let them finish loading in the background.'
                            : 'The 3D view did not finish opening, though the map data it asked for did arrive. You can retry, or continue and use the view as it is.',
            );
        }
    }, pumpMs);

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
