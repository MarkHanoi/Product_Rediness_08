/**
 * PanelManager — global single-panel-at-a-time rule.
 *
 * Enforces that at most ONE panel is visible at any time across the entire
 * application. Any panel controller that wishes to participate must:
 *
 *   1. Register its close callback once (e.g. in its constructor):
 *        panelManager.register('rail:left', () => this.close());
 *
 *   2. Notify the manager before making itself visible:
 *        panelManager.notifyOpened('rail:left');
 *
 *   3. Notify the manager after closing itself:
 *        panelManager.notifyClosed('rail:left');
 *
 * When `notifyOpened(id)` is called, the manager immediately calls `close()`
 * on every OTHER registered panel, guaranteeing exclusivity.
 *
 * ── Registered panel IDs (by convention) ─────────────────────────────────────
 *   'rail:left'          RailPanelController    (left vb-panel rail)
 *   'rail:right'         ToolsRailController    (right tp-panel rail)
 *   'panel:vg'           VGGovernancePanel
 *   'panel:ai'           AI chat panel
 *   'panel:spatial'      Spatial tree panel
 *   'panel:ai-create'    AI create panel
 *   'panel:fp-import'    Floor plan import panel
 *   'panel:property'     PropertyPanel / PropertyPanelAdapter
 *   'panel:render'       RenderPanel
 *   'panel:panorama'     PanoramaPanel
 *   'panel:export-studio'  ExportStudioPanel
 *   'panel:video-export' VideoExportPanel
 *   'panel:render-queue' RenderQueuePanel
 *   'panel:viz-engine'   VisualizationEnginePanel
 *   'panel:walkthrough'  WalkthroughPanel
 *   'panel:schedule'     SchedulePanel
 *   'panel:sheet-editor' SheetEditorPanel
 *
 * ── Exclusions ────────────────────────────────────────────────────────────────
 * Modal dialogs, HUD overlays, and tooltip-like pickers (DoorModePicker, etc.)
 * are intentionally NOT registered here — they sit above the panel layer and
 * are temporary interactions, not persistent workspace panels.
 *
 * Contract compliance:
 *   §01  — No store mutations; pure UI co-ordination layer.
 *   §05  — No CSS or DOM creation; logic only.
 */

type CloseFn = () => void;

// Phase B.4 (S73-WIRE) — singleton runtime threading per S72 §16.2 row B.4.
// Singleton lifecycle predates `composeRuntime()`, so it cannot accept the
// runtime via constructor.  Instead we expose `wireRuntime()` for the boot
// path (initUI → composeRuntime → panelManager.wireRuntime(rt)) and a
// public-readonly getter for downstream panels that need it.
class PanelManagerImpl {
    private readonly _registry = new Map<string, CloseFn>();
    private _active: string | null = null;

    /** Phase B.4 (S73-WIRE) — runtime threaded by boot path via `wireRuntime()`. */
    private _runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null = null;
    public get runtime(): import('@pryzm/runtime-composer/types').PryzmRuntime | null { return this._runtime; }
    public wireRuntime(rt: import('@pryzm/runtime-composer/types').PryzmRuntime | null): void { this._runtime = rt; }

    /**
     * Register a panel. `closeFn` is called automatically whenever another
     * panel opens. Safe to call multiple times with the same id (overwrites).
     */
    register(id: string, closeFn: CloseFn): void {
        this._registry.set(id, closeFn);
    }

    /**
     * Remove a panel from the registry (e.g. on component teardown).
     */
    unregister(id: string): void {
        this._registry.delete(id);
        if (this._active === id) this._active = null;
    }

    /**
     * Call this immediately BEFORE making a panel visible.
     * Closes every other registered panel and marks `id` as active.
     *
     * If `id` is already the active panel this is a no-op (supports refresh
     * cycles where the same panel re-renders without triggering closes).
     */
    notifyOpened(id: string): void {
        if (this._active === id) return;
        this._closeOthers(id);
        this._active = id;
    }

    /**
     * Call this whenever a panel is explicitly closed (by its own × button
     * or any programmatic close). Keeps `_active` in sync so future
     * `notifyOpened` calls close all relevant panels correctly.
     */
    notifyClosed(id: string): void {
        if (this._active === id) this._active = null;
    }

    /** The id of the currently open panel, or null. */
    get activeId(): string | null {
        return this._active;
    }

    private _closeOthers(exceptId: string): void {
        for (const [id, closeFn] of this._registry) {
            if (id !== exceptId) {
                try {
                    closeFn();
                } catch (err) {
                    console.warn(`[PanelManager] Error closing panel "${id}":`, err);
                }
            }
        }
    }
}

export const panelManager = new PanelManagerImpl();
