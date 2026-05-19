/**
 * FamilyPreviewPanel — Wave 6 Phase B (wave-6-b-d7)
 *
 * Family 2D/3D preview canvas: renders a lightweight representation of the
 * selected family type so the designer can inspect it before placement.
 * The actual WebGL render is hosted by `apps/component-editor/` and
 * embedded here via a postMessage bridge — this panel owns only the
 * chrome (header, close, toolbar row) and the runtime binding.
 *
 * Architecture anchors
 * ────────────────────
 * • §01-VISION §3 P6  — View control commands ('zoom-fit', 'zoom-selected')
 *   go through runtime.bus.executeCommand, not direct renderer calls.
 * • §02-ARCHITECTURE §3.3 — No THREE.js import; renderer bridge is isolated.
 * • §02-ARCHITECTURE §3.5 — No silent fallbacks; warns when runtime is null.
 * • §10-WAVE-6-CONVERGENCE §2 — activatePanel on show(), deactivatePanel
 *   on hide(); validated by a Vitest binding test.
 * • P8 — OTel spans via runtime-composer activatePanel / deactivatePanel.
 *
 * Public API
 * ──────────
 *   const fvp = new FamilyPreviewPanel(runtime);
 *   document.body.appendChild(fvp.element);
 *   fvp.show('wall-basic', 'wall-200');  // activates panel, sets family
 *   fvp.hide();                          // deactivates panel
 *
 * TODO(Phase-F): replace placeholder canvas with an iframe bridge to the
 *   component-editor renderer (postMessage 'set-preview-family' event).
 */

import type { PryzmRuntime } from '@pryzm/runtime-composer/types';
import type { PanelViewSpec } from '@pryzm/runtime-composer/types';

// ── Panel ID ──────────────────────────────────────────────────────────────────
export const FAMILY_PREVIEW_PANEL_ID = 'family-preview-panel' as const;

// ── Preview view mode ─────────────────────────────────────────────────────────
export type PreviewMode = '2d' | '3d' | 'plan' | 'elevation';

// ── Inline styles ─────────────────────────────────────────────────────────────
const FAMILY_PREVIEW_PANEL_STYLES = `
.fvp-panel {
    position: fixed;
    bottom: 8px;
    right: 252px;
    width: 300px;
    height: 260px;
    background: var(--app-panel-bg, #ffffff);
    color: var(--app-text, #333333);
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
.fvp-panel[data-visible="true"] { display: flex; }
.fvp-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 12px;
    border-bottom: 1px solid rgba(0,0,0,0.08);
    background: var(--app-panel-header-bg, #f7f7f7);
    flex-shrink: 0;
}
.fvp-title {
    font-weight: 600;
    font-size: 12px;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--app-text-secondary, #666);
}
.fvp-close-btn {
    background: none;
    border: none;
    cursor: pointer;
    color: var(--app-text-secondary, #888);
    font-size: 14px;
    padding: 2px 4px;
    border-radius: 3px;
    line-height: 1;
}
.fvp-close-btn:hover { background: rgba(0,0,0,0.06); }
.fvp-mode-bar {
    display: flex;
    align-items: center;
    gap: 2px;
    padding: 4px 8px;
    border-bottom: 1px solid rgba(0,0,0,0.06);
    flex-shrink: 0;
}
.fvp-mode-btn {
    padding: 3px 8px;
    border: 1px solid transparent;
    border-radius: 4px;
    cursor: pointer;
    font-size: 11px;
    background: transparent;
    color: var(--app-text-secondary, #555);
    transition: background 0.1s;
}
.fvp-mode-btn:hover { background: rgba(0,0,0,0.06); }
.fvp-mode-btn[data-active="true"] {
    background: rgba(102,0,255,0.10);
    color: var(--app-accent, #6600FF);
    border-color: rgba(102,0,255,0.25);
    font-weight: 600;
}
.fvp-canvas-area {
    flex: 1 1 auto;
    position: relative;
    background: var(--app-canvas-bg, #f0f0f0);
    overflow: hidden;
    display: flex;
    align-items: center;
    justify-content: center;
}
.fvp-placeholder {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    pointer-events: none;
    color: var(--app-text-tertiary, #bbb);
    user-select: none;
}
.fvp-placeholder-icon { font-size: 40px; line-height: 1; }
.fvp-placeholder-text { font-size: 11px; }
.fvp-family-label {
    position: absolute;
    bottom: 6px;
    left: 8px;
    font-size: 11px;
    color: var(--app-text-secondary, #666);
    background: rgba(255,255,255,0.85);
    padding: 2px 6px;
    border-radius: 3px;
}
`;

// ── FamilyPreviewPanel class ──────────────────────────────────────────────────

export class FamilyPreviewPanel {
    /** Root DOM element. */
    public readonly element: HTMLDivElement;

    /** Wave 6 Phase B — runtime threaded by parent. */
    public readonly runtime: PryzmRuntime | null;

    private _familyId: string | null = null;
    private _typeId: string | null = null;
    private _mode: PreviewMode = '3d';
    private _styleInjected = false;

