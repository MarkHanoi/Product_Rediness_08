/**
 * §FEAT-CURVED-DOOR-LEAF (L-957) — SLICE 2: HORIZONTALS SWEEP, VERTICALS DO NOT.
 *
 * The founder's spec is a decomposition, not a blanket "make the door curved":
 * the horizontal members are curved — head, threshold, the leaf's rails — and by
 * implication the verticals stay straight. That implication is only sound because
 * the host's curve is a VERTICAL-AXIS SWEEP, which `CurvedLeafGeometry`'s header
 * establishes by measurement rather than assertion (`WallArcParam` ignores `y`;
 * the wall's own `Station` type is `{cx,cz,nx,nz}` extruded by a scalar height).
 * On such a surface every vertical line is a straight ruling.
 *
 * So this file measures BOTH halves. A version of this feature that swept
 * everything would pass a "the frame is curved" test and be wrong — it would put
 * a bend in a door post that physically cannot bend. And a version that swept
 * nothing would pass a "the posts are straight" test and be the flat door we
 * started with. Each assertion below is paired with the one that stops it being
 * vacuous.
 *
 * THE SEAM. The strongest assertion here is the last: the head and the threshold
 * span the full authored width, so their radial end caps must land on the SAME
 * two stations `CurvedWallOpeningBuilder` terminates the void's bands on. If they
 * did not, the founder would see a line where the frame meets the reveal — which
 * is the whole reason L-957 insists on the wall's own curve rather than a
 * matching one.
 *
 * ── HOW MEMBERS ARE IDENTIFIED, AND WHY NOT BY ROLE ─────────────────────────
 * `DoorBuilder` tags only `doorLeaf` / `doorGlazing` / `doorHandle`; its frame
 * members carry NO `userData.role`, and the sibling `Door3dDetailLevel` suite
 * identifies them precisely BY that absence (`role === undefined`). Adding tags
 * here would silently break that filter, so this feature adds none and this file
 * discriminates by GEOMETRY instead: a swept member is a raw `BufferGeometry`
 * (no `.parameters`), a straight one is still a `BoxGeometry`. That is a stronger
 * test anyway — it reads what was BUILT, not what was labelled.
 */

import { describe, it, expect } from 'vitest';
import * as THREE from '@pryzm/renderer-three/three';
import { viewDefinitionStore, DEFAULT_3D_VIEW_ID, initDefaultViewsManager } from '@pryzm/core-app-model';
import { DoorBuilder } from '../src/DoorBuilder';
import { hostedElementFrame } from '@pryzm/geometry-wall';

const CURVED_WALL = {
    id: 'w1', levelId: 'L0', thickness: 0.2, height: 3, baseOffset: 0,
    baseLine: [{ x: 0, y: 0, z: 0 }, { x: 6, y: 0, z: 0 }],
    curve: { control: { x: 3, y: 0, z: -2.4 }, segments: 16 },
    openings: [{ elementId: 'd1', offset: 2.0, width: 0.9, height: 2.1, sillHeight: 0 }],
};

const STRAIGHT_WALL = {
    id: 'w1', levelId: 'L0', thickness: 0.2, height: 3, baseOffset: 0,
    baseLine: [{ x: 0, y: 0, z: 0 }, { x: 6, y: 0, z: 0 }],
};

const DOOR = {
    id: 'd1', wallId: 'w1', openingId: 'o1',
    offset: 2.0, width: 0.9, height: 2.1, sillHeight: 0,
    doorType: 'single', hingesSide: 'left', handleSide: 'right', swingDirection: 'inward',
    frameThickness: 0.05, frameDepth: 0.07, leafThickness: 0.04,
    frameColor: '#8b5a2b', leafColor: '#c8a165',
    handle: true, handleHeight: 1.05,
    threshold: true, thresholdHeight: 0.02, leafVisibleInPlan: false,
};

type Lod = 'coarse' | 'medium' | 'fine';

function buildOn(wall: unknown, lod: Lod = 'fine', door: Record<string, unknown> = DOOR): THREE.Group {
    initDefaultViewsManager();
    viewDefinitionStore.update(DEFAULT_3D_VIEW_ID, { output: { detailLevel: lod } } as never);
    const wallStoreStub = {
        getById: () => wall,
        getLevelById: () => ({ id: 'L0', elevation: 0 }),
    } as never;
    const scene = new THREE.Scene();
    const builder = new DoorBuilder(scene, wallStoreStub);
    (builder as unknown as { rebuild(x: unknown): void }).rebuild(door);
    let group: THREE.Group | null = null;
    scene.traverse(o => { if (o.userData?.id === door.id && o !== scene) group = o as THREE.Group; });
    expect(group).toBeTruthy();
    scene.updateMatrixWorld(true);
    return group!;
}

