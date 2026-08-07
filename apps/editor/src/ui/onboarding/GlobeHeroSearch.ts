// PRYZM-EARTH-ONBOARDING PRD (docs/03-execution/plans/PRYZM-EARTH-ONBOARDING-PRD-2026-08-06.md
// §9/§10 Milestone 2) — GlobeHeroSearch: the thin, DOM-free orchestration layer that turns the
// onboarding `location` step's plain text input into a search box that drives the EXISTING C60
// globe-entry stage machine (`siteEntryModel.ts` / `SiteEntryStore`) instead of a bespoke
// geocode-then-set-field flow.
//
// WHY DOM-FREE (mirrors `projectAutoName.ts` / `resolveSeededTypologyId.ts`, Milestone 1/Phase 2)
// -------------------------------------------------------------------------------------------
// `OnboardingStepController.ts` transitively pulls in DOM-constructing code at import time and is
// not importable under this app's node-environment vitest config. This module touches no
// `document`, no `window`, and no Cesium import — every side effect (toggling the globe on/off,
// resolving the live camera host, geocoding) is INJECTED, so the search/stage-chain logic is
// directly unit-testable with fakes, and the only "reach into the DOM/global" code stays in
// `OnboardingStepController.ts`, which already does that kind of wiring for `pryzmToggleGIS` etc.
//
// WHAT THIS REUSES (per §11.9 "reuse before creation")
// ------------------------------------------------------
// - `SiteEntryStore` / `reduceSiteEntry` (`engine/views/siteEntryModel.ts`, `siteEntryStore.ts`) —
//   the EXISTING pure stage reducer (`world → country → city → parcel`) and its camera projection.
//   This module adds NO new stage logic — it only dispatches intents.
// - `cesiumSiteEntryCameraPort` — the EXISTING adapter from a `GlobeCameraHost` (which the ONE
//   `CesiumViewport` singleton already satisfies structurally via `flyToGeographic()`) into the
//   store's `SiteEntryCameraPort`. No new camera/tween code.
// - The caller's own geocoder (`geocodeAddress.ts`, OSM Nominatim — NOT Google; see PRD §12
//   conflict #6, which already corrected the "Google Maps" asset-inventory claim) — injected as
//   `geocode`, never re-implemented here.
//
// THE CINEMATIC CHAIN (PRD §7) — "a chain of discrete `flyTo` calls, one per intermediate stage
// the reducer passes through, not a single continuous camera-path animation computed by
// application code." A search result dispatches `site.entry.descend` repeatedly (world → country
// → city → parcel), each dispatch producing exactly one `camera` effect the store's camera port
// turns into one `Cesium.Camera.flyTo`. This module never touches `viewer.camera` itself.
//
// MODE = 'open', DELIBERATELY (not the shipped 'coverage-gated' default) — the onboarding
// `location` step's job is to ANCHOR a site, not to gate entry on rule-pack coverage; today's
// (pre-this-change) plain card accepts ANY geocoded address, covered or not, and hands it to
// `createSiteFromRect` — the honest "PRYZM cannot answer here" refusal already happens correctly
// downstream, at generate/envelope time. Using `'coverage-gated'` here would be a REGRESSION (it
// would block picking an uncovered address at all, which today's flow does not do). `'open'`
// keeps the descent gate lifted while still running the real reducer/camera machine.
//
// P8: every exported member below carries at least one OTel span.

import { trace } from '@opentelemetry/api';
import { SiteEntryStore, cesiumSiteEntryCameraPort, type GlobeCameraHost } from '../../engine/views/siteEntryStore';
import type { CoverageEntry, SiteEntryMode } from '../../engine/views/siteEntryModel';

const _tracer = trace.getTracer('pryzm.site-entry.globe-hero-search');

/** The narrowed geocode-hit shape this module needs — structurally compatible with
 *  `GeocodeResult` (`geocodeAddress.ts`) without importing it, so this file never needs to know
 *  about the provider (OSM Nominatim today; swappable later per that module's own header). */
export interface GlobeHeroSearchGeocodeResult {
    readonly lat: number;
    readonly lon: number;
    readonly displayName: string;
    readonly bbox?: [number, number, number, number];
}

export interface GlobeHeroSearchPicked {
    readonly lat: number;
    readonly lon: number;
    readonly address: string;
    readonly bbox?: [number, number, number, number];
}

export type GlobeHeroSearchOutcome =
    | { readonly ok: true; readonly message: string; readonly picked: GlobeHeroSearchPicked }
    | { readonly ok: false; readonly message: string };

