import { FurnitureData } from './FurnitureTypes';
import { storeEventBus } from '@pryzm/core-app-model';
import { produce } from 'immer';
import { DOMEventBus } from '@pryzm/event-bus';
const _bus = new DOMEventBus();

export class FurnitureStore {
    private furniture = new Map<string, FurnitureData>();

    /**
     * §01 §2.2.3 — Use Immer's `produce` for structural sharing snapshots
     * instead of structuredClone(). produce() returns a deeply-frozen object
     * that shares unmodified branches with the source — cheaper, immutable,
     * and contract-aligned with the rest of the BIM kernel.
     */
    private snapshot(data: FurnitureData): FurnitureData {
        return produce(data, () => { /* no-op: returns frozen structural copy */ }) as FurnitureData;
    }

    add(data: FurnitureData): void {
        const snap = this.snapshot(data);
        this.furniture.set(snap.id, snap);
        _bus.emit('bim-furniture-added', { id: snap.id }); // F.events.18
        storeEventBus.emit({ elementId: snap.id, elementType: 'furniture', operation: 'create', timestamp: Date.now() });
    }

    update(id: string, data: FurnitureData): void {
        if (!this.furniture.has(id)) {
            console.warn(`[FurnitureStore] update() — ID not found: ${id}`);
            return;
        }
        const snap = this.snapshot(data);
        this.furniture.set(id, snap);
        _bus.emit('bim-furniture-updated', { id: snap.id }); // F.events.18
        storeEventBus.emit({ elementId: id, elementType: 'furniture', operation: 'update', timestamp: Date.now() });
    }

