/**
 * VisualRailPanel — Visual settings section for the right tools rail system.
 *
 * Extracted from the inline visibility/visual section in Layout.ts.
 * Controls shadows, visual style (Draft/Realistic/Textures), BIM element
 * visibility (levels, grids, annotations), and presentation render mode.
 *
 * All controls are pure native HTML — no bim-checkbox / bim-dropdown dependencies.
 * Visual Style is presented as a segmented button group for one-click switching.
 * Checkboxes use <label><input type="checkbox"> with the tpr-vis-check pattern.
 *
 * Contract compliance:
 *   §05 §9   — New UI file under src/ui/
 *   §05 §6   — Zero bim-* layout elements; pure native HTML
 *   §01      — No direct store mutations; all changes via props callbacks or window APIs
 *   §05 §7.6 — No independent <style> injection
 */

import { VisualStyle } from '@pryzm/core-app-model/material-library';
import type { ToolsRailController } from '../ToolsRailController';
import type { ToolsPanelProps } from '../ToolsPanelTypes';
import * as PryzmIcons from '../../icons/PryzmIcons';

export class VisualRailPanel {
    private _activeStyle: VisualStyle = VisualStyle.CONSISTENT_COLORS;

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
        root.className = 'tpr-vis-root';

        root.appendChild(this._buildShadowBtn());
        root.appendChild(this._buildDivider('Visual Style'));
        root.appendChild(this._buildStyleSegment());
        root.appendChild(this._buildDivider('Visibility'));
        root.appendChild(this._buildCheckRow('Show Levels',   false, (v) => this._props.toggleBimVisibility('levels', v)));
        root.appendChild(this._buildCheckRow('Show Grids',    false, (v) => this._props.toggleBimVisibility('grids',  v)));
        root.appendChild(this._buildCheckRow('Annotations',   true,  (v) => this._toggleAnnotations(v)));
        root.appendChild(this._buildDivider('Render Mode'));
        root.appendChild(this._buildRenderModeSelect());

        return root;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Shadow toggle button
    // ─────────────────────────────────────────────────────────────────────────

    private _buildShadowBtn(): HTMLElement {
        const btn = document.createElement('button');
        btn.className = 'tpr-vis-action-btn';
        btn.type = 'button';

        const icon = PryzmIcons.iconEl('solar:sun-bold', 'tpr-vis-action-icon', 16);

        const label = document.createElement('span');
        label.textContent = 'Toggle Shadows';

        btn.appendChild(icon);
        btn.appendChild(label);
        btn.addEventListener('click', () => {
            console.log('[VisualRailPanel] Toggle shadows');
            this._props.toggleShadows();
        });

        return btn;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Visual style — segmented button group
    // ─────────────────────────────────────────────────────────────────────────

    private _buildStyleSegment(): HTMLElement {
        const styles: Array<{ label: string; value: VisualStyle }> = [
            { label: 'Draft',     value: VisualStyle.CONSISTENT_COLORS },
            { label: 'Realistic', value: VisualStyle.REALISTIC },
            { label: 'Textures',  value: VisualStyle.TEXTURES },
        ];

        const group = document.createElement('div');
        group.className = 'tpr-vis-segment';

        const btns: HTMLButtonElement[] = [];

        for (const style of styles) {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.textContent = style.label;
            btn.className = 'tpr-vis-seg-btn' +
                (style.value === this._activeStyle ? ' tpr-vis-seg-btn--active' : '');

            btn.addEventListener('click', () => {
                this._activeStyle = style.value;
                btns.forEach((b, i) => {
                    b.classList.toggle('tpr-vis-seg-btn--active', styles[i].value === style.value);
                });
                console.log(`[VisualRailPanel] Visual style → ${style.value}`);
                this._props.applyVisualStyle(style.value);
            });

            btns.push(btn);
            group.appendChild(btn);
        }

        return group;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Render mode select
    // ─────────────────────────────────────────────────────────────────────────

    private _buildRenderModeSelect(): HTMLElement {
        const wrapper = document.createElement('div');
        wrapper.className = 'tpr-vis-select-wrap';

        const select = document.createElement('select');
        select.className = 'tpr-vis-select';
        select.setAttribute('aria-label', 'Render mode');

        const modes: Array<{ label: string; value: string }> = [
            { label: 'Technical', value: 'TECHNICAL' },
            { label: 'Graphic',   value: 'GRAPHIC'   },
        ];

        for (const mode of modes) {
            const opt = document.createElement('option');
            opt.value = mode.value;
            opt.textContent = mode.label;
            select.appendChild(opt);
        }

        select.addEventListener('change', () => {
            const engine = window.presentationEngine; // TODO(D.4): legacy presentationEngine — replace with runtime.scene.presentation engine
            if (engine?.setMode) {
                console.log(`[VisualRailPanel] Render mode → ${select.value}`);
                engine.setMode(select.value);
            }
        });

        wrapper.appendChild(select);
        return wrapper;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Shared helpers
    // ─────────────────────────────────────────────────────────────────────────

    private _buildDivider(label: string): HTMLElement {
        const el = document.createElement('div');
        el.className = 'tpr-vis-divider';
        el.textContent = label;
        return el;
    }

    private _buildCheckRow(
        label:    string,
        checked:  boolean,
        onChange: (value: boolean) => void,
    ): HTMLElement {
        const row = document.createElement('label');
        row.className = 'tpr-vis-check-row';

        const input = document.createElement('input');
        input.type    = 'checkbox';
        input.checked = checked;
        input.className = 'tpr-vis-check-input';
        input.addEventListener('change', () => onChange(input.checked));

        const text = document.createElement('span');
        text.className = 'tpr-vis-check-label';
        text.textContent = label;

        row.appendChild(input);
        row.appendChild(text);
        return row;
    }

    private _toggleAnnotations(visible: boolean): void {
        const dimManager = window.dimensionManager; // TODO(D.4): legacy dimensionManager — replace with runtime.scene.dimension manager
        if (dimManager) {
            console.log(`[VisualRailPanel] Annotations visibility → ${visible}`);
            dimManager.setVisibility(visible);
        }
    }
}
