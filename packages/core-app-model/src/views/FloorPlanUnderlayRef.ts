import * as THREE from '@pryzm/renderer-three/three';
import { projectScopeRegistry } from '../persistence/ProjectScopeRegistry';

export interface UnderlayRenderRef {
    blobUrl: string;
    mesh: THREE.Mesh;
    planWidthMeters: number;
    planHeightMeters: number;
    /** Whether the underlay is currently visible (tracks ImportManager toggle). */
    visible: boolean;
}

export const floorPlanUnderlayRef: { current: UnderlayRenderRef | null } = { current: null };

/**
 * Contract 45 / 46 — Project Isolation Registry.
 *
 * The PDF / JPG / PNG floor-plan underlay is held by three coupled pieces of state:
 *   1. `floorPlanUnderlayRef.current`        — in-memory render ref (mesh, blobUrl, sizes).
 *   2. `window.floorPlanUnderlayTool` — active tool singleton with the THREE mesh.
 *   3. `localStorage['pryzm.floorPlanUnderlay.v2.<projectId>']` — per-project persistence
 *      record. Each project owns its own key so leaving Project A does NOT delete A's
 *      record — when the user comes back to A, the underlay restores automatically.
 *
 * On project switch we tear down (1) and (2) so Project A's mesh / tool can't bleed
 * into Project B. We deliberately do NOT touch (3) — the persistence layer is
 * project-scoped and the outgoing project's record must survive for next visit.
 * UnderlayPersistence's `pryzm-project-switch` listener also nulls its own
 * `_currentProjectId`, so any save that fires during teardown is suspended.
 *
 * Removal flow (preferred path): call `__pryzmRemoveUnderlayInternal({silent:true})`
 * — installed by FloorPlanImportPanel — which disposes the tool, hides the import-panel
 * UI, and dispatches `pryzm-floor-plan-underlay-removed`. With the project switch
 * already having nulled UnderlayPersistence's current project, the persistence-clear
 * listener no-ops, so the outgoing project's localStorage record is preserved.
 *
 * Fallback path: if the remover is not installed yet (e.g. Import Panel never opened
 * this session), dispose the tool directly. Same persistence guarantees apply.
 */
projectScopeRegistry.register({
    scopeName: 'floorPlanUnderlay',
    clear: () => {
        try {
            const remover = window.__pryzmRemoveUnderlayInternal as
                | ((opts: { silent: boolean }) => void)
                | undefined;
            if (typeof remover === 'function') {
                // silent=true so the user doesn't see "Underlay removed — select a
                // new file" status on a project switch they didn't trigger directly.
                remover({ silent: true });
            } else {
                const tool = window.floorPlanUnderlayTool;
                try { tool?.dispose?.(); } catch { /* ignore */ }
                window.floorPlanUnderlayTool = null;
            }
        } catch (err) {
            console.warn('[floorPlanUnderlay scope] clear failed:', err);
        }
        // Belt-and-braces: ensure the in-memory ref + window singleton are gone
        // even if the remover or its dispose path silently no-ops. We do NOT
        // touch localStorage here — per-project keys mean each project owns
        // its own record and we want it back next visit.
        floorPlanUnderlayRef.current = null;
        if (window.floorPlanUnderlayTool) {
            window.floorPlanUnderlayTool = null;
        }
    },
});
