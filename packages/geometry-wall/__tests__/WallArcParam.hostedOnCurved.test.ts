/**
 * §FEAT-HOSTED-ON-CURVED-WALL — arc-length parameterisation of a wall centreline.
 *
 * These tests assert GEOMETRY NUMERICALLY, not "it didn't throw". Together with
 * CurvedWallOpeningCarve.test.ts they cover the founder's requirement that doors
 * and windows become first-class on curved walls:
 *
 *   • an opening at arc length `s` lands at the correct WORLD position with the
 *     correct TANGENT orientation;
 *   • overlap detection uses ARC length — two openings that chord maths judges
 *     wrongly are judged correctly here;
 *   • straight-wall behaviour is bit-for-bit UNCHANGED (regression).
 */

import { describe, it, expect, afterEach } from 'vitest';
import {
    wallCentreline,
    wallCentrelineLength,
    arcFrameAt,
    arcLengthAtPointXZ,
    hostedElementFrame,
    isArcHost,
    type ArcHostWall,
} from '../src/WallArcParam';

// ── Fixtures ──────────────────────────────────────────────────────────────────

/** Straight wall, 6 m along +X from the origin. */
const STRAIGHT: ArcHostWall = {
    baseLine: [{ x: 0, y: 0, z: 0 }, { x: 6, y: 0, z: 0 }],
};

/**
 * Curved wall: quadratic Bézier from (0,0) to (6,0) bulging +2 m in Z through the
 * control point (3, 2). Its CHORD is exactly 6 m; its ARC is measurably longer,
 * which is the whole point of these tests.
 */
const CURVED: ArcHostWall = {
    baseLine: [{ x: 0, y: 0, z: 0 }, { x: 6, y: 0, z: 0 }],
    curve: { control: { x: 3, y: 0, z: 4 }, segments: 32 },
};

/** A near-semicircular arc: chord 6 m, control far out — a hard case. */
const DEEP_CURVED: ArcHostWall = {
    baseLine: [{ x: 0, y: 0, z: 0 }, { x: 6, y: 0, z: 0 }],
    curve: { control: { x: 3, y: 0, z: 8 }, segments: 64 },
};

afterEach(() => {
    delete (globalThis as { __pryzmHostedOnCurvedWall?: boolean }).__pryzmHostedOnCurvedWall;
});

// ── Regression: straight walls are untouched ──────────────────────────────────

describe('§FEAT-HOSTED-ON-CURVED-WALL — straight-wall regression', () => {
    it('wallCentrelineLength on a straight wall is exactly the chord length', () => {
        expect(wallCentrelineLength(STRAIGHT)).toBeCloseTo(6, 12);
    });

    it('arcFrameAt reproduces the C15 §2 formula baseLine[0] + s × wallDir exactly', () => {
        for (const s of [0, 0.5, 1.7, 3, 5.999, 6]) {
            const f = arcFrameAt(STRAIGHT, s);
            expect(f.x).toBeCloseTo(s, 12);
            expect(f.z).toBeCloseTo(0, 12);
            expect(f.tx).toBeCloseTo(1, 12);
            expect(f.tz).toBeCloseTo(0, 12);
            expect(f.angleY).toBeCloseTo(0, 12);
        }
    });

    it('arcLengthAtPointXZ reproduces dot(p − start, wallDir), clamped', () => {
        expect(arcLengthAtPointXZ(STRAIGHT, 2.5, 1.3).s).toBeCloseTo(2.5, 12);
        expect(arcLengthAtPointXZ(STRAIGHT, -4, 0).s).toBeCloseTo(0, 12);
        expect(arcLengthAtPointXZ(STRAIGHT, 99, 0).s).toBeCloseTo(6, 12);
    });

    it('hostedElementFrame reproduces worldCentre = start + (offset + width/2) × dir', () => {
        const hf = hostedElementFrame(STRAIGHT, 3.607, 1.2);
        expect(hf.x).toBeCloseTo(3.607 + 0.6, 12);
        expect(hf.z).toBeCloseTo(0, 12);
        expect(hf.rotationY).toBeCloseTo(0, 12);
    });

    it('a rotated straight wall keeps a constant heading equal to its direction', () => {
        const diag: ArcHostWall = { baseLine: [{ x: 1, z: 1 }, { x: 4, z: 5 }] };
        expect(wallCentrelineLength(diag)).toBeCloseTo(5, 12);
        const f = arcFrameAt(diag, 2.5);
        expect(f.x).toBeCloseTo(1 + 0.6 * 2.5, 12);
        expect(f.z).toBeCloseTo(1 + 0.8 * 2.5, 12);
        expect(f.angleY).toBeCloseTo(Math.atan2(0.8, 0.6), 12);
    });
});

