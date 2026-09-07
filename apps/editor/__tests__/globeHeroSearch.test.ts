// PRYZM-EARTH-ONBOARDING PRD Milestone 2 (docs/03-execution/plans/
// PRYZM-EARTH-ONBOARDING-PRD-2026-08-06.md §9/§10) — unit tests for `GlobeHeroSearch`, the
// onboarding `location` step's globe presentation layer. DOM-free by design (mirrors
// `resolveSeededTypologyId.test.ts`), so every dependency (globe toggle, camera host, geocoder)
// is a fake and the reducer chain is asserted directly.

import { describe, it, expect, vi } from 'vitest';
import { GlobeHeroSearch, type GlobeHeroSearchGeocodeResult } from '../src/ui/onboarding/GlobeHeroSearch.js';
import type { CoverageEntry, SiteEntryCameraTarget } from '../src/engine/views/siteEntryModel';
import { SITE_ENTRY_FLIGHT_DURATION_S } from '../src/engine/views/siteEntryModel';
import type { GlobeCameraHost } from '../src/engine/views/siteEntryStore';

const COVERED: CoverageEntry = {
    jurisdictionId: 'es-14021-cordoba',
    displayName: 'Córdoba',
    countryCode: 'ES',
    countryName: 'Spain',
    extent: { minLat: 37.8, maxLat: 37.95, minLon: -4.85, maxLon: -4.7 },
    contains: (lat, lon) => lat >= 37.8 && lat <= 37.95 && lon >= -4.85 && lon <= -4.7,
    extentResolution: 'municipal',
    answerSummary: 'The Córdoba PGOU-2001 ordinance.',
    packZoneCodes: ['MC'],
};

function harness(opts?: {
    entries?: readonly CoverageEntry[];
    geocode?: (q: string) => Promise<readonly GlobeHeroSearchGeocodeResult[]>;
    whenCameraHostReady?: () => Promise<void>;
    warmContextCache?: (lat: number, lon: number) => void;
    onParcelArrival?: (picked: { lat: number; lon: number; address: string; bbox?: [number, number, number, number] }) => void;
}) {
    const toggleCalls: boolean[] = [];
    const flights: SiteEntryCameraTarget[] = [];
    const host: GlobeCameraHost = {
        // §REVEAL-FLIGHT-COMPLETE — the port returns a promise that settles when the flight is no
        // longer in progress. An already-resolved one models "the tween finished instantly", which
        // keeps these tests synchronous-ish while still exercising the awaited-leg path.
        flyToGeographic: (t) => {
            flights.push({
                lat: t.lat,
                lon: t.lon,
                altitudeM: t.altitudeM,
                pitchDeg: t.pitchDeg,
                stage: 'world', // overwritten per-assertion where relevant; flights[] order is what matters
                instant: t.instant ?? false,
                durationS: t.durationS ?? 0,
            });
            return Promise.resolve();
        },
    };
    const geocode =
        opts?.geocode ??
        vi.fn(async (): Promise<readonly GlobeHeroSearchGeocodeResult[]> => [
            { lat: 37.883, lon: -4.78, displayName: 'Córdoba, Spain' },
        ]);
    const hero = new GlobeHeroSearch({
        toggleGlobe: (active) => toggleCalls.push(active),
        getCameraHost: () => host,
        ...(opts?.whenCameraHostReady ? { whenCameraHostReady: opts.whenCameraHostReady } : {}),
        ...(opts?.warmContextCache ? { warmContextCache: opts.warmContextCache } : {}),
        ...(opts?.onParcelArrival ? { onParcelArrival: opts.onParcelArrival } : {}),
        entries: opts?.entries ?? [COVERED],
        geocode,
    });
    return { hero, toggleCalls, flights, geocode };
}

/** A controllable "not ready yet" gate — mirrors `window.pryzmGetSiteEntryCameraHostReady`'s
 *  real shape (a promise that resolves once the Cesium viewport has actually mounted). */
function deferredReadyGate() {
    let resolve!: () => void;
    const promise = new Promise<void>((r) => { resolve = r; });
    return { promise, resolve };
}

