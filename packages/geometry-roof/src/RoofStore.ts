import { RoofData } from './RoofTypes';
import { ProjectContext } from '@pryzm/core-app-model';
import { RoofDataAddSchema, formatZodError } from './RoofDataSchema';
import { cloneRoofData } from './roofSnapshotUtils';
import { storeEventBus } from '@pryzm/core-app-model';
import { DOMEventBus } from '@pryzm/event-bus';
const _bus = new DOMEventBus();

export class RoofStore {
    private _roofs = new Map<string, RoofData>();
    private projectContext: ProjectContext;
    private _listeners = new Map<string, Set<Function>>();

    constructor(projectContext: ProjectContext) {
        this.projectContext = projectContext;
        // §3.5 FIX: Removed 'bim-level-removed' auto-mutation listener from store.
        // Level-removal cascading is now handled by RoofLevelCleanupHandler (external).
    }

    get activeLevelId(): string {
        return this.projectContext.activeLevelId;
    }

    private emit(event: string, payload: any): void {
        const listeners = this._listeners.get(event);
        if (listeners) listeners.forEach(fn => fn(payload));
    }

    on(event: 'add' | 'update' | 'remove', listener: Function): void {
        if (!this._listeners.has(event)) this._listeners.set(event, new Set());
        this._listeners.get(event)!.add(listener);
    }

    off(event: 'add' | 'update' | 'remove', listener: Function): void {
        this._listeners.get(event)?.delete(listener);
    }

    add(roof: RoofData): void {
        const result = RoofDataAddSchema.safeParse(roof);
        if (!result.success) {
            throw new Error(`[RoofStore.add] Schema validation failed: ${formatZodError(result.error)}`);
        }

        const now = Date.now();
        const cloned = cloneRoofData(roof);

        if (!cloned.levelId) {
            cloned.levelId = this.activeLevelId;
            cloned.parentId = this.activeLevelId;
        }
        if (!cloned.parentId) {
            cloned.parentId = cloned.levelId;
        }

        if (!cloned.properties) cloned.properties = {};
        if (!cloned.properties.mark) {
            const count = this._roofs.size + 1;
            cloned.properties.mark = `RF${count.toString().padStart(3, '0')}`;
        }

        if (cloned.baseOffset === undefined) {
            cloned.baseOffset = 3.0;
        }

        if (!cloned.ifcData) {
            cloned.ifcData = {
                guid:     crypto.randomUUID(),
                ifcClass: 'IfcRoof',
            };
        }

        cloned.metadata = {
            createdAt:  cloned.metadata?.createdAt  ?? now,
            modifiedAt: cloned.metadata?.modifiedAt ?? now,
            createdBy:  cloned.metadata?.createdBy  ?? 'system',
            version:    cloned.metadata?.version    ?? 1,
            tags:       cloned.metadata?.tags,
            description: cloned.metadata?.description,
        };

        const frozen = Object.freeze(cloned);
        this._roofs.set(frozen.id, frozen);

        this.emit('add', frozen);
        _bus.emit('bim-roof-added', { id: frozen.id }); // F.events.18
        storeEventBus.emit({ elementId: frozen.id, elementType: 'roof', operation: 'create', timestamp: Date.now() });
    }

    remove(id: string): RoofData | undefined {
        const roof = this._roofs.get(id);
        if (roof) {
            this._roofs.delete(id);
            this.emit('remove', id);
            _bus.emit('bim-roof-removed', { id }); // F.events.18
            storeEventBus.emit({ elementId: id, elementType: 'roof', operation: 'delete', timestamp: Date.now() });
        }
        return roof;
    }

    update(id: string, updates: Partial<RoofData>): RoofData | undefined {
        const existing = this._roofs.get(id);
        if (!existing) return undefined;

        if (updates.levelId && updates.levelId !== existing.levelId) {
            throw new Error(`[RoofStore.update] levelId is immutable after creation`);
        }

        const cloned = cloneRoofData(existing);
        Object.assign(cloned, updates);

        cloned.metadata = {
            ...cloned.metadata,
            modifiedAt: Date.now(),
            version:    (cloned.metadata?.version ?? 0) + 1,
        };

        const frozen = Object.freeze(cloned);
        this._roofs.set(id, frozen);

        this.emit('update', frozen);
        _bus.emit('bim-roof-updated', { id: frozen.id }); // F.events.18
        storeEventBus.emit({ elementId: id, elementType: 'roof', operation: 'update', timestamp: Date.now() });
        return frozen;
    }

    restoreSnapshot(snapshot: RoofData): void {
        const existing = this._roofs.get(snapshot.id);
        if (!existing) {
            this.add(snapshot);
            return;
        }

        const cloned = cloneRoofData(snapshot);
        const frozen = Object.freeze(cloned);
        this._roofs.set(snapshot.id, frozen);

        this.emit('update', frozen);
        _bus.emit('bim-roof-updated', { id: frozen.id }); // F.events.18
        storeEventBus.emit({ elementId: frozen.id, elementType: 'roof', operation: 'update', timestamp: Date.now() });
    }

    getById(id: string): RoofData | undefined {
        const roof = this._roofs.get(id);
        return roof ? cloneRoofData(roof) : undefined;
    }

    getAll(): RoofData[] {
        return Array.from(this._roofs.values()).map(cloneRoofData);
    }

    getByLevel(levelId: string): RoofData[] {
        return this.getAll().filter(r => r.levelId === levelId);
    }
}
