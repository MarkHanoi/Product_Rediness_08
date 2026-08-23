// §FIX-FORMA-WATERWAY-GROUND-RIBBON (L-10160, founder 2026-08-23) — "the water rivers in the 3D
// Site view are in the forefront overlapping buildings … which they should not".
//
// WHAT COUNTS AS PROOF HERE, AND WHAT DOES NOT. The complaint is about WHAT IS IN FRONT OF WHAT,
// and that cannot be settled by asserting an entity property in isolation — a headless node suite
// has no Cesium depth buffer. So this suite proves the two things that ARE decidable without one,
// and says plainly which is which:
//
//   ARM A — THE DEPTH-TEST BYPASS IS GONE, and the waterway now renders by BYTE-FOR-BYTE the same
//     treatment as the ROAD ribbon. That equivalence is the load-bearing argument: §FORMA-CTX-ROAD-
//     RIBBON (ADR-0095) fixed this exact symptom on this exact view for roads — "the white lines
//     draped straight THROUGH the buildings" — by moving them from floating polylines to flat
//     ground corridors, and the founder has accepted that layer as correct in every screenshot
//     since. A feature drawn the same way as a feature already confirmed correct is occluded the
//     same way. Asserted against the REAL source (CesiumViewport imports cesium at module scope
//     and cannot be imported under this node config).
//   ARM B — the pure decisions the ribbon rests on: the class→width table's INPUT, and the
//     duplicate-suppression that stops a NOMINAL band being laid over a MEASURED river surface.
//     Real functions, real calls.
//
// ⛔ NOT PROVEN HERE, and named rather than implied: that a specific pixel of river is behind a
// specific building. That needs the browser. What is proven is that nothing in this path asks the
// renderer to skip the depth test any more, and that the layer's height is now re-seatable at all.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
    waterwayKind,
    waterwayDuplicatesArea,
    type ContextWaterArea,
    type ContextWaterway,
} from '../src/ui/geospatial/contextWater';

const VIEWPORT_SRC = resolve(__dirname, '../src/ui/geospatial/CesiumViewport.ts');

/** The body of one `public async load…` / `private …` method, sliced from the real file. */
function methodBody(name: string): string {
    const body = readFileSync(VIEWPORT_SRC, 'utf8');
    const start = body.indexOf(name);
    expect(start, `${name} must exist in CesiumViewport.ts`).toBeGreaterThan(0);
    // Every one of these methods is followed by the next `\n  /**` doc block at class indent.
    const end = body.indexOf('\n  /**', start);
    expect(end).toBeGreaterThan(start);
    return body.slice(start, end);
}

/** The same body with `//` commentary removed. REQUIRED for every "must NOT contain" assertion
 *  below: these methods carry long root-cause notes that NAME the removed settings
 *  (`depthFailMaterial`, `clampToGround`) precisely so the next reader knows why they are gone.
 *  A prose mention must never be able to fail — or satisfy — a claim about the emitted code. */
function methodCode(name: string): string {
    return methodBody(name)
        .split('\n')
        .filter((l) => !l.trim().startsWith('//'))
        .map((l) => l.replace(/\s\/\/.*$/, ''))
        .join('\n');
}

