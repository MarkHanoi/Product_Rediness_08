/**
 * §ROOF-HOSTED-OPENINGS — the face decomposition and the face-plane-local
 * coordinate model, pinned.
 *
 * These are the WATCHED CONTROLS for the "can we host a lucernario on a roof?"
 * question, and each is written so it FAILS if the mechanism it names is absent:
 *
 *   · a face is only reported when the plane genuinely describes the emitted
 *     surface (the gable rectangle acceptance test),
 *   · the host face is chosen by CONTAINMENT, and a point inside no face refuses
 *     and NAMES THE ROOF,
 *   · an authored 1.2 × 1.2 m skylight is 1.2 × 1.2 m ON THE SLOPE — its plan
 *     projection is SHORTER up-slope by exactly cos θ. If the implementation ever
 *     silently reverts to authoring-from-plan, this test goes red.
 */

import { describe, it, expect } from 'vitest';
import {
    computeRoofFaces,
    faceYAt,
    faceUVToPlan,
    planToFaceUV,
    faceRectToPlanProfile,
    checkOpeningWithinFace,
    resolveHostFace,
    worldXZToRoofLocal,
    type RoofFaceSource,
} from '../src/pure/roofFaces.js';

/** 10 × 6 m rectangle, centroid-local — the frame `footprint.polygon` is stored in. */
const RECT: Array<[number, number]> = [[-5, -3], [5, -3], [5, 3], [-5, 3]];

function roof(over: Partial<RoofFaceSource> = {}): RoofFaceSource {
    return { id: 'roof-1', roofType: 'flat', polygon: RECT, thickness: 0.25, overhang: 0, ...over };
}

describe('computeRoofFaces — what it can describe', () => {
    it('flat → ONE horizontal face over the footprint, y = 0 everywhere', () => {
        const set = computeRoofFaces(roof({ roofType: 'flat' }));
        expect(set.ok).toBe(true);
        if (!set.ok) return;
        expect(set.faces).toHaveLength(1);
        expect(set.faces[0]!.slope).toBe(0);
        expect(faceYAt(set.faces[0]!, 0, 0)).toBeCloseTo(0, 12);
        expect(faceYAt(set.faces[0]!, 4.9, 2.9)).toBeCloseTo(0, 12);
    });

    it('shed → ONE inclined face, and the plane is EXACT (not an approximation)', () => {
        const slope = 0.35;
        const set = computeRoofFaces(roof({ roofType: 'shed', slope }));
        expect(set.ok).toBe(true);
        if (!set.ok) return;
        expect(set.faces).toHaveLength(1);
        expect(set.faces[0]!.slope).toBeCloseTo(slope, 12);
        // `generateShed` uses the LONGEST edge as the slope direction — here +X.
        // Height must therefore be slope × x, identically, at any sample.
        for (const x of [-5, -2.3, 0, 1.7, 5]) {
            expect(faceYAt(set.faces[0]!, x, 1.234)).toBeCloseTo(slope * x, 10);
        }
    });

    it('gable on a rectangle → TWO faces meeting at the ridge at the SAME height', () => {
        const set = computeRoofFaces(roof({ roofType: 'gable', slope: 0.5 }));
        expect(set.ok).toBe(true);
        if (!set.ok) return;
        expect(set.faces).toHaveLength(2);
        const [low, high] = set.faces as [typeof set.faces[0], typeof set.faces[0]];
        // Ridge runs along the principal axis (X, the 10 m side) at z = 0.
        expect(faceYAt(low, 0, 0)).toBeCloseTo(faceYAt(high, 0, 0), 9);
        expect(faceYAt(low, 0, 0)).toBeGreaterThan(0);
        // Both eaves are at y = 0 — the invariant `_buildMultiLevel` emits.
        expect(faceYAt(low, 0, -3)).toBeCloseTo(0, 9);
        expect(faceYAt(high, 0, 3)).toBeCloseTo(0, 9);
        // …and the ridge height is halfPerp × slope = 3 × 0.5.
        expect(faceYAt(low, 0, 0)).toBeCloseTo(1.5, 9);
    });
});

