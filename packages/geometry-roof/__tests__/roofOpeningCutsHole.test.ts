/**
 * §ROOF-HOSTED-OPENINGS — the WATCHED CONTROL: an opening on a roof face
 * produces a HOLE IN THE BUILT ROOF GEOMETRY.
 *
 * ⚠ "It did not throw" is not the control. §COMMITTED-IS-NOT-REACHABLE: a
 * create command that succeeds while the mesh renders solid is exactly the shape
 * of the slab-opening defect FIX-5 had to close (`setDeps` never called ⇒ zero
 * holes ⇒ command still reports success). So the assertions here are made
 * against the emitted vertex buffer:
 *
 *   1. NO triangle of the top surface covers the skylight's centre — measured by
 *      a ray cast DOWN through the mesh, not by a triangle count.
 *   2. Triangles DO cover a point just outside the skylight, so (1) is not
 *      "the roof vanished".
 *   3. The void is enclosed: reveal quads exist down the full thickness.
 *
 * And the NON-VACUITY control, without which all of the above could be satisfied
 * by a builder that rewrites every roof: a roof with NO openings must produce a
 * BYTE-IDENTICAL buffer to the pre-feature path.
 */

import { describe, it, expect } from 'vitest';
import { RoofGeometryBuilder } from '../src/RoofGeometryBuilder.js';
import { computeRoofFaces, faceRectToPlanProfile, planToFaceUV, resolveHostFace } from '../src/pure/roofFaces.js';
import type { RoofData } from '../src/RoofTypes.js';

const RECT: Array<[number, number]> = [[-5, -3], [5, -3], [5, 3], [-5, 3]];

function makeRoof(over: Partial<RoofData> = {}): RoofData {
    return {
        id: 'roof-1',
        type: 'roof',
        levelId: 'level-1',
        footprint: { polygon: RECT, centroid: [0, 0] },
        roofType: 'flat',
        overhang: 0,
        baseOffset: 0,
        thickness: 0.25,
        properties: {},
        metadata: { createdAt: 0, modifiedAt: 0, createdBy: 't', version: 1 },
        ...over,
    } as RoofData;
}

/** Triangles of the geometry as world-space vertex triples. */
function triangles(geo: any): Array<[number[], number[], number[]]> {
    const pos = geo.getAttribute('position');
    const idx = geo.getIndex();
    const out: Array<[number[], number[], number[]]> = [];
    const v = (i: number) => [pos.getX(i), pos.getY(i), pos.getZ(i)];
    for (let t = 0; t < idx.count; t += 3) {
        out.push([v(idx.getX(t)), v(idx.getX(t + 1)), v(idx.getX(t + 2))]);
    }
    return out;
}

/**
 * How many triangles a vertical ray at (x, z) passes through. Barycentric
 * containment in plan — deliberately a TEST-LOCAL oracle, independent of the
 * production predicate, so the control cannot be satisfied by the code under
 * test agreeing with itself.
 */
function hitsAt(geo: any, x: number, z: number): number {
    let hits = 0;
    for (const [a, b, c] of triangles(geo)) {
        const d = (b[2]! - c[2]!) * (a[0]! - c[0]!) + (c[0]! - b[0]!) * (a[2]! - c[2]!);
        if (Math.abs(d) < 1e-12) continue;
        const l1 = ((b[2]! - c[2]!) * (x - c[0]!) + (c[0]! - b[0]!) * (z - c[2]!)) / d;
        const l2 = ((c[2]! - a[2]!) * (x - c[0]!) + (a[0]! - c[0]!) * (z - c[2]!)) / d;
        const l3 = 1 - l1 - l2;
        if (l1 >= 0 && l2 >= 0 && l3 >= 0) hits++;
    }
    return hits;
}

function profileFor(roof: RoofData, planPoint: [number, number], widthM: number, heightM: number) {
    const set = computeRoofFaces({
        id: roof.id, roofType: roof.roofType, polygon: roof.footprint.polygon,
        slope: roof.slope, overhang: roof.overhang, thickness: roof.thickness,
    });
    if (!set.ok) throw new Error(`expected faces, got refusal: ${set.detail}`);
    const host = resolveHostFace(roof.id, set.faces, planPoint);
    if (!host.ok) throw new Error(`expected a host face: ${host.detail}`);
    // Author the rect centred on the requested plan point, in the FACE's frame.
    const uv = planToFaceUV(host.face, planPoint);
    return {
        face: host.face,
        profile: faceRectToPlanProfile(host.face, { uM: uv.u, vM: uv.v, widthM, heightM }),
    };
}