describe('§FIX-FORMA-WATERWAY-GROUND-RIBBON ARM A — no depth bypass, and the same treatment as roads', () => {
    it('draws waterways as a ground CORRIDOR, not a floating polyline', () => {
        const water = methodCode('public async loadContextWater(');
        expect(water).toContain("name: 'pryzm-forma-context-waterway'");
        // The corridor block that replaced the polyline.
        expect(water).toMatch(/name: 'pryzm-forma-context-waterway',\s*\n\s*corridor: \{/);
        expect(water).not.toMatch(/name: 'pryzm-forma-context-waterway',\s*\n\s*polyline: \{/);
    });

    it('asks the renderer for NO depth-test bypass anywhere in the water layer', () => {
        const water = methodCode('public async loadContextWater(');
        // `depthFailMaterial` draws a polyline PRECISELY WHERE IT IS OCCLUDED. It is what painted
        // the river over the buildings in front of it — by configuration, not by accident.
        expect(water).not.toContain('depthFailMaterial');
        // The other two ways to defeat occlusion, asserted absent so a later edit cannot quietly
        // reintroduce the symptom by a different route (⛔ the brief's forbidden fix).
        expect(water).not.toContain('disableDepthTestDistance');
        expect(water).not.toContain('eyeOffset');
    });

    it('matches the ROAD ribbon’s depth-relevant treatment field for field', () => {
        const water = methodCode('public async loadContextWater(');
        const roads = methodCode('public async loadContextRoads(');
        // The road layer is the accepted-correct sibling (§FORMA-CTX-ROAD-RIBBON, ADR-0095).
        for (const shared of [
            'corridor: {',
            'cornerType: Cesium.CornerType.ROUNDED,',
            'outline: false,',
            'height: base,',
        ]) {
            expect(roads, `road ribbon must still use ${shared}`).toContain(shared);
            expect(water, `water ribbon must use the same ${shared}`).toContain(shared);
        }
        // Both seat at an ABSOLUTE scalar height rather than clamping (Forma runs
        // depthTestAgainstTerrain=false, where a clamped ground primitive renders nothing).
        expect(roads).not.toContain('clampToGround');
        expect(water).not.toContain('clampToGround');
        // Neither is extruded — a ground ribbon can never rise into a building.
        expect(water).not.toContain('extrudedHeight');
    });

    it('is now visible to the L-635 ground re-seat — the exemption that hid it is gone', () => {
        const reseat = methodCode('private reseatContextGroundFeaturesForBase(');
        // It was lifted only as a 'polygon' (the lake areas); the centre-lines carried their height
        // inside their positions and were explicitly skipped, so on a city whose terrain settles
        // upward they stayed hundreds of metres below the ground and were drawn through it.
        expect(reseat).toContain("lift(this.contextWaterEntities, 'polygon', 0.03)");
        expect(reseat).toContain("lift(this.contextWaterEntities, 'corridor', 0.03)");
        // Same seat as before — this fix must not silently restack the ground layers.
        expect(reseat).toContain("lift(this.contextRoadEntities, 'corridor', 0.02)");
        expect(reseat).toContain("lift(this.contextParkEntities, 'polygon', 0.01)");
    });

    it('stays a FORMA-only layer — the photoreal globe still clears it, since the tiles carry water', () => {
        const body = readFileSync(VIEWPORT_SRC, 'utf8');
        // Deliverable A's other half: where the 3D tiles already show the real river, our ribbon
        // must not be drawn over them at all. That suppression predates this fix; assert it stands.
        expect(body).toMatch(/if \(this\.photorealTilesActive\) \{[\s\S]{0,2000}this\.clearContextWater\(\);/);
    });
});

describe('§FIX-FORMA-WATERWAY-GROUND-RIBBON ARM B — the pure decisions the ribbon rests on', () => {
    it('classifies the waterway tag, and never dresses an unknown tag as a class', () => {
        expect(waterwayKind('river')).toBe('river');
        expect(waterwayKind('riverbank')).toBe('river');
        expect(waterwayKind('canal')).toBe('canal');
        expect(waterwayKind('stream')).toBe('stream');
        expect(waterwayKind('drain')).toBe('drain');
        expect(waterwayKind('ditch')).toBe('ditch');
        // A weir, a lock gate, a dock, an ABSENT tag — all fall to the conservative default rather
        // than borrowing a river's width. The width is nominal either way; it must not be a guess
        // wearing a class name.
        expect(waterwayKind('weir')).toBe('waterway');
        expect(waterwayKind(undefined)).toBe('waterway');
        expect(waterwayKind('')).toBe('waterway');
    });

    // A 0.01°-square lake ring around (10, 50) — the "mapped surface".
    const LAKE: ContextWaterArea = {
        osmId: 1,
        ring: [[9.99, 49.99], [10.01, 49.99], [10.01, 50.01], [9.99, 50.01], [9.99, 49.99]],
    };
    const way = (coords: ReadonlyArray<readonly [number, number]>): ContextWaterway =>
        ({ coords, osmId: 2, kind: 'river' });

    it('drops a centre-line that runs INSIDE a mapped water surface', () => {
        // OSM maps a big river twice: a `waterway=river` centre-line AND its wetted polygon. Drawing
        // a NOMINAL 14 m band on top of the MEASURED surface is a fabricated edge over a real one.
        const through = way([[9.995, 50.0], [10.0, 50.0], [10.005, 50.0]]);
        expect(waterwayDuplicatesArea(through, [LAKE])).toBe(true);
    });

    it('KEEPS a tributary that only touches the surface at its confluence', () => {
        // The test is a MAJORITY, not "any vertex inside" — a stream joining a mapped river shares
        // its last point with the polygon and must still be drawn, or the network breaks at every
        // junction. This is why the rule is not the simpler one.
        const tributary = way([[10.05, 50.05], [10.03, 50.03], [10.02, 50.02], [10.005, 50.005]]);
        expect(waterwayDuplicatesArea(tributary, [LAKE])).toBe(false);
    });

    it('keeps everything when there is no mapped surface to prefer', () => {
        const anywhere = way([[9.995, 50.0], [10.005, 50.0]]);
        expect(waterwayDuplicatesArea(anywhere, [])).toBe(false);
        // …and never throws on degenerate input (this runs inside a render loop's try/catch, but it
        // must not need it).
        expect(waterwayDuplicatesArea(way([]), [LAKE])).toBe(false);
        expect(waterwayDuplicatesArea(anywhere, [{ osmId: 9, ring: [[0, 0], [1, 1]] }])).toBe(false);
    });

    it('the width table is class-typed and river > canal > stream > ditch', () => {
        // The table lives in the renderer (it is a display choice, not data), so read it there and
        // assert the ORDERING rather than restating the numbers — a nominal width may be retuned,
        // but a ditch must never be drawn wider than a river.
        const water = methodCode('public async loadContextWater(');
        const m = /const waterwayWidthM = \(kind: ContextWaterwayKind\): number => \{([\s\S]*?)\n\s{4}\};/.exec(water);
        expect(m, 'waterwayWidthM must exist and be class-typed').not.toBeNull();
        const table = m![1]!;
        const widthOf = (label: string): number => {
            const r = new RegExp(`case '${label}':[^\\n]*return (\\d+);`).exec(table);
            expect(r, `width table must cover '${label}'`).not.toBeNull();
            return Number(r![1]);
        };
        expect(widthOf('river')).toBeGreaterThan(widthOf('canal'));
        expect(widthOf('canal')).toBeGreaterThan(widthOf('stream'));
        expect(widthOf('stream')).toBeGreaterThan(widthOf('ditch'));
        expect(table).toMatch(/default: return \d+;/);
    });
});
