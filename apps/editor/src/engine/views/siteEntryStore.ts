// §FEAT-SITE-ENTRY-GLOBE (L-593, C60 §4) — the VIEW-STATE STORE + COMMAND layer for the
// globe entry flow. The P6 / C59 §2-invariant-3 half of L-593.
//
// It is the same shape as `paneLayoutStore.ts`, on purpose — a second store with a
// different discipline would be a fifth ad-hoc view mechanism, which is what C59 §0
// exists to prevent:
//
//   intent ──dispatch──▶ PURE REDUCER (siteEntryModel.reduceSiteEntry)
//                        ──effects──▶ ports (camera / site hand-off)
//                        ──commit + notify──▶ subscribers (panel repaints)
//
// A REJECTED intent mutates nothing, touches no camera, dispatches no site command, and
// notifies no subscriber; the caller receives user-facing copy explaining why.
//
// ── INVARIANTS THIS FILE HONOURS ────────────────────────────────────────────────────
// C59 §2.1 (ONE Cesium)  — this store constructs nothing. It calls a CAMERA PORT whose
//                          production implementation drives the EXISTING single viewer.
//                          There is no viewer reference here to accidentally clone.
// C59 §2.2 (P3 single rAF) — nothing here schedules a frame. The store is synchronous
//                          state; the camera port delegates to Cesium's own `flyTo`
//                          tween (which is the viewer's existing render loop, not a new
//                          one). A per-stage rAF loop would be a violation; there is none.
// C59 §2.3 (P6)          — the ONLY way a stage changes is `dispatch(intent)`. UI click
//                          handlers dispatch and do nothing else — in particular they
//                          never poke `viewer.camera`.
// C59 §2.5 (perf)        — the flow requests the 3D Site SOLO via the C59 pane store
//                          (`siteEntryPaneIntent`), so no BIM pane stays live behind a
//                          photoreal globe on the WebGL fallback.
// C19 §1.3/§1.4          — the site port is invoked from EXACTLY ONE effect kind
//                          (`site-handoff`), which exactly one intent can produce. The
//                          pre-site stages cannot write site state because they cannot
//                          reach the port.
// C12                    — the store passes WGS84 degrees only; no ENU frame is assumed
//                          or required until the hand-off lands.
// P4                     — no globals, no `window as any`. Both ports are injected.

import {
    INITIAL_SITE_ENTRY_STATE,
    cameraForState,
    describeSiteEntryPanel,
    reduceSiteEntry,
    type CoverageEntry,
    type SiteEntryCameraTarget,
    type SiteEntryContext,
    type SiteEntryIntent,
    type SiteEntryMode,
    type SiteEntryPanel,
    type SiteEntryState,
} from './siteEntryModel';

/**
 * The camera the store drives. The production implementation is a thin adapter over the
 * ONE `CesiumViewport` (`flyToGeographic`); tests pass a recorder.
 *
 * ⚠ It takes a fully-resolved target: the port may not decide WHERE to look, only how to get
 * there. Framing is the model's job (`cameraForState`), and since §REVEAL-FLIGHT-COMPLETE so is
 * the PACING (`target.durationS`).
 *
 * §REVEAL-FLIGHT-COMPLETE — it now returns a promise that settles when the flight is no longer in
 * progress. That is the whole point: the reveal choreography can sequence on the camera rather
 * than guess with a timer. It resolves on cancellation too — see `CesiumViewport.flyToGeographic`
 * for why a superseded flight must not become a rejection.
 */
export interface SiteEntryCameraPort {
    flyTo(target: SiteEntryCameraTarget): Promise<void>;
}

/**
 * The hand-off into the EXISTING site path. The production implementation calls
 * `dispatchSiteLocation(ctx, …)` and then the existing parcel-boundary commit — this
 * flow does NOT fork that path, it arrives at it.
 *
 * Returning `false` means the site path refused; the store leaves the entry state at the
 * parcel stage so the user can pick again rather than being stranded mid-transition.
 */
export interface SiteEntrySitePort {
    handOff(input: {
        readonly lat: number;
        readonly lon: number;
        readonly address: string | null;
        readonly jurisdictionId: string | null;
    }): boolean;
}

/**
 * The ONE globe the flow drives, structurally. `CesiumViewport` satisfies this via its
 * `flyToGeographic()` primitive.
 *
 * ⚠ STRUCTURAL ON PURPOSE — this module does not import `CesiumViewport`, so there is no
 * import edge along which a second viewer could be constructed, and the C59 §2-invariant-1
 * "one Cesium instance" property holds by the absence of the ability to make another.
 */
