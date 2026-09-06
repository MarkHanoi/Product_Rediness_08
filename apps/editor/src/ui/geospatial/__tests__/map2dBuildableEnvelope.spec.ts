// ─────────────────────────────────────────────────────────────────────────────────────────────
// §MAP2D-ENVELOPE (STR-RESIDENTIAL-DESIGN-ORCHESTRATOR §26.4 · C58 §1.14/§1.17) — the buildable
// envelope on the 2D site map, pinned.
//
// THE FOUNDER'S REPORT (§26.4, 2026-09-06):
//   "the envelope renders great on pryzm view — but on 3d site vie not on 2d map view"
//
// Two things can go wrong here, they fail in COMPLETELY different ways, and this file pins both.
//
//   ARM A — THE FRAME. `MassingSolid.ring` is scene-XZ METRES in the PROJECT-north frame, not
//     lon/lat. A wrong conversion does NOT throw and does NOT render blank: it draws a
//     correctly-shaped, correctly-sized purple footprint on the WRONG LAND. On a θ = 0 site
//     (Denmark, most of Germany) three DIFFERENT wrong conversions are indistinguishable from
//     the right one, so a test that only exercises θ = 0 certifies all of them. Every arm below
//     therefore runs at a NON-ZERO θ, and each one is accompanied by its own falsifier — the
//     §PARCEL-SHADE-NOT-MIRRORED (L-10740) lesson, whose live probe printed
//     "FRAME VERDICT: CONSISTENT" on the very session the founder was looking at a mirrored
//     shade, because its single criterion had no term for a mirror.
//
//     The reference this arm measures AGAINST is not re-derived here either. `siteDispatch`'s
//     `resolveDkByggefeltPlacement` already carries the FORWARD map (`toAuthoringFrame`:
//     lat/lon → project-frame XZ) for the Danish byggefelt round-trip, written independently
//     and in production. This map's job is to be its EXACT INVERSE. Composing the two and
//     demanding the identity is a real, falsifiable claim about two independently-authored
//     pipelines, which is worth strictly more than asserting my own arithmetic back to itself.
//
//   ARM B — REACHABILITY. The defect §26.4 reports is not a broken renderer, it is a renderer
//     that was never asked. Two specific ways this feature can be authored-but-unreachable, both
//     silent, both invisible to a type-checker:
//       1. registering the source/layers ANYWHERE BUT `installRingLayers` — `swapBasemap` calls
//          `map.setStyle(style, {diff:false})`, which wipes every added source and layer, and
//          `installRingLayers` is what the `style.load` handler re-runs. A layer added elsewhere
//          works perfectly until the user first presses "Satellite", then never again;
//       2. pushing the payload from inside `liveUpdateFormaMassing`, which returns early at
//          `if (!cesiumViewport?.renderFormaMassing) return;` and again at
//          `if (formaViewMode === 'map2d' && !site3dPaned) return;` — i.e. precisely when the 2D
//          map is the only surface on screen. That wiring would look live in review and would
//          reproduce the founder's exact report.
//     Neither is expressible as a unit test of a pure function (the subjects are inside
//     `mountSiteBoundaryMap2D`'s closure and behind MapLibre), so they are asserted against the
//     SOURCE — the same instrument `siteMap2DStyleV2.spec.ts` ARM 2 uses on this same file.
//
// Discovered by the ROOT vitest config's `apps/editor/src/ui/geospatial/__tests__/**/*.spec.ts`
// pattern, which is already present — verified before this file was written, because this repo's
// include list is an ALLOWLIST and "never ran" and "passed" print the same value (§L-851).
//   npx vitest run apps/editor/src/ui/geospatial/__tests__/map2dBuildableEnvelope.spec.ts
// ─────────────────────────────────────────────────────────────────────────────────────────────
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

import { describe, expect, it } from 'vitest';

import { latLonToSceneXZ, sceneXZToLatLon, type LatLon, type XZPoint } from '../../site/boundaryProjection';
import { trueVectorToProjectNorth } from '../../site/overlay/projectTrueNorth';
import { sceneXZToEnu } from '../sceneEnuFrame';

// Barcelona's real Eixample rotation — the θ every frame defect in this family was found on.
const THETA = (45 * Math.PI) / 180;
const ORIGIN = { lat: 41.3874, lon: 2.1686 };

/**
 * ⭐ THE CONVERSION UNDER TEST, transcribed from `SiteBoundaryMap2D.envelopeFeatureCollection`.
 * Two lines, both of them existing tested helpers, in this order and no other.
 */
