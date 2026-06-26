// §SITE-PLAN-OVERLAY — pure-helper tests (node env, no DOM/MapLibre/THREE).
//
// Covers the three load-bearing pure modules the prompt calls out:
//   1. 2-point calibration → metres-per-pixel scale factor (+ degenerate guards)
//   2. overlay transform compose → map corners (+ round-trip projection)
//   3. persistence (de)serialise round-trip (+ corrupt/version rejection)
//   4. raster size-cap (the link-then-crash fix — both dimensions, aspect-preserving)

import { describe, it, expect } from 'vitest';
import {
    computeCalibrationScale,
    defaultOverlayTransform,
    overlayCornersEastNorth,
    overlayCornerLatLons,
    latLonToEastNorth,
    eastNorthToLatLon,
    translateOverlay,
    setOverlayRotation,
    scaleOverlay,
    applyCalibration,
    type SitePlanOverlayTransform,
} from '../src/ui/site/overlay/sitePlanOverlayGeometry';
import {
    serializeOverlay,
    deserializeOverlay,
    SITE_OVERLAY_SCHEMA_VERSION,
} from '../src/ui/site/overlay/sitePlanOverlayPersistence';
import { computeCappedSize, exceedsSafeSize, SAFE_MAX_TEXTURE_DIM } from '../src/ui/site/overlay/rasterSizeCap';

// ── 1. 2-point calibration ──────────────────────────────────────────────────
describe('computeCalibrationScale', () => {
    it('returns metres-per-pixel = realDistance / pixelDistance', () => {
        // 100px apart, known 10 m → 0.1 m/px
        const mpp = computeCalibrationScale({ x: 0, y: 0 }, { x: 100, y: 0 }, 10);
        expect(mpp).toBeCloseTo(0.1, 9);
    });

    it('uses Euclidean pixel distance (diagonal)', () => {
        // 3-4-5 triangle → 5px; 2.5 m → 0.5 m/px
        const mpp = computeCalibrationScale({ x: 0, y: 0 }, { x: 3, y: 4 }, 2.5);
        expect(mpp).toBeCloseTo(0.5, 9);
    });

    it('rejects coincident points', () => {
        expect(computeCalibrationScale({ x: 5, y: 5 }, { x: 5, y: 5 }, 10)).toBeNull();
    });

    it('rejects non-positive / non-finite real distance', () => {
        expect(computeCalibrationScale({ x: 0, y: 0 }, { x: 100, y: 0 }, 0)).toBeNull();
        expect(computeCalibrationScale({ x: 0, y: 0 }, { x: 100, y: 0 }, -3)).toBeNull();
        expect(computeCalibrationScale({ x: 0, y: 0 }, { x: 100, y: 0 }, NaN)).toBeNull();
    });
});

// ── 2. transform compose → corners ──────────────────────────────────────────
describe('overlay transform compose', () => {
    const t: SitePlanOverlayTransform = {
        centre: { east: 0, north: 0 },
        metresPerPixel: 0.1, // 1000px wide → 100 m
        rotationRad: 0,
        widthPx: 1000,
        heightPx: 500, // → 50 m tall
    };

    it('produces TL,TR,BR,BL corners with image-top = +North', () => {
        const c = overlayCornersEastNorth(t);
        expect(c).toHaveLength(4);
        const [tl, tr, br, bl] = c;
        // width 100 m → ±50 E; height 50 m → ±25 N
        expect(tl).toMatchObject({ east: expect.closeTo(-50, 6), north: expect.closeTo(25, 6) });
        expect(tr).toMatchObject({ east: expect.closeTo(50, 6), north: expect.closeTo(25, 6) });
        expect(br).toMatchObject({ east: expect.closeTo(50, 6), north: expect.closeTo(-25, 6) });
        expect(bl).toMatchObject({ east: expect.closeTo(-50, 6), north: expect.closeTo(-25, 6) });
    });

    it('90° clockwise rotation maps the top edge to the +East side', () => {
        const r = setOverlayRotation(t, Math.PI / 2);
        const c = overlayCornersEastNorth(r);
        // TL local (−50,+25) rotated CW 90°: E' = E·cos+N·sin = 25, N' = −E·sin+N·cos = 50
        expect(c[0]).toMatchObject({ east: expect.closeTo(25, 6), north: expect.closeTo(50, 6) });
    });

    it('translate moves the centre and all corners equally', () => {
        const m = translateOverlay(t, 10, -5);
        const c = overlayCornersEastNorth(m);
        expect(c[0]).toMatchObject({ east: expect.closeTo(-40, 6), north: expect.closeTo(20, 6) });
    });

    it('scaleOverlay multiplies metres-per-pixel (real-world size)', () => {
        const s = scaleOverlay(t, 2);
        expect(s.metresPerPixel).toBeCloseTo(0.2, 9);
        const c = overlayCornersEastNorth(s);
        expect(c[1].east).toBeCloseTo(100, 6); // 200 m wide → +100 E
    });

    it('applyCalibration is a no-op on a bad scale, sets it otherwise', () => {
        expect(applyCalibration(t, 0).metresPerPixel).toBe(t.metresPerPixel);
        expect(applyCalibration(t, -1).metresPerPixel).toBe(t.metresPerPixel);
        expect(applyCalibration(t, 0.25).metresPerPixel).toBe(0.25);
    });
});

