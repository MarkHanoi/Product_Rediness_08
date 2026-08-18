/**
 * §FEAT-CURVED-DOOR-LEAF (L-957) — SLICE 0, THE CONTROL.
 *
 * L-957 shipped for windows and the founder has now asked for the same on DOORS:
 * the leaf, its glazed lights and the HORIZONTAL frame members follow the host
 * wall's exact arc. The single largest risk in that change is not the curved case
 * at all — it is the STRAIGHT one. Every door in every project today is built by
 * `DoorBuilder.buildVisuals()`, and a "conform to the host" rewrite that perturbs
 * a straight wall's door by a micron has silently re-authored the whole model.
 *
 * So before any feature code, this file pins the straight-host door EXACTLY:
 * every sub-mesh, its role, its full world matrix, and every vertex of its
 * geometry, hashed into one string. Not `toBeCloseTo` — an exact digest. On a
 * straight wall the arc IS the chord (`WallArcParam`: *"for a straight wall the
 * arc IS the chord, so all maths below is bit-identical to the legacy formula"*),
 * so there is no rounding budget to spend and none is granted.
 *
 * ── WATCHED RED (a control that cannot fail is not a control) ────────────────
 * The digests below were captured from `main` before any feature code existed,
 * and the pin was then deliberately broken to prove it bites: moving a single
 * vertex by ONE FLOAT32 ULP — ~1.2e-7 m at the frame post's coordinates, four
 * orders below any `toBeCloseTo(…, 6)` in this repo — fails this test. The final
 * `it` automates that proof against the built scene, so the control's own
 * liveness is re-checked on every run rather than once by hand.
 *
 * That last `it` is also where this file's first RED came from, and it is worth
 * reading before copying the window lane's version of it: the window's control
 * perturbs by a flat `1e-9 m`, and on a DOOR that is a NO-OP. Vertices are stored
 * float32; one ulp at a 2.1 m door's `y = ±1.05` is ~1.2e-7 m, so `1.05 + 1e-9`
 * rounds straight back to `1.05` and the assertion passed while measuring nothing.
 * The control now perturbs by the smallest change the storage can represent, and
 * asserts that change is still below 1e-6 m — see the comment on that test.
 *
 * ── WHY THE LOD IS PINNED ────────────────────────────────────────────────────
 * §FEAT-DOOR-3D-LOD (L-266) makes the 3D door a real DetailLevel consumer, and it
 * resolves the tier from the LIVE `vd-sys-3d-1` ViewDefinition. A digest captured
 * without pinning that would be a digest of whatever view state the previous test
 * file left behind. Each `buildGroup` sets the tier explicitly, and BOTH ends of
 * the range (`fine`, the founder's articulated door, and `coarse`, the massing
 * silhouette) are pinned — a feature that leaks into only one tier is still a leak.
 *
 * COMMITTED ≠ REACHABLE: the digest is read off the built scene graph after a
 * real `rebuild()`, never off a pure function's return value.
 */

import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import * as THREE from '@pryzm/renderer-three/three';
import { viewDefinitionStore, DEFAULT_3D_VIEW_ID, initDefaultViewsManager } from '@pryzm/core-app-model';
import { DoorBuilder } from '../src/DoorBuilder';