describe('computeRoofFaces — what it REFUSES, and why that is the point', () => {
    it('a hip roof refuses BY NAME rather than reporting a plane the mesh does not have', () => {
        const set = computeRoofFaces(roof({ roofType: 'hip', slope: 0.4 }));
        expect(set.ok).toBe(false);
        if (set.ok) return;
        expect(set.reason).toBe('unsupported-roof-type');
        expect(set.detail).toContain('roof-1');
        expect(set.detail).toContain('hip');
    });

    it('a NON-rectangular gable refuses — the emitted surface is not two planes', () => {
        // A trapezoid: every vertex is still at y = 0 in the mesh, but they sit at
        // different perpendicular offsets, so no pair of planes describes it.
        const set = computeRoofFaces(roof({
            roofType: 'gable',
            slope: 0.4,
            polygon: [[-5, -3], [5, -3], [3, 3], [-3, 3]],
        }));
        expect(set.ok).toBe(false);
        if (set.ok) return;
        expect(set.reason).toBe('gable-footprint-not-rectangular');
    });

    it('segment composition and slope arrows refuse separately, each with its own reason', () => {
        const seg = computeRoofFaces(roof({ segments: [{}] }));
        expect(seg.ok).toBe(false);
        if (!seg.ok) expect(seg.reason).toBe('segment-composition');

        const arrows = computeRoofFaces(roof({ roofType: 'gable', slopeArrows: [{}] }));
        expect(arrows.ok).toBe(false);
        if (!arrows.ok) expect(arrows.reason).toBe('slope-arrows');
    });

    it('an L-SHAPED pitched roof decomposes into per-wing gable faces — the founder case', () => {
        // §ROOF-CONCAVE-DECOMPOSE: the generator builds ONE GABLE PER WING here,
        // even when roofType is hip (its own diagnostic says chosenKind=gable-per-wing).
        const L: Array<[number, number]> = [[0, 0], [12, 0], [12, 6], [6, 6], [6, 14], [0, 14]];
        const set = computeRoofFaces(roof({ roofType: 'hip', slope: 0.4, polygon: L }));
        expect(set.ok).toBe(true);
        if (!set.ok) return;
        // Two wings x two slopes each.
        expect(set.faces.length).toBeGreaterThanOrEqual(4);
        expect(set.faces.length % 2).toBe(0);
        expect(set.eaveRings.length).toBe(set.faces.length / 2);
        // Every face is genuinely pitched, and every eave sits at y = 0.
        for (const f of set.faces) expect(f.slope).toBeCloseTo(0.4, 6);
    });
});

describe('the host face is chosen by CONTAINMENT — never by nearest-anything', () => {
    it('the two slopes of a gable are told apart, which nearest-centroid CANNOT do', () => {
        const set = computeRoofFaces(roof({ roofType: 'gable', slope: 0.5 }));
        expect(set.ok).toBe(true);
        if (!set.ok) return;

        // Both faces of this roof share ONE `footprint.centroid`. Any rule keyed
        // on the roof's position would return the same face for both points.
        const south = resolveHostFace('roof-1', set.faces, [0, -2]);
        const north = resolveHostFace('roof-1', set.faces, [0, 2]);
        expect(south.ok).toBe(true);
        expect(north.ok).toBe(true);
        if (!south.ok || !north.ok) return;
        expect(south.face.index).not.toBe(north.face.index);
    });

    it('a point inside NO face refuses honestly and NAMES the roof', () => {
        const set = computeRoofFaces(roof({ roofType: 'gable', slope: 0.5 }));
        expect(set.ok).toBe(true);
        if (!set.ok) return;

        const res = resolveHostFace('roof-XYZ', set.faces, [40, 40]);
        expect(res.ok).toBe(false);
        if (res.ok) return;
        expect(res.detail).toContain('roof-XYZ');
        expect(res.detail).toContain('40.000');
        expect(res.detail).toMatch(/inside NONE/);
    });

    it('the overhang is part of the ring faces are measured against', () => {
        const withOverhang = computeRoofFaces(roof({ roofType: 'flat', overhang: 0.5 }));
        expect(withOverhang.ok).toBe(true);
        if (!withOverhang.ok) return;
        // x = 5.25 is outside the 10 × 6 footprint but under a 0.5 m eave.
        expect(resolveHostFace('roof-1', withOverhang.faces, [5.25, 0]).ok).toBe(true);

        const none = computeRoofFaces(roof({ roofType: 'flat', overhang: 0 }));
        expect(none.ok).toBe(true);
        if (!none.ok) return;
        expect(resolveHostFace('roof-1', none.faces, [5.25, 0]).ok).toBe(false);
    });
});

