import { ColumnData } from './ColumnTypes';
import { ProjectContext } from '@pryzm/core-app-model';
import { storeEventBus } from '@pryzm/core-app-model';
import { validateColumnData } from './ColumnValidator';
import { DOMEventBus } from '@pryzm/event-bus';
const _bus = new DOMEventBus();

/**
 * In-process subscriber channel — mirrors `WallStore.subscribe`.
 *
 * Why this exists (§COLUMN-SYSTEM-AUDIT-2026 + §ROOM-SYSTEM-AUDIT-2026 §M7):
 *   `RoomTopologyObserver` and `ColumnSnapProvider` both require a typed
 *   `subscribe(event, column)` channel. Until this method existed, every call
 *   to `columnStore.subscribe?.(...)` was a silent no-op (note the optional
 *   chaining in `ColumnSnapProvider.ts:52`). The audit's M7 fix made the room
 *   observer's call non-optional, which surfaced the latent gap as a hard
 *   crash on project open/create.
 *
 * Channel ordering:
 *   1. In-process `listeners` (this channel — fires FIRST so the room topology
 *      observer & snap provider see the change before any other consumer).
 *   2. `storeEventBus` (cross-store semantic bus).
 *
 * NOTE: ColumnStore deliberately does NOT dispatch a legacy `bim-column-*`
 * DOM CustomEvent (see §COLUMN-SYSTEM-AUDIT-2026 §M14 — "no dual-channel
 * drift surface"). All consumers must subscribe via `subscribe()` or via
 * `storeEventBus`.
 */
export type ColumnEventType = 'add' | 'update' | 'remove';
export type ColumnEventListener = (
    event: ColumnEventType,
    column: ColumnData,
    prevState?: ColumnData,
) => void;

/**
 * §COLUMN-SYSTEM-AUDIT-2026 §W3 — Deep-freeze ColumnData and all nested
 * structures. Internal Map entries are deep-frozen so any retained internal
 * reference cannot silently mutate store state, AND `get()` / `getAll()` may
 * safely return frozen internal references in O(1) (§P0.6).
 *
 * Mirrors the SlabStore / WallStore freeze pattern.
 */
function freezeColumnData(col: ColumnData): ColumnData {
    if (col.position) Object.freeze(col.position);
    if (col.properties) Object.freeze(col.properties);
    if (col.ifcData) Object.freeze(col.ifcData);
    return Object.freeze(col) as ColumnData;
}

/**
 * ColumnStore
 *
 * Contract compliance:
 * - §3.5 Store-Is-Data-Only — no builder calls, no bimManager, no scene
 *   access. Level-removal cascading is handled externally by
 *   `ColumnLevelCleanupHandler` which dispatches `RemoveColumnsOnLevelCommand`
 *   via the lazy `commandManagerRef` pattern (§COLUMN-AUDIT-2026 §C1).
 *
 * - §3.4 Immutability — all stored objects are `structuredClone`'d on the
 *   write path AND deep-frozen via `freezeColumnData`. Read paths return
 *   frozen internal references in O(1) (§P0.6).
 *
 * - §01 §2.6 / §C2 (W1) — IFC GUID synthesis was REMOVED from `add()`. The
 *   command layer (`CreateColumnCommand.execute`, `DeleteColumnCommand.undo`
 *   carrying the snapshot's original GUID) is the sole legitimate source of
 *   `ifcData.guid`. `add()` warns if a column is presented without one so the
 *   violation is visible in the console.
 *
 * - §01 §3.4 (W2) — `update()` requires a full `Omit<ColumnData, 'id' | 'type'>`
 *   replacement object — partial diffs are rejected at the type level. The
 *   command layer constructs the full next-state from the prev-snapshot before
 *   calling `update()`.
 *
 * - §03 §3 (W4) — All write-path entries are validated via
 *   `validateColumnData` (Zod) so geometry / scheduling layers never see a
 *   malformed payload.
 */
export class ColumnStore {
    private columns: Map<string, ColumnData> = new Map();
    private projectContext: ProjectContext;
    private listeners: ColumnEventListener[] = [];

    constructor(projectContext: ProjectContext) {
        this.projectContext = projectContext;
        // §3.5 FIX: 'bim-level-removed' auto-mutation listener lives in the
        // external `ColumnLevelCleanupHandler` — never on the store.
    }

