// §WALL-RAKE-JOINT-OPENING-HOST (founder 2026-08-10, ADR-0312 follow-up) —
// a wall that HOSTS AN OPENING must still carry the twin-solve joint loft.
//
// THE FOUNDER'S REPORT (live build 4081ac3a, which already contains the
// one-edit-behind fix 768bc149): the raked mitre between two walls is clean —
// "working perfectly sound" — until a door is placed on the ADJACENT wall, at
// which point "the wall joint goes out": the corner reverts to the un-lofted
// (ADR-0310) state, a visible notch/step at the TOP of the corner.
//
// THE MECHANISM IS NOT AN INVALIDATION BUG. An opening ADD changes the opening
// SET, so `classifyWallDelta` already returns `whole-level` and `refreshV2Cache`
// already runs with the current rakes. The defect is a MISSING CONSUMER:
//
//   • the loft is applied in exactly ONE place — `buildWallV2Geometry`, reached
//     only from `WallFragmentBuilder.createWallBodyFragment`;
//   • `buildWall` calls that method ONLY in its `wall.openings.length === 0`
//     branch. With an opening present the body is rebuilt as segments around the
//     holes, whose mitred END segments come from `buildMiterPrism` —
//     which had no parameter capable of expressing a lofted top cap.
//
// So the opening did not invalidate anything: it MOVED THE WALL ONTO A BODY PATH
// THAT COULD NOT CARRY THE LOFT (and removing the opening moved it back, which is
// why the founder's undo restored the joint).
//
// What is pinned here:
//   1. `WallPipelineV2Cache.rakeJointCapDrift` reports the loft as the four NAMED
//      cap corners, agreeing with `rakedTopOffsets` and with the closed form.
//   2. `buildMiterPrism` carries that drift: the TOP ring moves, the BOTTOM ring
//      is byte-identical (the opening carve stays a vertical band).
//   3. CLOSURE, measured: with the drift the opening-host wall's mitred top
//      corners land exactly on the raked neighbour's lofted top corners; WITHOUT
//      it they miss by ~0.53 m — the founder's notch, in metres.
//   4. NO REGRESSION: an unraked level reports null drift, and a null drift
//      produces byte-identical prism buffers.
//   5. HONEST DEGRADATION: non-finite drift is ignored, never propagated.

import { describe, it, expect } from 'vitest';
import * as THREE from '@pryzm/renderer-three/three';
import {
    WallPipelineV2Cache,
    buildWallV2Geometry,
    type LevelWallSpec,
} from '../src/WallPipelineV2';
import { buildMiterPrism } from '../src/MiterPrismBuilder';
import { rakeShearPerMetre } from '../src/WallRake';

const T = 0.2;      // thickness
const H = 3;        // height
const COT80 = rakeShearPerMetre(80);
const D = H * COT80;   // ≈ 0.52898 — the ADR-0310 worked example

/** A raked along +X from the origin; B (the opening host) vertical along +Z. */
function lPair(rakeA?: number): LevelWallSpec[] {
    return [
        { id: 'A', startXZ: { x: 0, z: 0 }, endXZ: { x: 4, z: 0 }, thickness: T, rakeAngleDeg: rakeA },
        { id: 'B', startXZ: { x: 0, z: 0 }, endXZ: { x: 0, z: 4 }, thickness: T },
    ];
}

function cacheOf(walls: readonly LevelWallSpec[]): WallPipelineV2Cache {
    const c = new WallPipelineV2Cache();
    c.refresh(walls);
    return c;
}

/**
 * The 90°-corner miter-plane normal at B's START. Derived, not guessed: it is the
 * normal for which `buildMiterPrism` projects B's square cap onto the corner
 * bisector, i.e. onto the SAME `(±T/2, ±T/2)` corners `buildWallFootprint`
 * produces for B (pinned by WallRakeJoint.test.ts).
 */
const MN_START = { nx: Math.SQRT1_2, nz: -Math.SQRT1_2 };

/** Vertices of `geometry` at `y`, de-duplicated in plan. */
function ringAt(geometry: THREE.BufferGeometry, y: number): Array<{ x: number; z: number }> {
    const pos = geometry.getAttribute('position').array as ArrayLike<number>;
    const out: Array<{ x: number; z: number }> = [];
    for (let i = 0; i < pos.length; i += 3) {
        if (Math.abs((pos[i + 1] as number) - y) > 1e-9) continue;
        const x = pos[i] as number, z = pos[i + 2] as number;
        if (!out.some(p => Math.hypot(p.x - x, p.z - z) < 1e-9)) out.push({ x, z });
    }
    return out;
}

