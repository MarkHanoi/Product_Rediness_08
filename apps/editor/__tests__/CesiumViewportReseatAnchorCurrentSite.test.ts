// @vitest-environment happy-dom
//
// §CTX-RESEAT-ANCHOR-IS-CURRENT-SITE (L-12964) — founder, Córdoba 2026-09-06, verbatim from the live
// console: "the trees and maybe other assets sits under the visual plane on the 3d view originally —
// after the user selects the parcel they are nicely visually again". THE SECOND HALF of that report is
// this file's subject, and the console proves it on its own:
//
//   [CTX-DIAG] trees re-seat: rebuilding canopies at 37.88507,-4.77718 on settled ground
//
// …WHILE THE COMMITTED PARCEL WAS AT 37.88779,-4.79761 — ~1.8 km away, the PREVIOUS parcel. The canopy
// count flip-flopped 57 ↔ 1006 between the two sites as the two loads aborted each other.
//
// THE MECHANISM. `rebuildContextTreesForBase` took its anchor from `contextTreesAt ?? contextBuildingsAt`
// — REMEMBERED FIELDS, written by `loadContextTrees` / `loadContextBuildings` and cleared by nobody on a
// site change. So on the second site the terrain settle re-ran the rebuild, read the FIRST site's memo,
// and FORCE-LOADED the first city's canopies over the second city's ground. `rebuildStreetLifeForBase`
// (`streetLife.builtAt ?? contextBuildingsAt`) and the far tier carried the same shape.
//
// THE FIX UNDER TEST is not "remember to null the field": it is that the anchor is DERIVED from the
// current site (`currentContextSite` → massing origin, else the site location) and the remembered memo
// is demoted to a staleness CHECK. A rebuild at a foreign anchor is therefore unreachable rather than
// merely unlikely — which is what these cases assert, ACROSS TWO SITE CHANGES.
//
// Binds the SHIPPED private methods to a stub `this` (the CesiumViewportGroundDrapeReseat pattern).
// No real Cesium viewer.

import { describe, it, expect, vi } from 'vitest';

vi.mock('cesium', () => ({
    Ion: { defaultAccessToken: '' },
    EllipsoidTerrainProvider: class {},
    CesiumTerrainProvider: { fromUrl: async () => { throw new Error('unused'); } },
    Cartographic: { fromDegrees: (lon: number, lat: number) => ({ lon, lat, height: 0 }) },
    sampleTerrainMostDetailed: async (_p: unknown, c: unknown[]) => c,
}));

import { CesiumViewport } from '../src/ui/geospatial/CesiumViewport';

/** The founder's two Córdoba sites, from the console line quoted above. */
const SITE_A = { lat: 37.88507, lon: -4.77718 };   // where the canopies were WRONGLY rebuilt
const SITE_B = { lat: 37.88779, lon: -4.79761 };   // the parcel actually committed (~1.8 km away)
const SITE_C = { lat: 37.87950, lon: -4.81420 };   // a third site, for the second change

type LatLon = { lat: number; lon: number };

type Stub = {
    viewer: { scene: { requestRender: () => void } } | null;
    groundReliefState: () => { kind: 'flat' } | { kind: 'ready'; city: string };
    formaMassingOrigin: (LatLon & { centroidEast: number; centroidNorth: number; areaM2: number }) | null;
    readSiteLocation: () => LatLon | null;
    contextBuildingsAt: LatLon | null;
    contextTreesAt: LatLon | null;
    contextTreesPrimitive: object | null;
    contextFarTierState: { features: unknown[]; lat: number; lon: number } | null;
    streetLife: { builtAt: LatLon | null; hasContent: boolean; enabled: boolean; clear: () => void };
    formaTerrainBaseHeight: number;
    loadContextTrees: ReturnType<typeof vi.fn>;
    loadStreetLife: ReturnType<typeof vi.fn>;
    buildContextFarTierPrimitive: ReturnType<typeof vi.fn>;
    // bound from the prototype
    currentContextSite: () => LatLon | null;
    reseatAnchorForCurrentSite: (layer: string, loadedAt: LatLon | null) => LatLon | null;
    rebuildContextTreesForBase: () => void;
    rebuildStreetLifeForBase: () => void;
    rebuildContextFarTierForBase: () => void;
    setStreetLifeEnabled: (on: boolean) => void;
};

function originOf(p: LatLon): Stub['formaMassingOrigin'] {
    return { ...p, centroidEast: 0, centroidNorth: 0, areaM2: 400 };
}

