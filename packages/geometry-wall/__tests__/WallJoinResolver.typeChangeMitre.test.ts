/**
 * §FIX-WALL-TYPECHANGE-MITRE (founder 2026-08-06) — legacy `WallJoinResolver`.
 *
 * THE FOUNDER'S RULE, verbatim: "If I change one wall type, I would expect to STILL have
 * robust and correct wall joints — no matter which wall joins with what. ALWAYS DEFAULT MITRE
 * when only TWO walls join. If THREE, the 3rd one is a PLAIN join."
 *
 * A wall's system type sets its `thickness` (resolveWallSystemType.ts:98-103 →
 * SetWallSystemType.ts:104 `w.thickness = type.totalThickness`). Before this fix, the moment
 * the two arms of an L differed by >1 mm the §DIFF-THICKNESS-FIX "option-B butt" refused to
 * mitre: both walls square-capped (MN null) and the thinner arm's joining endpoint was moved
 * LATERALLY onto the thick arm's face by `dominantT/2 − 1 mm`. Measured on a 300/100 mm L at
 * the origin: thick start extended to (−0.05, 0), thin start displaced to (0, 0.149).
 *
 * Two consequences, both founder-visible:
 *   1. The same corner rendered differently depending on which pipeline each wall took —
 *      V2 (plain walls) mitres asymmetric thicknesses correctly; legacy (layered walls and
 *      any wall carrying an opening) butted. A type change is exactly what flips a wall
 *      between the two.
 *   2. The lateral displacement broke room-loop closure — `[RoomDetectionEngine]
 *      §DIAG-ROOM-LOOP BREAK … endpoint 217mm from centreline EXCEEDS hostSnap 200mm` is the
 *      fingerprint of a 430 mm layered shell (430/2 − 1 = 214 mm).
 *
 * These tests assert GEOMETRY: both arms trim to the shared centreline crossing, both carry
 * a miter normal, the two mitre planes are the SAME plane, and the legacy corner points
 * coincide with what `JunctionResolverV2` computes for the identical pair.
 */

import { describe, it, expect, afterEach } from 'vitest';
import * as THREE from '@pryzm/renderer-three/three';
import { WallJoinResolver } from '../src/WallJoinResolver';
import { resolveJunctions } from '../src/JunctionResolverV2';
import type { WallData } from '../src/WallTypes';

let _seq = 0;
function mk(s: [number, number], e: [number, number], thickness: number, layered = false): WallData {
    return {
        id: `tcm${_seq++}`, type: 'wall', levelId: 'L', properties: {}, childrenIds: [],
        baseLine: [{ x: s[0], y: 0, z: s[1] }, { x: e[0], y: 0, z: e[1] }],
        height: 3, thickness, baseOffset: 0, openings: [],
        layers: layered ? [{ name: 'core', thickness }] : undefined,
        metadata: { createdAt: _seq },
    } as unknown as WallData;
}

interface JD {
    baseLine: [THREE.Vector3, THREE.Vector3];
    startMN: { nx: number; nz: number } | null;
    endMN: { nx: number; nz: number } | null;
}
const resolve = (w: WallData[]): Map<string, JD> =>
    WallJoinResolver.resolveLevel(w) as unknown as Map<string, JD>;

/** The two mitre-plane normals describe the SAME plane when they are parallel (either sign). */
function samePlane(a: { nx: number; nz: number }, b: { nx: number; nz: number }): boolean {
    return Math.abs(Math.abs(a.nx * b.nx + a.nz * b.nz) - 1) < 1e-6;
}

