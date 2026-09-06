// §CREATE-SHOULD-TAKE-HIM-WHERE-THE-RESULT-LIVES (lane CREATE-HOUSE-IS-ATOMIC, L-13013 / L-13014)
//
// Founder: *"WHEN THE USER ASKS CREATE — AUTOMATICALLY SHOULD BRING THE USER TO THE PRYZM
// VIEWS"*, specified exactly in L-13014: *"at this stage we should go into AUTHOR MODE and the
// split view with 3D PRYZM ON THE LEFT and 2D PRYZM ON THE RIGHT."*
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// ⭐ THE TRIGGER IS `house.layout-executed`, NOT THE PIPELINE PROMISE — AND THAT IS THE WHOLE
//    CORRECTNESS ARGUMENT OF THIS FILE
// ══════════════════════════════════════════════════════════════════════════════════════════════
// `generateHouseFromBoundary` resolves `{ok:true}` on the MODAL path as soon as
// `HouseLayoutController.request` calls `modal.show(...)` — i.e. when the layout CHOOSER OPENS,
// before the user has picked anything and before one element exists. Navigating on that promise
// would yank the camera out from under the chooser the user is still reading.
//
// `HouseLayoutExecutor` emits `house.layout-executed` AFTER the build lands, and its own comment
// says it exists "for other observers (telemetry / GIS) that want to know a house landed". It had
// ZERO listeners. That is the honest seat for this, and it satisfies both prohibitions for free:
//   ⛔ it CANNOT fire on a FAILED run — a run that throws or refuses never reaches the emit;
//   ⛔ it CANNOT fire on "Keep this as a level envelope" — that is `spaceEnvelope.batch.create`,
//      a different verb entirely, which the founder explicitly wants to watch on the SITE views
//      (L-13007). Nothing here is wired to it.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// ⚠ THE SPEC'S LITERAL MECHANISM IS BLOCKED, AND THIS USES THE ONE THAT ISN'T
// ══════════════════════════════════════════════════════════════════════════════════════════════
// L-13014 reads the two `viewPanelOptions.ts` rows as "a preset, not new view types". Measured,
// the pane route cannot express it: `paneViewModel.ts` declares
// `'bim-3d': { paneHostable: false, unavailableReason: 'The PRYZM 3D renderer still owns the
// whole viewport (#container) and cannot be re-targeted into a pane yet — that is C59 Phase 3' }`,
// `PaneLayoutStore.availabilityRejection` refuses on `!paneHostable`, and no mounter is ever
// registered for its `webgpu-three` renderer kind. So a `SiteAuthoringPaneShell` preset of
// `{left:'bim-3d', right:'bim-plan-2d'}` would be REJECTED and the mount torn down.
//
// ⭐ But the geometry the founder asked for already exists by another route.
// `GISAreaLayout.applyBimDualPane` — reached through the declared global
// `window.pryzmShowSiteResultView('2D')` — is documented in its own header as *"LEFT = 3D
// viewport, RIGHT = 2D plan … the founder-specified 'LEFT 3D · RIGHT plan'"*, and
// `OnboardingStepController.generateAndFinish()` ALREADY calls exactly this after generating a
// house. So this is the PROVEN path for this exact situation, not a second implementation of it
// (§GREP-FOR-THE-EXISTING-SOLVER-FIRST).
//
// ⛔ NO NEW LAYOUT ENGINE, NO SECOND PANE MODEL. This module decides WHEN, and delegates WHAT to
// the two seams that already own it.

import { trace } from '@opentelemetry/api';
import type { PryzmRuntime } from '@pryzm/runtime-composer';

const _tracer = trace.getTracer('pryzm.house.landInBimAfterCreateHouse');

/** The event `HouseLayoutExecutor` emits once a house has actually landed. */
export const HOUSE_BUILT_EVENT = 'house.layout-executed';

/**
 * How long an arm stays live, ms. The user may sit in the layout chooser for a while, so this is
 * generous — but it is BOUNDED on purpose: if they cancel the chooser, an arm left open forever
 * would navigate on some unrelated later build. 10 minutes.
 */
export const ARM_TIMEOUT_MS = 10 * 60 * 1000;

/** The three effects this module drives, injected so the decision is testable without a browser. */
export interface LandInBimDeps {
    /**
     * Subscribe to the house-built event. Returns an unsubscribe function.
     * Production: `runtime.events.on('house.layout-executed', cb)`.
     */
    readonly onHouseBuilt: (handler: () => void) => (() => void) | undefined;
    /** Production: `workspaceController.setMode('author')`. */
    readonly setAuthorMode: () => void;
    /** Production: `window.pryzmShowSiteResultView('2D')` → LEFT 3D PRYZM · RIGHT 2D plan. */
    readonly showBimDualPane: () => void;
    /** Injected so a spec can drive the timeout without waiting ten minutes. */
    readonly setTimer?: (fn: () => void, ms: number) => unknown;
    readonly clearTimer?: (handle: unknown) => void;
}