function makeStub(over: Partial<Stub> = {}): Stub {
    const proto = CesiumViewport.prototype as unknown as Record<string, (...a: unknown[]) => unknown>;
    const s = {
        viewer: { scene: { requestRender: () => {} } },
        groundReliefState: () => ({ kind: 'ready' as const, city: 'stub' }),
        formaMassingOrigin: originOf(SITE_A),
        readSiteLocation: () => null,
        contextBuildingsAt: { ...SITE_A },
        contextTreesAt: { ...SITE_A },
        contextTreesPrimitive: {},
        contextFarTierState: { features: [{}], lat: SITE_A.lat, lon: SITE_A.lon },
        streetLife: { builtAt: { ...SITE_A }, hasContent: true, enabled: true, clear: () => {} },
        formaTerrainBaseHeight: 161.6,
        loadContextTrees: vi.fn(async () => {}),
        loadStreetLife: vi.fn(async () => {}),
        buildContextFarTierPrimitive: vi.fn(() => {}),
        ...over,
    } as Stub;
    for (const m of [
        'currentContextSite', 'reseatAnchorForCurrentSite', 'rebuildContextTreesForBase',
        'rebuildStreetLifeForBase', 'rebuildContextFarTierForBase', 'setStreetLifeEnabled',
    ] as const) {
        (s as unknown as Record<string, unknown>)[m] = (proto[m] as (...a: unknown[]) => unknown).bind(s);
    }
    return s;
}

/** Move the site the way a parcel commit does: `renderFormaMassing` seats the origin BEFORE the
 *  terrain clamp that runs the rebuilds, and the per-layer memos still hold the OLD site. */
function commitParcelAt(s: Stub, to: LatLon): void {
    s.formaMassingOrigin = originOf(to);
}