export interface GlobeHeroSearchOptions {
    /** Mount/dismiss the ONE Cesium viewport SOLO (C60 §6 invariant 8 / C59 §2 invariant 5 —
     *  never composite a live BIM pane behind the globe on the WebGL fallback). Production caller
     *  wires this to `window.pryzmToggleGIS` (the existing, already-typed idiom). */
    readonly toggleGlobe: (active: boolean) => void;
    /** Resolve the live camera host (the ONE `CesiumViewport` singleton, structurally). A
     *  resolver rather than a reference so a torn-down/recreated viewport (device-loss recovery)
     *  is picked up without this module holding a stale handle — mirrors
     *  `cesiumSiteEntryCameraPort`'s own doc comment. */
    readonly getCameraHost: () => GlobeCameraHost | null;
    /**
     * §SITE-ENTRY-GLOBE-READY (PRD §16) — resolves once the camera host `getCameraHost()`
     * will return is genuinely live and accepting camera commands. Production wiring is
     * `window.pryzmGetSiteEntryCameraHostReady`. `mount()` awaits this BEFORE its first
     * `frameCurrent()` call so the initial framing is never dropped by the race where
     * `toggleGlobe(true)` kicks off an ASYNCHRONOUS viewport construction/mount and
     * `getCameraHost()` still returns `null` for a while after. Optional (falls back to the
     * pre-fix synchronous framing, e.g. in tests that fake an already-live host) so this is
     * additive, not a breaking signature change.
     */
    readonly whenCameraHostReady?: () => Promise<void>;
    /**
     * §17 Increment 1 (PRD §17.2 "City" row — "Parcel vector tiles, planning layers, existing
     * GIS datasets... begin loading") — fired AT MOST ONCE per `search()`, the moment the
     * descend chain reaches the `city` stage, i.e. while the camera is still mid-flight and well
     * before the user has committed to a parcel. Optional and fire-and-forget BY CONTRACT: this
     * module never awaits it and a throw/rejection is swallowed here as a defensive backstop even
     * though every production wiring of this (see `OnboardingStepController.ts`) already wraps its
     * own call in a non-throwing `.catch`. Pure optimisation — omitting it changes nothing about
     * the stage chain, the camera, or the outcome `search()` resolves to.
     */
    readonly warmContextCache?: (lat: number, lon: number) => void;
    /**
     * §22 THE REVEAL GATE (PRD §17.4 / §17.7 open question 2) — fired AT MOST ONCE per
     * successful `search()`, the moment the staged flight chain has reached its CLOSEST stage
     * (`parcel`, `SITE_ENTRY_ALTITUDE_M.parcel`) AND the terminal `site.entry.select-parcel`
     * hand-off intent has been accepted. That is this codebase's honest "camera arrived close"
     * signal: the stage machine is the CAUSE and the camera is its projection
     * (`siteEntryModel.ts`'s own invariant 3), so the terminal stage transition — not a height
     * poll, not a timer — is what "we are at the parcel" means here.
     *
     * NOT fired on any failure path (empty query, no geocode match, a reducer refusal), so a
     * user who never resolved a location never gets a split.
     *
     * Fire-and-forget by contract: `search()` neither awaits it nor lets it change the outcome,
     * and a throw is swallowed — the reveal is presentation sequencing layered on top of a
     * search that has already succeeded.
     */
    readonly onParcelArrival?: (picked: GlobeHeroSearchPicked) => void;
    /** Registry-derived coverage (`siteEntryCoverageEntries()`), forwarded verbatim — this module
     *  holds no jurisdiction data of its own (C60 §2). */
    readonly entries: readonly CoverageEntry[];
    /** Defaults to `'open'` — see the file header for why this differs from the shipped
     *  `'coverage-gated'` default used elsewhere. */
    readonly mode?: SiteEntryMode;
    /** The existing geocoder (`geocodeAddress`), injected so this module never imports it and
     *  stays fetch-free / directly testable with a fake. */
    readonly geocode: (query: string) => Promise<readonly GlobeHeroSearchGeocodeResult[]>;
}

/**
 * Thin composition (§9: "not a new engine") over the existing `SiteEntryStore` + the existing
 * `CesiumViewport` singleton. Owns no Cesium instance, no DOM, no camera math — it only
 * sequences intents and reports the outcome for `OnboardingStepController` to act on (set
 * `this.picked`, advance to the `site` step).
 */
export class GlobeHeroSearch {
    private readonly store: SiteEntryStore;
    private mounted = false;
    private disposed = false;

    constructor(private readonly opts: GlobeHeroSearchOptions) {
        const camera = cesiumSiteEntryCameraPort(this.opts.getCameraHost);
        this.store = new SiteEntryStore({
            entries: this.opts.entries,
            mode: this.opts.mode ?? 'open',
            camera,
        });
    }

