// eagerGlobeStart.ts — §STARTUP-EAGER-GLOBE (founder 2026-08-10: "project-launch globe ~3×
// quicker + complete first paint") + §STARTUP-GLOBE-PREWARM (founder 2026-08-24: "PRYZM Earth
// should come INSTANTLY — now I need to wait a few seconds — it should just pop up instantly",
// L-10560).
//
// ── ROUND 1 (§STARTUP-EAGER-GLOBE, 2026-08-10) ──────────────────────────────────────────────
// THE MEASURED DEFECT: `location-step:open +2483ms` and `globe:camera-host-ready +2053ms` after
// that (t+4537ms; worse run t+9339ms). The FULL engine boot (builders, ~80 bus bridges, 37
// stores, tools, UI) ran to completion BEFORE the onboarding location step mounted the Cesium
// globe, and only then did `toggleGIS(true)` start the viewer construction + tile streaming — on
// a container that was 0×0 (display:none) at viewer creation, so even the first tile request
// waited for visibility. Two seconds of engine boot and two seconds of globe mount, in SERIES.
//
// THE FIX: run them in PARALLEL. `PlatformRouter.showOnboarding` (the earliest moment we KNOW a
// globe-first onboarding is coming) sets a one-shot flag; `mountGISArea` (wired during the
// engine boot the flag predates) consumes it and kicks the SAME first-activation Cesium init it
// would later run for `toggleGIS(true)`.
//
// ── ROUND 2 (§STARTUP-GLOBE-PREWARM, 2026-08-24, L-10560) — THE FLAG WAS RIGHT, ITS CONSUMER
//    WAS AT THE END OF THE BOOT ────────────────────────────────────────────────────────────────
// ⭐ MEASURED, from the founder's own §STARTUP-BUDGET run:
//
//     [§STARTUP-BUDGET] onboarding:shown        +0ms  (t+0ms)
//     [§STARTUP-BUDGET] cesium:warm-start       +0ms  (t+0ms)
//     [cesiumWarmup]    Cesium chunk pre-warmed in 122 ms
//     …the ENTIRE BIM engine boots here…
//     [§STARTUP-BUDGET] globe:eager-init-start  +2633ms (t+2634ms)
//
// The Cesium CHUNK is warm at ~122 ms and the globe does not begin CONSTRUCTING until 2,633 ms.
// The 2.5-second gap is the engine boot, and the onboarding globe uses none of it. The reason is
// structural, not a tuning miss: the flag's ONLY consumer is `mountGISArea`, `mountGISArea` is
// called from `Layout.ts`, `Layout.ts` is called from `initUI`, and `initUI` is the LAST stage of
// `engineLauncher.bootstrap()` — after `initScene` → `initBuilders` → `initTools` →
// `initBusHandlers` → `registerAllStores` → `initDataPlatform`. So "eager" was eager relative to
// `toggleGIS(true)` and still strictly SERIAL after the whole engine.
//
// THE ROUND-2 FIX: this module now OWNS the construct+mount, so it can run from the onboarding
// seam itself — before `initScene`, in genuine parallel with the boot — and `mountGISArea`
// ADOPTS the already-mounted viewport instead of constructing one.
//
// ⭐ THE SHAPE IS NOT NEW. It is exactly `src/rendering/rendererPrewarm.ts`, which already solved
// the identical problem for the WebGPU renderer (`prewarmRenderer()` off the critical path →
// `consumePrewarmedRenderer()` in `initScene` Phase 5 → "2,401 ms LONGTASK skipped"). Same two
// verbs, same fallback doctrine, same singleton-consume rule. Nothing rival was minted:
// `requestEagerGlobeStart` / `consumeEagerGlobeStart` are UNCHANGED and still carry the flag.
//
// ── WHAT IS AND IS NOT GUARANTEED ────────────────────────────────────────────────────────────
// ⛔ DEFERRED ≠ OPTIONAL, and the inverse — PREWARMED ≠ REQUIRED. `consumePrewarmedGlobe()`
// returning `null` is a FIRST-CLASS outcome, not an error path: the prewarm may never have been
// requested (a hub open of an existing project never calls `showOnboarding`), may still be in
// flight (awaited, so the caller still banks whatever has completed), or may have failed. In
// every one of those cases `ensureGisInitialized` constructs the viewer cold, EXACTLY as it did
// before this module existed. There is therefore no path on which a globe fails to appear
// because the prewarm did not fire — which is the "built but unreachable" shape this repo has
// paid for repeatedly (C82 §5.4).
//
// ⛔ AT MOST ONE VIEWPORT, EVER. `_prewarm` is a single promise and `_consumed` latches, so a
// prewarm in flight when `ensureGisInitialized` runs is AWAITED, never raced with a second
// construction. `mountGISArea` additionally guards on `if (!cesiumViewport)`.
//
// ⛔ PROJECT ISOLATION (C13) IS UNCHANGED. The prewarmed viewport is handed INTO `mountGISArea`'s
// closure and becomes the same `cesiumViewport` binding every existing teardown, project-scope
// probe and §L-676 `forgetProject()` call already targets. This module holds no project state and
// registers no scope: it is a constructor that ran early, not a new owner.
//
// WHY A MODULE SEAM, NOT A WINDOW GLOBAL: P4 forbids `(window as any)`, and the parties are all
// editor modules — a typed module seam is the honest mechanism.
//
// P8: every exported function carries an OTel span.

