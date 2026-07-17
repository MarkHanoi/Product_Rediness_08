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

/**
 * §L-378 — Positions further than this from the world origin (metres) are
 * ECEF / globe-scale, not BIM-editor-scale. The Cesium / Forma 3D-site view
 * drives the SHARED OBC THREE camera to ECEF coordinates (Earth radius ≈ 6.37M
 * units; observed return poses sit ~12.5M out); a local BIM scene never exceeds
 * a few km. 1,000 km is a safe, unambiguous ceiling.
 *
 * Used to reject globe-scale poses on BOTH save (stop the stale '3D' pose being
 * persisted while the globe camera is active) and restore (never replay a
 * contaminated state against the local BIM scene — the fallback restore path
 * when the MultiViewCameraManager perspective slot misses).
 */
const GLOBE_SCALE_LIMIT_M = 1_000_000;

/** True when (x,y,z) is an ECEF / globe-scale position — see GLOBE_SCALE_LIMIT_M. */
function isGlobeScalePosition(x: number, y: number, z: number): boolean {
    return Math.abs(x) > GLOBE_SCALE_LIMIT_M
        || Math.abs(y) > GLOBE_SCALE_LIMIT_M
        || Math.abs(z) > GLOBE_SCALE_LIMIT_M;
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

        // §L-378 globe-scale guard: while the Cesium / Forma 3D-site view is active
        // the shared OBC THREE camera sits at ECEF coordinates. Saving that under the
        // '3D' key would make a later restore('3D') replay the globe pose against the
        // local BIM scene. Skip the save so the last valid BIM state is preserved.
        if (isGlobeScalePosition(pos.x, pos.y, pos.z)) {
            console.warn(
                `[ViewCameraStateStore] save("${viewKey}") — position is globe/ECEF-scale ` +
                `(${pos.x.toFixed(0)}, ${pos.y.toFixed(0)}, ${pos.z.toFixed(0)}); skipping save (L-378) ` +
                `to preserve last valid BIM camera state`,
            );
            return;
        }

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

        // §L-378 globe-scale guard: never replay a contaminated ECEF / globe-scale
        // state against the local BIM scene. Drop it and report a MISS so the caller
        // (_activate3DView) falls through to scene-bounds default framing.
        if (isGlobeScalePosition(px, py, pz)) {
            console.warn(
                `[ViewCameraStateStore] restore("${viewKey}") — stored position is globe/ECEF-scale ` +
                `(${px.toFixed(0)}, ${py.toFixed(0)}, ${pz.toFixed(0)}); dropping state and reporting ` +
                `MISS so default framing runs (L-378)`,
            );
            this._states.delete(viewKey);
            return false;
        }

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
