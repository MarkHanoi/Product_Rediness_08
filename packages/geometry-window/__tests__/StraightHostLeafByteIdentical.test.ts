/**
 * §FEAT-CURVED-WINDOW-LEAF — SLICE 0, THE CONTROL.
 *
 * L-957 makes the GLASS and the HORIZONTAL frame members of a window follow its
 * host wall's arc. The single largest risk in that change is not the curved case
 * at all — it is the STRAIGHT one: every window in every project today is built
 * by `buildVisuals()`, and a "conform to the host" rewrite that perturbs a
 * straight wall's leaf by a micron has silently re-authored the whole model.
 *
 * So before any feature code, this file pins the straight-host leaf EXACTLY:
 * every sub-mesh, its role, its local transform, and every vertex of its
 * geometry, hashed into one string. Not `toBeCloseTo` — an exact digest. On a
 * straight wall the arc IS the chord (`WallArcParam`: "for a straight wall the
 * arc IS the chord, so all maths below is bit-identical to the legacy formula"),
 * so there is no rounding budget to spend and none is granted.
 *
 * ── WATCHED RED (a control that cannot fail is not a control) ────────────────
 * The digest below was captured from `main` before any feature code existed, and
 * the pin was then deliberately broken to prove it bites: perturbing the head bar
 * by 1e-9 m — a distance no `toBeCloseTo(…, 6)` in this repo would notice —
 * fails this test. Reproduce by adding `+ 1e-9` to the top-bar `y` argument in
 * `WindowBuilder.buildVisuals`; the assertion reports a changed digest.
 *
 * COMMITTED ≠ REACHABLE: the digest is read off the built scene graph after a
 * real `rebuild()`, never off a pure function's return value.
 */

import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import * as THREE from '@pryzm/renderer-three/three';
import { WindowBuilder } from '../src/WindowBuilder';

/** A plain 6 m STRAIGHT wall along +X. No curve, no rake — the ordinary case. */
const WALL = {
    id: 'w1', levelId: 'L0', thickness: 0.2, height: 3, baseOffset: 0,
    baseLine: [{ x: 0, y: 0, z: 0 }, { x: 6, y: 0, z: 0 }],
};

const WIN = {
    id: 'win1', wallId: 'w1', openingId: 'o1',
    offset: 2.0, width: 1.2, height: 1.4, sillHeight: 0.9,
    frameThickness: 0.05, frameDepth: 0.2, frameColor: '#e8e8e8',
    columnRatios: [1, 1], rowRatios: [1, 1],
    columnDividerThickness: 0.03, rowDividerThickness: 0.03,
    sill: true, sillDepth: 0.08, sillThickness: 0.03,
    glassOpacity: 0.3, windowType: 'single',
};

