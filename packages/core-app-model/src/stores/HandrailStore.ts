import { HandrailData } from './HandrailTypes';
import { ProjectContext } from '../context/ProjectContext';
import { storeEventBus } from '../StoreEventBus'; // TODO(TASK-08)
import { DOMEventBus } from '@pryzm/event-bus';
const _bus = new DOMEventBus();

/**
 * HandrailStore
 *
 * §3.5 Store Is Data Only — no builder calls, no bimManager, no elementRegistry access.
 *   - bimKernel.getLevelById() validation removed (belongs in ConstraintEngine or Command).
 *   - elementRegistry.registerSemantic() removed (moved to HandrailFragmentBuilder.buildHandrail()).
 *   - Level-removal cascading removed from constructor (moved to HandrailLevelCleanupHandler).
 * §3.4 Immutability — all stored objects are structuredClone'd.
 * §3.8 StoreEventBus — emitted on create, update, delete via private emit(). // TODO(TASK-08)
 */

type HandrailEventType = 'add' | 'update' | 'remove';
type HandrailEventListener = (event: HandrailEventType, handrail: HandrailData) => void;

export class HandrailStore {
    private handrails: Map<string, HandrailData> = new Map();
    private projectContext: ProjectContext;
    private listeners: HandrailEventListener[] = [];

    constructor(projectContext: ProjectContext) {
        this.projectContext = projectContext;
        // §3.5 FIX: Removed 'bim-level-removed' auto-mutation listener from store.
        // Level-removal cascading is now handled by HandrailLevelCleanupHandler (external).
        // §3.5 FIX: Removed bimKernel dependency — level validation belongs in the Command/Constraint layer.
    }

    add(handrail: HandrailData): void {
        const levelId = handrail.levelId || this.projectContext.activeLevelId;
        // §3.5 FIX: Level existence validation removed from store.
        // Level validation is the responsibility of the ConstraintEngine or Command layer.

        handrail.levelId = levelId;
        handrail.parentId = levelId;

        if (!handrail.properties) handrail.properties = {};
        if (!handrail.properties.mark) {
            handrail.properties.mark = `HR${(this.handrails.size + 1).toString().padStart(3, '0')}`;
        }

        // §3.4: Clone to prevent external callers from mutating internal store state.
        // §3.5 FIX: elementRegistry.registerSemantic() removed — moved to HandrailFragmentBuilder.buildHandrail().
        this.handrails.set(handrail.id, structuredClone(handrail));
        this.emit('add', handrail);
    }

    update(id: string, updates: Partial<HandrailData>): HandrailData | undefined {
        const handrail = this.handrails.get(id);
        if (!handrail) return undefined;
        // §3.4: structuredClone produces a fully immutable next-state object.
        const updated: HandrailData = structuredClone(handrail);
        Object.assign(updated, updates);
        this.handrails.set(id, updated);
        this.emit('update', updated);
        return updated;
    }

    restoreSnapshot(id: string, snapshot: HandrailData): void {
        // §3.4: Clone snapshot to prevent external mutation of stored state.
        this.handrails.set(id, structuredClone(snapshot));
        this.emit('update', snapshot);
    }

    remove(id: string): HandrailData | undefined {
        const handrail = this.handrails.get(id);
        if (handrail) {
            this.handrails.delete(id);
            this.emit('remove', handrail);
        }
        return handrail;
    }

    getById(id: string): HandrailData | undefined {
        return this.handrails.get(id);
    }

    getAll(): HandrailData[] {
        return Array.from(this.handrails.values());
    }

    /** @deprecated Use HandrailLevelCleanupHandler. Kept as fallback for direct callers. */
    removeByLevel(levelId: string): void {
        const toRemove = Array.from(this.handrails.values()).filter(h => h.levelId === levelId);
        toRemove.forEach(h => this.remove(h.id));
    }

    subscribe(listener: HandrailEventListener): () => void {
        this.listeners.push(listener);
        return () => {
            this.listeners = this.listeners.filter(l => l !== listener);
        };
    }

    private emit(event: HandrailEventType, handrail: HandrailData): void {
        const operation = event === 'add' ? 'create' : event === 'update' ? 'update' : 'delete';
        storeEventBus.emit({
            elementId: handrail.id,
            elementType: 'handrail',
            operation,
            timestamp: Date.now()
        });

        this.listeners.forEach(l => l(event, handrail));

        if (event === 'add') _bus.emit('bim-handrail-added', { id: handrail.id }); // F.events.17
        else if (event === 'update') _bus.emit('bim-handrail-updated', { id: handrail.id });
        else _bus.emit('bim-handrail-removed', { id: handrail.id });
    }
}
