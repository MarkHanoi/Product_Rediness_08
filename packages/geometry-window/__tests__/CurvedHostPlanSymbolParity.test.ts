/**
 * §FIX-HOSTED-PLAN-SYMBOL-ON-CURVED-HOST — the WINDOW plan symbol and the 3-D
 * window must resolve the SAME station on the host wall.
 *
 * The door's twin of this file carries the full rationale. In short:
 * `WindowBuilder.positionGroup` places the 3-D window via `hostedElementFrame()`
 * — arc length `offset + width/2` along the wall CENTRELINE, oriented to the
 * LOCAL TANGENT. `WindowPlanSymbolBuilder` measured the same `offset` along the
 * CHORD, with a constant `dir`/`leftNormal`. Straight wall: identical. Curved
 * wall: progressively divergent, which is what the founder saw.
 *
 * C15 governs doors and windows as ONE hosted-element family, so the window is
 * held to the same three invariants:
 *   • jamb ticks at ARC length `offset` / `offset + width` (C15 §2 generalised),
 *   • ticks RADIAL — perpendicular to the LOCAL tangent, not the chord,
 *   • the whole symbol within the wall band, not floating clear of it.
 */

import { describe, it, expect } from 'vitest';
import {
    hostedElementFrame,
    wallCentrelineLength,
    arcFrameAt,
    type ArcHostWall,
} from '@pryzm/geometry-wall';
import { WindowPlanSymbolBuilder } from '../src/WindowPlanSymbolBuilder';

type Lod = 'coarse' | 'medium' | 'fine';

const THK = 0.3;
const HALF_THK = THK / 2;

const STRAIGHT = {
    id: 'w-straight',
    baseLine: [{ x: 0, z: 0 }, { x: 8, z: 0 }],
    thickness: THK,
    levelId: 'L0',
};

const CURVED = {
    id: 'w-curved',
    baseLine: [{ x: 0, z: 0 }, { x: 8, z: 0 }],
    curve: { control: { x: 4, z: -6 }, segments: 24 },
    thickness: THK,
    levelId: 'L0',
};

const WIN_OFFSET = 6.0;
const WIN_WIDTH = 1.2;

/**
 * Float32 storage tolerance — the symbol's vertices land in a
 * `Float32BufferAttribute`, so ~1e-7 on an 8 m coordinate is the floor.
 */
const TOL = 1e-5;

const win = { id: 'win1', wallId: 'w1', width: WIN_WIDTH, offset: WIN_OFFSET };

type Geo = { getAttribute(n: string): { array: ArrayLike<number> } } | null;

function build(wall: unknown, lod: Lod = 'coarse') {
    const builder = new WindowPlanSymbolBuilder();
    const geos = (builder as unknown as {
        _computeSymbolGeometry(w: unknown, wall: unknown, lod: Lod): { cut: Geo; proj: Geo } | null;
    })._computeSymbolGeometry(win, wall, lod);
    expect(geos).not.toBeNull();
    const flat = (g: Geo) => Array.from(g?.getAttribute('position').array ?? []);
    return { cut: flat(geos!.cut), proj: flat(geos!.proj) };
}

function segs(flat: number[]) {
    const out: Array<{ ax: number; az: number; bx: number; bz: number }> = [];
    for (let i = 0; i + 5 < flat.length; i += 6) {
        out.push({ ax: flat[i]!, az: flat[i + 2]!, bx: flat[i + 3]!, bz: flat[i + 5]! });
    }
    return out;
}

const mid = (s: { ax: number; az: number; bx: number; bz: number }) =>
    ({ x: (s.ax + s.bx) / 2, z: (s.az + s.bz) / 2 });

const dist = (a: { x: number; z: number }, b: { x: number; z: number }) =>
    Math.hypot(a.x - b.x, a.z - b.z);

