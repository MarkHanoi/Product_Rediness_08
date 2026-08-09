/**
 * §FIX-HOSTED-PLAN-SYMBOL-ON-CURVED-HOST — the plan symbol and the 3-D door must
 * resolve the SAME station on the host wall.
 *
 * ── The defect this test exists to pin ───────────────────────────────────────
 * `DoorBuilder.positionGroup` places the 3-D door via `hostedElementFrame()`,
 * i.e. at ARC LENGTH `offset + width/2` along the wall CENTRELINE, oriented to
 * the local TANGENT (§FEAT-HOSTED-ON-CURVED-WALL, C15 §2 generalised).
 * `DoorPlanSymbolBuilder._computeSwingGeometry` measured the same `offset` along
 * the CHORD (`baseLine[0] + offset·normalise(baseLine[1]−baseLine[0])`).
 *
 * On a straight wall the chord IS the centreline, so the two agree exactly. On a
 * curved wall they diverge PROGRESSIVELY along the curve — which is precisely the
 * founder's report: in 3-D the door sits on the arc, in plan the swing symbol
 * floats clear of the wall, displaced toward the arc's end.
 *
 * ── What is asserted ─────────────────────────────────────────────────────────
 *  1. STRAIGHT host — plan symbol ≡ 3-D resolver (must hold before AND after).
 *  2. CURVED host   — plan symbol ≡ 3-D resolver (the fix).
 *  3. The jamb ticks land on the VOID EDGES *measured along the arc*
 *     (C15 §2 `voidStart`/`voidEnd`, generalised: arc length `offset` and
 *     `offset + width`) and are RADIAL — perpendicular to the LOCAL tangent at
 *     their own station, not to the chord.
 *  4. The leaf/swing arc is rotated to the LOCAL TANGENT at the hinge station.
 *  5. The numeric size of the chord-vs-arc divergence is recorded, so a
 *     regression cannot pass unnoticed.
 */

import { describe, it, expect } from 'vitest';
import {
    hostedElementFrame,
    wallCentrelineLength,
    arcFrameAt,
    type ArcHostWall,
} from '@pryzm/geometry-wall';
import { DoorPlanSymbolBuilder } from '../src/DoorPlanSymbolBuilder';
import { DEFAULT_DOOR_DIMENSIONS } from '../src/DoorDimensions';

type Lod = 'coarse' | 'medium' | 'fine';

const THK = 0.2;
const HALF_THK = THK / 2;
const FRAME_T = DEFAULT_DOOR_DIMENSIONS.frameThickness;   // 0.05

/** Straight host along +X, 8 m. */
const STRAIGHT = {
    id: 'w-straight',
    baseLine: [{ x: 0, z: 0 }, { x: 8, z: 0 }],
    thickness: THK,
    levelId: 'L0',
};

/**
 * Curved host: the SAME endpoints, bowed by a quadratic Bézier control point.
 * Its arc is materially longer than its chord, so chord-measured and
 * arc-measured stations cannot coincide anywhere except at s = 0.
 */
const CURVED = {
    id: 'w-curved',
    baseLine: [{ x: 0, z: 0 }, { x: 8, z: 0 }],
    curve: { control: { x: 4, z: -6 }, segments: 24 },
    thickness: THK,
    levelId: 'L0',
};

const DOOR_OFFSET = 6.0;
const DOOR_WIDTH = 0.9;
const HALF_W = DOOR_WIDTH / 2;
const CLEAR_HALF = HALF_W - FRAME_T;

/**
 * Position tolerance. The symbol's vertices land in a `Float32BufferAttribute`,
 * so ~1e-7 of float32 quantisation on an 8 m coordinate is the floor; anything
 * tighter would be asserting on the storage format, not on the geometry. The
 * defect this file pins is measured in METRES (see the recorded divergence).
 */
const TOL = 1e-5;

function door(overrides: Record<string, unknown> = {}) {
    return {
        id: 'd1', wallId: 'w1',
        width: DOOR_WIDTH, offset: DOOR_OFFSET,
        doorType: 'single' as const,
        hingesSide: 'left', swingDirection: 'inward',
        ...overrides,
    };
}

