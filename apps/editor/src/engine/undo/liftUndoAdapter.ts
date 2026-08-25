// liftUndoAdapter — undo/redo coverage for the C104 LIFT COMPOUND, both of its stores.
//
// §LIFT94 (L-11340) · closes L-7311 (`lift`) and L-7312 (`liftPart`) · C03 §4.8 ·
// C104 §2 / §13 · C16 §8.6.
//
// THE DEFECT, IN THE FOUNDER'S WORDS: *"lift — check undo - redo - delete - nothing
// works reliably"*. Measured cause, already written down at performUndoRedo.ts §L-7311:
// `lift.create` declares SIX affected stores
// (`['lift','liftPart','wall','curtainwall','door','slab']`) and mints ONE real
// PatchPair over all six. Four of them (`wall`, `curtainwall`, `door`, `slab`) are
// legacy element stores and ARE adapted by `adaptElementStoreMap`. The two that are
// NOT are the two the lift itself lives in. `_covered()` is all-or-nothing, so the
// entire entry was declined and Ctrl+Z was a TOTAL no-op — the lift stayed, and so did
// the void punched through every slab it passed. That is not a failed undo, it is
// silent data retention the user was told had been reverted.
//
// ⛔ WHY THIS IS A NEW ADAPTER AND NOT A ROW POINTING AT `window.liftStore`.
// That global IS assigned (`initBuilders.ts:983`) and it is a DIFFERENT STORE: the
// LOD-200 MASSING lift (C104 §1 — the two lifts co-exist deliberately). Aliasing it
// would satisfy `_covered()` and then apply an inverse patch to a store that never
// received the forward — C03 §4.6 U-2b verbatim. `performUndoRedo.ts:562-564` forbids
// it by name. The compound the plugin handler writes is `runtime.stores.lift`
// (PluginRegistry.ts:505-513 — storeKey `lift` → `new LiftCompoundStore()`), which is
// the SAME shape the boundary-line adapter (L-11160) already proved: one store, one
// record view, patches minted against it by `produceMultiStoreCommand`, and
// `Store.applyPatch()` is the very method the bus calls on execute. No bridge, no cast.
//
// ── THE RENDER HALF, AND WHY IT IS NOT A BUS EVENT ──────────────────────────────
// `lift.created` is relayed by `CommandEventBridge` and consumed by the §FT-LIFT
// subscriber in `initTools.ts`, which drives `LiftCompoundMeshBuilder`. The boundary
// line's adapter re-emits its family's events for exactly this reason. A lift CANNOT
// do the same for the removal direction: there is no `'lift.deleted'` key in
// `packages/runtime-composer/src/types.ts`, `RuntimeEvents.on/emit` are keyed
// `K extends keyof TMap`, and that file is owned by another live lane. Inventing an
// untyped emit would be a second, unchecked render channel.
//
// So the render half is a REGISTERED SINK instead: `initTools.ts` — the one place that
// holds the builder — hands this module `update`/`remove` closures over the SAME
// `LiftCompoundMeshBuilder` instance the `lift.created` subscriber drives. One source
// of render truth, reached by two roads, and the second road is typed.
//
// ⚠ THE FLUSH IS DEFERRED TO A MICROTASK, ON PURPOSE — this is a correctness
// requirement, not an optimisation. `applyRingBufferSide` walks `affectedStores` IN
// DECLARATION ORDER and applies each store's ops in turn, so at the moment the `lift`
// adapter runs, `liftPart` has NOT been applied yet: a redo would rebuild the compound
// from zero parts and draw an empty shaft. Collecting the touched lift ids and
// rendering once, after the whole side has landed, makes the adapter independent of
// that ordering — so a future change to `affectedStores`'s order cannot silently
// half-draw a lift. It also collapses the N-storey rebuild storm into ONE pass, which
// is the same argument `CommandEventBridge` makes for emitting one `lift.created` for
// all ~70 members rather than one per member.
//
// ⚠ LAZY STORE RESOLUTION, same rule as L-11160. The stores live on the composed
// runtime. Resolving at APPLY time keeps the map key present and HONEST: `_covered()`
// sees a working `applyPatch`, and a genuinely absent runtime THROWS a named error
// that `applyRingBufferSide` reports as a per-store failure — never a silent no-op.
// L-980's rule ("a permanently-undefined adapter is a lie") is kept, not bent.