describe('GlobeHeroSearch', () => {
    it('mount() toggles the globe on exactly once and frames the world view instantly (no whenCameraHostReady supplied — pre-fix synchronous framing preserved)', async () => {
        const { hero, toggleCalls, flights } = harness();
        await hero.mount();
        expect(toggleCalls).toEqual([true]);
        expect(flights).toHaveLength(1);
        expect(flights[0]).toMatchObject({ instant: true });
        // mount() again is a no-op (idempotent).
        await hero.mount();
        expect(toggleCalls).toEqual([true]);
    });

    it('dispose() toggles the globe off exactly once and is idempotent', async () => {
        const { hero, toggleCalls } = harness();
        await hero.mount();
        hero.dispose();
        expect(toggleCalls).toEqual([true, false]);
        hero.dispose();
        expect(toggleCalls).toEqual([true, false]);
    });

    it('dispose() before mount() never toggles the globe (nothing to tear down)', () => {
        const { hero, toggleCalls } = harness();
        hero.dispose();
        expect(toggleCalls).toEqual([]);
    });

    // §SITE-ENTRY-GLOBE-READY (PRD §16) — the ready-gating fix. Reproduces + closes the
    // exact race the founder's console log showed: `toggleGlobe(true)` starts an ASYNC
    // mount; `frameCurrent()` must not fire until the camera host is genuinely live.
    it('mount() toggles the globe on immediately, but defers frameCurrent() until whenCameraHostReady() resolves — never a dropped frame, never a fixed delay', async () => {
        const gate = deferredReadyGate();
        const { hero, toggleCalls, flights } = harness({ whenCameraHostReady: () => gate.promise });

        const mounting = hero.mount();
        // toggleGlobe(true) fires synchronously, same as before this fix.
        expect(toggleCalls).toEqual([true]);
        // But the camera host is not "ready" yet — frameCurrent() must NOT have fired,
        // proving this isn't a bespoke setTimeout guess that ships before the real signal.
        await Promise.resolve(); // let any stray microtask settle
        expect(flights).toHaveLength(0);

        // The real readiness signal fires (mirrors CesiumViewport.mount() completing) —
        // frameCurrent() must fire now, framing the full zoomed-out world view.
        gate.resolve();
        await mounting;
        expect(flights).toHaveLength(1);
        expect(flights[0]).toMatchObject({ instant: true });
    });

    it('mount() still frames the world view even if whenCameraHostReady() rejects (a failed mount must not strand the user on a blank card)', async () => {
        const { hero, flights } = harness({ whenCameraHostReady: () => Promise.reject(new Error('mount failed')) });
        await hero.mount();
        expect(flights).toHaveLength(1);
    });

    it('a dispose() that races mount() while awaiting whenCameraHostReady() cancels the pending frame (never flies a camera the user already dismissed)', async () => {
        const gate = deferredReadyGate();
        const { hero, toggleCalls, flights } = harness({ whenCameraHostReady: () => gate.promise });

        const mounting = hero.mount();
        expect(toggleCalls).toEqual([true]);
        hero.dispose(); // e.g. the user hit Skip while the globe was still mounting.
        expect(toggleCalls).toEqual([true, false]);

        gate.resolve(); // the mount finishes AFTER dispose — must be a no-op now.
        await mounting;
        expect(flights).toHaveLength(0);
    });

    it('search() with an empty query fails without calling the geocoder', async () => {
        const { hero, geocode } = harness();
        const outcome = await hero.search('   ');
        expect(outcome.ok).toBe(false);
        expect(geocode).not.toHaveBeenCalled();
    });

    it('search() with no geocode matches fails with the honest "no matches" copy', async () => {
        const { hero } = harness({ geocode: async () => [] });
        const outcome = await hero.search('nowhere');
        expect(outcome.ok).toBe(false);
        if (!outcome.ok) expect(outcome.message).toMatch(/no matches/i);
    });

    it('search() surfaces a thrown geocoder as a non-fatal, skippable failure', async () => {
        const { hero } = harness({
            geocode: async () => {
                throw new Error('network down');
            },
        });
        const outcome = await hero.search('anywhere');
        expect(outcome.ok).toBe(false);
        if (!outcome.ok) expect(outcome.message).toMatch(/lookup failed/i);
    });

    it('search() drives the camera through a CHAIN of discrete flights, one per stage (PRD §7) — world → country → city → parcel, plus the terminal select-parcel confirmation', async () => {
        const { hero, flights } = harness();
        const outcome = await hero.search('Córdoba');
        expect(outcome.ok).toBe(true);
        // flights[0] = the per-search `reset` (re-affirms the world view); flights[1..3] = one
        // flight per intermediate stage the `descend` chain passed through (country, city,
        // parcel); flights[4] = the final `select-parcel` hand-off intent (same target — the
        // parcel stage is unchanged, so this is a confirmation, not a jump). Every leg is a real
        // reducer transition — never a single continuous camera-path animation computed by
        // application code.
        expect(flights.length).toBe(5);
        // Altitude strictly decreases across the three descend legs — each is a real zoom-in.
        for (let i = 2; i <= 3; i++) {
            expect(flights[i]!.altitudeM).toBeLessThan(flights[i - 1]!.altitudeM);
        }
        // The terminal select-parcel flight lands at the same altitude as the parcel-stage
        // descend that preceded it — it re-affirms the target, it does not move further.
        expect(flights[4]!.altitudeM).toBe(flights[3]!.altitudeM);
    });

    it('search() resolves the picked location with lat/lon/address from the best geocode hit', async () => {
        const { hero } = harness();
        const outcome = await hero.search('Córdoba');
        expect(outcome.ok).toBe(true);
        if (outcome.ok) {
            expect(outcome.picked).toEqual({ lat: 37.883, lon: -4.78, address: 'Córdoba, Spain' });
            expect(outcome.message).toMatch(/^Found: /);
        }
    });

    it('search() forwards bbox when the geocoder supplies one', async () => {
        const bbox: [number, number, number, number] = [-4.8, 37.87, -4.76, 37.9];
        const { hero } = harness({
            geocode: async () => [{ lat: 37.883, lon: -4.78, displayName: 'Córdoba, Spain', bbox }],
        });
        const outcome = await hero.search('Córdoba');
        expect(outcome.ok).toBe(true);
        if (outcome.ok) expect(outcome.picked.bbox).toEqual(bbox);
    });

    it('search() succeeds for an UNCOVERED location — mode defaults to "open", not "coverage-gated"', async () => {
        // No registered coverage entries at all; a coverage-gated store would refuse the
        // parcel-stage descent. This module must not regress the pre-existing behaviour of
        // accepting ANY geocoded address.
        const { hero, flights } = harness({
            entries: [],
            geocode: async () => [{ lat: 51.5034, lon: -0.1276, displayName: '10 Downing Street, London' }],
        });
        const outcome = await hero.search('10 Downing Street');
        expect(outcome.ok).toBe(true);
        expect(flights.length).toBe(5);
    });

    it('a second search() resets the stage chain rather than continuing from wherever the first landed', async () => {
        const { hero, flights } = harness();
        await hero.search('Córdoba');
        const firstCount = flights.length;
        expect(firstCount).toBe(5);
        await hero.search('Córdoba again');
        // The second search re-runs the full world→country→city→parcel chain, not a
        // truncated one starting mid-stage.
        expect(flights.length).toBe(firstCount + 5);
    });

    it('mount()/dispose() never throw even when toggleGlobe itself throws', () => {
        const hero = new GlobeHeroSearch({
            toggleGlobe: () => {
                throw new Error('boom');
            },
            getCameraHost: () => null,
            entries: [],
            geocode: async () => [],
        });
        expect(() => hero.mount()).not.toThrow();
        expect(() => hero.dispose()).not.toThrow();
    });

    // §17 Increment 1 (PRD §17.2 "City" row) — the background cache-warm hook.
    it('search() calls warmContextCache exactly once, with the geocoded lat/lon, the moment the chain reaches the city stage', async () => {
        const warmCalls: Array<[number, number]> = [];
        const { hero } = harness({
            warmContextCache: (lat, lon) => warmCalls.push([lat, lon]),
        });
        const outcome = await hero.search('Córdoba');
        expect(outcome.ok).toBe(true);
        expect(warmCalls).toEqual([[37.883, -4.78]]);
    });

    it('search() never calls warmContextCache when no warmContextCache dependency is supplied (optional, additive)', async () => {
        const { hero } = harness();
        const outcome = await hero.search('Córdoba');
        expect(outcome.ok).toBe(true);
        // No assertion target needed beyond "did not throw" — the point is the dependency is
        // genuinely optional (mirrors `whenCameraHostReady`'s own optionality).
    });

    it('search() swallows a throwing warmContextCache without failing the search', async () => {
        const { hero } = harness({
            warmContextCache: () => {
                throw new Error('cache warm boom');
            },
        });
        const outcome = await hero.search('Córdoba');
        expect(outcome.ok).toBe(true);
    });

    it('a second search() calls warmContextCache again (once per search, not once ever)', async () => {
        const warmCalls: Array<[number, number]> = [];
        const { hero } = harness({
            warmContextCache: (lat, lon) => warmCalls.push([lat, lon]),
        });
        await hero.search('Córdoba');
        await hero.search('Córdoba again');
        expect(warmCalls).toEqual([[37.883, -4.78], [37.883, -4.78]]);
    });

    // §22 (PRD §17.4 / §17.7 Q2) — THE REVEAL GATE. The split may only appear once the staged
    // flight has actually reached the closest (`parcel`) stage — never at search submit, never
    // mid-flight, and never at all when the search failed.
    it('search() fires onParcelArrival exactly once, AFTER the full flight chain has landed at the parcel stage', async () => {
        const arrivals: Array<{ lat: number; lon: number; address: string }> = [];
        let flightsAtArrival = -1;
        const h = harness({
            onParcelArrival: (p) => { arrivals.push(p); flightsAtArrival = h.flights.length; },
        });
        const outcome = await h.hero.search('Córdoba');
        expect(outcome.ok).toBe(true);
        expect(arrivals).toEqual([{ lat: 37.883, lon: -4.78, address: 'Córdoba, Spain' }]);
        // All five flights (reset + 3 descends + the terminal hand-off) had already been issued.
        expect(flightsAtArrival).toBe(5);
    });

    it('search() forwards the bbox to onParcelArrival (the 2D pane cannot fitBounds without it)', async () => {
        const bbox: [number, number, number, number] = [-4.8, 37.87, -4.76, 37.9];
        const arrivals: Array<{ bbox?: [number, number, number, number] }> = [];
        const { hero } = harness({
            geocode: async () => [{ lat: 37.883, lon: -4.78, displayName: 'Córdoba, Spain', bbox }],
            onParcelArrival: (p) => arrivals.push(p),
        });
        await hero.search('Córdoba');
        expect(arrivals).toHaveLength(1);
        expect(arrivals[0]!.bbox).toEqual(bbox);
    });

    it('search() does NOT fire onParcelArrival on any failure path (no location ⇒ no split)', async () => {
        const arrivals: unknown[] = [];
        const empty = harness({ geocode: async () => [], onParcelArrival: () => arrivals.push(1) });
        expect((await empty.hero.search('nowhere')).ok).toBe(false);

        const threw = harness({
            geocode: async () => { throw new Error('network down'); },
            onParcelArrival: () => arrivals.push(1),
        });
        expect((await threw.hero.search('anywhere')).ok).toBe(false);

        const blank = harness({ onParcelArrival: () => arrivals.push(1) });
        expect((await blank.hero.search('   ')).ok).toBe(false);

        expect(arrivals).toEqual([]);
    });

    it('search() swallows a throwing onParcelArrival — the search still succeeds', async () => {
        const { hero } = harness({ onParcelArrival: () => { throw new Error('reveal boom'); } });
        const outcome = await hero.search('Córdoba');
        expect(outcome.ok).toBe(true);
    });

    it('a search that resolves after dispose() does NOT reveal a split the user has left behind', async () => {
        const arrivals: unknown[] = [];
        let release!: () => void;
        const gate = new Promise<void>((r) => { release = r; });
        const { hero } = harness({
            geocode: async () => { await gate; return [{ lat: 1, lon: 2, displayName: 'Somewhere' }]; },
            onParcelArrival: () => arrivals.push(1),
        });
        const pending = hero.search('Somewhere');
        hero.dispose();          // e.g. the user hit Skip while the geocode was in flight
        release();
        expect((await pending).ok).toBe(false);
        expect(arrivals).toEqual([]);
    });

    // §22 — the globe hand-off: once the split owns the viewport, releasing the hero must not
    // hide it (that was a black 3D pane).
    it('dispose({ keepGlobe: true }) releases the hero WITHOUT toggling the globe off', async () => {
        const { hero, toggleCalls } = harness();
        await hero.mount();
        hero.dispose({ keepGlobe: true });
        expect(toggleCalls).toEqual([true]);
        // Still fully disposed — a later plain dispose() cannot resurrect the toggle either.
        hero.dispose();
        expect(toggleCalls).toEqual([true]);
    });

    it('search() never throws when getCameraHost() returns null (no globe mounted yet)', async () => {
        const hero = new GlobeHeroSearch({
            toggleGlobe: () => {},
            getCameraHost: () => null,
            entries: [COVERED],
            geocode: async () => [{ lat: 37.883, lon: -4.78, displayName: 'Córdoba, Spain' }],
        });
        const outcome = await hero.search('Córdoba');
        expect(outcome.ok).toBe(true);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// §STARTUP-DIRECT-DESCENT (founder 2026-08-07: 5× startup — speed wins) — the descent PASSES
// THROUGH the intermediate stages instead of completing each one.
//
// This block used to pin the OPPOSITE property (§REVEAL-FLIGHT-COMPLETE: each leg awaited, five
// flights × 0.75 s of staged descent). The measured cost of that choreography was three full
// frustum loads Cesium committed to at world/country/city altitudes the user never looks at
// again, competing for bandwidth with the context read the reveal gates on. The founder ruled the
// trade on 2026-08-07; these tests pin the ruling so the awaited-leg choreography cannot silently
// come back.
describe('§STARTUP-DIRECT-DESCENT — the chain is dispatched pass-through, no leg is awaited', () => {
    /** A camera host whose flights NEVER settle — a search that completes against it proves the
     *  chain awaits no leg. (Under the old §REVEAL-FLIGHT-COMPLETE choreography this host would
     *  hang `search()` forever on the first descend.) */
    function frozenHost() {
        const flights: Array<{ altitudeM: number; durationS?: number }> = [];
        const host: GlobeCameraHost = {
            flyToGeographic: (t) => {
                flights.push({ altitudeM: t.altitudeM, ...(t.durationS !== undefined ? { durationS: t.durationS } : {}) });
                return new Promise<void>(() => { /* never settles */ });
            },
        };
        return { host, flights };
    }

    it('search() completes even when NO flight ever settles — the descent is not sequenced on the camera', async () => {
        const { host, flights } = frozenHost();
        const hero = new GlobeHeroSearch({
            toggleGlobe: () => {},
            getCameraHost: () => host,
            entries: [COVERED],
            geocode: async () => [{ lat: 37.883, lon: -4.78, displayName: 'Cordoba, Spain' }],
        });
        const outcome = await hero.search('Cordoba');
        expect(outcome.ok).toBe(true);
        // All FIVE flights (reset + 3 descends + terminal confirmation) were ISSUED in one
        // synchronous chain — each superseding the last before a frame renders at its altitude,
        // which is exactly how the intermediate frustum loads are reclaimed.
        expect(flights.length).toBe(5);
        // Monotonic descent across the issued targets — the stage machine itself is unchanged.
        const alts = flights.map((f) => f.altitudeM);
        expect(alts).toEqual([...alts].sort((a, b) => b - a));
        expect(new Set(alts).size).toBe(4);
    });

    it('fires the city-stage cache warm during the synchronous chain (t≈0), before any flight settles', async () => {
        const { host } = frozenHost();
        const warmCalls: Array<[number, number]> = [];
        const hero = new GlobeHeroSearch({
            toggleGlobe: () => {},
            getCameraHost: () => host,
            entries: [COVERED],
            geocode: async () => [{ lat: 37.883, lon: -4.78, displayName: 'Cordoba, Spain' }],
            warmContextCache: (lat, lon) => warmCalls.push([lat, lon]),
        });
        await hero.search('Cordoba');
        // The warm fired even though no flight ever settled — the context read overlaps the
        // WHOLE flight instead of starting two legs in.
        expect(warmCalls).toEqual([[37.883, -4.78]]);
    });

    it('carries the MODEL-declared duration to the camera, not a viewport-local constant — and it is ONE short ease, not a 3–4 s staged descent', async () => {
        const { flights, hero } = (() => {
            const h = harness();
            return { flights: h.flights, hero: h.hero };
        })();
        const outcome = await hero.search('Córdoba');
        expect(outcome.ok).toBe(true);
        expect(flights.length).toBeGreaterThan(0);
        for (const f of flights) expect(f.durationS).toBe(SITE_ENTRY_FLIGHT_DURATION_S);
        // §STARTUP-DIRECT-DESCENT — only the LAST issued flight is rendered (each flyTo
        // supersedes the previous within one synchronous chain), so the user-visible descent is
        // exactly ONE duration: a short ease. The 3.75 s staged total is the thing the founder's
        // 2026-08-07 ruling removed; this guard keeps it from creeping back via the constant.
        expect(SITE_ENTRY_FLIGHT_DURATION_S).toBeGreaterThanOrEqual(1);
        expect(SITE_ENTRY_FLIGHT_DURATION_S).toBeLessThanOrEqual(2);
    });

    it('exposes a flight-settled signal that resolves when nothing is flying', async () => {
        const { hero } = harness();
        // Nothing has flown yet — the gate must not hang the reveal on a descent that never began.
        await expect(hero.whenFlightSettled()).resolves.toBeUndefined();
    });

    it('whenFlightSettled() tracks the LAST issued flight — the reveal gate still sequences on the real camera', async () => {
        let resolveLast: (() => void) | null = null;
        const flights: number[] = [];
        const host: GlobeCameraHost = {
            flyToGeographic: (t) => {
                flights.push(t.altitudeM);
                return new Promise<void>((r) => { resolveLast = r; });
            },
        };
        const hero = new GlobeHeroSearch({
            toggleGlobe: () => {},
            getCameraHost: () => host,
            entries: [COVERED],
            geocode: async () => [{ lat: 37.883, lon: -4.78, displayName: 'Cordoba, Spain' }],
        });
        await hero.search('Cordoba');
        expect(flights.length).toBe(5);
        // The settled signal is pending until the FINAL (terminal confirmation) flight settles.
        let settled = false;
        void hero.whenFlightSettled().then(() => { settled = true; });
        await Promise.resolve(); await Promise.resolve();
        expect(settled).toBe(false);
        resolveLast!();
        await Promise.resolve(); await Promise.resolve();
        expect(settled).toBe(true);
    });
});

// §WHERE-IS-YOUR-PROJECT (L-13057 item 4) — the CADASTRAL entry point's flight.
//
// The rule these pin is "one choreography, not two": a reference that has already been resolved
// to real registry geometry must reach the parcel stage, the hand-off and the §22 reveal gate
// through the SAME body a place search takes — and must NOT re-enter the geocoder to get there.
describe('GlobeHeroSearch.flyToResolved', () => {
    it('flies the SAME staged chain as search(), without calling the geocoder at all', async () => {
        const arrivals: Array<{ lat: number; lon: number; address: string }> = [];
        const { hero, flights, geocode } = harness({
            onParcelArrival: (p) => { arrivals.push({ lat: p.lat, lon: p.lon, address: p.address }); },
        });
        const out = await hero.flyToResolved({
            lat: 37.883,
            lon: -4.78,
            displayName: 'Parcel 2947201UG4924N · Catastro (Spain)',
            bbox: [-4.7805, 37.8825, -4.7795, 37.8835],
        });
        expect(out.ok).toBe(true);
        // ⛔ The geometry came from the registry. Round-tripping it through a place-name lookup
        // would be strictly worse-resolved data reached by a longer path.
        expect(geocode).not.toHaveBeenCalled();
        // The identical 5-flight chain search() produces (see the whenFlightSettled test above).
        expect(flights.length).toBe(5);
        // The §22 reveal gate fired, carrying the PARCEL's own coordinates and extent.
        expect(arrivals).toHaveLength(1);
        expect(arrivals[0]!.lat).toBeCloseTo(37.883, 6);
        expect(arrivals[0]!.address).toContain('2947201UG4924N');
    });

    it('forwards the parcel bbox so the 2D pane opens on the PLOT, not the city', async () => {
        let bbox: [number, number, number, number] | undefined;
        const { hero } = harness({ onParcelArrival: (p) => { bbox = p.bbox; } });
        await hero.flyToResolved({
            lat: 41.3925,
            lon: 2.16492,
            displayName: 'Parcel 0229720DF3802G',
            bbox: [2.1645, 41.3922, 2.1653, 41.3929],
        });
        expect(bbox).toEqual([2.1645, 41.3922, 2.1653, 41.3929]);
    });

    it('refuses non-finite coordinates rather than flying somewhere arbitrary', async () => {
        const { hero, flights } = harness();
        const out = await hero.flyToResolved({ lat: Number.NaN, lon: 2.1, displayName: 'x' });
        expect(out.ok).toBe(false);
        expect(flights).toHaveLength(0);
    });
});
