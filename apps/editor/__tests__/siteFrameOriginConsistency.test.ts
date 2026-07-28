// §SEAM-2 INCREMENT 2 (L-604 / C12 §1.5) — THE ORIGIN-CONSISTENCY INVARIANT.
//
// The θ write≠read fix (commit 4a0e9f68) squared the parcel's bearing; a *translation* shift
// remained intermittently on Barcelona parcel select. Root cause: the parcel ring was projected
// about the geocoded STORE LOCATION while the 3D-Site render built its ENU frame about the LTP-ENU
// origin — TWO competing origin authorities (C12 §1.5, L-604). They coincide until a boundary is
// committed, after which `setLtpOriginIfSafe` FREEZES the LTP origin (C19 §1.3 boundary-shift guard)
// while the store location keeps moving on any later geocode — so a "geocode → commit → re-geocode →
// Redraw → re-select" flow projected the ring about the new store location while the frame stayed at
// the frozen LTP origin, sliding the parcel by dist(store, LTP).
//
// The fix routes BOTH the projection origin (`getSiteOrigin`) and the render-frame origin
// (`getFormaOrigin`) through ONE pure precedence — `resolveSiteFrameOrigin`. These tests pin the
// invariant that makes the shift unreachable: given the SAME three candidate sources, write and read
// resolve the IDENTICAL origin, and the LTP-ENU origin is authoritative whenever it is set.

import { describe, it, expect } from 'vitest';
import {
    resolveSiteFrameOrigin,
    parcelFrameOrigin,
    buildBoundaryFromLatLonRing,
    type LatLon,
} from '../src/ui/site/boundaryProjection';

type Ltp = { lat: number; lon: number } | null;
type StoreLoc = { latitude: number; longitude: number } | null;
type Geo = { lat: number; lon: number } | null;

describe('§SEAM-2 (L-604) resolveSiteFrameOrigin — single origin authority', () => {
    it('THE FIX: the LTP-ENU origin WINS over a moved store location (no translation shift)', () => {
        // The residual-shift scenario. The LTP origin is frozen at the parcel it was pinned to (A)
        // while a later geocode moved the store location to B. BEFORE the fix the ring projected
        // about B and the frame about A → a dist(A,B) slide. Now BOTH read this, and this returns A,
        // so the ring and the ENU frame share one origin.
        const A: Ltp = { lat: 41.3910, lon: 2.1650 };
        const B: StoreLoc = { latitude: 41.4020, longitude: 2.1770 }; // ~1.5 km away
        expect(resolveSiteFrameOrigin(A, B, null)).toEqual({ lat: A.lat, lon: A.lon });
    });

    it('WRITE and READ resolve the IDENTICAL origin for the same sources (cannot diverge)', () => {
        // `getSiteOrigin` (write) reads store.getSite().location; `getFormaOrigin` (read) reads
        // store.getLocation() — the SAME location object, just two accessors. Prove that identical
        // {lat,lon} inputs collapse to one answer regardless of which side asks.
        const cases: Array<[Ltp, StoreLoc, Geo]> = [
            [{ lat: 41.39, lon: 2.16 }, { latitude: 41.40, longitude: 2.17 }, { lat: 41.41, lon: 2.18 }],
            [null, { latitude: 55.68, longitude: 12.57 }, { lat: 55.69, lon: 12.58 }],
            [null, null, { lat: -33.86, lon: 151.20 }],
            [{ lat: 48.85, lon: 2.35 }, null, null],
        ];
        for (const [ltp, store, geo] of cases) {
            const write = resolveSiteFrameOrigin(ltp, store, geo);
            const read = resolveSiteFrameOrigin(ltp, store, geo);
            expect(write).toEqual(read);
        }
    });

    it('PRE-BOUNDARY is unchanged: no LTP yet → the store location is used (byte-identical behaviour)', () => {
        // Before any boundary is committed the LTP origin is unset and the store location IS the
        // frame — the pre-fix behaviour. The fix must not perturb it.
        expect(resolveSiteFrameOrigin(null, { latitude: 41.39, longitude: 2.16 }, null))
            .toEqual({ lat: 41.39, lon: 2.16 });
    });

    it('falls back to the last geocode frame when neither LTP nor store is set', () => {
        expect(resolveSiteFrameOrigin(null, null, { lat: 41.39, lon: 2.16 }))
            .toEqual({ lat: 41.39, lon: 2.16 });
    });

    it('treats a 0/0 Null-Island placeholder as UNSET at every tier', () => {
        // `ensureSite` seeds location 0/0; it must never be framed as a real origin.
        expect(resolveSiteFrameOrigin({ lat: 0, lon: 0 }, { latitude: 41.39, longitude: 2.16 }, null))
            .toEqual({ lat: 41.39, lon: 2.16 });
        expect(resolveSiteFrameOrigin({ lat: 0, lon: 0 }, { latitude: 0, longitude: 0 }, { lat: 41.39, lon: 2.16 }))
            .toEqual({ lat: 41.39, lon: 2.16 });
        expect(resolveSiteFrameOrigin(null, { latitude: 0, longitude: 0 }, null)).toBeNull();
        expect(resolveSiteFrameOrigin(null, null, null)).toBeNull();
    });

    it('is θ-INDEPENDENT — it resolves only the translation origin, never a bearing', () => {
        // The function takes no angle and returns only {lat,lon}: it can neither read nor apply θ, so
        // it cannot reintroduce the write≠read rotation the earlier fix closed. Guard the contract.
        const out = resolveSiteFrameOrigin({ lat: 41.39, lon: 2.16 }, null, null);
        expect(out).toEqual({ lat: 41.39, lon: 2.16 });
        expect(Object.keys(out ?? {}).sort()).toEqual(['lat', 'lon']);
    });
});

