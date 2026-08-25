// pluginStoreUndoAdapter — undo/redo coverage for a TWIN-LESS plugin store.
//
// §FIX-BOUNDARY-LINE-UNDO-STRANDED (L-11160) · C03 §4.8 · C106 §1.
//
// THE DEFECT. The founder drew a boundary line, pressed Ctrl+Z, and read:
//
//   [Undo] STRANDED — a ring-buffer entry is pending but could not be reverted:
//          no applyPatch adapter for store(s) [boundaryLine] (C03 §4.8)
//
// `buildUndoStoreMap()` adapts LEGACY element stores read off `window.*Store`.
// A boundary line has no legacy twin (C106 §1 — the plugin store IS the record),
// so there was no global to adapt, no key in the map, and `_covered()` declined
// the entry. The legacy stack holds nothing for a bus-only family, so the
// keypress was a total no-op. Same class as balcony / lift (L-7310..L-7312).
//
// WHY THIS IS NOT THE "SHAPE BRIDGE" PROBLEM THAT BLOCKS sheet / schedule / view.
// Those adapters would apply a patch minted against a plugin DTO to a legacy
// record of a DIFFERENT shape. Here there is exactly ONE store, and the ring
// buffer's patches were minted against ITS record view (`produceCommand(ctx.
// stores.boundaryLine, …)`, keyed by id). `Store.applyPatch()` is the very method
// the bus itself calls on execute (`attachStores → Store.applyPatch`), so the
// inverse lands on the same object through the same door. No bridge, no cast.
//
// THE RENDER HALF — WHY APPLYING THE PATCH IS NOT ENOUGH. The 3-D linework and
// the plan symbol are driven by the family's BUS EVENTS, emitted by
// `CommandEventBridge` from command records (`boundaryLine.created / updated /
// deleted`, consumed at `initTools.ts` §FT-BOUNDARY-LINE). An undo is not a
// command, so the bridge never sees it. This adapter therefore emits the SAME
// events, with the SAME payload shape, from the `DirtyDiff` the store returns —
// so the bridge's existing handlers dispose the mesh (`removed`), rebuild it
// (`added`, with `line` read back from the store as the bridge does) or refresh
// it (`updated`). One source of render truth, reached by two roads.
//
// ⚠ LAZY, ON PURPOSE. The store lives at `runtime.stores.boundaryLine`, which
// exists only once the runtime is composed. Resolving it at APPLY time (not at
// map-build time) keeps the key present and honest: `_covered()` sees a working
// `applyPatch`, and if the runtime is genuinely absent the adapter THROWS a named
// error — reported by `applyRingBufferSide` as a per-store failure, never a
// silent no-op — which is the L-980 rule ("a permanently-undefined adapter is a
// lie") kept, not bent.

import type { Patch } from '@pryzm/command-bus';
import type { PatchApplicableAdapter } from './elementUndoStoreAdapter.js';

/** The slice of `Store<T>` this adapter needs — structural, no L6 import. */
export interface PatchableRecordStore {
    applyPatch(patches: readonly Patch[]): {
        readonly added: ReadonlySet<string>;
        readonly updated: ReadonlySet<string>;
        readonly removed: ReadonlySet<string>;
    };
    get?(id: string): Readonly<Record<string, unknown>> | undefined;
}

export interface EventEmitterLike {
    emit(type: string, payload: Record<string, unknown>): void;
}

/**
 * Build the boundary-line undo adapter over a resolver for the store + bus.
 *
 * @param resolve returns the live store and event bus, or `null` when the
 *                runtime is not composed. Called on EVERY apply — never cached.
 */
export function boundaryLineUndoAdapter(
    resolve: () => { store: PatchableRecordStore; events: EventEmitterLike } | null,
): PatchApplicableAdapter {
    return {
        applyPatch(patches: readonly Patch[]): void {
            const live = resolve();
            if (live === null) {
                throw new Error(
                    '[undo] boundaryLine: runtime.stores.boundaryLine is not reachable — ' +
                    'the composed runtime is absent, so the inverse was NOT applied (L-11160).',
                );
            }
            const diff = live.store.applyPatch(patches);
            // Emit in the order the bridge would: removals first, so a re-add of the
            // same id (redo after undo) is seen as a fresh creation by the builder.
            for (const id of diff.removed) {
                live.events.emit('boundaryLine.deleted', {
                    commandId: 'undo-redo',
                    commandType: 'boundaryLine.delete',
                    boundaryLineId: id,
                });
            }
            for (const id of diff.added) {
                const line = live.store.get?.(id);
                live.events.emit('boundaryLine.created', {
                    commandId: 'undo-redo',
                    commandType: 'boundaryLine.create',
                    boundaryLineId: id,
                    levelId: (line?.['levelId'] as string | undefined) ?? '',
                    ...(line ? { line } : {}),
                });
            }
            for (const id of diff.updated) {
                const line = live.store.get?.(id);
                live.events.emit('boundaryLine.updated', {
                    commandId: 'undo-redo',
                    commandType: 'boundaryLine.update',
                    boundaryLineId: id,
                    levelId: (line?.['levelId'] as string | undefined) ?? '',
                    ...(line ? { line } : {}),
                });
            }
        },
    };
}

/** The production resolver: the composed runtime on `window`. */
export function resolveBoundaryLineStoreFromWindow(): { store: PatchableRecordStore; events: EventEmitterLike } | null {
    if (typeof window === 'undefined') return null;
    const rt = (window as unknown as {
        runtime?: { stores?: { boundaryLine?: unknown }; events?: EventEmitterLike };
    }).runtime;
    const store = rt?.stores?.boundaryLine as PatchableRecordStore | undefined;
    const events = rt?.events;
    if (!store || typeof store.applyPatch !== 'function' || !events || typeof events.emit !== 'function') return null;
    return { store, events };
}
