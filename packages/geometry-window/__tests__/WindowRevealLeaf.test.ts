/**
 * ⭐ §FEAT-WINDOW-REVEAL (L-1920 … L-1929) — THE REVEAL, AS BUILT GEOMETRY.
 *
 * COMMITTED ≠ REACHABLE. `WindowRevealModel.test.ts` proves the arithmetic; this file
 * proves the arithmetic REACHES MESHES, by reading the real scene graph after a real
 * `WindowBuilder.rebuild()` — never a pure function's return value. Both halves are needed:
 * a correct model wired to nothing is the single most common defect shape in this repo.
 *
 * The harness is `StraightHostLeafByteIdentical.test.ts`'s, deliberately: that file already
 * pins the unauthored straight-host leaf to a SHA-256, so the byte-identity claim is
 * enforced there and this file does not restate it. What it adds is the other direction —
 * that an AUTHORED reveal actually changes the solids, in the places the model says.
 */

import { describe, it, expect } from 'vitest';
import * as THREE from '@pryzm/renderer-three/three';
import { WindowBuilder } from '../src/WindowBuilder';
import { resolveWindowReveal } from '../src/WindowReveal';

/** A plain 6 m STRAIGHT wall along +X, 300 mm thick ⇒ a 150 mm reveal run. */
const WALL = {
    id: 'w1', levelId: 'L0', thickness: 0.3, height: 3, baseOffset: 0,
    baseLine: [{ x: 0, y: 0, z: 0 }, { x: 6, y: 0, z: 0 }],
};

/** A LAYERED wall of the same total thickness — the founder said "for all wall types". */
const LAYERED_WALL = {
    ...WALL, id: 'w2',
    layers: [
        { name: 'Render',  thickness: 0.02, materialColor: '#eeeeee', function: 'finish-exterior' },
        { name: 'Block',   thickness: 0.25, materialColor: '#cccccc', function: 'structure' },
        { name: 'Plaster', thickness: 0.03, materialColor: '#ffffff', function: 'finish-interior' },
    ],
};

const WIN = {
    id: 'win1', wallId: 'w1', openingId: 'o1',
    offset: 2.0, width: 1.2, height: 1.4, sillHeight: 0.9,
    frameThickness: 0.05, frameDepth: 0.2, frameColor: '#e8e8e8',
    columnRatios: [1], rowRatios: [1],
    columnDividerThickness: 0.03, rowDividerThickness: 0.03,
    sill: true, sillDepth: 0.08, sillThickness: 0.03,
    glassOpacity: 0.3, windowType: 'single',
};

function buildGroup(win: Record<string, unknown>, wall: Record<string, unknown> = WALL): THREE.Group {
    const wallStoreStub = {
        getById: () => wall,
        getLevelById: () => ({ id: 'L0', elevation: 0 }),
    } as never;
    const scene = new THREE.Scene();
    const builder = new WindowBuilder(scene, wallStoreStub);
    (builder as unknown as { rebuild(x: unknown): void }).rebuild(win);
    let group: THREE.Group | null = null;
    scene.traverse(o => { if (o.userData?.id === win.id && o !== scene) group = o as THREE.Group; });
    expect(group).toBeTruthy();
    scene.updateMatrixWorld(true);
    return group!;
}

function partsByRole(group: THREE.Group): Record<string, THREE.Mesh[]> {
    const out: Record<string, THREE.Mesh[]> = {};
    group.traverse(o => {
        if (!(o instanceof THREE.Mesh)) return;
        const r = String(o.userData?.role ?? '?');
        (out[r] ??= []).push(o);
    });
    return out;
}

/** Local-space Z extent of a mesh, in the window group's own frame (exterior = −Z). */
function localZRange(m: THREE.Mesh): { min: number; max: number } {
    m.geometry.computeBoundingBox();
    const bb = m.geometry.boundingBox!;
    return { min: bb.min.z + m.position.z, max: bb.max.z + m.position.z };
}