describe('face-plane-local authoring — the architectural decision, pinned', () => {
    it('one metre UP THE SLOPE advances only cos θ metres in plan', () => {
        const slope = 0.75; // 36.87°
        const set = computeRoofFaces(roof({ roofType: 'shed', slope }));
        expect(set.ok).toBe(true);
        if (!set.ok) return;
        const face = set.faces[0]!;

        const at0 = faceUVToPlan(face, { u: 0, v: 0 });
        const at1 = faceUVToPlan(face, { u: 0, v: 1 });
        const planAdvance = Math.hypot(at1[0] - at0[0], at1[1] - at0[1]);
        const cosTheta = 1 / Math.sqrt(1 + slope * slope);
        expect(planAdvance).toBeCloseTo(cosTheta, 12);
        expect(planAdvance).toBeLessThan(1); // the whole point: NOT authored from plan

        // …and the 3-D distance along the surface IS one metre.
        const y0 = faceYAt(face, at0[0], at0[1]);
        const y1 = faceYAt(face, at1[0], at1[1]);
        expect(Math.hypot(planAdvance, y1 - y0)).toBeCloseTo(1, 12);
    });

    it('planToFaceUV is the exact inverse of faceUVToPlan', () => {
        const set = computeRoofFaces(roof({ roofType: 'shed', slope: 0.4 }));
        if (!set.ok) throw new Error('expected faces');
        const face = set.faces[0]!;
        for (const uv of [{ u: 0, v: 0 }, { u: 2.5, v: -1.25 }, { u: -3.1, v: 0.9 }]) {
            const back = planToFaceUV(face, faceUVToPlan(face, uv));
            expect(back.u).toBeCloseTo(uv.u, 10);
            expect(back.v).toBeCloseTo(uv.v, 10);
        }
    });

    it('a 1.2 × 1.2 m lucernario measures 1.2 × 1.2 m ON THE ROOF, not in plan', () => {
        const slope = 0.577350269; // 30°
        const set = computeRoofFaces(roof({ roofType: 'shed', slope }));
        if (!set.ok) throw new Error('expected faces');
        const face = set.faces[0]!;

        const profile = faceRectToPlanProfile(face, { uM: 0, vM: 0, widthM: 1.2, heightM: 1.2 });
        expect(profile).toHaveLength(4);

        // Along the eave (u) the plan size is unchanged…
        const alongEave = Math.hypot(profile[1]![0] - profile[0]![0], profile[1]![1] - profile[0]![1]);
        expect(alongEave).toBeCloseTo(1.2, 9);

        // …up the slope the PLAN size is compressed by cos 30° = 0.866…
        const upSlopePlan = Math.hypot(profile[2]![0] - profile[1]![0], profile[2]![1] - profile[1]![1]);
        expect(upSlopePlan).toBeCloseTo(1.2 * Math.cos(Math.atan(slope)), 9);
        expect(upSlopePlan).toBeLessThan(1.2);

        // …and the TRUE size on the surface is 1.2 m, which is what was authored.
        const y1 = faceYAt(face, profile[1]![0], profile[1]![1]);
        const y2 = faceYAt(face, profile[2]![0], profile[2]![1]);
        expect(Math.hypot(upSlopePlan, y2 - y1)).toBeCloseTo(1.2, 9);
    });
});

describe('§ROOF-OPENING-STRADDLE — a skylight crossing a ridge is REFUSED, not clipped', () => {
    it('names the face it strayed onto, so the user knows which edge it crossed', () => {
        const set = computeRoofFaces(roof({ roofType: 'gable', slope: 0.5 }));
        if (!set.ok) throw new Error('expected faces');

        // Centre 0.3 m south of the ridge, but 2 m tall up the slope → crosses it.
        const host = resolveHostFace('roof-1', set.faces, [0, -0.3]);
        if (!host.ok) throw new Error('expected a host face');
        const uv = planToFaceUV(host.face, [0, -0.3]);
        const straddling = faceRectToPlanProfile(host.face, { uM: uv.u, vM: uv.v, widthM: 1, heightM: 2 });

        const verdict = checkOpeningWithinFace('roof-1', set.faces, host.face, straddling);
        expect(verdict.ok).toBe(false);
        if (verdict.ok) return;
        expect(verdict.detail).toContain('roof-1');
        expect(verdict.detail).toContain(`face #${host.face.index}`);
        expect(verdict.detail).toMatch(/face #1|face #0/);
        expect(verdict.detail).toMatch(/refused rather than\s+clipped/);
    });

    it('a skylight that fits inside its face passes', () => {
        const set = computeRoofFaces(roof({ roofType: 'gable', slope: 0.5 }));
        if (!set.ok) throw new Error('expected faces');
        const host = resolveHostFace('roof-1', set.faces, [0, -1.6]);
        if (!host.ok) throw new Error('expected a host face');
        const uv = planToFaceUV(host.face, [0, -1.6]);
        const fits = faceRectToPlanProfile(host.face, { uM: uv.u, vM: uv.v, widthM: 1, heightM: 1 });
        expect(checkOpeningWithinFace('roof-1', set.faces, host.face, fits).ok).toBe(true);
    });

    it('a skylight hanging off the roof entirely says so, rather than naming a face', () => {
        const set = computeRoofFaces(roof({ roofType: 'flat' }));
        if (!set.ok) throw new Error('expected faces');
        const host = set.faces[0]!;
        // Centred 0.2 m inside the east edge, 2 m wide → half of it is off the roof.
        const uv = planToFaceUV(host, [4.8, 0]);
        const overhanging = faceRectToPlanProfile(host, { uM: uv.u, vM: uv.v, widthM: 1, heightM: 2 });
        const verdict = checkOpeningWithinFace('roof-1', set.faces, host, overhanging);
        expect(verdict.ok).toBe(false);
        if (!verdict.ok) expect(verdict.detail).toContain('off the roof entirely');
    });
});

describe('world ↔ roof-local', () => {
    it('worldXZToRoofLocal subtracts the footprint centroid, matching the stored polygon frame', () => {
        expect(worldXZToRoofLocal({ x: 12, z: -4 }, [10, -1])).toEqual([2, -3]);
    });
});
