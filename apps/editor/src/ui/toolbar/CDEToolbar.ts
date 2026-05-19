/**
 * CDEToolbar — Wave 6 Phase C (wave-6-c-d10)
 *
 * Common Data Environment integration toolbar.  11 buttons covering document
 * upload/download, check-in/out, transmittal creation, revision management.
 *
 * Architecture anchors
 * ────────────────────
 * • §01-VISION §3 P6  — Each button dispatches via runtime.bus.executeCommand.
 * • §10-WAVE-6-CONVERGENCE §3 — real binding validated by Vitest.
 */

import type { PryzmRuntime } from '@pryzm/runtime-composer/types';

export const CDE_TOOLBAR_ID = 'cde-toolbar' as const;

export interface CdeButtonDef {
    readonly commandType: string;
    readonly label:       string;
    readonly icon:        string;
    readonly title:       string;
    readonly group:       'files' | 'checkout' | 'transmittal' | 'revision';
}

export const CDE_TOOLBAR_BUTTONS: readonly CdeButtonDef[] = [
    { commandType: 'cde-upload-doc',          label: 'Upload',    icon: '⬆',  title: 'Upload document to CDE',              group: 'files'       },
    { commandType: 'cde-download-doc',         label: 'Download',  icon: '⬇',  title: 'Download document from CDE',          group: 'files'       },
    { commandType: 'cde-folder-browse',        label: 'Browse',    icon: '📂', title: 'Browse CDE folder structure',         group: 'files'       },
    { commandType: 'cde-check-out',            label: 'Check Out', icon: '🔒', title: 'Check out document for editing',      group: 'checkout'    },
    { commandType: 'cde-check-in',             label: 'Check In',  icon: '🔓', title: 'Check in edited document',            group: 'checkout'    },
    { commandType: 'cde-cancel-checkout',      label: 'Cancel',    icon: '✕',  title: 'Cancel document checkout',            group: 'checkout'    },
    { commandType: 'cde-transmittal-create',   label: 'Create',    icon: '✦',  title: 'Create new transmittal package',      group: 'transmittal' },
    { commandType: 'cde-transmittal-send',     label: 'Send',      icon: '➜',  title: 'Send transmittal to recipients',      group: 'transmittal' },
    { commandType: 'cde-revision-new',         label: 'Revision',  icon: '⊕',  title: 'Create new document revision',        group: 'revision'    },
    { commandType: 'cde-status-update',        label: 'Status',    icon: '●',  title: 'Update document workflow status',     group: 'revision'    },
    { commandType: 'cde-link-model',           label: 'Link',      icon: '🔗', title: 'Link CDE document to model element',  group: 'revision'    },
] as const;

const CDE_TOOLBAR_STYLES = `
.cdetb-toolbar { display: flex; align-items: center; gap: 2px; padding: 4px 8px; background: var(--app-toolbar-bg, #f7f7f7); border-bottom: 1px solid rgba(0,0,0,0.1); font-family: var(--app-font, 'Inter', sans-serif); font-size: 12px; height: 40px; box-sizing: border-box; user-select: none; }
.cdetb-separator { width: 1px; height: 24px; background: rgba(0,0,0,0.12); margin: 0 4px; flex-shrink: 0; }
.cdetb-btn { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 1px; padding: 3px 6px; border: 1px solid transparent; border-radius: 5px; cursor: pointer; background: transparent; color: var(--app-text, #333); font-size: 11px; min-width: 38px; transition: background 0.1s; }
.cdetb-btn:hover { background: rgba(0,0,0,0.06); border-color: rgba(0,0,0,0.12); }
.cdetb-btn:active { background: rgba(102,0,255,0.1); border-color: var(--app-accent, #6600FF); }
.cdetb-btn-icon { font-size: 14px; line-height: 1; }
.cdetb-btn-label { font-size: 9px; color: var(--app-text-secondary, #777); line-height: 1; }
`;

export class CDEToolbar {
    public readonly element: HTMLDivElement;
    public readonly runtime: PryzmRuntime | null;
    private _styleInjected = false;

    constructor(runtime: PryzmRuntime | null = null) {
        this.runtime = runtime;
        if (!runtime) {
            console.warn('[CDEToolbar] runtime is null — button commands will not be dispatched. (wave-6-c-d10)');
        }
        this.element = document.createElement('div');
        this.element.className = 'cdetb-toolbar';
        this.element.setAttribute('role', 'toolbar');
        this.element.setAttribute('aria-label', 'CDE toolbar');
        this._injectStyles();
        this._buildDOM();
    }

    private _injectStyles(): void {
        if (this._styleInjected) return;
        if (typeof document === 'undefined') return;
        const style = document.createElement('style');
        style.setAttribute('data-cdetb-styles', '1');
        style.textContent = CDE_TOOLBAR_STYLES;
        document.head.appendChild(style);
        this._styleInjected = true;
    }

    private _buildDOM(): void {
        let lastGroup: string | null = null;
        for (const def of CDE_TOOLBAR_BUTTONS) {
            if (lastGroup !== null && def.group !== lastGroup) {
                const sep = document.createElement('div');
                sep.className = 'cdetb-separator';
                sep.setAttribute('role', 'separator');
                this.element.appendChild(sep);
            }
            lastGroup = def.group;
            const btn = document.createElement('button');
            btn.className = 'cdetb-btn';
            btn.title = def.title;
            btn.setAttribute('aria-label', def.title);
            btn.setAttribute('data-command', def.commandType);
            const iconEl = document.createElement('span');
            iconEl.className = 'cdetb-btn-icon';
            iconEl.textContent = def.icon;
            iconEl.setAttribute('aria-hidden', 'true');
            const labelEl = document.createElement('span');
            labelEl.className = 'cdetb-btn-label';
            labelEl.textContent = def.label;
            btn.appendChild(iconEl);
            btn.appendChild(labelEl);
            btn.addEventListener('click', () => this._dispatch(def.commandType));
            this.element.appendChild(btn);
        }
    }

    private _dispatch(commandType: string): void {
        if (!this.runtime) {
            console.warn(`[CDEToolbar] runtime is null — command "${commandType}" not dispatched.`);
            return;
        }
        this.runtime.bus.executeCommand(commandType, {});
    }

    triggerCommand(commandType: string): void {
        const btn = this.element.querySelector<HTMLButtonElement>(`[data-command="${commandType}"]`);
        btn?.click();
    }
}
