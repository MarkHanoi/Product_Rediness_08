/**
 * ClashDetectionPanel — Wave 6 Phase B (wave-6-b-d10)
 *
 * Clash detection configuration and results panel.  Allows users to configure
 * discipline pair clash tests, set tolerance, run detection, and browse
 * the resulting clash groups organised by severity and type.
 *
 * Architecture anchors
 * ────────────────────
 * • §01-VISION §3 P6  — No direct store writes.
 * • §02-ARCHITECTURE §3.5 — No silent fallbacks.
 * • §10-WAVE-6-CONVERGENCE §2 — activatePanel/deactivatePanel.
 */

import type { PryzmRuntime }  from '@pryzm/runtime-composer/types';
import type { PanelViewSpec } from '@pryzm/runtime-composer/types';

export const CLASH_DETECTION_PANEL_ID = 'clash-detection-panel' as const;

export type ClashType = 'hard' | 'clearance' | 'duplicate';
export type ClashSeverity = 'critical' | 'major' | 'minor';

export const CLASH_TYPES: readonly { typeId: ClashType; label: string }[] = [
    { typeId: 'hard',       label: 'Hard Clash' },
    { typeId: 'clearance',  label: 'Clearance' },
    { typeId: 'duplicate',  label: 'Duplicate' },
];

export const CLASH_SEVERITIES: readonly { severityId: ClashSeverity; label: string; color: string }[] = [
    { severityId: 'critical', label: 'Critical', color: '#ef4444' },
    { severityId: 'major',    label: 'Major',    color: '#f59e0b' },
    { severityId: 'minor',    label: 'Minor',    color: '#94a3b8' },
];

const CLASH_DETECTION_PANEL_STYLES = `
.cdp-panel {
    position: fixed; top: 56px; left: 4px;
    width: 284px; max-height: calc(100vh - 80px);
    background: var(--app-panel-bg, #ffffff); color: var(--app-text, #333);
    border: 1px solid rgba(0,0,0,0.12); border-radius: 10px;
    box-shadow: 0 4px 20px rgba(0,0,0,0.12);
    font-family: var(--app-font, 'Inter', sans-serif); font-size: 13px;
    z-index: 950; display: none; flex-direction: column; overflow: hidden;
}
.cdp-header { display: flex; align-items: center; justify-content: space-between; padding: 10px 12px; border-bottom: 1px solid rgba(0,0,0,0.08); background: var(--app-panel-header-bg, #f7f7f7); flex-shrink: 0; }
.cdp-title { font-weight: 600; font-size: 12px; letter-spacing: 0.04em; text-transform: uppercase; color: var(--app-text-secondary, #666); }
.cdp-close-btn { background: none; border: none; cursor: pointer; color: var(--app-text-secondary, #888); font-size: 14px; padding: 2px 4px; border-radius: 3px; line-height: 1; }
.cdp-close-btn:hover { background: rgba(0,0,0,0.06); }
.cdp-section { padding: 8px 12px; border-bottom: 1px solid rgba(0,0,0,0.07); flex-shrink: 0; }
.cdp-section-label { font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.06em; color: var(--app-text-tertiary, #aaa); margin-bottom: 6px; }
.cdp-row { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; }
.cdp-label { font-size: 11px; color: var(--app-text-secondary, #555); width: 80px; flex-shrink: 0; }
.cdp-input { flex: 1; padding: 4px 7px; border: 1px solid rgba(0,0,0,0.14); border-radius: 4px; font-size: 12px; font-family: inherit; background: var(--app-input-bg, #fff); color: inherit; }
.cdp-select { flex: 1; padding: 4px 7px; border: 1px solid rgba(0,0,0,0.14); border-radius: 4px; font-size: 12px; font-family: inherit; background: var(--app-input-bg, #fff); color: inherit; }
.cdp-chip-row { display: flex; flex-wrap: wrap; gap: 4px; }
.cdp-chip { display: inline-flex; align-items: center; gap: 3px; padding: 2px 8px; border: 1px solid rgba(0,0,0,0.14); border-radius: 12px; font-size: 10px; cursor: pointer; background: transparent; color: var(--app-text-secondary, #555); }
.cdp-chip:hover { background: rgba(0,0,0,0.05); }
.cdp-chip[data-active="1"] { background: var(--app-accent, #6600FF); color: #fff; border-color: var(--app-accent, #6600FF); }
.cdp-run-btn { display: block; width: calc(100% - 24px); margin: 10px 12px 0; padding: 8px; background: var(--app-accent, #6600FF); color: #fff; border: none; border-radius: 6px; font-size: 12px; font-family: inherit; font-weight: 600; cursor: pointer; }
.cdp-run-btn:hover { opacity: 0.9; }
.cdp-body { overflow-y: auto; flex: 1 1 auto; padding: 4px 0; }
.cdp-empty { padding: 24px 16px; text-align: center; font-size: 12px; color: var(--app-text-tertiary, #bbb); }
`;

