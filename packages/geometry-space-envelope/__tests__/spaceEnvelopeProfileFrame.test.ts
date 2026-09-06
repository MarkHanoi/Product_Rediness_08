// §RESI-STAGE-G (2026-09-06) · C114 §11 item 7 / §10b — the footprint ↔ authoring-frame map.
//
// ⭐ WHAT THIS FILE IS FOR, AND WHAT IT DELIBERATELY DOES NOT ESTABLISH.
// It pins the ARITHMETIC that lets the shared outline surface author a space envelope's
// footprint: the round trip, the flip, the headroom rule, and the four named refusals. It
// establishes NOTHING about the dialog, the tool, the command, or whether any of it is
// reachable from a gesture — those are the tool spec's and the wiring's business, and a
// green file here is not evidence of a working feature (C114 §0.2 / §14a).

import { describe, expect, it } from 'vitest';
import {
    footprintFromProfileRing,
    headroomFor,
    isProfileFrameRefusal,
    spaceEnvelopeProfileFrame,
    MAX_PROFILE_HEADROOM_M,
    MIN_PROFILE_HEADROOM_M,
    PROFILE_HEADROOM_FRACTION,
    type SpaceEnvelopeProfileFrame,
} from '../src/index.js';

/** A 12 × 8 m rectangle sitting at a NEGATIVE world origin — the case a bbox-free map breaks on. */
const RECT = [
    { x: -40, z: -25 },
    { x: -28, z: -25 },
    { x: -28, z: -17 },
    { x: -40, z: -17 },
];

function frameOf(fp: readonly { x: number; z: number }[], headroomM?: number): SpaceEnvelopeProfileFrame {
    const r = spaceEnvelopeProfileFrame(fp, headroomM === undefined ? {} : { headroomM });
    if (isProfileFrameRefusal(r)) throw new Error(`expected a frame, got ${r.code}: ${r.message}`);
    return r;
}

describe('spaceEnvelopeProfileFrame — the frame', () => {
    it('places the ring inside the box with the headroom on all four sides', () => {
        const f = frameOf(RECT, 2);
        // 12 × 8 grown by 2 on each side.
        expect(f.length).toBe(16);
        expect(f.height).toBe(12);
        expect(f.originX).toBe(-42);
        expect(f.originZ).toBe(-27);
        // Every authored vertex is strictly inside the clamp box, so every one of them can
        // be dragged in EITHER direction — the property the headroom exists for.
        for (const p of f.ring) {
            expect(p.u).toBeGreaterThan(0);
            expect(p.u).toBeLessThan(f.length);
            expect(p.v).toBeGreaterThan(0);
            expect(p.v).toBeLessThan(f.height);
        }
    });

    it('flips v against world Z, so the drawing is not a mirror of the plan', () => {
        const f = frameOf(RECT, 2);
        // minZ (-25, the NORTH edge) must draw at the TOP of the surface, i.e. the LARGER v,
        // because the surface paints v upward. Getting this backwards produces a ring that is
        // entirely in-bounds and silently mirrored.
        const vAtMinZ = f.ring[0]!.v;   // z = -25
        const vAtMaxZ = f.ring[2]!.v;   // z = -17
        expect(vAtMinZ).toBeGreaterThan(vAtMaxZ);
        expect(vAtMinZ).toBe(10);       // height 12 - ((-25) - (-27)) = 10
        expect(vAtMaxZ).toBe(2);
    });

    it('round-trips EXACTLY — the ring it produced maps back to the footprint it was given', () => {
        const f = frameOf(RECT);
        const back = footprintFromProfileRing(f, f.ring);
        expect(back).toHaveLength(RECT.length);
        back.forEach((p, i) => {
            expect(p.x).toBeCloseTo(RECT[i]!.x, 12);
            expect(p.z).toBeCloseTo(RECT[i]!.z, 12);
            // A footprint is a ring ON the level plane; baseOffset lifts the prism (C114 §0).
            expect(p.y).toBe(0);
        });
    });

    it('round-trips a NON-orthogonal ring too — the map is affine, not axis-special', () => {
        const tri = [{ x: 3.5, z: -1.25 }, { x: 11.75, z: 2.5 }, { x: 6, z: 9.125 }];
        const f = frameOf(tri);
        const back = footprintFromProfileRing(f, f.ring);
        back.forEach((p, i) => {
            expect(p.x).toBeCloseTo(tri[i]!.x, 12);
            expect(p.z).toBeCloseTo(tri[i]!.z, 12);
        });
    });

    it('carries an EDITED vertex back to the world position the author dragged it to', () => {
        const f = frameOf(RECT, 2);
        // Pull vertex 1 (world x = -28) 1.5 m further out in +X, and 0.5 m in +Z (v DOWN).
        const edited = f.ring.map((p, i) => (i === 1 ? { u: p.u + 1.5, v: p.v - 0.5 } : p));
        const back = footprintFromProfileRing(f, edited);
        expect(back[1]!.x).toBeCloseTo(-26.5, 12);
        expect(back[1]!.z).toBeCloseTo(-24.5, 12);
        // The untouched vertices did not move — an off-by-one in the map would show here.
        expect(back[0]!.x).toBeCloseTo(-40, 12);
        expect(back[3]!.z).toBeCloseTo(-17, 12);
    });
});

