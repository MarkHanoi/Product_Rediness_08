// §JOIN1-WINDOW-FOLLOWS-THE-LEAN (L-1271) — a window on a wall that is raked LATER.
//
// FOUNDER, 2026-08-19, level-explode screenshot: *"the windows on raked walls don't move"* —
// the walls lean and their windows stay put.
//
// ⭐ WHAT THIS FILE SETTLES, AND WHAT IT DELIBERATELY DOES NOT. `RakedHostWindowLeaf.test.ts`
// already proves the leaf is seated correctly on a host that is raked AT BUILD TIME. That
// leaves exactly one question the founder's report could be about:
//
//   (Q) Can `WindowBuilder` follow a rake that CHANGES between two builds of the same
//       window — or is there a cache, a reused group, or a frozen matrix that pins the
//       first answer?
//
// This file answers (Q) at the layer that builds the leaf, by mutating the HOST RECORD the
// builder reads and rebuilding through the same builder instance. It asserts WORLD-space
// vertices of the built meshes, never a function's return value (*"prove it at the layer the
// user experiences"*).
//
// ⛔ IT DOES NOT PROVE THE WINDOW IS REBUILT IN PRODUCTION. That is a REACH question about a
// different chain — `UpdateElementParameterCommand` → `wallStore.update` → the coordinator's
// wall subscriber → `_flush` → `_rebuiltWallIds` → `WindowBuilder.rebuildForWall` — which
// spans `apps/editor` and is NOT measured here. Two lanes hold files on that chain. If (Q)
// passes, the capability is sound and any remaining defect is reach; that is the whole point
// of separating them, and stating it is what stops a green tick here being read as a
// clearance for the chain (the *committed ≠ reachable* lesson).
//
// ⚠ THE FROZEN-MATRIX TRAP IS THE REAL RISK HERE, and it is why this file exists rather than
// being folded into the seating tests. A shear has no TRS decomposition, so `positionGroup`
// writes `group.matrix` directly and sets `matrixAutoUpdate = false`. A builder that REUSED
// a group across rebuilds would carry that frozen matrix forward and every later placement
// write would be a silent no-op — a window pinned at the first lean it was ever given. The
// straighten case below (raked → vertical) is the one that catches it.

import { describe, it, expect } from 'vitest';
import * as THREE from '@pryzm/renderer-three/three';
import { WindowBuilder } from '../src/WindowBuilder';
import { rakeShearPerMetre } from '@pryzm/geometry-wall';

const WIN = {
    id: 'win-l1271', wallId: 'w-l1271', openingId: 'o-l1271',
    offset: 2.0, width: 1.2, height: 1.4, sillHeight: 0.9,
    frameThickness: 0.05, frameDepth: 0.2, frameColor: '#e8e8e8',
    columnRatios: [1], rowRatios: [1],
    columnDividerThickness: 0.03, rowDividerThickness: 0.03,
    sill: true, sillDepth: 0.08, sillThickness: 0.03,
    glassOpacity: 0.3, windowType: 'single',
};

const CENTRE_X = WIN.offset + WIN.width / 2;             // 2.6
const CENTRE_Y = WIN.sillHeight + WIN.height / 2;        // 1.6 — PLUMB at every rake

/**
 * A MUTABLE host record and ONE builder, so the second build sees the state the first left
 * behind. Handing each build a fresh builder would make the reuse question unaskable — and
 * "does the second build see the first build's leftovers" IS the question.
 */
function harness() {
    const wall: { rakeAngleDeg?: number } & Record<string, unknown> = {
        id: WIN.wallId, levelId: 'L0', thickness: 0.2, height: 3, baseOffset: 0,
        baseLine: [{ x: 0, y: 0, z: 0 }, { x: 6, y: 0, z: 0 }],   // along +X ⇒ leftPerp = +Z
    };
    const scene = new THREE.Scene();
    const builder = new WindowBuilder(
        scene,
        { getById: () => wall, getLevelById: () => ({ id: 'L0', elevation: 0 }) } as never,
    );
    const build = (): THREE.Group => {
        (builder as unknown as { rebuild(x: unknown): void }).rebuild(WIN);
        let g: THREE.Group | null = null;
        scene.traverse(o => { if (o.userData?.id === WIN.id && o !== scene) g = o as THREE.Group; });
        expect(g, 'the rebuild produced no window group').toBeTruthy();
        scene.updateMatrixWorld(true);
        return g!;
    };
    /** How many window groups are in the scene — a reused-group leak would show up here. */
    const groupCount = (): number => {
        let n = 0;
        scene.traverse(o => { if (o.userData?.id === WIN.id && o !== scene) n++; });
        return n;
    };
    return { wall, scene, build, groupCount };
}

