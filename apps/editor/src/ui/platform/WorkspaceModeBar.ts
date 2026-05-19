/**
 * WorkspaceModeBar — Phase UI-V2: Top-of-scene mode switcher
 *
 * CSS prefix: wmb-   (claimed in §05 §3)
 *
 * A floating pill anchored to the top-centre of the 3-D viewport that lets
 * the user switch between Author / Inspect / Data workspace modes.
 * It delegates all state mutations to workspaceController (WorkspaceController.ts)
 * which owns the canonical mode state, localStorage persistence, and F1/F2/F3 shortcuts.
 *
 * Contract compliance:
 *   §01 §2   — zero direct store mutations; reads workspaceController only
 *   §05 §6   — zero bim-* / @thatopen/ui elements; pure native HTML
 *   §05 §2   — CSS defined in AppTheme pipeline (platformShell.ts WMB_STYLES block)
 *   §05 §3   — wmb- prefix claimed here
 *   §05 §8   — additive only; no removal of existing elements
 */

import { workspaceController, type WorkspaceMode } from '../WorkspaceController';

// Phase B.2 (S73-WIRE) — runtime threading per S72 §16.2 row B.2 (orchestrator child).
export class WorkspaceModeBar {
    readonly element: HTMLElement;

    private readonly _btns: Map<WorkspaceMode, HTMLButtonElement> = new Map();

    /** Phase B.2 (S73-WIRE) — runtime threaded by parent (Layout.ts). */
    public readonly runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null;

    constructor(runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null = null) {
        this.runtime = runtime;
        this.element = this._build();
        this._syncToController();

        // F.events.6 — pryzm-workspace-mode migrated to runtime.events typed bus.
        this.runtime?.events?.on('pryzm-workspace-mode', (payload: unknown) => {
            const mode = (payload as { mode?: WorkspaceMode })?.mode;
            if (mode) this._setActive(mode);
        });
    }

    private _build(): HTMLElement {
        const bar = document.createElement('div');
        bar.className      = 'wmb-bar';
        bar.setAttribute('role', 'toolbar');
        bar.setAttribute('aria-label', 'Workspace mode');

        const modes: Array<{ id: WorkspaceMode; label: string; icon: string; title: string }> = [
            {
                id: 'author',
                label: 'Author',
                title: 'Author mode — full 3D canvas (F1)',
                icon: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M12 20h9"/>
                    <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>
                </svg>`,
            },
            {
                id: 'inspect',
                label: 'Inspect',
                title: 'Inspect mode — 3D + data side-by-side (F2)',
                icon: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <rect x="3" y="3" width="18" height="18" rx="2"/>
                    <line x1="3" y1="9" x2="21" y2="9"/>
                    <line x1="9" y1="21" x2="9" y2="9"/>
                </svg>`,
            },
            {
                id: 'data',
                label: 'Data',
                title: 'Data mode — full data workbench (F3)',
                icon: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <ellipse cx="12" cy="5" rx="9" ry="3"/>
                    <path d="M3 5v4c0 1.66 4.03 3 9 3s9-1.34 9-3V5"/>
                    <path d="M3 9v4c0 1.66 4.03 3 9 3s9-1.34 9-3V9"/>
                </svg>`,
            },
        ];

        for (const m of modes) {
            const btn = document.createElement('button');
            btn.type      = 'button';
            btn.className = 'wmb-btn';
            btn.title     = m.title;
            btn.setAttribute('aria-label', m.title);
            btn.setAttribute('data-mode', m.id);
            btn.innerHTML = `${m.icon}<span class="wmb-btn-label">${m.label}</span>`;
            btn.addEventListener('click', () => {
                workspaceController.setMode(m.id);
                this._setActive(m.id);
            });
            this._btns.set(m.id, btn);
            bar.appendChild(btn);
        }

        return bar;
    }

    private _setActive(mode: WorkspaceMode): void {
        this._btns.forEach((btn, id) => {
            const active = id === mode;
            btn.classList.toggle('wmb-btn--active', active);
            btn.setAttribute('aria-pressed', String(active));
        });
    }

    private _syncToController(): void {
        this._setActive(workspaceController.getMode());
    }
}