export interface GlobeCameraHost {
    flyToGeographic(target: {
        lat: number;
        lon: number;
        altitudeM: number;
        pitchDeg: number;
        instant?: boolean;
        durationS?: number;
    }): Promise<void>;
}

/**
 * Adapt the existing single Cesium viewport into the store's camera port. The whole
 * production wiring of the camera side of L-593 — a resolver rather than a reference so
 * a viewport that is torn down and re-created (backend swap, device loss) is picked up
 * without the store holding a stale handle.
 */
export function cesiumSiteEntryCameraPort(
    resolveHost: () => GlobeCameraHost | null,
): SiteEntryCameraPort {
    return {
        flyTo(target) {
            const host = resolveHost();
            if (!host) {
                console.warn('[site-entry] no globe mounted — camera target dropped.', target.stage);
                // §REVEAL-FLIGHT-COMPLETE — a dropped target is a SETTLED flight, not a pending
                // one. Returning a never-resolving promise here would hang any caller awaiting the
                // descent on exactly the path where no globe exists to watch.
                return Promise.resolve();
            }
            return host.flyToGeographic({
                lat: target.lat,
                lon: target.lon,
                altitudeM: target.altitudeM,
                pitchDeg: target.pitchDeg,
                instant: target.instant,
                durationS: target.durationS,
            });
        },
    };
}

export interface SiteEntryDispatchResult {
    readonly ok: boolean;
    readonly state: SiteEntryState;
    /** User-facing copy. Show it — it is the honest "not covered" answer. */
    readonly rejected?: string;
    /** True when this dispatch handed off to the site path (the flow is over). */
    readonly handedOff?: boolean;
}

export type SiteEntryListener = (state: SiteEntryState) => void;

export interface SiteEntryStoreOptions {
    /** Registry-derived coverage. Production callers pass `siteEntryCoverageEntries()`. */
    readonly entries: readonly CoverageEntry[];
    /**
     * (A) `'coverage-gated'` is the shipped default — the founder's decision.
     * (B) is `'open'`. **Switching is this option and nothing else** (C60 §5).
     */
    readonly mode?: SiteEntryMode;
    readonly camera?: SiteEntryCameraPort | null;
    readonly site?: SiteEntrySitePort | null;
}

/**
 * The single source of truth for "where is the user in the entry flow, and can PRYZM
 * answer there". One store per entry session. Readers subscribe; writers dispatch.
 */
export class SiteEntryStore {
    private _state: SiteEntryState = INITIAL_SITE_ENTRY_STATE;
    private readonly listeners = new Set<SiteEntryListener>();
    private readonly ctx: SiteEntryContext;
    private camera: SiteEntryCameraPort | null;
    private site: SiteEntrySitePort | null;
    /**
     * §REVEAL-FLIGHT-COMPLETE — the most recent camera flight this store issued, so a caller can
     * sequence the descent (`await store.whenFlightSettled()`) instead of guessing with a timer.
     *
     * ⚠ SCOPED TO THE STORE INSTANCE, DELIBERATELY. One store per entry session, so this dies with
     * the session and cannot leak a stale promise into the next project — the failure mode that
     * `6897f0cc` had to go back and fix for the globe layout. There is no module-level camera state
     * here and none should be added.
     */
    private lastFlight: Promise<void> = Promise.resolve();

    constructor(opts: SiteEntryStoreOptions) {
        this.ctx = { entries: opts.entries, mode: opts.mode ?? 'coverage-gated' };
        this.camera = opts.camera ?? null;
        this.site = opts.site ?? null;
    }

    getState(): SiteEntryState {
        return this._state;
    }

    /** The honest answer for the current stage, as the panel renders it. */
    getPanel(): SiteEntryPanel {
        return describeSiteEntryPanel(this._state, this.ctx);
    }

    getMode(): SiteEntryMode {
        return this.ctx.mode;
    }

    setCameraPort(port: SiteEntryCameraPort | null): void {
        this.camera = port;
    }

    setSitePort(port: SiteEntrySitePort | null): void {
        this.site = port;
    }

    subscribe(listener: SiteEntryListener): () => void {
        this.listeners.add(listener);
        return () => {
            this.listeners.delete(listener);
        };
    }

    /**
     * Frame the current state without changing it — used once after the pane mounts, so
     * the globe starts at the world view instead of wherever the shared viewer was left.
     * `instant` (a `setView`, not a tween) because a mount is not a navigation.
     */
    frameCurrent(): void {
        this.trackFlight(this.camera?.flyTo(cameraForState(this._state, true)));
    }

