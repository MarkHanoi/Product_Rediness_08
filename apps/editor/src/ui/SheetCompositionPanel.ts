/**
 * SheetCompositionPanel — Wave 6 Phase B (wave-6-b-d9)
 *
 * Sheet canvas composition: manage viewports placed on a sheet — add views,
 * set the title block family, position and resize viewports, and control
 * per-viewport display settings (scale override, crop, detail level).
 *
 * Architecture anchors
 * ────────────────────
 * • §01-VISION §3 P6  — No direct store writes; mutations dispatch typed
 *   commands via `runtime.bus.executeCommand`.
 * • §02-ARCHITECTURE §3.3 — UI layer imports only from @pryzm/* packages.
 * • §02-ARCHITECTURE §3.5 — No silent fallbacks; warns when runtime is null.
 * • §10-WAVE-6-CONVERGENCE §2 — activatePanel on show(), deactivatePanel on
 *   hide(); validated by Vitest binding test (wave-6-b-d9).
 *
 * Public API
 * ──────────
 *   const scp = new SheetCompositionPanel(runtime);
 *   document.body.appendChild(scp.element);
 *   scp.show('sheet-guid-01');
 *   scp.hide();
 */

import type { PryzmRuntime }   from '@pryzm/runtime-composer/types';
import type { PanelViewSpec }  from '@pryzm/runtime-composer/types';

// ── Panel ID ──────────────────────────────────────────────────────────────────
export const SHEET_COMPOSITION_PANEL_ID = 'sheet-composition-panel' as const;

// ── Viewport property defs ────────────────────────────────────────────────────
export interface ViewportPropertyDef {
    readonly propId:      string;
    readonly label:       string;
    readonly controlType: 'select' | 'toggle' | 'number';
    readonly icon:        string;
}

export const VIEWPORT_PROPERTIES: readonly ViewportPropertyDef[] = [
    { propId: 'scale',        label: 'Scale Override',  controlType: 'select', icon: '📐' },
    { propId: 'detail-level', label: 'Detail Level',    controlType: 'select', icon: '🔍' },
    { propId: 'crop',         label: 'Crop Region',     controlType: 'toggle', icon: '✂' },
    { propId: 'annotation',   label: 'Show Annotation', controlType: 'toggle', icon: '📝' },
    { propId: 'rotation',     label: 'Rotation (°)',    controlType: 'number', icon: '↺' },
];

// ── Title block options ───────────────────────────────────────────────────────
export const TITLE_BLOCK_OPTIONS = [
    'A0 Landscape',
    'A1 Landscape',
    'A2 Landscape',
    'A3 Landscape',
    'A4 Portrait',
    'Letter ANSI A',
    'D-size ANSI D',
] as const;

// ── Inline styles ─────────────────────────────────────────────────────────────
const SHEET_COMPOSITION_PANEL_STYLES = `
.scp-panel {
    position: fixed;
    top: 56px;
    left: 280px;
    width: 252px;
    max-height: calc(100vh - 80px);
    background: var(--app-panel-bg, #ffffff);
    color: var(--app-text, #333);
    border: 1px solid rgba(0,0,0,0.12);
    border-radius: 10px;
    box-shadow: 0 4px 20px rgba(0,0,0,0.12);
    font-family: var(--app-font, 'Inter', sans-serif);
    font-size: 13px;
    z-index: 950;
    display: none;
    flex-direction: column;
    overflow: hidden;
}
.scp-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 12px;
    border-bottom: 1px solid rgba(0,0,0,0.08);
    background: var(--app-panel-header-bg, #f7f7f7);
    flex-shrink: 0;
}
.scp-title {
    font-weight: 600;
    font-size: 12px;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--app-text-secondary, #666);
}
.scp-close-btn {
    background: none;
    border: none;
    cursor: pointer;
    color: var(--app-text-secondary, #888);
    font-size: 14px;
    padding: 2px 4px;
    border-radius: 3px;
    line-height: 1;
}
.scp-close-btn:hover { background: rgba(0,0,0,0.06); }
.scp-section {
    padding: 8px 12px;
    border-bottom: 1px solid rgba(0,0,0,0.06);
    flex-shrink: 0;
}
.scp-section-label {
    font-size: 10px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--app-text-tertiary, #aaa);
    margin-bottom: 6px;
}
.scp-select {
    width: 100%;
    padding: 5px 8px;
    border: 1px solid rgba(0,0,0,0.14);
    border-radius: 5px;
    font-size: 12px;
    font-family: inherit;
    background: var(--app-input-bg, #fff);
    color: inherit;
    cursor: pointer;
}
.scp-body {
    overflow-y: auto;
    flex: 1 1 auto;
    padding: 4px 0;
}
.scp-prop-row {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 5px 12px;
    border-bottom: 1px solid rgba(0,0,0,0.04);
}
.scp-prop-icon { font-size: 13px; width: 18px; text-align: center; flex-shrink: 0; }
.scp-prop-label { flex: 1 1 auto; font-size: 12px; }
.scp-prop-badge {
    font-size: 10px;
    padding: 1px 6px;
    background: rgba(0,0,0,0.06);
    border-radius: 4px;
    color: var(--app-text-secondary, #666);
    flex-shrink: 0;
}
`;

