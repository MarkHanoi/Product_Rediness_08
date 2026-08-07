/**
 * §FIX-WALL-ARC-LINEAR-MITRE (founder 2026-08-06) — "CURVED WALLS JOINING LINEAR WALLS DON'T
 * JOIN PROPERLY IN MITRE" (a V-shaped notch at the join, overlapping footprints, a gap on the
 * inner face).
 *
 * MEASURED ROOT CAUSE. `JunctionResolverV2.WallInput` carried no shape information, so V2
 * derived every wall's heading from its CHORD. A quadratic-Bézier arc's heading at an endpoint
 * is its TANGENT (∝ control − start at t=0, ∝ end − control at t=1), not its chord. Probe: an
 * arc (0,0)→(4,0) with control (2,3) has end-tangent (0.5547, −0.8321) against a chord of
 * (1,0) — 56° apart. Joined to a straight wall running +x from (4,0):
 *   • the LEGACY resolver (which already uses the tangent — §CURVED-DETECT-FIX /
 *     `_wallDirAtJoin`) cut the arc on the plane (0.8817, −0.4719);
 *   • V2 compared the two CHORDS, found them anti-parallel, tripped §V2-NEAR-PARALLEL-CAP and
 *     emitted NO corner at all — so the straight neighbour square-capped on the plane x = 4.
 * Two different cut planes at one corner is exactly the founder's wedge-on-one-face,
 * overlap-on-the-other.
 *
 * FIX: `WallInput` gains optional per-endpoint unit tangents; `WallPipelineV2` derives them
 * from the wall's Bézier control point. V2 stays pure and shape-agnostic — it is told the
 * heading, which is all a mitre ever needed. Absent tangents ⇒ chord ⇒ unchanged behaviour.
 */

import { describe, it, expect, afterEach } from 'vitest';
import { resolveJunctions } from '../src/JunctionResolverV2';
import { WallPipelineV2Cache, type LevelWallSpec } from '../src/WallPipelineV2';

const T = 0.30;
const H = T / 2;

// Arc (0,0)→(4,0), control (2,3). Tangents: at start ∝ (2,3), at end ∝ (2,−3).
const ARC_CTRL = { x: 2, z: 3 };
const norm = (x: number, z: number) => { const L = Math.hypot(x, z); return { x: x / L, z: z / L }; };
const TAN_START = norm(2, 3);
const TAN_END = norm(2, -3);

afterEach(() => {
    delete (globalThis as { __pryzmWallV2ArcTangent?: boolean }).__pryzmWallV2ArcTangent;
});

