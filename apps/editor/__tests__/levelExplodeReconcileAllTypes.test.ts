// @vitest-environment happy-dom
//
// §FIX-LEVEL-EXPLODE-RECONCILE-ALL-TYPES (L-233) — regression guard.
//
// Founder (prod, exploded / "stacked levels" inspect view):
//   "When the levels are stacked, if the user moves an element or creates an
//    element, MANY of the elements in the view get un-stacked — back to normal."
//
// Root cause: the L-113 reconcile fired on a hand-maintained ALLOWLIST of
// per-element-type `bim-<type>-added|updated|removed` window events. It listed
// wall/slab/floor/ceiling/furniture/column/beam/roof/stair/curtainwall/door/window
// but NOT rooms, room-bounding-lines, room LABELS, handrail, opening, plumbing,
// lighting or stair-railing. A MOVE_WINDOW fires `bim-window-updated` +
// `bim-wall-updated` (both on the list → the wall re-lifted) but ALSO triggers a
// room re-detect that rebuilds the room fills + labels — which were NOT on the
// list, so the founder's 526 rooms + 263 labels dropped back to model Y while the
// walls stayed exploded.
//
// Fix: the reconcile trigger is now TYPE-AGNOSTIC BY CONSTRUCTION — it keys on
// THREE's `childadded`/`childremoved` on the SCENE ROOT (every level-tracked root
// of every element type is a direct child of the scene root; a rebuild is always a
// scene.remove(old) + scene.add(new) pair). No element-type list exists any more.
//
// These tests deliberately drive the SCENE, never a `bim-*` event name — that is
// the whole point of the fix.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as THREE from '@pryzm/renderer-three/three';
import { LevelExplodeController } from '../src/engine/inspect/LevelExplodeController.js';

const GAP = 5.0; // EXPLODE_GAP in the controller

function makeRoot(
    id: string,
    levelId: string,
    elevation: number,
    extraUserData: Record<string, unknown> = {},
): THREE.Mesh {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
    mesh.userData.id = id;
    mesh.userData.levelId = levelId;
    Object.assign(mesh.userData, extraUserData);
    mesh.position.set(0, elevation, 0);
    return mesh;
}

/** A room-NAME label is a THREE.Sprite carrying only `roomId` — NO levelId.
 *  The controller stamps its level from the room store during _buildLevelGroups. */
function makeRoomLabel(roomId: string, elevation: number): THREE.Sprite {
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial());
    sprite.userData.roomId = roomId;
    sprite.userData.type = 'room-label';
    sprite.position.set(0, elevation, 0);
    return sprite;
}