    /**
     * Mount the solo globe behind the search card. Idempotent.
     *
     * §SITE-ENTRY-GLOBE-READY (PRD §16) — `toggleGlobe(true)` only KICKS OFF the (async)
     * Cesium viewport construction/mount; calling `frameCurrent()` synchronously right after,
     * as this method used to, races it — `getCameraHost()` returns `null` for a while after,
     * so the initial "full, zoomed-out Earth" framing was silently dropped (console:
     * "[site-entry] no globe mounted — camera target dropped."), leaving Cesium showing its
     * OWN internal fallback camera (a hard-coded Sydney default — see `CesiumViewport.ts`'s
     * mount()) instead. Fixed by awaiting the real readiness signal (`whenCameraHostReady`,
     * production-wired to `CesiumViewport.whenReady()` via `window.pryzmGetSiteEntryCameraHostReady`)
     * BEFORE framing — never a fixed delay/`setTimeout` guess. `mount()` itself stays
     * synchronous-looking for callers that don't await it (`toggleGlobe(true)` fires
     * immediately, same as before); only the framing is deferred.
     */
    async mount(): Promise<void> {
        const span = _tracer.startSpan('pryzm.site-entry.globe-hero-search.mount');
        try {
            if (this.mounted || this.disposed) return;
            this.mounted = true;
            try {
                this.opts.toggleGlobe(true);
            } catch (e) {
                console.warn('[globe-hero-search] toggleGlobe(true) threw:', e);
            }
            if (this.opts.whenCameraHostReady) {
                try {
                    await this.opts.whenCameraHostReady();
                } catch (e) {
                    console.warn('[globe-hero-search] whenCameraHostReady() rejected — framing with best-effort camera host:', e);
                }
                // `dispose()` may have run while this awaited (e.g. the user hit Skip during
                // the mount race) — a disposed hero must not fly a camera it just told to hide.
                if (this.disposed) return;
            }
            // Frame the untouched world view instantly (a mount is not a navigation — mirrors
            // `SiteEntryStore.frameCurrent()`'s own doc comment).
            this.store.frameCurrent();
        } finally {
            span.end();
        }
    }

    /**
     * Dismiss the solo globe. Idempotent, safe to call more than once (e.g. once from the
     * Skip handler and again from the overlay's own teardown cleanup).
     *
     * §22 `keepGlobe` — after the reveal has mounted the site-authoring split, the SAME single
     * Cesium viewport is re-parented into the split's RIGHT pane (`GISAreaLayout.ts`'s cesium
     * mounter). Tearing the hero down normally would call `toggleGlobe(false)` →
     * `CesiumViewport.setVisible(false)`, hiding the viewport the split is now showing — a black
     * right pane. `keepGlobe: true` releases the hero's own state WITHOUT touching the globe,
     * because ownership of it has transferred to the split. Default (`false`) is unchanged.
     */
    /**
     * §REVEAL-FLIGHT-COMPLETE — settles when the camera descent this hero drove is no longer in
     * flight. The reveal choreography gates on it alongside the content load, so the split appears
     * when BOTH the zoom has landed and the data is ready — never on a timer.
     *
     * Delegates to the store, which owns the flight (one store per entry session, so nothing here
     * outlives the session). Resolves immediately when nothing is flying.
     */
    whenFlightSettled(): Promise<void> {
        return this.store.whenFlightSettled();
    }

    dispose(opts?: { keepGlobe?: boolean }): void {
        const span = _tracer.startSpan('pryzm.site-entry.globe-hero-search.dispose');
        try {
            if (this.disposed) return;
            this.disposed = true;
            if (this.mounted && opts?.keepGlobe !== true) {
                try {
                    this.opts.toggleGlobe(false);
                } catch (e) {
                    console.warn('[globe-hero-search] toggleGlobe(false) threw:', e);
                }
            }
            this.mounted = false;
        } finally {
            span.end();
        }
    }

