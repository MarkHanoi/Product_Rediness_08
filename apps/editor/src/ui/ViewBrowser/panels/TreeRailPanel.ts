/**
 * TreeRailPanel — Spatial Tree section content for the left-rail system.
 *
 * Extracted from ProjectBrowserPanel._buildTreeContent().
 *
 * Contract compliance:
 *   §05 §9   — New UI file under src/ui/
 *   §05 §6   — Zero bim-* elements; pure native HTML
 *   §01      — Read-only; no direct store mutations
 */

import type { ProjectBrowserPanelProps } from '../ProjectBrowserTypes';

export class TreeRailPanel {
    /** Phase B (S73-WIRE) — runtime threaded by parent. */
    public readonly runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null;

    constructor(private readonly _props: ProjectBrowserPanelProps, runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null = null) {
        this.runtime = runtime;}

    build(): HTMLElement {
        const container = document.createElement('div');
        container.className = 'pb-tree-container';

        const openBtn = document.createElement('button');
        openBtn.className   = 'pb-ai-btn pb-tree-open-btn';
        openBtn.type        = 'button';
        openBtn.title       = 'Open the Spatial Tree panel';
        openBtn.textContent = '⬡ Open Spatial Tree';
        openBtn.addEventListener('click', () => this._props.onToggleSpatialTree?.());
        container.appendChild(openBtn);

        const note = document.createElement('div');
        note.className   = 'pb-tree-note';
        note.textContent = 'The Spatial Tree shows all building elements grouped by level and type. Click elements to select them in the viewport.';
        container.appendChild(note);

        return container;
    }
}
