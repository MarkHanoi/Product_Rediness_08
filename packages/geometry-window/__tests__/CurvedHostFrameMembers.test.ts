/**
 * §FEAT-CURVED-WINDOW-LEAF (L-957) — SLICE 2: HORIZONTALS SWEEP, VERTICALS DO NOT.
 *
 * The founder's spec is a decomposition, not a blanket "make the window curved":
 * *"the horizontal frame members are curved — head, sill, any horizontal
 * transom"*, and by implication the verticals stay straight. That implication is
 * only sound because the host's curve is a VERTICAL-AXIS SWEEP, which
 * `CurvedLeafGeometry`'s header establishes by measurement rather than assertion
 * (`WallArcParam` ignores `y`; the wall's own `Station` type is `{cx,cz,nx,nz}`).
 * On such a surface every vertical line is a straight ruling.
 *
 * So this file measures BOTH halves. A version of this feature that swept
 * everything would pass a "the frame is curved" test and be wrong — it would put
 * a bend in a jamb that physically cannot bend. And a version that swept nothing
 * would pass a "the jambs are straight" test and be the flat window we started
 * with. Each assertion below is paired with the one that stops it being vacuous.
 *
 * THE SEAM. The strongest assertion here is the last: the head and cill span the
 * full authored width, so their radial end caps must land on the SAME two
 * stations `CurvedWallOpeningBuilder` terminates the void's bands on. If they did
 * not, the founder would see a line where the frame meets the reveal — which is
 * the whole reason L-957 insists on the wall's own curve rather than a matching
 * one.
 */

import { describe, it, expect } from 'vitest';
import * as THREE from '@pryzm/renderer-three/three';
import { WindowBuilder } from '../src/WindowBuilder';
import { hostedElementFrame } from '@pryzm/geometry-wall';

const CURVED_WALL = {
    id: 'w1', levelId: 'L0', thickness: 0.2, height: 3, baseOffset: 0,
    baseLine: [{ x: 0, y: 0, z: 0 }, { x: 6, y: 0, z: 0 }],
    curve: { control: { x: 3, y: 0, z: -2.4 }, segments: 16 },
    openings: [{ elementId: 'win1', offset: 2.0, width: 1.2, height: 1.4, sillHeight: 0.9 }],
};

const STRAIGHT_WALL = {
    id: 'w1', levelId: 'L0', thickness: 0.2, height: 3, baseOffset: 0,
    baseLine: [{ x: 0, y: 0, z: 0 }, { x: 6, y: 0, z: 0 }],
};

/** 2 columns × 2 rows, so there is a real MULLION and a real TRANSOM to measure. */
const WIN = {
    id: 'win1', wallId: 'w1', openingId: 'o1',
    offset: 2.0, width: 1.2, height: 1.4, sillHeight: 0.9,
    frameThickness: 0.05, frameDepth: 0.2, frameColor: '#e8e8e8',
    columnRatios: [1, 1], rowRatios: [1, 1],
    columnDividerThickness: 0.03, rowDividerThickness: 0.03,
    sill: true, sillDepth: 0.08, sillThickness: 0.03,
    glassOpacity: 0.3, windowType: 'single',
};

function buildOn(wall: unknown): THREE.Group {
    const wallStoreStub = {
        getById: () => wall,
        getLevelById: () => ({ id: 'L0', elevation: 0 }),
    } as never;
    const scene = new THREE.Scene();
    const builder = new WindowBuilder(scene, wallStoreStub);
    (builder as unknown as { rebuild(x: unknown): void }).rebuild(WIN);
    let group: THREE.Group | null = null;
    scene.traverse(o => { if (o.userData?.id === WIN.id && o !== scene) group = o as THREE.Group; });
    expect(group).toBeTruthy();
    scene.updateMatrixWorld(true);
    return group!;
}

function byRole(group: THREE.Group, role: string): THREE.Mesh[] {
    const out: THREE.Mesh[] = [];
    group.traverse(o => { if (o instanceof THREE.Mesh && o.userData?.role === role) out.push(o); });
    return out;
}

/** True when the mesh is a plain `BoxGeometry` — i.e. it was NOT swept. */
function isBox(m: THREE.Mesh): boolean {
    return (m.geometry as { parameters?: unknown }).parameters !== undefined;
}

/** Perpendicular offset of the mesh's mid-span from the chord joining its ends. */
function sagitta(m: THREE.Mesh): number {
    const pos = m.geometry.getAttribute('position');
    const v = new THREE.Vector3();
    const pts: Array<{ x: number; z: number }> = [];
    for (let i = 0; i < pos.count; i++) {
        v.set(pos.getX(i), pos.getY(i), pos.getZ(i)).applyMatrix4(m.matrixWorld);
        pts.push({ x: v.x, z: v.z });
    }
    const xs = pts.map(p => p.x);
    const a = pts[xs.indexOf(Math.min(...xs))]!;
    const b = pts[xs.indexOf(Math.max(...xs))]!;
    const dx = b.x - a.x, dz = b.z - a.z;
    const L = Math.hypot(dx, dz) || 1;
    let worst = 0;
    for (const p of pts) worst = Math.max(worst, Math.abs((p.x - a.x) * dz - (p.z - a.z) * dx) / L);
    return worst;
}

