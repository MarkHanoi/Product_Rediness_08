/**
 * GISRailPanel — Geospatial / GIS section for the right tools rail system.
 *
 * Extracted from the #gis-content accordion block in Layout.ts.
 * All complex GIS logic (Cesium init, bridge setup, GLB export + placement)
 * stays in Layout.ts as callbacks passed through ToolsPanelProps — this file
 * only builds the UI and delegates to those callbacks.
 *
 * Contents:
 *   • Activate Geospatial checkbox  → props.gisToggle(bool)
 *   • Fly To button                 → props.gisFlyTo()
 *   • Place BIM on Earth button     → props.gisPlaceBim()  (prompts handled in Layout.ts)
 *   • Gizmo Controls: Translate / Rotate → props.gisGizmoMode(0 | 1)
 *   • Reset Georeference button     → props.gisResetGeoreference()
 *
 * Contract compliance:
 *   §05 §9   — New UI file under src/ui/
 *   §05 §6   — Zero bim-* layout elements; pure native HTML
 *   §01      — No direct store mutations; all interactions via props callbacks
 *   §05 §7.6 — No independent <style> injection; styles live in AppTheme.ts
 */

import type { ToolsRailController } from '../ToolsRailController';
import type { ToolsPanelProps }      from '../ToolsPanelTypes';

export class GISRailPanel {
    /** Phase B (S73-WIRE) — runtime threaded by parent. */
    public readonly runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null;

    constructor(
        private readonly _props: ToolsPanelProps,
        _rail: ToolsRailController,
        runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null = null,
    ) {
        this.runtime = runtime;}

