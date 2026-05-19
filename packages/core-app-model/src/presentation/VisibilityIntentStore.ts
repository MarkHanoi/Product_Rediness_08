import { storeRegistry } from '../StoreRegistry';
import { storeEventBus } from '../StoreEventBus'; // TODO(TASK-08)
import type { VisibilityIntent } from './VisibilityIntentTypes';
import { cloneSystemIntents } from './SystemIntents';
import { migrateIntentToCurrent, CURRENT_INTENT_SCHEMA_VERSION } from './migrations/IntentSchemaMigrations';

export interface VisibilityIntentStoreSnapshot {
    version: 1;
    intents: VisibilityIntent[];
}

function clone<T>(value: T): T {
    return JSON.parse(JSON.stringify(value));
}

class VisibilityIntentStoreImpl {
    private _systemIntents = new Map<string, VisibilityIntent>();
    private _userIntents = new Map<string, VisibilityIntent>();

    constructor() {
        for (const intent of cloneSystemIntents()) {
            const migrated = migrateIntentToCurrent(intent);
            this._systemIntents.set(migrated.id, migrated);
        }
    }

    private dispatch(eventName: string, detail: object): void {
        if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent(eventName, { detail })); // TODO(TASK-15)
        }
    }

    private emit(intentId: string, operation: 'create' | 'update' | 'delete'): void {
        storeEventBus.emit({ elementType: 'visibility-intent', elementId: intentId, operation, timestamp: Date.now() });
    }

    getAll(): VisibilityIntent[] {
        return [...this._systemIntents.values(), ...this._userIntents.values()].map(clone);
    }

    get(intentId: string): VisibilityIntent | undefined {
        const intent = this._systemIntents.get(intentId) ?? this._userIntents.get(intentId);
        return intent ? clone(intent) : undefined;
    }

    has(intentId: string): boolean {
        return this._systemIntents.has(intentId) || this._userIntents.has(intentId);
    }

    isSystem(intentId: string): boolean {
        return this._systemIntents.has(intentId);
    }

    create(intent: VisibilityIntent): VisibilityIntent | null {
        if (!intent.id || this.has(intent.id)) return null;
        const now = new Date().toISOString();
        const next: VisibilityIntent = {
            ...clone(intent),
            isSystem: false,
            schemaVersion: intent.schemaVersion ?? CURRENT_INTENT_SCHEMA_VERSION,
            version: intent.version ?? 1,
            createdAt: intent.createdAt ?? now,
            updatedAt: intent.updatedAt ?? now,
        };
        this._userIntents.set(next.id, next);
        this.emit(next.id, 'create');
        this.dispatch('vi:intent-created', { intentId: next.id });
        return clone(next);
    }

    update(intentId: string, patch: Partial<Omit<VisibilityIntent, 'id' | 'isSystem' | 'createdAt' | 'version'>>): VisibilityIntent | null {
        if (this._systemIntents.has(intentId)) return null;
        const current = this._userIntents.get(intentId);
        if (!current) return null;
        const next: VisibilityIntent = {
            ...current,
            ...clone(patch),
            id: current.id,
            isSystem: false,
            createdAt: current.createdAt,
            version: current.version + 1,
            updatedAt: new Date().toISOString(),
        };
        this._userIntents.set(intentId, next);
        this.emit(intentId, 'update');
        this.dispatch('vi:intent-updated', { intentId });
        return clone(next);
    }

    delete(intentId: string): boolean {
        if (this._systemIntents.has(intentId)) return false;
        if (!this._userIntents.delete(intentId)) return false;
        this.emit(intentId, 'delete');
        this.dispatch('vi:intent-deleted', { intentId });
        return true;
    }

    restore(intent: VisibilityIntent): void {
        if (!intent.id || this._systemIntents.has(intent.id) || this._userIntents.has(intent.id)) return;
        this._userIntents.set(intent.id, { ...clone(intent), isSystem: false });
        this.emit(intent.id, 'create');
        this.dispatch('vi:intent-created', { intentId: intent.id });
    }

    serialize(): VisibilityIntentStoreSnapshot {
        return {
            version: 1,
            intents: [...this._userIntents.values()].map(clone),
        };
    }

    deserialize(data: unknown): void {
        if (!data || typeof data !== 'object') return;
        const snapshot = data as VisibilityIntentStoreSnapshot;
        if (snapshot.version !== 1 || !Array.isArray(snapshot.intents)) return;
        this._userIntents.clear();
        for (const raw of snapshot.intents) {
            if (raw?.id && raw?.name && !raw.isSystem) {
                const migrated = migrateIntentToCurrent({ ...clone(raw), isSystem: false });
                this._userIntents.set(raw.id, migrated);
            }
        }
        this.dispatch('vi:intent-store-loaded', {});
    }

    reset(): void {
        this._userIntents.clear();
        this.dispatch('vi:intent-store-reset', {});
    }
}

export const visibilityIntentStore = new VisibilityIntentStoreImpl();
storeRegistry.register('visibility-intent', visibilityIntentStore);
export type { VisibilityIntentStoreImpl };
import { projectScopeRegistry } from '../persistence/ProjectScopeRegistry';
projectScopeRegistry.register({
    scopeName: 'visibilityIntentStore',
    clear: () => visibilityIntentStore.reset(),
});
