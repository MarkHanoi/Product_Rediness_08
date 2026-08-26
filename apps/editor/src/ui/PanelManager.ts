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
 * ── Pinning (§PIN146) ─────────────────────────────────────────────────────────
 * A panel may be PINNED against this exclusivity rule: `setPinned(id, true)`
 * marks it, and `_closeOthers` skips calling `close()` on any pinned id — the
 * panel simply survives another panel opening. This is the ONE authority for
 * "pinned" (C84 EI-9): `RailPanelController` (the Project Browser's rp-panel)
 * originated the concept with its own local `_pinned` boolean gating its own
 * closeFn body; that local check still runs (harmless, redundant), but it also
 * reports its state here so the concept is queryable in one place. `AIPanel`'s
 * chat-panel pin (founder request, "keep the AI chat panel open") is wired
 * PURELY through this registry — it has no local gate of its own, because a
 * SECOND parallel pinned-flag mechanism is exactly the "second implementation
 * of a thing that already existed" this codebase keeps finding and re-fixing.
 * Pinning is scoped to exclusivity ONLY: it does not defeat a panel's own
 * explicit close (× button / Esc / re-toggle) — those remain deliberate user
 * actions and stay unconditional on every participating panel.
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

/**
 * §PIN146 — the ONE pin glyph. `RailPanelController` (Project Browser's own
 * rp-header pin) and `UnifiedBrowserPanel` (the "Project Browser" header the
 * founder pointed at) both import this constant rather than each carrying a
 * hand-copied `<svg>` string; `AIPanel`'s new chat-panel pin imports the same
 * constant. A future edit to the glyph moves for all three at once, and a
 * button rendering anything else is provably NOT this control.
 */
export const PANEL_PIN_ICON_SVG =
    '<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">' +
    '<path d="M16 9V4h1c.55 0 1-.45 1-1s-.45-1-1-1H7c-.55 0-1 .45-1 1s.45 1 1 1h1v5c0 1.66-1.34 3-3 3v2h5.97v7l1 1 1-1v-7H19v-2c-1.66 0-3-1.34-3-3z"/>' +
    '</svg>';

// Phase B.4 (S73-WIRE) — singleton runtime threading per S72 §16.2 row B.4.
// Singleton lifecycle predates `composeRuntime()`, so it cannot accept the
// runtime via constructor.  Instead we expose `wireRuntime()` for the boot
// path (initUI → composeRuntime → panelManager.wireRuntime(rt)) and a
// public-readonly getter for downstream panels that need it.
class PanelManagerImpl {
    private readonly _registry = new Map<string, CloseFn>();
    private readonly _pinned = new Set<string>();
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
        this._pinned.delete(id);
        if (this._active === id) this._active = null;
    }

    /**
     * §PIN146 — mark (or unmark) a registered panel as pinned. A pinned panel's
     * closeFn is skipped by `_closeOthers`, so it survives another panel opening.
     * Pinning is independent of registration order — safe to call before or
     * after `register(id, …)`.
     */
    setPinned(id: string, pinned: boolean): void {
        if (pinned) this._pinned.add(id);
        else this._pinned.delete(id);
    }

    /** Whether `id` is currently pinned against exclusivity closes. */
    isPinned(id: string): boolean {
        return this._pinned.has(id);
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
            if (id === exceptId) continue;
            if (this._pinned.has(id)) continue; // §PIN146 — pinned panels survive exclusivity
            try {
                closeFn();
            } catch (err) {
                console.warn(`[PanelManager] Error closing panel "${id}":`, err);
            }
        }
    }
}

export const panelManager = new PanelManagerImpl();