// ── SheetCompositionPanel class ───────────────────────────────────────────────

export class SheetCompositionPanel {
    /** Root DOM element. */
    public readonly element: HTMLDivElement;

    /** Wave 6 Phase B — runtime threaded by parent. */
    public readonly runtime: PryzmRuntime | null;

    private _sheetId: string | null = null;
    private _styleInjected = false;

    constructor(runtime: PryzmRuntime | null = null) {
        this.runtime = runtime;

        if (!runtime) {
            console.warn(
                '[SheetCompositionPanel] runtime is null — panel binding disabled. ' +
                'Wire a PryzmRuntime instance in the composition root. (wave-6-b-d9)',
            );
        }

        this.element = document.createElement('div');
        this.element.className = 'scp-panel';
        this.element.setAttribute('role', 'complementary');
        this.element.setAttribute('aria-label', 'Sheet composition');
        this._injectStyles();
        this._buildDOM();
    }

    // ── Public show/hide — Phase B real binding ───────────────────────────────

    show(sheetId?: string): void {
        if (sheetId !== undefined) this._sheetId = sheetId;
        this.element.style.display = 'block';
        if (this.runtime) {
            const spec: PanelViewSpec = {
                label:     'Sheet Composition',
                elementId: this._sheetId ?? undefined,
            };
            this.runtime.viewRegistry.activatePanel(SHEET_COMPOSITION_PANEL_ID, spec);
        }
    }

    hide(): void {
        this.element.style.display = 'none';
        this.runtime?.viewRegistry.deactivatePanel(SHEET_COMPOSITION_PANEL_ID);
    }

    // ── Private helpers ───────────────────────────────────────────────────────

    private _injectStyles(): void {
        if (this._styleInjected) return;
        if (typeof document === 'undefined') return;
        const style = document.createElement('style');
        style.setAttribute('data-scp-styles', '1');
        style.textContent = SHEET_COMPOSITION_PANEL_STYLES;
        document.head.appendChild(style);
        this._styleInjected = true;
    }

    private _buildDOM(): void {
        const header = document.createElement('div');
        header.className = 'scp-header';

        const title = document.createElement('span');
        title.className = 'scp-title';
        title.textContent = 'Composition';
        header.appendChild(title);

        const closeBtn = document.createElement('button');
        closeBtn.className = 'scp-close-btn';
        closeBtn.textContent = '✕';
        closeBtn.title = 'Close composition panel';
        closeBtn.setAttribute('aria-label', 'Close sheet composition panel');
        closeBtn.addEventListener('click', () => this.hide());
        header.appendChild(closeBtn);
        this.element.appendChild(header);

        // Title block selector
        const tbSection = document.createElement('div');
        tbSection.className = 'scp-section';
        const tbLabel = document.createElement('div');
        tbLabel.className = 'scp-section-label';
        tbLabel.textContent = 'Title Block';
        tbSection.appendChild(tbLabel);
        const tbSelect = document.createElement('select');
        tbSelect.className = 'scp-select';
        tbSelect.setAttribute('aria-label', 'Title block size');
        tbSelect.setAttribute('data-scp-titleblock', '1');
        for (const opt of TITLE_BLOCK_OPTIONS) {
            const option = document.createElement('option');
            option.value = opt.toLowerCase().replace(/\s+/g, '-');
            option.textContent = opt;
            tbSelect.appendChild(option);
        }
        tbSection.appendChild(tbSelect);
        this.element.appendChild(tbSection);

        // Viewport properties
        const body = document.createElement('div');
        body.className = 'scp-body';
        body.setAttribute('data-scp-body', '1');
        const propLabel = document.createElement('div');
        propLabel.style.cssText = 'padding:6px 12px 4px;font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:0.06em;color:#aaa';
        propLabel.textContent = 'Viewport Properties';
        body.appendChild(propLabel);

        for (const prop of VIEWPORT_PROPERTIES) {
            const row = document.createElement('div');
            row.className = 'scp-prop-row';
            row.setAttribute('data-prop-id', prop.propId);

            const icon = document.createElement('span');
            icon.className = 'scp-prop-icon';
            icon.textContent = prop.icon;
            icon.setAttribute('aria-hidden', 'true');

            const label = document.createElement('span');
            label.className = 'scp-prop-label';
            label.textContent = prop.label;

            const badge = document.createElement('span');
            badge.className = 'scp-prop-badge';
            badge.textContent = prop.controlType;

            row.appendChild(icon);
            row.appendChild(label);
            row.appendChild(badge);
            body.appendChild(row);
        }
        this.element.appendChild(body);
    }
}
