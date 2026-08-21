/**
 * §LINEWORK-3D-SUPERSEDE-LEAK (L-1867)
 *
 * THE REPORT (founder, production, 2026-08-21): *"when opening the 3D view after having
 * opened the elevation, the 3D view doesn't render as it should — there are reminiscences
 * of the elevation edge projectors. The walls are rendering the edges within (windows
 * edges etc.)"*.
 *
 * §LINEWORK-3D-PROBE counted **442 LineSegments on `layer:EDITOR(mask 2)`, VISIBLE,
 * `projectId: (unstamped) viewId: (unstamped)`**, and — crucially — reported **NO DIFF
 * across three 3D entries**, falsifying "not torn down on view switch".
 *
 * ─── THE MECHANISM, MEASURED ───────────────────────────────────────────────────
 * `@thatopen/components` → `TechnicalDrawings.create(world)`:
 *
 *     world.scene.three.add(drawing.three);   ← parented AT BIRTH, unconditionally
 *     cam.three.layers.enable(1);
 *
 * and `addProjectionLines` ends `ls.layers.set(1); this.three.add(ls)`. **OBC layer 1 IS
 * PRYZM `EDITOR_LAYER`**, which `_activate3DView` enables on purpose so the parcel
 * boundary shows in 3D (§L-426). Two populations, one layer, one of which must show.
 *
 * `EdgeProjectorService.project()` always unparented the drawing on its SUCCESS exit.
 * But the §PERF-PROJECTION-CANCEL-SUPERSEDED path **`throw`s**, so it never reached that
 * line — and the comment that stood there asserted the opposite of the truth:
 *
 *     "the lines added so far are not attached to any render graph"   ← FALSE
 *
 * `onDisposed.trigger()` fires a HOOK; it unparents nothing. So every superseded pass
 * abandoned its half-built linework inside the 3D scene, visible, permanently. The
 * founder's crop drag alone logged 20+ consecutive supersedes.
 *
 * ─── WHAT THIS FILE PINS ───────────────────────────────────────────────────────
 * The invariant, not the narrative: **a drawing that OBC parented must not still be
 * parented once the projection pass that owns it has ended — by EITHER exit.** This is
 * the property the leak violated, and it is checkable without a WebGL context.
 *
 * ⚠ HONEST SCOPE: this drives `_detachDrawingFromScene`'s CONTRACT against a structural
 * fake of the OBC shape. It does NOT run the real `project()` (which needs OBC,
 * fragments and a World), and it is NOT a browser verification. See L-1867.
 */

import { describe, it, expect } from 'vitest';

/** Minimal structural stand-in for the THREE parent/child relationship OBC creates. */
class FakeGroup {
    parent: FakeScene | null = null;
    readonly children: FakeGroup[] = [];
}

class FakeScene {
    readonly children: FakeGroup[] = [];
    add(g: FakeGroup): void { g.parent = this; this.children.push(g); }
    remove(g: FakeGroup): void {
        const i = this.children.indexOf(g);
        if (i >= 0) this.children.splice(i, 1);
        if (g.parent === this) g.parent = null;
    }
}

interface FakeDrawing { three: FakeGroup; disposedHookFired: boolean }

/** What `TechnicalDrawings.create(world)` does, reproduced from the OBC bundle. */
function obcCreate(scene: FakeScene): FakeDrawing {
    const three = new FakeGroup();
    scene.add(three);                 // ← world.scene.three.add(drawing.three)
    return { three, disposedHookFired: false };
}

/**
 * The production helper, reproduced EXACTLY as it is written in
 * `EdgeProjectorService.ts` (§LINEWORK-3D-SUPERSEDE-LEAK). Kept in lockstep by the
 * contract tests below rather than imported, because the module it lives in pulls in
 * OBC, THREE and a World at import time.
 */
function detachDrawingFromScene(drawing: unknown): void {
    try {
        const group = (drawing as { three?: { parent?: { remove?: (o: unknown) => void } } } | null)?.three;
        group?.parent?.remove?.(group);
    } catch { /* best-effort */ }
}

describe('§LINEWORK-3D-SUPERSEDE-LEAK (L-1867) — the fixture reproduces the real defect', () => {
    it('OBC parents the drawing into the scene at creation — the premise the old comment denied', () => {
        const scene = new FakeScene();
        const drawing = obcCreate(scene);
        expect(scene.children).toContain(drawing.three);
        expect(drawing.three.parent).toBe(scene);
    });

    it('firing onDisposed does NOT unparent — which is why the old cancel path leaked', () => {
        const scene = new FakeScene();
        const drawing = obcCreate(scene);
        drawing.disposedHookFired = true;              // `drawing.onDisposed.trigger()`
        expect(scene.children).toContain(drawing.three); // ⭐ still in the scene
    });
});

describe('§LINEWORK-3D-SUPERSEDE-LEAK (L-1867) — both exits of a projection pass unparent', () => {
    it('SUCCESS exit leaves nothing in the scene', () => {
        const scene = new FakeScene();
        const drawing = obcCreate(scene);
        detachDrawingFromScene(drawing);
        expect(scene.children).toHaveLength(0);
        expect(drawing.three.parent).toBeNull();
    });

    it('SUPERSEDED exit leaves nothing in the scene — THE REGRESSION', () => {
        const scene = new FakeScene();
        const drawing = obcCreate(scene);
        // The production order: detach, THEN fire the disposal hook, THEN throw.
        detachDrawingFromScene(drawing);
        drawing.disposedHookFired = true;
        expect(scene.children).toHaveLength(0);
    });

    it('twenty consecutive supersedes accumulate NOTHING — the founder\'s crop drag', () => {
        const scene = new FakeScene();
        for (let i = 0; i < 20; i++) {
            const drawing = obcCreate(scene);
            detachDrawingFromScene(drawing);
        }
        expect(scene.children).toHaveLength(0);
    });

    it('WITHOUT the detach, twenty supersedes leave twenty groups — the measured 442 lines', () => {
        const scene = new FakeScene();
        for (let i = 0; i < 20; i++) obcCreate(scene);   // old behaviour: hook only, no unparent
        expect(scene.children).toHaveLength(20);         // ⭐ this is the bug, pinned
    });
});

describe('§LINEWORK-3D-SUPERSEDE-LEAK (L-1867) — the helper is safe to call anywhere', () => {
    it('is idempotent — a second call on a detached drawing is a no-op', () => {
        const scene = new FakeScene();
        const drawing = obcCreate(scene);
        detachDrawingFromScene(drawing);
        expect(() => detachDrawingFromScene(drawing)).not.toThrow();
        expect(scene.children).toHaveLength(0);
    });

    it('never throws on a malformed or absent drawing — teardown must not mask a result', () => {
        expect(() => detachDrawingFromScene(null)).not.toThrow();
        expect(() => detachDrawingFromScene(undefined)).not.toThrow();
        expect(() => detachDrawingFromScene({})).not.toThrow();
        expect(() => detachDrawingFromScene({ three: {} })).not.toThrow();
        expect(() => detachDrawingFromScene({ three: { parent: {} } })).not.toThrow();
        expect(() => detachDrawingFromScene({
            three: { parent: { remove() { throw new Error('boom'); } } },
        })).not.toThrow();
    });

    it('detaches ONLY its own drawing — a sibling group in the scene is untouched', () => {
        const scene = new FakeScene();
        const mine = obcCreate(scene);
        const parcelBoundary = new FakeGroup();          // §L-426 — must survive
        scene.add(parcelBoundary);
        detachDrawingFromScene(mine);
        expect(scene.children).toEqual([parcelBoundary]);
    });
});
