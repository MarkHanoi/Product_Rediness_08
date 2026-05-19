/**
 * @pryzm/core-app-model — WallJoinTypes
 *
 * Pure geometry types for the wall-join pipeline extracted here so that
 * @pryzm/geometry-wall (and other packages) can reference JoinData without
 * depending on the full WallJoinResolver implementation (which still lives
 * in src/ pending Sprint H).
 *
 * Sprint E P9-W10 (2026-05-10)
 */

import type * as THREE from '@pryzm/renderer-three/three';

/**
 * §STEP4 — JoinData (renamed from JoinAdjustment, Contract §05-4.1).
 *
 * Per-wall output from WallJoinResolver.resolveLevel().
 * Consumed by WallFragmentBuilder and WallInstanceBridge to apply miter
 * geometry at wall endpoints.
 *
 * baseLine   — the authoritative centre-line segment for this wall after join
 *              adjustment (start/end may be trimmed vs. the raw WallData.baseLine).
 * startMN    — miter normal at the start endpoint; null when the start is free.
 * endMN      — miter normal at the end endpoint; null when the end is free.
 */
export interface JoinData {
    baseLine: [THREE.Vector3, THREE.Vector3];
    startMN:  { nx: number; nz: number } | null;
    endMN:    { nx: number; nz: number } | null;
}
