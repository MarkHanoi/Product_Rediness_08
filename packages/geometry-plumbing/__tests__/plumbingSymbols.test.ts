// §FEAT-PLUMBING-PLAN-ELEV-SYMBOLS (L-221) — plumbing 2D symbol regression suite.
//
// The regression being guarded is UNBOUNDED TRIANGULATION: before this feature a
// single toilet fell through EdgeProjectorService's generic true-edge projection
// and produced ~55 ms of edge extraction and a jump of 894 → 11,706 hidden-line
// segments. The fix replaces that mesh-edge dump with a bounded, deterministic
// architectural symbol. These tests assert (a) an explicit UPPER BOUND on segment
// count per fixture, (b) determinism, (c) exhaustive coverage of the fixture-type
// union, and (d) that PlumbingFragmentBuilder marks every mesh so the generic edge
// path is NOT invoked (skipInPlan + skipInElevation).

import { describe, expect, it } from 'vitest';
import * as THREE from '@pryzm/renderer-three/three';
import {
    buildPlanLinework,
    buildElevationLinework,
    resolveFixtureFootprint,
    type FixtureSymbolInput,
} from '../src/PlumbingSymbolGeometry';
import type { PlumbingFixtureType } from '../src/PlumbingTypes';
import { TOILET_VARIANTS } from '../src/ToiletGeometry';
import { SHOWER_VARIANTS } from '../src/ShowerGeometry';
import { ACCESSORY_VARIANTS } from '../src/BathroomAccessoryGeometry';
import { PlumbingFragmentBuilder } from '../src/PlumbingFragmentBuilder';
import type { PlumbingFixtureData } from '../src/PlumbingTypes';

/** Flat buffers are 6 floats per segment (x,y,z,x,y,z). */
const segCount = (buf: number[]): number => {
    expect(buf.length % 6).toBe(0);
    return buf.length / 6;
};

/** The complete fixture-type union — kept in lock-step with `PlumbingFixtureType`. */
const ALL_TYPES: PlumbingFixtureType[] = [
    'toilet', 'sink', 'urinal', 'bidet', 'bath', 'shower', 'accessory',
];

/** Enumerate every meaningful fixture input (type × variant) for coverage. */
function everyFixtureInput(): FixtureSymbolInput[] {
    const out: FixtureSymbolInput[] = [];
    for (const t of ALL_TYPES) {
        if (t === 'toilet') {
            for (const v of TOILET_VARIANTS) out.push({ fixtureType: t, toiletVariant: v });
        } else if (t === 'shower') {
            for (const v of SHOWER_VARIANTS) out.push({ fixtureType: t, showerVariant: v });
        } else if (t === 'accessory') {
            for (const v of ACCESSORY_VARIANTS) out.push({ fixtureType: t, accessoryVariant: v });
        } else {
            out.push({ fixtureType: t });
        }
    }
    return out;
}

// The regression is unbounded triangulation (thousands of segments). Any authored
// symbol is a small, fixed set of outlines + arcs — an order of magnitude under
// even the cheapest mesh dump. These bounds are the guard.
const PLAN_UPPER_BOUND = 80;
const ELEV_UPPER_BOUND = 60;

describe('§FEAT-PLUMBING — bounded, deterministic plan symbols', () => {
    it('every fixture type/variant yields a NON-EMPTY, BOUNDED plan symbol', () => {
        for (const input of everyFixtureInput()) {
            const n = segCount(buildPlanLinework(input));
            expect(n, `plan segs for ${JSON.stringify(input)}`).toBeGreaterThan(0);
            expect(n, `plan segs for ${JSON.stringify(input)}`).toBeLessThanOrEqual(PLAN_UPPER_BOUND);
        }
    });

    it('a placed toilet contributes FAR fewer than the mesh-dump baseline (upper bound)', () => {
        // Baseline defect: one toilet drove HLR from 894 → 11,706 segments. The symbol
        // must be a tiny fraction of that — assert an explicit, generous ceiling.
        for (const v of TOILET_VARIANTS) {
            const n = segCount(buildPlanLinework({ fixtureType: 'toilet', toiletVariant: v }));
            expect(n).toBeLessThan(60);
        }
    });

    it('is deterministic (same input → byte-identical linework)', () => {
        for (const input of everyFixtureInput()) {
            expect(buildPlanLinework(input)).toEqual(buildPlanLinework(input));
        }
    });
});