describe('§FIX-LEVEL-EXPLODE-RECONCILE-ALL-TYPES — every level-tagged root re-lifts, whatever its type', () => {
    let scene: THREE.Scene;
    let controller: LevelExplodeController;

    // Level L1 (index 1, elevation 3) — the storey the founder edits.
    let wallL1: THREE.Mesh;
    let roomL1: THREE.Mesh;
    let labelL1: THREE.Sprite;

    beforeEach(() => {
        scene = new THREE.Scene();

        // L0 anchors index 0 so L1 gets a non-zero explode offset.
        scene.add(makeRoot('wall-L0', 'L0', 0, { elementType: 'wall' }));

        wallL1 = makeRoot('wall-L1', 'L1', 3, { elementType: 'wall' });
        roomL1 = makeRoot('room-L1', 'L1', 3, { elementType: 'room', isRoomOverlay: true });
        labelL1 = makeRoomLabel('room-L1', 3);
        scene.add(wallL1, roomL1, labelL1);

        (window as any).bimManager = {
            getLevels: () => [
                { id: 'L0', elevation: 0, childrenIds: ['wall-L0'] },
                { id: 'L1', elevation: 3, childrenIds: ['wall-L1'] },
            ],
        };
        // Room labels carry only roomId — the controller resolves their level here.
        (window as any).roomStore = {
            getById: (id: string) => (id === 'room-L1' ? { levelId: 'L1' } : undefined),
        };
        (window as any).runtime = { events: { on: () => () => {}, emit: vi.fn() } };

        controller = new LevelExplodeController();
        controller.init(scene);
        controller.activate();
    });

    afterEach(() => {
        controller.dispose();
        delete (window as any).bimManager;
        delete (window as any).roomStore;
        delete (window as any).runtime;
        delete (window as any).selectionManager;
    });

    const applyMode = (mode: 'stacked' | 'exploded' | 'solo', soloLevelId?: string): void => {
        (controller as any)._onExplodeEvent({ mode, soloLevelId });
    };

    // Drive the lerp to convergence (the global frame scheduler is not pumped here).
    const settle = (): void => {
        let now = 1000;
        for (let i = 0; i < 300; i++) {
            (controller as any)._tick(now);
            now += 20;
        }
    };

    // The scene-mutation listener schedules the reconcile through the frame
    // scheduler, which is not pumped in the test env. Assert it ARMED the
    // reconcile, then drain it exactly as the scheduler would.
    const reconcileWasScheduled = (): boolean => (controller as any)._reconcileScheduled !== null;
    const drainReconcile = (): void => {
        (controller as any)._cancelReconcile();
        (controller as any)._reconcile();
    };

    it('THE FOUNDER SCENARIO: MOVE_WINDOW rebuilds wall + room + label — ALL of them stay lifted', () => {
        applyMode('exploded');
        settle();
        expect(wallL1.position.y).toBeCloseTo(3 + GAP, 3);
        expect(roomL1.position.y).toBeCloseTo(3 + GAP, 3);
        expect(labelL1.position.y).toBeCloseTo(3 + GAP, 3);

        // A window move rebuilds the host WALL and — via the room re-detect it
        // triggers — the ROOM fill and its LABEL too. Every builder disposes its old
        // root and scene.add()s a fresh one at the element's TRUE (model) elevation.
        // Under the OLD allowlist only the wall re-lifted; room + label stranded.
        scene.remove(wallL1, roomL1, labelL1);
        const wallRebuilt = makeRoot('wall-L1', 'L1', 3, { elementType: 'wall' });
        const roomRebuilt = makeRoot('room-L1b', 'L1', 3, { elementType: 'room', isRoomOverlay: true });
        const labelRebuilt = makeRoomLabel('room-L1', 3);
        scene.add(wallRebuilt, roomRebuilt, labelRebuilt);

        expect(reconcileWasScheduled()).toBe(true);
        drainReconcile();
        settle();

        // The wall was ALREADY covered by the old allowlist…
        expect(wallRebuilt.position.y).toBeCloseTo(3 + GAP, 3);
        // …these two are the 789 roots the founder watched drop. They now re-lift.
        expect(roomRebuilt.position.y).toBeCloseTo(3 + GAP, 3);
        expect(labelRebuilt.position.y).toBeCloseTo(3 + GAP, 3);
    });

    it('covers element types that NEVER had a reconcile event — handrail, opening, plumbing, lighting', () => {
        applyMode('exploded');
        settle();

        // None of these had a `bim-*` entry in the old REBUILD_EVENTS allowlist.
        // The fix is type-agnostic, so they need no special-casing at all.
        const rebuilt = ['handrail', 'opening', 'plumbing', 'lighting', 'some-future-type'].map(
            (elementType, i) => {
                const root = makeRoot(`${elementType}-L1`, 'L1', 3, { elementType });
                scene.add(root);
                expect(reconcileWasScheduled()).toBe(true);
                drainReconcile();
                settle();
                expect(root.position.y, `${elementType} (#${i}) must lift into the stack`)
                    .toBeCloseTo(3 + GAP, 3);
                return root;
            },
        );
        expect(rebuilt).toHaveLength(5);
    });

    it('creating an element in exploded mode places it IN the stack, not at model Y', () => {
        applyMode('exploded');
        settle();

        const created = makeRoot('furniture-new', 'L1', 3, { elementType: 'furniture' });
        scene.add(created);

        expect(reconcileWasScheduled()).toBe(true);
        drainReconcile();
        settle();

        expect(created.position.y).toBeCloseTo(3 + GAP, 3);
        expect(created.position.y).not.toBeCloseTo(3, 3); // NOT stranded at model Y
    });

    it('P2 — a reconcile does NOT re-capture baseY from an already-lifted survivor (no double-lift)', () => {
        applyMode('exploded');
        settle();
        const liftedOnce = wallL1.position.y;
        expect(liftedOnce).toBeCloseTo(3 + GAP, 3);

        // Three back-to-back reconciles while the survivor is LIFTED. If baseY were
        // re-captured from the lifted Y, each pass would add another GAP.
        for (let i = 0; i < 3; i++) {
            scene.add(makeRoot(`filler-${i}`, 'L1', 3, { elementType: 'wall' }));
            drainReconcile();
            settle();
        }

        expect(wallL1.position.y).toBeCloseTo(liftedOnce, 3);
        expect(wallL1.position.y).toBeCloseTo(3 + GAP, 3); // exactly ONE gap, never 2×/4×
    });

    it('P2 — collapsing after a rebuild restores the EXACT model Y (no offset baked into baseY)', () => {
        applyMode('exploded');
        settle();

        scene.remove(roomL1);
        const roomRebuilt = makeRoot('room-L1b', 'L1', 3, { elementType: 'room', isRoomOverlay: true });
        scene.add(roomRebuilt);
        drainReconcile();
        settle();
        expect(roomRebuilt.position.y).toBeCloseTo(3 + GAP, 3);

        applyMode('stacked');
        settle();

        expect(roomRebuilt.position.y).toBeCloseTo(3, 3); // exact model Y
        expect(wallL1.position.y).toBeCloseTo(3, 3);

        controller.deactivate();
        expect(roomRebuilt.position.y).toBe(3);
    });

    it('P3 — one edit → N rebuilds coalesces to ONE reconcile (not one per root)', () => {
        applyMode('exploded');
        settle();

        const reconcileSpy = vi.spyOn(controller as any, '_reconcile');

        // A single MOVE_WINDOW rebuilds many roots — wall, openings, rooms, labels.
        for (let i = 0; i < 25; i++) {
            scene.add(makeRoot(`burst-${i}`, 'L1', 3, { elementType: 'wall' }));
        }

        // All 25 additions collapsed into ONE armed reconcile (frame-scheduler
        // scheduleOnce), not 25 — no mid-batch partial lifts, no O(N) re-buckets.
        expect(reconcileWasScheduled()).toBe(true);
        expect(reconcileSpy).not.toHaveBeenCalled(); // nothing ran mid-burst

        drainReconcile();
        expect(reconcileSpy).toHaveBeenCalledTimes(1);

        reconcileSpy.mockRestore();
    });

    it('stacked mode needs no reconcile — a rebuilt root already arrives at the correct model Y', () => {
        // Explicitly stacked (the collapsed building view): every offset is 0, so a
        // freshly rebuilt root at model Y is already right. Re-bucketing the whole
        // scene here would be pure waste on every edit.
        applyMode('stacked');
        settle();

        scene.add(makeRoot('wall-new', 'L1', 3, { elementType: 'wall' }));

        expect(reconcileWasScheduled()).toBe(false);
    });

    it('non-BIM scene furniture (gizmo helper, highlight outline) does NOT trigger a re-bucket', () => {
        applyMode('exploded');
        settle();

        // No levelId / id / roomId → _buildLevelGroups could never bucket it, so it
        // can never drop out of the stack. Selecting/hovering in exploded mode must
        // not cost a whole-scene traverse.
        const gizmoHelper = new THREE.Object3D();
        gizmoHelper.name = 'TransformControlsHelper';
        scene.add(gizmoHelper);
        expect(reconcileWasScheduled()).toBe(false);

        const outline = new THREE.LineSegments();
        outline.name = 'wall:w1:outline';
        scene.add(outline);
        expect(reconcileWasScheduled()).toBe(false);
    });

    it('solo mode re-hides a root rebuilt on a NON-soloed level', () => {
        applyMode('solo', 'L1');
        settle();

        // Rebuild a root on L0 — the level solo is hiding. It arrives .visible=true.
        const l0Rebuilt = makeRoot('wall-L0b', 'L0', 0, { elementType: 'wall' });
        scene.add(l0Rebuilt);
        expect(l0Rebuilt.visible).toBe(true);

        expect(reconcileWasScheduled()).toBe(true);
        drainReconcile();

        expect(l0Rebuilt.visible).toBe(false); // re-hidden by the solo derivation
        expect(wallL1.visible).toBe(true);     // soloed level still shown
    });

    it('P4 — never re-anchors the gizmo onto a DETACHED (pre-rebuild) object', () => {
        const emit = vi.fn();
        (window as any).runtime = { events: { on: () => () => {}, emit } };
        const applyHighlight = vi.fn();

        // Selection still points at the PRE-rebuild mesh the builder just removed —
        // exactly the state that produced the §SELECT-GIZMO-REATTACH per-frame flood.
        const stale = wallL1;
        scene.remove(stale);
        (window as any).selectionManager = { selectedObject: stale, applyHighlight };

        applyMode('exploded');
        settle();

        // Re-anchoring the stale object would re-attach TransformControls to an
        // object outside the scene graph → THREE throws every render frame.
        expect(emit).not.toHaveBeenCalledWith('pryzm-reanchor-transform', { object: stale });
        expect(applyHighlight).not.toHaveBeenCalled();
    });

    it('P4 — still re-anchors normally when the selected object IS attached', () => {
        const emit = vi.fn();
        (window as any).runtime = { events: { on: () => () => {}, emit } };
        const applyHighlight = vi.fn();
        (window as any).selectionManager = { selectedObject: wallL1, applyHighlight };

        applyMode('exploded');
        settle();

        expect(emit).toHaveBeenCalledWith('pryzm-reanchor-transform', { object: wallL1 });
        expect(applyHighlight).toHaveBeenCalledWith(wallL1);
    });
});
