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
 *   4. re-establishes the pristine datum on EVERY project switch/load
 *      (`pryzm-project-switch` + `pryzm-project-loaded`).
 *
 * §FIX-PROJECT-2ND-OPEN-ISOLATION (L-181) — project-switch isolation.
 *   The ProjectOriginStore documents `reset()` as "the canonical project-switch
 *   hook" (re-seed the datum at world origin so a Project A datum never leaks into
 *   Project B), but NOTHING ever called it and the store was absent from the
 *   `projectScopeRegistry` that ClearProjectCommand iterates. So on the SECOND
 *   project opened in one session the origin datum kept Project A's state (a
 *   hidden/moved origin stayed hidden/moved → the founder-reported "no blue origin
 *   sphere" on the 2nd project) — a C13 / Contract-45 project-isolation leak.
 *
 *   Fix (defence in depth, both idempotent):
 *     (a) register `projectOriginStore` as a project scope so ClearProjectCommand
 *         re-seeds it (clear → reset) on EVERY open — the SAME canonical mechanism
 *         the ~34 other per-project stores use (Contract 45); and
 *     (b) on `pryzm-project-switch` re-seed the store AND re-attach the marker to
 *         the live scene + re-paint, so the pristine baseline is guaranteed BEFORE
 *         Project B hydrates — independent of the clear/registry timing.
 *
 * P2: no `import * as THREE` — the THREE work lives inside `ProjectOriginMarker`
 * (renderer-three). The scene is typed via the sanctioned re-export path.
 */

import type * as THREE from '@pryzm/renderer-three/three';
import { ProjectOriginMarker } from '@pryzm/renderer-three';
import { projectOriginStore, PROJECT_ORIGIN_ID } from '@pryzm/stores';
// §FIX-PROJECT-2ND-OPEN-ISOLATION (L-181) — the canonical per-project scope
// registry ClearProjectCommand iterates (Contract 45). Editor engine (L5) may
// import core-app-model (L3/L4) — same path initScene uses for its own scope
// registrations.
import { projectScopeRegistry } from '@pryzm/core-app-model';

let _marker: ProjectOriginMarker | null = null;
/** Guards the once-only project-scope registration + switch listener wiring. */
let _isolationWired = false;

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

    // §FIX-PROJECT-2ND-OPEN-ISOLATION (L-181) — re-establish the pristine datum
    // for the project being opened, then re-attach + re-paint the marker. `reset()`
    // re-seeds ProjectOrigin at world origin with visible=true, so a hidden/moved
    // Project A datum never leaks into Project B. Re-attaching to the live scene is
    // a no-op when the scene is unchanged (attach() early-returns on the same
    // scene), so this is safe belt-and-braces for a renderer live-swap.
    const reestablishForProject = (): void => {
        try { projectOriginStore.reset(); } catch { /* store disposed — non-fatal */ }
        if (_marker) _marker.attach(scene);
        applyFromStore();
    };

    // Initial paint + live updates (position + View-Intent visibility).
    applyFromStore();
    projectOriginStore.subscribe(applyFromStore);

    // Wire the project-isolation surfaces exactly once (initProjectOrigin runs a
    // single time at engine boot, but guard anyway for HMR / repeated calls).
    if (!_isolationWired) {
        _isolationWired = true;

        // (a) Canonical scope — ClearProjectCommand.clearAll()/reseedAll() re-seed
        //     the origin datum on EVERY project open (1st and 2nd+), closing the
        //     A→B leak the same way every other per-project store does (Contract 45).
        //     clear() MUST be synchronous + idempotent + non-throwing — reset() is.
        try {
            projectScopeRegistry.register({
                scopeName: 'projectOrigin',
                clear: () => { try { projectOriginStore.reset(); } catch { /* non-fatal */ } },
                reseed: () => { try { projectOriginStore.reset(); } catch { /* non-fatal */ } },
            });
        } catch (e) {
            console.warn('[initProjectOrigin] §FIX-PROJECT-2ND-OPEN-ISOLATION scope register failed (non-fatal):', e);
        }

        // (b) Switch-time re-establishment — fires BEFORE Project B hydrates so the
        //     pristine, visible datum is guaranteed at the moment of the switch,
        //     independent of the clear/registry ordering.
        try {
            window.runtime?.events?.on('pryzm-project-switch', () => {
                reestablishForProject();
            });
        } catch {
            /* events bus not ready — the store subscription + scope clear still cover it */
        }
    }

    // On project switch the store re-seeds at world origin; keep the marker in sync
    // once the load settles too (idempotent with the switch-time re-establishment).
    try {
        window.runtime?.events?.on('pryzm-project-loaded', () => {
            applyFromStore();
        });
    } catch {
        /* events bus not ready — the store subscription still keeps the marker live */
    }

    console.log('[initProjectOrigin] §FEAT-PROJECT-ORIGIN blue-sphere datum marker attached (always-on); §FIX-PROJECT-2ND-OPEN-ISOLATION project-switch reset wired.');
    return _marker;
}