function buildGroup(win: Record<string, unknown> = WIN): THREE.Group {
    const wallStoreStub = {
        getById: () => WALL,
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

/**
 * A stable, ORDER-INDEPENDENT digest of every piece of geometry in the leaf.
 *
 * Per sub-mesh: its role, its full 16-element world matrix, and every position
 * vertex — all at full `toPrecision(17)` so a 1e-9 m perturbation cannot hide in
 * a rounding step. The per-mesh lines are SORTED before joining, so the digest
 * pins the SET of solids the leaf is made of rather than the order `buildVisuals`
 * happens to emit them in. (Re-ordering emission is a legitimate refactor;
 * moving a vertex is not.)
 */
function leafDigest(group: THREE.Group): string {
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
 * The digest is ~40 kB of full-precision floats — too large to read as a literal,
 * and a 40 kB constant in a test file is a thing nobody reviews. So the PIN is a
 * SHA-256 of it. Hashing costs the diff (a failure says "changed", not "which
 * vertex"), which is the right trade for a control: the question it answers is
 * binary. `leafPartCounts` below is what a failing run is read WITH.
 */
function leafHash(group: THREE.Group): string {
    return createHash('sha256').update(leafDigest(group)).digest('hex');
}

/** Role → count, so a failure can at least say WHICH kind of part moved or vanished. */
function leafPartCounts(group: THREE.Group): Record<string, number> {
    const out: Record<string, number> = {};
    group.traverse(o => {
        if (!(o instanceof THREE.Mesh)) return;
        const r = String(o.userData?.role ?? '?');
        out[r] = (out[r] ?? 0) + 1;
    });
    return out;
}

describe('§FEAT-CURVED-WINDOW-LEAF slice 0 — a window in a STRAIGHT wall is untouched', () => {
    it('is BYTE-IDENTICAL to itself across rebuilds — the digest is deterministic', () => {
        // Non-vacuity for the harness itself: if `leafDigest` returned a constant
        // (an empty traverse, a swallowed error) the pin below would be worthless.
        const a = leafDigest(buildGroup());
        const b = leafDigest(buildGroup());
        expect(a).toBe(b);
        expect(a.length).toBeGreaterThan(1000);
        expect(a).toContain('windowGlazing');
        expect(a).toContain('windowFrame');
        expect(a).toContain('windowSill');
    });

    it('the digest READS the real leaf — a 2×2 grid has more parts than a 1×1', () => {
        // Guards the pin against the other way a control dies: a digest that is
        // stable because it is blind. Changing the pane grid must change the census.
        const twoByTwo = leafPartCounts(buildGroup());
        const oneByOne = leafPartCounts(buildGroup({ ...WIN, id: 'win3', columnRatios: [1], rowRatios: [1] }));
        expect(twoByTwo.windowGlazing).toBe(4);
        expect(oneByOne.windowGlazing).toBe(1);
        expect(twoByTwo.windowMullion).toBe(1);
        expect(oneByOne.windowMullion).toBeUndefined();
    });

    it('THE PIN: the straight-host leaf matches the digest captured before the feature', () => {
        // The part census is asserted alongside the hash so a failure distinguishes
        // "a part moved" from "a part appeared/vanished" without a 40 kB diff.
        expect(leafPartCounts(buildGroup())).toEqual(BASELINE_PARTS);
        expect(leafHash(buildGroup())).toBe(BASELINE_DIGEST);
    });

    it('THE CONTROL CAN FAIL: a 1e-9 m perturbation changes the digest', () => {
        // The proof that the pin above is load-bearing. We cannot perturb the
        // builder from a test, so we perturb the SCENE the same way the builder
        // would have — one vertex, by one nanometre — and assert the digest moves.
        // If this assertion ever passes trivially (digest unchanged), the pin has
        // stopped measuring geometry and must be repaired before it is trusted.
        const g = buildGroup();
        const clean = leafHash(g);
        let touched = false;
        g.traverse(o => {
            if (touched || !(o instanceof THREE.Mesh)) return;
            if (o.userData?.role !== 'windowFrame') return;
            const pos = o.geometry.getAttribute('position');
            pos.setY(0, pos.getY(0) + 1e-9);
            touched = true;
        });
        expect(touched).toBe(true);
        expect(leafHash(g)).not.toBe(clean);
    });

    it('a window with NO sill and a 1×1 grid is pinned too — the minimal leaf', () => {
        const minimal = { ...WIN, id: 'win2', columnRatios: [1], rowRatios: [1], sill: false };
        const g = buildGroup(minimal);
        expect(leafPartCounts(g).windowSill).toBeUndefined();
        expect(leafHash(g)).toBe(BASELINE_DIGEST_MINIMAL);
    });
});

// ─── Captured baselines ───────────────────────────────────────────────────────
// Regenerated ONLY by a deliberate, reviewed decision that the straight-host leaf
// has legitimately changed. A curved-host feature is not such a decision: if
// touching this constant is what makes the suite green, the feature has leaked
// into the straight path and the fix belongs in the builder, not here.
const BASELINE_DIGEST =
    '8bbc03a0be42882fce7065268474d9d24ebcecd8f5b3a4bbdc2f18bef4da6787';
const BASELINE_DIGEST_MINIMAL =
    '06291066cc79dc4834a5862ac336dbe1c154d367255f765135384040c42b5629';

/** The 2×2-with-sill leaf's part census, captured with the digest above. */
const BASELINE_PARTS: Record<string, number> = {
    windowFrame: 4, windowMullion: 1, windowTransom: 2,
    windowSash: 16, windowBead: 8, windowGlazing: 4, windowSill: 1,
};
