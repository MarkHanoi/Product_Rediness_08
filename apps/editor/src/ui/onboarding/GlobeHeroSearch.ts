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

    /** Mount the solo globe behind the search card. Idempotent. */
    mount(): void {
        const span = _tracer.startSpan('pryzm.site-entry.globe-hero-search.mount');
        try {
            if (this.mounted || this.disposed) return;
            this.mounted = true;
            try {
                this.opts.toggleGlobe(true);
            } catch (e) {
                console.warn('[globe-hero-search] toggleGlobe(true) threw:', e);
            }
            // Frame the untouched world view instantly (a mount is not a navigation — mirrors
            // `SiteEntryStore.frameCurrent()`'s own doc comment).
            this.store.frameCurrent();
        } finally {
            span.end();
        }
    }

    /** Dismiss the solo globe. Idempotent, safe to call more than once (e.g. once from the
     *  Skip handler and again from the overlay's own teardown cleanup). */
    dispose(): void {
        const span = _tracer.startSpan('pryzm.site-entry.globe-hero-search.dispose');
        try {
            if (this.disposed) return;
            this.disposed = true;
            if (this.mounted) {
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

            return {
                ok: true,
                message: `Found: ${best.displayName}`,
                picked: {
                    lat: best.lat,
                    lon: best.lon,
                    address: best.displayName,
                    ...(best.bbox ? { bbox: best.bbox } : {}),
                },
            };
        } finally {
            span.end();
        }
    }
}
