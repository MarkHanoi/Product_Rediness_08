/**
 * IFCProjectionStore — controls whether IFC-imported geometry is included
 * in 2D technical drawing projections (plan views, sections, elevations).
 *
 * Architecture:
 *   - Global toggle: `includeIFC` (default = true).
 *   - Per-view overrides: views can opt in/out independently.
 *   - When a toggle changes, `ifc-projection-changed` is dispatched on window
 *     so callers (PlanViewManager, ViewController) can invalidate caches and
 *     trigger reprojection.
 *
 * Contract compliance:
 *   §01 §5  — No THREE.js scene mutations here; projection callers react to events.
 *   §05     — No DOM side-effects.
 */

import type * as FRAGS from '@thatopen/fragments';

const LS_KEY = 'pryzm.ifcProjection.includeIFC';
const EVENT_NAME = 'ifc-projection-changed';

class IFCProjectionStoreImpl {

    private _global: boolean = true;
    private _perView: Map<string, boolean> = new Map();

    constructor() {
        try {
            const stored = localStorage.getItem(LS_KEY);
            if (stored !== null) this._global = stored !== 'false';
        } catch { /* ignore */ }
    }

    // ── Query ────────────────────────────────────────────────────────────────

    /**
     * Returns true if IFC models should be included in the projection for
     * the given view. Per-view override wins over global when present.
     *
     * Stage S7 — also consults the Visibility Intent system: if the view's
     * bound intent (or any ancestor in the parent chain — Wave 10 / Stage S7
     * inheritance) carries a `VisibilityOverride` for
     * `elementType: 'ifc-element'` with action `hide`, IFC inclusion is
     * forced off. Intent-system veto wins over the legacy global/per-view
     * flag (it is the explicit user gesture).
     *
     * Wave 10 / Stage S7 — the view's own binding is checked first; if it
     * doesn't authoritatively veto IFC inclusion, the parent chain is
     * walked. This matches Wave 9's `IntentBindingResolver` semantics for
     * detail / dependent views: a section view that hides IFC propagates
     * the hide to its detail children unless the detail view's own binding
     * (or per-view legacy flag) explicitly opts back in.
     *
     * Cycle-safe via a `Set<viewId>` walk guard (Risk R1 in the master plan).
     */
    shouldIncludeIFC(viewId?: string): boolean {
        if (viewId) {
            try {
                // Lazy require to avoid import cycle (ProjectionStore loads early in boot).
                if (this._intentVetoIFC(viewId)) return false;
            } catch { /* ignore — fall through to legacy path */ }
            if (this._perView.has(viewId)) return this._perView.get(viewId)!;
        }
        return this._global;
    }

    /**
     * Wave 10 / Stage S7 — walks the (viewId → parentViewId) chain and
     * returns true when any view in the chain carries a localOverride
     * `elementType:'ifc-element' action:'hide'`. Cycle-safe.
     *
     * Kept as a separate private helper so the lazy-require / try-catch
     * surface in `shouldIncludeIFC` stays a single line.
     */
    private _intentVetoIFC(viewId: string): boolean {
        const instStore = window.viewIntentInstanceStore; // TODO(TASK-08)
        const defStore = window.viewDefinitionStore; // TODO(TASK-08)
        if (!instStore?.get) return false;

        const seen = new Set<string>();
        let current: string | null = viewId;
        while (current && !seen.has(current)) {
            seen.add(current);
            const inst = instStore.get(current);
            const overrides: Array<{ targetKind: string; targetId: string; action: string }> | undefined =
                inst?.localOverrides?.visibilityOverrides;
            if (overrides && overrides.some(o =>
                o.targetKind === 'elementType' && o.targetId === 'ifc-element' && o.action === 'hide',
            )) {
                return true;
            }
            // Walk to parent only when defStore is available (Wave 9 / Stage S6
            // inheritance); when missing we fall back to leaf-only behaviour.
            if (!defStore?.get) break;
            const def: { parentViewId?: string | null } | undefined = defStore.get(current);
            current = def?.parentViewId ?? null;
        }
        return false;
    }

    get globalEnabled(): boolean {
        return this._global;
    }

    // ── Mutation ─────────────────────────────────────────────────────────────

    /**
     * Set the global IFC inclusion flag. Persists to localStorage.
     * Dispatches `ifc-projection-changed` on window.
     */
    setGlobal(enabled: boolean): void {
        if (this._global === enabled) return;
        this._global = enabled;
        try { localStorage.setItem(LS_KEY, String(enabled)); } catch { /* ignore */ }
        this._dispatch(null);
    }

    /**
     * Set a per-view IFC inclusion override. Pass `null` to remove the override
     * and fall back to the global flag.
     * Dispatches `ifc-projection-changed` on window.
     */
    setForView(viewId: string, enabled: boolean | null): void {
        const current = this._perView.get(viewId);
        if (enabled === null) {
            if (!this._perView.has(viewId)) return;
            this._perView.delete(viewId);
        } else {
            if (current === enabled) return;
            this._perView.set(viewId, enabled);
        }
        this._dispatch(viewId);
    }

    // ── Model filtering ──────────────────────────────────────────────────────

    /**
     * Returns the model array filtered according to the current store state.
     * When IFC is disabled for the view, returns an empty array so the projection
     * caller skips the IFC source path entirely.
     */
    filterModels(
        models: FRAGS.FragmentsModel[],
        viewId?: string,
    ): FRAGS.FragmentsModel[] {
        return this.shouldIncludeIFC(viewId) ? models : [];
    }

    /** Contract 45 — wipe per-view IFC projection state on project switch. */
    clear(): void {
        this._perView.clear();
        this._dispatch(null);
    }

    // ── Private ──────────────────────────────────────────────────────────────

    private _dispatch(viewId: string | null): void {
        window.dispatchEvent(new CustomEvent<{ viewId: string | null }>( // TODO(TASK-15)
            EVENT_NAME,
            { detail: { viewId } },
        ));
    }
}

export const ifcProjectionStore = new IFCProjectionStoreImpl();
export const IFC_PROJECTION_CHANGED_EVENT = 'ifc-projection-changed';
export type { IFCProjectionStoreImpl };

import { projectScopeRegistry } from '../persistence/ProjectScopeRegistry';
projectScopeRegistry.register({
    scopeName: 'ifcProjectionStore',
    clear: () => ifcProjectionStore.clear(),
});
