/**
 * @deprecated Contract 25b — per-element overrides now live in
 * `OverrideLayer.graphicOverrides` on each `ViewIntentInstance`. This store is
 * read by the `VGToIntentMigration` and by legacy command code paths only.
 * Do not add new importers; use `SetGraphicOverrideCommand` instead.
 *
 * VGInstanceOverrideStore — DOC-4.1
 *
 * Per-element, per-view VG style overrides — Tier 4.5 in the cascade.
 *
 * Contract compliance:
 *   §01 §2  — All mutations via SetInstanceVGOverrideCommand; store exposes
 *             set() / clear() / clearAll() called only from commands.
 *   §05 §4  — Pure data module; zero DOM / Three.js dependencies.
 *   §07     — Client-side only; no server routes.
 */

import type { VGCategoryStyle } from './VGGovernanceStore.js';

class VGInstanceOverrideStoreImpl {
    private _data: Map<string, Map<string, Partial<VGCategoryStyle>>> = new Map();

    private _dispatch(eventName: string, detail: object): void {
        window.dispatchEvent(new CustomEvent(eventName, { detail })); // TODO(TASK-15)
    }

    set(elementId: string, viewId: string, style: Partial<VGCategoryStyle>): void {
        if (!this._data.has(elementId)) {
            this._data.set(elementId, new Map());
        }
        this._data.get(elementId)!.set(viewId, { ...style });
        this._dispatch('vg:instance-override-set', { elementId, viewId });
    }

    clear(elementId: string, viewId: string): void {
        const viewMap = this._data.get(elementId);
        if (!viewMap) return;
        viewMap.delete(viewId);
        if (viewMap.size === 0) this._data.delete(elementId);
        this._dispatch('vg:instance-override-cleared', { elementId, viewId });
    }

    clearAllForView(viewId: string): void {
        for (const [elementId, viewMap] of this._data) {
            viewMap.delete(viewId);
            if (viewMap.size === 0) this._data.delete(elementId);
        }
        this._dispatch('vg:instance-override-cleared', { elementId: null, viewId });
    }

    clearAll(): void {
        this._data.clear();
        this._dispatch('vg:instance-override-cleared', { elementId: null, viewId: null });
    }

    clearForElement(elementId: string): void {
        this._data.delete(elementId);
        this._dispatch('vg:instance-override-cleared', { elementId, viewId: null });
    }

    get(elementId: string, viewId: string): Partial<VGCategoryStyle> | undefined {
        return this._data.get(elementId)?.get(viewId);
    }

    has(elementId: string, viewId: string): boolean {
        return this._data.get(elementId)?.has(viewId) ?? false;
    }

    getAllForView(viewId: string): Array<{ elementId: string; style: Partial<VGCategoryStyle> }> {
        const result: Array<{ elementId: string; style: Partial<VGCategoryStyle> }> = [];
        for (const [elementId, viewMap] of this._data) {
            const style = viewMap.get(viewId);
            if (style) result.push({ elementId, style });
        }
        return result;
    }

    serialize(): object {
        const entries: Array<{ elementId: string; viewId: string; style: Partial<VGCategoryStyle> }> = [];
        for (const [elementId, viewMap] of this._data) {
            for (const [viewId, style] of viewMap) {
                entries.push({ elementId, viewId, style });
            }
        }
        return { version: 1, entries };
    }

    deserialize(data: unknown): void {
        if (!data || typeof data !== 'object') return;
        const d = data as any;
        if (d.version !== 1 || !Array.isArray(d.entries)) return;
        this._data.clear();
        for (const entry of d.entries) {
            if (typeof entry.elementId === 'string' && typeof entry.viewId === 'string' && entry.style) {
                this.set(entry.elementId, entry.viewId, entry.style);
            }
        }
    }
}

export const vgInstanceOverrideStore = new VGInstanceOverrideStoreImpl();
export type { VGInstanceOverrideStoreImpl };

import { projectScopeRegistry } from '../persistence/ProjectScopeRegistry.js';
projectScopeRegistry.register({
    scopeName: 'vgInstanceOverrideStore',
    clear: () => vgInstanceOverrideStore.clearAll(),
});
