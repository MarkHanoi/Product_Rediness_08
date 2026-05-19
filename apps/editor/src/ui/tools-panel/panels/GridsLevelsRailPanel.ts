/**
 * GridsLevelsRailPanel — Grids & Levels section for the right tools rail.
 *
 * Surfaces two creation entry points:
 *   • Grid   — only enabled while a Plan view is active
 *              (delegates to ToolManager.activateGrid → GridPlanToolHandler).
 *   • Level  — only enabled while a Section / Elevation view is active
 *              (executes AddLevelCommand via the active CommandManager).
 *
 * The mutually-exclusive enabled state mirrors the existing in-canvas
 * "+ Grid" / "+ Level" floating button rendered by PlanViewToolOverlay
 * (see PlanViewToolOverlay._mountCreateActionButton). This panel exposes
 * the same affordances on the right tool rail so they are reachable from
 * outside the 2D canvas as well.
 *
 * View-mode detection
 * ───────────────────
 * The panel listens to the global 'view-activated' DOM event dispatched
 * by ViewController.activate() (detail.type holds the ViewDefinition's
 * viewType: 'plan' | 'structural-plan' | 'section' | 'elevation' | …).
 * It also queries viewController.currentViewDefinitionId on first build
 * so it shows the correct enabled state when opened mid-session.
 *
 * Contract compliance
 * ───────────────────
 *   §05 §9   — New UI file under src/ui/
 *   §05 §6   — Zero bim-* / @thatopen/ui elements; pure native HTML
 *   §05 §7.6 — No independent <style> injection; styles live in
 *              src/styles/panels/toolsRail.ts (tpr- prefix, reused)
 *   §01 §2   — Mutations go through ToolManager / CommandManager.execute();
 *              no direct store writes
 *   §22-LEVELS-GRIDS — Level creation routes through AddLevelCommand so
 *              it participates in the undo/redo stack and persistence.
 */

import type { ToolsRailController } from '../ToolsRailController';
import type { ToolsPanelProps }      from '../ToolsPanelTypes';
import * as PryzmIcons               from '../../icons/PryzmIcons';
import { viewDefinitionStore }       from '@pryzm/core-app-model';
import type { ViewDefinition }       from '@pryzm/core-app-model';

type ViewType = ViewDefinition['viewType'];

const PLAN_TYPES:    readonly ViewType[] = ['plan', 'structural-plan'];
const SECTION_TYPES: readonly ViewType[] = ['section', 'elevation'];

export class GridsLevelsRailPanel {
    private _gridBtn:  HTMLButtonElement | null = null;
    private _levelBtn: HTMLButtonElement | null = null;
    private _hint:     HTMLElement       | null = null;

    private _listenerBound = false;

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
        root.className = 'tpr-ann-root tpr-gl-root';

        // ── Group: Plan-only creators ────────────────────────────────────────
        root.appendChild(this._buildGroupLabel('Plan view'));
        this._gridBtn = this._buildToolBtn(
            'Grid',
            'arch:grid-bubble',
            'Place a structural grid line in the active plan view',
            () => this._handleCreateGrid(),
        );
        root.appendChild(this._gridBtn);

        // ── Group: Section/Elevation-only creators ───────────────────────────
        root.appendChild(this._buildGroupLabel('Section / Elevation'));
        this._levelBtn = this._buildToolBtn(
            'Level',
            'arch:level-tag',
            'Add a level at a chosen elevation (active section/elevation view)',
            () => this._handleCreateLevel(),
        );
        root.appendChild(this._levelBtn);

        // ── Contextual hint ──────────────────────────────────────────────────
        const hint = document.createElement('div');
        hint.className = 'tpr-gl-hint';
        this._hint = hint;
        root.appendChild(hint);

        // Ensure single binding even if build() is called repeatedly
        if (!this._listenerBound) {
            window.runtime?.events?.on('view-activated', (payload: unknown) => { // F.events.8
                this._handleViewActivated(payload);
            });
            this._listenerBound = true;
        }

        // Sync to the currently-active view (if any) on open
        this._syncEnabledState(this._currentViewType());

