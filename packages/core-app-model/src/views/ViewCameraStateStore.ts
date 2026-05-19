import * as OBC from '@thatopen/components';

/**
 * @file src/core/views/ViewCameraStateStore.ts
 *
 * ViewCameraStateStore — per-view camera state persistence.
 *
 * Saves and restores camera position, target, and zoom for each view so that
 * re-entering a previously visited view restores the user's last navigation
 * state instead of recomputing the default framing from scene bounds.
 *
 * Phase 2 Performance — Task 2.3.
 *
 * ## Key reference in activate()
 * - Save: keyed by the DEPARTING view id (`_currentViewDefinitionId ?? viewMode`)
 *          called from ViewController.deactivate() via saveForKey().
 * - Restore: keyed by the ARRIVING view id (`_activeDefinitionId ?? viewMode`)
 *             called from each _activate*View() helper; returns false when
 *             no saved state exists, allowing fall-through to default framing.
 *
 * Contract:
 *   01-BIM-ENGINE-CORE §5 — No side effects beyond in-memory Map.
 *   02-BIM-SPATIAL-PROJECTION §2 — No scene traversal.
 *   03-BIM-SEMANTIC-MODEL §3 — No store mutation.
 */

interface CameraState {
    position: [number, number, number];
    target:   [number, number, number];
    zoom:     number;
}

export class ViewCameraStateStore {
    private _states = new Map<string, CameraState>();

    /**
     * Snapshot the camera's current position, look-at target, and zoom,
     * associating the state with `viewKey`.
     *
     * @param viewKey  Unique key for this view (ViewDefinition id or mode string).
     * @param camera   The OBC OrthoPerspectiveCamera to read from.
     */
    save(viewKey: string, camera: OBC.OrthoPerspectiveCamera): void {
        if (!viewKey) return;

        const pos = camera.three.position;

        const controls = camera.controls as any;
        const tx: number = controls._target?.x ?? controls.target?.x ?? 0;
        const ty: number = controls._target?.y ?? controls.target?.y ?? 0;
        const tz: number = controls._target?.z ?? controls.target?.z ?? 0;

        this._states.set(viewKey, {
            position: [pos.x, pos.y, pos.z],
            target:   [tx, ty, tz],
            zoom:     camera.three.zoom ?? 1,
        });
        console.log(
            `[ViewCameraStateStore] save("${viewKey}") — ` +
            `pos(${pos.x.toFixed(2)}, ${pos.y.toFixed(2)}, ${pos.z.toFixed(2)}) ` +
            `target(${tx.toFixed(2)}, ${ty.toFixed(2)}, ${tz.toFixed(2)}) ` +
            `zoom=${(camera.three.zoom ?? 1).toFixed(3)}`
        );
    }

    /**
     * Restore a previously-saved camera state for `viewKey`.
     *
     * Uses animate=false so the camera snaps immediately — the same convention
     * used throughout ViewController for view switches (see RC1-FIX comment).
     *
     * @returns true when a saved state was found and applied, false otherwise.
     */
    restore(viewKey: string, camera: OBC.OrthoPerspectiveCamera): boolean {
        if (!viewKey) return false;
        const state = this._states.get(viewKey);
        if (!state) {
            console.log(`[ViewCameraStateStore] restore("${viewKey}") — MISS (${this._states.size} states cached, keys: [${[...this._states.keys()].join(', ')}])`);
            return false;
        }

        const [px, py, pz] = state.position;
        const [tx, ty, tz] = state.target;

        camera.controls.setLookAt(px, py, pz, tx, ty, tz, false);
        console.log(
            `[ViewCameraStateStore] restore("${viewKey}") — HIT — ` +
            `pos(${px.toFixed(2)}, ${py.toFixed(2)}, ${pz.toFixed(2)}) ` +
            `target(${tx.toFixed(2)}, ${ty.toFixed(2)}, ${tz.toFixed(2)}) ` +
            `zoom=${state.zoom.toFixed(3)}`
        );
        return true;
    }

    /**
     * Returns true when a saved state exists for `viewKey`.
     * Use to decide whether to skip the default framing computation.
     */
    has(viewKey: string): boolean {
        return viewKey !== '' && this._states.has(viewKey);
    }

    /**
     * Clear all saved states (e.g., on project load).
     */
    clear(): void {
        this._states.clear();
    }
}