type Geo = { getAttribute(n: string): { array: ArrayLike<number> } } | null;
interface Geos { cut: Geo; proj: Geo; ghost: Geo }

function build(wall: unknown, d: unknown, lod: Lod = 'coarse') {
    const builder = new DoorPlanSymbolBuilder();
    const geos = (builder as unknown as {
        _computeSwingGeometry(d: unknown, w: unknown, lod: Lod): Geos | null;
    })._computeSwingGeometry(d, wall, lod);
    expect(geos).not.toBeNull();
    const flat = (g: Geo) => Array.from(g?.getAttribute('position').array ?? []);
    return { cut: flat(geos!.cut), proj: flat(geos!.proj), ghost: flat(geos!.ghost) };
}

/** Flat [x,y,z,…] → segment list [{ax,az,bx,bz}]. */
function segs(flat: number[]): Array<{ ax: number; az: number; bx: number; bz: number }> {
    const out = [];
    for (let i = 0; i + 5 < flat.length; i += 6) {
        out.push({ ax: flat[i]!, az: flat[i + 2]!, bx: flat[i + 3]!, bz: flat[i + 5]! });
    }
    return out;
}

const mid = (s: { ax: number; az: number; bx: number; bz: number }) =>
    ({ x: (s.ax + s.bx) / 2, z: (s.az + s.bz) / 2 });

const dist = (a: { x: number; z: number }, b: { x: number; z: number }) =>
    Math.hypot(a.x - b.x, a.z - b.z);

// ── 0. The premise: the two hosts really do differ ───────────────────────────

describe('the curved host has an arc materially longer than its chord', () => {
    it('records the divergence the symbol must not ignore', () => {
        expect(wallCentrelineLength(STRAIGHT)).toBeCloseTo(8, 9);
        const arc = wallCentrelineLength(CURVED as ArcHostWall);
        expect(arc).toBeGreaterThan(10);          // ~10.39 m for this bow
        // A station 6 m ALONG THE ARC is nowhere near 6 m along the chord.
        const onArc = arcFrameAt(CURVED as ArcHostWall, DOOR_OFFSET);
        expect(Math.hypot(onArc.x - DOOR_OFFSET, onArc.z - 0)).toBeGreaterThan(1.5);
    });
});

// ── 1. STRAIGHT host — the two resolvers already agree ───────────────────────

describe('straight host — plan symbol and 3-D resolver agree (must never regress)', () => {
    const g = build(STRAIGHT, door());
    const ticks = segs(g.cut).slice(0, 2);

    it('left jamb tick sits at arc length `offset`', () => {
        const f = arcFrameAt(STRAIGHT, DOOR_OFFSET);
        expect(dist(mid(ticks[0]!), { x: f.x, z: f.z })).toBeLessThan(TOL);
    });

    it('right jamb tick sits at arc length `offset + width`', () => {
        const f = arcFrameAt(STRAIGHT, DOOR_OFFSET + DOOR_WIDTH);
        expect(dist(mid(ticks[1]!), { x: f.x, z: f.z })).toBeLessThan(TOL);
    });

    it('the symbol centre is the 3-D door position', () => {
        const hf = hostedElementFrame(STRAIGHT, DOOR_OFFSET, DOOR_WIDTH);
        const centre = {
            x: (mid(ticks[0]!).x + mid(ticks[1]!).x) / 2,
            z: (mid(ticks[0]!).z + mid(ticks[1]!).z) / 2,
        };
        expect(dist(centre, { x: hf.x, z: hf.z })).toBeLessThan(TOL);
    });
});

// ── 2. CURVED host — the bug ─────────────────────────────────────────────────

