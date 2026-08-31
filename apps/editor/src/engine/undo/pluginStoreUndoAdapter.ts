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

// ═════════════════════════════════════════════════════════════════════════════
// §UNDO-C-FIX-2 (L-11520, 2026-08-31) — THE FIFTH..EIGHTH FAMILIES, AND THE FIRST
// TIME THE SHAPE IS WRITTEN ONCE INSTEAD OF AGAIN.
// ═════════════════════════════════════════════════════════════════════════════
//
// THE MEASUREMENT THIS CLOSES. `audit/full-stack/2026-08-31/commands/` scored 47
// of 361 verbs STRANDED: a ring-buffer entry is minted, `_covered()` declines it
// because one declared store key has no adapter, `performUndo` does NOT step the
// cursor, and the legacy `commandManager` owns nothing for that key. Ctrl+Z is a
// measured no-op. The 47 fall on TEN keys; FOUR of them are closed here (23 verbs).
// A fifth — `view` — was wired, then REFUSED on an executed measurement: see its
// `UNMAPPED_BUS_STORE_KEYS` row in performUndoRedo.ts for the TypeError that
// disqualified it. The remaining five keys are refused there too, each with the
// measurement that makes wiring it wrong.
//
// ⭐ WHY A GENERIC FACTORY AND NOT A SIXTH BESPOKE FILE. `boundaryLine`,
// `lift`/`liftPart`, `pool`/`water` and `bathroomPod` each got their own module
// between 2026-08-25 and 2026-08-26, and `bathroomPodUndoAdapter.ts`'s own header
// opens by saying it is "the FOURTH family to need this EXACT shape in three days,
// and it is DELIBERATELY the same shape rather than a fourth spelling of it". Four
// more families needing it in one week is the signal that the shape is the unit, not
// the family. The four existing modules are LEFT ALONE — two of them (boundaryLine,
// lift) do real per-family work at the render seam that this factory does not and
// must not guess at, and rewriting a live path to route through a new one is the
// rival-building failure this repo has hit six times. This is an ADDITIONAL door for
// the families that need only the plain one, not a replacement for theirs.
//
// ── WHAT "ONLY THE PLAIN ONE" MEANS, MEASURED PER FAMILY (2026-08-31) ─────────
// The render/UI half of these four is served by `Store.applyPatch()` itself, which
// notifies `subscribeDirty` on EXECUTE, UNDO and REDO alike — one road, four
// directions, no second path that could drift. Per family:
//
//  · `structural`, `dimension` — `CommandEventBridge.ts:1632` records both as DEAD
//    CHANNELS: `structural.created` / `dimension.created` have exactly ONE emitter
//    and ZERO subscribers outside `types.ts` (re-measured at this head). There is no
//    event road to re-drive, so emitting one here would be inventing a consumer.
//    `PlanViewCanvasHost` subscribes `structuralStore` / `dimensionStore` via
//    `subscribeDirty` (:298-299) when it is given them.
//  · `section` — grep for `'section.created'` over apps+plugins+packages (excluding
//    node_modules and __tests__) returns NOTHING: the family has no bus channel at
//    all. Its readers hold the store.
//  · `balcony` — a PARENT DTO store carrying no geometry (`plugins/balcony/src/
//    store.ts:7-13`: "None of them is copied in here"). Its slab, floor and handrail
//    MEMBERS are already adapted in `buildUndoStoreMap()`, so the member half of the
//    inverse was never the gap; the parent record was. Same relationship the pool and
//    bathroomPod parents have to their members.
//
// ⛔ WHAT THIS FACTORY DOES NOT DO, STATED SO NOBODY READS COVERAGE INTO IT. It
// reverts the AUTHORITATIVE record. It does not claim the 3-D mesh disappears for a
// family whose mesh is driven by a channel nobody subscribes to — for `structural`
// and `dimension` that channel is measured dead in BOTH directions, so there is
// nothing to drive, and the honest statement is that the store reverts and the
// family's rendering is an AXIS-B question this lane did not measure. A store that
// still holds an element the user undid is the worse of the two failures: it
// persists, it schedules, it exports, and it comes back on reload.

/**
 * Build a patch-applying undo adapter over ONE store on the composed runtime.
 *
 * This is the `bathroomPodUndoAdapter` shape with the family name lifted into a
 * parameter. Use it for a family whose undo is exactly "apply the inverse to the
 * store the handler wrote"; use a bespoke module when the family additionally has
 * a render seam that must be re-driven (see `boundaryLineUndoAdapter` above, whose
 * event re-emission is precisely what a generic factory cannot invent).
 *
 * ⚠ LAZY, ON PURPOSE — the L-980 rule kept, not bent. The store lives on the
 * composed runtime, which does not exist when `buildUndoStoreMap()` runs. Resolving
 * at APPLY time keeps the map key HONEST: `_covered()` sees a working `applyPatch`,
 * and a genuinely absent runtime THROWS a NAMED error that `applyRingBufferSide`
 * reports as a per-store failure. A permanently-`undefined` adapter is a lie; a
 * silent `return` is a worse one.
 *
 * @param storeKey  the `affectedStores` key this adapter answers for — used only in
 *                  the error text, so a failure names the family that failed.
 * @param resolve   returns the live store, or `null` when the runtime is absent.
 *                  Called on EVERY apply — never cached.
 */
export function composedStoreUndoAdapter(
    storeKey: string,
    resolve: (storeKey: string) => PatchableRecordStore | null,
): PatchApplicableAdapter {
    return {
        applyPatch(patches: readonly Patch[]): void {
            const store = resolve(storeKey);
            if (store === null) {
                throw new Error(
                    `[undo] ${storeKey}: runtime.stores.${storeKey} is not reachable — the ` +
                    'composed runtime is absent, so the inverse was NOT applied ' +
                    '(L-11520, C03 §4.7 B1).',
                );
            }
            // The UI/render half happens inside `subscribeDirty`, which this call fires.
            // See the header for the per-family measurement of what is subscribed.
            store.applyPatch(patches);
        },
    };
}

/**
 * The production resolver: one store off the composed runtime on `window`.
 *
 * ⛔ IT DOES NOT FALL BACK TO `window.<key>Store`. None of the four families this
 * serves has a legacy global at all (measured 2026-08-31: no `window.structuralStore`
 * / `window.dimensionStore` / `window.sectionStore` / `window.balconyStore`
 * assignment site exists anywhere in the tree). Reaching for the nearest global with
 * a matching name is exactly the aliasing `liftUndoAdapter` forbids for
 * `window.liftStore`: it would satisfy `_covered()` and then apply an inverse to a
 * store that never received the forward — C03 §4.6 U-2b, which is corruption rather
 * than a failed undo.
 */
export function resolveComposedStoreFromWindow(storeKey: string): PatchableRecordStore | null {
    if (typeof window === 'undefined') return null;
    const rt = (window as unknown as {
        runtime?: { stores?: Record<string, unknown> };
    }).runtime;
    const store = rt?.stores?.[storeKey] as PatchableRecordStore | undefined;
    if (!store || typeof store.applyPatch !== 'function') return null;
    return store;
}
