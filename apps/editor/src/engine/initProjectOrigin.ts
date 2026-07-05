/**
 * §FEAT-PROJECT-ORIGIN (L-109) — boot wiring for the Project Origin / Base Point.
 *
 * Ties the three L-109 pieces together (per docs/04-reference V1 plan L-109):
 *   - L3 `projectOriginStore` singleton (the shared-coordinate datum, C19/ADR-0115)
 *   - `ProjectOriginMarker` (renderer-three blue sphere, P2)
 *   - the View-Intent panel (which reads `window.projectOriginStore.getAll()` and
 *     toggles the marker by `userData.id`, P7)
 *
 * The marker is ALWAYS present (a project singleton, auto-created at world origin,
 * never user-drawn — C11). This module:
 *   1. constructs the marker at the store's datum + attaches it to the scene,
 *   2. exposes `window.projectOriginStore` for the View-Intent panel,
 *   3. subscribes marker ← store (position + visibility), so the
 *      `projectOrigin.setPosition` / `projectOrigin.setVisible` commands (P6) and
 *      the panel toggle both flow to the sphere,
 *   4. re-seeds the datum on project switch (`pryzm-project-loaded`).
 *
 * P2: no `import * as THREE` — the THREE work lives inside `ProjectOriginMarker`
 * (renderer-three). The scene is typed via the sanctioned re-export path.
 */

import type * as THREE from '@pryzm/renderer-three/three';
import { ProjectOriginMarker } from '@pryzm/renderer-three';
import { projectOriginStore, PROJECT_ORIGIN_ID } from '@pryzm/stores';

let _marker: ProjectOriginMarker | null = null;

/**
 * Construct + attach the always-on blue-sphere project-origin marker and wire it
 * to the singleton store. Idempotent — a second call re-attaches to the given
 * scene (e.g. after a renderer live-swap). Returns the marker for diagnostics.
 */
export function initProjectOrigin(scene: THREE.Scene): ProjectOriginMarker {
    // Expose the store for the View-Intent panel (mirrors window.wallStore etc.).
    window.projectOriginStore = projectOriginStore;

    if (!_marker) {
        _marker = new ProjectOriginMarker({ id: PROJECT_ORIGIN_ID });
    }
    _marker.attach(scene);

    const applyFromStore = (): void => {
        if (!_marker) return;
        const o = projectOriginStore.getOrigin();
        _marker.setPosition(o.position.x, o.position.y, o.position.z);
        _marker.setEnabled(o.visible);
    };

    // Initial paint + live updates (position + View-Intent visibility).
    applyFromStore();
    projectOriginStore.subscribe(applyFromStore);

    // On project switch the store re-seeds at world origin; keep the marker in sync.
    try {
        window.runtime?.events?.on('pryzm-project-loaded', () => {
            applyFromStore();
        });
    } catch {
        /* events bus not ready — the store subscription still keeps the marker live */
    }

    console.log('[initProjectOrigin] §FEAT-PROJECT-ORIGIN blue-sphere datum marker attached (always-on).');
    return _marker;
}