describe('curved host — the plan symbol must use the SAME resolver as 3-D', () => {
    const g = build(CURVED, door());
    const ticks = segs(g.cut).slice(0, 2);

    it('left jamb tick sits at ARC length `offset`, not chord distance `offset`', () => {
        const f = arcFrameAt(CURVED as ArcHostWall, DOOR_OFFSET);
        expect(dist(mid(ticks[0]!), { x: f.x, z: f.z })).toBeLessThan(TOL);
    });

    it('right jamb tick sits at ARC length `offset + width`', () => {
        const f = arcFrameAt(CURVED as ArcHostWall, DOOR_OFFSET + DOOR_WIDTH);
        expect(dist(mid(ticks[1]!), { x: f.x, z: f.z })).toBeLessThan(TOL);
    });

    it('each jamb tick is RADIAL — perpendicular to the LOCAL tangent, not the chord', () => {
        for (const [i, s] of [DOOR_OFFSET, DOOR_OFFSET + DOOR_WIDTH].entries()) {
            const f = arcFrameAt(CURVED as ArcHostWall, s);
            const t = ticks[i]!;
            const dx = t.bx - t.ax, dz = t.bz - t.az;
            const len = Math.hypot(dx, dz);
            expect(len).toBeCloseTo(THK, 6);                     // spans the wall
            // Direction of a 200 mm tick recovered from two float32 coordinates ~8 m
            // out: ~1e-6 of quantisation over 0.2 m ⇒ ~1e-5 of angular noise. The
            // CHORD normal here is off by 0.30 (asserted below) — four orders more.
            expect((dx / len) * f.tx + (dz / len) * f.tz).toBeCloseTo(0, 4);
        }
    });

    it('the swing arc is centred on the hinge resolved from the LOCAL frame', () => {
        // Single door, hinged LEFT, swinging INWARD (= +leftNormal at the hinge
        // station): hinge = arc station (offset + width/2 − clearHalf), pushed to
        // the wall face along the LOCAL normal.
        const hf = hostedElementFrame(CURVED as ArcHostWall, DOOR_OFFSET, DOOR_WIDTH);
        const hingeS = hf.frame.s - CLEAR_HALF;
        const f = arcFrameAt(CURVED as ArcHostWall, hingeS);
        const expected = { x: f.x + f.nx * HALF_THK, z: f.z + f.nz * HALF_THK };

        // 'coarse' cut = [jamb tick, jamb tick, single leaf line P0→P1]; P0 = hinge.
        const leaf = segs(g.cut)[2]!;
        expect(dist({ x: leaf.ax, z: leaf.az }, expected)).toBeLessThan(TOL);
    });

    it('the leaf is rotated to the LOCAL TANGENT at the hinge, never to the chord', () => {
        const hf = hostedElementFrame(CURVED as ArcHostWall, DOOR_OFFSET, DOOR_WIDTH);
        const f = arcFrameAt(CURVED as ArcHostWall, hf.frame.s - CLEAR_HALF);
        const leaf = segs(g.cut)[2]!;
        const dx = leaf.bx - leaf.ax, dz = leaf.bz - leaf.az;
        const len = Math.hypot(dx, dz);
        // Open leaf runs along the swing direction = the LOCAL normal at the hinge.
        expect(dx / len).toBeCloseTo(f.nx, 6);
        expect(dz / len).toBeCloseTo(f.nz, 6);
        // …and the chord normal is a DIFFERENT vector here — that is the bug.
        expect(Math.abs(f.nx - 0) + Math.abs(f.nz - 1)).toBeGreaterThan(0.2);
    });

    it('the whole symbol lies ON the wall — no vertex floats clear of the band', () => {
        const arcLen = wallCentrelineLength(CURVED as ArcHostWall);
        const all = [...segs(g.cut), ...segs(g.proj)];
        // Max reach of the symbol from the centreline: the open leaf (leafLength)
        // plus the reveal. Anything beyond means the symbol detached from the wall.
        // …plus 1 mm for the discrete centreline probe below (the true nearest point
        // lies between samples). The pre-fix symbol floated 1.546 m clear — a
        // three-orders-of-magnitude different answer, so the margin cannot mask it.
        const maxReach = (DOOR_WIDTH - 2 * FRAME_T) + HALF_THK + 1e-3;
        for (const s of all) {
            for (const p of [{ x: s.ax, z: s.az }, { x: s.bx, z: s.bz }]) {
                let best = Infinity;
                for (let k = 0; k <= 400; k++) {
                    const f = arcFrameAt(CURVED as ArcHostWall, (k / 400) * arcLen);
                    best = Math.min(best, dist(p, { x: f.x, z: f.z }));
                }
                expect(best).toBeLessThanOrEqual(maxReach);
            }
        }
    });
});
