// §CTX-PAN-DEBOUNCE (L-402c) — unit tests for the PURE pan-driven context-REFETCH gate and a
// regression guard for the §ENVELOPE-BLANK-SCENE-FIX. No network / no Cesium here.
//
// Context: on the regressing build (commit 0ec22e1d) the paned 3D Site rendered EMPTY — no
// envelope AND no context. Two independent hardenings are locked here:
//   (1) the INITIAL context load must NEVER be suppressed by the new pan cooldown — only
//       REPEAT pan-refetches are debounced/cooled (`shouldRefetchContextOnPan`);
//   (2) the buildable-envelope top-ring polyline must not use a DASH material as its
//       `depthFailMaterial` (that construct throws inside scene.render() and blanks the
//       whole viewer — the root cause of the empty 3D Site).

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
    shouldRefetchContextOnPan,
    CONTEXT_PAN_FARRING_RADIUS_M,
    CONTEXT_PAN_COOLDOWN_MS,
} from '../src/ui/geospatial/contextBuildings';

// A Barcelona-ish site origin. Distances below are chosen relative to the far-ring radius.
const ORIGIN = { lat: 41.39, lon: 2.17 };
// ~2 km north of the origin (well outside the ~1.5 km far ring): 2000 m / 111_320 ≈ 0.018°.
const FAR_LAT = ORIGIN.lat + 0.018;
// ~200 m north (inside the far ring): 200 / 111_320 ≈ 0.0018°.
const NEAR_LAT = ORIGIN.lat + 0.0018;

describe('§CTX-PAN-DEBOUNCE shouldRefetchContextOnPan', () => {
    it('does NOT gate the INITIAL load: first frame (lastLoadAtMs=0) after leaving the ring refetches', () => {
        // The initial load is a direct call, but this proves the cooldown (nowMs - 0) can never
        // block once the camera has genuinely left the loaded area — no stale suppression.
        expect(
            shouldRefetchContextOnPan({
                camLat: FAR_LAT, camLon: ORIGIN.lon, camHeightM: 800,
                anchor: ORIGIN, hasContextLayer: true,
                nowMs: 1_000_000, lastLoadAtMs: 0,
            }),
        ).toBe(true);
    });

    it('returns false when the context layer is inactive (feature off for this view)', () => {
        expect(
            shouldRefetchContextOnPan({
                camLat: FAR_LAT, camLon: ORIGIN.lon, camHeightM: 800,
                anchor: ORIGIN, hasContextLayer: false,
                nowMs: 1_000_000, lastLoadAtMs: 0,
            }),
        ).toBe(false);
    });

    it('returns false when the camera is high above the city (bbox meaningless)', () => {
        expect(
            shouldRefetchContextOnPan({
                camLat: FAR_LAT, camLon: ORIGIN.lon, camHeightM: 9000,
                anchor: ORIGIN, hasContextLayer: true,
                nowMs: 1_000_000, lastLoadAtMs: 0,
            }),
        ).toBe(false);
    });

    it('returns false while still INSIDE the loaded far ring (small pan around the plot)', () => {
        expect(
            shouldRefetchContextOnPan({
                camLat: NEAR_LAT, camLon: ORIGIN.lon, camHeightM: 800,
                anchor: ORIGIN, hasContextLayer: true,
                nowMs: 1_000_000, lastLoadAtMs: 0,
            }),
        ).toBe(false);
    });

    it('returns false within the cooldown window even after leaving the ring', () => {
        expect(
            shouldRefetchContextOnPan({
                camLat: FAR_LAT, camLon: ORIGIN.lon, camHeightM: 800,
                anchor: ORIGIN, hasContextLayer: true,
                nowMs: 1_000_000, lastLoadAtMs: 1_000_000 - (CONTEXT_PAN_COOLDOWN_MS - 1),
            }),
        ).toBe(false);
    });

    it('returns true once past the cooldown AND outside the far ring', () => {
        expect(
            shouldRefetchContextOnPan({
                camLat: FAR_LAT, camLon: ORIGIN.lon, camHeightM: 800,
                anchor: ORIGIN, hasContextLayer: true,
                nowMs: 1_000_000, lastLoadAtMs: 1_000_000 - (CONTEXT_PAN_COOLDOWN_MS + 1),
            }),
        ).toBe(true);
    });

    it('returns false for a non-finite camera position (bad frame)', () => {
        expect(
            shouldRefetchContextOnPan({
                camLat: Number.NaN, camLon: ORIGIN.lon, camHeightM: 800,
                anchor: ORIGIN, hasContextLayer: true,
                nowMs: 1_000_000, lastLoadAtMs: 0,
            }),
        ).toBe(false);
    });

    it('uses the whole far-ring radius as the "left the area" threshold (~1.5 km)', () => {
        expect(CONTEXT_PAN_FARRING_RADIUS_M).toBeGreaterThanOrEqual(1400);
        // A point exactly at the radius (+1 m) is treated as OUTSIDE → refetch (past cooldown).
        const dLat = (CONTEXT_PAN_FARRING_RADIUS_M + 50) / 111_320;
        expect(
            shouldRefetchContextOnPan({
                camLat: ORIGIN.lat + dLat, camLon: ORIGIN.lon, camHeightM: 500,
                anchor: ORIGIN, hasContextLayer: true,
                nowMs: 1_000_000, lastLoadAtMs: 0,
            }),
        ).toBe(true);
    });
});

