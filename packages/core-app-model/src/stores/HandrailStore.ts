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
// §STEP7 (C72 §3.1, gap PR-03): 'update' emissions carry the PRE-MUTATION
// handrail as an optional third argument, captured before the clone/merge —
// never re-read after the write (C72 §3.5). Absent on 'add'/'remove', and
// absent on a restoreSnapshot for an id with no stored prior.
type HandrailEventListener = (event: HandrailEventType, handrail: HandrailData, prevState?: HandrailData) => void;

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
        // §STEP7: `handrail` is the pre-mutation record, captured before the clone/merge.
        this.emit('update', updated, handrail);
        return updated;
    }

    /**
     * §L-1032 — MOVE a handrail to a different storey.
     *
     * ─── WHY THIS IS A NAMED OPERATION AND NOT `update(id, {levelId})` ───────
     * `update()` above is a MERGE — `structuredClone` + `Object.assign`
     * (`HandrailStore.ts:56-66`), the semantics
     * `apps/editor/src/engine/undo/legacyStoreUpdateSemantics.ts` declares for
     * this store (`handrail: { semantics: 'merge', evidence:
     * 'HandrailStore.ts:56-66 (structuredClone + Object.assign)' }`, re-derived
     * from the real class by `LegacyStoreUpdateSemantics.measured.test.ts`). So,
     * unlike the REPLACE stores, a one-key `{levelId}` partial would not
     * annihilate the record — and it is still the wrong write, for three reasons
     * a caller cannot see:
     *
     *   • `add()` parents every handrail to its storey (`handrail.parentId =
     *     levelId`, `:42`). A `{levelId}` merge leaves `parentId` on the storey
     *     the handrail just left, so the record disagrees with itself.
     *   • `HandrailData extends CoreElement`, whose `spatialRelationship` MIRRORS
     *     BimManager's `Level.childrenIds` contract (`CoreElement.ts:46-52`) and
     *     is what IFC export reads for storey containment. A merge leaves it on
     *     the old storey — a second copy of the same fact, disagreeing.
     *   • `elementUndoStoreAdapter`'s §L-946 arm tests
     *     `typeof store.changeLevel === 'function'` BEFORE routing a `levelId`
     *     inverse patch. Without this method Ctrl+Z after a storey move falls
     *     through to the generic `update()` write and reproduces both defects
     *     above on the undo leg only, where nobody is looking.
     *
     * So the operation gets its own name, symmetric with `SlabStore.changeLevel`
     * (`packages/geometry-slab/src/SlabStore.ts:314`) and `RoofStore.changeLevel`
     * (`packages/geometry-roof/src/RoofStore.ts:153`).
     *
     * ─── WHY ONE 'update' AND NOT 'remove' + 'add' ──────────────────────────
     * `add()` mints `properties.mark` from `this.handrails.size` (`:46-48`), so a
     * remove+add round trip would RENUMBER the handrail; and 'remove' would tear
     * the fragment down along with any run-join state the neighbouring segments
     * depend on (`suppressStartPost`, C95 §D4). A move is not a delete. One
     * 'update' is everything the renderer needs: the fragment builder re-derives
     * world Y from `level.elevation` on every update.
     *
     * ─── WHAT THIS DOES NOT DO ──────────────────────────────────────────────
     * Spatial-authority registration (bimManager `level.childrenIds`, the
     * view-dependency element→level map) is NOT updated here — identical to the
     * contract `SlabStore.changeLevel` and `RoofStore.changeLevel` both state.
     * `apps/editor/src/engine/elementLevelChangedMirror.ts` owns that half for
     * every family, so the ordering rule lives in one place rather than in
     * thirteen stores.
     *
     * `metadata` is deliberately NOT stamped: no method in this store has ever
     * written it, so bumping a version counter here would mint a field this
     * family does not carry.
     *
     * Returns the moved record, or `undefined` when there is nothing to move —
     * failure and emptiness must not be the same value (§context-data-honesty).
     */
    changeLevel(id: string, newLevelId: string): HandrailData | undefined {
        const existing = this.handrails.get(id);
        if (!existing) return undefined;
        // An empty destination is REFUSED, never defaulted to the active level.
        // `add()` may do `handrail.levelId || activeLevelId` (`:38`) because a NEW
        // handrail has no storey yet; the same fallback on a MOVE is the
        // §DIAG-WALL-LEVEL trap that files the element on the ground floor.
        if (!newLevelId) return undefined;
        if (existing.levelId === newLevelId) return existing;

        // §3.4: same structuredClone shape `update()` uses, so a move and a field
        // edit leave the map holding structurally identical objects.
        const moved: HandrailData = structuredClone(existing);
        moved.levelId = newLevelId;
        // A handrail parented to something ELSE than its storey keeps that parent.
        if (existing.parentId === existing.levelId) moved.parentId = newLevelId;
        // Only rewritten when already PRESENT: minting one here would invent a
        // containment the record never asserted.
        if (moved.spatialRelationship) {
            moved.spatialRelationship = { ...moved.spatialRelationship, levelId: newLevelId };
        }

        this.handrails.set(id, moved);
        // §STEP7: `existing` is the pre-mutation record, captured before the clone,
        // so diff-based subscribers can dirty the storey being VACATED (C72 §3.5).
        this.emit('update', moved, existing);
        return moved;
    }

    restoreSnapshot(id: string, snapshot: HandrailData): void {
        // §STEP7: capture the stored prior BEFORE the write — a post-write read
        // would diff the snapshot against itself (C72 §3.5). Undefined when no
        // prior exists (restore into an empty slot behaves like an add).
        const prev = this.handrails.get(id);
        // §3.4: Clone snapshot to prevent external mutation of stored state.
        this.handrails.set(id, structuredClone(snapshot));
        this.emit('update', snapshot, prev);
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

    private emit(event: HandrailEventType, handrail: HandrailData, prevState?: HandrailData): void {
        const operation = event === 'add' ? 'create' : event === 'update' ? 'update' : 'delete';
        storeEventBus.emit({
            elementId: handrail.id,
            elementType: 'handrail',
            operation,
            timestamp: Date.now()
        });

        this.listeners.forEach(l => l(event, handrail, prevState));

        if (event === 'add') _bus.emit('bim-handrail-added', { id: handrail.id }); // F.events.17
        else if (event === 'update') _bus.emit('bim-handrail-updated', { id: handrail.id });
        else _bus.emit('bim-handrail-removed', { id: handrail.id });
    }
}