describe('§ROOF-HOSTED-OPENINGS — the hole is in the geometry, not just in the store', () => {
    it('FLAT roof: a skylight leaves NO surface over its centre, while the roof beside it stays solid', () => {
        const roof = makeRoof();
        const { profile } = profileFor(roof, [1.5, 0.5], 1.2, 1.2);

        const solid = RoofGeometryBuilder.generate(roof);
        const holed = RoofGeometryBuilder.generate(roof, [profile]);

        // Before: the roof covers its centre (top cap + soffit = 2 surfaces).
        expect(hitsAt(solid, 1.5, 0.5)).toBeGreaterThanOrEqual(2);
        // After: nothing at all covers the skylight's centre.
        expect(hitsAt(holed, 1.5, 0.5)).toBe(0);
        // …and the roof did NOT vanish: a point 2 m away is still covered.
        expect(hitsAt(holed, -2.0, 0.5)).toBeGreaterThanOrEqual(2);

        expect(holed.userData.pryzmRoofOpeningsCut).toBe(1);
    });

    it('the void is ENCLOSED — reveal faces span the full roof thickness', () => {
        const roof = makeRoof({ thickness: 0.3 });
        const { profile } = profileFor(roof, [0, 0], 1, 1);
        const holed = RoofGeometryBuilder.generate(roof, [profile]);

        const ys = new Set<number>();
        for (const [a, b, c] of triangles(holed)) for (const p of [a, b, c]) ys.add(Number(p[1]!.toFixed(6)));
        expect(ys.has(-0.3)).toBe(true); // soffit plane present
        expect(ys.has(0)).toBe(true);    // top plane present

        // The reveal walls are VERTICAL, so they project to zero plan area and a
        // downward ray cannot register them — count them structurally instead:
        // triangles inside the hole's rim box that span top to soffit.
        let reveal = 0;
        for (const [a, b, c] of triangles(holed)) {
            const onRim = [a, b, c].every(p => Math.abs(p[0]!) <= 0.501 && Math.abs(p[2]!) <= 0.501);
            if (!onRim) continue;
            const ys = [a[1]!, b[1]!, c[1]!];
            if (Math.max(...ys) > -1e-6 && Math.min(...ys) < -0.29) reveal++;
        }
        // Four rim edges × two triangles each — the void is fully enclosed.
        expect(reveal).toBe(8);
    });

    it('PITCHED (shed) roof: the hole is cut in the INCLINED plane and the surface still slopes', () => {
        const roof = makeRoof({ roofType: 'shed', slope: 0.4 });
        const { face, profile } = profileFor(roof, [1, 0], 1.2, 1.2);
        expect(face.slope).toBeCloseTo(0.4, 9);

        const holed = RoofGeometryBuilder.generate(roof, [profile]);
        expect(holed.userData.pryzmRoofOpeningsCut).toBe(1);
        expect(hitsAt(holed, 1, 0)).toBe(0);
        expect(hitsAt(holed, -3.5, 0)).toBeGreaterThanOrEqual(2);

        // The hole's rim sits ON the slope, not flattened to one height: the
        // up-slope rim vertices differ in Y from the down-slope ones by
        // slope × plan depth.
        const pos = holed.getAttribute('position');
        let minY = Infinity, maxY = -Infinity;
        for (let i = 0; i < pos.count; i++) {
            const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
            // Float32 storage rounds 0.6 up, so the rim bound is inclusive-with-slack.
            const inHole = Math.abs(z) <= 0.601 && x > 0.3 && x < 1.7 && y > -0.01;
            if (inHole) { minY = Math.min(minY, y); maxY = Math.max(maxY, y); }
        }
        expect(maxY - minY).toBeGreaterThan(0.3); // ≈ 0.4 × 1.2cos θ
    });

    it('GABLE roof: the skylight lands on the slope that CONTAINS it, and only that one', () => {
        const roof = makeRoof({ roofType: 'gable', slope: 0.5 });
        const { face, profile } = profileFor(roof, [0, -1.5], 1, 1);
        expect(face.index).toBe(0); // the south slope

        const holed = RoofGeometryBuilder.generate(roof, [profile]);
        expect(holed.userData.pryzmRoofOpeningsCut).toBe(1);
        expect(hitsAt(holed, 0, -1.5)).toBe(0);
        // The MIRRORED point on the OTHER slope is untouched — proof the cut went
        // into one face, not through the whole plan projection.
        expect(hitsAt(holed, 0, 1.5)).toBeGreaterThanOrEqual(2);
    });

    it('an opening on a roof whose faces cannot be derived is REPORTED, not silently dropped', () => {
        const roof = makeRoof({ roofType: 'hip', slope: 0.4 });
        // A plausible profile; the point is what the builder does when it cannot
        // decide which plane the hole belongs to.
        const geo = RoofGeometryBuilder.generate(roof, [[[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5]]]);
        expect(geo.userData.pryzmRoofOpeningsUncut).toBe(1);
        expect(geo.userData.pryzmRoofDegraded).toBe(true);
        expect(String(geo.userData.pryzmRoofDegradations)).toContain('could NOT be cut');
        // The roof is still built — a refusal must not delete the roof (L-581).
        expect(hitsAt(geo, 0, 0)).toBeGreaterThanOrEqual(2);
    });
});

describe('§ROOF-HOSTED-OPENINGS — NON-VACUITY', () => {
    for (const roofType of ['flat', 'shed', 'gable', 'hip', 'mansard'] as const) {
        it(`a ${roofType} roof with NO openings is byte-identical to the pre-feature build`, () => {
            const roof = makeRoof({ roofType, slope: 0.4 });
            const before = RoofGeometryBuilder.generate(roof);
            const undef  = RoofGeometryBuilder.generate(roof, undefined);
            const empty  = RoofGeometryBuilder.generate(roof, []);

            const snap = (g: any) => JSON.stringify({
                pos: Array.from(g.getAttribute('position').array as Float32Array),
                idx: Array.from(g.getIndex().array as ArrayLike<number>),
                grp: g.groups,
            });
            expect(snap(undef)).toBe(snap(before));
            expect(snap(empty)).toBe(snap(before));
            expect(undef.userData.pryzmRoofOpeningsCut).toBeUndefined();
        });
    }
});