    get activeLevelId(): string {
        return this.projectContext.activeLevelId;
    }

    /**
     * Subscribe to column mutations. Returns an unsubscribe function.
     * See the channel-ordering note at the top of this file.
     */
    subscribe(listener: ColumnEventListener): () => void {
        this.listeners.push(listener);
        return () => {
            this.listeners = this.listeners.filter((l) => l !== listener);
        };
    }

    /**
     * Fan-out for column mutations.
     *
     * Order:
     *   1. In-process listeners (safe-emit — a throwing subscriber cannot
     *      break the chain or the storeEventBus emission that follows).
     *   2. storeEventBus.
     *
     * No DOM CustomEvent — see §COLUMN-SYSTEM-AUDIT-2026 §M14.
     */
    private emit(event: ColumnEventType, column: ColumnData, prevState?: ColumnData): void {
        for (const l of this.listeners) {
            try {
                l(event, column, prevState);
            } catch (err) {
                console.error(
                    `[ColumnStore] subscriber threw on '${event}' for column ${column.id}:`,
                    err,
                );
                try {
                    _bus.emit('bim-subscriber-error', { message: String(err), source: 'ColumnStore', event, columnId: column.id, error: String(err) }); // F.events.18
                } catch {
                    /* dispatchEvent must never throw past safe-emit */
                }
            }
        }

        storeEventBus.emit({
            elementId: column.id,
            elementType: 'column',
            operation: event === 'add' ? 'create' : event === 'remove' ? 'delete' : 'update',
            timestamp: Date.now(),
        });
    }

    add(column: ColumnData) {
        if (!column.levelId) {
            throw new Error('ColumnStore.add requires column.levelId');
        }

        // §W4: Validate at the boundary — before structuredClone — so any
        // ZodError references the original source data, not a clone.
        validateColumnData(column);

        const next = structuredClone(column);
        next.parentId = next.parentId ?? next.levelId;

        if (!next.properties) next.properties = {};

        // §W1: IFC GUID synthesis REMOVED from the store. The command layer
        // (CreateColumnCommand / DeleteColumnCommand.undo) is the sole source
        // of GUIDs. If we are presented with a column lacking ifcData here, the
        // caller has bypassed the command layer — log a warning so the violation
        // is visible immediately.
        if (!next.ifcData?.guid) {
            console.warn(
                '[ColumnStore.add] §01 §2.6 / §COLUMN-AUDIT-2026-W1 VIOLATION: ' +
                    `column ${next.id} added without ifcData.guid. The command layer ` +
                    '(CreateColumnCommand / DeleteColumnCommand.undo) must populate it. ' +
                    'IFC export of this column will use an unstable, ad-hoc GUID.',
            );
        }

        // §W3: deep-freeze before storing — any retained internal reference is
        // now immutable and read paths can return it directly in O(1).
        freezeColumnData(next);
        this.columns.set(next.id, next);

        // §ROOM-SYSTEM-AUDIT-2026 §M7: unified fan-out via emit().
        this.emit('add', next);
    }

    /**
     * §W3 / §P0.6: Returns the frozen internal reference directly — O(1), no
     * allocation. Callers MUST NOT mutate the returned object; they must clone
     * first (`structuredClone(col)`) before passing to `update()`. Runtime
     * protection is provided by `freezeColumnData` — any mutation attempt
     * throws `TypeError`.
     */
    get(id: string): ColumnData | undefined {
        return this.columns.get(id);
    }

    /**
     * §W3 / §P0.6: Returns an array of frozen internal references — O(N) array
     * construction only, no per-element deep clone. Same immutability contract
     * as `get()`.
     */
    getAll(): ColumnData[] {
        return Array.from(this.columns.values());
    }

    remove(id: string) {
        const col = this.columns.get(id);
        if (col) {
            this.columns.delete(id);
            this.emit('remove', col);
        }
    }

