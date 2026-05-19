import * as THREE from '@pryzm/renderer-three/three';
import { TransformControls } from '@pryzm/renderer-three';
import { HostedElementDragController } from '@pryzm/input-host';
import { WallTransformController } from '@pryzm/input-host';
import { WallEndpointController } from '@pryzm/input-host';
import { LevelPlaneConstraint } from '@pryzm/input-host';

export interface TransformControllerSet {
    transformControls: InstanceType<typeof TransformControls>;
    levelPlaneConstraint: InstanceType<typeof LevelPlaneConstraint>;
    hostedDragController: InstanceType<typeof HostedElementDragController>;
    wallTransformController: InstanceType<typeof WallTransformController>;
    wallEndpointController: InstanceType<typeof WallEndpointController>;
}

/**
 * Creates TransformControls + all dependent drag/constraint controllers and
 * recolours the gizmo axes to the PRYZM violet palette.
 * Extracted from engineLauncher.ts Task 5.2.
 */
export function createTransformControllers(world: any): TransformControllerSet {
    const transformControls = new TransformControls(world.camera.three, world.renderer.three.domElement);
    const _tcHelper = transformControls.getHelper();
    world.scene.three.add(_tcHelper);

    const isMobile = window.innerWidth < 768 || 'ontouchstart' in window;
    transformControls.setSize(isMobile ? 1.5 : 0.8);

    // ── Phase 8: Recolour gizmo axes to PRYZM violet palette ─────────────────
    const _GIZMO_AXIS_HEX: Record<string, number> = {
        X: 0x6600FF,
        Y: 0x8B5CF6,
        Z: 0x7B3FF2,
    };
    _tcHelper.traverse((obj: THREE.Object3D) => {
        const mesh = obj as THREE.Mesh | THREE.Line;
        if (!('isMesh' in mesh || 'isLine' in mesh)) return;
        const leadAxis = ['X', 'Y', 'Z'].find(a => obj.name.startsWith(a));
        if (!leadAxis) return;
        const hex = _GIZMO_AXIS_HEX[leadAxis];
        const applyHex = (mat: any) => { if (mat && mat.color) mat.color.setHex(hex); };
        const mats = (mesh as any).material;
        if (Array.isArray(mats)) mats.forEach(applyHex);
        else applyHex(mats);
    });
    console.log('[initTransformControllers] Gizmo axes recoloured to PRYZM violet palette');

    window.transformControls = transformControls;

    const hostedDragController = new HostedElementDragController(
        transformControls,
        world.scene.three,
        () => window.wallStore, // TODO(TASK-08)
        () => window.runtime?.bus, // §P4.2 — bus replaces commandManager (C14 §2.1)
    );

    const levelPlaneConstraint = new LevelPlaneConstraint(transformControls);

    const wallTransformController = new WallTransformController(
        transformControls,
        world.scene.three as THREE.Scene,
    );

    const wallEndpointController = new WallEndpointController(
        world.scene.three as THREE.Scene,
        world.camera.three as THREE.Camera,
        world.renderer.three.domElement,
    );

    return { transformControls, levelPlaneConstraint, hostedDragController, wallTransformController, wallEndpointController };
}