describe('projection round-trip', () => {
    it('latLon ↔ eastNorth is invertible about an origin', () => {
        const origin = { lat: 51.5074, lon: -0.1278 }; // London
        const en = latLonToEastNorth({ lat: 51.508, lon: -0.127 }, origin.lat, origin.lon);
        const back = eastNorthToLatLon(en, origin.lat, origin.lon);
        expect(back.lat).toBeCloseTo(51.508, 9);
        expect(back.lon).toBeCloseTo(-0.127, 9);
    });

    it('overlayCornerLatLons returns 4 finite lat/lons', () => {
        const t = defaultOverlayTransform(1200, 800);
        const lls = overlayCornerLatLons(t, 51.5, -0.12);
        expect(lls).toHaveLength(4);
        for (const ll of lls) {
            expect(Number.isFinite(ll.lat)).toBe(true);
            expect(Number.isFinite(ll.lon)).toBe(true);
        }
    });
});

describe('defaultOverlayTransform', () => {
    it('fits the longest side to the target span', () => {
        const t = defaultOverlayTransform(2000, 1000, 50);
        expect(t.metresPerPixel).toBeCloseTo(50 / 2000, 9); // longest side = 2000px → 50 m
        expect(t.centre).toEqual({ east: 0, north: 0 });
        expect(t.rotationRad).toBe(0);
    });
});

// ── 3. persistence round-trip ───────────────────────────────────────────────
describe('overlay persistence (de)serialise', () => {
    const draft = {
        fileName: 'survey.pdf',
        sourceKind: 'pdf' as const,
        imageDataUrl: 'data:image/png;base64,AAAA',
        page: 2,
        originLat: 51.5,
        originLon: -0.12,
        transform: defaultOverlayTransform(1000, 700),
        opacity: 0.6,
        locked: true,
        visible: true,
        calibrated: true,
    };

    it('round-trips a record losslessly', () => {
        const rec = serializeOverlay(draft, new Date('2026-06-26T00:00:00Z'));
        const json = JSON.stringify(rec);
        const back = deserializeOverlay(json);
        expect(back).not.toBeNull();
        expect(back!.fileName).toBe('survey.pdf');
        expect(back!.page).toBe(2);
        expect(back!.opacity).toBeCloseTo(0.6, 9);
        expect(back!.locked).toBe(true);
        expect(back!.calibrated).toBe(true);
        expect(back!.transform.widthPx).toBe(1000);
        expect(back!.transform.metresPerPixel).toBeCloseTo(draft.transform.metresPerPixel, 9);
        expect(back!.schemaVersion).toBe(SITE_OVERLAY_SCHEMA_VERSION);
    });

    it('clamps opacity into [0,1] on serialise', () => {
        const rec = serializeOverlay({ ...draft, opacity: 5 });
        expect(rec.opacity).toBe(1);
    });

    it('rejects corrupt JSON', () => {
        expect(deserializeOverlay('not json')).toBeNull();
    });

    it('rejects a wrong/absent schema version', () => {
        const rec = serializeOverlay(draft);
        const bad = JSON.stringify({ ...rec, schemaVersion: 999 });
        expect(deserializeOverlay(bad)).toBeNull();
    });

    it('rejects a record missing the image', () => {
        const rec = serializeOverlay(draft);
        const bad = JSON.stringify({ ...rec, imageDataUrl: '' });
        expect(deserializeOverlay(bad)).toBeNull();
    });

    it('rejects an invalid transform (non-positive scale)', () => {
        const rec = serializeOverlay(draft);
        const bad = JSON.stringify({ ...rec, transform: { ...rec.transform, metresPerPixel: 0 } });
        expect(deserializeOverlay(bad)).toBeNull();
    });
});

// ── 4. raster size cap (crash fix) ──────────────────────────────────────────
describe('computeCappedSize', () => {
    it('passes through a source within the cap', () => {
        const r = computeCappedSize({ srcWidth: 1500, srcHeight: 1000 });
        expect(r.capped).toBe(false);
        expect(r).toMatchObject({ width: 1500, height: 1000, scale: 1 });
    });

    it('downscales a TALL source so HEIGHT fits the cap (the crash case)', () => {
        // 1500 × 50000 — the legacy uncapped-height bug. Must shrink to ≤ cap on both axes.
        const r = computeCappedSize({ srcWidth: 1500, srcHeight: 50000 });
        expect(r.capped).toBe(true);
        expect(Math.max(r.width, r.height)).toBeLessThanOrEqual(SAFE_MAX_TEXTURE_DIM);
        // aspect preserved
        expect(r.width / r.height).toBeCloseTo(1500 / 50000, 4);
        expect(r.height).toBe(SAFE_MAX_TEXTURE_DIM);
    });

    it('downscales a WIDE source so WIDTH fits the cap', () => {
        const r = computeCappedSize({ srcWidth: 20000, srcHeight: 800 });
        expect(r.capped).toBe(true);
        expect(r.width).toBe(SAFE_MAX_TEXTURE_DIM);
        expect(Math.max(r.width, r.height)).toBeLessThanOrEqual(SAFE_MAX_TEXTURE_DIM);
    });

    it('honours a smaller device cap when reported', () => {
        const r = computeCappedSize({ srcWidth: 6000, srcHeight: 3000, deviceMaxDim: 2048 });
        expect(r.width).toBe(2048);
        expect(Math.max(r.width, r.height)).toBeLessThanOrEqual(2048);
    });

    it('collapses degenerate input to 1×1 rather than throwing', () => {
        const r = computeCappedSize({ srcWidth: 0, srcHeight: -5 });
        expect(r.width).toBeGreaterThanOrEqual(1);
        expect(r.height).toBeGreaterThanOrEqual(1);
    });

    it('exceedsSafeSize flags an over-cap source', () => {
        expect(exceedsSafeSize({ srcWidth: 1500, srcHeight: 50000 })).toBe(true);
        expect(exceedsSafeSize({ srcWidth: 1500, srcHeight: 1000 })).toBe(false);
    });
});