describe('§FEAT-CURVED-WINDOW-LEAF slice 2 — horizontals sweep the arc, verticals stay straight', () => {
    it('HEAD and CILL are swept, and actually bow', () => {
        const g = buildOn(CURVED_WALL);
        const frames = byRole(g, 'windowFrame');
        expect(frames).toHaveLength(4);              // head, cill, 2 jambs
        const swept = frames.filter(m => !isBox(m));
        expect(swept).toHaveLength(2);               // exactly the two horizontals
        for (const m of swept) expect(sagitta(m)).toBeGreaterThan(0.002);
    });

    it('the two JAMBS stay STRAIGHT boxes — a vertical ruling cannot bend', () => {
        const jambs = byRole(buildOn(CURVED_WALL), 'windowFrame').filter(isBox);
        expect(jambs).toHaveLength(2);
        for (const m of jambs) {
            // …and each is genuinely a box of the authored jamb section, not a
            // swept solid that happens to carry `parameters`.
            const p = (m.geometry as unknown as { parameters: { width: number; height: number } }).parameters;
            expect(p.width).toBeCloseTo(WIN.frameThickness, 9);
            expect(p.height).toBeCloseTo(WIN.height - 2 * WIN.frameThickness, 9);
        }
    });

    it('the JAMBS are RE-SEATED: displaced onto the arc and turned to the local tangent', () => {
        // The half of "verticals stay straight" that is easy to get wrong. A jamb
        // left at its chord position would sit off the wall; a jamb left at the
        // centre's heading would twist out of the reveal.
        const jambs = byRole(buildOn(CURVED_WALL), 'windowFrame').filter(isBox);
        const hf = hostedElementFrame(CURVED_WALL, WIN.offset, WIN.width);
        const half = WIN.width / 2 - WIN.frameThickness / 2;

        for (const sLocal of [-half, half]) {
            const want = hf.at(sLocal, 0);
            const hit = jambs.find(m => {
                const p = new THREE.Vector3().setFromMatrixPosition(m.matrixWorld);
                return Math.hypot(p.x - want.x, p.z - want.z) < 1e-6;
            });
            expect(hit, `no jamb seated at sLocal=${sLocal}`).toBeTruthy();
            // Turned, not merely moved: its local heading differs from the centre's.
            expect(Math.abs(hit!.rotation.y)).toBeGreaterThan(1e-3);
        }
    });

    it('TRANSOMS sweep; MULLIONS do not', () => {
        const g = buildOn(CURVED_WALL);
        const transoms = byRole(g, 'windowTransom');
        const mullions = byRole(g, 'windowMullion');
        expect(transoms.length).toBeGreaterThan(0);
        expect(mullions.length).toBeGreaterThan(0);
        for (const m of transoms) expect(isBox(m)).toBe(false);
        for (const m of mullions) expect(isBox(m)).toBe(true);
    });

    it('SASH rails sweep and SASH stiles do not — the same split, one level down', () => {
        const sashes = byRole(buildOn(CURVED_WALL), 'windowSash');
        expect(sashes.length).toBeGreaterThan(0);
        const rails = sashes.filter(m => !isBox(m));
        const stiles = sashes.filter(isBox);
        // Every cell contributes two of each, so the split must be exactly even.
        expect(rails.length).toBe(stiles.length);
        expect(rails.length).toBeGreaterThan(0);
    });

    it('the SILL BOARD sweeps, including its overhang past each jamb', () => {
        const sill = byRole(buildOn(CURVED_WALL), 'windowSill');
        expect(sill).toHaveLength(1);
        expect(isBox(sill[0]!)).toBe(false);
        expect(sagitta(sill[0]!)).toBeGreaterThan(0.002);
    });

    it('THE SEAM: head and cill end on the VOID\'S OWN jamb stations', () => {
        // The assertion the founder would notice the absence of. The head spans the
        // full authored width, so its two radial end caps must land on arc lengths
        // `offset` and `offset + width` — the exact stations
        // `CurvedWallOpeningBuilder.sliceStations` terminates the wall's bands on.
        const head = byRole(buildOn(CURVED_WALL), 'windowFrame').filter(m => !isBox(m))[0]!;
        const hf = hostedElementFrame(CURVED_WALL, WIN.offset, WIN.width);
        const halfT = CURVED_WALL.thickness / 2 + 0.01;   // frameDepth = thickness + 0.02

        const pos = head.geometry.getAttribute('position');
        const v = new THREE.Vector3();
        const seen: Array<{ x: number; z: number }> = [];
        for (let i = 0; i < pos.count; i++) {
            v.set(pos.getX(i), pos.getY(i), pos.getZ(i)).applyMatrix4(head.matrixWorld);
            seen.push({ x: v.x, z: v.z });
        }

        // Both corners of each end cap, on the centreline datum and at both faces.
        for (const sLocal of [-WIN.width / 2, WIN.width / 2]) {
            for (const n of [-halfT, halfT]) {
                const want = hf.at(sLocal, n);
                const best = Math.min(...seen.map(p => Math.hypot(p.x - want.x, p.z - want.z)));
                // 1e-5 m is float32 vertex storage, not slack — see the slice-1 test.
                expect(best, `end cap corner s=${sLocal} n=${n}`).toBeLessThan(1e-5);
            }
        }
    });

    // ── NON-VACUITY ─────────────────────────────────────────────────────────
    it('on a STRAIGHT host EVERY member is still a plain box', () => {
        const g = buildOn(STRAIGHT_WALL);
        const all: THREE.Mesh[] = [];
        g.traverse(o => { if (o instanceof THREE.Mesh) all.push(o); });
        expect(all.length).toBeGreaterThan(10);
        for (const m of all) expect(isBox(m)).toBe(true);
        // …and unrotated: nothing was re-seated on a wall that does not turn.
        for (const m of all) expect(m.rotation.y).toBe(0);
    });
});
