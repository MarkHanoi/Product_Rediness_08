import { SlabData } from './SlabTypes';
import { ProjectContext } from '@pryzm/core-app-model';
import { validateSlabData } from './SlabValidator';
import { storeEventBus } from '@pryzm/core-app-model';
import { DOMEventBus } from '@pryzm/event-bus';
const _bus = new DOMEventBus();

/**
 * In-process subscriber channel — mirrors `WallStore.subscribe` /
 * `CurtainWallStore.subscribe` / `RoomBoundingLineStore.subscribe`.
 *
 * Why this exists (§ROOM-SYSTEM-AUDIT-2026 §M7 + §COLUMN-SYSTEM-AUDIT-2026):
 *   `RoomTopologyObserver` and `SlabSnapProvider` both expect a typed
 *   `subscribe(event, slab)` channel so they can react to slab changes without
 *   parsing DOM CustomEvent payloads. Until this method existed, every call to
 *   `slabStore.subscribe?.(...)` was a silent no-op (note the optional chaining
 *   in `SlabSnapProvider.ts:50`). The audit's M7 fix made the room observer's
 *   call non-optional, which surfaced the latent gap as a hard crash on
 *   project open/create.
 *
 * Channel ordering (matches WallStore §WALL-AUDIT-2026-M4):
 *   1. In-process `listeners` (this channel — fires FIRST so the room
 *      topology observer & snap provider see the change before any
 *      DOM-coupled consumer reads the scene).
 *   2. `storeEventBus` (cross-store semantic bus).
 *   3. `window.dispatchEvent('bim-slab-{added,updated,removed}')` (legacy
 *      DOM bridge — preserved for SelectionManager + EngineBootstrap
 *      backward-compat).
 */
export type SlabEventType = 'add' | 'update' | 'remove';
export type SlabEventListener = (event: SlabEventType, slab: SlabData, prevState?: SlabData) => void;

/**
 * SlabStore
 *
 * Contract compliance:
 * - §01 §3.5 / §2.1: Store is data-only. No window event listeners here.
 *   Level-removal cascading is handled by SlabLevelCleanupHandler (external).
 * - §01 §3.4 FIX (C3): update() now requires a full SlabData (not Partial<SlabData>).
 *   All callers already construct complete nextState objects; this signature change
 *   makes the full-replacement intent explicit and eliminates the partial-patch risk.
 * - §01 §2.6 FIX (C4): IFC GUID generation removed from add(). The command layer
 *   (CreateSlabCommand.execute) is now solely responsible for generating ifcData.guid.
 *   add() logs a warning if ifcData is missing so violations surface immediately.
 * - §01 §3.4 (W2): All WRITE-path clone operations use structuredClone (add/update).
 * - §01 §3.7 (W3 — P0.6 UPDATE): getById() and getAll() now return frozen internal
 *   references directly — O(1) per element, no allocation on reads.
 *   Callers MUST NOT mutate the returned objects; they must clone first (structuredClone
 *   or spread) before passing to store.update(). Runtime protection is provided by
 *   freezeSlabData() — any mutation attempt throws TypeError at runtime.
 *   Phase 2 will replace the remaining structuredClone write-path with Immer produce().
 * - §01 §3.5 (W4): Removed window.THREE global access from add().
 * - FIX-4 §01 §3.4: Internal Map entries are deep-frozen via freezeSlabData() so
 *   any retained internal reference cannot silently mutate store state. This is the
 *   primary immutability guard now that getById/getAll no longer clone on read.
 * - FIX-3 §06 Integration / §03 §2.3: storeEventBus.emit() called alongside every
 *   DOM CustomEvent so SemanticIndex, VisibilityRuleEngine and future DependencyResolver
 *   subscribers receive slab changes through the canonical bus. DOM events are preserved
 *   for full backward compatibility with EngineBootstrap listeners.
 */

/**
 * FIX-4: Deep-freeze a SlabData object and all nested structures.
 *
 * Mirrors the WallStore / RoomStore freeze pattern.
 *
 * P0.6 UPDATE: getById() and getAll() now return frozen internal references
 * directly (no structuredClone on reads). This freeze is therefore the PRIMARY
 * immutability guard — any caller that attempts to mutate a returned slab gets
 * a TypeError at runtime. Callers that need a mutable copy must call
 * structuredClone(slab) explicitly before mutating.
 */
