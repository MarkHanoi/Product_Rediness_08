/**
 * §FIX-LOAD-TRAVERSE-BATCH (P2) — per-add geometry-pass gate policy.
 *
 * The `initScene` per-`bim-*-added` handler runs two full `scene.traverse()`
 * passes (PBR mesh collection + tier mesh-count) for every geometry-add event.
 * During a heavy project load, thousands of add-events fire OUTSIDE any
 * `batchCoordinator` batch (`ImportProjectCommand` drains under the SEPARATE
 * `storeEventBus` batch), so the pre-existing `batchCoordinator.isBatching`
 * guard does NOT engage and each add re-walks a growing scene → O(n²).
 *
 * This module isolates the *decision* — "should the per-add pass be deferred?" —
 * from the giant `initScene` closure so it is unit-testable in isolation. The
 * consolidated tier/PBR pass runs exactly once after load via the
 * `pryzm-project-loaded` event (see initScene). Pure module: no THREE, no DOM,
 * no I/O; reads only a runtime flag. No P8 span required.
 */

/**
 * True while `ProjectLoader` is replaying a persisted snapshot. ProjectLoader
 * sets `globalThis.__pryzmProjectLoadActive` for the whole load window and
 * clears it in its `finally` block BEFORE the `pryzm-project-loaded` event
 * fires, so the consolidated post-load pass is never itself skipped.
 */
export function isProjectLoadActive(): boolean {
    return (globalThis as { __pryzmProjectLoadActive?: boolean }).__pryzmProjectLoadActive === true;
}

/**
 * Whether the per-add tier/PBR pass should be SKIPPED (deferred to a
 * consolidated pass). Skipped during a `batchCoordinator` batch (the pre-existing
 * P1.3 guard) OR during a project load (§FIX-LOAD-TRAVERSE-BATCH). Otherwise the
 * interactive path runs the per-add pass exactly as before.
 *
 * @param isBatching current `batchCoordinator.isBatching` value.
 */
export function shouldDeferPerAddGeometryPass(isBatching: boolean): boolean {
    return isBatching || isProjectLoadActive();
}
