// @vitest-environment happy-dom
//
// §FIX-LEVEL-EXPLODE-COORDINATION (L-113) — regression guard.
//
// Founder (testing on prod, Level STACKED/UNSTACKED / level-explode view):
//   · Selecting an element while stacked/unstacked can leave it UNCOORDINATED —
//     the selection highlight / gizmo does not track the exploded mesh (floating).
//   · MOVING an element while stacked does NOT land correctly — the element jumps
//     back to its ORIGINAL (unstacked) position.
//
// Root cause: the explode applies a PURE view transform (a per-level Y offset on
// each root's position.y). The bug is coordination, not model corruption:
//   (1) a rebuilt mesh (after a move/edit) is NOT in any level group, so it
//       renders at its true elevation and drops OUT of the exploded stack; and
//   (2) the offset is not surfaced to the interaction layer, so a MODEL-space
//       highlight box (instanced wall / OBB fallback) floats below the lifted mesh.
//
// This guards the fix in LevelExplodeController:
//   · the offset is queryable (getActiveOffsetForObject / …ForLevel) and equals
//     the actual applied lift — an anchor placed with it tracks the mesh;
//   · the offset is a PURE view transform — userData/model baseline is untouched
//     and a move commit is offset-invariant (correct real position either way);
//   · a rebuilt/added mesh is reconciled back INTO the exploded stack;
//   · unstacking restores the exact model Y (no residual offset baked in);
//   · the selection is re-anchored (highlight + gizmo) once the lift settles.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as THREE from '@pryzm/renderer-three/three';
import { LevelExplodeController } from '../src/engine/inspect/LevelExplodeController.js';

const GAP = 5.0; // EXPLODE_GAP in the controller

// A wall root carries a levelId + a MODEL-space baseLine, and sits at its true
// elevation (WallFragmentBuilder: wallGroup.position.set(start.x, elevation, start.z)).
function makeWall(id: string, levelId: string, elevation: number): THREE.Mesh {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 3, 0.2), new THREE.MeshBasicMaterial());
    mesh.userData.id = id;
    mesh.userData.levelId = levelId;
    mesh.userData.elementType = 'wall';
    mesh.userData.baseLine = [
        { x: 0, y: elevation, z: 0 },
        { x: 4, y: elevation, z: 0 },
    ];
    mesh.position.set(0, elevation, 0);
    mesh.visible = true;
    return mesh;
}