    /**
     * §REVEAL-FLIGHT-COMPLETE — settles when the flight this store most recently issued is no
     * longer in progress. Resolves immediately when nothing is flying.
     *
     * ⚠ "SETTLED" IS NOT "ARRIVED". A superseded or cancelled flight settles too (see
     * `CesiumViewport.flyToGeographic`), because callers need to know when to stop waiting, and a
     * promise that only resolved on arrival would hang forever the moment a user touched the globe.
     */
    whenFlightSettled(): Promise<void> {
        return this.lastFlight;
    }

    /** Record a flight, swallowing rejection: a camera failure must never become an unhandled
     *  rejection in a caller that is only sequencing on it. */
    private trackFlight(flight: Promise<void> | void): void {
        if (!flight) return;
        this.lastFlight = flight.catch(() => { /* a refused camera does not strand the flow */ });
    }

    /**
     * THE only write path. Reduce → run effects → commit → notify. A rejection changes
     * nothing at all, including the camera: a user who is told "not covered" must still
     * be looking at what they were looking at, or the refusal reads as a crash.
     */
    dispatch(intent: SiteEntryIntent): SiteEntryDispatchResult {
        const reduced = reduceSiteEntry(this._state, intent, this.ctx);
        if (!reduced.ok) {
            console.warn(`[site-entry] intent rejected: ${reduced.rejected}`);
            return { ok: false, state: this._state, rejected: reduced.rejected };
        }

        // Commit BEFORE the hand-off so a site port that re-enters (the site path emits
        // events synchronously) sees the settled state rather than the previous stage.
        this._state = reduced.next;

        let handedOff = false;
        for (const effect of reduced.effects) {
            if (effect.kind === 'camera') {
                try {
                    // §REVEAL-FLIGHT-COMPLETE — remember the leg so the descent can be awaited.
                    this.trackFlight(this.camera?.flyTo(effect.target));
                } catch (e) {
                    // A camera that refuses must not strand the flow — the stage is the
                    // truth, the camera is its projection and can be re-framed.
                    console.warn('[site-entry] camera port threw:', e);
                }
                continue;
            }
            // effect.kind === 'site-handoff' — C19 §1.3/§1.4, the one-shot boundary.
            if (!this.site) {
                // §HANDOFF-DROP-IS-THE-DESIGN (2026-09-07) — ⚠ THIS LINE IS EXPECTED ON EVERY
                // ONBOARDING ENTRY AND NOTHING IS LOST BY IT. It read "no site port wired —
                // hand-off dropped.", which the founder reasonably read as a defect in his trace
                // (`[site-entry] no site port wired — hand-off dropped.` at t+11476 ms, on the
                // very run that opened correctly).
                //
                // WHAT IS ACTUALLY TRUE: `setSitePort()` has NO production caller anywhere in the
                // repo. `GlobeHeroSearch` deliberately wires no site port and says so — Site
                // creation stays owned by `OnboardingStepController`'s reveal, which anchors the
                // location itself via `dispatchSiteLocation` one step later. The entry flow's
                // machine still needs its terminal intent to CLOSE (that is what puts it in the
                // `parcel` stage and makes the reveal legal), and no production code reads the
                // `handedOff` flag this branch leaves false — its only reader is a unit test.
                //
                // So the honest statement is "no port is wired here, ON PURPOSE, and the site is
                // anchored by the caller instead", not "your hand-off was dropped". Same class as
                // §CONTEXT-DATA-HONESTY: a message that cannot distinguish a designed no-op from a
                // real loss costs the reader a real investigation. `console.log`, not `warn` —
                // warning about the expected path is what made this look like a bug.
                console.log(
                    '[site-entry] no site port wired — the entry flow closes its own machine here ' +
                    'and the caller anchors the site (this is the DESIGNED path for onboarding; ' +
                    'nothing is lost). C19 §1.3/§1.4.',
                );
                continue;
            }
            handedOff = this.site.handOff({
                lat: effect.lat,
                lon: effect.lon,
                address: effect.address,
                jurisdictionId: effect.jurisdictionId,
            });
        }

        this.notify();
        return { ok: true, state: this._state, handedOff };
    }

    private notify(): void {
        for (const l of [...this.listeners]) {
            try {
                l(this._state);
            } catch (e) {
                console.warn('[site-entry] listener threw:', e);
            }
        }
    }
}
