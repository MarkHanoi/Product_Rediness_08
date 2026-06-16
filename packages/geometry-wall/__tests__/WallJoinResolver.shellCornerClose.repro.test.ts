/**
 * REPRODUCTION harness — generated-house perimeter (shell) wall CORNER does not close.
 *
 * Founder defect: two exterior wall lines meeting at a corner do not close — a tiny
 * diamond of empty space (gap/overlap) at the apex in plan, a vertical seam in 3D.
 * The generated house shell is often a ROTATED (~45°) plate, with interior partitions
 * T-joining the shell mid-spans and openings on the shell walls.
 *
 * This file drives WallJoinResolver.resolveLevel on a CLOSED 4-corner shell (axis +
 * rotated) and asserts each shell corner closes: the two trimmed end-caps share a
 * point (gap < 1 mm) and the miter planes meet (no void/overlap).
 */

import { describe, it, expect } from 'vitest';
import * as THREE from '@pryzm/renderer-three/three';
import { WallJoinResolver } from '../src/WallJoinResolver';
import type { WallData } from '../src/WallTypes';

let _seq = 0;
function mk(
    start: [number, number],
    end: [number, number],
    thickness = 0.2,
    createdAt?: number,
    openings: any[] = [],
): WallData {
    const id = `wall_sc_${_seq++}`;
    return {
        id, type: 'wall', levelId: 'L', properties: {}, childrenIds: [],
        baseLine: [{ x: start[0], y: 0, z: start[1] }, { x: end[0], y: 0, z: end[1] }],
        height: 3, thickness, baseOffset: 0, openings,
        metadata: createdAt != null ? { createdAt } : undefined,
    } as any;
}

/** Cap-corner projection — identical to WallJoinResolver.cornerFlush.test.ts. */
function capCorners(
    jd: any, side: 'start' | 'end', thickness: number,
): { outer: THREE.Vector3; inner: THREE.Vector3 } {
    const [s, e] = jd.baseLine as [THREE.Vector3, THREE.Vector3];
    const wallDir = new THREE.Vector3(e.x - s.x, 0, e.z - s.z).normalize();
    const outward = new THREE.Vector3(-wallDir.z, 0, wallDir.x);
    const half = thickness / 2;
    const P = side === 'start' ? s : e;
    const mn = side === 'start' ? jd.startMN : jd.endMN;
    const proj = (sign: number): THREE.Vector3 => {
        const base = new THREE.Vector3(P.x + outward.x * sign * half, 0, P.z + outward.z * sign * half);
        if (!mn) return base;
        const mnDotDir = mn.nx * wallDir.x + mn.nz * wallDir.z;
        if (Math.abs(mnDotDir) < 1e-9) return base;
        const dx = P.x - base.x, dz = P.z - base.z;
        const t = (mn.nx * dx + mn.nz * dz) / mnDotDir;
        return new THREE.Vector3(base.x + t * wallDir.x, 0, base.z + t * wallDir.z);
    };
    return { outer: proj(+1), inner: proj(-1) };
}

function near(a: THREE.Vector3, b: THREE.Vector3, eps = 1e-3): boolean {
    return Math.hypot(a.x - b.x, a.z - b.z) <= eps;
}

/** Returns the worst (max) gap between the two walls' joining cap corners at a corner. */
function cornerGapMm(
    jA: any, sideA: 'start' | 'end', tA: number,
    jB: any, sideB: 'start' | 'end', tB: number,
): number {
    const ca = capCorners(jA, sideA, tA);
    const cb = capCorners(jB, sideB, tB);
    const aC = [ca.outer, ca.inner];
    const bC = [cb.outer, cb.inner];
    // For each cap corner of A, the nearest cap corner of B should coincide.
    let worst = 0;
    for (const a of aC) {
        let best = Infinity;
        for (const b of bC) best = Math.min(best, Math.hypot(a.x - b.x, a.z - b.z));
        worst = Math.max(worst, best);
    }
    return worst * 1000;
}

