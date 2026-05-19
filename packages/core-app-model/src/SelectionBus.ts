/**
 * SelectionBus.ts — PRYZM Bidirectional Selection Event Bus
 *
 * Phase:    G-0.3 (World Model Plan V3 — immediate sprint)
 *           Contract 27 — Element Selection & Highlight Orchestration
 *
 * Single source of truth for element selection events across all PRYZM surfaces:
 *   3D viewport · SVP 2D canvas · Project Browser tree · Elements panel · all 2D views
 *
 * Wire:
 *   EngineBootstrap subscribes → routes to SelectionManager + ViewNavigator.
 *   SelectionManager.onMeshPick → dispatches to selectionBus.
 *   UnifiedBrowserPanel row click → selectionBus.select()
 *   SplitViewManager canvas click → selectionBus.select('svp')
 *
 * Contract compliance:
 *   §27 §4   — SelectionBus is the single authorised entry point for all selection sources.
 *   §27 §5   — Feedback-loop guard: source === origin of the last dispatch is skipped.
 *   §16 §6   — Highlight colour managed by SelectionManager; Bus does not touch Three.js.
 */

export type SelectionSource =
    | '3d-canvas'
    | 'svp'
    | 'plan-view'      // Standalone Plan View (PlanViewManager / PlanViewInteraction)
    | 'project-browser'
    | 'elements-panel'
    | 'inspect-panel'
    | 'room-tool'
    | 'data-workbench'
    | 'query-engine'
    | 'analytics'
    | 'compliance'
    | 'physics';

export interface SelectionEvent {
    type: 'select' | 'isolate' | 'highlight' | 'clear' | 'focus-camera';
    source: SelectionSource;
    elementIds: string[];
    hierarchyIds?: string[];
    animate?: boolean;
}

type SelectionHandler = (event: SelectionEvent) => void;

class SelectionBus {
    private _handlers:    Set<SelectionHandler> = new Set();
    private _currentId:   string | null = null;
    /**
     * §27 §11 — Marquee Multi-Selection support.
     *
     * Holds the FULL set of currently selected element IDs.  For single-element
     * selections this is `[id]`; for marquee selections this is `[primary, …others]`.
     * The PRIMARY (last item) is the one driving the inspector / TransformControls /
     * contextual edit bar — single-element semantics are preserved downstream.
     */
    private _currentIds:  string[] = [];
    /** Source of the last in-flight dispatch; used to break feedback loops. */
    private _inFlight:    SelectionSource | null = null;

    /** Injected SelectionManager — replaces `(window as any).selectionManager` reads.
     *  Wired from `engineLauncher.ts` after `initTools()` completes.
     *  Falls back to window global when null so bus is safe before full boot. */
    private _selectionManager: {
        selectById(id: string): void;
        applyMarqueeHighlights(ids: string[]): void;
        unselectAll(): void;
    } | null = null;

    /** Wire the SelectionManager so this package never reads `(window as any)`
     *  in production.  Called from `engineLauncher.ts`.  OI-044 fix. */
    setSelectionManager(sm: {
        selectById(id: string): void;
        applyMarqueeHighlights(ids: string[]): void;
        unselectAll(): void;
    } | null): void {
        this._selectionManager = sm;
    }

    /**
     * Convenience method — Contract 27 §4 single entry point.
     *
     * Calls SelectionManager.selectById() to update the 3D viewport, then
     * dispatches a SelectionEvent to all bus subscribers.
     *
     * Feedback-loop guard: if this source is already in-flight (i.e. a previous
     * dispatch from the same source is still on the call stack) the call is a
     * no-op, preventing select → event → select → … cycles.
     */
    select(id: string, source: SelectionSource = '3d-canvas'): void {
        if (!id) return;
        // Feedback loop guard: skip if this source is already dispatching.
        if (this._inFlight === source) return;

        this._currentId  = id;
        this._currentIds = [id];
        this._inFlight   = source;
        try {
            // Delegate to SelectionManager — it owns the 3D highlight and fires
            // 'bim-selection-changed' which all 2D panels listen to for re-render.
            const sm = this._selectionManager ?? (window as any).selectionManager;
            if (sm?.selectById) {
                sm.selectById(id);
            }
            // Single-select clears any prior marquee highlights.
            if (sm?.applyMarqueeHighlights) {
                sm.applyMarqueeHighlights([]);
            }
            this.dispatch({ type: 'select', source, elementIds: [id] });
        } finally {
            this._inFlight = null;
        }
    }