import type { Patch } from '@pryzm/command-bus';
import type { PatchApplicableAdapter } from './elementUndoStoreAdapter.js';
import type { PatchableRecordStore } from './pluginStoreUndoAdapter.js';

/** A lift record as this module reads it back — structural, no L6 import (C104 §4). */
type LiftRecordView = Readonly<Record<string, unknown>>;

/**
 * The render payload, structurally identical to `LiftCompoundRenderInput` in
 * `@pryzm/geometry-lift` and to the `lift.created` bus payload the §FT-LIFT
 * subscriber already builds. Declared structurally so this L7 undo module does not
 * import an L2 geometry package for a type alone.
 */
export interface LiftRenderInputLike {
    readonly id: string;
    readonly levelId: string;
    readonly origin: { readonly x: number; readonly y: number; readonly z: number };
    readonly rotation: number;
    readonly enclosureType?: string;
    readonly carParkOffsetY: number;
    readonly mark?: string;
    readonly parts: readonly Record<string, unknown>[];
}

/**
 * The seam `initTools.ts` fills with the live `LiftCompoundMeshBuilder`. Two methods,
 * both of which that builder already has (`updateLift` / `removeLift`) — this adapter
 * mints no new render capability, it only reaches the existing one from the undo path.
 */
export interface LiftRenderSink {
    update(input: LiftRenderInputLike): void;
    remove(liftId: string): void;
}

let _sink: LiftRenderSink | null = null;

/**
 * Called once from `initTools.ts` (§FT-LIFT), where the builder is in scope.
 *
 * ⚠ Absent sink is NOT an error: headless runs, unit tests and the server bundle have
 * no scene. The PATCH still applies — the model is reverted correctly — and only the
 * redraw is skipped. That is the honest split: a missing renderer must not fail an
 * undo, and a missing STORE must (see the throw below).
 */
export function registerLiftRenderSink(sink: LiftRenderSink | null): void {
    _sink = sink;
}

/** Test-only reset so one spec's sink cannot leak into the next. */
export function __resetLiftRenderSinkForTests(): void {
    _sink = null;
}

/** What both adapters need at apply time. */
export interface LiftUndoStores {
    readonly lift: PatchableRecordStore;
    readonly liftPart: PatchableRecordStore & { ids(): readonly string[] };
}

// ── The deferred render queue ────────────────────────────────────────────────
const _pending = new Set<string>();
let _scheduled = false;

function _scheduleLiftRender(liftIds: Iterable<string>, resolve: () => LiftUndoStores | null): void {
    for (const id of liftIds) _pending.add(id);
    if (_scheduled) return;
    _scheduled = true;
    queueMicrotask(() => {
        _scheduled = false;
        const ids = [..._pending];
        _pending.clear();
        flushLiftRender(ids, resolve);
    });
}

/**
 * Redraw (or tear down) every lift id touched by the patch side just applied.
 *
 * Exported so a test can drive it synchronously instead of racing a microtask —
 * the queue above calls exactly this function, so the test exercises the real path
 * rather than a re-implementation of it (the "fake built from the header" trap).
 */
export function flushLiftRender(liftIds: readonly string[], resolve: () => LiftUndoStores | null): void {
    const sink = _sink;
    if (sink === null) return;
    const live = resolve();
    if (live === null) return;

    for (const liftId of liftIds) {
        const rec = live.lift.get?.(liftId) as LiftRecordView | undefined;
        if (rec === undefined) {
            // The inverse removed the compound record: tear the group down. Its
            // enclosure walls, glass and landing doors are removed by their OWN
            // families' adapters (they are in `affectedStores` and are covered by
            // `adaptElementStoreMap`) — C104 §13 forbids drawing them twice, and it
            // forbids removing them twice for the same reason.
            try { sink.remove(liftId); }
            catch (err) { console.error('[undo] lift: removeLift failed for ' + liftId + ':', err); }
            continue;
        }
        const parts: Record<string, unknown>[] = [];
        for (const partId of live.liftPart.ids()) {
            const p = live.liftPart.get?.(partId) as Record<string, unknown> | undefined;
            if (p && p['parentId'] === liftId) parts.push(p);
        }
        // A compound with no parts is not a lift, it is a half-applied patch. Drawing
        // an empty shaft would be worse than drawing nothing, so say so and skip.
        if (parts.length === 0) {
            console.warn(
                '[undo] lift ' + liftId + ': the compound record is present but NO liftPart ' +
                'records reference it — not redrawn (C104 §2: a part is never created alone).',
            );
            continue;
        }
        try {
            sink.update({
                id:             liftId,
                levelId:        (rec['levelId'] as string | undefined) ?? '',
                origin:         rec['origin'] as { x: number; y: number; z: number },
                rotation:       (rec['rotation'] as number | undefined) ?? 0,
                enclosureType:  rec['enclosureType'] as string | undefined,
                carParkOffsetY: (rec['carParkOffsetY'] as number | undefined) ?? 0,
                mark:           rec['mark'] as string | undefined,
                parts,
            });
        } catch (err) {
            console.error('[undo] lift: updateLift failed for ' + liftId + ':', err);
        }
    }
}