// §L-635 (C57 §1.3 / §4, C19 §1.3, C12 §1.5) — ORIGIN-ON-PARCEL. A parcel-boundary commit MUST
// project the ring about the parcel's OWN first vertex so the ring lands at world origin and the
// always-on project-origin datum sphere (pinned at world 0,0,0) sits ON the boundary — regardless of
// any prior/geocoded site anchor that may be hundreds of km away.
describe('§L-635 parcelFrameOrigin — datum sits on the parcel boundary', () => {
    // A ~35 m Barcelona parcel (Eixample), far from lat/lon (0,0).
    const RING: LatLon[] = [
        { lat: 41.39100, lon: 2.16500 },
        { lat: 41.39130, lon: 2.16540 },
        { lat: 41.39110, lon: 2.16575 },
        { lat: 41.39080, lon: 2.16535 },
    ];

    it('returns the parcel FIRST VERTEX (a point ON the boundary), never a centroid or anchor', () => {
        expect(parcelFrameOrigin(RING)).toEqual({ lat: RING[0]!.lat, lon: RING[0]!.lon });
        expect(parcelFrameOrigin([])).toBeNull();
    });

    it('projecting about that origin lands the first vertex at scene (0,0) — datum ON the boundary', () => {
        const o = parcelFrameOrigin(RING)!;
        const built = buildBoundaryFromLatLonRing(RING, o.lat, o.lon);
        // Vertex 0 is the projection origin ⇒ exactly (0,0): the world-origin datum sits on it.
        expect(Math.hypot(built.polygon[0]!.x, built.polygon[0]!.z)).toBeLessThan(1e-6);
        // The ENTIRE ring stays at parcel scale (tens of metres) from origin — not the hundreds of km
        // the stale-anchor regression produced.
        const maxDist = Math.max(...built.polygon.map((p) => Math.hypot(p.x, p.z)));
        expect(maxDist).toBeLessThan(200);
    });

    it('THE REGRESSION: projecting a far parcel about a STALE anchor lands it hundreds of km away', () => {
        // Barcelona parcel, but projected about a Sydney anchor (the old `fromSite` precedence). This is
        // the off-datum failure the fix removes by refusing to use any anchor but the parcel itself.
        const staleAnchor = { lat: -33.8688, lon: 151.2093 };
        const built = buildBoundaryFromLatLonRing(RING, staleAnchor.lat, staleAnchor.lon);
        const maxDist = Math.max(...built.polygon.map((p) => Math.hypot(p.x, p.z)));
        expect(maxDist).toBeGreaterThan(1_000_000); // > 1000 km from origin — datum off the plot.
    });
});
