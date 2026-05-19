/**
 * §ANN-B7 — Annotation Visibility Store
 *
 * Per-view, per-category annotation visibility control.
 * Mirrors Revit's Visibility/Graphics overrides for annotation categories.
 *
 * Usage:
 *   visibilityStore.hide('view-123', 'linear-dim');
 *   visibilityStore.isVisible('view-123', 'linear-dim'); // → false
 *   visibilityStore.show('view-123', 'linear-dim');
 *
 * The AnnotationRenderLayer checks isVisible() before rendering each annotation.
 * Listeners are notified on every change so the render layer can request a redraw.
 *
 * Contract compliance:
 *   §01 §5    — Pure data; no DOM, no Three.js
 *   §05 §7.8  — No bim-* / @thatopen/ui elements
 */

import { AnnotationType } from './AnnotationTypes';

type VisibilityChangeListener = (viewId: string, type: AnnotationType, visible: boolean) => void;

export class AnnotationVisibilityStore {
    /**
     * Map<viewId, Set<AnnotationType>> — the set contains hidden categories.
     * If a viewId is absent, all categories are visible (default state).
     */
    private _hidden = new Map<string, Set<AnnotationType>>();
    private _listeners: VisibilityChangeListener[] = [];

    // ── Query ─────────────────────────────────────────────────────────────────

    /**
     * Returns true if the annotation type is visible in the given view.
     * Defaults to true (visible) if no override has been set.
     */
    isVisible(viewId: string, type: AnnotationType): boolean {
        const hidden = this._hidden.get(viewId);
        if (!hidden) return true;
        return !hidden.has(type);
    }

    /**
     * Returns the set of hidden annotation types for a view (read-only).
     */
    getHiddenTypes(viewId: string): ReadonlySet<AnnotationType> {
        return this._hidden.get(viewId) ?? new Set();
    }

    /**
     * Returns all annotation types that are currently visible in a given view.
     */
    getVisibleTypes(viewId: string, allTypes: AnnotationType[]): AnnotationType[] {
        return allTypes.filter(t => this.isVisible(viewId, t));
    }

    // ── Mutations ─────────────────────────────────────────────────────────────

    /** Hide a specific annotation category in a view. */
    hide(viewId: string, type: AnnotationType): void {
        if (!this._hidden.has(viewId)) this._hidden.set(viewId, new Set());
        const set = this._hidden.get(viewId)!;
        if (set.has(type)) return; // already hidden
        set.add(type);
        this._notify(viewId, type, false);
    }

    /** Show a previously hidden annotation category in a view. */
    show(viewId: string, type: AnnotationType): void {
        const set = this._hidden.get(viewId);
        if (!set?.has(type)) return; // already visible
        set.delete(type);
        if (set.size === 0) this._hidden.delete(viewId);
        this._notify(viewId, type, true);
    }

    /** Toggle visibility for a category in a view. Returns new visibility state. */
    toggle(viewId: string, type: AnnotationType): boolean {
        const nowVisible = this.isVisible(viewId, type);
        if (nowVisible) {
            this.hide(viewId, type);
            return false;
        } else {
            this.show(viewId, type);
            return true;
        }
    }

    /** Reset all visibility overrides for a view (make everything visible again). */
    reset(viewId: string): void {
        const hidden = this._hidden.get(viewId);
        if (!hidden || hidden.size === 0) return;
        const types = Array.from(hidden) as AnnotationType[];
        this._hidden.delete(viewId);
        types.forEach(t => this._notify(viewId, t, true));
    }

    /** Copy visibility settings from one view to another (for View Template application). */
    copyFromView(sourceViewId: string, targetViewId: string): void {
        const source = this._hidden.get(sourceViewId);
        if (!source || source.size === 0) {
            this.reset(targetViewId);
            return;
        }
        this._hidden.set(targetViewId, new Set(source));
        source.forEach(t => this._notify(targetViewId, t, false));
    }

    // ── Events ────────────────────────────────────────────────────────────────

    onChange(listener: VisibilityChangeListener): () => void {
        this._listeners.push(listener);
        return () => {
            this._listeners = this._listeners.filter(l => l !== listener);
        };
    }

    // ── Serialisation (for project save/load) ─────────────────────────────────

    /** Serialise to a plain object for JSON persistence. */
    toJSON(): Record<string, AnnotationType[]> {
        const result: Record<string, AnnotationType[]> = {};
        this._hidden.forEach((set, viewId) => {
            if (set.size > 0) result[viewId] = Array.from(set) as AnnotationType[];
        });
        return result;
    }

    /** Restore from a serialised object. */
    fromJSON(data: Record<string, AnnotationType[]>): void {
        this._hidden.clear();
        Object.entries(data).forEach(([viewId, types]) => {
            if (types.length > 0) this._hidden.set(viewId, new Set(types));
        });
    }

    // ── Private ───────────────────────────────────────────────────────────────

    private _notify(viewId: string, type: AnnotationType, visible: boolean): void {
        this._listeners.forEach(l => {
            try { l(viewId, type, visible); } catch (e) {
                console.error('[AnnotationVisibilityStore] listener error:', e);
            }
        });
    }
}

/** Module-level singleton */
export const annotationVisibilityStore = new AnnotationVisibilityStore();

import { projectScopeRegistry } from '@pryzm/core-app-model';
projectScopeRegistry.register({
    scopeName: 'annotationVisibilityStore',
    clear: () => {
        for (const viewId of [...annotationVisibilityStore['_hidden'].keys()]) {
            annotationVisibilityStore.reset(viewId);
        }
    },
});