/** Build a closed 4-corner rectangle shell, optionally rotated by `rotDeg`. */
function buildShell(
    cx: number, cz: number, w: number, h: number, rotDeg: number, t = 0.2,
): { walls: WallData[]; corners: [number, number][] } {
    const rad = (rotDeg * Math.PI) / 180;
    const cos = Math.cos(rad), sin = Math.sin(rad);
    const local: [number, number][] = [
        [-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2],
    ];
    const corners = local.map(([lx, lz]) => {
        return [cx + lx * cos - lz * sin, cz + lx * sin + lz * cos] as [number, number];
    });
    const walls: WallData[] = [];
    for (let i = 0; i < 4; i++) {
        walls.push(mk(corners[i], corners[(i + 1) % 4], t, i + 1));
    }
    return { walls, corners };
}

describe('REPRO — generated-house shell corner closure', () => {
    it('axis-aligned closed 4-corner shell: every corner closes (baseline)', () => {
        const { walls } = buildShell(0, 0, 8, 6, 0, 0.2);
        const res = WallJoinResolver.resolveLevel(walls, { snapRadius: 0.5 });
        // Corner i is wall[i].end ↔ wall[(i+1)%4].start
        for (let i = 0; i < 4; i++) {
            const a = walls[i], b = walls[(i + 1) % 4];
            const ja = res.get(a.id)!, jb = res.get(b.id)!;
            expect(ja.invalid).toBeFalsy();
            expect(jb.invalid).toBeFalsy();
            const gap = cornerGapMm(ja, 'end', a.thickness, jb, 'start', b.thickness);
            expect(gap, `axis corner ${i} gap=${gap.toFixed(2)}mm`).toBeLessThan(1.0);
        }
    });

    it('ROTATED 45° closed 4-corner shell: every corner closes', () => {
        const { walls } = buildShell(0, 0, 8, 6, 45, 0.2);
        const res = WallJoinResolver.resolveLevel(walls, { snapRadius: 0.5 });
        for (let i = 0; i < 4; i++) {
            const a = walls[i], b = walls[(i + 1) % 4];
            const ja = res.get(a.id)!, jb = res.get(b.id)!;
            expect(ja.invalid).toBeFalsy();
            expect(jb.invalid).toBeFalsy();
            const gap = cornerGapMm(ja, 'end', a.thickness, jb, 'start', b.thickness);
            expect(gap, `rot45 corner ${i} gap=${gap.toFixed(2)}mm`).toBeLessThan(1.0);
        }
    });

    it('ROTATED 45° shell + interior partitions T-joining shell mid-spans + openings', () => {
        const { walls, corners } = buildShell(0, 0, 8, 6, 45, 0.2);
        // Add an opening to each shell wall (must not affect joins).
        for (const w of walls) {
            (w as any).openings = [{ id: `op_${w.id}`, elementId: `e_${w.id}`, type: 'window', offset: 1.5, width: 0.9, height: 1.2, sillHeight: 0.9 }];
        }
        // Interior partition T-joining the mid-span of wall[0] and wall[2], running across.
        // wall[0] is corners[0]→corners[1]; its midpoint:
        const mid0: [number, number] = [(corners[0][0] + corners[1][0]) / 2, (corners[0][1] + corners[1][1]) / 2];
        const mid2: [number, number] = [(corners[2][0] + corners[3][0]) / 2, (corners[2][1] + corners[3][1]) / 2];
        const part = mk(mid0, mid2, 0.2, 99);
        const allWalls = [...walls, part];
        const res = WallJoinResolver.resolveLevel(allWalls, { snapRadius: 0.5 });

        for (let i = 0; i < 4; i++) {
            const a = walls[i], b = walls[(i + 1) % 4];
            const ja = res.get(a.id)!, jb = res.get(b.id)!;
            expect(ja.invalid).toBeFalsy();
            expect(jb.invalid).toBeFalsy();
            const gap = cornerGapMm(ja, 'end', a.thickness, jb, 'start', b.thickness);
            expect(gap, `rot45+T corner ${i} gap=${gap.toFixed(2)}mm`).toBeLessThan(1.0);
        }
    });

    it('ROTATED 45° shell with a SMALL pre-existing corner gap (welded plate) + nearby partition', () => {
        // The realistic generated/welded condition: the two shell walls meeting at a
        // corner are NOT bit-exact coincident — they are ~20-40 mm apart (post-weld /
        // post-miter drift on a rotated plate). A partition T-joins the shell mid-span
        // close enough to that corner that, with the editor's ZOOM-DEPENDENT large
        // snapRadius, all three endpoints fall into ONE cluster. Because the two shell
        // endpoints are > PINNED_TOL (1 mm) apart, the cluster has NO pinned pair →
        // NO primary corner → the shell endpoints take the consensus-trim SQUARE-cap
        // branch instead of a bisector miter → the corner opens (the founder's diamond).
        const { walls, corners } = buildShell(0, 0, 8, 6, 45, 0.2);
        // Nudge wall[0].end and wall[1].start apart by ~30 mm around corner[1].
        const gapDir = new THREE.Vector3(1, 0, 0.3).normalize();
        const w0 = walls[0], w1 = walls[1];
        (w0 as any).baseLine[1] = { x: corners[1][0] - gapDir.x * 0.015, y: 0, z: corners[1][1] - gapDir.z * 0.015 };
        (w1 as any).baseLine[0] = { x: corners[1][0] + gapDir.x * 0.015, y: 0, z: corners[1][1] + gapDir.z * 0.015 };
        // Partition T-contact ~0.30 m from corner[1] along wall[0], running inward.
        const dir01 = new THREE.Vector3(corners[1][0] - corners[0][0], 0, corners[1][1] - corners[0][1]).normalize();
        const contact: [number, number] = [corners[1][0] - dir01.x * 0.30, corners[1][1] - dir01.z * 0.30];
        const inward = new THREE.Vector3(-corners[1][0], 0, -corners[1][1]).normalize();
        const partFar: [number, number] = [contact[0] + inward.x * 3, contact[1] + inward.z * 3];
        const part = mk(partFar, contact, 0.2, 99);
        const allWalls = [...walls, part];
        // Editor zoom-out → large snap radius merges the partition into the corner cluster.
        const res = WallJoinResolver.resolveLevel(allWalls, { snapRadius: 1.2 });

        const a = walls[0], b = walls[1];
        const ja = res.get(a.id)!, jb = res.get(b.id)!;
        expect(ja.invalid).toBeFalsy();
        expect(jb.invalid).toBeFalsy();
        const gap = cornerGapMm(ja, 'end', a.thickness, jb, 'start', b.thickness);
        expect(gap, `welded-gap corner gap=${gap.toFixed(2)}mm`).toBeLessThan(2.0);
    });

    it('ROTATED 45° shell + partition T-joining NEAR a corner (within snapRadius)', () => {
        // THE founder case: a partition whose T-contact on the shell lands NEAR a corner,
        // so the partition endpoint falls into the same snap cluster as the two shell
        // corner endpoints → cluster mis-resolves the corner.
        const { walls, corners } = buildShell(0, 0, 8, 6, 45, 0.2);
        // wall[0]: corners[0]→corners[1]. Put a partition T-contact 0.35 m in from corners[1].
        const dir01 = new THREE.Vector3(corners[1][0] - corners[0][0], 0, corners[1][1] - corners[0][1]).normalize();
        const contact: [number, number] = [corners[1][0] - dir01.x * 0.35, corners[1][1] - dir01.z * 0.35];
        // Partition runs inward (perpendicular-ish) from that contact toward the centre.
        const inward = new THREE.Vector3(-corners[1][0], 0, -corners[1][1]).normalize();
        const partFar: [number, number] = [contact[0] + inward.x * 3, contact[1] + inward.z * 3];
        const part = mk(partFar, contact, 0.2, 99);   // joins shell at 'end'
        const allWalls = [...walls, part];
        const res = WallJoinResolver.resolveLevel(allWalls, { snapRadius: 0.5 });

        // The corner that the partition lands near is corner index 1 (wall[1].start ↔ wall[0].end).
        for (let i = 0; i < 4; i++) {
            const a = walls[i], b = walls[(i + 1) % 4];
            const ja = res.get(a.id)!, jb = res.get(b.id)!;
            expect(ja.invalid, `corner ${i} wallA invalid`).toBeFalsy();
            expect(jb.invalid, `corner ${i} wallB invalid`).toBeFalsy();
            const gap = cornerGapMm(ja, 'end', a.thickness, jb, 'start', b.thickness);
            expect(gap, `rot45+nearT corner ${i} gap=${gap.toFixed(2)}mm`).toBeLessThan(1.0);
        }
    });
});
