// §SITE-FRAMING-EXTENT (founder 2026-08-07) — "2D GIS view is TOO ZOOMED OUT — and the 3D Site is
// TOO ZOOMED IN. They need to be COHERENT."
//
// The load-bearing assertion in this file is the REJECTION of an administrative bbox. Everything
// else follows from it: the 2D pane was fitting the Nominatim bbox for "Barcelona", which is the
// municipality, while the 3D pane fitted a 7-metre building sphere. Neither was framing the site.
// DOM-free — no MapLibre, no Cesium.

import { describe, it, expect } from 'vitest';
import {
    resolveSiteFramingExtent,
    altitudeForHalfSpan,
    SITE_FRAMING_HALF_M,
    SITE_FRAMING_MAX_HALF_M,
    SITE_FRAMING_MIN_HALF_M,
} from '../src/ui/site/siteFramingExtent';

const BARCELONA = { lat: 41.3888, lon: 2.159 };
/** The real Nominatim bbox for the municipality of Barcelona — ~20 km across. */
const MUNICIPALITY_BBOX = [2.0524, 41.3170, 2.2280, 41.4680] as const;
/** A house-level geocode bbox — a few tens of metres. */
const HOUSE_BBOX = [2.1588, 41.3886, 2.1592, 41.389] as const;

const spanM = (e: { bbox: readonly [number, number, number, number] }): number =>
    (e.bbox[3] - e.bbox[1]) * 111_320;

describe('§SITE-FRAMING-EXTENT — a municipality is not a site', () => {
    it('REJECTS a municipality bbox and frames the site scale about the ANCHOR', () => {
        const e = resolveSiteFramingExtent({ anchor: BARCELONA, geocodeBbox: MUNICIPALITY_BBOX });
        expect(e.source).toBe('default');
        expect(e.halfSpanM).toBe(SITE_FRAMING_HALF_M);
        // ⚠ Centred on what the user TYPED, not on the municipality centroid — which for
        // Barcelona is over a kilometre from this address.
        expect(e.centreLat).toBe(BARCELONA.lat);
        expect(e.centreLon).toBe(BARCELONA.lon);
    });

    it('the rejected framing is ~three orders of magnitude tighter than the raw bbox', () => {
        const raw = (MUNICIPALITY_BBOX[3] - MUNICIPALITY_BBOX[1]) * 111_320;
        const e = resolveSiteFramingExtent({ anchor: BARCELONA, geocodeBbox: MUNICIPALITY_BBOX });
        expect(raw).toBeGreaterThan(15_000);
        expect(spanM(e)).toBeLessThan(1_000);
    });

    it('KEEPS a geocode bbox that is genuinely site-scale', () => {
        const e = resolveSiteFramingExtent({ anchor: BARCELONA, geocodeBbox: HOUSE_BBOX });
        expect(e.source).toBe('geocode-bbox');
        // Widened to the legibility floor — a site is never framed at its own bare size.
        expect(e.halfSpanM).toBe(SITE_FRAMING_MIN_HALF_M);
    });

    it('prefers a COMMITTED BOUNDARY over any geocode bbox — it IS the site', () => {
        const ring = [
            { lat: 41.3886, lon: 2.1588 }, { lat: 41.3886, lon: 2.1594 },
            { lat: 41.389, lon: 2.1594 }, { lat: 41.389, lon: 2.1588 },
        ];
        const e = resolveSiteFramingExtent({ anchor: BARCELONA, boundary: ring, geocodeBbox: MUNICIPALITY_BBOX });
        expect(e.source).toBe('boundary');
        expect(e.centreLat).toBeCloseTo(41.3888, 4);
    });

    it('frames a LONG THIN plot by its larger axis, so nothing is cropped', () => {
        const ring = [
            { lat: 41.3880, lon: 2.1588 }, { lat: 41.3880, lon: 2.1590 },
            { lat: 41.3920, lon: 2.1590 }, { lat: 41.3920, lon: 2.1588 },
        ];
        const e = resolveSiteFramingExtent({ anchor: BARCELONA, boundary: ring });
        // ~445 m north-south; the extent must cover it, not the 17 m east-west axis.
        expect(e.halfSpanM).toBeGreaterThan(200);
    });

    it('never frames tighter than the legibility floor, nor wider than a site', () => {
        const tiny = [
            { lat: 41.38880, lon: 2.15900 }, { lat: 41.38881, lon: 2.15901 },
            { lat: 41.38882, lon: 2.15900 },
        ];
        expect(resolveSiteFramingExtent({ anchor: BARCELONA, boundary: tiny }).halfSpanM)
            .toBe(SITE_FRAMING_MIN_HALF_M);
        const huge = [
            { lat: 41.20, lon: 2.00 }, { lat: 41.60, lon: 2.00 }, { lat: 41.60, lon: 2.40 },
        ];
        expect(resolveSiteFramingExtent({ anchor: BARCELONA, boundary: huge }).halfSpanM)
            .toBe(SITE_FRAMING_MAX_HALF_M);
    });

    it('is TOTAL — a surface that cannot frame renders nothing, so every input yields an extent', () => {
        for (const bad of [
            { anchor: { lat: NaN, lon: NaN } },
            { anchor: BARCELONA, boundary: [] },
            { anchor: BARCELONA, geocodeBbox: [NaN, NaN, NaN, NaN] as const },
            { anchor: BARCELONA, boundary: null, geocodeBbox: null },
        ]) {
            const e = resolveSiteFramingExtent(bad);
            expect(Number.isFinite(e.halfSpanM)).toBe(true);
            expect(e.halfSpanM).toBeGreaterThan(0);
            expect(e.bbox.every((n) => Number.isFinite(n))).toBe(true);
        }
    });

    it('produces a metrically SQUARE extent — degrees are not square at 41° north', () => {
        const e = resolveSiteFramingExtent({ anchor: BARCELONA });
        const nsM = (e.bbox[3] - e.bbox[1]) * 111_320;
        const ewM = (e.bbox[2] - e.bbox[0]) * 111_320 * Math.cos((BARCELONA.lat * Math.PI) / 180);
        expect(ewM / nsM).toBeCloseTo(1, 1);
    });
});

describe('§SITE-FRAMING-EXTENT — the 3D camera derives from the SAME extent', () => {
    it('turns a site half-span into an altitude that frames it', () => {
        // 250 m of ground each way at Cesium's default 60° vertical FOV.
        expect(altitudeForHalfSpan(250, 60)).toBeCloseTo(250 / Math.tan(Math.PI / 6), 0);
    });

    it('is monotonic — a wider site is always framed from further out', () => {
        expect(altitudeForHalfSpan(500)).toBeGreaterThan(altitudeForHalfSpan(250));
    });

    it('puts the panes in the SAME ballpark, which is the whole point', () => {
        // The founder saw 2D at tens of km against 3D at 20 m range. Both panes now derive from
        // one extent, so the 3D altitude must be commensurate with the 2D span — not 1000× off.
        const e = resolveSiteFramingExtent({ anchor: BARCELONA, geocodeBbox: MUNICIPALITY_BBOX });
        const alt = altitudeForHalfSpan(e.halfSpanM);
        expect(alt).toBeGreaterThan(e.halfSpanM * 0.5);
        expect(alt).toBeLessThan(e.halfSpanM * 4);
    });
});
