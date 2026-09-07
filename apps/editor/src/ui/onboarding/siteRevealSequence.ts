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

/**
 * ⛔⛔ §STARTUP-REVEAL-NOT-GATED-ON-CONTEXT (L-13160, founder 2026-09-07: *"THIS NEEDS TO BE 10X
 * QUICKER"*) — **THE LONGEST A CONTEXT READ MAY HOLD THE SPLIT VIEW SHUT.**
 *
 * The number is chosen from the two cases it has to serve, not from taste:
 *   · a WARM read (a revisited site, a second search) resolves in single-digit milliseconds, so
 *     any deadline at all preserves the whole benefit of §REVEAL-CONTENT-READY — the split still
 *     mounts fully populated, exactly as before;
 *   · a COLD first read of `buildings` measured **22 544 ms for 81 tiles** at Barcelona on the
 *     live build, so no deadline in the seconds range changes that case's OUTCOME — it only
 *     decides how much of it the user spends staring at a globe. 1.5 s is therefore the largest
 *     value that is still inside the founder's ~2.3 s target for `geocode:end → split-mounted`.
 *
 * ⚠ IT IS A CEILING, NOT A DELAY. A gate that resolves at 4 ms mounts at 4 ms; nothing here
 * introduces a minimum wait, and turning it into one would be the §REVEAL-CONTENT-READY mistake
 * inverted (that dep's own note already forbids a timer standing in for a readiness signal).
 */
export const REVEAL_GATE_DEADLINE_MS = 1_500;

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
     * ⛔⛔ §STARTUP-REVEAL-NOT-GATED-ON-CONTEXT (L-13160, founder 2026-09-07) — **THIS PARAGRAPH
     * USED TO READ *"NO WATCHDOG IS NEEDED HERE, AND ADDING ONE WOULD BE WORSE THAN NOT"*, AND
     * THAT SENTENCE COST THE FOUNDER 22.7 SECONDS ON EVERY FIRST LOAD.** Its reasoning was
     * *"`fetchContextBuildingsNearAndFar` never throws and carries its own per-mirror timeouts, so
     * it always settles"* — every clause of which is TRUE, and the conclusion drawn from it is
     * still wrong: **"it always settles" is not "it settles soon".** A gate with no deadline
     * inherits the worst case of whatever it waits on, and the worst case here is a cold 81-tile
     * range read of a 23.79 GB archive.
     *
     * ⭐ **THE PROOF IS TWO ADJACENT MARKS IN HIS OWN §STARTUP-BUDGET (live build, Barcelona):**
     *     geocode:end            t+6 459
     *     reveal:flight-settled  t+6 497
     *     context-warm:done      t+29 183   (+22 686 ms)
     *     reveal:content-ready   t+29 183   (**+0 ms**)
     *     reveal:split-mounted   t+29 288
     * `reveal:content-ready` landing in the SAME MILLISECOND as `context-warm:done` is not a
     * coincidence to be interpreted — it is the gate, printing itself. The camera had settled at
     * t+6 497 and the user then watched a globe for 22.7 s more. Founder, verbatim: *"IT ACTUALLY
     * REACHES - BUT IT TAKES TOOOOOOOOO LONG - THIS NEEDS TO BE 10X QUICKER"*.
     *
     * ⭐ **SO THE GATE IS NOW DEADLINED, NOT DELETED, AND THE DIFFERENCE MATTERS.** Deleting it
     * would throw away the case it was built for — a warm or cached read resolves in single-digit
     * milliseconds, and mounting a split that is about to be fully populated one tick later is
     * strictly better than mounting an empty one. Deadlining keeps that and caps the pathological
     * case: after `revealGateDeadlineMs` (default `REVEAL_GATE_DEADLINE_MS`) the reveal proceeds,
     * the read keeps running, and the layers stream into a split the user is already looking at.
     *
     * ⚠ **AND THE STREAMING-IN MUST STAY HONEST.** A layer still loading when the split mounts is
     * reported by the 3D pane's own activation line (§STARTUP-QUIET-ACTIVATION,
     * `viewActivationLoading.ts`), and a layer that failed still answers `unavailable`
     * (§CONTEXT-DATA-HONESTY — failure and empty are different values). This deadline moves WHEN
     * the user sees the view; it must never change WHAT the view claims about the data in it.
     *
     * A rejection is still treated as "ready" — a context read that failed must not strand the user
     * on the globe either.
     *
     * Optional: when absent the reveal mounts immediately, which is exactly the pre-gate behaviour.
     */
    readonly awaitContentReady?: () => Promise<unknown>;
    /**
     * §STARTUP-REVEAL-NOT-GATED-ON-CONTEXT (L-13160, founder 2026-09-07) — how long BOTH gates
     * above may hold the reveal before the split mounts anyway. Injectable ONLY so the specs can
     * pin the behaviour in milliseconds instead of seconds; production omits it and takes
     * `REVEAL_GATE_DEADLINE_MS`. `0` means "mount as soon as the preconditions are met".
     */
    readonly revealGateDeadlineMs?: number;
    /**
     * §REVEAL-FLIGHT-COMPLETE (founder 2026-08-06: "START ZOOMING … SLOWLY … take 3–4 seconds,
     * THEN transition to the split view") — THE OTHER HALF OF THE GATE.
     *
     * Content-readiness alone is not the founder's ask. If the data lands at t≈2.7 s and the camera
     * is still descending until t≈3.9 s, cutting to the split on content alone interrupts the very
     * zoom that was requested. So the reveal waits for BOTH, and the transition happens when the
     * LATER of the two finishes — which is the honest reading of "keep that loading in the
     * background … then transition".
     *
     * ⚠ THIS IS NOT A MINIMUM DURATION AND MUST NOT BECOME ONE. It settles when the flight is no
     * longer in progress, INCLUDING when the user grabs the globe and cancels it (see
     * `CesiumViewport.flyToGeographic`). A user who interrupts the cinematic gets their split
     * immediately; they do not get held hostage to an animation they just overrode.
     *
     * Optional: when absent only the content gates, which is the §REVEAL-CONTENT-READY behaviour.
     */
    readonly awaitFlightComplete?: () => Promise<unknown>;
    /**
     * `window.pryzmMountSiteAuthoringPanes()` — the ONE existing split mount (idempotent).
     *
     * ⭐ §SITE-CHECK-RUNS-BEFORE-THE-SITE-IS-ANCHORED (L-13002) — IT MAY DECLINE, AND THE
     * DECLINE IS AN OUTCOME, NOT AN EXCEPTION. The host gates the mount on the app phase
     * and on whether the model holds a Site (§ONBOARDING-IS-FULL-BLEED), and it returns
     * `false` rather than throwing when it says no. This dep used to be typed `() => void`,
     * so a refusal read here as a success: the sequence pushed `mount-split`, returned
     * `mounted: true`, and the founder's console said *"§22 reveal: split mounted in
     * order"* over a screen with no split on it — the only symptom left being a 45-second
     * wait for a draw surface that could never load. `undefined` is still treated as
     * success, so a host that genuinely returns nothing (and the tests that model one)
     * behaves exactly as before; only an explicit `false` stops the sequence.
     */
    readonly mountSplit: () => boolean | void;
    /** Presentation-only fade. Never gates; a throw here does not un-mount the split. */
    readonly fadeInSplit?: () => void;
}

