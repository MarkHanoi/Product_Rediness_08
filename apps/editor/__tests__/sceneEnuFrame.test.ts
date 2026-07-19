// §L-430 slice 2b — the scene ⇄ ENU frame boundary (globe θ application).
//
// The failure this file guards against is NOT a crash. It is a building that lands on the
// globe looking entirely plausible, at the wrong bearing. So the assertions are chosen to
// catch a WRONG-BUT-PLAUSIBLE mapping, not merely a broken one:
//
//   • round-trip exactness (ADR-0115 invariant) — catches an inverse that isn't one;
//   • a rotated parcel actually landing back on its TRUE bearing — catches a θ applied in
//     the wrong DIRECTION, which round-trips perfectly and so survives a round-trip test;
//   • rigidity (lengths + angles preserved) — ADR-0070's RIGID-TRANSFORM-LAST rule, which is
//     what guarantees seams that closed in plan stay closed on the globe;
//   • θ = 0 strict identity — the byte-identity discipline for every un-rotated site.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sceneXZToEnu, enuToSceneXZ, projectHeadingToTrueBearingDeg } from '../src/ui/geospatial/sceneEnuFrame';
import { deriveProjectNorthAngleFromParcel } from '../src/ui/site/overlay/projectTrueNorth';

const HERE = dirname(fileURLToPath(import.meta.url));

const DEG = Math.PI / 180;
const THETAS = [0, 12 * DEG, -30 * DEG, 44 * DEG, -44 * DEG];
const PTS = [
    { x: 0, z: 0 }, { x: 10, z: 0 }, { x: 0, z: -10 },
    { x: -25, z: 40 }, { x: 137.5, z: -88.25 },
];