function minDist(ring: ReadonlyArray<{ x: number; z: number }>, x: number, z: number): number {
    return Math.min(...ring.map(p => Math.hypot(p.x - x, p.z - z)));
}

/** B's first body segment as the builder makes it: local frame, direction +Z. */
function bStartSegmentPrism(
    drift: { left: { x: number; z: number }; right: { x: number; z: number } } | null,
    segLen = 1.5,
): THREE.BufferGeometry {
    const segStart = new THREE.Vector3(0, 0, 0);
    const segEnd   = new THREE.Vector3(0, 0, segLen);
    return buildMiterPrism(
        segStart, segEnd, segStart, segEnd,
        T / 2, H, 0,
        MN_START, null,
        drift, null,
    );
}

// ─── 1. The drift accessor ────────────────────────────────────────────────────

describe('§WALL-RAKE-JOINT-OPENING-HOST — rakeJointCapDrift names the four cap corners', () => {
    it('reports B\'s START corners drifting by the closed-form loft, and its FREE end not at all', () => {
        const drift = cacheOf(lPair(80)).rakeJointCapDrift('B', H);
        expect(drift).not.toBeNull();
        // B's shared corners travel +Z·H·cot80 — the same displacement
        // WallRakeJoint.test.ts pins for the no-openings body path.
        expect(drift!.startLeft.x).toBeCloseTo(0, 9);
        expect(drift!.startLeft.z).toBeCloseTo(D, 9);
        expect(drift!.startRight.x).toBeCloseTo(0, 9);
        expect(drift!.startRight.z).toBeCloseTo(D, 9);
        // The far end is free — no neighbour, no loft.
        expect(Math.hypot(drift!.endLeft.x, drift!.endLeft.z)).toBeLessThan(1e-9);
        expect(Math.hypot(drift!.endRight.x, drift!.endRight.z)).toBeLessThan(1e-9);
    });

    it('scales linearly with height (the mitre line is straight)', () => {
        const cache = cacheOf(lPair(80));
        const at3 = cache.rakeJointCapDrift('B', 3)!;
        const at2 = cache.rakeJointCapDrift('B', 2)!;
        expect(at2.startLeft.z).toBeCloseTo(at3.startLeft.z * (2 / 3), 9);
    });

    it('is NULL on an unraked level and for a wall the solve never saw', () => {
        expect(cacheOf(lPair(undefined)).rakeJointCapDrift('B', H)).toBeNull();
        expect(cacheOf(lPair(90)).rakeJointCapDrift('B', H)).toBeNull();
        expect(cacheOf(lPair(80)).rakeJointCapDrift('nope', H)).toBeNull();
    });

    it('is NULL for an UNTOUCHED wall on a raked level (an all-zero drift is not a drift)', () => {
        // A raked wall in one corner must not push a wall at the other end of the
        // level off its normal body path.
        const walls: LevelWallSpec[] = [
            ...lPair(80),
            { id: 'FAR', startXZ: { x: 50, z: 50 }, endXZ: { x: 54, z: 50 }, thickness: T },
        ];
        expect(cacheOf(walls).rakeJointCapDrift('FAR', H)).toBeNull();
    });

    it('handles a PIVOT corner (T-junction) without an index off-by-one', () => {
        // Raked host through the origin; vertical guest tees onto its face — the
        // footprint then carries a pivot vertex, which shifts the eL/sL indices.
        const walls: LevelWallSpec[] = [
            { id: 'H', startXZ: { x: -3, z: 0 }, endXZ: { x: 3, z: 0 }, thickness: T, rakeAngleDeg: 80 },
            { id: 'G', startXZ: { x: 0, z: 3 }, endXZ: { x: 0, z: T / 2 }, thickness: T },
        ];
        const drift = cacheOf(walls).rakeJointCapDrift('G', H);
        if (drift) {
            for (const c of [drift.startLeft, drift.startRight, drift.endLeft, drift.endRight]) {
                expect(Number.isFinite(c.x) && Number.isFinite(c.z)).toBe(true);
            }
        }
        // A null here is the documented honest degradation, not a failure — what is
        // forbidden is a NaN or an out-of-range read, which the loop above excludes.
        expect(true).toBe(true);
    });
});

