import { PlumbingFixtureData } from './PlumbingTypes';
import { storeEventBus } from '@pryzm/core-app-model';
import { DOMEventBus } from '@pryzm/event-bus';
const _bus = new DOMEventBus();

/**
 * §L-1087 — snap a delta-shifted world Y to the nanometre grid.
 *
 * WHY THIS EXISTS, MEASURED. `y += (newElevation - previousElevation)` is NOT
 * invertible in binary64: seeded at 2.6 and shifted +3 the result is exactly
 * 5.6, but shifting it back by -3 yields **2.5999999999999996**. So the undo of
 * a storey move would restore a record that is not the record the edit started
 * from — C84 EI-7 ("undo restores what the edit wrote") failing by 4e-16 m, and
 * failing PERMANENTLY, because every equality-based dirty check downstream would
 * then see a document that never returns to clean.
 *
 * Snapping to 1e-9 m removes exactly that float noise: it is a million times
 * finer than any tolerance this repo models with, and it leaves every coordinate
 * that lies on a decimal grid coarser than a nanometre — which is every authored
 * coordinate — bit-identical after a forward-and-back move. Stated honestly:
 * this is NOT a proof of invertibility for arbitrary doubles, it is a guarantee
 * for the domain (metre-magnitude coordinates on a decimal grid). A coordinate
 * carrying real sub-nanometre information would be quantised, and no BIM datum
 * carries any.
 *
 * `toFixed` rather than `Math.round(y * 1e9) / 1e9` because the multiplication
 * form silently degrades past |y| ~ 9e6 m, where `y * 1e9` leaves the exact
 * integer range of a double.
 */
