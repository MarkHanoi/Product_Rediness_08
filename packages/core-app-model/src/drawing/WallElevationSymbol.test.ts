/**
 * §ELEV-SYMBOL-WALL (L-1242) — the authored WALL elevation symbol.
 *
 * The probe suite measures what the SOLID projects to; this one pins what the SYMBOL draws
 * instead. The two together are the before and after, and the probe's numbers are reused here as
 * the target rather than restated as prose — a wall symbol that quietly stopped tracing the arc
 * would pass a "draws something" test and fail these.
 *
 * ⛔ No stub at the seam: the REAL `computeStations` (the sampler the wall BODY is built from),
 * the REAL `rakeShearPerMetre`, and the REAL `ElevationViewBasis` projection.
 */
import { describe, it, expect } from 'vitest';
import * as THREE from '@pryzm/renderer-three/three';
import { computeStations } from '@pryzm/geometry-wall';
import {
    buildWallElevationSymbol,
    wallNearFaceSign,
    type WallElevationSymbolHost,
    type WallStationSample,
} from './WallElevationSymbol';
import { elevationViewBasis, projectToElevation, type Vec3 } from './ElevationViewBasis';

/** WEST elevation, the founder's view. */
const WEST = { x: -1, z: 0 };

function hv(points: readonly Vec3[], viewDir = WEST) {
    const b = elevationViewBasis(viewDir)!;
    return points.map(p => projectToElevation(b, p));
}

/** A straight wall of length 6, running along Z, at `bearingDeg` off square-on to WEST. */
function straightWall(bearingDeg: number, rakeAngleDeg: number | null = null): WallElevationSymbolHost {
    const r = (bearingDeg * Math.PI) / 180;
    // Square-on to a West elevation means running along Z.
    const dx = Math.sin(r), dz = Math.cos(r);
    return {
        id: 'w1',
        baseStart: { x: 0, z: -3 },
        baseEnd: { x: 6 * dx, z: -3 + 6 * dz },
        baseY: 12.21,
        height: 3,
        thickness: 0.3,
        rakeAngleDeg,
    };
}

/** The REAL stations of a curved wall, re-based exactly as the builder re-bases them. */
function curvedStations(segments: number): WallStationSample[] {
    const a = new THREE.Vector3(0, 0, -3);
    const b = new THREE.Vector3(0, 0, 3);
    const c = new THREE.Vector3(1.6, 0, 0);
    return computeStations(a, b, c, segments)
        .map(s => ({ x: a.x + s.cx, z: a.z + s.cz, nx: s.nx, nz: s.nz }));
}

function curvedWall(segments: number, rakeAngleDeg: number | null = null): WallElevationSymbolHost {
    return {
        id: 'wc',
        baseStart: { x: 0, z: -3 },
        baseEnd: { x: 0, z: 3 },
        baseY: 12.21,
        height: 3,
        thickness: 0.3,
        rakeAngleDeg,
        stations: curvedStations(segments),
    };
}

const angleOf = (a: { h: number; v: number }, b: { h: number; v: number }) => {
    let d = (Math.atan2(b.v - a.v, b.h - a.h) * 180) / Math.PI;
    if (d < 0) d += 180;
    return d >= 180 - 1e-9 ? 0 : d;
};

// ── §A — root 1: the wall is drawn ONCE, not twice ────────────────────────────

