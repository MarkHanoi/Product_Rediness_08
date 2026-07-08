/**
 * §FIX-ELEV-WINDOWS (L-190 Bug A) — hosted openings appear in the elevation set.
 *
 * A window/door registers a scene ROOT via elementRegistry.registerRoot() but is
 * only appended to Level.childrenIds by CreateWallOpeningCommand. On the reload /
 * batch-import / generated-typology paths that command never runs, so the opening
 * is MISSING from childrenIds. Plan still shows it (WindowPlanSymbolBuilder reads
 * the store), but section/elevation/3D — which project from the childrenIds element
 * set — dropped it (the founder's blank-façade South Elevation).
 *
 * This test locks the fix: the elevation (no-levelId) export unions in every hosted
 * opening root from elementRegistry.getAllRoots() even when it is absent from every
 * level's childrenIds.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import * as THREE from '@pryzm/renderer-three/three';
import { elementRegistry } from '@pryzm/core-app-model/element-registry';
import { NativeElementMeshExporter } from './NativeElementMeshExporter';

function rootWith(id: string, elementType: string): THREE.Group {
    const group = new THREE.Group();
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 0.2), new THREE.MeshBasicMaterial());
    mesh.userData.elementType = elementType;
    group.add(mesh);
    group.userData = { id, elementType };
    return group;
}

function fakeBimManager(levels: Array<{ id: string; elevation: number; height: number; childrenIds: string[] }>) {
    return {
        getLevels: () => levels,
        getLevelById: (id: string) => levels.find(l => l.id === id),
    } as any;
}

const elevationViewDef = {
    id: 'view-south-elevation',
    viewType: 'elevation',
    spatial: {},
} as any;

describe('§FIX-ELEV-WINDOWS — NativeElementMeshExporter elevation query', () => {
    beforeEach(() => {
        elementRegistry.clear();
    });

    it('includes a window root that is NOT in any level.childrenIds', () => {
        const wallId = 'wall-south-1';
        const windowId = 'win-south-1';

        // Wall IS in childrenIds (normal); window is registered but NOT in childrenIds
        // (simulates the reload path where CreateWallOpeningCommand never ran).
        elementRegistry.registerRoot(wallId, rootWith(wallId, 'Wall'));
        elementRegistry.registerRoot(windowId, rootWith(windowId, 'Window'));

        const exporter = new NativeElementMeshExporter();
        exporter.setBimManager(fakeBimManager([
            { id: 'L0', elevation: 0, height: 3, childrenIds: [wallId] }, // window absent
        ]));

        const groups = exporter.exportForView(elevationViewDef);
        const ids = new Set(groups.map(g => g.userData.elementUUID as string));

        expect(ids.has(wallId)).toBe(true);
        expect(ids.has(windowId)).toBe(true); // Bug A: previously dropped

        exporter.releaseGroups(groups, { disposeProxies: true });
    });

    it('does not duplicate a window that is already in childrenIds', () => {
        const wallId = 'wall-2';
        const windowId = 'win-2';
        elementRegistry.registerRoot(wallId, rootWith(wallId, 'Wall'));
        elementRegistry.registerRoot(windowId, rootWith(windowId, 'Window'));

        const exporter = new NativeElementMeshExporter();
        exporter.setBimManager(fakeBimManager([
            { id: 'L0', elevation: 0, height: 3, childrenIds: [wallId, windowId] }, // window present
        ]));

        const groups = exporter.exportForView(elevationViewDef);
        const windowGroups = groups.filter(g => g.userData.elementUUID === windowId);
        expect(windowGroups.length).toBe(1);

        exporter.releaseGroups(groups, { disposeProxies: true });
    });
});
