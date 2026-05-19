/**
 * LevelsGridsRailPanel — Levels & Grids section for the left rail panel system.
 *
 * Wraps LevelManagerPanel and GridManagerPanel into a single rail panel.
 * Both sub-panels are instantiated lazily on first build() call and reused
 * on subsequent calls — they are self-reactive and subscribe to BimManager
 * events internally, so no additional wiring is needed.
 *
 * Moved here from the right-hand tp-panel "Project" section so that level
 * and grid management lives alongside the project browser (views, sheets, etc.)
 * on the left rail, which is the natural home for project-structure controls.
 *
 * Contract compliance:
 *   §05 §9   — New UI file under src/ui/
 *   §05 §6   — Zero bim-* elements; pure native HTML
 *   §01 §2   — All mutations via the legacy command manager; no direct store writes
 *   §05 §7.6 — No independent <style> injection; styles live in AppTheme.ts (lg- prefix)
 */

import { LevelManagerPanel } from '../../levels/LevelManagerPanel';
import { GridManagerPanel }  from '../../grids/GridManagerPanel';
import type { ProjectBrowserPanelProps } from '../ProjectBrowserTypes';

export class LevelsGridsRailPanel {
    private _root: HTMLElement | null = null;

    /** Phase B (S73-WIRE) — runtime threaded by parent. */
    public readonly runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null;

    constructor(private readonly _props: ProjectBrowserPanelProps, runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null = null) {
        this.runtime = runtime;}

    build(): HTMLElement {
        // Lazily instantiate the sub-panels on first open; the root element is
        // retained in memory across open/close cycles so subscriptions stay alive.
        if (!this._root) {
            this._root = document.createElement('div');
            this._root.className = 'lg-rail-root';

            // ── Level Hierarchy ──────────────────────────────────────────────
            const levelLabel = document.createElement('div');
            levelLabel.className = 'lg-rail-group-label';
            levelLabel.textContent = 'Level Hierarchy';
            this._root.appendChild(levelLabel);

            const levelMount = document.createElement('div');
            levelMount.style.pointerEvents = 'auto';
            this._root.appendChild(levelMount);

            // Phase B.15-LM (S73-WIRE) — forward the runtime threaded into
            // LevelsGridsRailPanel by ProjectBrowserPanel so LevelManagerPanel's
            // future store reach (`runtime.bimSession.levels` in C.6 /
            // `runtime.bus.executeCommand` in E.<level>.X) is one wireup away.
            new LevelManagerPanel({
                bimManager:       this._props.bimManager!,
                projectContext:   this._props.projectContext!,
                getCommandManager: this._props.getCommandManager!,
                mountTarget:      levelMount,
            }, this.runtime);

            // ── Structural Grids ─────────────────────────────────────────────
            const gridLabel = document.createElement('div');
            gridLabel.className = 'lg-rail-group-label';
            gridLabel.textContent = 'Structural Grids';
            this._root.appendChild(gridLabel);

            const gridMount = document.createElement('div');
            gridMount.style.pointerEvents = 'auto';
            this._root.appendChild(gridMount);

            // Resolve gridStore: prefer the prop, fall back to window-registered
            // store, then to bimManager.getGrids() so the panel works in all
            // bootstrap configurations.
            const gridStore = this._props.gridStore
                ?? window.gridStore // TODO(E.13): legacy gridStore — replace with runtime.stores.grids (E.grids.S slot)
                ?? { getAll: () => (this._props.bimManager as any)?.getGrids?.() ?? [] };

            // Phase B.15-GM (S73-WIRE) — forward the runtime so GridManagerPanel
            // can promote `gridStore` reach to `runtime.stores.grids` in
            // E.grids.S, and replace the legacy `window.gridStore`
            // fallback above without re-touching this lazy-build site.
            new GridManagerPanel({
                bimManager:       this._props.bimManager!,
                gridStore,
                getCommandManager: this._props.getCommandManager!,
                mountTarget:      gridMount,
            }, this.runtime);

            // ── Visibility toggles (from removed VISUAL rail panel) ──────────
            const visLabel = document.createElement('div');
            visLabel.className   = 'lg-rail-group-label';
            visLabel.textContent = 'Scene Visibility';
            this._root.appendChild(visLabel);

            const visSection = document.createElement('div');
            visSection.className = 'lg-rail-vis-section';

            const buildToggle = (label: string, type: 'levels' | 'grids', defaultOn: boolean): HTMLElement => {
                const row = document.createElement('label');
                row.className = 'lg-rail-vis-row';

                const input = document.createElement('input');
                input.type    = 'checkbox';
                input.checked = defaultOn;
                input.addEventListener('change', () => {
                    const fn = this._props.toggleBimVisibility;
                    if (fn) {
                        fn(type, input.checked);
                        console.log(`[LevelsGridsRailPanel] ${label} → ${input.checked}`);
                    }
                });

                const text = document.createElement('span');
                text.textContent = label;

                row.appendChild(input);
                row.appendChild(text);
                return row;
            };

            visSection.appendChild(buildToggle('Show Levels', 'levels', false));
            visSection.appendChild(buildToggle('Show Grids',  'grids',  false));
            this._root.appendChild(visSection);
        }

        return this._root;
    }
}