/** True when the mesh is a plain `BoxGeometry` — i.e. NOT swept. */
const isBox = (m: THREE.Mesh): boolean =>
    (m.geometry as unknown as { parameters?: unknown }).parameters !== undefined;

function meshes(group: THREE.Group, role?: string): THREE.Mesh[] {
    const out: THREE.Mesh[] = [];
    group.traverse(o => {
        if (!(o instanceof THREE.Mesh)) return;
        if (role === undefined) { if (o.userData?.role === undefined) out.push(o); }
        else if (o.userData?.role === role) out.push(o);
    });
    return out;
}

/** Every vertex of `mesh` in WORLD space. */
function worldVerts(mesh: THREE.Mesh): Array<{ x: number; y: number; z: number }> {
    const pos = mesh.geometry.getAttribute('position');
    const out: Array<{ x: number; y: number; z: number }> = [];
    const v = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
        v.set(pos.getX(i), pos.getY(i), pos.getZ(i)).applyMatrix4(mesh.matrixWorld);
        out.push({ x: v.x, y: v.y, z: v.z });
    }
    return out;
}

/** Perpendicular departure of the mesh's mid-span vertex from its own end chord. */
function sagitta(mesh: THREE.Mesh): number {
    const vs = worldVerts(mesh);
    const xs = vs.map(p => p.x);
    const xMin = Math.min(...xs), xMax = Math.max(...xs);
    const end0 = vs.find(p => Math.abs(p.x - xMin) < 1e-9)!;
    const end1 = vs.find(p => Math.abs(p.x - xMax) < 1e-9)!;
    const mid = vs.reduce((best, p) =>
        Math.abs(p.x - (xMin + xMax) / 2) < Math.abs(best.x - (xMin + xMax) / 2) ? p : best, vs[0]!);
    const dx = end1.x - end0.x, dz = end1.z - end0.z;
    const L = Math.hypot(dx, dz) || 1;
    return Math.abs((mid.x - end0.x) * dz - (mid.z - end0.z) * dx) / L;
}