    /**
     * §W2 / §C3: signature changed from `Partial<ColumnData>` to a full
     * `Omit<ColumnData, 'id' | 'type'>` replacement. Commands must construct
     * and pass a complete replacement object — no partial patches. The store
     * performs a `structuredClone` of the merged next-state and replaces the
     * entry.
     *
     * The `Omit<>` removes the only two fields that must NEVER be mutated by
     * an update: `id` and `type`. All other ColumnData fields must be present.
     */
    update(id: string, nextState: Omit<ColumnData, 'id' | 'type'>): void {
        const col = this.columns.get(id);
        if (!col) return;

        // Reconstruct the full ColumnData by re-attaching the immutable id+type.
        const merged: ColumnData = {
            ...nextState,
            id: col.id,
            type: col.type,
        } as ColumnData;

        if (!merged.levelId) {
            throw new Error('ColumnStore.update cannot clear column.levelId');
        }

        // §W4: validate the merged next-state at the boundary.
        validateColumnData(merged);

        // §3.4: structuredClone produces a fully immutable next-state object.
        const next = structuredClone(merged) as ColumnData;

        // §W3: freeze before storing.
        freezeColumnData(next);
        this.columns.set(id, next);

        // §ROOM-SYSTEM-AUDIT-2026 §M7: unified fan-out — `col` is forwarded as
        // prevState so subscribers can do diff-based dirty marking.
        this.emit('update', next, col);
    }