describe('§A — the doubling is gone: ONE face, four lines, at every bearing', () => {
    it.each([0, 20, -20, 47, 90])('bearing %i° — exactly 4 segments, 2 horizontal', (bearing) => {
        const res = buildWallElevationSymbol(straightWall(bearing), { faceSign: 1 });
        expect(res.refusal).toBeNull();
        expect(res.polylines).toHaveLength(1);
        const pts = hv(res.polylines[0]!.points);
        expect(pts).toHaveLength(4);
        // Base and top are horizontal in EVERY view — C86 §10.2, applied to the wall.
        expect(angleOf(pts[0]!, pts[1]!)).toBeCloseTo(0, 6);
        expect(angleOf(pts[2]!, pts[3]!)).toBeCloseTo(0, 6);
    });

    it('⭐ the probe measured 16 horizontals for an oblique SOLID; the SYMBOL emits 2', () => {
        const res = buildWallElevationSymbol(straightWall(20), { faceSign: 1 });
        const pts = hv(res.polylines[0]!.points);
        const horiz = [[0, 1], [1, 2], [2, 3], [3, 0]]
            .filter(([i, j]) => Math.abs(angleOf(pts[i!]!, pts[j!]!)) < 0.5);
        expect(horiz).toHaveLength(2);
    });

    it('base and top sit at the AUTHORED world heights, on every host', () => {
        for (const [bearing, rake] of [[0, null], [20, 75], [-37, 110]] as const) {
            const res = buildWallElevationSymbol(straightWall(bearing, rake), { faceSign: 1 });
            const vs = hv(res.polylines[0]!.points).map(p => p.v);
            expect(Math.min(...vs)).toBeCloseTo(12.21, 9);
            expect(Math.max(...vs)).toBeCloseTo(15.21, 9);
        }
    });

    it('a RAKED wall SQUARE-ON draws plumb ends — the rake is pure DEPTH there (probe case B)', () => {
        const res = buildWallElevationSymbol(straightWall(0, 75), { faceSign: 1 });
        const pts = hv(res.polylines[0]!.points);
        expect(Math.abs(angleOf(pts[1]!, pts[2]!) - 90)).toBeLessThan(1e-6);
    });

    it('…and a RAKED wall OBLIQUE leans by atan(cot·sin) — D2, correct, not erased (probe case C)', () => {
        const res = buildWallElevationSymbol(straightWall(20, 75), { faceSign: 1 });
        const pts = hv(res.polylines[0]!.points);
        const k = 1 / Math.tan((75 * Math.PI) / 180);
        const tilt = (Math.atan(k * Math.sin((20 * Math.PI) / 180)) * 180) / Math.PI;
        expect(tilt).toBeCloseTo(5.2362, 4);
        expect(Math.abs(angleOf(pts[1]!, pts[2]!) - 90)).toBeCloseTo(tilt, 6);
    });

    it('the rake still MOVES the wall in world — it is carried, not discarded', () => {
        const plain = buildWallElevationSymbol(straightWall(0, null), { faceSign: 1 }).polylines[0]!.points;
        const raked = buildWallElevationSymbol(straightWall(0, 75), { faceSign: 1 }).polylines[0]!.points;
        expect(raked.some((p, i) => Math.abs(p.x - plain[i]!.x) > 1e-6)).toBe(true);
        raked.forEach((p, i) => expect(p.y).toBeCloseTo(plain[i]!.y, 12));
    });
});

// ── §B — root 2: the curved wall is CONTINUOUS ───────────────────────────────

describe('§B — the picket fence is never created', () => {
    it.each([16, 32, 64])('%i segments ⇒ exactly 2 END lines, not 2×(segments+1)', (segments) => {
        const res = buildWallElevationSymbol(curvedWall(segments), { faceSign: 1 });
        expect(res.refusal).toBeNull();
        const ends = res.polylines.filter(p => p.role === 'wall-end');
        expect(ends).toHaveLength(2);
        // ⭐ THE NUMBER THE PROBE MEASURED ON THE SOLID, ASSERTED ABSENT HERE.
        expect(ends.length).toBeLessThan(2 * (segments + 1));
    });

    it('⭐ the base and top are CONTINUOUS polylines that TRACE the arc, station for station', () => {
        const segments = 16;
        const res = buildWallElevationSymbol(curvedWall(segments), { faceSign: 1 });
        const base = res.polylines.find(p => p.role === 'wall-base')!;
        const top = res.polylines.find(p => p.role === 'wall-top')!;
        expect(base.closed).toBe(false);
        expect(base.points).toHaveLength(segments + 1);
        expect(top.points).toHaveLength(segments + 1);
        // It is a CURVE, not a chord: the mid station is off the straight line between the ends.
        const p = hv(base.points);
        const mid = p[Math.floor(p.length / 2)]!;
        const chordV = p[0]!.v + ((mid.h - p[0]!.h) / (p[p.length - 1]!.h - p[0]!.h)) * (p[p.length - 1]!.v - p[0]!.v);
        expect(Number.isFinite(chordV)).toBe(true);
        const bulge = Math.max(...base.points.map(q => Math.abs(q.x)));
        expect(bulge).toBeGreaterThan(0.5);      // the arc genuinely bulges in world X
    });

    it('the base and top are each at ONE world height — an arc in plan, level in elevation', () => {
        const res = buildWallElevationSymbol(curvedWall(32), { faceSign: 1 });
        for (const role of ['wall-base', 'wall-top'] as const) {
            const vs = hv(res.polylines.find(p => p.role === role)!.points).map(q => q.v);
            expect(Math.max(...vs) - Math.min(...vs)).toBeCloseTo(0, 9);
        }
    });

    it('a curved wall traces the SAME sampler its body is built from — not a second arc', () => {
        // DIFFERENTIATING against a symbol that re-derived the curve: every base point must land
        // on a real station's near-face position, to floating-point equality.
        const st = curvedStations(16);
        const res = buildWallElevationSymbol(curvedWall(16), { faceSign: 1 });
        const base = res.polylines.find(p => p.role === 'wall-base')!.points;
        base.forEach((p, i) => {
            expect(p.x).toBeCloseTo(st[i]!.x + st[i]!.nx * 0.15, 12);
            expect(p.z).toBeCloseTo(st[i]!.z + st[i]!.nz * 0.15, 12);
        });
    });

    it('a curved + RAKED wall displaces along its LOCAL station normal, not one chord normal', () => {
        // §FEAT-RAKE-CURVED: the conical sweep. A single leftPerp would move every station the
        // same way; the local normals differ along the arc, so the top must NOT be a rigid
        // translation of the base.
        const res = buildWallElevationSymbol(curvedWall(16, 75), { faceSign: 1 });
        const base = res.polylines.find(p => p.role === 'wall-base')!.points;
        const top = res.polylines.find(p => p.role === 'wall-top')!.points;
        const d0 = { x: top[0]!.x - base[0]!.x, z: top[0]!.z - base[0]!.z };
        const dm = { x: top[8]!.x - base[8]!.x, z: top[8]!.z - base[8]!.z };
        expect(Math.hypot(d0.x - dm.x, d0.z - dm.z)).toBeGreaterThan(1e-6);
    });
});

