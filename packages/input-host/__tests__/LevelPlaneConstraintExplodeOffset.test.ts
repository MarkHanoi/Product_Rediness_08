// @vitest-environment happy-dom
/**
 * §LEVEL-STACK-LOCKS-VIEW-Y (L-1010) — the stranded slab.
 *
 * FOUNDER (prod 2026-08-18): "I exploded the level stack, worked, then collapsed
 * it. One slab stayed at its exploded height and never comes back — it hangs in
 * the air above the building."
 *
 * The console said the collapse balanced:
 *     [§LEVEL-STACK] exploded: offset roots per level — … (total 340 …)
 *     [§LEVEL-STACK] collapse: restored 340 root Y positions …
 * 340 offset, 340 restored, and the slab is still wrong. A BALANCED COUNT IS NOT
 * PROOF: the collapse really did write the model Y back onto that slab. Something
 * else wrote the exploded Y on top of it afterwards.
 *
 * ROOT CAUSE — a THIRD writer of `root.position.y`:
 *   `LevelPlaneConstraint.attach()` captures `obj.position.y` RAW as its immutable
 *   "level plane". While the stack is exploded that value is MODEL Y + the
 *   view-only explode offset. The constraint then re-asserts that contaminated
 *   value on every TransformControls `change` event and again in `enforce()`. So
 *   after the collapse restores the mesh to its model Y, the still-attached
 *   constraint hauls it straight back up to the exploded height — and keeps doing
 *   it, forever, which is exactly "never comes back".
 *
 * This is a VIEW value latched as a MODEL value. `LevelExplodeController` already
 * publishes the per-object explode offset for precisely this reason ("a move
 * commit treats [it] as a pure view transform, never persisted") and
 * `SelectionManager` consults it for the highlight box — but
 * `LevelPlaneConstraint`, in the same package, never did.
 *
 * NOTE ON THE HYPOTHESIS THIS REFUTES: the obvious theory was that the scene
 * rebuild between explode and collapse replaced the object the restore map was
 * keyed on. For SLABS that is FALSE — `SlabFragmentBuilder._buildSlab` reuses its
 * cached root (`slabRoots.get(id)`) and only swaps the root's CHILDREN, so the
 * restore map's key survives a rebuild and the restore does reach it. See the
 * third test below, which pins that.
 *
 * The TransformControls double here is a THREE.EventDispatcher — the real class's
 * own base and its real `change` dispatch mechanism — so the event path under
 * test is the production one, not a more capable fake.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import * as THREE from '@pryzm/renderer-three/three';
import { LevelPlaneConstraint } from '../src/LevelPlaneConstraint.js';

/** Storey height and explode gap of the founder's model (EXPLODE_GAP = 5). */
const STOREY = 3.0;
const EXPLODE_GAP = 5.0;

/** The stranded element: a duplicated slab on level index 2. */
const MODEL_Y = 13.8;
const LEVEL_INDEX = 2;
const EXPLODED_Y = MODEL_Y + LEVEL_INDEX * EXPLODE_GAP; // 23.8 — the founder's log

/**
 * Faithful TransformControls stand-in: the real class extends THREE's
 * EventDispatcher and dispatches `{ type: 'change' }`. Nothing about the Y
 * arithmetic under test depends on the gizmo's geometry.
 */
