// globeSurfaceGate.ts — §STARTUP-MOVE-THE-GATE (lane PERF-OPEN, L-13277)
//
// ⭐ FOUNDER'S ACCEPTANCE CRITERION, unchanged: *"rendering the Cesium globe for the user to
// select the location / cadastro number should take LESS THAN A SECOND."*
//
// WHAT WAS WRONG
// --------------
// The onboarding location step — a card with a text box, over a globe — could not open until
// `briefBootstrap`'s one-shot `pryzm-project-loaded` handler fired, and that handler cannot fire
// until the FULL engine bootstrap plus the project hydrate have finished: `initScene` →
// `initBuilders` → `initTools` → `initBusHandlers` → `registerAllStores` → `initDataPlatform` →
// `initUI`, then `openProject` steps 2 and 4. The location step needs NONE of it. It needs a
// globe it can click and a place to type a cadastral reference; it does not need wall builders,
// slab stores, a WorkspaceController or a hydrated snapshot.
//
// `eagerGlobeStart.ts` already moved the globe's CONSTRUCTION off the critical path
// (§STARTUP-GLOBE-PREWARM, L-10560) — the viewport is built and mounted warm-hidden BEFORE the
// boot starts. Nobody moved the GATE. So the globe sat ready behind a door held shut by a
// subsystem it does not use.
//
// MEASURED (median of 5 warm runs, local production build, gesture = "+ New Project",
// END = `globe:camera-host-ready`; harness `tools/perf/measure-project-open.mjs`):
//
//     globe:eager-init-start   t+3338 ms   ← the globe surface goes live here
//     boot:ui-done             t+3476 ms
//     open:project-loaded      t+3790 ms   ← the OLD gate opened here
//     location-step:open       t+3791 ms
//     globe:camera-host-ready  t+3825 ms
//
// i.e. ~480 ms in which the globe was clickable and the product refused to show it.
//
// ⛔ TWO QUESTIONS, NOT TWO GATES. This module deliberately answers two DIFFERENT questions,
// each with exactly one authority — which is the opposite of the `same-rule-two-implementations`
// defect (two mechanisms answering the SAME question and disagreeing):
//
//     whenGlobeSurfaceLive()     "can the user click the globe?"      → the LOCATION STEP waits
//     whenEngineReadyForSite()   "can we author a site yet?"          → the COMMIT waits
//
// Splitting them is the whole point: the first is what the founder is timing, the second is what
// correctness actually requires, and conflating them is what made the open 3.8 s.
//
// ⚠ THE RE-CONVERGENCE IS THE LOAD-BEARING HALF, NOT THE DECOUPLING. Opening the location step
// early is only safe because the path that NEEDS the engine now awaits it explicitly:
// `OnboardingStepController.callCreateSiteFromRect()` awaits `whenEngineReadyForSite()` before
// `createSiteFromRect(...)` dispatches its first bus command. A user who picks a parcel 400 ms
// after the globe appears therefore WAITS at the commit — where waiting is correct and
// invisible — instead of reaching a half-booted editor. ⛔ If you add a second consumer of the
// engine on the onboarding path, it awaits here too. That is the contract.
//
// ⛔ NO POLLING, NO TIMEOUT, NO RACING LISTENER. Both signals are one-shot latches fed by facts
// the boot already emits. A latch that is already set resolves synchronously-ish (a settled
// promise), so a late caller is never stranded and an early caller is never dropped.
//
// P8: every exported function carries an OTel span.

import { trace } from '@opentelemetry/api';

const _tracer = trace.getTracer('pryzm.startup.globe-surface-gate');

/** A one-shot latch: `promise` settles the first time `resolve()` is called; later calls no-op. */
interface Latch {
    readonly promise: Promise<void>;
    resolve(): void;
    isSet(): boolean;
}

function makeLatch(): Latch {
    let set = false;
    let fire: () => void = () => { /* replaced synchronously below */ };
    const promise = new Promise<void>((res) => { fire = res; });
    return {
        promise,
        resolve(): void {
            if (set) return;
            set = true;
            fire();
        },
        isSet(): boolean { return set; },
    };
}

