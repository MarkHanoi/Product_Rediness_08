/**
 * @file src/elements/walls/WallInstanceBridge.ts
 *
 * WallInstanceBridge — Phase 3 GPU instancing bridge for simple walls.
 *
 * Routes walls that qualify for instanced rendering into InstancedElementRenderer,
 * collapsing ~70–85% of wall draw calls into one InstancedMesh per geometry
 * type per level.
 *
 * Eligibility contract (checked by WallFragmentBuilder before calling this):
 *   – No openings  (wall.openings.length === 0)
 *   – Not curved   (!wall.curve)
 *   – No miter join data (!joinData?.startMN && !joinData?.endMN)
 *
 * The wallGroup THREE.Group root is still created and owned by WallFragmentBuilder
 * so SelectionManager and PlanViewVisibilityCuller see an unmodified scene graph.
 * The actual rendered geometry lives in the InstancedMesh managed by
 * InstancedElementRenderer, keyed by wall.id.
 *
 * Contract compliance:
 *   §01-BIM-ENGINE-CORE-CONTRACT §5 — no store reads or mutations.
 *   §02-BIM-SPATIAL-PROJECTION §8  — projection-layer helper; no semantic state.
 *   §PHASE-3-INSTANCING             — one InstanceGroup per (geometry × level).
 */

import * as THREE from '@pryzm/renderer-three/three';
import type { WallData } from './WallTypes';
import type { InstancedElementRenderer } from './IInstancedRenderer';
import type { JoinData } from '@pryzm/core-app-model';

export class WallInstanceBridge {
    constructor(private _renderer: InstancedElementRenderer) {}

    /**
     * Register or update a simple wall as a GPU-instanced mesh.
     *
     * Called from WallFragmentBuilder.buildWall() when a wall is eligible
     * for the instanced path (no openings, not curved, no miter join data).
     *
     * The instance matrix encodes translation × rotation × scale:
     *   T = midpoint of the wall baseline at worldY + height/2 + baseOffset
     *   R = rotation around Y-axis to align with the baseline direction
     *   S = [wallLength, wallHeight, wallThickness]
     *
     * A unit BoxGeometry(1,1,1) is used so all simple walls of any dimensions
     * share ONE geometry buffer in the InstanceGroup, scaled by the matrix.
     *
     * @param wall      WallData to register.
     * @param worldY    Authoritative world-Y elevation (from BimManager level + slab offset).
     * @param joinData  Miter join data — walls with startMN/endMN must NOT be routed here.
     * @param material  Optional pre-resolved material; defaults to a MeshStandardMaterial.
     */
    register(
        wall: WallData,
        worldY: number,
        joinData?: JoinData | null,
        material?: THREE.Material,
    ): void {
        if (joinData?.startMN || joinData?.endMN) {
            console.warn(
                `[WallInstanceBridge] Wall ${wall.id} has miter join data — ` +
                'should use standard mesh path. Skipping instanced registration.',
            );
            return;
        }

        const [start, end] = wall.baseLine;
        const direction = new THREE.Vector3().subVectors(end, start);
        const wallLength = direction.length();
        if (wallLength < 0.001) return;

        direction.normalize();

        // Rotation angle around Y to align the unit box with the baseline direction.
        const angle = -Math.atan2(direction.z, direction.x);

        const mat = material ?? new THREE.MeshStandardMaterial({
            color: new THREE.Color(wall.materialColor ?? '#d4c5b0'),
        });

        // Unit geometry: BoxGeometry(1,1,1). The actual wall dimensions are encoded
        // entirely in the instance matrix via makeScale(). This allows ALL simple
        // walls with the same material to share one InstanceGroup.
        const geo = new THREE.BoxGeometry(1, 1, 1);

        const midpoint = new THREE.Vector3()
            .addVectors(start, end)
            .multiplyScalar(0.5);

        const tx = midpoint.x;
        const ty = worldY + wall.height / 2 + (wall.baseOffset ?? 0);
        const tz = midpoint.z;

        const matrix = new THREE.Matrix4()
            .makeTranslation(tx, ty, tz)
            .multiply(new THREE.Matrix4().makeRotationY(angle))
            .multiply(new THREE.Matrix4().makeScale(wallLength, wall.height, wall.thickness));

        // §INSTANCED-ISOLATE-FIX — pass the element type so the instanced group can be
        // resolved by the Project Browser's isolate/hide-by-type traverses (the group
        // has no per-element userData.id, so type+level are the only handles).
        this._renderer.register(wall.id, geo, mat, matrix, wall.levelId, 'wall');

        geo.dispose();
    }

    /**
     * Update only the world-space transform of an existing wall instance.
     *
     * Called when a wall's position or dimensions change but its geometry
     * profile (material) has not changed. Costs one Matrix4 write + GPU
     * buffer upload (< 0.01ms) — no geometry rebuild required.
     *
     * @param wall    WallData with the updated geometry.
     * @param worldY  Authoritative world-Y elevation.
     */
    updateTransform(wall: WallData, worldY: number): void {
        const [start, end] = wall.baseLine;
        const direction = new THREE.Vector3().subVectors(end, start);
        const wallLength = direction.length();
        if (wallLength < 0.001) return;

        direction.normalize();
        const angle = -Math.atan2(direction.z, direction.x);

        const midpoint = new THREE.Vector3()
            .addVectors(start, end)
            .multiplyScalar(0.5);

        const matrix = new THREE.Matrix4()
            .makeTranslation(
                midpoint.x,
                worldY + wall.height / 2 + (wall.baseOffset ?? 0),
                midpoint.z,
            )
            .multiply(new THREE.Matrix4().makeRotationY(angle))
            .multiply(new THREE.Matrix4().makeScale(wallLength, wall.height, wall.thickness));

        this._renderer.updateTransform(wall.id, matrix);
    }

    /**
     * Remove a wall from instanced rendering.
     *
     * Called by WallFragmentBuilder.removeWall() to free the instance slot.
     * No-op if the wall was never registered or has already been removed.
     *
     * @param wallId  BIM element ID of the wall to unregister.
     */
    unregister(wallId: string): void {
        this._renderer.unregister(wallId);
    }

    /**
     * Returns true if this wall is currently rendered as an instanced mesh.
     *
     * Used by WallFragmentBuilder.buildWall() to unregister a previously-instanced
     * wall that has gained an opening (and must move to the standard mesh path).
     *
     * @param wallId  BIM element ID to query.
     */
    isInstanced(wallId: string): boolean {
        return this._renderer.isRegistered(wallId);
    }
}
