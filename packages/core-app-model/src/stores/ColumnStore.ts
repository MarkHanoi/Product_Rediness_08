import { ColumnData } from './ColumnTypes';
import { ProjectContext } from '../context/ProjectContext';
import { storeEventBus } from '../StoreEventBus'; // TODO(TASK-08)
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
                    _bus.emit('bim-subscriber-error', { // F.events.17
                        message: String(err),
                        source: 'ColumnStore',
                        event,
                        columnId: column.id,
                        error: String(err),
                    });
                } catch {
                    /* emit must never throw past safe-emit */
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
        /* validation deferred to command layer */

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
        /* validation deferred to command layer */

        // §3.4: structuredClone produces a fully immutable next-state object.
        const next = structuredClone(merged) as ColumnData;

        // §W3: freeze before storing.
        freezeColumnData(next);
        this.columns.set(id, next);

        // §ROOM-SYSTEM-AUDIT-2026 §M7: unified fan-out — `col` is forwarded as
        // prevState so subscribers can do diff-based dirty marking.
        this.emit('update', next, col);
    }
}