class TransformControlsDouble extends THREE.EventDispatcher<{ change: object }> {
    mode = 'translate';
    showY = true;
    /**
     * §SLAB-PARAM-EDIT-NO-DISPLACE (L-1177) — ADDED, because this double was
     * UNFAITHFUL on exactly the axis that mattered and the omission hid a defect.
     *
     * The real class carries `dragging` and sets it `true` in `pointerDown`
     * (three r183 `TransformControls.js:448`) BEFORE any drag can dispatch
     * `change`: `pointerMove` returns at `:473` unless `dragging === true`, and
     * only then dispatches `change` at `:720`. A `change` with `dragging === false`
     * is therefore NOT a drag — it is an attach, a detach, a mode switch or a
     * `showY` write, and three fires it from the shared `defineProperty` setter
     * (`:123-124`) for `object` (`:149`) and `axis` (`:158`).
     *
     * Because the double omitted the flag, the drag test below "passed" while
     * simulating something that never happens in production, and the constraint
     * was free to clamp on NON-drag events — which is precisely how it overwrote
     * `SlabFragmentBuilder`'s legitimate Y after a thickness/baseOffset edit and
     * displaced the founder's parcel slab.
     */
    dragging = false;
    /** The gizmo fires `change` on every update while the object is attached. */
    fireChange(): void {
        this.dispatchEvent({ type: 'change' });
    }
}

/** The level-stack's collapse: snap the root back to its captured model Y. */
function collapseLevelStack(root: THREE.Object3D): void {
    root.position.y = MODEL_Y;
}

describe('§LEVEL-STACK-LOCKS-VIEW-Y (L-1010) — the level plane must be a MODEL Y, not a view Y', () => {
    let tc: TransformControlsDouble;
    let slab: THREE.Object3D;

    beforeEach(() => {
        tc = new TransformControlsDouble();
        slab = new THREE.Object3D();
        slab.userData.id = 'slab-dup-cmd-dup-fp-1787083605523-5suu6xr-2-0';
        slab.userData.elementType = 'Slab';
        slab.position.set(0, MODEL_Y, 0);
    });

    it('locks the MODEL Y even when the element is selected while the stack is exploded', () => {
        // Explode: the level stack lifts the root by a pure view offset.
        slab.position.y = EXPLODED_Y;

        // The founder selects the slab while exploded. The constraint is told what
        // the current view offset is, so it can subtract it.
        const constraint = new LevelPlaneConstraint(
            tc as never,
            () => LEVEL_INDEX * EXPLODE_GAP,
        );
        constraint.attach(slab);

        // The locked plane is the MODEL Y (13.8), not the screen Y (23.8).
        expect(constraint.lockedModelY).toBeCloseTo(MODEL_Y, 6);
    });

    it('THE FOUNDER BUG: after collapsing the stack the slab stays down, not stranded in the air', () => {
        // 1. Explode.
        let explodeOffset = LEVEL_INDEX * EXPLODE_GAP;
        slab.position.y = MODEL_Y + explodeOffset;

        // 2. Select the slab while exploded (this is the step that latched 23.8).
        const constraint = new LevelPlaneConstraint(tc as never, () => explodeOffset);
        constraint.attach(slab);

        // The gizmo ticks while the founder works — the constraint re-asserts the
        // plane on every one. While still exploded it must hold the EXPLODED Y,
        // because that is where the mesh is legitimately drawn.
        tc.fireChange();
        expect(slab.position.y).toBeCloseTo(EXPLODED_Y, 6);

        // 3. Collapse. The level stack restores the model Y …
        explodeOffset = 0;
        collapseLevelStack(slab);
        expect(slab.position.y).toBeCloseTo(MODEL_Y, 6);

        // 4. … and the still-attached constraint must NOT haul it back up.
        //    This is the assertion that was RED: it re-asserted 23.8 forever.
        tc.fireChange();
        expect(slab.position.y).toBeCloseTo(MODEL_Y, 6);

        constraint.enforce();
        expect(slab.position.y).toBeCloseTo(MODEL_Y, 6);
    });

    it('still hard-locks Y against a drag — the constraint has not been weakened', () => {
        const constraint = new LevelPlaneConstraint(tc as never, () => 0);
        constraint.attach(slab);

        // A drag tries to lift the slab off its level.
        // §SLAB-PARAM-EDIT-NO-DISPLACE (L-1177) — `dragging = true` is what makes
        // this a DRAG rather than an arbitrary `change`. It is not a concession to
        // the fix: it is the production condition (three sets it in `pointerDown`
        // before any drag `change`), and asserting the clamp without it was
        // asserting behaviour on an event three never raises mid-drag.
        constraint.attach(slab);
        tc.dragging = true;
        slab.position.y = MODEL_Y + 1.5;
        tc.fireChange();
        expect(slab.position.y).toBeCloseTo(MODEL_Y, 6);

        // Drag END: three has already flipped `dragging` to false by the time the
        // `dragging-changed` handler calls `enforce()`, so the final guarantee must
        // hold with the flag DOWN. That is the harder half, and it is unchanged.
        tc.dragging = false;
        slab.position.y = MODEL_Y - 4.0;
        constraint.enforce();
        expect(slab.position.y).toBeCloseTo(MODEL_Y, 6);
    });

    it('rotate mode still skips the position clamp', () => {
        const constraint = new LevelPlaneConstraint(tc as never, () => 0);
        constraint.attach(slab);
        tc.mode = 'rotate';
        slab.position.y = MODEL_Y + 2;
        tc.fireChange();
        expect(slab.position.y).toBeCloseTo(MODEL_Y + 2, 6);
    });

    it('an absent offset provider means ZERO OFFSET, and behaves exactly as before', () => {
        // Callers that do not (yet) know about the explode get the legacy
        // behaviour verbatim — the provider defaults to 0, it is never guessed.
        const constraint = new LevelPlaneConstraint(tc as never);
        slab.position.y = MODEL_Y;
        constraint.attach(slab);
        expect(constraint.lockedModelY).toBeCloseTo(MODEL_Y, 6);
        slab.position.y = MODEL_Y + 3;
        constraint.enforce();
        expect(slab.position.y).toBeCloseTo(MODEL_Y, 6);
    });

    it('a provider that throws or returns a non-finite number is REFUSED, not silently read as 0', () => {
        const thrower = new LevelPlaneConstraint(tc as never, () => { throw new Error('boom'); });
        slab.position.y = EXPLODED_Y;
        thrower.attach(slab);
        // The offset is UNKNOWN, so the constraint must not pretend it is 0 and
        // silently latch the view Y as a model Y. It says so and declines to lock.
        expect(thrower.isActive).toBe(false);

        const nan = new LevelPlaneConstraint(tc as never, () => Number.NaN);
        nan.attach(slab);
        expect(nan.isActive).toBe(false);

        // And an unlocked constraint must never write a position.
        slab.position.y = 999;
        nan.enforce();
        expect(slab.position.y).toBe(999);
    });
});

