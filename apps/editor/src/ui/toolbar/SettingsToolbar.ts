/**
 * SettingsToolbar — Wave 6 Phase C (wave-6-c-d10)
 *
 * Application and project settings toolbar.  12 buttons covering global
 * settings, units, snapping, display, keyboard shortcuts, project information,
 * shared parameters, standards transfer, file maintenance, and licensing.
 *
 * Architecture anchors
 * ────────────────────
 * • §01-VISION §3 P6  — Each button dispatches via runtime.bus.executeCommand.
 * • §02-ARCHITECTURE §7 — settings-* commands will be re-exported through
 *   @pryzm/sdk settings namespace in Phase F.
 * • §10-WAVE-6-CONVERGENCE §3 — real binding validated by Vitest.
 */

import type { PryzmRuntime } from '@pryzm/runtime-composer/types';

export const SETTINGS_TOOLBAR_ID = 'settings-toolbar' as const;

export interface SettingsButtonDef {
    readonly commandType: string;
    readonly label:       string;
    readonly icon:        string;
    readonly title:       string;
    readonly group:       'general' | 'project' | 'maintenance' | 'about';
}

export const SETTINGS_TOOLBAR_BUTTONS: readonly SettingsButtonDef[] = [
    { commandType: 'settings-open',              label: 'Settings',   icon: '⚙',  title: 'Open application settings',              group: 'general'     },
    { commandType: 'settings-units',             label: 'Units',      icon: '⊡',  title: 'Configure project units',                group: 'general'     },
    { commandType: 'settings-snapping',          label: 'Snapping',   icon: '◎',  title: 'Configure snap settings',                group: 'general'     },
    { commandType: 'settings-display',           label: 'Display',    icon: '🖥', title: 'Open display settings',                  group: 'general'     },
    { commandType: 'settings-shortcuts',         label: 'Shortcuts',  icon: '⌨',  title: 'Manage keyboard shortcuts',              group: 'general'     },
    { commandType: 'settings-project-info',      label: 'Project',    icon: '📋', title: 'Edit project information',               group: 'project'     },
    { commandType: 'settings-shared-params',     label: 'Shared Params', icon: '🔗', title: 'Manage shared parameters file',     group: 'project'     },
    { commandType: 'settings-transfer-standards', label: 'Transfer',  icon: '⇌',  title: 'Transfer project standards',             group: 'project'     },
    { commandType: 'settings-purge-unused',      label: 'Purge',      icon: '🗑', title: 'Purge unused families and types',         group: 'maintenance' },
    { commandType: 'settings-warnings',          label: 'Warnings',   icon: '⚠',  title: 'Review model warnings',                 group: 'maintenance' },
    { commandType: 'settings-about',             label: 'About',      icon: '?',   title: 'About PRYZM',                           group: 'about'       },
    { commandType: 'settings-license',           label: 'License',    icon: '🔑', title: 'Manage license and activation',          group: 'about'       },
] as const;

const SETTINGS_TOOLBAR_STYLES = `
.stgtb-toolbar { display: flex; align-items: center; gap: 2px; padding: 4px 8px; background: var(--app-toolbar-bg, #f7f7f7); border-bottom: 1px solid rgba(0,0,0,0.1); font-family: var(--app-font, 'Inter', sans-serif); font-size: 12px; height: 40px; box-sizing: border-box; user-select: none; }
.stgtb-separator { width: 1px; height: 24px; background: rgba(0,0,0,0.12); margin: 0 4px; flex-shrink: 0; }
.stgtb-btn { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 1px; padding: 3px 6px; border: 1px solid transparent; border-radius: 5px; cursor: pointer; background: transparent; color: var(--app-text, #333); font-size: 11px; min-width: 38px; transition: background 0.1s; }
.stgtb-btn:hover { background: rgba(0,0,0,0.06); border-color: rgba(0,0,0,0.12); }
.stgtb-btn:active { background: rgba(102,0,255,0.1); border-color: var(--app-accent, #6600FF); }
.stgtb-btn-icon { font-size: 14px; line-height: 1; }
.stgtb-btn-label { font-size: 9px; color: var(--app-text-secondary, #777); line-height: 1; }
`;

export class SettingsToolbar {
    public readonly element: HTMLDivElement;
    public readonly runtime: PryzmRuntime | null;
    private _styleInjected = false;

    constructor(runtime: PryzmRuntime | null = null) {
        this.runtime = runtime;
        if (!runtime) {
            console.warn('[SettingsToolbar] runtime is null — button commands will not be dispatched. (wave-6-c-d10)');
        }
        this.element = document.createElement('div');
        this.element.className = 'stgtb-toolbar';
        this.element.setAttribute('role', 'toolbar');
        this.element.setAttribute('aria-label', 'Settings toolbar');
        this._injectStyles();
        this._buildDOM();
    }

    private _injectStyles(): void {
        if (this._styleInjected) return;
        if (typeof document === 'undefined') return;
        const style = document.createElement('style');
        style.setAttribute('data-stgtb-styles', '1');
        style.textContent = SETTINGS_TOOLBAR_STYLES;
        document.head.appendChild(style);
        this._styleInjected = true;
    }

    private _buildDOM(): void {
        let lastGroup: string | null = null;
        for (const def of SETTINGS_TOOLBAR_BUTTONS) {
            if (lastGroup !== null && def.group !== lastGroup) {
                const sep = document.createElement('div');
                sep.className = 'stgtb-separator';
                sep.setAttribute('role', 'separator');
                this.element.appendChild(sep);
            }
            lastGroup = def.group;
            const btn = document.createElement('button');
            btn.className = 'stgtb-btn';
            btn.title = def.title;
            btn.setAttribute('aria-label', def.title);
            btn.setAttribute('data-command', def.commandType);
            const iconEl = document.createElement('span');
            iconEl.className = 'stgtb-btn-icon';
            iconEl.textContent = def.icon;
            iconEl.setAttribute('aria-hidden', 'true');
            const labelEl = document.createElement('span');
            labelEl.className = 'stgtb-btn-label';
            labelEl.textContent = def.label;
            btn.appendChild(iconEl);
            btn.appendChild(labelEl);
            btn.addEventListener('click', () => this._dispatch(def.commandType));
            this.element.appendChild(btn);
        }
    }

    private _dispatch(commandType: string): void {
        if (!this.runtime) {
            console.warn(`[SettingsToolbar] runtime is null — command "${commandType}" not dispatched.`);
            return;
        }
        this.runtime.bus.executeCommand(commandType, {});
    }

    triggerCommand(commandType: string): void {
        const btn = this.element.querySelector<HTMLButtonElement>(`[data-command="${commandType}"]`);
        btn?.click();
    }
}