export class ClashDetectionPanel {
    public readonly element: HTMLDivElement;
    public readonly runtime: PryzmRuntime | null;
    private _styleInjected = false;

    constructor(runtime: PryzmRuntime | null = null) {
        this.runtime = runtime;
        if (!runtime) {
            console.warn(
                '[ClashDetectionPanel] runtime is null — panel binding disabled. (wave-6-b-d10)',
            );
        }
        this.element = document.createElement('div');
        this.element.className = 'cdp-panel';
        this.element.setAttribute('role', 'complementary');
        this.element.setAttribute('aria-label', 'Clash detection panel');
        this._injectStyles();
        this._buildDOM();
    }

    show(): void {
        this.element.style.display = 'flex';
        if (this.runtime) {
            const spec: PanelViewSpec = { label: 'Clash Detection' };
            this.runtime.viewRegistry.activatePanel(CLASH_DETECTION_PANEL_ID, spec);
        }
    }

    hide(): void {
        this.element.style.display = 'none';
        this.runtime?.viewRegistry.deactivatePanel(CLASH_DETECTION_PANEL_ID);
    }

    private _injectStyles(): void {
        if (this._styleInjected) return;
        if (typeof document === 'undefined') return;
        const style = document.createElement('style');
        style.setAttribute('data-cdp-styles', '1');
        style.textContent = CLASH_DETECTION_PANEL_STYLES;
        document.head.appendChild(style);
        this._styleInjected = true;
    }

    private _buildDOM(): void {
        const header = document.createElement('div');
        header.className = 'cdp-header';
        const title = document.createElement('span');
        title.className = 'cdp-title';
        title.textContent = 'Clash Detection';
        header.appendChild(title);
        const closeBtn = document.createElement('button');
        closeBtn.className = 'cdp-close-btn';
        closeBtn.textContent = '✕';
        closeBtn.setAttribute('aria-label', 'Close clash detection panel');
        closeBtn.addEventListener('click', () => this.hide());
        header.appendChild(closeBtn);
        this.element.appendChild(header);

        const configSection = document.createElement('div');
        configSection.className = 'cdp-section';
        const configLabel = document.createElement('div');
        configLabel.className = 'cdp-section-label';
        configLabel.textContent = 'Configuration';
        configSection.appendChild(configLabel);

        const tolRow = document.createElement('div');
        tolRow.className = 'cdp-row';
        const tolLabel = document.createElement('span');
        tolLabel.className = 'cdp-label';
        tolLabel.textContent = 'Tolerance';
        const tolInput = document.createElement('input');
        tolInput.type = 'number';
        tolInput.className = 'cdp-input';
        tolInput.setAttribute('data-cdp-tolerance', '1');
        tolInput.placeholder = '0.01';
        tolInput.step = '0.001';
        tolRow.appendChild(tolLabel);
        tolRow.appendChild(tolInput);
        configSection.appendChild(tolRow);

        const typeRow = document.createElement('div');
        typeRow.className = 'cdp-section-label';
        typeRow.textContent = 'Clash Type';
        configSection.appendChild(typeRow);
        const typeChips = document.createElement('div');
        typeChips.className = 'cdp-chip-row';
        typeChips.setAttribute('data-cdp-type-chips', '1');
        for (const t of CLASH_TYPES) {
            const chip = document.createElement('button');
            chip.className = 'cdp-chip';
            chip.setAttribute('data-clash-type', t.typeId);
            chip.textContent = t.label;
            typeChips.appendChild(chip);
        }
        configSection.appendChild(typeChips);
        this.element.appendChild(configSection);

        const severitySection = document.createElement('div');
        severitySection.className = 'cdp-section';
        const sevLabel = document.createElement('div');
        sevLabel.className = 'cdp-section-label';
        sevLabel.textContent = 'Severity Filter';
        severitySection.appendChild(sevLabel);
        const sevChips = document.createElement('div');
        sevChips.className = 'cdp-chip-row';
        sevChips.setAttribute('data-cdp-severity-chips', '1');
        for (const s of CLASH_SEVERITIES) {
            const chip = document.createElement('button');
            chip.className = 'cdp-chip';
            chip.setAttribute('data-severity-id', s.severityId);
            chip.textContent = s.label;
            sevChips.appendChild(chip);
        }
        severitySection.appendChild(sevChips);
        this.element.appendChild(severitySection);

        const runBtn = document.createElement('button');
        runBtn.className = 'cdp-run-btn';
        runBtn.setAttribute('data-cdp-run', '1');
        runBtn.textContent = '▶ Run Clash Detection';
        this.element.appendChild(runBtn);

        const body = document.createElement('div');
        body.className = 'cdp-body';
        body.setAttribute('data-cdp-body', '1');
        const empty = document.createElement('div');
        empty.className = 'cdp-empty';
        empty.textContent = 'No clashes detected yet';
        body.appendChild(empty);
        this.element.appendChild(body);
    }
}