import { trace } from '@opentelemetry/api';
import { warmCesiumModule } from './cesiumWarmup';
import { markStartupPhase } from './startupBudget';
import type { PryzmRuntime } from '@pryzm/runtime-composer/types';

const _tracer = trace.getTracer('pryzm.startup.eager-globe');

// ─────────────────────────────────────────────────────────────────────────────
// Round 1 — the one-shot flag (UNCHANGED)
// ─────────────────────────────────────────────────────────────────────────────

let _requested = false;

/** Called by `PlatformRouter.showOnboarding` — a globe-first onboarding flow is starting; the
 *  next `mountGISArea` wiring should start the Cesium init eagerly, in parallel with the rest
 *  of the engine boot. Idempotent. */
export function requestEagerGlobeStart(): void {
    const span = _tracer.startSpan('pryzm.startup.eager-globe.request');
    try {
        _requested = true;
    } finally {
        span.end();
    }
}

/** Called by `mountGISArea` at wiring time. Returns true AT MOST ONCE per request, so a second
 *  mount (another project open in the same session) stays lazy unless onboarding re-requests. */
export function consumeEagerGlobeStart(): boolean {
    const span = _tracer.startSpan('pryzm.startup.eager-globe.consume');
    try {
        const was = _requested;
        _requested = false;
        return was;
    } finally {
        span.end();
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Round 2 — §STARTUP-GLOBE-PREWARM: construct + mount BEFORE the engine boot
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The NARROW surface of `CesiumViewport` the startup path uses. Deliberately four methods, not
 * the whole class: this is the contract between the prewarmer and its adopter, and a wide type
 * here would make the seam un-testable without a full Cesium/WebGL host.
 *
 * ⚠ It is NOT a hand-written approximation. `REAL_GLOBE_SATISFIES_THE_SEAM` below is a
 * compile-time proof that the real class is assignable to it, so a test double can never be
 * MORE capable than the subject (the failure shape recorded in `fake-more-capable-than-real`).
 */
export interface PrewarmedGlobe {
    /** Lay the container out at real dimensions but invisible + inert, so tiles stream while the
     *  boot runs and nothing paints over the loading surface. */
    enterWarmHiddenState(): void;
    /** Construct the Cesium `Viewer` and await its readiness. */
    mount(): Promise<void>;
    /** §L-446 — idempotent post-construction runtime injection; never downgrades to null. */
    setRuntime(runtime: PryzmRuntime | null): void;
    /** Null until `mount()` has produced a live viewer. */
    getViewer(): unknown;
    /** Tab-teardown disposal; used here only to clean up a FAILED prewarm. */
    dispose(): void;
}

type CesiumViewportCtor = (typeof import('../ui/geospatial/CesiumViewport'))['CesiumViewport'];

/**
 * Compile-time proof that the REAL `CesiumViewport` satisfies {@link PrewarmedGlobe}. If the
 * class's shape drifts, `tsc` fails HERE rather than the seam silently describing a viewport
 * that no longer exists. Exported so it is a real program value, not dead code a linter strips.
 */
export const REAL_GLOBE_SATISFIES_THE_SEAM: InstanceType<CesiumViewportCtor> extends PrewarmedGlobe
    ? true
    : never = true;

/** What {@link prewarmGlobe} needs. `loadViewportClass` is a TEST SEAM ONLY — production passes
 *  nothing and gets the same dynamic import (⇒ same Vite chunk) `cesiumWarmup` already warmed. */
export interface GlobePrewarmOptions {
    /** The `#container` element the BIM viewport also lives in. */
    readonly parent: HTMLElement | null;
    /** The composed runtime, if the caller has one. `null` is safe — `mountGISArea`'s adoption
     *  re-injects via `setRuntime`, which never downgrades a live runtime. */
    readonly runtime: PryzmRuntime | null;
    /** ⛔ Tests only. */
    readonly loadViewportClass?: () => Promise<new (
        parent: HTMLElement,
        runtime: PryzmRuntime | null,
    ) => PrewarmedGlobe>;
}

let _prewarm: Promise<PrewarmedGlobe | null> | null = null;
let _consumed = false;

/**
 * §STARTUP-GLOBE-PREWARM — start CONSTRUCTING and MOUNTING the one Cesium viewport NOW, in
 * parallel with the engine boot that has not started yet.
 *
 * Fire-and-forget, idempotent (a second call while one is in flight is a no-op), and
 * best-effort: it never throws into the caller and a failure leaves the cold path intact —
 * the same doctrine `cesiumWarmup.ts` and `rendererPrewarm.ts` state.
 *
 * ⚠ The viewer is mounted WARM-HIDDEN (`display:block; visibility:hidden; pointer-events:none`),
 * never visible. Revealing it stays where it always was: the location step's
 * `pryzmToggleGIS(true)` → `finishFirstGisActivation()`. This changes WHEN the globe is built,
 * never WHO decides it is shown.
 */
export function prewarmGlobe(opts: GlobePrewarmOptions): void {
    const span = _tracer.startSpan('pryzm.startup.eager-globe.prewarm');
    try {
        if (_prewarm !== null) return;
        const parent = opts.parent;
        if (!parent) {
            console.warn(
                '[eagerGlobeStart] §STARTUP-GLOBE-PREWARM — no #container element yet; the globe ' +
                'will be constructed on the classic path (mountGISArea). Nothing is lost, only ' +
                'the parallelism.',
            );
            return;
        }

        markStartupPhase('globe:prewarm-start'); // §STARTUP-BUDGET
        const t0 = typeof performance !== 'undefined' ? performance.now() : Date.now();

        const load =
            opts.loadViewportClass ??
            (() => warmCesiumModule().then((m) => m.CesiumViewport as unknown as new (
                parent: HTMLElement,
                runtime: PryzmRuntime | null,
            ) => PrewarmedGlobe));

        _prewarm = load()
            .then(async (Ctor): Promise<PrewarmedGlobe> => {
                const globe = new Ctor(parent, opts.runtime);
                // Laid out at real dimensions so the viewer is created at a real size and base
                // imagery streams DURING the boot — the whole point of moving this earlier.
                globe.enterWarmHiddenState();
                await globe.mount();
                markStartupPhase('globe:prewarm-done'); // §STARTUP-BUDGET
                const dt = (typeof performance !== 'undefined' ? performance.now() : Date.now()) - t0;
                console.log(
                    `[eagerGlobeStart] §STARTUP-GLOBE-PREWARM — Cesium viewport constructed + ` +
                    `mounted WARM-HIDDEN in ${dt.toFixed(0)} ms, in parallel with the engine boot. ` +
                    'The location step\'s toggleGIS(true) is now a visibility flip.',
                );
                return globe;
            })
            .catch((err): null => {
                console.warn(
                    '[eagerGlobeStart] §STARTUP-GLOBE-PREWARM — prewarm failed; the globe will be ' +
                    'constructed cold by mountGISArea exactly as before (non-fatal):',
                    err instanceof Error ? err.message : err,
                );
                _prewarm = null; // the cold path is the fallback, and it is untouched
                return null;
            });
    } finally {
        span.end();
    }
}

/**
 * §STARTUP-GLOBE-PREWARM — hand the prewarmed viewport to `mountGISArea`, or `null`.
 *
 * `null` is a FIRST-CLASS answer meaning "construct it cold, as before":
 *   · `prewarmGlobe()` was never called (a hub open — no onboarding, no prewarm), or
 *   · it failed, or
 *   · it was already consumed (a second `mountGISArea` in the same tab).
 *
 * If the prewarm is still IN FLIGHT this awaits it rather than starting a rival construction —
 * so the caller banks however much of the mount has already happened, and there can never be
 * two `CesiumViewport`s in one `#container`.
 */
export async function consumePrewarmedGlobe(): Promise<PrewarmedGlobe | null> {
    const span = _tracer.startSpan('pryzm.startup.eager-globe.consumePrewarmed');
    try {
        if (_consumed) return null;
        if (_prewarm === null) return null;
        const globe = await _prewarm;
        if (globe === null) return null;
        _consumed = true;
        return globe;
    } finally {
        span.end();
    }
}

/** TRUE while a prewarm has been started and not yet consumed — for logs and tests only. */
export function isGlobePrewarmPending(): boolean {
    const span = _tracer.startSpan('pryzm.startup.eager-globe.isPending');
    try {
        return _prewarm !== null && !_consumed;
    } finally {
        span.end();
    }
}

/** Test seam — reset without consuming semantics. */
export function __resetEagerGlobeStart(): void {
    _requested = false;
    _prewarm = null;
    _consumed = false;
}