/**
 * Arm the landing layout for the NEXT house that finishes building. Returns a disposer that
 * disarms it. Never throws — a navigation helper must not be able to break the build it follows.
 *
 * ⭐ ONE-SHOT. It fires once and disarms, so a second Create-house needs a second arm. That is
 * deliberate: a standing listener would navigate on a house built from the chat, the console
 * trigger or onboarding, and L-13013 scopes this to the explicit CREATE HOUSE step.
 */
export function armLandInBimOnNextHouse(deps: LandInBimDeps): () => void {
    const span = _tracer.startSpan('pryzm.house.armLandInBimOnNextHouse');
    let disposed = false;
    let unsub: (() => void) | undefined;
    let timer: unknown;
    const setTimer = deps.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
    const clearTimer = deps.clearTimer ?? ((h) => clearTimeout(h as ReturnType<typeof setTimeout>));

    const disarm = (): void => {
        if (disposed) return;
        disposed = true;
        try { unsub?.(); } catch { /* teardown is best-effort */ }
        unsub = undefined;
        try { if (timer !== undefined) clearTimer(timer); } catch { /* ditto */ }
        timer = undefined;
    };

    try {
        unsub = deps.onHouseBuilt(() => {
            if (disposed) return;
            // Disarm FIRST: if either effect throws, the arm is still spent rather than
            // re-firing on the next build.
            disarm();
            // ⛔ MODE BEFORE LAYOUT. `WorkspaceController.setMode` runs its own `_applyLayout()`,
            // which reconciles the split pane against the new mode's canvas width. Opening the
            // dual pane first and then changing mode would let that reconciliation close the pane
            // this function exists to open.
            try {
                deps.setAuthorMode();
            } catch (e) {
                console.warn('[land-in-bim] setMode(author) failed (non-fatal):', e);
            }
            try {
                deps.showBimDualPane();
                console.log('[land-in-bim] §CREATE-SHOULD-TAKE-HIM-WHERE-THE-RESULT-LIVES — '
                    + 'house built: Author mode + LEFT 3D PRYZM · RIGHT 2D PRYZM.');
            } catch (e) {
                console.warn('[land-in-bim] showBimDualPane failed (non-fatal):', e);
            }
        });
        if (typeof unsub !== 'function') {
            // The runtime had no event channel. Say so; do NOT pretend the arm is live.
            console.warn('[land-in-bim] runtime has no event channel — the landing layout is NOT armed.');
            span.setAttribute('pryzm.landInBim.armed', false);
            disposed = true;
            return () => { /* nothing to disarm */ };
        }
        timer = setTimer(() => {
            if (disposed) return;
            console.log('[land-in-bim] arm expired without a house being built — disarmed.');
            disarm();
        }, ARM_TIMEOUT_MS);
        span.setAttribute('pryzm.landInBim.armed', true);
    } catch (e) {
        console.warn('[land-in-bim] arming failed (non-fatal):', e);
        span.setAttribute('pryzm.landInBim.armed', false);
        disposed = true;
    } finally {
        span.end();
    }
    return disarm;
}

/**
 * Production wiring. Resolves every global WHEN CALLED (§L-545), so a late boot is still seen.
 *
 * ⛔ P4 — no `(window as any)`. Both globals are reached through a narrow declared shape.
 */
export function defaultLandInBimDeps(runtime: PryzmRuntime | null | undefined): LandInBimDeps {
    return {
        onHouseBuilt: (handler) => {
            // `house.layout-executed` is house-specific and not in the typed `RuntimeEvents`
            // union — subscribed through a loose view, the SAME idiom the executor uses to emit
            // it (`HouseLayoutExecutor.ts:1861`).
            const events = runtime?.events as unknown as {
                on?(k: string, h: () => void): (() => void) | undefined;
            } | undefined;
            if (typeof events?.on !== 'function') return undefined;
            return events.on(HOUSE_BUILT_EVENT, handler);
        },
        setAuthorMode: () => {
            const w = window as unknown as {
                workspaceController?: { setMode?(mode: string): void };
            };
            w.workspaceController?.setMode?.('author');
        },
        showBimDualPane: () => {
            const w = window as unknown as {
                pryzmShowSiteResultView?: (initial?: '2D' | '3D') => void;
            };
            if (typeof w.pryzmShowSiteResultView !== 'function') {
                // ⛔ HONEST FAILURE. The host that owns the dual pane is not mounted, so the user
                // stays where they are — which is the correct fallback, and it is SAID rather
                // than silently skipped.
                console.warn('[land-in-bim] pryzmShowSiteResultView is not available — the house '
                    + 'was built but PRYZM cannot switch you into the BIM views from here.');
                return;
            }
            w.pryzmShowSiteResultView('2D');
        },
    };
}
