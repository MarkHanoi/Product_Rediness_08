/**
 * @file LightingStore.ts
 *
 * Plain DTO store for placed lighting fixtures.
 *
 * Contract compliance:
 *  §01 §3 — stores hold plain DTOs only; no THREE.js objects, no classes.
 *  §01 §3.4 — add() / update() accept plain objects; returns void.
 *  §03 §3   — getAll() returns structuredClone'd copies.
 */

import { LightingData } from './LightingTypes';
import { DOMEventBus } from '@pryzm/event-bus';
// §L-1032 — used by `changeLevel` ONLY, deliberately. See that method's doc
// comment for why it is not added to `add`/`update`/`remove` in the same pass.
// This introduces no new package edge: `LightingTypes` (:29) already imports
// `@pryzm/core-app-model` at module load, so the barrel is loaded either way.
import { storeEventBus } from '@pryzm/core-app-model';
const _bus = new DOMEventBus();

export class LightingStore {
    private readonly _data = new Map<string, LightingData>();

    add(data: LightingData): void {
        this._data.set(data.id, Object.freeze({ ...data }));
        _bus.emit('bim-lighting-added', { id: data.id }); // F.events.18
    }

    update(id: string, patch: Partial<LightingData>): void {
        const existing = this._data.get(id);
        if (!existing) return;
        const merged = Object.freeze({ ...existing, ...patch, id });
        this._data.set(id, merged);
        _bus.emit('bim-lighting-updated', { id }); // F.events.18
    }