describe('§LEVEL-STACK-LOCKS-VIEW-Y (L-1010) — what the rebuild hypothesis actually does', () => {
    it('REFUTED for slabs: a rebuild does not swap the root, so an identity-keyed restore still reaches it', async () => {
        // `SlabFragmentBuilder._buildSlab` looks its root up in `this.slabRoots`
        // and only creates a Group when there is no cached one; a rebuild calls
        // `detachAndReleaseChildren(root)` and re-adds CHILDREN. The root object —
        // and therefore any Map keyed on it — survives. This test pins the
        // property the refutation rests on, read straight from the source, so a
        // future change to a scene.remove/scene.add root swap breaks it loudly.
        const { readFileSync } = await import('node:fs');
        const { resolve } = await import('node:path');
        // cwd is packages/input-host when this suite runs (vitest project root).
        const src = readFileSync(
            resolve(process.cwd(), '../geometry-slab/src/SlabFragmentBuilder.ts'),
            'utf8',
        );
        expect(src).toContain('let root = this.slabRoots.get(data.id);');
        expect(src).toContain('this.slabRoots.set(data.id, root);');
        // The root is added to the scene exactly once, inside the `if (!root)` branch.
        expect(src.match(/this\.scene\.add\(root\)/g)?.length).toBe(1);
    });
});