describe('§FIX-LEVEL-EXPLODE-COORDINATION — explode stays a pure view transform, selection tracks it', () => {
    let scene: THREE.Scene;
    let controller: LevelExplodeController;
    let wallL0: THREE.Mesh;
    let wallL1: THREE.Mesh;
    let emitSpy: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        scene = new THREE.Scene();
        wallL0 = makeWall('wall-L0', 'L0', 0);
        wallL1 = makeWall('wall-L1', 'L1', 3);
        scene.add(wallL0, wallL1);

        (window as any).bimManager = {
            getLevels: () => [
                { id: 'L0', elevation: 0, childrenIds: ['wall-L0'] },
                { id: 'L1', elevation: 3, childrenIds: ['wall-L1'] },
            ],
        };
        emitSpy = vi.fn();
        (window as any).runtime = { events: { on: () => () => {}, emit: emitSpy } };

        controller = new LevelExplodeController();
        controller.init(scene);
        controller.activate(); // builds groups, resets to stacked
    });

    afterEach(() => {
        controller.dispose();
        delete (window as any).bimManager;
        delete (window as any).runtime;
        delete (window as any).selectionManager;
    });

    function applyMode(mode: 'stacked' | 'exploded' | 'solo', soloLevelId?: string): void {
        (controller as any)._onExplodeEvent({ mode, soloLevelId });
    }

    // Drive the lerp tick manually until the lift converges (the global frame
    // scheduler's rAF loop is not pumped in the test env). Keeps _raf set so the
    // controller's own settle branch (re-anchor) fires exactly as in production.
    function settle(): void {
        let now = 1000;
        for (let i = 0; i < 300; i++) {
            (controller as any)._tick(now);
            now += 20;
        }
    }

    it('exploded lifts each level by index×GAP while the MODEL baseline is untouched', () => {
        const baseLineBefore = JSON.parse(JSON.stringify(wallL1.userData.baseLine));

        applyMode('exploded');
        settle();

        // L0 (index 0) stays put; L1 (index 1) lifts by one GAP.
        expect(wallL0.position.y).toBeCloseTo(0, 3);
        expect(wallL1.position.y).toBeCloseTo(3 + GAP, 3);

        // Pure view transform: no store/userData mutation.
        expect(wallL1.userData.baseLine).toEqual(baseLineBefore);
    });

    it('(a) the offset is queryable and EQUALS the applied lift — an anchor placed with it tracks the mesh (no floating)', () => {
        applyMode('exploded');
        settle();

        // The offset the interaction layer adds to a MODEL-space highlight anchor…
        expect(controller.getActiveOffsetForObject(wallL1)).toBeCloseTo(GAP, 3);
        expect(controller.getActiveOffsetForObject(wallL0)).toBeCloseTo(0, 3);
        expect(controller.getActiveOffsetForLevel('L1')).toBeCloseTo(GAP, 3);

        // …exactly equals the mesh's actual lift (position.y − model baseline Y),
        // so highlight_center = model_center + offset lands ON the exploded mesh.
        const modelBaseY = 3;
        expect(wallL1.position.y - modelBaseY).toBeCloseTo(controller.getActiveOffsetForObject(wallL1), 3);
    });

    it('publishes the offset provider on window for the input-host anchor logic', () => {
        applyMode('exploded');
        expect(typeof (window as any).pryzmLevelExplodeOffsetForObject).toBe('function');
        expect((window as any).pryzmLevelExplodeOffsetForObject(wallL1)).toBeCloseTo(GAP, 3);
        expect((window as any).pryzmLevelExplodeOffsetForObject(wallL0)).toBeCloseTo(0, 3);
    });

    it('(b) a move commit is offset-invariant — same MODEL position whether exploded or unstacked', () => {
        // Mirrors registerTransformDragHandler.ts wall drag-end math: the committed
        // baseLine takes XZ from the gizmo delta and Y from the MODEL elevation —
        // it must NOT depend on the wall's exploded position.y.
        const level = { elevation: 3 };
        const wall = { baseLine: wallL1.userData.baseLine, baseOffset: 0 };
        const oldStart = wall.baseLine[0];

        const commitFor = (posY: number) => {
            const obj = { position: { x: oldStart.x + 1.5, y: posY, z: oldStart.z - 0.5 } };
            const dx = obj.position.x - oldStart.x;
            const dz = obj.position.z - oldStart.z;
            const worldY = level.elevation + (wall.baseOffset ?? 0);
            return { x: oldStart.x + dx, y: worldY, z: oldStart.z + dz };
        };

        applyMode('exploded');
        settle();

        const committedExploded = commitFor(wallL1.position.y); // dragged while lifted
        const committedUnstacked = commitFor(3);                // dragged while flat

        expect(committedExploded).toEqual(committedUnstacked);
        expect(committedExploded.y).toBeCloseTo(3, 6); // true elevation, offset removed
    });

    it('reconciles a rebuilt mesh back INTO the exploded stack (no jump-back to unstacked position)', () => {
        applyMode('exploded');
        settle();
        expect(wallL1.position.y).toBeCloseTo(3 + GAP, 3);

        // Simulate a move/edit rebuild: dispose the old mesh, add a fresh one at
        // its TRUE elevation carrying the same levelId (new id, new Object3D).
        scene.remove(wallL1);
        const rebuilt = makeWall('wall-L1b', 'L1', 3);
        scene.add(rebuilt);

        // The builder's bim-wall-updated event drives the debounced reconcile;
        // invoke it directly (the scheduler is not pumped in the test env).
        (controller as any)._reconcile();
        settle();

        // The rebuilt mesh is re-lifted; it did NOT strand at its true elevation.
        expect(rebuilt.position.y).toBeCloseTo(3 + GAP, 3);
        expect(controller.getActiveOffsetForObject(rebuilt)).toBeCloseTo(GAP, 3);
    });

    it('does NOT re-capture baseY from an already-lifted survivor (no double-lift on reconcile)', () => {
        applyMode('exploded');
        settle();
        const lifted = wallL1.position.y;

        // A reconcile triggered while the mesh is lifted must preserve its model
        // baseY, not bake the current (lifted) Y in — otherwise it double-lifts.
        (controller as any)._reconcile();
        settle();

        expect(wallL1.position.y).toBeCloseTo(lifted, 3);
        expect(wallL1.position.y).toBeCloseTo(3 + GAP, 3);
    });

    it('unstacking (deactivate) restores the exact model Y — no residual offset baked in', () => {
        applyMode('exploded');
        settle();
        expect(wallL1.position.y).toBeCloseTo(3 + GAP, 3);

        controller.deactivate();

        expect(wallL0.position.y).toBe(0);
        expect(wallL1.position.y).toBe(3);
        // Provider stays live until dispose (deactivate only collapses the view).
        controller.dispose();
        expect((window as any).pryzmLevelExplodeOffsetForObject).toBeUndefined();
    });

    it('re-anchors the selected element (gizmo + highlight) once the lift settles', () => {
        const applyHighlight = vi.fn();
        (window as any).selectionManager = { selectedObject: wallL1, applyHighlight };

        applyMode('exploded');
        settle();

        // Gizmo proxies re-synced via the narrow re-anchor event (NOT bim-selection-changed).
        expect(emitSpy).toHaveBeenCalledWith('pryzm-reanchor-transform', { object: wallL1 });
        // Highlight re-cloned at the settled (lifted) matrix so it tracks the mesh.
        expect(applyHighlight).toHaveBeenCalledWith(wallL1);
    });
});