describe('§FEAT-WINDOW-REVEAL — the PROJECTING BOX reaches the mesh', () => {
    // ⚠ INVERTED 2026-08-22 (L-3410), NOT DELETED. This asserted the box grew along −Z and
    // it PASSED while the founder watched the box grow into his ROOM. See
    // `WindowReveal.EXTERIOR_LOCAL_Z`'s header for what was measured and why the literal
    // moved; the short version is that the constant it agreed with was never consumed by any
    // production line, so the whole chain was self-consistent and unanchored.
    it('deepens the frame by exactly the projection and pushes it OUTWARD (+Z, the OUTDOOR face)', () => {
        const plain = partsByRole(buildGroup({ ...WIN }));
        const boxed = partsByRole(buildGroup({ ...WIN, id: 'winB', revealProjection: 0.4 }));

        const plainHead = localZRange(plain.windowFrame![0]!);
        const boxedHead = localZRange(boxed.windowFrame![0]!);

        // The INNER face is unchanged — the box grows outward only, so nothing pokes into
        // the room. That half is as important as the projection itself.
        // ⚠ PRECISION 6, NOT 9, AND THE REASON IS STRUCTURAL: `BoxGeometry` stores its
        // positions as **Float32**, whose relative precision near 0.16 m is ~1e-8. Asserting
        // to 1e-9 here would be asserting a precision the renderer's own buffers cannot
        // hold, i.e. a test that fails on the vertex format rather than on the geometry.
        // 1e-6 m is one micron — four orders finer than anything this feature can move.
        expect(boxedHead.min).toBeCloseTo(plainHead.min, 6);
        // …and the OUTER face has moved 400 mm further out.
        expect(boxedHead.max).toBeCloseTo(plainHead.max + 0.4, 6);
        expect(boxedHead.max).toBeGreaterThan(plainHead.max);   // +Z is the outdoor face
    });

    it('carries the GLAZING out with the box, one reveal run behind the lip', () => {
        const boxed = partsByRole(buildGroup({ ...WIN, id: 'winC', revealProjection: 0.4 }));
        const pane = boxed.windowGlazing![0]!;
        const model = resolveWindowReveal({ ...WIN, revealProjection: 0.4 } as never, 0.3);
        // The mesh's own position IS the model's glazing plane — measured, not assumed equal.
        expect(pane.position.z).toBeCloseTo(model.zGlazing, 6);
        expect(pane.position.z).toBeCloseTo(0.4, 6);
    });

    it('builds NO splay plates when only the projection is set', () => {
        const boxed = partsByRole(buildGroup({ ...WIN, id: 'winD', revealProjection: 0.4 }));
        expect(boxed.windowReveal).toBeUndefined();
    });

    it('works identically on a LAYERED wall — "for all wall types"', () => {
        // The reveal is FRAME geometry hosted in the void; the wall's own layer stack is not
        // consulted and cannot perturb it. Same total thickness ⇒ same solid, exactly.
        const plainZ   = localZRange(partsByRole(buildGroup({ ...WIN, id: 'winL1', revealProjection: 0.4 })).windowFrame![0]!);
        const layeredZ = localZRange(partsByRole(buildGroup({ ...WIN, id: 'winL2', wallId: 'w2', revealProjection: 0.4 }, LAYERED_WALL)).windowFrame![0]!);
        expect(layeredZ.min).toBeCloseTo(plainZ.min, 6);
        expect(layeredZ.max).toBeCloseTo(plainZ.max, 6);
    });
});