describe('§ENVELOPE-BLANK-SCENE-FIX regression guard', () => {
    const src = readFileSync(
        fileURLToPath(new URL('../src/ui/geospatial/CesiumViewport.ts', import.meta.url)),
        'utf8',
    );

    it('does NOT use a Dash material as a polyline depthFailMaterial (that throws in scene.render → blank viewer)', () => {
        // A dash material as depthFail is the one polyline depth-fail material that fails during
        // the render pass in this Cesium build. Match the exact regressing construct: a
        // `depthFailMaterial:` immediately assigned a `new Cesium.PolylineDashMaterialProperty`.
        const dashDepthFail = /depthFailMaterial\s*:\s*new\s+Cesium\.PolylineDashMaterialProperty/;
        expect(dashDepthFail.test(src)).toBe(false);
    });

    it('§ENVELOPE-VIA-MASSING — renders the envelope through the massing entity path (no separate fragile polyline)', () => {
        // The founder's architectural fix (L-402d): the buildable envelope is ONE MORE
        // massing volume — a single translucent #6600FF extruded polygon built exactly like
        // the storey-band massing prisms and pushed to the SAME `formaMassingEntities`
        // lifecycle. The old separate depth-fail TOP-RING POLYLINE (the L-402c crash source
        // and the one-off render path) is DELETED, so no bespoke polyline can take down the
        // render loop or leave the envelope on a path that renders nothing.
        expect(src).toContain("name: 'pryzm-forma-buildable-envelope'");
        // The fragile top-ring polyline is gone entirely (the only envelope-specific
        // polyline / depth-fail construct — other climate polylines legitimately keep
        // their own depthFailMaterial, so we scope this to the envelope block).
        expect(src).not.toContain('pryzm-forma-buildable-envelope-top');
        // The envelope block (from its entity name to the diagnostic log) is a single
        // extruded polygon on the massing lifecycle, with NO polyline / depth-fail.
        const envStart = src.indexOf("name: 'pryzm-forma-buildable-envelope'");
        const envBlock = src.slice(envStart, envStart + 1200);
        expect(envBlock).toMatch(/extrudedHeight:\s*envTop/);
        expect(envBlock).toContain('this.formaMassingEntities.push(ent)');
        expect(envBlock).not.toContain('polyline');
        expect(envBlock).not.toContain('depthFailMaterial');
    });

    it('guards the parcel→lon/lat projection so a failure cannot abort the whole render pass', () => {
        // The committedParcelLonLat projection runs before the envelope + massing; it must be
        // wrapped so a degenerate cartesian cannot blank the site.
        expect(src).toContain('plot-clear disabled');
        expect(src).toContain('this.committedParcelLonLat = null;');
    });
});