function envelopeXzToLatLon(p: XZPoint, thetaRad: number, origin: LatLon): LatLon {
    const { east, north } = sceneXZToEnu(p.x, p.z, thetaRad);
    return sceneXZToLatLon({ x: east, z: -north }, origin.lat, origin.lon);
}

/**
 * THE INDEPENDENT REFERENCE — `siteDispatch.resolveDkByggefeltPlacement`'s `toAuthoringFrame`,
 * verbatim. lat/lon → the PROJECT-north authoring frame the parcel ring and every wall is baked
 * in, and therefore the frame `MassingSolid.ring` arrives in.
 */
function toAuthoringFrame(ll: LatLon, thetaRad: number, origin: LatLon): XZPoint {
    const xz = latLonToSceneXZ(ll, origin.lat, origin.lon);
    if (thetaRad === 0) return { x: xz.x, z: xz.z };
    const e = trueVectorToProjectNorth({ east: xz.x, north: -xz.z }, thetaRad);
    return { x: e.east, z: -e.north };
}

/** Metres between two lat/lon points, via the same local projection the map's readouts use. */
function metresApart(a: LatLon, b: LatLon): number {
    const p = latLonToSceneXZ(b, a.lat, a.lon);
    return Math.hypot(p.x, p.z);
}

/** A ~24 m × 16 m plot placed 40 m NE of the origin — deliberately NOT centred on it, because a
 *  ring centred on the frame origin is invariant under exactly the mirror we are hunting. */
const PLOT: LatLon[] = [
    { lat: ORIGIN.lat + 0.00036, lon: ORIGIN.lon + 0.00048 },
    { lat: ORIGIN.lat + 0.00036, lon: ORIGIN.lon + 0.00077 },
    { lat: ORIGIN.lat + 0.00050, lon: ORIGIN.lon + 0.00077 },
    { lat: ORIGIN.lat + 0.00050, lon: ORIGIN.lon + 0.00048 },
];

