import { storeRegistry } from '../StoreRegistry';
import { storeEventBus } from '../StoreEventBus'; // TODO(TASK-08)
import type { OverrideLayer, ViewIntentInstance } from './VisibilityIntentTypes';
import { EMPTY_OVERRIDE_LAYER } from './VisibilityIntentTypes';
import { getDefaultSystemIntentId } from './SystemIntents';
import { visibilityIntentStore } from './VisibilityIntentStore';

export interface ViewIntentInstanceStoreSnapshot {
    version: 1;
    instances: ViewIntentInstance[];
}

function clone<T>(value: T): T {
    return structuredClone(value);
}

function emptyOverrides(): OverrideLayer {
    return clone(EMPTY_OVERRIDE_LAYER);
}

class ViewIntentInstanceStoreImpl {
    private _instances = new Map<string, ViewIntentInstance>();

    /**
     * F.events.2b — Injected by app-layer (engineLauncher) after runtime composition.
     * Bridges the package-tier DOM dispatch → typed runtime.events.emit so that
     * all runtime.events.on('vi:instance-updated', ...) listeners in the UI layer
     * receive the typed event. Packages (GraphicsRulesEngine, ViewRangeFilterService,
     * ViewRangeZoneApplicator, ViewTechnicalDrawingCache) remain on the parallel DOM
     * dispatch path — they have no runtime access and need no change here.
     */
    private _runtimeViEmitter: ((viewId: string, instanceId: string) => void) | null = null;

    /** F.events.2b — Called from engineLauncher after composeRuntime(). */
    setRuntimeViEmitter(fn: ((viewId: string, instanceId: string) => void) | null): void {
        this._runtimeViEmitter = fn;
    }