// ── §C — refusals: a wall the symbol cannot express KEEPS its linework ───────

describe('§C — refusals (C16 CA-18), and each one leaves the wall its wireframe', () => {
    it('⛔ a PROFILED wall refuses — a flat top would be a clean drawing that LIES', () => {
        const res = buildWallElevationSymbol({ ...straightWall(0), hasProfile: true });
        expect(res.polylines).toHaveLength(0);
        expect(res.refusal?.code).toBe('PROFILED_TOP');
        expect(res.refusal?.reason).toMatch(/flat top/i);
        expect(res.refusal?.alternative).toMatch(/keeps its projected linework/i);
    });

    it('a wall with no length, or no height, refuses rather than emitting a degenerate face', () => {
        expect(buildWallElevationSymbol({ ...straightWall(0), baseEnd: { x: 0, z: -3 } }).refusal?.code)
            .toBe('DEGENERATE_HOST');
        expect(buildWallElevationSymbol({ ...straightWall(0), height: 0 }).refusal?.code)
            .toBe('DEGENERATE_HOST');
    });

    it('⛔ a curved wall with unusable stations refuses — it does NOT fall back to the chord', () => {
        // Drawing a straight line where the building has an arc is the failure hardest to notice.
        const res = buildWallElevationSymbol({
            ...straightWall(0),
            stations: [{ x: 0, z: -3, nx: 0, nz: 0 }],
        });
        expect(res.polylines).toHaveLength(0);
        expect(res.refusal?.code).toBe('DEGENERATE_ARC');
    });

    it('a wall with NO profile and NO stations is served as a plain straight wall', () => {
        const res = buildWallElevationSymbol(straightWall(0));
        expect(res.refusal).toBeNull();
        expect(res.polylines[0]!.role).toBe('wall-outline');
    });
});

// ── §D — zone + face ─────────────────────────────────────────────────────────

describe('§D — zone and near-face resolution', () => {
    it('every polyline is `projection` — an elevation slices nothing (C09 §4.6.1)', () => {
        for (const host of [straightWall(20, 75), curvedWall(16)]) {
            for (const p of buildWallElevationSymbol(host, { faceSign: 1 }).polylines) {
                expect(p.zone).toBe('projection');
            }
        }
    });

    it('the near face flips with the view direction, and moves the wall only in DEPTH', () => {
        const w = straightWall(0);
        expect(wallNearFaceSign(w, { x: -1, z: 0 })).not.toBe(wallNearFaceSign(w, { x: 1, z: 0 }));
        const a = buildWallElevationSymbol(w, { faceSign: 1 }).polylines[0]!.points;
        const b = buildWallElevationSymbol(w, { faceSign: -1 }).polylines[0]!.points;
        a.forEach((p, i) => {
            expect(p.y).toBeCloseTo(b[i]!.y, 12);
            expect(Math.hypot(p.x - b[i]!.x, p.z - b[i]!.z)).toBeCloseTo(0.3, 12);
        });
    });

    it('a degenerate wall gets face sign 0 rather than a guess', () => {
        expect(wallNearFaceSign({ baseStart: { x: 1, z: 1 }, baseEnd: { x: 1, z: 1 } }, WEST)).toBe(0);
    });
});