/** World position of the point `localY` metres above the window's own centre. */
const at = (g: THREE.Group, localY: number): THREE.Vector3 =>
    new THREE.Vector3(0, localY, 0).applyMatrix4(g.matrixWorld);

/** The leaf's own lean, measured head-vs-sill in world Z. Zero for a plumb leaf. */
const leanOf = (g: THREE.Group): number =>
    at(g, WIN.height / 2).z - at(g, -WIN.height / 2).z;

describe('§JOIN1-WINDOW-FOLLOWS-THE-LEAN — the host is raked AFTER the window was built', () => {
    it('PLUMB → 70°: the leaf that was built upright leans by exactly cot(70°)·height', () => {
        const h = harness();

        const before = h.build();
        expect(leanOf(before), 'the control build must be plumb, or the test proves nothing')
            .toBeCloseTo(0, 6);
        expect(at(before, 0).z).toBeCloseTo(0, 6);

        // The founder's gesture: `rakeAngleDeg = 70` written to the host record.
        h.wall.rakeAngleDeg = 70;
        const after = h.build();

        const k = rakeShearPerMetre(70);                       // ≈ 0.36397
        expect(leanOf(after)).toBeCloseTo(k * WIN.height, 4);
        expect(at(after, 0).z).toBeCloseTo(k * CENTRE_Y, 4);   // rides onto the raked face
        expect(at(after, 0).x).toBeCloseTo(CENTRE_X, 4);       // …and does not slide along the wall
        expect(at(after, 0).y).toBeCloseTo(CENTRE_Y, 4);       // sill/head stay PLUMB (WallRake Q1)

        // The measurement that IS the founder's report: the leaf actually moved.
        expect(Math.abs(at(after, 0).z - at(before, 0).z)).toBeGreaterThan(0.5);
    });

    it('70° → 45°: a SECOND change is followed too — the first answer is not cached', () => {
        const h = harness();
        h.wall.rakeAngleDeg = 70;
        const first = h.build();
        h.wall.rakeAngleDeg = 45;
        const second = h.build();

        expect(leanOf(first)).toBeCloseTo(rakeShearPerMetre(70) * WIN.height, 4);
        expect(leanOf(second)).toBeCloseTo(rakeShearPerMetre(45) * WIN.height, 4);
        expect(leanOf(second)).toBeGreaterThan(leanOf(first));  // 45° leans further than 70°
    });

    it('70° → 110°: a lean reversal crosses through vertical and comes out the other side', () => {
        const h = harness();
        h.wall.rakeAngleDeg = 70;
        const lean70 = leanOf(h.build());
        h.wall.rakeAngleDeg = 110;
        const lean110 = leanOf(h.build());
        expect(lean70).toBeGreaterThan(0.3);
        expect(lean110).toBeCloseTo(-lean70, 4);
    });

    // ── ⭐ THE FROZEN-MATRIX GUARD — the one that catches a reused group ──────
    it('70° → STRAIGHTENED: the leaf returns to plumb AND `matrixAutoUpdate` is restored', () => {
        const h = harness();
        h.wall.rakeAngleDeg = 70;
        const raked = h.build();
        expect(raked.matrixAutoUpdate, 'a sheared leaf must carry a manual matrix').toBe(false);

        delete h.wall.rakeAngleDeg;                 // straighten it — absent ⇒ vertical
        const straight = h.build();

        expect(leanOf(straight)).toBeCloseTo(0, 6);
        expect(at(straight, 0).z).toBeCloseTo(0, 6);
        // ⭐ Had the group been REUSED, `matrixAutoUpdate` would still be false and every
        // later `position` write elsewhere in the app would be a silent no-op on this
        // window. A fresh group per rebuild is what makes the straighten path recoverable.
        expect(straight.matrixAutoUpdate).toBe(true);
    });

    it('rebuilding does not LEAK groups — one window, one group, however many rakes', () => {
        const h = harness();
        for (const r of [undefined, 70, 45, 110, 90]) {
            if (r === undefined) delete h.wall.rakeAngleDeg; else h.wall.rakeAngleDeg = r;
            h.build();
            expect(h.groupCount(), `after rake=${String(r)}`).toBe(1);
        }
    });

    it('NON-VACUITY: a rebuild with the rake UNCHANGED moves nothing at all', () => {
        const h = harness();
        h.wall.rakeAngleDeg = 70;
        const a = at(h.build(), 0).clone();
        const b = at(h.build(), 0).clone();
        expect(b.x).toBeCloseTo(a.x, 9);
        expect(b.y).toBeCloseTo(a.y, 9);
        expect(b.z).toBeCloseTo(a.z, 9);
    });
});