function freezeSlabData(slab: SlabData): SlabData {
    if (slab.position) Object.freeze(slab.position);
    if (slab.polygon) {
        slab.polygon.forEach(p => Object.freeze(p));
        Object.freeze(slab.polygon);
    }
    if (slab.holes) {
        slab.holes.forEach(hole => {
            hole.forEach(p => Object.freeze(p));
            Object.freeze(hole);
        });
        Object.freeze(slab.holes);
    }
    if (slab.layers) {
        slab.layers.forEach(l => Object.freeze(l));
        Object.freeze(slab.layers);
    }
    if (slab.properties) Object.freeze(slab.properties);
    if (slab.ifcData)    Object.freeze(slab.ifcData);
    return Object.freeze(slab) as SlabData;
}

/**
 * §ADR-0318-ELEMENTS-SLOT — thrown when the active-level cursor is read on a
 * store whose engine half was never attached. ADR-0318 I-3 (honest absence):
 * the store refuses rather than inventing a level id.
 */
export class SlabStoreEngineNotAttachedError extends Error {
    constructor(member: string) {
        super(
            `[SlabStore] ${member} needs the engine half, which is not attached in this process. ` +
            `Call slabStore.attachEngine(projectContext) (initBuilders.ts does this at engine boot). ` +
            `§ADR-0318-ELEMENTS-SLOT — the store refuses to invent a level rather than answer with a fiction.`,
        );
        this.name = 'SlabStoreEngineNotAttachedError';
    }
}

export class SlabStore {
    private _slabs = new Map<string, SlabData>();
    /**
     * ADR-0318 §3 (per-kind adoption) — LATE-BOUND, so `slabStore` at the foot of
     * this file can be the single production instance shared by
     * `composeRuntime`'s `stores.elements` slot, `registerAllStores()` and
     * `ProjectSerializer`. Identity, not construction (I-1/I-2).
     */
    private projectContext: ProjectContext | null;
    private listeners: SlabEventListener[] = [];

    constructor(projectContext?: ProjectContext | null) {
        this.projectContext = projectContext ?? null;
        // §01 §2.1 / §3.5: Removed 'bim-level-removed' auto-mutation listener from store.
        // Store must be data-only. Level-driven cleanup is handled by
        // SlabLevelCleanupHandler, which is wired externally in main.ts.
    }

    /**
     * ADR-0318 §3 — late-bind the engine half onto the module singleton.
     * `initBuilders.ts` calls this instead of `new SlabStore(...)`.
     */
    attachEngine(projectContext: ProjectContext): this {
        if (this.projectContext !== null && this.projectContext !== projectContext) {
            console.warn('[SlabStore] attachEngine: replacing previously attached project context (project switch / hot reload).');
        }
        this.projectContext = projectContext;
        return this;
    }

    /** ADR-0318 I-3 — is the engine half attached? Never inferred from a value. */
    isEngineAttached(): boolean {
        return this.projectContext !== null;
    }

    /**
     * Subscribe to slab mutations. Returns an unsubscribe function.
     * See the channel-ordering note at the top of this file.
     */
    subscribe(listener: SlabEventListener): () => void {
        this.listeners.push(listener);
        return () => {
            this.listeners = this.listeners.filter(l => l !== listener);
        };
    }

    /**
     * Fan-out for slab mutations.
     *
     * Order matches WallStore.emit (§WALL-AUDIT-2026-M4):
     *   1. In-process listeners (safe-emit — a throwing subscriber cannot
     *      break the chain or the storeEventBus / DOM channels that follow).
     *   2. storeEventBus.
     *   3. DOM CustomEvent (legacy bridge — preserved verbatim so existing
     *      EngineBootstrap / SelectionManager listeners keep working).
     */
    private emit(event: SlabEventType, slab: SlabData, prevState?: SlabData): void {
        for (const l of this.listeners) {
            try {
                l(event, slab, prevState);
            } catch (err) {
                console.error(`[SlabStore] subscriber threw on '${event}' for slab ${slab.id}:`, err);
                try {
                    _bus.emit('bim-subscriber-error', { message: String(err), source: 'SlabStore', event, slabId: slab.id, error: String(err) }); // F.events.18
                } catch { /* dispatchEvent must never throw past safe-emit */ }
            }
        }

        storeEventBus.emit({
            elementId: slab.id,
            elementType: 'slab',
            operation: event === 'add' ? 'create' : event === 'remove' ? 'delete' : 'update',
            timestamp: Date.now(),
        });

        // F.events.18 — typed bus replaces variable CustomEvent
        if (event === 'add') _bus.emit('bim-slab-added', { id: slab.id });
        else if (event === 'remove') _bus.emit('bim-slab-removed', { id: slab.id });
        else _bus.emit('bim-slab-updated', { id: slab.id });
    }

    get activeLevelId(): string {
        if (this.projectContext === null) throw new SlabStoreEngineNotAttachedError('activeLevelId');
        return this.projectContext.activeLevelId;
    }

