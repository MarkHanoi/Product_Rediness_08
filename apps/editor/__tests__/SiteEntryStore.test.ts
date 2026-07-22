// §FEAT-SITE-ENTRY-GLOBE (L-593, C60 §4) — unit tests for the site-entry VIEW-STATE
// STORE: the command layer that turns `site.entry.*` intents into camera + hand-off
// effects, and the port discipline that keeps C19's one-shot parcel boundary safe.
//
// The ports are recorders. That is the whole point of the port seam: "the country stage
// never calls the site path" becomes an assertion instead of a code-reading promise.

import { describe, it, expect, vi } from 'vitest';
import {
    SiteEntryStore,
    type SiteEntryCameraPort,
    type SiteEntrySitePort,
} from '../src/engine/views/siteEntryStore';
import type { CoverageEntry, SiteEntryCameraTarget } from '../src/engine/views/siteEntryModel';

const ALPHA: CoverageEntry = {
    jurisdictionId: 'xx-alpha',
    displayName: 'Alphaville',
    countryCode: 'XX',
    countryName: 'Xanadu',
    extent: { minLat: 10, maxLat: 11, minLon: 20, maxLon: 21 },
    contains: (lat, lon) => lat >= 10 && lat <= 11 && lon >= 20 && lon <= 21,
    answerSummary: 'The Alpha ordinance.',
    packZoneCodes: ['a1'],
};

function harness(mode: 'coverage-gated' | 'open' = 'coverage-gated'): {
    store: SiteEntryStore;
    flights: SiteEntryCameraTarget[];
    handOffs: unknown[];
} {
    const flights: SiteEntryCameraTarget[] = [];
    const handOffs: unknown[] = [];
    const camera: SiteEntryCameraPort = { flyTo: (t) => void flights.push(t) };
    const site: SiteEntrySitePort = {
        handOff: (i) => {
            handOffs.push(i);
            return true;
        },
    };
    return { store: new SiteEntryStore({ entries: [ALPHA], mode, camera, site }), flights, handOffs };
}

describe('SiteEntryStore — the command layer', () => {
    it('dispatch is the ONLY write path: state changes and subscribers are notified', () => {
        const { store } = harness();
        const seen: string[] = [];
        store.subscribe((s) => seen.push(s.stage));
        expect(store.dispatch({ type: 'site.entry.focus-jurisdiction', jurisdictionId: 'xx-alpha' }).ok)
            .toBe(true);
        expect(store.getState().stage).toBe('city');
        expect(seen).toEqual(['city']);
    });

    it('a REJECTED intent changes nothing — no state, no camera, no subscriber, no hand-off', () => {
        const { store, flights, handOffs } = harness();
        const seen: unknown[] = [];
        store.subscribe((s) => seen.push(s));
        const before = store.getState();
        const res = store.dispatch({ type: 'site.entry.select-parcel', lat: 10.5, lon: 20.5 });
        expect(res.ok).toBe(false);
        expect(res.rejected).toBeTruthy();
        expect(store.getState()).toBe(before);
        expect(flights).toHaveLength(0); // ⚠ the user must still be looking at what they were
        expect(handOffs).toHaveLength(0);
        expect(seen).toHaveLength(0);
    });

    it('drives the camera through the PORT only, with the model-derived target', () => {
        const { store, flights } = harness();
        store.dispatch({ type: 'site.entry.focus-jurisdiction', jurisdictionId: 'xx-alpha' });
        expect(flights).toHaveLength(1);
        expect(flights[0]).toMatchObject({ stage: 'city', lat: 10.5, lon: 20.5, instant: false });
    });

    it('frameCurrent() jumps (setView) rather than gliding — a mount is not a navigation', () => {
        const { store, flights } = harness();
        store.frameCurrent();
        expect(flights[0]).toMatchObject({ stage: 'world', instant: true });
    });

    it('never calls the site port from a pre-site stage (C19 §1.3/§1.4)', () => {
        const { store, handOffs } = harness();
        store.dispatch({ type: 'site.entry.focus-country', countryCode: 'XX' });
        store.dispatch({ type: 'site.entry.focus-jurisdiction', jurisdictionId: 'xx-alpha' });
        store.dispatch({ type: 'site.entry.ascend' });
        store.dispatch({ type: 'site.entry.reset' });
        store.dispatch({ type: 'site.entry.descend', lat: 10.5, lon: 20.5 });
        expect(handOffs).toHaveLength(0);
    });

    it('hands off ONCE, at the parcel stage, into the existing site path', () => {
        const { store, handOffs } = harness();
        store.dispatch({ type: 'site.entry.focus-jurisdiction', jurisdictionId: 'xx-alpha' });
        store.dispatch({ type: 'site.entry.descend', lat: 10.5, lon: 20.5 });
        const res = store.dispatch({
            type: 'site.entry.select-parcel',
            lat: 10.5,
            lon: 20.5,
            address: 'Alpha 1',
        });
        expect(res.ok).toBe(true);
        expect(res.handedOff).toBe(true);
        expect(handOffs).toEqual([
            { lat: 10.5, lon: 20.5, address: 'Alpha 1', jurisdictionId: 'xx-alpha' },
        ]);
    });

    it('a camera port that throws does not strand the flow — the stage is the truth', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const store = new SiteEntryStore({
            entries: [ALPHA],
            camera: {
                flyTo: () => {
                    throw new Error('viewer disposed');
                },
            },
        });
        expect(store.dispatch({ type: 'site.entry.focus-jurisdiction', jurisdictionId: 'xx-alpha' }).ok)
            .toBe(true);
        expect(store.getState().stage).toBe('city');
        warn.mockRestore();
    });

    it('the panel projection tracks the store, so the chrome holds no copy of its own', () => {
        const { store } = harness();
        expect(store.getPanel().stage).toBe('world');
        store.dispatch({ type: 'site.entry.focus-jurisdiction', jurisdictionId: 'xx-alpha' });
        expect(store.getPanel()).toMatchObject({ stage: 'city', verdict: 'covered', title: 'Alphaville' });
    });

    it('(A) is the DEFAULT mode when none is given — the founder decision, not a fallback', () => {
        expect(new SiteEntryStore({ entries: [ALPHA] }).getMode()).toBe('coverage-gated');
        expect(new SiteEntryStore({ entries: [ALPHA], mode: 'open' }).getMode()).toBe('open');
    });
});