describe('§FEAT-PLUMBING — bounded, deterministic elevation symbols (P3)', () => {
    it('every fixture type/variant yields a NON-EMPTY, BOUNDED elevation symbol', () => {
        for (const input of everyFixtureInput()) {
            const n = segCount(buildElevationLinework(input));
            expect(n, `elev segs for ${JSON.stringify(input)}`).toBeGreaterThan(0);
            expect(n, `elev segs for ${JSON.stringify(input)}`).toBeLessThanOrEqual(ELEV_UPPER_BOUND);
        }
    });

    it('elevation linework differs from plan (not a silent plan-symbol reuse)', () => {
        // A plan toilet symbol is a top view; elevation must be its own vertical set.
        const plan = buildPlanLinework({ fixtureType: 'toilet' });
        const elev = buildElevationLinework({ fixtureType: 'toilet' });
        expect(elev).not.toEqual(plan);
    });

    it('is deterministic (same input → byte-identical linework)', () => {
        for (const input of everyFixtureInput()) {
            expect(buildElevationLinework(input)).toEqual(buildElevationLinework(input));
        }
    });
});

describe('§FEAT-PLUMBING — exhaustive footprint resolution', () => {
    it('every fixture type resolves to a positive footprint (no silent fall-through)', () => {
        for (const input of everyFixtureInput()) {
            const fp = resolveFixtureFootprint(input);
            expect(fp.width,  JSON.stringify(input)).toBeGreaterThan(0);
            expect(fp.length, JSON.stringify(input)).toBeGreaterThan(0);
            expect(fp.height, JSON.stringify(input)).toBeGreaterThan(0);
        }
    });

    it('bath honours explicit data dimensions (matches the data-driven 3D mesh)', () => {
        const fp = resolveFixtureFootprint({ fixtureType: 'bath', width: 2.0, length: 0.9, height: 0.7 });
        expect(fp).toEqual({ width: 2.0, length: 0.9, height: 0.7 });
    });
});

describe('§FEAT-PLUMBING P2 — mesh suppression flags (generic edge path not invoked)', () => {
    function makeFixture(fixtureType: PlumbingFixtureType): PlumbingFixtureData {
        return {
            id: `fx-${fixtureType}`,
            type: 'plumbing_fixture',
            fixtureType,
            position: new THREE.Vector3(1, 0, 2),
            rotation: new THREE.Euler(0, Math.PI / 2, 0),
            levelId: 'L0',
            levelName: 'Level 0',
            levelElevation: 0,
            baseOffset: 0,
            properties: {},
        };
    }

    it('PlumbingFragmentBuilder marks EVERY fixture mesh skipInPlan + skipInElevation', () => {
        const scene = new THREE.Scene();
        const builder = new PlumbingFragmentBuilder(scene);
        for (const t of ALL_TYPES) {
            const data = makeFixture(t);
            builder.updateFixture(data);
            const root = builder.fixtureRoots.get(data.id);
            expect(root, `root for ${t}`).toBeTruthy();
            let meshCount = 0;
            root!.traverse((child) => {
                if ((child as THREE.Mesh).isMesh) {
                    meshCount++;
                    expect(child.userData.skipInPlan, `skipInPlan on ${t} mesh`).toBe(true);
                    expect(child.userData.skipInElevation, `skipInElevation on ${t} mesh`).toBe(true);
                }
            });
            expect(meshCount, `${t} produced meshes`).toBeGreaterThan(0);
        }
    });
});