    add(slab: SlabData) {
        // I6: Runtime validation — throws ZodError with descriptive .issues if data is invalid.
        // Fires before structuredClone so the error references the original source data.
        // Per §01 §3.5: validation belongs at the store boundary, NOT inside commands.
        validateSlabData(slab);

        const newSlab = structuredClone(slab) as SlabData;

        if (!newSlab.levelId) {
            newSlab.levelId = this.activeLevelId;
            newSlab.parentId = this.activeLevelId;
        }

        if (!newSlab.properties) newSlab.properties = {};
        if (!newSlab.properties.mark) {
            const count = this._slabs.size + 1;
            newSlab.properties.mark = `SB${count.toString().padStart(3, '0')}`;
        }

        // C4 FIX §01 §2.6: IFC GUID must be generated in the command layer, not here.
        // CreateSlabCommand.execute() now always populates ifcData.guid.
        // This guard remains only as a last-resort fallback for backward compatibility
        // with any external callers that pre-date the fix. It logs a warning so the
        // violation is immediately visible during development.
        if (!newSlab.ifcData) {
            console.warn(
                '[SlabStore.add] §01 §2.6 VIOLATION: ifcData was not provided. ' +
                'IFC GUID should be generated in CreateSlabCommand.execute(), ' +
                'not in the store. Generating a fallback GUID now — this GUID ' +
                'will NOT be stable across undo/redo cycles.'
            );
            newSlab.ifcData = {
                guid: crypto.randomUUID(),
                ifcClass: 'IfcSlab'
            };
        }

        // FIX-4: Freeze before storing — any retained internal reference is now immutable.
        freezeSlabData(newSlab);
        this._slabs.set(newSlab.id, newSlab);

        // §ROOM-SYSTEM-AUDIT-2026 §M7: fan out through unified emit() —
        //   in-process listeners → storeEventBus → DOM CustomEvent. Backward
        //   compat for `bim-slab-added` and the canonical bus is preserved.
        this.emit('add', newSlab);
    }

    remove(id: string) {
        const slab = this._slabs.get(id);
        if (slab) {
            this._slabs.delete(id);
            // Unified emit() preserves the legacy 'bim-slab-removed' DOM
            // payload shape (`{ slabId }`) — see emit() above.
            this.emit('remove', slab);
        }
    }

    /**
     * C3 FIX §01 §3.4: Signature changed from Partial<SlabData> to full SlabData.
     * Commands must construct and pass a complete replacement object — no partial patches.
     * The store performs a structuredClone of the provided nextState and replaces the entry.
     */
    update(id: string, nextState: SlabData) {
        const slab = this._slabs.get(id);
        if (slab) {
            const next = structuredClone(nextState) as SlabData;

            // FIX-4: Freeze before storing.
            freezeSlabData(next);
            this._slabs.set(id, next);

            // §ROOM-SYSTEM-AUDIT-2026 §M7: unified fan-out. `slab` is forwarded
            // as `prevState` so subscribers can perform diff-based dirty marking
            // (mirrors the WallStore.emit signature).
            this.emit('update', next, slab);
        }
    }

