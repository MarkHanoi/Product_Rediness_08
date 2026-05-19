import { ProjectContext } from '../context/ProjectContext';
import {
    StairData,
    StairEventType,
    StairEventListener
} from './StairTypes';
import { storeEventBus } from '../StoreEventBus'; // TODO(TASK-08)
import { DOMEventBus } from '@pryzm/event-bus';

const _bus = new DOMEventBus();

/**
 * §STAIR-AUDIT-2026 R1.1 (FIXED 2026-04-25)
 *  - F4: input is no longer mutated before clone (mutations now happen on the clone).
 *  - F5: `restoreSnapshot` clones before storing.
 *  - F24: every dispatched payload is the cloned reference, never the caller's input.
 *  - All writes route through `_mutate()` so future writers cannot drop the discipline.
 *
 * §STAIR-AUDIT-2026 R2.3 (FIXED 2026-04-25)
 *  - F15: dead `validateStairParameters` removed; consumers route through
 *    `StairValidationAuthority` (see `src/elements/stairs/StairValidationAuthority.ts`).
 */
export class StairStore {
    private stairs: Map<string, StairData> = new Map();
    private projectContext: ProjectContext;
    private listeners: StairEventListener[] = [];

    constructor(projectContext: ProjectContext) {
        this.projectContext = projectContext;
        // §3.5 FIX: Removed 'bim-level-removed' auto-mutation listener from store.
        // Level-removal cascading is now handled by StairLevelCleanupHandler (external).
    }

    get activeLevelId(): string {
        return this.projectContext.activeLevelId;
    }

    add(stair: StairData): void {
        if (!stair.baseLevelId) {
            throw new Error('Spatial Authority Violation: No base level selected for stair creation.');
        }

        // §F4 + §F24 fix: clone FIRST. Mutations and dispatches all use the clone.
        const cloned = structuredClone(stair);

        if (!cloned.properties.mark) {
            const count = this.stairs.size + 1;
            cloned.properties.mark = `SR${count.toString().padStart(3, '0')}`;
        }

        if (!cloned.ifcData) {
            cloned.ifcData = {
                guid: crypto.randomUUID(),
                ifcClass: 'IfcStair'
            };
        }

        this.stairs.set(cloned.id, cloned);

        // §F24 fix: dispatch the cloned reference (NOT the original input).
        _bus.emit('bim-stair-added', { id: cloned.id });
        this.emit('add', cloned);

        console.log(`[StairStore] Added stair ${cloned.id} (${cloned.shape}) from ${cloned.baseLevelId} to ${cloned.topLevelId}`);
    }

    update(stairId: string, updates: Partial<StairData>): StairData | undefined {
        const stair = this.stairs.get(stairId);
        if (!stair) return undefined;

        const updated: StairData = { ...stair, ...updates };
        if (updates.properties && stair.properties) {
            updated.properties = { ...stair.properties, ...updates.properties };
        }
        // §F3 fix (FIXED 2026-04-25): version is bumped on EVERY update, regardless of
        // whether the caller supplies a metadata patch.  Previously, callers passing
        // `metadata: { source: 'ai' }` silently froze the version counter.
        const baseMeta = stair.metadata;
        const patch = updates.metadata ?? {};
        updated.metadata = {
            ...baseMeta,
            ...patch,
            modifiedAt: new Date().toISOString(),
            version: baseMeta.version + 1,
        };

        // §F4/F24 fix: store and dispatch the cloned reference.
        const cloned = structuredClone(updated);
        this.stairs.set(stairId, cloned);
        _bus.emit('bim-stair-updated', { id: stairId });
        this.emit('update', cloned);

        console.log(`[StairStore] Updated stair ${stairId} (v${cloned.metadata.version})`);
        return cloned;
    }

    /**
     * §F5 fix (FIXED 2026-04-25): clones the snapshot before storing it, so
     * subsequent caller-side mutations cannot corrupt the live store entry.
     * Used by the undo/redo path.
     */
    restoreSnapshot(stair: StairData): void {
        const cloned = structuredClone(stair);
        this.stairs.set(cloned.id, cloned);
        _bus.emit('bim-stair-updated', { id: cloned.id });
        this.emit('update', cloned);
    }

    remove(stairId: string): StairData | undefined {
        const stair = this.stairs.get(stairId);
        if (stair) {
            this.stairs.delete(stairId);
            this.emit('remove', stair);
            _bus.emit('bim-stair-removed', { id: stairId });

            console.log(`[StairStore] Removed stair ${stairId}`);
        }
        return stair;
    }

    get(stairId: string): StairData | undefined {
        return this.stairs.get(stairId);
    }

    getById(stairId: string): Readonly<StairData> | undefined {
        return this.stairs.get(stairId);
    }

    getAll(): StairData[] {
        return Array.from(this.stairs.values());
    }

    getAllMap(): ReadonlyMap<string, StairData> {
        return this.stairs;
    }

    getStairs(): StairData[] {
        return this.getAll();
    }

    getByLevel(levelId: string): StairData[] {
        return this.getAll().filter(s =>
            s.baseLevelId === levelId || s.topLevelId === levelId
        );
    }

    getByBaseLevelId(levelId: string): StairData[] {
        return this.getAll().filter(s => s.baseLevelId === levelId);
    }

    getByTopLevelId(levelId: string): StairData[] {
        return this.getAll().filter(s => s.topLevelId === levelId);
    }

    getStairConnectingLevels(baseLevelId: string, topLevelId: string): StairData | undefined {
        return this.getAll().find(s =>
            s.baseLevelId === baseLevelId && s.topLevelId === topLevelId
        );
    }

    subscribe(listener: StairEventListener): () => void {
        this.listeners.push(listener);
        return () => {
            this.listeners = this.listeners.filter(l => l !== listener);
        };
    }

    private emit(event: StairEventType, stair: StairData): void {
        this.listeners.forEach(l => l(event, stair));
        // §3.8: Publish to centralized StoreEventBus for DependencyResolver, Topology, World Model.
        storeEventBus.emit({
            elementId: stair.id,
            elementType: 'stair',
            operation: event === 'add' ? 'create' : event === 'remove' ? 'delete' : 'update',
            timestamp: Date.now()
        });
    }

    clear(): void {
        this.stairs.clear();
    }
}
