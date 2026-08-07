// PRYZM-EARTH-ONBOARDING PRD §22 (docs/03-execution/plans/PRYZM-EARTH-ONBOARDING-PRD-2026-08-06.md)
// — the ZOOM-THEN-SPLIT reveal SEQUENCE, extracted as a DOM-free decision module.
//
// WHY THIS EXISTS AS ITS OWN MODULE
// ---------------------------------
// §21 ("Early Split-Screen Mount") shipped and was REVERTED the same day for ONE reason: the
// split was mounted before its two preconditions were satisfied. The revert note is explicit:
//
//   (a) `window.pryzmSetGeocodeFrame({lat, lon, bbox})` must have run BEFORE the 2D pane opens
//       — `SiteBoundaryMap2D` reads its opening frame from `getMapInitial()`
//       (`GISAreaLayout.ts:231`), which is populated ONLY by that hook. Without it the left
//       pane opens at world zoom.
//   (b) the site location must be ANCHORED (`dispatchSiteLocation` → `site.location-changed`)
//       BEFORE the 3D pane opens — the Forma/massing path refuses with "no site location yet —
//       cannot place massing" and the right pane renders empty/black.
//
// `startDrawThenGenerate()` (`OnboardingStepController.ts`) already does this in the right
// order today, which is why the draw path "was working perfect". The failure mode was therefore
// never "mounting the split is wrong" — it was "mounting it out of order is wrong". A sequence
// whose correctness is an ORDERING property belongs in a module that can be asserted directly,
// without a DOM, a Cesium viewer, or a live runtime — which is what this file is (same idiom as
// `GlobeHeroSearch.ts` / `resolveSeededTypologyId.ts`).
//
// THE ORDER IS THE CONTRACT (and is what the tests assert):
//   1. seed-geocode-frame     — `pryzmSetGeocodeFrame` (2D pane's opening frame)
//   2. anchor-site-location   — `dispatchSiteLocation` (3D pane's placement precondition)
//   3. arm-boundary-listener  — BEFORE the mount, because mounting AUTO-ARMS the draw tool in
//                               the left pane (`GISAreaLayout.ts:4309`,
//                               `mount: (paneEl) => startBoundaryDraw({ parent: paneEl })`).
//                               A boundary the user commits the instant the split appears must
//                               not fire into an empty bus (§21.1 finding 2) — the user has NOT
//                               yet chosen how to define their site, so a draw/select at this
//                               moment is legitimate and must route to confirm.
//   4. mount-split            — the ONE existing `window.pryzmMountSiteAuthoringPanes()` (P1:
//                               no parallel mount path; it is idempotent, §21.1 finding 3).
//   5. fade-in-split          — presentation only; never gates anything.
//
// If step 1 or step 2 cannot be performed, the sequence STOPS and the split is NOT mounted —
// reproducing the §21 regression is a worse outcome than staying full-screen on the globe, which
// is exactly the behaviour that shipped before §21 and which the founder confirmed was working.
//
// P3: no `requestAnimationFrame`, no timers, no polling here — this module only sequences the
// injected effects it is handed. P4: no `window` access (the caller owns the globals).

import { trace } from '@opentelemetry/api';

const _tracer = trace.getTracer('pryzm.site-entry.site-reveal-sequence');

/** The resolved location the reveal is anchored to — the `search()` outcome's `picked`. */
export interface SiteRevealTarget {
    readonly lat: number;
    readonly lon: number;
    readonly address: string;
    readonly bbox?: [number, number, number, number];
}

/**
 * Every side effect the reveal performs, injected. Each precondition step returns a boolean:
 * `false` means "this could not be done" (hook absent, runtime refused) and STOPS the sequence
 * before the mount — the §21 revert-note rule, expressed as a type rather than a comment.
 */
export interface SiteRevealDeps {
    /** `window.pryzmSetGeocodeFrame(...)`. `false` when the hook is not wired. */
    readonly seedGeocodeFrame: (frame: {
        lat: number;
        lon: number;
        bbox?: [number, number, number, number];
    }) => boolean;
    /** `dispatchSiteLocation(ctx, …)` — location ONLY, never a boundary (C19 §1.4: the user's
     *  own committed draw must remain the FIRST `site.setParcelBoundary`). `false` when no site
     *  context could be resolved. */
    readonly anchorSiteLocation: (target: SiteRevealTarget) => boolean;
    /** Arm the one-shot early `site.parcel-boundary-set` listener (§21.1 finding 2). Optional
     *  only so tests can omit it; production ALWAYS supplies it. */
    readonly armBoundaryListener?: () => void;
    /**
     * §REVEAL-CONTENT-READY (founder 2026-08-06) — THE READINESS GATE. Resolves when the work the
     * split pane will display has actually landed; the reveal waits on it before mounting, so the
     * expensive load overlaps the camera flight instead of following it.
     *
     * ⚠ THIS IS A READINESS SIGNAL, NEVER A TIMER, and the distinction is the whole ask. A fixed
     * delay is wrong in both directions: it stalls a warm cache that was ready instantly, and it
     * cuts to a half-built view when the load is slow. Production supplies the SAME promise the
     * §CTX-PREFETCH-ON-LOCATION warm-up already starts one stage earlier (at `city`), so this gate
     * introduces NO new fetch and no second readiness concept — it only stops discarding the
     * knowledge of when that fetch finished.
     *
     * ⚠ NO WATCHDOG IS NEEDED HERE, and adding one would be worse than not. The production signal
     * is `fetchContextBuildingsNearAndFar`, which never throws and carries its own per-mirror
     * timeouts, so it always settles. A rejection is treated as "ready" — a context read that
     * failed must not strand the user on the globe forever; the split's own honest-empty handling
     * is the right place for that failure to surface, not this gate.
     *
     * Optional: when absent the reveal mounts immediately, which is exactly the pre-gate behaviour.
     */
    readonly awaitContentReady?: () => Promise<unknown>;
    /** `window.pryzmMountSiteAuthoringPanes()` — the ONE existing split mount (idempotent). */
    readonly mountSplit: () => void;
    /** Presentation-only fade. Never gates; a throw here does not un-mount the split. */
    readonly fadeInSplit?: () => void;
}