export type SiteRevealStep =
    | 'seed-geocode-frame'
    | 'anchor-site-location'
    | 'arm-boundary-listener'
    | 'await-content-ready'
    | 'await-flight-complete'
    | 'mount-split'
    | 'fade-in-split';

export type SiteRevealStopReason =
    | 'geocode-frame-not-seeded'
    | 'site-location-not-anchored'
    /** The host was asked and said no — see `mountSplit` (L-13002). */
    | 'split-mount-declined'
    /** The host threw. The split is not up and the error is on the console. */
    | 'split-mount-threw';

export interface SiteRevealResult {
    /** True only when the split was actually mounted (both preconditions satisfied). */
    readonly mounted: boolean;
    /**
     * §STARTUP-REVEAL-NOT-GATED-ON-CONTEXT (L-13160) — true when the content gate did NOT settle
     * inside its deadline and the reveal proceeded without it. Reported rather than inferred: the
     * defect this closes was invisible for a month precisely because "the reveal waited" and "the
     * read had finished" were indistinguishable from the outside.
     */
    readonly gateDeadlineExpired?: boolean;
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
        // ⚠ BOTH GATES ARE STARTED BEFORE EITHER IS AWAITED. `Promise.all` over the two calls —
        // not `await content; await flight` — because the second form would only begin observing
        // the flight after the content resolved, and a flight that finished in between would be
        // observed as "already settled" only by luck of ordering. Concurrent by construction:
        // the reveal fires when the LATER of the two lands, which is the whole choreography.
        //
        // ⛔⛔ §STARTUP-REVEAL-NOT-GATED-ON-CONTEXT (L-13160) — AND IT IS DEADLINED. This step is
        // the ONLY one that can take real time, so it is the only place a slow dependency can hold
        // the whole product shut — which is exactly what it did: 22.7 s of the founder's 22.8 s
        // `geocode:end → split-mounted` was spent here, waiting on a cold `buildings` read.
        //
        // ⚠ THE DEADLINE COVERS **BOTH** GATES, ON PURPOSE. Deadlining only the content gate would
        // fix the one dependency that is known to be slow and leave the invariant unstated — and
        // the invariant is the point: **no reveal gate, present or future, may hold the split
        // longer than `REVEAL_GATE_DEADLINE_MS`.** A rule that names one caller is a patch; a rule
        // that bounds the STEP is a property the next dependency inherits for free.
        let gateDeadlineExpired = false;
        if (deps.awaitContentReady || deps.awaitFlightComplete) {
            const deadlineMs =
                typeof deps.revealGateDeadlineMs === 'number' && Number.isFinite(deps.revealGateDeadlineMs)
                    ? Math.max(0, deps.revealGateDeadlineMs)
                    : REVEAL_GATE_DEADLINE_MS;
            let timer: ReturnType<typeof setTimeout> | undefined;
            try {
                const gates = Promise.all([
                    deps.awaitContentReady?.(),
                    deps.awaitFlightComplete?.(),
                ]).then(() => false as const);
                const expired = await Promise.race([
                    gates,
                    new Promise<true>((resolve) => { timer = setTimeout(() => resolve(true), deadlineMs); }),
                ]);
                gateDeadlineExpired = expired === true;
            } catch (e) {
                // Ready-enough. See the deps' notes: neither a failed context read nor a refused
                // camera may strand the user on the globe.
                console.warn('[site-reveal] a reveal gate rejected — revealing anyway (non-fatal):', e);
            } finally {
                if (timer !== undefined) clearTimeout(timer);
            }
            if (gateDeadlineExpired) {
                // ⚠ SAY IT OUT LOUD. The console line this replaces claimed the layers were loading
                // "behind the reveal" while the reveal was waiting on one of them; a reveal that
                // proceeds without its content must announce that, or the next reader is left to
                // infer it from two timestamps again.
                console.log(
                    `[site-reveal] §STARTUP-REVEAL-NOT-GATED-ON-CONTEXT: the context read had not `
                    + `landed within ${deadlineMs} ms — mounting the split now and letting it stream `
                    + 'in. The read is NOT cancelled and NOT reported as empty: the 3D pane carries its own '
                    + 'activation line says what is still arriving (§STARTUP-QUIET-ACTIVATION), and a '
                    + 'layer that fails still answers `unavailable` (§CONTEXT-DATA-HONESTY).',
                );
            }
            if (deps.awaitContentReady) steps.push('await-content-ready');
            if (deps.awaitFlightComplete) steps.push('await-flight-complete');
        }