describe('§FEAT-WINDOW-REVEAL — the SPLAY reaches the mesh, per side', () => {
    it('emits ONE reveal plate per splayed side, and none for the others', () => {
        const head = partsByRole(buildGroup({ ...WIN, id: 'winE', revealSplayHead: 30 }));
        expect(head.windowReveal).toHaveLength(1);

        const all = partsByRole(buildGroup({
            ...WIN, id: 'winF',
            revealSplayHead: 30, revealSplaySill: 30,
            revealSplayJambLeft: 30, revealSplayJambRight: 30,
        }));
        expect(all.windowReveal).toHaveLength(4);

        // "multiple" — two named sides, two plates. No mode enum was needed to express it.
        const two = partsByRole(buildGroup({ ...WIN, id: 'winG', revealSplayHead: 30, revealSplayJambLeft: 25 }));
        expect(two.windowReveal).toHaveLength(2);
    });

    it('SHRINKS THE GLASS by the model\'s amount — the founder\'s own sentence', () => {
        const plainPane = partsByRole(buildGroup({ ...WIN })).windowGlazing![0]!;
        const splayPane = partsByRole(buildGroup({
            ...WIN, id: 'winH', revealSplayJambLeft: 45, revealSplayJambRight: 45,
        })).windowGlazing![0]!;

        plainPane.geometry.computeBoundingBox();
        splayPane.geometry.computeBoundingBox();
        const wPlain = plainPane.geometry.boundingBox!.max.x - plainPane.geometry.boundingBox!.min.x;
        const wSplay = splayPane.geometry.boundingBox!.max.x - splayPane.geometry.boundingBox!.min.x;
        // 45° over a 150 mm run removes 150 mm per jamb: 300 mm off the pane.
        expect(wPlain - wSplay).toBeCloseTo(0.3, 6);
    });

    it('the reveal plate spans from the OUTER plane to the GLAZING plane, not somewhere between', () => {
        const win = { ...WIN, id: 'winI', revealSplayHead: 40, revealProjection: 0.2 };
        const plate = partsByRole(buildGroup(win)).windowReveal![0]!;
        const model = resolveWindowReveal(win as never, 0.3);
        const z = localZRange(plate);
        // Precision 6 — Float32 vertex buffers; see the note in the projection test above.
        // ⚠ min/max SWAPPED with the axis (L-3410): the plate still spans exactly the outer
        // plane to the glazing plane, but on the outdoor face the outer plane is the LARGER
        // z. Asserted against the model's own two numbers so this cannot drift from it again.
        expect(z.max).toBeCloseTo(model.zOuterFace, 6);
        expect(z.min).toBeCloseTo(model.zGlazing, 6);
    });

    it('the plate is a CLOSED solid with outward normals — a hand-written winding, measured', () => {
        // The failure this guards is specific and ugly: an inverted winding renders the
        // wedge inside-out under FrontSide, which reads as a dark hole rather than as an
        // obvious error. `addTriPrism` computes the signed volume and flips; assert it worked.
        const plate = partsByRole(buildGroup({ ...WIN, id: 'winJ', revealSplayHead: 40 })).windowReveal![0]!;
        const pos = plate.geometry.getAttribute('position');
        expect(pos.count).toBe(24);          // 8 triangles, non-indexed
        let vol = 0;
        for (let i = 0; i < pos.count; i += 3) {
            const a = new THREE.Vector3().fromBufferAttribute(pos, i);
            const b = new THREE.Vector3().fromBufferAttribute(pos, i + 1);
            const c = new THREE.Vector3().fromBufferAttribute(pos, i + 2);
            vol += a.dot(new THREE.Vector3().crossVectors(b, c)) / 6;
        }
        expect(vol).toBeGreaterThan(0);      // > 0 ⇒ outward-facing
    });
});

describe('§FEAT-WINDOW-REVEAL — the exclusions are real, not aspirational', () => {
    it('a CURVED host builds NO reveal — refused rather than built wrong', () => {
        // Parity with `openingOutlineLocal`, which refuses a non-rectangular void on an arc
        // for the same reason: the members would be re-seated onto the wrong station and the
        // leaf would lean out of its own hole while reporting success (L-1928).
        const curved = {
            ...WALL, id: 'w3',
            curve: { control: { x: 3, y: 0, z: 1.5 }, segments: 12 },
        };
        const g = partsByRole(buildGroup(
            { ...WIN, id: 'winK', wallId: 'w3', revealSplayHead: 40, revealProjection: 0.3 },
            curved,
        ));
        expect(g.windowReveal).toBeUndefined();
    });
});

