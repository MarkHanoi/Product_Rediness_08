/**
 * ActiveLevelHUD — viewport overlay for the active level indicator.
 *
 * §05 §7.8  No bim-* elements — all native HTML.
 * §05 §4    DOM div absolutely positioned over the canvas container.
 * §02 §1.6  Active level is session state — no command needed for switching.
 *
 * CSS prefix: alh-
 * Registered in AppTheme.ts ACTIVE_LEVEL_HUD_STYLES.
 *
 * The HUD is mounted to a container div that sits absolutely over the canvas.
 * It does NOT use Three.js sprites — no projection math, no occlusion issues.
 */

import { BimManager, Level } from '@pryzm/core-app-model';

interface ActiveLevelHUDProps {
    bimManager: BimManager;
    projectContext: {
        activeLevelId: string;
        subscribe: (cb: (event: string) => void) => (() => void);
    };
    mountTarget: HTMLElement;
}

export class ActiveLevelHUD {
    private readonly root: HTMLDivElement;
    private unsubscribeContext: (() => void) | null = null;
    private unsubscribeBim: (() => void) | null = null;
    private readonly props: ActiveLevelHUDProps;

    /** Phase B (S73-WIRE) — runtime threaded by parent. */
    public readonly runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null;

    constructor(props: ActiveLevelHUDProps, runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null = null) {
        this.runtime = runtime;
        this.props = props;
        this.root = document.createElement('div');
        this.root.className = 'alh-hud';
        this.root.setAttribute('aria-label', 'Active level indicator');

        props.mountTarget.appendChild(this.root);

        this._render();
        this._subscribe();
    }

    // ── Public API ─────────────────────────────────────────────────────────

    /** Full cleanup — call when the layout is destroyed. */
    dispose(): void {
        this.unsubscribeContext?.();
        this.unsubscribeBim?.();
        this.root.remove();
    }

    // ── Private ────────────────────────────────────────────────────────────

    private _render(): void {
        const levels = this._sortedLevels();
        const activeId = this.props.projectContext.activeLevelId;
        const active = levels.find(l => l.id === activeId) ?? levels[0] ?? null;
        const idx = active ? levels.indexOf(active) : -1;
        const canGoUp   = idx < levels.length - 1;
        const canGoDown = idx > 0;

        this.root.innerHTML = '';

        const badge = document.createElement('div');
        badge.className = 'alh-badge';

        const btnDown = document.createElement('button');
        btnDown.className = 'alh-arrow';
        btnDown.textContent = '▼';
        btnDown.title = canGoDown ? `Go to ${levels[idx - 1]?.name}` : 'No lower level';
        btnDown.disabled = !canGoDown;
        btnDown.addEventListener('click', () => {
            if (canGoDown) this._activateLevel(levels[idx - 1].id);
        });

        const info = document.createElement('div');
        info.className = 'alh-info';

        const nameSpan = document.createElement('span');
        nameSpan.className = 'alh-name';
        nameSpan.textContent = active ? active.name : '—';

        const elevSpan = document.createElement('span');
        elevSpan.className = 'alh-elev';
        elevSpan.textContent = active ? `+${active.elevation.toFixed(3)} m` : '';

        info.appendChild(nameSpan);
        info.appendChild(elevSpan);

        const btnUp = document.createElement('button');
        btnUp.className = 'alh-arrow';
        btnUp.textContent = '▲';
        btnUp.title = canGoUp ? `Go to ${levels[idx + 1]?.name}` : 'No higher level';
        btnUp.disabled = !canGoUp;
        btnUp.addEventListener('click', () => {
            if (canGoUp) this._activateLevel(levels[idx + 1].id);
        });

        badge.appendChild(btnDown);
        badge.appendChild(info);
        badge.appendChild(btnUp);
        this.root.appendChild(badge);
    }

    private _sortedLevels(): Level[] {
        return this.props.bimManager.getLevels()
            .slice()
            .sort((a, b) => a.elevation - b.elevation);
    }

    private _activateLevel(id: string): void {
        this.props.projectContext.activeLevelId = id;
    }

    private _subscribe(): void {
        this.unsubscribeContext = this.props.projectContext.subscribe((event: string) => {
            if (event === 'activeLevelChanged') {
                this._render();
            }
        });

        this.unsubscribeBim = this.props.bimManager.subscribe((type) => {
            if (type === 'levelAdded' || type === 'levelUpdated' || type === 'levelRemoved') {
                this._render();
            }
        });
    }
}