describe('§FIX-WALL-ARC-LINEAR-MITRE — JunctionResolverV2 mitres against the arc TANGENT', () => {

    it('arc→line L: the straight wall now GETS a mitre (pre-fix it square-capped)', () => {
        const ms = resolveJunctions([
            { id: 'ARC', start: { x: 0, z: 0 }, end: { x: 4, z: 0 }, thickness: T, startDir: TAN_START, endDir: TAN_END },
            { id: 'STR', start: { x: 4, z: 0 }, end: { x: 8, z: 0 }, thickness: T },
        ]);
        const str = ms.find(m => m.id === 'STR')!;
        expect(str.startLeft, 'straight wall has a left corner').toBeDefined();
        expect(str.startRight, 'straight wall has a right corner').toBeDefined();
    });

    it('arc→line L: the shared corners lie on BOTH walls\' offset edge lines (no wedge, no overlap)', () => {
        const ms = resolveJunctions([
            { id: 'ARC', start: { x: 0, z: 0 }, end: { x: 4, z: 0 }, thickness: T, startDir: TAN_START, endDir: TAN_END },
            { id: 'STR', start: { x: 4, z: 0 }, end: { x: 8, z: 0 }, thickness: T },
        ]);
        const arc = ms.find(m => m.id === 'ARC')!;
        const str = ms.find(m => m.id === 'STR')!;
        // The two walls must SHARE their boundary corners exactly — that is what closes the
        // joint. (Adjacent ring-sweep entries write the same point into both.)
        const arcPts = [arc.endLeft!, arc.endRight!];
        const strPts = [str.startLeft!, str.startRight!];
        for (const p of strPts) {
            const nearest = Math.min(...arcPts.map(q => Math.hypot(p.x - q.x, p.z - q.z)));
            expect(nearest, `straight corner (${p.x},${p.z}) is shared with the arc`).toBeLessThan(1e-9);
        }
        // Each shared corner must sit exactly one half-thickness off the ARC'S TANGENT line
        // through the join — not off its chord. (Off the chord it would be the pre-fix wedge.)
        const join = { x: 4, z: 0 };
        for (const p of arcPts) {
            const rel = { x: p.x - join.x, z: p.z - join.z };
            const offTangent = Math.abs(rel.x * TAN_END.z - rel.z * TAN_END.x);   // |rel × tangent|
            expect(offTangent, 'corner is halfT off the TANGENT line').toBeCloseTo(H, 9);
        }
    });

    it('line→arc L (arc joins at its START) is symmetric', () => {
        const ms = resolveJunctions([
            { id: 'STR', start: { x: -4, z: 0 }, end: { x: 0, z: 0 }, thickness: T },
            { id: 'ARC', start: { x: 0, z: 0 }, end: { x: 4, z: 0 }, thickness: T, startDir: TAN_START, endDir: TAN_END },
        ]);
        const arc = ms.find(m => m.id === 'ARC')!;
        const str = ms.find(m => m.id === 'STR')!;
        expect(arc.startLeft).toBeDefined();
        expect(str.endLeft).toBeDefined();
        const join = { x: 0, z: 0 };
        for (const p of [arc.startLeft!, arc.startRight!]) {
            const rel = { x: p.x - join.x, z: p.z - join.z };
            expect(Math.abs(rel.x * TAN_START.z - rel.z * TAN_START.x)).toBeCloseTo(H, 9);
        }
    });

    it('the arc\'s CHORD would have square-capped the joint — proof the tangent is what fixed it', () => {
        // Same geometry, tangents withheld (the pre-fix input): chord-vs-chord is anti-parallel,
        // §V2-NEAR-PARALLEL-CAP fires, and NO corner is produced for either wall.
        const ms = resolveJunctions([
            { id: 'ARC', start: { x: 0, z: 0 }, end: { x: 4, z: 0 }, thickness: T },
            { id: 'STR', start: { x: 4, z: 0 }, end: { x: 8, z: 0 }, thickness: T },
        ]);
        expect(ms.find(m => m.id === 'STR')!.startLeft).toBeUndefined();
    });

    it('escape hatch __pryzmWallV2ArcTangent = false restores the chord heading', () => {
        (globalThis as { __pryzmWallV2ArcTangent?: boolean }).__pryzmWallV2ArcTangent = false;
        const ms = resolveJunctions([
            { id: 'ARC', start: { x: 0, z: 0 }, end: { x: 4, z: 0 }, thickness: T, startDir: TAN_START, endDir: TAN_END },
            { id: 'STR', start: { x: 4, z: 0 }, end: { x: 8, z: 0 }, thickness: T },
        ]);
        expect(ms.find(m => m.id === 'STR')!.startLeft).toBeUndefined();
    });

    it('a STRAIGHT-only level is byte-identical with and without the tangent plumbing', () => {
        const straight = [
            { id: 'A', start: { x: 0, z: 0 }, end: { x: 5, z: 0 }, thickness: T },
            { id: 'B', start: { x: 0, z: 0 }, end: { x: 0, z: 5 }, thickness: T },
        ];
        const withTangents = straight.map(w => ({
            ...w, startDir: { x: 1, z: 0 }, endDir: { x: 1, z: 0 },
        }));
        // A's chord IS (1,0), so supplying it as the tangent must change nothing for A;
        // B is left on its chord. Compare A's corners.
        const a1 = resolveJunctions(straight).find(m => m.id === 'A')!;
        const a2 = resolveJunctions([withTangents[0]!, straight[1]!]).find(m => m.id === 'A')!;
        expect(JSON.stringify(a2)).toBe(JSON.stringify(a1));
    });

    it('WallPipelineV2Cache derives the tangents from curveControlXZ (the wiring is live)', () => {
        const specs: LevelWallSpec[] = [
            { id: 'ARC', startXZ: { x: 0, z: 0 }, endXZ: { x: 4, z: 0 }, thickness: T, curveControlXZ: ARC_CTRL },
            { id: 'STR', startXZ: { x: 4, z: 0 }, endXZ: { x: 8, z: 0 }, thickness: T },
        ];
        const cache = new WallPipelineV2Cache();
        cache.refresh(specs);
        // Without the wiring the cache would reproduce the chord result (no corner at all).
        expect(cache.getMiter('STR')!.startLeft, 'control point reached the resolver').toBeDefined();
    });
});
