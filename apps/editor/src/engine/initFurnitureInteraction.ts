import * as THREE from '@pryzm/renderer-three/three';
import { undoManager, AddObjectCommand } from '@pryzm/command-registry';

interface FurnitureDeps {
    world: any;
    projectContext: { activeLevelId: string | null };
    gltfLoader: any;
    bimManager: any;
    furnitureBuilder: { furnitureRoots: Map<string, any> };
    furnitureStore: { add(record: any): void };
    getSelectionManager: () => { applyHighlight(obj: THREE.Object3D): void };
    updateInspector: (obj: THREE.Object3D) => void;
}

/**
 * Creates the addFurniture() function matching the original engineLauncher logic.
 * Extracted from engineLauncher.ts Task 5.2.
 * Call AFTER initTools() so getSelectionManager() resolves.
 */
export function createAddFurniture(deps: FurnitureDeps): (modelPath: string, position?: THREE.Vector3) => void {
    const { world, projectContext, gltfLoader, bimManager, furnitureBuilder, furnitureStore, getSelectionManager, updateInspector } = deps;

    return (modelPath: string, position?: THREE.Vector3): void => {
        const levelId = projectContext.activeLevelId;
        if (!levelId) throw new Error('Spatial Authority Violation: No active level selected for furniture placement.');

        if (modelPath === 'box') {
            const box = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: 0x808080 }));
            const id = crypto.randomUUID();
            box.userData = { elementType: 'Furniture', name: 'Box', id, levelId };
            Object.defineProperty(box.userData, 'id', { writable: false });
            Object.defineProperty(box.userData, 'elementType', { writable: false });
            if (window.bimManager) window.bimManager.registerElement(id, levelId);
            box.castShadow = true; box.receiveShadow = true;
            world.scene.three.add(box);
            undoManager.add(new AddObjectCommand(world.scene.three, box));
            updateInspector(box);
            getSelectionManager().applyHighlight(box);
            return;
        }

        gltfLoader.load(modelPath, async (gltf: any) => {
            const model = gltf.scene;
            const id = crypto.randomUUID();
            const placedPos = position ?? new THREE.Vector3(0, 0, 0);
            model.userData = { elementType: 'Furniture', name: 'Furniture Item', id, posX: placedPos.x, posZ: placedPos.z, levelId };
            Object.defineProperty(model.userData, 'id', { writable: false });
            Object.defineProperty(model.userData, 'elementType', { writable: false });
            if (window.bimManager) window.bimManager.registerElement(id, levelId);
            model.traverse((child: THREE.Object3D) => {
                if (child instanceof THREE.Mesh) {
                    child.userData = { role: 'geometry', parentId: id, elementType: 'FurniturePart' };
                    child.material = (child.material as THREE.Material).clone();
                    child.castShadow = true; child.receiveShadow = true;
                }
            });
            if (position) model.position.copy(position);
            world.scene.three.add(model);
            undoManager.add(new AddObjectCommand(world.scene.three, model));
            updateInspector(model);
            getSelectionManager().applyHighlight(model);
            await world.scene.updateShadows();
            furnitureBuilder.furnitureRoots.set(id, model);
            const level = bimManager.getLevelById(levelId);
            furnitureStore.add({
                id, type: 'furniture' as const, furnitureType: 'glb_import' as const,
                position: placedPos.clone(), rotation: new THREE.Euler(0, 0, 0),
                levelId, levelName: (level as any)?.name ?? '', levelElevation: (level as any)?.elevation ?? 0,
                baseOffset: 0, width: 1, length: 1, height: 1, material: 'wood' as const,
                properties: { glbPath: modelPath }, furnitureCategory: undefined,
            });
        }, undefined, (error: any) => {
            console.error(`[addFurniture] Failed to load GLB at "${modelPath}":`, error);
            alert(`Could not load furniture model.\n\nPath: ${modelPath}\n\nTo fix: place the GLB file at\n  public${modelPath}\n\nSee docs/KaveFurniture.md for the full setup guide.`);
        });
    };
}