describe('§MAP2D-ENVELOPE ARM A — the scene-XZ → lat/lon conversion is the EXACT inverse of the commit frame', () => {
    it('round-trips every plot corner to sub-millimetre at Barcelona θ ≈ 45°', () => {
        for (const corner of PLOT) {
            const xz = toAuthoringFrame(corner, THETA, ORIGIN);
            const back = envelopeXzToLatLon(xz, THETA, ORIGIN);
            expect(metresApart(corner, back)).toBeLessThan(1e-3);
        }
    });

    it('is the identity at θ = 0 too — a rotated site must not be a special case', () => {
        for (const corner of PLOT) {
            const back = envelopeXzToLatLon(toAuthoringFrame(corner, 0, ORIGIN), 0, ORIGIN);
            expect(metresApart(corner, back)).toBeLessThan(1e-3);
        }
    });

    // ── THE FALSIFIERS. Each names one wrong conversion that a reviewer cannot see and a
    // type-checker cannot catch, and proves this arm HAS A TERM FOR IT. Without these the arm
    // above is the L-10740 probe: a criterion that reports CONSISTENT for the defect it exists
    // to catch. Every displacement below is asserted in METRES, on a real 24 m plot.
    it('FALSIFIER — a wrong-signed θ moves the footprint metres off the plot', () => {
        const corner = PLOT[0]!;
        const xz = toAuthoringFrame(corner, THETA, ORIGIN);
        const wrong = envelopeXzToLatLon(xz, -THETA, ORIGIN);
        expect(metresApart(corner, wrong)).toBeGreaterThan(5);
    });

    it('FALSIFIER — dropping the north→z sign flip MIRRORS the ring across the frame origin', () => {
        const corner = PLOT[0]!;
        const xz = toAuthoringFrame(corner, THETA, ORIGIN);
        const { east, north } = sceneXZToEnu(xz.x, xz.z, THETA);
        // The defect: `z: north` instead of `z: -north` — the inline `east = x, north = -z` that
        // `sceneEnuFrame.ts`'s header exists to stop being written by hand.
        const mirrored = sceneXZToLatLon({ x: east, z: north }, ORIGIN.lat, ORIGIN.lon);
        expect(metresApart(corner, mirrored)).toBeGreaterThan(5);
    });

    it('FALSIFIER — skipping sceneXZToEnu entirely (treating project XZ as true ENU) is wrong at θ ≠ 0', () => {
        const corner = PLOT[0]!;
        const xz = toAuthoringFrame(corner, THETA, ORIGIN);
        const naive = sceneXZToLatLon({ x: xz.x, z: xz.z }, ORIGIN.lat, ORIGIN.lon);
        expect(metresApart(corner, naive)).toBeGreaterThan(5);
    });

    it('an INSET envelope ring lands INSIDE the parcel ring on the map, not beside it', () => {
        // The strongest available geometric claim, and the one the founder actually reads: the
        // envelope is an inset of the parcel, so its drawn extent must sit within the parcel's
        // drawn extent. A mirror throws it across the frame origin and this fails by construction.
        const parcelXz = PLOT.map((p) => toAuthoringFrame(p, THETA, ORIGIN));
        const cx = parcelXz.reduce((s, p) => s + p.x, 0) / parcelXz.length;
        const cz = parcelXz.reduce((s, p) => s + p.z, 0) / parcelXz.length;
        // A 25 % inset about the parcel centroid — the shape `envelopeToMassing` hands over.
        const envelopeXz = parcelXz.map((p) => ({ x: cx + (p.x - cx) * 0.75, z: cz + (p.z - cz) * 0.75 }));

        const parcelLL = parcelXz.map((p) => envelopeXzToLatLon(p, THETA, ORIGIN));
        const envelopeLL = envelopeXz.map((p) => envelopeXzToLatLon(p, THETA, ORIGIN));
        const bounds = (ring: LatLon[]) => ({
            minLat: Math.min(...ring.map((p) => p.lat)), maxLat: Math.max(...ring.map((p) => p.lat)),
            minLon: Math.min(...ring.map((p) => p.lon)), maxLon: Math.max(...ring.map((p) => p.lon)),
        });
        const par = bounds(parcelLL);
        const env = bounds(envelopeLL);
        expect(env.minLat).toBeGreaterThan(par.minLat);
        expect(env.maxLat).toBeLessThan(par.maxLat);
        expect(env.minLon).toBeGreaterThan(par.minLon);
        expect(env.maxLon).toBeLessThan(par.maxLon);
    });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// ARM B — REACHABILITY. See the header for the two silent unwirings these exist to catch.
// ─────────────────────────────────────────────────────────────────────────────────────────────
const REPO_ROOT = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
const MAP2D = join(REPO_ROOT, 'apps/editor/src/ui/geospatial/SiteBoundaryMap2D.ts');
const GIS_LAYOUT = join(REPO_ROOT, 'apps/editor/src/ui/layout/GISAreaLayout.ts');
const map2dSrc = readFileSync(MAP2D, 'utf8').replace(/\r\n/g, '\n');
const gisSrc = readFileSync(GIS_LAYOUT, 'utf8').replace(/\r\n/g, '\n');

/**
 * Extract one closure-scoped `function name(` / `const name = (` body. Same instrument, and the
 * same four-space-indent terminator convention, `siteMap2DStyleV2.spec.ts` established on this
 * exact file — a brace counter would have to understand the template literals and regexes these
 * bodies contain, and would be wrong in more ways.
 */
function extractBlock(source: string, head: string, close: string): string {
    const lines = source.split('\n');
    const start = lines.findIndex((l) => l.startsWith(head));
    if (start < 0) throw new Error(`block starting "${head}" not found`);
    for (let i = start + 1; i < lines.length; i++) {
        if (lines[i] === close) return lines.slice(start, i + 1).join('\n');
    }
    throw new Error(`block starting "${head}" has no terminator "${close}"`);
}

describe('§MAP2D-ENVELOPE ARM B — the layer survives the basemap swap', () => {
    it('actually read both files — an unrunnable guard must fail, never skip (§L-851)', () => {
        expect(map2dSrc.length).toBeGreaterThan(50_000);
        expect(gisSrc.length).toBeGreaterThan(50_000);
    });

    it('registers the envelope source+layers INSIDE installRingLayers, which style.load re-runs', () => {
        const body = extractBlock(map2dSrc, '    function installRingLayers(): void {', '    }');
        expect(body).toContain('installEnvelopeLayers();');
    });

    it('installEnvelopeLayers adds the source and BOTH layers, and repaints', () => {
        const body = extractBlock(map2dSrc, '    function installEnvelopeLayers(): void {', '    }');
        expect(body).toContain('map.addSource(ENVELOPE_SOURCE');
        expect(body).toContain('id: ENVELOPE_FILL_LAYER');
        expect(body).toContain('id: ENVELOPE_LINE_LAYER');
        expect(body).toContain('refreshEnvelope();');
    });

    it('pins the three public ids — a rename is invisible at runtime (getSource returns undefined)', () => {
        expect(map2dSrc).toContain("const ENVELOPE_SOURCE = 'pryzm-buildable-envelope';");
        expect(map2dSrc).toContain("const ENVELOPE_FILL_LAYER = 'pryzm-buildable-envelope-fill';");
        expect(map2dSrc).toContain("const ENVELOPE_LINE_LAYER = 'pryzm-buildable-envelope-line';");
    });

    it('draws a FILL + LINE footprint, never a fill-extrusion — the map is pitch-locked', () => {
        const body = extractBlock(map2dSrc, '    function installEnvelopeLayers(): void {', '    }');
        expect(body).not.toContain('fill-extrusion');
    });
});

describe('§MAP2D-ENVELOPE ARM B — the visibility chokepoint is IN the map (C84 EI-1)', () => {
    it('re-asks the one authority on every repaint instead of trusting the handed-over payload', () => {
        const body = extractBlock(map2dSrc, '    function envelopeFeatureCollection(): GeoJSON.FeatureCollection {', '    }');
        expect(body).toContain('getBuildableEnvelopeAxes()');
        expect(body).toContain('applyEnvelopeVisibilityAxes(envelopeSolids, axes)');
    });

    it('subscribes to the authority and drops the listener on dispose', () => {
        expect(map2dSrc).toContain('subscribeBuildableEnvelopeVisibility(');
        const body = extractBlock(map2dSrc, '    function dispose(): void {', '    }');
        expect(body).toContain('envelopeVisibilitySub');
    });

    it('mints NO colour of its own — the hue comes from the ONE table (§ENVELOPE-CONFIDENCE-COLOUR)', () => {
        const body = extractBlock(map2dSrc, "    function envelopeHueCss(hue: MassingSolid['style']['hue']): string {", '    }');
        expect(body).toContain('CONFIDENT_VIOLET_CSS');
        expect(body).toContain('SUGGESTED_AMBER_CSS');
        expect(body).toContain('PROVISIONAL_GREY_CSS');
        // No literal hex may appear in the mapping — that is how the globe and the map drift.
        expect(body).not.toMatch(/#[0-9a-fA-F]{6}/);
    });

    it('refuses honestly rather than drawing at a guessed origin or a guessed θ (C57 §1.5)', () => {
        const body = extractBlock(map2dSrc, '    function envelopeFeatureCollection(): GeoJSON.FeatureCollection {', '    }');
        // Both refusals must be REACHABLE and must SAY WHY — a silent `return emptyFC()` on a
        // missing origin is a failure dressed as "there is no constraint on this land".
        expect(body).toContain('if (!origin) {');
        expect(body).toContain('if (!location) {');
        expect(body).toMatch(/REFUSING to draw the buildable envelope: no site/);
        expect(body).toMatch(/REFUSING to draw the buildable envelope: the site/);
    });
});

describe('§MAP2D-ENVELOPE ARM B — the payload reaches the map OUTSIDE the Cesium gate', () => {
    it('GISAreaLayout pushes the envelope to the map from at least two places', () => {
        const calls = gisSrc.match(/setBuildableEnvelope\(/g) ?? [];
        expect(calls.length).toBeGreaterThanOrEqual(2);
    });

    it('⭐ NOT from inside liveUpdateFormaMassing — that function returns early when only the 2D map is up', () => {
        const body = extractBlock(gisSrc, '    const liveUpdateFormaMassing = (source: string): void => {', '    };');
        // The two early returns that make this function the WRONG host, quoted from the subject so
        // this test fails loudly if they are ever removed and the reasoning here goes stale.
        expect(body).toContain('if (!cesiumViewport?.renderFormaMassing) return;');
        expect(body).toContain("if (formaViewMode === 'map2d' && !site3dPaned) return;");
        expect(body).not.toContain('setBuildableEnvelope');
    });

    it('rides the same unconditional live-update block the envelope CARD refresh rides (§DVP170)', () => {
        const body = extractBlock(gisSrc, '    const subscribeFormaLiveUpdate = (): void => {', '    };');
        expect(body).toContain('map2dHandle?.setBuildableEnvelope(');
        expect(body).toContain('refreshEnvelopePanel();');
    });

    it('hands over the PAYLOAD only — the caller never consults the visibility authority', () => {
        // Gating at the caller is the exact shape §ENVELOPE-ONE-VISIBILITY removed (four answers
        // to one question). The call must be a bare payload push with no visibility branch on it.
        const calls = [...gisSrc.matchAll(/setBuildableEnvelope\(([^;]*)\);/g)].map((m) => m[1] ?? '');
        expect(calls.length).toBeGreaterThanOrEqual(2);
        for (const arg of calls) {
            expect(arg).not.toContain('isBuildableEnvelopeVisible');
            expect(arg).not.toContain('getBuildableEnvelopeAxes');
        }
    });
});