describe('§L-430 scene ⇄ ENU frame', () => {
    it('θ = 0 is STRICTLY the base mapping east = x, north = −z (byte-identity)', () => {
        for (const { x, z } of PTS) {
            expect(sceneXZToEnu(x, z)).toEqual({ east: x, north: -z });
            expect(sceneXZToEnu(x, z, 0)).toEqual({ east: x, north: -z });
        }
    });

    it('round-trips exactly: scene → ENU → scene (ADR-0115 invariant)', () => {
        for (const theta of THETAS) {
            for (const { x, z } of PTS) {
                const enu = sceneXZToEnu(x, z, theta);
                const back = enuToSceneXZ(enu.east, enu.north, theta);
                expect(back.x).toBeCloseTo(x, 10);
                expect(back.z).toBeCloseTo(z, 10);
            }
        }
    });

    it('is RIGID — preserves distances and angles (ADR-0070 RIGID-TRANSFORM-LAST)', () => {
        // This is what guarantees a seam that closed in the plan frame stays closed on the
        // globe. A transform that scaled or sheared would still round-trip.
        for (const theta of THETAS) {
            const a = sceneXZToEnu(3, -7, theta);
            const b = sceneXZToEnu(19, 5, theta);
            const dScene = Math.hypot(19 - 3, 5 - -7);
            const dEnu = Math.hypot(b.east - a.east, b.north - a.north);
            expect(dEnu).toBeCloseTo(dScene, 10);
            // Angle preserved: dot product of two scene vectors survives the mapping.
            const u = sceneXZToEnu(1, 0, theta), v = sceneXZToEnu(0, 1, theta);
            expect(u.east * v.east + u.north * v.north).toBeCloseTo(0, 10);
        }
    });

    it('KEY PROPERTY: a parcel squared into the project frame lands back on its TRUE bearing', () => {
        // The whole point of L-430, end to end. Take a parcel at a real-world bearing, derive
        // θ, de-rotate it into the authoring frame (where it is axis-aligned = orthogonal
        // walls), then push it through the globe mapping — it must come back out at the
        // ORIGINAL true-world bearing.
        //
        // A θ applied in the WRONG DIRECTION round-trips perfectly and passes the test above;
        // it fails here. That is precisely the defect this slice exists to prevent.
        const trueParcel = [
            { x: 0, z: 0 }, { x: 34.6, z: -20 }, { x: 24.6, z: -37.3 }, { x: -10, z: -17.3 },
        ];
        const theta = deriveProjectNorthAngleFromParcel(trueParcel);
        expect(theta).not.toBe(0);  // guard: a degenerate θ would make this vacuous

        // De-rotate the parcel into the project/authoring frame (what the editor will store).
        const projectParcel = trueParcel.map(({ x, z }) => {
            const p = enuToSceneXZ(x, -z, theta);   // (x,−z) = its ENU east/north
            return { x: p.x, z: p.z };
        });

        // Sanity: it really is axis-aligned in the authoring frame (that's the founder's ask).
        const dx = projectParcel[1]!.x - projectParcel[0]!.x;
        const dz = projectParcel[1]!.z - projectParcel[0]!.z;
        expect(Math.min(Math.abs(dx), Math.abs(dz))).toBeLessThan(1e-6);

        // And the globe mapping puts every vertex back exactly where it really is on earth.
        projectParcel.forEach((p, i) => {
            const enu = sceneXZToEnu(p.x, p.z, theta);
            expect(enu.east).toBeCloseTo(trueParcel[i]!.x, 8);
            expect(enu.north).toBeCloseTo(-trueParcel[i]!.z, 8);
        });
    });

    it('headings rotate WITH positions (a placed model must not be left facing wrong)', () => {
        expect(projectHeadingToTrueBearingDeg(0, 0)).toBe(0);
        expect(projectHeadingToTrueBearingDeg(90, 0)).toBe(90);
        expect(projectHeadingToTrueBearingDeg(0, 30 * DEG)).toBeCloseTo(30, 9);
        expect(projectHeadingToTrueBearingDeg(350, 30 * DEG)).toBeCloseTo(20, 9);  // wraps
        expect(projectHeadingToTrueBearingDeg(10, -30 * DEG)).toBeCloseTo(340, 9); // wraps
    });

    it('the GLSL drape shader applies the SAME rotation as sceneXZToEnu', () => {
        // The façade drape runs this rotation on the GPU as a string of GLSL. No type checker
        // and no unit test reaches inside it, so a sign error there is invisible — and its
        // symptom (the heatmap sliding around the building) looks like a UV/texture bug, not a
        // frame bug. `positionMC` is PROJECT-frame while the face table it samples is
        // TRUE-frame, so the shader MUST rotate. Pin the algebra to the source text.
        const src = readFileSync(resolve(HERE, '../src/ui/geospatial/CesiumViewport.ts'), 'utf8');

        // The uniform must exist and be fed from the θ accessor (not a literal / stale field).
        expect(src).toMatch(/u_pryzmProjNorth:\s*\{[^}]*value:\s*this\.readProjectNorthRad\(\)/);

        // And the fragment body must implement projectVectorToTrueNorth exactly:
        //   east' =  e·cosθ + n·sinθ      north' = −e·sinθ + n·cosθ
        // Whitespace-tolerant, but sign- and term-order-sensitive — an inverted θ fails here.
        const glsl = src.replace(/\s+/g, ' ');
        expect(glsl).toMatch(/float east\s*=\s*e0 \* csT \+ n0 \* snT;/);
        expect(glsl).toMatch(/float north\s*=\s*-\s*e0 \* snT \+ n0 \* csT;/);

        // Cross-check the algebra itself against the shipping helper, so the pinned strings
        // above are provably the RIGHT formula and not merely the current one.
        const theta = 37 * DEG, x = 12, z = -5;
        const cs = Math.cos(theta), sn = Math.sin(theta);
        const e0 = x, n0 = -z;
        const glslEast = e0 * cs + n0 * sn;
        const glslNorth = -e0 * sn + n0 * cs;
        const helper = sceneXZToEnu(x, z, theta);
        expect(glslEast).toBeCloseTo(helper.east, 12);
        expect(glslNorth).toBeCloseTo(helper.north, 12);
    });

    it('heading and position agree: a scene +X vector and a 90° heading rotate together', () => {
        // Catches the case where position gets θ but heading gets −θ (or nothing) — the model
        // sits in the right place but faces the wrong way, which reads as a modelling error.
        for (const theta of THETAS) {
            const v = sceneXZToEnu(1, 0, theta);                 // scene +X (east at θ=0)
            const bearingFromVector = ((Math.atan2(v.east, v.north) * 180 / Math.PI) % 360 + 360) % 360;
            expect(bearingFromVector).toBeCloseTo(projectHeadingToTrueBearingDeg(90, theta), 9);
        }
    });
});