    /**
     * §MARQUEE-SELECT-2026 — Multi-element selection entry point.
     *
     * Called by `MarqueeSelectionTool` after the user releases a Shift+drag
     * rectangle on the 3D viewport.  Replaces (or, when `additive=true`,
     * extends) the current selection with the supplied set of element IDs.
     *
     * Semantics:
     *   • The LAST id in the resulting set is the PRIMARY — it drives the
     *     property inspector, TransformControls, and the Contextual Edit Bar
     *     exactly as a normal single-click selection would.  All earlier ids
     *     receive a secondary wireframe highlight from
     *     `SelectionManager.applyMarqueeHighlights()`.
     *   • An empty array clears the selection (calls `clearAll`).
     *   • The same feedback-loop guard (`_inFlight === source`) applies.
     */
    selectMany(
        ids:      string[],
        source:   SelectionSource = '3d-canvas',
        additive: boolean         = false,
    ): void {
        if (this._inFlight === source) return;

        // Merge with existing selection when additive — de-dup, preserving order.
        const merged = additive
            ? Array.from(new Set([...this._currentIds, ...ids]))
            : Array.from(new Set(ids));

        if (merged.length === 0) {
            this.clearAll(source);
            return;
        }

        const primary = merged[merged.length - 1];
        const others  = merged.slice(0, -1);

        this._currentId  = primary ?? null;
        this._currentIds = merged;
        this._inFlight   = source;
        try {
            const sm = this._selectionManager ?? (window as any).selectionManager;
            if (sm?.selectById) sm.selectById(primary);
            if (sm?.applyMarqueeHighlights) sm.applyMarqueeHighlights(others);
            this.dispatch({ type: 'select', source, elementIds: merged });
        } finally {
            this._inFlight = null;
        }
    }

    /**
     * §MARQUEE-SELECT-2026 — Explicitly clear the entire selection.
     *
     * Called when the user clicks empty canvas with Shift held but no drag,
     * or when `selectMany([])` is invoked.  Mirrors `SelectionManager.unselectAll()`.
     */
    clearAll(source: SelectionSource = '3d-canvas'): void {
        if (this._inFlight === source) return;
        this._currentId  = null;
        this._currentIds = [];
        this._inFlight   = source;
        try {
            const sm = this._selectionManager ?? (window as any).selectionManager;
            if (sm?.unselectAll) sm.unselectAll();
            if (sm?.applyMarqueeHighlights) sm.applyMarqueeHighlights([]);
            this.dispatch({ type: 'clear', source, elementIds: [] });
        } finally {
            this._inFlight = null;
        }
    }

    /**
     * Dispatch a selection event to all subscribers.
     * Handlers are called synchronously in registration order.
     * Any handler error is caught and logged — does not abort remaining handlers.
     */
    dispatch(event: SelectionEvent): void {
        if (event.elementIds.length > 0) {
            this._currentId = event.elementIds[0] ?? null;
        } else if (event.type === 'clear') {
            this._currentId = null;
        }
        for (const handler of this._handlers) {
            try {
                handler(event);
            } catch (err) {
                console.error('[SelectionBus] Handler error:', err);
            }
        }
    }

    /**
     * Subscribe to selection events.
     * Returns an unsubscribe function — call it to remove the handler.
     */
    subscribe(handler: SelectionHandler): () => void {
        this._handlers.add(handler);
        return () => { this._handlers.delete(handler); };
    }

    /** The element ID of the most recent selection, or null if nothing is selected. */
    get currentId(): string | null {
        return this._currentId;
    }

    /**
     * The element IDs of all currently selected elements.
     *
     * For a single-select this is `[primary]`.  For a marquee multi-select
     * (§MARQUEE-SELECT-2026) this is the full set with the PRIMARY at the end:
     * `[…others, primary]`.  Returns a defensive copy so callers cannot mutate
     * the bus's internal state.
     */
    get currentIds(): string[] {
        return [...this._currentIds];
    }

    /** Number of active subscribers. */
    get subscriberCount(): number {
        return this._handlers.size;
    }

    /** Remove all subscribers (used during engine teardown). */
    clear(): void {
        this._handlers.clear();
        this._currentId  = null;
        this._currentIds = [];
        this._inFlight   = null;
    }
}

/** Singleton — import and use directly. */
export const selectionBus = new SelectionBus();