describe('headroomFor — the RULE, not an observed number', () => {
    it('is the declared fraction of the larger side between the two bounds', () => {
        expect(headroomFor(20, 12)).toBeCloseTo(PROFILE_HEADROOM_FRACTION * 20, 12);
    });
    it('floors at MIN for a small room', () => {
        expect(headroomFor(1.2, 1)).toBe(MIN_PROFILE_HEADROOM_M);
    });
    it('ceilings at MAX for a large storey, so the ring is not drawn as a stamp', () => {
        expect(headroomFor(200, 60)).toBe(MAX_PROFILE_HEADROOM_M);
        const f = frameOf([{ x: 0, z: 0 }, { x: 200, z: 0 }, { x: 200, z: 60 }, { x: 0, z: 60 }]);
        expect(f.headroomM).toBe(MAX_PROFILE_HEADROOM_M);
        expect(f.length).toBe(220);
    });
});

describe('spaceEnvelopeProfileFrame — the refusals, each by NAME and with its numbers', () => {
    it('refuses fewer than three vertices, stating how many there were', () => {
        const r = spaceEnvelopeProfileFrame([{ x: 0, z: 0 }, { x: 1, z: 0 }]);
        expect(isProfileFrameRefusal(r)).toBe(true);
        if (!isProfileFrameRefusal(r)) return;
        expect(r.code).toBe('TOO_FEW_VERTICES');
        expect(r.message).toContain('2');
    });

    it('refuses a non-finite vertex, naming its INDEX rather than dropping it', () => {
        const r = spaceEnvelopeProfileFrame([{ x: 0, z: 0 }, { x: Number.NaN, z: 4 }, { x: 4, z: 4 }]);
        expect(isProfileFrameRefusal(r)).toBe(true);
        if (!isProfileFrameRefusal(r)) return;
        expect(r.code).toBe('NON_FINITE_VERTEX');
        expect(r.message).toContain('vertex 1');
    });

    it('refuses a zero-extent ring with BOTH measured extents', () => {
        // A line along X: no Z extent at all.
        const r = spaceEnvelopeProfileFrame([{ x: 0, z: 5 }, { x: 6, z: 5 }, { x: 3, z: 5 }]);
        expect(isProfileFrameRefusal(r)).toBe(true);
        if (!isProfileFrameRefusal(r)) return;
        expect(r.code).toBe('DEGENERATE_EXTENT');
        expect(r.message).toContain('6.000');
        expect(r.message).toContain('0.000');
    });

    it('refuses a ring that bounds no area even though both extents are real', () => {
        // A "bow tie" collapsed onto itself: bbox is 4 × 4, enclosed area is 0.
        const r = spaceEnvelopeProfileFrame([
            { x: 0, z: 0 }, { x: 4, z: 4 }, { x: 0, z: 0 }, { x: 4, z: 4 },
        ]);
        expect(isProfileFrameRefusal(r)).toBe(true);
        if (!isProfileFrameRefusal(r)) return;
        expect(r.code).toBe('DEGENERATE_AREA');
    });

    it('NEVER repairs — a refused footprint comes back as a refusal, not a padded ring', () => {
        const r = spaceEnvelopeProfileFrame([{ x: 0, z: 0 }, { x: 1, z: 1 }]);
        expect('ring' in (r as object)).toBe(false);
    });
});