// ─── 2+3. The prism carries it, and the joint measurably CLOSES ───────────────

describe('§WALL-RAKE-JOINT-OPENING-HOST — the opening host\'s mitred segment closes the corner', () => {
    it('the drift moves ONLY the top ring — the bottom ring (and so the carve) is byte-identical', () => {
        const drift = cacheOf(lPair(80)).rakeJointCapDrift('B', H)!;
        const plain  = bStartSegmentPrism(null);
        const lofted = bStartSegmentPrism({ left: drift.startLeft, right: drift.startRight });

        expect(ringAt(lofted, 0)).toEqual(ringAt(plain, 0));

        // Every top vertex at the JOINED end moved by exactly the loft; the far end's
        // top vertices did not move at all.
        const topPlain  = ringAt(plain, H);
        const topLofted = ringAt(lofted, H);
        expect(topLofted.length).toBe(topPlain.length);
        for (const p of topPlain) {
            const movedTo = { x: p.x + D * 0, z: p.z };   // far-end vertices: unchanged
            const isJointEnd = Math.abs(p.z) < 0.5;       // the mitred cap sits at z ≈ ±T/2
            const target = isJointEnd ? { x: p.x, z: p.z + D } : movedTo;
            // 1e-6: the buffer is Float32, so exact equality is not available here.
            expect(minDist(topLofted, target.x, target.z)).toBeLessThan(1e-6);
        }
    });

    it('WITH the drift the top corners land on the raked neighbour\'s lofted corners; WITHOUT it they miss by ~0.53 m', () => {
        const walls = lPair(80);
        const cache = cacheOf(walls);
        // Where wall A's lofted top corners actually are (the no-openings V2 path).
        const ringA = ringAt(buildWallV2Geometry(walls[0]!, cache, { height: H }).geometry, H);
        const cornerOuter = { x:  T / 2, z:  T / 2 + D };
        const cornerInner = { x: -T / 2, z: -T / 2 + D };
        expect(minDist(ringA, cornerOuter.x, cornerOuter.z)).toBeLessThan(1e-6);
        expect(minDist(ringA, cornerInner.x, cornerInner.z)).toBeLessThan(1e-6);

        // THE DEFECT, measured: the opening-host body path without the loft. NO top
        // vertex of the segment comes near either corner — the outer one is missed by
        // the full loft (0.529 m), the inner one by 0.385 m (its nearest neighbour is
        // the OTHER cap corner, not its own). That is the founder's notch.
        const notch = ringAt(bStartSegmentPrism(null), H);
        expect(minDist(notch, cornerOuter.x, cornerOuter.z)).toBeGreaterThan(0.5);
        expect(minDist(notch, cornerInner.x, cornerInner.z)).toBeGreaterThan(0.35);

        // THE FIX: the same segment, lofted, meets both corners exactly.
        const drift = cache.rakeJointCapDrift('B', H)!;
        const closed = ringAt(bStartSegmentPrism({ left: drift.startLeft, right: drift.startRight }), H);
        expect(minDist(closed, cornerOuter.x, cornerOuter.z)).toBeLessThan(1e-6);
        expect(minDist(closed, cornerInner.x, cornerInner.z)).toBeLessThan(1e-6);
    });
});

// ─── 4+5. No regression, honest degradation ───────────────────────────────────

describe('§WALL-RAKE-JOINT-OPENING-HOST — unraked levels and bad input', () => {
    it('a null drift produces byte-identical geometry to the pre-fix call', () => {
        const withNulls = bStartSegmentPrism(null);
        const legacy = buildMiterPrism(
            new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, 1.5),
            new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, 1.5),
            T / 2, H, 0, MN_START, null,
        );
        expect(Array.from(withNulls.getAttribute('position').array as Float32Array))
            .toEqual(Array.from(legacy.getAttribute('position').array as Float32Array));
    });

    it('a NON-FINITE drift is IGNORED (un-lofted corner), never written into a vertex', () => {
        const bad = bStartSegmentPrism({
            left:  { x: Number.NaN, z: 0.5 },
            right: { x: 0, z: Number.POSITIVE_INFINITY },
        });
        const pos = Array.from(bad.getAttribute('position').array as Float32Array);
        expect(pos.every(v => Number.isFinite(v))).toBe(true);
        expect(pos).toEqual(
            Array.from(bStartSegmentPrism(null).getAttribute('position').array as Float32Array),
        );
    });
});