    /**
     * §L-1032 — MOVE a slab to a different storey.
     *
     * ─── WHY THIS IS A NAMED OPERATION AND NOT `update(id, {levelId})` ───────
     * `update()` above is a WHOLE-RECORD REPLACE (`structuredClone(nextState)` →
     * `freeze` → `set`). Handed a one-key `{levelId}` partial it leaves the slab
     * as `{levelId}` — no id, no boundary, no thickness — frozen, still under its
     * own key, with zero diagnostics. That is L-977, and it is exactly what
     * `elementUndoStoreAdapter`'s generic field arm would do on Ctrl+Z if this
     * method did not exist: the adapter tests `typeof store.changeLevel ===
     * 'function'` before routing a `levelId` inverse patch, and a family that
     * fails that test falls through to the annihilating write.
     *
     * So the operation gets its own name, symmetric with `WallStore.changeLevel`
     * (`packages/geometry-wall/src/WallStore.ts:1055`) and
     * `RoofStore.changeLevel` (`packages/geometry-roof/src/RoofStore.ts:153`).
     *
     * ─── WHY ONE 'update' AND NOT 'remove' + 'add' ──────────────────────────
     * `WallStore.changeLevel` emits `remove` then `add` because a wall carries
     * JOIN state that must be torn down on the old storey and re-resolved on the
     * new one. A slab carries no join state — `SlabFragmentBuilder` re-derives
     * `worldY = level.elevation + slabBaseOffset + baseOffset` (C92 §10) on every
     * update and repositions the root — so one `update` is everything the
     * renderer needs, and a spurious `remove` would tear down the mesh and any
     * wall pinned to the slab's perimeter along with it.
     *
     * ─── WHAT THIS DOES NOT DO ──────────────────────────────────────────────
     * Spatial-authority registration (bimManager `level.childrenIds`, the
     * view-dependency element→level map) is NOT updated here — identical to the
     * contract `WallStore.changeLevel` and `RoofStore.changeLevel` both state in
     * their own doc comments. `elementLevelChangedMirror.applyElementLevelChange`
     * owns that half, and it owns it for every family so the ordering rule (move
     * the record FIRST, re-register SECOND, dirty BOTH storeys THIRD) lives in
     * one place rather than in thirteen stores.
     *
     * Returns the moved record, or `undefined` when there is nothing to move —
     * which the mirror reports as a refusal rather than logging success over a
     * no-op (§context-data-honesty: failure and emptiness are the same value).
     */
    changeLevel(id: string, newLevelId: string): SlabData | undefined {
        const existing = this._slabs.get(id);
        if (!existing) return undefined;
        // An empty destination is REFUSED, never defaulted to the active level.
        // `'' ?? activeLevelId` is the §DIAG-WALL-LEVEL trap: a silent default
        // files the element on whatever storey happens to be open.
        if (!newLevelId) return undefined;
        if (existing.levelId === newLevelId) return existing;

        const cloned = structuredClone(existing) as SlabData;
        cloned.levelId = newLevelId;
        // `add()` parents a level-hosted slab to its level. Moving the storey
        // while leaving `parentId` behind would make the record disagree with
        // itself; a slab parented to something ELSE (a host slab, a building
        // element) keeps its parent. Same rule as `RoofStore.changeLevel`.
        if (existing.parentId === existing.levelId) cloned.parentId = newLevelId;
        // `SlabData extends CoreElement`, whose `spatialRelationship` MIRRORS
        // BimManager's `Level.childrenIds` contract (`CoreElement.ts:46-52`) and
        // is what IFC export reads for storey containment. Leaving it on the old
        // storey would export the slab under the level it just left — a second
        // copy of the same fact, disagreeing. Only rewritten when it is present:
        // minting one here would invent a containment the record never asserted.
        if (cloned.spatialRelationship) {
            cloned.spatialRelationship = { ...cloned.spatialRelationship, levelId: newLevelId };
        }

        freezeSlabData(cloned);
        this._slabs.set(id, cloned);

        // `existing` is the frozen pre-mutation record, forwarded as `prevState`
        // so diff-based subscribers can dirty the storey being VACATED (C72 §3.5).
        this.emit('update', cloned, existing);
        return cloned;
    }

    getById(id: string): SlabData | undefined {
        // P0.6: Returns the frozen internal reference directly — O(1), no allocation.
        // Contract §01 §3.7 v2.0: freeze is the immutability guard (see freezeSlabData).
        // Callers must NOT mutate the returned object. Use structuredClone(slab) first
        // if a mutable copy is needed (all update commands already do this correctly).
        return this._slabs.get(id);
    }

    getAll(): SlabData[] {
        // P0.6: Returns an array of frozen internal references — O(N) array construction
        // only, no per-element deep clone. Total allocation is one array wrapper.
        // Contract §01 §3.7 v2.0: freeze is the immutability guard (see freezeSlabData).
        return Array.from(this._slabs.values());
    }

    /**
     * §02 Rebuild Trigger: Fires 'bim-slab-updated' with the current slab data
     * to request a geometry re-projection without mutating any semantic state.
     * Use this instead of slabStore.update(id, ...) for opening/hole rebuild triggers.
     *
     * Note: triggerRebuild() does NOT emit on storeEventBus because it carries no
     * semantic change — it is purely a builder-coordination signal. The bus is for
     * data mutations (create / update / delete), not for re-projection requests.
     */
    triggerRebuild(id: string): void {
        const slab = this._slabs.get(id);
        if (slab) {
            // P0.6: Pass the frozen reference directly — builder reads it but does not
            // mutate it. CustomEvent detail is a separate message boundary so the
            // builder receives a frozen read-only snapshot, which is correct.
            _bus.emit('bim-slab-updated', { id: slab.id }); // F.events.18
        }
    }
}

/**
 * §ADR-0318-ELEMENTS-SLOT — THE authoritative slab store.
 *
 * Single production instance; `initBuilders.ts` attaches the engine half to it
 * rather than constructing a rival. The class stays exported and constructible
 * so unit tests can build isolated instances and so the ADR's falsifiability arm
 * has a rival to REJECT.
 */
export const slabStore = new SlabStore();