/** The rendered cap corners at one end, after the `buildMiterPrism` projection. */
function capCorners(jd: JD, side: 'start' | 'end', thickness: number): THREE.Vector3[] {
    const [s, e] = jd.baseLine;
    const d = new THREE.Vector3(e.x - s.x, 0, e.z - s.z).normalize();
    const n = new THREE.Vector3(-d.z, 0, d.x).multiplyScalar(thickness / 2);
    const o = side === 'start' ? s : e;
    const mn = side === 'start' ? jd.startMN : jd.endMN;
    return [+1, -1].map(sg => {
        const p = new THREE.Vector3(o.x + sg * n.x, 0, o.z + sg * n.z);
        if (!mn) return p;
        const dotD = mn.nx * d.x + mn.nz * d.z;
        if (Math.abs(dotD) < 1e-9) return p;
        const t = (mn.nx * (o.x - p.x) + mn.nz * (o.z - p.z)) / dotD;
        return new THREE.Vector3(p.x + t * d.x, 0, p.z + t * d.z);
    });
}

afterEach(() => {
    delete (globalThis as { __pryzmWallDiffThicknessButt?: boolean }).__pryzmWallDiffThicknessButt;
});

describe('§FIX-WALL-TYPECHANGE-MITRE — two walls joining ALWAYS mitre', () => {

    it('EQUAL-thickness L still mitres (regression): both arms trim to the crossing, one shared plane', () => {
        const a = mk([0, 0], [5, 0], 0.30);
        const b = mk([0, 0], [0, 5], 0.30);
        const r = resolve([a, b]);
        const ja = r.get(a.id)!, jb = r.get(b.id)!;
        expect(ja.baseLine[0].x).toBeCloseTo(0, 6);
        expect(ja.baseLine[0].z).toBeCloseTo(0, 6);
        expect(jb.baseLine[0].x).toBeCloseTo(0, 6);
        expect(jb.baseLine[0].z).toBeCloseTo(0, 6);
        expect(ja.startMN).not.toBeNull();
        expect(jb.startMN).not.toBeNull();
        expect(samePlane(ja.startMN!, jb.startMN!)).toBe(true);
    });

    it('ASYMMETRIC-thickness L (300 mm ⟂ 100 mm) MITRES — no butt, no square cap', () => {
        const a = mk([0, 0], [5, 0], 0.30);
        const b = mk([0, 0], [0, 5], 0.10);
        const r = resolve([a, b]);
        const ja = r.get(a.id)!, jb = r.get(b.id)!;
        // Both arms carry a mitre normal (pre-fix: BOTH were null — square caps).
        expect(ja.startMN, 'thick arm mitred').not.toBeNull();
        expect(jb.startMN, 'thin arm mitred').not.toBeNull();
        expect(samePlane(ja.startMN!, jb.startMN!), 'one shared cut plane').toBe(true);
    });

    it('ASYMMETRIC-thickness L: NEITHER endpoint is displaced off its own centreline', () => {
        // The room-loop breaker. Pre-fix the thin arm's start moved to (0, 0.149) — 149 mm
        // off its own axis — and the thick arm's start was extended to (−0.05, 0).
        const a = mk([0, 0], [5, 0], 0.30);
        const b = mk([0, 0], [0, 5], 0.10);
        const r = resolve([a, b]);
        for (const w of [a, b]) {
            const j = r.get(w.id)!;
            expect(j.baseLine[0].x, `${w.id} start x`).toBeCloseTo(0, 6);
            expect(j.baseLine[0].z, `${w.id} start z`).toBeCloseTo(0, 6);
        }
    });

    it('the legacy mitre corners COINCIDE with JunctionResolverV2 for the identical pair', () => {
        // This is the mixed-pipeline seam: a layered / opening-bearing wall renders through
        // legacy, its plain neighbour through V2. If the two disagree the corner opens.
        const a = mk([0, 0], [5, 0], 0.30, /* layered */ true);
        const b = mk([0, 0], [0, 5], 0.10);
        const r = resolve([a, b]);
        const legacyCaps = [
            ...capCorners(r.get(a.id)!, 'start', 0.30),
            ...capCorners(r.get(b.id)!, 'start', 0.10),
        ];
        const [mA] = resolveJunctions([
            { id: 'A', start: { x: 0, z: 0 }, end: { x: 5, z: 0 }, thickness: 0.30 },
            { id: 'B', start: { x: 0, z: 0 }, end: { x: 0, z: 5 }, thickness: 0.10 },
        ]);
        for (const v2 of [mA!.startLeft!, mA!.startRight!]) {
            const nearest = Math.min(...legacyCaps.map(c => Math.hypot(c.x - v2.x, c.z - v2.z)));
            expect(nearest, `V2 corner (${v2.x},${v2.z}) has a legacy twin`).toBeLessThan(1e-6);
        }
    });

    it('TYPE CHANGE after commit: re-resolving with one arm thickened keeps the mitre', () => {
        // Simulates SetWallSystemType — the wall is the same wall, only `thickness` changed.
        const a = mk([0, 0], [5, 0], 0.10);
        const b = mk([0, 0], [0, 5], 0.10);
        const before = resolve([a, b]);
        expect(before.get(a.id)!.startMN).not.toBeNull();
        (a as { thickness: number }).thickness = 0.43;   // ← the founder's type change
        const after = resolve([a, b]);
        expect(after.get(a.id)!.startMN, 'thickened arm keeps its mitre').not.toBeNull();
        expect(after.get(b.id)!.startMN, 'neighbour keeps its mitre').not.toBeNull();
        expect(samePlane(after.get(a.id)!.startMN!, after.get(b.id)!.startMN!)).toBe(true);
        // And still no lateral displacement of the thin arm (the 217 mm room-loop break).
        expect(Math.hypot(after.get(b.id)!.baseLine[0].x, after.get(b.id)!.baseLine[0].z))
            .toBeLessThan(1e-6);
    });

    it('THREE walls: the two co-terminating arms keep their mitre, the 3rd butts (no mitre)', () => {
        // Founder rule: "If THREE, the 3rd one is a PLAIN join." The 3rd wall T-attaches to
        // arm A's BODY, so A/B keep the corner they had and C butts flat.
        const a = mk([0, 0], [5, 0], 0.30);
        const b = mk([0, 0], [0, 5], 0.30);
        const c = mk([2.5, 4], [2.5, 0], 0.10);          // stem into A's mid-body
        const bare = resolve([mk([0, 0], [5, 0], 0.30), mk([0, 0], [0, 5], 0.30)]);
        const bareMNs = [...bare.values()].map(j => j.startMN);
        const r = resolve([a, b, c]);
        expect(r.get(a.id)!.startMN).not.toBeNull();
        expect(r.get(b.id)!.startMN).not.toBeNull();
        expect(samePlane(r.get(a.id)!.startMN!, r.get(b.id)!.startMN!)).toBe(true);
        // The committed corner is not re-cut by the newcomer.
        expect(samePlane(r.get(a.id)!.startMN!, bareMNs[0]!)).toBe(true);
        // The 3rd wall is a PLAIN join: its cap plane is PERPENDICULAR to its own axis (a
        // square cut), not the oblique bisector the two mitred arms share. Either a null MN
        // or an MN parallel to the wall axis expresses that.
        const jc = r.get(c.id)!;
        const cAxis = new THREE.Vector3(
            jc.baseLine[1].x - jc.baseLine[0].x, 0, jc.baseLine[1].z - jc.baseLine[0].z,
        ).normalize();
        if (jc.endMN) {
            const cos = Math.abs(jc.endMN.nx * cAxis.x + jc.endMN.nz * cAxis.z);
            expect(cos, '3rd wall cap is square (plane ⟂ its own axis)').toBeCloseTo(1, 6);
        }
        expect(jc.baseLine[1].z, '3rd wall trimmed to A\'s face').toBeGreaterThan(0.13);
    });

    it('the option-B butt survives behind __pryzmWallDiffThicknessButt (escape hatch)', () => {
        (globalThis as { __pryzmWallDiffThicknessButt?: boolean }).__pryzmWallDiffThicknessButt = true;
        const a = mk([0, 0], [5, 0], 0.30);
        const b = mk([0, 0], [0, 5], 0.10);
        const r = resolve([a, b]);
        expect(r.get(a.id)!.startMN).toBeNull();                       // square cap, as before
        expect(r.get(b.id)!.baseLine[0].z).toBeCloseTo(0.149, 3);      // lateral butt offset
    });
});