export type SiteRevealStep =
    | 'seed-geocode-frame'
    | 'anchor-site-location'
    | 'arm-boundary-listener'
    | 'await-content-ready'
    | 'mount-split'
    | 'fade-in-split';

export type SiteRevealStopReason =
    | 'geocode-frame-not-seeded'
    | 'site-location-not-anchored';

export interface SiteRevealResult {
    /** True only when the split was actually mounted (both preconditions satisfied). */
    readonly mounted: boolean;
    /** The steps that ran, in the order they ran. The ordering contract, observable. */
    readonly steps: readonly SiteRevealStep[];
    /** Present iff `mounted === false` — which precondition stopped the sequence. */
    readonly stoppedBecause?: SiteRevealStopReason;
}

/**
 * Run the zoom-then-split reveal. Never throws: a throwing dependency is treated as that step
 * failing (preconditions) or as a non-fatal warning (arm/fade), so a wiring defect can never
 * strand the user mid-onboarding.
 *
 * P8: carries an OTel span (this is the module's only exported function).
 */
export async function runSiteRevealSequence(
    deps: SiteRevealDeps,
    target: SiteRevealTarget,
): Promise<SiteRevealResult> {
    const span = _tracer.startSpan('pryzm.site-entry.site-reveal-sequence.run');
    const steps: SiteRevealStep[] = [];
    try {
        // 1) The 2D pane's opening frame — §21 revert-note precondition (a).
        let seeded = false;
        try {
            seeded = deps.seedGeocodeFrame({
                lat: target.lat,
                lon: target.lon,
                ...(target.bbox ? { bbox: target.bbox } : {}),
            }) === true;
        } catch (e) {
            console.warn('[site-reveal] seedGeocodeFrame threw — not mounting the split:', e);
            seeded = false;
        }
        if (!seeded) {
            console.warn(
                '[site-reveal] geocode frame NOT seeded — staying full-screen on the globe rather ' +
                'than opening the 2D pane at world zoom (PRD §21 revert note).',
            );
            return { mounted: false, steps, stoppedBecause: 'geocode-frame-not-seeded' };
        }
        steps.push('seed-geocode-frame');

        // 2) The 3D pane's placement precondition — §21 revert-note precondition (b).
        let anchored = false;
        try {
            anchored = deps.anchorSiteLocation(target) === true;
        } catch (e) {
            console.warn('[site-reveal] anchorSiteLocation threw — not mounting the split:', e);
            anchored = false;
        }
        if (!anchored) {
            console.warn(
                '[site-reveal] site location NOT anchored — staying full-screen on the globe rather ' +
                'than opening a 3D pane that cannot place massing (PRD §21 revert note).',
            );
            return { mounted: false, steps, stoppedBecause: 'site-location-not-anchored' };
        }
        steps.push('anchor-site-location');

        // 3) Arm BEFORE the mount — the mount auto-arms the draw tool (§21.1 finding 2).
        if (deps.armBoundaryListener) {
            try {
                deps.armBoundaryListener();
                steps.push('arm-boundary-listener');
            } catch (e) {
                console.warn('[site-reveal] armBoundaryListener threw (non-fatal):', e);
            }
        }

        // 3.5) §REVEAL-CONTENT-READY — WAIT FOR THE CONTENT, NOT FOR A CLOCK.
        //
        // Everything above is cheap and synchronous; this is the only step that can take real
        // time, and it is placed here deliberately — AFTER the two preconditions and the arm (so a
        // wiring defect still fails fast and stays on the globe, rather than failing slowly), and
        // BEFORE the mount (so the split never appears half-built).
        //
        // ⚠ THIS ONLY BUYS ANYTHING BECAUSE THE READ IT WAITS ON IS NOW FAST. Against the shipped
        // §CTX-PMTILES-READER the same wait would have been ~80 s — no camera flight can hide
        // that, and gating on it would have replaced a half-built split with a frozen globe. It is
        // §CTX-RANGE-URL-SOURCE / §CTX-TILE-DECODE-CACHE (same day) that bring the far-extent read
        // to ~1.4 s cold and ~0 warm, which fits inside the staged flight the user is already
        // watching. The two changes are one feature: the fix makes the choreography honest.
        if (deps.awaitContentReady) {
            try {
                await deps.awaitContentReady();
            } catch (e) {
                // Ready-enough. See the dep's note: a failed context read must not strand the user.
                console.warn('[site-reveal] awaitContentReady rejected — revealing anyway (non-fatal):', e);
            }
            steps.push('await-content-ready');
        }

        // 4) The ONE existing mount (P1 — no parallel mount path; idempotent).
        try {
            deps.mountSplit();
            steps.push('mount-split');
        } catch (e) {
            console.error('[site-reveal] mountSplit threw — the split did not open:', e);
            return { mounted: false, steps };
        }

        // 5) Presentation only.
        if (deps.fadeInSplit) {
            try {
                deps.fadeInSplit();
                steps.push('fade-in-split');
            } catch (e) {
                console.warn('[site-reveal] fadeInSplit threw (non-fatal, split is already up):', e);
            }
        }

        return { mounted: true, steps };
    } finally {
        span.end();
    }
}
