// @vitest-environment happy-dom
//
// §FLOOR-ISOLATE-ROOMTAG (2026-06-24) — regression guard.
//
// Bug: isolating a single floor plan ("Active Level Only" / solo level mode)
// hid per-level GEOMETRY but left every other storey's 3D room-NAME labels
// (THREE.Sprite, userData.type='room-label') visible on top of the isolated
// floor. Root cause: those sprites carry only `userData.roomId` (no
// `id`/`levelId`/`storeyName`), so `_isBimObject` rejected them and the
// isolation traverse skipped them entirely.
//
// Fix: `_applySceneVisibilityFilters()` now runs `_stampAnnotationLevelTags()`
// first (the same pre-pass the level explode/stack path already used), which
// resolves each label's owning level from the room store and stamps
// `userData.levelId`. The labels then enter the SAME per-level visibility
// bucket the walls/floors use — hidden when level ≠ active, restored on
// un-isolate.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as THREE from '@pryzm/renderer-three/three';
import { BottomActionMenu, type BottomActionMenuProps } from '../src/ui/bottom-menu/BottomActionMenu.js';

// Mirror RoomLabelRenderer's sprite shape: only roomId + type, NO levelId.
function makeRoomLabel(roomId: string): THREE.Sprite {
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial());
    sprite.name = `room-label-${roomId}`;
    sprite.userData.roomId = roomId;
    sprite.userData.type = 'room-label';
    sprite.visible = true;
    return sprite;
}

// A wall mesh DOES carry a levelId at build time.
function makeWall(id: string, levelId: string): THREE.Mesh {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
    mesh.userData.id = id;
    mesh.userData.levelId = levelId;
    mesh.userData.elementType = 'wall';
    mesh.visible = true;
    return mesh;
}

const STUB_PROPS: BottomActionMenuProps = {
    toolManager: {},
    selectionManager: {},
    navManager: {},
    service: {},
    wallTool: {},
    deleteSelected: () => {},
};

describe('§FLOOR-ISOLATE-ROOMTAG — floor isolation hides other levels\' room labels', () => {
    let scene: THREE.Scene;
    let labelL0: THREE.Sprite;
    let labelL1: THREE.Sprite;
    let wallL0: THREE.Mesh;
    let wallL1: THREE.Mesh;

    beforeEach(() => {
        scene = new THREE.Scene();
        labelL0 = makeRoomLabel('room-L0');
        labelL1 = makeRoomLabel('room-L1');
        wallL0 = makeWall('wall-L0', 'L0');
        wallL1 = makeWall('wall-L1', 'L1');
        scene.add(labelL0, labelL1, wallL0, wallL1);

        // Room store maps each label's room → its owning level (the resolver the
        // fix relies on to stamp userData.levelId on the level-less sprites).
        const rooms: Record<string, { levelId: string }> = {
            'room-L0': { levelId: 'L0' },
            'room-L1': { levelId: 'L1' },
        };
        (window as any).roomStore = { getById: (id: string) => rooms[id] };
        (window as any).scene = scene;
        (window as any).projectContext = { activeLevelId: 'L0', levels: [{ id: 'L0' }, { id: 'L1' }] };
        (window as any).bimManager = {
            getLevels: () => [{ id: 'L0', elevation: 0 }, { id: 'L1', elevation: 3 }],
            activeLevelId: 'L0',
        };
    });

    afterEach(() => {
        delete (window as any).roomStore;
        delete (window as any).scene;
        delete (window as any).projectContext;
        delete (window as any).bimManager;
    });

    it('isolating level L0 hides L1\'s room label (and L1 geometry), keeps L0\'s', () => {
        const menu = new BottomActionMenu(STUB_PROPS);

        // Sanity: everything visible before isolation.
        expect(labelL0.visible).toBe(true);
        expect(labelL1.visible).toBe(true);

        // Activate "Active Level Only" (the floor-isolation gesture).
        (menu as any)._toggleActiveLevelOnly();

        // Active level (L0) label + wall stay visible…
        expect(labelL0.visible).toBe(true);
        expect(wallL0.visible).toBe(true);
        // …the OTHER storey's label is now hidden, just like its geometry.
        expect(labelL1.visible).toBe(false);
        expect(wallL1.visible).toBe(false);

        // The fix stamped the owning level onto the previously level-less sprite.
        expect(labelL1.userData.levelId).toBe('L1');
        expect(labelL0.userData.levelId).toBe('L0');
    });

    it('un-isolating restores every level\'s room label', () => {
        const menu = new BottomActionMenu(STUB_PROPS);

        (menu as any)._toggleActiveLevelOnly(); // isolate L0
        expect(labelL1.visible).toBe(false);

        (menu as any)._toggleActiveLevelOnly(); // un-isolate
        expect(labelL0.visible).toBe(true);
        expect(labelL1.visible).toBe(true);
        expect(wallL0.visible).toBe(true);
        expect(wallL1.visible).toBe(true);
    });

    it('switching the active level re-buckets the labels (L1 isolated ⇒ only L1 tag shows)', () => {
        const menu = new BottomActionMenu(STUB_PROPS);

        (menu as any)._toggleActiveLevelOnly(); // isolate L0
        expect(labelL0.visible).toBe(true);
        expect(labelL1.visible).toBe(false);

        // Move the active level to L1 and re-run the filter (mirrors the
        // 'activeLevelChanged' listener path).
        (window as any).projectContext.activeLevelId = 'L1';
        (menu as any)._applySceneVisibilityFilters();

        expect(labelL0.visible).toBe(false);
        expect(labelL1.visible).toBe(true);
    });
});