    /**
     * §L-1032 — MOVE a furniture item to a different storey.
     *
     * ─── WHY THIS IS A NAMED OPERATION AND NOT `update(id, {levelId})` ───────
     * `update()` above is a WHOLE-RECORD REPLACE. That is not a reading of the
     * code alone — it is the DECLARED row for this store in the measured table
     * `apps/editor/src/engine/undo/legacyStoreUpdateSemantics.ts:128-135`:
     *
     *     furniture: { semantics: 'replace',
     *                  evidence: 'FurnitureStore.ts:27-36',
     *                  note: 'update(id, data: FurnitureData) → snapshot(data) →
     *                         set(id, snap). Warns on an absent id (:29) but never
     *                         on a partial. It then emits `bim-furniture-updated`
     *                         with `snap.id`, which a one-key partial makes
     *                         `undefined`.' }
     *
     * The static signature says `data: FurnitureData`, so a `{levelId}` partial
     * does not typecheck — but `elementUndoStoreAdapter` calls `update` through
     * an untyped `LegacyElementStoreLike`, and there the compiler is not in the
     * room. Handed a one-key partial this store would seat `{levelId}` — no id,
     * no position, no dimensions, deep-frozen, still under its own key — and
     * then announce it as `bim-furniture-updated { id: undefined }`. That is the
     * L-977 annihilation with the event that would have surfaced it also broken.
     *
     * The adapter tests `typeof store.changeLevel === 'function'` before routing
     * a `levelId` inverse patch (`elementUndoStoreAdapter.ts:506`); a family that
     * fails that test falls through to exactly the write above. So the operation
     * gets its own name, symmetric with `SlabStore.changeLevel`
     * (`packages/geometry-slab/src/SlabStore.ts:314`) and `RoofStore.changeLevel`
     * (`packages/geometry-roof/src/RoofStore.ts:153`).
     *
     * ─── WHAT THIS DOES NOT DO, AND WHY ─────────────────────────────────────
     * Spatial-authority registration (bimManager `level.childrenIds`, the
     * view-dependency element→level map) is NOT updated here — the identical
     * contract `SlabStore.changeLevel` and `RoofStore.changeLevel` both state in
     * their own doc comments. `apps/editor/src/engine/elementLevelChangedMirror.ts`
     * `applyElementLevelChange` owns that half for EVERY family, so the ordering
     * rule (move the record FIRST, re-register SECOND, dirty BOTH storeys THIRD)
     * lives in one place rather than in thirteen stores.
     *
     * ⚠ NOR does it move the item's HEIGHT, and that is a measured limitation of
     * this family rather than an oversight. `FurnitureFragmentBuilder` does NOT
     * re-derive `worldY` from the level's elevation the way the slab and roof
     * builders do — it seats the root at `furnitureWorldY(data.position.y,
     * baseOffset)` (`FurnitureFragmentBuilder.ts:148-150, 277-279`), and
     * `data.position.y` is an ABSOLUTE world floor datum stamped at CREATE time
     * (`initTools.ts:2185-2200` — "position.y remains the storey FLOOR datum").
     * `levelName` / `levelElevation` are likewise denormalised copies of the
     * level record, stamped at create and only ever forwarded into `userData`
     * (`FurnitureFragmentBuilder.ts:104-105`).
     *
     * They are deliberately left ALONE here, because this store cannot know the
     * destination level's elevation: it holds no `ProjectContext` and no level
     * table (unlike `RoofStore`, whose constructor takes one), and the signature
     * the undo adapter calls is fixed at two arguments — there is nowhere for an
     * elevation to arrive. Inventing one would be the §DIAG-WALL-LEVEL trap in a
     * new place. The honest consequence, recorded rather than smoothed over: a
     * moved item's STOREY ASSIGNMENT changes (plan-view filtering, the level
     * browser, `getByLevel`, IFC containment) while its 3-D height does not.
     * Closing that needs the level elevation carried to this layer — the same
     * `elevationField` mechanism `wall.changeLevel` already has in
     * `@pryzm/command-bus/levelChangeVerbs.ts:88` — and is NOT done here.
     *
     * Returns the moved record, or `undefined` when there is nothing to move,
     * which the caller must report as a refusal rather than logging success over
     * a no-op (§context-data-honesty: failure and emptiness are the same value).
     */
    changeLevel(id: string, newLevelId: string): FurnitureData | undefined {
        const existing = this.furniture.get(id);
        if (!existing) return undefined;
        // An empty destination is REFUSED, never defaulted to the active level.
        // `'' ?? activeLevelId` is the §DIAG-WALL-LEVEL trap: a silent default
        // files the item on whatever storey happens to be open.
        if (!newLevelId) return undefined;
        // Already there: return the record untouched and emit NOTHING. An
        // emission here would dirty two plan views and bump the builder's
        // version counter for a change that did not happen.
        if (existing.levelId === newLevelId) return existing;

        // `produce` is this store's own snapshot convention (:16-18) — a deeply
        // frozen copy that shares every unmodified branch with the source, so
        // `existing` below is still a valid pre-mutation record to forward.
        // There is no `parentId`, no `spatialRelationship` and no `metadata` on
        // `FurnitureData` (see FurnitureTypes.ts) — nothing else to keep in step.
        const moved = produce(existing, draft => { draft.levelId = newLevelId; });

        this.furniture.set(id, moved);
        _bus.emit('bim-furniture-updated', { id: moved.id }); // F.events.18
        // `prevState` carries the frozen PRE-mutation record so a diff-based
        // subscriber can dirty the storey being VACATED (C72 §3.2/§3.5). It must
        // never be reconstructed by re-reading the store — that diffs the new
        // value against itself.
        storeEventBus.emit({
            elementId: id, elementType: 'furniture', operation: 'update',
            timestamp: Date.now(), prevState: existing,
        });
        return moved;
    }

    get(id: string): FurnitureData | undefined {
        return this.furniture.get(id);
    }

    remove(id: string): void {
        this.furniture.delete(id);
        _bus.emit('bim-furniture-removed', { id }); // F.events.18
        storeEventBus.emit({ elementId: id, elementType: 'furniture', operation: 'delete', timestamp: Date.now() });
    }

    getAll(): FurnitureData[] {
        return Array.from(this.furniture.values());
    }

    clear(): void {
        this.furniture.clear();
    }
}