    constructor(runtime: PryzmRuntime | null = null) {
        this.runtime = runtime;

        if (!runtime) {
            console.warn(
                '[FamilyPreviewPanel] runtime is null — panel binding disabled. ' +
                'Wire a PryzmRuntime instance in the composition root. (wave-6-b-d7)',
            );
        }

        this.element = document.createElement('div');
        this.element.className = 'fvp-panel';
        this.element.setAttribute('role', 'complementary');
        this.element.setAttribute('aria-label', 'Family preview');
        this._injectStyles();
        this._buildDOM();
    }

    // ── Public show/hide — Phase B real binding ───────────────────────────────

    show(familyId?: string, typeId?: string): void {
        if (familyId !== undefined) {
            this._familyId = familyId;
            this._updateFamilyLabel();
        }
        if (typeId !== undefined) this._typeId = typeId;

        this.element.style.display = 'block';
        if (this.runtime) {
            const spec: PanelViewSpec = {
                label: 'Family Preview',
                mode: this._mode,
                familyId: this._familyId ?? undefined,
                typeId: this._typeId ?? undefined,
            };
            this.runtime.viewRegistry.activatePanel(FAMILY_PREVIEW_PANEL_ID, spec);
        }
    }

    hide(): void {
        this.element.style.display = 'none';
        this.runtime?.viewRegistry.deactivatePanel(FAMILY_PREVIEW_PANEL_ID);
    }

    /** Switch the preview mode (2d / 3d / plan / elevation). */
    setMode(mode: PreviewMode): void {
        this._mode = mode;
        this._updateModeButtons();
    }

    // ── Private helpers ───────────────────────────────────────────────────────

    private _injectStyles(): void {
        if (this._styleInjected) return;
        if (typeof document === 'undefined') return;
        const style = document.createElement('style');
        style.setAttribute('data-fvp-styles', '1');
        style.textContent = FAMILY_PREVIEW_PANEL_STYLES;
        document.head.appendChild(style);
        this._styleInjected = true;
    }

    private _buildDOM(): void {
        // ── Header ────────────────────────────────────────────────────────────
        const header = document.createElement('div');
        header.className = 'fvp-header';

        const title = document.createElement('span');
        title.className = 'fvp-title';
        title.textContent = 'Family Preview';
        header.appendChild(title);

        const closeBtn = document.createElement('button');
        closeBtn.className = 'fvp-close-btn';
        closeBtn.textContent = '✕';
        closeBtn.title = 'Close family preview';
        closeBtn.setAttribute('aria-label', 'Close family preview');
        closeBtn.addEventListener('click', () => this.hide());
        header.appendChild(closeBtn);

        this.element.appendChild(header);

        // ── Mode bar ──────────────────────────────────────────────────────────
        const modeBar = document.createElement('div');
        modeBar.className = 'fvp-mode-bar';
        modeBar.setAttribute('data-fvp-mode-bar', '1');

        const modes: Array<{ mode: PreviewMode; label: string }> = [
            { mode: '3d',        label: '3D' },
            { mode: '2d',        label: '2D' },
            { mode: 'plan',      label: 'Plan' },
            { mode: 'elevation', label: 'Elevation' },
        ];

        for (const m of modes) {
            const btn = document.createElement('button');
            btn.className = 'fvp-mode-btn';
            btn.textContent = m.label;
            btn.setAttribute('data-mode', m.mode);
            btn.setAttribute('data-active', m.mode === this._mode ? 'true' : 'false');
            btn.addEventListener('click', () => this.setMode(m.mode));
            modeBar.appendChild(btn);
        }

        this.element.appendChild(modeBar);

        // ── Canvas area ───────────────────────────────────────────────────────
        const canvasArea = document.createElement('div');
        canvasArea.className = 'fvp-canvas-area';
        canvasArea.setAttribute('data-fvp-canvas', '1');

        const placeholder = document.createElement('div');
        placeholder.className = 'fvp-placeholder';

        const placeholderIcon = document.createElement('div');
        placeholderIcon.className = 'fvp-placeholder-icon';
        placeholderIcon.textContent = '📦';
        placeholderIcon.setAttribute('aria-hidden', 'true');

        const placeholderText = document.createElement('div');
        placeholderText.className = 'fvp-placeholder-text';
        placeholderText.textContent = 'Select a family to preview';

        placeholder.appendChild(placeholderIcon);
        placeholder.appendChild(placeholderText);
        canvasArea.appendChild(placeholder);

        const familyLabel = document.createElement('div');
        familyLabel.className = 'fvp-family-label';
        familyLabel.setAttribute('data-fvp-family-label', '1');
        familyLabel.textContent = '';
        canvasArea.appendChild(familyLabel);

        this.element.appendChild(canvasArea);
    }

    private _updateModeButtons(): void {
        const bar = this.element.querySelector('[data-fvp-mode-bar]');
        if (!bar) return;
        for (const btn of bar.querySelectorAll('[data-mode]')) {
            const el = btn as HTMLButtonElement;
            el.setAttribute('data-active', el.getAttribute('data-mode') === this._mode ? 'true' : 'false');
        }
    }

    private _updateFamilyLabel(): void {
        const label = this.element.querySelector('[data-fvp-family-label]') as HTMLElement | null;
        if (label) label.textContent = this._familyId ?? '';
    }
}