describe('straight host — window plan symbol ≡ 3-D resolver (must never regress)', () => {
    const ticks = segs(build(STRAIGHT).cut).slice(0, 2);

    it('jamb ticks sit on the void edges', () => {
        const l = arcFrameAt(STRAIGHT, WIN_OFFSET);
        const r = arcFrameAt(STRAIGHT, WIN_OFFSET + WIN_WIDTH);
        expect(dist(mid(ticks[0]!), { x: l.x, z: l.z })).toBeLessThan(TOL);
        expect(dist(mid(ticks[1]!), { x: r.x, z: r.z })).toBeLessThan(TOL);
    });

    it('the symbol centre is the 3-D window position', () => {
        const hf = hostedElementFrame(STRAIGHT, WIN_OFFSET, WIN_WIDTH);
        const c = {
            x: (mid(ticks[0]!).x + mid(ticks[1]!).x) / 2,
            z: (mid(ticks[0]!).z + mid(ticks[1]!).z) / 2,
        };
        expect(dist(c, { x: hf.x, z: hf.z })).toBeLessThan(TOL);
    });
});

describe('curved host — window plan symbol must use the SAME resolver as 3-D', () => {
    const g = build(CURVED);
    const ticks = segs(g.cut).slice(0, 2);

    it('left jamb tick sits at ARC length `offset`, not chord distance `offset`', () => {
        const f = arcFrameAt(CURVED as ArcHostWall, WIN_OFFSET);
        expect(dist(mid(ticks[0]!), { x: f.x, z: f.z })).toBeLessThan(TOL);
    });

    it('right jamb tick sits at ARC length `offset + width`', () => {
        const f = arcFrameAt(CURVED as ArcHostWall, WIN_OFFSET + WIN_WIDTH);
        expect(dist(mid(ticks[1]!), { x: f.x, z: f.z })).toBeLessThan(TOL);
    });

    it('each jamb tick is RADIAL — perpendicular to the LOCAL tangent', () => {
        for (const [i, s] of [WIN_OFFSET, WIN_OFFSET + WIN_WIDTH].entries()) {
            const f = arcFrameAt(CURVED as ArcHostWall, s);
            const t = ticks[i]!;
            const dx = t.bx - t.ax, dz = t.bz - t.az;
            const len = Math.hypot(dx, dz);
            expect(len).toBeCloseTo(THK, 5);
            expect((dx / len) * f.tx + (dz / len) * f.tz).toBeCloseTo(0, 4);
        }
    });

    it('every vertex of every LOD lies within the wall band + sill projection', () => {
        const arcLen = wallCentrelineLength(CURVED as ArcHostWall);
        // The sill is the symbol's furthest reach across the wall. Nothing may sit
        // further from the centreline than that; the pre-fix symbol sat ~1.5 m out.
        const maxReach = HALF_THK + 0.3 + 1e-3;
        for (const lod of ['coarse', 'medium', 'fine'] as Lod[]) {
            const gg = build(CURVED, lod);
            for (const s of [...segs(gg.cut), ...segs(gg.proj)]) {
                for (const p of [{ x: s.ax, z: s.az }, { x: s.bx, z: s.bz }]) {
                    let best = Infinity;
                    for (let k = 0; k <= 600; k++) {
                        const f = arcFrameAt(CURVED as ArcHostWall, (k / 600) * arcLen);
                        best = Math.min(best, dist(p, { x: f.x, z: f.z }));
                    }
                    expect(best).toBeLessThanOrEqual(maxReach);
                }
            }
        }
    });

    it('the glazing CONFORMS to the arc — it does not chord across the opening', () => {
        // The glazing run is sampled at the host's own centreline stations, so a
        // 1.2 m opening on this bow yields more than one segment per glazing line.
        const straightRuns = segs(build(STRAIGHT).proj).length;
        const curvedRuns = segs(g.proj).length;
        expect(curvedRuns).toBeGreaterThan(straightRuns);
    });
});
