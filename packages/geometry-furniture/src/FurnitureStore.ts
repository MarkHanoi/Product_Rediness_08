import { FurnitureData } from './FurnitureTypes';
import { storeEventBus } from '@pryzm/core-app-model';
import { produce } from 'immer';
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
     * ─── §L-1087 — THE HEIGHT MOVES HERE, AND IT MOVES BY A DELTA ───────────
     * ⚠ THIS DOC COMMENT USED TO SAY the height *"does not"* move and that the
     * limitation was structural. It is closed. `FurnitureFragmentBuilder` still
     * does NOT re-derive `worldY` from the level's elevation the way the slab and
     * roof builders do — it seats the root at `furnitureWorldY(data.position.y,
     * baseOffset)` (`FurnitureFragmentBuilder.ts:148-150, 277-279`) and the file
     * contains no `getLevelById` at all — so `data.position.y` remains an
     * ABSOLUTE world FLOOR datum. The builder is left alone; the RECORD is what
     * moves, which is the smaller change and keeps the datum contract in
     * `furnitureElevation.ts:33-35` (`worldY = floorY + mountOffset`) intact.
     *
     * Three rules, each load-bearing:
     *
     *   • **The store never reaches for a level table.** It receives NUMBERS.
     *     This class holds no `ProjectContext` and must not acquire one: a second
     *     authority for "what elevation is this storey" inside a store is C84
     *     EI-9. The caller resolves both elevations from the level authority
     *     (`bimManager`, which it already holds on the forward and inverse legs)
     *     and hands them down.
     *   • **Missing elevations REFUSE** (`undefined` + a named warn). Moving the
     *     storey while silently leaving `position.y` behind is precisely the
     *     defect this block used to describe as unavoidable — a chair re-filed
     *     onto Level 2 and still hovering at Level 1's height, with nothing
     *     reporting it. §context-data-honesty: a refusal is a correct answer.
     *   • **DELTA, not assignment.** `position.y += (newElevation -
     *     previousElevation)`. `position.y` is the FLOOR datum and `baseOffset`
     *     is added on top of it by the builder, so a delta carries the item's
     *     floor to the new storey and its mount offset follows for free — a wall
     *     unit 1.45 m up stays 1.45 m up. `position.y = newElevation` would be
     *     equivalent ONLY while the datum is exactly the floor, and would slam
     *     any item authored off-datum onto the floor. Delta is the invariant.
     *
     * ─── `levelName` / `levelElevation`: REFRESHED, NOT LEFT STALE ──────────
     * Both are DENORMALISED COPIES of the level record (`FurnitureTypes.ts:289-290`)
     * and both are forwarded into mesh `userData`
     * (`FurnitureFragmentBuilder.ts:104-105`), so they are USER-VISIBLE. Left
     * alone across a move they would name the storey the item just LEFT — the
     * record disagreeing with itself, a defect with a delay fuse.
     *
     * DELETING them was considered and rejected for this lane, on measurement,
     * not taste: `levelElevation` appears at 282 sites repo-wide and `levelName`
     * at 123, and this family's writers live in `apps/editor/src/engine/initTools.ts`
     * and `plugins/<family>/src/handlers/` — paths another lane owns. Removing a
     * REQUIRED field from the DTO from inside this package would break them, so
     * it is a separate, whole-repo change and is named here rather than
     * half-started.
     *
     * So they are REFRESHED:
     *   • `levelElevation := newElevation` — unconditional and exactly truthful.
     *     It is the same number the delta was computed from, from the same
     *     authority, in the same write. No new fact is invented.
     *   • `levelName := opts.newLevelName` when the caller supplies it. When it
     *     does NOT, this store has no way to learn the destination's NAME, and
     *     the two dishonest options are (a) keep the old name — which points at
     *     the WRONG storey — or (b) invent one. It does neither: it writes the
     *     destination `levelId`, which is a coarser but TRUE identifier of the
     *     CORRECT storey, and warns that the name was degraded. Callers that want
     *     the display name pass `newLevelName`; callers that do not still never
     *     get a label pointing at the storey the item left.
     *
     * Returns the moved record, or `undefined` when there is nothing to move,
     * which the caller must report as a refusal rather than logging success over
     * a no-op (§context-data-honesty: failure and emptiness are the same value).
     */
    changeLevel(
        id: string,
        newLevelId: string,
        opts?: { newElevation?: number; previousElevation?: number; newLevelName?: string },
    ): FurnitureData | undefined {
        const existing = this.furniture.get(id);
        if (!existing) return undefined;
        // An empty destination is REFUSED, never defaulted to the active level.
        // `'' ?? activeLevelId` is the §DIAG-WALL-LEVEL trap: a silent default
        // files the item on whatever storey happens to be open.
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
                `[FurnitureStore] §L-1087 REFUSED — item '${id}' NOT moved to level '${newLevelId}'. ` +
                'changeLevel needs BOTH `previousElevation` and `newElevation`, resolved by the ' +
                'caller from the level authority (this store holds no level table and must never ' +
                'fabricate one — §DIAG-WALL-LEVEL). Got previousElevation=' +
                `${String(previousElevation)}, newElevation=${String(newElevation)}. ` +
                'Moving the storey without the height would leave the item hovering at the old ' +
                "floor's level with nothing reporting it (FurnitureFragmentBuilder.ts:277-282).",
            );
            return undefined;
        }
        const deltaY = newElevation - previousElevation;

        // The destination's NAME cannot be derived here — see the doc comment.
        // Absent it, the denormalised label degrades to the destination's ID (a
        // true identifier of the right storey) rather than staying a name of the
        // wrong one, and the degradation is announced.
        const newLevelName = typeof opts?.newLevelName === 'string' && opts.newLevelName.length > 0
            ? opts.newLevelName
            : undefined;
        if (newLevelName === undefined) {
            console.warn(
                `[FurnitureStore] §L-1087 — item '${id}' moved to level '${newLevelId}' without a ` +
                '`newLevelName`. `levelName` is a denormalised copy forwarded into mesh userData ' +
                '(FurnitureFragmentBuilder.ts:104), so it is set to the destination levelId rather ' +
                'than left naming the storey the item just left. Pass `newLevelName` for the display name.',
            );
        }

        // `produce` is this store's own snapshot convention (:16-18) — a deeply
        // frozen copy that shares every unmodified branch with the source, so
        // `existing` below is still a valid pre-mutation record to forward, and
        // the `position` sub-object is COPIED rather than shared (a hand-rolled
        // shallow spread would have aliased it and mutated the pre-state too).
        // There is no `parentId`, no `spatialRelationship` and no `metadata` on
        // `FurnitureData` (see FurnitureTypes.ts) — nothing else to keep in step.
        const moved = produce(existing, draft => {
            draft.levelId = newLevelId;
            // FLOOR datum carried by the delta; `baseOffset` is added on top of
            // it by the builder, so the mount height above the floor survives.
            draft.position.y = snapNanometre(draft.position.y + deltaY);
            draft.levelElevation = newElevation;
            draft.levelName = newLevelName ?? newLevelId;
        });

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
     * 'FurnitureStore'`.
     *
     * The alias is the SMALLER repair: widening the mirror's interface to
     * `getById | get` would weaken that proof for all twelve families in order to
     * accommodate two stores' naming.
     *
     * Delegates to `get()` so there is exactly ONE read path — same frozen
     * `produce()` snapshot reference, no extra allocation. `get()` is kept; this
     * is an addition, not a rename, so no existing caller changes.
     */
    getById(id: string): FurnitureData | undefined {
        return this.get(id);
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
