/**
 * @vitest-environment happy-dom
 *
 * §ROOM-VG-CATEGORY (L-1613) — `room` is a REACHABLE VG category, not a declared one.
 *
 * WHAT THIS PINS, and why each arm exists:
 *
 *  1. REACHABILITY. Adding `'room'` to the `VGCategory` union changes nothing on
 *     its own — `getVGCategory()` maps by `userData.elementType`, and until the
 *     map carries the key the applicator skips every room mesh silently. The
 *     first arm asserts a room mesh is affected AT ALL by a room-category style.
 *     Declaring a category and never mapping it is the authored-but-unwired
 *     defect this repository keeps re-finding.
 *
 *  2. THE FILL IS NOT VG'S TO WRITE. Rooms are FILLED REGIONS whose colour is a
 *     DETERMINATION — the room's type, its size, the colour the user chose. A
 *     category-wide poche `fillColor` stamped over it would erase exactly the
 *     information the wash exists to carry. `applyToMesh()` therefore routes the
 *     room category through the "visible + transparency, never fillColor" leg
 *     (§3D-CARRIES-NO-VG-FILL, L-1560) in EVERY view type, plan included.
 *
 *  3. VISIBILITY IS A MASK, NOT A REPLACEMENT. Room VOLUMES are shown/hidden by
 *     the 'showRoomVolumeColour' preference. VG's default `visible: true` must
 *     not force a volume the user switched off back on at every view switch.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as THREE from '@pryzm/renderer-three/three';
import { VGSceneApplicator } from './VGSceneApplicator';
import { vgGovernanceStore } from './VGGovernanceStore';
import { viewDefinitionStore } from '../views/ViewDefinitionStore';
import { ROOM_VG_CATEGORY } from './RoomColourIntent';

const PLAN_VIEW_ID = 'vd-room-plan';
const MODEL = 'model-default';

/** The colour RoomBoundaryBuilder authored from the active room colour mode. */
const AUTHORED_ROOM_FILL = 0xb8d4f0;

function roomMesh(name: string, extra: Record<string, unknown> = {}): THREE.Mesh {
    const mesh = new THREE.Mesh(
        new THREE.PlaneGeometry(1, 1),
        new THREE.MeshBasicMaterial({ color: AUTHORED_ROOM_FILL, transparent: true, opacity: 0.35 }),
    );
    mesh.userData = {
        id: name, elementId: name,
        // Exactly what RoomBoundaryBuilder stamps.
        elementType: 'room', type: 'room',
        modelId: MODEL, levelId: 'L0',
        ...extra,
    };
    mesh.name = name;
    return mesh;
}

describe('§ROOM-VG-CATEGORY (L-1613) — the room category reaches room meshes', () => {
    let scene: THREE.Scene;
    let applicator: VGSceneApplicator;
    let fill: THREE.Mesh;
    let volume: THREE.Mesh;

    beforeEach(() => {
        viewDefinitionStore.reset();
        viewDefinitionStore.create({ id: PLAN_VIEW_ID, name: 'Level 0', viewType: 'plan', spatial: { levelId: 'L0' } });
        vgGovernanceStore.ensureModel(MODEL, 'Main Model');
        vgGovernanceStore.resetModelCategoryOverride(MODEL, ROOM_VG_CATEGORY);
        vgGovernanceStore.ensureView(PLAN_VIEW_ID, PLAN_VIEW_ID, MODEL);
        vgGovernanceStore.resetViewCategoryOverride(PLAN_VIEW_ID, ROOM_VG_CATEGORY);

        scene = new THREE.Scene();
        fill = roomMesh('room-overlay-r1');
        volume = roomMesh('room-volume-r1', { isRoomVolume: true, vgBaseVisible: false });
        volume.visible = false;
        scene.add(fill);
        scene.add(volume);
        applicator = new VGSceneApplicator(scene, vgGovernanceStore as never, MODEL);
    });

    afterEach(() => {
        applicator.dispose();
        vgGovernanceStore.resetViewCategoryOverride(PLAN_VIEW_ID, ROOM_VG_CATEGORY);
        vgGovernanceStore.resetModelCategoryOverride(MODEL, ROOM_VG_CATEGORY);
        viewDefinitionStore.reset();
    });

    it('REACHABLE — hiding the room category hides the room wash', () => {
        expect(fill.visible).toBe(true);
        vgGovernanceStore.setViewCategoryOverride(PLAN_VIEW_ID, ROOM_VG_CATEGORY, { visible: false });
        applicator.applyAll(PLAN_VIEW_ID);
        expect(fill.visible).toBe(false);
    });

    it('the room fill colour is NEVER overwritten by the category poche colour', () => {
        // A category fill that would be catastrophic if stamped: it would flatten
        // "by room type" / "by size" into one meaningless colour.
        vgGovernanceStore.setViewCategoryOverride(PLAN_VIEW_ID, ROOM_VG_CATEGORY, { fillColor: '#ff00ff' });
        applicator.applyAll(PLAN_VIEW_ID);
        expect((fill.material as THREE.MeshBasicMaterial).color.getHex()).toBe(AUTHORED_ROOM_FILL);
    });

    it('a hidden room VOLUME is not forced back on by VG default visibility', () => {
        applicator.applyAll(PLAN_VIEW_ID);
        // VG resolves visible:true for the room category by default. Without the
        // mask that would re-show a volume the user turned off, on every view switch.
        expect(volume.visible).toBe(false);
        // …and the fill, which carries no vgBaseVisible, is untouched by the mask.
        expect(fill.visible).toBe(true);
    });

    it('a room mesh is still HIDDEN by an explicit category hide even if it was visible', () => {
        vgGovernanceStore.setViewCategoryOverride(PLAN_VIEW_ID, ROOM_VG_CATEGORY, { visible: false });
        applicator.applyAll(PLAN_VIEW_ID);
        expect(volume.visible).toBe(false);
        expect(fill.visible).toBe(false);
    });
});