describe('§FEAT-CURVED-DOOR-LEAF slice 2 — the horizontals sweep, the verticals do not', () => {
    it('the FRAME contains BOTH swept and straight members — the split is real', () => {
        // The paired non-vacuity for everything below: if the frame were entirely
        // one or entirely the other, every later assertion could be satisfied by a
        // feature that did nothing, or by one that swept the posts.
        const frame = meshes(buildOn(CURVED_WALL, 'medium'));
        const swept = frame.filter(m => !isBox(m));
        const straight = frame.filter(m => isBox(m));
        expect(swept.length).toBeGreaterThan(0);
        expect(straight.length).toBeGreaterThan(0);
    });

    it('HEAD and THRESHOLD are swept, and actually bow', () => {
        // Both span the full width `w`, so on this wall they are the two widest
        // frame members and they must carry a real sagitta — not float noise.
        const frame = meshes(buildOn(CURVED_WALL, 'medium'));
        const swept = frame.filter(m => !isBox(m));
        expect(swept.length).toBe(2);                  // head + threshold at medium
        for (const m of swept) expect(sagitta(m)).toBeGreaterThan(0.002);
    });

    it('the two POSTS stay STRAIGHT boxes — a vertical ruling cannot bend', () => {
        // The founder's simplification, and it must not erode: a vertical line on a
        // vertical-axis sweep is already straight.
        const frame = meshes(buildOn(CURVED_WALL, 'medium'));
        const boxes = frame.filter(m => isBox(m));
        const posts = boxes.filter(m => {
            const p = (m.geometry as unknown as { parameters: { height: number } }).parameters;
            return Math.abs(p.height - DOOR.height) < 1e-9;
        });
        expect(posts).toHaveLength(2);
    });

    it('the POSTS are RE-SEATED: displaced onto the arc and turned to the local tangent', () => {
        // Straight is not the same as UNMOVED. Each post must sit where the wall's
        // own resolver puts its station and face the local tangent there, or it
        // would stand proud of the leaf on one side and sink into it on the other.
        const g = buildOn(CURVED_WALL, 'medium');
        const posts = meshes(g).filter(m => {
            if (!isBox(m)) return false;
            const p = (m.geometry as unknown as { parameters: { height: number } }).parameters;
            return Math.abs(p.height - DOOR.height) < 1e-9;
        });
        expect(posts).toHaveLength(2);

        const hf = hostedElementFrame(CURVED_WALL, DOOR.offset, DOOR.width);
        const ft = DOOR.frameThickness;
        for (const post of posts) {
            const sLocal = post.position.x >= 0
                ?  (DOOR.width / 2 - ft / 2)
                : -(DOOR.width / 2 - ft / 2);
            // Group-local: the resolver's world point, taken back into the group's
            // frame is what `arcSeat` produced. Compare in WORLD space instead —
            // fewer assumptions, and it is what the viewport actually shows.
            const want = hf.at(sLocal, 0);
            const got = post.getWorldPosition(new THREE.Vector3());
            expect(Math.hypot(got.x - want.x, got.z - want.z),
                `post at sLocal=${sLocal} is off its host station`).toBeLessThan(1e-5);
            // …and it is TURNED. A post at ±0.425 m along a wall of this curvature
            // sits several degrees off the centre heading; zero would mean the
            // re-seat moved it but left it facing the chord.
            expect(Math.abs(post.rotation.y)).toBeGreaterThan(1e-3);
        }
    });

    it('LEAF RAILS sweep and LEAF STILES do not — the same split, one level down', () => {
        // At `fine` the leaf is built rail-and-stile. The rule must reach the
        // finest tier of the model, not just the outer frame: a real curved
        // rail-and-stile door has bent rails and straight stiles.
        const leaf = meshes(buildOn(CURVED_WALL, 'fine'), 'doorLeaf');
        const stiles = leaf.filter(m => isBox(m));
        const rails  = leaf.filter(m => !isBox(m));
        expect(stiles.length).toBe(2);                 // two full-height stiles
        expect(rails.length).toBeGreaterThanOrEqual(2); // top + bottom rail, + panels
        for (const r of rails) expect(sagitta(r)).toBeGreaterThan(0);
    });

    it('IRONMONGERY is re-seated, never bent — a lever is a rigid manufactured object', () => {
        // The door's own addition to the window's rule. Hardware pivots with the
        // wall's local frame; it does not follow the arc. This mirrors what
        // §FIX-HOSTED-PLAN-SYMBOL-ON-CURVED-HOST already decided for the plan
        // symbol's rigid sub-assemblies.
        const hardware = meshes(buildOn(CURVED_WALL, 'fine'), 'doorHandle');
        expect(hardware.length).toBeGreaterThan(0);
        for (const m of hardware) expect(isBox(m)).toBe(true);
    });

    it('THE SEAM: head and threshold end on the VOID\'S OWN jamb stations', () => {
        // The assertion the founder would notice the absence of. Both members span
        // the full authored width, so their two radial end caps must land on arc
        // lengths `offset` and `offset + width` — the exact stations
        // `CurvedWallOpeningBuilder` terminates the wall's bands on.
        const swept = meshes(buildOn(CURVED_WALL, 'medium')).filter(m => !isBox(m));
        expect(swept.length).toBe(2);
        const hf = hostedElementFrame(CURVED_WALL, DOOR.offset, DOOR.width);
        const halfT = CURVED_WALL.thickness / 2 + 0.01;   // frameDepth = thickness + 0.02

        for (const member of swept) {
            const seen = worldVerts(member).map(p => ({ x: p.x, z: p.z }));
            // Both corners of each end cap, on the centreline datum and at both faces.
            for (const sLocal of [-DOOR.width / 2, DOOR.width / 2]) {
                for (const n of [-halfT, halfT]) {
                    const want = hf.at(sLocal, n);
                    const best = Math.min(...seen.map(p => Math.hypot(p.x - want.x, p.z - want.z)));
                    // 1e-5 m is float32 vertex storage, not slack — see the slice-1 test.
                    expect(best, `end cap corner s=${sLocal} n=${n}`).toBeLessThan(1e-5);
                }
            }
        }
    });

    // ── NON-VACUITY ─────────────────────────────────────────────────────────
    it('on a STRAIGHT host EVERY member is still a plain box', () => {
        // The structural restatement of slice 0's digest: nothing on a straight
        // wall may reach the sweep at all.
        for (const lod of ['coarse', 'medium', 'fine'] as Lod[]) {
            const g = buildOn(STRAIGHT_WALL, lod);
            const all: THREE.Mesh[] = [];
            g.traverse(o => { if (o instanceof THREE.Mesh) all.push(o); });
            expect(all.length).toBeGreaterThan(0);
            for (const m of all) {
                expect(isBox(m), `a straight-host member was swept (role=${m.userData?.role ?? 'frame'})`).toBe(true);
            }
        }
    });
});
