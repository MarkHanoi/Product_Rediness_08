import { PlumbingFixtureData } from './PlumbingTypes';
import { storeEventBus } from '@pryzm/core-app-model';
import { DOMEventBus } from '@pryzm/event-bus';
const _bus = new DOMEventBus();

export class PlumbingStore {
    private fixtures = new Map<string, PlumbingFixtureData>();

    add(data: PlumbingFixtureData): void {
        this.fixtures.set(data.id, structuredClone(data));
        _bus.emit('bim-plumbing-added', { id: data.id }); // F.events.18
        storeEventBus.emit({ elementId: data.id, elementType: 'plumbing', operation: 'create', timestamp: Date.now() });
        console.log(`PlumbingStore: Added fixture ${data.id} of type ${data.fixtureType}`);
    }

    get(id: string): PlumbingFixtureData | undefined {
        return this.fixtures.get(id);
    }

    remove(id: string): void {
        this.fixtures.delete(id);
        // NOTE: remove() previously emitted no event at all. Added DOM and bus events for full parity.
        _bus.emit('bim-plumbing-removed', { id }); // F.events.18
        storeEventBus.emit({ elementId: id, elementType: 'plumbing', operation: 'delete', timestamp: Date.now() });
    }

    update(id: string, data: PlumbingFixtureData): void {
        this.fixtures.set(id, structuredClone(data));
        _bus.emit('bim-plumbing-updated', { id: data.id }); // F.events.18
        storeEventBus.emit({ elementId: id, elementType: 'plumbing', operation: 'update', timestamp: Date.now() });
    }

    /**
     * §L-1032 — MOVE a plumbing fixture to a different storey.
     *
     * ─── WHY THIS IS A NAMED OPERATION AND NOT `update(id, {levelId})` ───────
     * `update()` above is a WHOLE-RECORD REPLACE **with no existence check at
     * all**. That is the DECLARED row for this store in the measured table
     * `apps/editor/src/engine/undo/legacyStoreUpdateSemantics.ts:136-143`:
     *
     *     plumbing: { semantics: 'replace',
     *                 evidence: 'PlumbingStore.ts:27-31',
     *                 note: 'update(id, data) → set(id, structuredClone(data))
     *                        with NO existence check at all — it will happily
     *                        mint a record from a partial. The adapter\'s own
     *                        `_exists` guard is the only thing standing between
     *                        a stray patch and a phantom fixture.' }
     *
     * So this store fails L-977 twice over: handed `{levelId}` it seats a
     * fixture that is nothing but a level id, and handed an id it has never
     * seen it CREATES that fixture rather than refusing. `update` then emits
     * `bim-plumbing-updated { id: data.id }` — `undefined` for a partial — so
     * the one event that could have surfaced either is broken too.
     *
     * `elementUndoStoreAdapter` tests `typeof store.changeLevel === 'function'`
     * before routing a `levelId` inverse patch (`elementUndoStoreAdapter.ts:506`)
     * and a family failing that test falls through to precisely that write. This
     * method therefore checks existence ITSELF (below) rather than relying on
     * the adapter's `_exists` guard: the guard is one caller's courtesy, not a
     * property of this store, and a second caller would not inherit it.
     *
     * Symmetric with `SlabStore.changeLevel` (`packages/geometry-slab/src/SlabStore.ts:314`)
     * and `RoofStore.changeLevel` (`packages/geometry-roof/src/RoofStore.ts:153`).
     *
     * ─── WHAT THIS DOES NOT DO, AND WHY ─────────────────────────────────────
     * Spatial-authority registration (bimManager `level.childrenIds`, the
     * view-dependency element→level map) is NOT updated here — the identical
     * contract `SlabStore.changeLevel` and `RoofStore.changeLevel` both state in
     * their own doc comments. `apps/editor/src/engine/elementLevelChangedMirror.ts`
     * `applyElementLevelChange` owns that half for EVERY family so the ordering
     * rule (move the record FIRST, re-register SECOND, dirty BOTH storeys THIRD)
     * lives in one place rather than in thirteen stores.
     *
     * ⚠ NOR does it move the fixture's HEIGHT, and that is a measured limitation
     * of this family. `PlumbingFragmentBuilder` does NOT re-derive `worldY` from
     * the level's elevation the way the slab and roof builders do — it seats the
     * root with `root.position.copy(data.position)` (`PlumbingFragmentBuilder.ts:88`),
     * so `data.position.y` is an ABSOLUTE world coordinate. `levelName` /
     * `levelElevation` are denormalised copies of the level record stamped at
     * create time and only ever forwarded into `userData`
     * (`PlumbingFragmentBuilder.ts:32-33`).
     *
     * They are deliberately left ALONE, because this store cannot know the
     * destination level's elevation: it holds no `ProjectContext` and no level
     * table (unlike `RoofStore`, whose constructor takes one), and the signature
     * the undo adapter calls is fixed at two arguments — there is nowhere for an
     * elevation to arrive. Inventing one would be the §DIAG-WALL-LEVEL trap in a
     * new place. The honest consequence: a moved fixture's STOREY ASSIGNMENT
     * changes (plan-view filtering, the level browser, IFC containment) while its
     * 3-D height does not. Closing that needs the level elevation carried to this
     * layer — the `elevationField` mechanism `wall.changeLevel` already has in
     * `@pryzm/command-bus/levelChangeVerbs.ts:88` — and is NOT done here.
     *
     * Returns the moved record, or `undefined` when there is nothing to move,
     * which the caller must report as a refusal rather than logging success over
     * a no-op (§context-data-honesty: failure and emptiness are the same value).
     */
    changeLevel(id: string, newLevelId: string): PlumbingFixtureData | undefined {
        const existing = this.fixtures.get(id);
        // THE CHECK `update()` DOES NOT HAVE. Without it this method would mint
        // a phantom fixture from an id nobody placed, exactly as `update` does.
        if (!existing) return undefined;
        // An empty destination is REFUSED, never defaulted to the active level.
        // `'' ?? activeLevelId` is the §DIAG-WALL-LEVEL trap: a silent default
        // files the fixture on whatever storey happens to be open.
        if (!newLevelId) return undefined;
        // Already there: return the record untouched and emit NOTHING. An
        // emission here would dirty two plan views and bump the builder's
        // version counter for a change that did not happen.
        if (existing.levelId === newLevelId) return existing;

        // `structuredClone` is this store's own copy convention (`add` :10,
        // `update` :28) and every record in the map arrived through one of
        // those, so it is provably clone-safe here. There is no `parentId`, no
        // `spatialRelationship` and no `metadata` on `PlumbingFixtureData` (see
        // PlumbingTypes.ts:17-49) — nothing else to keep in step.
        const moved = structuredClone(existing);
        moved.levelId = newLevelId;

        this.fixtures.set(id, moved);
        _bus.emit('bim-plumbing-updated', { id: moved.id }); // F.events.18
        // `prevState` carries the PRE-mutation record so a diff-based subscriber
        // can dirty the storey being VACATED (C72 §3.2/§3.5). It must never be
        // reconstructed by re-reading the store — that diffs the new value
        // against itself.
        storeEventBus.emit({
            elementId: id, elementType: 'plumbing', operation: 'update',
            timestamp: Date.now(), prevState: existing,
        });
        return moved;
    }

    getAll(): PlumbingFixtureData[] {
        return Array.from(this.fixtures.values());
    }

    clear(): void {
        this.fixtures.clear();
    }
}
