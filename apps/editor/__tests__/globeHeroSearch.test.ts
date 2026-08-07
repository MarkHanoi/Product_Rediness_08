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
// §REVEAL-FLIGHT-COMPLETE — the staged descent must actually REACH THE SCREEN.
//
// The chain was already three discrete reducer transitions producing three camera effects, and
// the test above asserts that. What it could not catch is that all three were dispatched in a
// SYNCHRONOUS loop, so `viewer.camera.flyTo` cancelled each leg with the next one and the user saw
// only the final city→parcel flight. Issuing a flight and rendering a flight are different things;
// these tests pin the second by making each leg's completion controllable.
describe('§REVEAL-FLIGHT-COMPLETE — each leg is awaited, so the descent is seen and not skipped', () => {
    /** A camera host whose flights only finish when the test says so. */
    function pacedHost() {
        const releases: Array<() => void> = [];
        const flights: Array<{ altitudeM: number; durationS?: number }> = [];
        const host: GlobeCameraHost = {
            flyToGeographic: (t) => {
                flights.push({ altitudeM: t.altitudeM, ...(t.durationS !== undefined ? { durationS: t.durationS } : {}) });
                return new Promise<void>((resolve) => { releases.push(resolve); });
            },
        };
        return { host, releases, flights };
    }

    it('does not start the NEXT leg until the current one has settled', async () => {
        const { host, releases, flights } = pacedHost();
        const hero = new GlobeHeroSearch({
            toggleGlobe: () => {},
            getCameraHost: () => host,
            entries: [COVERED],
            geocode: async () => [{ lat: 37.883, lon: -4.78, displayName: 'Cordoba, Spain' }],
        });
        const running = hero.search('Cordoba');
        const drain = async (): Promise<void> => { for (let i = 0; i < 8; i++) await Promise.resolve(); };

        // ⚠ ASSERT THE DELTA, NOT AN ABSOLUTE COUNT. The chain opens with a `site.entry.reset`
        // flight back to the world view which is deliberately NOT awaited — in production it
        // overlaps the geocode round-trip, so awaiting it would add dead time to every search.
        // What must hold is the pairwise property: while a leg is in the air, no further leg is
        // issued. That is exactly what the synchronous `while` loop violated, and it is
        // independent of how many flights precede the descent.
        await drain();
        let seen = flights.length;
        expect(seen).toBeGreaterThan(0);

        for (let leg = 0; leg < 3; leg++) {
            const before = flights.length;
            await drain();
            // Nothing new may appear while the current leg is still flying.
            expect(flights.length).toBe(before);
            // ⚠ POP, NOT SHIFT — release the flight that is actually IN THE AIR (the most recent),
            // not the un-awaited reset still sitting at the head of the queue.
            releases.pop()!();
            await drain();
            expect(flights.length).toBe(before + 1);
            seen = flights.length;
        }

        for (let k = 0; k < 20; k++) { releases.pop()?.(); await drain(); }
        await running;
        // FIVE flights total, measured: reset + 3 descent legs + the terminal select-parcel
        // confirmation. Not the four-stages-so-three-legs arithmetic that looks obvious.
        expect(flights.length).toBe(5);
        // Monotonic descent — no leg is ever further from the ground than the one before it.
        const alts = flights.map((f) => f.altitudeM);
        expect(alts).toEqual([...alts].sort((a, b) => b - a));
        expect(new Set(alts).size).toBe(4);
    });

    it('carries the MODEL-declared duration to the camera, not a viewport-local constant', async () => {
        const { host, releases, flights } = pacedHost();
        const hero = new GlobeHeroSearch({
            toggleGlobe: () => {},
            getCameraHost: () => host,
            entries: [COVERED],
            geocode: async () => [{ lat: 37.883, lon: -4.78, displayName: 'Córdoba, Spain' }],
        });
        const running = hero.search('Córdoba');
        for (let i = 0; i < 20; i++) { releases.shift()?.(); await Promise.resolve(); }
        await running;
        expect(flights.length).toBeGreaterThan(0);
        for (const f of flights) expect(f.durationS).toBe(SITE_ENTRY_FLIGHT_DURATION_S);
        // ⚠ THE FOUNDER'S ASK, AS AN ASSERTION: "take 3–4 seconds". The awaited legs are
        // sequential, so the total descent is (flights × duration) — and this is the guard that
        // would have caught calibrating the constant against an assumed leg count rather than the
        // measured flight count (3 legs × 1.3 s "looks" like 3.9 s but actually shipped 6.5 s).
        const totalS = flights.length * SITE_ENTRY_FLIGHT_DURATION_S;
        expect(totalS).toBeGreaterThanOrEqual(3);
        expect(totalS).toBeLessThanOrEqual(4);
    });

    it('exposes a flight-settled signal that resolves when nothing is flying', async () => {
        const { hero } = harness();
        // Nothing has flown yet — the gate must not hang the reveal on a descent that never began.
        await expect(hero.whenFlightSettled()).resolves.toBeUndefined();
    });
});
