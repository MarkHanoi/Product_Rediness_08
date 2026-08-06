// PRYZM-EARTH-ONBOARDING PRD Milestone 2 (docs/03-execution/plans/
// PRYZM-EARTH-ONBOARDING-PRD-2026-08-06.md §9/§10) — unit tests for `GlobeHeroSearch`, the
// onboarding `location` step's globe presentation layer. DOM-free by design (mirrors
// `resolveSeededTypologyId.test.ts`), so every dependency (globe toggle, camera host, geocoder)
// is a fake and the reducer chain is asserted directly.

import { describe, it, expect, vi } from 'vitest';
import { GlobeHeroSearch, type GlobeHeroSearchGeocodeResult } from '../src/ui/onboarding/GlobeHeroSearch.js';
import type { CoverageEntry, SiteEntryCameraTarget } from '../src/engine/views/siteEntryModel';
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
}) {
    const toggleCalls: boolean[] = [];
    const flights: SiteEntryCameraTarget[] = [];
    const host: GlobeCameraHost = {
        flyToGeographic: (t) => {
            flights.push({
                lat: t.lat,
                lon: t.lon,
                altitudeM: t.altitudeM,
                pitchDeg: t.pitchDeg,
                stage: 'world', // overwritten per-assertion where relevant; flights[] order is what matters
                instant: t.instant ?? false,
            });
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
