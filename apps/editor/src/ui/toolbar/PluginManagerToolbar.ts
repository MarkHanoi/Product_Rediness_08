/**
 * PluginManagerToolbar — Wave 6 Phase C (wave-6-c-d10)
 *
 * Plugin lifecycle management toolbar (Phase F preview surface).  12 buttons
 * covering install/uninstall, enable/disable, update, marketplace browsing,
 * devtools, and sandbox management.
 *
 * Architecture anchors
 * ────────────────────
 * • §01-VISION §3 P6  — Each button dispatches via runtime.bus.executeCommand.
 * • §02-ARCHITECTURE §7 — This toolbar's commands will be exposed through
 *   @pryzm/sdk in Phase F; they are the L6 surface for plugin management.
 * • §10-WAVE-6-CONVERGENCE §3 — real binding validated by Vitest.
 */

import type { PryzmRuntime } from '@pryzm/runtime-composer/types';

export const PLUGIN_MANAGER_TOOLBAR_ID = 'plugin-manager-toolbar' as const;

export interface PluginManagerButtonDef {
    readonly commandType: string;
    readonly label:       string;
    readonly icon:        string;
    readonly title:       string;
    readonly group:       'lifecycle' | 'marketplace' | 'devtools';
}

export const PLUGIN_MANAGER_TOOLBAR_BUTTONS: readonly PluginManagerButtonDef[] = [
    { commandType: 'plugin-install',          label: 'Install',    icon: '⊕',  title: 'Install plugin from file or URL',      group: 'lifecycle'   },
    { commandType: 'plugin-uninstall',        label: 'Uninstall',  icon: '⊖',  title: 'Uninstall selected plugin',            group: 'lifecycle'   },
    { commandType: 'plugin-enable',           label: 'Enable',     icon: '▶',  title: 'Enable selected plugin',               group: 'lifecycle'   },
    { commandType: 'plugin-disable',          label: 'Disable',    icon: '⏸',  title: 'Disable selected plugin',              group: 'lifecycle'   },
    { commandType: 'plugin-update',           label: 'Update',     icon: '↑',  title: 'Update plugin to latest version',      group: 'lifecycle'   },
    { commandType: 'plugin-reload',           label: 'Reload',     icon: '↺',  title: 'Reload plugin (hot reload)',           group: 'lifecycle'   },
    { commandType: 'plugin-browse-marketplace', label: 'Browse',   icon: '🏪', title: 'Browse plugin marketplace',            group: 'marketplace' },
    { commandType: 'plugin-settings-open',    label: 'Settings',   icon: '⚙', title: 'Open plugin settings',                 group: 'marketplace' },
    { commandType: 'plugin-devtools-open',    label: 'DevTools',   icon: '🔧', title: 'Open plugin developer tools',          group: 'devtools'    },
    { commandType: 'plugin-api-explorer',     label: 'API',        icon: '📖', title: 'Open plugin API explorer',             group: 'devtools'    },
    { commandType: 'plugin-sandbox-start',    label: 'Sandbox',    icon: '⊡',  title: 'Start plugin sandbox environment',     group: 'devtools'    },
    { commandType: 'plugin-logs-show',        label: 'Logs',       icon: '📋', title: 'Show plugin console logs',             group: 'devtools'    },
] as const;

const PLUGIN_MGR_TOOLBAR_STYLES = `
.pmtb-toolbar { display: flex; align-items: center; gap: 2px; padding: 4px 8px; background: var(--app-toolbar-bg, #f7f7f7); border-bottom: 1px solid rgba(0,0,0,0.1); font-family: var(--app-font, 'Inter', sans-serif); font-size: 12px; height: 40px; box-sizing: border-box; user-select: none; }
.pmtb-separator { width: 1px; height: 24px; background: rgba(0,0,0,0.12); margin: 0 4px; flex-shrink: 0; }
.pmtb-btn { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 1px; padding: 3px 6px; border: 1px solid transparent; border-radius: 5px; cursor: pointer; background: transparent; color: var(--app-text, #333); font-size: 11px; min-width: 38px; transition: background 0.1s; }
.pmtb-btn:hover { background: rgba(0,0,0,0.06); border-color: rgba(0,0,0,0.12); }
.pmtb-btn:active { background: rgba(102,0,255,0.1); border-color: var(--app-accent, #6600FF); }
.pmtb-btn-icon { font-size: 14px; line-height: 1; }
.pmtb-btn-label { font-size: 9px; color: var(--app-text-secondary, #777); line-height: 1; }
`;

export class PluginManagerToolbar {
    public readonly element: HTMLDivElement;
    public readonly runtime: PryzmRuntime | null;
    private _styleInjected = false;

    constructor(runtime: PryzmRuntime | null = null) {
        this.runtime = runtime;
        if (!runtime) {
            console.warn('[PluginManagerToolbar] runtime is null — button commands will not be dispatched. (wave-6-c-d10)');
        }
        this.element = document.createElement('div');
        this.element.className = 'pmtb-toolbar';
        this.element.setAttribute('role', 'toolbar');
        this.element.setAttribute('aria-label', 'Plugin manager toolbar');
        this._injectStyles();
        this._buildDOM();
    }

    private _injectStyles(): void {
        if (this._styleInjected) return;
        if (typeof document === 'undefined') return;
        const style = document.createElement('style');
        style.setAttribute('data-pmtb-styles', '1');
        style.textContent = PLUGIN_MGR_TOOLBAR_STYLES;
        document.head.appendChild(style);
        this._styleInjected = true;
    }

    private _buildDOM(): void {
        let lastGroup: string | null = null;
        for (const def of PLUGIN_MANAGER_TOOLBAR_BUTTONS) {
            if (lastGroup !== null && def.group !== lastGroup) {
                const sep = document.createElement('div');
                sep.className = 'pmtb-separator';
                sep.setAttribute('role', 'separator');
                this.element.appendChild(sep);
            }
            lastGroup = def.group;
            const btn = document.createElement('button');
            btn.className = 'pmtb-btn';
            btn.title = def.title;
            btn.setAttribute('aria-label', def.title);
            btn.setAttribute('data-command', def.commandType);
            const iconEl = document.createElement('span');
            iconEl.className = 'pmtb-btn-icon';
            iconEl.textContent = def.icon;
            iconEl.setAttribute('aria-hidden', 'true');
            const labelEl = document.createElement('span');
            labelEl.className = 'pmtb-btn-label';
            labelEl.textContent = def.label;
            btn.appendChild(iconEl);
            btn.appendChild(labelEl);
            btn.addEventListener('click', () => this._dispatch(def.commandType));
            this.element.appendChild(btn);
        }
    }

    private _dispatch(commandType: string): void {
        if (!this.runtime) {
            console.warn(`[PluginManagerToolbar] runtime is null — command "${commandType}" not dispatched.`);
            return;
        }
        this.runtime.bus.executeCommand(commandType, {});
    }

    triggerCommand(commandType: string): void {
        const btn = this.element.querySelector<HTMLButtonElement>(`[data-command="${commandType}"]`);
        btn?.click();
    }
}