    /**
     * §L-1032 — MOVE a lighting fixture to a different storey.
     *
     * ─── WHY THIS IS A NAMED OPERATION AND NOT `update(id, {levelId})` ───────
     * Unlike its slab / column / furniture / plumbing siblings this store's
     * `update()` is a MERGE, not a replace — the DECLARED row in the measured
     * table `apps/editor/src/engine/undo/legacyStoreUpdateSemantics.ts:248-253`:
     *
     *     lighting: { semantics: 'merge',
     *                 evidence: 'LightingStore.ts:24-30 ({ ...existing, ...patch, id })',
     *                 note: '`id` is re-attached last, so it cannot be
     *                        overwritten; the result is frozen.' }
     *
     * (that row's line span was measured before this method was inserted;
     * `update()` is now :28-35 in this file. The SEMANTICS is what the row
     * declares and that is unchanged — do not "fix" the row by re-typing the
     * span without re-measuring the body.)
     *
     * So a `{levelId}` partial through `update()` would NOT annihilate the
     * record. This method still exists, for three reasons that are about
     * correctness rather than about surviving the write:
     *
     *   1. `elementUndoStoreAdapter` routes a depth-2 `levelId` inverse patch to
     *      `store.changeLevel()` only when `typeof store.changeLevel ===
     *      'function'` (`elementUndoStoreAdapter.ts:506`). Without this method
     *      the undo of a lighting storey move takes the generic `update()` path,
     *      which — see (3) — cannot reach the semantic bus.
     *   2. `update()` cannot REFUSE. A no-op move, an empty destination and a
     *      HOSTED fixture are three different answers, and a merge that silently
     *      accepts all three is the §context-data-honesty failure: "already
     *      correct", "nowhere to go" and "must not move" all read as success.
     *   3. THE FAN-OUT. See the next block — this is the load-bearing half.
     *
     * ─── THE `storeEventBus` DECISION, STATED DELIBERATELY ──────────────────
     * MEASURED: this store's `add` / `update` / `remove` emit ONLY the legacy
     * DOM event bus — `bim-lighting-added` / `-updated` / `-removed` (:26, :34,
     * :190). None of them touches `storeEventBus`. Every other geometry store in
     * the repo emits BOTH (compare `FurnitureStore.ts:23-24`,
     * `PlumbingStore.ts:11-12`, `RoofStore.ts:87-88`). The consequence is real:
     * `ViewDependencyTracker._onStoreEvent` resolves an element's storey from
     * the SEMANTIC bus, so today no lighting mutation of any kind dirties a plan
     * view through that path.
     *
     * THIS METHOD DOES EMIT ON `storeEventBus`; `update()` IS LEFT ALONE.
     * Deliberate, and the asymmetry is the point:
     *   • Adding the emit inside `update()` would change behaviour for every
     *     existing caller of a method with a large, unmeasured call graph —
     *     turning a repo-wide silence into repo-wide traffic in a level-change
     *     PR. That is a separate change with a separate blast radius.
     *   • Adding it HERE changes behaviour for exactly zero existing callers,
     *     because this method has none. A new operation may be born correct.
     *   • Without it a lighting storey move would be invisible to the semantic
     *     bus, and the destination storey's plan view would keep an empty spot
     *     until some unrelated edit happened by — the §committed-is-not-reachable
     *     shape, in the layer the user experiences.
     * The silence of `update()` is recorded as a PRE-EXISTING defect of this
     * store, not fixed here, and not smoothed over either.
     *
     * ─── HOSTED FIXTURES REFUSE ─────────────────────────────────────────────
     * `LightingData.hostId` (`LightingTypes.ts:235`) binds a fixture to a host
     * element — the doc comment's own example is "a furniture surface this
     * fixture sits on". Nothing in this repo re-resolves or degrades that edge:
     * a sweep for `hostId` across `packages/geometry-lighting`, `plugins/lighting`
     * and `apps/editor/src` finds exactly one writer (`CreateLightingCommand.ts:47`
     * → `:130`) and one reader (`ProjectLoader.ts:1308`, a load round-trip).
     * Moving the fixture's storey while its host stays put would therefore leave
     * a host reference pointing across a floor slab, permanently, with nothing
     * to notice — the opposite of the "host-reference edges DEGRADE rather than
     * dangle" clause the level-change chain is supposed to honour. C16 CA-18: a
     * verb that cannot commit REFUSES and names why. So it refuses here, in the
     * only layer that can see the field — the PLUGIN DTO `Lighting` schema
     * (`packages/schemas/src/elements/Lighting.ts`) declares no `hostId` at all,
     * so `ChangeLightingLevelHandler.canExecute` structurally cannot ask.
     *
     * The branch is unreachable in production TODAY and that is stated rather
     * than hidden: no placement path sets `hostId` (`LightingTool.ts:252`,
     * `LightingPlanToolHandler.ts:129`, `CreateLightingByRoomCommand.ts:70`,
     * `officeFurnish.ts:160` and `buildLightingCommands.ts:106` all omit it), so
     * every live fixture is unhosted and takes the moving path. This is a gate
     * armed for the day the binding gets written, not one that withholds a
     * capability anyone has.
     *
     * ─── WHAT THIS DOES NOT DO ──────────────────────────────────────────────
     * Spatial-authority registration (bimManager `level.childrenIds`, the
     * view-dependency element→level map) is NOT updated here — the identical
     * contract `SlabStore.changeLevel` (`packages/geometry-slab/src/SlabStore.ts:314`)
     * and `RoofStore.changeLevel` (`packages/geometry-roof/src/RoofStore.ts:153`)
     * both state. `apps/editor/src/engine/elementLevelChangedMirror.ts`
     * `applyElementLevelChange` owns that half for EVERY family.
     *
     * ⚠ NOR does it move the fixture's HEIGHT. `LightingFragmentBuilder` seats
     * the group with `group.position.set(x, y, z)` straight from `data.position`
     * (`LightingFragmentBuilder.ts:344-345`) — an ABSOLUTE world coordinate, not
     * a level-relative one, unlike the slab and roof builders which re-derive
     * `worldY` from `level.elevation` on every update. This store holds no level
     * table and the adapter's call signature is fixed at two arguments, so there
     * is nowhere for a destination elevation to arrive; inventing one would be
     * the §DIAG-WALL-LEVEL trap in a new place. A moved fixture's STOREY
     * ASSIGNMENT changes (`getAllForLevel`, plan-view filtering, the level
     * browser, IFC containment); its 3-D height does not.
     *
     * Returns the moved record, or `undefined` when there is nothing to move —
     * which the caller must report as a refusal rather than logging success over
     * a no-op (§context-data-honesty: failure and emptiness are the same value).
     */
    changeLevel(id: string, newLevelId: string): LightingData | undefined {
        const existing = this._data.get(id);
        if (!existing) return undefined;
        // An empty destination is REFUSED, never defaulted to the active level.
        // `'' ?? activeLevelId` is the §DIAG-WALL-LEVEL trap: a silent default
        // files the fixture on whatever storey happens to be open.
        if (!newLevelId) return undefined;
        // Already there: return the record untouched and emit NOTHING.
        if (existing.levelId === newLevelId) return existing;
        if (existing.hostId) {
            // C16 CA-18 — refuse, and SAY why. A silent `return undefined` here
            // would be indistinguishable from "no such fixture".
            console.warn(
                `[LightingStore] §L-1032 REFUSED — fixture '${id}' is hosted on '${existing.hostId}' ` +
                'and has no independent storey to change. Nothing in this repo re-resolves or degrades ' +
                'a lighting hostId, so moving the fixture alone would leave the binding pointing across ' +
                'a floor slab. Move the host, or clear hostId first.',
            );
            return undefined;
        }

        // `Object.freeze({ ...existing, ... })` is this store's own copy
        // convention (`add` :25, `update` :32). `LightingData` is fully
        // `readonly`, so the override belongs in the literal, not in an
        // assignment afterwards. There is no `parentId`, no `spatialRelationship`
        // and no `metadata` on the record (LightingTypes.ts:197-238) — nothing
        // else to keep in step. `roomId` is left alone deliberately: it is
        // resolved from plan-position by `LightingRoomResolver`, and re-deriving
        // it needs the destination storey's room set, which this store cannot see.
        const moved: LightingData = Object.freeze({ ...existing, levelId: newLevelId });

        this._data.set(id, moved);
        _bus.emit('bim-lighting-updated', { id }); // F.events.18
        // §L-1032 — the semantic-bus emit this store otherwise never makes. See
        // "THE `storeEventBus` DECISION" above. `prevState` carries the frozen
        // PRE-mutation record so a diff-based subscriber can dirty the storey
        // being VACATED (C72 §3.2/§3.5); it must never be reconstructed by
        // re-reading the store, which diffs the new value against itself.
        storeEventBus.emit({
            elementId: id, elementType: 'lighting', operation: 'update',
            timestamp: Date.now(), prevState: existing,
        });
        return moved;
    }

    remove(id: string): void {
        if (!this._data.has(id)) return;
        this._data.delete(id);
        _bus.emit('bim-lighting-removed', { id }); // F.events.18
    }

    get(id: string): LightingData | undefined {
        const d = this._data.get(id);
        return d ? structuredClone(d) : undefined;
    }

    getAll(): LightingData[] {
        return [...this._data.values()].map(d => structuredClone(d));
    }

    getAllForLevel(levelId: string): LightingData[] {
        return this.getAll().filter(d => d.levelId === levelId);
    }

    /** Lighting fixtures whose `roomId` matches the given room. */
    getAllForRoom(roomId: string): LightingData[] {
        return this.getAll().filter(d => d.roomId === roomId);
    }

    has(id: string): boolean {
        return this._data.has(id);
    }

    get size(): number {
        return this._data.size;
    }
}