// ── ⭐ §FEAT-REVEAL-DIRECTION (L-3411, founder 2026-08-22) — THE DIRECTION REACHES THE MESH
//
// ⛔ A VALUE THAT STORES BUT NEVER RENDERS IS A LIE. The model tests
// (`WindowRevealModel.test.ts`) prove the arithmetic mirrors; they cannot prove the BUILDER
// consumes it, and the builder carried two hard-coded signs of its own (`fd / 2` and
// `- 0.01`) that would have kept the frame on one face while the reveal moved to the other.
// So these assertions are read off real BufferGeometry, after a real build.
describe('§FEAT-REVEAL-DIRECTION — Indoor / Outdoor reaches the built leaf', () => {
    it('⭐ the box grows on the side the user chose — the whole founder ask, at the mesh', () => {
        const plain = partsByRole(buildGroup({ ...WIN, id: 'winDir0' }));
        const out   = partsByRole(buildGroup({ ...WIN, id: 'winDirO', revealProjection: 0.4 }));
        const inn   = partsByRole(buildGroup({ ...WIN, id: 'winDirI', revealProjection: 0.4, revealDirection: 'indoor' } as never));

        const p = localZRange(plain.windowFrame![0]!);
        const o = localZRange(out.windowFrame![0]!);
        const i = localZRange(inn.windowFrame![0]!);

        // OUTDOOR grows in +Z and leaves the indoor face alone.
        expect(o.max).toBeCloseTo(p.max + 0.4, 6);
        expect(o.min).toBeCloseTo(p.min, 6);
        // INDOOR is its exact mirror: grows in −Z, outdoor face untouched.
        expect(i.min).toBeCloseTo(p.min - 0.4, 6);
        expect(i.max).toBeCloseTo(p.max, 6);
    });

    it('the GLAZING follows the direction too — one plane, not two', () => {
        const o = partsByRole(buildGroup({ ...WIN, id: 'winDirGO', revealProjection: 0.4 })).windowGlazing![0]!;
        const i = partsByRole(buildGroup({ ...WIN, id: 'winDirGI', revealProjection: 0.4, revealDirection: 'indoor' } as never)).windowGlazing![0]!;
        expect(o.position.z).toBeCloseTo(0.4, 6);
        expect(i.position.z).toBeCloseTo(-0.4, 6);
    });

    it('⭐ the SPLAY PLATE follows the SAME flag — request (3): not only the projecting box', () => {
        // The founder asked twice, explicitly: the direction must apply to the projecting
        // box AND to the splay. A flag wired to one of the two is the ADR-0342 fork.
        const o = partsByRole(buildGroup({ ...WIN, id: 'winDirSO', revealSplayHead: 40 })).windowReveal![0]!;
        const i = partsByRole(buildGroup({ ...WIN, id: 'winDirSI', revealSplayHead: 40, revealDirection: 'indoor' } as never)).windowReveal![0]!;
        const zo = localZRange(o);
        const zi = localZRange(i);
        expect(zo.max).toBeCloseTo(-zi.min, 6);
        expect(zo.min).toBeCloseTo(-zi.max, 6);
        // NON-VACUITY — the two plates really are on opposite sides of the wall centre.
        expect(zo.max).toBeGreaterThan(0);
        expect(zi.min).toBeLessThan(0);
    });

    it('⛔ an UNAUTHORED window is untouched by the flag — C84 EI-2 at the mesh', () => {
        const a = localZRange(partsByRole(buildGroup({ ...WIN, id: 'winDirN1' })).windowFrame![0]!);
        const b = localZRange(partsByRole(buildGroup({ ...WIN, id: 'winDirN2', revealDirection: 'indoor' } as never)).windowFrame![0]!);
        expect(b.min).toBeCloseTo(a.min, 9);
        expect(b.max).toBeCloseTo(a.max, 9);
    });
});