    /**
     * §L-1032 — MOVE a column to a different storey.
     *
     * ─── WHY THIS IS A NAMED OPERATION AND NOT `update(id, {levelId})` ───────
     * Because `update()` above CANNOT BE HANDED a `{levelId}` partial — not as a
     * style preference, but at the type level and at runtime both.
     *
     * Its signature is `Omit<ColumnData, 'id' | 'type'>`, a WHOLE-RECORD
     * REPLACEMENT (:215-243). It re-attaches ONLY `id` and `type` (:220-224);
     * every other absent key is annihilated. A one-key `{levelId}` write would
     * leave the column as `{id, type, levelId}` — no position, no height, no
     * profile — frozen, still under its own key.
     *
     * The measured per-store declaration table says exactly this:
     * `apps/editor/src/engine/undo/legacyStoreUpdateSemantics.ts:118-127` records
     * `column` as `semantics: 'replace'`, cites `ColumnStore.ts:215-243`, and
     * notes that the partial at least THROWS here — `'cannot clear
     * column.levelId'` (:226-228) — but that the throw *"landed in the adapter's
     * per-op catch as one console.error while the keypress reported success."*
     * A noisy annihilation that reports success is still an annihilation.
     *
     * That is L-977, and it is exactly what `elementUndoStoreAdapter` would do on
     * Ctrl+Z if this method did not exist: its §L-946 arm
     * (`apps/editor/src/engine/undo/elementUndoStoreAdapter.ts:506`) tests
     * `typeof store.changeLevel === 'function'` before routing a depth-2
     * `levelId` inverse patch, and a family that fails that test falls through to
     * the generic annihilating write.
     *
     * So the operation gets its own name, symmetric with `SlabStore.changeLevel`
     * (`packages/geometry-slab/src/SlabStore.ts:314`) and `RoofStore.changeLevel`
     * (`packages/geometry-roof/src/RoofStore.ts:153`).
     *
     * ─── WHY ONE 'update' AND NOT 'remove' + 'add' ──────────────────────────
     * `WallStore.changeLevel` emits `remove` then `add` because a wall carries
     * JOIN state to tear down on the old storey and re-resolve on the new one. A
     * column carries none: the fragment builder re-derives its world Y from
     * `level.elevation + baseOffset` on every update and repositions the root, so
     * one `update` is everything the renderer needs. A spurious `remove` would
     * also make `RoomTopologyObserver` and `ColumnSnapProvider` — the two
     * subscribers this file's header names — see a delete that never happened.
     *
     * ─── WHY NO `validateColumnData` CALL ──────────────────────────────────
     * `add()` and `update()` validate because they accept a whole record from
     * OUTSIDE. This method accepts a single string, writes it into a record the
     * store already validated on the way in, and refuses an empty one below — so
     * a Zod parse here would only re-check fields this operation does not touch,
     * and would convert a storey move on a legacy record into a THROW, which the
     * caller cannot tell apart from `undefined` ("nothing to move").
     *
     * ─── WHAT THIS DOES NOT DO ──────────────────────────────────────────────
     * Spatial-authority registration (bimManager `level.childrenIds`, the
     * view-dependency element→level map) is NOT updated here — identical to the
     * contract `WallStore.changeLevel`, `SlabStore.changeLevel` and
     * `RoofStore.changeLevel` all state in their own doc comments, and identical
     * to §3.5 Store-Is-Data-Only in this class's header.
     * `apps/editor/src/engine/elementLevelChangedMirror.ts` owns that half, for
     * EVERY family, so the ordering rule (move the record FIRST, re-register
     * SECOND, dirty BOTH storeys THIRD) lives in one place rather than in
     * thirteen stores.
     *
     * Returns the moved record, or `undefined` when there is nothing to move —
     * which the mirror reports as a refusal rather than logging success over a
     * no-op (§context-data-honesty: failure and emptiness are the same value).
     */
    changeLevel(id: string, newLevelId: string): ColumnData | undefined {
        const existing = this.columns.get(id);
        if (!existing) return undefined;
        // An empty destination is REFUSED, never defaulted to `activeLevelId`.
        // `'' ?? this.activeLevelId` is the §DIAG-WALL-LEVEL trap: a silent
        // default files the column on whatever storey happens to be open.
        if (!newLevelId) return undefined;
        if (existing.levelId === newLevelId) return existing;

        const cloned = structuredClone(existing) as ColumnData;
        cloned.levelId = newLevelId;
        // `add()` parents a level-hosted column to its level (:150 —
        // `next.parentId = next.parentId ?? next.levelId`). Moving the storey
        // while leaving `parentId` behind would make the record disagree with
        // itself; a column parented to something ELSE keeps its parent. Same
        // rule as `SlabStore.changeLevel` and `RoofStore.changeLevel`.
        if (existing.parentId === existing.levelId) cloned.parentId = newLevelId;
        // `ColumnData extends CoreElement`, whose `spatialRelationship`
        // (`packages/core-app-model/src/CoreElement.ts:65`) MIRRORS BimManager's
        // `Level.childrenIds` contract and is what IFC export reads for storey
        // containment. Leaving it on the old storey would export the column under
        // the level it just left — a second copy of the same fact, disagreeing.
        // Only rewritten when it is PRESENT: minting one here would invent a
        // containment the record never asserted.
        if (cloned.spatialRelationship) {
            cloned.spatialRelationship = { ...cloned.spatialRelationship, levelId: newLevelId };
        }
        // ColumnData carries no `metadata` block (`ColumnTypes.ts:4-30` +
        // `CoreElement.ts:54-71`), so there is no `modifiedAt`/`version` to bump
        // the way `RoofStore.changeLevel` does. Do not invent one here: a field
        // only this method writes is a second authority nothing else reads.

        // §W3: deep-freeze before storing, exactly as `add()` and `update()` do.
        freezeColumnData(cloned);
        this.columns.set(id, cloned);

        // `existing` is the frozen pre-mutation record, forwarded as `prevState`
        // so diff-based subscribers can dirty the storey being VACATED (C72 §3.5).
        // `emit()` also fans out to `storeEventBus` (:132-137); this store
        // deliberately dispatches no DOM CustomEvent (§COLUMN-SYSTEM-AUDIT §M14).
        this.emit('update', cloned, existing);
        return cloned;
    }

    /**
     * §L-1032 — alias for `get()`, spelled the way the level-change mirror needs.
     *
     * `apps/editor/src/engine/elementLevelChangedMirror.ts:66-69` declares
     * `LegacyLevelMovableStore` as `{ changeLevel(id, levelId), getById(id) }`
     * and types its deps with it rather than casting, so `tsc` is what proves the
     * LEGACY store was wired. `WallStore`, `RoofStore` and `SlabStore` all spell
     * that read `getById`; this store spelled it `get` (:184). Without this alias
     * the mirror's column row could only be wired through a cast — and a cast is
     * what turns a mis-wiring into a runtime `undefined` instead of a compile
     * error, which is the whole reason that interface is not `any`.
     *
     * Returns the frozen internal reference, exactly as `get()` does — same
     * §W3/§P0.6 immutability contract, no extra allocation.
     */
    getById(id: string): ColumnData | undefined {
        return this.columns.get(id);
    }
}