function _applyOrThrow(
    storeKey: 'lift' | 'liftPart',
    patches: readonly Patch[],
    live: LiftUndoStores | null,
): { added: ReadonlySet<string>; updated: ReadonlySet<string>; removed: ReadonlySet<string> } {
    if (live === null) {
        throw new Error(
            '[undo] ' + storeKey + ': runtime.stores.' + storeKey + ' is not reachable — the ' +
            'composed runtime is absent, so the inverse was NOT applied (L-11340, C03 §4.7 B1).',
        );
    }
    return live[storeKey].applyPatch(patches);
}

/**
 * Adapter for storeKey `lift` — the C104 compound record (L-7311).
 *
 * Owns the render scheduling, because the compound record is the thing that exists or
 * does not: a `lift.create` PatchPair always touches it (C104 §2), so every lift id an
 * undo or redo can affect appears in THIS store's diff.
 */
export function liftCompoundUndoAdapter(resolve: () => LiftUndoStores | null): PatchApplicableAdapter {
    return {
        applyPatch(patches: readonly Patch[]): void {
            const live = resolve();
            const diff = _applyOrThrow('lift', patches, live);
            _scheduleLiftRender([...diff.removed, ...diff.added, ...diff.updated], resolve);
        },
    };
}

/**
 * Adapter for storeKey `liftPart` — the five LOD-300 cabin parts, the corner columns,
 * the ring beams, the top-bay bracing and the guide rails (L-7312).
 *
 * It emits NOTHING. A `liftPart` is never created, updated or destroyed on its own
 * (C104 §2, and PluginRegistry.ts:820 states it: *"cabin parts are created and
 * destroyed only by lift.* ; they own no verb of their own"*), so its render is always
 * the compound's render — already scheduled by the adapter above, and flushed AFTER
 * this one has landed. Scheduling a second pass here would rebuild the same group
 * twice for one gesture. It does still resolve `parentId` for the defensive case of a
 * part patch arriving without its compound, so such a pair redraws rather than
 * silently leaving a stale cabin in the scene.
 */
export function liftPartUndoAdapter(resolve: () => LiftUndoStores | null): PatchApplicableAdapter {
    return {
        applyPatch(patches: readonly Patch[]): void {
            const live = resolve();
            const diff = _applyOrThrow('liftPart', patches, live);
            const parents = new Set<string>();
            for (const id of [...diff.added, ...diff.updated]) {
                const p = live!.liftPart.get?.(id) as Record<string, unknown> | undefined;
                const parent = p?.['parentId'];
                if (typeof parent === 'string' && parent.length > 0) parents.add(parent);
            }
            if (parents.size > 0) _scheduleLiftRender(parents, resolve);
        },
    };
}

/** The production resolver: both stores off the composed runtime. */
export function resolveLiftStoresFromWindow(): LiftUndoStores | null {
    if (typeof window === 'undefined') return null;
    const rt = (window as unknown as {
        runtime?: { stores?: { lift?: unknown; liftPart?: unknown } };
    }).runtime;
    const lift = rt?.stores?.lift as PatchableRecordStore | undefined;
    const liftPart = rt?.stores?.liftPart as (PatchableRecordStore & { ids(): readonly string[] }) | undefined;
    if (!lift || typeof lift.applyPatch !== 'function') return null;
    if (!liftPart || typeof liftPart.applyPatch !== 'function' || typeof liftPart.ids !== 'function') return null;
    return { lift, liftPart };
}
