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
 *
 * §WJR-INVALID (Jun 2026 — durable degenerate-wall layer, A.WJ.MULTICLUSTER) —
 * When the resolver detects a wall it CANNOT join into a valid, finite,
 * non-degenerate baseline (a self-cluster wall whose BOTH endpoints land in one
 * junction, a diff-thickness offset that even the clean-butt fallback cannot
 * rescue, a zero/near-zero-length wall, a NaN endpoint), it marks the wall's
 * JoinData `invalid: true` with a human-readable `invalidReason`. The mesh
 * builder (WallFragmentBuilder.buildWall) reads this flag FIRST and skips the
 * geometry build by intent — hiding the wall rather than feeding a degenerate
 * baseline to the extruder / CSG / BVH. This is the primary mechanism; the
 * consumer's defensive non-finite/near-zero baseline sniff (§WJR-NAN-GUARD) is
 * retained as a belt-and-suspenders backstop. See
 * docs/03-execution/analysis/WALLJOINRESOLVER-DIFF-THICKNESS-HANG-2026-06-03.md §4.4.
 */
export interface JoinData {
    baseLine: [THREE.Vector3, THREE.Vector3];
    startMN:  { nx: number; nz: number } | null;
    endMN:    { nx: number; nz: number } | null;
    /**
     * §WJR-INVALID — true when this wall could not be validly joined and its mesh
     * MUST NOT be built. When set, `invalidReason` carries the degeneracy vector.
     */
    invalid?: boolean;
    /** Human-readable reason for `invalid` (e.g. 'self-cluster', 'zero-length'). */
    invalidReason?: string;
}