    /**
     * Resolve a search query into a picked location, driving the camera through the FULL
     * `world → country → city → parcel` chain (PRD §7) rather than a single jump. Never throws —
     * every failure path (empty query, no geocode match, geocode error, a reducer refusal)
     * returns `{ ok: false, message }` with user-facing copy the caller can show as-is.
     */
    async search(query: string): Promise<GlobeHeroSearchOutcome> {
        const span = _tracer.startSpan('pryzm.site-entry.globe-hero-search.search');
        try {
            const q = query.trim();
            if (!q) {
                return { ok: false, message: 'Type a place to search.' };
            }

            // Fresh chain each search — reset first so a second search never starts mid-stage
            // from wherever the previous one landed.
            this.store.dispatch({ type: 'site.entry.reset' });

            let results: readonly GlobeHeroSearchGeocodeResult[];
            try {
                results = await this.opts.geocode(q);
            } catch (e) {
                console.warn('[globe-hero-search] geocode threw:', e);
                return { ok: false, message: 'Location lookup failed — you can skip to use the default site.' };
            }
            if (this.disposed) {
                // The step moved on (e.g. Skip) while the geocode was in flight.
                return { ok: false, message: 'Search cancelled.' };
            }
            if (results.length === 0) {
                return { ok: false, message: 'No matches — check the spelling, or skip to use the default site.' };
            }
            const best = results[0]!;

            // The cinematic chain: one `descend` per intermediate stage, each a real reducer
            // transition producing exactly one `camera` effect (PRD §7 — never a bespoke tween).
            let guard = 0;
            let warmedContextCache = false;
            while (this.store.getState().stage !== 'parcel') {
                if (++guard > 8) {
                    // Cannot happen given SITE_ENTRY_STAGES has 4 members, but a reducer change
                    // must not turn this into an infinite loop.
                    return { ok: false, message: 'That location could not be reached.' };
                }
                const step = this.store.dispatch({
                    type: 'site.entry.descend',
                    lat: best.lat,
                    lon: best.lon,
                });
                if (!step.ok) {
                    return { ok: false, message: step.rejected ?? 'That location could not be reached.' };
                }
                // §17 Increment 1 — the FIRST time the chain lands on `city`, kick off the
                // background cache warm. `best.lat`/`best.lon` are the SAME coordinates every
                // remaining stage (including the eventual `select-parcel` hand-off) will use, so
                // this primes the exact cache key the real render-path fetch keys on later —
                // see `OnboardingStepController.ts`'s wiring for which fetch this actually is.
                if (!warmedContextCache && step.state.stage === 'city') {
                    warmedContextCache = true;
                    try {
                        this.opts.warmContextCache?.(best.lat, best.lon);
                    } catch (e) {
                        console.warn('[globe-hero-search] warmContextCache threw:', e);
                    }
                }
                // §REVEAL-FLIGHT-COMPLETE — ⚠ AWAIT THE LEG. THIS LOOP IS WHY THE FOUNDER SAW A
                // 1.6-SECOND JUMP INSTEAD OF THE STAGED DESCENT.
                //
                // Every iteration issues exactly one `camera` effect, and `viewer.camera.flyTo`
                // CANCELS whatever is already flying. Dispatching all three descends synchronously
                // therefore started and immediately superseded world→country and country→city; only
                // the final city→parcel leg was ever rendered. The intermediate stages were
                // computed, framed, and thrown away one microtask later. The chain existed in the
                // state machine and never reached the screen — which is exactly what "takes too
                // long / feels abrupt" looks like from the outside.
                //
                // ⚠ THE WARM-UP IS FIRED BEFORE THIS AWAIT, NOT AFTER, and the order is load-bearing.
                // §CTX-PREFETCH-ON-LOCATION starts at the `city` stage; if it were kicked off after
                // the leg completed it would start a whole leg later and eat straight into the
                // overlap this choreography exists to create. Fired here, the warm-up begins at
                // t≈1.5 s (two legs in) and the context read (~1.4 s since §CTX-RANGE-URL-SOURCE)
                // finishes around t≈2.9 s, while the five-flight descent lands at t≈3.75 s — the
                // split is ready BEFORE the camera stops, which is exactly the founder's ask.
                await this.store.whenFlightSettled();
                if (this.disposed) return { ok: false, message: 'Search cancelled.' };
            }

            // The ONE hand-off intent (C19 §1.3/§1.4) — closes the entry flow's own state
            // machine at the parcel stage. This module wires no site port (the actual Site
            // creation stays owned by `OnboardingStepController`'s existing `site` step /
            // `createSiteFromRect`, exactly as before this change), so the store's own
            // "no site port wired" warning is expected and harmless here.
            const handoff = this.store.dispatch({
                type: 'site.entry.select-parcel',
                lat: best.lat,
                lon: best.lon,
                address: best.displayName,
            });
            if (!handoff.ok) {
                return { ok: false, message: handoff.rejected ?? 'That location could not be selected.' };
            }

            const picked: GlobeHeroSearchPicked = {
                lat: best.lat,
                lon: best.lon,
                address: best.displayName,
                ...(best.bbox ? { bbox: best.bbox } : {}),
            };

            // §22 — THE GATE. The chain is at the `parcel` stage and the hand-off was accepted:
            // this is "the camera has arrived close". Everything the reveal does (seed the 2D
            // frame → anchor the site → mount the split → fade) is the caller's, in the ORDER
            // the §21 revert note requires — see `siteRevealSequence.ts`.
            if (!this.disposed) {
                try {
                    this.opts.onParcelArrival?.(picked);
                } catch (e) {
                    console.warn('[globe-hero-search] onParcelArrival threw (search still succeeded):', e);
                }
            }

            return {
                ok: true,
                message: `Found: ${best.displayName}`,
                picked,
            };
        } finally {
            span.end();
        }
    }
}