// ── Arc length is not chord length ────────────────────────────────────────────

describe('§FEAT-HOSTED-ON-CURVED-WALL — arc vs chord', () => {
    it('a curved wall is measurably LONGER than its chord', () => {
        const chord = 6;
        const arc = wallCentrelineLength(CURVED);
        expect(arc).toBeGreaterThan(chord + 0.5);
        // Analytic sanity bound: the arc can never exceed the control polygon.
        const controlPolygon = Math.hypot(3, 4) * 2; // start→ctrl + ctrl→end
        expect(arc).toBeLessThan(controlPolygon);
    });

    it('sampling matches the builder tessellation exactly (segments + 1 stations)', () => {
        const cl = wallCentreline(CURVED);
        expect(cl.curved).toBe(true);
        expect(cl.pts.length).toBe(33);
        expect(cl.cum.length).toBe(33);
        expect(cl.cum[0]).toBe(0);
        expect(cl.cum[32]).toBeCloseTo(cl.length, 12);
        // Monotonic — a non-monotonic cumulative table would break every lookup.
        for (let i = 1; i < cl.cum.length; i++) {
            expect(cl.cum[i]!).toBeGreaterThan(cl.cum[i - 1]!);
        }
    });

    it('endpoints are exact: s=0 is baseLine[0] and s=length is baseLine[1]', () => {
        const L = wallCentrelineLength(CURVED);
        const a = arcFrameAt(CURVED, 0);
        const b = arcFrameAt(CURVED, L);
        expect(a.x).toBeCloseTo(0, 12);
        expect(a.z).toBeCloseTo(0, 12);
        expect(b.x).toBeCloseTo(6, 12);
        expect(b.z).toBeCloseTo(0, 12);
    });

    it('the arc-length midpoint is NOT the chord midpoint (this is the bug chord maths causes)', () => {
        const L = wallCentrelineLength(DEEP_CURVED);
        const mid = arcFrameAt(DEEP_CURVED, L / 2);
        // By symmetry the arc midpoint is on the axis of symmetry, x = 3.
        expect(mid.x).toBeCloseTo(3, 6);
        // A chord-parameterised "half way" (s = 3 of a 6 m chord) is somewhere else.
        const chordHalf = arcFrameAt(DEEP_CURVED, 3);
        expect(Math.abs(chordHalf.x - mid.x)).toBeGreaterThan(0.5);
    });
});

// ── Position + tangent orientation ────────────────────────────────────────────