let _globeSurface = makeLatch();
let _engineReady = makeLatch();

/**
 * §STARTUP-MOVE-THE-GATE — called by `mountGISArea` the instant the globe's public surface is
 * installed: `window.pryzmToggleGIS`, `window.pryzmGetSiteEntryCameraHost` and
 * `window.pryzmGetSiteEntryCameraHostReady`.
 *
 * ⚠ It must be called AFTER all three, and it is the ONLY caller. Those three globals are
 * exactly what `renderLocationStep()`'s `GlobeHeroSearch` reaches for; a latch set before any of
 * them exists would hand the user a card whose search box silently does nothing — the
 * `§CONTEXT-DATA-HONESTY` failure of a control that looks live and is not.
 */
export function markGlobeSurfaceLive(): void {
    const span = _tracer.startSpan('pryzm.startup.globeSurfaceGate.markGlobeSurfaceLive');
    try {
        if (_globeSurface.isSet()) return;
        _globeSurface.resolve();
        console.log(
            '[globeSurfaceGate] §STARTUP-MOVE-THE-GATE — globe surface LIVE (pryzmToggleGIS + ' +
            'camera host + readiness installed). The location step may open now; it no longer ' +
            'waits for the engine boot or the project hydrate.',
        );
    } finally {
        span.end();
    }
}

/**
 * §STARTUP-MOVE-THE-GATE — called when `pryzm-project-loaded` fires, i.e. the engine boot AND
 * the project hydrate are complete and the command bus can author a site.
 *
 * This is the fact the OLD gate used for everything. It is still required — just by a much
 * smaller set of callers, and later.
 */
export function markEngineReadyForSite(): void {
    const span = _tracer.startSpan('pryzm.startup.globeSurfaceGate.markEngineReadyForSite');
    try {
        if (_engineReady.isSet()) return;
        _engineReady.resolve();
    } finally {
        span.end();
    }
}

/**
 * Resolves once the user can actually click the globe. THE LOCATION STEP'S GATE.
 *
 * ⚠ On a path where the globe surface never comes up (an engine boot that fails before
 * `mountGISArea`), this never resolves — deliberately. The alternative, a timeout that opens the
 * card anyway, would show a location step over no globe, which is the dishonest-state failure
 * this file exists to avoid. `briefBootstrap`'s existing 30 s net still surfaces a retriable
 * toast in that case, so the user is told rather than left waiting.
 */
export function whenGlobeSurfaceLive(): Promise<void> {
    const span = _tracer.startSpan('pryzm.startup.globeSurfaceGate.whenGlobeSurfaceLive');
    try {
        return _globeSurface.promise;
    } finally {
        span.end();
    }
}

/**
 * Resolves once a site may be authored. THE COMMIT'S GATE — the re-convergence point.
 *
 * ⭐ This is what makes the decoupling safe rather than a race. Awaiting it costs NOTHING on a
 * normal run (by the time a human has typed an address, chosen a parcel and pressed use, the
 * boot finished seconds ago and this is an already-settled promise); it costs exactly the right
 * amount on a fast one.
 */
export function whenEngineReadyForSite(): Promise<void> {
    const span = _tracer.startSpan('pryzm.startup.globeSurfaceGate.whenEngineReadyForSite');
    try {
        return _engineReady.promise;
    } finally {
        span.end();
    }
}

/** TRUE once the globe surface is live — for logs and tests only, never to branch a gate on. */
export function isGlobeSurfaceLive(): boolean {
    return _globeSurface.isSet();
}

/** TRUE once the engine can author a site — for logs and tests only. */
export function isEngineReadyForSite(): boolean {
    return _engineReady.isSet();
}

/**
 * ⛔ Tests only — re-arm both latches.
 *
 * ⚠ NOT called on project switch, on purpose. Both facts are TAB-scoped, not project-scoped:
 * `mountGISArea` runs once per tab and the engine boots once per tab, so re-arming on a switch
 * would strand the second project's location step on a latch nothing will ever set again.
 */
export function __resetGlobeSurfaceGate(): void {
    _globeSurface = makeLatch();
    _engineReady = makeLatch();
}