describe('§CTX-RESEAT-ANCHOR-IS-CURRENT-SITE (L-12964) — no layer may be rebuilt at another site', () => {
    it('THE FOUNDER\'S LINE: after a site change the canopies are NOT rebuilt at the previous parcel', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const s = makeStub();                       // loaded at A
        commitParcelAt(s, SITE_B);                  // user commits the parcel at B; contextTreesAt is still A

        s.rebuildContextTreesForBase();

        // The shipped defect was `loadContextTrees(37.88507, -4.77718, true)` — the PREVIOUS site.
        expect(s.loadContextTrees).not.toHaveBeenCalled();
        expect(warn.mock.calls.some((c) => String(c[0]).includes('REFUSING to rebuild the trees layer'))).toBe(true);
    });

    it('CHANGES SITE TWICE: A → B → C, and never once bakes at a site the viewport has left', () => {
        vi.spyOn(console, 'warn').mockImplementation(() => {});
        vi.spyOn(console, 'log').mockImplementation(() => {});
        const s = makeStub();

        // ── site change 1: A → B. Every layer still remembers A.
        commitParcelAt(s, SITE_B);
        s.rebuildContextTreesForBase();
        s.rebuildStreetLifeForBase();
        s.rebuildContextFarTierForBase();
        expect(s.loadContextTrees).not.toHaveBeenCalled();
        expect(s.loadStreetLife).not.toHaveBeenCalled();
        expect(s.buildContextFarTierPrimitive).not.toHaveBeenCalled();

        // The loads for B land; every layer's memo catches up. Now a settle rebuild is legitimate.
        s.contextTreesAt = { ...SITE_B };
        s.streetLife.builtAt = { ...SITE_B };
        s.contextFarTierState = { features: [{}], lat: SITE_B.lat, lon: SITE_B.lon };
        s.rebuildContextTreesForBase();
        s.rebuildStreetLifeForBase();
        s.rebuildContextFarTierForBase();
        expect(s.loadContextTrees).toHaveBeenCalledWith(SITE_B.lat, SITE_B.lon, true);
        expect(s.loadStreetLife).toHaveBeenCalledWith(SITE_B.lat, SITE_B.lon, true);
        expect(s.buildContextFarTierPrimitive).toHaveBeenCalledTimes(1);

        // ── site change 2: B → C. The memos lag again — and are refused again.
        s.loadContextTrees.mockClear();
        s.loadStreetLife.mockClear();
        s.buildContextFarTierPrimitive.mockClear();
        commitParcelAt(s, SITE_C);
        s.rebuildContextTreesForBase();
        s.rebuildStreetLifeForBase();
        s.rebuildContextFarTierForBase();
        expect(s.loadContextTrees).not.toHaveBeenCalled();
        expect(s.loadStreetLife).not.toHaveBeenCalled();
        expect(s.buildContextFarTierPrimitive).not.toHaveBeenCalled();

        // Across BOTH changes, not one call carried a lat/lon from a site the viewport had left.
        const everyCall = [...s.loadContextTrees.mock.calls, ...s.loadStreetLife.mock.calls];
        for (const c of everyCall) expect([c[0], c[1]]).toEqual([SITE_B.lat, SITE_B.lon]);
    });

    it('on the SAME site, the rebuild still happens — the anchor is the current site, not the memo', () => {
        vi.spyOn(console, 'log').mockImplementation(() => {});
        const s = makeStub();                       // origin A, memos A
        s.rebuildContextTreesForBase();
        expect(s.loadContextTrees).toHaveBeenCalledWith(SITE_A.lat, SITE_A.lon, true);
    });

    it('L-12949 SURVIVES: at start-up the buildings are not fetched yet, and the canopies still rebuild', () => {
        // The regression this replaces was itself a fix — the canopies warm LONG before the footprints,
        // so `contextBuildingsAt` is null when the terrain settles. Deriving from the site keeps that
        // working WITHOUT depending on any memo at all.
        vi.spyOn(console, 'log').mockImplementation(() => {});
        const s = makeStub({ contextBuildingsAt: null, contextTreesAt: null });
        s.rebuildContextTreesForBase();
        expect(s.loadContextTrees).toHaveBeenCalledWith(SITE_A.lat, SITE_A.lon, true);
    });

    it('falls back to the SITE LOCATION when no massing origin is seated (pre-parcel start-up)', () => {
        vi.spyOn(console, 'log').mockImplementation(() => {});
        const s = makeStub({ formaMassingOrigin: null, readSiteLocation: () => ({ ...SITE_B }), contextTreesAt: null });
        s.rebuildContextTreesForBase();
        expect(s.loadContextTrees).toHaveBeenCalledWith(SITE_B.lat, SITE_B.lon, true);
    });

    it('refuses when there is NO current site at all — a guess is not an anchor', () => {
        const s = makeStub({ formaMassingOrigin: null, readSiteLocation: () => null });
        s.rebuildContextTreesForBase();
        expect(s.loadContextTrees).not.toHaveBeenCalled();
    });

    it('a 0,0 massing origin is not a site (the loaders reject it too) — falls through to the location', () => {
        vi.spyOn(console, 'log').mockImplementation(() => {});
        const s = makeStub({
            formaMassingOrigin: originOf({ lat: 0, lon: 0 }),
            readSiteLocation: () => ({ ...SITE_C }),
            contextTreesAt: null,
        });
        expect(s.currentContextSite()).toEqual(SITE_C);
    });

    it('tolerates a sub-tolerance drift — a re-geocode a few metres away is the SAME site', () => {
        vi.spyOn(console, 'log').mockImplementation(() => {});
        // ~22 m north of A: well inside one context bbox, and two orders of magnitude under the
        // founder's measured 1.8 km. It must NOT be read as a site change.
        const nudged = { lat: SITE_A.lat + 0.0002, lon: SITE_A.lon };
        const s = makeStub({ formaMassingOrigin: originOf(nudged) });
        s.rebuildContextTreesForBase();
        expect(s.loadContextTrees).toHaveBeenCalledWith(nudged.lat, nudged.lon, true);
    });

    it('the street-life TOGGLE builds at the current site, not at the site the footprints came from', () => {
        // `setStreetLifeEnabled(true)` read `contextBuildingsAt`, which lags a site change exactly the
        // way the rebuild memos do.
        const s = makeStub({ contextBuildingsAt: { ...SITE_A } });
        commitParcelAt(s, SITE_C);
        s.streetLife.enabled = false;
        s.setStreetLifeEnabled(true);
        expect(s.loadStreetLife).toHaveBeenCalledWith(SITE_C.lat, SITE_C.lon, true);
    });

    it('stays a no-op on flat ground and before anything is placed (unchanged pre-conditions)', () => {
        const flat = makeStub({ groundReliefState: () => ({ kind: 'flat' as const }) });
        flat.rebuildContextTreesForBase();
        flat.rebuildStreetLifeForBase();
        expect(flat.loadContextTrees).not.toHaveBeenCalled();
        expect(flat.loadStreetLife).not.toHaveBeenCalled();

        const empty = makeStub({ contextTreesPrimitive: null, streetLife: { builtAt: null, hasContent: false, enabled: true, clear: () => {} } });
        empty.rebuildContextTreesForBase();
        empty.rebuildStreetLifeForBase();
        expect(empty.loadContextTrees).not.toHaveBeenCalled();
        expect(empty.loadStreetLife).not.toHaveBeenCalled();
    });

    it('never throws into the settle pass when the reload itself throws', () => {
        vi.spyOn(console, 'warn').mockImplementation(() => {});
        vi.spyOn(console, 'log').mockImplementation(() => {});
        const s = makeStub({ loadContextTrees: vi.fn(() => { throw new Error('boom'); }) });
        expect(() => s.rebuildContextTreesForBase()).not.toThrow();
    });
});