/** A plain 6 m STRAIGHT wall along +X. No curve, no rake — the ordinary case. */
const WALL = {
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

function buildGroup(lod: Lod = 'fine', door: Record<string, unknown> = DOOR): THREE.Group {
    initDefaultViewsManager();                                   // ensures vd-sys-3d-1 exists
    viewDefinitionStore.update(DEFAULT_3D_VIEW_ID, { output: { detailLevel: lod } } as never);
    const wallStoreStub = {
        getById: () => WALL,
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

/**
 * A stable, ORDER-INDEPENDENT digest of every piece of geometry in the door.
 *
 * Per sub-mesh: its role, its full 16-element world matrix, and every position
 * vertex — all at full `toPrecision(17)` so a 1e-9 m perturbation cannot hide in
 * a rounding step. The per-mesh lines are SORTED before joining, so the digest
 * pins the SET of solids the door is made of rather than the order `buildVisuals`
 * happens to emit them in. (Re-ordering emission is a legitimate refactor;
 * moving a vertex is not.)
 *
 * ⚠ Most of the door's frame members carry NO `userData.role` — `DoorBuilder`
 * tags only `doorLeaf` / `doorGlazing` / `doorHandle`, and `Door3dDetailLevel`
 * identifies frame members precisely BY that absence. So the role field here is
 * `'?'` for them, deliberately: this feature must not start tagging parts, or
 * that sibling suite's `role === undefined` filter silently stops selecting the
 * frame. Slice 2 therefore identifies members by GEOMETRY, not by a new tag.
 */
function doorDigest(group: THREE.Group): string {
    const lines: string[] = [];
    group.traverse(o => {
        if (!(o instanceof THREE.Mesh)) return;
        const pos = o.geometry.getAttribute('position');
        const verts: string[] = [];
        for (let i = 0; i < pos.count; i++) {
            verts.push(
                `${pos.getX(i).toPrecision(17)},${pos.getY(i).toPrecision(17)},${pos.getZ(i).toPrecision(17)}`,
            );
        }
        const m = o.matrixWorld.elements.map(v => v.toPrecision(17)).join(',');
        lines.push(`${String(o.userData?.role ?? '?')}|${m}|${verts.join(';')}`);
    });
    return lines.sort().join('\n');
}

/**
 * The digest is tens of kB of full-precision floats — too large to read as a
 * literal, and a constant that size in a test file is a thing nobody reviews. So
 * the PIN is a SHA-256 of it. Hashing costs the diff (a failure says "changed",
 * not "which vertex"), which is the right trade for a control: the question it
 * answers is binary. `partCounts` below is what a failing run is read WITH.
 */
function doorHash(group: THREE.Group): string {
    return createHash('sha256').update(doorDigest(group)).digest('hex');
}

/** Role → count, so a failure can at least say WHICH kind of part moved or vanished. */
function partCounts(group: THREE.Group): Record<string, number> {
    const out: Record<string, number> = {};
    group.traverse(o => {
        if (!(o instanceof THREE.Mesh)) return;
        const r = String(o.userData?.role ?? 'frame');
        out[r] = (out[r] ?? 0) + 1;
    });
    return out;
}

describe('§FEAT-CURVED-DOOR-LEAF slice 0 — a door in a STRAIGHT wall is untouched', () => {
    it('is BYTE-IDENTICAL to itself across rebuilds — the digest is deterministic', () => {
        // Non-vacuity for the harness itself: if `doorDigest` returned a constant
        // (an empty traverse, a swallowed error) the pin below would be worthless.
        const a = doorDigest(buildGroup());
        const b = doorDigest(buildGroup());
        expect(a).toBe(b);
        expect(a.length).toBeGreaterThan(1000);
        expect(a).toContain('doorLeaf');
        expect(a).toContain('doorHandle');
    });

    it('the digest READS the real door — a double door differs from a single', () => {
        // Guards the pin against the other way a control dies: a digest that is
        // stable because it is BLIND. Two genuinely different doors must not hash
        // alike, or "unchanged" means nothing.
        const single = doorHash(buildGroup('fine'));
        const dbl    = doorHash(buildGroup('fine', { ...DOOR, id: 'd2', doorType: 'double', width: 1.8 }));
        expect(dbl).not.toBe(single);
        // …and the census moves with it, so a failure can name what changed.
        expect(partCounts(buildGroup('fine', { ...DOOR, id: 'd2', doorType: 'double', width: 1.8 })).doorLeaf)
            .toBeGreaterThan(0);
        // A THIRD discriminator: the same door at a different LOD must differ too,
        // or the digest is blind to articulation rather than to identity.
        expect(doorHash(buildGroup('coarse'))).not.toBe(single);
    });

    it('THE PIN (fine): the straight-host door matches the digest captured before the feature', () => {
        // The part census is asserted alongside the hash so a failure distinguishes
        // "a part moved" from "a part appeared/vanished" without a huge diff.
        expect(partCounts(buildGroup('fine'))).toEqual(BASELINE_PARTS_FINE);
        expect(doorHash(buildGroup('fine'))).toBe(BASELINE_DIGEST_FINE);
    });

    it('THE PIN (coarse): the massing door is pinned too', () => {
        expect(partCounts(buildGroup('coarse'))).toEqual(BASELINE_PARTS_COARSE);
        expect(doorHash(buildGroup('coarse'))).toBe(BASELINE_DIGEST_COARSE);
    });

    it('THE PIN (double, fine): the two-leaf door is pinned too', () => {
        const g = buildGroup('fine', { ...DOOR, id: 'd2', doorType: 'double', width: 1.8 });
        expect(partCounts(g)).toEqual(BASELINE_PARTS_DOUBLE);
        expect(doorHash(g)).toBe(BASELINE_DIGEST_DOUBLE);
    });

    it('THE CONTROL CAN FAIL: the SMALLEST STORABLE perturbation changes the digest', () => {
        // The proof that the pins above are load-bearing. We cannot perturb the
        // builder from a test, so we perturb the SCENE the same way the builder
        // would have — one vertex, by the least it can move — and assert the digest
        // moves. If this ever passes trivially (digest unchanged), the pin has
        // stopped measuring geometry and must be repaired before it is trusted.
        //
        // ⚠ WHY NOT `+ 1e-9`, WHICH IS WHAT THE WINDOW LANE'S EQUIVALENT USES.
        // Because on a DOOR it silently does nothing, and a control that silently
        // does nothing is the exact failure this test exists to prevent. Watched RED
        // first, and the first RED was this one: `BufferGeometry` positions are
        // FLOAT32, so a nudge below half an ulp is rounded straight back on store.
        // The window's frame members are ~0.025 m in their perturbed axis (ulp
        // ≈ 1.9e-9 m) so 1e-9 just barely ticks over; a door's frame post is 2.1 m
        // tall, its first vertex sits at y = ±1.05, and one ulp there is ≈ 1.2e-7 m.
        // `1.05 + 1e-9` IS `1.05` in float32. The assertion passed vacuously and the
        // pin would have been trusted on a control that could not fail.
        //
        // So the perturbation is ONE ULP at the coordinate's own magnitude — the
        // smallest change the storage can represent at all, found by doubling until
        // `Math.fround` moves. It is asserted to stay far below 1e-6 m, i.e. still
        // invisible to every `toBeCloseTo(…, 6)` in this repo, which is the claim
        // that matters: the pin catches perturbations no ordinary assertion would.
        const nextRepresentable = (v: number): number => {
            let d = Math.max(Math.abs(v), 2 ** -126) * 2 ** -24;
            const base = Math.fround(v);
            for (let i = 0; i < 64; i++) {
                const out = Math.fround(v + d);
                if (out !== base) return out;
                d *= 2;
            }
            throw new Error('no representable neighbour found');
        };

        const g = buildGroup();
        const clean = doorHash(g);
        let delta = 0;
        g.traverse(o => {
            if (delta !== 0 || !(o instanceof THREE.Mesh)) return;
            if (o.userData?.role !== undefined) return;          // a FRAME member
            const pos = o.geometry.getAttribute('position');
            const before = pos.getY(0);
            const after = nextRepresentable(before);
            pos.setY(0, after);
            delta = Math.abs(after - before);
        });
        expect(delta).toBeGreaterThan(0);        // a vertex really moved
        expect(delta).toBeLessThan(1e-6);        // …by less than any tolerance in use
        expect(doorHash(g)).not.toBe(clean);
    });
});

// ─── Captured baselines ───────────────────────────────────────────────────────
// Regenerated ONLY by a deliberate, reviewed decision that the straight-host door
// has legitimately changed. A curved-host feature is not such a decision: if
// touching these constants is what makes the suite green, the feature has leaked
// into the straight path and the fix belongs in the builder, not here.
const BASELINE_DIGEST_FINE =
    'b59c8420cb0e3fc933a838100c5ba550bdef6120c95321e89ae08432634f7d78';
const BASELINE_DIGEST_COARSE =
    '6228e5d7100fe29b24b8a4592c89934d99f0dee7e93d6e72deddb7fc4e59fcad';
const BASELINE_DIGEST_DOUBLE =
    'ba2fc9deff7b82fb3edbe8243e75cd2cb4c353213b88c685db78d9c20152275f';

/** Part censuses captured with the digests above. `frame` = an untagged member. */
const BASELINE_PARTS_FINE: Record<string, number> = { frame: 10, doorLeaf: 5, doorHandle: 4 };
const BASELINE_PARTS_COARSE: Record<string, number> = { frame: 4, doorLeaf: 1 };
const BASELINE_PARTS_DOUBLE: Record<string, number> = { frame: 14, doorLeaf: 2, doorHandle: 4 };
