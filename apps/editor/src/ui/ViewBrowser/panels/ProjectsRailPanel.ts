/**
 * ProjectsRailPanel — Projects section content for the left-rail system.
 *
 * Extracted from ProjectBrowserPanel._buildProjectsContent() into its own
 * modular file as required by the rail panel architecture.
 *
 * Phase B (S73-WIRE) — adapted to construct the migrated
 * `ExistingProjectsPanel`, which now extends `@pryzm/ui-base/Panel`
 * with the `(host, runtime, opts)` constructor signature.  The
 * `currentProjectId` is read from `runtime.projectContext.projectId`
 * — the canonical source — instead of the legacy
 * `window._currentProjectId` window-as-any cast.
 *
 * Contract compliance:
 *   §05 §9   — New UI file under src/ui/
 *   §05 §6   — Zero bim-* elements; pure native HTML
 *   §01      — Read-only; no direct store mutations
 */

import { ExistingProjectsPanel } from '../ExistingProjectsPanel';
import type { PryzmRuntime } from '@pryzm/runtime-composer/types';

export class ProjectsRailPanel {
    /** Phase B (S73-WIRE) — runtime threaded by parent. */
    public readonly runtime: PryzmRuntime | null;

    constructor(runtime: PryzmRuntime | null = null) {
        this.runtime = runtime;
    }

    /** Mounts a new `ExistingProjectsPanel` into a freshly-created host
     *  div and returns the host so the rail-panel container can append
     *  it.  When the runtime is unavailable (very early boot, or a
     *  stub-host call site) returns an inert placeholder. */
    build(): HTMLElement {
        if (this.runtime === null) {
            const placeholder = document.createElement('div');
            placeholder.className = 'ep-wrap';
            placeholder.textContent = '';
            return placeholder;
        }

        const host = document.createElement('div');
        host.className = 'ep-host';

        const currentProjectId = this.runtime.projectContext.projectId;

        const panel = new ExistingProjectsPanel(host, this.runtime, {
            panelId: ExistingProjectsPanel.panelId,
            currentProjectId,
        });
        panel.mount();

        return host;
    }
}
