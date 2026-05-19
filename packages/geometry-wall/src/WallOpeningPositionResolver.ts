/**
 * WallOpeningPositionResolver.ts
 *
 * CONTRACT §06-WALL-INTEGRATION-CONTRACT §8.6
 * ────────────────────────────────────────────────────────────────────────────
 * Pure utility for computing the world-space position and orientation of a
 * hosted door or window opening when its parent wall's baseLine changes.
 *
 * BACKGROUND
 * When `UpdateWallBaselineCommand` executes, the wall's baseLine changes and
 * all hosted openings must follow.  The `EngineBootstrap` PLAN-07 subscriber
 * handles the rebuild by calling `doorBuilder.rebuildForWall()` and
 * `windowBuilder.rebuildForWall()`, which internally call `positionGroup()`
 * using the updated baseLine from the store.
 *
 * This module provides the underlying position formula as a standalone, pure,
 * testable function so that:
 *   (a) the formula is specified once and reused by both builders, and
 *   (b) command-layer code can compute world positions before a store update
 *       if needed (e.g. for future explicit cascade via `wallStore.updateDoor`).
 *
 * FORMULA
 *   worldCenter = baseLine[0]  +  normalize(baseLine[1] − baseLine[0]) × offset
 *   Y           = levelElevation + sillHeight + height / 2
 *   wallAngle   = atan2(dir.z, dir.x)    (rotation about Y-axis)
 *
 * This exactly matches the computation in `DoorBuilder.positionGroup()` and
 * `WindowBuilder.positionGroup()`.
 *
 * LAYER RULES
 *   - No store access.  No scene access.  No DOM events.  Pure computation.
 *   - Consumed by EngineBootstrap (PLAN-07 subscriber) via builder rebuilds.
 *   - May be consumed directly by `UpdateWallBaselineCommand` if an explicit
 *     cascade is ever required without waiting for the RAF-batched flush.
 *   - No imports from WallStore, WallFragmentBuilder, or any command/service.
 */

import * as THREE from '@pryzm/renderer-three/three';

/** Minimal opening parameters needed to compute world position. */
export interface OpeningPositionInput {
    /** Distance from baseLine[0] to the CENTRE of the opening (metres). */
    offset:      number;
    /** Total opening height (metres). */
    height:      number;
    /** Distance from the level floor to the bottom of the opening (metres). */
    sillHeight:  number;
}

/** Result of the world-position computation. */
export interface OpeningPositionResult {
    /** World-space centre point of the opening. */
    worldCenter: THREE.Vector3;
    /** Wall azimuth — rotation angle (radians) around the Y-axis. */
    wallAngle:   number;
    /** Unit direction vector along the wall (XZ-plane, Y=0). */
    wallDir:     THREE.Vector3;
}

/**
 * Compute the world-space centre position and wall-facing angle of a hosted
 * opening after its parent wall's baseLine has been updated.
 *
 * All inputs are expected in world space (Three.js Y-up, metres).
 *
 * @param baseLine        Updated `[start, end]` pair of the host wall.
 * @param opening         Opening position parameters (offset, height, sillHeight).
 * @param levelElevation  World-space Y coordinate of the floor level (metres).
 * @returns               World centre of the opening and the wall's azimuth angle.
 */
export function computeOpeningWorldPos(
    baseLine:        [THREE.Vector3 | { x: number; y?: number; z: number },
                      THREE.Vector3 | { x: number; y?: number; z: number }],
    opening:         OpeningPositionInput,
    levelElevation:  number,
): OpeningPositionResult {
    const start = new THREE.Vector3(baseLine[0].x, baseLine[0].y ?? 0, baseLine[0].z);
    const end   = new THREE.Vector3(baseLine[1].x, baseLine[1].y ?? 0, baseLine[1].z);

    const wallDir  = new THREE.Vector3().subVectors(end, start).normalize();
    const wallAngle = Math.atan2(wallDir.z, wallDir.x);

    const worldCenter = start.clone()
        .addScaledVector(wallDir, opening.offset)
        .setY(levelElevation + opening.sillHeight + opening.height / 2);

    return { worldCenter, wallAngle, wallDir };
}
