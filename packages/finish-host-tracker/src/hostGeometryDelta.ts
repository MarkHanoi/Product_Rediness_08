/**
 * @file packages/finish-host-tracker/src/hostGeometryDelta.ts
 *
 * §MESH110-RESTORE-IS-NOT-A-MOVE (L-11567 #3a) — did a wall's HOST GEOMETRY
 * actually move between two store snapshots?
 *
 * THE FOUNDER'S CONSOLE, on every project open: one
 * `§FINISH-FOLLOW-LATE-ATTRIBUTION: wall "…" moved; checked N unattributed
 * floors — none is bounded by it` line PER WALL — and the same line again on
 * every door DRAG. Nothing had moved. `FinishHostDependencyTracker` subscribes
 * to the wall store's `'update'` event, and that event is emitted for EVERY
 * write to a wall record: `addOpening` during restore (once per hosted door /
 * window), the §WALL-JOIN-LOAD-DEFER write-backs (`baseLine` re-stamped with
 * the SAME values), a door drag's `updateOpening`, a paint. The tracker treated
 * each as a move and ran the C79 §5.2 follow machinery — the recorded-dependent
 * re-projection AND the late-attribution candidate scan — against a centreline
 * that had not changed.
 *
 * THE GATE IS UPSTREAM OF THE REPORT, NOT A SILENCED REPORT. C79 §5.2's five
 * states describe what must be reported when a bounding element's geometry
 * changes. When the geometry did NOT change there is no re-derivation to
 * report — the question "did this wall move?" is answered here, once, from
 * the two snapshots the §STEP7 `prevState` contract already delivers. A real
 * move (any endpoint, the thickness, or the curve control moving by more than
 * the 0.1 mm ring epsilon) still runs every arm exactly as before.
 *
 * ⛔ NO `prevState` ⇒ MOVED. A snapshot the tracker cannot compare is a move it
 * cannot rule out; the existing STALE_DERIVED_STATE report downstream owns
 * that case. This predicate never manufactures "unchanged" from an absence.
 */

import type { WallSnapshotLike } from './reprojectFinishBoundary.js';

/** 0.1 mm — the same tolerance `FinishHostDependencyTracker.ringDiffers` uses. */
const HOST_EPS_M = 1e-4;

function pointMoved(
    a: { x: number; z: number } | undefined,
    b: { x: number; z: number } | undefined,
): boolean {
    if (!a || !b) return a !== b;
    return Math.abs(a.x - b.x) > HOST_EPS_M || Math.abs(a.z - b.z) > HOST_EPS_M;
}

/**
 * True when `next`'s host geometry differs from `prev`'s: a different number
 * of baseline points, any point moved beyond 0.1 mm, a thickness change, or a
 * curve control point moved / added / removed. `prev === undefined` is TRUE.
 */
export function wallHostGeometryMoved(
    prev: WallSnapshotLike | undefined,
    next: WallSnapshotLike,
): boolean {
    if (!prev) return true;

    const a = prev.baseLine;
    const b = next.baseLine;
    if (!a || !b || a.length !== b.length) return true;
    for (let i = 0; i < a.length; i++) {
        if (pointMoved(a[i], b[i])) return true;
    }

    const ta = prev.thickness;
    const tb = next.thickness;
    if ((ta === undefined) !== (tb === undefined)) return true;
    if (ta !== undefined && tb !== undefined && Math.abs(ta - tb) > HOST_EPS_M) return true;

    const ca = prev.curve?.control;
    const cb = next.curve?.control;
    if ((ca === undefined) !== (cb === undefined)) return true;
    if (ca && cb && pointMoved(ca, cb)) return true;

    return false;
}