function snapNanometre(y: number): number {
    return Number(y.toFixed(9));
}

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

    /**
     * §L-1032 — `getById` alias, matching every other legacy element store.
     *
     * This store spelled its single-record read `get`, while `WallStore`,
     * `RoofStore`, `SlabStore`, `ColumnStore`, `CurtainWallStore` and `BeamStore`
     * all spell it `getById`. That divergence is not cosmetic: the level-change
     * mirror's `LegacyLevelMovableStore`
     * (`apps/editor/src/engine/elementLevelChangedMirror.ts:66-69`) declares
     * `{ changeLevel, getById }` and `initTools` types its deps with it **rather
     * than cast**, deliberately, so `tsc` is what proves the bridge is handed the
     * LEGACY store and not the plugin DTO store — a cast there would have made the
     * wiring un-checkable in exactly the place L-946's bug lived. Without this
     * alias `initTools.ts` reports `TS2741: Property 'getById' is missing in type
     * 'PlumbingStore'`.
     *
     * The alias is the SMALLER repair: widening the mirror's interface to
     * `getById | get` would weaken that proof for all twelve families in order to
     * accommodate two stores' naming.
     *
     * Delegates to `get()` so there is exactly ONE read path — the same internal
     * reference, no extra allocation. `get()` is kept; this is an addition, not a
     * rename, so no existing caller changes.
     */
    getById(id: string): PlumbingFixtureData | undefined {
        return this.get(id);
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
     * ─── §L-1087 — THE HEIGHT MOVES HERE, AND IT MOVES BY A DELTA ───────────
     * ⚠ THIS BLOCK USED TO SAY the height *"does not"* move and call it a
     * structural limitation. It is closed. `PlumbingFragmentBuilder` still does
     * NOT re-derive `worldY` from the level's elevation the way the slab and roof
     * builders do — it seats the root with `root.position.copy(data.position)`
     * (`PlumbingFragmentBuilder.ts:88`) and the file contains no `getLevelById`
     * at all — so `data.position.y` remains an ABSOLUTE world coordinate. The
     * builder is left alone; the RECORD is what moves.
     *
     * Three rules, each load-bearing:
     *
     *   • **The store never reaches for a level table.** It receives NUMBERS.
     *     This class holds no `ProjectContext` and must not acquire one: a second
     *     authority for "what elevation is this storey" inside a store is C84
     *     EI-9. The caller resolves both elevations from the level authority
     *     (`bimManager`, held on the forward and inverse legs) and hands them down.
     *   • **Missing elevations REFUSE** (`undefined` + a named warn). A WC
     *     re-filed onto Level 2 while still standing on Level 1's floor, with
     *     nothing reporting it, is the silently-wrong element
     *     `WallRake.ts:50-62` forbids — and it is why `plumbing` sat in
     *     `LEVEL_CHANGE_REFUSALS` with `disposition: 'deferred'`.
     *   • **DELTA, not assignment.** `position.y += (newElevation -
     *     previousElevation)`. `baseOffset` (`PlumbingTypes.ts:40`) is how far a
     *     fixture is mounted above its floor — a wall-hung basin or a wall WC is
     *     not at floor level — so `position.y = newElevation` would drop every
     *     wall-hung fixture onto the slab. The delta carries the mounting height.
     *
     * ─── `levelName` / `levelElevation`: REFRESHED, NOT LEFT STALE ──────────
     * Both are DENORMALISED COPIES of the level record (`PlumbingTypes.ts:38-39`)
     * and both are forwarded into mesh `userData` at SIX sites
     * (`PlumbingFragmentBuilder.ts:32-33, 69-70, 170-171, 189-190, 209-210,
     * 230-231, 312-313`), so they are USER-VISIBLE. Left alone across a move they
     * would name the storey the fixture just LEFT — the record disagreeing with
     * itself, a defect with a delay fuse.
     *
     * DELETING them was considered and rejected for this lane on measurement:
     * `levelElevation` appears at 282 sites repo-wide and `levelName` at 123, and
     * this family's writers live in `apps/editor/src/engine/initTools.ts` and
     * `plugins/<family>/src/handlers/` — paths another lane owns. Removing a REQUIRED
     * DTO field from inside this package would break them; that is a separate,
     * whole-repo change, named here rather than half-started.
     *
     * So they are REFRESHED:
     *   • `levelElevation := newElevation` — unconditional and exactly truthful:
     *     the same number the delta was computed from, from the same authority,
     *     in the same write. No new fact is invented.
     *   • `levelName := opts.newLevelName` when the caller supplies it. Absent
     *     it, this store cannot learn the destination's NAME; keeping the old one
     *     points at the WRONG storey and inventing one is a fabrication, so it
     *     writes the destination `levelId` — a coarser but TRUE identifier of the
     *     CORRECT storey — and warns that the name was degraded.
     *
     * Returns the moved record, or `undefined` when there is nothing to move,
     * which the caller must report as a refusal rather than logging success over
     * a no-op (§context-data-honesty: failure and emptiness are the same value).
     */
    changeLevel(
        id: string,
        newLevelId: string,
        opts?: { newElevation?: number; previousElevation?: number; newLevelName?: string },
    ): PlumbingFixtureData | undefined {
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
        // version counter for a change that did not happen. Deliberately ABOVE
        // the elevation gate — refusing a no-op for want of a number that would
        // be multiplied by zero would report a failure where there is none.
        if (existing.levelId === newLevelId) return existing;

        // §L-1087 — THE ANTI-HALF-MOVE GATE. Without BOTH elevations this method
        // cannot move the height, and moving the storey ALONE is the defect, not
        // a partial success. Refuse, name why, leave the record untouched.
        const newElevation = opts?.newElevation;
        const previousElevation = opts?.previousElevation;
        if (typeof newElevation !== 'number' || !Number.isFinite(newElevation)
            || typeof previousElevation !== 'number' || !Number.isFinite(previousElevation)) {
            console.warn(
                `[PlumbingStore] §L-1087 REFUSED — fixture '${id}' NOT moved to level '${newLevelId}'. ` +
                'changeLevel needs BOTH `previousElevation` and `newElevation`, resolved by the ' +
                'caller from the level authority (this store holds no level table and must never ' +
                'fabricate one — §DIAG-WALL-LEVEL). Got previousElevation=' +
                `${String(previousElevation)}, newElevation=${String(newElevation)}. ` +
                'Moving the storey without the height would leave the fixture standing at the old ' +
                "floor's level with nothing reporting it (PlumbingFragmentBuilder.ts:88).",
            );
            return undefined;
        }
        const deltaY = newElevation - previousElevation;

        // The destination's NAME cannot be derived here — see the doc comment.
        // Absent it the denormalised label degrades to the destination's ID (a
        // true identifier of the right storey) rather than staying a name of the
        // wrong one, and the degradation is announced.
        const newLevelName = typeof opts?.newLevelName === 'string' && opts.newLevelName.length > 0
            ? opts.newLevelName
            : undefined;
        if (newLevelName === undefined) {
            console.warn(
                `[PlumbingStore] §L-1087 — fixture '${id}' moved to level '${newLevelId}' without a ` +
                '`newLevelName`. `levelName` is a denormalised copy forwarded into mesh userData ' +
                '(PlumbingFragmentBuilder.ts:32), so it is set to the destination levelId rather ' +
                'than left naming the storey the fixture just left. Pass `newLevelName` for the display name.',
            );
        }

        // `structuredClone` is this store's own copy convention (`add` :10,
        // `update` :28) and every record in the map arrived through one of
        // those, so it is provably clone-safe here — and it DEEP-copies, so
        // mutating `moved.position.y` below cannot reach back into `existing`,
        // which is the `prevState` the emit forwards. There is no `parentId`, no
        // `spatialRelationship` and no `metadata` on `PlumbingFixtureData` (see
        // PlumbingTypes.ts:17-49) — nothing else to keep in step.
        const moved = structuredClone(existing);
        moved.levelId = newLevelId;
        // FLOOR datum carried by the delta; `baseOffset` (the mounting height
        // above that floor) is untouched, so a wall-hung fixture stays wall-hung.
        moved.position.y = snapNanometre(moved.position.y + deltaY);
        moved.levelElevation = newElevation;
        moved.levelName = newLevelName ?? newLevelId;

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