describe('§FEAT-HOSTED-ON-CURVED-WALL — world position and tangent orientation', () => {
    it('an opening at arc length s lands ON the wall centreline', () => {
        const L = wallCentrelineLength(CURVED);
        for (const frac of [0.05, 0.25, 0.5, 0.75, 0.95]) {
            const s = L * frac;
            const f = arcFrameAt(CURVED, s);
            // Round-tripping the world point back through the inverse map must
            // return the same arc length — the placement/drag round trip.
            const back = arcLengthAtPointXZ(CURVED, f.x, f.z);
            expect(back.s).toBeCloseTo(s, 6);
            expect(back.distance).toBeCloseTo(0, 6);
        }
    });

    it('the frame is oriented to the TANGENT, not the chord', () => {
        const L = wallCentrelineLength(CURVED);
        const start = arcFrameAt(CURVED, 0.0001);
        const end = arcFrameAt(CURVED, L - 0.0001);
        // Chord heading is 0 (start→end is +X). The tangents at the two ends of a
        // symmetric bulge are equal and opposite in Z, and NEITHER is the chord.
        expect(start.angleY).toBeGreaterThan(0.5);
        expect(end.angleY).toBeLessThan(-0.5);
        expect(start.angleY).toBeCloseTo(-end.angleY, 4);
        // Tangent is a unit vector everywhere.
        for (const f of [start, end, arcFrameAt(CURVED, L / 2)]) {
            expect(Math.hypot(f.tx, f.tz)).toBeCloseTo(1, 12);
            expect(Math.hypot(f.nx, f.nz)).toBeCloseTo(1, 12);
            // Normal ⟂ tangent.
            expect(f.tx * f.nx + f.tz * f.nz).toBeCloseTo(0, 12);
        }
    });

    it('hostedElementFrame centres the element at offset + width/2 along the ARC', () => {
        const offset = 2.0;
        const width = 1.2;
        const hf = hostedElementFrame(CURVED, offset, width);
        const expected = arcFrameAt(CURVED, offset + width / 2);
        expect(hf.x).toBeCloseTo(expected.x, 12);
        expect(hf.z).toBeCloseTo(expected.z, 12);
        expect(hf.rotationY).toBeCloseTo(-expected.angleY, 12);
        // The Three.js sign convention the builders rely on.
        expect(hf.rotationY).toBeCloseTo(-Math.atan2(expected.tz, expected.tx), 12);
    });

    it('the tangent at an opening centre differs from the CHORD of the opening span', () => {
        // The chord of the opening span [offset, offset+width] is what a
        // sub-segment host would give. It must not equal the true tangent.
        const offset = 0.4;
        const width = 1.6;
        const a = arcFrameAt(DEEP_CURVED, offset);
        const b = arcFrameAt(DEEP_CURVED, offset + width);
        const spanChordAngle = Math.atan2(b.z - a.z, b.x - a.x);
        const centreTangent = arcFrameAt(DEEP_CURVED, offset + width / 2).angleY;
        expect(Math.abs(spanChordAngle - centreTangent)).toBeGreaterThan(1e-3);
    });
});

// ── Escape hatch ──────────────────────────────────────────────────────────────

describe('§FEAT-HOSTED-ON-CURVED-WALL — escape hatch', () => {
    it('is default-ON', () => {
        expect(isArcHost(CURVED)).toBe(true);
        expect(wallCentrelineLength(CURVED)).toBeGreaterThan(6.5);
    });

    it('__pryzmHostedOnCurvedWall = false reverts a curved wall to chord maths', () => {
        (globalThis as { __pryzmHostedOnCurvedWall?: boolean }).__pryzmHostedOnCurvedWall = false;
        expect(isArcHost(CURVED)).toBe(false);
        expect(wallCentrelineLength(CURVED)).toBeCloseTo(6, 12);
        const f = arcFrameAt(CURVED, 3);
        expect(f.x).toBeCloseTo(3, 12);
        expect(f.z).toBeCloseTo(0, 12);
    });

    it('never treats a straight wall as an arc host, in either mode', () => {
        expect(isArcHost(STRAIGHT)).toBe(false);
        (globalThis as { __pryzmHostedOnCurvedWall?: boolean }).__pryzmHostedOnCurvedWall = false;
        expect(isArcHost(STRAIGHT)).toBe(false);
    });

    it('rejects a NaN control point rather than producing NaN geometry', () => {
        const bad: ArcHostWall = {
            baseLine: [{ x: 0, z: 0 }, { x: 6, z: 0 }],
            curve: { control: { x: Number.NaN, z: 0 }, segments: 16 },
        };
        expect(isArcHost(bad)).toBe(false);
        expect(wallCentrelineLength(bad)).toBeCloseTo(6, 12);
    });
});

// ── Degenerate inputs ─────────────────────────────────────────────────────────

describe('§FEAT-HOSTED-ON-CURVED-WALL — degenerate inputs stay finite', () => {
    it('a zero-length wall yields a finite frame, never NaN', () => {
        const zero: ArcHostWall = { baseLine: [{ x: 2, z: 2 }, { x: 2, z: 2 }] };
        const f = arcFrameAt(zero, 1);
        expect(Number.isFinite(f.x)).toBe(true);
        expect(Number.isFinite(f.z)).toBe(true);
        expect(Number.isFinite(f.angleY)).toBe(true);
    });

    it('s outside [0, length] is clamped, never extrapolated off the wall', () => {
        const L = wallCentrelineLength(CURVED);
        expect(arcFrameAt(CURVED, -10).s).toBe(0);
        expect(arcFrameAt(CURVED, L + 10).s).toBeCloseTo(L, 12);
        expect(arcFrameAt(CURVED, Number.NaN).s).toBe(0);
    });
});