    build(): HTMLElement {
        const root = document.createElement('div');
        root.className = 'tpr-gis-root';

        root.appendChild(this._buildActivateRow());
        root.appendChild(this._buildDivider());
        root.appendChild(this._buildActionBtn(
            '✈',  'Fly To',
            'Fly the Cesium camera to the Cremorne Point reference location',
            () => {
                console.log('[GISRailPanel] Fly To');
                this._props.gisFlyTo();
            }
        ));
        root.appendChild(this._buildActionBtn(
            '📍', 'Place BIM on Earth',
            'Geo-reference and place the current BIM model at a lat/lon/alt coordinate',
            () => {
                console.log('[GISRailPanel] Place BIM on Earth');
                this._props.gisPlaceBim();
            }
        ));

        // A.8.a/A.8.c — Site authoring: draw the plot boundary + generate from it.
        // The geocode address-search box mounts as a floating overlay over the
        // Cesium canvas when GIS activates (GISAreaLayout); these two buttons are
        // the rest of the UI flow so it's clickable end-to-end (no console).
        root.appendChild(this._buildDivider());
        root.appendChild(this._buildActionBtn(
            '✏️', 'Draw Site Boundary',
            'Draw your plot boundary on the map — click each corner, double-click or Enter to close the loop',
            () => {
                console.log('[GISRailPanel] Draw Site Boundary');
                this._props.gisStartBoundaryDraw();
            }
        ));
        root.appendChild(this._buildActionBtn(
            '🏢', 'Generate Apartment',
            'Generate an apartment layout inside the drawn site boundary',
            () => {
                console.log('[GISRailPanel] Generate Apartment from site boundary');
                void import('../../apartment-layout/apartmentFromBoundary')
                    .then(m => m.generateApartmentFromBoundary(this.runtime))
                    .catch(err => console.error('[GISRailPanel] generate-from-boundary failed:', err));
            }
        ));

        root.appendChild(this._buildGizmoSection());
        root.appendChild(this._buildResetBtn());

        return root;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Activate Geospatial checkbox
    // ─────────────────────────────────────────────────────────────────────────

    private _buildActivateRow(): HTMLElement {
        const row = document.createElement('label');
        row.className = 'tpr-gis-activate-row';
        row.title = 'Load the Cesium globe and activate GIS mode';

        const input = document.createElement('input');
        input.type      = 'checkbox';
        input.className = 'tpr-gis-activate-check';
        input.addEventListener('change', () => {
            console.log(`[GISRailPanel] Activate Geospatial → ${input.checked}`);
            this._props.gisToggle(input.checked);
        });

        const textWrap = document.createElement('div');
        textWrap.className = 'tpr-gis-activate-text';

        const label = document.createElement('span');
        label.className = 'tpr-gis-activate-label';
        label.textContent = 'Activate Geospatial';

        const desc = document.createElement('span');
        desc.className = 'tpr-gis-activate-desc';
        desc.textContent = 'Loads the Cesium globe';

        textWrap.appendChild(label);
        textWrap.appendChild(desc);
        row.appendChild(input);
        row.appendChild(textWrap);
        return row;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Gizmo controls sub-section (Translate / Rotate grid)
    // ─────────────────────────────────────────────────────────────────────────

    private _buildGizmoSection(): HTMLElement {
        const section = document.createElement('div');
        section.className = 'tpr-gis-gizmo-section';

        const header = document.createElement('div');
        header.className = 'tpr-gis-gizmo-header';
        header.textContent = 'Gizmo Controls';

        const grid = document.createElement('div');
        grid.className = 'tpr-gis-gizmo-grid';

        const gizmoBtn = (icon: string, label: string, mode: number, title: string) => {
            const btn = document.createElement('button');
            btn.type      = 'button';
            btn.className = 'tpr-gis-gizmo-btn';
            btn.title     = title;

            const iconEl = document.createElement('span');
            iconEl.className = 'tpr-gis-gizmo-icon';
            iconEl.textContent = icon;

            const labelEl = document.createElement('span');
            labelEl.className = 'tpr-gis-gizmo-label';
            labelEl.textContent = label;

            btn.appendChild(iconEl);
            btn.appendChild(labelEl);
            btn.addEventListener('click', () => {
                console.log(`[GISRailPanel] Gizmo mode → ${mode} (${label})`);
                this._props.gisGizmoMode(mode);
                // Visual feedback — mark active
                grid.querySelectorAll('.tpr-gis-gizmo-btn').forEach(b =>
                    b.classList.remove('tpr-gis-gizmo-btn--active'));
                btn.classList.add('tpr-gis-gizmo-btn--active');
            });
            return btn;
        };

        grid.appendChild(gizmoBtn('⇔', 'Translate', 0, 'Set gizmo to Translate mode (GizmoMode.TRANSLATE)'));
        grid.appendChild(gizmoBtn('↻', 'Rotate',    1, 'Set gizmo to Rotate mode (GizmoMode.ROTATE)'));

        section.appendChild(header);
        section.appendChild(grid);
        return section;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Reset Georeference (undo)
    // ─────────────────────────────────────────────────────────────────────────

    private _buildResetBtn(): HTMLElement {
        const btn = document.createElement('button');
        btn.type      = 'button';
        btn.className = 'tpr-gis-reset-btn';
        btn.title     = 'Undo the last georeference placement (commandManager.undo)';
        btn.textContent = '↺ Reset Georeference';
        btn.addEventListener('click', () => {
            console.log('[GISRailPanel] Reset Georeference');
            this._props.gisResetGeoreference();
        });
        return btn;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Shared helpers
    // ─────────────────────────────────────────────────────────────────────────

    private _buildActionBtn(
        emoji:   string,
        label:   string,
        title:   string,
        onClick: () => void,
    ): HTMLElement {
        const btn = document.createElement('button');
        btn.type      = 'button';
        btn.className = 'tpr-gis-action-btn';
        btn.title     = title;

        const iconEl = document.createElement('span');
        iconEl.className = 'tpr-gis-action-icon';
        iconEl.textContent = emoji;

        const labelEl = document.createElement('span');
        labelEl.className = 'tpr-gis-action-label';
        labelEl.textContent = label;

        btn.appendChild(iconEl);
        btn.appendChild(labelEl);
        btn.addEventListener('click', onClick);
        return btn;
    }

    private _buildDivider(): HTMLElement {
        const el = document.createElement('div');
        el.className = 'tpr-gis-divider';
        return el;
    }
}