        return root;
    }

    // ──────────────────────────────────────────────────────────────────────────
    // View-state plumbing
    // ──────────────────────────────────────────────────────────────────────────

    private _currentViewType(): ViewType | null {
        const vc = window.viewController; // TODO(D.4): legacy viewController — replace with runtime.viewRegistry controller
        const id: string | null = vc?.currentViewDefinitionId ?? null;
        if (id) {
            const vd = viewDefinitionStore.get?.(id);
            if (vd?.viewType) return vd.viewType;
        }
        // Fall back to ViewController's nav mode for the 3D / Top / etc. cases
        // where no ViewDefinition is bound. None of those count as plan or
        // section/elevation, so leaving null is correct → both buttons disabled.
        return null;
    }

    private _handleViewActivated(payload: unknown): void {
        const p = payload as { type?: string } | null | undefined;
        // ViewController dispatches `type` as the viewType string.
        // If absent (legacy callers), fall back to a fresh store lookup.
        const vt: ViewType | null = (p?.type as ViewType) ?? this._currentViewType();
        this._syncEnabledState(vt);
    }

    private _syncEnabledState(vt: ViewType | null): void {
        const isPlan       = vt != null && PLAN_TYPES.includes(vt);
        const isSectElev   = vt != null && SECTION_TYPES.includes(vt);

        this._setBtnEnabled(this._gridBtn,  isPlan,
            'Grid placement is only available in a plan view.');
        this._setBtnEnabled(this._levelBtn, isSectElev,
            'Level creation is only available in a section or elevation view.');

        if (this._hint) {
            if (isPlan) {
                this._hint.textContent = 'Plan view active — Grid is enabled.';
                this._hint.dataset.state = 'ok';
            } else if (isSectElev) {
                this._hint.textContent = 'Section/Elevation active — Level is enabled.';
                this._hint.dataset.state = 'ok';
            } else {
                this._hint.textContent =
                    'Open a plan view to place a Grid, or a section/elevation view to add a Level.';
                this._hint.dataset.state = 'idle';
            }
        }
    }

    private _setBtnEnabled(btn: HTMLButtonElement | null, enabled: boolean, disabledTip: string): void {
        if (!btn) return;
        btn.disabled = !enabled;
        btn.classList.toggle('tpr-ann-btn--disabled', !enabled);
        if (!enabled) btn.title = disabledTip;
        else btn.title = btn.dataset.enabledTitle ?? '';
    }

    // ──────────────────────────────────────────────────────────────────────────
    // DOM builders
    // ──────────────────────────────────────────────────────────────────────────

    private _buildGroupLabel(text: string): HTMLElement {
        const el = document.createElement('div');
        el.className = 'tpr-gl-group-label';
        el.textContent = text;
        return el;
    }

    private _buildToolBtn(
        label:    string,
        iconName: string,
        title:    string,
        onClick:  () => void,
    ): HTMLButtonElement {
        const btn = document.createElement('button');
        btn.className = 'tpr-ann-btn';
        btn.type = 'button';
        btn.title = title;
        btn.dataset.enabledTitle = title;

        const iconEl  = PryzmIcons.iconEl(iconName, 'tpr-ann-btn-icon', 16);
        const labelEl = document.createElement('span');
        labelEl.className = 'tpr-ann-btn-label';
        labelEl.textContent = label;

        btn.appendChild(iconEl);
        btn.appendChild(labelEl);

        btn.addEventListener('click', () => {
            if (btn.disabled) return;
            onClick();
        });

        return btn;
    }

    // ──────────────────────────────────────────────────────────────────────────
    // Action handlers (mirrors PlanViewToolOverlay._handleCreateGrid/Level)
    // ──────────────────────────────────────────────────────────────────────────

    private _handleCreateGrid(): void {
        const tm = this._props.toolManager ?? window.toolManager; // TODO(D.4): legacy toolManager — replace with runtime.tools
        if (tm?.activateGrid) {
            tm.activateGrid();
            console.log('[GridsLevelsRailPanel] Grid tool activated from rail');
        } else {
            console.warn('[GridsLevelsRailPanel] toolManager.activateGrid not available');
        }
    }

    private async _handleCreateLevel(): Promise<void> {
        const bim: any = this._props.bimManager ?? window.bimManager; // TODO(D.4): legacy bimManager — replace with runtime.scene.renderer / runtime.tools
        if (!bim) {
            console.warn('[GridsLevelsRailPanel] bimManager unavailable');
            return;
        }

        const existing: any[] = bim.getLevels?.() ?? [];
        const top = existing.reduce(
            (max: any, l: any) => (!max || l.elevation > max.elevation ? l : max),
            null as any,
        );
        const prevHeight  = top?.height ?? 3.0;
        const defaultElev = top ? top.elevation + prevHeight : 0.0;

        const input = window.prompt(
            'New level elevation (metres):',
            defaultElev.toFixed(3),
        );
        if (input == null) return;
        const elevation = parseFloat(input);
        if (!Number.isFinite(elevation)) {
            console.warn('[GridsLevelsRailPanel] Invalid elevation entered:', input);
            return;
        }

        const count = existing.length;
        const levelPayload = {
            levelId:   `L${count}-${Date.now()}`,
            name:      `Level ${count}`,
            elevation,
            height:    prevHeight,
        };
        (this.runtime ?? (window as any).runtime)?.bus
            ?.executeCommand('level.add', levelPayload)
            ?.catch((e: Error) => console.error('[GridsLevelsRailPanel] level.add failed', e));
        console.log('[GridsLevelsRailPanel] Level added at', elevation, 'm');
    }
}