        // 4) The ONE existing mount (P1 — no parallel mount path; idempotent).
        //
        // ⛔ L-13002 — BELIEVE THE HOST, NOT THE CALL. `mountSplit` returning without
        // throwing is NOT evidence that a split exists: the host declines by RETURNING
        // `false` (its §ONBOARDING-IS-FULL-BLEED gate), and this block used to record that
        // as `mount-split` + `mounted: true`.
        let mounted = false;
        try {
            mounted = deps.mountSplit() !== false;
        } catch (e) {
            console.error('[site-reveal] mountSplit threw — the split did not open:', e);
            return { mounted: false, steps, gateDeadlineExpired, stoppedBecause: 'split-mount-threw' };
        }
        if (!mounted) {
            console.warn(
                '[site-reveal] the host DECLINED to mount the split (it returned false) — staying '
                + 'full-screen on the globe. Its own console line above says why; this sequence '
                + 'ran its preconditions in order:', steps.join(' → '),
            );
            return { mounted: false, steps, gateDeadlineExpired, stoppedBecause: 'split-mount-declined' };
        }
        steps.push('mount-split');

        // 5) Presentation only.
        if (deps.fadeInSplit) {
            try {
                deps.fadeInSplit();
                steps.push('fade-in-split');
            } catch (e) {
                console.warn('[site-reveal] fadeInSplit threw (non-fatal, split is already up):', e);
            }
        }

        return { mounted: true, steps, gateDeadlineExpired };
    } finally {
        span.end();
    }
}
