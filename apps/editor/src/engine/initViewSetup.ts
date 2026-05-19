import * as THREE from '@pryzm/renderer-three/three';
import * as OBC from '@thatopen/components';

/**
 * Registers default OBC views (3D, plans, elevations) and creates the
 * zoomToAll() camera-fit function.
 * Extracted from engineLauncher.ts Task 5.2.
 */
export function initViewSetup(params: { components: any; world: any; viewController: any }): {
    zoomToAll: (animate?: boolean) => Promise<void>;
} {
    const { components, world, viewController } = params;

    // ── Register default views ────────────────────────────────────────────────
    const viewsList = components.get(OBC.Views);
    const defaultViews = [
        { id: '3D', type: '3D View' },
        { id: 'Ground Floor', type: 'Floor Plan' },
        { id: 'Top', type: 'Floor Plan' },
        { id: 'Front', type: 'Elevation' },
        { id: 'Left', type: 'Elevation' },
        { id: 'Right', type: 'Elevation' },
        { id: 'Back', type: 'Elevation' },
    ];
    for (const viewInfo of defaultViews) {
        if (!viewsList.list.has(viewInfo.id)) {
            const view = new OBC.View(components);
            (view as any).id = viewInfo.id;
            view.world = world;
            (view as any).position  = new THREE.Vector3();
            (view as any).direction = new THREE.Vector3();
            if (viewInfo.id === 'Top') {
                (view as any).position.set(0, 50, 0);
                (view as any).direction.set(0, -1, 0);
            } else if (viewInfo.id === 'Front') {
                (view as any).position.set(0, 0, 50);
                (view as any).direction.set(0, 0, -1);
            } else if (viewInfo.id === 'Right') {
                (view as any).position.set(50, 0, 0);
                (view as any).direction.set(-1, 0, 0);
            } else if (viewInfo.id === '3D') {
                (view as any).position.set(20, 20, 20);
                (view as any).direction.set(-1, -1, -1).normalize();
            }
            viewsList.list.set(view.id, view);
        }
    }
    window.runtime?.events?.emit('update-views', {}); // F.events.10

    // ── zoomToAll ─────────────────────────────────────────────────────────────
    const BIM_TYPES_FIT = new Set([
        'wall', 'slab', 'furniture', 'column', 'beam', 'roof',
        'curtainwall', 'curtain-wall', 'door', 'window',
        'stair', 'stairs', 'railing', 'plumbing', 'ceiling', 'floor',
    ]);

    const zoomToAll = async (animate = true) => {
        const box = new THREE.Box3();
        const _tmp = new THREE.Box3();
        let hasGeometry = false;

        world.scene.three.traverse((obj: THREE.Object3D) => {
            if (!(obj instanceof THREE.Mesh)) return;
            if (!obj.visible || obj.userData.isPreview || obj.userData.isHelper) return;
            const t = (obj.userData?.elementType || obj.userData?.type || '').toLowerCase();
            if (!BIM_TYPES_FIT.has(t)) return;
            _tmp.setFromObject(obj);
            if (!_tmp.isEmpty()) { box.union(_tmp); hasGeometry = true; }
        });

        if (!hasGeometry) {
            world.scene.three.traverse((obj: THREE.Object3D) => {
                if (!(obj instanceof THREE.Mesh)) return;
                if (!obj.visible || obj.userData.isPreview || obj.userData.isHelper) return;
                _tmp.setFromObject(obj);
                if (!_tmp.isEmpty()) { box.union(_tmp); hasGeometry = true; }
            });
        }

        if (!hasGeometry || box.isEmpty()) {
            console.warn('[zoomToAll] No geometry found in scene');
            return;
        }

        const center   = box.getCenter(new THREE.Vector3());
        const size     = box.getSize(new THREE.Vector3());
        const diagonal = size.length();
        const distance = Math.min(Math.max(diagonal * 0.75, 8), 80);
        const dir      = new THREE.Vector3(1, 0.65, 1).normalize();
        const cameraPos = center.clone().addScaledVector(dir, distance);

        const prevMax = world.camera.controls.maxDistance;
        const animMax = Math.min(distance * 1.1, 150);
        if (world.camera.controls.maxDistance < animMax) {
            world.camera.controls.maxDistance = animMax;
        }

        await world.camera.controls.setLookAt(
            cameraPos.x, cameraPos.y, cameraPos.z,
            center.x, center.y, center.z,
            animate,
        );
        viewController.multiViewCameraManager.seedPerspectiveSlot(cameraPos, center);

        setTimeout(() => {
            world.camera.controls.maxDistance = Math.min(Math.max(prevMax, distance), 150);
            (world as any)._reapplyCameraConstraints?.();
        }, 600);
    };

    return { zoomToAll };
}
