// §FIX-DRAW-WATCHDOG-MUST-NOT-AUTHOR (ADR-0299 §Decision 1 + 4) — the draw-step idle decision.
//
// WHAT THIS REPLACES
// ------------------
// `OnboardingStepController.armBoundaryCommitWait()` ran a 60 s idle timer that, on expiry,
// called `fallbackDefaultRectToConfirm('watchdog')`: it AUTHORED a 10 × 8 m rectangle at the
// geocode centre as the user's parcel, labelled it `source="default-plot"`, and advanced the
// flow to "Generate your apartment with AI?". The founder's log names it exactly:
//
//   [onboarding-step] draw watchdog fired (idle 60s, no interaction) — falling back to a
//       default plot, then asking before generate.
//   [site] createSiteFromRect invoked … rect=10×8m lat=41.3825802 lon=2.177073
//   [onboarding-step] confirm step (source="default-plot", typology="apartment")
//
// WHY THAT IS A DEFECT, NOT A SAFETY NET
// --------------------------------------
// 1. It INVENTS DOMAIN DATA. A parcel boundary is the user's own datum — the single input the
//    whole feasibility chain (C19 parcel → C58 envelope → generators) is derived from. A timer
//    has no evidence about where the user's land is. ADR-0299 §4: where a recovery does proceed,
//    its output MUST be marked degraded, not returned as though it were authored data. `source=
//    "default-plot"` is a breadcrumb label, not a degradation marker: everything downstream
//    consumes that boundary as a real, user-authored parcel.
// 2. It could not observe INTENT, only IDLENESS. Sixty seconds of "no interaction" is what a
//    user reading a Catastro record in another window looks like, what a user thinking looks
//    like, and what a BACKGROUNDED TAB looks like. In a hidden tab the idle signal carries no
//    information about the user at all — timers keep counting, the user is simply elsewhere.
// 3. It PUNISHED THE USER FOR OUR OWN SLOWNESS. The clock started when the draw step rendered,
//    not when the map became drawable. With the observed tiles stall
//    (`readiness NEVER ARRIVED at stage "tiles" … no progress for 25000 ms`) most of the idle
//    window could elapse before there was a usable surface to draw on.
// 4. The action was IRREVERSIBLE IN PLACE. The committed boundary is a C19 §1.4 one-shot, so
//    the invented plot LOCKED the site: the user's real parcel then hit `parcel-already-set`
//    (the wedge — see §FIX-BOUNDARY-COMMIT-REFUSE).
// 5. Its own log message admits it: "falling back to a default plot, THEN ASKING before
//    generate". Asking after acting is not asking.
//
// THE RULE THIS ENCODES
// ---------------------
// **A watchdog may OFFER; it may never AUTHOR.** The return type here makes the old behaviour
// unrepresentable — there is no `'commit'` action. The only thing an expired idle window can
// produce is `'offer'`, which the controller renders as a non-blocking hint pointing at the
// "Skip drawing — use a default plot" button the user already has. The user's click is what
// authors a plot, as it always should have been.
//
// ADR-0299's test — *"if the thing I am repairing were impossible by construction, would I
// notice?"* — is why this is a pure decision function with no side effects and no store access:
// it CANNOT author, so the failure mode cannot recur here.

import { trace } from '@opentelemetry/api';

const _tracer = trace.getTracer('pryzm.onboarding.draw-idle-watchdog');

/** How long the draw surface must sit genuinely idle — visible, ready, untouched — before the
 *  flow offers the default-plot escape hatch. Unchanged from the old timer: lengthening it was
 *  never the fix, since the defect was WHAT it did, not WHEN. */
export const DRAW_IDLE_OFFER_MS = 60_000;

/** Everything the decision needs. All times are `Date.now()`-style epoch milliseconds. */
export interface DrawIdleInput {
    readonly nowMs: number;
    /** Last pointer/key activity anywhere on the page. */
    readonly lastActivityAtMs: number;
    /**
     * When the draw surface became genuinely usable (the 2D map finished loading), or `null`
     * if it has not. The idle clock starts from THIS, never from when the step rendered — a
     * user cannot be idle on a surface that does not exist yet.
     */
    readonly drawSurfaceReadyAtMs: number | null;
    /** `document.visibilityState === 'hidden'`. A hidden tab's idleness means nothing. */
    readonly documentHidden: boolean;
    /** True once the offer has been shown. The flow offers ONCE; it never nags. */
    readonly alreadyOffered: boolean;
    /** Overridable for tests. */
    readonly idleWindowMs?: number;
}

/**
 * The verdict. Note what is ABSENT: there is no action that authors a parcel. The old
 * watchdog's behaviour is not expressible through this type.
 */
export type DrawIdleDecision =
    | { readonly action: 'wait'; readonly because: 'tab-hidden' | 'surface-not-ready' | 'recent-activity' | 'already-offered' }
    | { readonly action: 'offer'; readonly because: 'idle-on-a-ready-visible-surface' };

/**
 * Decide what an expired draw-idle tick may do. Pure — no DOM, no store, no timers, no I/O.
 *
 * The four `wait` reasons are each a case the old timer got wrong:
 *  - `tab-hidden`        — the user is in another window; idleness is not evidence about them.
 *  - `surface-not-ready` — the map is not drawable yet; the delay is ours, not theirs.
 *  - `recent-activity`   — the user is engaged (this one the old timer did handle, §L-420).
 *  - `already-offered`   — the hint is up; repeating it is nagging, not helping.
 */
export function decideDrawIdleAction(input: DrawIdleInput): DrawIdleDecision {
    const span = _tracer.startSpan('pryzm.onboarding.decideDrawIdleAction');
    try {
        const idleWindowMs = input.idleWindowMs ?? DRAW_IDLE_OFFER_MS;
        span.setAttribute('pryzm.onboarding.idle_window_ms', idleWindowMs);
        span.setAttribute('pryzm.onboarding.document_hidden', input.documentHidden);

        const decide = (d: DrawIdleDecision): DrawIdleDecision => {
            span.setAttribute('pryzm.onboarding.idle_action', d.action);
            span.setAttribute('pryzm.onboarding.idle_because', d.because);
            return d;
        };

        if (input.documentHidden) return decide({ action: 'wait', because: 'tab-hidden' });
        if (input.drawSurfaceReadyAtMs === null) return decide({ action: 'wait', because: 'surface-not-ready' });
        if (input.alreadyOffered) return decide({ action: 'wait', because: 'already-offered' });

        // The clock runs from the LATER of "the user last did something" and "the surface became
        // drawable" — so our own load time can never be counted against the user.
        const idleSince = Math.max(input.lastActivityAtMs, input.drawSurfaceReadyAtMs);
        span.setAttribute('pryzm.onboarding.idle_ms', Math.max(0, input.nowMs - idleSince));
        if (input.nowMs - idleSince < idleWindowMs) return decide({ action: 'wait', because: 'recent-activity' });

        return decide({ action: 'offer', because: 'idle-on-a-ready-visible-surface' });
    } finally {
        span.end();
    }
}