    private dispatch(eventName: string, detail: object): void {
        if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent(eventName, { detail })); // TODO(TASK-15)
        }
    }

    private emit(viewId: string, operation: 'create' | 'update' | 'delete'): void {
        storeEventBus.emit({ elementType: 'view-intent-instance', elementId: viewId, operation, timestamp: Date.now() });
    }

    getAll(): ViewIntentInstance[] {
        return [...this._instances.values()].map(clone);
    }

    get(viewId: string): ViewIntentInstance | undefined {
        const instance = this._instances.get(viewId);
        return instance ? clone(instance) : undefined;
    }

    has(viewId: string): boolean {
        return this._instances.has(viewId);
    }

    assign(viewId: string, intentId = getDefaultSystemIntentId()): ViewIntentInstance | null {
        if (!viewId || !visibilityIntentStore.has(intentId)) return null;
        const now = new Date().toISOString();
        const existing = this._instances.get(viewId);
        const instance: ViewIntentInstance = existing
            ? { ...existing, intentId, updatedAt: now }
            : {
                id: crypto.randomUUID(),
                viewId,
                intentId,
                localOverrides: emptyOverrides(),
                createdAt: now,
                updatedAt: now,
            };
        this._instances.set(viewId, instance);
        this.emit(viewId, existing ? 'update' : 'create');
        this.dispatch('vi:instance-updated', { viewId, intentId });
        this._runtimeViEmitter?.(viewId, instance.id); // F.events.2b
        return clone(instance);
    }

    updateOverrides(viewId: string, overrides: OverrideLayer): ViewIntentInstance | null {
        const existing = this._instances.get(viewId);
        if (!existing) return null;
        const next: ViewIntentInstance = {
            ...existing,
            localOverrides: clone(overrides),
            updatedAt: new Date().toISOString(),
        };
        this._instances.set(viewId, next);
        this.emit(viewId, 'update');
        this.dispatch('vi:instance-updated', { viewId, intentId: next.intentId });
        this._runtimeViEmitter?.(viewId, next.id); // F.events.2b
        return clone(next);
    }

    clearOverrides(viewId: string): ViewIntentInstance | null {
        const existing = this._instances.get(viewId);
        if (!existing) return null;
        const next: ViewIntentInstance = {
            ...existing,
            localOverrides: emptyOverrides(),
            updatedAt: new Date().toISOString(),
        };
        this._instances.set(viewId, next);
        this.emit(viewId, 'update');
        this.dispatch('vi:overrides-cleared', { viewId });
        this.dispatch('vi:instance-updated', { viewId, intentId: next.intentId });
        this._runtimeViEmitter?.(viewId, next.id); // F.events.2b
        return clone(next);
    }

    delete(viewId: string): boolean {
        if (!this._instances.delete(viewId)) return false;
        this.emit(viewId, 'delete');
        this.dispatch('vi:instance-deleted', { viewId });
        return true;
    }

    restore(instance: ViewIntentInstance): void {
        if (!instance?.viewId || this._instances.has(instance.viewId)) return;
        this._instances.set(instance.viewId, clone(instance));
        this.emit(instance.viewId, 'create');
        this.dispatch('vi:instance-updated', { viewId: instance.viewId, intentId: instance.intentId });
        this._runtimeViEmitter?.(instance.viewId, instance.id); // F.events.2b
    }

    pinViewVersion(viewId: string, version: number): ViewIntentInstance | null {
        const existing = this._instances.get(viewId);
        if (!existing) return null;
        if (typeof version !== 'number' || version < 1) return null;
        const next: ViewIntentInstance = {
            ...existing,
            pinnedVersion: version,
            updatedAt: new Date().toISOString(),
        };
        this._instances.set(viewId, next);
        this.emit(viewId, 'update');
        this.dispatch('vi:instance-updated', { viewId, intentId: next.intentId });
        this._runtimeViEmitter?.(viewId, next.id); // F.events.2b
        this.dispatch('vi:version-pinned', { viewId, version });
        return clone(next);
    }

    unpinViewVersion(viewId: string): ViewIntentInstance | null {
        const existing = this._instances.get(viewId);
        if (!existing) return null;
        if (existing.pinnedVersion === undefined) return clone(existing);
        const { pinnedVersion: _drop, ...rest } = existing;
        const next: ViewIntentInstance = {
            ...rest,
            updatedAt: new Date().toISOString(),
        };
        this._instances.set(viewId, next);
        this.emit(viewId, 'update');
        this.dispatch('vi:instance-updated', { viewId, intentId: next.intentId });
        this._runtimeViEmitter?.(viewId, next.id); // F.events.2b
        this.dispatch('vi:version-unpinned', { viewId });
        return clone(next);
    }

    serialize(): ViewIntentInstanceStoreSnapshot {
        return {
            version: 1,
            instances: [...this._instances.values()].map(clone),
        };
    }

    deserialize(data: unknown): void {
        if (!data || typeof data !== 'object') return;
        const snapshot = data as ViewIntentInstanceStoreSnapshot;
        if (snapshot.version !== 1 || !Array.isArray(snapshot.instances)) return;
        this._instances.clear();
        for (const raw of snapshot.instances) {
            if (raw?.viewId && raw?.intentId) {
                this._instances.set(raw.viewId, {
                    ...clone(raw),
                    localOverrides: raw.localOverrides ?? emptyOverrides(),
                });
            }
        }
        this.dispatch('vi:instance-store-loaded', {});
    }

    reset(): void {
        this._instances.clear();
        this.dispatch('vi:instance-store-reset', {});
    }
}

export const viewIntentInstanceStore = new ViewIntentInstanceStoreImpl();
storeRegistry.register('view-intent-instance', viewIntentInstanceStore);
if (typeof window !== 'undefined') {
    (window as any).viewIntentInstanceStore = viewIntentInstanceStore;
}
export type { ViewIntentInstanceStoreImpl };
import { projectScopeRegistry } from '../persistence/ProjectScopeRegistry';
projectScopeRegistry.register({
    scopeName: 'viewIntentInstanceStore',
    clear: () => viewIntentInstanceStore.reset(),
});
