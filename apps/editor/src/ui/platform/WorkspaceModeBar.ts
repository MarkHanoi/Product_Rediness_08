/**
 * WorkspaceModeBar — Phase UI-V2: Top-of-scene mode switcher
 *
 * CSS prefix: wmb-   (claimed in §05 §3)
 *
 * A floating pill anchored to the top-centre of the 3-D viewport that lets
 * the user switch between workspace modes. The modes themselves are declared
 * ONCE in ./workspaceModes.ts (§WORKSPACE-MODE-REGISTRY, L-3000); this file
 * renders whatever that table holds and knows no mode by name.
 * It delegates all state mutations to workspaceController (WorkspaceController.ts)
 * which owns the canonical mode state, localStorage persistence, and the
 * function-key shortcuts (also read from the registry).
 *
 * Contract compliance:
 *   §01 §2   — zero direct store mutations; reads workspaceController only
 *   §05 §6   — zero bim-* / @thatopen/ui elements; pure native HTML
 *   §05 §2   — CSS defined in AppTheme pipeline (platformShell.ts WMB_STYLES block)
 *   §05 §3   — wmb- prefix claimed here
 *   §05 §8   — additive only; no removal of existing elements
 */

import { workspaceController } from '../WorkspaceController';
// §WORKSPACE-MODE-REGISTRY (L-3000 · ADR-0343 §D.1) — the ONE mode table. This
// file used to hold a second copy of it as a local array literal inside
// _build(), which is exactly why adding a mode was a five-site hand edit.
// ⛔ Do NOT reintroduce a modes array here.
import { WORKSPACE_MODES, type WorkspaceMode } from './workspaceModes';

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

        for (const m of WORKSPACE_MODES) {
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
